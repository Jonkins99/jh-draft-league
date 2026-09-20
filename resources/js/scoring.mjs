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

/**
 * Ein neu eingetragenes Ergebnis mit dem gespeicherten Stand zusammenführen.
 *
 * Ein Ergebnis-Dokument wird im Ganzen geschrieben. Wer die Eingabe öffnet, bevor
 * der Bestand da ist — oder auf einem zweiten Gerät —, würde damit fertige Kämpfe
 * durch leere ersetzen. Das ist der Datenverlust, gegen den diese Funktion steht:
 *
 * - Ein fertiger Kampf (`done`) wird NIE durch einen unfertigen ersetzt.
 * - Unter zwei unfertigen gewinnt der inhaltsreichere (mehr Aufstellung, mehr Kills).
 * - Ein leeres Aufgebot ersetzt kein gefülltes.
 * - Felder, die die Eingabe gar nicht kennt (Video, Pressefreigabe), bleiben stehen.
 *
 * Überschrieben wird also nur, was der Eintragende auch wirklich eingetragen hat.
 */
export function mergeResult(existing, next) {
  if (!existing) return next;
  if (!next) return existing;

  const weight = (b) => {
    if (!b) return -1;
    if (b.done) return 1000;
    return (b.used?.home?.length || 0) + (b.used?.away?.length || 0) + (b.kills?.length || 0)
      + (b.winner ? 1 : 0);
  };
  const count = Math.max((existing.battles || []).length, (next.battles || []).length, 3);
  const battles = [];
  for (let i = 0; i < count; i++) {
    const a = (existing.battles || [])[i];
    const b = (next.battles || [])[i];
    battles.push(weight(b) >= weight(a) ? b : a);
  }

  const squads = {};
  ['home', 'away'].forEach((side) => {
    const a = existing.squads?.[side] || [];
    const b = next.squads?.[side] || [];
    squads[side] = b.length ? b : a;
  });

  return { ...existing, ...next, squads, battles: battles.filter(Boolean) };
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
    // Einsatzquote im Matchup: bei Nominierung (6er-Aufgebot) Anteil der bis zu 3 Kämpfe,
    // in denen es tatsächlich stand. battles / (matchups × 3), auf 0..1 begrenzt.
    battleShareInMu: Math.max(0, Math.min(1, battles / Math.max(1, st.matchups * 3))),
    // Einsatzquote im Kader: Anteil ALLER Kämpfe des Teams, in denen es stand —
    // Matches ohne Nominierung (Bank) zählen hier im Nenner mit.
    battleShareInRoster: st.rosterBattles ? Math.max(0, Math.min(1, battles / st.rosterBattles)) : 0,
    survivalRate: Math.max(0, Math.min(1, (battles - st.deaths) / Math.max(1, battles))),
    battleWinPct: battleDecided ? st.battleWins / battleDecided : 0,
    matchWinPct: matchesDecided ? st.matchWins / matchesDecided : 0,
    base_speed: Number.isFinite(st.pokemon?.base_speed) ? st.pokemon.base_speed : 0,
    cost: Number.isFinite(st.pokemon?.cost) ? st.pokemon.cost : 0,
  };
}

/**
 * Wann ein Pokémon einem Team zur Verfügung stand — gemessen in Spieltagen.
 *
 * Das Wintertransferfenster liegt zwischen Hin- und Rückrunde. Ein dort gezogenes
 * Pokémon konnte an den Spieltagen davor gar nicht auflaufen, ein abgegebenes danach
 * nicht mehr. Ohne diese Grenze rechnen alle prozentualen Kennzahlen so, als hätte
 * jedes Pokémon die ganze Saison zur Verfügung gestanden — ein im Winter geholtes
 * Pokémon steht dann mit einer halbierten Einsatzquote da, die es nie hatte.
 *
 * Der Schnitt ist der letzte Spieltag der Hinrunde (`leg === 'hin'`); das
 * Transfer-Dokument selbst kennt keinen Spieltag.
 *
 * @returns {Object<string, {from:(number|null), until:(number|null)}>} Schlüssel `teamId|name`.
 *          Die Team-ID trägt die Saison in sich, deshalb bleibt die Karte auch
 *          saisonübergreifend eindeutig.
 */
export function transferAvailability(transfer, schedule) {
  const out = {};
  const hin = (schedule?.matchdays || [])
    .filter((md) => md?.leg === 'hin')
    .map((md) => Number(md.day))
    .filter(Number.isFinite);
  if (!hin.length) return out;
  const cut = Math.max(...hin);
  (transfer?.removed || []).forEach((r) => {
    if (r?.teamId && r?.name) out[`${r.teamId}|${r.name}`] = { from: null, until: cut };
  });
  // Nach dem Abgeben kommt das Ziehen: wer im selben Fenster abgibt und holt, ist
  // ab dem Fenster dabei — der spätere Eintrag gewinnt bewusst.
  (transfer?.added || []).forEach((a) => {
    if (a?.teamId && a?.name) out[`${a.teamId}|${a.name}`] = { from: cut + 1, until: null };
  });
  return out;
}

/** Stand dieses Pokémon an diesem Spieltag im Kader des Teams? */
export function availableOn(availability, teamId, name, day) {
  const w = availability?.[`${teamId}|${name}`];
  if (!w) return true;
  const d = Number(day);
  if (!Number.isFinite(d)) return true;
  if (w.from != null && d < w.from) return false;
  if (w.until != null && d > w.until) return false;
  return true;
}

// Attribution ist result-getrieben: ein Beitrag zählt für die Seite (home/away), die das
// Pokémon in DIESEM Ergebnis aufgestellt hat — nicht für den aktuellen Roster-Besitzer.
// Dadurch bleiben Leistungen nach einem Team-Wechsel korrekt beim damaligen Team.
//   pokedex — Stammdaten [{name, image, types, tier, ...}] zum Auflösen von Meta für
//             Pokémon, die (nach Abgabe) in keinem Roster mehr stehen.
//   opts.scopeTeamId — nur Ergebnisse dieses Teams und nur dessen Seite zählen (Team-Detail);
//                      Universum = aktuelles Roster des Teams.
//   opts.availability — Kaderfenster aus transferAvailability(); ohne sie gilt jedes
//                      Pokémon über die gesamte Saison als verfügbar.
export function pokemonStats(teams, results, pokedex = [], opts = {}) {
  const scopeTeamId = opts.scopeTeamId ?? null;
  const availability = opts.availability || null;
  const byName = {};
  (pokedex || []).forEach((p) => { if (p?.name) byName[p.name] = p; });

  const stats = {};
  const ownerByName = {};
  const mkStat = (name, pokemon, team) => {
    if (stats[name]) return stats[name];
    stats[name] = {
      pokemon: pokemon || byName[name] || { name }, team: team || null,
      kills: 0, deaths: 0, matchups: 0, battles: 0, rosterBattles: 0,
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

  // Nenner der Kader-Einsatzquote: alle ausgetragenen Kämpfe der Matches, in denen das
  // Pokémon zum Kader der jeweiligen Seite gehörte. „Gehört dazu" heißt — analog zu
  // pokemonProfile — im Aufgebot dieses Ergebnisses ODER aktuell im Roster dieses Teams
  // (Bank). Damit bleibt die Quote nach einem Wintertransfer bei der richtigen Seite.
  (results || []).forEach((r) => {
    if (!r) return;
    const doneBattles = (r.battles || []).filter((b) => b && b.done === true).length;
    if (!doneBattles) return;
    ['home', 'away'].forEach((side) => {
      const teamId = side === 'home' ? r.home : r.away;
      if (scopeTeamId && teamId !== scopeTeamId) return;
      const squad = new Set(r.squads?.[side] || []);
      Object.keys(stats).forEach((name) => {
        // Aufgestellt zählt immer; auf der Bank nur, wenn es an diesem Spieltag
        // überhaupt schon (oder noch) zum Kader gehörte.
        if (squad.has(name)
          || (ownerByName[name]?.id === teamId && availableOn(availability, teamId, name, r.day))) {
          stats[name].rosterBattles += doneBattles;
        }
      });
    });
  });

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

// Wesen-Multiplikatoren für einen Statuswert: positiv, neutral, negativ.
export const NATURE_MULT = { up: 1.1, neutral: 1, down: 0.9 };

// Wesen-Angabe normalisieren. Historisch war das ein Boolean (natureUp),
// jetzt zusätzlich 'up' | 'neutral' | 'down'.
export function normalizeNature(nature) {
  if (nature === true || nature === 'up') return 'up';
  if (nature === 'down') return 'down';
  return 'neutral';
}

// Initiative für gegebene SP und Wesen.
export function speedAt(base, sp = 0, nature = 'neutral') {
  const core = Math.floor((2 * base + 31) / 2) + 5 + sp;
  return Math.floor(core * NATURE_MULT[normalizeNature(nature)]);
}

// Die drei Investment-Fälle (ohne In-Battle-Modifikator):
//  s0   = 0 SP, neutrales Wesen
//  s32  = 32 SP, neutrales Wesen
//  s32n = 32 SP, positives Initiative-Wesen
export function speedTiers(base) {
  return {
    s0: speedAt(base, 0, 'neutral'),
    s32: speedAt(base, 32, 'neutral'),
    s32n: speedAt(base, 32, 'up'),
    s0d: speedAt(base, 0, 'down'),
    s32d: speedAt(base, 32, 'down'),
  };
}

// SP auf den erlaubten Bereich 0–32 begrenzen (ganzzahlig).
export function clampSp(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(32, n));
}

// Anzeige-Fälle für die Speed-Tier-Tabellen, je Pokémon konfigurierbar:
//  sp  = null/undefined -> beide Standardannahmen 0 UND 32 SP,
//        Zahl           -> genau dieser SP-Wert (0–32).
//  nat = 'both' (Default) | 'neutral' | 'up' -> welche Wesen gezeigt werden.
// Welche Wesen ein Modus anzeigt. 'both' = neutral & Init+ (Standard),
// 'all' = zusätzlich das negative Wesen.
export const NATURE_SETS = {
  both: ['neutral', 'up'],
  all: ['down', 'neutral', 'up'],
  neutral: ['neutral'],
  up: ['up'],
  down: ['down'],
};
const NATURE_SUFFIX = { up: '+', neutral: '', down: '-' };

export function speedCases(base, opts = {}) {
  // `sp == null` ist die Standardannahme, kein eingetragener Wert: 0 UND 32 SP.
  const auto = opts.sp == null;
  const sps = auto ? [0, 32] : [clampSp(opts.sp)];
  const natures = NATURE_SETS[opts.nat] || NATURE_SETS.both;
  const out = [];
  for (const sp of sps) {
    for (const nature of natures) {
      // Solange nichts eingetragen ist, steht 0 SP für „gar nicht investiert" — ein
      // Init+-Wesen dazu plant niemand. Es erscheint nur, wenn es ausdrücklich für
      // dieses Pokémon eingetragen wurde oder die Auswahl nichts anderes hergibt.
      if (auto && sp === 0 && nature === 'up' && natures.includes('neutral')) continue;
      out.push({
        key: `sp${sp}${nature === 'up' ? 'n' : nature === 'down' ? 'd' : ''}`,
        label: `${sp}${NATURE_SUFFIX[nature]}`,
        sp,
        nature,
        natureUp: nature === 'up',
        speed: speedAt(base, sp, nature),
      });
    }
  }
  return out;
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
export function pokemonProfile(name, teams, results, pokedex = [], opts = {}) {
  const availability = opts.availability || null;
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
    partnerRecords: [],
    opponentRecords: [],
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
  // Bank-Matches zählen nur, solange das Pokémon dem Team auch gehörte: ein im
  // Wintertransfer geholtes Pokémon hat die Hinrunde nicht auf der Bank verbracht,
  // es war schlicht nicht da.
  const onBench = (r) => currentTeam
    && (r.home === currentTeam.id || r.away === currentTeam.id)
    && availableOn(availability, currentTeam.id, name, r.day);
  const merged = (results || []).filter((r) => r && (appears(r) || onBench(r)));
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
  // Sieg-/Niederlagen-Bilanz je Partner bzw. Gegner auf Kampf-Ebene.
  const partnerRec = Object.create(null);
  const opponentRec = Object.create(null);
  const bumpRec = (bag, key, outcome) => {
    const r = bag[key] || (bag[key] = { name: key, w: 0, l: 0, d: 0, total: 0 });
    r.total += 1;
    if (outcome === 'draw') r.d += 1;
    else if (outcome === 'win') r.w += 1;
    else r.l += 1;
  };
  const recList = (bag) =>
    Object.values(bag)
      .map((r) => ({ ...r, winPct: r.total ? r.w / r.total : 0, lossPct: r.total ? r.l / r.total : 0 }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

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
        const outcome = s.winner === 'draw' ? 'draw' : s.winner === ownSide ? 'win' : 'loss';
        usedOwn.forEach((n) => {
          if (n && n !== name) {
            partnersByBattle[n] = (partnersByBattle[n] || 0) + 1;
            bumpRec(partnerRec, n, outcome);
          }
        });
        usedOpp.forEach((n) => {
          if (n) {
            opponentsByBattle[n] = (opponentsByBattle[n] || 0) + 1;
            bumpRec(opponentRec, n, outcome);
          }
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
    partnerRecords: recList(partnerRec),
    opponentRecords: recList(opponentRec),
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
  let m = /^Mega (.+) ([XYZ])$/.exec(s);
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

// === Team-Kampfzahlen =======================================================
// Ausgetragene Kämpfe (done) je Team über alle Ergebnisse. Basis für relative
// Mindestschwellen („mindestens 40 % der Team-Kämpfe").
export function teamBattleTotals(results) {
  const out = {};
  (results || []).forEach((r) => {
    if (!r) return;
    const done = (r.battles || []).filter((b) => b && b.done === true).length;
    if (!done) return;
    if (r.home != null) out[r.home] = (out[r.home] || 0) + done;
    if (r.away != null) out[r.away] = (out[r.away] || 0) + done;
  });
  return out;
}

// === Mega-Formen ============================================================
// Mega-Pokémon heißen in den Stammdaten durchgehend „Mega-<Name>" (teils mit
// Suffix X/Y). Die Nicht-Mega-Variante wird über die gleiche Dex-Nummer gesucht:
// bevorzugt der exakte Restname, sonst der erste Nicht-Mega-Eintrag.
export function isMega(name) {
  return /^Mega-/.test(String(name || ''));
}

export function baseFormOf(mon, pokedex = []) {
  if (!mon || !isMega(mon.name)) return null;
  const stripped = String(mon.name).replace(/^Mega-/, '').replace(/ [XY]$/, '');
  const sameDex = (pokedex || []).filter((p) => p && p.dex === mon.dex && !isMega(p.name));
  return sameDex.find((p) => p.name === stripped) || sameDex[0] || null;
}

// === Draft-Verlauf ==========================================================
// Alle Picks in Snake-Reihenfolge aus `draft.order` + der Roster-Reihenfolge der
// Teams rekonstruiert (ein eigener Pick-Log existiert nicht: `pick()` hängt jeden
// Pick hinten an das Team-Dokument, damit ist die Array-Reihenfolge = Pick-Reihenfolge).
//
// Einschränkung nach dem Wintertransfer: abgegebene Pokémon fehlen im Roster und
// zugekaufte stehen am Ende. Zugekaufte lassen sich über `transfer.added` sauber
// ausblenden; die exakte Draft-Position der abgegebenen ist dagegen nirgends
// protokolliert — sie werden deshalb ans Ende der Team-Reihenfolge gestellt und
// über `gone` markiert. Betroffene Teams tragen zusätzlich `approx`.
export function draftPicks(teams, draft, transfer = {}, pokedex = [], picksPerTeam = 10) {
  const order = draft?.order || [];
  const n = order.length;
  if (!n) return [];

  const teamById = {};
  (teams || []).forEach((t) => { if (t?.id) teamById[t.id] = t; });
  const monByName = {};
  (pokedex || []).forEach((p) => { if (p?.name) monByName[p.name] = p; });

  const addedByTeam = {};
  (transfer?.added || []).forEach((a) => {
    if (!a?.teamId || !a?.name) return;
    (addedByTeam[a.teamId] = addedByTeam[a.teamId] || new Set()).add(a.name);
  });
  const removedByTeam = {};
  (transfer?.removed || []).forEach((a) => {
    if (!a?.teamId || !a?.name) return;
    (removedByTeam[a.teamId] = removedByTeam[a.teamId] || []).push(a);
  });

  const draftRoster = (teamId) => {
    const added = addedByTeam[teamId] || new Set();
    const survivors = (teamById[teamId]?.pokemon || [])
      .filter((p) => p && !added.has(p.name))
      .map((p) => ({ ...(monByName[p.name] || {}), ...p, gone: false }));
    const gone = (removedByTeam[teamId] || []).map((r) => ({
      ...(monByName[r.name] || { name: r.name }), name: r.name, tier: r.tier || monByName[r.name]?.tier || null, gone: true,
    }));
    return [...survivors, ...gone];
  };

  const rosters = {};
  order.forEach((id) => { rosters[id] = draftRoster(id); });

  // Wer eine Runde per Vertragsverlängerung eröffnet hat, zieht in dieser Runde
  // ZUERST — sein regulärer Zug ist damit vorgezogen. Die Reihenfolge einer Runde ist
  // also: die Verlängerungen in Snake-Reihenfolge, danach der Rest in Snake-Reihenfolge.
  const renewalsByRound = {};
  (draft?.renewals || []).forEach((r) => {
    if (!r?.teamId || !Number.isFinite(r.round)) return;
    (renewalsByRound[r.round] = renewalsByRound[r.round] || new Set()).add(r.teamId);
  });
  const renewedNames = new Set((draft?.renewals || []).map((r) => r?.name).filter(Boolean));
  const roundOrder = (round) => {
    const snake = round % 2 === 0 ? order : [...order].reverse();
    const renewed = renewalsByRound[round];
    if (!renewed || !renewed.size) return snake;
    return [...snake.filter((id) => renewed.has(id)), ...snake.filter((id) => !renewed.has(id))];
  };

  const totalPicks = n * picksPerTeam;
  const made = Math.max(0, Math.min(Number.isFinite(draft?.pickIndex) ? draft.pickIndex : totalPicks, totalPicks));
  const counts = {};
  const picks = [];
  for (let k = 0; k < made; k++) {
    const round = Math.floor(k / n);
    const teamId = roundOrder(round)[k % n];
    if (!teamId) continue;
    const occ = counts[teamId] || 0;
    counts[teamId] = occ + 1;
    const mon = rosters[teamId]?.[occ] || null;
    if (!mon) continue;
    picks.push({
      pickNo: k + 1,
      round: round + 1,
      teamId,
      team: teamById[teamId] || null,
      mon,
      gone: !!mon.gone,
      renewed: renewedNames.has(mon.name),
      approx: (removedByTeam[teamId] || []).length > 0,
    });
  }
  return picks;
}

// === PokéZone-Verlinkung ====================================================
// Die Detailseiten von pokemon-zone.com adressieren Pokémon über einen Slug aus
// englischem Namen: Basisformen heißen schlicht „arcanine", Sonderformen hängen
// die Formbezeichnung der Seite an die Basis-Spezies an — Megas den vollen Namen
// („audino-mega-audino"), Regionalformen ein Kürzel („arcanine-hisuian-form").
// Formen, deren Bezeichnung sich nicht aus unseren Stammdaten ableiten lässt,
// stehen als Ausnahmen in der Tabelle.
const POKEZONE_BASE = 'https://www.pokemon-zone.com/champions/pokemon/';

const POKEZONE_REGIONS = {
  Alolan: 'alolan-form',
  Galarian: 'galarian-form',
  Hisuian: 'hisuian-form',
  Paldean: 'paldean-form',
};

const POKEZONE_FORMS = {
  'Basculegion-Male': 'basculegion',
  'Basculegion-Female': 'basculegion-female',
  'Meowstic-Male': 'meowstic',
  'Meowstic-Female': 'meowstic-female',
  'Floette-Eternal': 'floette-eternal-flower',
  'Lycanroc-Midday': 'lycanroc',
  'Lycanroc-Midnight': 'lycanroc-midnight-form',
  'Lycanroc-Dusk': 'lycanroc-dusk-form',
  'Paldean Tauros': 'tauros-paldean-form-combat-breed',
  'Paldean Tauros Aqua': 'tauros-paldean-form-aqua-breed',
  'Paldean Tauros Blaze': 'tauros-paldean-form-blaze-breed',
  'Rotom-Heat': 'rotom-heat-rotom',
  'Rotom-Wash': 'rotom-wash-rotom',
  'Rotom-Frost': 'rotom-frost-rotom',
  'Rotom-Fan': 'rotom-fan-rotom',
  'Rotom-Mow': 'rotom-mow-rotom',
  Indeedee: 'indeedee',
  'Indeedee-F': 'indeedee-female',
  Toxtricity: 'toxtricity',
  'Toxtricity-Low-Key': 'toxtricity-low-key-form',
  Squawkabilly: 'squawkabilly',
  'Squawkabilly-Yellow': 'squawkabilly-yellow-plumage',
  'Farfetch\u2019d': 'farfetchd',
  'Sirfetch\u2019d': 'sirfetchd',
};

function pokezoneSlugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function pokezoneSlug(nameEn) {
  const name = String(nameEn || '').trim();
  if (!name) return '';
  if (POKEZONE_FORMS[name]) return POKEZONE_FORMS[name];
  const mega = name.match(/^Mega (.+)$/);
  if (mega) return `${pokezoneSlugify(mega[1].replace(/ [XYZ]$/, ''))}-${pokezoneSlugify(name)}`;
  const region = name.match(/^(Alolan|Galarian|Hisuian|Paldean) (.+)$/);
  if (region) return `${pokezoneSlugify(region[2])}-${POKEZONE_REGIONS[region[1]]}`;
  return pokezoneSlugify(name);
}

export function pokezoneUrl(nameEn) {
  const slug = pokezoneSlug(nameEn);
  return slug ? `${POKEZONE_BASE}${slug}/` : null;
}
