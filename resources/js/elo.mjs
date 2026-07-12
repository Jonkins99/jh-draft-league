// Elo-/Tier-Prognose aus dem öffentlichen Google Sheet.
// Das Sheet ist auf „Jeder mit dem Link: Betrachter" gestellt und wird clientseitig
// über den gviz-JSON-Endpoint gelesen — ohne API-Key, ohne Proxy. Der Service-Account
// (sheets-api-*.json) wird bewusst NICHT ausgeliefert.
//
// Spalten des Sheets: Rang | Pokémon | Elo | Tier
// „Tier" ist das anhand des aktuellen Elo-Stands PROGNOSTIZIERTE Tier für die nächste Saison.

export const ELO_SHEET_ID = '1qWr50U4FrzUEtHV69P75JvwZMUPUJcSyNFnJoZO-WJg';
export const ELO_GVIZ_URL =
  `https://docs.google.com/spreadsheets/d/${ELO_SHEET_ID}/gviz/tq?tqx=out:json&gid=0`;

const CACHE_KEY = 'jhdl-elo-cache-v1';

// Namensabweichungen Sheet -> pokemon.json (Formnamen). Sheet-Schreibweise links.
const ALIAS = {
  'Skarabron': 'Skaraborn',
  'Wolwerock (Nacht)': 'Wolwerock (Nachtform)',
  'Wolwerock (Tag)': 'Wolwerock (Tagform)',
  'Wolwerock (Zwielicht)': 'Wolwerock (Zwielichtform)',
  'Paldea-Tauros (Fluten)': 'Paldea-Tauros (Wasser)',
  'Paldea-Tauros (Gefecht)': 'Paldea-Tauros (Kampf)',
  'Floette (Ewigblütler)': 'Floette (Ewige Blume)',
};

// Whitespace normalisieren (u.a. geschütztes Leerzeichen aus dem Sheet).
function normalize(name) {
  return String(name || '').replace(/ /g, ' ').trim();
}

// Sheet-Name -> kanonischer pokemon.json-Name.
export function resolveEloName(sheetName) {
  const n = normalize(sheetName);
  return ALIAS[n] || n;
}

// gviz-Antwort: „/*O_o*/google.visualization.Query.setResponse({...});" -> JSON.
function parseGviz(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Unerwartetes gviz-Format');
  const json = JSON.parse(text.slice(start, end + 1));
  const cols = (json.table?.cols || []).map((c) => normalize(c.label).toLowerCase());
  const idxRang = cols.findIndex((c) => c.startsWith('rang'));
  const idxName = cols.findIndex((c) => c.includes('pok'));
  const idxElo = cols.findIndex((c) => c.startsWith('elo'));
  const idxTier = cols.findIndex((c) => c.startsWith('tier'));
  const rows = [];
  (json.table?.rows || []).forEach((r) => {
    const c = r.c || [];
    const cell = (i) => (i >= 0 && c[i] ? c[i].v : null);
    const name = normalize(cell(idxName >= 0 ? idxName : 1));
    if (!name) return;
    const rangRaw = cell(idxRang >= 0 ? idxRang : 0);
    const eloRaw = cell(idxElo >= 0 ? idxElo : 2);
    const tier = normalize(cell(idxTier >= 0 ? idxTier : 3)).toUpperCase();
    rows.push({
      rang: Number.isFinite(+rangRaw) ? +rangRaw : null,
      name,
      resolved: resolveEloName(name),
      elo: Number.isFinite(+eloRaw) ? +eloRaw : null,
      projectedTier: tier || null,
    });
  });
  return rows;
}

// Live vom Sheet holen. Wirft bei Netz-/Format-Fehlern.
export async function fetchEloRows() {
  const res = await fetch(ELO_GVIZ_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const rows = parseGviz(text);
  return { rows, fetchedAt: new Date().toISOString() };
}

export function readEloCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.rows)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function writeEloCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {}
}
