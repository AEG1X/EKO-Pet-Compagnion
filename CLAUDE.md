# EKO — consignes pour les contributions assistées

- Langue : interface, messages d'erreur, commentaires et documentation en français.
- Développement par phases validées par Johan (voir README, tableau « Avancement ») : ne pas anticiper une phase non validée.
- Objectif 0 € de cloud : n'ajouter aucun service payant ni facturation à l'usage sans accord explicite.
- Toute route `/api` privée passe par `loadSession`, puis `requireFullSession` et `requireUnlocked`. Ajouter un test d'accès refusé pour chaque nouvelle route.
- Schéma D1 : modifier `apps/worker/src/db/schema.ts` puis `pnpm --filter @eko/worker db:generate` ; ne jamais modifier une migration fusionnée.
- Validation des entrées avec les schémas Zod de `packages/shared`, partagés avec le front.
- CSP stricte : pas de script ni de style inline dans le HTML, pas de ressource externe (polices auto-hébergées).
- Avant une pull request : `pnpm check`.
