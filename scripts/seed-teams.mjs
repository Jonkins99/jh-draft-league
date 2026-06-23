// Einmaliges Seed-Skript: schreibt die Teams der Saison 1 nach Firestore.
// Ausfuehren mit:  node scripts/seed-teams.mjs
// Idempotent — feste Doc-IDs (s1-<slug>), erneutes Ausfuehren ueberschreibt.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyC7tfkjU9iXb-cjwVQEOxYl2anNMRHMgqo',
  authDomain: 'draftleague-cf07f.firebaseapp.com',
  projectId: 'draftleague-cf07f',
  storageBucket: 'draftleague-cf07f.firebasestorage.app',
  messagingSenderId: '472324120495',
  appId: '1:472324120495:web:173d23535c2456fbe7d95a',
};

const teams = [
  { slug: 'heerashai-sv', name: 'Heerashai SV', player: 'Henrik' },
  { slug: 'royal-union-pingoleon', name: 'Royal Union Pingoléon', player: 'Henrik' },
  { slug: 'ac-arboliva', name: 'AC Arboliva', player: 'Henrik' },
  { slug: 'toxicroak-rangers', name: 'Toxicroak Rangers', player: 'Henrik' },
  { slug: 'fc-bayern-myrador', name: 'FC Bayern Myriador', logo: 'fc-bayern-myriador.png', player: 'Janik' },
  { slug: 'einkraft-frankfurt', name: 'Einkraft Frankfurt', player: 'Janik' },
  { slug: 'beast-force-pc', name: 'Beast Force PC', player: 'Janik' },
  { slug: 'fc-chelze', name: 'FC ChelZE', player: 'Janik' },
];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let written = 0;
for (const [i, t] of teams.entries()) {
  const id = `s1-${t.slug}`;
  await setDoc(doc(db, 'teams', id), {
    season: 1,
    name: t.name,
    player: t.player,
    logo: t.logo || `${t.slug}.png`,
    order: i + 1,
    pokemon: [],
  });
  console.log(`✓ geschrieben: ${id}`);
  written++;
}

const snap = await getDocs(collection(db, 'teams'));
console.log(`\n${written} Teams geschrieben. Collection 'teams' enthält jetzt ${snap.size} Dokumente.`);
process.exit(0);
