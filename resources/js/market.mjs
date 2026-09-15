// Marktwerte: Elo -> Marktwert, Rundung, Formatierung, Tier-Grenzen und Verlauf.
// Framework-frei (kein Alpine, kein Firebase) — damit unter Node testbar.
//
// Der Marktwert ist die Fußball-Metapher für den Elo-Wert aus dem Draft-Sheet:
// nach oben eskalieren die Beträge, im unteren Korridor liegen sie dicht beieinander.
// Umgerechnet wird über Stützstellen, zwischen denen im LOGARITHMUS linear
// interpoliert wird — damit sitzen alle Vorgaben exakt und der Verlauf bleibt
// streng monoton. Außerhalb der Stützstellen gilt die Steigung des Randsegments.

const TIER_ORDER = ['S', 'A', 'B', 'C', 'D'];

// Vorgaben aus der Liga-Leitung: Elo -> Marktwert in Euro (aufsteigend).
export const MARKET_ANCHORS = [
  [1100, 300_000],
  [1200, 500_000],
  [1300, 1_000_000],
  [1400, 2_000_000],
  [1500, 5_000_000],
  [1600, 10_000_000],
  [1700, 30_000_000],
  [1800, 50_000_000],
  [1900, 100_000_000],
  [2100, 200_000_000],
];

const LOG_ANCHORS = MARKET_ANCHORS.map(([elo, value]) => [elo, Math.log10(value)]);

/** Roher, ungerundeter Marktwert in Euro. */
export function marketValueRaw(elo) {
  if (elo == null || elo === '') return null;
  const e = Number(elo);
  if (!Number.isFinite(e)) return null;
  const a = LOG_ANCHORS;
  let i = 0;
  // Segment suchen; unterhalb/oberhalb der Stützstellen extrapoliert das Randsegment.
  if (e <= a[0][0]) i = 0;
  else if (e >= a[a.length - 1][0]) i = a.length - 2;
  else while (i < a.length - 2 && e > a[i + 1][0]) i++;
  const [x0, y0] = a[i];
  const [x1, y1] = a[i + 1];
  const t = (e - x0) / (x1 - x0);
  return 10 ** (y0 + t * (y1 - y0));
}

/**
 * Kaufmännische Rundung in Stufen: je größer der Betrag, desto gröber.
 * < 1 Mio -> 10k · < 2 Mio -> 100k · < 10 Mio -> 500k · < 50 Mio -> 1 Mio · sonst 5 Mio.
 */
export function roundMarketValue(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return 0;
  const step = v < 1_000_000 ? 10_000
    : v < 2_000_000 ? 100_000
      : v < 10_000_000 ? 500_000
        : v < 50_000_000 ? 1_000_000
          : 5_000_000;
  return Math.round(v / step) * step;
}

/** Gerundeter Marktwert zu einem Elo-Wert, oder null. */
export function marketValue(elo) {
  const raw = marketValueRaw(elo);
  return raw == null ? null : roundMarketValue(raw);
}

// === Formatierung ==========================================================

const NUM = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/**
 * „200 Mio. €" / „1,5 Mio. €" / „500 Tsd. €" / „1,24 Mrd. €".
 * `unit: false` lässt das Währungszeichen weg (Diagramm-Achsen, enge Spalten).
 */
export function formatMarket(value, { unit = true } = {}) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return '—';
  const suffix = unit ? ' €' : '';
  if (v >= 1_000_000_000) return `${NUM.format(v / 1_000_000_000)} Mrd.${suffix}`;
  if (v >= 1_000_000) return `${NUM.format(v / 1_000_000)} Mio.${suffix}`;
  if (v >= 1_000) return `${NUM.format(v / 1_000)} Tsd.${suffix}`;
  return `${NUM.format(v)}${suffix}`;
}

/** Vorzeichenbehaftete Veränderung: „+5 Mio. €", „-500 Tsd. €", „±0". */
export function formatMarketDelta(value, opts = {}) {
  const v = Number(value) || 0;
  if (v === 0) return '±0';
  return `${v > 0 ? '+' : '−'}${formatMarket(Math.abs(v), opts)}`;
}

/** Prozentuale Veränderung: „+12,4 %". */
export function formatPercent(value, digits = 1) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '—';
  const s = v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${s.replace('-', '')} %`;
}

// === Sheet-Zeilen ==========================================================

/** Elo-Zeilen auf { name -> row } abbilden (aufgelöster Name). */
export function eloIndex(rows) {
  const out = {};
  (rows || []).forEach((r) => { if (r?.resolved) out[r.resolved] = r; });
  return out;
}

/** Marktwert eines Pokémon aus dem Sheet-Index (oder null). */
export function marketOf(index, name) {
  const row = index?.[name];
  return row ? marketValue(row.elo) : null;
}

/**
 * Gesamtmarktwert eines Kaders. Summiert die GERUNDETEN Einzelwerte, damit die
 * Summe zu dem passt, was an den Pokémon steht.
 */
export function squadMarketValue(names, index) {
  return (names || []).reduce((sum, n) => sum + (marketOf(index, typeof n === 'string' ? n : n?.name) || 0), 0);
}

// === Tier-Grenzen ==========================================================

/**
 * Die Elo-Grenzen der Tiers aus dem Sheet ableiten (das Sheet vergibt die Tiers,
 * nicht diese Anwendung). Grenze = Mitte zwischen dem schwächsten Vertreter des
 * besseren und dem stärksten des schlechteren Tiers.
 * Rückgabe absteigend: [{ tier, minElo, maxElo }] — maxElo/minElo am Rand offen (null).
 */
export function tierBoundaries(rows) {
  const byTier = {};
  (rows || []).forEach((r) => {
    const t = String(r?.projectedTier || '').toUpperCase();
    if (!TIER_ORDER.includes(t) || !Number.isFinite(r.elo)) return;
    (byTier[t] = byTier[t] || []).push(r.elo);
  });
  const tiers = TIER_ORDER.filter((t) => byTier[t]?.length);
  if (!tiers.length) return [];
  const span = tiers.map((t) => {
    const list = byTier[t];
    return { tier: t, lo: Math.min(...list), hi: Math.max(...list) };
  });
  return span.map((s, i) => ({
    tier: s.tier,
    // Untergrenze: Mitte zum nächstschlechteren Tier; beim letzten Tier offen.
    minElo: i < span.length - 1 ? Math.round((s.lo + span[i + 1].hi) / 2) : null,
    maxElo: i > 0 ? Math.round((span[i - 1].lo + s.hi) / 2) : null,
  }));
}

/** Zu welchem Tier gehört ein Elo-Wert nach diesen Grenzen? */
export function tierForElo(bounds, elo) {
  if (elo == null || elo === '') return null;
  const e = Number(elo);
  if (!Number.isFinite(e)) return null;
  for (const b of bounds || []) {
    const okLow = b.minElo == null || e >= b.minElo;
    const okHigh = b.maxElo == null || e < b.maxElo;
    if (okLow && okHigh) return b.tier;
  }
  return null;
}

// === Verlauf ===============================================================

// „S1 MD3" -> { season: 1, kind: 'md', day: 3, order }. Sortiert wird über die
// Spaltenreihenfolge des Sheets, die Zerlegung dient nur der Beschriftung.
export function parseHistoryLabel(label) {
  const raw = String(label || '').trim();
  const m = raw.match(/^S(\d+)\s+(.*)$/i);
  const season = m ? Number(m[1]) : null;
  const rest = (m ? m[2] : raw).trim();
  const md = rest.match(/^MD\s*(\d+)$/i);
  if (md) return { season, kind: 'md', day: Number(md[1]), label: raw, short: `ST ${md[1]}` };
  const key = rest.toLowerCase();
  if (key === 'pre') return { season, kind: 'pre', day: null, label: raw, short: 'Vor S' + (season ?? '') };
  if (key === 'draft') return { season, kind: 'draft', day: null, label: raw, short: 'Draft' };
  if (key === 'transfer') return { season, kind: 'transfer', day: null, label: raw, short: 'Transfer' };
  if (key === 'post') return { season, kind: 'post', day: null, label: raw, short: 'Saisonende' };
  return { season, kind: 'other', day: null, label: raw, short: rest || raw };
}

/**
 * Der Verlauf einer Sheet-Zeile als Punkte mit Marktwert.
 * Leere Spalten (noch nicht erreichte Zeitpunkte) fallen heraus.
 */
export function historyPoints(row) {
  return (row?.history || [])
    .filter((h) => Number.isFinite(h?.elo))
    .map((h) => {
      const meta = parseHistoryLabel(h.label);
      return { ...h, short: meta.short, kind: meta.kind, day: meta.day, value: marketValue(h.elo) };
    });
}

/** Alle Zeitpunkte, die im Datensatz überhaupt belegt sind — in Spaltenreihenfolge. */
export function historyStops(rows) {
  const seen = new Map();
  (rows || []).forEach((r) => {
    (r?.history || []).forEach((h, i) => {
      if (!Number.isFinite(h?.elo)) return;
      if (!seen.has(h.key)) seen.set(h.key, { key: h.key, label: h.label, index: i, ...parseHistoryLabel(h.label) });
    });
  });
  return [...seen.values()].sort((a, b) => a.index - b.index);
}

/** Verlauf des Gesamtmarktwerts eines Kaders über alle belegten Zeitpunkte. */
export function squadHistory(names, index, stops) {
  const list = (names || []).map((n) => (typeof n === 'string' ? n : n?.name)).filter(Boolean);
  return (stops || []).map((stop) => {
    let sum = 0;
    let known = 0;
    list.forEach((name) => {
      const h = (index[name]?.history || []).find((x) => x.key === stop.key);
      if (!Number.isFinite(h?.elo)) return;
      known++;
      sum += marketValue(h.elo) || 0;
    });
    return { key: stop.key, label: stop.label, short: stop.short, value: known ? sum : null, known };
  }).filter((p) => p.value != null);
}

// === Veränderungen =========================================================

/** Momentaufnahme für den Vergleich beim nächsten Update: { name: { elo, tier } }. */
export function snapshotOf(rows) {
  const out = {};
  (rows || []).forEach((r) => {
    if (!r?.resolved || !Number.isFinite(r.elo)) return;
    out[r.resolved] = { elo: r.elo, tier: r.projectedTier || null };
  });
  return out;
}

function tierRank(t) {
  const i = TIER_ORDER.indexOf(String(t || '').toUpperCase());
  return i < 0 ? 99 : i;
}

/**
 * Zwei Momentaufnahmen vergleichen.
 * Rückgabe: { tierChanges, up, down, changed, total } — `up`/`down` sind nach
 * absoluter Veränderung sortiert und tragen zusätzlich die prozentuale.
 */
export function diffSnapshots(prev, next, { limit = 5 } = {}) {
  const rows = [];
  Object.entries(next || {}).forEach(([name, cur]) => {
    const before = prev?.[name];
    if (!before) return;
    const fromValue = marketValue(before.elo) || 0;
    const toValue = marketValue(cur.elo) || 0;
    const delta = toValue - fromValue;
    const eloDelta = (cur.elo || 0) - (before.elo || 0);
    if (!delta && !eloDelta && before.tier === cur.tier) return;
    rows.push({
      name,
      fromElo: before.elo, toElo: cur.elo, eloDelta,
      fromValue, toValue, delta,
      pct: fromValue > 0 ? (delta / fromValue) * 100 : 0,
      fromTier: before.tier || null,
      toTier: cur.tier || null,
      tierDelta: before.tier && cur.tier ? tierRank(before.tier) - tierRank(cur.tier) : 0,
    });
  });
  const tierChanges = rows
    .filter((r) => r.tierDelta !== 0)
    .sort((a, b) => b.tierDelta - a.tierDelta || b.delta - a.delta);
  const moved = rows.filter((r) => r.delta !== 0);
  return {
    total: rows.length,
    changed: moved.length,
    tierChanges,
    up: moved.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta || b.pct - a.pct).slice(0, limit),
    down: moved.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta || a.pct - b.pct).slice(0, limit),
  };
}

/**
 * Dasselbe aus den Verlaufsspalten statt aus lokalen Momentaufnahmen: der Sprung
 * auf einen Zeitpunkt (z. B. „S1 MD5") gegenüber dem davor belegten. Das ist die
 * gerätetunabhängige Grundlage für das Marktwert-Update der Presse.
 */
export function historyDiff(rows, stopKey, { limit = 5 } = {}) {
  const prev = {};
  const next = {};
  (rows || []).forEach((r) => {
    const hist = (r?.history || []).filter((h) => Number.isFinite(h?.elo));
    const i = hist.findIndex((h) => h.key === stopKey);
    if (i <= 0 || !r.resolved) return;
    prev[r.resolved] = { elo: hist[i - 1].elo, tier: null };
    next[r.resolved] = { elo: hist[i].elo, tier: null };
  });
  const bounds = tierBoundaries(rows);
  Object.keys(next).forEach((name) => {
    prev[name].tier = tierForElo(bounds, prev[name].elo);
    next[name].tier = tierForElo(bounds, next[name].elo);
  });
  return diffSnapshots(prev, next, { limit });
}

/** Der Zeitpunkt-Schlüssel eines Spieltags, sofern das Sheet ihn führt. */
export function stopKeyForDay(rows, day) {
  const stop = historyStops(rows).find((s) => s.kind === 'md' && s.day === Number(day));
  return stop ? stop.key : null;
}
