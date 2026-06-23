// Reine, framework-freie Liga-Logik (node-testbar, kein Firebase/Alpine-Import).
// Regeln siehe Memory league-match-rules.

export const POKEMON_PER_BATTLE = 4;

// Aus dem Endstand eines Kampfes (Überlebende je Seite, Verlierer i.d.R. 0)
// Punkte und Kill/Death-Werte ableiten.
// Kills einer Seite = besiegte gegnerische Pokémon = 4 − Überlebende des Gegners.
export function battleStats(score) {
  const home = Math.max(0, Math.min(POKEMON_PER_BATTLE, score?.home ?? 0));
  const away = Math.max(0, Math.min(POKEMON_PER_BATTLE, score?.away ?? 0));

  const homeDeaths = POKEMON_PER_BATTLE - home;
  const awayDeaths = POKEMON_PER_BATTLE - away;
  const homeKills = awayDeaths;
  const awayKills = homeDeaths;

  let winner = 'draw';
  let homePoints = 0;
  let awayPoints = 0;
  if (home > away) { winner = 'home'; homePoints = 1; }
  else if (away > home) { winner = 'away'; awayPoints = 1; }

  return { winner, homePoints, awayPoints, homeKills, homeDeaths, awayKills, awayDeaths };
}

// Tabelle aus allen Match-Ergebnissen berechnen.
// teams: [{id, name, player, logo}], results: [{home, away, battles:[{done, score}]}]
// Punkte = gewonnene Kämpfe; 2. Sortierung = Kill-Differenz (kills − deaths).
export function computeStandings(teams, results) {
  const stats = {};
  teams.forEach((t) => {
    stats[t.id] = { team: t, played: new Set(), won: 0, draw: 0, lost: 0, kills: 0, deaths: 0, points: 0 };
  });

  (results || []).forEach((r) => {
    if (!r || !stats[r.home] || !stats[r.away]) return;
    const H = stats[r.home];
    const A = stats[r.away];
    (r.battles || []).forEach((b) => {
      if (!b || !b.done || !b.score) return;
      const s = battleStats(b.score);
      H.points += s.homePoints;
      A.points += s.awayPoints;
      H.kills += s.homeKills;
      H.deaths += s.homeDeaths;
      A.kills += s.awayKills;
      A.deaths += s.awayDeaths;
      if (s.winner === 'home') { H.won++; A.lost++; }
      else if (s.winner === 'away') { A.won++; H.lost++; }
      else { H.draw++; A.draw++; }
      H.played.add(r.id);
      A.played.add(r.id);
    });
  });

  return Object.values(stats)
    .map((x) => ({ ...x, played: x.played.size, diff: x.kills - x.deaths }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.diff - a.diff ||
        b.kills - a.kills ||
        a.team.name.localeCompare(b.team.name),
    );
}

// Pro-Pokémon-Statistik über alle Match-Ergebnisse.
// teams: [{id, name, player, logo, pokemon:[{name,...}]}] — ein Team für die Team-
// Ansicht, alle Teams für die liga-weite Ansicht (Pokémon-Namen sind global eindeutig).
// - kills:   wie oft dieses Pokémon ein GEGNERISCHES Pokémon besiegt hat.
//            Self-Kills (Verursacher tötet eigenes Teammitglied) zählen NICHT.
// - deaths:  wie oft dieses Pokémon besiegt wurde — auch durch einen Partner (Self-Kill)
//            oder ohne Verursacher zählt als Death.
// - matchups: in wie vielen Matches es im 6er-Aufgebot stand.
// - battles:  in wie vielen (gespielten) Kämpfen es im 4er-Einsatz stand.
export function pokemonStats(teams, results) {
  const stats = {};
  (teams || []).forEach((t) => {
    (t.pokemon || []).forEach((p) => {
      stats[p.name] = { pokemon: p, team: t, kills: 0, deaths: 0, matchups: 0, battles: 0 };
    });
  });

  (results || []).forEach((r) => {
    if (!r) return;
    ['home', 'away'].forEach((side) => {
      (r.squads?.[side] || []).forEach((name) => {
        if (stats[name]) stats[name].matchups += 1;
      });
      (r.battles || []).forEach((b) => {
        if (!b || !b.done) return;
        (b.used?.[side] || []).forEach((name) => {
          if (stats[name]) stats[name].battles += 1;
        });
        (b.kills || []).forEach((k) => {
          // Death: Opfer auf dieser Seite (egal wer es besiegt hat).
          if (k.victimSide === side && stats[k.victim]) stats[k.victim].deaths += 1;
          // Kill: Verursacher auf dieser Seite und KEIN Self-Kill.
          if (k.killerSide === side && k.killerSide !== k.victimSide && stats[k.killer]) {
            stats[k.killer].kills += 1;
          }
        });
      });
    });
  });

  return Object.values(stats);
}

// Platzierungsverlauf: für jeden gespielten Spieltag die kumulative Tabelle berechnen
// und die Position jedes Teams festhalten.
// Rückgabe: { days:[d,...], series:{ teamId: [{day, place}], ... } }
export function placementHistory(teams, results) {
  const playedDays = [
    ...new Set(
      (results || [])
        .filter((r) => (r.battles || []).some((b) => b && b.done))
        .map((r) => r.day)
        .filter((d) => d != null),
    ),
  ].sort((a, b) => a - b);

  const series = {};
  (teams || []).forEach((t) => (series[t.id] = []));

  playedDays.forEach((day) => {
    const upto = (results || []).filter((r) => r.day != null && r.day <= day);
    computeStandings(teams, upto).forEach((row, i) => {
      if (series[row.team.id]) series[row.team.id].push({ day, place: i + 1 });
    });
  });

  return { days: playedDays, series };
}
