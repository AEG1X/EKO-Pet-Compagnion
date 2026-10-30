# Déploiement sur Cloudflare

Le déploiement se lance **à la main** depuis GitHub (onglet Actions › « Déploiement » › Run workflow), d'abord en `staging`, puis en `production`.
Les tests tournent avant chaque déploiement ; un échec bloque tout.

## 1. Une seule fois : préparer Cloudflare

1. **Bases D1** : `eko-staging` et `eko-prod` (créées le 30/10/2026, Europe de l'Ouest), leurs identifiants sont dans `apps/worker/wrangler.jsonc`.
2. **Domaine** : `eko-companion.fr` (acheté chez OVH le 30/10/2026, échéance octobre 2029, renouvellement automatique à activer).
   Dans Cloudflare, Ajouter un domaine › `eko-companion.fr` › offre Free, puis remplace chez OVH les serveurs DNS par les deux serveurs
   indiqués par Cloudflare (désactive d'abord DNSSEC chez OVH ; on le réactive ensuite côté Cloudflare).
   Le Worker se rattache tout seul au domaine au déploiement : `eko-companion.fr` en production, `staging.eko-companion.fr` en test
   (clés `routes` de `wrangler.jsonc`). Attention : changer de domaine plus tard invalide les passkeys et le QR de la médaille.
3. **Jeton d'API** : Mon profil › Jetons d'API › Créer un jeton, modèle « Modifier les Workers Cloudflare », en ajoutant les permissions
   **Compte › D1 › Modifier** et **Zone › DNS › Modifier** (pour rattacher le domaine). Limite-le à ton compte et à la zone `eko-companion.fr`.
4. **Secrets GitHub** : dans le dépôt, Settings › Secrets and variables › Actions, ajoute `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`
   (l'identifiant de compte est affiché dans la colonne de droite de la page d'accueil Cloudflare).

## 2. Une seule fois par environnement : les secrets du Worker

Après le premier déploiement (qui crée le Worker), définis ses deux secrets.
Depuis un terminal connecté avec `pnpm exec wrangler login`, dans `apps/worker` :

```sh
openssl rand -base64 32 | pnpm exec wrangler secret put PIN_PEPPER --env staging
openssl rand -base64 24 | pnpm exec wrangler secret put SETUP_TOKEN --env staging
```

Note le `SETUP_TOKEN` : il sert une seule fois, au premier écran d'EKO. Le `PIN_PEPPER` ne doit **jamais** changer, sinon le PIN devra être redéfini.
Même chose avec `--env production`, avec des valeurs différentes.

## 3. Garde-fous de coût

- Le Worker et D1 restent dans l'offre gratuite (100 000 requêtes/jour, 5 Go de D1) : au-delà, les requêtes sont refusées, pas facturées.
- Aucun service payant n'est activé par ce dépôt. R2 arrivera en phase A2 avec ses propres plafonds applicatifs (alerte à 8 Go, blocage à 9 Go).
- Garde l'alerte de facturation Cloudflare active (Notifications).

## 4. Vérifier un déploiement

- `https://<domaine>/api/health` répond `{"ok":true}`.
- Les en-têtes de sécurité sont présents : `curl -sI https://<domaine>/ | grep -i content-security-policy`.
