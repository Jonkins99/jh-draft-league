// Reine Logik-Tests fuer scoring.mjs — Ausfuehren: node scripts/test-scoring.mjs
import assert from 'node:assert/strict';
import {
  pokemonStats, pokemonProfile,
  showdownSpecies, showdownExport,
  speedAt, speedTiers, speedCases, clampSp, applySpeedMod,
  teamBattleTotals, isMega, baseFormOf, normalizeNature,
} from '../resources/js/scoring.mjs';
import {
  mergedOptions, voteResults, awardWinner, awardWinners, nextStatus, revealSteps,
  optionId, spoilerNote, awardableDays, MATCHDAY_AWARDS_FROM,
} from '../resources/js/awards.mjs';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok -', name); }

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

test('speedCases: Default sind 0 UND 32 SP, je beide Wesen', () => {
  const cases = speedCases(100);
  assert.deepEqual(cases.map((c) => c.label), ['0', '0+', '32', '32+']);
  const t = speedTiers(100);
  assert.equal(cases[0].speed, t.s0, 'Default-Fall 0 SP neutral wie speedTiers');
  assert.equal(cases[2].speed, t.s32);
  assert.equal(cases[3].speed, t.s32n);
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
  assert.deepEqual(keys, ['sp0', 'sp0n', 'sp32', 'sp32n']);
  assert.equal(new Set(keys).size, keys.length);
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
  const all = speedCases(100, { nat: 'all' });
  assert.deepEqual(all.map((c) => c.key), ['sp0d', 'sp0', 'sp0n', 'sp32d', 'sp32', 'sp32n']);
  assert.deepEqual(all.map((c) => c.label), ['0-', '0', '0+', '32-', '32', '32+']);
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

test('awardableDays blendet Spieltage vor dem Rollout aus', () => {
  assert.deepEqual(awardableDays([1, 2, 3, 4, 5, 6, 7]), [6, 7]);
  assert.equal(MATCHDAY_AWARDS_FROM, 6);
  assert.deepEqual(awardableDays([1, 2]), []);
  assert.deepEqual(awardableDays(null), []);
});

test('spoilerNote richtet sich nach dem anderen Spieler', () => {
  assert.match(spoilerNote({ seen: { Henrik: true } }, 'Janik'), /schon gesehen/);
  assert.match(spoilerNote({ seen: {} }, 'Janik'), /nicht spoilern/);
});
console.log(`\n${passed} Tests bestanden.`);
