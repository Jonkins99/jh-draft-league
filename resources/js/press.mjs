// Presse-Kern: Kategorien, Redaktion, Slot-Planung, Storylines.
// Framework-frei (kein Alpine, kein Firebase) — damit unter Node testbar.

import { stripTiles } from './press-tiles.mjs';
//
// Ein Presse-Beitrag ist ein Dokument der Collection `press`:
//   { season, category, title, subtitle, body(HTML), authorId, teamIds[],
//     pokemonNames[], day, status, source:{…}, storylines:[…], createdAt, publishedAt }
//
// Storylines werden NICHT separat gespeichert: jeder Beitrag trägt die Storylines,
// die er fortschreibt, mit Status und Kurzfassung bei sich. Der aktuelle Stand einer
// Storyline ist damit immer der jüngste Beitrag, der sie erwähnt (siehe activeStorylines).

// Ein Beitrag kann in mehreren Rubriken stehen. Die erste Rubrik bleibt die
// Hauptrubrik (Feld `category`), alle weiteren liegen in `categories`.
//   `auto: true`  — wird beim Schreiben automatisch gesetzt, nicht von Hand
//   `manual: true`— steht im Editor der Spieler zur Auswahl
export const PRESS_CATEGORIES = [
  { key: 'spielbericht', label: 'Spielbericht', short: 'Bericht', color: '#4d90d5', manual: true },
  { key: 'news', label: 'News', short: 'News', color: '#63bc5a', manual: true },
  { key: 'klatsch', label: 'Klatsch und Tratsch', short: 'Klatsch', color: '#e3350d', manual: true },
  // „Redaktion" ist keine Rubrik, sondern die HERKUNFT: Der Stempel hängt am Feld
  // `editorial`, nicht an einer Kategorie. Der Schlüssel bleibt nur stehen, damit
  // Alt-Beiträge, die ihn noch tragen, weiterhin Beschriftung und Farbe finden.
  { key: 'redaktion', label: 'Redaktion', short: 'Redaktion', color: '#ffcb05' },
  { key: 'erste-liga', label: 'Erste Liga', short: '1. Liga', color: '#c9a227', auto: true },
  { key: 'zweite-liga', label: 'Zweite Liga', short: '2. Liga', color: '#8e9aaf', manual: true },
  { key: 'geruechte', label: 'Gerüchte', short: 'Gerüchte', color: '#a855f7', manual: true },
  { key: 'informationen', label: 'Informationen', short: 'Infos', color: '#38bdf8', manual: true },
  // Die beiden Sendungen (press-shows.mjs): eigene Rubrik, vergeben nur von der Sendung selbst.
  { key: 'cava-lanz', label: 'Cava LANZ', short: 'Cava LANZ', color: '#f97316' },
  { key: 'zweiblatt', label: '50 plus Zweiblatt', short: 'Zweiblatt', color: '#22c55e' },
];

export const CATEGORY_BY_KEY = Object.fromEntries(PRESS_CATEGORIES.map((c) => [c.key, c]));

// Alles, was per KI entsteht, landet zusätzlich in der „Ersten Liga".
export const AI_CATEGORY = 'erste-liga';

export function categoryLabel(key) {
  return CATEGORY_BY_KEY[key]?.label || 'News';
}

export function categoryColor(key) {
  return CATEGORY_BY_KEY[key]?.color || '#98a2b3';
}

export function manualCategories() {
  return PRESS_CATEGORIES.filter((c) => c.manual);
}

// Die Rubriken eines Beitrags — Hauptrubrik zuerst, ohne Dubletten.
// Alt-Beiträge kennen nur `category`; die laufen hier unverändert durch.
export function categoriesOf(article) {
  const out = [];
  const push = (k) => { if (k && CATEGORY_BY_KEY[k] && !out.includes(k)) out.push(k); };
  push(article?.category);
  (article?.categories || []).forEach(push);
  // Ein selbst geschriebener Beitrag trägt den Redaktions-Stempel bereits über
  // `editorial`. Stünde „Redaktion" zusätzlich als Rubrik da, stünde es doppelt.
  if (article?.editorial) return out.filter((k) => k !== 'redaktion');
  return out;
}

// Eingabe aus Editor bzw. Modell auf gültige Schlüssel normalisieren.
export function normalizeCategories(primary, extra = []) {
  let list = categoriesOf({ category: primary, categories: extra });
  // „Erste Liga" hängt sich an jeden KI-Beitrag von selbst an. Steht ein Beitrag
  // ausdrücklich in der Zweiten Liga, ist das schlicht falsch — die beiden schließen
  // einander aus, und ohne diese Regel trägt ein Zweitliga-Stück beide Stempel.
  if (list.includes('zweite-liga')) list = list.filter((k) => k !== AI_CATEGORY);
  return { category: list[0] || 'news', categories: list };
}

// In welcher Liga ein Auftragsbeitrag erscheint: gewählt ('erste' | 'zweite') oder —
// ohne Wahl — aus dem Auftragstext erkannt. 'auto' überlässt es dem Modell.
export function commissionLeague(choice, brief = '') {
  if (choice === 'erste' || choice === 'zweite') return choice;
  return /\bzweite[nrs]?\s+liga\b|\b2\.\s*liga\b|\bzweitlig/i.test(String(brief)) ? 'zweite' : 'auto';
}

// Der Pool der Pressevertreter ist bewusst hartkodiert: sechs feste Gesichter mit
// eigener Handschrift. `voice` geht wörtlich in den Prompt und steuert den Stil des
// erzeugten Textes, `beat` die inhaltliche Ausrichtung der Fragen.
export const PRESS_AUTHORS = [
  {
    id: 'alba',
    name: 'Alba',
    outlet: 'Ligamagazin „Ewige Flamme“',
    role: 'Chefreporterin',
    image: './img/press/alba.png',
    voice: 'Grande Dame des Ligajournalismus. Erzählt in großen Bögen, arbeitet mit Bildern und Pathos, '
      + 'zitiert gern und stellt jede Partie in den Zusammenhang der Saison. Wohlwollend, aber nie naiv.',
    beat: 'Große Linien, Saisonverlauf, Verantwortung, Haltung.',
  },
  {
    id: 'piaudo',
    name: 'Pia & Udo',
    outlet: 'Liga-TV',
    role: 'Reporterduo am Spielfeldrand',
    image: './img/press/piaudo.png',
    voice: 'Ein Duo vor der Kamera: Pia fragt, Udo filmt und wirft Zwischenrufe ein. Schreibt im Wir, '
      + 'atemlos, nah dran, mit Geräuschen und Szenen vom Spielfeldrand. Kurze Sätze, viel Präsens.',
    beat: 'Emotion, Szenen, unmittelbare Reaktionen, Stimmung an der Arena.',
  },
  {
    id: 'sina',
    name: 'Sina',
    outlet: 'Draft Analytics',
    role: 'Datenjournalistin',
    image: './img/press/sina.png',
    voice: 'Nüchtern, präzise, datengetrieben. Belegt jede These mit Zahlen aus den Daten (Kills, '
      + 'Einsatzquoten, Elo, Tier) und lässt zwischen den Zeilen trockene Spitzen fallen.',
    beat: 'Kennzahlen, Über- und Unterperformance, Erwartungswerte, Tabellenmathematik.',
  },
  {
    id: 'dexio',
    name: 'Dexio',
    outlet: 'Draft Analytics',
    role: 'Taktikexperte',
    image: './img/press/dexio.png',
    voice: 'Begeisterter Taktik-Nerd. Zerlegt Aufstellungen, Matchups, Typendeckung und Initiative, '
      + 'erklärt Entscheidungen und gerät über eine gelungene Rotation regelrecht ins Schwärmen.',
    beat: 'Aufgebote, Rotation, Typ-Matchups, Initiative, Kampfplan.',
  },
  {
    id: 'lebelle',
    name: 'LeBelle',
    outlet: 'Der Liga-Spiegel',
    role: 'Boulevardreporter',
    image: './img/press/lebelle.png',
    voice: 'Boulevard in Reinform. Zuspitzung, Ausrufezeichen, angebliche Insider, fette Behauptungen, '
      + 'die er am Ende des Absatzes halb wieder einfängt. Zitiert am liebsten das, was jemand fast gesagt hat.',
    beat: 'Unruhe, Gerüchte, Eitelkeiten, alles hinter den Kulissen.',
  },
  {
    id: 'margit',
    name: 'Margit',
    outlet: 'Radio Ligawelle',
    role: 'Moderatorin „Die Ligastunde“',
    image: './img/press/margit.png',
    voice: 'Radiofrau durch und durch. Schreibt, wie sie moderiert: in gesprochener Sprache, mit '
      + 'Anmoderation, Einwürfen und Jingle-Rhythmus. Baut ihre Beiträge um O-Töne herum, kündigt sie an '
      + '(„Hören wir mal rein"), lässt sie stehen und kommentiert sie danach kurz und warm. Duzt alle, '
      + 'lacht gern, wird aber genau dann still, wenn es unangenehm wird.',
    beat: 'Stimmen und O-Töne, Persönliches, Stimmungslagen, das Menschliche hinter dem Ergebnis.',
  },
  {
    id: 'matiere',
    name: 'Matière',
    outlet: 'Dossier Liga',
    role: 'Investigativreporterin',
    image: './img/press/matiere.png',
    voice: 'Kühl, investigativ, lange gebaute Sätze. Beruft sich auf „Personen aus dem Umfeld des Teams“, '
      + 'legt Widersprüche offen und lässt Fragen bewusst offen stehen. Nie laut, immer unangenehm.',
    beat: 'Widersprüche, Hintergründe, unbequeme Fragen, Machtverhältnisse.',
  },
  {
    id: 'scott',
    name: 'Scott',
    outlet: 'Kampfzone-Report',
    role: 'Scouting- und Transferexperte',
    image: './img/press/scott.png',
    voice: 'Der Erbauer der Kampfzone und damit ein Talentsucher aus Berufung: Scott schaut nicht auf die '
      + 'Tabelle, sondern auf das Potenzial dahinter. Er sitzt bei jedem Kampf ganz vorn, analysiert im '
      + 'Mitschreiben und schwärmt offen von Trainern, die er selbst eingeladen hat — ihre Entwicklung '
      + 'nimmt er persönlich. Schreibt schnell, direkt und im Fahrtwind: kurze Sätze, Vollgas, ein Autobild '
      + 'zu viel. Bewertet Kader wie Fahrzeuge (Motor, Bremse, Reifenwahl) und ordnet jeden Zugang danach '
      + 'ein, wofür er in einem Jahr gut sein könnte, nicht nur heute.',
    beat: 'Scouting, Draft, Transfers, Marktwerte, Kaderplanung und die Frage, wer als Nächstes durchstartet.',
  },
];

export const AUTHOR_BY_ID = Object.fromEntries(PRESS_AUTHORS.map((a) => [a.id, a]));

export function authorById(id) {
  return AUTHOR_BY_ID[id] || PRESS_AUTHORS[0];
}

// === Deterministischer Zufall ==============================================
// Slot-Belegung und Autorenwahl müssen auf beiden Geräten gleich ausfallen, ohne
// dass dafür etwas gespeichert wird. Darum: Seed aus dem Schlüssel, kein Math.random.
export function hashSeed(str) {
  let h = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededFloat(seed) {
  let x = (seed || 1) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5; x >>>= 0;
  return x / 4294967296;
}

export function seededPick(list, key) {
  const arr = list || [];
  if (!arr.length) return null;
  return arr[Math.floor(seededFloat(hashSeed(key)) * arr.length) % arr.length];
}

// Zufällige Auswahl aus dem Pool (echt zufällig, für neu entstehende Beiträge).
export function randomAuthor(exclude = []) {
  const pool = PRESS_AUTHORS.filter((a) => !exclude.includes(a.id));
  const list = pool.length ? pool : PRESS_AUTHORS;
  return list[Math.floor(Math.random() * list.length)];
}

export function randomAuthors(n, exclude = []) {
  const pool = PRESS_AUTHORS.filter((a) => !exclude.includes(a.id));
  const list = [...(pool.length >= n ? pool : PRESS_AUTHORS)];
  const out = [];
  while (out.length < n && list.length) {
    out.push(list.splice(Math.floor(Math.random() * list.length), 1)[0]);
  }
  return out;
}

// === Matches & Slots =======================================================
export const BATTLES_PER_MATCH = 3;

// Die Saison steckt im Präfix jeder Dokument-ID. Der Vorgabewert hält alle
// bestehenden Aufrufe (und die Saison-1-Daten) unverändert gültig.
export function matchDocId(day, matchIndex, season = 1) {
  return `s${season}-d${day}-m${matchIndex}`;
}

// Spielplan in die tatsächliche Reihenfolge bringen: Spieltag für Spieltag, darin
// die Paarungen in Listenreihenfolge. Diese Kette entscheidet, wann der Slot „vor
// dem Spiel“ eines Teams freigeschaltet wird (nämlich mit dem Ergebnis davor).
// Die Saison steht im Spielplan-Dokument selbst — damit tragen alle abgeleiteten
// IDs (Matches, Termine) automatisch das richtige Präfix, ohne dass eine Aufrufstelle
// die Saison durchreichen muss.
export function seasonOfSchedule(schedule) {
  return Number.isFinite(schedule?.season) ? schedule.season : 1;
}

export function matchSequence(schedule) {
  const season = seasonOfSchedule(schedule);
  const out = [];
  (schedule?.matchdays || []).forEach((md) => {
    (md.matches || []).forEach((m, i) => {
      out.push({
        day: md.day,
        matchIndex: i,
        home: m.home,
        away: m.away,
        id: matchDocId(md.day, i, season),
        seq: out.length,
      });
    });
  });
  return out;
}

export function isMatchComplete(result) {
  return (result?.battles || []).filter((b) => b && b.done === true).length >= BATTLES_PER_MATCH;
}

/**
 * Freigegeben ist ein Match erst, wenn jemand bestätigt hat, dass Ergebnis UND
 * Kampfverlauf final sind. Vorher schriebe die Presse über einen Stand, der sich
 * noch ändert — deshalb hängt jede Automatik an dieser Marke, nicht an
 * `isMatchComplete`. Fürs Nachholen von Hand zählt weiterhin nur die
 * Vollständigkeit.
 */
export function isPressReleased(result) {
  return isMatchComplete(result) && result?.pressReady === true;
}

// Welches Format liegt auf welchem Slot? Pro Team und Spieltag individuell gelost,
// aber deterministisch aus dem Schlüssel — ohne Schreibzugriff, auf jedem Gerät gleich.
export function slotPlan(teamId, day) {
  const first = seededFloat(hashSeed(`slot:${teamId}:${day}`)) < 0.5 ? 'interview' : 'pk';
  return { pre: first, post: first === 'interview' ? 'pk' : 'interview' };
}

export function sessionDocId(day, teamId, type, season = 1) {
  return `s${season}-d${day}-${teamId}-${type}`;
}

// Einmalige Auftaktrunde: vor diesem Spieltag tritt JEDES Team einmal zur
// Pressekonferenz an — acht Termine, die den Rest der Saison vorbereiten. Erst
// wenn sie durch sind, startet der Spieltag regulär. In Saison 1 gehörte zu jeder
// Konferenz noch ein Interview (16 Termine); das bleibt für diese Saison so
// stehen, damit ihre Historie vollständig bleibt (`bonusTypes`).
//
// DER SPÄTE START WAR EINE EINMALIGE AUSNAHME DER SAISON 1. Die Presse ist dort
// mitten in der Saison dazugekommen, deshalb liegt die Auftaktrunde vor Spieltag 8
// und die Spieltage davor bleiben leer. Ab Saison 2 nimmt die Redaktion mit dem
// ersten Spieltag ihre Arbeit auf — die Auftaktrunde ist dann der Start in die
// Saison, inklusive der Aufsteiger.
const BONUS_ROUND_DAY_BY_SEASON = { 1: 8 };
const BONUS_ROUND_DAY_DEFAULT = 1;

export function bonusRoundDay(season = 1) {
  return BONUS_ROUND_DAY_BY_SEASON[Number(season)] ?? BONUS_ROUND_DAY_DEFAULT;
}

// Erster Spieltag mit Pressebetrieb — die Spieltage davor werden nicht
// nachträglich mit Terminen gefüllt.
// (Gleiches Muster wie MATCHDAY_AWARDS_FROM in awards.mjs.)
export function pressFromDay(season = 1) {
  return bonusRoundDay(season);
}

export function bonusTypes(season = 1) {
  return Number(season) === 1 ? ['pk', 'interview'] : ['pk'];
}

export function bonusSessionId(teamId, type, season = 1) {
  return `s${season}-bonus-${teamId}-${type}`;
}

export function bonusSlotsFor(teamId, schedule, sessions = []) {
  const season = seasonOfSchedule(schedule);
  const day = bonusRoundDay(season);
  const match = matchSequence(schedule).find((m) => m.day === day && (m.home === teamId || m.away === teamId));
  if (!match) return [];
  return bonusTypes(season).map((type) => {
    const id = bonusSessionId(teamId, type, season);
    return {
      id,
      day,
      teamId,
      opponentId: match.home === teamId ? match.away : match.home,
      home: match.home === teamId,
      matchId: null,
      slot: 'bonus',
      type,
      open: true,
      blockedBy: null,
      done: (sessions || []).some((s) => s?.id === id && s.status === 'done'),
    };
  });
}

// Sind alle Termine der Auftaktrunde abgearbeitet?
export function bonusRoundComplete(teamIds, schedule, sessions) {
  const rows = (teamIds || []).flatMap((id) => bonusSlotsFor(id, schedule, sessions));
  return rows.length > 0 && rows.every((r) => r.done);
}

export function bonusRoundProgress(teamIds, schedule, sessions) {
  const rows = (teamIds || []).flatMap((id) => bonusSlotsFor(id, schedule, sessions));
  return { done: rows.filter((r) => r.done).length, total: rows.length };
}

// === Ausblicksrunde nach der Saison ========================================
// Wenn die Saison gespielt ist, tritt jedes Team ein letztes Mal an: die Runde vor
// Transferfenster und Draft. Sie hat fünf statt drei Fragen und ist der Aufhänger
// für alles, was die Presse in der Pause noch schreibt.
export const OUTLOOK_QUESTIONS = 5;

export function outlookSessionId(teamId, season = 1) {
  return `s${season}-outlook-${teamId}`;
}

/** Ist jede geplante Partie der Saison gespielt? */
export function seasonComplete(schedule, results) {
  const seq = matchSequence(schedule);
  if (!seq.length) return false;
  const byId = {};
  (results || []).forEach((r) => { if (r?.id) byId[r.id] = r; });
  return seq.every((m) => isMatchComplete(byId[m.id]));
}

export function outlookSlotFor(teamId, schedule, results, sessions = []) {
  const seq = matchSequence(schedule);
  if (!seq.some((m) => m.home === teamId || m.away === teamId)) return null;
  const season = seasonOfSchedule(schedule);
  const id = outlookSessionId(teamId, season);
  const open = seasonComplete(schedule, results);
  return {
    id,
    day: null,
    teamId,
    opponentId: null,
    home: false,
    matchId: null,
    slot: 'outlook',
    type: 'pk',
    open,
    blockedBy: open ? null : 'season',
    done: (sessions || []).some((s) => s?.id === id && s.status === 'done'),
  };
}

/** Wie viele Teams haben ihre Ausblicks-PK schon hinter sich? */
export function outlookProgress(teamIds, schedule, results, sessions) {
  const rows = (teamIds || []).map((id) => outlookSlotFor(id, schedule, results, sessions)).filter(Boolean);
  return { done: rows.filter((r) => r.done).length, total: rows.length };
}

// Alle Presse-Termine eines Teams: je Spieltag ein Interview und eine Pressekonferenz.
//   „vor dem Spiel“  — frei, sobald das im Spielplan davorliegende Match fertig ist
//   „nach dem Spiel“ — frei, sobald der SPIELBERICHT freigegeben ist. Nicht schon mit
//     dem dritten Kampf: Erst reden, wenn die Redaktion das Spiel gesehen hat — sonst
//     bezieht sich ein Trainer auf ein Spiel, über das noch nichts geschrieben steht.
// Davor liegt einmalig die Auftaktrunde; solange sie läuft, bleibt der Vor-dem-Spiel-
// Termin des Auftakt-Spieltags gesperrt.
export function pressSlots(teamId, schedule, results, sessions = [], bonusComplete = false) {
  const season = seasonOfSchedule(schedule);
  const from = pressFromDay(season);
  const bonusDay = bonusRoundDay(season);
  const seq = matchSequence(schedule);
  const byId = {};
  (results || []).forEach((r) => { if (r?.id) byId[r.id] = r; });
  const out = [...bonusSlotsFor(teamId, schedule, sessions)];

  const hasSession = (id) => (sessions || []).some((s) => s?.id === id);

  seq.forEach((m) => {
    if (m.home !== teamId && m.away !== teamId) return;
    const plan = slotPlan(teamId, m.day);
    // Spieltage vor dem Pressestart bleiben leer — es sei denn, dort hat schon
    // einmal ein Termin stattgefunden.
    if (m.day < from && !['pre', 'post'].some((s) => hasSession(sessionDocId(m.day, teamId, plan[s], season)))) return;
    const prev = m.seq > 0 ? seq[m.seq - 1] : null;
    const waitsForBonus = m.day === bonusDay && !bonusComplete;
    const preOpen = (!prev || isMatchComplete(byId[prev.id])) && !waitsForBonus;
    const postOpen = isPressReleased(byId[m.id]);
    const opponent = m.home === teamId ? m.away : m.home;
    [['pre', preOpen], ['post', postOpen]].forEach(([slot, open]) => {
      out.push({
        id: sessionDocId(m.day, teamId, plan[slot], season),
        day: m.day,
        teamId,
        opponentId: opponent,
        home: m.home === teamId,
        matchId: m.id,
        slot,
        type: plan[slot],
        open,
        // Beschreibt, worauf noch gewartet wird — die Ansicht zeigt das als Hinweis.
        blockedBy: open ? null : slot === 'pre' ? (waitsForBonus ? 'bonus' : prev?.id || null) : m.id,
        // „nach dem Spiel“ kann aus zwei Gründen zu sein: Das Match ist noch nicht
        // fertig, oder es ist fertig und wartet nur noch auf die Pressefreigabe.
        needsRelease: slot === 'post' && !open && isMatchComplete(byId[m.id]),
      });
    });
  });

  const outlook = outlookSlotFor(teamId, schedule, results, sessions);

  const rank = { bonus: 0, pre: 1, post: 2 };
  const sorted = out.sort((a, b) => a.day - b.day || rank[a.slot] - rank[b.slot]);
  // Die Ausblicksrunde liegt hinter allen Spieltagen und trägt deshalb keinen Tag.
  return outlook ? [...sorted, outlook] : sorted;
}

export function slotLabel(slot) {
  if (slot === 'bonus') return 'Auftaktrunde';
  if (slot === 'outlook') return 'Nach der Saison';
  return slot === 'pre' ? 'Vor dem Spiel' : 'Nach dem Spiel';
}

export function typeLabel(type) {
  if (type === 'talk') return 'Talkshow · Cava LANZ';
  return type === 'pk' ? 'Pressekonferenz' : 'Interview';
}

// === Storylines ============================================================
// Der jüngste Beitrag, der eine Storyline erwähnt, definiert ihren Stand.
export const STORY_STATUS = ['neu', 'laufend', 'eskaliert', 'beruhigt', 'beendet'];

export function storyId(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'story';
}

export function collectStorylines(articles) {
  const byId = {};
  [...(articles || [])]
    .filter((a) => a && a.status !== 'pending')
    .sort((a, b) => String(a.publishedAt || '').localeCompare(String(b.publishedAt || '')))
    .forEach((a) => {
      (a.storylines || []).forEach((s) => {
        if (!s || !s.id) return;
        const prev = byId[s.id];
        byId[s.id] = {
          id: s.id,
          title: s.title || prev?.title || s.id,
          teams: s.teams?.length ? s.teams : prev?.teams || [],
          status: s.status || 'laufend',
          summary: s.summary || prev?.summary || '',
          day: a.day ?? prev?.day ?? null,
          lastAt: a.publishedAt || a.createdAt || null,
          beats: (prev?.beats || 0) + 1,
        };
      });
    });
  return Object.values(byId).sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
}

// Für den Prompt: was läuft gerade rund um dieses Team? Abgeschlossene Storylines
// werden weiterhin mitgegeben (als Gedächtnis), aber deutlich als beendet markiert.
export function activeStorylines(articles, teamId = null, limit = 12) {
  return collectStorylines(articles)
    .filter((s) => !teamId || !s.teams?.length || s.teams.includes(teamId))
    .slice(0, limit);
}

// === Beiträge ==============================================================
// Beiträge der beiden Spieler tragen immer den Stempel „Redaktion“, dürfen inhaltlich
// aber in einer anderen Rubrik stehen. Der Filter „Redaktion“ meint deshalb die
// Herkunft, alle anderen Filter meinen die Rubrik.
export function articleMatchesFilter(article, { category = '', teamId = '', authorId = '', q = '' } = {}) {
  if (!article) return false;
  const cats = categoriesOf(article);
  if (category === 'redaktion') {
    if (!article.editorial && !cats.includes('redaktion')) return false;
  } else if (category && !cats.includes(category)) return false;
  if (teamId && !(article.teamIds || []).includes(teamId)) return false;
  if (authorId && article.authorId !== authorId) return false;
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  const hay = `${article.title || ''} ${article.subtitle || ''} ${plainText(article.body)}`.toLowerCase();
  return hay.includes(needle);
}

export function sortArticles(list) {
  return [...(list || [])].sort((a, b) => {
    const ta = a?.publishedAt || a?.createdAt || '';
    const tb = b?.publishedAt || b?.createdAt || '';
    return String(tb).localeCompare(String(ta));
  });
}

export function plainText(html) {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h\d|li|blockquote|div|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  // Bausteine und Tabellenzeilen gehören nicht in Vorschautext, Lesedauer und Suche:
  // aufgelöst werden sie erst beim Anzeigen, hier stehen sie nur als Klammerwerk da.
  return stripTiles(text)
    .split('\n')
    .filter((line) => !/^\s*\|.*\|\s*$/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerpt(article, len = 180) {
  const t = plainText(article?.body);
  return t.length > len ? `${t.slice(0, len).replace(/\s+\S*$/, '')}…` : t;
}

export function readingMinutes(article) {
  const words = plainText(article?.body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Die Beiträge schreiben nur zwei Personen und ein Modell — trotzdem wird das HTML
// vor dem Speichern auf eine kleine Whitelist reduziert. Das hält den Textkörper
// sauber (kein Inline-Style-Wildwuchs aus der Zwischenablage) und schließt
// Script-Injektion über einen kopierten Schnipsel aus.
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'hr', 'span',
]);
const ALLOWED_ATTRS = { a: ['href', 'title'], img: ['src', 'alt', 'style'] };

// Manche Browser (vor allem mobile) erzeugen im contenteditable ein <div> statt
// eines <p>. Würde das hier aufgelöst, verschmölzen alle Absätze zu einem Block —
// deshalb wird es zum Absatz umgeschrieben statt entfernt.
const TAG_ALIASES = { div: 'p' };

// Bilder dürfen in der Breite skaliert werden — mehr Stil braucht der Textkörper
// nicht, und mehr würde die Whitelist unterlaufen.
function safeImgStyle(value) {
  const width = /(?:^|;)\s*width\s*:\s*(\d{1,3})\s*%/i.exec(String(value || ''));
  if (!width) return '';
  const pct = Math.min(100, Math.max(5, Number(width[1])));
  return `width:${pct}%`;
}

export function sanitizeHtml(html) {
  const input = String(html || '');
  if (typeof document === 'undefined') return input.replace(/<script[\s\S]*?<\/script>/gi, '');
  const tpl = document.createElement('template');
  tpl.innerHTML = input;

  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) return;
      if (child.nodeType !== 1) return child.remove();
      let tag = child.tagName.toLowerCase();
      if (TAG_ALIASES[tag]) {
        const replacement = document.createElement(TAG_ALIASES[tag]);
        [...child.childNodes].forEach((n) => replacement.appendChild(n));
        child.replaceWith(replacement);
        child = replacement;
        tag = TAG_ALIASES[tag];
      }
      if (!ALLOWED_TAGS.has(tag)) {
        // Unbekanntes Element auflösen statt löschen: der Text bleibt erhalten.
        const frag = document.createDocumentFragment();
        [...child.childNodes].forEach((n) => frag.appendChild(n));
        child.replaceWith(frag);
        return walk(node);
      }
      const keep = ALLOWED_ATTRS[tag] || [];
      [...child.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (!keep.includes(name)) return child.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) child.removeAttribute(attr.name);
        if (name === 'style') {
          const style = tag === 'img' ? safeImgStyle(attr.value) : '';
          if (style) child.setAttribute('style', style);
          else child.removeAttribute('style');
        }
      });
      if (tag === 'a') {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
      walk(child);
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

// Das Modell liefert den Text als Absatz-Array — daraus wird der Textkörper gebaut.
// Ein Eintrag, der mit „> “ beginnt, wird zum Zitatblock, „## “ zur Zwischenüberschrift.
export function paragraphsToHtml(list) {
  return (Array.isArray(list) ? list : [String(list || '')])
    .map((raw) => String(raw || '').trim())
    .filter(Boolean)
    .map((p) => {
      if (p.startsWith('## ')) return `<h3>${escapeHtml(p.slice(3))}</h3>`;
      if (p.startsWith('> ')) return `<blockquote>${inlineHtml(p.slice(2))}</blockquote>`;
      return `<p>${inlineHtml(p)}</p>`;
    })
    .join('');
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Sehr kleines Inline-Markup: **fett** und *kursiv* — mehr braucht der Fließtext nicht.
function inlineHtml(str) {
  return escapeHtml(str)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>');
}

// === Anzeige ===============================================================
const DATE_FMT = { day: '2-digit', month: 'long', year: 'numeric' };

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', DATE_FMT);
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('de-DE', DATE_FMT)}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

// === Interview-Gäste =======================================================
// Ein Interview richtet sich nicht an irgendwen aus dem Kader, sondern an die, über
// die gerade geredet wird. Die Redaktion fragt je Termin eins bis drei Gesichter an;
// Anzahl und Auswahl hängen an der Termin-ID und sind damit auf jedem Gerät gleich
// und nicht durch erneutes Öffnen neu auszuwürfeln.

// Eine ganze Zahlenfolge aus einem Startwert (mulberry32) — seededFloat liefert nur
// einen einzelnen Wert je Schlüssel.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Kills, Deaths und Einsätze einer Seite in einem Ergebnis, je Pokémon.
export function matchLines(result, side) {
  const out = {};
  const line = (name) => { if (!out[name]) out[name] = { kills: 0, deaths: 0, used: 0 }; return out[name]; };
  (result?.battles || []).filter((b) => b && b.done).forEach((b) => {
    (b.used?.[side] || []).forEach((n) => { if (n) line(n).used += 1; });
    (b.kills || []).forEach((k) => {
      if (k.victimSide === side && k.victim) line(k.victim).deaths += 1;
      if (k.killerSide === side && k.victimSide !== side && k.killer) line(k.killer).kills += 1;
    });
  });
  return out;
}

function mentions(text, name) {
  if (!text || !name) return false;
  return String(text).toLowerCase().includes(String(name).toLowerCase());
}

/**
 * Wer ist für ein Interview gerade interessant?
 * @param {object} input
 *   roster:     [{ name, image, traits }]
 *   trainer:    { name, image, traits } | null
 *   storylines: [{ title, summary, status }] — laufende Geschichten des Teams
 *   articles:   [{ pokemonNames }]            — jüngste Beiträge über das Team
 *   awardWins:  { name: Anzahl }               — Auszeichnungen dieser Saison
 *   lastMatch:  { name: { kills, deaths, used } } — das zuletzt gespielte Match
 * @returns {Array} Kandidaten mit `score` und `reason` (bester Grund)
 */
export function interviewCandidates({ roster = [], trainer = null, storylines = [], articles = [], awardWins = {}, lastMatch = {} } = {}) {
  const people = [
    ...(trainer ? [{ kind: 'trainer', ...trainer }] : []),
    ...roster.map((p) => ({ kind: 'pokemon', ...p })),
  ];
  return people.map((p) => {
    const reasons = [];
    let score = p.kind === 'trainer' ? 1.5 : 0;
    storylines.filter((st) => st.status !== 'beendet' && (mentions(st.title, p.name) || mentions(st.summary, p.name)))
      .forEach((st) => {
        const w = st.status === 'eskaliert' ? 4 : st.status === 'beruhigt' ? 1.5 : 3;
        score += w;
        reasons.push({ w, text: `Im Gespräch: ${st.title}` });
      });
    const inArticles = articles.filter((a) => (a.pokemonNames || []).includes(p.name)).length;
    if (inArticles) {
      const w = Math.min(3, inArticles);
      score += w;
      reasons.push({ w: w - 0.5, text: inArticles === 1 ? 'Zuletzt in der Presse' : `${inArticles}× zuletzt in der Presse` });
    }
    const wins = awardWins[p.name] || 0;
    if (wins) {
      score += 2 * wins;
      reasons.push({ w: 2 * wins, text: wins === 1 ? 'Ausgezeichnet' : `${wins} Auszeichnungen` });
    }
    const m = lastMatch[p.name];
    if (m?.kills >= 2) {
      score += m.kills;
      reasons.push({ w: m.kills, text: `${m.kills} Kills im letzten Match` });
    } else if (m?.used >= 2 && !m.kills && m.deaths >= 2) {
      score += 1.5;
      reasons.push({ w: 1.5, text: 'Zuletzt ohne Kill, oft gefallen' });
    }
    const best = reasons.sort((a, b) => b.w - a.w)[0];
    return { ...p, score, reason: best?.text || (p.kind === 'trainer' ? 'Verantwortlich an der Seitenlinie' : '') };
  });
}

// Eins bis drei Gäste aus den Kandidaten ziehen — gewichtet nach Relevanz, aus den
// sechs relevantesten, reproduzierbar über die Termin-ID.
export function pickInterviewGuests(seedKey, candidates = []) {
  const list = candidates.filter((c) => c && c.name);
  if (list.length <= 1) return list;
  const rand = seededRandom(hashSeed(seedKey));
  const count = Math.min(list.length, 1 + Math.floor(rand() * 3));
  const pool = [...list].sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name))).slice(0, 6);
  const out = [];
  while (out.length < count && pool.length) {
    const total = pool.reduce((sum, c) => sum + c.score + 0.5, 0);
    let r = rand() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= pool[i].score + 0.5;
      if (r <= 0) break;
    }
    out.push(pool.splice(i, 1)[0]);
  }
  return out.sort((a, b) => b.score - a.score);
}
