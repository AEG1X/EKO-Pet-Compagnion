import { SECURITY, type SessionKind } from '@eko/shared';
import { and, eq, ne } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { schema } from '../db/client';
import type { AppEnv } from '../env';
import { randomToken, sha256 } from '../lib/crypto';
import { apiError } from '../lib/errors';

/** Nom du cookie ; Hono ajoute le préfixe `__Host-`, qui impose Secure, Path=/ et aucun Domain. */
const COOKIE_NAME = 'eko_session';
const RECOVERY_TTL_MS = 15 * 60 * 1000;
const FULL_TTL_MS = SECURITY.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const IDLE_MS = SECURITY.IDLE_LOCK_MINUTES * 60 * 1000;
/** Évite une écriture D1 à chaque requête : l'activité est enregistrée au plus une fois par minute. */
const TOUCH_INTERVAL_MS = 60 * 1000;

export interface SessionContext {
  id: string;
  ownerId: string;
  kind: SessionKind;
  pinEnabled: boolean;
  locked: boolean;
}

function ttlFor(kind: SessionKind): number {
  return kind === 'recovery' ? RECOVERY_TTL_MS : FULL_TTL_MS;
}

/** Crée une session et pose le cookie. Une session issue d'une passkey ou du PIN est déverrouillée. */
export async function createSession(c: Context<AppEnv>, ownerId: string, kind: SessionKind): Promise<void> {
  const token = randomToken();
  const now = Date.now();
  const ttl = ttlFor(kind);
  await c
    .get('db')
    .insert(schema.session)
    .values({
      id: await sha256(token),
      ownerId,
      kind,
      createdAt: now,
      expiresAt: now + ttl,
      lastSeenAt: now,
      unlockedAt: now,
      userAgent: (c.req.header('user-agent') ?? '').slice(0, 160) || null,
    });
  setCookie(c, COOKIE_NAME, token, {
    prefix: 'host',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: Math.floor(ttl / 1000),
  });
}

/** Remplace la session courante par une nouvelle (nouveau jeton), par exemple après un déverrouillage. */
export async function rotateSession(c: Context<AppEnv>): Promise<void> {
  const current = c.get('session');
  await c.get('db').delete(schema.session).where(eq(schema.session.id, current.id));
  await createSession(c, current.ownerId, current.kind);
}

export async function destroySession(c: Context<AppEnv>, sessionId: string): Promise<void> {
  await c.get('db').delete(schema.session).where(eq(schema.session.id, sessionId));
  deleteCookie(c, COOKIE_NAME, { prefix: 'host', path: '/', secure: true });
}

export async function revokeAllSessions(c: Context<AppEnv>, ownerId: string, exceptId?: string): Promise<void> {
  const db = c.get('db');
  const condition = exceptId
    ? and(eq(schema.session.ownerId, ownerId), ne(schema.session.id, exceptId))
    : eq(schema.session.ownerId, ownerId);
  await db.delete(schema.session).where(condition);
}

/**
 * Charge la session à partir du cookie. Une session complète est verrouillée si un PIN
 * est défini et que le propriétaire n'a rien fait depuis IDLE_LOCK_MINUTES.
 */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE_NAME, 'host');
  if (!token) throw apiError(401, 'unauthenticated', 'Connexion requise.');

  const db = c.get('db');
  const id = await sha256(token);
  const row = await db.query.session.findFirst({ where: eq(schema.session.id, id) });
  const now = Date.now();
  if (!row || row.expiresAt <= now) {
    if (row) await db.delete(schema.session).where(eq(schema.session.id, id));
    deleteCookie(c, COOKIE_NAME, { prefix: 'host', path: '/', secure: true });
    throw apiError(401, 'unauthenticated', 'Session expirée, reconnecte-toi.');
  }

  const pinRow = await db.query.pin.findFirst({
    where: eq(schema.pin.ownerId, row.ownerId),
    columns: { ownerId: true },
  });
  const pinEnabled = Boolean(pinRow);

  let locked = false;
  if (row.kind === 'full' && pinEnabled) {
    const idle = now - row.lastSeenAt > IDLE_MS;
    locked = row.unlockedAt === null || idle;
    if (idle && row.unlockedAt !== null) {
      await db.update(schema.session).set({ unlockedAt: null }).where(eq(schema.session.id, id));
    }
  }

  if (!locked && now - row.lastSeenAt > TOUCH_INTERVAL_MS) {
    await db.update(schema.session).set({ lastSeenAt: now }).where(eq(schema.session.id, id));
  }

  c.set('session', { id, ownerId: row.ownerId, kind: row.kind, pinEnabled, locked });
  await next();
};

/** Refuse les sessions de récupération (elles ne servent qu'à enregistrer une nouvelle passkey). */
export const requireFullSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('session').kind !== 'full') {
    throw apiError(403, 'recovery_session', 'Ajoute d’abord une nouvelle passkey pour retrouver l’accès complet.');
  }
  await next();
};

/** Refuse l'accès tant que le PIN n'a pas été saisi. */
export const requireUnlocked: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('session').locked) throw apiError(423, 'locked', 'Saisis ton PIN pour déverrouiller EKO.');
  await next();
};
