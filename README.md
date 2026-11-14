# FlockMap (Prototyp, ehemals „Weide-Tagebuch“)

Repo, Render-Service (`weide-tagebuch`), Datenbank, API-Pfade und localStorage-Schlüssel (`wt-…`) behalten bewusst den alten Namen.

Siehe **PLAN.md** für Ziel, Tech-Stack, Screens und Ausbau.

## Starten

```bash
npm install
npm run build      # baut die App nach dist/
npm start          # Server + App auf http://localhost:8787
```

Entwicklung mit Hot-Reload: `npm run dev` (Vite auf :5173, API-Server auf :8787, /api wird weitergeleitet).

Google Maps aktivieren: `.env.example` nach `.env.local` kopieren, `VITE_GOOGLE_MAPS_API_KEY` eintragen, neu bauen. Ohne Key: OpenStreetMap + OSRM-Routen.

Teilen: In der App ⚙️ → „Geteilte Karte erstellen“ → Ansehen-/Bearbeiten-Link kopieren. Daten liegen in `server/data/<karten-id>.json`.

Hinweis: Standort, Routen ab Standort und PWA-Installation funktionieren auf dem Handy nur über HTTPS (oder localhost).

## Veröffentlichen auf Render (kostenlos)

`render.yaml` legt einen Free-Webservice (Frankfurt) und eine Free-Postgres-Datenbank an. Mit `DATABASE_URL` speichert der Server alle Karten in Postgres (Tabelle `karten`), ohne in JSON-Dateien. Health-Check: `/healthz`.

Einschränkungen Free-Plan: Dienst schläft nach 15 Min. ohne Zugriffe ein (erster Aufruf danach ca. 1 Min.); Free-Postgres läuft 30 Tage nach Erstellung ab (danach 14 Tage Frist zum Upgrade, dann gelöscht) – vorher JSON-Export machen oder auf eine andere Datenbank (z. B. Supabase/Neon Free) umziehen, `DATABASE_URL` genügt.
