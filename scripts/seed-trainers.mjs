// Startdatensatz der Trainer aus scripts/data/trainers.csv nach Firestore schreiben.
// Ausfuehren mit:  node scripts/seed-trainers.mjs
//
// Idempotent: das Feld `trainers` jedes Team-Dokuments wird komplett aus der CSV
// neu aufgebaut (merge auf `teams/<id>`, der Rest des Dokuments bleibt unberuehrt).
// Ein erneuter Lauf ueberschreibt spaetere Aenderungen aus der Oberflaeche —
// also nur zum Einspielen bzw. Zuruecksetzen des Startdatensatzes benutzen.
//
// CSV-Format (Semikolon-getrennt, Kopfzeile wird uebersprungen):
//   Team;Trainer;Zeitraum;Bild-URL;Geschlecht;Persoenlichkeit(kommasepariert)
// Zeitraum: „S1 Pre-S1 MD5", „S1 MD6-Current", „S1 Pre-Current".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { normalizeTrainer, parsePeriod } from '../resources/js/trainers.mjs';

const firebaseConfig = {
  apiKey: 'AIzaSyC7tfkjU9iXb-cjwVQEOxYl2anNMRHMgqo',
  authDomain: 'draftleague-cf07f.firebaseapp.com',
  projectId: 'draftleague-cf07f',
  storageBucket: 'draftleague-cf07f.firebasestorage.app',
  messagingSenderId: '472324120495',
  appId: '1:472324120495:web:173d23535c2456fbe7d95a',
};

// Ab Saison 2 gibt es Teams mit gleichem Namen in mehreren Saisons. Ohne die
// Einschraenkung auf eine Saison traefe der Namensabgleich das falsche Dokument.
//   node scripts/seed-trainers.mjs              # Saison 1 aus trainers.csv
//   node scripts/seed-trainers.mjs --season 2   # Saison 2 aus trainers-s2.csv
const argSeason = Number((process.argv.find((a) => a.startsWith('--season=')) || '').split('=')[1]
  || process.argv[process.argv.indexOf('--season') + 1]);
const season = Number.isFinite(argSeason) && argSeason > 0 ? argSeason : 1;

const here = dirname(fileURLToPath(import.meta.url));
const csvFile = season === 1 ? 'trainers.csv' : `trainers-s${season}.csv`;
const csv = readFileSync(join(here, 'data', csvFile), 'utf8');

// Teamnamen robust vergleichen (Akzente, Gross-/Kleinschreibung, Tippfehler-Aliase).
function key(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}
const ALIAS = { royalunionpinguleon: 'royalunionpingoleon' };
const teamKey = (name) => ALIAS[key(name)] || key(name);

const rows = csv
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)
  .slice(1)
  .map((line) => {
    const [team, name, period, image, gender, traits] = line.split(';');
    const { fromDay, untilDay } = parsePeriod(period);
    return { team, name, image, gender, traits, fromDay, untilDay };
  });

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const snap = await getDocs(collection(db, 'teams'));
const teams = snap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((t) => (t.season || Number(String(t.id).match(/^s(\d+)-/)?.[1]) || 1) === season);
const byKey = Object.fromEntries(teams.map((t) => [teamKey(t.name), t]));

const grouped = new Map();
const unknown = [];
for (const r of rows) {
  const team = byKey[teamKey(r.team)];
  if (!team) { unknown.push(r.team); continue; }
  if (!grouped.has(team.id)) grouped.set(team.id, []);
  grouped.get(team.id).push(normalizeTrainer(r, team.id));
}

if (unknown.length) {
  console.error(`! Unbekannte Teams in der CSV: ${[...new Set(unknown)].join(', ')}`);
}

let written = 0;
for (const [teamId, trainers] of grouped) {
  await setDoc(doc(db, 'teams', teamId), { trainers }, { merge: true });
  console.log(`✓ ${teamId}: ${trainers.length} Trainer (${trainers.map((t) => t.name).join(', ')})`);
  written += trainers.length;
}

console.log(`\n${written} Trainer in ${grouped.size} Teams der Saison ${season} geschrieben.`);
process.exit(unknown.length ? 1 : 0);
