import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyC7tfkjU9iXb-cjwVQEOxYl2anNMRHMgqo',
  authDomain: 'draftleague-cf07f.firebaseapp.com',
  projectId: 'draftleague-cf07f',
  storageBucket: 'draftleague-cf07f.firebasestorage.app',
  messagingSenderId: '472324120495',
  appId: '1:472324120495:web:173d23535c2456fbe7d95a',
};

export const app = initializeApp(firebaseConfig);
// Ein `undefined` in einem Feld ließe setDoc sonst scheitern — auch das Zurücksetzen
// eines gescheiterten Termins, der dann für immer auf „generating" stünde.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
