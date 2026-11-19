#!/usr/bin/env bash
# Nächtliches Postgres-Backup für FlockMap mit Rotation.
# Cron (von setup.sh angelegt):  15 3 * * *  root  /opt/flockmap/deploy/backup.sh
# Behält BACKUP_KEEP_DAYS tägliche und BACKUP_KEEP_WEEKS sonntägliche Sicherungen.
set -euo pipefail
cd "$(dirname "$0")"
set -a; [ -f .env ] && . ./.env; set +a
BACKUP_DIR=${BACKUP_DIR:-/srv/flockmap-backups}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
KEEP_WEEKS=${BACKUP_KEEP_WEEKS:-8}
COMPOSE=${COMPOSE:-docker compose}
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
chmod 700 "$BACKUP_DIR"
stamp=$(date +%Y-%m-%d_%H%M)
out="$BACKUP_DIR/daily/flockmap-$stamp.sql.gz"
tmp="$out.part"
# Klartext-SQL (mit DROP/CREATE), lässt sich mit restore.sh oder psql einspielen
$COMPOSE exec -T db pg_dump -U flockmap -d flockmap --clean --if-exists --no-owner --no-privileges | gzip -9 > "$tmp"
# Plausibilitätsprüfung: Datei nicht leer und enthält die Tabelle karten
if ! gzip -t "$tmp" || ! zcat "$tmp" | grep -q 'CREATE TABLE public.karten'; then
  echo "Backup fehlerhaft: $tmp" >&2; exit 1
fi
mv "$tmp" "$out"
chmod 600 "$out"
# Sonntags zusätzlich als Wochensicherung ablegen
if [ "$(date +%u)" = 7 ]; then cp -p "$out" "$BACKUP_DIR/weekly/"; fi
find "$BACKUP_DIR/daily"  -name 'flockmap-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR/weekly" -name 'flockmap-*.sql.gz' -mtime +$((KEEP_WEEKS * 7)) -delete
echo "$(date -Is) Backup ok: $out ($(du -h "$out" | cut -f1))"
