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

## Hof-Konten

- **Hof** = Betrieb mit einer gemeinsamen Personenliste und einer oder mehreren Karten. Jede Person hat **einen** persönlichen Link für alle Karten des Hofs.
- Rollen: **Inhaber** (alles), **Admin** (verwalten), **Mitarbeiter** (eintragen, eigene ändern), **Nur ansehen** (lesen, eigener Name).
- Einladungen: persönlich, einmal gültig, 14 Tage (`/?hof=ID&einladung=CODE`). Anmeldung auf neuem Gerät mit Name + PIN (`/?hof=ID`), mit Sperre bei Fehlversuchen.
- Bestehende Karte → Hof: Einstellungen → „Hof einrichten“ (Admin). Alle bisherigen Personen werden Hof-Mitglieder, ihre Links bleiben gültig.
- Neuer Hof (später nach dem Kauf): `/?betreiber` mit `FLOCKMAP_ADMIN_TOKEN`.
- Karten ohne Hof und alle alten Links funktionieren unverändert. Speicherung: Tabelle `hoefe` (Postgres) bzw. `server/data/hof-<id>.json`.

## Offline-Modus

- **App-Hülle**: `public/sw.js` lädt beim Installieren alle App-Dateien vor (Liste setzt das Vite-Plugin in `vite.config.ts` beim Build ein, inkl. Versionskennung). Seitenaufrufe: Netz zuerst (5 s), sonst gespeicherte Hülle.
- **Kartendaten**: Einträge, Gruppen, Kartenname, eigene Rolle in IndexedDB (`src/speicher.ts`, Rückfall localStorage). Alte localStorage-Daten werden beim ersten Start übernommen.
- **Postausgang**: alle Änderungen (Nadeln, Flächen, Notizen, Gruppen, Zuordnungen, Verschieben, Löschen) in einer Warteschlange (localStorage, synchron + Kopie in IndexedDB); automatisches Senden bei Netz, alle 20 s erneut, Zeitlimit 15 s je Anfrage. Status in der Kopfzeile: „Offline · X Änderungen warten“ / „Live · synchronisiert“.
- **Konflikte**: Client schickt `basisGeaendert`. Weicht der Serverstand ab und der Inhalt ist verschieden, gilt die neuere Änderung (Änderungszeitpunkt); die andere Fassung wird als Notiz am Eintrag gesichert. Löschen eines inzwischen von jemand anderem geänderten Eintrags wird mit 409 abgelehnt; Bearbeiten eines inzwischen gelöschten Eintrags stellt ihn wieder her. Nutzer bekommt jeweils einen Hinweis.
- **Kartenkacheln**: nur angesehene Kacheln werden gespeichert (Esri/OSM-Bedingungen: kein Massen-Download), max. 2.500 zuletzt angesehene; „Diesen Kartenausschnitt sichern“ schützt angesehene Kacheln (Zoom ±2) vor dem Aufräumen, max. 3.000.

## Export & Import

Panel „Export & Import“ (Liste → „⬇️ Export“ oder Einstellungen → Daten). Code in `src/Austausch.tsx` und `src/austausch/`.

- **Excel (.xlsx)**: eigener schlanker Schreiber (`xlsx.ts`, ZIP über `fflate`) – Blätter „Nadeln und Flächen“ (echte Zahlen/Datumswerte, Autofilter, fixierte Kopfzeile, Summenzeile), „Summen je Gruppe“, „Notizen“.
- **PDF** (`pdf.ts`, jsPDF + autotable, nur bei Bedarf geladen): Titel mit Hof/Karte/Datum, Kennzahlen, Übersichtskarte (`kartenbild.ts`: Esri-Kacheln wie in der App + Flächen/Nadeln, Quellenangabe), Summen je Gruppe, Tabelle aller Einträge, optional je Gruppe eine Seite.
- **KML**: Ordner je Gruppe, Stile je Farbe, Flächen als Polygone, `ExtendedData` mit allen Feldern (`flockmap_id` → verlustfreie Rundreise, doppelte werden beim Re-Import erkannt).
- **Filter**: Export aus der Liste bietet „Nur gefilterte exportieren“ (Suche, Farbe, Zeitraum des aktiven Reiters).
- **Sicherung (JSON, nur Admin)**: ganze Karte ohne Zugänge/Links. Wiederherstellen: in diese Karte (nur Fehlendes ergänzen) oder als neue Karte.
- **Import (nur Admin)**: KML/KMZ (Google My Maps: Ebenen → Gruppen, Stilfarben, Beschreibung + Zusatzfelder → Notiz, Tierzahlen aus Namen wie „50 + 1“, „+12 L“, „80 Schafe“), GeoJSON, CSV. Vorschau mit Häkchen je Eintrag, Duplikaterkennung (gleicher Name < 15 m).
- Geschrieben wird über `POST /api/karten/:id/stapel` (Admin): ergänzt nur neue IDs, ändert nie Vorhandenes → idempotent, läuft über den Offline-Postausgang.
