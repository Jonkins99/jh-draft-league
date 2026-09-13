// Deutsche Namen fuer Attacken, Faehigkeiten und Items erzeugen.
// Ausfuehren mit:  node scripts/build-i18n-de.mjs
//
// Der Schadensrechner rechnet mit @smogon/calc, das ausschliesslich englische
// Namen kennt. Diese Bruecke wird EINMAL erzeugt und als statische Datei
// ausgeliefert (public/data/i18n-de.json) — zur Laufzeit gibt es keine externen
// Abfragen. Quelle sind die Lokalisierungs-CSVs des PokeAPI-Repos
// (oeffentlich, ohne Key); Sprach-IDs: 6 = Deutsch, 9 = Englisch.
//
// Eintraege ohne deutschen Namen (z. B. die neuen Mega-Steine aus Pokemon
// Champions) fehlen bewusst — die Oberflaeche faellt dort auf den englischen
// Namen zurueck.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pkg from '@smogon/calc';

const { MOVES, ABILITIES, ITEMS, toID } = pkg;

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const DE = '6';
const EN = '9';

async function csv(name) {
  const res = await fetch(`${BASE}/${name}.csv`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const text = await res.text();
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      // Namen duerfen Kommas enthalten, also nur die ersten beiden Felder trennen.
      const a = line.indexOf(',');
      const b = line.indexOf(',', a + 1);
      return { id: line.slice(0, a), lang: line.slice(a + 1, b), name: line.slice(b + 1) };
    });
}

async function build(file, calcNames, label) {
  const rows = await csv(file);
  const de = new Map();
  const en = new Map();
  rows.forEach((r) => {
    if (r.lang === DE) de.set(r.id, r.name);
    else if (r.lang === EN) en.set(r.id, r.name);
  });
  const byId = new Map(calcNames.map((n) => [toID(n), n]));
  const out = {};
  let hits = 0;
  for (const [id, deName] of de) {
    const enName = en.get(id);
    if (!enName) continue;
    const calcName = byId.get(toID(enName));
    if (!calcName || out[deName]) continue;
    out[deName] = calcName;
    hits++;
  }
  const withoutDe = calcNames.filter((n) => !Object.values(out).includes(n));
  console.log(`${label}: ${hits} deutsche Namen · ${withoutDe.length} Einträge bleiben englisch`);
  return out;
}

const moves = await build('move_names', Object.keys(MOVES[9]), 'Attacken');
const abilities = await build('ability_names', ABILITIES[9], 'Fähigkeiten');
const items = await build('item_names', ITEMS[9], 'Items');

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'public', 'data');
mkdirSync(target, { recursive: true });
const file = join(target, 'i18n-de.json');
writeFileSync(file, `${JSON.stringify({ moves, abilities, items })}\n`);
console.log(`\n→ ${file}`);
