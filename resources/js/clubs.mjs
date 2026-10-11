// Vereine über alle Saisons und beide Ligen — und der Start einer neuen Saison über
// die Oberfläche. Framework-frei und unter Node testbar.
//
// Ein Verein (Franchise) ist sein Slug. Er spielt je Saison in genau einer Liga oder
// pausiert (J-Side, die hier nicht abgebildet ist). Seine Stammdaten stehen am
// jüngsten Auftritt — oder, sobald sie in der Oberfläche gepflegt wurden, im
// Vereinsregister `drafts/teampool` (`teams.<slug>`). Dort entstehen auch neue Vereine,
// bevor sie das erste Mal antreten.
//
// Eine neue Saison legt je Liga die Team-Einträge an: Liga 1 als `teams/s<N>-<slug>`,
// Liga 2 im Saisondokument `drafts/liga2-s<N>`. Farbe und amtierender Trainer ziehen
// mit (sie gehören zum Verein, nicht zur Saison) — der Trainer als „vor der Saison" im
// Amt, weil Amtszeiten Spieltage der jeweiligen Saison zählen.

import { franchiseSlug, seasonOfTeam, seasonPrefix } from './seasons.mjs';
import { currentTrainer, normalizeTrainer } from './trainers.mjs';

export const TEAMPOOL_DOC = 'teampool';
export const CLUB_PLAYERS = ['Janik', 'Henrik'];
export const SEASON_TEAMS = 8;

export function clubSlug(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function hexOrNull(v) {
  const s = String(v || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

/** Ein Registereintrag im Speicherformat. */
export function normalizeClub(raw = {}) {
  const name = String(raw.name || '').replace(/\s+/g, ' ').trim();
  return {
    slug: clubSlug(raw.slug || name),
    name,
    player: CLUB_PLAYERS.includes(raw.player) ? raw.player : 'Henrik',
    logo: String(raw.logo || '').trim(),
    color: hexOrNull(raw.color),
  };
}

/**
 * Alle bekannten Vereine — aus beiden Ligen und dem Register.
 * @returns {Array<{ slug, name, player, logo, color, lastSeason, lastLeague, lastTeam, appearances, inPool }>}
 */
export function clubDirectory({ teams1 = [], teams2 = [], pool = {} } = {}) {
  const map = new Map();
  const touch = (slug) => {
    if (!map.has(slug)) map.set(slug, { slug, appearances: [], lastTeam: null, lastSeason: null, lastLeague: null, inPool: false });
    return map.get(slug);
  };
  [[1, teams1], [2, teams2]].forEach(([league, list]) => {
    (list || []).forEach((t) => {
      if (!t?.id) return;
      const c = touch(franchiseSlug(t.id));
      const season = seasonOfTeam(t);
      c.appearances.push({ season, league, teamId: t.id });
      if (c.lastSeason == null || season > c.lastSeason) {
        c.lastSeason = season;
        c.lastLeague = league;
        c.lastTeam = t;
      }
    });
  });
  Object.entries(pool || {}).forEach(([slug, raw]) => {
    if (!raw || raw.removed) return;
    const c = touch(slug);
    c.inPool = true;
    c.pool = raw;
  });
  return [...map.values()].map((c) => {
    const t = c.lastTeam || {};
    const p = c.pool || {};
    return {
      ...c,
      appearances: c.appearances.sort((a, b) => a.season - b.season),
      name: p.name || t.name || c.slug,
      // Liga-2-Teams gehören immer Henrik; maßgeblich ist sonst der jüngste Auftritt.
      player: p.player || (c.lastLeague === 2 ? 'Henrik' : t.player) || 'Henrik',
      logo: p.logo || t.logo || '',
      color: hexOrNull(p.color) || hexOrNull(t.color),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Vorauswahl der neuen Saison: Liga 1 Platz 1–6, Liga 2 Platz 3–6. */
export function seasonPreselect({ table1 = [], table2 = [] } = {}) {
  return {
    l1: table1.slice(0, 6).map((r) => franchiseSlug(r.team.id)),
    l2: table2.slice(2, 6).map((r) => franchiseSlug(r.team.id)),
  };
}

/**
 * Passt die Auswahl? Liga 1 braucht acht Teams, vier je Spieler (der Spielplan stellt
 * Janiks Teams gegen Henriks). Liga 2 hat acht Teams oder fällt in dieser Saison aus.
 */
export function validateSeasonPick({ l1 = [], l2 = [], directory = [] } = {}) {
  const errors = [];
  const bySlug = new Map((directory || []).map((c) => [c.slug, c]));
  if (l1.length !== SEASON_TEAMS) errors.push(`Liga 1: ${l1.length} von ${SEASON_TEAMS} Teams gewählt.`);
  const players = CLUB_PLAYERS.map((p) => ({ p, n: l1.filter((s) => bySlug.get(s)?.player === p).length }));
  if (l1.length === SEASON_TEAMS && players.some((x) => x.n !== SEASON_TEAMS / 2)) {
    errors.push(`Liga 1 braucht vier Teams je Spieler (${players.map((x) => `${x.p} ${x.n}`).join(', ')}).`);
  }
  if (l2.length && l2.length !== SEASON_TEAMS) errors.push(`Liga 2: ${l2.length} von ${SEASON_TEAMS} Teams gewählt (oder keins).`);
  const both = l1.filter((s) => l2.includes(s));
  if (both.length) errors.push(`In beiden Ligen gewählt: ${both.map((s) => bySlug.get(s)?.name || s).join(', ')}.`);
  return errors;
}

// Der amtierende Trainer des letzten Auftritts — als „vor der Saison" im Amt.
function carriedTrainers(club, teamId) {
  const boss = currentTrainer(club?.lastTeam?.trainers || []);
  if (!boss) return [];
  return [normalizeTrainer({ ...boss, id: null, fromDay: null, untilDay: null }, teamId)];
}

/**
 * Die Einträge der neuen Saison.
 * @returns {{ teams1: Array<{ id, data }>, teams2: Object<string, object> }}
 */
export function buildSeasonStart({ season, l1 = [], l2 = [], directory = [] } = {}) {
  const bySlug = new Map((directory || []).map((c) => [c.slug, c]));
  const prefix = seasonPrefix(season);
  const entry = (slug, i, league) => {
    const c = bySlug.get(slug) || { slug, name: slug, player: 'Henrik', logo: '' };
    const id = `${prefix}-${slug}`;
    const data = {
      season: Number(season),
      name: c.name,
      player: league === 2 ? 'Henrik' : c.player,
      logo: c.logo || '',
      order: i + 1,
      pokemon: [],
      trainers: carriedTrainers(c, id),
    };
    if (c.color) data.color = c.color;
    return { id, data };
  };
  const teams1 = l1.map((slug, i) => entry(slug, i, 1));
  const teams2 = Object.fromEntries(l2.map((slug, i) => {
    const { id, data } = entry(slug, i, 2);
    const { season: _s, player: _p, ...rest } = data;
    return [id, rest];
  }));
  return { teams1, teams2 };
}
