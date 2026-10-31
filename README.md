# EKO — Pet Companion

Application web progressive (PWA) personnelle pour gérer toute la vie d'Eko : santé, quotidien, souvenirs et médaille connectée.
Elle fonctionne sur iPhone, Android, Mac et Windows, et vise un coût d'hébergement de 0 €/mois sur Cloudflare.

## Architecture

Un seul Worker Cloudflare sert l'application React, l'API et, plus tard, la fiche publique de la médaille.
Toutes les données passent par ce Worker, qui vérifie l'autorisation avant tout accès à D1 (base de données) et, plus tard, à R2 (fichiers).

```
apps/web        Application React + Vite + PWA (palette « Forêt », thèmes clair/sombre)
apps/worker     Worker Cloudflare : API Hono, authentification, migrations D1, tests
packages/shared Règles et schémas de validation partagés (Zod)
docs/           Installation, déploiement, sécurité, journal des décisions
```

## Commandes

| Commande | Rôle |
| --- | --- |
| `pnpm install` | Installe les dépendances |
| `pnpm dev` | Construit le front puis lance l'application complète sur http://localhost:8787 |
| `pnpm check` | Types, tests et construction : à lancer avant chaque pull request |
| `pnpm test` | Tous les tests automatisés |

## Documentation

- [Installation locale](docs/installation.md)
- [Déploiement sur Cloudflare](docs/deploiement.md)
- [Sécurité et procédure d'urgence](docs/securite.md)
- [Sauvegarde et restauration](docs/sauvegarde.md)
- [Journal des décisions](docs/decisions/)

## Avancement

| Phase | Contenu | État |
| --- | --- | --- |
| A1 | Socle : passkeys, PIN, sessions, sécurité, design system, navigation, PWA, CI | Terminée (30/10/2026) |
| A2 | Profil, santé, quotidien, documents, rappels, calendrier, sauvegardes D1 | Prête à valider (étapes 1 à 6 livrées en PR #4 à #10) |
| C | Médaille NFC/QR, fiche publique, mode perdu | Prête à valider : fiche publique et QR (PR #13), mode perdu (PR #14) |
| B | Souvenirs : photos, vidéos, albums, partage | À venir |
| D | Enrichissements | À venir |
