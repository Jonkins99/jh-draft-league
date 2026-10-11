// Die Zweite Liga (H-Side): Datenmodell, Regeln und Auswertung. Framework-frei und
// unter Node testbar.
//
// Die Zweite Liga liegt komplett NEBEN der ersten: eigene Teams, eigener Spielplan,
// eigene Ergebnisse. Nichts davon steht in `teams`, `schedules` oder `results` — sonst
// sähen alle Ansichten der ersten Liga sie mit. Je Saison gibt es EIN Dokument
// `drafts/liga2-s<N>` (die Collection `drafts` ist für beliebige IDs freigegeben, eine
// neue Collection bräuchte eine neue Regel):
//
//   { season, teams: { <teamId>: { name, logo, color, order, pokemon:[…], trainers:[…] } },
//     blocks: { A: [teamId…], B: [teamId…] },
//     schedule: { matchdays: [{ day, leg, matches: [{ home, away }] }] },
//     results: { 'd<Tag>-m<Index>': { home, away, day, squads, tags, lineupsSaved, battles } },
//     transfer: { removed: [], added: [] } }
//
// Team-IDs folgen dem Schema der ersten Liga (`s2-heerashai-sv`), Ergebnis-IDs ebenso
// (`s2-d1-m0`). Damit rechnen Tabelle, Statistik und Franchise-Logik der ersten Liga
// ohne Anpassung auch hier — sie bekommen nur andere Listen.
//
// Ergebnisse sind schlichter als in der ersten Liga: je Kampf nur die Überlebenden.
// Daraus folgen Sieger und — für Tabelle und Kill-Differenz — namenlose Kills: wer 1
// übrig hat, hat 3 gegnerische Pokémon besiegt. Einem einzelnen Pokémon wird nie ein
// Kill oder Death zugeschrieben.

import { computeStandings, battleStats } from './scoring.mjs';
import { seasonPrefix, seasonFinished, franchiseSlug } from './seasons.mjs';

export const L2_DOC_PREFIX = 'liga2-s';
export const L2_PLAYER = 'Henrik';
export const L2_TEAMS = 8;
export const L2_ROSTER_SIZE = 8;
export const L2_TIERS = ['A', 'B', 'C', 'D'];
export const L2_PER_TIER = 2;
export const L2_SQUAD_SIZE = 6;
export const L2_USED = 4;
export const L2_BATTLES = 3;
// Hin- und Rückrunde: jedes Team aus Block A trifft zweimal auf jedes aus Block B.
export const L2_MATCHDAYS = L2_TEAMS;
export const L2_MATCHES_PER_DAY = L2_TEAMS / 2;
export const L2_TAGS = ['henrik', 'janik', 'ki'];
export const L2_TAG_LABEL = { henrik: 'Henrik', janik: 'Janik', ki: 'KI' };
// Bis einschließlich Spieltag 2 der Saison 2 (und in Saison 1 komplett) darf Henrik
// auch Janiks Kämpfe eintragen — das ist der Nachtrag der schon gespielten Partien.
export const L2_BACKFILL = { season: 2, lastDay: 2 };

export function l2DocId(season) {
  return `${L2_DOC_PREFIX}${Number(season) || 1}`;
}

/** `liga2-s2` -> 2, sonst null. */
export function seasonOfL2Doc(id) {
  const m = String(id || '').match(/^liga2-s(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function l2MatchKey(day, index) {
  return `d${day}-m${index}`;
}

export function l2MatchId(season, day, index) {
  return `${seasonPrefix(season)}-${l2MatchKey(day, index)}`;
}

/** `s2-d3-m1` -> { season: 2, day: 3, index: 1, key: 'd3-m1' } */
export function parseL2MatchId(id) {
  const m = String(id || '').match(/^s(\d+)-d(\d+)-m(\d+)$/);
  if (!m) return null;
  return { season: Number(m[1]), day: Number(m[2]), index: Number(m[3]), key: `d${m[2]}-m${m[3]}` };
}

export function l2TeamId(season, slug) {
  return `${seasonPrefix(season)}-${slug}`;
}

// === Dokument -> Listen im Format der ersten Liga ============================

/** Die Teams einer Saison, sortiert wie angelegt. */
export function l2TeamsOf(doc, season) {
  const s = Number(season);
  return Object.entries(doc?.teams || {})
    .filter(([, t]) => t && !t.removed)
    .map(([id, t]) => ({
      ...t,
      id,
      season: s,
      league: 2,
      player: L2_PLAYER,
      name: t.name || franchiseSlug(id),
      logo: t.logo || '',
      pokemon: Array.isArray(t.pokemon) ? t.pokemon : [],
      trainers: Array.isArray(t.trainers) ? t.trainers : [],
    }))
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
}

/** Namenlose Kills aus den Überlebenden: wer 1 übrig hat, hat 3 gegnerische besiegt. */
export function synthKills(score) {
  const h = clampSurvivors(score?.home);
  const a = clampSurvivors(score?.away);
  if (h == null || a == null) return [];
  const out = [];
  for (let i = 0; i < L2_USED - a; i++) out.push({ victimSide: 'away', killerSide: 'home' });
  for (let i = 0; i < L2_USED - h; i++) out.push({ victimSide: 'home', killerSide: 'away' });
  return out;
}

function clampSurvivors(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(L2_USED, Math.round(n)));
}

export function winnerOf(score) {
  const h = clampSurvivors(score?.home);
  const a = clampSurvivors(score?.away);
  if (h == null || a == null) return null;
  return h > a ? 'home' : a > h ? 'away' : 'draw';
}

export function battleHasResult(b) {
  return clampSurvivors(b?.score?.home) != null && clampSurvivors(b?.score?.away) != null;
}

/** Ein gespeicherter Kampf -> ein Kampf im Format der ersten Liga. */
export function l2Battle(raw, i, tags = []) {
  const used = {
    home: Array.isArray(raw?.used?.home) ? raw.used.home.filter(Boolean) : [],
    away: Array.isArray(raw?.used?.away) ? raw.used.away.filter(Boolean) : [],
  };
  const hasResult = battleHasResult(raw);
  const score = hasResult ? { home: clampSurvivors(raw.score.home), away: clampSurvivors(raw.score.away) } : { home: null, away: null };
  return {
    no: i + 1,
    tag: tags[i] || raw?.tag || null,
    used,
    score,
    done: hasResult,
    winner: hasResult ? winnerOf(score) : null,
    kills: hasResult ? synthKills(score) : [],
    by: raw?.by || null,
    at: raw?.at || null,
  };
}

/** Alle Ergebnisse einer Saison. Ohne gespeicherte Daten gibt es keinen Eintrag. */
export function l2ResultsOf(doc, season) {
  const s = Number(season);
  return Object.entries(doc?.results || {})
    .map(([key, r]) => {
      const m = key.match(/^d(\d+)-m(\d+)$/);
      if (!m || !r) return null;
      const tags = normalizeTags(r.tags) || [];
      const raw = Array.isArray(r.battles) ? r.battles : [];
      const battles = Array.from({ length: L2_BATTLES }, (_, i) => l2Battle(raw[i] || {}, i, tags));
      return {
        id: l2MatchId(s, Number(m[1]), Number(m[2])),
        key,
        season: s,
        day: Number(m[1]),
        index: Number(m[2]),
        home: r.home,
        away: r.away,
        squads: { home: r.squads?.home || [], away: r.squads?.away || [] },
        tags,
        lineupsSaved: !!r.lineupsSaved,
        battles,
        updatedAt: r.updatedAt || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.day - b.day || a.index - b.index);
}

export function l2ScheduleOf(doc) {
  return { matchdays: Array.isArray(doc?.schedule?.matchdays) ? doc.schedule.matchdays : [] };
}

export function l2BlocksOf(doc) {
  const A = Array.isArray(doc?.blocks?.A) ? doc.blocks.A : [];
  const B = Array.isArray(doc?.blocks?.B) ? doc.blocks.B : [];
  return { A, B };
}

export function l2TransferOf(doc) {
  return {
    status: 'done',
    removed: Array.isArray(doc?.transfer?.removed) ? doc.transfer.removed : [],
    added: Array.isArray(doc?.transfer?.added) ? doc.transfer.added : [],
  };
}

// === Kader ===================================================================

/**
 * Passt ein Kader zu den Slots? Acht Plätze, je zwei für A, B, C und D — gezählt wird
 * das Slot-Tier am Eintrag, nicht das Tier des Pokémon in den Stammdaten.
 * Unvollständige Kader sind erlaubt (beim Aufbau), werden aber benannt.
 */
export function rosterCheck(pokemon = []) {
  const list = (pokemon || []).filter((p) => p?.name);
  const byTier = Object.fromEntries(L2_TIERS.map((t) => [t, 0]));
  const illegal = [];
  list.forEach((p) => {
    if (byTier[p.tier] != null) byTier[p.tier] += 1;
    else illegal.push(p.name);
  });
  const problems = [];
  if (illegal.length) problems.push(`Nicht erlaubt (nur Tier A–D): ${illegal.join(', ')}`);
  L2_TIERS.forEach((t) => {
    if (byTier[t] > L2_PER_TIER) problems.push(`Tier ${t}: ${byTier[t]} statt ${L2_PER_TIER}`);
  });
  if (list.length > L2_ROSTER_SIZE) problems.push(`${list.length} statt ${L2_ROSTER_SIZE} Pokémon`);
  const complete = !illegal.length && list.length === L2_ROSTER_SIZE
    && L2_TIERS.every((t) => byTier[t] === L2_PER_TIER);
  return { total: list.length, byTier, illegal, problems, complete, valid: !problems.length };
}

// Der Kader besteht aus Slots: zwei je Tier A–D. Jedes Pokémon darf in jeden Slot —
// welches Tier es in den Stammdaten (heute oder früher) hat, spielt keine Rolle. Das
// Tier am Kadereintrag IST der Slot.

/** Acht leere Slots in der Reihenfolge A, A, B, B, C, C, D, D. */
export function emptySlots() {
  return L2_TIERS.flatMap((tier) => Array.from({ length: L2_PER_TIER }, () => ({ tier, mon: null })));
}

/**
 * Einen gespeicherten Kader auf die Slots verteilen: erst nach dem Tier am Eintrag, was
 * dort keinen Platz findet (alte Stände, S-Tier), in den nächsten freien Slot. Was auch
 * dann nicht passt (mehr als acht), steht in `overflow`.
 */
export function rosterSlots(pokemon = []) {
  const slots = emptySlots();
  const rest = [];
  (pokemon || []).filter((p) => p?.name).forEach((p) => {
    const free = slots.find((s) => !s.mon && s.tier === p.tier);
    if (free) free.mon = p;
    else rest.push(p);
  });
  const overflow = [];
  rest.forEach((p) => {
    const free = slots.find((s) => !s.mon);
    if (free) free.mon = p;
    else overflow.push(p);
  });
  return { slots, overflow };
}

/** Slots -> Kader zum Speichern: jedes Pokémon mit dem Tier seines Slots. */
export function slotsToRoster(slots = []) {
  return (slots || []).filter((s) => s?.mon?.name).map((s) => ({ ...s.mon, tier: s.tier }));
}

/**
 * Stammdaten mit dem Slot-Tier der Kader: ein Pokémon im D-Slot gilt in dieser Saison
 * der Zweiten Liga als D (Statistik, Filter). Alle anderen bleiben, wie sie sind.
 */
export function withSlotTiers(pokedex = [], teams = []) {
  const slot = new Map();
  (teams || []).forEach((t) => (t?.pokemon || []).forEach((p) => {
    if (p?.name && L2_TIERS.includes(p.tier) && !slot.has(p.name)) slot.set(p.name, p.tier);
  }));
  if (!slot.size) return pokedex || [];
  return (pokedex || []).map((m) => (slot.has(m.name) && slot.get(m.name) !== m.tier ? { ...m, tier: slot.get(m.name) } : m));
}

/** Ist im Tier dieses Pokémon noch Platz? */
export function tierHasRoom(pokemon = [], tier) {
  if (!L2_TIERS.includes(tier)) return false;
  return (pokemon || []).filter((p) => p?.tier === tier).length < L2_PER_TIER;
}

/**
 * Kaderwechsel als Wintertransfer: was ging, was kam. `team` ist die Team-ID, `tierOf`
 * liefert das Tier zum Namen (Stammdaten der Saison).
 */
export function transferDiff(teamId, before = [], after = [], { at = null } = {}) {
  const was = new Set((before || []).map((p) => p.name));
  const now = new Set((after || []).map((p) => p.name));
  const removed = (before || []).filter((p) => !now.has(p.name)).map((p) => ({ teamId, name: p.name, tier: p.tier || null, at }));
  const added = (after || []).filter((p) => !was.has(p.name)).map((p) => ({ teamId, name: p.name, tier: p.tier || null, at }));
  return { removed, added };
}

/**
 * Den Transfer-Bestand um einen Kaderwechsel fortschreiben. Ein im selben Winter
 * geholtes und wieder abgegebenes Pokémon hebt sich auf — es war nie da.
 */
export function mergeTransfer(transfer = {}, diff = {}) {
  let removed = [...(transfer.removed || [])];
  let added = [...(transfer.added || [])];
  (diff.removed || []).forEach((r) => {
    const i = added.findIndex((a) => a.teamId === r.teamId && a.name === r.name);
    if (i >= 0) added.splice(i, 1);
    else removed.push(r);
  });
  (diff.added || []).forEach((a) => {
    const i = removed.findIndex((r) => r.teamId === a.teamId && r.name === a.name);
    if (i >= 0) removed.splice(i, 1);
    else added.push(a);
  });
  return { removed, added };
}

// === Blöcke und Spielplan =====================================================

function shuffled(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Acht Teams in Block A und B auslosen. */
export function drawBlocks(ids = [], rand = Math.random) {
  const mixed = shuffled(ids, rand);
  const half = Math.ceil(mixed.length / 2);
  return { A: mixed.slice(0, half), B: mixed.slice(half) };
}

/**
 * Spielplan aus zwei Blöcken: jedes Team aus A trifft in Hin- und Rückrunde je einmal
 * auf jedes Team aus B. Vier Blockteams ergeben 4 + 4 Spieltage mit je vier Partien.
 */
export function buildBlockSchedule(A = [], B = [], rand = Math.random) {
  const n = Math.min(A.length, B.length);
  if (!n) return [];
  const a = shuffled(A, rand).slice(0, n);
  const b = shuffled(B, rand).slice(0, n);
  const hin = [];
  for (let i = 0; i < n; i++) {
    hin.push(a.map((home, j) => ({ home, away: b[(j + i) % n] })));
  }
  const rueck = shuffled(hin, rand).map((md) => shuffled(md, rand).map((m) => ({ home: m.away, away: m.home })));
  const days = [];
  hin.forEach((matches, i) => days.push({ day: i + 1, leg: 'hin', matches }));
  rueck.forEach((matches, i) => days.push({ day: n + i + 1, leg: 'rueck', matches }));
  return days;
}

/** Ein leerer Spielplan zum Ausfüllen von Hand: 8 Spieltage zu je 4 Partien. */
export function blankSchedule(days = L2_MATCHDAYS, perDay = L2_MATCHES_PER_DAY) {
  const half = Math.ceil(days / 2);
  return Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    leg: i < half ? 'hin' : 'rueck',
    matches: Array.from({ length: perDay }, () => ({ home: '', away: '' })),
  }));
}

/**
 * Ein gespeicherter Spielplan als Entwurf für den Editor: genau `days` Spieltage zu je
 * `perDay` Partien. Fehlende Spieltage und Partien kommen leer dazu; überzählige
 * Spieltage fallen weg, solange sie leer sind — sonst bleiben sie stehen und müssen
 * bewusst entfernt werden (`checkSchedule` meldet sie).
 */
export function planDraftFrom(matchdays = [], { days = L2_MATCHDAYS, perDay = L2_MATCHES_PER_DAY } = {}) {
  const half = Math.ceil(days / 2);
  const src = (matchdays || []).map((md) => ({
    day: Number(md.day),
    leg: md.leg === 'rueck' ? 'rueck' : 'hin',
    matches: (md.matches || []).map((m) => ({ home: m?.home || '', away: m?.away || '' })),
  }));
  const out = [];
  for (let d = 1; d <= days; d++) {
    const md = src.find((x) => x.day === d) || { day: d, leg: d <= half ? 'hin' : 'rueck', matches: [] };
    while (md.matches.length < perDay) md.matches.push({ home: '', away: '' });
    out.push(md);
  }
  src.filter((md) => md.day > days || md.day < 1)
    .filter((md) => md.matches.some((m) => m.home || m.away))
    .forEach((md) => out.push(md));
  return out;
}

/**
 * Was stimmt an einem (händisch gepflegten) Spielplan nicht? Harte Fehler verhindern
 * das Speichern, Hinweise nicht — ein Spielplan darf bewusst vom Block-Muster abweichen.
 */
export function checkSchedule(matchdays = [], teamIds = [], blocks = null, { maxDays = L2_MATCHDAYS } = {}) {
  const errors = [];
  const hints = [];
  if (maxDays && (matchdays || []).length > maxDays) {
    errors.push(`Höchstens ${maxDays} Spieltage — ${(matchdays || []).slice(maxDays).map((md) => `Spieltag ${md.day}`).join(', ')} bitte entfernen.`);
  }
  const known = new Set(teamIds);
  const pairs = new Map();
  (matchdays || []).forEach((md) => {
    const seen = new Set();
    (md.matches || []).forEach((m, i) => {
      if (!m.home && !m.away) return;
      if (!m.home || !m.away) { errors.push(`Spieltag ${md.day}, Partie ${i + 1}: ein Team fehlt.`); return; }
      if (m.home === m.away) errors.push(`Spieltag ${md.day}, Partie ${i + 1}: ein Team gegen sich selbst.`);
      [m.home, m.away].forEach((id) => {
        if (!known.has(id)) errors.push(`Spieltag ${md.day}: unbekanntes Team.`);
        if (seen.has(id)) errors.push(`Spieltag ${md.day}: ein Team spielt doppelt.`);
        seen.add(id);
      });
      const key = [m.home, m.away].sort().join('|');
      pairs.set(key, (pairs.get(key) || 0) + 1);
      if (blocks?.A?.length && blocks?.B?.length) {
        const cross = (blocks.A.includes(m.home) && blocks.B.includes(m.away)) || (blocks.B.includes(m.home) && blocks.A.includes(m.away));
        if (!cross) hints.push(`Spieltag ${md.day}, Partie ${i + 1}: kein Duell Block A gegen Block B.`);
      }
    });
  });
  pairs.forEach((n, key) => { if (n > 2) hints.push(`Eine Paarung kommt ${n}-mal vor.`); });
  return { errors: [...new Set(errors)], hints: [...new Set(hints)] };
}

// === Kämpfe: Kennzeichen, Rechte, Status =====================================

/** Henrik, Janik, KI — je einmal, in zufälliger Reihenfolge. */
export function drawTags(rand = Math.random) {
  return shuffled(L2_TAGS, rand);
}

/** Gültig ist nur eine vollständige Zuordnung (jedes Kennzeichen genau einmal). */
export function normalizeTags(tags) {
  if (!Array.isArray(tags) || tags.length !== L2_BATTLES) return null;
  const clean = tags.map((t) => String(t || '').toLowerCase());
  if (new Set(clean).size !== L2_BATTLES || clean.some((t) => !L2_TAGS.includes(t))) return null;
  return clean;
}

/** Wer trägt das Ergebnis dieses Kampfes ein? KI-Kämpfe trägt Henrik ein. */
export function tagPlayer(tag) {
  return tag === 'janik' ? 'Janik' : 'Henrik';
}

/** Darf `player` das Ergebnis eines Kampfes mit diesem Kennzeichen eintragen? */
export function canEnterBattle(player, tag, season, day) {
  if (!player || !L2_TAGS.includes(tag)) return false;
  if (player === tagPlayer(tag)) return true;
  // Nachtrag: die bis dahin gespielten Janik-Kämpfe trägt Henrik ein.
  if (player === 'Henrik' && tag === 'janik') {
    const s = Number(season);
    return s < L2_BACKFILL.season || (s === L2_BACKFILL.season && Number(day) <= L2_BACKFILL.lastDay);
  }
  return false;
}

/** Aufgebote und Kennzeichen stehen — die Einsätze können kommen. */
export function squadsComplete(match) {
  return (match?.squads?.home || []).length === L2_SQUAD_SIZE
    && (match?.squads?.away || []).length === L2_SQUAD_SIZE
    && !!normalizeTags(match?.tags);
}

/** Jeder Kampf hat beidseits vier Pokémon aus dem Aufgebot. */
export function lineupsComplete(match) {
  if (!squadsComplete(match)) return false;
  return Array.from({ length: L2_BATTLES }, (_, i) => match?.battles?.[i]).every((b) => ['home', 'away'].every((side) => {
    const used = b?.used?.[side] || [];
    const squad = match.squads[side];
    return used.length === L2_USED && new Set(used).size === L2_USED && used.every((n) => squad.includes(n));
  }));
}

export function matchComplete(match) {
  return (match?.battles || []).filter((b) => b?.done).length >= L2_BATTLES;
}

/**
 * Die Kämpfe, deren Ergebnis `player` gerade eintragen kann: Einsätze gespeichert,
 * Ergebnis offen, Kennzeichen passt.
 * `seasons`: [{ season, teams, results }]
 */
export function pendingEntries(player, seasons = []) {
  const out = [];
  (seasons || []).forEach(({ season, teams = [], results = [] }) => {
    const byId = new Map(teams.map((t) => [t.id, t]));
    results.forEach((r) => {
      if (!r?.lineupsSaved || !lineupsComplete(r)) return;
      r.battles.forEach((b, i) => {
        if (b.done || !canEnterBattle(player, b.tag, season, r.day)) return;
        out.push({
          season,
          day: r.day,
          index: r.index,
          battle: i,
          matchId: r.id,
          tag: b.tag,
          home: byId.get(r.home) || { id: r.home, name: r.home },
          away: byId.get(r.away) || { id: r.away, name: r.away },
        });
      });
    });
  });
  return out.sort((a, b) => b.season - a.season || a.day - b.day || a.index - b.index || a.battle - b.battle);
}

/** Sind alle Partien dieses Spieltags mit drei Ergebnissen erfasst? */
export function dayComplete(schedule, results, day) {
  const md = (schedule?.matchdays || []).find((m) => Number(m.day) === Number(day));
  const planned = (md?.matches || []).map((m, index) => ({ ...m, index })).filter((m) => m.home && m.away);
  if (!planned.length) return false;
  return planned.every((m) => {
    const r = (results || []).find((x) => x.day === Number(day) && x.index === m.index);
    return !!r && r.home === m.home && r.away === m.away && matchComplete(r);
  });
}

/** Alle Spieltage, an denen jede Partie fertig ist. */
export function completeDays(schedule, results) {
  return (schedule?.matchdays || [])
    .map((md) => md.day)
    .filter((d) => dayComplete(schedule, results, d))
    .sort((a, b) => a - b);
}

// === Schreiben: ein Match fortschreiben ======================================

const cleanNames = (list) => [...new Set((list || []).map((n) => String(n || '').trim()).filter(Boolean))];

/**
 * Ein gespeichertes Match um eine Änderung fortschreiben (rein, für Transaktionen).
 *
 * - `squads`/`tags`: Aufgebote und Kennzeichen. Ein Kampf mit Ergebnis behält seine
 *   Einsätze; wer aus dem Aufgebot fällt, verschwindet aus offenen Einsätzen.
 * - `lineups`: [{ home:[4], away:[4] }] in Reihenfolge. Kämpfe mit Ergebnis bleiben.
 * - `result`: { index, home, away, by } trägt Überlebende ein; `clear: true` nimmt sie zurück.
 */
export function updateL2Match(existing = {}, change = {}, { at = null } = {}) {
  const next = {
    home: change.home ?? existing.home ?? null,
    away: change.away ?? existing.away ?? null,
    day: change.day ?? existing.day ?? null,
    squads: { home: existing.squads?.home || [], away: existing.squads?.away || [] },
    tags: normalizeTags(existing.tags) || null,
    lineupsSaved: !!existing.lineupsSaved,
    battles: Array.from({ length: L2_BATTLES }, (_, i) => ({ ...(existing.battles?.[i] || {}) })),
  };
  const locked = (i) => battleHasResult(next.battles[i]);

  if (change.squads) {
    ['home', 'away'].forEach((side) => {
      if (Array.isArray(change.squads[side])) next.squads[side] = cleanNames(change.squads[side]).slice(0, L2_SQUAD_SIZE);
    });
    next.battles.forEach((b, i) => {
      if (locked(i)) return;
      ['home', 'away'].forEach((side) => {
        b.used = { home: b.used?.home || [], away: b.used?.away || [] };
        b.used[side] = (b.used[side] || []).filter((n) => next.squads[side].includes(n));
      });
    });
  }
  if (change.tags !== undefined) {
    const tags = normalizeTags(change.tags);
    // Kennzeichen eines Kampfes mit Ergebnis bleiben stehen — sonst wechselte der Eintragende nachträglich.
    if (tags && !next.battles.some((_, i) => locked(i) && next.tags && next.tags[i] !== tags[i])) next.tags = tags;
  }
  if (Array.isArray(change.lineups)) {
    change.lineups.forEach((l, i) => {
      if (i >= L2_BATTLES || !l || locked(i)) return;
      next.battles[i].used = {
        home: cleanNames(l.home).filter((n) => next.squads.home.includes(n)).slice(0, L2_USED),
        away: cleanNames(l.away).filter((n) => next.squads.away.includes(n)).slice(0, L2_USED),
      };
    });
    next.lineupsSaved = lineupsComplete({ ...next, battles: next.battles });
  }
  if (change.result) {
    const { index, clear } = change.result;
    const b = next.battles[index];
    if (b) {
      if (clear) {
        delete b.score;
        delete b.by;
        delete b.at;
      } else {
        const h = clampSurvivors(change.result.home);
        const a = clampSurvivors(change.result.away);
        if (h != null && a != null) {
          b.score = { home: h, away: a };
          b.by = change.result.by || null;
          b.at = at;
        }
      }
    }
  }
  if (!lineupsComplete(next)) next.lineupsSaved = false;
  next.updatedAt = at;
  return next;
}

// === Auswertung ==============================================================

/** Wie oft stand ein Pokémon unter den ersten zwei gewählten (Leads)? */
export function leadCounts(results = [], { scopeTeamId = null } = {}) {
  const out = {};
  (results || []).forEach((r) => {
    (r.battles || []).forEach((b) => {
      if (!b?.done) return;
      ['home', 'away'].forEach((side) => {
        if (scopeTeamId && r[side] !== scopeTeamId) return;
        (b.used?.[side] || []).slice(0, 2).forEach((name) => { out[name] = (out[name] || 0) + 1; });
      });
    });
  });
  return out;
}

/** Bilanz eines Matches aus Sicht einer Seite. */
export function matchScore(result, side = 'home') {
  const opp = side === 'home' ? 'away' : 'home';
  let own = 0;
  let other = 0;
  let done = 0;
  (result?.battles || []).forEach((b) => {
    if (!b?.done) return;
    const s = battleStats(b);
    done += 1;
    own += s[`${side}Points`];
    other += s[`${opp}Points`];
  });
  return { own, other, done };
}

/**
 * Ewige Tabelle über beide Ligen. Jede Liga wird je Saison für sich gerechnet; die
 * Plätze der Zweiten Liga zählen hinter denen der ersten (Platz 1 der Zweiten Liga ist
 * Gesamtrang 9) — so bleibt „beste Platzierung" über beide Ligen vergleichbar.
 * Titel zählen nur in der ersten Liga, die der zweiten stehen getrennt.
 */
export function combinedAllTime({ seasons = [], league1 = {}, league2 = {}, offset = L2_TEAMS } = {}) {
  const rows = {};
  const add = (table, season, finished, league) => {
    table.forEach((r, i) => {
      const slug = franchiseSlug(r.team.id);
      const row = rows[slug] || (rows[slug] = {
        slug, team: r.team, seasons: [],
        played: 0, won: 0, draw: 0, lost: 0, kills: 0, deaths: 0, points: 0,
        titles: 0, titles2: 0, bestPlace: null, placeSum: 0, placeCount: 0, leagues: new Set(),
      });
      const latest = row.seasons.length ? Math.max(...row.seasons.map((s) => s.season)) : -1;
      if (season >= latest) row.team = r.team;
      ['played', 'won', 'draw', 'lost', 'kills', 'deaths', 'points'].forEach((k) => { row[k] += r[k]; });
      const place = i + 1;
      const overall = league === 2 ? place + offset : place;
      row.seasons.push({ season, league, place, overall, points: r.points, played: r.played });
      row.leagues.add(league);
      if (r.played) {
        row.placeSum += overall;
        row.placeCount += 1;
        if (row.bestPlace == null || overall < row.bestPlace) row.bestPlace = overall;
        if (i === 0 && finished) {
          if (league === 1) row.titles += 1;
          else row.titles2 += 1;
        }
      }
    });
  };
  [...new Set(seasons)].sort((a, b) => a - b).forEach((season) => {
    [[1, league1], [2, league2]].forEach(([league, src]) => {
      const teams = (src.teamsOf ? src.teamsOf(season) : []) || [];
      if (!teams.length) return;
      const results = (src.resultsOf ? src.resultsOf(season) : []) || [];
      const table = computeStandings(teams, results);
      const finished = seasonFinished(src.scheduleOf ? src.scheduleOf(season) : null, table);
      add(table, season, finished, league);
    });
  });
  return Object.values(rows)
    .map((r) => ({
      ...r,
      leagues: [...r.leagues].sort(),
      diff: r.kills - r.deaths,
      seasonCount: r.seasons.length,
      avgPlace: r.placeCount ? r.placeSum / r.placeCount : null,
      pointsPerMatch: r.played ? r.points / r.played : 0,
    }))
    .sort((a, b) => b.points - a.points || b.diff - a.diff || b.kills - a.kills || a.team.name.localeCompare(b.team.name));
}
