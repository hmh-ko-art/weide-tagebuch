#!/usr/bin/env bash
# Einmalige Einrichtung eines frischen Hetzner-Servers (Ubuntu 24.04) für FlockMap.
# Als root ausführen:
#   curl -fsSL https://raw.githubusercontent.com/hmh-ko-art/weide-tagebuch/main/deploy/setup.sh | DOMAIN=karte.heckernatur.de bash
# oder nach dem Klonen:  DOMAIN=... bash /opt/flockmap/deploy/setup.sh
# Idempotent: kann gefahrlos erneut laufen.
set -euo pipefail
REPO_URL=${REPO_URL:-https://github.com/hmh-ko-art/weide-tagebuch.git}
APP_DIR=${APP_DIR:-/opt/flockmap}
export DEBIAN_FRONTEND=noninteractive

echo "== Pakete & Sicherheitsupdates"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl git ufw fail2ban unattended-upgrades docker.io docker-compose-v2
systemctl enable --now docker
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo "== SSH nur mit Schlüssel"
install -d /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/10-flockmap.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
systemctl reload ssh || systemctl reload sshd || true

echo "== Firewall (22, 80, 443)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "== 2 GB Swap (Puffer für den App-Build)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Code nach $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull --ff-only; else git clone "$REPO_URL" "$APP_DIR"; fi
cd "$APP_DIR/deploy"

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  grep -q '^FLOCKMAP_ADMIN_TOKEN=' .env || echo 'FLOCKMAP_ADMIN_TOKEN=' >> .env
  sed -i "s|^FLOCKMAP_ADMIN_TOKEN=$|FLOCKMAP_ADMIN_TOKEN=$(openssl rand -hex 24)|" .env
  [ -n "${DOMAIN:-}" ] && sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env
  chmod 600 .env
  echo ".env angelegt (Passwort zufällig). DOMAIN: $(grep ^DOMAIN= .env)"
fi

echo "== Nächtliches Backup (03:15) einrichten"
cat > /etc/cron.d/flockmap-backup <<CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * root $APP_DIR/deploy/backup.sh >> /var/log/flockmap-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/flockmap-backup

echo "== Container bauen und starten"
docker compose up -d --build
docker compose ps
echo "Fertig. Test:  curl -s https://\$(grep ^DOMAIN= .env | cut -d= -f2)/healthz"
