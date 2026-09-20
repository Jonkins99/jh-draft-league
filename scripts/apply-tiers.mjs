// Tier-Einstufung des Draft-Pools aus dem Elo-Sheet uebernehmen.
//
//   node scripts/apply-tiers.mjs            # zeigt nur, was sich aendern wuerde
//   node scripts/apply-tiers.mjs --write    # schreibt public/data/pokemon.json
//
// Vor jedem Draft stuft das Sheet den gesamten Pool neu ein: Spalte D haelt das Tier,
// mit dem ein Pokémon in die kommende Saison geht. Diese Datei zieht das in die
// Stammdaten nach — sie sind die einzige Tier-Quelle der Anwendung (und damit auch
// die Grundlage der Vertragsverlaengerungen, siehe RENEWAL_TIER_SOURCE).
//
// DIE PUNKTE WANDERN MIT, BEHALTEN ABER IHREN RANG. Jedes Tier hat vier Punktstufen
// (S 20–17, A 16–13, B 12–9, C 8–5, D 4–1). Wechselt ein Pokémon das Tier, bekommt es
// dieselbe Stufe INNERHALB des neuen Tiers — wer in A ganz oben stand, steht in S ganz
// oben. Erfunden wird dabei nichts: Die Reihenfolge stammt weiterhin aus dem alten
// Wert, nur das Band verschiebt sich. Ohne das stuende am Ende „Tier S · 9 Punkte".
//
// Nur lesender Zugriff auf das oeffentliche Sheet, kein Firestore.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ELO_GVIZ_URL, resolveEloName } from '../resources/js/elo.mjs';

const TIER_BANDS = { S: 17, A: 13, B: 9, C: 5, D: 1 };
const TIERS = Object.keys(TIER_BANDS);

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'public', 'data', 'pokemon.json');
const write = process.argv.includes('--write');

function normalize(name) {
  return String(name || '').replace(/ /g, ' ').trim();
}

const text = await (await fetch(ELO_GVIZ_URL, { cache: 'no-cache' })).text();
const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
const labels = (json.table?.cols || []).map((c) => normalize(c.label).toLowerCase());
const idxName = labels.findIndex((c) => c.includes('pok'));
const idxTier = labels.findIndex((c) => c.startsWith('tier'));
if (idxName < 0 || idxTier < 0) {
  console.error('Im Sheet fehlt die Spalte „Pokémon" oder „Tier".');
  process.exit(1);
}

const sheet = new Map();
(json.table?.rows || []).forEach((r) => {
  const c = r.c || [];
  const name = resolveEloName(normalize(c[idxName]?.v));
  const tier = normalize(c[idxTier]?.v).toUpperCase();
  if (name && TIERS.includes(tier)) sheet.set(name, tier);
});

const dex = JSON.parse(readFileSync(file, 'utf8'));
const changes = [];
const missing = [];

dex.forEach((p) => {
  const next = sheet.get(p.name);
  if (!next) { missing.push(p.name); return; }
  if (next === p.tier) return;
  const offset = Number.isFinite(p.cost) ? Math.max(0, Math.min(3, p.cost - TIER_BANDS[p.tier])) : null;
  const cost = offset == null ? p.cost : TIER_BANDS[next] + offset;
  changes.push({ name: p.name, from: p.tier, to: next, cost: p.cost, nextCost: cost });
  p.tier = next;
  p.cost = cost;
});

const byMove = {};
changes.forEach((c) => { const k = `${c.from} → ${c.to}`; byMove[k] = (byMove[k] || 0) + 1; });
const dist = {};
dex.forEach((p) => { dist[p.tier] = (dist[p.tier] || 0) + 1; });

console.log(`${changes.length} von ${dex.length} Pokémon wechseln das Tier.`);
Object.entries(byMove).sort().forEach(([k, n]) => console.log(`  ${k}: ${n}`));
console.log(`Neue Verteilung: ${TIERS.map((t) => `${t} ${dist[t] || 0}`).join(' · ')}`);
if (missing.length) {
  console.log(`\n! Im Sheet nicht gefunden (Tier bleibt): ${missing.join(', ')}`);
}

if (!write) {
  console.log('\nProbelauf — nichts geschrieben. Mit --write uebernehmen.');
  process.exit(0);
}

writeFileSync(file, `${JSON.stringify(dex, null, 2)}\n`, 'utf8');
console.log(`\n✓ ${file} geschrieben.`);
