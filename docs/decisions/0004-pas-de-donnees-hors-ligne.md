# 0004 — Service worker limité à la coquille

**Contexte.** Le cahier des charges limite le service worker aux ressources non sensibles.

**Décision.** Seuls le HTML, le JS, le CSS, les icônes et la police latine sont mis en cache. Aucune réponse de l'API, aucun média. Validé par Johan le 30/10/2026.

**Conséquences.** L'application s'ouvre hors ligne mais affiche un message clair à la place des données. Aucune donnée de santé ne reste sur un appareil perdu.
