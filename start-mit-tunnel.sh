#!/bin/bash
# Weide-Tagebuch auf dem Mac starten und per Cloudflare Quick Tunnel (HTTPS) fürs Handy freigeben.
# Benötigt Node.js (https://nodejs.org). Beenden mit Ctrl+C.
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
npm run build
if ! command -v cloudflared >/dev/null; then
  if [ ! -x ./cloudflared ]; then
    ARCH=$(uname -m); [ "$ARCH" = "arm64" ] || ARCH=amd64
    curl -sL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-$ARCH.tgz" | tar xz
  fi
  CF=./cloudflared
else CF=cloudflared; fi
node server/server.js &
SERVER=$!
trap "kill $SERVER" EXIT
sleep 1
echo "Öffentliche HTTPS-Adresse erscheint gleich unten (…trycloudflare.com)."
echo "Karten-Links: <Adresse>/?karte=ID&schluessel=… (siehe LINKS.txt)"
$CF tunnel --no-autoupdate --url http://localhost:8787
