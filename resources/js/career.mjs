// Formkurve, Karriere-Stationen und Rivalitäten — alles, was über ein einzelnes
// Match hinausschaut und quer über Saisons rechnet.
//
// Framework-frei und unter Node testbar. Gerechnet wird wie überall result-getrieben:
// Ein Beitrag zählt für die Seite, die das Pokémon in DIESEM Ergebnis aufgestellt hat,
// nicht für den heutigen Besitzer (Wintertransfer, Saisonwechsel).

import { battleStats } from './scoring.mjs';
import { franchiseSlug, seasonOfId } from './seasons.mjs';

const doneBattles = (r) => (r?.battles || []).filter((b) => b && b.done === true);
const isComplete = (r) => doneBattles(r).length >= 3;

// Kills, Deaths und Einsätze eines Pokémon auf einer Seite eines Ergebnisses.
function monLine(result, side, name) {
  const out = { kills: 0, deaths: 0, battles: 0 };
  doneBattles(result).forEach((b) => {
    if ((b.used?.[side] || []).includes(name)) out.battles += 1;
    (b.kills || []).forEach((k) => {
      if (k.victimSide === side && k.victim === name) out.deaths += 1;
      if (k.killerSide === side && k.victimSide !== side && k.killer === name) out.kills += 1;
    });
  });
  return out;
}

// Die Seite, auf der ein Pokémon in einem Ergebnis stand (Aufgebot, sonst Einsatz).
function sideOf(result, name) {
  for (const side of ['home', 'away']) {
    if ((result?.squads?.[side] || []).includes(name)) return side;
  }
  for (const side of ['home', 'away']) {
    if (doneBattles(result).some((b) => (b.used?.[side] || []).includes(name))) return side;
  }
  return null;
}

// === Formkurve =============================================================
export const FORM_MATCHES = 3;

/**
 * Die letzten Matches eines Teams aus Sicht eines Pokémon — auch die, in denen es
 * nicht im Aufgebot stand (dann `inSquad: false`, Kills und Deaths 0).
 * @returns [{ day, matchId, inSquad, kills, deaths, battles }] — älteste zuerst
 */
export function teamForm(teamId, names, results, n = FORM_MATCHES) {
  const matches = (results || [])
    .filter((r) => (r.home === teamId || r.away === teamId) && isComplete(r))
    .sort((a, b) => (a.day ?? 0) - (b.day ?? 0))
    .slice(-n);
  const out = {};
  (names || []).forEach((name) => {
    out[name] = matches.map((r) => {
      const side = r.home === teamId ? 'home' : 'away';
      const inSquad = (r.squads?.[side] || []).includes(name);
      return { day: r.day, matchId: r.id, inSquad, ...monLine(r, side, name) };
    });
  });
  return out;
}

// Aus der Timeline des Pokémon-Profils (scoring.mjs) die letzten Matches.
export function formFromTimeline(timeline, n = FORM_MATCHES) {
  return (timeline || []).slice(-n).map((t) => ({
    day: t.day, matchId: t.matchId, inSquad: !!t.inSquad, kills: t.kills || 0, deaths: t.deaths || 0,
  }));
}

export function formLabel(curve) {
  return (curve || [])
    .map((p) => (p.inSquad ? `ST ${p.day}: ${p.kills} K / ${p.deaths} D` : `ST ${p.day}: nicht im Aufgebot`))
    .join(' · ');
}

/**
 * Die Formkurve als kleine Inline-Grafik: Kills grün, Deaths rot, je Match ein Punkt.
 * Ein Match ohne Aufgebot bleibt als grauer Punkt auf der Grundlinie stehen.
 */
export function formSparkSvg(curve, { width = 64, height = 22 } = {}) {
  const pts = curve || [];
  if (!pts.length) return '';
  const max = Math.max(2, ...pts.map((p) => Math.max(p.kills, p.deaths)));
  const pad = 3;
  const x = (i) => (pts.length === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (pts.length - 1));
  const y = (v) => height - pad - (v / max) * (height - 2 * pad);
  const line = (key, color) => {
    const active = pts.map((p, i) => ({ p, i })).filter(({ p }) => p.inSquad);
    const path = active.map(({ p, i }) => `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    const dots = active.map(({ p, i }) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p[key]).toFixed(1)}" r="1.9" fill="${color}"/>`).join('');
    return `${active.length > 1 ? `<polyline points="${path}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>` : ''}${dots}`;
  };
  const benched = pts.map((p, i) => (p.inSquad ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${(height - pad).toFixed(1)}" r="1.9" fill="#4b5563"/>`)).join('');
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="form-spark" aria-hidden="true">`
    + `<line x1="${pad}" x2="${width - pad}" y1="${height - pad}" y2="${height - pad}" stroke="#2a313d" stroke-width="1"/>`
    + `${line('deaths', '#e3350d')}${line('kills', '#63bc5a')}${benched}</svg>`;
}

// === Karriere-Stationen ====================================================
/**
 * Jede Station eines Pokémon: Saison und Verein, mit dem, was es dort geleistet hat.
 * Eine Station entsteht aus einem Kader (auch ohne Einsatz) oder aus einem Ergebnis
 * (auch nach einem Wechsel im Winter, wenn es im Kader nicht mehr steht).
 */
export function careerStations(name, teams, results) {
  const byTeam = Object.fromEntries((teams || []).map((t) => [t.id, t]));
  const stations = new Map();
  const station = (teamId) => {
    if (!stations.has(teamId)) {
      const team = byTeam[teamId];
      stations.set(teamId, {
        teamId,
        season: Number.isFinite(team?.season) ? team.season : seasonOfId(teamId),
        franchise: franchiseSlug(teamId),
        name: team?.name || teamId,
        logo: team?.logo || '',
        player: team?.player || '',
        inRoster: false,
        matches: 0, battles: 0, kills: 0, deaths: 0, firstDay: null, lastDay: null,
      });
    }
    return stations.get(teamId);
  };
  (teams || []).forEach((t) => {
    if ((t.pokemon || []).some((p) => p.name === name)) station(t.id).inRoster = true;
  });
  (results || []).forEach((r) => {
    const side = sideOf(r, name);
    if (!side) return;
    const st = station(r[side]);
    const line = monLine(r, side, name);
    st.matches += 1;
    st.battles += line.battles;
    st.kills += line.kills;
    st.deaths += line.deaths;
    if (r.day != null) {
      st.firstDay = st.firstDay == null ? r.day : Math.min(st.firstDay, r.day);
      st.lastDay = st.lastDay == null ? r.day : Math.max(st.lastDay, r.day);
    }
  });
  return [...stations.values()]
    .sort((a, b) => a.season - b.season || (a.firstDay ?? 99) - (b.firstDay ?? 99) || a.name.localeCompare(b.name));
}

// === Rivalitäten ===========================================================
function matchScore(r) {
  let home = 0; let away = 0; let hk = 0; let ak = 0;
  doneBattles(r).forEach((b) => {
    const s = battleStats(b);
    if (s.winner === 'home') home += 1;
    else if (s.winner === 'away') away += 1;
    hk += s.homeKills;
    ak += s.awayKills;
  });
  return { home, away, homeKills: hk, awayKills: ak };
}

/**
 * Die Bilanz zweier Vereine über alle Saisons. Verglichen wird über den Franchise-
 * Slug, damit ein Duell aus Saison 1 und eines aus Saison 3 dieselbe Rivalität sind.
 * @returns { a, b, matches, winsA, winsB, draws, battlesA, battlesB, killsA, killsB, hottest[], storylines[] }
 */
export function rivalry(slugA, slugB, results, stories = []) {
  const a = franchiseSlug(slugA);
  const b = franchiseSlug(slugB);
  const out = {
    a, b, matches: 0, winsA: 0, winsB: 0, draws: 0,
    battlesA: 0, battlesB: 0, killsA: 0, killsB: 0, hottest: [], storylines: [],
  };
  if (!a || !b || a === b) return out;
  const games = [];
  (results || []).forEach((r) => {
    const h = franchiseSlug(r.home);
    const w = franchiseSlug(r.away);
    if (!((h === a && w === b) || (h === b && w === a)) || !isComplete(r)) return;
    const s = matchScore(r);
    const aHome = h === a;
    const g = {
      matchId: r.id,
      season: seasonOfId(r.id),
      day: r.day,
      battlesA: aHome ? s.home : s.away,
      battlesB: aHome ? s.away : s.home,
      killsA: aHome ? s.homeKills : s.awayKills,
      killsB: aHome ? s.awayKills : s.homeKills,
    };
    games.push(g);
    out.matches += 1;
    out.battlesA += g.battlesA;
    out.battlesB += g.battlesB;
    out.killsA += g.killsA;
    out.killsB += g.killsB;
    if (g.battlesA > g.battlesB) out.winsA += 1;
    else if (g.battlesB > g.battlesA) out.winsB += 1;
    else out.draws += 1;
  });
  // „Heiß" ist ein Duell, das knapp war und in dem viel gefallen ist.
  out.hottest = games
    .map((g) => ({ ...g, heat: (3 - Math.abs(g.battlesA - g.battlesB)) * 10 + g.killsA + g.killsB - Math.abs(g.killsA - g.killsB) }))
    .sort((x, y) => y.heat - x.heat || y.season - x.season || (y.day ?? 0) - (x.day ?? 0))
    .slice(0, 3);
  out.storylines = (stories || []).filter((st) => {
    const slugs = new Set((st.teams || []).map(franchiseSlug));
    return slugs.has(a) && slugs.has(b);
  });
  return out;
}

// Zwei Vereine aus einem Baustein-Schlüssel: „a | b", „a, b", „a gegen b", „a vs b".
export function splitPair(key) {
  const parts = String(key || '').split(/\s*(?:\||,|;|\bgegen\b|\bvs\.?)\s*/i).map((x) => x.trim()).filter(Boolean);
  return parts.length === 2 ? parts : null;
}
