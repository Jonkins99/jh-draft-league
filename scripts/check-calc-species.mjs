// Prueft, ob sich jeder Eintrag aus public/data/pokemon.json auf eine Spezies
// von @smogon/calc abbilden laesst (Grundlage des Schadensrechners).
// Ausfuehren mit:  node scripts/check-calc-species.mjs
//
// Kein Firestore-Zugriff, keine Netzwerkabfrage — reine Datenpruefung. Faellt
// ein Name durch, gehoert er in SPECIES_OVERRIDES in resources/js/damagecalc.mjs.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pkg from '@smogon/calc';
import { speciesKey, CALC_GEN } from '../resources/js/damagecalc.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dex = JSON.parse(readFileSync(join(here, '..', 'public', 'data', 'pokemon.json'), 'utf8'));
const gen = pkg.Generations.get(CALC_GEN);

const missing = dex.filter((p) => !gen.species.get(speciesKey(p.name_en)));
console.log(`${dex.length - missing.length}/${dex.length} Pokémon aufgelöst.`);
missing.forEach((p) => console.log(` ! ${p.name} (${p.name_en}) → ${speciesKey(p.name_en)}`));
process.exit(missing.length ? 1 : 0);
