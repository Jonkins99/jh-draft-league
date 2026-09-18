// Seed-Skript: schreibt die Teams einer Saison nach Firestore.
//
//   node scripts/seed-teams.mjs              # Saison 1 aus der Liste unten
//   node scripts/seed-teams.mjs --season 2   # Saison 2 aus scripts/data/teams-s2.json
//
// Idempotent — feste Doc-IDs (s<N>-<slug>), erneutes Ausfuehren ueberschreibt Name,
// Spieler, Logo und Reihenfolge. Das Roster wird dabei NICHT angefasst: `pokemon`
// bleibt stehen, wenn das Dokument schon existiert (sonst waere ein zweiter Lauf
// mitten im Draft eine Katastrophe).
//
// DER SLUG IST DIE IDENTITAET DES FRANCHISE. Ein Team, das die Saison ueberdauert,
// MUSS seinen Slug behalten — daran haengen ewige Tabelle, Vertragsverlaengerungen
// im Draft und der Marktwert-Verlauf. Nur Auf- und Absteiger bekommen neue Slugs.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

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

const here = dirname(fileURLToPath(import.meta.url));
const argSeason = Number((process.argv.find((a) => a.startsWith('--season=')) || '').split('=')[1]
  || process.argv[process.argv.indexOf('--season') + 1]);
const season = Number.isFinite(argSeason) && argSeason > 0 ? argSeason : 1;

// Ab Saison 2 kommt die Liste aus einer Datei — die Teams stehen erst fest, wenn
// klar ist, wer absteigt.
let list = teams;
if (season !== 1) {
  const file = join(here, 'data', `teams-s${season}.json`);
  if (!existsSync(file)) {
    console.error(`Keine Teamliste fuer Saison ${season}. Erwartet: scripts/data/teams-s${season}.json`);
    console.error('Format: [{ "slug": "fc-chelze", "name": "FC ChelZE", "player": "Janik", "logo": "fc-chelze.png" }]');
    process.exit(1);
  }
  list = JSON.parse(readFileSync(file, 'utf8'));
}

const players = [...new Set(list.map((t) => t.player))];
if (list.length !== 8 || players.length !== 2 || players.some((p) => list.filter((t) => t.player === p).length !== 4)) {
  console.error(`Die Liga braucht acht Teams, vier je Spieler — gefunden: ${list.length} (${players.join(', ')}).`);
  console.error('Der Spielplan stellt Janiks Teams gegen Henriks; eine andere Aufteilung laesst sich nicht auslosen.');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let written = 0;
for (const [i, t] of list.entries()) {
  const id = `s${season}-${t.slug}`;
  const existing = await getDoc(doc(db, 'teams', id));
  const data = {
    season,
    name: t.name,
    player: t.player,
    logo: t.logo || `${t.slug}.png`,
    order: i + 1,
  };
  // Nur ein neues Team bekommt ein leeres Roster; ein bestehendes behaelt seines.
  if (!existing.exists()) data.pokemon = [];
  await setDoc(doc(db, 'teams', id), data, { merge: true });
  console.log(`✓ ${existing.exists() ? 'aktualisiert' : 'angelegt'}: ${id}`);
  written++;
}

const snap = await getDocs(collection(db, 'teams'));
console.log(`\n${written} Teams der Saison ${season} geschrieben. Collection 'teams' enthält jetzt ${snap.size} Dokumente.`);
process.exit(0);
