// Vide entièrement l'environnement de test : toutes les données D1 (le schéma et l'historique
// des migrations sont gardés) et les fichiers R2 référencés. Ne vise QUE staging : la base,
// le bucket et l'environnement sont écrits en dur, aucun argument ne permet de viser la production.
// Usage (depuis apps/worker, avec CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID) :
//   node scripts/reset-staging.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENV = 'staging';
const BUCKET = 'eko-files-staging';

function wrangler(args) {
  return execFileSync('pnpm', ['exec', 'wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function query(sql) {
  const out = wrangler(['d1', 'execute', 'DB', '--remote', '--env', ENV, '--json', '--command', sql]);
  return JSON.parse(out)[0].results;
}

const quote = (name) => `"${name.replaceAll('"', '""')}"`;

const tables = query(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
).map((r) => r.name);
const keys = tables.includes('stored_file') ? query('SELECT r2_key FROM stored_file').map((r) => r.r2_key) : [];

console.log(`Fichiers R2 à supprimer : ${keys.length}`);
for (const key of keys) {
  try {
    wrangler(['r2', 'object', 'delete', `${BUCKET}/${key}`, '--remote']);
  } catch {
    console.warn(`Fichier déjà absent ou illisible : ${key}`);
  }
}

console.log(`Tables vidées : ${tables.join(', ')}`);
const file = join(mkdtempSync(join(tmpdir(), 'eko-reset-')), 'reset.sql');
writeFileSync(file, ['PRAGMA defer_foreign_keys = on;', ...tables.map((t) => `DELETE FROM ${quote(t)};`)].join('\n'));
wrangler(['d1', 'execute', 'DB', '--remote', '--env', ENV, '--file', file]);

const total = query(`SELECT ${tables.map((t) => `(SELECT COUNT(*) FROM ${quote(t)})`).join(' + ')} AS n`)[0].n;
if (total !== 0) {
  console.error(`Il reste ${total} ligne(s) : réinitialisation incomplète.`);
  process.exit(1);
}
console.log('Staging est vide : ouvre https://staging.eko-companion.fr pour le configurer de nouveau.');
