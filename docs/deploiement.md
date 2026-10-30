# Déploiement sur Cloudflare

Le déploiement se lance **à la main** depuis GitHub (onglet Actions › « Déploiement » › Run workflow), d'abord en `staging`, puis en `production`.
Les tests tournent avant chaque déploiement ; un échec bloque tout.

## 1. Une seule fois : préparer Cloudflare

1. **Bases D1** : dans le tableau de bord Cloudflare, Stockage et bases de données › D1, crée `eko-staging` et `eko-prod`.
   Copie leurs identifiants dans `apps/worker/wrangler.jsonc` à la place de `REMPLACER_PAR_ID_D1_STAGING` et `REMPLACER_PAR_ID_D1_PRODUCTION`.
2. **Domaines** : remplace `REMPLACER_PAR_DOMAINE` (production, par exemple `eko.mondomaine.fr`) et `REMPLACER_PAR_DOMAINE_STAGING`
   (par exemple `eko-staging.<ton-sous-domaine>.workers.dev`). `RP_ID` est le domaine seul, `ORIGIN` l'adresse complète en `https://`.
   Pour la production sur ton domaine, ajoute dans le bloc `production` :
   `"routes": [{ "pattern": "eko.mondomaine.fr", "custom_domain": true }]`.
   Attention : changer de domaine plus tard invalide les passkeys, et l'adresse sera gravée sur la médaille.
3. **Jeton d'API** : Mon profil › Jetons d'API › Créer un jeton, modèle « Modifier les Workers Cloudflare », en ajoutant la permission **D1 : Modifier**.
   Limite-le à ton compte.
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
