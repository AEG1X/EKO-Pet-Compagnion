#!/usr/bin/env bash
# Sauvegarde d'EKO tirée depuis le Raspberry Pi : base D1 (export SQL) et fichiers R2,
# puis archivage chiffré avec restic. Aucun port n'est ouvert chez toi : le Pi appelle EKO.
#
# Configuration : /etc/eko-backup.env (voir docs/sauvegarde.md), lisible par root seulement.
# Dépendances : curl, jq, restic.
set -euo pipefail

CONFIG="${EKO_BACKUP_CONFIG:-/etc/eko-backup.env}"
# shellcheck source=/dev/null
source "$CONFIG"
: "${EKO_URL:?EKO_URL manquant}" "${EKO_BACKUP_TOKEN:?EKO_BACKUP_TOKEN manquant}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY manquant}" "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE manquant}"
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE

WORK="${EKO_BACKUP_DIR:-/var/lib/eko-backup}"
mkdir -p "$WORK/fichiers"
chmod 700 "$WORK"

# Le jeton passe par un fichier d'en-têtes, jamais sur la ligne de commande (visible par ps).
HEADERS="$(mktemp)"
trap 'rm -f "$HEADERS"' EXIT
printf 'Authorization: Bearer %s\n' "$EKO_BACKUP_TOKEN" > "$HEADERS"
fetch() { curl --fail --silent --show-error --retry 3 --max-time 300 -H "@$HEADERS" "$@"; }

echo "$(date -Is) Export de la base…"
fetch "$EKO_URL/api/backup/d1.sql" -o "$WORK/eko-d1.sql.tmp"
grep -q '^PRAGMA defer_foreign_keys' "$WORK/eko-d1.sql.tmp" || { echo "Export invalide" >&2; exit 1; }
mv "$WORK/eko-d1.sql.tmp" "$WORK/eko-d1.sql"

echo "$(date -Is) Fichiers…"
fetch "$EKO_URL/api/backup/files" -o "$WORK/fichiers.json"
nouveaux=0
while IFS=$'\t' read -r id size; do
  cible="$WORK/fichiers/$id"
  # Un fichier ne change jamais une fois envoyé : on ne retélécharge que ce qui manque.
  if [[ ! -f "$cible" || "$(stat -c %s "$cible")" != "$size" ]]; then
    fetch "$EKO_URL/api/backup/files/$id" -o "$cible.tmp" && mv "$cible.tmp" "$cible"
    nouveaux=$((nouveaux + 1))
  fi
done < <(jq -r '.[] | [.id, (.size | tostring)] | @tsv' "$WORK/fichiers.json")
# Les fichiers supprimés dans EKO disparaissent de la copie locale (restic garde l'historique).
jq -r '.[].id' "$WORK/fichiers.json" | sort > "$WORK/attendus.txt"
find "$WORK/fichiers" -maxdepth 1 -type f ! -name '*.tmp' -printf '%f\n' | sort | comm -23 - "$WORK/attendus.txt" |
  while read -r orphelin; do rm -f "$WORK/fichiers/$orphelin"; done
echo "$(date -Is) $nouveaux nouveau(x) fichier(s)."

echo "$(date -Is) Archivage restic…"
restic snapshots >/dev/null 2>&1 || restic init
restic backup --tag eko --host eko "$WORK"
restic forget --tag eko --keep-daily 30 --keep-weekly 12 --keep-monthly 24 --prune
echo "$(date -Is) Sauvegarde terminée."
