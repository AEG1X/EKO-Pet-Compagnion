import {
  type EkoDocument,
  FILE_TYPES_LABEL,
  IMAGE_TYPES,
  STORAGE,
  type StorageUsage,
  type StoredFile,
  documentCreateSchema,
  documentInputSchema,
  dogPhotoSchema,
  formatBytes,
  sniffFileType,
} from '@eko/shared';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { loadSession, requireFullSession, requireUnlocked } from '../auth/session';
import { type Db, schema } from '../db/client';
import type { AppEnv, Env } from '../env';
import { checkSameDog } from '../lib/crud';
import { randomId } from '../lib/crypto';
import { apiError } from '../lib/errors';
import { readJson } from '../lib/validate';
import { findDog, requireDog, toDog } from './dog';

type FileRow = typeof schema.storedFile.$inferSelect;

/** Politique de sécurité propre aux fichiers servis : aucun script, aucun cadre. */
export const FILE_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'none'";

function toFile(row: FileRow): StoredFile {
  return { id: row.id, name: row.name, contentType: row.contentType, size: row.size };
}

/** Total des fichiers du propriétaire, en octets : la base des plafonds R2. */
export async function usedBytes(db: Db, ownerId: string): Promise<number> {
  const row = await db
    .select({ total: sql<number>`coalesce(sum(${schema.storedFile.size}), 0)` })
    .from(schema.storedFile)
    .where(eq(schema.storedFile.ownerId, ownerId))
    .get();
  return Number(row?.total ?? 0);
}

/** Nom d'origine envoyé par le navigateur (encodé en URI), nettoyé et raccourci. */
function cleanFileName(header: string | undefined): string | null {
  if (!header) return null;
  let name: string;
  try {
    name = decodeURIComponent(header);
  } catch {
    return null;
  }
  name = name
    .replace(/[\\/]/g, '_')
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, 120);
  return name || null;
}

/** En-tête Content-Disposition avec un nom compatible ASCII et sa version UTF-8. */
function disposition(kind: 'inline' | 'attachment', name: string | null): string {
  if (!name) return kind;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Fichier du propriétaire, ou 404 : un fichier d'un autre compte est traité comme inexistant. */
async function ownFile(db: Db, ownerId: string, id: string): Promise<FileRow> {
  const row = await db
    .select()
    .from(schema.storedFile)
    .where(and(eq(schema.storedFile.id, id), eq(schema.storedFile.ownerId, ownerId)))
    .get();
  if (!row) throw apiError(404, 'not_found', 'Fichier introuvable.');
  return row;
}

/** Supprime un fichier de R2 puis de la base. */
async function deleteFile(env: Env, db: Db, row: FileRow) {
  await env.FILES.delete(row.r2Key);
  await db.delete(schema.storedFile).where(eq(schema.storedFile.id, row.id));
}

/** Rattache un fichier envoyé (« pending ») à son usage ; refuse un fichier déjà utilisé ou d'un autre compte. */
async function claimFile(db: Db, ownerId: string, fileId: string, purpose: 'document' | 'photo'): Promise<FileRow> {
  const claimed = await db
    .update(schema.storedFile)
    .set({ purpose })
    .where(
      and(
        eq(schema.storedFile.id, fileId),
        eq(schema.storedFile.ownerId, ownerId),
        eq(schema.storedFile.purpose, 'pending'),
      ),
    )
    .returning();
  if (!claimed[0]) throw apiError(400, 'invalid_input', 'Fichier introuvable ou déjà utilisé. Envoie-le de nouveau.');
  return claimed[0];
}

async function listDocuments(db: Db, dogId: string, id?: string): Promise<EkoDocument[]> {
  const d = schema.document;
  const rows = await db
    .select({ doc: d, file: schema.storedFile })
    .from(d)
    .innerJoin(schema.storedFile, eq(schema.storedFile.id, d.fileId))
    .where(id ? and(eq(d.dogId, dogId), eq(d.id, id)) : eq(d.dogId, dogId))
    .orderBy(desc(d.date), desc(d.createdAt));
  return rows.map(({ doc, file }) => ({
    id: doc.id,
    title: doc.title,
    category: doc.category,
    date: doc.date,
    healthEventId: doc.healthEventId,
    notes: doc.notes,
    file: toFile(file),
  }));
}

export const fileRoutes = new Hono<AppEnv>()
  .use('*', loadSession, requireFullSession, requireUnlocked)

  // ---------- Stockage ----------
  .get('/storage', async (c) => {
    const usage: StorageUsage = {
      usedBytes: await usedBytes(c.get('db'), c.get('session').ownerId),
      warnBytes: STORAGE.WARN_BYTES,
      limitBytes: STORAGE.LIMIT_BYTES,
    };
    return c.json(usage);
  })

  // Envoi brut d'un fichier (corps = contenu du fichier). Il reste « en attente » jusqu'à son rattachement.
  .put('/files', async (c) => {
    const db = c.get('db');
    const ownerId = c.get('session').ownerId;
    const declared = Number(c.req.header('content-length'));
    if (!Number.isFinite(declared) || declared <= 0) {
      throw apiError(411, 'length_required', 'Taille du fichier inconnue.');
    }
    const tooBig = () =>
      apiError(413, 'file_too_large', `Fichier trop lourd : ${formatBytes(STORAGE.MAX_FILE_BYTES)} maximum.`);
    if (declared > STORAGE.MAX_FILE_BYTES) throw tooBig();

    const used = await usedBytes(db, ownerId);
    if (used + declared > STORAGE.LIMIT_BYTES) {
      throw apiError(
        507,
        'storage_full',
        `Stockage presque plein (${formatBytes(used)} sur ${formatBytes(STORAGE.LIMIT_BYTES)}). Supprime des fichiers pour en ajouter.`,
      );
    }

    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0) throw apiError(400, 'invalid_input', 'Le fichier est vide.');
    if (bytes.byteLength > STORAGE.MAX_FILE_BYTES) throw tooBig();
    const contentType = sniffFileType(bytes);
    if (!contentType) throw apiError(415, 'unsupported_file', `Format non accepté : ${FILE_TYPES_LABEL}.`);

    const id = randomId();
    const r2Key = `files/${ownerId}/${id}`;
    await c.env.FILES.put(r2Key, bytes, { httpMetadata: { contentType } });
    const row: FileRow = {
      id,
      ownerId,
      r2Key,
      contentType,
      size: bytes.byteLength,
      name: cleanFileName(c.req.header('x-file-name')),
      purpose: 'pending',
      createdAt: Date.now(),
    };
    try {
      await db.insert(schema.storedFile).values(row);
    } catch (error) {
      // Pas d'objet R2 orphelin si la base refuse l'enregistrement.
      await c.env.FILES.delete(r2Key);
      throw error;
    }
    return c.json(toFile(row), 201);
  })

  // Lecture d'un fichier : uniquement par son propriétaire, jamais mis en cache partagé.
  .get('/files/:id', async (c) => {
    const row = await ownFile(c.get('db'), c.get('session').ownerId, c.req.param('id'));
    const object = await c.env.FILES.get(row.r2Key);
    if (!object) throw apiError(404, 'not_found', 'Fichier introuvable.');
    const kind = c.req.query('download') === '1' ? 'attachment' : 'inline';
    return new Response(object.body, {
      headers: {
        'content-type': row.contentType,
        'content-length': String(row.size),
        'content-disposition': disposition(kind, row.name),
        'cache-control': 'private, no-store',
        'content-security-policy': FILE_CSP,
      },
    });
  })

  // Abandon d'un envoi qui ne sera pas rattaché (formulaire annulé).
  .delete('/files/:id', async (c) => {
    const db = c.get('db');
    const row = await ownFile(db, c.get('session').ownerId, c.req.param('id'));
    if (row.purpose !== 'pending') {
      throw apiError(409, 'file_in_use', 'Ce fichier est utilisé : supprime plutôt le document ou la photo.');
    }
    await deleteFile(c.env, db, row);
    return c.json({ ok: true });
  })

  // ---------- Photo du profil ----------
  .put('/dog/photo', async (c) => {
    const { fileId } = await readJson(c, dogPhotoSchema);
    const dog = await requireDog(c);
    const db = c.get('db');
    const ownerId = c.get('session').ownerId;
    if (fileId) {
      const pending = await ownFile(db, ownerId, fileId);
      if (!IMAGE_TYPES.includes(pending.contentType)) {
        throw apiError(415, 'unsupported_file', 'La photo doit être une image JPEG, PNG ou WebP.');
      }
      await claimFile(db, ownerId, fileId, 'photo');
    }
    await db.update(schema.dog).set({ photoFileId: fileId, updatedAt: Date.now() }).where(eq(schema.dog.id, dog.id));
    // L'ancienne photo ne sert plus : on libère sa place.
    if (dog.photoFileId && dog.photoFileId !== fileId) {
      const old = await db.select().from(schema.storedFile).where(eq(schema.storedFile.id, dog.photoFileId)).get();
      if (old) await deleteFile(c.env, db, old);
    }
    return c.json(toDog((await findDog(db, ownerId))!));
  })

  // ---------- Documents ----------
  .get('/documents', async (c) => {
    const dog = await findDog(c.get('db'), c.get('session').ownerId);
    return c.json(dog ? await listDocuments(c.get('db'), dog.id) : []);
  })

  .post('/documents', async (c) => {
    const { fileId, ...input } = await readJson(c, documentCreateSchema);
    const dog = await requireDog(c);
    const db = c.get('db');
    await checkSameDog(db, schema.healthEvent, dog.id, input.healthEventId, 'Soin introuvable.');
    await claimFile(db, c.get('session').ownerId, fileId, 'document');
    const id = randomId();
    const now = Date.now();
    await db.insert(schema.document).values({ id, dogId: dog.id, fileId, ...input, createdAt: now, updatedAt: now });
    return c.json((await listDocuments(db, dog.id, id))[0], 201);
  })

  .put('/documents/:id', async (c) => {
    const input = await readJson(c, documentInputSchema);
    const dog = await requireDog(c);
    const db = c.get('db');
    await checkSameDog(db, schema.healthEvent, dog.id, input.healthEventId, 'Soin introuvable.');
    const updated = await db
      .update(schema.document)
      .set({ ...input, updatedAt: Date.now() })
      .where(and(eq(schema.document.id, c.req.param('id')), eq(schema.document.dogId, dog.id)))
      .returning({ id: schema.document.id });
    if (!updated[0]) throw apiError(404, 'not_found', 'Document introuvable.');
    return c.json((await listDocuments(db, dog.id, updated[0].id))[0]);
  })

  .delete('/documents/:id', async (c) => {
    const dog = await requireDog(c);
    const db = c.get('db');
    const deleted = await db
      .delete(schema.document)
      .where(and(eq(schema.document.id, c.req.param('id')), eq(schema.document.dogId, dog.id)))
      .returning({ fileId: schema.document.fileId });
    if (!deleted[0]) throw apiError(404, 'not_found', 'Document introuvable.');
    const file = await db.select().from(schema.storedFile).where(eq(schema.storedFile.id, deleted[0].fileId)).get();
    if (file) await deleteFile(c.env, db, file);
    return c.json({ ok: true });
  });

/** Tâche planifiée : supprime les envois jamais rattachés (formulaire abandonné, onglet fermé). */
export async function purgePendingFiles(env: Env, db: Db, now = Date.now()) {
  const cutoff = now - STORAGE.PENDING_TTL_HOURS * 3_600_000;
  const stale = await db
    .select()
    .from(schema.storedFile)
    .where(and(eq(schema.storedFile.purpose, 'pending'), lt(schema.storedFile.createdAt, cutoff)))
    .limit(500);
  if (stale.length === 0) return;
  await env.FILES.delete(stale.map((f) => f.r2Key));
  for (const file of stale) await db.delete(schema.storedFile).where(eq(schema.storedFile.id, file.id));
}
