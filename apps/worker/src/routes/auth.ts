import { recoveryLoginSchema, setupStartSchema, unlockSchema } from '@eko/shared';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { checkPin } from '../auth/pin';
import { consumeRecoveryCode, regenerateRecoveryCodes } from '../auth/recovery';
import { createSession, destroySession, loadSession, revokeAllSessions, rotateSession } from '../auth/session';
import {
  consumeChallenge,
  finishAuthentication,
  finishRegistration,
  startAuthentication,
  startRegistration,
} from '../auth/webauthn';
import { schema } from '../db/client';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { fromBase64Url, randomBytes, randomId, timingSafeEqual, toBase64Url } from '../lib/crypto';
import { apiError } from '../lib/errors';
import { DEFAULT_SETTINGS, writeSettings } from '../lib/settings';
import { readJson } from '../lib/validate';
import { RATE_LIMITS, enforceRateLimit } from '../security/rateLimit';

const verifySchema = z.object({
  challengeId: z.string().min(1).max(64),
  response: z.record(z.string(), z.unknown()),
});

/**
 * La configuration est ouverte tant qu'aucune passkey n'existe. Cela couvre la toute première
 * installation et la procédure d'urgence (docs/securite.md) : effacer les passkeys en ligne de
 * commande rouvre la configuration sans toucher aux données d'Eko.
 */
async function isConfigured(c: { get: (k: 'db') => AppEnv['Variables']['db'] }): Promise<boolean> {
  const row = await c.get('db').query.passkey.findFirst({ columns: { id: true } });
  return Boolean(row);
}

export const authRoutes = new Hono<AppEnv>()
  // --- Première configuration : réservée à celui qui connaît SETUP_TOKEN, et une seule fois.
  .get('/setup/status', async (c) => c.json({ needsSetup: !(await isConfigured(c)) }))

  .post('/setup/options', async (c) => {
    await enforceRateLimit(c, RATE_LIMITS.setup);
    const { setupToken, displayName } = await readJson(c, setupStartSchema);
    const expected = c.env.SETUP_TOKEN;
    if (!expected || expected.length < 16 || !timingSafeEqual(setupToken, expected)) {
      throw apiError(403, 'setup_forbidden', 'Jeton de configuration invalide.');
    }
    if (await isConfigured(c)) throw apiError(409, 'already_setup', 'EKO est déjà configuré.');
    const webauthnUserId = toBase64Url(randomBytes(32));
    return c.json(
      await startRegistration(c, 'setup', { ownerId: null, webauthnUserId, displayName }, [], {
        displayName,
        webauthnUserId,
      }),
    );
  })

  .post('/setup/verify', async (c) => {
    await enforceRateLimit(c, RATE_LIMITS.setup);
    const { challengeId, response } = await readJson(c, verifySchema);
    const challenge = await consumeChallenge(c, challengeId, 'setup');
    if (await isConfigured(c)) throw apiError(409, 'already_setup', 'EKO est déjà configuré.');
    const { displayName, webauthnUserId } = JSON.parse(challenge.payload ?? '{}') as {
      displayName: string;
      webauthnUserId: string;
    };
    const info = await finishRegistration(c, challenge.challenge, response);
    const db = c.get('db');
    const existing = await db.query.owner.findFirst();
    const ownerId = existing?.id ?? randomId();
    const now = Date.now();
    await db.batch([
      existing
        ? db.update(schema.owner).set({ displayName, webauthnUserId }).where(eq(schema.owner.id, ownerId))
        : db.insert(schema.owner).values({ id: ownerId, displayName, webauthnUserId, createdAt: now }),
      db.insert(schema.passkey).values({
        id: info.credential.id,
        ownerId,
        publicKey: toBase64Url(info.credential.publicKey),
        counter: info.credential.counter,
        transports: info.credential.transports ? JSON.stringify(info.credential.transports) : null,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        label: 'Premier appareil',
        createdAt: now,
      }),
    ]);
    if (!existing) await writeSettings(db, ownerId, DEFAULT_SETTINGS);
    await revokeAllSessions(c, ownerId);
    const recoveryCodes = await regenerateRecoveryCodes(c, ownerId);
    await createSession(c, ownerId, 'full');
    await audit(db, 'setup_completed');
    return c.json({ recoveryCodes });
  })

  // --- Connexion par passkey
  .post('/login/options', async (c) => {
    await enforceRateLimit(c, RATE_LIMITS.login);
    return c.json(await startAuthentication(c));
  })

  .post('/login/verify', async (c) => {
    await enforceRateLimit(c, RATE_LIMITS.login);
    const { challengeId, response } = await readJson(c, verifySchema);
    const challenge = await consumeChallenge(c, challengeId, 'login');
    const db = c.get('db');
    const credentialId = typeof response.id === 'string' ? response.id : '';
    const stored = await db.query.passkey.findFirst({ where: eq(schema.passkey.id, credentialId) });
    if (!stored) {
      await audit(db, 'login_failed', 'passkey inconnue');
      throw apiError(401, 'login_failed', 'Cette passkey n’est pas reconnue.');
    }
    const info = await finishAuthentication(c, challenge.challenge, response as unknown as AuthenticationResponseJSON, {
      id: stored.id,
      publicKey: fromBase64Url(stored.publicKey),
      counter: stored.counter,
      ...(stored.transports ? { transports: JSON.parse(stored.transports) as string[] } : {}),
    });
    if (!info) {
      await audit(db, 'login_failed', 'signature refusée');
      throw apiError(401, 'login_failed', 'La connexion a échoué.');
    }
    await db
      .update(schema.passkey)
      .set({ counter: info.newCounter, lastUsedAt: Date.now() })
      .where(eq(schema.passkey.id, stored.id));
    await createSession(c, stored.ownerId, 'full');
    await audit(db, 'login', stored.label);
    return c.json({ ok: true });
  })

  // --- Code de secours : ouvre une session limitée qui sert uniquement à enregistrer une nouvelle passkey.
  .post('/recovery', async (c) => {
    await enforceRateLimit(c, RATE_LIMITS.recovery);
    const { code } = await readJson(c, recoveryLoginSchema);
    const ownerId = await consumeRecoveryCode(c, code);
    const db = c.get('db');
    if (!ownerId) {
      await audit(db, 'recovery_failed');
      throw apiError(401, 'recovery_failed', 'Code de secours invalide ou déjà utilisé.');
    }
    await createSession(c, ownerId, 'recovery');
    await audit(db, 'recovery_used');
    return c.json({ ok: true });
  })

  // --- Routes qui exigent une session
  .use('/logout', loadSession)
  .post('/logout', async (c) => {
    await destroySession(c, c.get('session').id);
    await audit(c.get('db'), 'logout');
    return c.json({ ok: true });
  })

  .use('/lock', loadSession)
  .post('/lock', async (c) => {
    await c
      .get('db')
      .update(schema.session)
      .set({ unlockedAt: null })
      .where(eq(schema.session.id, c.get('session').id));
    return c.json({ ok: true });
  })

  .use('/unlock', loadSession)
  .post('/unlock', async (c) => {
    await enforceRateLimit(c, RATE_LIMITS.unlock);
    const session = c.get('session');
    if (session.kind !== 'full') throw apiError(403, 'recovery_session', 'Action impossible avec un code de secours.');
    const { pin } = await readJson(c, unlockSchema);
    const db = c.get('db');
    const result = await checkPin(c, session.ownerId, pin);
    if (result.ok) {
      await rotateSession(c);
      return c.json({ ok: true });
    }
    switch (result.reason) {
      case 'not_set':
        throw apiError(400, 'pin_not_set', 'Aucun PIN n’est défini.');
      case 'locked':
        await audit(db, 'pin_lockout');
        throw apiError(423, 'pin_locked', 'Trop d’erreurs. Réessaie plus tard ou utilise ta passkey.', {
          'Retry-After': String(Math.max(1, Math.ceil((result.retryAt - Date.now()) / 1000))),
        });
      case 'revoke':
        await revokeAllSessions(c, session.ownerId);
        await audit(db, 'pin_session_revoked');
        throw apiError(401, 'unauthenticated', 'Trop d’erreurs : reconnecte-toi avec ta passkey.');
      case 'wrong':
        await audit(db, 'pin_failed');
        throw apiError(401, 'pin_wrong', `PIN incorrect. ${result.remaining} essai(s) avant blocage.`);
    }
  });

// Purge des défis et compteurs expirés, appelée par la tâche planifiée.
export async function purgeExpiredAuthData(db: AppEnv['Variables']['db']): Promise<void> {
  const now = Date.now();
  await db.batch([
    db.delete(schema.authChallenge).where(sql`${schema.authChallenge.expiresAt} < ${now}`),
    db.delete(schema.session).where(sql`${schema.session.expiresAt} < ${now}`),
    db.delete(schema.rateLimit).where(sql`${schema.rateLimit.windowStart} < ${now - 24 * 60 * 60 * 1000}`),
  ]);
}
