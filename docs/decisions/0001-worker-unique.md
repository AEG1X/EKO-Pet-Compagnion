# 0001 — Un seul Worker avec assets statiques

**Contexte.** Le cahier des charges prévoyait Cloudflare Pages pour le front et des Workers pour l'API.

**Décision.** Un seul Worker sert les fichiers de l'application (assets statiques), l'API et, en phase C, la fiche publique. Validé par Johan le 30/10/2026.

**Conséquences.** Une seule origine HTTPS : cookies `SameSite=Strict` et CSP simples, aucun CORS. Tâches planifiées, liaisons D1/R2/KV et en-têtes de sécurité au même endroit. Même offre gratuite que Pages ; chaque fichier statique compte comme une requête Worker (100 000/jour), ce qui reste très au-dessus d'un usage personnel.
