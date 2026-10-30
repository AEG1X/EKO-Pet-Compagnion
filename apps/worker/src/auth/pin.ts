import { SECURITY } from '@eko/shared';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { schema } from '../db/client';
import type { AppEnv } from '../env';
import { hmacSha256, randomBytes, timingSafeEqual, toBase64Url } from '../lib/crypto';

/**
 * Le PIN (6 chiffres) est protégé par HMAC-SHA256 avec un sel propre et une clé
 * secrète du Worker (PIN_PEPPER). Un hachage lent n'est pas possible dans la limite
 * de 10 ms CPU ; la sécurité repose sur la clé secrète et le blocage après 5 erreurs.
 */
async function hashPin(pepper: string, salt: string, value: string): Promise<string> {
  return hmacSha256(pepper, `${salt}:${value}`);
}

export async function setPin(c: Context<AppEnv>, ownerId: string, value: string): Promise<void> {
  const salt = toBase64Url(randomBytes(16));
  const hash = await hashPin(c.env.PIN_PEPPER, salt, value);
  const now = Date.now();
  await c
    .get('db')
    .insert(schema.pin)
    .values({ ownerId, hash, salt, failedCount: 0, lockedUntil: null, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.pin.ownerId,
      set: { hash, salt, failedCount: 0, lockedUntil: null, updatedAt: now },
    });
}

export type PinCheck =
  | { ok: true }
  | { ok: false; reason: 'locked'; retryAt: number }
  | { ok: false; reason: 'wrong'; remaining: number; retryAt?: number }
  | { ok: false; reason: 'revoke' }
  | { ok: false; reason: 'not_set' };

export async function checkPin(c: Context<AppEnv>, ownerId: string, value: string): Promise<PinCheck> {
  const db = c.get('db');
  const row = await db.query.pin.findFirst({ where: eq(schema.pin.ownerId, ownerId) });
  if (!row) return { ok: false, reason: 'not_set' };
  const now = Date.now();
  if (row.lockedUntil && row.lockedUntil > now) return { ok: false, reason: 'locked', retryAt: row.lockedUntil };

  const candidate = await hashPin(c.env.PIN_PEPPER, row.salt, value);
  if (timingSafeEqual(candidate, row.hash)) {
    await db.update(schema.pin).set({ failedCount: 0, lockedUntil: null }).where(eq(schema.pin.ownerId, ownerId));
    return { ok: true };
  }

  const failedCount = row.failedCount + 1;
  if (failedCount >= SECURITY.PIN_REVOKE_AFTER) {
    // Trop d'erreurs : les sessions sont révoquées, il faudra se reconnecter avec une passkey.
    await db.update(schema.pin).set({ failedCount: 0, lockedUntil: null }).where(eq(schema.pin.ownerId, ownerId));
    return { ok: false, reason: 'revoke' };
  }
  const lockedUntil =
    failedCount % SECURITY.PIN_MAX_ATTEMPTS === 0 ? now + SECURITY.PIN_LOCKOUT_MINUTES * 60 * 1000 : null;
  await db.update(schema.pin).set({ failedCount, lockedUntil }).where(eq(schema.pin.ownerId, ownerId));
  const remaining = SECURITY.PIN_MAX_ATTEMPTS - (failedCount % SECURITY.PIN_MAX_ATTEMPTS);
  return lockedUntil
    ? { ok: false, reason: 'locked', retryAt: lockedUntil }
    : { ok: false, reason: 'wrong', remaining };
}
