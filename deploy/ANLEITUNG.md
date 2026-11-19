# FlockMap auf eigenen Server umziehen (Hetzner)

## Was Henning macht (ca. 15 Minuten)

1. **Konto anlegen:** https://www.hetzner.com/cloud → „Registrieren“, E-Mail bestätigen, Ausweis-/Zahlungsprüfung abschließen (Kreditkarte, PayPal oder SEPA).
2. **Projekt anlegen:** In der Hetzner Console „Neues Projekt“ → Name `FlockMap`.
3. **Server erstellen** („Server hinzufügen“):
   - Standort: **Nürnberg** (oder Falkenstein, falls verfügbar), beides Deutschland
   - Image: **Ubuntu 24.04**
   - Typ: **Shared vCPU → x86 → CX23** (2 vCPU, 4 GB RAM, 40 GB SSD); falls nicht verfügbar: **CAX11** (Arm) geht genauso
   - Netzwerk: öffentliche **IPv4** und IPv6 anlassen
   - **SSH-Schlüssel:** „SSH-Key hinzufügen“ → den Schlüssel von Jürgen Appi (eine Zeile, beginnt mit `ssh-ed25519`) komplett einfügen, Name `flockmap-deploy`
   - Backups: **einschalten** empfohlen (+20 %, ca. 1,20 € im Monat)
   - Name: `flockmap` → „Kostenpflichtig erstellen“
4. **Zurückschicken:** nur die **IPv4-Adresse** des Servers (z. B. `203.0.113.10`). **Keine Passwörter**, kein Root-Passwort, keine Zugangsdaten – die brauchen wir nicht.

## Adresse (Domain)

- Empfohlen: **karte.heckernatur.de**. Beim Webhoster von heckernatur.de (oder dort, wo die DNS-Einstellungen liegen) einen **A-Eintrag** anlegen:
  `karte` → `<Server-IPv4>` (TTL 3600 oder Standard). Die Hauptseite heckernatur.de bleibt unverändert.
- Ohne DNS-Zugriff geht es sofort auch mit `<IP-mit-Bindestrichen>.sslip.io` (z. B. `203-0-113-10.sslip.io`) – auch mit HTTPS. Später kann man auf die eigene Subdomain wechseln.

## Was danach passiert (macht Jürgen Appi)

`DOMAIN=karte.heckernatur.de bash deploy/setup.sh` auf dem Server (Updates, Firewall, nur SSH-Schlüssel, Docker, nächtliches Backup 03:15 mit 14 Tages- + 8 Wochensicherungen), dann frisches Backup von Render mit `deploy/restore.sh` einspielen, prüfen, umstellen.

- Alte Links bleiben gültig: `?karte=…&schluessel=…` bzw. `&zugang=…` funktionieren auf der neuen Adresse genauso – nur der Anfang der Adresse ändert sich.
- Jedes Handy muss **einmal** seinen persönlichen Link auf der neuen Adresse öffnen (der gespeicherte Zugang hängt an der alten Adresse) und die App neu zum Startbildschirm hinzufügen.
- Die Render-Adresse kann danach auf die neue Adresse weiterleiten; Render-Datenbank läuft am 11.12.2026 ab.

## Technik (Kurzfassung)

| Datei | Zweck |
|---|---|
| `../Dockerfile` | baut App + Server (Node 24) |
| `docker-compose.yml` | `db` (Postgres 16, Volume `pgdata`), `app`, `caddy` (HTTPS automatisch, Ports 80/443) |
| `Caddyfile` | Reverse-Proxy inkl. Live-Updates (SSE ungepuffert) |
| `.env.example` | `DOMAIN`, `POSTGRES_PASSWORD`, Backup-Einstellungen → nach `.env` kopieren |
| `setup.sh` / `cloud-init.yaml` | Server-Einrichtung (idempotent) / optionale Cloud-Config |
| `backup.sh` | `pg_dump` → `/srv/flockmap-backups/{daily,weekly}`, Rotation |
| `restore.sh` | spielt `.sql` oder `.sql.gz` ein, startet die App neu |
| `docker-compose.test.yml` | nur für lokale Tests ohne Docker-Bridge |

Update einspielen: `cd /opt/flockmap && git pull && cd deploy && docker compose up -d --build`

## Hof-Konten (ab Version mit „Mein Hof“)
- Neue Tabelle `hoefe` (neben `karten`). Beim Umzug **beide Tabellen** übernehmen – `pg_dump` der ganzen Datenbank macht das automatisch; bei einem Export per SQL-Abfrage auch `SELECT id, daten FROM hoefe` sichern.
- `FLOCKMAP_ADMIN_TOKEN` (in `.env`, von `setup.sh` zufällig erzeugt) schützt die Betreiber-Seite `/?betreiber` zum Anlegen neuer Höfe. Denselben Wert wie auf Render übernehmen, wenn er weiter gelten soll.

## Datenschutztext nach dem Umzug

Das Docker-Image baut die App mit `VITE_HOSTER=hetzner` – Impressum/Datenschutz nennen dann automatisch Hetzner (Deutschland) statt Render. Danach in `src/recht/betreiber.ts` das Datum `STAND` anpassen und den AVV mit Hetzner abschließen (siehe `docs/RECHTLICHES.md`).
