import {
  DEFAULT_MEDAL_SETTINGS,
  MEDAL_ID_PATTERN,
  type MedalSettings,
  type MedalStatus,
  type PublicMedal,
  buildPublicMedal,
  medalSettingsSchema,
  medalUrl,
} from '@eko/shared';
import { and, eq, sql } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { loadSession, requireFullSession, requireUnlocked } from '../auth/session';
import { type Db, getDb, schema } from '../db/client';
import type { AppEnv, Env } from '../env';
import { audit } from '../lib/audit';
import { randomBytes, sha256, toBase64Url } from '../lib/crypto';
import { renderMedalNotFound, renderMedalPage } from '../lib/medalPage';
import { readJson } from '../lib/validate';
import { requireDog } from './dog';
import { FILE_CSP } from './files';

type MedalRow = typeof schema.medal.$inferSelect;

/** Identifiant public : 96 bits aléatoires, 16 caractères base64url (QR compact). */
function newPublicId(): string {
  return toBase64Url(randomBytes(12));
}

function parseSettings(raw: string | null | undefined): MedalSettings {
  if (!raw) return DEFAULT_MEDAL_SETTINGS;
  const parsed = medalSettingsSchema.safeParse({ ...DEFAULT_MEDAL_SETTINGS, ...JSON.parse(raw) });
  return parsed.success ? parsed.data : DEFAULT_MEDAL_SETTINGS;
}

/** Instantané de secours dans R2, lu si D1 ne répond pas. Supprimé dès que l'identifiant est révoqué. */
interface Snapshot {
  medal: PublicMedal;
  photoKey: string | null;
  photoType: string | null;
}
const snapshotKey = (publicId: string) => `public/medal/${publicId}.json`;

interface LoadedMedal {
  row: MedalRow;
  snapshot: Snapshot;
}

/** Fiche publique telle qu'elle doit s'afficher maintenant, à partir de D1. */
async function loadPublicMedal(db: Db, where: ReturnType<typeof eq>): Promise<LoadedMedal | null> {
  const row = await db.select().from(schema.medal).where(where).get();
  if (!row) return null;
  const dog = await db.select().from(schema.dog).where(eq(schema.dog.id, row.dogId)).get();
  if (!dog) return null;
  const settings = parseSettings(row.settings);
  const vet = await db
    .select()
    .from(schema.contact)
    .where(and(eq(schema.contact.dogId, dog.id), eq(schema.contact.primary, true)))
    .get();
  const photo = dog.photoFileId
    ? await db.select().from(schema.storedFile).where(eq(schema.storedFile.id, dog.photoFileId)).get()
    : undefined;
  const medal = buildPublicMedal({ ...dog, hasPhoto: Boolean(photo) }, settings, vet ?? null);
  return {
    row,
    snapshot: {
      medal,
      photoKey: medal.hasPhoto && photo ? photo.r2Key : null,
      photoType: medal.hasPhoto && photo ? photo.contentType : null,
    },
  };
}

/** Réécrit l'instantané R2 seulement s'il a changé (une écriture R2 par modification, pas par visite). */
async function refreshSnapshot(env: Env, db: Db, loaded: LoadedMedal): Promise<void> {
  const { row, snapshot } = loaded;
  if (!row.publicId) return;
  const body = JSON.stringify(snapshot);
  const hash = await sha256(body);
  if (hash === row.snapshotHash) return;
  await env.FILES.put(snapshotKey(row.publicId), body, { httpMetadata: { contentType: 'application/json' } });
  await db.update(schema.medal).set({ snapshotHash: hash }).where(eq(schema.medal.dogId, row.dogId));
}

async function medalStatus(c: Context<AppEnv>, row: MedalRow | undefined): Promise<MedalStatus> {
  return {
    url: row?.publicId ? medalUrl(c.env.ORIGIN, row.publicId) : null,
    createdAt: row?.publicId && row.createdAt ? new Date(row.createdAt).toISOString() : null,
    lastScanAt: row?.lastScanAt ? new Date(row.lastScanAt).toISOString() : null,
    scanCount: row?.scanCount ?? 0,
    settings: parseSettings(row?.settings),
  };
}

/** Après toute modification : remet l'instantané de secours à jour. */
async function afterChange(c: Context<AppEnv>, dogId: string) {
  const db = c.get('db');
  const loaded = await loadPublicMedal(db, eq(schema.medal.dogId, dogId));
  if (loaded) await refreshSnapshot(c.env, db, loaded);
  return loaded?.row;
}

export const medalRoutes = new Hono<AppEnv>()
  .use('*', loadSession, requireFullSession, requireUnlocked)

  .get('/medal', async (c) => {
    const dog = await requireDog(c);
    // La consultation par le propriétaire rafraîchit aussi l'instantané (profil ou vétérinaire modifiés).
    const row = await afterChange(c, dog.id);
    return c.json(await medalStatus(c, row));
  })

  .put('/medal/settings', async (c) => {
    const dog = await requireDog(c);
    const settings = await readJson(c, medalSettingsSchema);
    const now = Date.now();
    await c
      .get('db')
      .insert(schema.medal)
      .values({ dogId: dog.id, settings: JSON.stringify(settings), updatedAt: now })
      .onConflictDoUpdate({ target: schema.medal.dogId, set: { settings: JSON.stringify(settings), updatedAt: now } });
    const row = await afterChange(c, dog.id);
    return c.json(await medalStatus(c, row));
  })

  // Aperçu de la fiche publique dans l'application, avec les réglages enregistrés.
  .get('/medal/preview', async (c) => {
    const dog = await requireDog(c);
    const db = c.get('db');
    const loaded = await loadPublicMedal(db, eq(schema.medal.dogId, dog.id));
    if (loaded) return c.json(loaded.snapshot.medal);
    const vet = await db
      .select()
      .from(schema.contact)
      .where(and(eq(schema.contact.dogId, dog.id), eq(schema.contact.primary, true)))
      .get();
    return c.json(buildPublicMedal({ ...dog, hasPhoto: Boolean(dog.photoFileId) }, DEFAULT_MEDAL_SETTINGS, vet ?? null));
  })

  // Active la médaille, ou remplace son adresse : l'ancienne cesse aussitôt de fonctionner.
  .post('/medal/link', async (c) => {
    const dog = await requireDog(c);
    const db = c.get('db');
    const previous = await db.select().from(schema.medal).where(eq(schema.medal.dogId, dog.id)).get();
    const now = Date.now();
    const values = { publicId: newPublicId(), snapshotHash: null, createdAt: now, lastScanAt: null, scanCount: 0, updatedAt: now };
    await db
      .insert(schema.medal)
      .values({ dogId: dog.id, settings: JSON.stringify(DEFAULT_MEDAL_SETTINGS), ...values })
      .onConflictDoUpdate({ target: schema.medal.dogId, set: values });
    if (previous?.publicId) await c.env.FILES.delete(snapshotKey(previous.publicId));
    await audit(db, previous?.publicId ? 'medal_replaced' : 'medal_activated');
    const row = await afterChange(c, dog.id);
    return c.json(await medalStatus(c, row), 201);
  })

  .delete('/medal/link', async (c) => {
    const dog = await requireDog(c);
    const db = c.get('db');
    const previous = await db.select().from(schema.medal).where(eq(schema.medal.dogId, dog.id)).get();
    if (previous?.publicId) {
      await db
        .update(schema.medal)
        .set({ publicId: null, snapshotHash: null, createdAt: null, updatedAt: Date.now() })
        .where(eq(schema.medal.dogId, dog.id));
      await c.env.FILES.delete(snapshotKey(previous.publicId));
      await audit(db, 'medal_deactivated');
    }
    const row = await db.select().from(schema.medal).where(eq(schema.medal.dogId, dog.id)).get();
    return c.json(await medalStatus(c, row));
  });

// ---------------------------------------------------------------- Fiche publique

/** Tâche après réponse (compteur de visites, instantané) : ses erreurs ne gênent jamais l'affichage. */
function runInBackground(c: Context<AppEnv>, task: Promise<unknown>) {
  const safe = task.catch(() => undefined);
  try {
    c.executionCtx.waitUntil(safe);
  } catch {
    // Pas de contexte d'exécution (tests) : la tâche se termine d'elle-même.
  }
}

function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Toujours relue : une désactivation doit prendre effet immédiatement.
      'cache-control': 'no-store',
    },
  });
}

async function readSnapshot(env: Env, publicId: string): Promise<Snapshot | null> {
  const object = await env.FILES.get(snapshotKey(publicId));
  return object ? ((await object.json()) as Snapshot) : null;
}

/**
 * Lit la fiche dans D1 ; si D1 ne répond pas, se replie sur l'instantané R2.
 * Renvoie null si la médaille est inconnue ou désactivée.
 */
async function resolvePublic(c: Context<AppEnv>, publicId: string): Promise<{ snapshot: Snapshot; loaded: LoadedMedal | null } | null> {
  if (!MEDAL_ID_PATTERN.test(publicId)) return null;
  try {
    const loaded = await loadPublicMedal(getDb(c.env.DB), eq(schema.medal.publicId, publicId));
    return loaded ? { snapshot: loaded.snapshot, loaded } : null;
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', task: 'medal', message: 'D1 indisponible, repli sur R2', name: (error as Error).name }));
    const snapshot = await readSnapshot(c.env, publicId);
    return snapshot ? { snapshot, loaded: null } : null;
  }
}

/** Routes publiques, hors /api : /m/<identifiant> et sa photo. Aucune session, aucune donnée privée. */
export const publicMedalRoutes = new Hono<AppEnv>()
  .get('/m/:id', async (c) => {
    const publicId = c.req.param('id');
    const found = await resolvePublic(c, publicId);
    if (!found) return htmlResponse(renderMedalNotFound(), 404);
    const { snapshot, loaded } = found;
    if (loaded) {
      const db = getDb(c.env.DB);
      runInBackground(
        c,
        Promise.all([
          refreshSnapshot(c.env, db, loaded),
          db
            .update(schema.medal)
            .set({ lastScanAt: Date.now(), scanCount: sql`${schema.medal.scanCount} + 1` })
            .where(eq(schema.medal.dogId, loaded.row.dogId)),
        ]),
      );
    }
    const photoUrl = snapshot.photoKey ? `/m/${publicId}/photo` : null;
    return htmlResponse(renderMedalPage(snapshot.medal, photoUrl), 200);
  })

  .get('/m/:id/photo', async (c) => {
    const found = await resolvePublic(c, c.req.param('id'));
    const key = found?.snapshot.photoKey;
    const object = key ? await c.env.FILES.get(key) : null;
    if (!found || !object) return new Response('Introuvable', { status: 404, headers: { 'cache-control': 'no-store' } });
    return new Response(object.body, {
      headers: {
        'content-type': found.snapshot.photoType ?? 'application/octet-stream',
        'cache-control': 'no-store',
        'content-security-policy': FILE_CSP,
      },
    });
  });
