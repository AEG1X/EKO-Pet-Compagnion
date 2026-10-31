import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { schema } from '../db/client';
import type { AppEnv } from '../env';
import { hmacSha256 } from '../lib/crypto';
import { apiError } from '../lib/errors';

export interface RateLimitRule {
  /** Nom de la règle, par exemple « login ». */
  scope: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  setup: { scope: 'setup', limit: 5, windowSeconds: 3600 },
  login: { scope: 'login', limit: 20, windowSeconds: 900 },
  recovery: { scope: 'recovery', limit: 5, windowSeconds: 3600 },
  unlock: { scope: 'unlock', limit: 20, windowSeconds: 900 },
  // Une sauvegarde complète : un export SQL et quelques fichiers nouveaux.
  backup: { scope: 'backup', limit: 300, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>;

/**
 * Empreinte de l'adresse IP : HMAC avec un sel qui change chaque jour, pour
 * limiter le débit sans jamais stocker d'adresse IP exploitable.
 */
export async function clientFingerprint(c: Context<AppEnv>): Promise<string> {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const day = new Date().toISOString().slice(0, 10);
  return (await hmacSha256(c.env.PIN_PEPPER, `${day}:${ip}`)).slice(0, 22);
}

/** Compteur à fenêtre fixe dans D1. Lève une erreur 429 au-delà de la limite. */
export async function enforceRateLimit(c: Context<AppEnv>, rule: RateLimitRule): Promise<void> {
  const db = c.get('db');
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = now - (now % windowMs);
  const key = `${rule.scope}:${await clientFingerprint(c)}`;

  const [row] = await db
    .insert(schema.rateLimit)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: schema.rateLimit.key,
      set: {
        count: sql`CASE WHEN ${schema.rateLimit.windowStart} = ${windowStart} THEN ${schema.rateLimit.count} + 1 ELSE 1 END`,
        windowStart: sql`${windowStart}`,
      },
    })
    .returning({ count: schema.rateLimit.count });

  if ((row?.count ?? 0) > rule.limit) {
    const retryAfter = Math.ceil((windowStart + windowMs - now) / 1000);
    throw apiError(429, 'rate_limited', 'Trop de tentatives. Réessaie un peu plus tard.', {
      'Retry-After': String(retryAfter),
    });
  }
}
