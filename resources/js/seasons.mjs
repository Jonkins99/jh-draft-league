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
import { awardWinner, AWARD_BY_KEY } from './awards.mjs';

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

/**
 * Bestmarken über alle Saisons. Jeder Eintrag:
 *   { key, label, info, value, display, holder:{ name, image, teamId, teamName }, when }
 * `when` trägt Saison und Spieltag — ein Kalenderdatum führt die Liga nicht.
 */
export function buildRecords({ teams = [], results = [], pokedex = [], eloRows = [], awardDocs = [] } = {}) {
  const out = [];
  const push = (rec) => { if (rec && rec.value != null && rec.holder) out.push(rec); };
  const best = (list, pick) => list.reduce((a, b) => (!a || pick(b) > pick(a) ? b : a), null);

  // --- Einzelne Kämpfe und Matches ---------------------------------------
  let bestBattleKills = null;
  let bestMatchKills = null;
  let perfectBattles = 0;
  let bestMatchDiff = null;
  let bestDayKills = null;
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
        if (!bestBattleKills || n > bestBattleKills.n) {
          bestBattleKills = { name, n, result: r, battle: bi + 1 };
        }
      });
      const side = seasonOfId(r.id);
      const key = `${side}|${dayOfResult(r)}`;
      dayKills[`${key}|${r.home}`] = (dayKills[`${key}|${r.home}`] || 0) + s.homeKills;
      dayKills[`${key}|${r.away}`] = (dayKills[`${key}|${r.away}`] || 0) + s.awayKills;
    });
    Object.entries(matchKills).forEach(([name, n]) => {
      if (!bestMatchKills || n > bestMatchKills.n) bestMatchKills = { name, n, result: r };
    });
    const done = (r.battles || []).filter((b) => b?.done);
    if (done.length) {
      const sum = done.reduce((acc, b) => {
        const s = battleStats(b);
        return { hk: acc.hk + s.homeKills, ak: acc.ak + s.awayKills, hp: acc.hp + s.homePoints, ap: acc.ap + s.awayPoints };
      }, { hk: 0, ak: 0, hp: 0, ap: 0 });
      const diff = Math.abs(sum.hk - sum.ak);
      const winner = sum.hp === sum.ap ? null : sum.hp > sum.ap ? 'home' : 'away';
      if (winner && (!bestMatchDiff || diff > bestMatchDiff.diff)) {
        bestMatchDiff = { diff, result: r, winner, score: `${winner === 'home' ? sum.hp : sum.ap}:${winner === 'home' ? sum.ap : sum.hp}` };
      }
    }
  });

  Object.entries(dayKills).forEach(([key, n]) => {
    const [season, day, teamId] = key.split('|');
    if (!bestDayKills || n > bestDayKills.n) bestDayKills = { n, season: Number(season), day: Number(day), teamId };
  });

  if (bestBattleKills) {
    const mon = monMeta(pokedex, bestBattleKills.name);
    const side = sideOfMon(bestBattleKills.result, bestBattleKills.name);
    push({
      key: 'battleKills', label: 'Meiste Kills in einem Kampf', group: 'pokemon',
      info: 'Kills eines einzelnen Pokémon in einem einzigen Kampf. Self-Kills zählen nicht.',
      value: bestBattleKills.n, display: `${bestBattleKills.n} Kills`,
      holder: {
        name: bestBattleKills.name, image: mon?.image || null,
        teamId: side ? bestBattleKills.result[side] : null,
        teamName: side ? teamNameOf(teams, bestBattleKills.result[side]) : null,
      },
      when: { ...whenOf(bestBattleKills.result), battle: bestBattleKills.battle },
    });
  }

  if (bestMatchKills) {
    const mon = monMeta(pokedex, bestMatchKills.name);
    const side = sideOfMon(bestMatchKills.result, bestMatchKills.name);
    push({
      key: 'matchKills', label: 'Meiste Kills in einem Match', group: 'pokemon',
      info: 'Kills eines Pokémon über die drei Kämpfe eines Matches hinweg.',
      value: bestMatchKills.n, display: `${bestMatchKills.n} Kills`,
      holder: {
        name: bestMatchKills.name, image: mon?.image || null,
        teamId: side ? bestMatchKills.result[side] : null,
        teamName: side ? teamNameOf(teams, bestMatchKills.result[side]) : null,
      },
      when: whenOf(bestMatchKills.result),
    });
  }

  if (bestMatchDiff) {
    const teamId = bestMatchDiff.result[bestMatchDiff.winner];
    const other = bestMatchDiff.result[bestMatchDiff.winner === 'home' ? 'away' : 'home'];
    push({
      key: 'matchDiff', label: 'Höchster Sieg', group: 'team',
      info: 'Größte Kill-Differenz eines gewonnenen Matches.',
      value: bestMatchDiff.diff, display: `+${bestMatchDiff.diff} Kills · ${bestMatchDiff.score}`,
      holder: { name: teamNameOf(teams, teamId) || teamId, teamId, teamName: `gegen ${teamNameOf(teams, other) || other}` },
      when: whenOf(bestMatchDiff.result),
    });
  }

  if (bestDayKills) {
    push({
      key: 'dayKills', label: 'Meiste Kills an einem Spieltag', group: 'team',
      info: 'Kills eines Teams in seinem Match an einem Spieltag.',
      value: bestDayKills.n, display: `${bestDayKills.n} Kills`,
      holder: { name: teamNameOf(teams, bestDayKills.teamId) || bestDayKills.teamId, teamId: bestDayKills.teamId },
      when: { season: bestDayKills.season, day: bestDayKills.day, matchId: null },
    });
  }

  if (perfectBattles) {
    push({
      key: 'perfectBattles', label: 'Makellose Kämpfe', group: 'liga',
      info: 'Kämpfe, in denen eine Seite alle vier Pokémon im Feld behalten hat.',
      value: perfectBattles, display: `${perfectBattles}×`,
      holder: { name: 'Die Liga' },
      when: null,
    });
  }

  // --- Serien je Franchise ------------------------------------------------
  const order = [...(results || [])]
    .filter((r) => (r.battles || []).some((b) => b?.done))
    .sort((a, b) => seasonOfId(a.id) - seasonOfId(b.id) || (dayOfResult(a) || 0) - (dayOfResult(b) || 0));
  const streak = {};
  const bestStreak = { win: null, unbeaten: null, loss: null };
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
        if (!bestStreak[k] || n > bestStreak[k].n) bestStreak[k] = { n, teamId: r[side], result: r };
      });
    });
  });

  const streakLabels = {
    win: ['Längste Siegesserie', 'Matches in Folge gewonnen.'],
    unbeaten: ['Längste Serie ohne Niederlage', 'Matches in Folge ohne Niederlage — Unentschieden zählen mit.'],
    loss: ['Längste Durststrecke', 'Matches in Folge verloren. Auch das ist ein Rekord.'],
  };
  Object.entries(bestStreak).forEach(([k, v]) => {
    if (!v || v.n < 2) return;
    push({
      key: `streak-${k}`, label: streakLabels[k][0], group: 'team', info: streakLabels[k][1],
      value: v.n, display: `${v.n} Matches`,
      holder: { name: teamNameOf(teams, v.teamId) || v.teamId, teamId: v.teamId },
      when: whenOf(v.result),
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
  const topPoints = best(seasonRows, (r) => r.points);

  if (topPoints) {
    push({
      key: 'seasonPoints', label: 'Meiste Punkte in einer Saison', group: 'team',
      info: 'Ein Punkt je gewonnenem Kampf.',
      value: topPoints.points, display: `${topPoints.points} Punkte`,
      holder: { name: topPoints.team.name, teamId: topPoints.team.id },
      when: { season: topPoints.season, day: null, matchId: null },
    });
  }
  const topDiff = best(seasonRows, (r) => r.diff);
  if (topDiff) {
    push({
      key: 'seasonDiff', label: 'Beste Kill-Differenz einer Saison', group: 'team',
      info: 'Eigene Kills minus eigene Deaths über eine komplette Saison.',
      value: topDiff.diff, display: `${topDiff.diff > 0 ? '+' : ''}${topDiff.diff}`,
      holder: { name: topDiff.team.name, teamId: topDiff.team.id },
      when: { season: topDiff.season, day: null, matchId: null },
    });
  }

  // --- Pokémon über alle Saisons -----------------------------------------
  const mons = allTimePokemon(teams, results, pokedex);
  const monRecord = (key, label, info, pick, display, minBattles = 0) => {
    const pool = mons.filter((s) => s.battles >= minBattles);
    const top = best(pool, pick);
    if (!top || !pick(top)) return;
    push({
      key, label, group: 'pokemon', info,
      value: pick(top), display: display(top),
      holder: {
        name: top.pokemon?.name, image: top.pokemon?.image || null,
        teamId: top.team?.id || null, teamName: top.team?.name || null,
      },
      when: null,
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
    const topValue = best(rows, (r) => marketValue(r.elo) || 0);
    if (topValue) {
      const mon = monMeta(pokedex, topValue.resolved);
      push({
        key: 'marketTop', label: 'Höchster Marktwert', group: 'markt',
        info: 'Aktueller Stand aus dem Draft-Sheet.',
        value: marketValue(topValue.elo), display: null, money: marketValue(topValue.elo),
        holder: { name: topValue.resolved, image: mon?.image || null },
        when: null,
      });
    }
    let jump = null;
    let drop = null;
    rows.forEach((r) => {
      const pts = historyPoints(r);
      for (let i = 1; i < pts.length; i++) {
        const delta = (pts[i].value || 0) - (pts[i - 1].value || 0);
        const entry = { name: r.resolved, delta, from: pts[i - 1], to: pts[i] };
        if (!jump || delta > jump.delta) jump = entry;
        if (!drop || delta < drop.delta) drop = entry;
      }
    });
    if (jump && jump.delta > 0) {
      const mon = monMeta(pokedex, jump.name);
      push({
        key: 'marketJump', label: 'Größter Marktwertsprung', group: 'markt',
        info: 'Größter Zuwachs zwischen zwei Zeitpunkten des Draft-Sheets.',
        value: jump.delta, display: null, money: jump.delta, signed: true,
        holder: { name: jump.name, image: mon?.image || null },
        when: { season: null, day: null, matchId: null, stop: jump.to.label },
      });
    }
    if (drop && drop.delta < 0) {
      const mon = monMeta(pokedex, drop.name);
      push({
        key: 'marketDrop', label: 'Größter Marktwertverlust', group: 'markt',
        info: 'Größter Rückgang zwischen zwei Zeitpunkten des Draft-Sheets.',
        value: Math.abs(drop.delta), display: null, money: drop.delta, signed: true,
        holder: { name: drop.name, image: mon?.image || null },
        when: { season: null, day: null, matchId: null, stop: drop.to.label },
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
    const topSquad = best(squads, (s) => s.value);
    if (topSquad?.value) {
      push({
        key: 'marketSquad', label: 'Teuerster Kader', group: 'markt',
        info: 'Summe der Marktwerte aller zehn Kader-Pokémon.',
        value: topSquad.value, display: null, money: topSquad.value,
        holder: { name: topSquad.team.name, teamId: topSquad.team.id },
        when: { season: seasonOfTeam(topSquad.team), day: null, matchId: null },
      });
    }
  }

  // --- Auszeichnungen -----------------------------------------------------
  const board = awardLeaderboard(awardDocs, pokedex, teams);
  const topMon = board.pokemon[0];
  if (topMon && topMon.n > 1) {
    push({
      key: 'awardsPokemon', label: 'Meiste Auszeichnungen (Pokémon)', group: 'liga',
      info: 'Gewonnene Awards über alle Saisons.',
      value: topMon.n, display: `${topMon.n} Awards`,
      holder: { name: topMon.label, image: topMon.image || null },
      when: null,
    });
  }
  const topTeam = board.team[0];
  if (topTeam && topTeam.n > 1) {
    push({
      key: 'awardsTeam', label: 'Meiste Auszeichnungen (Team)', group: 'liga',
      info: 'Gewonnene Awards über alle Saisons.',
      value: topTeam.n, display: `${topTeam.n} Awards`,
      holder: { name: topTeam.label, teamId: topTeam.id },
      when: null,
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
      awards: [],
    });
    row.n++;
    row.awards.push({
      key: docData.key,
      label: def?.label || docData.key,
      season: seasonOfId(docData.id),
      day: docData.day ?? null,
    });
  });
  const sort = (obj) => Object.values(obj).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  return { pokemon: sort(buckets.pokemon), team: sort(buckets.team), match: sort(buckets.match) };
}
