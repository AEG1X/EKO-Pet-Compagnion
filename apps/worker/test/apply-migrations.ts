import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

const TABLES = ['session', 'passkey', 'recovery_code', 'pin', 'settings', 'auth_challenge', 'rate_limit', 'audit_log', 'owner'];

// Chaque test part d'une base vide.
beforeEach(async () => {
  await env.DB.batch(TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
});
