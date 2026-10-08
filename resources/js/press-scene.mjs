// Die Kulisse der Pressetermine: Werbewand, Podium, Mikrofone, Pressebank.
//
// Framework-frei und unter Node testbar. Die Komponente im Presse-View (und der
// Probelauf presse-entwurf.html) holt sich hier ein fertiges Szenen-Objekt und
// zeichnet es nur noch.
//
// Die Sponsoren sind Firmen aus den PokéJobs (Logos aus dem PokéWiki, fest unter
// public/img/sponsors/). Jeder Verein hat seinen eigenen Sponsorenkreis — abgeleitet
// aus dem Franchise, also über Saisons hinweg derselbe —, und jeder Termin mischt
// ihn neu. Das Vereinswappen taucht zwischendurch mit auf.

import { hashSeed } from './press.mjs';

// `group` fasst Logos zusammen, die sich zum Verwechseln ähneln (die Macro-Cosmos-
// Familie, die Galar-Behörden). Aus einer Gruppe kommen höchstens zwei in einen Kreis.
export const SPONSOR_LOGOS = [
  { key: 'aurora', name: 'Aurora' },
  { key: 'bookmark', name: 'Bookmark' },
  { key: 'captain-wailord', name: 'Captain Wailord' },
  { key: 'celebrity', name: 'Celebrity' },
  { key: 'claw-universitaet', name: 'Claw-Universität' },
  { key: 'cozy-fried-kitchen', name: 'Cozy Fried Kitchen' },
  { key: 'daily-discovery', name: 'Daily Discovery' },
  { key: 'defog', name: 'Defog' },
  { key: 'densoku', name: 'DENSOKU' },
  { key: 'dream-farm', name: 'Dream Farm' },
  { key: 'foerderverein-spikeford', name: 'Förderverein Spikeford' },
  { key: 'galar-bergbau', name: 'Galar-Bergbau', group: 'galar' },
  { key: 'galar-feuerwehr', name: 'Galar-Feuerwehr', group: 'galar' },
  { key: 'galar-polizei', name: 'Galar-Polizei', group: 'galar' },
  { key: 'galar-post', name: 'Galar-Post', group: 'galar' },
  { key: 'galar-taxi', name: 'Galar-Taxi', group: 'galar' },
  { key: 'good-fit', name: 'Good Fit' },
  { key: 'gramophone-records', name: 'Gramophone Records' },
  { key: 'gustomato', name: 'Gustomato' },
  { key: 'hijiki-oka', name: 'Hijiki-Oka' },
  { key: 'hotel-ionia', name: 'Hotel Ionia' },
  { key: 'hot-pot', name: 'Hot Pot' },
  { key: 'jetsetter', name: 'Jetsetter' },
  { key: 'knospi-inn', name: 'Knospi Inn' },
  { key: 'lapras-schiffbau', name: 'Lapras-Schiffbau' },
  { key: 'la-rose-ronde', name: 'La Rose Ronde' },
  { key: 'lass', name: 'LASS' },
  { key: 'macro-cosmos-airlines', name: 'Macro Cosmos Airlines', group: 'mc' },
  { key: 'macro-cosmos-bank', name: 'Macro Cosmos Bank', group: 'mc' },
  { key: 'macro-cosmos-construction', name: 'Macro Cosmos Construction', group: 'mc' },
  { key: 'macro-cosmos-energy', name: 'Macro Cosmos Energy', group: 'mc' },
  { key: 'macro-cosmos-lifestyle', name: 'Macro Cosmos Lifestyle', group: 'mc' },
  { key: 'macro-cosmos-network', name: 'Macro Cosmos Network', group: 'mc' },
  { key: 'macro-cosmos-railways', name: 'Macro Cosmos Railways', group: 'mc' },
  { key: 'macro-cosmos-technology', name: 'Macro Cosmos Technology', group: 'mc' },
  { key: 'macro-net', name: 'Macro Net' },
  { key: 'macro-tv', name: 'Macro TV' },
  { key: 'mc-versicherungen', name: 'MC Versicherungen', group: 'mcx' },
  { key: 'mc-wertpapiere', name: 'MC Wertpapiere', group: 'mcx' },
  { key: 'mca-cargo', name: 'MCA Cargo', group: 'mcx' },
  { key: 'mcr-gueterverkehr', name: 'MCR Güterverkehr', group: 'mcx' },
  { key: 'motorasanz', name: 'MotoRasanz' },
  { key: 'number-one', name: 'Number One' },
  { key: 'pelipperando', name: 'Pelipperando' },
  { key: 'pharmarceus', name: 'Pharmarceus' },
  { key: 'porcini', name: 'Porcini' },
  { key: 'praktibalk', name: 'Praktibalk & Co.' },
  { key: 'restaurant-wellenflucht', name: 'Restaurant Wellenflucht' },
  { key: 'rond-flowers', name: 'Rond Flowers' },
  { key: 'score-monorail', name: 'Score Monorail' },
  { key: 'spotlight', name: 'Spotlight' },
  { key: 'stahlos-wagonbau', name: 'Stahlos-Wagonbau' },
  { key: 'steakhaus-leckerpaul', name: 'Steakhaus Leckerpaul' },
  { key: 'surfer-express', name: 'Surfer-Express' },
  { key: 'telescreen', name: 'Telescreen' },
  { key: 'turf-farm', name: 'Turf Farm' },
  { key: 'yoshida-coffee', name: 'Yoshida Coffee' },
];
export const SPONSOR_PATH = './img/sponsors/';
export const SPONSORS_PER_CLUB = 12;

// Kleiner deterministischer Zufall (mulberry32) — dieselbe Saat gibt auf jedem
// Gerät dieselbe Wand.
export function seededRandom(key) {
  let a = hashSeed(key) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Der Sponsorenkreis eines Vereins: `count` Logos, aus jeder Gruppe höchstens zwei.
 * Hängt nur am Franchise-Schlüssel und bleibt damit über Saisons hinweg gleich.
 */
export function clubSponsors(clubKey, count = SPONSORS_PER_CLUB) {
  const rand = seededRandom(`sponsors:${clubKey || 'liga'}`);
  const perGroup = {};
  const out = [];
  for (const logo of shuffle(SPONSOR_LOGOS, rand)) {
    if (out.length >= count) break;
    if (logo.group) {
      if ((perGroup[logo.group] || 0) >= 2) continue;
      perGroup[logo.group] = (perGroup[logo.group] || 0) + 1;
    }
    out.push(logo);
  }
  return out;
}

/**
 * Eine Werbewand: `count` Felder aus dem Sponsorenkreis, je Termin neu gemischt,
 * ohne zwei gleiche Logos nebeneinander. Etwa jedes `teamEvery`-te Feld trägt das
 * Vereinswappen (sofern eines übergeben ist).
 * @returns {Array<{ key, name, src, team: boolean }>}
 */
export function sponsorWall({ clubKey, seed, count = 24, teamLogo = '', teamName = '', teamEvery = 7 } = {}) {
  const pool = clubSponsors(clubKey);
  const rand = seededRandom(`wall:${clubKey}:${seed || ''}`);
  const out = [];
  let deck = [];
  // Der erste Wappenplatz liegt je Termin woanders, damit nicht jede Wand gleich beginnt.
  const offset = Math.floor(rand() * teamEvery);
  for (let i = 0; i < count; i++) {
    if (teamLogo && i % teamEvery === offset) {
      out.push({ key: `team-${i}`, name: teamName, src: teamLogo, team: true });
      continue;
    }
    if (!deck.length) deck = shuffle(pool, rand);
    let next = deck.shift();
    if (out.length && out[out.length - 1].key === next.key && deck.length) {
      deck.push(next);
      next = deck.shift();
    }
    out.push({ key: next.key, name: next.name, src: `${SPONSOR_PATH}${next.key}.webp`, team: false });
  }
  return out;
}

// Die laufenden Bänder der Pressekonferenz: `rows` Reihen aus einer Wand. Jede Reihe
// wird in der Darstellung verdoppelt, damit das Band nahtlos durchläuft.
export function ledRows(wall, rows = 3) {
  const per = Math.ceil(wall.length / rows);
  return Array.from({ length: rows }, (_, r) => wall.slice(r * per, (r + 1) * per));
}

// Kurzname für den Mikrofonwürfel: "Liga-TV" bleibt, "Ligamagazin „Ewige Flamme"" wird "EF".
export function micLabel(outlet = '') {
  const clean = String(outlet).replace(/[„“"]/g, '').trim();
  if (!clean) return 'JHDL';
  if (clean.length <= 9) return clean.toUpperCase();
  const quoted = String(outlet).match(/[„"](.+?)[“"]/);
  const base = quoted ? quoted[1] : clean;
  const initials = base.split(/[\s-]+/).filter(Boolean).map((w) => w[0]).join('');
  return (initials.length >= 2 ? initials : base.slice(0, 4)).toUpperCase();
}

// Farben der Mikrofonwürfel auf dem Podium — fest, damit sie sich vom Team abheben.
export const MIC_COLORS = ['#e3350d', '#4d90d5', '#e0a800', '#3f9a4c', '#a855f7', '#f97316', '#334155'];

/**
 * Die Pressebank der Pressekonferenz: auf jedem Stuhl sitzt ein Pressevertreter der
 * Redaktion — alle, nicht nur die drei, die an diesem Termin fragen. Die Sitzordnung
 * hängt am Termin, nicht an der gerade fragenden Person, sonst spränge die Bank bei
 * jeder Frage um. Die Fragenden sitzen möglichst mittig, damit sie mobil nie am Rand
 * landen.
 * @param {Array} audience   alle Pressevertreter (ein Stuhl je Person)
 * @param {Array} askers     die IDs derer, die an diesem Termin fragen
 */
export function pressSeats(audience = [], { askers = [], seed = '' } = {}) {
  const rand = seededRandom(`seats:${seed}`);
  const asking = new Set(askers);
  const front = shuffle(audience.filter((a) => asking.has(a.id)), rand);
  const rest = shuffle(audience.filter((a) => !asking.has(a.id)), rand);
  const n = audience.length;
  // Von der Mitte nach außen auffüllen: erst die Fragenden, dann der Rest.
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b);
  const out = Array.from({ length: n }, (_, i) => ({ index: i, reporter: null }));
  [...front, ...rest].forEach((r, i) => { out[order[i]].reporter = r; });
  return out;
}

// Rückenansicht eines Pressevertreters für die Pressebank: gleicher Dateiname unter
// `img/press/back/`. Ob es sie gibt, zeigt erst das Laden im Browser — wer keine hat,
// landet in `MISSING_BACKS` und bekommt ab dann gleich die Vorderansicht.
export const MISSING_BACKS = new Set();
export function backSprite(image) {
  const src = String(image || '');
  const m = src.match(/^(.*\/img\/press\/)([^/]+)$/);
  return m ? `${m[1]}back/${m[2]}` : '';
}
export function seatSprite(reporter) {
  const back = backSprite(reporter?.image);
  return back && !MISSING_BACKS.has(back) ? back : reporter?.image || '';
}
// Für den @error-Handler am Bild: Rückenansicht fehlt -> Vorderansicht.
export function backMissing(img, reporter) {
  const back = backSprite(reporter?.image);
  if (!back || !img) return;
  MISSING_BACKS.add(back);
  if (img.getAttribute('src') !== reporter.image) img.src = reporter.image;
}

/**
 * Das Szenen-Objekt für den Termin.
 * @param {object} o
 * @param {'pk'|'interview'} o.kind
 * @param {string} o.sessionId     Saat für Wand und Pressebank
 * @param {string} o.clubKey       Franchise-Schlüssel des Vereins (Sponsorenkreis)
 * @param {{ name, logo, color }} o.team
 * @param {{ name, image, kind }} o.guest   wer befragt wird
 * @param {Array<{ id, name, image, outlet }>} o.reporters  die Fragenden dieses Termins
 * @param {Array<{ id, name, image, outlet }>} o.audience   die ganze Pressebank (PK); ohne Angabe nur die Fragenden
 * @param {string} o.askerId
 */
export function buildScene({ kind = 'interview', sessionId = '', clubKey = '', team = {}, guest = {}, reporters = [], audience = null, askerId = null } = {}) {
  const isPk = kind === 'pk';
  const wall = sponsorWall({
    clubKey,
    seed: sessionId,
    count: isPk ? 36 : 40,
    teamLogo: team.logo || '',
    teamName: team.name || '',
    teamEvery: isPk ? 9 : 9,
  });
  const asker = reporters.find((r) => r.id === askerId) || reporters[0] || null;
  const tagged = reporters.map((r) => ({ ...r, mic: micLabel(r.outlet), asking: !!asker && r.id === asker.id }));
  return {
    kind: isPk ? 'pk' : 'interview',
    team: { name: team.name || '', logo: team.logo || '', color: team.color || '#e3350d' },
    guest: { name: guest.name || '', image: guest.image || '', kind: guest.kind || 'trainer' },
    reporters: tagged,
    asker: asker ? { ...asker, mic: micLabel(asker.outlet) } : null,
    wall,
    rows: isPk ? ledRows(wall, 3) : [],
    seats: isPk
      ? pressSeats((audience?.length ? audience : reporters).map((r) => ({ ...r, asking: !!asker && r.id === asker.id })), {
        askers: reporters.map((r) => r.id),
        seed: sessionId,
      })
      : [],
    mics: isPk
      ? tagged.map((r, i) => ({ label: r.mic, color: MIC_COLORS[i % MIC_COLORS.length] }))
        .concat([{ label: 'JHDL', color: MIC_COLORS[(tagged.length + 3) % MIC_COLORS.length] }])
      : [],
  };
}
