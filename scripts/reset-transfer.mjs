// Setzt den Wintertransfer zurueck: Status idle, leerer Pool.
// ACHTUNG: Roster werden NICHT wiederhergestellt (Abgaben/Picks bleiben bestehen).
// Ausfuehren mit:  node scripts/reset-transfer.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

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

await setDoc(doc(db, 'drafts', 'transfer-s1'), {
  season: 1, status: 'idle', order: [], pickIndex: 0, removed: [], added: [],
});

console.log('Wintertransfer zurückgesetzt (transfers/s1 = idle).');
process.exit(0);
