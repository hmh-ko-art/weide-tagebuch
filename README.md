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

## Weideplan

**Seit 7j in der Oberfläche ausgeblendet** (kein Kalender-Knopf, keine Plan-Ansichten, keine Plan-Farben auf der Karte). Gespeicherte Weideplan-Daten bleiben unverändert in der Datenbank, in Sicherung, Export und Import erhalten. Die Flächen-Fristen stehen jetzt in der Flächen-Übersicht. Code: `server/weideplan.js` (gemeinsame Logik für Server **und** App, Typen in `weideplan.d.ts`), `src/weideplan/`.

- **Daten** (`karte.weideplan`, nur vorhanden wenn genutzt – alte Karten bleiben byte-gleich): `herden[]` (id, name, farbe), `belegungen[]` (herde, flaeche = Eintrags-ID einer Fläche *oder* Nadel, tiere {schaf,bock,lamm}, von, bis = geplant bis, ende, naechste, status geplant/aktiv/beendet), `bewegungen[]` (Protokoll: art auftrieb/umtrieb/abtrieb, datum, von/nach als Orts-Schnappschuss {id,name,lat,lng}, tiere, autor/autorId, zeitpunkt, optional `karte` = Delta der Tierzahl-Einheiten), `ruhetage` (Standard 28) und `ruhe{flaecheId: Tage}`.
- **Bewegungs-Protokoll** ist bewusst so gebaut, dass der spätere Schritt „Tierbewegungen“ (HI-Tier-Meldungen, Bestandsregister) direkt darauf aufsetzen kann.
- **API**: `PUT/DELETE /api/karten/:id/weideplan/herden/:hid`, `PUT/DELETE …/belegungen/:bid` (mit `basisGeaendert` → Konflikt-Erkennung), `POST …/umtrieb` (idempotent über `op.id`), `POST …/umtrieb/:bid/zurueck` (nur letzter Umtrieb einer Herde), `DELETE …/bewegungen/:bid` (Admin), `PUT …/einstellungen`. Alles über den Offline-Postausgang; doppelte Umtriebe von zwei Geräten → 409 mit Hinweis.
- **Status**: belegt (blau) · ruht seit X Tagen (gelb) · bereit (grün, Ruhezeit erreicht) · keine Daten (grau). Optional als Kartenfarben („Status auf der Karte“).
- **Erinnerungen** nur in der App (Badge + Liste „Fällig“). Kein Web-Push: Render-Free schläft (kein verlässlicher Zeitgeber), Push braucht VAPID + gespeicherte Abos (neue personenbezogene Daten), unter iOS nur als installierte App. Auf Hetzner mit `web-push` kostenlos nachrüstbar.
- **Export**: JSON-Sicherung inkl. Plan (ohne Personen-IDs), Excel-Blätter „Weideplan“ und „Umtriebe“, PDF-Abschnitt „Weideplan“.

## Zäune & Wasser

Code: `server/infrastruktur.js` (gemeinsam für Server **und** App: Arten, Längen, Tore, Geräte-Fälligkeit, Prüfen der Daten; Typen in `infrastruktur.d.ts`), `src/infra/Infra.tsx`, `src/map/symbole.ts`.

- **Linien** (`typ: 'linie'`): `punkte[]` (2–2000), `linienArt` (elektronetz, festzaun, litze, weg, graben, sonstiges – Farbe/Strich je Art, eigene Farbe möglich), `geschlossen` (Ring), `flaeche` (Zaun um Fläche), `tore[]` ({id, pos = Meter ab Anfang, breite 1–20 m}, Lücke wird von der Länge abgezogen). Länge per Haversine, Netze = ⌈m / 50⌉.
- **Technik-Punkte**: normale Nadeln mit `infra` (traenke, geraet, tor, unterstand, salz); Weidezaungerät mit `geraet` {strom, stand, kv, intervall (Standard 7 Tage), geprueft, pruefungen[≤30]}. Keine Tiere, keine Gruppe.
- **Bedienung**: „〰 Zaun“ zeichnen (Live-Länge + Netze), „Punkte bearbeiten“ (ziehen, ＋ einfügen, löschen; auch für Flächen), „Tore setzen“, Fläche → „Zaun um Fläche erzeugen“. Liste: Reiter „Zäune & Wasser“ mit Ein-/Ausblenden je Art (pro Gerät, `wt-infra-aus`), Kartenknopf blendet alles aus.
- **Geräte-Prüfung**: `POST /api/karten/:id/eintraege/:eid/geprueft` {id, datum, kv?, stand?} – jede Person mit Schreibrecht (auch Mitarbeiter, auch fremde Geräte), idempotent über die Prüf-ID, offline über den Postausgang. Fällige/überfällige Prüfungen und leere Akkus zählen im Weideplan-Badge und stehen unter „Jetzt“.
- **Alte App-Versionen**: sehen Linien als Umriss, Technik als normale Nadel; speichern sie eine Technik-Nadel, behält der Server `infra`/`geraet` (Feld fehlt ≠ `infra: null`). Prüfungen werden beim Speichern zusammengeführt, nie überschrieben.
- **Export/Import**: Excel-Blätter „Zäune & Wasser“ und „Geräte-Prüfungen“, PDF-Kapitel, KML-Ordner „Zäune & Wege“ (LineStrings mit Stil) und „Wasser & Technik“ (ExtendedData `flockmap_technik` für die exakte Rundreise). Import: KML/GeoJSON-LineString/MultiLineString → Linie (Art aus Name/Ebene geraten, Farbe aus dem Linienstil), Technik-Punkte optional am Namen erkannt.

## Flächen, Pacht & Förderfristen

Code: `server/flaechen.js` (gemeinsam für Server **und** App: Messen, Steckbrief/Pacht prüfen, Fristen-Fälligkeit, Summen; Typen in `flaechen.d.ts`), `src/flaechen/Flaechen.tsx`, `src/austausch/flaechenliste.ts`, `src/austausch/shp.ts`.

- **Messen**: Fläche (m²/ha) und Umfang auf dem WGS84-Ellipsoid (lokale Projektion), live beim Zeichnen und Punkte-Bearbeiten; Warnung bei sich kreuzendem Umriss. Löcher werden nicht abgezogen.
- **Steckbrief** (`flaeche.steckbrief`): art (gruenland, deich, vorland, ackerfutter, sonstiges), besitz (eigentum/pacht), flik, schlag, programme[], fristen[] ({id, art: beweiden_ab|schnitt_bis|antrag_bis|sonstige, datum, jaehrlich, programm, text, erledigt: {datum, autor, autorId, am}}). Jährliche Fristen rollen nach „erledigt“ bzw. 30 Tage nach Ablauf ins Folgejahr. `beweiden_ab` = Sperre bis zum Termin (jährlich: 1.1. bis Termin); belegte gesperrte Fläche = überfällig.
- **Frist erledigt**: `POST /api/karten/:id/eintraege/:eid/fristen/:fid/erledigt` {datum} bzw. {datum: null} (rückgängig) – jede Person mit Schreibrecht, idempotent, offline über den Postausgang; 409 `frist-weg`.
- **Pacht** (nur Admin/Inhaber): `karte.pacht[flaecheId]` {verpaechter, preisHa, ha, beginn, ende, kuendigungMonate, erinnerung, erledigt, notiz, geaendert}. `GET /api/karten/:id/pacht`, `PUT /api/karten/:id/pacht/:fid` {pacht|null, basisGeaendert} (Konflikt: neuere Fassung gewinnt, Meldung). Nie in `oeffentlich()`/SSE – nur `pachtVersion`. Erinnerung an `erinnerung` bzw. „kündigen bis“ (Ende − Frist) − 60 Tage.
- **Fällig**: Fristen ≤ 30 Tage und Pacht-Erinnerungen zählen im Weideplan-Badge und stehen unter „Jetzt“.
- **Übersicht**: Liste → Flächen → „📊 Übersicht, Pacht & Summen“ (Summen gesamt/Pacht/€ je Jahr/je Art, sortierbare Tabelle, Excel/PDF „Flächenverzeichnis“).
- **Export/Import**: Excel-Blätter „Flächenverzeichnis“, „Flächen-Summen“, „Fristen“; PDF-Kapitel; KML-ExtendedData `flockmap_steckbrief` (+ `flockmap_pacht` nur mit Admin-Option); JSON-Sicherung inkl. Pacht (nur Admin). Import: KML/GeoJSON (FLIK/Schlag/Nutzung aus Attributen geraten, MultiPolygon → mehrere Flächen) und Shapefile-ZIP (.shp/.dbf/.prj; WGS84 oder ETRS89/UTM 32/33 – Gauß-Krüger nicht unterstützt; nur Außenringe).

## Weide-Technik: nur noch Tränke und Weidezaungerät, kompakte Farbauswahl (7j)

- Beim Anlegen einer Nadel stehen unter „Was ist hier?“ nur noch **📍 Nadel, 💧 Tränke, ⚡ Zaungerät** zur Wahl. **Tor, Unterstand, Salzleckstein** sind entfallen, auch die automatische Erkennung am Namen beim KML-Import.
- **Altbestand bleibt:** Vorhandene Einträge dieser Arten werden weiter angezeigt, lassen sich bearbeiten (Chip „(alt)“) und löschen und bleiben in Export, Sicherung und Wiederherstellung erhalten. Der Server nimmt sie weiter an (ältere App-Versionen, Sicherungen).
- **Farbauswahl kompakt:** Überall (Nadel/Fläche/Linie bearbeiten, Gruppe, Kreis-Blatt, freier Kreis, Kreis-Palette auf der Karte) steht nur noch ein Knopf **„Farbe“ mit der aktuellen Farbe**. Antippen klappt die Palette auf, die Wahl klappt sie wieder zu (Tippen daneben schließt sie auch).
- **„Nadel bearbeiten“ aufgeräumt:** „Was ist hier?“ in einer Zeile, Farbe als ein Knopf, bei Tieren zuerst „＋ Tiere hinzufügen“ und darunter die Tierliste-Einstellung, Datum und Herde gleich hoch nebeneinander, Speichern/Abbrechen unten fest sichtbar, Löschen nur noch als kleiner Textknopf, kürzere Hinweise und weniger Abstände.
- „🚪 Tore setzen“ an Zaunlinien (Lücken, die von der Länge abgezogen werden) ist davon unabhängig und bleibt.
- **Weideplan ausgeblendet, Fristen in der Flächen-Übersicht:** Der Kalender-Knopf ist weg (Daten bleiben gespeichert). Förder-/Sperrfristen und Pacht-Kündigungsfristen stehen als **„📋 Fällige Fristen“** oben in der Flächen-Übersicht, jeweils mit „✓ Erledigt“ und „Zeigen“. Ein rotes Abzeichen am **Liste-Knopf** zählt fällige Fristen und fällige Geräte-Prüfungen; in der Liste zeigen der Reiter „Flächen“ (Fristen) und „Zäune & Wasser“ (Geräte) die Zahl ebenfalls.
- **Kartenansicht in den Einstellungen:** Der Ebenen-Knopf oben rechts auf der Karte ist weg. Satellit / Satellit ohne Beschriftung / Karte (OpenStreetMap) wählt man unter **Einstellungen → Darstellung → Kartenansicht** (gilt für dieses Gerät).
- **Mehr Platz für die Karte:** Kopfleiste auf dem Handy schmaler (eine Zeile Titel, kleine Statuszeile). Oben links nur noch **ein Knopf 👁 „Ansicht“**, der Beschriftung, Zäune ein/aus und die Farb-Hervorhebung aufklappt; ein Punkt am Knopf zeigt, wenn etwas aus- oder hervorgehoben ist. Die +/- Zoomknöpfe gibt es nur noch am PC, auf dem Handy wird mit zwei Fingern gezoomt.

## Infokarten unten links (7i)

- **Ein Stapel statt vieler Boxen:** Hinweise (z. B. „Nadel gesetzt“, „Nadel verschoben“, Meldungen) und die aktive Infokarte (Nadel, Fläche, Zaun, freier Kreis, Kreis-Blatt, Zeichnen, Bearbeiten) liegen in **einem** Bereich unten links – Hinweise immer oben drauf, nichts überlappt.
- **Einheitliche Karten:** Kopfzeile mit Symbol + Name, darunter eine **Zusammenfassung als Chips** (Tiere, ⚡ letzte Spannung, ◯ Radius, ha/Länge, Gruppe, 📝 Notizen).
- **Einklappen ▾:** Karte schrumpft auf Kopf + Zusammenfassung (Karte bleibt frei); Antippen klappt wieder auf. Der Zustand wird je Kartenart auf dem Gerät gemerkt. Das Kreis-Blatt behält eingeklappt seine Speichern-Knöpfe.
- **Nebensachen hinter „Mehr“:** Navigieren (Google Maps), Route, Farbe, Gruppe, Herde, Datum, Geändert, Tiere ein/aus, Löschen. Vorne bleiben Bearbeiten, Weidezaungerät/Kreis/Steckbrief und das Tagebuch (seit 7j steht auch „Navigieren“ hinter „Mehr“).
- **Hinweise verschwinden von selbst:** Rückgängig-Hinweise mit Countdown-Balken; Meldungen antippen = weg; Erklärtexte beim Setzen/Zeichnen werden nach 6 s zur Kurzfassung (ⓘ zeigt sie wieder).
- **Platz:** Handy – ＋-Knopf und Karten-Quellenangabe rücken über den Stapel (Safe-Area berücksichtigt); PC – Karte schwebt links unten über der Quellenangabe, nie unter der rechten Seitenleiste oder den Kartenknöpfen oben links.

## Freier Kreis und vorläufige Kreise (7h)

- **Freier Kreis:** ein Kreis ohne Nadel.
  - Handy: ＋-Menü → **◯ Kreis**, dann auf die Karte tippen.
  - PC: Seitenleiste → **◯ Kreis** anklicken und in die Karte klicken, oder das Symbol auf die Karte ziehen.
  - Die Stelle wird die Mitte. Danach Radius (Griff, Zahl oder 10/20/30/50/100), Farbe und optional „Standard-Radius“ wählen, dann **✓ Kreis setzen**. Antippen der Karte verschiebt dabei die Mitte.
  - Tippen auf den Ring oder langes Drücken öffnet die Palette mit Farbe, **Radius …** und **✂️ Abgebaut** (Abgebaut entfernt den Kreis).
  - In der Liste steht er im Reiter „Nadeln“ unter **◯ Freie Kreise**, mit Name, Notizen und Löschen wie bei anderen Einträgen.
  - Export: Excel-Blatt „Einkreisungen“ (Art „Freier Kreis“), PDF und KML (Ordner „Einkreisungen“). Die JSON-Sicherung enthält alles.
  - Offline und Sync funktionieren. Rechte wie bei Flächen: Anlegen dürfen alle mit Bearbeitungsrecht, ändern die Person, die ihn angelegt hat, oder ein Admin.
  - Technisch ist ein freier Kreis eine Nadel mit `frei: true` (Mitte = Position). Ältere App-Versionen zeigen ihn als Nadel mit Kreis.
- **Vorläufige Kreise beim Verschieben:** Wird eine Nadel aus ihrem festen Kreis („bleibt am Standort“) heraus verschoben, ändert sich zunächst nur die Position.
  - Der neue Kreis erscheint **gestrichelt** mit Countdown, der alte bleibt, wo er war.
  - Erst wenn der Rückgängig-Countdown (5/10/20 s) abläuft, wird der alte Kreis als „alter Standort“ zurückgelassen und der neue gespeichert.
  - Erneutes Verschieben innerhalb des Countdowns ersetzt die Vorschau, es entsteht keine Kreis-Spur. Rückgängig verwirft alles.
  - Geht die App in den Hintergrund oder wird geschlossen, wird sofort endgültig gespeichert.
  - Gesendet und synchronisiert wird nur die Position und danach der endgültige Zustand.

## Bedienknöpfe: Handy und PC (7g)

- **Handy (bis 600 px Breite):** Unten rechts ist nur noch ein runder **＋**-Knopf. Antippen öffnet das Menü mit Nadel, Standort, Fläche und Zaun; das ＋ wird zum ×. Das Menü schließt nach einer Auswahl, beim Tippen daneben oder bei einem zweiten Tipp auf ×. Tippen daneben setzt keine Nadel. Wer nur ansehen darf, sieht nur den Standort-Knopf.
- **PC (ab 900 px):** Die Seitenleiste ist wieder **rechts**. Eingeklappt ist sie eine schmale Leiste mit „« Liste“, Nadel, Standort, Fläche und Zaun. Aufgeklappt stehen dieselben Werkzeuge oben über der Liste; mit » klappt sie wieder ein. Die Karte wird dabei schmaler, nichts schwebt über ihr.
  - **Nadel:** auf die Karte **ziehen und loslassen**. Die Nadelspitze landet genau dort, wo du loslässt. Alternativ „Nadel“ klicken und dann in die Karte klicken, oder direkt in die Karte klicken.
  - **Fläche/Zaun:** klicken startet das Zeichnen. Wer das Symbol auf die Karte zieht, setzt dort gleich den ersten Punkt.
- **Tablet (601–899 px):** unverändert.

## Nadel setzen (7e)

- Tippen/Klicken auf die Karte (Ansicht ohne Auswahl oder nach „＋ Nadel“) setzt die Nadel **sofort genau an der Stelle** und speichert sie (Farbe = zuletzt benutzte, ohne Namen; offline in der Warteschlange). Kein Fadenkreuz/„Kartenmitte“ mehr; „📍 An meinem Standort“ bleibt als eigene Option im Setz-Modus.
- Danach Hinweis „📍 Nadel gesetzt“ mit **Benennen** (öffnet das Formular) und **Rückgängig (n s)** – Countdown einstellbar unter Einstellungen → Darstellung: 5 / 10 / 20 s (Standard 10 s, `localStorage['wt-rueckgaengig-s']`, gilt auch für „Nadel verschoben“).
- Die neue Nadel ist ausgewählt und sofort verschiebbar; ist sie unter der Leiste verdeckt, schiebt die Karte nur (kein Zoom).
- Zeichnen (Fläche/Zaun), Kreis-Mitte setzen, Tor-Modus und offene Paletten haben Vorrang vor dem Nadel-Setzen.

## Weidezaungerät an der Nadel (7f)

Ein Weidezaungerät gehört fest zu einer Nadel (einem Pferch) und wandert mit ihr mit. Gespeichert wird nur die Spannung.

- **Eintragen:** Nadel antippen → Feld „⚡ Weidezaungerät“ → Zahl in kV eintippen (z. B. `6,2`, Zahlentastatur) → **⚡ Speichern**. Datum, Uhrzeit und Name werden automatisch gespeichert.
- **Eine Messung pro Tag:** Ein zweiter Wert am selben Tag ersetzt den ersten. Der Knopf heißt dann „⚡ Ersetzen“.
- **Anzeige:** An der Nadel auf der Karte und in der Liste steht ein kleines Schild „⚡ 6,2“. Es ist rot, wenn der Wert unter der Warnschwelle liegt. In der Nadel stehen letzter Wert, Tag und Name, darunter der Verlauf der letzten 14 Tage. Gespeichert werden bis zu 60 Tage.
- **Warnschwelle:** Einstellungen → Zaunspannung, Standard 4 kV. Sie gilt für diese Karte auf diesem Gerät.
- **Rollen:** Admins und Mitarbeiter können an allen Nadeln messen. Wer nur ansehen darf, sieht die Werte, kann aber nichts eintragen. Beim Bearbeiten einer Nadel bleiben die Messungen immer erhalten.
- **Offline:** Messungen werden wie alles andere gespeichert und gesendet, sobald wieder Netz da ist.
- **Export:** Das Excel-Blatt „Zaunspannung“ und ein PDF-Kapitel enthalten Nadel, Datum, Uhrzeit, kV, „unter Schwelle“ und den Namen. Die JSON-Sicherung enthält die Messungen ohne interne Nutzer-IDs.
- **Google-Ansicht:** Kein Schild. Der Wert steht im Tooltip der Nadel.

## Kreis um Nadel („eingezäunt“)

Code: `server/flaechen.js` (`kreisSauber`, `kreisMasse`, `kreisPolygon`, `kreisMitte`), `src/kreis/Kreis.tsx`, `src/austausch/kreise.ts`.

- **Daten**: `pin.kreis` = {radius (3–2000 m), farbe?, gebunden (Standard true), mitte, seit?}. `gebunden`: Mitte = Nadel (wandert beim Verschieben mit; Server setzt `mitte` = Position). `gebunden: false`: feste Mitte, bleibt beim Verschieben der Nadel stehen (gestrichelte Verbindungslinie). `kreis: null` = abgebaut. Fehlt das Feld (alte App), behält der Server den Kreis.
- **Bedienung**: Nadel antippen → „◯ Einkreisen“ → Radius per Griff am Rand, Zahl oder Schnellwahl (10/20/30/50/100 m), Farbe, gebunden/fest (fester Kreis: Tippen auf die Karte versetzt die Mitte); Anzeige ≈ ha, m², Umfang, Netze à 50 m. „✂️ Abgebaut“ entfernt ihn mit einem Tipp. Rechte wie beim Bearbeiten der Nadel.
- **Mehrere Kreise / alter Standort** (7c): `pin.kreiseStehen` = Liste {id, radius, farbe?, gebunden:false, mitte, seit?} (max. 50). Wird eine Nadel mit festem Kreis („bleibt am Standort“) aus ihrem Kreis heraus verschoben, wandert der alte Kreis nach `kreiseStehen` und um die neue Position entsteht ein neuer Kreis mit Standard-Radius und -Verhalten; die Farbe folgt der Nadel (neuer und alter Kreis behalten die Farbe des bisherigen Kreises, fest gespeichert). Rückgängig stellt beides wieder her. Fehlt das Feld (alte App), behält der Server die Liste. `FL.alleKreise(e)` liefert alle Kreise für Karte/Export.
- **Vorgaben pro Karte und Gerät** (7c): `localStorage['wt-kreis-vorgaben:<kartenId>']` = {radius (Standard-Radius für neue Kreise), gebunden (zuletzt gewählt), farbe}. Leiste: Häkchen „Standard-Radius für alle neuen Kreise“ (bei neuen Kreisen an), Knopf „… auf alle anderen Kreise übernehmen“, zwei große Knöpfe „🔗 An Nadel gebunden“ / „📍 Bleibt am Standort“ = speichern mit einem Tipp. Beim Einkreisen wird nicht gezoomt (`Fokus.nurSichtbar`: nur verschieben, falls verdeckt).
- **Farbe direkt am Kreis** (7c): Tipp auf einen Kreis (Ansicht, mit Bearbeitungsrecht) → kleine Palette (`KreisPop`): Farbe = sofort gespeichert; „Radius …“ (aktueller Kreis), „✂️ Abgebaut“.
- **Antippen / Farbe** (7e): Die Kreisfläche ist nicht antippbar – Tippen in einen Kreis setzt eine Nadel genau dort. Farbpalette: Tipp auf den Kreisrand (unsichtbarer, ~22 px breiter Trefferring `path.kreis-ring`) oder langes Drücken (550 ms, eigene Pointer-Geste; PC: Rechtsklick) irgendwo im Kreis → innerster eigener Kreis. Google-Ansicht: nur langes Drücken/Rechtsklick. Füllung kräftiger (aktuell 0,38, alter Standort 0,28, ausgewählt 0,45).
- **Export/Import**: Excel-Blatt „Einkreisungen“, PDF-Kapitel, KML-Ordner „Einkreisungen“ (Kreis als 48-Eck, `flockmap_kreis_fuer` + `flockmap_kreis` → beim Re-Import wieder an die Nadel gehängt), JSON-Sicherung enthält `kreis` und `kreiseStehen`; Kreise am alten Standort tragen in KML `flockmap_kreis_stehen=1`.

## Rechtliches & Datenschutz

**Entwurf – vor Verkauf anwaltlich prüfen lassen.** Details, Entscheidungen und Prüfliste: [`docs/RECHTLICHES.md`](docs/RECHTLICHES.md).

- In-App-Seiten Impressum, Datenschutz, Nutzungsbedingungen (AGB-Entwurf), Kartenquellen (`src/recht/`), offline verfügbar, erreichbar über Einstellungen, Einladungs-/PIN-Seite und `#recht/<seite>`.
- Alle Betreiber- und Hoster-Angaben zentral in `src/recht/betreiber.ts`; Hoster per `VITE_HOSTER=render|hetzner`.
- „Meine Daten“: Auskunft + Export (`GET /api/karten/:id/ich/daten`), Gerät leeren, eigenen Zugang löschen (`DELETE /api/karten/:id/ich`, Einträge bleiben pseudonymisiert als „ehemaliger Nutzer“).
- Karte/Hof löschen mit 30 Tagen Papierkorb: `POST /api/karten/:id/loeschen|wiederherstellen|endgueltig`, `POST /api/hoefe/:hid/loeschen|wiederherstellen|endgueltig`; automatische Endlöschung stündlich.
- Einmaliger Hinweis beim ersten Start (kein Tracking, keine Cookies).
