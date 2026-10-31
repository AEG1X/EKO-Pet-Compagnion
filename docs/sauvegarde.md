# Sauvegarde et restauration

Chaque nuit, le Raspberry Pi tire une copie d'EKO : la base D1 (export SQL) et les fichiers R2 (documents, photo du profil). Il les archive avec [restic](https://restic.net), chiffrées et versionnées. Le Pi appelle EKO : aucun port n'est ouvert chez toi.

## Ce qui est sauvegardé

- **Base** : toutes les tables, sauf les sessions, les défis de connexion et les compteurs anti-abus, qui se recréent seuls. Passkeys, empreintes du PIN et codes de secours sont inclus, sous leur forme hachée.
- **Fichiers** : tous les fichiers rattachés à un document ou au profil. Un fichier n'est téléchargé qu'une fois, puisqu'il ne change jamais.
- **Conservation restic** : 30 sauvegardes quotidiennes, 12 hebdomadaires et 24 mensuelles.

## Mise en place (une fois)

1. **Jeton** : génère un jeton long, par exemple avec `openssl rand -base64 32` (ou dans PowerShell : `[Convert]::ToBase64String((1..32 | % { Get-Random -Max 256 }))`). Ajoute-le comme **secret** `BACKUP_TOKEN` du Worker (tableau de bord Cloudflare → Workers → `eko` → Paramètres → Variables et secrets). Sans ce secret, les routes de sauvegarde n'existent pas.
2. **Sur le Pi**, installe les dépendances : `sudo apt install curl jq restic`.
3. Copie le script et les unités systemd :
   ```sh
   sudo install -m 755 tools/backup/eko-backup.sh /usr/local/bin/eko-backup.sh
   sudo install -m 644 tools/backup/eko-backup.service tools/backup/eko-backup.timer /etc/systemd/system/
   sudo mkdir -p /srv/eko-restic /var/lib/eko-backup
   ```
4. Crée le mot de passe restic. **Garde-le aussi hors du Pi** (gestionnaire de mots de passe) : sans lui, les sauvegardes sont illisibles.
   ```sh
   sudo sh -c 'openssl rand -base64 32 > /root/eko-restic.pass && chmod 600 /root/eko-restic.pass'
   ```
5. Crée `/etc/eko-backup.env` (droits `600`, propriétaire root) :
   ```sh
   EKO_URL=https://eko-companion.fr
   EKO_BACKUP_TOKEN=<le jeton de l'étape 1>
   RESTIC_REPOSITORY=/srv/eko-restic
   RESTIC_PASSWORD_FILE=/root/eko-restic.pass
   ```
6. Premier essai, puis activation quotidienne (4 h 30) :
   ```sh
   sudo /usr/local/bin/eko-backup.sh
   sudo systemctl daemon-reload && sudo systemctl enable --now eko-backup.timer
   ```

Pour une seconde copie hors de chez toi, `RESTIC_REPOSITORY` peut viser un disque externe ou un autre stockage compatible restic.

## Vérifier

- `sudo systemctl list-timers eko-backup.timer` : prochaine exécution.
- `sudo journalctl -u eko-backup.service -n 50` : journal de la dernière sauvegarde.
- `sudo restic -r /srv/eko-restic --password-file /root/eko-restic.pass snapshots` : liste des sauvegardes.
- Le journal de sécurité d'EKO note chaque export (`backup_exported`).

## Restaurer

1. Récupère une sauvegarde : `sudo restic -r /srv/eko-restic --password-file /root/eko-restic.pass restore latest --target /tmp/eko-restauration`.
2. **Base** : crée une base D1 neuve (ou vide l'ancienne), applique les migrations, puis rejoue l'export :
   ```sh
   cd apps/worker
   pnpm exec wrangler d1 migrations apply DB --remote --env production
   pnpm exec wrangler d1 execute DB --remote --env production --file /tmp/eko-restauration/var/lib/eko-backup/eko-d1.sql
   ```
3. **Fichiers** : remets chaque fichier dans le bucket sous sa clé `files/<propriétaire>/<identifiant>` (l'identifiant est le nom du fichier sauvegardé ; le propriétaire figure dans la table `stored_file` de l'export) :
   ```sh
   pnpm exec wrangler r2 object put eko-files/files/<propriétaire>/<id> --file <fichier> --remote
   ```
4. Connecte-toi : passkeys, PIN et codes de secours sont restaurés avec la base. Les sessions ne le sont pas : il suffit de se reconnecter.

La restauration a été testée de bout en bout sur une base locale : export, base neuve, migrations, puis réimport.
