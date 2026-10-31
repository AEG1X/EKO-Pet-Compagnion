import {
  type Album,
  DEFAULT_MEMORY_REMINDERS,
  type MemoryReminderSettings,
  SHARE_TOKEN_PATTERN,
  type ShareLink,
  type SpecialDate,
  albumCoverSchema,
  albumInputSchema,
  albumMembersSchema,
  fileUrl,
  memoryMoments,
  memoryReminderSettingsSchema,
  shareCreateSchema,
  shareStatus,
  shareUrl,
  specialDateInputSchema,
  upcomingMoments,
} from '@eko/shared';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { loadSession, requireFullSession, requireUnlocked } from '../auth/session';
import { type Db, getDb, schema } from '../db/client';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { randomBytes, randomId, toBase64Url } from '../lib/crypto';
import { apiError } from '../lib/errors';
import { htmlResponse, runInBackground, serveStoredFile } from '../lib/http';
import { type SharedAlbum, renderShareUnavailable, renderSharedAlbum, renderSharedItem } from '../lib/sharePage';
import { readJson } from '../lib/validate';
import { RATE_LIMITS, enforceRateLimit } from '../security/rateLimit';
import { requireDog } from './dog';
import { todayInParis } from './reminders';

type AlbumRow = typeof schema.album.$inferSelect;
type ShareRow = typeof schema.shareLink.$inferSelect;

/** Albums du chien, avec nombre de souvenirs, couverture, période et partages actifs. */
async function listAlbums(db: Db, dogId: string, id?: string): Promise<Album[]> {
  const a = schema.album;
  const rows = await db
    .select()
    .from(a)
    .where(id ? and(eq(a.dogId, dogId), eq(a.id, id)) : eq(a.dogId, dogId))
    .orderBy(desc(a.updatedAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const members = await db
    .select({
      albumId: schema.albumMemory.albumId,
      memoryId: schema.memory.id,
      takenDate: schema.memory.takenDate,
      previewFileId: schema.memory.previewFileId,
    })
    .from(schema.albumMemory)
    .innerJoin(schema.memory, eq(schema.memory.id, schema.albumMemory.memoryId))
    .where(inArray(schema.albumMemory.albumId, ids))
    .orderBy(desc(schema.memory.takenDate), desc(schema.memory.takenTime));
  const shares = await db
    .select({ albumId: schema.shareLink.albumId, revokedAt: schema.shareLink.revokedAt, expiresAt: schema.shareLink.expiresAt })
    .from(schema.shareLink)
    .where(and(inArray(schema.shareLink.albumId, ids), isNull(schema.shareLink.revokedAt)));
  const now = Date.now();
  return rows.map((row) => {
    const items = members.filter((m) => m.albumId === row.id);
    const cover = items.find((m) => m.memoryId === row.coverMemoryId && m.previewFileId) ?? items.find((m) => m.previewFileId);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      count: items.length,
      coverUrl: cover?.previewFileId ? fileUrl(cover.previewFileId) : null,
      coverMemoryId: row.coverMemoryId,
      firstDate: items.at(-1)?.takenDate ?? null,
      lastDate: items[0]?.takenDate ?? null,
      activeShares: shares.filter((s) => s.albumId === row.id && shareStatus(s, now) === 'active').length,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  });
}

async function ownAlbum(c: Context<AppEnv>): Promise<AlbumRow> {
  const dog = await requireDog(c);
  const row = await c
    .get('db')
    .select()
    .from(schema.album)
    .where(and(eq(schema.album.id, c.req.param('id')!), eq(schema.album.dogId, dog.id)))
    .get();
  if (!row) throw apiError(404, 'not_found', 'Album introuvable.');
  return row;
}

function toShare(origin: string, row: ShareRow): ShareLink {
  return {
    id: row.id,
    albumId: row.albumId,
    label: row.label,
    url: shareUrl(origin, row.token),
    allowDownload: row.allowDownload,
    status: shareStatus(row),
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    lastViewedAt: row.lastViewedAt ? new Date(row.lastViewedAt).toISOString() : null,
    viewCount: row.viewCount,
  };
}

/** Lien de partage du propriétaire (via l'album du chien), ou 404. */
async function ownShare(c: Context<AppEnv>): Promise<ShareRow> {
  const dog = await requireDog(c);
  const found = await c
    .get('db')
    .select({ share: schema.shareLink })
    .from(schema.shareLink)
    .innerJoin(schema.album, eq(schema.album.id, schema.shareLink.albumId))
    .where(and(eq(schema.shareLink.id, c.req.param('id')!), eq(schema.album.dogId, dog.id)))
    .get();
  if (!found) throw apiError(404, 'not_found', 'Lien introuvable.');
  return found.share;
}

// ---------------------------------------------------------------- Rappels souvenirs

export async function readMemoryReminders(db: Db, dogId: string): Promise<MemoryReminderSettings> {
  const row = await db.select().from(schema.memoryReminderSettings).where(eq(schema.memoryReminderSettings.dogId, dogId)).get();
  return row ? { birthday: row.birthday, monthly: row.monthly, onThisDay: row.onThisDay, specialDates: row.specialDates } : DEFAULT_MEMORY_REMINDERS;
}

async function listSpecialDates(db: Db, dogId: string): Promise<SpecialDate[]> {
  return db
    .select({ id: schema.specialDate.id, title: schema.specialDate.title, date: schema.specialDate.date })
    .from(schema.specialDate)
    .where(eq(schema.specialDate.dogId, dogId))
    .orderBy(asc(sql`substr(${schema.specialDate.date}, 6)`));
}

/** Moments à célébrer aujourd'hui pour ce chien (notification de 8 h et page Souvenirs). */
export async function momentsFor(db: Db, dog: { id: string; name: string; birthDate: string | null }, today: string) {
  const settings = await readMemoryReminders(db, dog.id);
  const specialDates = await listSpecialDates(db, dog.id);
  // Seuls les souvenirs du même jour et du même mois comptent pour « ce jour-là ».
  const memoryDates = settings.onThisDay
    ? (
        await db
          .select({ date: schema.memory.takenDate })
          .from(schema.memory)
          .where(
            and(
              eq(schema.memory.dogId, dog.id),
              inArray(sql`substr(${schema.memory.takenDate}, 6)`, today.slice(5) === '02-28' ? ['02-28', '02-29'] : [today.slice(5)]),
            ),
          )
      ).map((r) => r.date)
    : [];
  return {
    settings,
    specialDates,
    today: memoryMoments({ dogName: dog.name, birthDate: dog.birthDate, specialDates, memoryDates, settings }, today),
    upcoming: upcomingMoments(dog.birthDate, specialDates, today),
  };
}

export const albumRoutes = new Hono<AppEnv>()
  .use('*', loadSession, requireFullSession, requireUnlocked)

  // ---------- Albums ----------
  .get('/albums', async (c) => {
    const dog = await requireDog(c);
    return c.json(await listAlbums(c.get('db'), dog.id));
  })

  .post('/albums', async (c) => {
    const dog = await requireDog(c);
    const input = await readJson(c, albumInputSchema);
    const now = Date.now();
    const id = randomId();
    await c.get('db').insert(schema.album).values({ id, dogId: dog.id, ...input, createdAt: now, updatedAt: now });
    return c.json((await listAlbums(c.get('db'), dog.id, id))[0], 201);
  })

  .patch('/albums/:id', async (c) => {
    const album = await ownAlbum(c);
    const input = await readJson(c, albumInputSchema);
    await c.get('db').update(schema.album).set({ ...input, updatedAt: Date.now() }).where(eq(schema.album.id, album.id));
    return c.json((await listAlbums(c.get('db'), album.dogId, album.id))[0]);
  })

  // Supprime l'album et ses liens de partage ; les souvenirs restent dans la galerie.
  .delete('/albums/:id', async (c) => {
    const album = await ownAlbum(c);
    await c.get('db').delete(schema.album).where(eq(schema.album.id, album.id));
    return c.json({ ok: true });
  })

  .put('/albums/:id/memories', async (c) => {
    const album = await ownAlbum(c);
    const { add, remove } = await readJson(c, albumMembersSchema);
    const db = c.get('db');
    if (add.length) {
      // Seuls les souvenirs de ce chien peuvent entrer dans l'album.
      const valid = await db
        .select({ id: schema.memory.id })
        .from(schema.memory)
        .where(and(eq(schema.memory.dogId, album.dogId), inArray(schema.memory.id, add)));
      if (valid.length !== new Set(add).size) throw apiError(400, 'invalid_input', 'Souvenir introuvable.');
      const now = Date.now();
      // Lots modestes : D1 limite le nombre de paramètres par requête.
      for (let i = 0; i < valid.length; i += 25) {
        await db
          .insert(schema.albumMemory)
          .values(valid.slice(i, i + 25).map((m) => ({ albumId: album.id, memoryId: m.id, addedAt: now })))
          .onConflictDoNothing();
      }
    }
    if (remove.length) {
      await db.delete(schema.albumMemory).where(and(eq(schema.albumMemory.albumId, album.id), inArray(schema.albumMemory.memoryId, remove)));
      if (album.coverMemoryId && remove.includes(album.coverMemoryId)) {
        await db.update(schema.album).set({ coverMemoryId: null }).where(eq(schema.album.id, album.id));
      }
    }
    await db.update(schema.album).set({ updatedAt: Date.now() }).where(eq(schema.album.id, album.id));
    return c.json((await listAlbums(db, album.dogId, album.id))[0]);
  })

  .put('/albums/:id/cover', async (c) => {
    const album = await ownAlbum(c);
    const { memoryId } = await readJson(c, albumCoverSchema);
    const db = c.get('db');
    if (memoryId) {
      const member = await db
        .select()
        .from(schema.albumMemory)
        .where(and(eq(schema.albumMemory.albumId, album.id), eq(schema.albumMemory.memoryId, memoryId)))
        .get();
      if (!member) throw apiError(400, 'invalid_input', 'Ce souvenir n’est pas dans l’album.');
    }
    await db.update(schema.album).set({ coverMemoryId: memoryId, updatedAt: Date.now() }).where(eq(schema.album.id, album.id));
    return c.json((await listAlbums(db, album.dogId, album.id))[0]);
  })

  // ---------- Partage ----------
  .get('/albums/:id/shares', async (c) => {
    const album = await ownAlbum(c);
    const rows = await c.get('db').select().from(schema.shareLink).where(eq(schema.shareLink.albumId, album.id)).orderBy(desc(schema.shareLink.createdAt));
    return c.json(rows.map((r) => toShare(c.env.ORIGIN, r)));
  })

  .post('/albums/:id/shares', async (c) => {
    const album = await ownAlbum(c);
    const input = await readJson(c, shareCreateSchema);
    const now = Date.now();
    const row: ShareRow = {
      id: randomId(),
      albumId: album.id,
      token: toBase64Url(randomBytes(16)),
      label: input.label,
      allowDownload: input.allowDownload,
      expiresAt: input.days === null ? null : now + input.days * 86_400_000,
      revokedAt: null,
      createdAt: now,
      lastViewedAt: null,
      viewCount: 0,
    };
    await c.get('db').insert(schema.shareLink).values(row);
    await audit(c.get('db'), 'share_created', input.days === null ? 'sans expiration' : `${input.days} j`);
    return c.json(toShare(c.env.ORIGIN, row), 201);
  })

  // Révocation immédiate : le lien cesse de fonctionner, il reste visible dans l'historique.
  .post('/shares/:id/revoke', async (c) => {
    const share = await ownShare(c);
    if (!share.revokedAt) {
      await c.get('db').update(schema.shareLink).set({ revokedAt: Date.now() }).where(eq(schema.shareLink.id, share.id));
      await audit(c.get('db'), 'share_revoked');
    }
    return c.json({ ok: true });
  })

  // Effacement d'un lien qui ne fonctionne plus (révoqué ou expiré).
  .delete('/shares/:id', async (c) => {
    const share = await ownShare(c);
    if (shareStatus(share) === 'active') throw apiError(409, 'share_active', 'Désactive d’abord ce lien.');
    await c.get('db').delete(schema.shareLink).where(eq(schema.shareLink.id, share.id));
    return c.json({ ok: true });
  })

  // ---------- Rappels souvenirs ----------
  .get('/memories/moments', async (c) => {
    const dog = await requireDog(c);
    return c.json(await momentsFor(c.get('db'), dog, todayInParis()));
  })

  .put('/memories/reminders', async (c) => {
    const dog = await requireDog(c);
    const input = await readJson(c, memoryReminderSettingsSchema);
    const row = { ...input, updatedAt: Date.now() };
    await c
      .get('db')
      .insert(schema.memoryReminderSettings)
      .values({ dogId: dog.id, ...row })
      .onConflictDoUpdate({ target: schema.memoryReminderSettings.dogId, set: row });
    return c.json(input);
  })

  .post('/special-dates', async (c) => {
    const dog = await requireDog(c);
    const input = await readJson(c, specialDateInputSchema);
    const id = randomId();
    await c.get('db').insert(schema.specialDate).values({ id, dogId: dog.id, ...input, createdAt: Date.now() });
    return c.json({ id, ...input } satisfies SpecialDate, 201);
  })

  .delete('/special-dates/:id', async (c) => {
    const dog = await requireDog(c);
    const deleted = await c
      .get('db')
      .delete(schema.specialDate)
      .where(and(eq(schema.specialDate.id, c.req.param('id')), eq(schema.specialDate.dogId, dog.id)))
      .returning({ id: schema.specialDate.id });
    if (!deleted[0]) throw apiError(404, 'not_found', 'Date introuvable.');
    return c.json({ ok: true });
  });

// ---------------------------------------------------------------- Album partagé (public)

interface ResolvedShare {
  share: ShareRow;
  album: SharedAlbum;
  /** Fichiers servis par souvenir : original et aperçu. */
  files: Map<string, { original: typeof schema.storedFile.$inferSelect; previewFileId: string | null }>;
}

/** Lien valide (ni révoqué, ni expiré) et contenu de l'album, ou null. */
async function resolveShare(db: Db, token: string): Promise<ResolvedShare | null> {
  if (!SHARE_TOKEN_PATTERN.test(token)) return null;
  const found = await db
    .select({ share: schema.shareLink, album: schema.album, dogName: schema.dog.name })
    .from(schema.shareLink)
    .innerJoin(schema.album, eq(schema.album.id, schema.shareLink.albumId))
    .innerJoin(schema.dog, eq(schema.dog.id, schema.album.dogId))
    .where(eq(schema.shareLink.token, token))
    .get();
  if (!found || shareStatus(found.share) !== 'active') return null;
  const rows = await db
    .select({ memory: schema.memory, file: schema.storedFile })
    .from(schema.albumMemory)
    .innerJoin(schema.memory, eq(schema.memory.id, schema.albumMemory.memoryId))
    .innerJoin(schema.storedFile, eq(schema.storedFile.id, schema.memory.fileId))
    .where(eq(schema.albumMemory.albumId, found.album.id))
    .orderBy(desc(schema.memory.takenDate), desc(schema.memory.takenTime), desc(schema.memory.createdAt));
  const files: ResolvedShare['files'] = new Map();
  for (const r of rows) files.set(r.memory.id, { original: r.file, previewFileId: r.memory.previewFileId });
  return {
    share: found.share,
    files,
    album: {
      base: `/partage/${token}`,
      dogName: found.dogName,
      name: found.album.name,
      description: found.album.description,
      allowDownload: found.share.allowDownload,
      expiresAt: found.share.expiresAt,
      items: rows.map(({ memory }) => ({
        id: memory.id,
        kind: memory.kind,
        takenDate: memory.takenDate,
        caption: memory.caption,
        durationSeconds: memory.durationSeconds,
        hasPreview: Boolean(memory.previewFileId),
        width: memory.width,
        height: memory.height,
      })),
    },
  };
}

/** Limite de consultation par visiteur (pages HTML seulement) ; renvoie une page d'erreur au-delà. */
async function pageGuard(c: Context<AppEnv>): Promise<Response | null> {
  try {
    await enforceRateLimit(c, RATE_LIMITS.share);
    return null;
  } catch {
    return htmlResponse(renderShareUnavailable(), 429);
  }
}

/** Routes publiques, hors /api : /partage/<jeton>. Aucune session ; seul le contenu de l'album est accessible. */
export const publicShareRoutes = new Hono<AppEnv>()
  .use('/partage/*', async (c, next) => {
    c.set('db', getDb(c.env.DB));
    await next();
  })

  .get('/partage/:token', async (c) => {
    const limited = await pageGuard(c);
    if (limited) return limited;
    const db = c.get('db');
    const found = await resolveShare(db, c.req.param('token'));
    if (!found) return htmlResponse(renderShareUnavailable(), 404);
    runInBackground(
      c,
      db
        .update(schema.shareLink)
        .set({ lastViewedAt: Date.now(), viewCount: sql`${schema.shareLink.viewCount} + 1` })
        .where(eq(schema.shareLink.id, found.share.id)),
    );
    return htmlResponse(renderSharedAlbum(found.album), 200);
  })

  .get('/partage/:token/apercu/:memoryId', (c) => serveShared(c, 'preview'))
  .get('/partage/:token/fichier/:memoryId', (c) => serveShared(c, 'original'))

  .get('/partage/:token/:memoryId', async (c) => {
    const limited = await pageGuard(c);
    if (limited) return limited;
    const found = await resolveShare(c.get('db'), c.req.param('token'));
    const index = found ? found.album.items.findIndex((i) => i.id === c.req.param('memoryId')) : -1;
    if (!found || index < 0) return htmlResponse(renderShareUnavailable(), 404);
    return htmlResponse(renderSharedItem(found.album, index), 200);
  });

async function serveShared(c: Context<AppEnv>, which: 'preview' | 'original'): Promise<Response> {
  const db = c.get('db');
  const found = await resolveShare(db, c.req.param('token')!);
  const entry = found?.files.get(c.req.param('memoryId')!);
  const notFound = () => new Response('Introuvable', { status: 404, headers: { 'cache-control': 'no-store' } });
  if (!found || !entry) return notFound();
  let file = entry.original;
  if (which === 'preview') {
    if (!entry.previewFileId) return notFound();
    const preview = await db.select().from(schema.storedFile).where(eq(schema.storedFile.id, entry.previewFileId)).get();
    if (!preview) return notFound();
    file = preview;
  }
  const download = which === 'original' && found.share.allowDownload && c.req.query('telecharger') === '1';
  // Jamais en cache : une révocation prend effet immédiatement, y compris pour les aperçus.
  return (await serveStoredFile(c.env, c.req.raw, file, { download, cache: 'private, no-store' })) ?? notFound();
}
