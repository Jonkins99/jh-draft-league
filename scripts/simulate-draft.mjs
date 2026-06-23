// Simuliert einen vollstaendigen, regelkonformen Snake-Draft und schreibt das
// Ergebnis nach Firestore (status: done). Nur zum Anschauen — danach reset-draft.mjs.
// Ausfuehren mit:  node scripts/simulate-draft.mjs

import { readFile } from 'node:fs/promises';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyC7tfkjU9iXb-cjwVQEOxYl2anNMRHMgqo',
  authDomain: 'draftleague-cf07f.firebaseapp.com',
  projectId: 'draftleague-cf07f',
  storageBucket: 'draftleague-cf07f.firebasestorage.app',
  messagingSenderId: '472324120495',
  appId: '1:472324120495:web:173d23535c2456fbe7d95a',
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pokemon = JSON.parse(await readFile(new URL('../public/data/pokemon.json', import.meta.url), 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const snap = await getDocs(collection(db, 'teams'));
const teams = snap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((t) => t.season === 1)
  .sort((a, b) => (a.order || 0) - (b.order || 0));

const order = shuffle(teams.map((t) => t.id));
const n = order.length;
const PICKS = n * 10;

const rosters = Object.fromEntries(order.map((id) => [id, []]));
const drafted = new Set();

for (let i = 0; i < PICKS; i++) {
  const round = Math.floor(i / n);
  const pos = i % n;
  const idx = round % 2 === 0 ? pos : n - 1 - pos;
  const teamId = order[idx];

  const counts = {};
  rosters[teamId].forEach((p) => (counts[p.tier] = (counts[p.tier] || 0) + 1));

  const candidates = pokemon.filter((p) => !drafted.has(p.name) && (counts[p.tier] || 0) < 2);
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  rosters[teamId].push(pick);
  drafted.add(pick.name);
}

// Verifikation
let ok = true;
for (const id of order) {
  const r = rosters[id];
  const tc = {};
  r.forEach((p) => (tc[p.tier] = (tc[p.tier] || 0) + 1));
  const tierOk = ['S', 'A', 'B', 'C', 'D'].every((t) => tc[t] === 2);
  if (r.length !== 10 || !tierOk) ok = false;
}
const unique = new Set([...Object.values(rosters).flat().map((p) => p.name)]).size;
console.log(`Picks gesamt: ${PICKS}, eindeutige Pokémon: ${unique}, Regeln erfüllt: ${ok}`);

const batch = writeBatch(db);
for (const id of order) {
  batch.update(doc(db, 'teams', id), { pokemon: rosters[id] });
}
batch.set(doc(db, 'drafts', 's1'), { season: 1, status: 'done', order, pickIndex: PICKS });
await batch.commit();

console.log('Simulierter Draft nach Firestore geschrieben (status: done).');
process.exit(0);
