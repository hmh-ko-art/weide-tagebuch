#!/usr/bin/env bash
# Backup in die FlockMap-Datenbank einspielen (ersetzt vorhandene Karten mit gleicher ID).
#   ./restore.sh /srv/flockmap-backups/daily/flockmap-2026-12-01_0315.sql.gz
#   ./restore.sh ../backups/flockmap-render-2026-11-19_1731.sql     (Export vom Render-Umzug)
# Die App wird kurz gestoppt, damit sie danach alle Karten frisch aus der DB lädt.
set -euo pipefail
cd "$(dirname "$0")"
f=${1:?Aufruf: ./restore.sh <backup.sql|backup.sql.gz>}
[ -f "$f" ] || { echo "Datei nicht gefunden: $f" >&2; exit 1; }
COMPOSE=${COMPOSE:-docker compose}
read_backup() { case "$f" in *.gz) zcat "$f" ;; *) cat "$f" ;; esac; }
$COMPOSE up -d db
for i in $(seq 1 30); do $COMPOSE exec -T db pg_isready -U flockmap -d flockmap >/dev/null 2>&1 && break; sleep 2; done
$COMPOSE stop app || true
read_backup | $COMPOSE exec -T db psql -U flockmap -d flockmap -v ON_ERROR_STOP=1 -q
$COMPOSE exec -T db psql -U flockmap -d flockmap -At -c \
  "SELECT id || '  ' || (daten->>'name') || '  Einträge: ' || jsonb_array_length(daten->'eintraege') FROM karten ORDER BY id"
$COMPOSE up -d app
echo "Wiederherstellung fertig."
