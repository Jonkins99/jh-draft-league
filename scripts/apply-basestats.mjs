// Die sechs Statuswerte aus dem Champions-Dex von Smogon übernehmen.
//
//   node scripts/apply-basestats.mjs            # zeigt nur, was sich ändern würde
//   node scripts/apply-basestats.mjs --write    # schreibt public/data/pokemon.json
//
// Quelle ist https://www.smogon.com/dex/champions/pokemon/ — die Seite trägt ihre
// Daten als JSON im Block `dexSettings`, ein Schlüssel ist nicht nötig. Geschrieben
// wird je Pokémon ein Feld `stats: { hp, atk, def, spa, spd, spe }`; `base_speed`
// bleibt daneben stehen (Speed-Tiers, Draftplan und Presse lesen es weiterhin).
//
// Zugeordnet wird über denselben Speziesschlüssel wie im Schadensrechner
// (`speciesKey`), die Smogon-Namen („Charizard-Mega-Y") ergeben ohne Satzzeichen
// genau diesen Schlüssel. Zwei Formen heißen dort anders und stehen in ALIASES.
//
// Nur lesender Zugriff auf eine öffentliche Seite, kein Firestore.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { speciesKey } from '../resources/js/damagecalc.mjs';

const SOURCE = 'https://www.smogon.com/dex/champions/pokemon/';
const KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const ALIASES = { aegislashshield: 'aegislash', meowstic: 'meowsticm' };

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'public', 'data', 'pokemon.json');
const write = process.argv.includes('--write');

const toId = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const html = await (await fetch(SOURCE, { headers: { 'User-Agent': 'Mozilla/5.0 (jhdl apply-basestats)' } })).text();
const m = html.match(/dexSettings\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
if (!m) throw new Error('dexSettings nicht gefunden — hat Smogon den Seitenaufbau geändert?');
const settings = JSON.parse(m[1]);
const basics = (settings.injectRpcs || []).find(([key]) => String(key).includes('dump-basics'))?.[1];
const mons = basics?.pokemon || [];
if (!mons.length) throw new Error('Keine Pokémon im Dex gefunden.');
const byId = new Map(mons.map((x) => [toId(x.name), x]));

const dex = JSON.parse(readFileSync(file, 'utf8'));
const missing = [];
const speedDiff = [];
let changed = 0;
dex.forEach((p) => {
  const key = speciesKey(p.name_en || p.name);
  const src = byId.get(ALIASES[key] || key);
  if (!src) { missing.push(`${p.name} (${p.name_en})`); return; }
  const stats = Object.fromEntries(KEYS.map((k) => [k, Number(src[k])]));
  if (KEYS.some((k) => !Number.isFinite(stats[k]))) { missing.push(`${p.name} (unvollständig)`); return; }
  if (p.base_speed != null && p.base_speed !== stats.spe) speedDiff.push(`${p.name}: ${p.base_speed} → ${stats.spe}`);
  if (JSON.stringify(p.stats) !== JSON.stringify(stats)) changed += 1;
  p.stats = stats;
});

console.log(`${dex.length} Pokémon · ${dex.length - missing.length} zugeordnet · ${changed} geändert`);
if (missing.length) console.log(`Ohne Treffer:\n  ${missing.join('\n  ')}`);
if (speedDiff.length) console.log(`Initiative weicht von base_speed ab (base_speed bleibt unverändert):\n  ${speedDiff.join('\n  ')}`);

if (write) {
  writeFileSync(file, `${JSON.stringify(dex, null, 2)}\n`, 'utf8');
  console.log(`\n→ ${file}`);
} else {
  console.log('\nProbelauf — mit --write wird geschrieben.');
}
