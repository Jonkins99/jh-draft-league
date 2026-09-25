// Zwei Sendungen der Liga-Presse: die Talkshow „Cava LANZ" und der Podcast
// „50 plus Zweiblatt".
//
// Beide sind reine Gesprächsprotokolle — Sprecher, Doppelpunkt, Aussage, nichts
// dazwischen. Ihre Gastgeber gehören NICHT zum allgemeinen Redaktionspool
// (PRESS_AUTHORS); ein Sendungsbeitrag trägt deshalb auch keinen Autor, sondern die
// Sendung selbst als Absender.
//
// Framework-frei und unter Node testbar: Besetzung, Termine, Aufbau des Textkörpers,
// Aufträge und Antwortschemata. Die Aufrufe an das Modell stehen im press-Store.

import { schemaOf, S } from './gemini.mjs';
import { hashSeed, seededFloat } from './press.mjs';

// === Die Gastgeber =========================================================
export const CAVALANZAS = {
  id: 'cavalanzas',
  name: 'Cavalanzas',
  voice: `ROLLE & HALTUNG: Souverän, aber oft demonstrativ ungläubig; inszeniert sich als kritischer Anwalt des
"gesunden Menschenverstands" und der normalen Fans, der Trainern und Experten auf den Zahn fühlen will.
EINSTIEGE: Startet direkt und leicht distanziert oder leitet ein Thema mit einer dramaturgischen Zuspitzung ein
(etwa: "Guten Abend. Es ist eine Zeit, in der vieles ins Rutschen geraten ist …" oder "Herr X, sind wir
eigentlich noch zu retten?").
STILMITTEL: Nutzt sehr häufig "Punkt." als Stoppsignal oder Zäsur, dazu "Bei allem Respekt …", "Hand aufs Herz"
und "Die entscheidende Frage ist doch …".
INTERAKTION: Bohrt penetrant nach, unterbricht charmant, aber bestimmt, wenn jemand ausweicht ("Um die Frage noch
einmal ganz präzise zu stellen …"), und wiederholt Kernfragen in leicht veränderter Form, bis eine konkrete
Antwort kommt.
SPRACHE: Parataktisch, schnell, viele rhetorische Fragen. Liebt Kontraste ("Auf der einen Seite … und auf der
anderen Seite steht die bittere Realität").
ABSCHLUSS: Zieht ein melancholisch-realistisches Fazit, das die Komplexität der Lage betont, und verabschiedet
sich dann knapp und prägnant von den Zuschauern.`,
};

export const VENICRO = {
  id: 'venicro',
  name: 'Venicro',
  voice: `ROLLE & HALTUNG: Fundierter, oft herrlich süffisanter und leicht ironischer Pokémon-Experte; verbindet tiefes
taktisches Wissen mit popkulturellen Referenzen, Medienkritik und einer gesunden Portion Berliner Schnauze und
Couch-Melancholie.
EINSTIEG: Eröffnet JEDE Folge mit genau diesem Satzanfang: "50 plus Zweiblatt, JHDL Rückblick und bei mir sitzt
der Mann, der " — und beendet den Satz jedes Mal mit einer anderen, wahnwitzigen These, die zum aktuellen
Spielgeschehen passt (etwa "… der Mega-Lucario Z beibringen wird, wie man eine Offensiv-Attacke einsetzt" oder
"… der den Sternenstaub für die Meisterfeier von Beast Force besorgt hat").
STILMITTEL: Markante, leicht überspitzte Formulierungen wie "Völlig wild", "Komplett gestört", "Auf gar keinem
Auge" und der Verweis auf harte Fakten ("Mit Logik und Fakten …").
INTERAKTION: Liefert sich einen verbalen Schlagabtausch mit Chelast, baut kleine Reibungspunkte, Sticheleien und
sarkastische Duelle ein, lenkt das Gespräch dann aber wieder analytisch auf den Punkt.
SPRACHE: Rhythmisch und dynamisch, knackige Hauptsätze, schnelle Tempowechsel, betonte Schlüsselwörter für die
Pointe.
ABSCHLUSS: Ein augenzwinkerndes, pragmatisches Fazit oder eine popkulturelle Metapher, danach eine lässige, fast
beiläufige Verabschiedung.`,
};

export const CHELAST = {
  id: 'chelast',
  name: 'Chelast',
  voice: `ROLLE & HALTUNG: Der leidenschaftliche, emotional angetriebene und detailverliebte Pokémon-Fan und Analyst an
Venicros Seite; schwankt zwischen kindlicher Begeisterung, humorvoller Verzweiflung über einen Verein und scharfen
taktischen Beobachtungen.
EINSTIEGE: Steigt mit einer emotionalen Momentaufnahme, einer Liga-Frustration oder einer überspitzten Beobachtung
von der Couch ein ("Ich saß am Wochenende auf der Couch und dachte mir: Warum tun wir uns das eigentlich an?",
"Es ist einfach unfassbar, was da gerade passiert.").
STILMITTEL: Emotionale Verstärker wie "Brutal", "Wahnsinn", "Komplett absurd" und das bekräftigende "Einfach".
INTERAKTION: Lässt sich von Venicros spitzem Humor triggern, kontert emotional und holt dann weit aus, um seine
Thesen mit Vehemenz und vielen Details zu verteidigen.
SPRACHE: Schneller, oft überschlagener Redefluss mit vielen Einschüben und Ausrufen ("Ganz ehrlich …", "Alter
Verwalter!").
ABSCHLUSS: Findet über eine emotionale Brücke zurück zu einer versöhnlichen, pokémonromantischen Haltung, dann
eine sympathisch-unaufgeregte Verabschiedung.`,
};

// === Die Sendungen =========================================================
export const SHOWS = {
  lanz: {
    key: 'lanz',
    category: 'cava-lanz',
    title: 'Cava LANZ',
    kind: 'Talkshow',
    hosts: [CAVALANZAS],
    image: 'https://i.ibb.co/TDz0RhLC/1790331342225.jpg',
  },
  zweiblatt: {
    key: 'zweiblatt',
    category: 'zweiblatt',
    title: '50 plus Zweiblatt',
    kind: 'Podcast',
    hosts: [VENICRO, CHELAST],
    image: 'https://i.ibb.co/wZgkJSbr/1790334951299.jpg',
  },
};
export const SHOW_BY_CATEGORY = Object.fromEntries(Object.values(SHOWS).map((s) => [s.category, s]));

// Die Rubrik eines Beitrags, der aus einer Sendung stammt.
export function showOf(article) {
  const type = article?.source?.type;
  return SHOWS[type] || null;
}

// Wer steht über einem Beitrag? Sendungen haben keinen Autor und kein Bild.
export function showByline(show) {
  return {
    name: show.title,
    role: show.kind,
    outlet: show.hosts.map((h) => h.name).join(' & '),
    image: null,
  };
}

// === Termine ===============================================================
// Cava LANZ läuft einmal je Spieltag — nach dem zweiten ODER dritten freigegebenen
// Spiel, auf jedem Gerät gleich ausgelost.
export function lanzTriggerGame(season, day) {
  return seededFloat(hashSeed(`lanz:${season}:${day}`)) < 0.5 ? 2 : 3;
}

// Mit wie vielen Wortbeiträgen des Trainers die Runde endet: drei oder vier.
export function lanzAnswerTarget(rand = Math.random) {
  return rand() < 0.5 ? 3 : 4;
}

/**
 * Die Runde zu Gast bei Cavalanzas: ein Pressevertreter, dazu mit gleicher
 * Wahrscheinlichkeit ein zweiter Pressevertreter oder ein Trainer.
 * @param {Array} authors  der Redaktionspool
 * @param {Array} trainers [{ teamId, name, image, traits }] — amtierende Trainer
 */
export function lanzLineup(authors = [], trainers = [], rand = Math.random) {
  const pool = [...authors];
  const take = () => pool.splice(Math.floor(rand() * pool.length), 1)[0];
  const first = take();
  const withTrainer = trainers.length > 0 && rand() < 0.5;
  if (withTrainer) {
    const t = trainers[Math.floor(rand() * trainers.length)];
    return {
      interactive: true,
      guests: [
        { kind: 'press', id: first.id, name: first.name },
        { kind: 'trainer', teamId: t.teamId, name: t.name, image: t.image || '', traits: t.traits || [] },
      ],
    };
  }
  const second = take();
  return {
    interactive: false,
    guests: [first, second].filter(Boolean).map((a) => ({ kind: 'press', id: a.id, name: a.name })),
  };
}

// Der Podcast läuft, sobald alle Spieltag-Awards vergeben UND beide Siegerehrungen
// angesehen sind. `instanceFor(key, day)` liefert die Award-Instanz.
export function podcastReadyDays(days, awardKeys, instanceFor, players) {
  return (days || []).filter((day) => awardKeys.every((key) => {
    const inst = instanceFor(key, day);
    return inst?.status === 'done' && players.every((p) => inst.seen?.[p]);
  }));
}

// === Textkörper ============================================================
// Ein Wortbeitrag: der Sprecher fett mit Doppelpunkt, danach das Gesagte.
export function turnParagraph(turn) {
  const who = String(turn?.speaker || '').replace(/\*/g, '').trim();
  const text = String(turn?.text || '').replace(/\s+/g, ' ').trim();
  if (!who || !text) return '';
  return `**${who}:** ${text}`;
}

// Die Absätze eines Sendungsbeitrags: das Sendungsbild vorne, dann das Protokoll.
export function showParagraphs(show, turns) {
  return [`[bild: ${show.image}]`, ...(turns || []).map(turnParagraph).filter(Boolean)];
}

// Klartext-Protokoll für den nächsten Auftrag an das Modell.
export function transcriptText(turns) {
  return (turns || []).map((t) => `${t.speaker}: ${t.text}`).join('\n');
}

// Die Antwort des Modells auf die bekannten Sprecher abbilden. Ein Sprecher, den
// es in der Runde nicht gibt, fällt samt Beitrag weg — ein Trainerzitat, das der
// Trainer nie gesagt hat, darf nicht entstehen.
export function cleanTurns(raw, speakers, { forbid = [] } = {}) {
  const byKey = new Map(speakers.map((n) => [String(n).toLowerCase(), n]));
  const blocked = new Set(forbid.map((n) => String(n).toLowerCase()));
  return (raw || [])
    .map((t) => {
      const key = String(t?.sprecher ?? t?.speaker ?? '').replace(/[*:]/g, '').trim().toLowerCase();
      const speaker = byKey.get(key);
      const text = String(t?.text ?? '').trim();
      if (!speaker || !text || blocked.has(key)) return null;
      return { speaker, text };
    })
    .filter(Boolean);
}

// === Aufträge ==============================================================
const PROTOCOL_RULES = `FORM — REINES GESPRÄCHSPROTOKOLL:
- Der Beitrag besteht AUSSCHLIESSLICH aus Wortbeiträgen: je Eintrag ein Sprecher und das, was er sagt.
- KEINE beschreibenden Sätze, keine Regieanweisungen, keine Klammern mit Gesten, keine Zwischenüberschriften,
  kein Erzähler, keine Einleitung und kein Nachwort außerhalb der Wortbeiträge.
- Das Feld "sprecher" trägt exakt einen der vorgegebenen Namen, sonst nichts.
- Bausteine wie [marktwert: …] oder [tabelle: …] gibt es in diesem Format nicht.
- Die Gäste sprechen in ihrer eigenen Stimme; Pressevertreter so, wie ihre Handschrift es vorgibt.`;

export const LANZ_BRIEF = `Du schreibst die Talkshow "Cava LANZ" — die Sendung, in der Cavalanzas nach den Spielen
eines Spieltags Gäste zum Stand der JH Draft League befragt.

THEMEN, in dieser Gewichtung:
1. Vor allem aktuelle Skandale, Aufreger und laufende Geschichten (Storylines, jüngste Beiträge).
2. Die bisherigen Ergebnisse und Spielverläufe DIESES Spieltags.
3. Der Ausblick auf die noch ausstehenden Spiele des Spieltags.

AUFTRAG
- Cavalanzas führt durch die Sendung, stellt die Fragen und hakt nach. Er eröffnet und er beendet.
- Die Gäste haben Meinungen und widersprechen einander. Aussagen dürfen Geschichten weiterdrehen oder neue
  eröffnen — der Kanon gilt trotzdem: Wechsel, Strafen, Entlassungen bleiben Gerücht, Forderung, Vermutung.
- Fakten (Ergebnisse, Kills, Tabelle) kommen ausschließlich aus den Metadaten.
- Ausführlich: Das fertige Protokoll liest sich in drei bis fünf Minuten.

${PROTOCOL_RULES}`;

export const ZWEIBLATT_BRIEF = `Du schreibst die neue Folge des Podcasts "50 plus Zweiblatt" — den JHDL-Rückblick mit
Venicro und Chelast nach einem abgeschlossenen Spieltag.

THEMEN, in dieser Gewichtung:
1. Vor allem die Besprechung DIESES Spieltags und der genauen Spielverläufe: fachlich und analytisch — Aufgebote,
   Kills und Deaths, Wendepunkte der einzelnen Kämpfe, Kampfverlauf-Notizen, Tabellenfolgen.
2. Daneben auch mal aktuelle Skandale und die gerade vergebenen Awards des Spieltags.

AUFTRAG
- Venicro eröffnet mit genau dem vorgegebenen Satzanfang und beendet ihn mit einer neuen, wahnwitzigen These.
- Die beiden reiben sich aneinander, bleiben aber in der Sache präzise.
- Fakten kommen ausschließlich aus den Metadaten. Der Kanon gilt.
- Ausführlich: Die Folge liest sich in drei bis fünf Minuten.

${PROTOCOL_RULES}`;

// === Antwortschemata =======================================================
const TURNS = (hint) => S.array(
  S.object({
    sprecher: S.string('Exakt einer der vorgegebenen Namen'),
    text: S.string('Was diese Person sagt — ein bis vier Sätze, wörtliche Rede ohne Anführungszeichen'),
  }, ['sprecher', 'text']),
  hint,
);

const STORYLINES = S.array(
  S.object({
    id: S.string('Kurzer Kennzeichner in Kleinbuchstaben mit Bindestrichen. Eine laufende Geschichte behält ihre id.'),
    titel: S.string('Griffiger Name der Geschichte'),
    teams: S.array(S.string(), 'Team-IDs aus den Metadaten'),
    status: S.enum(['neu', 'laufend', 'eskaliert', 'beruhigt', 'beendet'], 'Stand nach dieser Sendung'),
    stand: S.string('Zwei Sätze: worum es geht und wo die Geschichte jetzt steht'),
  }, ['id', 'titel', 'teams', 'status', 'stand']),
  'Erzählstränge, die diese Sendung eröffnet oder fortschreibt (null bis vier)',
);

// Eine vollständige Sendung (oder der Schluss einer interaktiven).
export const SHOW_SCHEMA = schemaOf({
  dachzeile: S.string('Drei bis fünf Wörter über der Überschrift'),
  titel: S.string('Die Überschrift der Folge'),
  beitraege: TURNS('Die Wortbeiträge in ihrer Reihenfolge'),
  archetyp: S.string('Schlüssel des Hauptthemas (z. B. ein Skandal-Schlüssel aus der Regie)'),
  erwaehntePokemon: S.array(S.string(), 'Namen der Pokémon, um die es geht'),
  storylines: STORYLINES,
}, ['dachzeile', 'titel', 'beitraege', 'storylines']);

// Ein Abschnitt der interaktiven Talkshow: er endet mit einer Frage an den Trainer.
export const SHOW_PART_SCHEMA = schemaOf({
  beitraege: TURNS('Die Wortbeiträge dieses Abschnitts, OHNE den Trainer'),
  frageAnTrainer: S.string('Die Frage, mit der Cavalanzas den Abschnitt beendet und an den Trainer übergibt — wörtlich'),
}, ['beitraege', 'frageAnTrainer']);
