# Sécurité

## Authentification

| Élément | Règle |
| --- | --- |
| Connexion | Passkey uniquement (Face ID, Touch ID, Windows Hello, clé de sécurité). Aucun mot de passe. |
| Première configuration | Possible seulement tant qu'aucune passkey n'existe, et avec le secret `SETUP_TOKEN`. |
| Session | Jeton aléatoire de 256 bits dans le cookie `__Host-eko_session` (HttpOnly, Secure, SameSite=Strict), haché en base, 30 jours. |
| PIN | 6 chiffres, redemandé après 5 minutes d'inactivité. Blocage 15 min après 5 erreurs ; toutes les sessions révoquées après 10. |
| Codes de secours | 10 codes à usage unique (60 bits chacun), hachés. Un code ouvre une session limitée de 15 minutes qui sert seulement à enregistrer une nouvelle passkey ; toutes les autres sessions sont alors fermées. |
| CSRF | Cookie SameSite=Strict, contrôle de l'en-tête `Origin` et corps JSON obligatoires pour toute écriture. |
| Limites de débit | Configuration, connexion, codes de secours et PIN, par empreinte d'IP (HMAC tournant chaque jour, aucune IP stockée). |
| En-têtes | CSP stricte sans script inline, HSTS, `X-Frame-Options: DENY`, `noindex` partout, `no-store` sur l'API. |
| Journal | Événements de sécurité dans `audit_log`, sans jeton, PIN ni adresse IP. |

Le PIN est protégé par HMAC-SHA256 avec une clé secrète du Worker (`PIN_PEPPER`) : un hachage volontairement lent n'est pas possible dans la limite de 10 ms de calcul de l'offre gratuite, et un PIN à 6 chiffres reste devinable hors ligne sans cette clé. La protection repose donc sur la clé secrète et sur les blocages côté serveur.

## Procédure d'urgence : toutes les passkeys et tous les codes perdus

Ton compte Cloudflare est la clé de dernier recours. Les données d'Eko ne sont pas touchées.

```sh
cd apps/worker
pnpm exec wrangler d1 execute DB --remote --env production \
  --command "DELETE FROM passkey; DELETE FROM session; DELETE FROM recovery_code;"
openssl rand -base64 24 | pnpm exec wrangler secret put SETUP_TOKEN --env production
```

Ouvre ensuite EKO : l'écran de configuration réapparaît. Saisis le nouveau `SETUP_TOKEN`, crée une passkey et range les nouveaux codes de secours.

## Signaler un problème

Toute faille supposée se traite en priorité, avant toute nouvelle fonctionnalité.
