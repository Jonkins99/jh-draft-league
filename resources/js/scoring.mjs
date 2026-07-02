// Reine, framework-freie Liga-Logik (node-testbar, kein Firebase/Alpine-Import).
// Regeln siehe Memory league-match-rules.

export const POKEMON_PER_BATTLE = 4;

// Kennzahlen eines Kampfes. Sieger, Ergebnis (Überlebende) und Kill-Log sind entkoppelt:
//  - winner ist EXPLIZIT gesetzt ('home'|'away'|'draw') und bestimmt die Punkte. Fehlt er
//    (Alt-Daten), wird er aus den Überlebenden abgeleitet (mehr Überlebende gewinnt).
//  - homeSurvivors/awaySurvivors sind das frei eingetragene Ergebnis (0–4 je Seite).
//  - Kills/Deaths stammen AUSSCHLIESSLICH aus dem Kill-Log (b.kills). Ein als „überlebt"
//    gewertetes Pokémon erhält keinen Death, dem Gegner wird kein Kill angerechnet —
//    unabhängig davon, was das Ergebnis suggeriert (z. B. Sieg durch Regelverstoß).
export function battleStats(b) {
  const score = b?.score || {};
  const homeSurvivors = Math.max(0, Math.min(POKEMON_PER_BATTLE, score.home ?? 0));
  const awaySurvivors = Math.max(0, Math.min(POKEMON_PER_BATTLE, score.away ?? 0));

  let homeKills = 0, awayKills = 0, homeDeaths = 0, awayDeaths = 0;
  (b?.kills || []).forEach((k) => {
    if (!k) return;
    if (k.victimSide === 'home') homeDeaths += 1;
    if (k.victimSide === 'away') awayDeaths += 1;
    if (k.killerSide === 'home' && k.killerSide !== k.victimSide) homeKills += 1;
    if (k.killerSide === 'away' && k.killerSide !== k.victimSide) awayKills += 1;
  });

  let winner = b?.winner;
  if (winner !== 'home' && winner !== 'away' && winner !== 'draw') {
    winner = homeSurvivors > awaySurvivors ? 'home' : awaySurvivors > homeSurvivors ? 'away' : 'draw';
  }
  const homePoints = winner === 'home' ? 1 : 0;
  const awayPoints = winner === 'away' ? 1 : 0;

  return {
    winner, homePoints, awayPoints,
    homeKills, homeDeaths, awayKills, awayDeaths,
    homeSurvivors, awaySurvivors,
  };
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
      if (!b || !b.done) return;
      const s = battleStats(b);
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
// Abgeleitete (sortierbare) Kennzahlen an ein Roh-Stat-Objekt anhängen.
function withDerivedStats(st) {
  const battles = st.battles;
  const battleDecided = st.battleWins + st.battleDraws + st.battleLosses;
  const matchesDecided = st.matchWins + st.matchDraws + st.matchLosses;
  return {
    ...st,
    kd: st.kills / Math.max(1, st.deaths),
    killsPerBattle: st.kills / Math.max(1, battles),
    deathsPerBattle: st.deaths / Math.max(1, battles),
    kpfPerMu: battles / Math.max(1, st.matchups),
    survivalRate: Math.max(0, Math.min(1, (battles - st.deaths) / Math.max(1, battles))),
    battleWinPct: battleDecided ? st.battleWins / battleDecided : 0,
    matchWinPct: matchesDecided ? st.matchWins / matchesDecided : 0,
    base_speed: Number.isFinite(st.pokemon?.base_speed) ? st.pokemon.base_speed : 0,
    cost: Number.isFinite(st.pokemon?.cost) ? st.pokemon.cost : 0,
  };
}

// Attribution ist result-getrieben: ein Beitrag zählt für die Seite (home/away), die das
// Pokémon in DIESEM Ergebnis aufgestellt hat — nicht für den aktuellen Roster-Besitzer.
// Dadurch bleiben Leistungen nach einem Team-Wechsel korrekt beim damaligen Team.
//   pokedex — Stammdaten [{name, image, types, tier, ...}] zum Auflösen von Meta für
//             Pokémon, die (nach Abgabe) in keinem Roster mehr stehen.
//   opts.scopeTeamId — nur Ergebnisse dieses Teams und nur dessen Seite zählen (Team-Detail);
//                      Universum = aktuelles Roster des Teams.
export function pokemonStats(teams, results, pokedex = [], opts = {}) {
  const scopeTeamId = opts.scopeTeamId ?? null;
  const byName = {};
  (pokedex || []).forEach((p) => { if (p?.name) byName[p.name] = p; });

  const stats = {};
  const ownerByName = {};
  const mkStat = (name, pokemon, team) => {
    if (stats[name]) return stats[name];
    stats[name] = {
      pokemon: pokemon || byName[name] || { name }, team: team || null,
      kills: 0, deaths: 0, matchups: 0, battles: 0,
      battleWins: 0, battleDraws: 0, battleLosses: 0,
      matchWins: 0, matchDraws: 0, matchLosses: 0,
    };
    return stats[name];
  };

  (teams || []).forEach((t) => {
    (t.pokemon || []).forEach((p) => {
      ownerByName[p.name] = t;
      mkStat(p.name, p, t);
    });
  });

  // Ohne Team-Scope: auch abgegebene/ungerosterte Pokémon aufnehmen, die in Ergebnissen
  // vorkommen (Career-Sicht für das Liga-Ranking). team bleibt dann null ("frei").
  if (!scopeTeamId) {
    (results || []).forEach((r) => {
      if (!r) return;
      ['home', 'away'].forEach((side) => {
        (r.squads?.[side] || []).forEach((name) => {
          if (name && !stats[name]) mkStat(name, byName[name], ownerByName[name] || null);
        });
      });
    });
  }

  (results || []).forEach((r) => {
    if (!r) return;

    // Match-Ausgang aus den gewonnenen Kämpfen (done-battles) je Seite bestimmen.
    let hoWins = 0, awWins = 0, anyDone = false;
    (r.battles || []).forEach((b) => {
      if (!b || !b.done) return;
      anyDone = true;
      const s = battleStats(b);
      if (s.winner === 'home') hoWins += 1;
      else if (s.winner === 'away') awWins += 1;
    });
    const matchWinner = !anyDone ? null : hoWins > awWins ? 'home' : awWins > hoWins ? 'away' : 'draw';

    // Bei Team-Scope nur die Seite des gescopten Teams verarbeiten (und nur dessen Matches).
    let sides = ['home', 'away'];
    if (scopeTeamId) {
      const own = r.home === scopeTeamId ? 'home' : r.away === scopeTeamId ? 'away' : null;
      if (!own) return;
      sides = [own];
    }
    sides.forEach((side) => {
      (r.squads?.[side] || []).forEach((name) => {
        const st = stats[name];
        if (!st) return;
        st.matchups += 1;
        if (matchWinner) {
          if (matchWinner === 'draw') st.matchDraws += 1;
          else if (matchWinner === side) st.matchWins += 1;
          else st.matchLosses += 1;
        }
      });
      (r.battles || []).forEach((b) => {
        if (!b || !b.done) return;
        const s = battleStats(b);
        (b.used?.[side] || []).forEach((name) => {
          const st = stats[name];
          if (!st) return;
          st.battles += 1;
          if (s.winner === 'draw') st.battleDraws += 1;
          else if (s.winner === side) st.battleWins += 1;
          else st.battleLosses += 1;
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

  return Object.values(stats).map(withDerivedStats);
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

// Defensive Typ-Tabelle: wie stark jeder Angriffstyp dieses (Doppel-)Typ-Pokémon trifft.
// -> [{ type, mult }] für jeden ALL_TYPES.
export function defensiveChart(types) {
  return ALL_TYPES.map((type) => ({ type, mult: typeMultiplier(type, types || []) }));
}

// Offensive Coverage: für jeden Verteidigungstyp der beste (max.) Multiplikator,
// den irgendeiner der eigenen Angriffstypen gegen diesen Typ erzielt.
// -> [{ type, mult }] für jeden ALL_TYPES.
export function offensiveChart(types) {
  const atkTypes = types || [];
  return ALL_TYPES.map((def) => {
    const mult = atkTypes.reduce(
      (best, atk) => Math.max(best, typeMultiplier(atk, [def])),
      0,
    );
    return { type: def, mult: atkTypes.length ? mult : 1 };
  });
}

// === Detail-Profil eines einzelnen Pokémon ==================================
// Aggregiert über die gesamte results-Collection alle Kennzahlen für die
// Pokémon-Detailansicht. Reine Funktion, kein Framework.
//   name    — global eindeutiger Pokémon-Name
//   teams   — alle Saison-Teams [{id,name,player,logo,pokemon:[{name,...}]}]
//   results — results-Collection [{home,away,day,squads:{home,away},
//             battles:[{done,used:{home,away},score:{home,away},
//             kills:[{victimSide,victim,killerSide,killer}]}]}]
// Zähl-Definitionen siehe Spec E1:
//  - Nur Kämpfe mit b.done === true zählen.
//  - kills:  k.killer === name && k.killerSide !== k.victimSide (kein Self-Kill).
//  - deaths: k.victim === name (inkl. Self-Kill und ohne Verursacher).
export function pokemonProfile(name, teams, results, pokedex = []) {
  // Team des Pokémon und dessen Gegner-Name je result ermitteln.
  const currentTeam = (teams || []).find((t) => (t?.pokemon || []).some((p) => p?.name === name)) || null;
  const teamById = {};
  (teams || []).forEach((t) => { if (t?.id != null) teamById[t.id] = t; });
  const teamName = (id) => teamById[id]?.name || null;

  // Zähl-Helfer für [{name,count}]-Listen (desc sortiert).
  const tally = () => Object.create(null);
  const toList = (obj) =>
    Object.entries(obj)
      .map(([n, count]) => ({ name: n, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const empty = {
    drafted: false,
    team: null,
    teamMatchesPlayed: 0,
    matchups: 0,
    matchupPct: 0,
    teamBattlesTotal: 0,
    battles: 0,
    battlesAvailable: 0,
    battlePctTotal: 0,
    battlePctAvailable: 0,
    benched: 0,
    kills: 0,
    deaths: 0,
    kd: 0,
    killsPerBattle: 0,
    survivalRate: 0,
    battleRecord: { w: 0, l: 0, d: 0, total: 0, winPct: 0 },
    history: [],
    partnersByBattle: [],
    opponentsByBattle: [],
    partnersByMatchup: [],
    opponentsByMatchup: [],
    topVictims: [],
    topNemeses: [],
    matchRecordWith: { w: 0, l: 0, d: 0, total: 0, winPct: 0 },
    matchRecordWithout: { w: 0, l: 0, d: 0, total: 0, winPct: 0 },
    timeline: [],
  };

  // Career: alle Ergebnisse, in denen das Pokémon in einem Aufgebot stand — plus die Matches
  // des aktuellen Teams (für Bank-/Ohne-Bilanz). So bleibt die Historie nach einem Team-Wechsel
  // erhalten (kills/deaths/history spannen über alle Teams), während team-relative Kennzahlen
  // (matchupPct, Ohne-Bilanz) sich auf das aktuelle Team beziehen.
  const appears = (r) => (r?.squads?.home || []).includes(name) || (r?.squads?.away || []).includes(name);
  const merged = (results || []).filter(
    (r) => r && (appears(r) || (currentTeam && (r.home === currentTeam.id || r.away === currentTeam.id))),
  );
  if (!currentTeam && merged.length === 0) return empty;

  // Anzeige-Team: aktueller Besitzer, sonst das Team der jüngsten Aufstellung.
  let team = currentTeam;
  if (!team) {
    const sorted = [...merged].sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
    const last = sorted[sorted.length - 1];
    if (last) {
      const side = (last.squads?.home || []).includes(name) ? 'home' : 'away';
      team = teamById[side === 'home' ? last.home : last.away] || null;
    }
  }

  let teamMatchesPlayed = 0;
  let matchups = 0;
  let teamBattlesTotal = 0;
  let battles = 0;
  let battlesAvailable = 0;
  let kills = 0;
  let deaths = 0;

  const history = [];
  const partnersByBattle = tally();
  const opponentsByBattle = tally();
  const partnersByMatchup = tally();
  const opponentsByMatchup = tally();
  const topVictims = tally();
  const topNemeses = tally();

  const recWith = { w: 0, l: 0, d: 0, total: 0, winPct: 0 };
  const recWithout = { w: 0, l: 0, d: 0, total: 0, winPct: 0 };
  // Kampf-Bilanz über die tatsächlich eingesetzten Kämpfe dieses Pokémon.
  const battleRecord = { w: 0, l: 0, d: 0, total: 0, winPct: 0 };

  const timeline = [];

  // Zusammengeführte Ergebnisse chronologisch (day asc) sortieren.
  const myResults = merged.slice().sort((a, b) => (a.day ?? 0) - (b.day ?? 0));

  myResults.forEach((r) => {
    // Eigene Seite je Ergebnis über die Aufgebots-Zugehörigkeit bestimmen (Team-Wechsel-fest);
    // Bank-Matches des aktuellen Teams fallen auf dessen Seite zurück.
    const ownSide = (r.squads?.home || []).includes(name) ? 'home'
      : (r.squads?.away || []).includes(name) ? 'away'
      : (r.home === currentTeam?.id ? 'home' : 'away');
    const oppSide = ownSide === 'home' ? 'away' : 'home';
    const oppTeamName = teamName(ownSide === 'home' ? r.away : r.home);

    const doneBattles = (r.battles || []).filter((b) => b && b.done === true);
    if (doneBattles.length === 0) return; // Match gilt nur mit >=1 done-battle als gespielt.

    teamMatchesPlayed += 1;
    teamBattlesTotal += doneBattles.length;

    const inSquad = (r.squads?.[ownSide] || []).includes(name);
    if (inSquad) {
      matchups += 1;
      // Partner/Gegner auf Matchup-Ebene (6er-squad).
      (r.squads?.[ownSide] || []).forEach((n) => {
        if (n && n !== name) partnersByMatchup[n] = (partnersByMatchup[n] || 0) + 1;
      });
      (r.squads?.[oppSide] || []).forEach((n) => {
        if (n) opponentsByMatchup[n] = (opponentsByMatchup[n] || 0) + 1;
      });
    }

    // Match-Ausgang aus Team-Sicht: gewonnene Kämpfe vergleichen.
    let ownPts = 0;
    let oppPts = 0;
    let monBattlesThisMatch = 0;
    let monKillsThisMatch = 0;
    let monDeathsThisMatch = 0;

    doneBattles.forEach((b, idx) => {
      const battleNo = (r.battles || []).indexOf(b);
      const s = battleStats(b);
      ownPts += ownSide === 'home' ? s.homePoints : s.awayPoints;
      oppPts += ownSide === 'home' ? s.awayPoints : s.homePoints;

      const usedOwn = b.used?.[ownSide] || [];
      const usedOpp = b.used?.[oppSide] || [];
      const inBattle = usedOwn.includes(name);

      // battlesAvailable: done-battles in Matches, in denen es im squad stand.
      if (inSquad) battlesAvailable += 1;

      if (inBattle) {
        battles += 1;
        monBattlesThisMatch += 1;
        // Kampf-Bilanz aus Sicht dieses Pokémon (Sieger des Kampfes vs. eigene Seite).
        battleRecord.total += 1;
        if (s.winner === 'draw') battleRecord.d += 1;
        else if (s.winner === ownSide) battleRecord.w += 1;
        else battleRecord.l += 1;
        usedOwn.forEach((n) => {
          if (n && n !== name) partnersByBattle[n] = (partnersByBattle[n] || 0) + 1;
        });
        usedOpp.forEach((n) => {
          if (n) opponentsByBattle[n] = (opponentsByBattle[n] || 0) + 1;
        });
      }

      (b.kills || []).forEach((k) => {
        if (!k) return;
        const isSelf = k.killerSide != null && k.killerSide === k.victimSide;
        const isNone = k.killerSide == null;

        // Kill: dieses Pokémon hat ein gegnerisches besiegt (kein Self-Kill).
        if (k.killer === name && k.killerSide !== k.victimSide) {
          kills += 1;
          monKillsThisMatch += 1;
          if (k.victim) topVictims[k.victim] = (topVictims[k.victim] || 0) + 1;
          history.push({
            day: r.day,
            matchId: r.id ?? null,
            battleNo,
            kind: 'kill',
            otherName: k.victim ?? null,
            self: false,
            none: false,
            opponentTeamName: oppTeamName,
          });
        }

        // Death: dieses Pokémon wurde besiegt (inkl. Self-Kill / none).
        if (k.victim === name) {
          deaths += 1;
          monDeathsThisMatch += 1;
          if (!isSelf && !isNone && k.killer) {
            topNemeses[k.killer] = (topNemeses[k.killer] || 0) + 1;
          }
          history.push({
            day: r.day,
            matchId: r.id ?? null,
            battleNo,
            kind: 'death',
            otherName: isNone ? null : (k.killer ?? null),
            self: isSelf,
            none: isNone,
            opponentTeamName: oppTeamName,
          });
        }
      });
    });

    // Match-Ausgang aus Team-Sicht.
    let outcome;
    if (ownPts > oppPts) outcome = 'win';
    else if (oppPts > ownPts) outcome = 'loss';
    else outcome = 'draw';

    const rec = inSquad ? recWith : recWithout;
    rec.total += 1;
    if (outcome === 'win') rec.w += 1;
    else if (outcome === 'loss') rec.l += 1;
    else rec.d += 1;

    timeline.push({
      day: r.day,
      matchId: r.id ?? null,
      inSquad,
      inBattle: monBattlesThisMatch > 0,
      kills: monKillsThisMatch,
      deaths: monDeathsThisMatch,
      outcome,
    });
  });

  // history chronologisch: day asc, dann battleNo.
  history.sort((a, b) => (a.day ?? 0) - (b.day ?? 0) || (a.battleNo ?? 0) - (b.battleNo ?? 0));

  recWith.winPct = recWith.total ? recWith.w / recWith.total : 0;
  recWithout.winPct = recWithout.total ? recWithout.w / recWithout.total : 0;
  battleRecord.winPct = battleRecord.total ? battleRecord.w / battleRecord.total : 0;

  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  return {
    drafted: true,
    team,
    teamMatchesPlayed,
    matchups,
    matchupPct: teamMatchesPlayed ? matchups / teamMatchesPlayed : 0,
    teamBattlesTotal,
    battles,
    battlesAvailable,
    battlePctTotal: teamBattlesTotal ? battles / teamBattlesTotal : 0,
    battlePctAvailable: battlesAvailable ? battles / battlesAvailable : 0,
    benched: battlesAvailable - battles,
    kills,
    deaths,
    kd: kills / Math.max(1, deaths),
    killsPerBattle: kills / Math.max(1, battles),
    survivalRate: clamp01((battles - deaths) / Math.max(1, battles)),
    history,
    partnersByBattle: toList(partnersByBattle),
    opponentsByBattle: toList(opponentsByBattle),
    partnersByMatchup: toList(partnersByMatchup),
    opponentsByMatchup: toList(opponentsByMatchup),
    topVictims: toList(topVictims),
    topNemeses: toList(topNemeses),
    matchRecordWith: recWith,
    matchRecordWithout: recWithout,
    battleRecord,
    timeline,
  };
}

// === Spieler-Duell: Janik ⚔ Henrik ==========================================
// Aggregiert alle Ergebnisse zu einem direkten Spieler-Vergleich. Da jedes Match
// Janik-Team vs Henrik-Team ist, entspricht die Match-Bilanz der Gesamt-Saison.
export function playerDuel(teams, results) {
  const teamById = {};
  (teams || []).forEach((t) => { if (t?.id != null) teamById[t.id] = t; });

  const blank = (player) => ({
    player, teams: 0,
    matchWins: 0, matchDraws: 0, matchLosses: 0,
    battleWins: 0, battleDraws: 0, battleLosses: 0,
    kills: 0, deaths: 0, points: 0,
  });
  const acc = { Janik: blank('Janik'), Henrik: blank('Henrik') };
  (teams || []).forEach((t) => { if (acc[t.player]) acc[t.player].teams += 1; });

  (results || []).forEach((r) => {
    if (!r) return;
    const home = teamById[r.home];
    const away = teamById[r.away];
    if (!home || !away) return;
    const hp = acc[home.player];
    const ap = acc[away.player];

    let hoWins = 0, awWins = 0, anyDone = false;
    (r.battles || []).forEach((b) => {
      if (!b || !b.done) return;
      anyDone = true;
      const s = battleStats(b);
      if (s.winner === 'home') hoWins += 1; else if (s.winner === 'away') awWins += 1;
      if (hp) {
        if (s.winner === 'draw') hp.battleDraws += 1;
        else if (s.winner === 'home') hp.battleWins += 1;
        else hp.battleLosses += 1;
        hp.kills += s.homeKills; hp.deaths += s.homeDeaths; hp.points += s.homePoints;
      }
      if (ap) {
        if (s.winner === 'draw') ap.battleDraws += 1;
        else if (s.winner === 'away') ap.battleWins += 1;
        else ap.battleLosses += 1;
        ap.kills += s.awayKills; ap.deaths += s.awayDeaths; ap.points += s.awayPoints;
      }
    });
    if (anyDone) {
      const mw = hoWins > awWins ? 'home' : awWins > hoWins ? 'away' : 'draw';
      if (mw === 'draw') { if (hp) hp.matchDraws += 1; if (ap) ap.matchDraws += 1; }
      else if (mw === 'home') { if (hp) hp.matchWins += 1; if (ap) ap.matchLosses += 1; }
      else { if (ap) ap.matchWins += 1; if (hp) hp.matchLosses += 1; }
    }
  });

  const standings = computeStandings(teams, results);
  const placeSum = { Janik: 0, Henrik: 0 };
  const placeCnt = { Janik: 0, Henrik: 0 };
  standings.forEach((row, i) => {
    const pl = row.team.player;
    if (placeCnt[pl] != null) { placeSum[pl] += i + 1; placeCnt[pl] += 1; }
  });

  const monStats = pokemonStats(teams, results);
  const finalize = (p) => {
    const md = p.matchWins + p.matchDraws + p.matchLosses;
    const bd = p.battleWins + p.battleDraws + p.battleLosses;
    return {
      ...p,
      diff: p.kills - p.deaths,
      matchWinPct: md ? p.matchWins / md : 0,
      battleWinPct: bd ? p.battleWins / bd : 0,
      avgPlace: placeCnt[p.player] ? placeSum[p.player] / placeCnt[p.player] : null,
      top: monStats
        .filter((s) => s.team?.player === p.player)
        .sort((a, b) => b.kills - a.kills || b.battles - a.battles || a.pokemon.name.localeCompare(b.pokemon.name))
        .slice(0, 5),
    };
  };

  const janik = finalize(acc.Janik);
  const henrik = finalize(acc.Henrik);
  return {
    janik, henrik,
    totalMatches: janik.matchWins + janik.matchDraws + janik.matchLosses,
    totalBattles: janik.battleWins + janik.battleDraws + janik.battleLosses,
  };
}

// === Pokémon-Showdown-Export ================================================
// Wandelt einen englischen Anzeigenamen (name_en) in eine gültige Showdown-Species um.
// Nur die Species (keine Attacken/Items/Wesen/EVs). Sonderformen werden an das
// Showdown-Namensschema angepasst (Mega/Primal/Regionalformen).
export function showdownSpecies(nameEn) {
  if (!nameEn) return '';
  const s = String(nameEn).trim();
  let m = /^Mega (.+) ([XY])$/.exec(s);
  if (m) return `${m[1]}-Mega-${m[2]}`;
  m = /^Mega (.+)$/.exec(s);
  if (m) return `${m[1]}-Mega`;
  m = /^Primal (.+)$/.exec(s);
  if (m) return `${m[1]}-Primal`;
  const regions = [
    [/^Alolan (.+)$/, 'Alola'], [/^Galarian (.+)$/, 'Galar'],
    [/^Hisuian (.+)$/, 'Hisui'], [/^Paldean (.+)$/, 'Paldea'],
  ];
  for (const [re, suffix] of regions) {
    const mm = re.exec(s);
    if (mm) return `${mm[1]}-${suffix}`;
  }
  return s;
}

// Baut einen Showdown-Teambuilder-Import (nur Species, je Pokémon eine Zeile,
// durch Leerzeilen getrennt). Erwartet Objekte mit name_en (Fallback: name).
export function showdownExport(pokemonList) {
  return (pokemonList || [])
    .map((p) => showdownSpecies(p.name_en || p.name))
    .filter(Boolean)
    .join('\n\n');
}
