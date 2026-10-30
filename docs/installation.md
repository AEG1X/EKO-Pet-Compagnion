# Installation locale

Prérequis : Node.js 22 et pnpm 10 (`corepack enable`).

```sh
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # puis remplir les deux valeurs
pnpm --filter @eko/worker db:migrate:local               # crée la base D1 locale
pnpm dev                                                 # http://localhost:8787
```

Ouvre **http://localhost:8787** (et non 127.0.0.1 : les passkeys sont liées au nom de domaine `localhost`).
Au premier lancement, EKO demande ton prénom et le `SETUP_TOKEN` défini dans `.dev.vars`, puis crée ta passkey.

## Développement du front avec rechargement à chaud

Lance l'API dans un terminal (`pnpm --filter @eko/worker dev`) et Vite dans un autre (`pnpm dev:web`).
Vite redirige `/api` vers le Worker ; ajoute alors `ORIGIN=http://localhost:5173` dans `.dev.vars`, sinon la protection CSRF refuse les requêtes.

## Tests

- `pnpm test` lance les tests du paquet partagé, du front et du Worker.
- Les tests du Worker tournent dans le vrai moteur Workers (Miniflare) avec une base D1 vierge à chaque test, et un authentificateur WebAuthn simulé pour tester les passkeys de bout en bout.

## Base de données

Le schéma est dans `apps/worker/src/db/schema.ts`. Après une modification :

```sh
pnpm --filter @eko/worker db:generate   # crée une nouvelle migration SQL versionnée
pnpm --filter @eko/worker db:migrate:local
```

Les migrations ne sont jamais modifiées après leur fusion : on en ajoute une nouvelle.
