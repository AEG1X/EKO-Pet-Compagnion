import { SECURITY } from '@eko/shared';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { and, eq, gt } from 'drizzle-orm';
import type { Context } from 'hono';
import { schema } from '../db/client';
import type { AppEnv } from '../env';
import { fromBase64Url, randomId } from '../lib/crypto';
import { apiError } from '../lib/errors';

type Purpose = (typeof schema.authChallenge.$inferSelect)['purpose'];

/** Enregistre un défi à usage unique et renvoie son identifiant. */
async function storeChallenge(
  c: Context<AppEnv>,
  purpose: Purpose,
  challenge: string,
  ownerId: string | null,
  payload?: unknown,
): Promise<string> {
  const id = randomId();
  await c
    .get('db')
    .insert(schema.authChallenge)
    .values({
      id,
      purpose,
      challenge,
      ownerId,
      payload: payload === undefined ? null : JSON.stringify(payload),
      expiresAt: Date.now() + SECURITY.CHALLENGE_TTL_SECONDS * 1000,
    });
  return id;
}

/** Consomme un défi : il est supprimé quel que soit le résultat de la vérification. */
export async function consumeChallenge(c: Context<AppEnv>, id: string, purpose: Purpose) {
  const db = c.get('db');
  const [row] = await db
    .delete(schema.authChallenge)
    .where(
      and(
        eq(schema.authChallenge.id, id),
        eq(schema.authChallenge.purpose, purpose),
        gt(schema.authChallenge.expiresAt, Date.now()),
      ),
    )
    .returning();
  if (!row) throw apiError(400, 'challenge_expired', 'La demande a expiré, recommence.');
  return row;
}

export async function startRegistration(
  c: Context<AppEnv>,
  purpose: 'setup' | 'add_passkey',
  user: { ownerId: string | null; webauthnUserId: string; displayName: string },
  excludeIds: string[],
  payload?: unknown,
) {
  const options = await generateRegistrationOptions({
    rpName: c.env.RP_NAME,
    rpID: c.env.RP_ID,
    userName: user.displayName,
    userDisplayName: user.displayName,
    userID: fromBase64Url(user.webauthnUserId),
    attestationType: 'none',
    excludeCredentials: excludeIds.map((id) => ({ id })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    timeout: SECURITY.CHALLENGE_TTL_SECONDS * 1000,
  });
  const challengeId = await storeChallenge(c, purpose, options.challenge, user.ownerId, payload);
  return { challengeId, options };
}

export async function finishRegistration(c: Context<AppEnv>, expectedChallenge: string, response: unknown) {
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: c.env.ORIGIN,
      expectedRPID: c.env.RP_ID,
      requireUserVerification: true,
    });
  } catch {
    throw apiError(400, 'passkey_invalid', 'La passkey n’a pas pu être vérifiée.');
  }
  if (!verification.verified) throw apiError(400, 'passkey_invalid', 'La passkey n’a pas pu être vérifiée.');
  return verification.registrationInfo;
}

export async function startAuthentication(c: Context<AppEnv>) {
  // Passkeys découvrables : pas de liste d'identifiants, l'appareil propose la bonne clé.
  const options = await generateAuthenticationOptions({
    rpID: c.env.RP_ID,
    userVerification: 'required',
    timeout: SECURITY.CHALLENGE_TTL_SECONDS * 1000,
  });
  const challengeId = await storeChallenge(c, 'login', options.challenge, null);
  return { challengeId, options };
}

export async function finishAuthentication(
  c: Context<AppEnv>,
  expectedChallenge: string,
  response: AuthenticationResponseJSON,
  credential: { id: string; publicKey: Uint8Array<ArrayBuffer>; counter: number; transports?: string[] },
) {
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: c.env.ORIGIN,
      expectedRPID: c.env.RP_ID,
      credential,
      requireUserVerification: true,
    });
  } catch {
    return null;
  }
  return verification.verified ? verification.authenticationInfo : null;
}
