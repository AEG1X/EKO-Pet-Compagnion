# 0002 — Passkeys, codes de secours et PIN côté serveur

**Contexte.** Compte unique, utilisé sur iPhone, Mac et PC. Les Workers gratuits limitent le calcul à 10 ms par requête, ce qui exclut bcrypt ou Argon2.

**Décision.** Connexion par passkey uniquement (vérification de signature, rapide). Dix codes de secours imprimables. PIN à 6 chiffres vérifié par le serveur, avec blocages, et redemandé après 5 minutes d'inactivité. Procédure d'urgence par le compte Cloudflare. Validé par Johan le 30/10/2026.

**Conséquences.** Aucun mot de passe ni e-mail à gérer. La perte de tous les appareils et de tous les codes reste récupérable via Cloudflare (docs/securite.md). Le PIN dépend du secret `PIN_PEPPER`, qui ne doit pas changer.
