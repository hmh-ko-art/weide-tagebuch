# Weide-Tagebuch – Plan

Digitales Weide- und Reisetagebuch für die Deichschäferei: Auf einer Karte (Google Maps bzw. OpenStreetMap) markiert man, **wo gerade Tiere stehen** – als **Nadel (Pin)** oder als **eingezeichnete Fläche (Weide/Koog/Deichabschnitt)** – jeweils mit **Notiz**, optional **Tierzahl** und **Herde**. Die Karte lässt sich **mit anderen teilen** (Mitarbeiter, Familie, Deichverband, Tierarzt), und zu jeder Nadel kann man sich **die Route anzeigen bzw. direkt hinnavigieren** lassen. Komplett auf Deutsch, für das Handy draußen am Deich gemacht.

## 1. Ziele

- Schnell und mit einer Hand bedienbar: **„+ Nadel“-Knopf immer sichtbar**, außerdem einfach **auf die Karte tippen** → neue Nadel.
- Flächen (Polygone) einzeichnen, mit ungefährer Größe in Hektar.
- Zu jedem Eintrag: Name, Notiz, Tierzahl, Herde, Datum (erstellt/geändert).
- Tagebuch/Verlauf: Liste aller Einträge, Suche, Filter.
- **Gemeinsame Karte**: mehrere Personen sehen und bearbeiten dieselben Nadeln live; Rollen *ansehen* / *bearbeiten*.
- **Route**: Antippen einer Nadel oder Fläche öffnet nur die Details (Name, Farbe, Tierzahl, Herde, Notizen). Die Route vom aktuellen Standort gibt es nur per Knopf **„Route anzeigen“** (wieder ausblendbar mit **„Route ausblenden“**); Knopf **„In Google Maps navigieren“** für echte Turn-by-Turn-Navigation.
- Funktioniert auch bei schlechtem Netz am Deich (Offline-Cache, spätere Synchronisierung).
- Export/Import (JSON), später auch CSV/PDF für Dokumentation (z. B. Weidetagebuch für Förderprogramme/Deichverband).

## 2. Tech-Stack

| Bereich | Wahl | Begründung |
|---|---|---|
| Frontend | **React 19 + Vite + TypeScript** | schnell, verbreitet, gute Tooling-Unterstützung |
| App-Form | **PWA** (Manifest + Service Worker) | „Zum Startbildschirm hinzufügen“ auf iPhone/Android, keine App-Store-Hürde; später optional native Hülle mit Capacitor |
| Karte (Ziel) | **Google Maps JavaScript API** über `@vis.gl/react-google-maps` (AdvancedMarker, Polygone); **Standard: Satellit mit Beschriftung (`mapTypeId: 'hybrid'`)**, Umschalter auf Karte/Gelände bleibt | Weiden, Deiche, Gräben und Zäune sind im Satellitenbild direkt erkennbar |
| Karte (Fallback) | **Leaflet** mit **Esri-Satellitenbild + Beschriftungs-Overlay (Orte, Straßen) als Standard**, umschaltbar auf OpenStreetMap | kostenlos, ohne Key sofort testbar; wird automatisch genutzt, wenn kein Key gesetzt ist |
| Flächen zeichnen | eigener Tipp-Modus (Eckpunkte antippen, „Fertig“) – funktioniert identisch auf Google und Leaflet | Google hat die Drawing Library abgekündigt; Tipp-Modus ist auf dem Handy zuverlässiger als Ziehen. Später optional Leaflet-Geoman / Terra Draw für Eckpunkte verschieben |
| Routen | Mit Key: **Google Directions/Routes API**; ohne Key: **OSRM** (`router.project-osrm.org`) | Route direkt auf der Karte, Distanz + Fahrzeit |
| Navigation | Deep-Link `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG` | öffnet Google-Maps-App mit Turn-by-Turn |
| Speicherung (Gerät) | **localStorage** als Offline-Cache + Warteschlange für noch nicht gesendete Änderungen; später **IndexedDB** (z. B. Dexie) für Fotos & große Datenmengen | |
| Backend Prototyp | **Node.js + Express**, Daten als JSON-Datei pro Karte, **Server-Sent Events (SSE)** für Live-Updates | klein, ohne Datenbank-Setup, sofort lauffähig |
| Backend Produktion | **Supabase** (Postgres + Realtime + Auth + Row Level Security + Storage für Fotos) – Alternative Firebase (Firestore + Auth) | gemeinsame Datenbank, Live-Sync, Logins, Rollen, EU-Region wählbar (DSGVO) |
| Hosting | Frontend: Vercel/Netlify/Cloudflare Pages; Backend: Supabase Cloud (EU) – oder alles auf einem kleinen VPS (z. B. Hetzner) | |

**Wichtig – Google Maps:** Für Google Maps wird ein **API-Key aus einem Google-Cloud-Projekt mit hinterlegtem Abrechnungskonto** benötigt (Maps JavaScript API, für Routen zusätzlich Directions API bzw. Routes API). Google gewährt monatliche Freikontingente; bei einem Familien-/Betriebsgebrauch bleibt man normalerweise darin, trotzdem Budget-Alarm setzen und den Key auf die eigene Domain beschränken. Eintragen in `.env.local`: `VITE_GOOGLE_MAPS_API_KEY=…`. Ohne Key läuft die App automatisch mit Esri-Satellitenbild/OpenStreetMap + OSRM. (Esri-Kacheln sind für Tests frei; für den Dauerbetrieb Nutzungsbedingungen prüfen bzw. Google-Satellit nutzen.)

## 3. Datenmodell

```ts
type LatLng = { lat: number; lng: number }

interface Pin {            // Nadel: „hier stehen gerade Tiere“
  id: string
  typ: 'pin'
  position: LatLng
  titel: string            // z. B. „Mutterschafe Deich Nord“
  notizen: Notiz[]         // beliebig viele Tagebuch-Einträge (siehe unten)
  tiere?: number           // Anzahl Tiere
  herde?: string           // z. B. „Herde 2 – Lämmer“
  farbe?: string           // Hex-Farbe der Stecknadel, z. B. '#ffeb3b' – zur Unterscheidung von Gruppen/Herden.
                           // Vorschläge (gut auf Satellit sichtbar): Rot #e53935 (Standard), Gelb #ffeb3b, Blau #1e88e5,
                           // Weiß #ffffff, Orange #ff9800, Lila #8e24aa, Pink #ff4081, Cyan #00e5ff – oder freie Farbe.
                           // Alte Nadeln ohne Farbe werden in der Standardfarbe Rot angezeigt.
  erstellt: string         // ISO-Datum
  geaendert: string
}

interface Flaeche {        // eingezeichnete Weide/Fläche
  id: string
  typ: 'flaeche'
  punkte: LatLng[]         // Polygon-Eckpunkte
  titel: string; notizen: Notiz[]; tiere?: number; herde?: string
  erstellt: string; geaendert: string
}

interface Notiz {          // ein Tagebuch-Eintrag an einer Nadel oder Fläche
  id: string               // eindeutig -> Zusammenführen per ID bei gleichzeitigen Änderungen
  text: string
  zeitpunkt: string        // ISO, automatisch „jetzt“, nachträglich änderbar
  autor?: string           // Name/Gerät (in den Einstellungen festlegbar)
}

interface Karte {          // geteilte Karte (Server)
  id: string               // steht im Link: ?karte=ID
  name: string
  schluessel: string       // Bearbeiten-Schlüssel: ?karte=ID&schluessel=…
  version: number
  eintraege: (Pin | Flaeche)[]
}
```

**Migration altes Format:** Das frühere Einzelfeld `notiz` wird verlustfrei zur ersten Notiz (`id = <eintrag-id>-n0`, `zeitpunkt` = Erstelldatum, sonst Änderungsdatum). Das passiert identisch im Client (localStorage-Cache, Warteschlange, JSON-Import) und auf dem Server (beim Laden, Anlegen, Import). Die feste ID verhindert Doppelungen, wenn mehrere Geräte gleichzeitig migrieren.

**Sync von Notizen ohne Überschreiben:** Notizen werden über eigene Endpunkte geändert (`PUT/DELETE /api/karten/:id/eintraege/:eid/notizen/:nid`), der Server führt sie per Notiz-ID zusammen. Ändert jemand Name, Farbe oder Tierzahl einer Nadel, behält der Server die vorhandenen Notizen, sodass gleichzeitig von zwei Geräten hinzugefügte Notizen nie verloren gehen. Offline hinzugefügte Notizen warten in der Warteschlange und werden später gesendet.

**Ausbau (Supabase-Schema):**
- `karten(id, name, besitzer_id, erstellt)`
- `mitglieder(karte_id, user_id, rolle: 'ansehen' | 'bearbeiten' | 'admin')`
- `einladungen(code, karte_id, rolle, gueltig_bis)` – Teilen per Link/Einladungscode
- `eintraege(id, karte_id, typ, geom (PostGIS), titel, notiz, tiere, herde, farbe, erstellt_von, erstellt, geaendert, geloescht)`
- `notizen(id, eintrag_id, karte_id, text, zeitpunkt, autor_id, geaendert)` – je Notiz eine Zeile, dadurch konfliktfrei; später mit `tiere`, `foto_url` – **Verlauf**: jede Umtriebsbewegung/Notiz wird als Tagebucheintrag gespeichert („12.11.: 400 Tiere von Koog 3 auf Deich Nord umgetrieben“)
- Row Level Security: nur Mitglieder lesen, nur Rolle „bearbeiten“ schreibt; Realtime-Kanal pro Karte.

## 4. Screens

1. **Karte (Startbildschirm)** – Vollbildkarte, Start auf die nordfriesische Deichküste (Husum/Eiderstedt) zentriert; Kopfzeile mit Kartenname + Sync-Status („Live geteilt“, „Offline – wird später synchronisiert“, „nur ansehen“); schwebende Knöpfe: **„+ Nadel“** (groß, immer sichtbar), **„Fläche“**, **„Mein Standort“**; **Standardansicht Satellit** (mit Orts- und Straßennamen), Ebenenwahl oben rechts: Satellit / Satellit ohne Beschriftung / Karte.
2. **Nadel setzen** – Nadeln sind kleine, schlichte Stecknadeln (SVG, Kopf + dünne Nadel, ca. 14×22 px; Tippfläche 40×44 px) in frei wählbarer Farbe. Fadenkreuz in der Kartenmitte; Tippen auf Karte, „In Kartenmitte“ oder „An meinem Standort“.
3. **Fläche zeichnen** – Eckpunkte antippen, Live-Vorschau mit Hektar, „Rückgängig“, „Fertig“.
4. **Anlegen/Bearbeiten (Formular)** – Name, beim Anlegen „Erste Notiz“ (weitere Notizen in der Detailansicht), **Farbe der Nadel** (8 Vorschlagsfarben + eigene Farbe, zuletzt gewählte Farbe wird vorbelegt), Anzahl Tiere, Herde; Speichern/Abbrechen/Löschen.
5. **Detailansicht (Bottom-Sheet)** – Name, Tierzahl, Herde, Fläche (ha), Datum; **Tagebuch**: alle Notizen chronologisch (neueste oben) mit Datum/Uhrzeit (deutsches Format) und Autor, Feld + Knopf „Notiz hinzufügen“, einzelne Notizen bearbeiten (Text und Zeitpunkt) oder löschen (nur mit Bearbeiten-Recht) – für Nadeln und Flächen; **Route mit km/Fahrzeit**, „Route anzeigen“, **„In Google Maps navigieren“**, Bearbeiten, Löschen.
6. **Liste / Tagebuch** – alle Einträge, neueste zuerst, Farbpunkt je Nadel, Anzahl Notizen und neueste Notiz, Suche über Name, Herde und **alle Notizen**, Filter (Alle/Nadeln/Flächen und nach Farbe), Summe der Tiere; Antippen springt zur Stelle auf der Karte. *Ausbau:* Zeitstrahl/Verlauf pro Nadel.
7. **Einstellungen / Teilen / Export** – eigener Name/Gerät für Notizen, „Geteilte Karte erstellen“, Link zum Ansehen bzw. Bearbeiten kopieren, JSON-Export/-Import, Info zu Kartendienst & Routenanbieter. *Ausbau:* Mitglieder verwalten, Einladungscodes, Anmeldung.

## 5. Teilen & Rollen

- **Prototyp:** Karte bekommt eine zufällige ID. *Ansehen-Link* `…/?karte=ID`, *Bearbeiten-Link* `…/?karte=ID&schluessel=KEY`. Der Server prüft den Schlüssel bei jedem Schreibzugriff (sonst „Nur Lesezugriff“). Alle offenen Geräte bekommen Änderungen sofort per SSE.
- **Produktion:** Anmeldung (E-Mail-Magic-Link oder Google), Einladung per Link oder 6-stelligem Code, Rollen ansehen/bearbeiten/admin, Rechte per Row Level Security; Links widerrufbar.

## 6. Offline-Verhalten

- Jede Karte wird lokal gecacht (localStorage) und ist ohne Netz sichtbar.
- Änderungen ohne Netz landen in einer Warteschlange und werden beim nächsten Verbindungsaufbau gesendet.
- Service Worker hält die App-Hülle offline verfügbar. *Ausbau:* Kartenkacheln des Deichgebiets offline vorhalten; IndexedDB; Konfliktauflösung per `geaendert`-Zeitstempel.

## 7. Erste Umsetzungsschritte (Status)

1. ✅ Projekt anlegen (Vite + React + TS), PWA-Manifest + Service Worker, deutsche UI, mobiles Layout.
2. ✅ Kartenschicht mit automatischer Wahl: Google Maps (bei Key) oder OpenStreetMap/Leaflet.
3. ✅ Nadeln setzen (Knopf „+ Nadel“, Tippen auf Karte, Kartenmitte, eigener Standort), Flächen zeichnen, Formular mit Name/Notiz/Tierzahl/Herde, Bearbeiten, Löschen.
4. ✅ Liste/Tagebuch mit Suche und Filter; Export/Import JSON.
5. ✅ Kleiner Sync-Server (Express + JSON-Dateien + SSE), geteilte Karten per Link, Rollen ansehen/bearbeiten, localStorage als Offline-Cache mit Warteschlange.
6. ✅ Route per Knopf „Route anzeigen“ / „Route ausblenden“ im Detail-Panel (Google Directions bzw. OSRM) + „In Google Maps navigieren“; Antippen löst keine Route mehr aus.
7. ⏭ Google-Cloud-Projekt anlegen, API-Key erstellen, auf Domain beschränken, eintragen und testen.
8. ⏭ Hosting einrichten (HTTPS ist für Standort & PWA-Installation auf dem Handy Pflicht).
9. ⏭ Umstieg Backend auf Supabase (Auth, Rollen, Realtime, EU-Region).

## 8. Spätere Ausbaustufen

- ✅ Mehrere Notizen pro Nadel/Fläche (Tagebuch). Weiter: Umtriebe mit Datum, Tierzahl-Änderungen, „Herde wandert“ (Nadel verschieben erzeugt Tagebucheintrag).
- **Fotos** zu Nadeln (Zaunschaden, Tränke, krankes Tier) – Supabase Storage.
- Eckpunkte von Flächen nachträglich verschieben (Leaflet-Geoman/Terra Draw), Flächen farbig nach Status (belegt/frei/Ruhezeit).
- Weidetage pro Fläche, Ruhezeiten, Erinnerungen („Herde 2 seit 14 Tagen auf Koog 3“).
- Wasser-/Zaunkontrollen als Checkliste, Aufgaben für Mitarbeiter.
- Offline-Karten fürs Deichgebiet, GPS-Track der Kontrollfahrt.
- Export als CSV/PDF (Nachweise für Deichverband, Förderung, Tierseuchenkasse), GeoJSON/KML für GIS.
- Native App über Capacitor (Hintergrund-Standort, Push-Nachrichten).

## 9. Offene Punkte

- **Google-Maps-API-Key** (Google-Cloud-Konto mit Abrechnung) – bis dahin OpenStreetMap.
- **Hosting/Domain** mit HTTPS.
- **Sync-Backend**: Prototyp-Server reicht zum Testen; für den Dauerbetrieb Supabase (oder eigener Server mit Datenbank & Backups).
- OSRM-Demoserver ist nur für Tests gedacht (Fair-Use) – im Betrieb Google Routes oder eigener Routing-Dienst.
- Wer bekommt Zugriff (Mitarbeiter, Familie, Deichverband)? Welche Rollen?

## 10. Hosting (Stand 11.11.2026)

- Ziel: Render Free (Frankfurt) per `render.yaml`: Webservice `weide-tagebuch` + Free-Postgres `weide-tagebuch-db`. Der Server speichert bei gesetztem `DATABASE_URL` in Postgres (Tabelle `karten`, JSONB), sonst in JSON-Dateien. Lokal getestet: Daten und Notizen überstehen einen Neustart.
- Render baut nur aus einem Git-Repo (GitHub/GitLab/Bitbucket). Voraussetzung: GitHub-Verbindung + leeres Repo des Nutzers; dann Push und Blueprint anlegen.
- Free-Grenzen: Einschlafen nach 15 Min. Inaktivität (Aufwachen ~1 Min.), 750 Free-Stunden/Monat, kein dauerhaftes Dateisystem, **Free-Postgres läuft nach 30 Tagen ab** (14 Tage Frist, dann gelöscht). Dauerhaft kostenlos: externe DB wie Supabase/Neon Free über `DATABASE_URL`.

## 11. Nutzerverwaltung (Stand 14.11.2026)

- Pro Karte eine Nutzerliste (gespeichert mit der Karte in Postgres): `{ id, name, rolle: 'nutzer' | 'admin', zugang }`. Jede Person bekommt einen persönlichen Link `?karte=ID&zugang=KEY`; der Zugang wird am Gerät gespeichert und aus der Adresszeile entfernt.
- **Nutzer:** Nadeln/Flächen anlegen, eigene bearbeiten/löschen; Notizen an allen Einträgen hinzufügen, eigene Notizen bearbeiten/löschen. **Admin:** zusätzlich alles bearbeiten/löschen, JSON-Import, Bereich „👥 Nutzer“ (hinzufügen + Link teilen, umbenennen, Rolle ändern, neuen Link erzeugen, entfernen). Mindestens ein Admin bleibt immer.
- Notizen bekommen den Nutzernamen automatisch als Autor (setzt der Server). Einträge merken sich `erstelltVon`.
- **Eigener Name:** Jeder angemeldete Nutzer tippt oben auf seinen Namen (oder ⚙️ → „Meinen Namen ändern“) → Fenster „Mein Name“ → Speichern. Server: `PATCH /api/karten/:id/ich` ändert nur den eigenen Namen (1–40 Zeichen, nicht leer). Die Karte liefert öffentlich `namen` (Nutzer-ID → aktueller Name, nur für Notiz-Autoren, ohne Zugänge); Notizen mit `autorId` zeigen damit bei allen live den neuen Namen. Notizen ohne Nutzer-ID oder von entfernten Nutzern behalten den gespeicherten Namen.
- Alles wird serverseitig geprüft (Header `x-zugang`); entfernte Nutzer verlieren sofort den Zugriff und sehen die Karte nur noch.
- Migration: Der alte Bearbeiten-Schlüssel einer Karte wird zum ersten Admin-Zugang („Admin“, umbenennbar); alte `&schluessel=`-Links funktionieren weiter. Der Ansehen-Link bleibt nur-lesen. Alte Einträge/Notizen ohne Ersteller können nur Admins ändern.

## 12. Kartenwerkzeuge & Liste (Stand 14.11.2026)

- Oben links auf der Karte: **🏷️ an/aus** blendet die Namen unter Nadeln und auf Flächen ein/aus (pro Gerät gespeichert, `wt-beschriftung`).
- Darunter **Farb-Chips** der tatsächlich verwendeten Farben von Nadeln und Flächen (Mehrfachauswahl): gewählte Farben werden dezent hervorgehoben (Nadel etwas größer, dunklerer Rand, heller Schein; Fläche etwas dickerer Rand und kräftigere Füllung), alle anderen bleiben normal; erneutes Tippen hebt auf.
- **Flächenfarbe:** Flächen haben jetzt ein Farbfeld (`farbe`) mit derselben Palette wie Nadeln plus „Grün“ (bisherige Flächenfarbe = Vorgabe für alte Flächen ohne Farbe); wählbar beim Anlegen und Bearbeiten, gilt für Rand und Füllung. Ausgewählte Fläche: weißer, dicker Rand.
- **Liste offen:** Das Listenfenster lässt links einen ca. 64 px breiten Kartenstreifen frei; dort bleiben Standort/Fläche/Nadel (am Handy als runde Symbolknöpfe) sichtbar und bedienbar. „Fläche“/„Nadel“ schließen die Liste und starten das Setzen.

## 13. Nadeln verschieben & Tiersymbole (Stand 14.11.2026)

- **Drag-and-drop:** Nadeln, die man bearbeiten darf (eigene; Admin alle), lassen sich direkt auf der Karte ziehen (Finger runter, ziehen, loslassen). Beim Loslassen wird die Position über die normale Speichern-Warteschlange gesendet (offline-fähig, Server prüft das Recht, live an alle). Hinweis „Nadel verschoben · Rückgängig“ für 7 s. Kurzes Antippen öffnet weiter nur die Details; Karte schwenken bleibt normal; Ansehen-Link und fremde Nadeln (Nutzer) sind nicht ziehbar. Nur im normalen Ansichtsmodus (nicht beim Setzen/Zeichnen/Bearbeiten).
- **Symbol/Tierart** (`tierart`: `schaf` | `bock` | `lamm`, Standard Schaf; alte Nadeln = Schaf): Auswahlfeld „Symbol“ beim Anlegen/Bearbeiten. Anzeige überall mit Symbol und passender Mehrzahl: „🐑 50 Schafe / 1 Schaf“, „🐏 2 Böcke / 1 Bock“, Lamm-SVG „12 Lämmer / 1 Lamm“ (es gibt kein Lamm-Emoji). Liste summiert je Tierart. Auf der Karte erscheinen Symbol + Zahl dezent im Namensschild (nur bei Beschriftung an). Server lässt nur die drei Werte zu.

## 14. Mehrere Tiereinheiten pro Eintrag (Stand 14.11.2026)

- Neues Feld `einheiten: [{ id, art: 'schaf'|'bock'|'lamm', anzahl }]` ersetzt `tiere`/`tierart`. Migration beim Lesen (Server und App): alte Tierzahl + Symbol wird zur ersten Einheit mit fester ID `<eintragId>-t0`; nichts geht verloren. Gespeichert wird das neue Format erst beim nächsten normalen Schreiben der Karte.
- Formular: Abschnitt „Tiere“ mit Zeilen (Anzahl + Tierart), „＋ Tiere hinzufügen“, ✕ entfernt eine Zeile; leere Zeilen fallen beim Speichern weg.
- Anzeige überall zusammengefasst je Art (gleiche Arten addiert): „🐑 25 Schafe · 🐏 2 Böcke · [Lamm] 10 Lämmer“ – Detail, Liste, Listensumme, Kartenlabel (nur bei Beschriftung an).
- Gleichzeitiges Bearbeiten: Der Client schickt `einheitenBasis` (Stand beim Öffnen des Formulars) mit; der Server führt 3-Wege zusammen (unverändert gelassene Einheiten → aktueller Serverstand, geänderte/neue/gelöschte → vom Client, von anderen inzwischen hinzugefügte bleiben). Alte App-Versionen ohne `einheiten` verändern die Einheiten nicht.
- Server-Validierung: max. 50 Einheiten, Art aus der Liste (sonst Schaf), Anzahl ganze Zahl 0–100 000, ungültige Zeilen werden verworfen, IDs eindeutig.

## 15. Tierliste fest/ausblendbar & getrennte Listen (Stand 14.11.2026)

- Pro Eintrag `tierlisteModus: 'fest' | 'ausblendbar'` (fehlt = fest = bisheriges Verhalten). Auswahl „Tierliste“ im Formular (Abschnitt Tiere). Bei „ausblendbar“ kann jeder Betrachter die Tierliste in der Detailansicht (▾/▸-Knopf) und im Kartenschild (Knopf im Schild, öffnet nicht die Details) ein-/ausklappen; der Zustand wird pro Gerät gemerkt (`wt-tiere-zu`). Bei „fest“ immer sichtbar ohne Knopf. Server lässt nur die zwei Werte zu; ältere App-Versionen ohne das Feld behalten den gespeicherten Wert.
- Liste mit zwei strikt getrennten Reitern **📍 Nadeln (n) | ⬠ Flächen (m)** statt „Alle/Nadeln/Flächen“; jeder Reiter zeigt alle seine Einträge. Summen je Reiter (Anzahl, bei Flächen Hektar, Tiere). Farbfilter nur mit Farben des Reiters; ist Suche oder Farbfilter aktiv, erscheint ein deutlicher Hinweis „Filter aktiv … X von Y angezeigt“ mit „Alle zeigen“. Gewählter Reiter wird pro Gerät gemerkt.
