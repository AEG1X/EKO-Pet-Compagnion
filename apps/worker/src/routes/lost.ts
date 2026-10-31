import {
  type FinderReport,
  type LostEpisode,
  type LostStatus,
  REPORT_RETENTION_DAYS,
  lostModeInputSchema,
  mapUrl,
} from '@eko/shared';
import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { loadSession, requireFullSession, requireUnlocked } from '../auth/session';
import { type Db, schema } from '../db/client';
import type { AppEnv, Env } from '../env';
import { audit } from '../lib/audit';
import { randomId } from '../lib/crypto';
import { apiError } from '../lib/errors';
import { readJson } from '../lib/validate';
import { requireDog } from './dog';
import { type LoadedMedal, loadPublicMedal, refreshSnapshot } from './medal';
import { deliver } from './notifications';

type EpisodeRow = typeof schema.lostEpisode.$inferSelect;
type ReportRow = typeof schema.finderReport.$inferSelect;

const DAY_MS = 24 * 3600 * 1000;
/** Au plus une alerte « fiche consultée » par quart d'heure. */
const SCAN_ALERT_INTERVAL_MS = 15 * 60_000;
/** Plafond par épisode, contre les abus : au-delà, la fiche invite à appeler. */
export const MAX_REPORTS_PER_EPISODE = 200;

export async function currentEpisode(db: Db, dogId: string): Promise<EpisodeRow | undefined> {
  return db
    .select()
    .from(schema.lostEpisode)
    .where(and(eq(schema.lostEpisode.dogId, dogId), isNull(schema.lostEpisode.endedAt)))
    .get();
}

function toEpisode(row: EpisodeRow): LostEpisode {
  return {
    id: row.id,
    startedAt: new Date(row.startedAt).toISOString(),
    endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
    message: row.message,
    reportCount: row.reportCount,
    purgeAt: row.endedAt ? new Date(row.endedAt + REPORT_RETENTION_DAYS * DAY_MS).toISOString() : null,
    purged: row.purgedAt !== null,
  };
}

function toReport(row: ReportRow): FinderReport & { episodeId: string } {
  return {
    id: row.id,
    episodeId: row.episodeId,
    createdAt: new Date(row.createdAt).toISOString(),
    message: row.message,
    contact: row.contact,
    position:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude, accuracy: row.accuracy }
        : null,
  };
}

/** La fiche publique reflète tout de suite le mode perdu, y compris sa copie de secours. */
async function refreshPublic(c: Context<AppEnv>, dogId: string) {
  const db = c.get('db');
  const loaded = await loadPublicMedal(db, eq(schema.medal.dogId, dogId));
  if (loaded) await refreshSnapshot(c.env, db, loaded);
}

async function lostStatus(db: Db, dogId: string): Promise<LostStatus> {
  const episodes = await db
    .select()
    .from(schema.lostEpisode)
    .where(eq(schema.lostEpisode.dogId, dogId))
    .orderBy(desc(schema.lostEpisode.startedAt));
  const withReports = episodes.filter((e) => e.purgedAt === null).map((e) => e.id);
  const reports = withReports.length
    ? await db
        .select()
        .from(schema.finderReport)
        .where(inArray(schema.finderReport.episodeId, withReports))
        .orderBy(desc(schema.finderReport.createdAt))
    : [];
  const current = episodes.find((e) => e.endedAt === null);
  return {
    current: current ? toEpisode(current) : null,
    reports: reports.map(toReport),
    history: episodes.filter((e) => e.endedAt !== null).map(toEpisode),
  };
}

export const lostRoutes = new Hono<AppEnv>()
  .use('*', loadSession, requireFullSession, requireUnlocked)

  .get('/lost', async (c) => {
    const dog = await requireDog(c);
    return c.json(await lostStatus(c.get('db'), dog.id));
  })

  // Déclare le chien perdu, ou modifie le message d'alerte s'il l'est déjà.
  .post('/lost', async (c) => {
    const dog = await requireDog(c);
    const { message } = await readJson(c, lostModeInputSchema);
    const db = c.get('db');
    const current = await currentEpisode(db, dog.id);
    if (current) {
      await db.update(schema.lostEpisode).set({ message }).where(eq(schema.lostEpisode.id, current.id));
    } else {
      await db.insert(schema.lostEpisode).values({ id: randomId(), dogId: dog.id, startedAt: Date.now(), message });
      await audit(db, 'lost_mode_on');
    }
    await refreshPublic(c, dog.id);
    return c.json(await lostStatus(db, dog.id), current ? 200 : 201);
  })

  // Retrouvé : fin du mode perdu. Les signalements seront effacés dans 30 jours.
  .delete('/lost', async (c) => {
    const dog = await requireDog(c);
    const db = c.get('db');
    const current = await currentEpisode(db, dog.id);
    if (current) {
      await db.update(schema.lostEpisode).set({ endedAt: Date.now() }).where(eq(schema.lostEpisode.id, current.id));
      await audit(db, 'lost_mode_off');
      await refreshPublic(c, dog.id);
    }
    return c.json(await lostStatus(db, dog.id));
  })

  .delete('/lost/reports/:id', async (c) => {
    const dog = await requireDog(c);
    const db = c.get('db');
    const report = await db
      .select({ id: schema.finderReport.id })
      .from(schema.finderReport)
      .innerJoin(schema.lostEpisode, eq(schema.lostEpisode.id, schema.finderReport.episodeId))
      .where(and(eq(schema.finderReport.id, c.req.param('id')), eq(schema.lostEpisode.dogId, dog.id)))
      .get();
    if (!report) throw apiError(404, 'not_found', 'Signalement introuvable.');
    await db.delete(schema.finderReport).where(eq(schema.finderReport.id, report.id));
    return c.json(await lostStatus(db, dog.id));
  });

// ---------------------------------------------------------------- Alertes

/** Fiche consultée pendant le mode perdu : alerte immédiate, au plus une par quart d'heure. */
export async function alertScan(env: Env, db: Db, loaded: LoadedMedal, now = Date.now(), fetcher: typeof fetch = fetch) {
  const episode = loaded.episode;
  if (!episode) return;
  if (episode.lastScanAlertAt && now - episode.lastScanAlertAt < SCAN_ALERT_INTERVAL_MS) return;
  // Réservation atomique : deux visites simultanées n'envoient qu'une alerte.
  const claimed = await db
    .update(schema.lostEpisode)
    .set({ lastScanAlertAt: now })
    .where(
      and(
        eq(schema.lostEpisode.id, episode.id),
        episode.lastScanAlertAt === null
          ? isNull(schema.lostEpisode.lastScanAlertAt)
          : eq(schema.lostEpisode.lastScanAlertAt, episode.lastScanAlertAt),
      ),
    )
    .returning({ id: schema.lostEpisode.id });
  if (!claimed[0]) return;
  await deliver(
    env,
    db,
    loaded.ownerId,
    {
      title: `La médaille de ${loaded.dogName} vient d’être scannée`,
      body: 'Quelqu’un consulte sa fiche en ce moment. Garde ton téléphone à portée de main.',
      url: '/medaille',
      tag: 'eko-perdu-scan',
    },
    fetcher,
    { urgent: true },
  );
}

export interface NewReport {
  message: string | null;
  contact: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

/** Enregistre un signalement et prévient aussitôt le propriétaire, sur tous ses canaux. */
export async function recordReport(
  env: Env,
  db: Db,
  loaded: LoadedMedal,
  report: NewReport,
  fetcher: typeof fetch = fetch,
): Promise<'ok' | 'full'> {
  const episode = loaded.episode!;
  const bumped = await db
    .update(schema.lostEpisode)
    .set({ reportCount: sql`${schema.lostEpisode.reportCount} + 1` })
    .where(and(eq(schema.lostEpisode.id, episode.id), lt(schema.lostEpisode.reportCount, MAX_REPORTS_PER_EPISODE)))
    .returning({ id: schema.lostEpisode.id });
  if (!bumped[0]) return 'full';
  await db.insert(schema.finderReport).values({ id: randomId(), episodeId: episode.id, createdAt: Date.now(), ...report });
  const lines = [
    report.message ? `« ${report.message} »` : 'Pas de message.',
    report.contact ? `Contact : ${report.contact}` : null,
    report.latitude !== null && report.longitude !== null
      ? `Position : ${mapUrl(report.latitude, report.longitude)}`
      : 'Position non partagée.',
  ].filter(Boolean);
  await deliver(
    env,
    db,
    loaded.ownerId,
    { title: `Signalement pour ${loaded.dogName}`, body: lines.join('\n'), url: '/medaille', tag: 'eko-perdu-signalement' },
    fetcher,
    { urgent: true },
  );
  return 'ok';
}

/** Tâche planifiée : efface les signalements (et leurs positions) 30 jours après la fin du mode perdu. */
export async function purgeOldReports(db: Db, now = Date.now()) {
  const expired = await db
    .select({ id: schema.lostEpisode.id })
    .from(schema.lostEpisode)
    .where(
      and(
        isNotNull(schema.lostEpisode.endedAt),
        isNull(schema.lostEpisode.purgedAt),
        lt(schema.lostEpisode.endedAt, now - REPORT_RETENTION_DAYS * DAY_MS),
      ),
    );
  for (const { id } of expired) {
    await db.delete(schema.finderReport).where(eq(schema.finderReport.episodeId, id));
    await db.update(schema.lostEpisode).set({ purgedAt: now }).where(eq(schema.lostEpisode.id, id));
  }
  return expired.length;
}
