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

## 3. Stockage R2

À faire une fois, avant le premier déploiement qui contient la phase A2.4 :

1. Tableau de bord Cloudflare → **R2 Object Storage** → activer R2 (la carte est demandée ; l'offre gratuite couvre 10 Go et 1 million d'écritures par mois).
2. Créer deux buckets, région automatique, **sans** accès public ni domaine personnalisé : `eko-files-staging` et `eko-files`.
3. **Notifications** → ajouter une alerte de facturation à l'usage, pour être prévenu au premier centime.

Le token d'API du déploiement n'a pas besoin de droit R2 : le Worker accède au bucket par son binding `FILES` (voir `wrangler.jsonc`).

## 4. Notifications (facultatif)

Sans ces secrets, EKO fonctionne normalement : la page Réglages indique simplement que les notifications ne sont pas configurées.

**Web Push (téléphone et ordinateur)**

1. Sur ton ordinateur, dans le dossier du projet : `pnpm --filter @eko/worker vapid`. Deux lignes s'affichent.
2. Tableau de bord Cloudflare → Workers → `eko-staging` → Paramètres → Variables et secrets : ajoute deux **secrets**, `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY`, avec ces valeurs. Utilise une autre paire pour `eko` (production).
3. Ne change plus ces clés : chaque appareil devrait sinon réactiver les notifications.

Sur iPhone, les notifications web demandent iOS 16.4 ou plus et l'app ajoutée à l'écran d'accueil.

**Telegram (secours)**

1. Dans Telegram, écris à `@BotFather` : `/newbot`, puis choisis un nom (par exemple « EKO Johan ») et un identifiant se terminant par `bot`.
2. BotFather renvoie un jeton : ajoute-le comme **secret** `TELEGRAM_BOT_TOKEN` du Worker. Ne l'envoie à personne.
3. Dans EKO → Réglages → Notifications → « Relier Telegram ».

Le récapitulatif part chaque jour à 8 h (heure de Paris). La tâche planifiée tourne à 3 h, 6 h et 7 h UTC : une seule expression cron par Worker, dans la limite gratuite.

## 5. Garde-fous de coût

- Le Worker et D1 restent dans l'offre gratuite (100 000 requêtes/jour, 5 Go de D1) : au-delà, les requêtes sont refusées, pas facturées.
- R2 (documents et photo du profil) est le seul service qui facture au-delà de l'offre gratuite (10 Go), sans plafond côté Cloudflare. EKO applique donc ses propres plafonds : avertissement dans l'app dès 8 Go, refus de tout envoi qui dépasserait 9 Go, 20 Mo maximum par fichier.
- Garde l'alerte de facturation Cloudflare active (Notifications).
- Web Push et l'API Bot de Telegram sont gratuits ; ils ne passent par aucun service Cloudflare payant.

## 6. Vérifier un déploiement

- `https://<domaine>/api/health` répond `{"ok":true}`.
- Les en-têtes de sécurité sont présents : `curl -sI https://<domaine>/ | grep -i content-security-policy`.

## 7. Repartir de zéro sur staging

Le workflow **Réinitialiser staging** (onglet Actions, « Run workflow ») vide toutes les données de l'environnement de test : base D1 (le schéma et les migrations sont gardés) et fichiers R2. Il faut taper `EFFACER` pour confirmer. Il ne peut pas viser la production : la cible est écrite en dur dans `apps/worker/scripts/reset-staging.mjs`.

Ensuite, ouvre `https://staging.eko-companion.fr` : EKO redemande le `SETUP_TOKEN` et crée une nouvelle passkey. L'ancienne passkey « EKO (test) » ne sert plus et peut être supprimée du téléphone.
