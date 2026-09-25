// Die sechs Statuswerte eines Pokémon (Basiswerte laut Champions-Dex von Smogon).
//
// Framework-frei und unter Node testbar. Die Werte stehen in pokemon.json unter
// `stats` (geschrieben von scripts/apply-basestats.mjs). Angezeigt werden sie
// ausschließlich in der Pokémon-Detailansicht; die Presse bekommt sie samt einer
// groben Rolle, damit sie Kills an der richtigen Erwartung misst.

export const BASE_STATS = [
  { key: 'hp', label: 'KP' },
  { key: 'atk', label: 'Angriff' },
  { key: 'def', label: 'Verteidigung' },
  { key: 'spa', label: 'Spezial-Angriff' },
  { key: 'spd', label: 'Spezial-Verteidigung' },
  { key: 'spe', label: 'Initiative' },
];
export const BASE_STAT_KEYS = BASE_STATS.map((s) => s.key);

// Skala der Balken. Kaum ein Wert liegt darüber; wer es tut, füllt den Balken ganz.
export const BASE_STAT_SCALE = 200;

// Vollständige Werte oder null. Ein Eintrag ohne `stats` hat höchstens die Initiative
// (base_speed) — das reicht für keine Rolle und keinen Balken.
export function statsOf(mon) {
  const s = mon?.stats;
  if (!s) return null;
  const out = {};
  for (const k of BASE_STAT_KEYS) {
    const n = Number(s[k]);
    if (!Number.isFinite(n)) return null;
    out[k] = n;
  }
  return out;
}

export function statTotal(stats) {
  return stats ? BASE_STAT_KEYS.reduce((sum, k) => sum + (stats[k] || 0), 0) : 0;
}

export function statPercent(value, scale = BASE_STAT_SCALE) {
  const n = Number(value) || 0;
  return Math.max(0, Math.min(100, Math.round((n / scale) * 1000) / 10));
}

// Farbe nach Höhe des Werts: schwach warm, stark kühl.
export function statTone(value) {
  const n = Number(value) || 0;
  if (n < 60) return '#e3350d';
  if (n < 80) return '#ff9d55';
  if (n < 100) return '#ffcb05';
  if (n < 120) return '#63bc5a';
  return '#38bdf8';
}

// Die grobe Rolle aus den Werten.
//   offensiv   — ein Angriffswert ragt deutlich über die Nehmerqualitäten hinaus
//   defensiv   — beide Angriffswerte bleiben niedrig, KP und Verteidigungen tragen
//   ausgewogen — alles dazwischen
// side: womit angegriffen wird (physisch / speziell / gemischt).
export function statRole(stats) {
  if (!stats) return null;
  const off = Math.max(stats.atk, stats.spa);
  const bulk = (stats.hp + stats.def + stats.spd) / 3;
  const peak = Math.max(stats.hp, stats.def, stats.spd);
  let role = 'ausgewogen';
  if (off >= 105 && off - bulk >= 20) role = 'offensiv';
  else if (off <= 90 && peak >= 100 && peak - off >= 20) role = 'defensiv';
  const diff = stats.atk - stats.spa;
  const side = diff >= 20 ? 'physisch' : diff <= -20 ? 'speziell' : 'gemischt';
  return { role, side };
}

export function roleLabel(r) {
  if (!r) return '';
  const role = { offensiv: 'Offensiv', defensiv: 'Defensiv', ausgewogen: 'Ausgewogen' }[r.role] || '';
  const side = { physisch: 'physisch', speziell: 'speziell', gemischt: 'gemischt' }[r.side] || '';
  return r.role === 'defensiv' ? role : `${role} · ${side}`;
}

// Kurzform für die Presse-Metadaten.
export function statBlock(mon) {
  const stats = statsOf(mon);
  if (!stats) return null;
  const r = statRole(stats);
  return {
    statuswerte: {
      kp: stats.hp, angriff: stats.atk, verteidigung: stats.def,
      spezialAngriff: stats.spa, spezialVerteidigung: stats.spd, initiative: stats.spe,
      summe: statTotal(stats),
    },
    rolle: r.role,
    angriffsart: r.side,
  };
}
