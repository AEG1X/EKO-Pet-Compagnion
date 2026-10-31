import { asc, eq } from 'drizzle-orm';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { schema } from '../db/client';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { sha256, timingSafeEqual } from '../lib/crypto';
import { apiError } from '../lib/errors';
import { RATE_LIMITS, enforceRateLimit } from '../security/rateLimit';

/**
 * Sauvegarde tirée par le Raspberry Pi (aucun port ouvert chez soi) : export SQL de D1
 * et copie des fichiers R2. Accès par un jeton dédié (secret BACKUP_TOKEN), sans session :
 * il ne sert qu'à lire, et chaque export est inscrit au journal de sécurité.
 */

/** Tables recréées à chaque connexion : inutile (et indésirable) de les restaurer. */
const EPHEMERAL_TABLES = new Set(['session', 'auth_challenge', 'rate_limit', 'd1_migrations']);

const requireBackupToken: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.env.BACKUP_TOKEN) throw apiError(404, 'not_found', 'Route inconnue.');
  await enforceRateLimit(c, RATE_LIMITS.backup);
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  // Comparaison des empreintes : durée constante et longueur fixe.
  if (!token || !timingSafeEqual(await sha256(token), await sha256(c.env.BACKUP_TOKEN))) {
    throw apiError(401, 'unauthorized', 'Jeton de sauvegarde invalide.');
  }
  await next();
};

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof ArrayBuffer) {
    return `X'${[...new Uint8Array(value)].map((b) => b.toString(16).padStart(2, '0')).join('')}'`;
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Ordonne les tables pour que chaque table vienne après celles qu'elle référence. */
async function tablesInDependencyOrder(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")
    .all<{ name: string }>();
  const names = results.map((r) => r.name).filter((n) => !EPHEMERAL_TABLES.has(n));
  const deps = new Map<string, string[]>();
  for (const name of names) {
    const fks = await db.prepare(`PRAGMA foreign_key_list(${quoteIdent(name)})`).all<{ table: string }>();
    deps.set(name, fks.results.map((f) => f.table).filter((t) => t !== name));
  }
  const ordered: string[] = [];
  const visit = (name: string, path: Set<string>) => {
    if (ordered.includes(name) || path.has(name) || !deps.has(name)) return;
    path.add(name);
    for (const dep of deps.get(name)!) visit(dep, path);
    path.delete(name);
    ordered.push(name);
  };
  for (const name of [...names].sort()) visit(name, new Set());
  return ordered;
}

/** Export SQL : des INSERT, à rejouer sur une base neuve où les migrations ont été appliquées. */
export async function dumpDatabase(db: D1Database, now = new Date()): Promise<string> {
  const lines = [
    `-- Sauvegarde EKO du ${now.toISOString()}`,
    '-- Restauration : base neuve, migrations appliquées, puis `wrangler d1 execute <base> --remote --file <ce fichier>`.',
    'PRAGMA defer_foreign_keys = on;',
  ];
  for (const table of await tablesInDependencyOrder(db)) {
    const { results } = await db.prepare(`SELECT * FROM ${quoteIdent(table)}`).all<Record<string, unknown>>();
    lines.push(`-- ${table} : ${results.length} ligne(s)`);
    for (const row of results) {
      const cols = Object.keys(row);
      lines.push(
        `INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(', ')}) VALUES (${cols.map((c) => sqlValue(row[c])).join(', ')});`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

async function journal(c: Context<AppEnv>, detail: string) {
  await audit(c.get('db'), 'backup_exported', detail);
}

export const backupRoutes = new Hono<AppEnv>()
  .use('/backup/*', requireBackupToken)

  .get('/backup/d1.sql', async (c) => {
    const dump = await dumpDatabase(c.env.DB);
    await journal(c, 'base');
    return c.body(dump, 200, {
      'content-type': 'application/sql; charset=utf-8',
      'content-disposition': `attachment; filename="eko-d1-${new Date().toISOString().slice(0, 10)}.sql"`,
    });
  })

  // Liste des fichiers (documents, photo) : le Pi ne télécharge que ceux qu'il n'a pas encore.
  .get('/backup/files', async (c) => {
    const rows = await c
      .get('db')
      .select({
        id: schema.storedFile.id,
        size: schema.storedFile.size,
        contentType: schema.storedFile.contentType,
        purpose: schema.storedFile.purpose,
        createdAt: schema.storedFile.createdAt,
      })
      .from(schema.storedFile)
      .orderBy(asc(schema.storedFile.createdAt));
    return c.json(rows.filter((r) => r.purpose !== 'pending'));
  })

  .get('/backup/files/:id', async (c) => {
    const row = await c.get('db').select().from(schema.storedFile).where(eq(schema.storedFile.id, c.req.param('id'))).get();
    const object = row ? await c.env.FILES.get(row.r2Key) : null;
    if (!row || !object) throw apiError(404, 'not_found', 'Fichier introuvable.');
    await journal(c, `fichier ${row.id}`);
    return new Response(object.body, {
      headers: { 'content-type': row.contentType, 'content-length': String(row.size), 'cache-control': 'no-store' },
    });
  });
