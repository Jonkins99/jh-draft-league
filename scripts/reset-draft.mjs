// Setzt den Draft zurueck: Status idle, leere Roster.
// Ausfuehren mit:  node scripts/reset-draft.mjs

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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const snap = await getDocs(collection(db, 'teams'));
const batch = writeBatch(db);
snap.docs.forEach((d) => batch.update(doc(db, 'teams', d.id), { pokemon: [] }));
batch.set(doc(db, 'drafts', 's1'), { season: 1, status: 'idle', order: [], pickIndex: 0 });
await batch.commit();

console.log(`Draft zurückgesetzt. ${snap.size} Roster geleert, drafts/s1 = idle.`);
process.exit(0);
