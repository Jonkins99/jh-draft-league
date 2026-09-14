// Notizen: private Freitexte und der geteilte Kampfverlauf.
// Framework-frei (kein Alpine, kein Firebase) — damit unter Node testbar.
//
// Zwei Sorten, die sich bewusst unterscheiden:
//
//   PRIVAT  — Notizen zu Teams und zu einzelnen Matches. Sie liegen verschlüsselt
//             im privaten Dokument des Spielers (siehe auth.mjs); der andere Spieler
//             sieht in der Datenbank nur Chiffrat.
//   GETEILT — der Kampfverlauf eines Matches. Beide Spieler führen dort ihren eigenen
//             Abschnitt, beide dürfen beide lesen. Er ist damit Gedächtnisstütze für
//             die Rückrunde und Detailquelle für die Presse.

export const NOTE_SCOPE = 'notes';

export function blankNotes() {
  return { teams: {}, matches: {}, updatedAt: null };
}

export function normalizeNotes(raw) {
  const base = blankNotes();
  if (!raw || typeof raw !== 'object') return base;
  const clean = (bag) => {
    const out = {};
    Object.entries(bag || {}).forEach(([k, v]) => {
      const text = typeof v === 'string' ? v : String(v?.text || '');
      if (text.trim()) out[k] = text;
    });
    return out;
  };
  return { teams: clean(raw.teams), matches: clean(raw.matches), updatedAt: raw.updatedAt || null };
}

export function teamNote(notes, teamId) {
  return (notes?.teams || {})[teamId] || '';
}

export function matchNote(notes, matchId) {
  return (notes?.matches || {})[matchId] || '';
}

export function withNote(notes, kind, id, text) {
  const base = normalizeNotes(notes);
  const bag = { ...base[kind] };
  const clean = String(text ?? '');
  if (clean.trim()) bag[id] = clean;
  else delete bag[id];
  return { ...base, [kind]: bag, updatedAt: new Date().toISOString() };
}

export function countNotes(notes) {
  const n = normalizeNotes(notes);
  return Object.keys(n.teams).length + Object.keys(n.matches).length;
}

// === Kampfverlauf ==========================================================
// Ein Dokument je Match in der Collection `battleLogs`, Doc-ID = Match-ID.
//   { matchId, day, home, away, entries: { <Spieler>: { text, updatedAt, source } } }
export function blankLog(matchId, meta = {}) {
  return {
    matchId,
    day: meta.day ?? null,
    home: meta.home || null,
    away: meta.away || null,
    entries: {},
  };
}

export function logText(log, player) {
  return log?.entries?.[player]?.text || '';
}

export function logUpdatedAt(log, player) {
  return log?.entries?.[player]?.updatedAt || null;
}

export function hasLog(log) {
  return Object.values(log?.entries || {}).some((e) => String(e?.text || '').trim());
}

export function logAuthors(log) {
  return Object.entries(log?.entries || {})
    .filter(([, e]) => String(e?.text || '').trim())
    .map(([player]) => player);
}

// Für den Presse-Kontext: den Verlauf beider Spieler zu einem Block zusammenfassen.
export function logToText(log, { limit = 4000 } = {}) {
  const parts = Object.entries(log?.entries || {})
    .filter(([, e]) => String(e?.text || '').trim())
    .map(([player, e]) => `${player}: ${String(e.text).trim()}`);
  if (!parts.length) return '';
  const text = parts.join('\n\n');
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

// === Sprachaufnahme ========================================================
// Die Aufnahme darf mehrere Minuten dauern und in Schnipseln entstehen (Push-to-Talk).
// Übermittelt wird sie in einem einzigen Aufruf — deshalb hier nur die Aufbereitung.
export function totalSeconds(clips) {
  return (clips || []).reduce((sum, c) => sum + (c?.seconds || 0), 0);
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Namen, die die Spracherkennung treffen muss: beide Kader, Trainer, Teamnamen.
export function spokenVocabulary({ teamA, teamB, extra = [] } = {}) {
  const out = new Set();
  [teamA, teamB].filter(Boolean).forEach((t) => {
    if (t.name) out.add(t.name);
    (t.pokemon || []).forEach((p) => { if (p?.name) out.add(p.name); });
    (t.trainers || []).forEach((tr) => { if (tr?.name) out.add(tr.name); });
  });
  extra.filter(Boolean).forEach((x) => out.add(x));
  return [...out];
}
