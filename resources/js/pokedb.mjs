// Pokémon-Stammdaten aus zwei Quellen: `public/data/pokemon.json` (ausgeliefert) und
// `drafts/pokemondb` (über die Oberfläche angelegt oder geändert). Framework-frei.
//
// Die Datei bleibt die Grundlage; ein Eintrag im Dokument ersetzt den gleichnamigen
// Datensatz der Datei vollständig oder kommt als neues Pokémon hinzu. Der NAME ist der
// Fremdschlüssel in Kadern, Ergebnissen und Awards — er lässt sich deshalb nach dem
// Anlegen nicht mehr ändern.
//
// `since` heißt „verfügbar ab Saison N". Ohne Angabe war das Pokémon von Anfang an
// dabei. Ein Pokémon einer künftigen Saison erscheint in keiner Ansicht davor.

export const POKEDB_DOC = 'pokemondb';
export const MON_TIERS = ['S', 'A', 'B', 'C', 'D'];
export const MON_STATS = [
  { key: 'hp', label: 'KP' },
  { key: 'atk', label: 'Angriff' },
  { key: 'def', label: 'Verteidigung' },
  { key: 'spa', label: 'Sp.-Angriff' },
  { key: 'spd', label: 'Sp.-Verteidigung' },
  { key: 'spe', label: 'Initiative' },
];
export const ALL_MON_TYPES = [
  'Normal', 'Feuer', 'Wasser', 'Elektro', 'Pflanze', 'Eis', 'Kampf', 'Gift', 'Boden',
  'Flug', 'Psycho', 'Käfer', 'Gestein', 'Geist', 'Drache', 'Unlicht', 'Stahl', 'Fee',
];

/** Ab welcher Saison ist das Pokémon dabei? Ohne Angabe: von Anfang an. */
export function sinceOf(mon) {
  const n = Number(mon?.since);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function availableIn(mon, season) {
  const s = Number(season);
  return !Number.isFinite(s) || sinceOf(mon) <= s;
}

/**
 * Schlüssel eines Eintrags im Dokument. Feldnamen sollen unverfänglich bleiben —
 * Punkte, Klammern und Symbole fliegen raus, ♂/♀ werden zu m/w.
 */
export function monKey(name) {
  return String(name || '')
    .replace(/♂/g, ' m ')
    .replace(/♀/g, ' w ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Leere Felder bleiben leer — `Number('')` wäre sonst 0.
const int = (v) => {
  const t = String(v ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Ein Datensatz im Speicherformat — leere Angaben bleiben leer, nichts wird erfunden. */
export function normalizeMonRecord(raw = {}) {
  const stats = {};
  MON_STATS.forEach(({ key }) => {
    const v = int(raw?.stats?.[key]);
    stats[key] = v != null && v >= 0 ? v : null;
  });
  const types = [...new Set((Array.isArray(raw.types) ? raw.types : String(raw.types || '').split(/[\/,]/))
    .map((t) => String(t || '').trim())
    .filter((t) => ALL_MON_TYPES.includes(t)))].slice(0, 2);
  const tier = MON_TIERS.includes(String(raw.tier || '').toUpperCase()) ? String(raw.tier).toUpperCase() : null;
  const cost = int(raw.cost);
  const dex = int(raw.dex);
  const since = int(raw.since);
  const spe = stats.spe;
  const out = {
    name: String(raw.name || '').replace(/\s+/g, ' ').trim(),
    name_en: String(raw.name_en || '').replace(/\s+/g, ' ').trim(),
    dex: dex != null && dex > 0 ? dex : null,
    types,
    tier,
    cost: cost != null && cost >= 0 ? cost : null,
    image: String(raw.image || '').trim(),
    base_speed: spe != null ? spe : int(raw.base_speed),
    stats,
  };
  out.since = since != null && since >= 1 ? since : 1;
  return out;
}

/**
 * Was fehlt oder passt nicht? Leere Liste = speicherbar.
 * `names`: alle vorhandenen Namen; beim Anlegen darf der neue Name dort nicht stehen.
 */
export function validateMon(rec, { names = [], isNew = false } = {}) {
  const errors = [];
  if (!rec.name) errors.push('Der deutsche Name fehlt.');
  if (isNew && rec.name) {
    const key = monKey(rec.name);
    if ((names || []).some((n) => n === rec.name || monKey(n) === key)) errors.push('Ein Pokémon mit diesem Namen gibt es schon.');
  }
  if (!rec.name_en) errors.push('Der englische Name fehlt (er ist der Schlüssel für Schadensrechner und Elo-Sheet).');
  if (!rec.types.length) errors.push('Mindestens ein Typ muss gesetzt sein.');
  if (!rec.tier) errors.push('Das Tier fehlt.');
  if (MON_STATS.some(({ key }) => rec.stats[key] == null)) errors.push('Alle sechs Statuswerte werden gebraucht.');
  if (rec.image && !/^https?:\/\//i.test(rec.image)) errors.push('Das Bild muss eine http(s)-Adresse sein.');
  return errors;
}

/**
 * Datei + Dokument -> eine Liste. Einträge des Dokuments ersetzen gleichnamige Datensätze
 * an ihrer Stelle; neue hängen hinten an. Gelöschte Einträge (`removed: true`) fallen nur
 * weg, wenn sie NICHT aus der Datei stammen — ein ausgeliefertes Pokémon bleibt bestehen.
 */
export function mergePokedex(base = [], dbMons = {}) {
  const entries = Object.values(dbMons || {}).filter((e) => e && e.name);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const seen = new Set();
  const strip = (e) => {
    const { createdAt, createdBy, updatedAt, updatedBy, removed, ...rest } = e;
    return rest;
  };
  const out = (base || []).map((mon) => {
    const over = byName.get(mon?.name);
    if (!over) return mon;
    seen.add(mon.name);
    return { ...mon, ...strip(over), name: mon.name, custom: true };
  });
  entries.forEach((e) => {
    if (seen.has(e.name) || e.removed) return;
    out.push({ ...strip(e), custom: true, added: true });
  });
  return out;
}

/** Nur, was in dieser Saison schon im Pool ist. */
export function pokedexForSeason(all, season) {
  return (all || []).filter((m) => availableIn(m, season));
}

// === Fähigkeiten mit Immunität (drafts/pokedex) ===============================
// Fähigkeiten wie Schwebe oder Vegetarier machen ein Pokémon gegen einen Angriffstyp
// immun. Die Liga legt sie selbst an (Name + Typen) und ordnet sie Pokémon zu; jede
// Schwächen-Analyse rechnet die Immunität dann mit (`immuneTypes` -> `typeMultiplier`).
// Gespeichert neben Charakter und Rolle: `abilities.<key>` = { name, types } und
// `monAbilities.<Pokémon>` = [key, …].

/** Vorschläge zum Antippen — die gängigen Absorber-Fähigkeiten. */
export const IMMUNITY_SUGGESTIONS = [
  { name: 'Schwebe', types: ['Boden'] },
  { name: 'Vegetarier', types: ['Pflanze'] },
  { name: 'H2O-Absorber', types: ['Wasser'] },
  { name: 'Sturmsog', types: ['Wasser'] },
  { name: 'Trockenheit', types: ['Wasser'] },
  { name: 'Voltabsorber', types: ['Elektro'] },
  { name: 'Blitzfänger', types: ['Elektro'] },
  { name: 'Starthilfe', types: ['Elektro'] },
  { name: 'Feuerfänger', types: ['Feuer'] },
  { name: 'Knusperkruste', types: ['Feuer'] },
  { name: 'Bodenschmaus', types: ['Boden'] },
];

export function abilityKey(name) {
  return monKey(name);
}

/** Eine Fähigkeit im Speicherformat: Name und mindestens ein bekannter Typ. */
export function normalizeAbility(raw = {}) {
  const name = String(raw?.name || '').replace(/\s+/g, ' ').trim();
  const types = [...new Set((Array.isArray(raw?.types) ? raw.types : [])
    .map((t) => String(t || '').trim())
    .filter((t) => ALL_MON_TYPES.includes(t)))];
  types.sort((a, b) => ALL_MON_TYPES.indexOf(a) - ALL_MON_TYPES.indexOf(b));
  return { name, types };
}

export function validateAbility(rec, { keys = [], ownKey = null } = {}) {
  const errors = [];
  if (!rec.name) errors.push('Der Name fehlt.');
  const key = abilityKey(rec.name);
  if (rec.name && !key) errors.push('Der Name braucht Buchstaben oder Ziffern.');
  if (key && key !== ownKey && (keys || []).includes(key)) errors.push('Eine Fähigkeit mit diesem Namen gibt es schon.');
  if (!rec.types.length) errors.push('Mindestens ein Typ, gegen den sie immun macht.');
  return errors;
}

/** Alle angelegten Fähigkeiten, alphabetisch. */
export function abilityList(notes = {}) {
  return Object.entries(notes?.abilities || {})
    .filter(([, a]) => a && a.name)
    .map(([key, a]) => ({ key, ...normalizeAbility(a) }))
    .filter((a) => a.types.length)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Die Fähigkeiten eines Pokémon — nur, was es (noch) gibt. */
export function monAbilities(notes = {}, name) {
  const keys = notes?.monAbilities?.[name];
  if (!Array.isArray(keys) || !keys.length) return [];
  const known = new Map(abilityList(notes).map((a) => [a.key, a]));
  return [...new Set(keys)].map((k) => known.get(k)).filter(Boolean);
}

/** Angriffstypen, gegen die das Pokémon über eine Fähigkeit immun ist. */
export function immuneTypes(notes = {}, name) {
  return [...new Set(monAbilities(notes, name).flatMap((a) => a.types))];
}
