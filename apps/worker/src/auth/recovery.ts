import { SECURITY, formatRecoveryCode } from '@eko/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { Context } from 'hono';
import { schema } from '../db/client';
import type { AppEnv } from '../env';
import { randomId, randomRecoveryCode, sha256 } from '../lib/crypto';

/**
 * Génère un nouveau jeu de codes de secours et invalide les précédents.
 * Les codes (60 bits aléatoires chacun) ne sont stockés que sous forme d'empreinte SHA-256.
 */
export async function regenerateRecoveryCodes(c: Context<AppEnv>, ownerId: string): Promise<string[]> {
  const db = c.get('db');
  const codes = Array.from({ length: SECURITY.RECOVERY_CODE_COUNT }, () => randomRecoveryCode());
  const now = Date.now();
  const rows = await Promise.all(
    codes.map(async (code) => ({ id: randomId(), ownerId, codeHash: await sha256(code), createdAt: now })),
  );
  await db.batch([
    db.delete(schema.recoveryCode).where(eq(schema.recoveryCode.ownerId, ownerId)),
    db.insert(schema.recoveryCode).values(rows),
  ]);
  return codes.map(formatRecoveryCode);
}

/** Consomme un code de secours valide et renvoie le propriétaire, ou null. */
export async function consumeRecoveryCode(c: Context<AppEnv>, normalizedCode: string): Promise<string | null> {
  const [row] = await c
    .get('db')
    .update(schema.recoveryCode)
    .set({ usedAt: Date.now() })
    .where(and(eq(schema.recoveryCode.codeHash, await sha256(normalizedCode)), isNull(schema.recoveryCode.usedAt)))
    .returning({ ownerId: schema.recoveryCode.ownerId });
  return row?.ownerId ?? null;
}

export async function remainingRecoveryCodes(c: Context<AppEnv>, ownerId: string): Promise<number> {
  const rows = await c
    .get('db')
    .select({ id: schema.recoveryCode.id })
    .from(schema.recoveryCode)
    .where(and(eq(schema.recoveryCode.ownerId, ownerId), isNull(schema.recoveryCode.usedAt)));
  return rows.length;
}
