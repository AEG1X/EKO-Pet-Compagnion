# 0005 — Documents envoyés à R2 à travers le Worker

**Contexte.** Le dossier de conception prévoit des URL présignées R2 pour les médias de la phase B (vidéos lourdes). Les documents de la phase A2 sont petits (ordonnances, factures, photos de papiers) et la photo du profil est réduite dans le navigateur.

**Décision.** En phase A2, le navigateur envoie le fichier brut au Worker (`PUT /api/files`, 20 Mo maximum), qui vérifie la session, le type réel du fichier (premiers octets : PDF, JPEG, PNG ou WebP), le plafond de 9 Go, puis l'écrit dans le bucket privé via son binding. Les fichiers sont relus de la même façon (`GET /api/files/:id`), avec une politique de sécurité dédiée qui interdit tout script. Aucune clé d'API S3, aucune règle CORS ni URL publique n'est nécessaire. Les URL présignées restent l'option prévue pour les vidéos de la phase B.

**Conséquences.** Un seul chemin d'accès, contrôlé par la session et le PIN. Les envois jamais rattachés à un document sont purgés chaque nuit après 24 h. La taille de chaque fichier est enregistrée en base : c'est elle qui alimente l'alerte à 8 Go et le blocage à 9 Go, sans appel à l'API de facturation.
