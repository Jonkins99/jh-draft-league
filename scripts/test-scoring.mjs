// Reine Logik-Tests fuer scoring.mjs — Ausfuehren: node scripts/test-scoring.mjs
import assert from 'node:assert/strict';
import {
  pokemonStats, pokemonProfile,
  showdownSpecies, showdownExport,
} from '../resources/js/scoring.mjs';

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

console.log(`\n${passed} Tests bestanden.`);
