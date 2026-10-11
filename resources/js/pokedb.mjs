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
  if (rec.cost == null) errors.push('Die Punkte fehlen.');
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
