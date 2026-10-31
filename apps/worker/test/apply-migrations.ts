import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Toutes les tables applicatives, y compris celles ajoutées par les migrations suivantes.
const { results } = await env.DB.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
).all<{ name: string }>();
const TABLES = results.map((r) => r.name);

// Chaque test part d'une base vide (le lot est une transaction : les clés étrangères sont vérifiées à la fin).
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('PRAGMA defer_foreign_keys = on'),
    ...TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  ]);
});
