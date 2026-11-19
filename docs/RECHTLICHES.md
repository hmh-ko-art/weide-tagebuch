# Rechtliches in FlockMap

> **ENTWURF – vor Verkauf anwaltlich prüfen lassen.**
> Impressum, Datenschutzerklärung und vor allem die Nutzungsbedingungen (AGB) sind sorgfältig nach dem tatsächlichen
> Verhalten der App formuliert, ersetzen aber keine Rechtsberatung. Platzhalter stehen in `[eckigen Klammern]`.

## Wo steht was?

| Was | Datei |
|---|---|
| Betreiberdaten (Firma, Anschrift, Gesellschafter, Telefon, E-Mail, USt-IdNr.), Hoster-Texte, Stand-Datum, Aufsichtsbehörde | `src/recht/betreiber.ts` – **nur hier ändern** |
| Texte Impressum / Datenschutz / Nutzungsbedingungen / Kartenquellen | `src/recht/Recht.tsx` |
| Hinweis beim ersten Start | `src/recht/ErsterStart.tsx` (Version `HINWEIS_VERSION` in `betreiber.ts` erhöhen → wird allen erneut gezeigt) |
| „Meine Daten“ (Auskunft, Export, Gerät leeren, Zugang löschen) | `src/recht/MeineDaten.tsx`, Server `GET/DELETE /api/karten/:id/ich…` |
| Karte/Hof löschen (Papierkorb 30 Tage) | `src/recht/Loeschen.tsx`, Server `/loeschen`, `/wiederherstellen`, `/endgueltig` |

Betreiberdaten stammen aus dem Impressum von https://heckernatur.de/impressum (abgerufen am 19.11.2026).
Es werden ausschließlich `heckernatur.de` / `info@heckernatur.de` verwendet.

Die Seiten sind Teil der App (kein Nachladen) und deshalb auch **offline** erreichbar: Einstellungen → „Datenschutz &
Rechtliches“, Fußzeile der Einladungs- und PIN-Anmeldeseite, Betreiber-Seite, Karten-Quellenangabe unten rechts,
direkt per Adresse `…/#recht/impressum`, `#recht/datenschutz`, `#recht/nutzung`, `#recht/quellen`.

## Hoster umstellen (Render → Hetzner)

Der Datenschutztext enthält den aktuellen Hoster. Umschalten per Build-Variable:

- **Render** (Standard, `VITE_HOSTER` nicht gesetzt): Render Services, Inc. (USA), Server in Frankfurt; Text mit
  Standardvertragsklauseln/Data Privacy Framework und Hinweis „Umzug zu Hetzner geplant“.
- **Hetzner**: `VITE_HOSTER=hetzner` – ist im `Dockerfile` und in `deploy/docker-compose.yml` für den eigenen Server
  bereits voreingestellt. Der Hinweis auf den geplanten Umzug verschwindet automatisch.

Nach dem Umzug: `STAND` in `betreiber.ts` aktualisieren, AVV mit Hetzner abschließen (Hetzner-Konsole → Datenschutz).

## Datenschutz-Entscheidungen (zur Erklärung)

- **Zugang löschen = pseudonymisieren, nicht alles löschen.** Name, Rolle, Zugangsschlüssel und PIN werden sofort
  entfernt. Einträge/Notizen bleiben als Betriebsaufzeichnungen des Hofs (berechtigtes Interesse des Betriebs,
  Art. 6 Abs. 1 lit. f, Art. 17 Abs. 3 DSGVO; Tierhaltung ist dokumentationspflichtig), werden aber auf
  „ehemaliger Nutzer“ umgestellt: `notizen[].autor` → „ehemaliger Nutzer“, `autorId` entfernt, `erstelltVon`/`geaendertVon`
  → `ehemalig`, `gruppen[].von` und `einladung.von` entfernt, automatische Konflikt-Notizen („… von NAME (…)“) ersetzt.
  Frei geschriebener Notiztext wird nicht verändert – wer dort Namen nennt, muss die Notiz selbst löschen (Hinweis in der App).
- **Schutz vor Verwaisung:** Der letzte Inhaber eines Hofs bzw. der letzte Admin einer Karte kann sich nicht selbst
  löschen (erst Rolle übertragen oder ganze Karte/Hof löschen). Die einzige Person einer Karte wird auf „Karte löschen“ verwiesen.
- **Karte/Hof löschen:** Bestätigung durch exaktes Eintippen des Namens + Häkchen „Sicherung heruntergeladen“.
  Danach 30 Tage Papierkorb (`geloescht: {am, bis, von}`): Alle Zugriffe außer Admin/Inhaber erhalten `410`, Live-Verbindungen
  werden beendet, Einladungen und PIN-Anmeldung sind gesperrt. Admin/Inhaber können lesen, exportieren, wiederherstellen
  oder sofort endgültig löschen. Abgelaufenes wird beim Serverstart und stündlich endgültig entfernt.
  Einzelne Hof-Karten löscht der Inhaber; die letzte Karte nur über „Hof löschen“.
- **Gerät:** keine Cookies; localStorage/IndexedDB/Cache Storage sind technisch notwendig (§ 25 Abs. 2 Nr. 2 TDDDG) →
  kein Einwilligungsbanner, nur ein einmaliger Info-Hinweis. „Daten auf diesem Gerät löschen“ entfernt alles mit Präfix `wt-`,
  die IndexedDB `flockmap` und alle Caches `flockmap-*`.
- **Server-Protokolle:** FlockMap schreibt keine Zugriffsprotokolle. IP-Adressen nur im Arbeitsspeicher (max. 1 Stunde)
  für die Begrenzung von Fehlversuchen. Plattform-Logs des Hosters siehe Datenschutzerklärung.

## Prüfliste vor dem Verkauf (vom Betreiber zu klären)

1. **Anwaltliche Prüfung** von Datenschutzerklärung und Nutzungsbedingungen (Haftung, Gewährleistung, Widerruf).
2. **Impressum-Daten bestätigen** (Anschrift, Gesellschafter, Telefon) – übernommen von heckernatur.de.
3. **Routen (OSRM-Demo-Server, FOSSGIS e.V.)**: laut Nutzungsrichtlinie nur für nicht-kommerzielle Nutzung und geringe Last.
   Für den Verkauf: eigenen OSRM-Server (z. B. auf dem Hetzner-Server) oder kommerziellen Anbieter verwenden – oder Routen abschalten.
4. **Esri-Satellitenbilder**: Nutzungsbedingungen für kommerzielle Apps prüfen (ggf. ArcGIS-Location-Platform-Konto mit API-Schlüssel nötig).
5. **OpenStreetMap-Kacheln**: Tile Usage Policy (keine starke/kommerzielle Last) – bei Wachstum eigenen Kachelanbieter nutzen.
6. **Render**: Auftragsverarbeitungsvertrag (DPA) und Status im EU-US Data Privacy Framework prüfen/abschließen – oder Umzug zu Hetzner.
7. **Auftragsverarbeitungsvertrag (Art. 28 DSGVO)** als Muster für Käufer-Höfe erstellen (Hecker Natur verarbeitet deren Personaldaten im Auftrag).
8. **AGB-Platzhalter**: Preis, USt.-Angabe, Bestellweg/Zahlung, Laufzeit/Hosting-Dauer, max. Personen, Ankündigungsfrist bei Einstellung,
   Gerichtsstand, vollständige Widerrufsbelehrung + Muster-Widerrufsformular, Formulierung zum vorzeitigen Erlöschen (§ 356 Abs. 5 BGB).
9. **Sicherungskopien**: In der Datenschutzerklärung steht „nach spätestens 90 Tagen gelöscht“ – so auch umsetzen (alte Dateien in `backups/` regelmäßig löschen).
10. **Render-Adresse** in `betreiber.ts` (525 Brannan Street, San Francisco) gegen das aktuelle Render-Impressum prüfen.
