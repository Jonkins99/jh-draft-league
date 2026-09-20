// Elo-/Tier-Prognose aus dem öffentlichen Google Sheet.
// Das Sheet ist auf „Jeder mit dem Link: Betrachter" gestellt und wird clientseitig
// über den gviz-JSON-Endpoint gelesen — ohne API-Key, ohne Proxy. Der Service-Account
// (sheets-api-*.json) wird bewusst NICHT ausgeliefert.
//
// Spalten des Sheets: Rang | Pokémon | Elo | Tier | dann der VERLAUF
// („S1 Pre", „S1 Draft", „S1 MD1" … „S1 Post"). „Tier" ist das anhand des aktuellen
// Elo-Stands PROGNOSTIZIERTE Tier für die nächste Saison.
//
// Die Verlaufsspalten sind nicht fest verdrahtet: alles ab Spalte E mit einer
// Beschriftung gilt als Zeitpunkt, leere Zellen sind „noch nicht erreicht".
// Kommen im Sheet weitere Spalten dazu (S2 …), erscheinen sie ohne Codeänderung.

export const ELO_SHEET_ID = '1qWr50U4FrzUEtHV69P75JvwZMUPUJcSyNFnJoZO-WJg';
export const ELO_GVIZ_URL =
  `https://docs.google.com/spreadsheets/d/${ELO_SHEET_ID}/gviz/tq?tqx=out:json&gid=0`;

// v2: Zeilen tragen jetzt zusätzlich `history`. Ein alter Cache würde die
// Verlaufsdiagramme leer lassen — der neue Schlüssel erzwingt ein frisches Laden.
const CACHE_KEY = 'jhdl-elo-cache-v2';

// Ab dieser Spalte beginnt der Verlauf (0-basiert: E).
const HISTORY_FROM = 4;

// Spaltenbeschriftung -> stabiler Schlüssel („S1 MD3" -> „s1-md3").
export function historyKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Namensabweichungen Sheet -> pokemon.json (Formnamen). Sheet-Schreibweise links.
// „Skarabron" stand hier, bis das Sheet den Tippfehler zu „Skaraborn" korrigiert
// hat — die Zeile ist deshalb entfallen. Namen, die hier nicht stehen und auch
// nicht in pokemon.json existieren, meldet die Elo-Ansicht sichtbar, statt sie
// still zu verschlucken (siehe `unresolvedEloNames`).
const ALIAS = {
  'Wolwerock (Nacht)': 'Wolwerock (Nachtform)',
  'Wolwerock (Tag)': 'Wolwerock (Tagform)',
  'Wolwerock (Zwielicht)': 'Wolwerock (Zwielichtform)',
  'Paldea-Tauros (Fluten)': 'Paldea-Tauros (Wasser)',
  'Paldea-Tauros (Gefecht)': 'Paldea-Tauros (Kampf)',
  'Floette (Ewigblütler)': 'Floette (Ewige Blume)',
  'Servol ♀': 'Servol (weiblich)',
  'Servol ♂': 'Servol (männlich)',
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
  const labels = (json.table?.cols || []).map((c) => normalize(c.label));
  const cols = labels.map((c) => c.toLowerCase());
  const idxRang = cols.findIndex((c) => c.startsWith('rang'));
  const idxName = cols.findIndex((c) => c.includes('pok'));
  const idxElo = cols.findIndex((c) => c.startsWith('elo'));
  const idxTier = cols.findIndex((c) => c.startsWith('tier'));
  // Verlaufsspalten: alles ab E, das überhaupt eine Beschriftung trägt.
  const histCols = labels
    .map((label, i) => ({ i, label }))
    .filter((c) => c.i >= HISTORY_FROM && c.label && c.i !== idxElo && c.i !== idxTier)
    .map((c) => ({ ...c, key: historyKey(c.label) }));
  const rows = [];
  (json.table?.rows || []).forEach((r) => {
    const c = r.c || [];
    const cell = (i) => (i >= 0 && c[i] ? c[i].v : null);
    const name = normalize(cell(idxName >= 0 ? idxName : 1));
    if (!name) return;
    const rangRaw = cell(idxRang >= 0 ? idxRang : 0);
    const eloRaw = cell(idxElo >= 0 ? idxElo : 2);
    const tier = normalize(cell(idxTier >= 0 ? idxTier : 3)).toUpperCase();
    const history = histCols
      .map((hc) => {
        const raw = cell(hc.i);
        const num = raw == null || raw === '' ? null : +raw;
        return { key: hc.key, label: hc.label, elo: Number.isFinite(num) ? num : null };
      })
      .filter((h) => h.elo != null);
    rows.push({
      rang: Number.isFinite(+rangRaw) ? +rangRaw : null,
      name,
      resolved: resolveEloName(name),
      elo: Number.isFinite(+eloRaw) ? +eloRaw : null,
      projectedTier: tier || null,
      history,
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

// Sheet-Namen, die sich auf kein Pokémon aus den Stammdaten abbilden lassen.
// Ohne diese Prüfung würde eine Umbenennung im Sheet nur dazu führen, dass die
// Elo-Spalte für das Pokémon leer bleibt — ohne jeden Hinweis.
export function unresolvedEloNames(rows, pokedex) {
  const known = new Set((pokedex || []).map((p) => p && p.name).filter(Boolean));
  if (!known.size) return [];
  return (rows || [])
    .filter((r) => r && r.resolved && !known.has(r.resolved))
    .map((r) => r.name);
}

export function readEloCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.rows)) return null;
    // Die Alias-Tabelle kann sich ändern, nachdem ein Stand im Cache liegt — dann
    // zeigt der gespeicherte `resolved`-Wert weiter ins Leere und das Pokémon bleibt
    // ohne Bild und ohne Marktwert, bis jemand von Hand aktualisiert. Deshalb wird
    // der Name beim Lesen neu aufgelöst und nicht dem Cache geglaubt.
    return { ...data, rows: data.rows.map((r) => ({ ...r, resolved: resolveEloName(r?.name) })) };
  } catch (e) {
    return null;
  }
}

export function writeEloCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {}
}
