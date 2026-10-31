import type { Db } from '../db/client';
import { schema } from '../db/client';
import { randomId } from './crypto';

export type AuditEvent =
  | 'setup_completed'
  | 'login'
  | 'login_failed'
  | 'recovery_used'
  | 'recovery_failed'
  | 'recovery_codes_regenerated'
  | 'pin_set'
  | 'pin_failed'
  | 'pin_lockout'
  | 'pin_session_revoked'
  | 'passkey_added'
  | 'passkey_removed'
  | 'sessions_revoked'
  | 'logout'
  | 'backup_exported';

/** Journal d'événements de sécurité. Le détail ne doit jamais contenir de secret ni d'IP. */
export async function audit(db: Db, event: AuditEvent, detail?: string): Promise<void> {
  await db.insert(schema.auditLog).values({ id: randomId(), at: Date.now(), event, detail: detail ?? null });
}
