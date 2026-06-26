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

// === Pokémon Champions: Initiative-Statuswert (Speed) =======================
// In Champions kämpfen alle Pokémon auf Level 50 mit fixen IVs (31). EVs sind
// durch SP (Stat Points) ersetzt: 1 SP = +1 Punkt, max. 32 SP pro Statuswert.
// Nicht-HP-Formel:  floor( (floor((2*Base+31)/2) + 5 + SP) * Wesen )
// mit Wesen = 1,1 (positiv) / 1,0 (neutral). Gegen die Serebii-Champions-Daten
// verifiziert (z. B. Mega-Simsala Base 150 -> 32 SP + positives Wesen = 222).

// Initiative für gegebene SP und Wesen.
export function speedAt(base, sp = 0, natureUp = false) {
  const core = Math.floor((2 * base + 31) / 2) + 5 + sp;
  return Math.floor(core * (natureUp ? 1.1 : 1));
}

// Die drei Investment-Fälle (ohne In-Battle-Modifikator):
//  s0   = 0 SP, neutrales Wesen
//  s32  = 32 SP, neutrales Wesen
//  s32n = 32 SP, positives Initiative-Wesen
export function speedTiers(base) {
  return {
    s0: speedAt(base, 0, false),
    s32: speedAt(base, 32, false),
    s32n: speedAt(base, 32, true),
  };
}

// In-Battle-Multiplikator (Initiative-Boost/Wahlschal = x1,5,
// Rückenwind/Wassertempo = x2). In den Spielen wird abgerundet.
export function applySpeedMod(value, mult) {
  return Math.floor(value * mult);
}

// === Typ-Effektivität (Gen 6+, inkl. Fee) ===================================
export const ALL_TYPES = [
  'Normal', 'Feuer', 'Wasser', 'Elektro', 'Pflanze', 'Eis', 'Kampf', 'Gift',
  'Boden', 'Flug', 'Psycho', 'Käfer', 'Gestein', 'Geist', 'Drache', 'Unlicht',
  'Stahl', 'Fee',
];

// Angriffstyp -> { Verteidigungstyp: Multiplikator != 1 }
export const TYPE_CHART = {
  Normal: { Gestein: 0.5, Stahl: 0.5, Geist: 0 },
  Feuer: { Feuer: 0.5, Wasser: 0.5, Pflanze: 2, Eis: 2, 'Käfer': 2, Gestein: 0.5, Drache: 0.5, Stahl: 2 },
  Wasser: { Feuer: 2, Wasser: 0.5, Pflanze: 0.5, Boden: 2, Gestein: 2, Drache: 0.5 },
  Elektro: { Wasser: 2, Elektro: 0.5, Pflanze: 0.5, Boden: 0, Flug: 2, Drache: 0.5 },
  Pflanze: { Feuer: 0.5, Wasser: 2, Pflanze: 0.5, Gift: 0.5, Boden: 2, Flug: 0.5, 'Käfer': 0.5, Gestein: 2, Drache: 0.5, Stahl: 0.5 },
  Eis: { Feuer: 0.5, Wasser: 0.5, Pflanze: 2, Eis: 0.5, Boden: 2, Flug: 2, Drache: 2, Stahl: 0.5 },
  Kampf: { Normal: 2, Eis: 2, Gift: 0.5, Flug: 0.5, Psycho: 0.5, 'Käfer': 0.5, Gestein: 2, Geist: 0, Unlicht: 2, Stahl: 2, Fee: 0.5 },
  Gift: { Pflanze: 2, Gift: 0.5, Boden: 0.5, Gestein: 0.5, Geist: 0.5, Stahl: 0, Fee: 2 },
  Boden: { Feuer: 2, Elektro: 2, Pflanze: 0.5, Gift: 2, Flug: 0, 'Käfer': 0.5, Gestein: 2, Stahl: 2 },
  Flug: { Elektro: 0.5, Pflanze: 2, Kampf: 2, 'Käfer': 2, Gestein: 0.5, Stahl: 0.5 },
  Psycho: { Kampf: 2, Gift: 2, Psycho: 0.5, Unlicht: 0, Stahl: 0.5 },
  'Käfer': { Feuer: 0.5, Pflanze: 2, Kampf: 0.5, Gift: 0.5, Flug: 0.5, Psycho: 2, Geist: 0.5, Unlicht: 2, Stahl: 0.5, Fee: 0.5 },
  Gestein: { Feuer: 2, Eis: 2, Kampf: 0.5, Boden: 0.5, Flug: 2, 'Käfer': 2, Stahl: 0.5 },
  Geist: { Normal: 0, Psycho: 2, Geist: 2, Unlicht: 0.5 },
  Drache: { Drache: 2, Stahl: 0.5, Fee: 0 },
  Unlicht: { Kampf: 0.5, Psycho: 2, Geist: 2, Unlicht: 0.5, Fee: 0.5 },
  Stahl: { Feuer: 0.5, Wasser: 0.5, Elektro: 0.5, Eis: 2, Gestein: 2, Stahl: 0.5, Fee: 2 },
  Fee: { Feuer: 0.5, Kampf: 2, Gift: 0.5, Drache: 2, Unlicht: 2, Stahl: 0.5 },
};

// Schadensmultiplikator eines Angriffstyps gegen ein (Doppel-)Typ-Pokémon.
export function typeMultiplier(attackType, defenderTypes) {
  const row = TYPE_CHART[attackType] || {};
  return (defenderTypes || []).reduce((m, t) => m * (row[t] ?? 1), 1);
}
