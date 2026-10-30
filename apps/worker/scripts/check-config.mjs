// Vérifie qu'un environnement de wrangler.jsonc est entièrement renseigné avant un déploiement.
// Usage : node scripts/check-config.mjs staging|production
import { readFileSync } from 'node:fs';

const target = process.argv[2];
if (!['staging', 'production'].includes(target)) {
  console.error('Usage : node scripts/check-config.mjs staging|production');
  process.exit(2);
}
const source = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  // Retire les commentaires // en dehors des chaînes (le fichier n'en contient pas dans les valeurs).
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/,(\s*[}\]])/g, '$1');
const config = JSON.parse(source);
const env = config.env?.[target];
const problems = [];
if (!env) problems.push(`environnement « ${target} » absent`);
else {
  const text = JSON.stringify(env);
  if (text.includes('REMPLACER_PAR')) problems.push('des valeurs « REMPLACER_PAR… » restent à renseigner');
  if (!env.vars?.ORIGIN?.startsWith('https://')) problems.push('ORIGIN doit commencer par https://');
  if (env.vars && new URL(env.vars.ORIGIN).hostname !== env.vars.RP_ID) problems.push('RP_ID doit être le domaine de ORIGIN');
}
if (problems.length) {
  console.error(`Configuration ${target} incomplète :\n- ${problems.join('\n- ')}\nVoir docs/deploiement.md.`);
  process.exit(1);
}
console.log(`Configuration ${target} complète.`);
