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

## Fichiers et abonnement calendrier

- Les documents et la photo du profil sont dans un bucket R2 privé. Ils ne sont servis que par le Worker, à leur propriétaire, avec une politique de sécurité qui interdit tout script (voir ADR 0005).
- Le lien d'abonnement au calendrier est la seule route lisible sans session. Il contient un jeton aléatoire de 256 bits, dont seule l'empreinte SHA-256 est en base. Le flux ne contient que des titres et des dates, jamais les notes. Remplacer ou désactiver le lien dans la page Calendrier le rend aussitôt inutilisable.

## Notifications

- Les messages Web Push sont chiffrés de bout en bout pour chaque appareil (RFC 8291) et signés avec la clé VAPID du serveur. Le Worker n'accepte que les adresses des services de push des navigateurs (Google, Mozilla, Apple, Microsoft).
- Un appareil que le navigateur a désabonné est oublié au premier envoi refusé.
- Telegram ne reçoit que le texte du récapitulatif (titres et dates des rappels). Le jeton du bot reste un secret du Worker ; la conversation se relie par un code à usage unique valable 15 minutes.

## Sauvegardes

- Les routes `/api/backup/*` n'existent que si le secret `BACKUP_TOKEN` est défini. Elles ne servent qu'à lire, avec ce jeton (comparaison à durée constante), un débit limité et une trace de chaque export dans le journal.
- L'archive restic est chiffrée sur le Pi ; le mot de passe restic doit aussi être conservé hors du Pi.

## Médaille et fiche publique

- La fiche `/m/<identifiant>` est la seule page publique. L'identifiant compte 96 bits aléatoires. Le remplacer ou le désactiver rend l'ancienne médaille inopérante immédiatement, y compris pour la fiche de secours (ADR 0006).
- Une adresse inconnue et une adresse révoquée donnent la même réponse.
- La fiche n'affiche que ce que le propriétaire a coché. L'adresse, le numéro de puce, le passeport, les notes et les documents ne sont jamais publiés, quels que soient les réglages.
- Le numéro de téléphone est masqué par défaut, avec un avertissement à l'activation.
- Le propriétaire peut afficher les photos d'un album choisi : au plus 12 aperçus (jamais les originaux), servis par `/m/<identifiant>/souvenir/<id>` seulement s'ils font partie de cet album. Hors mode perdu, la fiche les met en avant et garde un contact discret en bas de page.
- La page est rendue par le Worker, sans JavaScript, avec la même CSP stricte et `noindex`. Seuls le nombre de visites et la date de la dernière sont enregistrés, sans adresse IP.

## Mode perdu et signalements

- En mode perdu, la fiche affiche une alerte et un formulaire de signalement qui fonctionne sans JavaScript. La position n'est jointe que si le visiteur appuie sur « Joindre ma position » et l'accepte : la géolocalisation n'est autorisée (`Permissions-Policy`) que sur `/m/…`. L'appel reste toujours possible.
- Protection contre les abus : vérification de l'origine, champ piège pour les robots, 5 signalements par heure et par visiteur (empreinte d'IP salée chaque jour, jamais l'IP), 200 signalements au plus par épisode.
- Les visiteurs ne voient jamais les signalements ni les positions des autres.
- Alertes au propriétaire : à chaque signalement, et pour un scan au plus une fois par quart d'heure, par Web Push et par Telegram s'il est relié, même si le push a fonctionné.
- Conservation : signalements, positions et coordonnées des personnes sont effacés 30 jours après la fin du mode perdu (tâche planifiée de 3 h). Il ne reste qu'un résumé : dates et nombre de signalements.

## Souvenirs

- Les photos et vidéos passent par le Worker (`PUT /api/media`, 95 Mo maximum), qui les transmet à R2 au fil de l'eau, sans les garder en mémoire.
- Le format réel est vérifié sur les premiers octets. La longueur annoncée est imposée : un envoi tronqué échoue.
- Les originaux ne sont jamais recompressés. Seul un aperçu JPEG de 640 px est créé par le navigateur.
- La suppression d'un souvenir efface l'original après une confirmation explicite.
- Une empreinte SHA-256 de chaque original évite les doublons.

## Albums partagés

- Un album se partage par un lien `/partage/<jeton>` : jeton aléatoire de 128 bits, propre à chaque destinataire (« Famille », « Mamie »…).
- Le lien est révocable à tout moment et peut expirer (24 h, 7 jours, 30 jours, 3 mois). Un lien révoqué, expiré ou inventé donne la même page « lien indisponible », sans rien révéler.
- La page est rendue par le Worker, sans JavaScript, avec `noindex`, `no-referrer` et `no-store` : une révocation prend effet immédiatement, aperçus compris.
- Le lien ne donne accès qu'aux souvenirs de cet album (aperçus et originaux). Le téléchargement explicite des originaux n'est proposé que si le lien l'autorise ; une personne qui voit une photo peut toujours l'enregistrer.
- Les consultations sont limitées à 300 pages par heure et par visiteur. Le nombre d'ouvertures et la date de la dernière s'affichent pour chaque lien.
- La création et la révocation d'un lien sont inscrites au journal de sécurité.

## Export des souvenirs

- L'export est assemblé par le navigateur en archives ZIP sans recompression (originaux intacts, fichier `souvenirs.json` avec dates, légendes et albums), par lots de 500 Mo au plus. Le Worker ne fait que servir les fichiers, avec la session habituelle.
- La copie complète hors site reste la sauvegarde du Raspberry Pi (voir [sauvegarde.md](sauvegarde.md)).

## Signaler un problème

Toute faille supposée se traite en priorité, avant toute nouvelle fonctionnalité.
