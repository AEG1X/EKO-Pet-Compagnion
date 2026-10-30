import { type MeResponse, type PasskeySummary, passkeyLabelSchema, setPinSchema, settingsPatchSchema } from '@eko/shared';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { setPin } from '../auth/pin';
import { regenerateRecoveryCodes, remainingRecoveryCodes } from '../auth/recovery';
import { destroySession, loadSession, requireFullSession, requireUnlocked, revokeAllSessions } from '../auth/session';
import { consumeChallenge, finishRegistration, startRegistration } from '../auth/webauthn';
import { schema } from '../db/client';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { toBase64Url } from '../lib/crypto';
import { apiError } from '../lib/errors';
import { readSettings, writeSettings } from '../lib/settings';
import { readJson } from '../lib/validate';

const addPasskeyVerifySchema = z.object({
  challengeId: z.string().min(1).max(64),
  response: z.record(z.string(), z.unknown()),
  label: passkeyLabelSchema.shape.label,
});

export const accountRoutes = new Hono<AppEnv>()
  .use('*', loadSession)

  // Accessible même verrouillé ou en récupération : le front en a besoin pour savoir quoi afficher.
  .get('/me', async (c) => {
    const session = c.get('session');
    const db = c.get('db');
    const owner = await db.query.owner.findFirst({ where: eq(schema.owner.id, session.ownerId) });
    if (!owner) throw apiError(401, 'unauthenticated', 'Compte introuvable.');
    const body: MeResponse = {
      owner: { displayName: owner.displayName },
      sessionKind: session.kind,
      pinEnabled: session.pinEnabled,
      locked: session.locked,
      settings: await readSettings(db, session.ownerId),
    };
    return c.json(body);
  })

  // --- Ajout d'une passkey : autorisé en session complète déverrouillée, ou en session de récupération.
  .post('/passkeys/options', async (c) => {
    const session = c.get('session');
    if (session.kind === 'full' && session.locked) throw apiError(423, 'locked', 'Saisis ton PIN pour continuer.');
    const db = c.get('db');
    const owner = await db.query.owner.findFirst({ where: eq(schema.owner.id, session.ownerId) });
    if (!owner) throw apiError(401, 'unauthenticated', 'Compte introuvable.');
    const existing = await db
      .select({ id: schema.passkey.id })
      .from(schema.passkey)
      .where(eq(schema.passkey.ownerId, owner.id));
    return c.json(
      await startRegistration(
        c,
        'add_passkey',
        { ownerId: owner.id, webauthnUserId: owner.webauthnUserId, displayName: owner.displayName },
        existing.map((p) => p.id),
      ),
    );
  })

  .post('/passkeys/verify', async (c) => {
    const session = c.get('session');
    if (session.kind === 'full' && session.locked) throw apiError(423, 'locked', 'Saisis ton PIN pour continuer.');
    const { challengeId, response, label } = await readJson(c, addPasskeyVerifySchema);
    const challenge = await consumeChallenge(c, challengeId, 'add_passkey');
    if (challenge.ownerId !== session.ownerId) throw apiError(400, 'challenge_expired', 'La demande a expiré.');
    const info = await finishRegistration(c, challenge.challenge, response);
    const db = c.get('db');
    await db.insert(schema.passkey).values({
      id: info.credential.id,
      ownerId: session.ownerId,
      publicKey: toBase64Url(info.credential.publicKey),
      counter: info.credential.counter,
      transports: info.credential.transports ? JSON.stringify(info.credential.transports) : null,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      label,
      createdAt: Date.now(),
    });
    await audit(db, 'passkey_added', label);
    if (session.kind === 'recovery') {
      // Après une récupération, on suppose l'ancien appareil perdu : toutes les sessions sont fermées
      // et il faut se reconnecter avec la nouvelle passkey.
      await revokeAllSessions(c, session.ownerId);
      await destroySession(c, session.id);
      await audit(db, 'sessions_revoked', 'après récupération');
      return c.json({ ok: true, reloginRequired: true });
    }
    return c.json({ ok: true, reloginRequired: false });
  })

  // --- Tout le reste exige une session complète et déverrouillée.
  .use('*', requireFullSession, requireUnlocked)

  .get('/settings', async (c) => c.json(await readSettings(c.get('db'), c.get('session').ownerId)))

  .patch('/settings', async (c) => {
    const patch = await readJson(c, settingsPatchSchema);
    const db = c.get('db');
    const ownerId = c.get('session').ownerId;
    const next = { ...(await readSettings(db, ownerId)), ...patch };
    await writeSettings(db, ownerId, next);
    return c.json(next);
  })

  .put('/pin', async (c) => {
    const { pin } = await readJson(c, setPinSchema);
    await setPin(c, c.get('session').ownerId, pin);
    await audit(c.get('db'), 'pin_set');
    return c.json({ ok: true });
  })

  .get('/passkeys', async (c) => {
    const rows = await c
      .get('db')
      .select()
      .from(schema.passkey)
      .where(eq(schema.passkey.ownerId, c.get('session').ownerId))
      .orderBy(desc(schema.passkey.createdAt));
    const body: PasskeySummary[] = rows.map((p) => ({
      id: p.id,
      label: p.label,
      createdAt: new Date(p.createdAt).toISOString(),
      lastUsedAt: p.lastUsedAt ? new Date(p.lastUsedAt).toISOString() : null,
    }));
    return c.json(body);
  })

  .delete('/passkeys/:id', async (c) => {
    const ownerId = c.get('session').ownerId;
    const db = c.get('db');
    const all = await db
      .select({ id: schema.passkey.id, label: schema.passkey.label })
      .from(schema.passkey)
      .where(eq(schema.passkey.ownerId, ownerId));
    const target = all.find((p) => p.id === c.req.param('id'));
    if (!target) throw apiError(404, 'not_found', 'Passkey introuvable.');
    if (all.length <= 1) throw apiError(409, 'last_passkey', 'Impossible de supprimer ta dernière passkey.');
    await db.delete(schema.passkey).where(and(eq(schema.passkey.id, target.id), eq(schema.passkey.ownerId, ownerId)));
    await audit(db, 'passkey_removed', target.label);
    return c.json({ ok: true });
  })

  .get('/recovery-codes', async (c) => c.json({ remaining: await remainingRecoveryCodes(c, c.get('session').ownerId) }))

  .post('/recovery-codes/regenerate', async (c) => {
    const codes = await regenerateRecoveryCodes(c, c.get('session').ownerId);
    await audit(c.get('db'), 'recovery_codes_regenerated');
    return c.json({ recoveryCodes: codes });
  })

  .post('/sessions/revoke-others', async (c) => {
    const session = c.get('session');
    await revokeAllSessions(c, session.ownerId, session.id);
    await audit(c.get('db'), 'sessions_revoked', 'autres appareils');
    return c.json({ ok: true });
  });
