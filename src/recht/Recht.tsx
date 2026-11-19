// Rechtliche Seiten (Impressum, Datenschutz, Nutzungsbedingungen, Kartenquellen) als Overlay über jeder Ansicht.
// Aufruf über den Adress-Anker #recht/<seite> – funktioniert in der Karte, beim Hof-Beitritt, bei der PIN-Anmeldung
// und offline (die Texte sind Teil der App, nichts wird nachgeladen).
import { useEffect, useState, type ReactNode } from 'react'
import { BETREIBER as B, AKTIVER_HOSTER as H, GEPLANTER_HOSTER, STAND, AUFSICHT } from './betreiber.ts'
import { HAT_GOOGLE_KEY } from '../map/Karte.tsx'

export const SEITEN = { impressum: 'Impressum', datenschutz: 'Datenschutz', nutzung: 'Nutzungsbedingungen', quellen: 'Kartenquellen' } as const
export type Seite = keyof typeof SEITEN

const aktuelleSeite = (): Seite | null => {
  const m = /^#recht\/(\w+)/.exec(location.hash)
  return m && m[1] in SEITEN ? (m[1] as Seite) : null
}
export function rechtOeffnen(s: Seite) { location.hash = 'recht/' + s }

// Fußzeile mit den Links – überall gleich
export function RechtLinks({ klein }: { klein?: boolean }) {
  return (
    <nav className={'recht-links' + (klein ? ' klein' : '')} aria-label="Rechtliches">
      {(Object.keys(SEITEN) as Seite[]).map((s) => <a key={s} href={'#recht/' + s}>{SEITEN[s]}</a>)}
    </nav>
  )
}

export function RechtOverlay() {
  const [seite, setSeite] = useState<Seite | null>(aktuelleSeite)
  const schliessen = () => {
    history.replaceState(null, '', location.pathname + location.search)
    setSeite(null)
  }
  useEffect(() => {
    const f = () => setSeite(aktuelleSeite())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  useEffect(() => {
    if (!seite) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessen() }
    window.addEventListener('keydown', f)
    document.querySelector('.recht-inhalt')?.scrollTo(0, 0)
    return () => window.removeEventListener('keydown', f)
  }, [seite])
  if (!seite) return null
  return (
    <div className="recht" role="dialog" aria-modal="true" aria-label={SEITEN[seite]}>
      <header className="recht-kopf">
        <h2>{SEITEN[seite]}</h2>
        <button className="recht-zu" onClick={schliessen} aria-label="Schließen">✕</button>
      </header>
      <nav className="recht-reiter">
        {(Object.keys(SEITEN) as Seite[]).map((s) => (
          <a key={s} href={'#recht/' + s} className={s === seite ? 'aktiv' : ''} aria-current={s === seite ? 'page' : undefined}>{SEITEN[s]}</a>
        ))}
      </nav>
      <div className="recht-inhalt">
        {seite === 'impressum' && <Impressum />}
        {seite === 'datenschutz' && <Datenschutz />}
        {seite === 'nutzung' && <Nutzung />}
        {seite === 'quellen' && <Quellen />}
        <p className="recht-stand">Stand: {STAND}</p>
      </div>
    </div>
  )
}

const A = ({ titel, children }: { titel: string; children: ReactNode }) => <section><h3>{titel}</h3>{children}</section>
const Mail = () => <a href={'mailto:' + B.email}>{B.email}</a>
const Ext = ({ href, children }: { href: string; children: ReactNode }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>

function Anschrift() {
  return <p>{B.firma}<br />{B.strasse}<br />{B.ort}<br />{B.land}</p>
}

function Impressum() {
  return (
    <>
      <p>FlockMap ist ein Angebot der {B.firma}.</p>
      <A titel="Angaben gemäß § 5 DDG">
        <Anschrift />
        <p>Vertreten durch die vertretungsberechtigten Gesellschafter: {B.vertreten.join(' und ')}</p>
      </A>
      <A titel="Kontakt">
        <p>Telefon: {B.telefon}<br />E-Mail: <Mail /><br />Website: <Ext href={B.web}>{B.webText}</Ext></p>
      </A>
      <A titel="Umsatzsteuer-ID">
        <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: {B.ustId}</p>
      </A>
      <A titel="Verbraucherstreitbeilegung">
        <p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
      </A>
      <A titel="Haftung für Inhalte">
        <p>Die Inhalte einer Karte (Weiden, Tierzahlen, Notizen) werden von den Nutzerinnen und Nutzern selbst eingetragen. Für deren Richtigkeit übernehmen wir keine Gewähr. Satellitenbilder und Straßenkarten stammen von Drittanbietern (siehe „Kartenquellen“) und können veraltet oder ungenau sein.</p>
      </A>
    </>
  )
}

function Datenschutz() {
  return (
    <>
      <p className="recht-kurz"><b>Kurz gesagt:</b> FlockMap zeigt keine Werbung, verwendet kein Tracking, keine Analyse-Werkzeuge und keine Cookies. Gespeichert wird nur, was die App zum Arbeiten braucht: Namen und Rollen der Personen, die Karteninhalte und – auf deinem Gerät – deine Einstellungen und eine Offline-Kopie.</p>

      <A titel="1. Verantwortlicher">
        <Anschrift />
        <p>E-Mail: <Mail /> · Telefon: {B.telefon}</p>
        <p>Für die Karten der Hecker Natur selbst und für den technischen Betrieb von FlockMap ist die {B.firma} verantwortlich. Nutzt ein anderer landwirtschaftlicher Betrieb FlockMap mit einer eigenen Hof-Lizenz, ist <b>dieser Betrieb</b> für die Daten seiner Karten und seiner Mitarbeitenden verantwortlich; die {B.firma} verarbeitet diese Daten dann nur in seinem Auftrag (Auftragsverarbeitung nach Art. 28 DSGVO). Anfragen zu solchen Karten richtest du am besten zuerst an den Betrieb, der dich eingeladen hat – wir helfen gern weiter.</p>
        <p>Ein Datenschutzbeauftragter ist nicht bestellt, da die gesetzlichen Voraussetzungen nicht vorliegen.</p>
      </A>

      <A titel="2. Kein Konto mit E-Mail und Passwort">
        <p>Für FlockMap brauchst du weder E-Mail-Adresse noch Passwort. Du erhältst einen persönlichen Link mit einem zufälligen Zugangsschlüssel. Wer diesen Link hat, kann die Karte mit deinen Rechten öffnen – gib ihn deshalb nicht weiter.</p>
      </A>

      <A titel="3. Welche Daten auf dem Server gespeichert werden">
        <dl className="recht-liste">
          <dt>Personen</dt>
          <dd>Anzeigename (frei wählbar, gern auch ein Spitzname), Rolle (z. B. Inhaber, Admin, Mitarbeiter, nur ansehen), eine interne Personen-ID, Beitrittsdatum und dein persönlicher Zugangsschlüssel. Zweck: gemeinsames Arbeiten und Rechteverwaltung.</dd>
          <dt>PIN (freiwillig)</dt>
          <dd>Wenn du eine PIN für die Anmeldung auf einem neuen Gerät einrichtest, speichern wir sie <b>nur als verschlüsselten Prüfwert</b> (scrypt mit Zufallswert). Die PIN selbst kann niemand – auch wir nicht – auslesen.</dd>
          <dt>Einladungen</dt>
          <dd>Einladungscode, vorgesehene Rolle, optional der vorgesehene Name, wer eingeladen hat, Ablaufdatum (14 Tage).</dd>
          <dt>Karteninhalte</dt>
          <dd>Weiden und Flächen mit Koordinaten, Namen, Tierzahlen, Farben, Gruppen, Datum und Notizen. Bei Einträgen und Notizen wird vermerkt, wer sie angelegt oder geändert hat (Personen-ID bzw. Name) und wann.</dd>
          <dt>Dein Standort</dt>
          <dd>Den Gerätestandort fragt die App nur ab, wenn du ausdrücklich „Mein Standort“, „An meinem Standort setzen“ oder eine Route nutzt. Er wird im Browser verwendet und nicht laufend gespeichert. Auf dem Server landet er nur, wenn du an dieser Stelle eine Nadel setzt (als deren Koordinate). Für eine Route wird er an den Routendienst übermittelt (Abschnitt 5).</dd>
          <dt>Schutz vor Missbrauch</dt>
          <dd>Um das Durchprobieren von Einladungscodes und PINs zu verhindern, zählt der Server Fehlversuche je IP-Adresse – nur im Arbeitsspeicher und höchstens eine Stunde lang. FlockMap selbst schreibt keine Zugriffsprotokolle.</dd>
        </dl>
        <p><b>Rechtsgrundlagen:</b> Art. 6 Abs. 1 lit. b DSGVO (Nutzung von FlockMap auf Grundlage der Nutzungsbedingungen bzw. der Hof-Lizenz) und Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse des Betriebs an der Organisation seiner Weidehaltung und an einem sicheren Betrieb).</p>
        <p><b>Speicherdauer:</b> Personendaten, bis der Zugang gelöscht wird (selbst unter „Meine Daten“ oder durch einen Admin). Karteninhalte, bis sie gelöscht werden oder die Karte bzw. der Hof gelöscht wird (Abschnitt 7).</p>
      </A>

      <A titel="4. Hosting">
        <p>FlockMap läuft bei <b>{H.name}</b>, {H.adresse}. {H.standort}.</p>
        <p>{H.grundlage}</p>
        <p>{H.logs} Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (sicherer und stabiler Betrieb). Datenschutzhinweise des Hosters: <Ext href={H.datenschutz}>{H.datenschutz.replace(/^https:\/\//, '')}</Ext></p>
        {GEPLANTER_HOSTER && <p>Geplant ist ein Umzug zu {GEPLANTER_HOSTER.name} ({GEPLANTER_HOSTER.standort}). Diese Erklärung wird dann angepasst.</p>}
        <p>Vor technischen Änderungen legen wir Sicherungskopien der Datenbank an, damit keine Hofdaten verloren gehen. Diese werden nur für die Wiederherstellung genutzt und nach spätestens 90 Tagen gelöscht.</p>
      </A>

      <A titel="5. Kartendienste und Routen (Drittanbieter)">
        <p>Damit Satellitenbild und Karte angezeigt werden, lädt dein Browser Kartenbilder („Kacheln“) direkt von den folgenden Anbietern. Dabei werden deine <b>IP-Adresse</b>, die Browser-Kennung und der angezeigte Kartenausschnitt an den Anbieter übertragen. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO – ohne Kartenbilder ist die App nicht nutzbar.</p>
        <dl className="recht-liste">
          <dt>Esri (Satellitenbild, Beschriftungen)</dt>
          <dd>Environmental Systems Research Institute, Inc. (Esri), 380 New York Street, Redlands, CA 92373, USA. Übermittlung in die USA. <Ext href="https://www.esri.com/en-us/privacy/overview">Datenschutz bei Esri</Ext></dd>
          <dt>OpenStreetMap (Straßenkarte)</dt>
          <dd>Nur wenn du die Ansicht „Karte“ wählst: OpenStreetMap Foundation, Cambridge, Vereinigtes Königreich (Angemessenheitsbeschluss der EU). <Ext href="https://osmfoundation.org/wiki/Privacy_Policy">Datenschutz der OSMF</Ext></dd>
          <dt>Routen (OSRM)</dt>
          <dd>Nur wenn du eine Route berechnen lässt: Start- und Zielkoordinaten (also dein Standort und die Weide) gehen an den Routendienst „project-osrm.org“, betrieben vom FOSSGIS e.V. in Deutschland. <Ext href="https://www.fossgis.de/datenschutzerklaerung/">Datenschutz FOSSGIS</Ext></dd>
          <dt>Google Maps (Navigation)</dt>
          <dd>Nur wenn du auf „Navigation starten“ tippst, öffnet sich Google Maps mit dem Ziel. Ab dann gelten die Bestimmungen von Google (Google Ireland Limited, Dublin).{HAT_GOOGLE_KEY ? ' In dieser Version wird außerdem die Google-Karte selbst angezeigt; dabei werden IP-Adresse und Kartenausschnitt an Google übertragen.' : ''}</dd>
        </dl>
        <p>Offline gespeicherte Kartenbereiche werden einmalig bei diesen Anbietern geladen und danach von deinem Gerät angezeigt.</p>
      </A>

      <A titel="6. Speicherung auf deinem Gerät (keine Cookies)">
        <p>FlockMap setzt keine Cookies. Damit die App funktioniert – auch ohne Netz –, speichert sie im Browser deines Geräts:</p>
        <ul>
          <li><b>Lokaler Speicher:</b> deinen Zugangsschlüssel, Anzeige-Einstellungen (Ansicht, aufgeklappte Gruppen, Farben) und noch nicht übertragene Änderungen (Postausgang).</li>
          <li><b>IndexedDB:</b> eine Kopie der Karte für die Offline-Nutzung.</li>
          <li><b>Cache-Speicher:</b> die App-Dateien sowie zuletzt angesehene und ausdrücklich gesicherte Kartenbilder.</li>
        </ul>
        <p>Das ist für den von dir gewünschten Dienst unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG); eine Einwilligung ist dafür nicht nötig. Die Daten verlassen dein Gerät nicht von selbst. Du kannst sie jederzeit unter <b>Einstellungen → Meine Daten → Daten auf diesem Gerät löschen</b> oder über die Browser-Einstellungen entfernen.</p>
        <p>Exporte und Sicherungsdateien (Excel, PDF, KML, JSON) erstellt dein Gerät selbst; sie werden nicht an uns gesendet.</p>
      </A>

      <A titel="7. Löschen">
        <ul>
          <li><b>Eigener Zugang:</b> Unter „Meine Daten“ kannst du deinen Zugang selbst löschen. Dein Name, deine Rolle, dein Zugangsschlüssel und deine PIN werden sofort entfernt. Weiden, Tierzahlen und Notizen, die du eingetragen hast, gehören zu den Betriebsaufzeichnungen des Hofs und bleiben erhalten – sie werden aber auf „ehemaliger Nutzer“ umgestellt, also <b>ohne deinen Namen</b>.</li>
          <li><b>Karte oder ganzer Hof:</b> Admins (bei einer Einzelkarte) bzw. der Inhaber (bei einem Hof) können alles löschen. Die Daten kommen zunächst 30 Tage in einen Papierkorb – so lässt sich ein Versehen rückgängig machen – und werden danach endgültig gelöscht. Auf Wunsch geht das auch sofort.</li>
          <li>In Sicherungskopien (Abschnitt 4) bleiben Daten bis zu deren Ablauf erhalten.</li>
        </ul>
      </A>

      <A titel="8. Empfänger">
        <p>Deine Daten sehen nur die Personen, die Zugang zu derselben Karte bzw. demselben Hof haben, sowie die oben genannten technischen Dienstleister. Wir verkaufen keine Daten und geben sie nicht zu Werbezwecken weiter.</p>
      </A>

      <A titel="9. Deine Rechte">
        <p>Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). Vieles kannst du direkt in der App erledigen: Namen ändern (Einstellungen → Dein Zugang), Auskunft und Export (Meine Daten), Zugang löschen (Meine Daten).</p>
        <p>Für alles andere genügt eine E-Mail an <Mail />.</p>
        <p>Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der für uns zuständigen: {AUFSICHT}.</p>
      </A>

      <A titel="10. Sonstiges">
        <p>Die Angabe eines Namens ist für die Zusammenarbeit nötig; ein Spitzname genügt. Eine automatisierte Entscheidungsfindung oder Profilbildung findet nicht statt. Die Verbindung zur App ist verschlüsselt (HTTPS).</p>
      </A>
    </>
  )
}

function Nutzung() {
  return (
    <>
      <p className="recht-entwurf">Entwurf – vor Verkauf anwaltlich prüfen lassen. Platzhalter stehen in [eckigen Klammern].</p>
      <A titel="§ 1 Geltung, Anbieter">
        <p>Diese Bedingungen gelten für die Nutzung der Web-App FlockMap und für den Erwerb einer Hof-Lizenz. Anbieter ist die {B.firma}, {B.strasse}, {B.ort} (siehe Impressum). Abweichende Bedingungen des Kunden gelten nicht, es sei denn, wir stimmen ihnen ausdrücklich in Textform zu.</p>
      </A>
      <A titel="§ 2 Leistung">
        <p>FlockMap ist eine Web-App zur Planung und Dokumentation der Weidehaltung (Weiden und Flächen auf einer Satellitenkarte, Tierzahlen, Notizen, Teilen im Team, Offline-Nutzung, Export). Die Hof-Lizenz umfasst: die Nutzung für einen landwirtschaftlichen Betrieb mit beliebig vielen Karten und bis zu [100] Personen sowie den Betrieb auf unseren Servern für [Laufzeit, z. B. 3 Jahre ab Kauf / unbefristet, solange FlockMap angeboten wird].</p>
        <p>Satellitenbilder, Straßenkarten und Routen stammen von Drittanbietern (siehe „Kartenquellen“). Wir haben auf deren Verfügbarkeit, Aktualität und Genauigkeit keinen Einfluss. Routen sind unverbindliche Vorschläge – maßgeblich sind die tatsächlichen Verhältnisse vor Ort und die Straßenverkehrsordnung.</p>
      </A>
      <A titel="§ 3 Vertragsschluss, Preis">
        <p>Die Hof-Lizenz kostet einmalig [Preis] € [inkl. 19 % USt. / zzgl. USt.]. Der Vertrag kommt zustande, wenn wir die Bestellung bestätigen [Bestellweg/Zahlungsart ergänzen]. Danach richten wir den Hof ein und senden dem Inhaber den Zugangslink.</p>
      </A>
      <A titel="§ 4 Verfügbarkeit, Updates">
        <p>Wir bemühen uns um eine hohe Verfügbarkeit, schulden aber keine bestimmte Verfügbarkeit [ggf. Zusage ergänzen]. Wartungsarbeiten kündigen wir nach Möglichkeit an. Die App funktioniert in gesicherten Bereichen auch offline; Änderungen werden übertragen, sobald wieder Netz besteht. Wir dürfen FlockMap weiterentwickeln, solange die wesentlichen Funktionen erhalten bleiben.</p>
      </A>
      <A titel="§ 5 Pflichten der Nutzer">
        <p>Zugangslinks und PINs sind vertraulich zu behandeln. Der Inhaber ist für die Vergabe und den Entzug von Zugängen in seinem Hof verantwortlich. Es dürfen keine rechtswidrigen Inhalte eingetragen und keine Angriffe auf die App unternommen werden. Wer personenbezogene Daten Dritter einträgt (z. B. Namen von Mitarbeitenden), ist dafür selbst verantwortlich.</p>
      </A>
      <A titel="§ 6 Daten, Datenschutz, Auftragsverarbeitung">
        <p>Die Daten des Hofs gehören dem Kunden. Er kann sie jederzeit exportieren (Excel, PDF, KML, Sicherungsdatei) und löschen. Für personenbezogene Daten in seinem Hof ist der Kunde Verantwortlicher; wir verarbeiten sie in seinem Auftrag. Dazu schließen wir einen Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO ab [Muster-AVV beifügen]. Einzelheiten: siehe Datenschutzerklärung.</p>
      </A>
      <A titel="§ 7 Laufzeitende">
        <p>Endet der Betrieb (z. B. nach Ablauf der Laufzeit oder wenn wir FlockMap einstellen), informieren wir den Inhaber mindestens [3 Monate] vorher, damit er seine Daten exportieren kann. Danach werden die Daten gelöscht.</p>
      </A>
      <A titel="§ 8 Widerrufsrecht für Verbraucher">
        <p>Die Hof-Lizenz richtet sich an landwirtschaftliche Betriebe (Unternehmer). Ist der Käufer ausnahmsweise Verbraucher, steht ihm ein gesetzliches Widerrufsrecht von 14 Tagen zu. [Vollständige Widerrufsbelehrung und Muster-Widerrufsformular einfügen.] Bei digitalen Inhalten und Diensten erlischt das Widerrufsrecht vorzeitig, wenn wir mit der Leistung begonnen haben, nachdem der Verbraucher ausdrücklich zugestimmt hat, dass wir vor Ablauf der Widerrufsfrist beginnen, und seine Kenntnis bestätigt hat, dass er dadurch sein Widerrufsrecht verliert (§ 356 Abs. 5 BGB) [genaue Formulierung prüfen lassen].</p>
      </A>
      <A titel="§ 9 Gewährleistung und Haftung">
        <p>Es gelten die gesetzlichen Gewährleistungsrechte. Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz. Bei leichter Fahrlässigkeit haften wir nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den vertragstypischen, vorhersehbaren Schaden. Für Datenverluste haften wir nur in dem Umfang, der bei regelmäßiger Datensicherung durch den Kunden (Export) entstanden wäre. [Haftungsklauseln prüfen lassen.]</p>
      </A>
      <A titel="§ 10 Schlussbestimmungen">
        <p>Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts; zwingende Verbraucherschutzvorschriften bleiben unberührt. Gerichtsstand für Kaufleute ist [Husum / Sitz des Anbieters]. Sollte eine Bestimmung unwirksam sein, bleiben die übrigen wirksam.</p>
      </A>
    </>
  )
}

function Quellen() {
  return (
    <>
      <A titel="Satellitenbild">
        <p>Esri World Imagery – Quellen: Esri, Maxar, Earthstar Geographics und die GIS User Community. Beschriftungen und Grenzen: Esri World Boundaries and Places / World Transportation. © Esri und Lizenzgeber. <Ext href="https://www.esri.com/en-us/legal/terms/full-master-agreement">Nutzungsbedingungen</Ext></p>
        <p>Das Aufnahmedatum der Bilder ist je nach Gegend unterschiedlich und kann mehrere Jahre zurückliegen.</p>
      </A>
      <A titel="Straßenkarte">
        <p>© <Ext href="https://www.openstreetmap.org/copyright">OpenStreetMap</Ext>-Mitwirkende. Kartendaten unter der Open Database License (ODbL), Kartendarstellung © OpenStreetMap Foundation.</p>
      </A>
      <A titel="Routen">
        <p>Routenberechnung mit <Ext href="https://project-osrm.org">OSRM</Ext> (Open Source Routing Machine) auf Grundlage von OpenStreetMap-Daten; Server betrieben vom FOSSGIS e.V.{HAT_GOOGLE_KEY ? ' Mit Google-Schlüssel: Google Maps Platform.' : ''}</p>
      </A>
      <A titel="Software">
        <p>FlockMap verwendet Open-Source-Software, unter anderem: Leaflet (BSD-2-Clause), React (MIT), jsPDF und jspdf-autotable (MIT), fflate (MIT), Express (MIT), node-postgres (MIT). Schrift: Barlow (SIL Open Font License 1.1), lokal eingebunden – es werden keine Schriften von fremden Servern geladen.</p>
      </A>
    </>
  )
}
