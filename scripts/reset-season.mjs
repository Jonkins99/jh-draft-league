// Setzt Saison 1 auf den Zustand VOR dem Draft zurück:
// - Teams bleiben bestehen, aber ohne Pokémon (Roster leer)
// - Draft auf idle (muss erst gestartet werden)
// - Spielplan gelöscht
// - alle Ergebnisse gelöscht (Pokémon-Stats ergeben sich daraus -> ebenfalls leer)
// Der Pokémon-Pool (public/data/pokemon.json) ist eine Datei und bleibt unberührt.
// Ausführen mit:  node scripts/reset-season.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, setDoc, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyC7tfkjU9iXb-cjwVQEOxYl2anNMRHMgqo',
  authDomain: 'draftleague-cf07f.firebaseapp.com',
  projectId: 'draftleague-cf07f',
  storageBucket: 'draftleague-cf07f.firebasestorage.app',
  messagingSenderId: '472324120495',
  appId: '1:472324120495:web:173d23535c2456fbe7d95a',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 1. Roster aller Teams leeren
const teamsSnap = await getDocs(collection(db, 'teams'));
const tb = writeBatch(db);
teamsSnap.docs.forEach((d) => tb.update(doc(db, 'teams', d.id), { pokemon: [] }));
await tb.commit();
console.log(`✓ ${teamsSnap.size} Roster geleert`);

// 2. Draft auf idle
await setDoc(doc(db, 'drafts', 's1'), { season: 1, status: 'idle', order: [], pickIndex: 0 });
console.log('✓ Draft auf idle');

// 3. Spielplan löschen
await deleteDoc(doc(db, 'schedules', 's1'));
console.log('✓ Spielplan gelöscht');

// 4. Ergebnisse löschen
const resSnap = await getDocs(collection(db, 'results'));
if (resSnap.size) {
  const rb = writeBatch(db);
  resSnap.docs.forEach((d) => rb.delete(doc(db, 'results', d.id)));
  await rb.commit();
}
console.log(`✓ ${resSnap.size} Ergebnisse gelöscht`);

// Verifikation
const [t, r, s] = await Promise.all([
  getDocs(collection(db, 'teams')),
  getDocs(collection(db, 'results')),
  getDocs(collection(db, 'schedules')),
]);
const rosterSizes = t.docs.map((d) => (d.data().pokemon || []).length);
console.log(`\nVerifikation → Teams: ${t.size} (Roster-Größen: [${rosterSizes}]), Ergebnisse: ${r.size}, Spielpläne: ${s.size}`);
console.log(rosterSizes.every((n) => n === 0) && r.size === 0 && s.size === 0 ? '✅ Saubere Ausgangslage' : '❌ Noch Reste vorhanden');
process.exit(0);
