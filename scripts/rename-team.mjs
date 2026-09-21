// Ein Team unter neuer Dokument-ID fuehren — samt aller Verweise.
//
//   node scripts/rename-team.mjs s2-terestal-palace s2-terastal-palace
//   node scripts/rename-team.mjs s2-alt s2-neu --name "Terastal Palace" --logo terastal-palace.png
//   node scripts/rename-team.mjs s2-alt s2-neu --dry     # nur zeigen, nichts schreiben
//
// DIE TEAM-ID IST EIN FREMDSCHLUESSEL, KEINE BESCHRIFTUNG. An ihr haengen Spielplan,
// Ergebnisse, Draft, Wintertransfer, Awards, Presse-Termine und Beitraege. Ein Team
// „umzubenennen" heisst deshalb: neues Dokument schreiben, alle Verweise nachziehen,
// altes Dokument loeschen. Genau dafuer ist dieses Skript da — ein Schreibfehler im
// Slug laesst sich danach noch geradeziehen, solange die Saison nicht laeuft.
//
// Am Namensteil der ID haengt ausserdem das FRANCHISE (ewige Tabelle, Vertrags-
// verlaengerungen, Marktwert-Verlauf). Wer einen Slug aendert, der schon eine Saison
// ueberdauert hat, trennt das Team von seiner Geschichte — das Skript warnt davor.

import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, getDocs, doc, getDoc, deleteDoc, writeBatch,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyC7tfkjU9iXb-cjwVQEOxYl2anNMRHMgqo',
  authDomain: 'draftleague-cf07f.firebaseapp.com',
  projectId: 'draftleague-cf07f',
  storageBucket: 'draftleague-cf07f.firebasestorage.app',
  messagingSenderId: '472324120495',
  appId: '1:472324120495:web:173d23535c2456fbe7d95a',
};

const argv = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dry') opts.dry = true;
  else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
  else positional.push(a);
}
const [oldId, newId] = positional;
const dry = !!opts.dry;
const newName = opts.name || null;
const newLogo = opts.logo || null;

if (!oldId || !newId || oldId === newId) {
  console.error('Aufruf: node scripts/rename-team.mjs <alte-id> <neue-id> [--name "Neuer Name"] [--logo datei.png] [--dry]');
  process.exit(1);
}

const seasonOf = (id) => Number(String(id).match(/^s(\d+)-/)?.[1]) || null;
const slugOf = (id) => String(id).replace(/^s\d+-/, '');
if (seasonOf(oldId) !== seasonOf(newId)) {
  console.error(`Die Saison darf sich dabei nicht aendern: ${oldId} -> ${newId}.`);
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const teamSnap = await getDoc(doc(db, 'teams', oldId));
if (!teamSnap.exists()) {
  console.error(`Kein Team-Dokument teams/${oldId}.`);
  process.exit(1);
}
if ((await getDoc(doc(db, 'teams', newId))).exists()) {
  console.error(`teams/${newId} gibt es schon — das waere ein Zusammenlegen, kein Umbenennen.`);
  process.exit(1);
}

// Gehoert der alte Slug zu einem Franchise, das schon eine Saison gespielt hat?
const allTeams = await getDocs(collection(db, 'teams'));
const sameFranchise = allTeams.docs
  .map((d) => d.id)
  .filter((id) => id !== oldId && slugOf(id) === slugOf(oldId));
if (sameFranchise.length) {
  console.warn(`! Achtung: der Slug „${slugOf(oldId)}" steht auch in ${sameFranchise.join(', ')}.`);
  console.warn('  Mit der Umbenennung verliert das Team in dieser Saison seine Franchise-Historie.');
}

// Jeden Verweis in einem Dokument ersetzen — Werte wie auch Teile von Dokument-IDs.
const swap = (value) => {
  if (typeof value === 'string') {
    return value === oldId ? newId : value.includes(oldId) ? value.split(oldId).join(newId) : value;
  }
  if (Array.isArray(value)) return value.map(swap);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swap(v)]));
  }
  return value;
};

const plan = [];   // { collection, id, newId?, data }
const touched = [];

// 1. Das Team selbst.
const team = { ...teamSnap.data() };
if (newName) team.name = newName;
if (newLogo) team.logo = newLogo;
plan.push({ col: 'teams', id: oldId, newId, data: team });

// 2. Alles, was auf die ID verweist. Die Dokument-ID traegt sie in `awards`
//    (Team-MVP) und `pressSessions` (Termin je Team und Spieltag) mit.
for (const col of ['drafts', 'schedules', 'results', 'awards', 'press', 'pressSessions', 'battleLogs']) {
  const snap = await getDocs(collection(db, col));
  snap.docs.forEach((d) => {
    const raw = d.data();
    const next = swap(raw);
    const idNext = d.id.includes(oldId) ? d.id.split(oldId).join(newId) : null;
    if (idNext === null && JSON.stringify(next) === JSON.stringify(raw)) return;
    plan.push({ col, id: d.id, newId: idNext, data: next });
    touched.push(`${col}/${d.id}${idNext ? ` -> ${idNext}` : ''}`);
  });
}

console.log(`${oldId} -> ${newId}`);
console.log(`  teams/${oldId} -> teams/${newId}${newName ? ` (Name: ${newName})` : ''}`);
if (touched.length) {
  console.log(`  ${touched.length} weitere Dokumente mit Verweisen:`);
  touched.forEach((line) => console.log(`    · ${line}`));
} else {
  console.log('  Keine weiteren Verweise — das Team hat noch nicht gespielt.');
}

if (dry) {
  console.log('\nProbelauf, nichts geschrieben. Ohne --dry erneut starten.');
  process.exit(0);
}

// Erst alles Neue schreiben, dann das Alte loeschen: bricht es dazwischen ab,
// steht der Bestand doppelt da — nie halb.
let batch = writeBatch(db);
let ops = 0;
const commit = async () => { if (ops) { await batch.commit(); batch = writeBatch(db); ops = 0; } };
for (const row of plan) {
  batch.set(doc(db, row.col, row.newId || row.id), row.data);
  if (++ops >= 400) await commit();
}
await commit();

for (const row of plan) {
  if (row.newId && row.newId !== row.id) await deleteDoc(doc(db, row.col, row.id));
}

console.log(`\nFertig: ${plan.length} Dokumente geschrieben, ${plan.filter((r) => r.newId && r.newId !== r.id).length} alte geloescht.`);
process.exit(0);
