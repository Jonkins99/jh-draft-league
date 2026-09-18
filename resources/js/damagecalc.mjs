// Schadensrechner — Brücke zwischen der Liga und @smogon/calc.
//
// Dieses Modul enthält nur reine Logik (keine Alpine-, keine Firebase-Bindung)
// und ist damit unter Node testbar. @smogon/calc selbst wird NICHT hier
// importiert, sondern erst in der View dynamisch nachgeladen — so bleibt das
// Paket (≈130 kB) aus dem Start-Bundle heraus.
//
// Zwei Eigenheiten von „Pokémon Champions", die hier abgebildet werden:
//
// 1. Statuspunkte statt EVs. Champions vergibt je Statuswert 0–32 SP, die auf
//    Level 50 exakt 1:1 in Statuspunkte umschlagen. Die klassische Formel
//    rechnet stattdessen mit EVs: floor(EV/4) fließt HALBIERT in den Wert ein,
//    ein SP entspricht also 8 EV. 32 SP ergäben 256 EV — der Deckel von 252 EV
//    liefert an dieser Stelle denselben Endwert, deshalb ist die Umrechnung
//    über den gesamten Bereich verlustfrei (siehe Tests).
//
// 2. Kampfformat. Champions-VGC sind Doppelkämpfe; der Rechner läuft deshalb
//    fest auf Generation 9 mit gameType „Doubles".

export const CALC_GEN = 9;
export const CALC_GAME_TYPE = 'Doubles';

export const MAX_SP = 32;
export const EV_PER_SP = 8;
export const MAX_EV = 252;

// --- Statuswerte -----------------------------------------------------------

export const STATS = [
  { key: 'hp', label: 'KP', short: 'KP' },
  { key: 'atk', label: 'Angriff', short: 'Ang' },
  { key: 'def', label: 'Verteidigung', short: 'Vert' },
  { key: 'spa', label: 'Spezial-Angriff', short: 'SpA' },
  { key: 'spd', label: 'Spezial-Verteidigung', short: 'SpVert' },
  { key: 'spe', label: 'Initiative', short: 'Init' },
];
export const STAT_KEYS = STATS.map((s) => s.key);
const STAT_BY_KEY = Object.fromEntries(STATS.map((s) => [s.key, s]));

export function statLabel(key) {
  return STAT_BY_KEY[key]?.short || key;
}

export function clampSpValue(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_SP, n));
}

export function spToEv(sp) {
  return Math.min(MAX_EV, clampSpValue(sp) * EV_PER_SP);
}

export function evToSp(ev) {
  const n = Number(ev);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return clampSpValue(Math.round(n / EV_PER_SP));
}

// --- Wesen -----------------------------------------------------------------
// Deutscher Name, englischer Name für @smogon/calc und die beiden betroffenen
// Statuswerte. Die fünf neutralen Wesen stehen zuerst.

export const NATURES = [
  { de: 'Robust', en: 'Hardy', up: null, down: null },
  { de: 'Solo', en: 'Docile', up: null, down: null },
  { de: 'Ernst', en: 'Serious', up: null, down: null },
  { de: 'Neugier', en: 'Bashful', up: null, down: null },
  { de: 'Schlicht', en: 'Quirky', up: null, down: null },
  { de: 'Hart', en: 'Lonely', up: 'atk', down: 'def' },
  { de: 'Mutig', en: 'Brave', up: 'atk', down: 'spe' },
  { de: 'Frech', en: 'Adamant', up: 'atk', down: 'spa' },
  { de: 'Pfiffig', en: 'Naughty', up: 'atk', down: 'spd' },
  { de: 'Kühn', en: 'Bold', up: 'def', down: 'atk' },
  { de: 'Lasch', en: 'Relaxed', up: 'def', down: 'spe' },
  { de: 'Sanft', en: 'Impish', up: 'def', down: 'spa' },
  { de: 'Locker', en: 'Lax', up: 'def', down: 'spd' },
  { de: 'Scheu', en: 'Timid', up: 'spe', down: 'atk' },
  { de: 'Hastig', en: 'Hasty', up: 'spe', down: 'def' },
  { de: 'Froh', en: 'Jolly', up: 'spe', down: 'spa' },
  { de: 'Naiv', en: 'Naive', up: 'spe', down: 'spd' },
  { de: 'Mäßig', en: 'Modest', up: 'spa', down: 'atk' },
  { de: 'Mild', en: 'Mild', up: 'spa', down: 'def' },
  { de: 'Ruhig', en: 'Quiet', up: 'spa', down: 'spe' },
  { de: 'Hitzig', en: 'Rash', up: 'spa', down: 'spd' },
  { de: 'Still', en: 'Calm', up: 'spd', down: 'atk' },
  { de: 'Zart', en: 'Gentle', up: 'spd', down: 'def' },
  { de: 'Forsch', en: 'Sassy', up: 'spd', down: 'spe' },
  { de: 'Sacht', en: 'Careful', up: 'spd', down: 'spa' },
];

const NATURE_BY_DE = Object.fromEntries(NATURES.map((n) => [n.de, n]));

export function natureByDe(de) {
  return NATURE_BY_DE[String(de || '').trim()] || null;
}

// „Hart (Ang+, Vert−)" bzw. „Robust (neutral)".
export function natureLabel(nature) {
  const n = typeof nature === 'string' ? natureByDe(nature) : nature;
  if (!n) return '';
  if (!n.up || !n.down) return `${n.de} (neutral)`;
  return `${n.de} (${statLabel(n.up)}+, ${statLabel(n.down)}−)`;
}

// Welches Wesen passt zu „Init+ / SpA−"? Wird für die Übernahme aus dem
// Moveset gebraucht, wo nur die Richtung je Statuswert hinterlegt ist.
export function natureFor(upKey, downKey) {
  if (!upKey && !downKey) return NATURES[0];
  if (!upKey || !downKey || upKey === downKey) return null;
  return NATURES.find((n) => n.up === upKey && n.down === downKey) || null;
}

// --- Speziesnamen ----------------------------------------------------------
// pokemon.json führt englische Namen in Klartext („Mega Charizard Y"),
// @smogon/calc erwartet IDs („charizardmegay"). Formen, die sich nicht aus dem
// Namen ableiten lassen, stehen in der Ausnahmetabelle.

const SPECIES_OVERRIDES = {
  'Basculegion-Male': 'basculegion',
  'Basculegion-Female': 'basculegionf',
  'Meowstic-Male': 'meowstic',
  'Meowstic-Female': 'meowsticf',
  'Mega Meowstic': 'meowsticmmega',
  'Lycanroc-Midday': 'lycanroc',
  'Lycanroc-Midnight': 'lycanrocmidnight',
  'Lycanroc-Dusk': 'lycanrocdusk',
  'Floette-Eternal': 'floetteeternal',
  'Paldean Tauros': 'taurospaldeacombat',
  'Paldean Tauros Aqua': 'taurospaldeaaqua',
  'Paldean Tauros Blaze': 'taurospaldeablaze',
  Aegislash: 'aegislashshield',
};

const REGIONS = { Alolan: 'alola', Galarian: 'galar', Hisuian: 'hisui', Paldean: 'paldea' };

function toId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function speciesKey(nameEn) {
  const name = String(nameEn || '').trim();
  if (!name) return '';
  if (SPECIES_OVERRIDES[name]) return SPECIES_OVERRIDES[name];
  // „Mega Garchomp Z" ist keine Schreibvariante, sondern eine eigene Spezies aus
  // Pokémon Champions — das Z gehört wie X und Y an das Ende des Schlüssels.
  const mega = name.match(/^Mega (.+?)(?: ([XYZ]))?$/);
  if (mega) return `${toId(mega[1])}mega${mega[2] ? mega[2].toLowerCase() : ''}`;
  const region = name.match(/^(Alolan|Galarian|Hisuian|Paldean) (.+)$/);
  if (region) return `${toId(region[2])}${REGIONS[region[1]]}`;
  return toId(name);
}

// --- Moveset-Statuswerte ---------------------------------------------------
// Im Matchup-Moveset steht je Statuswert ein kurzes Feld: „32+" = 32 SP mit
// steigerndem Wesen, „14-" = 14 SP mit senkendem Wesen, „24" = neutral.

export function parseSpField(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { sp: null, nat: 'neutral' };
  const m = raw.match(/^(\d{1,2})\s*([+-])?$/);
  if (!m) return { sp: null, nat: 'neutral' };
  return {
    sp: clampSpValue(m[1]),
    nat: m[2] === '+' ? 'up' : m[2] === '-' ? 'down' : 'neutral',
  };
}

export function formatSpField(sp, nat) {
  if (sp == null || sp === '') return '';
  const n = clampSpValue(sp);
  return `${n}${nat === 'up' ? '+' : nat === 'down' ? '-' : ''}`;
}

export function blankSpSet() {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, '']));
}

// Die sechs Felder in SP-Zahlen und ein Wesen übersetzen. Mehr als ein „+"
// bzw. „−" kann es nicht geben — das erste gewinnt.
export function spSetToConfig(set) {
  const sp = {};
  let up = null;
  let down = null;
  STAT_KEYS.forEach((k) => {
    const p = parseSpField(set?.[k]);
    sp[k] = p.sp ?? 0;
    if (p.nat === 'up' && !up) up = k;
    if (p.nat === 'down' && !down) down = k;
  });
  return { sp, nature: natureFor(up, down) || NATURES[0], up, down };
}

export function configToSpSet(sp, nature) {
  const n = typeof nature === 'string' ? natureByDe(nature) : nature;
  const out = blankSpSet();
  STAT_KEYS.forEach((k) => {
    const nat = n && n.up === k ? 'up' : n && n.down === k ? 'down' : 'neutral';
    const value = clampSpValue(sp?.[k]);
    out[k] = (value || nat !== 'neutral') ? formatSpField(value, nat) : '';
  });
  return out;
}

// Altbestand: das frühere Freitextfeld („252 Ang / 252 Init / 4 KP") nach
// bestem Wissen in die sechs Felder überführen. Werte über 32 werden als EVs
// gelesen und umgerechnet, alles andere als SP. Der Originaltext bleibt
// daneben stehen, damit nichts verloren geht.
const LEGACY_STAT_WORDS = [
  [/\bkp\b|\bhp\b|\blebens/i, 'hp'],
  [/\bspa\b|sp\.?\s*ang|spezial-?angriff/i, 'spa'],
  [/\bspd\b|\bspvert\b|sp\.?\s*vert|spezial-?vert/i, 'spd'],
  [/\bang\b|\batk\b|angriff/i, 'atk'],
  [/\bvert\b|\bdef\b|verteidigung/i, 'def'],
  [/\binit\b|\bspe\b|initiative|speed/i, 'spe'],
];

export function parseLegacyEvs(text) {
  const out = blankSpSet();
  const raw = String(text || '');
  if (!raw.trim()) return out;
  const parts = raw.split(/[\/,;]+/);
  // Entweder die ganze Angabe sind EVs oder die ganze Angabe sind SP — gemischt
  // ergäbe sie keinen Sinn. Ein Wert über 32 verrät die EV-Schreibweise.
  const asEvs = parts.some((part) => {
    const n = Number((part.match(/\d{1,3}/) || [])[0]);
    return Number.isFinite(n) && n > MAX_SP;
  });
  parts.forEach((part) => {
    const num = part.match(/\d{1,3}/);
    if (!num) return;
    const hit = LEGACY_STAT_WORDS.find(([re]) => re.test(part));
    if (!hit) return;
    const value = Number(num[0]);
    const sp = asEvs ? evToSp(value) : clampSpValue(value);
    const nat = /\+/.test(part) ? 'up' : /(?:^|\s)-(?:\s|$)|−/.test(part) ? 'down' : 'neutral';
    out[hit[1]] = formatSpField(sp, nat);
  });
  return out;
}

// --- Typen -----------------------------------------------------------------
// @smogon/calc liefert englische Typnamen; die Oberfläche (Farben, Badges)
// arbeitet durchgehend mit den deutschen.

const TYPES_DE = {
  Normal: 'Normal', Fire: 'Feuer', Water: 'Wasser', Electric: 'Elektro',
  Grass: 'Pflanze', Ice: 'Eis', Fighting: 'Kampf', Poison: 'Gift',
  Ground: 'Boden', Flying: 'Flug', Psychic: 'Psycho', Bug: 'Käfer',
  Rock: 'Gestein', Ghost: 'Geist', Dragon: 'Drache', Dark: 'Unlicht',
  Steel: 'Stahl', Fairy: 'Fee', Stellar: 'Stellar', '???': '—',
};

export function typeDe(en) {
  return TYPES_DE[en] || en || '';
}

// --- Ergebnisaufbereitung --------------------------------------------------

// @smogon/calc liefert absolute Schadenswerte; für die Anzeige zählt der
// prozentuale Korridor bezogen auf die KP des Verteidigers.
export function damagePercent(minDamage, maxDamage, maxHp) {
  const hp = Math.max(1, Number(maxHp) || 1);
  const round = (v) => Math.round((v / hp) * 1000) / 10;
  return { min: round(minDamage), max: round(maxDamage) };
}

// Wie viele Treffer sind nötig? (Grobwert aus dem Maximalschaden.)
export function hitsToKo(maxPercent) {
  if (!(maxPercent > 0)) return null;
  return Math.ceil(100 / maxPercent);
}

export function percentLabel(range) {
  if (!range) return '—';
  const fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  return `${fmt(range.min)} – ${fmt(range.max)} %`;
}

// Farbton nach Wirkung: je mehr Schaden, desto wärmer.
export function percentTone(maxPercent) {
  if (maxPercent >= 100) return '#e3350d';
  if (maxPercent >= 50) return '#ff9d55';
  if (maxPercent >= 25) return '#ffcb05';
  if (maxPercent > 0) return '#63bc5a';
  return '#98a2b3';
}

export const BOOST_STEPS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

export function boostLabel(value) {
  const n = Number(value) || 0;
  return n > 0 ? `+${n}` : String(n);
}
