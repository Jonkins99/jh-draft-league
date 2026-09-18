// Saison-Logik: Zuordnung von Dokumenten zu Saisons, Franchise-Identität über
// Saisongrenzen hinweg, die ewige Tabelle, Langzeit-Statistiken und die Rekorde.
// Framework-frei (nur scoring.mjs), damit alles unter Node testbar bleibt.
//
// Grundsätze:
// - Die SAISON steckt in der Dokument-ID, nicht in einem Feld: `s1-heerashai-sv`,
//   `s1-d3-m0`, `schedules/s1`, `drafts/s1`, `drafts/transfer-s1`. Damit lässt sich
//   jedes Dokument einer Saison zuordnen, auch wenn (wie bei `results`) kein
//   `season`-Feld existiert.
// - Ein Team ist über Saisons hinweg dasselbe FRANCHISE, wenn der Namensteil der ID
//   gleich bleibt (`s1-heerashai-sv` und `s2-heerashai-sv`). Nur so ergibt eine ewige
//   Tabelle Sinn — und nur so funktionieren Auf- und Abstiege, bei denen ab Saison 2
//   mehr Franchises existieren als Startplätze.

import { battleStats, computeStandings, pokemonStats } from './scoring.mjs';
import { marketValue, historyPoints } from './market.mjs';
import { awardWinner, awardTone, AWARD_BY_KEY } from './awards.mjs';

/** Der Bereichsschlüssel der saisonübergreifenden Ansicht. */
export const SEASON_ALL = 'all';

/** `s2` für Saison 2 — das Präfix aller Dokument-IDs einer Saison. */
export function seasonPrefix(season) {
  return `s${Number(season) || 1}`;
}

/** `s1-d3-m0` -> 1, `s1-heerashai-sv` -> 1. Ohne Präfix: Saison 1 (Altbestand). */
export function seasonOfId(id) {
  const m = String(id || '').match(/^s(\d+)-/);
  return m ? Number(m[1]) : 1;
}

/** Die Saison eines Team-Dokuments — Feld zuerst, sonst aus der ID. */
export function seasonOfTeam(team) {
  return Number.isFinite(team?.season) ? team.season : seasonOfId(team?.id);
}

/** `s2-heerashai-sv` -> `heerashai-sv`. Die Identität über alle Saisons. */
export function franchiseSlug(teamId) {
  return String(teamId || '').replace(/^s\d+-/, '');
}

/** Alle Saisons, für die Teams existieren — aufsteigend, mindestens [1]. */
export function seasonsFrom(teams) {
  const set = new Set((teams || []).map(seasonOfTeam).filter((n) => Number.isFinite(n)));
  if (!set.size) set.add(1);
  return [...set].sort((a, b) => a - b);
}

/**
 * Die Pokémon, die mit dieser Saison NEU in den Pool gekommen sind.
 *
 * Das Feld `since` in `pokemon.json` trägt die Saison des Zugangs; fehlt es, war das
 * Pokémon von Anfang an dabei. Sortiert wird nach Punktwert absteigend — das ist die
 * Reihenfolge, in der über Neuzugänge geredet wird.
 */
export function newcomersOfSeason(pokedex, season) {
  const n = Number(season);
  if (!Number.isFinite(n)) return [];
  return (pokedex || [])
    .filter((p) => Number(p?.since) === n)
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || String(a.name).localeCompare(String(b.name)));
}

export function teamsOfSeason(teams, season) {
  return (teams || [])
    .filter((t) => seasonOfTeam(t) === Number(season))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function resultsOfSeason(results, season) {
  return (results || []).filter((r) => seasonOfId(r?.id) === Number(season));
}

/** Spieltag eines Ergebnisses — Feld zuerst, sonst aus der ID (`s1-d3-m0`). */
export function dayOfResult(result) {
  if (Number.isFinite(result?.day)) return result.day;
  const m = String(result?.id || '').match(/-d(\d+)-/);
  return m ? Number(m[1]) : null;
}

/** Wie viele Partien hat der Spielplan für dieses Team vorgesehen? */
export function scheduledMatches(schedule, teamId) {
  return (schedule?.matchdays || []).reduce(
    (n, md) => n + (md.matches || []).filter((m) => m.home === teamId || m.away === teamId).length,
    0,
  );
}

/**
 * Eine Saison gilt als abgeschlossen, wenn jede geplante Partie jedes Teams ein
 * Ergebnis hat. Ohne Spielplan lässt sich das nicht sagen — dann ist sie offen.
 * Wichtig für die Titelzählung: der Tabellenführer einer laufenden Saison ist
 * noch kein Meister.
 */
export function seasonFinished(schedule, table) {
  if (!(schedule?.matchdays || []).length || !table.length) return false;
  return table.every((r) => {
    const planned = scheduledMatches(schedule, r.team.id);
    return planned > 0 && r.played >= planned;
  });
}

// === Ewige Tabelle =========================================================

/**
 * Die Saisons einzeln rechnen und danach je Franchise zusammenfassen — eine
 * gemeinsame `computeStandings` über alle Saisons würde dasselbe Franchise als
 * mehrere Zeilen führen und die Platzierungen vermischen.
 *
 * Rückgabe je Franchise: Spiele, Punkte, Bilanz, Kills/Deaths, beste und
 * durchschnittliche Platzierung, Titel (Platz 1 einer abgeschlossenen Saison)
 * und die Liste der gespielten Saisons.
 */
export function allTimeTable(teams, results, { schedules = {} } = {}) {
  const rows = {};
  const seasons = seasonsFrom(teams);

  seasons.forEach((season) => {
    const sTeams = teamsOfSeason(teams, season);
    const sResults = resultsOfSeason(results, season);
    if (!sTeams.length) return;
    const table = computeStandings(sTeams, sResults);
    const finished = seasonFinished(schedules[seasonPrefix(season)], table);
    table.forEach((r, i) => {
      const slug = franchiseSlug(r.team.id);
      const row = rows[slug] || (rows[slug] = {
        slug,
        team: r.team,
        seasons: [],
        played: 0, won: 0, draw: 0, lost: 0,
        kills: 0, deaths: 0, points: 0,
        titles: 0, bestPlace: null, placeSum: 0, placeCount: 0,
      });
      // Der jüngste Auftritt bestimmt Name, Wappen und Spieler.
      row.team = r.team;
      row.played += r.played;
      row.won += r.won;
      row.draw += r.draw;
      row.lost += r.lost;
      row.kills += r.kills;
      row.deaths += r.deaths;
      row.points += r.points;
      row.seasons.push({ season, place: i + 1, points: r.points, played: r.played });
      if (r.played) {
        row.placeSum += i + 1;
        row.placeCount++;
        if (row.bestPlace == null || i + 1 < row.bestPlace) row.bestPlace = i + 1;
        // Titel gibt es nur für abgeschlossene Saisons.
        if (i === 0 && finished) row.titles++;
      }
    });
  });

  return Object.values(rows)
    .map((r) => ({
      ...r,
      diff: r.kills - r.deaths,
      seasonCount: r.seasons.length,
      avgPlace: r.placeCount ? r.placeSum / r.placeCount : null,
      pointsPerMatch: r.played ? r.points / r.played : 0,
    }))
    .sort((a, b) =>
      b.points - a.points
      || b.diff - a.diff
      || b.kills - a.kills
      || a.team.name.localeCompare(b.team.name));
}

/** Kurzprofil je Saison: Meister, Teams, gespielte Matches, Kills. */
export function seasonSummaries(teams, results, schedules = {}) {
  return seasonsFrom(teams).map((season) => {
    const sTeams = teamsOfSeason(teams, season);
    const sResults = resultsOfSeason(results, season);
    const table = computeStandings(sTeams, sResults);
    const played = table.reduce((sum, r) => sum + r.played, 0) / 2;
    const finished = seasonFinished(schedules[seasonPrefix(season)], table);
    return {
      season,
      teams: sTeams.length,
      matches: Math.round(played),
      kills: table.reduce((sum, r) => sum + r.kills, 0),
      champion: played ? table[0]?.team || null : null,
      finished,
      running: played > 0 && !finished,
    };
  });
}

/** Spieler-Bilanz (Janik gegen Henrik) über alle Saisons zusammengefasst. */
export function allTimePlayers(teams, results, schedules = {}) {
  const out = {};
  seasonsFrom(teams).forEach((season) => {
    const sTeams = teamsOfSeason(teams, season);
    const table = computeStandings(sTeams, resultsOfSeason(results, season));
    const finished = seasonFinished(schedules[seasonPrefix(season)], table);
    table.forEach((r, i) => {
      const p = r.team.player || '—';
      const row = out[p] || (out[p] = {
        player: p, teams: 0, played: 0, won: 0, draw: 0, lost: 0,
        kills: 0, deaths: 0, points: 0, titles: 0, placeSum: 0, placeCount: 0, seasons: new Set(),
      });
      row.teams++;
      row.played += r.played;
      row.won += r.won;
      row.draw += r.draw;
      row.lost += r.lost;
      row.kills += r.kills;
      row.deaths += r.deaths;
      row.points += r.points;
      row.seasons.add(season);
      if (r.played) {
        row.placeSum += i + 1;
        row.placeCount++;
        if (i === 0 && finished) row.titles++;
      }
    });
  });
  return Object.values(out)
    .map((r) => ({
      ...r,
      seasons: [...r.seasons],
      diff: r.kills - r.deaths,
      avgPlace: r.placeCount ? r.placeSum / r.placeCount : null,
    }))
    .sort((a, b) => b.points - a.points || b.diff - a.diff);
}

/**
 * Pokémon-Statistik über alle Saisons. `pokemonStats` ist result-getrieben und
 * verträgt deshalb beliebig viele Saisons in einem Aufruf; ergänzt werden nur die
 * Angaben, die erst im Langzeitvergleich entstehen (in wie vielen Saisons ein
 * Pokémon gespielt hat und für wie viele Franchises).
 */
export function allTimePokemon(teams, results, pokedex = []) {
  const base = pokemonStats(teams, results, pokedex);
  const seasonsOf = {};
  const clubsOf = {};
  (results || []).forEach((r) => {
    const season = seasonOfId(r.id);
    ['home', 'away'].forEach((side) => {
      (r.squads?.[side] || []).forEach((name) => {
        (seasonsOf[name] = seasonsOf[name] || new Set()).add(season);
        (clubsOf[name] = clubsOf[name] || new Set()).add(franchiseSlug(r[side]));
      });
    });
  });
  return base.map((s) => ({
    ...s,
    seasonsPlayed: seasonsOf[s.pokemon?.name]?.size || 0,
    clubs: clubsOf[s.pokemon?.name]?.size || 0,
  }));
}

// === Rekorde ===============================================================

const monMeta = (pokedex, name) => (pokedex || []).find((p) => p.name === name) || null;

// Wer hat dieses Pokémon in DIESEM Ergebnis aufgestellt? Nach einem Transfer ist das
// nicht mehr der aktuelle Besitzer — für einen Rekord zählt der damalige.
function sideOfMon(result, name) {
  if ((result?.squads?.home || []).includes(name)) return 'home';
  if ((result?.squads?.away || []).includes(name)) return 'away';
  return null;
}

function whenOf(result) {
  return { season: seasonOfId(result?.id), day: dayOfResult(result), matchId: result?.id || null };
}

function teamNameOf(teams, id) {
  return (teams || []).find((t) => t.id === id)?.name || null;
}

// Alle Einträge mit dem HÖCHSTEN Wert, nicht nur der erste. Ein Rekord, den sich
// mehrere teilen, gehört auch mehreren — sonst entscheidet die Reihenfolge der
// Ergebnisse darüber, wer genannt wird.
// Gleitkommawerte (K/D, Quoten) werden vor dem Vergleich gerundet, sonst trennt
// Rechenungenauigkeit Einträge, die in der Anzeige identisch aussehen.
const EPS = 1e-6;

function bestAll(list, pick) {
  let max = null;
  const items = [];
  (list || []).forEach((entry) => {
    const raw = pick(entry);
    if (!Number.isFinite(raw)) return;
    const v = Math.round(raw / EPS) * EPS;
    if (max === null || v > max + EPS) { max = v; items.length = 0; items.push(entry); }
    else if (Math.abs(v - max) <= EPS) items.push(entry);
  });
  return { value: max, items };
}

/**
 * Bestmarken über alle Saisons. Jeder Eintrag:
 *   { key, label, info, value, display, holders:[{ name, image, teamId, teamName, when }] }
 * `holder`/`when` bleiben als Kurzform des ersten Halters erhalten.
 * `when` trägt Saison und Spieltag — ein Kalenderdatum führt die Liga nicht.
 */
export function buildRecords({ teams = [], results = [], pokedex = [], eloRows = [], awardDocs = [] } = {}) {
  const out = [];
  // Ein Rekord wird über `holders` gepflegt; `holder`/`when` sind der erste Eintrag.
  const push = (rec) => {
    if (!rec || rec.value == null) return;
    const holders = (rec.holders || []).filter((h) => h && h.name);
    if (!holders.length) return;
    out.push({ ...rec, holders, holder: holders[0], when: holders[0].when ?? null });
  };

  // --- Einzelne Kämpfe und Matches ---------------------------------------
  const battleKillRows = [];
  const matchKillRows = [];
  const matchDiffRows = [];
  let perfectBattles = 0;
  const dayKills = {};

  (results || []).forEach((r) => {
    const matchKills = {};
    (r.battles || []).forEach((b, bi) => {
      if (!b || !b.done) return;
      const s = battleStats(b);
      if (s.homeSurvivors === 4 || s.awaySurvivors === 4) perfectBattles++;
      const perMon = {};
      (b.kills || []).forEach((k) => {
        if (!k?.killer || k.killerSide === k.victimSide) return;
        perMon[k.killer] = (perMon[k.killer] || 0) + 1;
        matchKills[k.killer] = (matchKills[k.killer] || 0) + 1;
      });
      Object.entries(perMon).forEach(([name, n]) => {
        battleKillRows.push({ name, n, result: r, battle: bi + 1 });
      });
      const side = seasonOfId(r.id);
      const key = `${side}|${dayOfResult(r)}`;
      dayKills[`${key}|${r.home}`] = (dayKills[`${key}|${r.home}`] || 0) + s.homeKills;
      dayKills[`${key}|${r.away}`] = (dayKills[`${key}|${r.away}`] || 0) + s.awayKills;
    });
    Object.entries(matchKills).forEach(([name, n]) => {
      matchKillRows.push({ name, n, result: r });
    });
    const done = (r.battles || []).filter((b) => b?.done);
    if (done.length) {
      const sum = done.reduce((acc, b) => {
        const s = battleStats(b);
        return { hk: acc.hk + s.homeKills, ak: acc.ak + s.awayKills, hp: acc.hp + s.homePoints, ap: acc.ap + s.awayPoints };
      }, { hk: 0, ak: 0, hp: 0, ap: 0 });
      const diff = Math.abs(sum.hk - sum.ak);
      const winner = sum.hp === sum.ap ? null : sum.hp > sum.ap ? 'home' : 'away';
      if (winner) {
        matchDiffRows.push({
          diff, result: r, winner,
          score: `${winner === 'home' ? sum.hp : sum.ap}:${winner === 'home' ? sum.ap : sum.hp}`,
        });
      }
    }
  });

  const dayKillRows = Object.entries(dayKills).map(([key, n]) => {
    const [season, day, teamId] = key.split('|');
    return { n, season: Number(season), day: Number(day), teamId };
  });

  const monHolder = (name, result, extra = {}) => {
    const side = sideOfMon(result, name);
    return {
      name,
      image: monMeta(pokedex, name)?.image || null,
      teamId: side ? result[side] : null,
      teamName: side ? teamNameOf(teams, result[side]) : null,
      when: { ...whenOf(result), ...extra },
    };
  };

  const topBattleKills = bestAll(battleKillRows, (r) => r.n);
  if (topBattleKills.value) {
    push({
      key: 'battleKills', label: 'Meiste Kills in einem Kampf', group: 'pokemon',
      info: 'Kills eines einzelnen Pokémon in einem einzigen Kampf. Self-Kills zählen nicht.',
      value: topBattleKills.value, display: `${topBattleKills.value} Kills`,
      holders: topBattleKills.items.map((r) => monHolder(r.name, r.result, { battle: r.battle })),
    });
  }

  const topMatchKills = bestAll(matchKillRows, (r) => r.n);
  if (topMatchKills.value) {
    push({
      key: 'matchKills', label: 'Meiste Kills in einem Match', group: 'pokemon',
      info: 'Kills eines Pokémon über die drei Kämpfe eines Matches hinweg.',
      value: topMatchKills.value, display: `${topMatchKills.value} Kills`,
      holders: topMatchKills.items.map((r) => monHolder(r.name, r.result)),
    });
  }

  const topMatchDiff = bestAll(matchDiffRows, (r) => r.diff);
  if (topMatchDiff.value) {
    push({
      key: 'matchDiff', label: 'Höchster Sieg', group: 'team',
      info: 'Größte Kill-Differenz eines gewonnenen Matches.',
      value: topMatchDiff.value,
      display: `+${topMatchDiff.value} Kills`,
      holders: topMatchDiff.items.map((row) => {
        const teamId = row.result[row.winner];
        const other = row.result[row.winner === 'home' ? 'away' : 'home'];
        return {
          name: teamNameOf(teams, teamId) || teamId,
          teamId,
          teamName: `${row.score} gegen ${teamNameOf(teams, other) || other}`,
          when: whenOf(row.result),
        };
      }),
    });
  }

  const topDayKills = bestAll(dayKillRows, (r) => r.n);
  if (topDayKills.value) {
    push({
      key: 'dayKills', label: 'Meiste Kills an einem Spieltag', group: 'team',
      info: 'Kills eines Teams in seinem Match an einem Spieltag.',
      value: topDayKills.value, display: `${topDayKills.value} Kills`,
      holders: topDayKills.items.map((row) => ({
        name: teamNameOf(teams, row.teamId) || row.teamId,
        teamId: row.teamId,
        when: { season: row.season, day: row.day, matchId: null },
      })),
    });
  }

  if (perfectBattles) {
    push({
      key: 'perfectBattles', label: 'Makellose Kämpfe', group: 'liga',
      info: 'Kämpfe, in denen eine Seite alle vier Pokémon im Feld behalten hat.',
      value: perfectBattles, display: `${perfectBattles}×`,
      holders: [{ name: 'Die Liga', when: null }],
    });
  }

  // --- Serien je Franchise ------------------------------------------------
  const order = [...(results || [])]
    .filter((r) => (r.battles || []).some((b) => b?.done))
    .sort((a, b) => seasonOfId(a.id) - seasonOfId(b.id) || (dayOfResult(a) || 0) - (dayOfResult(b) || 0));
  const streak = {};
  const streakRows = { win: [], unbeaten: [], loss: [] };
  order.forEach((r) => {
    const done = (r.battles || []).filter((b) => b?.done);
    const sum = done.reduce((acc, b) => {
      const s = battleStats(b);
      return { hp: acc.hp + s.homePoints, ap: acc.ap + s.awayPoints };
    }, { hp: 0, ap: 0 });
    [['home', sum.hp, sum.ap], ['away', sum.ap, sum.hp]].forEach(([side, own, opp]) => {
      const slug = franchiseSlug(r[side]);
      const st = streak[slug] || (streak[slug] = { win: 0, unbeaten: 0, loss: 0 });
      if (own > opp) { st.win++; st.unbeaten++; st.loss = 0; }
      else if (own === opp) { st.win = 0; st.unbeaten++; st.loss = 0; }
      else { st.win = 0; st.unbeaten = 0; st.loss++; }
      [['win', st.win], ['unbeaten', st.unbeaten], ['loss', st.loss]].forEach(([k, n]) => {
        if (n < 2) return;
        // Je Franchise zählt nur die längste Serie — sonst stünde dieselbe Serie
        // mit jedem Zwischenstand mehrfach in der Liste.
        const prev = streakRows[k].findIndex((x) => franchiseSlug(x.teamId) === slug);
        if (prev >= 0) {
          if (streakRows[k][prev].n >= n) return;
          streakRows[k].splice(prev, 1);
        }
        streakRows[k].push({ n, teamId: r[side], result: r });
      });
    });
  });

  const streakLabels = {
    win: ['Längste Siegesserie', 'Matches in Folge gewonnen.'],
    unbeaten: ['Längste Serie ohne Niederlage', 'Matches in Folge ohne Niederlage — Unentschieden zählen mit.'],
    loss: ['Längste Durststrecke', 'Matches in Folge verloren. Auch das ist ein Rekord.'],
  };
  Object.entries(streakRows).forEach(([k, rows]) => {
    const top = bestAll(rows, (v) => v.n);
    if (!top.value || top.value < 2) return;
    push({
      key: `streak-${k}`, label: streakLabels[k][0], group: 'team', info: streakLabels[k][1],
      value: top.value, display: `${top.value} Matches`,
      holders: top.items.map((v) => ({
        name: teamNameOf(teams, v.teamId) || v.teamId,
        teamId: v.teamId,
        when: whenOf(v.result),
      })),
    });
  });

  // --- Saisonbestwerte ----------------------------------------------------
  const seasonRows = [];
  seasonsFrom(teams).forEach((season) => {
    const sTeams = teamsOfSeason(teams, season);
    computeStandings(sTeams, resultsOfSeason(results, season))
      .filter((r) => r.played)
      .forEach((r) => seasonRows.push({ season, ...r }));
  });
  const seasonHolders = (items) => items.map((r) => ({
    name: r.team.name, teamId: r.team.id,
    when: { season: r.season, day: null, matchId: null },
  }));

  const topPoints = bestAll(seasonRows, (r) => r.points);
  if (topPoints.value != null) {
    push({
      key: 'seasonPoints', label: 'Meiste Punkte in einer Saison', group: 'team',
      info: 'Ein Punkt je gewonnenem Kampf.',
      value: topPoints.value, display: `${topPoints.value} Punkte`,
      holders: seasonHolders(topPoints.items),
    });
  }
  const topDiff = bestAll(seasonRows, (r) => r.diff);
  if (topDiff.value != null) {
    push({
      key: 'seasonDiff', label: 'Beste Kill-Differenz einer Saison', group: 'team',
      info: 'Eigene Kills minus eigene Deaths über eine komplette Saison.',
      value: topDiff.value, display: `${topDiff.value > 0 ? '+' : ''}${topDiff.value}`,
      holders: seasonHolders(topDiff.items),
    });
  }

  // --- Pokémon über alle Saisons -----------------------------------------
  const mons = allTimePokemon(teams, results, pokedex);
  const monRecord = (key, label, info, pick, display, minBattles = 0) => {
    const pool = mons.filter((s) => s.battles >= minBattles);
    const top = bestAll(pool, pick);
    if (!top.value) return;
    push({
      key, label, group: 'pokemon', info,
      value: top.value, display: display(top.items[0]),
      holders: top.items.map((t) => ({
        name: t.pokemon?.name, image: t.pokemon?.image || null,
        teamId: t.team?.id || null, teamName: t.team?.name || null,
        when: null,
      })),
    });
  };
  monRecord('totalKills', 'Meiste Kills insgesamt', 'Über alle Saisons hinweg.', (s) => s.kills, (s) => `${s.kills} Kills`);
  monRecord('totalDeaths', 'Meiste Deaths insgesamt', 'Auch das gehört zur Wahrheit.', (s) => s.deaths, (s) => `${s.deaths} Deaths`);
  monRecord('totalBattles', 'Meiste Kampfeinsätze', 'In wie vielen Kämpfen ein Pokémon im Feld stand.', (s) => s.battles, (s) => `${s.battles} Kämpfe`);
  monRecord('bestKd', 'Bestes K/D-Verhältnis', 'Mindestens zehn Kampfeinsätze.', (s) => s.kd, (s) => s.kd.toFixed(2), 10);
  monRecord('bestSurvival', 'Höchste Überlebensrate', 'Anteil der Kämpfe ohne eigenen Death. Mindestens zehn Einsätze.', (s) => s.survivalRate, (s) => `${Math.round(s.survivalRate * 100)} %`, 10);
  monRecord('bestWinPct', 'Höchste Kampf-Siegquote', 'Mindestens zehn Kampfeinsätze.', (s) => s.battleWinPct, (s) => `${Math.round(s.battleWinPct * 100)} %`, 10);

  // --- Marktwerte ---------------------------------------------------------
  const rows = eloRows || [];
  if (rows.length) {
    const topValue = bestAll(rows, (r) => marketValue(r.elo) || 0);
    if (topValue.value) {
      push({
        key: 'marketTop', label: 'Höchster Marktwert', group: 'markt',
        info: 'Aktueller Stand aus dem Draft-Sheet.',
        value: topValue.value, display: null, money: topValue.value,
        holders: topValue.items.map((r) => ({
          name: r.resolved, image: monMeta(pokedex, r.resolved)?.image || null, when: null,
        })),
      });
    }

    const steps = [];
    rows.forEach((r) => {
      const pts = historyPoints(r);
      for (let i = 1; i < pts.length; i++) {
        steps.push({ name: r.resolved, delta: (pts[i].value || 0) - (pts[i - 1].value || 0), to: pts[i] });
      }
    });
    const stepHolders = (items) => items.map((e) => ({
      name: e.name, image: monMeta(pokedex, e.name)?.image || null,
      when: { season: null, day: null, matchId: null, stop: e.to.label },
    }));

    const jump = bestAll(steps, (e) => e.delta);
    if (jump.value > 0) {
      push({
        key: 'marketJump', label: 'Größter Marktwertsprung', group: 'markt',
        info: 'Größter Zuwachs zwischen zwei Zeitpunkten des Draft-Sheets.',
        value: jump.value, display: null, money: jump.value, signed: true,
        holders: stepHolders(jump.items),
      });
    }
    const drop = bestAll(steps, (e) => -e.delta);
    if (drop.value > 0) {
      push({
        key: 'marketDrop', label: 'Größter Marktwertverlust', group: 'markt',
        info: 'Größter Rückgang zwischen zwei Zeitpunkten des Draft-Sheets.',
        value: drop.value, display: null, money: -drop.value, signed: true,
        holders: stepHolders(drop.items),
      });
    }

    // Teuerster Kader — je Franchise der jüngste Auftritt.
    const squads = (teams || []).map((t) => ({
      team: t,
      value: (t.pokemon || []).reduce((sum, p) => {
        const row = rows.find((x) => x.resolved === p.name);
        return sum + (row ? marketValue(row.elo) || 0 : 0);
      }, 0),
    }));
    const topSquad = bestAll(squads, (x) => x.value);
    if (topSquad.value) {
      push({
        key: 'marketSquad', label: 'Teuerster Kader', group: 'markt',
        info: 'Summe der Marktwerte aller zehn Kader-Pokémon.',
        value: topSquad.value, display: null, money: topSquad.value,
        holders: topSquad.items.map((x) => ({
          name: x.team.name, teamId: x.team.id,
          when: { season: seasonOfTeam(x.team), day: null, matchId: null },
        })),
      });
    }
  }

  // --- Auszeichnungen -----------------------------------------------------
  const board = awardLeaderboard(awardDocs, pokedex, teams);
  const topMon = bestAll(board.pokemon, (r) => r.n);
  if (topMon.value > 1) {
    push({
      key: 'awardsPokemon', label: 'Meiste Auszeichnungen (Pokémon)', group: 'liga',
      info: 'Gewonnene Awards über alle Saisons.',
      value: topMon.value, display: `${topMon.value} Awards`,
      holders: topMon.items.map((r) => ({ name: r.label, image: r.image || null, when: null })),
    });
  }
  const topTeam = bestAll(board.team, (r) => r.n);
  if (topTeam.value > 1) {
    push({
      key: 'awardsTeam', label: 'Meiste Auszeichnungen (Team)', group: 'liga',
      info: 'Gewonnene Awards über alle Saisons.',
      value: topTeam.value, display: `${topTeam.value} Awards`,
      holders: topTeam.items.map((r) => ({ name: r.label, teamId: r.id, when: null })),
    });
  }
  // Ehrungen und Rügen getrennt: ein Pokémon, das dreimal die Enttäuschung des
  // Spieltags war, hat keinen Ehrenrekord aufgestellt, sondern einen anderen.
  const topPositive = bestAll(board.pokemon.filter((r) => r.positive > 0), (r) => r.positive);
  if (topPositive.value > 1) {
    push({
      key: 'awardsPositive', label: 'Meiste Ehrungen (Pokémon)', group: 'liga',
      info: 'Nur Auszeichnungen mit positiver Bedeutung — MVP, Überraschung, Tier-Bester und Ähnliches.',
      value: topPositive.value, display: `${topPositive.value} Ehrungen`,
      holders: topPositive.items.map((r) => ({ name: r.label, image: r.image || null, when: null })),
    });
  }
  const topNegative = bestAll(board.pokemon.filter((r) => r.negative > 0), (r) => r.negative);
  if (topNegative.value > 1) {
    push({
      key: 'awardsNegative', label: 'Meiste Rügen (Pokémon)', group: 'liga',
      info: 'Nur Auszeichnungen mit negativer Bedeutung — die Enttäuschungen des Spieltags und der Saison.',
      value: topNegative.value, display: `${topNegative.value} Rügen`,
      holders: topNegative.items.map((r) => ({ name: r.label, image: r.image || null, when: null })),
    });
  }

  return out;
}

/**
 * Wer hat wie viele Awards gewonnen? Getrennt nach Pokémon, Teams und Matches,
 * jeweils mit der Liste der gewonnenen Auszeichnungen.
 * Der Sieger einer Abstimmung steht nicht im Dokument, sondern ergibt sich aus den
 * Stimmen (`awardWinner`) — deshalb wird hier ausgewertet statt gelesen.
 */
export function awardLeaderboard(awardDocs, pokedex = [], teams = []) {
  const buckets = { pokemon: {}, team: {}, match: {} };
  (awardDocs || []).forEach((docData) => {
    if (!docData || docData.status !== 'done') return;
    const winner = awardWinner(docData);
    if (!winner) return;
    const id = winner.id || winner.label;
    if (!id) return;
    const entity = buckets[docData.entity] ? docData.entity : 'pokemon';
    const def = AWARD_BY_KEY[docData.key];
    const row = buckets[entity][id] || (buckets[entity][id] = {
      id,
      label: winner.label || id,
      image: entity === 'pokemon'
        ? monMeta(pokedex, winner.label || id)?.image || winner.image || null
        : winner.image || null,
      teamId: entity === 'team' ? id : null,
      n: 0,
      positive: 0,
      negative: 0,
      awards: [],
    });
    const tone = awardTone(docData.key);
    row.n++;
    row[tone] += 1;
    row.awards.push({
      key: docData.key,
      label: def?.label || docData.key,
      tone,
      season: seasonOfId(docData.id),
      day: docData.day ?? null,
    });
  });
  const sort = (obj) => Object.values(obj).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  return { pokemon: sort(buckets.pokemon), team: sort(buckets.team), match: sort(buckets.match) };
}
