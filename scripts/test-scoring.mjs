// Reine Logik-Tests der framework-freien Module — Ausfuehren: node scripts/test-scoring.mjs
import assert from 'node:assert/strict';
import {
  pokemonStats, pokemonProfile, mergeResult,
  showdownSpecies, showdownExport,
  speedAt, speedTiers, speedCases, clampSp, applySpeedMod,
  teamBattleTotals, isMega, baseFormOf, normalizeNature,
  pokezoneSlug, pokezoneUrl, draftPicks, transferAvailability, availableOn,
} from '../resources/js/scoring.mjs';
import {
  mergedOptions, voteResults, awardWinner, awardWinners, nextStatus, revealSteps,
  optionId, spoilerNote, awardableDays, MATCHDAY_AWARDS_FROM, seasonTiers, tierInSeason,
} from '../resources/js/awards.mjs';
import {
  parsePeriod, parseTraits, normalizeGender, normalizeTrainer, currentTrainer,
  trainerHistory, periodLabel, nextFromDay, withDismissed,
} from '../resources/js/trainers.mjs';
import {
  spToEv, evToSp, speciesKey as calcSpeciesKey, natureByDe, natureLabel, natureFor,
  parseSpField, formatSpField, spSetToConfig, configToSpSet, parseLegacyEvs,
  damagePercent, percentLabel, hitsToKo, typeDe, MAX_SP,
} from '../resources/js/damagecalc.mjs';
import {
  pressSlots, slotPlan, bonusSlotsFor, bonusRoundComplete, bonusRoundProgress,
  outlookSlotFor, outlookSessionId, outlookProgress, seasonComplete, OUTLOOK_QUESTIONS,
  collectStorylines, paragraphsToHtml, articleMatchesFilter, randomAuthors,
  categoriesOf, normalizeCategories, manualCategories, AI_CATEGORY,
  BONUS_ROUND_DAY, PRESS_FROM_DAY,
} from '../resources/js/press.mjs';
import {
  blankNotes, normalizeNotes, teamNote, matchNote, withNote, countNotes,
  logText, hasLog, logAuthors, logToText,
} from '../resources/js/notes.mjs';
import {
  PLAYERS as AUTH_PLAYERS, userId, playerOf, otherPlayer, createCredential,
  verifyCredential, isValidSession, encryptJson, decryptJson, ownsTeam, teamIdsOf,
} from '../resources/js/auth.mjs';
import { buildContext } from '../resources/js/press-context.mjs';
import { buildFinaleScript, SCENE_MS } from '../resources/js/finale.mjs';
import { CEREMONY_VARIANTS, pickCeremonyVariant, VARIANT_BY_KEY } from '../resources/js/ceremony.mjs';
import { buildDirection, buildSystem, DEFAULT_PROMPTS } from '../resources/js/press-prompts.mjs';
import {
  MARKET_ANCHORS, marketValue, marketValueRaw, roundMarketValue, formatMarket,
  formatMarketDelta, formatPercent, tierBoundaries, tierForElo, historyPoints,
  historyStops, squadHistory, squadMarketValue, eloIndex, snapshotOf, diffSnapshots,
  historyDiff, stopKeyForDay, parseHistoryLabel,
  transferCutIndex, rosterBeforeTransfer, rosterAtIndex, rosterSpans,
} from '../resources/js/market.mjs';
import { normalizeVideoUrl, youtubeId, videoEmbed, videoHostLabel } from '../resources/js/video.mjs';
import { parseTile, TILE_KINDS, imageUrlsIn, withImageTiles, tileHtml } from '../resources/js/press-tiles.mjs';
import { buildRecords, newcomersOfSeason } from '../resources/js/seasons.mjs';
import {
  RENEWAL_TIERS, previousRosters, renewalState, hasOpenRenewal, renewalTurn,
  currentPick as draftCurrentPick, buildDraftOrder, snakeOrder, renewedIn,
} from '../resources/js/draft.mjs';
import { standingsBlock } from '../resources/js/press-context.mjs';
import { historyKey } from '../resources/js/elo.mjs';
import {
  SLOT_KEYS, MAX_PATHS, blankPlan, normalizePlan, effectivePicks, effectiveOrder,
  orderedPaths, divergence, usageMap, pathMons, liveState, monState, pathViability,
  nextTarget, planRisks, coverageOf, riskScore, weakSpots, suggestCoverage, speedProfile,
  pathSummary,
} from '../resources/js/draftplan.mjs';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok -', name); }
// Die Anmeldung rechnet asynchron (WebCrypto) — dafür ein eigener, awaitbarer Helfer.
async function atest(name, fn) { await fn(); passed++; console.log('  ok -', name); }

const pokedex = [
  { name: 'Glurak', name_en: 'Charizard', tier: 'S', types: ['Feuer'], image: 'c.png', base_speed: 100, cost: 20 },
  { name: 'Turtok', name_en: 'Blastoise', tier: 'A', types: ['Wasser'], image: 'b.png', base_speed: 78, cost: 15 },
  { name: 'Bisaflor', name_en: 'Venusaur', tier: 'A', types: ['Pflanze'], image: 'v.png', base_speed: 80, cost: 15 },
];
const monA = pokedex[0], monB = pokedex[1], monC = pokedex[2];

// Ergebnis-Fabrik: 1 Kampf, done, Sieger home, uebergebenes Kill-Log.
function result(id, day, home, away, homeSquad, awaySquad, used, kills) {
  return { id, day, home, away, squads: { home: homeSquad, away: awaySquad },
    battles: [{ done: true, used, score: { home: 2, away: 1 }, winner: 'home', kills }] };
}

// Szenario Team-Wechsel: Glurak spielt Tag 1 fuer T1, wird abgegeben, Tag 2 fuer T2.
test('Attribution folgt dem Team zum Match-Zeitpunkt (scopeTeamId)', () => {
  const teamsAfter = [
    { id: 'T1', name: 'Team1', player: 'Janik', pokemon: [ monC ] },        // Glurak weg
    { id: 'T2', name: 'Team2', player: 'Henrik', pokemon: [ monA, monB ] }, // Glurak nun hier
  ];
  const results = [
    result('d1', 1, 'T1', 'T2', ['Glurak'], ['Turtok'],
      { home: ['Glurak'], away: ['Turtok'] },
      [{ victimSide: 'away', victim: 'Turtok', killerSide: 'home', killer: 'Glurak' }]),
    result('d2', 2, 'T2', 'T1', ['Glurak'], ['Bisaflor'],
      { home: ['Glurak'], away: ['Bisaflor'] },
      [{ victimSide: 'away', victim: 'Bisaflor', killerSide: 'home', killer: 'Glurak' }]),
  ];
  const t2 = pokemonStats(teamsAfter, results, pokedex, { scopeTeamId: 'T2' });
  const g2 = t2.find((s) => s.pokemon.name === 'Glurak');
  assert.equal(g2.kills, 1, 'T2-scope: Glurak 1 Kill');
  assert.equal(g2.battles, 1, 'T2-scope: Glurak 1 Kampf');
  const league = pokemonStats(teamsAfter, results, pokedex);
  const gL = league.find((s) => s.pokemon.name === 'Glurak');
  assert.equal(gL.kills, 2, 'Career: Glurak 2 Kills');
  assert.equal(gL.team.id, 'T2', 'Career: team = aktueller Besitzer');
});

test('Ausgeschiedenes Pokemon bleibt im Liga-Ranking (team=null)', () => {
  const teams = [
    { id: 'T1', name: 'Team1', player: 'Janik', pokemon: [ monC ] },
    { id: 'T2', name: 'Team2', player: 'Henrik', pokemon: [ monB ] },
  ];
  const results = [
    result('d1', 1, 'T1', 'T2', ['Glurak'], ['Turtok'],
      { home: ['Glurak'], away: ['Turtok'] },
      [{ victimSide: 'away', victim: 'Turtok', killerSide: 'home', killer: 'Glurak' }]),
  ];
  const league = pokemonStats(teams, results, pokedex);
  const gL = league.find((s) => s.pokemon.name === 'Glurak');
  assert.ok(gL, 'Glurak trotz Ausscheiden gelistet');
  assert.equal(gL.team, null, 'team = null (frei)');
  assert.equal(gL.pokemon.image, 'c.png', 'Meta aus pokedex aufgeloest');
});

test('KPF/MU = battles / matchups', () => {
  const teams = [
    { id: 'T1', name: 'Team1', player: 'Janik', pokemon: [ monA ] },
    { id: 'T2', name: 'Team2', player: 'Henrik', pokemon: [ monB ] },
  ];
  const results = [
    result('d1', 1, 'T1', 'T2', ['Glurak'], ['Turtok'], { home: ['Glurak'], away: ['Turtok'] }, []),
    result('d2', 2, 'T1', 'T2', ['Glurak'], ['Turtok'], { home: ['Glurak'], away: ['Turtok'] }, []),
  ];
  const league = pokemonStats(teams, results, pokedex);
  const g = league.find((s) => s.pokemon.name === 'Glurak');
  assert.equal(g.matchups, 2);
  assert.equal(g.battles, 2);
  assert.equal(Number(g.kpfPerMu.toFixed(2)), 1.0);
});

test('pokemonProfile spannt ueber Team-Wechsel (career)', () => {
  const teamsAfter = [
    { id: 'T1', name: 'Team1', player: 'Janik', pokemon: [ monC ] },
    { id: 'T2', name: 'Team2', player: 'Henrik', pokemon: [ monA, monB ] },
  ];
  const results = [
    result('d1', 1, 'T1', 'T2', ['Glurak'], ['Turtok'],
      { home: ['Glurak'], away: ['Turtok'] },
      [{ victimSide: 'away', victim: 'Turtok', killerSide: 'home', killer: 'Glurak' }]),
    result('d2', 2, 'T2', 'T1', ['Glurak'], ['Bisaflor'],
      { home: ['Glurak'], away: ['Bisaflor'] },
      [{ victimSide: 'away', victim: 'Bisaflor', killerSide: 'home', killer: 'Glurak' }]),
  ];
  const p = pokemonProfile('Glurak', teamsAfter, results, pokedex);
  assert.equal(p.kills, 2, 'career: 2 Kills ueber beide Teams');
  assert.equal(p.deaths, 0);
  assert.equal(p.team.id, 'T2', 'Anzeige-Team = aktueller Besitzer');
});

test('showdownSpecies mappt Mega/Regional', () => {
  assert.equal(showdownSpecies('Charizard'), 'Charizard');
  assert.equal(showdownSpecies('Mega Charizard Y'), 'Charizard-Mega-Y');
  assert.equal(showdownSpecies('Mega Gengar'), 'Gengar-Mega');
  assert.equal(showdownSpecies('Alolan Raichu'), 'Raichu-Alola');
  assert.equal(showdownSpecies('Galarian Zapdos'), 'Zapdos-Galar');
});

test('showdownExport: je Species eine Zeile, Leerzeile dazwischen', () => {
  const txt = showdownExport([{ name_en: 'Charizard' }, { name_en: 'Mega Gengar' }]);
  assert.equal(txt, 'Charizard\n\nGengar-Mega');
});

test('clampSp begrenzt auf 0..32 und rundet', () => {
  assert.equal(clampSp(-5), 0);
  assert.equal(clampSp(99), 32);
  assert.equal(clampSp('18'), 18);
  assert.equal(clampSp(17.6), 18);
  assert.equal(clampSp('abc'), 0);
});

test('speedCases: Default sind 0 UND 32 SP — aber kein Init+ auf 0 SP', () => {
  const cases = speedCases(100);
  // 0 SP ist die „gar nicht investiert"-Annahme; ein Init+-Wesen dazu plant niemand
  // und soll deshalb nur erscheinen, wenn es eingetragen wurde.
  assert.deepEqual(cases.map((c) => c.label), ['0', '32', '32+']);
  const t = speedTiers(100);
  assert.equal(cases[0].speed, t.s0, 'Default-Fall 0 SP neutral wie speedTiers');
  assert.equal(cases[1].speed, t.s32);
  assert.equal(cases[2].speed, t.s32n);
  // Eingetragene 0 SP bringen das Init+-Wesen zurueck.
  assert.deepEqual(speedCases(100, { sp: 0 }).map((c) => c.label), ['0', '0+']);
  // „Nur Init+" laesst sich die Auswahl nicht wegfiltern.
  assert.deepEqual(speedCases(100, { nat: 'up' }).map((c) => c.label), ['0+', '32+']);
});

test('speedCases: eigener SP-Wert ersetzt 0/32, Wesen-Auswahl filtert', () => {
  const cases = speedCases(100, { sp: 18 });
  assert.deepEqual(cases.map((c) => c.label), ['18', '18+']);
  assert.equal(cases[0].speed, speedAt(100, 18, false));
  assert.equal(cases[1].speed, speedAt(100, 18, true));

  assert.deepEqual(speedCases(100, { sp: 18, nat: 'neutral' }).map((c) => c.label), ['18']);
  assert.deepEqual(speedCases(100, { sp: 18, nat: 'up' }).map((c) => c.label), ['18+']);
  assert.deepEqual(speedCases(100, { nat: 'up' }).map((c) => c.label), ['0+', '32+']);
});

test('speedCases: SP ausserhalb 0..32 wird begrenzt, Boosts bleiben anwendbar', () => {
  assert.equal(speedCases(100, { sp: 40, nat: 'neutral' })[0].sp, 32);
  const base = speedCases(100, { sp: 18, nat: 'neutral' })[0].speed;
  assert.equal(applySpeedMod(base, 1.5), Math.floor(base * 1.5));
  assert.equal(applySpeedMod(base, 2), base * 2);
});

test('speedCases: Schluessel je Fall eindeutig', () => {
  const keys = speedCases(100).map((c) => c.key);
  assert.deepEqual(keys, ['sp0', 'sp32', 'sp32n']);
  assert.equal(new Set(keys).size, keys.length);
  const all = speedCases(100, { sp: 0, nat: 'all' }).map((c) => c.key);
  assert.deepEqual(all, ['sp0d', 'sp0', 'sp0n']);
});

// === Negatives Wesen ========================================================
test('speedAt: Wesen positiv / neutral / negativ', () => {
  // Mega-Simsala (Base 150), gegen die Champions-Daten geprueft.
  assert.equal(speedAt(150, 32, 'up'), 222);
  assert.equal(speedAt(150, 32, 'neutral'), 202);
  assert.equal(speedAt(150, 32, 'down'), 181);
  // Boolean bleibt kompatibel.
  assert.equal(speedAt(150, 32, true), 222);
  assert.equal(speedAt(150, 32, false), 202);
  assert.equal(normalizeNature(true), 'up');
  assert.equal(normalizeNature(undefined), 'neutral');
});

test('speedTiers liefert auch die negativen Faelle', () => {
  const t = speedTiers(100);
  assert.equal(t.s0, speedAt(100, 0, 'neutral'));
  assert.equal(t.s0d, speedAt(100, 0, 'down'));
  assert.equal(t.s32d, speedAt(100, 32, 'down'));
});

test("speedCases: nat 'all' zeigt drei Wesen, 'down' nur das negative", () => {
  // Ohne eingetragene SP faellt auch hier das Init+-Wesen zu 0 SP weg.
  const all = speedCases(100, { nat: 'all' });
  assert.deepEqual(all.map((c) => c.key), ['sp0d', 'sp0', 'sp32d', 'sp32', 'sp32n']);
  assert.deepEqual(all.map((c) => c.label), ['0-', '0', '32-', '32', '32+']);
  const down = speedCases(100, { nat: 'down', sp: 32 });
  assert.equal(down.length, 1);
  assert.equal(down[0].nature, 'down');
  assert.equal(down[0].speed, speedAt(100, 32, 'down'));
});

test('applySpeedMod rundet bei x0,5 und x0,67 ab', () => {
  assert.equal(applySpeedMod(101, 0.5), 50);
  assert.equal(applySpeedMod(100, 2 / 3), 66);
  assert.equal(applySpeedMod(99, 2 / 3), 66);
});

// === Mega-Formen ============================================================
test('baseFormOf findet die Nicht-Mega-Variante ueber die Dex-Nummer', () => {
  const dex = [
    { name: 'Mega-Glurak Y', dex: 6, base_speed: 100 },
    { name: 'Mega-Glurak X', dex: 6, base_speed: 100 },
    { name: 'Glurak', dex: 6, base_speed: 100 },
    { name: 'Turtok', dex: 9, base_speed: 78 },
  ];
  assert.equal(isMega('Mega-Glurak Y'), true);
  assert.equal(isMega('Glurak'), false);
  assert.equal(baseFormOf(dex[0], dex).name, 'Glurak');
  assert.equal(baseFormOf(dex[3], dex), null);
});

// === Team-Kampfzahlen =======================================================
test('teamBattleTotals zaehlt nur ausgetragene Kaempfe je Team', () => {
  const results = [
    { home: 'T1', away: 'T2', battles: [{ done: true }, { done: true }, { done: false }] },
    { home: 'T1', away: 'T3', battles: [{ done: true }] },
    { home: 'T2', away: 'T3', battles: [{ done: false }] },
  ];
  const totals = teamBattleTotals(results);
  assert.equal(totals.T1, 3);
  assert.equal(totals.T2, 2);
  assert.equal(totals.T3, 1);
});

// === Partner-/Gegner-Bilanzen ===============================================
test('pokemonProfile: Bilanz je Partner und Gegner auf Kampf-Ebene', () => {
  const teams = [
    { id: 'T1', name: 'Team1', player: 'Janik', pokemon: [monA, monC] },
    { id: 'T2', name: 'Team2', player: 'Henrik', pokemon: [monB] },
  ];
  const battle = (winner) => ({
    done: true, winner, score: { home: 2, away: 1 },
    used: { home: ['Glurak', 'Bisaflor'], away: ['Turtok'] }, kills: [],
  });
  const results = [
    { id: 'r1', day: 1, home: 'T1', away: 'T2',
      squads: { home: ['Glurak', 'Bisaflor'], away: ['Turtok'] },
      battles: [battle('home'), battle('home'), battle('away')] },
  ];
  const p = pokemonProfile('Glurak', teams, results, pokedex);
  const partner = p.partnerRecords.find((r) => r.name === 'Bisaflor');
  assert.deepEqual({ w: partner.w, l: partner.l, total: partner.total }, { w: 2, l: 1, total: 3 });
  assert.equal(Math.round(partner.winPct * 100), 67);
  const opp = p.opponentRecords.find((r) => r.name === 'Turtok');
  assert.deepEqual({ w: opp.w, l: opp.l, total: opp.total }, { w: 2, l: 1, total: 3 });
  // Sich selbst zaehlt nie als Partner.
  assert.equal(p.partnerRecords.some((r) => r.name === 'Glurak'), false);
});

// === Awards =================================================================
test('mergedOptions dedupliziert und merkt sich die Herkunft', () => {
  const award = { entity: 'pokemon', nominations: {
    Janik: [{ id: 'Glurak' }, { id: 'Turtok' }],
    Henrik: [{ id: 'Turtok' }, { id: 'Bisaflor' }],
  } };
  const opts = mergedOptions(award);
  assert.deepEqual(opts.map((o) => o.id), ['Glurak', 'Turtok', 'Bisaflor']);
  assert.deepEqual(opts[1].by, ['Janik', 'Henrik']);
});

test('optionId ist bei Duos reihenfolge-unabhaengig', () => {
  assert.equal(optionId('pair', ['Turtok', 'Glurak']), optionId('pair', ['Glurak', 'Turtok']));
  assert.equal(optionId('pokemon', 'Glurak'), 'Glurak');
});

test('voteResults bildet den Mittelwert und vergibt Raenge', () => {
  const award = { entity: 'pokemon', status: 'done',
    nominations: { Janik: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] },
    votes: { Janik: { A: 10, B: 6, C: 6 }, Henrik: { A: 9, B: 8, C: 8 } } };
  const rows = voteResults(award);
  assert.equal(rows[0].id, 'A');
  assert.equal(rows[0].avg, 9.5);
  assert.equal(rows[0].rank, 1);
  // Gleichstand teilt den Rang.
  assert.equal(rows[1].rank, 2);
  assert.equal(rows[2].rank, 2);
  assert.equal(awardWinner(award).id, 'A');
  // Stimmen ausserhalb 0..10 werden begrenzt.
  const clamped = voteResults({ entity: 'pokemon', nominations: { Janik: [{ id: 'A' }] },
    votes: { Janik: { A: 99 }, Henrik: { A: -5 } } });
  assert.equal(clamped[0].avg, 5);
});

test('awardWinner nur bei abgeschlossener Abstimmung', () => {
  const award = { entity: 'pokemon', status: 'voting',
    nominations: { Janik: [{ id: 'A' }] }, votes: { Janik: { A: 10 } } };
  assert.equal(awardWinner(award), null);
});

test('nextStatus: beide bestaetigt -> voting, beide gewaehlt -> done', () => {
  assert.equal(nextStatus({ status: 'nominating', confirmed: { Janik: true } }), 'nominating');
  assert.equal(nextStatus({ status: 'nominating', confirmed: { Janik: true, Henrik: true } }), 'voting');
  assert.equal(nextStatus({ status: 'voting', voted: { Janik: true } }), 'voting');
  assert.equal(nextStatus({ status: 'voting', voted: { Janik: true, Henrik: true } }), 'done');
});

test('revealSteps: von hinten nach vorn, Platz 1 und 2 gemeinsam', () => {
  const rows = [1, 2, 3, 4, 5].map((n) => ({ id: `P${n}`, rank: n }));
  const steps = revealSteps(rows);
  assert.deepEqual(steps.map((s) => s.map((r) => r.id)), [['P5'], ['P4'], ['P3'], ['P2', 'P1']]);
  // Nur zwei Optionen: ein einziger Schritt.
  assert.deepEqual(revealSteps(rows.slice(0, 2)).map((s) => s.map((r) => r.id)), [['P2', 'P1']]);
  // Eine einzige Option: ein Schritt, keine Sonderbehandlung noetig.
  assert.deepEqual(revealSteps(rows.slice(0, 1)).map((s) => s.map((r) => r.id)), [['P1']]);
  assert.deepEqual(revealSteps([]), []);
});

test('revealSteps: Gleichstand enthuellt die ganze Siegergruppe gemeinsam', () => {
  const three = [1, 1, 1, 4].map((rank, i) => ({ id: `P${i + 1}`, rank }));
  assert.deepEqual(revealSteps(three).map((s) => s.map((r) => r.id)), [['P4'], ['P3', 'P2', 'P1']]);
  const two = [1, 1, 3, 4].map((rank, i) => ({ id: `P${i + 1}`, rank }));
  assert.deepEqual(revealSteps(two).map((s) => s.map((r) => r.id)), [['P4'], ['P3'], ['P2', 'P1']]);
});

test('seasonTiers: Kaderstand schlaegt die neu eingestuften Stammdaten', () => {
  const teams = [
    { id: 's1-a', pokemon: [{ name: 'Hisui-Tornupto', tier: 'C' }, { name: 'Endynalos', tier: 'S' }] },
    { id: 's1-b', pokemon: [{ name: 'Knakrack', tier: 'A' }] },
  ];
  const tiers = seasonTiers(teams);
  // pokemon.json fuehrt laengst das Tier der kommenden Saison — der Kader die der Award-Saison.
  assert.equal(tierInSeason(tiers, { name: 'Hisui-Tornupto', tier: 'A' }), 'C');
  assert.equal(tierInSeason(tiers, { name: 'Endynalos', tier: 'S' }), 'S');
  // Ohne Kadereintrag bleiben die Stammdaten die Quelle.
  assert.equal(tierInSeason(tiers, { name: 'Zacian', tier: 'S' }), 'S');
  assert.equal(tierInSeason(tiers, { name: 'Unbekannt' }), null);
  assert.deepEqual(Object.keys(seasonTiers(null)), []);
});

test('awardWinners: bei Gleichstand auf Platz 1 gewinnen alle', () => {
  const tie = { entity: 'pokemon', status: 'done',
    nominations: { Janik: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] },
    votes: { Janik: { A: 9, B: 8, C: 4 }, Henrik: { A: 7, B: 8, C: 5 } } };
  const winners = awardWinners(tie);
  assert.deepEqual(winners.map((w) => w.id).sort(), ['A', 'B']);
  assert.deepEqual(winners.map((w) => w.rank), [1, 1]);
  // awardWinner bleibt die Kurzform fuer „einer davon".
  assert.equal(winners.some((w) => w.id === awardWinner(tie).id), true);
  // Ohne Abschluss gibt es keine Sieger.
  assert.deepEqual(awardWinners({ ...tie, status: 'voting' }), []);
});

test('awardableDays laesst alle Spieltage ab der Grenze zu', () => {
  assert.equal(MATCHDAY_AWARDS_FROM, 1);
  assert.deepEqual(awardableDays([1, 2, 3, 4, 5, 6, 7]), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(awardableDays([0, 1, 2]), [1, 2]);
  assert.deepEqual(awardableDays([Number.NaN, null, 3]), [3]);
  assert.deepEqual(awardableDays(null), []);
});

test('spoilerNote richtet sich nach dem anderen Spieler', () => {
  assert.match(spoilerNote({ seen: { Henrik: true } }, 'Janik'), /schon gesehen/);
  assert.match(spoilerNote({ seen: {} }, 'Janik'), /nicht spoilern/);
});
test('battleShareInRoster rechnet gegen alle Teamkaempfe, nicht nur das Aufgebot', () => {
  const teams = [
    { id: 't1', name: 'T1', player: 'Janik', pokemon: [monA, monB] },
    { id: 't2', name: 'T2', player: 'Henrik', pokemon: [monC] },
  ];
  // Zwei Matches von t1 mit je 1 ausgetragenen Kampf. Glurak steht nur im ersten
  // Aufgebot und nur in dessen Kampf, Turtok sitzt beide Male auf der Bank.
  const rs = [
    result('s1-d1-m0', 1, 't1', 't2', ['Glurak'], ['Bisaflor'],
      { home: ['Glurak'], away: ['Bisaflor'] }, []),
    result('s1-d2-m0', 2, 't1', 't2', ['Turtok'], ['Bisaflor'],
      { home: ['Turtok'], away: ['Bisaflor'] }, []),
  ];
  const byName = Object.fromEntries(pokemonStats(teams, rs, pokedex).map((s) => [s.pokemon.name, s]));
  // Glurak: 1 von 2 Teamkaempfen — im Aufgebot aber 1 von 1 moeglichen 3 Kaempfen.
  assert.equal(byName.Glurak.rosterBattles, 2);
  assert.equal(byName.Glurak.battleShareInRoster, 0.5);
  assert.equal(byName.Glurak.battleShareInMu.toFixed(4), (1 / 3).toFixed(4));
  // Turtok ebenso: 1 Einsatz, Nenner sind beide Teamkaempfe.
  assert.equal(byName.Turtok.rosterBattles, 2);
  assert.equal(byName.Turtok.battleShareInRoster, 0.5);
  // Ohne Einsatz bleibt die Quote 0, der Nenner zaehlt trotzdem.
  const scoped = pokemonStats([teams[1]], rs, pokedex, { scopeTeamId: 't2' });
  const bisaflor = scoped.find((s) => s.pokemon.name === 'Bisaflor');
  assert.equal(bisaflor.rosterBattles, 2);
  assert.equal(bisaflor.battleShareInRoster, 1);
});

test('draftPicks rekonstruiert die Snake-Reihenfolge', () => {
  const teams = [
    { id: 't1', name: 'T1', pokemon: [{ name: 'Glurak' }, { name: 'Turtok' }] },
    { id: 't2', name: 'T2', pokemon: [{ name: 'Bisaflor' }, { name: 'Pikachu' }] },
  ];
  const draft = { order: ['t1', 't2'], pickIndex: 4 };
  const picks = draftPicks(teams, draft, {}, pokedex, 2);
  assert.deepEqual(picks.map((p) => [p.pickNo, p.round, p.teamId, p.mon.name]), [
    [1, 1, 't1', 'Glurak'],
    [2, 1, 't2', 'Bisaflor'],
    // Runde 2 laeuft rueckwaerts durch die Order.
    [3, 2, 't2', 'Pikachu'],
    [4, 2, 't1', 'Turtok'],
  ]);
  // Stammdaten werden angereichert (Bild/Tier aus pokedex).
  assert.equal(picks[0].mon.tier, 'S');
});

test('draftPicks blendet Transfer-Zugaenge aus und markiert Abgaben', () => {
  // t1 hat Turtok abgegeben und Pikachu dazubekommen.
  const teams = [
    { id: 't1', name: 'T1', pokemon: [{ name: 'Glurak' }, { name: 'Pikachu' }] },
    { id: 't2', name: 'T2', pokemon: [{ name: 'Bisaflor' }, { name: 'Relaxo' }] },
  ];
  const transfer = {
    added: [{ teamId: 't1', name: 'Pikachu' }],
    removed: [{ teamId: 't1', name: 'Turtok', tier: 'A' }],
  };
  const picks = draftPicks(teams, { order: ['t1', 't2'], pickIndex: 4 }, transfer, pokedex, 2);
  const t1 = picks.filter((p) => p.teamId === 't1');
  assert.deepEqual(t1.map((p) => p.mon.name), ['Glurak', 'Turtok']);
  assert.deepEqual(t1.map((p) => p.gone), [false, true]);
  // Betroffene Teams sind als unscharf markiert, unbetroffene nicht.
  assert.equal(t1.every((p) => p.approx), true);
  assert.equal(picks.filter((p) => p.teamId === 't2').every((p) => p.approx), false);
  assert.equal(picks.some((p) => p.mon.name === 'Pikachu'), false);
});

test('draftPicks liefert nur die bereits getaetigten Picks', () => {
  const teams = [
    { id: 't1', name: 'T1', pokemon: [{ name: 'Glurak' }] },
    { id: 't2', name: 'T2', pokemon: [] },
  ];
  assert.equal(draftPicks(teams, { order: ['t1', 't2'], pickIndex: 1 }, {}, pokedex, 2).length, 1);
  assert.deepEqual(draftPicks(teams, { order: [], pickIndex: 0 }, {}, pokedex, 2), []);
});

test('pokezoneSlug bildet Basis-, Mega- und Regionalformen ab', () => {
  assert.equal(pokezoneSlug('Pikachu'), 'pikachu');
  assert.equal(pokezoneSlug('Kommo-o'), 'kommo-o');
  assert.equal(pokezoneSlug('Mr. Rime'), 'mr-rime');
  assert.equal(pokezoneSlug('Mega Audino'), 'audino-mega-audino');
  assert.equal(pokezoneSlug('Mega Charizard Y'), 'charizard-mega-charizard-y');
  assert.equal(pokezoneSlug('Hisuian Arcanine'), 'arcanine-hisuian-form');
  assert.equal(pokezoneSlug('Alolan Ninetales'), 'ninetales-alolan-form');
  assert.equal(pokezoneSlug('Galarian Slowking'), 'slowking-galarian-form');
  // Sonderformen aus der Ausnahmetabelle.
  assert.equal(pokezoneSlug('Rotom-Wash'), 'rotom-wash-rotom');
  assert.equal(pokezoneSlug('Paldean Tauros'), 'tauros-paldean-form-combat-breed');
  assert.equal(pokezoneSlug('Paldean Tauros Blaze'), 'tauros-paldean-form-blaze-breed');
  assert.equal(pokezoneSlug('Floette-Eternal'), 'floette-eternal-flower');
  assert.equal(pokezoneSlug('Lycanroc-Midday'), 'lycanroc');
  assert.equal(pokezoneSlug('Basculegion-Male'), 'basculegion');
  assert.equal(pokezoneSlug(''), '');
});

test('pokezoneUrl liefert die Detailseite oder null', () => {
  assert.equal(pokezoneUrl('Mega Audino'), 'https://www.pokemon-zone.com/champions/pokemon/audino-mega-audino/');
  assert.equal(pokezoneUrl(null), null);
});

test('parsePeriod liest die Amtszeiten des Startdatensatzes', () => {
  assert.deepEqual(parsePeriod('S1 Pre-S1 MD5'), { fromDay: null, untilDay: 5 });
  assert.deepEqual(parsePeriod('S1 MD6-Current'), { fromDay: 6, untilDay: null });
  assert.deepEqual(parsePeriod('S1 Pre-Current'), { fromDay: null, untilDay: null });
  assert.deepEqual(parsePeriod(''), { fromDay: null, untilDay: null });
});

test('normalizeTrainer vereinheitlicht Geschlecht und Adjektive', () => {
  assert.equal(normalizeGender('männlich'), 'm');
  assert.equal(normalizeGender('weiblich'), 'w');
  assert.equal(normalizeGender('was auch immer'), 'd');
  assert.deepEqual(parseTraits('ruhig, künstlerisch ,, vergesslich'), ['ruhig', 'künstlerisch', 'vergesslich']);
  const t = normalizeTrainer({ name: ' Valerie ', gender: 'weiblich', traits: 'ruhig, ruhig2', fromDay: 6 }, 't1');
  assert.equal(t.name, 'Valerie');
  assert.equal(t.gender, 'w');
  assert.deepEqual(t.traits, ['ruhig', 'ruhig2']);
  assert.equal(t.fromDay, 6);
  assert.equal(t.untilDay, null);
  assert.match(t.id, /^t1-valerie-/);
});

test('currentTrainer und Historie richten sich nach der Amtszeit', () => {
  const list = [
    { id: 'a', name: 'Kombu', fromDay: null, untilDay: 5 },
    { id: 'b', name: 'Valerie', fromDay: 6, untilDay: null },
  ];
  assert.equal(currentTrainer(list).name, 'Valerie');
  // Historie: neueste zuerst, mit Kennzeichnung des laufenden Amts.
  const hist = trainerHistory(list);
  assert.deepEqual(hist.map((t) => t.name), ['Valerie', 'Kombu']);
  assert.deepEqual(hist.map((t) => t.current), [true, false]);
  assert.equal(hist[1].period, 'Vor der Saison – Spieltag 5');
  assert.equal(periodLabel(list[1]), 'Ab Spieltag 6 – heute');
  // Ohne laufendes Amt gibt es keinen aktuellen Trainer.
  assert.equal(currentTrainer([{ id: 'a', fromDay: null, untilDay: 5 }]), null);
  assert.equal(currentTrainer([]), null);
});

test('Entlassung beendet das Amt und setzt den Nachfolger auf den Folgespieltag', () => {
  const list = [{ id: 'a', name: 'Colzo', fromDay: null, untilDay: null }];
  const after = withDismissed(list, 'a', 7);
  assert.equal(after[0].untilDay, 7);
  assert.equal(currentTrainer(after), null);
  assert.equal(nextFromDay(after, 7), 8);
  // Ohne gespielten Spieltag und ohne beendetes Amt bleibt „vor der Saison".
  assert.equal(nextFromDay([], null), null);
});

test('Statuspunkte werden verlustfrei in EVs uebersetzt', () => {
  // 1 SP = 8 EV; 32 SP wuerden 256 EV ergeben, der Deckel 252 liefert denselben Wert.
  assert.equal(spToEv(0), 0);
  assert.equal(spToEv(1), 8);
  assert.equal(spToEv(16), 128);
  assert.equal(spToEv(31), 248);
  assert.equal(spToEv(MAX_SP), 252);
  // Ausserhalb des Bereichs wird begrenzt.
  assert.equal(spToEv(99), 252);
  assert.equal(spToEv(-5), 0);
  assert.equal(evToSp(128), 16);
  assert.equal(evToSp(252), 32);
  assert.equal(evToSp(0), 0);
});

test('speciesKey trifft die Schluessel von @smogon/calc', () => {
  assert.equal(calcSpeciesKey('Charizard'), 'charizard');
  assert.equal(calcSpeciesKey('Mega Charizard Y'), 'charizardmegay');
  assert.equal(calcSpeciesKey('Mega Audino'), 'audinomega');
  assert.equal(calcSpeciesKey('Hisuian Arcanine'), 'arcaninehisui');
  assert.equal(calcSpeciesKey('Alolan Ninetales'), 'ninetalesalola');
  assert.equal(calcSpeciesKey('Galarian Slowking'), 'slowkinggalar');
  // Ausnahmen, die sich nicht aus dem Namen ableiten lassen.
  assert.equal(calcSpeciesKey('Paldean Tauros'), 'taurospaldeacombat');
  assert.equal(calcSpeciesKey('Lycanroc-Midday'), 'lycanroc');
  assert.equal(calcSpeciesKey('Aegislash'), 'aegislashshield');
  assert.equal(calcSpeciesKey('Mega Meowstic'), 'meowsticmmega');
  assert.equal(calcSpeciesKey(''), '');
});

test('Wesen tragen deutsche Namen mit Statusangabe', () => {
  assert.equal(natureByDe('Frech').en, 'Adamant');
  assert.equal(natureLabel('Frech'), 'Frech (Ang+, SpA−)');
  assert.equal(natureLabel('Robust'), 'Robust (neutral)');
  assert.equal(natureFor('atk', 'spa').de, 'Frech');
  assert.equal(natureFor(null, null).de, 'Robust');
  // Ein Statuswert kann nicht zugleich steigen und sinken.
  assert.equal(natureFor('atk', 'atk'), null);
});

test('SP-Felder des Movesets lesen und schreiben sich rund', () => {
  assert.deepEqual(parseSpField('32+'), { sp: 32, nat: 'up' });
  assert.deepEqual(parseSpField('14-'), { sp: 14, nat: 'down' });
  assert.deepEqual(parseSpField('24'), { sp: 24, nat: 'neutral' });
  assert.deepEqual(parseSpField(''), { sp: null, nat: 'neutral' });
  assert.deepEqual(parseSpField('Unsinn'), { sp: null, nat: 'neutral' });
  assert.equal(formatSpField(32, 'up'), '32+');
  assert.equal(formatSpField(0, 'neutral'), '0');

  const cfg = spSetToConfig({ atk: '32+', spe: '24', spa: '0-' });
  assert.equal(cfg.sp.atk, 32);
  assert.equal(cfg.sp.spe, 24);
  assert.equal(cfg.nature.de, 'Frech');
  // Und wieder zurueck: nur belegte Werte erscheinen.
  const set = configToSpSet(cfg.sp, cfg.nature);
  assert.equal(set.atk, '32+');
  assert.equal(set.spe, '24');
  assert.equal(set.spa, '0-');
  assert.equal(set.def, '');
});

test('Alte Freitext-Angaben werden nach bestem Wissen uebernommen', () => {
  // Enthaelt die Angabe einen Wert ueber 32, gilt die ganze Zeile als EV-Schreibweise.
  const out = parseLegacyEvs('252 Ang / 252 Init / 4 KP');
  assert.equal(out.atk, '32');
  assert.equal(out.spe, '32');
  assert.equal(out.hp, '1');
  assert.equal(out.def, '');
  // Bleiben alle Werte unter 33, sind es bereits SP.
  const sp = parseLegacyEvs('32 SpA, 16 Vert');
  assert.equal(sp.spa, '32');
  assert.equal(sp.def, '16');
  assert.equal(parseLegacyEvs('').spe, '');
});

test('Schadensausgabe rechnet in Prozent der KP', () => {
  assert.deepEqual(damagePercent(50, 60, 200), { min: 25, max: 30 });
  assert.equal(percentLabel({ min: 25, max: 30.5 }), '25 – 30,5 %');
  assert.equal(percentLabel(null), '—');
  assert.equal(hitsToKo(100), 1);
  assert.equal(hitsToKo(34), 3);
  assert.equal(hitsToKo(0), null);
  assert.equal(typeDe('Ice'), 'Eis');
  assert.equal(typeDe('Fairy'), 'Fee');
});

// === Presse =================================================================
// Aufbau: acht Teams, 14 Spieltage, Spieltage 1–7 vollstaendig gespielt.
const pressTeams = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k, i) => ({
  id: `s1-${k}`, season: 1, name: `Team ${k.toUpperCase()}`, player: i % 2 ? 'Henrik' : 'Janik',
  logo: `${k}.png`, order: i,
  trainers: [{ id: `tr-${k}`, name: `Trainer ${k}`, gender: 'd', traits: ['ruhig', 'akribisch'], fromDay: null, untilDay: null }],
  pokemon: Array.from({ length: 10 }, (_, n) => ({ name: `${k.toUpperCase()}mon${n}`, tier: 'B', cost: 10, types: ['Feuer'], base_speed: 80 })),
}));
const pressSchedule = {
  matchdays: Array.from({ length: 14 }, (_, d) => ({
    day: d + 1, leg: d < 7 ? 'hin' : 'rueck',
    matches: [
      { home: 's1-a', away: 's1-b' }, { home: 's1-c', away: 's1-d' },
      { home: 's1-e', away: 's1-f' }, { home: 's1-g', away: 's1-h' },
    ],
  })),
};
const pressResults = [];
pressSchedule.matchdays.slice(0, 7).forEach((md) => md.matches.forEach((m, i) => {
  const mons = (id, n) => Array.from({ length: n }, (_, x) => `${id.slice(3).toUpperCase()}mon${x}`);
  const used = { home: mons(m.home, 4), away: mons(m.away, 4) };
  const battle = () => ({
    done: true, used, score: { home: 2, away: 1 }, winner: 'home',
    kills: [{ victimSide: 'away', victim: used.away[0], killerSide: 'home', killer: used.home[0] }],
  });
  pressResults.push({
    id: `s1-d${md.day}-m${i}`, day: md.day, home: m.home, away: m.away,
    squads: { home: mons(m.home, 6), away: mons(m.away, 6) },
    battles: [battle(), battle(), battle()],
  });
}));
const pressTeamIds = pressTeams.map((t) => t.id);

test('Je Spieltag gibt es genau ein Interview und eine Pressekonferenz', () => {
  const slots = pressSlots('s1-a', pressSchedule, pressResults, [], true);
  const day9 = slots.filter((s) => s.day === 9);
  assert.equal(day9.length, 2);
  assert.deepEqual(day9.map((s) => s.type).sort(), ['interview', 'pk']);
  assert.deepEqual(day9.map((s) => s.slot), ['pre', 'post']);
  // Die Losung ist deterministisch, damit beide Geraete dasselbe sehen.
  assert.deepEqual(slotPlan('s1-a', 9), slotPlan('s1-a', 9));
  const plans = pressTeamIds.flatMap((id) => [8, 9, 10, 11, 12, 13, 14].map((d) => slotPlan(id, d).pre));
  assert.ok(plans.includes('pk') && plans.includes('interview'));
});

test('Der Termin nach dem Spiel wartet auf die Pressefreigabe', () => {
  // Der erste Spieltag ab Pressestart, komplett eingetragen — aber nicht freigegeben.
  const day = PRESS_FROM_DAY;
  const src = pressResults.find((r) => r.id === 's1-d1-m0');
  const played = [...pressResults, { ...src, id: `s1-d${day}-m0`, day }];
  const slotOf = (list, slot) => pressSlots('s1-a', pressSchedule, list, [], true)
    .find((x) => x.day === day && x.slot === slot);

  const before = slotOf(played, 'post');
  assert.equal(before.open, false);
  assert.equal(before.needsRelease, true);

  const released = played.map((r) => (r.id === `s1-d${day}-m0` ? { ...r, pressReady: true } : r));
  const after = slotOf(released, 'post');
  assert.equal(after.open, true);
  assert.equal(after.needsRelease, false);

  // „vor dem Spiel" haengt weiterhin nur am Ergebnis davor, nicht an der Freigabe.
  assert.equal(slotOf(played, 'pre').open, true);
});

test('Vor dem Pressestart gibt es keine Termine', () => {
  const slots = pressSlots('s1-a', pressSchedule, pressResults, [], true);
  // Die Ausblicksrunde trägt bewusst keinen Spieltag und bleibt hier außen vor.
  assert.equal(slots.filter((s) => s.day != null && s.day < PRESS_FROM_DAY).length, 0);
  // Ein bereits stattgefundener Termin bleibt sichtbar, auch wenn er davor liegt.
  const alt = slotPlan('s1-a', 3).pre;
  const mit = pressSlots('s1-a', pressSchedule, pressResults, [{ id: `s1-d3-s1-a-${alt}`, status: 'done' }], true);
  assert.equal(mit.filter((s) => s.day === 3).length, 2);
});

test('Termine haengen am Ergebnisstand des Spielplans', () => {
  const slots = pressSlots('s1-a', pressSchedule, pressResults, [], true);
  // Spieltag 8 laeuft noch nicht: „vor dem Spiel" ist frei, „nach dem Spiel" nicht.
  assert.equal(slots.find((s) => s.day === 8 && s.slot === 'pre').open, true);
  assert.equal(slots.find((s) => s.day === 8 && s.slot === 'post').open, false);
  assert.equal(slots.find((s) => s.day === 9 && s.slot === 'pre').open, false);
  const ids = slots.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('Die Ausblicksrunde öffnet erst, wenn die Saison komplett gespielt ist', () => {
  // pressResults deckt nur 7 der 14 Spieltage ab — die Saison läuft also noch.
  assert.equal(seasonComplete(pressSchedule, pressResults), false);
  const slot = outlookSlotFor('s1-a', pressSchedule, pressResults, []);
  assert.equal(slot.slot, 'outlook');
  assert.equal(slot.type, 'pk');
  assert.equal(slot.day, null, 'die Runde hängt an keinem Spieltag');
  assert.equal(slot.open, false);
  assert.equal(slot.blockedBy, 'season');
  assert.equal(slot.id, outlookSessionId('s1-a'));
  assert.equal(pressSlots('s1-a', pressSchedule, pressResults, [], true).filter((x) => x.slot === 'outlook').length, 1);

  // Mit vollständigem Ergebnisstand ist sie für jedes Team frei.
  const full = pressSchedule.matchdays.flatMap((md) => md.matches.map((m, i) => ({
    id: `s1-d${md.day}-m${i}`, day: md.day, home: m.home, away: m.away,
    battles: [{ done: true }, { done: true }, { done: true }],
  })));
  assert.equal(seasonComplete(pressSchedule, full), true);
  assert.equal(outlookSlotFor('s1-a', pressSchedule, full, []).open, true);
  const progress = outlookProgress(pressTeamIds, pressSchedule, full, [
    { id: outlookSessionId('s1-a'), status: 'done' },
  ]);
  assert.deepEqual(progress, { done: 1, total: 8 });
  assert.equal(OUTLOOK_QUESTIONS, 5);

  // Ein Team, das im Spielplan nicht vorkommt, bekommt auch keine Runde.
  assert.equal(outlookSlotFor('s1-zzz', pressSchedule, full, []), null);
});

test('Die Auftaktrunde umfasst 16 Termine und geht Spieltag 8 voraus', () => {
  const offen = pressSlots('s1-a', pressSchedule, pressResults, [], false);
  const bonus = offen.filter((s) => s.slot === 'bonus');
  assert.equal(bonus.length, 2);
  assert.deepEqual(bonus.map((s) => s.type).sort(), ['interview', 'pk']);
  assert.ok(bonus.every((s) => s.open));
  const d8 = offen.find((s) => s.day === BONUS_ROUND_DAY && s.slot === 'pre');
  assert.equal(d8.open, false);
  assert.equal(d8.blockedBy, 'bonus');

  assert.deepEqual(bonusRoundProgress(pressTeamIds, pressSchedule, []), { done: 0, total: 16 });
  const alle = pressTeamIds.flatMap((id) => bonusSlotsFor(id, pressSchedule, []).map((r) => ({ id: r.id, status: 'done' })));
  assert.equal(bonusRoundComplete(pressTeamIds, pressSchedule, alle.slice(0, 15)), false);
  assert.equal(bonusRoundComplete(pressTeamIds, pressSchedule, alle), true);
  assert.equal(pressSlots('s1-a', pressSchedule, pressResults, alle, true).find((s) => s.day === 8 && s.slot === 'pre').open, true);
});

test('Der Metadatensatz traegt Ergebnis, Tabelle, Kader und Trainer', () => {
  const articles = [{
    id: 'x', status: 'ready', category: 'spielbericht', title: 'Titel', body: '<p>Text</p>',
    authorId: 'alba', teamIds: ['s1-a'], day: 7, publishedAt: '2026-01-01T10:00:00.000Z',
    storylines: [{ id: 'trainerfrage-a', title: 'Trainerfrage', teams: ['s1-a'], status: 'eskaliert', summary: 'Stand' }],
  }];
  const ctx = buildContext(
    { teams: pressTeams, results: pressResults, schedule: pressSchedule, pokedex: [], eloRows: [], awardDocs: [], articles },
    { teamIds: ['s1-a', 's1-b'], matchId: 's1-d7-m0', day: 7 },
  );
  assert.equal(ctx.saison.zuletztGespielterSpieltag, 7);
  assert.equal(ctx.saison.verbleibendeSpieltage, 7);
  assert.equal(ctx.saison.phase, 'Saisonmitte');
  assert.equal(ctx.tabelle.length, 8);
  assert.equal(ctx.match.endstand, '3:0');
  assert.equal(ctx.match.kaempfe.length, 3);
  assert.equal(ctx.teams[0].kader.length, 10);
  assert.equal(ctx.teams[0].letzteErgebnisse.length, 5);
  assert.equal(ctx.teams[0].naechsteSpiele[0].spieltag, 8);
  assert.ok(ctx.teams[0].trainer.aktuell.persoenlichkeit.includes('ruhig'));
  assert.equal(ctx.laufendeGeschichten[0].status, 'eskaliert');
  assert.equal(ctx.letzteBerichte.length, 1);
});

test('Die Regie meidet zuletzt erzaehlte Straenge', () => {
  const dir = buildDirection(['formkrise', 'trainerdebatte']);
  assert.equal(dir.suggestions.length, 4);
  assert.ok(!dir.suggestions.some((a) => ['formkrise', 'trainerdebatte'].includes(a.key)));
  assert.ok(dir.text.includes('TONLAGE'));
  assert.ok(buildSystem({ author: { name: 'Alba', role: 'R', outlet: 'O', voice: 'V', beat: 'B' } }).includes('Alba'));
  assert.ok(DEFAULT_PROMPTS.report.length > 400);
});

test('Absaetze werden zu Markup, rohes HTML bleibt Text', () => {
  const html = paragraphsToHtml(['## Kopf', '> Zitat mit **fett**', 'Ein <b>roher</b> Absatz']);
  assert.ok(html.includes('<h3>Kopf</h3>'));
  assert.ok(html.includes('<blockquote>Zitat mit <strong>fett</strong></blockquote>'));
  assert.ok(html.includes('&lt;b&gt;roher&lt;/b&gt;'));
});

test('Der Stand einer Geschichte kommt aus dem juengsten Beitrag', () => {
  const stories = collectStorylines([
    { status: 'ready', day: 1, publishedAt: '2026-01-01', storylines: [{ id: 's', title: 'S', status: 'neu', summary: 'a', teams: [] }] },
    { status: 'ready', day: 2, publishedAt: '2026-01-02', storylines: [{ id: 's', title: 'S', status: 'beruhigt', summary: 'b', teams: [] }] },
  ]);
  assert.equal(stories.length, 1);
  assert.equal(stories[0].status, 'beruhigt');
  assert.equal(stories[0].beats, 2);
});

test('Der Filter „Redaktion" meint die Herkunft, nicht die Rubrik', () => {
  const eigen = { id: 'e', category: 'klatsch', editorial: true, teamIds: ['s1-a'], body: '<p>hallo</p>', title: 'T' };
  assert.equal(articleMatchesFilter(eigen, { category: 'redaktion' }), true);
  assert.equal(articleMatchesFilter(eigen, { category: 'klatsch' }), true);
  assert.equal(articleMatchesFilter(eigen, { category: 'news' }), false);
  assert.equal(articleMatchesFilter(eigen, { teamId: 's1-b' }), false);
  assert.equal(articleMatchesFilter(eigen, { q: 'hallo' }), true);
  assert.equal(new Set(randomAuthors(3).map((a) => a.id)).size, 3);
});

// === Rubriken ==============================================================
test('Ein Beitrag kann in mehreren Rubriken stehen', () => {
  const a = { category: 'news', categories: ['news', 'geruechte', AI_CATEGORY] };
  assert.deepEqual(categoriesOf(a), ['news', 'geruechte', 'erste-liga']);
  // Alt-Beiträge kennen nur `category`.
  assert.deepEqual(categoriesOf({ category: 'klatsch' }), ['klatsch']);
  // Unbekannte Schlüssel fallen raus, Dubletten ebenso.
  assert.deepEqual(categoriesOf({ category: 'news', categories: ['news', 'quatsch'] }), ['news']);
  assert.equal(articleMatchesFilter(a, { category: 'geruechte' }), true);
  assert.equal(articleMatchesFilter(a, { category: 'erste-liga' }), true);
  assert.equal(articleMatchesFilter(a, { category: 'klatsch' }), false);

  const norm = normalizeCategories('zweite-liga', ['informationen', 'zweite-liga']);
  assert.equal(norm.category, 'zweite-liga');
  assert.deepEqual(norm.categories, ['zweite-liga', 'informationen']);
  // Die automatische Rubrik steht im Editor nicht zur Wahl.
  assert.equal(manualCategories().some((c) => c.key === AI_CATEGORY), false);
});

// === Notizen ===============================================================
test('Private Notizen legen leere Einträge gar nicht erst an', () => {
  let n = blankNotes();
  n = withNote(n, 'teams', 's1-a', 'Gegner zieht Mega früh');
  n = withNote(n, 'matches', 's1-d1-m0', 'Lead tauschen');
  assert.equal(teamNote(n, 's1-a'), 'Gegner zieht Mega früh');
  assert.equal(matchNote(n, 's1-d1-m0'), 'Lead tauschen');
  assert.equal(countNotes(n), 2);
  n = withNote(n, 'teams', 's1-a', '   ');
  assert.equal(countNotes(n), 1);
  assert.equal(teamNote(n, 's1-a'), '');
  assert.equal(countNotes(normalizeNotes({ teams: { x: '' }, matches: null })), 0);
});

test('Der Kampfverlauf trägt die Abschnitte beider Spieler', () => {
  const log = {
    id: 's1-d1-m0',
    entries: { Janik: { text: 'Kampf 1 ging glatt.' }, Henrik: { text: '' } },
  };
  assert.equal(logText(log, 'Janik'), 'Kampf 1 ging glatt.');
  assert.equal(hasLog(log), true);
  assert.deepEqual(logAuthors(log), ['Janik']);
  assert.equal(logToText(log), 'Janik: Kampf 1 ging glatt.');
  assert.equal(hasLog({ entries: { Janik: { text: '  ' } } }), false);
});

// === Anmeldung =============================================================
await atest('Ein Konto prüft sein Passwort und nichts anderes', async () => {
  assert.deepEqual(AUTH_PLAYERS, ['Janik', 'Henrik']);
  assert.equal(userId('Janik'), 'janik');
  assert.equal(playerOf('henrik'), 'Henrik');
  assert.equal(otherPlayer('Janik'), 'Henrik');

  const { record, hash, dataKey } = await createCredential('Janik', 'ganz-geheim');
  assert.equal(record.player, 'Janik');
  assert.equal(record.auth.hash, hash);
  // Das Passwort selbst darf nirgends im Dokument auftauchen.
  assert.equal(JSON.stringify(record).includes('ganz-geheim'), false);
  assert.notEqual(record.auth.salt, record.enc.salt);

  assert.equal((await verifyCredential(record, 'ganz-geheim')).ok, true);
  assert.equal((await verifyCredential(record, 'Ganz-geheim')).ok, false);
  assert.equal((await verifyCredential(null, 'ganz-geheim')).ok, false);

  // Gerätesitzung: gültig, solange die Prüfsumme zum Konto passt.
  assert.equal(isValidSession({ player: 'Janik', hash }, record), true);
  assert.equal(isValidSession({ player: 'Janik', hash: 'x' }, record), false);
  assert.equal(isValidSession({ player: 'Henrik', hash }, record), false);

  // Derselbe Schlüssel entsteht bei jeder Anmeldung neu.
  assert.equal((await verifyCredential(record, 'ganz-geheim')).dataKey, dataKey);
});

await atest('Private Daten sind ohne das Passwort nicht lesbar', async () => {
  const a = await createCredential('Janik', 'passwort-a');
  const b = await createCredential('Henrik', 'passwort-b');
  const payload = await encryptJson(a.dataKey, { notiz: 'Mega zuerst', zahlen: [1, 2, 3] });
  assert.equal(JSON.stringify(payload).includes('Mega zuerst'), false);
  assert.deepEqual(await decryptJson(a.dataKey, payload), { notiz: 'Mega zuerst', zahlen: [1, 2, 3] });
  await assert.rejects(() => decryptJson(b.dataKey, payload));
  // Zwei Durchläufe erzeugen wegen des zufälligen IV nie dasselbe Chiffrat.
  const again = await encryptJson(a.dataKey, { notiz: 'Mega zuerst' });
  assert.notEqual(again.iv, payload.iv);
});

test('Ein Team gehört genau einem Spieler', () => {
  const teams = [
    { id: 's1-a', player: 'Janik' },
    { id: 's1-b', player: 'Henrik' },
    { id: 's1-c', player: 'Janik' },
  ];
  assert.equal(ownsTeam('Janik', teams[0]), true);
  assert.equal(ownsTeam('Janik', teams[1]), false);
  assert.equal(ownsTeam(null, teams[0]), false);
  assert.deepEqual(teamIdsOf('Janik', teams), ['s1-a', 's1-c']);
});

// === Siegerehrung: Varianten ===============================================
test('Es gibt fünf Inszenierungen, und gewählt wird zufällig', () => {
  assert.equal(CEREMONY_VARIANTS.length, 5);
  assert.equal(new Set(CEREMONY_VARIANTS.map((v) => v.key)).size, 5);
  assert.equal(new Set(CEREMONY_VARIANTS.map((v) => v.burst)).size, 5);
  CEREMONY_VARIANTS.forEach((v) => {
    ['lead', 'tease', 'hold', 'curtain'].forEach((k) => assert.equal(typeof v.timing[k], 'number'));
    assert.equal(VARIANT_BY_KEY[v.key], v);
  });
  // Die Ausschluss-Option liefert nie dieselbe Variante zurück.
  for (let i = 0; i < 30; i++) assert.notEqual(pickCeremonyVariant('gala').key, 'gala');
  // Das Tempo unterscheidet sich hörbar: Schlagzahl ist die schnellste, Gala die langsamste.
  const sum = (v) => v.timing.lead + v.timing.tease + v.timing.hold + v.timing.curtain;
  const sorted = [...CEREMONY_VARIANTS].sort((a, b) => sum(a) - sum(b));
  assert.equal(sorted[0].key, 'countdown');
  assert.equal(sorted[sorted.length - 1].key, 'gala');
});

// === Saison-Abschluss ======================================================
test('Das Drehbuch geht von unten nach oben und endet beim Meister', () => {
  const mk = (id, name, player) => ({
    id, season: 1, name, player, logo: `${id}.png`, order: 1,
    pokemon: [monA, monB, monC].map((m) => ({ ...m })),
    trainers: [{ id: `t-${id}`, name: `Trainer ${name}`, gender: 'd', traits: ['ruhig'], fromDay: null, untilDay: null }],
  });
  const teams = [mk('s1-a', 'Alpha', 'Janik'), mk('s1-b', 'Beta', 'Henrik')];
  const battle = (winner) => ({
    done: true, winner,
    used: { home: ['Glurak', 'Turtok'], away: ['Bisaflor', 'Glurak'] },
    score: { home: winner === 'home' ? 2 : 0, away: winner === 'away' ? 2 : 0 },
    kills: [{ victimSide: winner === 'home' ? 'away' : 'home', victim: 'Bisaflor', killerSide: winner, killer: 'Glurak' }],
  });
  const results = [
    { id: 's1-d1-m0', home: 's1-a', away: 's1-b', day: 1, squads: { home: ['Glurak'], away: ['Bisaflor'] }, battles: [battle('home'), battle('home'), battle('away')] },
    { id: 's1-d2-m0', home: 's1-b', away: 's1-a', day: 2, squads: { home: ['Bisaflor'], away: ['Glurak'] }, battles: [battle('away'), battle('away'), battle('home')] },
  ];
  const schedule = {
    matchdays: [
      { day: 1, leg: 'hin', matches: [{ home: 's1-a', away: 's1-b' }] },
      { day: 2, leg: 'rueck', matches: [{ home: 's1-b', away: 's1-a' }] },
    ],
  };

  const script = buildFinaleScript({ teams, results, schedule, pokedex, awardDocs: [] });
  assert.equal(script.complete, true);

  const kinds = script.scenes.map((s) => s.kind);
  assert.equal(kinds[0], 'intro');
  assert.equal(kinds[kinds.length - 1], 'outro');
  assert.equal(kinds[kinds.length - 2], 'trophy');

  const teamScenes = script.scenes.filter((s) => s.kind === 'team' || s.kind === 'champion');
  assert.equal(teamScenes.length, teams.length);
  // Letzter Platz zuerst, Meister zuletzt.
  assert.deepEqual(teamScenes.map((s) => s.place), [2, 1]);
  assert.equal(teamScenes[teamScenes.length - 1].kind, 'champion');
  assert.equal(teamScenes[teamScenes.length - 1].rank, 'champion');

  // Der Meister sieht seinen kompletten Kader, jede Szene kennt ihre Länge.
  const champ = teamScenes[teamScenes.length - 1];
  assert.equal(champ.rosterFull, true);
  assert.equal(champ.roster.length, 3);
  assert.equal(champ.ms, SCENE_MS.champion);
  assert.equal(champ.trainer.name.startsWith('Trainer '), true);
  assert.equal(champ.matches.length, 2);
  assert.equal(champ.path.points.length, 2);
  assert.ok(script.totalMs > 60000, 'Der Abschluss darf ruhig mehrere Minuten dauern');
});

test('Ohne vollständigen Spielplan ist die Saison nicht abgeschlossen', () => {
  const teams = [
    { id: 's1-a', season: 1, name: 'Alpha', player: 'Janik', pokemon: [] },
    { id: 's1-b', season: 1, name: 'Beta', player: 'Henrik', pokemon: [] },
  ];
  const schedule = { matchdays: [{ day: 1, leg: 'hin', matches: [{ home: 's1-a', away: 's1-b' }, { home: 's1-b', away: 's1-a' }] }] };
  const script = buildFinaleScript({ teams, results: [], schedule, pokedex, awardDocs: [] });
  assert.equal(script.complete, false);
  assert.equal(buildFinaleScript({ teams, results: [], schedule: { matchdays: [] }, pokedex }).complete, false);
});

// === Marktwerte ============================================================

test('Die Marktwert-Formel trifft alle vorgegebenen Stützstellen exakt', () => {
  MARKET_ANCHORS.forEach(([elo, value]) => {
    assert.equal(marketValue(elo), value, `Elo ${elo}`);
  });
});

test('Der Marktwert steigt streng monoton mit der Elo', () => {
  let prev = -1;
  for (let elo = 900; elo <= 2400; elo += 1) {
    const v = marketValueRaw(elo);
    assert.ok(v > prev, `bei Elo ${elo}`);
    prev = v;
  }
});

test('Gerundet wird in Stufen — je größer der Betrag, desto gröber', () => {
  assert.equal(roundMarketValue(234_567), 230_000);
  assert.equal(roundMarketValue(1_234_567), 1_200_000);
  assert.equal(roundMarketValue(6_234_567), 6_000_000);
  assert.equal(roundMarketValue(6_300_000), 6_500_000);
  assert.equal(roundMarketValue(23_400_000), 23_000_000);
  assert.equal(roundMarketValue(123_400_000), 125_000_000);
  assert.equal(roundMarketValue(0), 0);
  assert.equal(roundMarketValue(null), 0);
});

test('Beträge werden deutsch formatiert, Veränderungen mit Vorzeichen', () => {
  assert.equal(formatMarket(200_000_000), '200 Mio. €');
  assert.equal(formatMarket(1_500_000), '1,5 Mio. €');
  assert.equal(formatMarket(500_000), '500 Tsd. €');
  assert.equal(formatMarket(1_230_000_000), '1,23 Mrd. €');
  assert.equal(formatMarket(0), '—');
  assert.equal(formatMarket(10_000_000, { unit: false }), '10 Mio.');
  assert.equal(formatMarketDelta(0), '±0');
  assert.equal(formatMarketDelta(5_000_000), '+5 Mio. €');
  assert.equal(formatMarketDelta(-5_000_000), '−5 Mio. €');
  assert.equal(formatPercent(12.34), '+12,3 %');
  assert.equal(formatPercent(-4), '−4,0 %');
});

// Ein kleiner Sheet-Auszug: vier Pokémon, zwei Zeitpunkte, klare Tier-Grenzen.
const eloRows = [
  { name: 'Alpha', resolved: 'Alpha', rang: 1, elo: 1900, projectedTier: 'S', history: [
    { key: 's1-pre', label: 'S1 Pre', elo: 1700 },
    { key: 's1-md1', label: 'S1 MD1', elo: 1750 },
    { key: 's1-md2', label: 'S1 MD2', elo: 1900 },
  ] },
  { name: 'Beta', resolved: 'Beta', rang: 2, elo: 1700, projectedTier: 'A', history: [
    { key: 's1-pre', label: 'S1 Pre', elo: 1750 },
    { key: 's1-md1', label: 'S1 MD1', elo: 1720 },
    { key: 's1-md2', label: 'S1 MD2', elo: 1700 },
  ] },
  { name: 'Gamma', resolved: 'Gamma', rang: 3, elo: 1500, projectedTier: 'B', history: [
    { key: 's1-pre', label: 'S1 Pre', elo: 1400 },
    { key: 's1-md1', label: 'S1 MD1', elo: 1450 },
    { key: 's1-md2', label: 'S1 MD2', elo: 1500 },
  ] },
  { name: 'Delta', resolved: 'Delta', rang: 4, elo: 1300, projectedTier: 'C', history: [
    { key: 's1-pre', label: 'S1 Pre', elo: 1300 },
    { key: 's1-md1', label: 'S1 MD1', elo: 1300 },
  ] },
];

test('Tier-Grenzen werden aus dem Sheet abgeleitet und sind lückenlos', () => {
  const bounds = tierBoundaries(eloRows);
  assert.deepEqual(bounds.map((b) => b.tier), ['S', 'A', 'B', 'C']);
  assert.equal(bounds[0].maxElo, null, 'oben offen');
  assert.equal(bounds[bounds.length - 1].minElo, null, 'unten offen');
  assert.equal(bounds[0].minElo, 1800);
  assert.equal(tierForElo(bounds, 2000), 'S');
  assert.equal(tierForElo(bounds, 1799), 'A');
  assert.equal(tierForElo(bounds, 1000), 'C');
  assert.equal(tierForElo(bounds, null), null);
});

test('Der Verlauf liefert Marktwerte je Zeitpunkt, leere Spalten fallen heraus', () => {
  const pts = historyPoints(eloRows[0]);
  assert.equal(pts.length, 3);
  assert.equal(pts[0].value, marketValue(1700));
  assert.equal(pts[2].value, marketValue(1900));
  const stops = historyStops(eloRows);
  assert.deepEqual(stops.map((s) => s.key), ['s1-pre', 's1-md1', 's1-md2']);
  assert.equal(stops[2].short, 'ST 2');
  assert.equal(parseHistoryLabel('S1 Transfer').kind, 'transfer');
  assert.equal(parseHistoryLabel('S1 Post').kind, 'post');
  assert.equal(historyKey('S1 MD3'), 's1-md3');
});

test('Kaderwert und Kaderverlauf summieren die gerundeten Einzelwerte', () => {
  const index = eloIndex(eloRows);
  const squad = [{ name: 'Alpha' }, { name: 'Gamma' }];
  assert.equal(squadMarketValue(squad, index), marketValue(1900) + marketValue(1500));
  const verlauf = squadHistory(squad, index, historyStops(eloRows));
  assert.equal(verlauf.length, 3);
  assert.equal(verlauf[0].value, marketValue(1700) + marketValue(1400));
  // Ein Pokémon ohne Wert zu diesem Zeitpunkt zieht die Summe nicht auf null.
  const mitLuecke = squadHistory([{ name: 'Delta' }], index, historyStops(eloRows));
  assert.equal(mitLuecke.length, 2);
});

test('Zwei Momentaufnahmen ergeben Tier-Wechsel sowie Gewinner und Verlierer', () => {
  const before = { Alpha: { elo: 1700, tier: 'A' }, Beta: { elo: 1750, tier: 'A' } };
  const after = { Alpha: { elo: 1900, tier: 'S' }, Beta: { elo: 1700, tier: 'A' } };
  const diff = diffSnapshots(before, after);
  assert.equal(diff.total, 2);
  assert.equal(diff.changed, 2);
  assert.equal(diff.tierChanges.length, 1);
  assert.equal(diff.tierChanges[0].name, 'Alpha');
  assert.equal(diff.tierChanges[0].tierDelta, 1);
  assert.equal(diff.up[0].name, 'Alpha');
  assert.equal(diff.up[0].delta, marketValue(1900) - marketValue(1700));
  assert.ok(diff.up[0].pct > 0);
  assert.equal(diff.down[0].name, 'Beta');
  assert.ok(diff.down[0].delta < 0);
  // Neue Namen ohne Vorgängerstand tauchen nicht als Gewinner auf.
  assert.equal(diffSnapshots({}, after).total, 0);
});

test('Der Sprung auf einen Spieltag kommt ohne lokale Momentaufnahme aus', () => {
  assert.equal(stopKeyForDay(eloRows, 2), 's1-md2');
  assert.equal(stopKeyForDay(eloRows, 9), null);
  const diff = historyDiff(eloRows, 's1-md2');
  // Delta hat keinen Wert für MD2 und bleibt außen vor.
  assert.equal(diff.total, 3);
  assert.equal(diff.up[0].name, 'Alpha');
  // Alpha springt zwischen den beiden Spieltagen von A nach S.
  assert.equal(diff.tierChanges.length, 1);
  assert.equal(diff.tierChanges[0].name, 'Alpha');
  assert.equal(diff.tierChanges[0].fromTier, 'A');
  assert.equal(diff.tierChanges[0].toTier, 'S');
});

test('Die Momentaufnahme überspringt Zeilen ohne Elo', () => {
  const snap = snapshotOf([...eloRows, { resolved: 'Ohne', elo: null, projectedTier: 'D' }]);
  assert.equal(Object.keys(snap).length, 4);
  assert.equal(snap.Alpha.tier, 'S');
});

// === Ergebnis-Zusammenführung ==============================================
test('Ein fertiger Kampf wird nie durch einen leeren ersetzt', () => {
  const blank = { done: false, used: { home: [], away: [] }, score: { home: 0, away: 0 }, winner: null, kills: [] };
  const full = (n) => ({
    done: true,
    used: { home: ['A', 'B', 'C', 'D'], away: ['E', 'F', 'G', 'H'] },
    score: { home: n, away: 4 - n }, winner: 'home',
    kills: [{ victimSide: 'away', victim: 'E', killerSide: 'home', killer: 'A' }],
  });
  const existing = {
    home: 's1-a', away: 's1-b', day: 1,
    squads: { home: ['A', 'B', 'C', 'D', 'X', 'Y'], away: ['E', 'F', 'G', 'H', 'V', 'W'] },
    battles: [full(3), full(2), full(1)],
    videoUrl: 'https://youtu.be/aaaaaaaaaaa',
    pressReady: true,
  };
  // Ein veraltetes Formular schreibt nur den dritten Kampf.
  const stale = {
    home: 's1-a', away: 's1-b', day: 1,
    squads: { home: [], away: [] },
    battles: [blank, blank, full(4)],
  };
  const merged = mergeResult(existing, stale);
  assert.equal(merged.battles[0].done, true);
  assert.equal(merged.battles[0].score.home, 3);
  assert.equal(merged.battles[2].score.home, 4, 'der neu eingetragene Kampf gewinnt');
  assert.deepEqual(merged.squads.home, existing.squads.home, 'ein leeres Aufgebot ersetzt kein gefülltes');
  assert.equal(merged.videoUrl, existing.videoUrl, 'Felder, die die Eingabe nicht kennt, bleiben stehen');
  assert.equal(merged.pressReady, true);
  // Ohne Bestand bleibt das Neue unverändert.
  assert.deepEqual(mergeResult(null, stale), stale);
});

// === Videos ================================================================
test('Video-Adressen werden erkannt, egal in welcher YouTube-Schreibweise', () => {
  const id = 'dQw4w9WgXcQ';
  ['https://www.youtube.com/watch?v=' + id,
    'https://youtu.be/' + id,
    'https://www.youtube.com/shorts/' + id,
    'https://www.youtube.com/live/' + id,
    'https://www.youtube.com/embed/' + id,
    'youtube.com/watch?v=' + id,
  ].forEach((url) => assert.equal(youtubeId(url), id, url));

  assert.equal(youtubeId('https://example.com/video.mp4'), null);
  assert.equal(normalizeVideoUrl('  '), '');
  assert.equal(normalizeVideoUrl('javascript:alert(1)'), '');

  const embed = videoEmbed(`https://youtu.be/${id}?t=1m5s`);
  assert.equal(embed.kind, 'youtube');
  assert.equal(embed.start, 65);
  assert.ok(embed.embedUrl.includes('start=65'));
  assert.ok(embed.embedUrl.startsWith('https://www.youtube-nocookie.com/embed/'));

  const other = videoEmbed('https://example.com/spiel');
  assert.equal(other.kind, 'link');
  assert.equal(other.embedUrl, null);
  assert.equal(videoHostLabel('https://www.example.com/x'), 'example.com');
  assert.equal(videoEmbed(''), null);
});

// === Presse-Bausteine ======================================================
test('Ein Baustein steht allein im Absatz und nennt seine Art', () => {
  assert.deepEqual(parseTile('[marktwert: Glurak]'), { kind: 'marktwert', key: 'Glurak' });
  assert.deepEqual(parseTile('  [ergebnis:s1-d3-m0] '), { kind: 'ergebnis', key: 's1-d3-m0' });
  assert.equal(parseTile('Davor noch Text [video: s1-d3-m0]'), null);
  assert.equal(parseTile('[unbekannt: x]'), null);
  assert.deepEqual(TILE_KINDS, ['marktwert', 'verlauf', 'statistik', 'team', 'trainer', 'ergebnis', 'tabelle', 'video', 'bild']);
  assert.deepEqual(parseTile('[tabelle: top]'), { kind: 'tabelle', key: 'top' });
});

test('Ein Bild aus dem Auftrag landet in einer Kachel, nie im Fliesstext', () => {
  const url = 'https://beispiel.test/foto.png';
  assert.deepEqual(imageUrlsIn(`Nimm ${url} und sonst nichts`), [url]);
  assert.deepEqual(imageUrlsIn('ohne Bild'), []);

  // Nackte Adresse im Text: raus damit, dafuer eine Kachel.
  const fixed = withImageTiles(`<p>Dazu ${url} ansehen.</p>`, [url]);
  assert.ok(!fixed.includes(`>Dazu ${url}`));
  assert.ok(fixed.includes(`[bild: ${url}]`));

  // Steht die Kachel schon da, bleibt sie, wo sie ist — und kommt nicht doppelt.
  const kept = withImageTiles(`<p>[bild: ${url}]</p><p>Text</p>`, [url]);
  assert.equal(kept.split('[bild:').length - 1, 1);
  assert.ok(kept.startsWith(`<p>[bild: ${url}]</p>`));

  // Nur http(s) auf ein Bild — alles andere baut keine Kachel.
  assert.equal(tileHtml(parseTile('[bild: javascript:alert(1)]')), null);
  assert.ok(tileHtml(parseTile(`[bild: ${url}]`)).includes(url));
});

// === Kaderstand vor und nach dem Wintertransfer ============================
test('Der Marktwert-Verlauf rechnet vor dem Transfer mit dem damaligen Kader', () => {
  const stops = [
    { key: 's1-pre', label: 'S1 Pre', kind: 'pre', season: 1, day: null },
    { key: 's1-md1', label: 'S1 MD1', kind: 'md', season: 1, day: 1 },
    { key: 's1-md5', label: 'S1 MD5', kind: 'md', season: 1, day: 5 },
  ];
  const team = { id: 's1-a', pokemon: [{ name: 'Alt' }, { name: 'Neu' }] };
  const transfer = {
    removed: [{ teamId: 's1-a', name: 'Weg' }],
    added: [{ teamId: 's1-a', name: 'Neu' }],
  };
  // Ohne Transfer-Spalte entscheidet der letzte Spieltag der Hinrunde.
  const cut = transferCutIndex(stops, { season: 1, afterDay: 4 });
  assert.equal(cut, 2, 'der erste Zeitpunkt nach Spieltag 4');

  assert.deepEqual(rosterBeforeTransfer(team, transfer).sort(), ['Alt', 'Weg']);
  assert.deepEqual(rosterAtIndex(team, transfer, 1, cut).sort(), ['Alt', 'Weg']);
  assert.deepEqual(rosterAtIndex(team, transfer, 2, cut).sort(), ['Alt', 'Neu']);

  const spans = rosterSpans(team, transfer, stops, cut);
  const by = Object.fromEntries(spans.map((s) => [s.name, s]));
  assert.deepEqual([...by.Weg.keys], ['s1-pre', 's1-md1'], 'der Abgang endet am Transfer');
  assert.deepEqual([...by.Neu.keys], ['s1-md5'], 'der Zugang beginnt am Transfer');
  assert.equal(by.Alt.keys.size, 3);
  assert.equal(by.Weg.left, true);
  assert.equal(by.Neu.joined, true);

  // Eine eigene Transfer-Spalte schlägt den Spieltags-Ersatz.
  const withColumn = [...stops.slice(0, 2), { key: 's1-tr', label: 'S1 Transfer', kind: 'transfer', season: 1, day: null }, stops[2]];
  assert.equal(transferCutIndex(withColumn, { season: 1, afterDay: 4 }), 2);
  // Ohne jeden Anhaltspunkt gilt überall der heutige Kader.
  assert.equal(transferCutIndex(stops, { season: 1 }), -1);
  assert.deepEqual(rosterAtIndex(team, transfer, 0, -1).sort(), ['Alt', 'Neu']);
});

test('Der Kaderverlauf summiert zu jedem Zeitpunkt die damaligen Pokémon', () => {
  const stops = [
    { key: 'p', label: 'S1 Pre', short: 'Vor S1', kind: 'pre', season: 1, day: null },
    { key: 'm5', label: 'S1 MD5', short: 'ST 5', kind: 'md', season: 1, day: 5 },
  ];
  const index = {
    Alt: { resolved: 'Alt', history: [{ key: 'p', elo: 1300 }, { key: 'm5', elo: 1300 }] },
    Weg: { resolved: 'Weg', history: [{ key: 'p', elo: 1300 }, { key: 'm5', elo: 2100 }] },
    Neu: { resolved: 'Neu', history: [{ key: 'p', elo: 2100 }, { key: 'm5', elo: 1300 }] },
  };
  const team = { id: 's1-a', pokemon: [{ name: 'Alt' }, { name: 'Neu' }] };
  const transfer = { removed: [{ teamId: 's1-a', name: 'Weg' }], added: [{ teamId: 's1-a', name: 'Neu' }] };
  const cut = 1;
  const pts = squadHistory((stop, i) => rosterAtIndex(team, transfer, i, cut), index, stops);
  // Vorher Alt+Weg = 2 Mio, nachher Alt+Neu = 2 Mio — mit dem heutigen Kader wären
  // es vorher 1 Mio + 200 Mio gewesen.
  assert.equal(pts[0].value, 2_000_000);
  assert.equal(pts[1].value, 2_000_000);
});

// === Rekorde ===============================================================
test('Einen geteilten Rekord halten alle Beteiligten', () => {
  const teams = [
    { id: 's1-a', season: 1, name: 'Alpha', order: 1, player: 'Janik', pokemon: [{ name: 'Glurak' }] },
    { id: 's1-b', season: 1, name: 'Beta', order: 2, player: 'Henrik', pokemon: [{ name: 'Turtok' }] },
  ];
  const mk = (id, day, killer) => ({
    id, home: 's1-a', away: 's1-b', day,
    squads: { home: ['Glurak', 'Lahmus'], away: ['Turtok'] },
    battles: [{
      done: true,
      used: { home: ['Glurak', 'Lahmus'], away: ['Turtok'] },
      score: { home: 2, away: 0 }, winner: 'home',
      kills: [{ victimSide: 'away', victim: 'Turtok', killerSide: 'home', killer }],
    }],
  });
  const recs = buildRecords({
    teams,
    results: [mk('s1-d1-m0', 1, 'Glurak'), mk('s1-d2-m0', 2, 'Lahmus')],
    pokedex: [{ name: 'Glurak' }, { name: 'Lahmus' }, { name: 'Turtok' }],
  });
  const battleKills = recs.find((r) => r.key === 'battleKills');
  assert.equal(battleKills.value, 1);
  assert.deepEqual(battleKills.holders.map((h) => h.name).sort(), ['Glurak', 'Lahmus']);
  // Jeder Halter trägt seinen eigenen Zeitpunkt.
  assert.deepEqual(battleKills.holders.map((h) => h.when.day).sort(), [1, 2]);
  // Die Kurzform zeigt weiterhin auf den ersten Halter.
  assert.equal(battleKills.holder, battleKills.holders[0]);
  assert.equal(battleKills.when, battleKills.holders[0].when);
});

// === Tabelle: was noch möglich ist =========================================
test('Die Tabelle nennt offene Partien und das Punktemaximum', () => {
  const teams = [
    { id: 's1-a', season: 1, name: 'Alpha', order: 1, player: 'Janik', pokemon: [] },
    { id: 's1-b', season: 1, name: 'Beta', order: 2, player: 'Henrik', pokemon: [] },
  ];
  const schedule = {
    matchdays: [
      { day: 1, leg: 'hin', matches: [{ home: 's1-a', away: 's1-b' }] },
      { day: 2, leg: 'rueck', matches: [{ home: 's1-b', away: 's1-a' }] },
    ],
  };
  const win = { done: true, used: { home: [], away: [] }, score: { home: 4, away: 0 }, winner: 'home', kills: [] };
  const results = [{ id: 's1-d1-m0', home: 's1-a', away: 's1-b', day: 1, squads: {}, battles: [win, win, win] }];
  const rows = standingsBlock(teams, results, schedule);
  const alpha = rows.find((r) => r.teamId === 's1-a');
  const beta = rows.find((r) => r.teamId === 's1-b');
  assert.equal(alpha.punkte, 3);
  assert.equal(alpha.offeneMatches, 1);
  assert.equal(alpha.maximalPunkte, 6);
  assert.equal(beta.punkte, 0);
  // Beta kann Alpha noch einholen — drei Punkte Rückstand sind hier keine Entscheidung.
  assert.equal(beta.maximalPunkte, 3);
  assert.ok(beta.maximalPunkte >= alpha.punkte);
});

// --- Wintertransfer: das Kaderfenster ---------------------------------------
test('Ein im Winter geholtes Pokémon zählt erst ab der Rückrunde im Nenner', () => {
  const schedule = {
    matchdays: [
      { day: 1, leg: 'hin', matches: [{ home: 's1-a', away: 's1-b' }] },
      { day: 2, leg: 'rueck', matches: [{ home: 's1-b', away: 's1-a' }] },
    ],
  };
  const transfer = {
    removed: [{ teamId: 's1-a', name: 'Bisaflor' }],
    added: [{ teamId: 's1-a', name: 'Turtok' }],
  };
  const avail = transferAvailability(transfer, schedule);
  assert.deepEqual(avail['s1-a|Turtok'], { from: 2, until: null });
  assert.deepEqual(avail['s1-a|Bisaflor'], { from: null, until: 1 });
  // Ohne Eintrag gilt ein Pokémon durchgehend als verfügbar.
  assert.equal(availableOn(avail, 's1-a', 'Glurak', 1), true);
  assert.equal(availableOn(avail, 's1-a', 'Turtok', 1), false);
  assert.equal(availableOn(avail, 's1-a', 'Turtok', 2), true);
  assert.equal(availableOn(avail, 's1-a', 'Bisaflor', 2), false);

  const teams = [
    { id: 's1-a', name: 'Alpha', player: 'Janik', pokemon: [monA, monB] },
    { id: 's1-b', name: 'Beta', player: 'Henrik', pokemon: [monC] },
  ];
  const b = (used) => ({ done: true, used, score: { home: 2, away: 1 }, winner: 'home', kills: [] });
  const results = [
    { id: 's1-d1-m0', day: 1, home: 's1-a', away: 's1-b', squads: { home: ['Glurak'], away: ['Bisaflor'] },
      battles: [b({ home: ['Glurak'], away: ['Bisaflor'] })] },
    { id: 's1-d2-m0', day: 2, home: 's1-b', away: 's1-a', squads: { home: ['Bisaflor'], away: ['Glurak', 'Turtok'] },
      battles: [b({ home: ['Bisaflor'], away: ['Turtok'] })] },
  ];
  const withWindow = pokemonStats(teams, results, pokedex, { scopeTeamId: 's1-a', availability: avail });
  const turtok = withWindow.find((s) => s.pokemon.name === 'Turtok');
  // Nur der Kampf des zweiten Spieltags steht im Nenner — der erste war ohne Turtok.
  assert.equal(turtok.rosterBattles, 1);
  assert.equal(turtok.battleShareInRoster, 1);

  const without = pokemonStats(teams, results, pokedex, { scopeTeamId: 's1-a' });
  assert.equal(without.find((s) => s.pokemon.name === 'Turtok').rosterBattles, 2);

  // Dasselbe im Detailprofil: die Hinrunde ist für Turtok keine Bank-Zeit.
  const prof = pokemonProfile('Turtok', teams, results, pokedex, { availability: avail });
  assert.equal(prof.teamMatchesPlayed, 1);
  assert.equal(prof.matchupPct, 1);
  assert.equal(pokemonProfile('Turtok', teams, results, pokedex).teamMatchesPlayed, 2);
});

// --- Draft ab Saison 2 -------------------------------------------------------
const s2dex = [
  { name: 'Glurak', tier: 'S', image: 'g.png' },
  { name: 'Turtok', tier: 'A', image: 't.png' },
  { name: 'Bisaflor', tier: 'A', image: 'b.png' },
  { name: 'Pikachu', tier: 'D', image: 'p.png' },
];
const s2teams = [
  // Vorsaison
  { id: 's1-alpha', season: 1, name: 'Alpha', player: 'Janik', pokemon: [{ name: 'Glurak', tier: 'S' }, { name: 'Turtok', tier: 'A' }, { name: 'Bisaflor', tier: 'A' }] },
  { id: 's1-beta', season: 2 - 1, name: 'Beta', player: 'Henrik', pokemon: [{ name: 'Pikachu', tier: 'D' }] },
  // Neue Saison
  { id: 's2-alpha', season: 2, name: 'Alpha', player: 'Janik', pokemon: [] },
  { id: 's2-beta', season: 2, name: 'Beta', player: 'Henrik', pokemon: [] },
];

test('Der Vorsaison-Kader hängt am Franchise, nicht an der Team-ID', () => {
  const prev = previousRosters(s2teams, 2, s2dex);
  assert.deepEqual(Object.keys(prev).sort(), ['s2-alpha', 's2-beta']);
  assert.deepEqual(prev['s2-alpha'].map((p) => p.name).sort(), ['Bisaflor', 'Glurak', 'Turtok']);
  assert.equal(prev['s2-alpha'].find((p) => p.name === 'Glurak').tier, 'S');
});

test('Eine Vertragsverlängerung verfällt, sobald ihr Tier leer oder voll ist', () => {
  const prev = previousRosters(s2teams, 2, s2dex);
  const draft = { order: ['s2-alpha', 's2-beta'], pickIndex: 0, renewals: [] };
  const open = renewalState('s2-alpha', prev['s2-alpha'], draft, new Set(), []);
  const byTier = Object.fromEntries(open.map((r) => [r.tier, r]));
  assert.equal(byTier.S.status, 'open');
  assert.deepEqual(byTier.A.options.map((o) => o.name).sort(), ['Bisaflor', 'Turtok']);
  assert.equal(byTier.B.status, 'expired', 'ohne Pokémon im Tier gibt es nichts zu verlängern');
  assert.ok(hasOpenRenewal(open));

  // Beide A-Pokémon weg -> die Verlängerung verfällt von selbst.
  const taken = new Set(['Turtok', 'Bisaflor']);
  const after = renewalState('s2-alpha', prev['s2-alpha'], draft, taken, []);
  assert.equal(after.find((r) => r.tier === 'A').status, 'expired');

  // Tier bereits regulär gefüllt -> ebenfalls verfallen.
  const full = renewalState('s2-alpha', prev['s2-alpha'], draft, new Set(), [{ tier: 'A' }, { tier: 'A' }]);
  assert.equal(full.find((r) => r.tier === 'A').status, 'expired');

  // Eingelöst bleibt eingelöst.
  const used = renewalState('s2-alpha', prev['s2-alpha'],
    { ...draft, renewals: [{ teamId: 's2-alpha', tier: 'S', name: 'Glurak', round: 0 }] }, new Set(['Glurak']), []);
  assert.equal(used.find((r) => r.tier === 'S').status, 'used');
  assert.equal(used.find((r) => r.tier === 'S').name, 'Glurak');
});

test('Das Fenster öffnet je Runde und schließt, wenn alle entschieden haben', () => {
  const order = ['a', 'b', 'c', 'd'];
  const always = () => true;
  assert.deepEqual(snakeOrder(order, 0), ['a', 'b', 'c', 'd']);
  assert.deepEqual(snakeOrder(order, 1), ['d', 'c', 'b', 'a']);
  assert.equal(renewalTurn({ order, renewalRound: 0, renewalDone: [] }, always).teamId, 'a');
  assert.equal(renewalTurn({ order, renewalRound: 0, renewalDone: ['a'] }, always).teamId, 'b');
  assert.equal(renewalTurn({ order, renewalRound: 1, renewalDone: [] }, always).teamId, 'd');
  assert.equal(renewalTurn({ order, renewalRound: 0, renewalDone: order }, always), null);
  assert.equal(renewalTurn({ order, renewalRound: null, renewalDone: [] }, always), null);
  // Wer nichts mehr einzulösen hat, steht gar nicht erst in der Schlange.
  assert.equal(renewalTurn({ order, renewalRound: 0, renewalDone: [] }, (id) => id === 'c').teamId, 'c');
});

test('Ein verlängerter Zug ist vorgezogen — die Runde behält ihre Länge', () => {
  const order = ['a', 'b', 'c', 'd'];
  const draft = { order, pickIndex: 0, renewals: [] };
  assert.equal(draftCurrentPick(draft).teamId, 'a');
  assert.equal(draftCurrentPick({ ...draft, pickIndex: 3 }).teamId, 'd');
  // Runde 2 läuft rückwärts.
  assert.equal(draftCurrentPick({ ...draft, pickIndex: 4 }).teamId, 'd');

  // 'c' hat Runde 1 per Verlängerung eröffnet: sein Zug ist weg, der Rest rückt auf.
  const withRenewal = { order, pickIndex: 1, renewals: [{ teamId: 'c', tier: 'S', name: 'X', round: 0 }] };
  assert.equal(renewedIn(withRenewal, 0).has('c'), true);
  assert.equal(draftCurrentPick(withRenewal).teamId, 'a');
  assert.equal(draftCurrentPick({ ...withRenewal, pickIndex: 2 }).teamId, 'b');
  assert.equal(draftCurrentPick({ ...withRenewal, pickIndex: 3 }).teamId, 'd');
  // Und die Runde ist nach vier Zügen vorbei.
  assert.equal(draftCurrentPick({ ...withRenewal, pickIndex: 4 }).round, 2);
});

test('Die Draft-Reihenfolge folgt der Endtabelle, die Aufsteiger schließen an', () => {
  const row = (id, player) => ({ team: { id, player } });
  const prevTable = [
    row('s1-t1', 'Janik'), row('s1-t2', 'Henrik'), row('s1-t3', 'Janik'),
    row('s1-t4', 'Henrik'), row('s1-t5', 'Janik'), row('s1-t6', 'Henrik'),
    row('s1-t7', 'Janik'), row('s1-t8', 'Henrik'),
  ];
  const keep = ['t1', 't2', 't3', 't4', 't5', 't6'].map((f, i) => ({ id: `s2-${f}`, player: i % 2 === 0 ? 'Janik' : 'Henrik' }));

  // Je Spieler ein Aufsteiger: Der Abstiegsplatz entscheidet (7 vor 8).
  const mixed = buildDraftOrder({
    prevTable,
    teams: [...keep, { id: 's2-neuJ', player: 'Janik' }, { id: 's2-neuH', player: 'Henrik' }],
  });
  assert.equal(mixed.choice, null);
  assert.deepEqual(mixed.order.slice(0, 6), keep.map((t) => t.id));
  assert.deepEqual(mixed.order.slice(6), ['s2-neuJ', 's2-neuH']);

  // Beide Aufsteiger gehören einem Spieler: Das kann nur er entscheiden.
  const same = buildDraftOrder({
    prevTable,
    teams: [...keep, { id: 's2-neuA', player: 'Janik' }, { id: 's2-neuB', player: 'Janik' }],
  });
  assert.equal(same.order.length, 6);
  assert.equal(same.choice.player, 'Janik');
  assert.deepEqual(same.choice.options.sort(), ['s2-neuA', 's2-neuB']);

  const chosen = buildDraftOrder({
    prevTable,
    teams: [...keep, { id: 's2-neuA', player: 'Janik' }, { id: 's2-neuB', player: 'Janik' }],
    firstPromoted: 's2-neuB',
  });
  assert.equal(chosen.choice, null);
  assert.deepEqual(chosen.order.slice(6), ['s2-neuB', 's2-neuA']);

  // Ohne Vorsaison bleibt es bei der Auslosung.
  assert.deepEqual(buildDraftOrder({ prevTable: [], teams: keep }).order, []);
});

test('Die Neuzugänge einer Saison kommen aus dem Feld „since"', () => {
  const dex = [
    { name: 'Alt', tier: 'S', cost: 20 },
    { name: 'Neu klein', tier: 'D', cost: 3, since: 2 },
    { name: 'Neu groß', tier: 'S', cost: 18, since: 2 },
    { name: 'Später', tier: 'A', cost: 15, since: 3 },
  ];
  assert.deepEqual(newcomersOfSeason(dex, 2).map((p) => p.name), ['Neu groß', 'Neu klein']);
  assert.deepEqual(newcomersOfSeason(dex, 3).map((p) => p.name), ['Später']);
  assert.deepEqual(newcomersOfSeason(dex, 1), []);
  assert.equal(RENEWAL_TIERS.length, 5);
});


// === Draftplan ==============================================================

const dpDex = [
  { name: 'Feuervogel', tier: 'S', types: ['Feuer', 'Flug'], base_speed: 120, cost: 20, image: 'a.png' },
  { name: 'Wasserwand', tier: 'S', types: ['Wasser'], base_speed: 60, cost: 20, image: 'b.png' },
  { name: 'Steinbrocken', tier: 'S', types: ['Gestein'], base_speed: 30, cost: 19, image: 'c.png' },
  { name: 'Blattwerk', tier: 'A', types: ['Pflanze'], base_speed: 80, cost: 15, image: 'd.png' },
  { name: 'Stahlkern', tier: 'A', types: ['Stahl'], base_speed: 45, cost: 15, image: 'e.png' },
  { name: 'Erdling', tier: 'B', types: ['Boden'], base_speed: 20, cost: 10, image: 'f.png' },
  { name: 'Flatterer', tier: 'B', types: ['Flug'], base_speed: 140, cost: 10, image: 'g.png' },
];

function dpPlan() {
  const plan = blankPlan('s2-team');
  plan.slots.S1 = ['Feuervogel', 'Wasserwand'];
  plan.slots.S2 = ['Steinbrocken'];
  plan.slots.A1 = ['Blattwerk', 'Stahlkern'];
  plan.paths = [
    { id: 'root', name: 'Plan A', color: '#e3350d', parentId: null, own: { S1: 'Feuervogel', S2: 'Steinbrocken', A1: 'Blattwerk' }, order: null, note: '' },
    { id: 'fork', name: 'Ohne Feuervogel', color: '#3aa9ff', parentId: 'root', own: { S1: 'Wasserwand', A1: 'Stahlkern' }, order: null, note: '' },
    { id: 'deep', name: 'Tief', color: '#ffcb05', parentId: 'fork', own: { A1: 'Blattwerk' }, order: null, note: '' },
  ];
  plan.activePathId = 'root';
  return plan;
}

test('Ein Pfad erbt lebendig: nur die Abweichungen liegen bei ihm', () => {
  const plan = dpPlan();
  assert.deepEqual(effectivePicks(plan, 'root'), { S1: 'Feuervogel', S2: 'Steinbrocken', A1: 'Blattwerk' });
  assert.deepEqual(effectivePicks(plan, 'fork'), { S1: 'Wasserwand', S2: 'Steinbrocken', A1: 'Stahlkern' });
  // Das Enkelkind zieht A1 zurueck, erbt S1 aber weiterhin vom Elternpfad.
  assert.deepEqual(effectivePicks(plan, 'deep'), { S1: 'Wasserwand', S2: 'Steinbrocken', A1: 'Blattwerk' });

  // Eine Korrektur im Hauptplan wandert in jede Abzweigung, die dort nichts Eigenes hat.
  plan.paths[0].own.S2 = null;
  assert.equal(effectivePicks(plan, 'fork').S2, null);
});

test('Die Trennstelle ist der erste Slot, an dem Eltern und Kind auseinandergehen', () => {
  const plan = dpPlan();
  assert.deepEqual(divergence(plan, 'fork'), { slot: 'S1', own: 'Wasserwand', parent: 'Feuervogel' });
  assert.equal(divergence(plan, 'root'), null);
  assert.deepEqual(orderedPaths(plan).map((r) => [r.path.id, r.depth]), [['root', 0], ['fork', 1], ['deep', 2]]);
});

test('Ein gespeicherter Plan wird beim Oeffnen geradegezogen', () => {
  const broken = {
    slots: { S1: ['Feuervogel', 'Feuervogel'], XX: ['Quatsch'] },
    paths: [
      { id: 'a', name: 'A', parentId: 'gibtsnicht', own: { S1: 'Feuervogel', S2: 'Nicht im Slot', A1: null } },
      { id: 'b', name: 'B', parentId: 'c', own: {} },
      { id: 'c', name: 'C', parentId: 'b', own: {} },
    ],
    activePathId: 'weg',
  };
  const plan = normalizePlan(broken, 's2-team');
  assert.deepEqual(plan.slots.S1, ['Feuervogel']);          // doppelt raus
  assert.equal(plan.slots.XX, undefined);                   // unbekannter Slot raus
  assert.equal(plan.paths[0].parentId, null);               // verwaist -> Wurzel
  assert.equal(plan.paths[0].own.S2, undefined);            // Wahl ohne Kandidat zaehlt nicht
  assert.equal(plan.paths[0].own.A1, null);                 // bewusst leer bleibt erhalten
  assert.equal(plan.activePathId, 'a');                     // unbekannter aktiver Pfad
  assert.deepEqual(plan.order, SLOT_KEYS);
  assert.ok(effectivePicks(plan, 'b'));                     // Zyklus haengt nicht
  assert.equal(MAX_PATHS >= 8, true);
});

test('Im laufenden Draft entscheidet die Lage, welcher Pfad noch traegt', () => {
  const plan = dpPlan();
  const teams = [
    { id: 's2-team', pokemon: [{ name: 'Steinbrocken', tier: 'S' }] },
    { id: 's2-gegner', pokemon: [{ name: 'Feuervogel', tier: 'S' }] },
  ];
  const live = liveState(teams, 's2-team');
  assert.equal(monState('Steinbrocken', 'S', live), 'secured');
  assert.equal(monState('Feuervogel', 'S', live), 'lost');
  assert.equal(monState('Wasserwand', 'S', live), 'open');

  // Plan A wollte Feuervogel — der ist weg.
  const a = pathViability(effectivePicks(plan, 'root'), live);
  assert.equal(a.ok, false);
  assert.equal(a.reason, 'weg');
  assert.deepEqual(a.blocked.map((b) => b.name), ['Feuervogel']);
  // Die Abzweigung traegt noch, Steinbrocken ist bereits gesichert.
  const b = pathViability(effectivePicks(plan, 'fork'), live);
  assert.equal(b.ok, true);
  assert.deepEqual(b.secured, ['Steinbrocken']);
  assert.deepEqual(nextTarget(plan, 'fork', live), { slot: 'S1', name: 'Wasserwand', state: 'open' });

  // Ein eigener Pick ausserhalb des Pfades schliesst ihn ebenso aus: Tier S ist damit voll.
  const own = liveState([{ id: 's2-team', pokemon: [{ name: 'Steinbrocken', tier: 'S' }, { name: 'Wasserwand', tier: 'S' }] }], 's2-team');
  const c = pathViability(effectivePicks(plan, 'root'), own);
  assert.equal(c.ok, false);
  assert.equal(c.reason, 'eigener-pick');
  // Und ein volles Tier raeumt die uebrigen Kandidaten dieses Tiers ab.
  assert.equal(monState('Feuervogel', 'S', own), 'lost');
});

test('Ohne laufenden Draft ist jeder Pfad erreichbar', () => {
  const live = liveState([], 's2-team');
  assert.equal(live.active, false);
  assert.equal(pathViability({ S1: 'Feuervogel' }, live).ok, true);
  assert.equal(monState('Feuervogel', 'S', live), 'open');
});

test('Die Wunschreihenfolge liegt am Plan und laesst sich je Pfad ueberschreiben', () => {
  const plan = dpPlan();
  plan.order = ['C1', ...SLOT_KEYS.filter((k) => k !== 'C1')];
  assert.equal(effectiveOrder(plan, 'root')[0], 'C1');
  assert.equal(effectiveOrder(plan, 'deep')[0], 'C1');
  plan.paths[1].order = ['D2', ...SLOT_KEYS.filter((k) => k !== 'D2')];
  assert.equal(effectiveOrder(plan, 'fork')[0], 'D2');
  assert.equal(effectiveOrder(plan, 'deep')[0], 'D2');   // erbt vom Elternpfad
  assert.equal(effectiveOrder(plan, 'root')[0], 'C1');
});

test('Duenne Stellen sind die Slots ohne Ersatz', () => {
  const plan = dpPlan();
  const live = liveState([], 's2-team');
  const risks = planRisks(plan, 'root', live);
  const byslot = Object.fromEntries(risks.map((r) => [r.slot, r.alternatives]));
  assert.equal(byslot.S1, 1);   // Wasserwand bleibt als Ersatz
  assert.equal(byslot.S2, 0);   // Steinbrocken ist allein im Slot
});

test('Das Typenprofil zaehlt je Angriffstyp und gewichtet den Druck', () => {
  const rows = coverageOf([dpDex[0], dpDex[6]]);   // beide Flug -> Elektro trifft doppelt
  const elektro = rows.find((r) => r.type === 'Elektro');
  assert.equal(elektro.weak, 2);
  assert.equal(elektro.net, 2);
  assert.ok(elektro.pressure > 0);
  const boden = rows.find((r) => r.type === 'Boden');
  assert.equal(boden.immune, 2);
  assert.ok(riskScore([dpDex[0], dpDex[6]]) > riskScore([dpDex[0]]));
  // Gestein trifft den Feuer/Flug-Vogel vierfach und wiegt damit schwerer als Elektro.
  assert.equal(weakSpots([dpDex[0], dpDex[6]], 1)[0].type, 'Gestein');
});

test('Ein Vorschlag muss den Bedrohungswert tatsaechlich senken', () => {
  const mons = [dpDex[0], dpDex[6]];              // zweimal Flug, schwach gegen Elektro
  const out = suggestCoverage(mons, dpDex, { exclude: new Set(mons.map((m) => m.name)) });
  assert.ok(out.length);
  out.forEach((r) => assert.ok(r.gain > 0));
  // Der beste Vorschlag haelt dem groessten Druck stand.
  assert.ok(out[0].covers.some((c) => c.type === 'Gestein' || c.type === 'Elektro'));
  // Ein bereits gedraftetes Pokemon taucht nicht auf.
  const live = liveState([{ id: 'x', pokemon: [{ name: 'Erdling', tier: 'B' }] }], 's2-team');
  assert.equal(suggestCoverage(mons, dpDex, { exclude: new Set(mons.map((m) => m.name)), live })
    .some((r) => r.mon.name === 'Erdling'), false);
});

test('Die Initiative-Leiste kennt nur Luecken ZWISCHEN eigenen Pokemon', () => {
  const prof = speedProfile([dpDex[2], dpDex[6]], dpDex, { gapPool: 1 });
  assert.equal(prof.min, 20);
  assert.equal(prof.max, 140);
  assert.equal(prof.pins.length, 2);
  assert.equal(prof.pins[0].pct, (30 - 20) / 120 * 100);
  assert.equal(prof.gaps.length, 1);
  assert.deepEqual([prof.gaps[0].from, prof.gaps[0].to], [30, 140]);
  // Unterhalb des langsamsten und oberhalb des schnellsten wird nichts markiert.
  const single = speedProfile([dpDex[1]], dpDex, { gapPool: 1 });
  assert.equal(single.gaps.length, 0);
  // Jede Marke bekommt eine Zeile zugewiesen, damit sie sich nicht verdecken.
  prof.pins.forEach((p) => assert.ok(Number.isInteger(p.row)));
});

test('Die Kurzfassung eines Pfades zaehlt Slots, Punkte und Gesichertes', () => {
  const plan = dpPlan();
  const live = liveState([{ id: 's2-team', pokemon: [{ name: 'Steinbrocken', tier: 'S' }] }], 's2-team');
  const sum = pathSummary(plan, 'fork', dpDex, live);
  assert.equal(sum.filled, 3);
  assert.equal(sum.total, 10);
  assert.equal(sum.cost, 20 + 19 + 15);
  assert.equal(sum.secured, 1);
  assert.equal(sum.ok, true);
  assert.deepEqual(pathMons(plan, 'fork', dpDex).map((m) => m.slot), ['S1', 'S2', 'A1']);
  assert.deepEqual(usageMap(plan).S1.Wasserwand.sort(), ['deep', 'fork']);
});

console.log(`\n${passed} Tests bestanden.`);
