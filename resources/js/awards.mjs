// Reine, framework-freie Awards-Logik (node-testbar, kein Firebase/Alpine-Import).
//
// Ablauf einer Abstimmung (status):
//   nominating -> voting -> done
// Jeder Spieler nominiert 0–3 Optionen. Er kann sie zwischenspeichern und später
// weiter ändern, oder „Ich bin fertig" sagen (confirmed[player] = true). Sind BEIDE
// fertig, springt der Status von selbst auf voting — niemand startet die Abstimmung
// für den anderen mit. In der Abstimmung
// bewertet jeder Spieler jede Option mit 0–10. Liegen beide Stimmzettel vor,
// ist die Abstimmung done und die Siegerehrung freigeschaltet.

export const PLAYERS = ['Janik', 'Henrik'];
export const MAX_NOMINATIONS = 3;
export const VOTE_MIN = 0;
export const VOTE_MAX = 10;

// Erster Spieltag, für den es Spieltag-Awards gibt. Auf 1 werden alle gespielten
// Spieltage einer Saison ausgezeichnet — auch rückwirkend. Ein höherer Wert blendet
// die Spieltage davor aus (die Awards-View weist dann darauf hin).
export const MATCHDAY_AWARDS_FROM = 1;

// Spieltage, für die Spieltag-Awards vergeben werden dürfen.
export function awardableDays(playedDays) {
  return (playedDays || []).filter((d) => Number.isFinite(d) && d >= MATCHDAY_AWARDS_FROM);
}

// Jede Auszeichnung ist entweder eine Ehrung oder eine Rüge. Die Rekorde trennen
// beides: „meiste Auszeichnungen" und „meiste Rügen" sind zwei verschiedene
// Geschichten, und ohne die Trennung stünde ein Dauerflop neben einem MVP.
export const AWARD_TONES = ['positive', 'negative'];
export function awardTone(key) {
  return AWARD_BY_KEY[key]?.tone === 'negative' ? 'negative' : 'positive';
}

// Awards nach jedem Spieltag. Werden mehrfach vergeben (je Spieltag einmal) und
// dürfen mehrfach an dasselbe Pokémon gehen.
export const MATCHDAY_AWARDS = [
  {
    key: 'mon-of-day', label: 'Pokémon des Spieltags', short: 'POTD', entity: 'pokemon',
    hint: 'Das stärkste Pokémon dieses Spieltags.',
  },
  {
    key: 'flop-of-day', label: 'Größte Enttäuschung des Spieltags', short: 'FLOP', entity: 'pokemon', tone: 'negative',
    hint: 'Blieb an diesem Spieltag klar unter den Erwartungen.',
  },
  {
    key: 'surprise-of-day', label: 'Größte Überraschung des Spieltags', short: 'WOW', entity: 'pokemon',
    hint: 'Hat an diesem Spieltag positiv überrascht.',
  },
];

// Awards zum Saisonende.
export const SEASON_AWARDS = [
  { key: 'best-mon', label: 'Bestes Pokémon', short: 'MVP', entity: 'pokemon', hint: 'Das beste Pokémon der Saison.' },
  { key: 'surprise', label: 'Größte Pokémon-Überraschung', short: 'WOW', entity: 'pokemon', hint: 'Hat die Erwartungen am deutlichsten übertroffen.' },
  { key: 'disappointment', label: 'Größte Pokémon-Enttäuschung', short: 'FLOP', entity: 'pokemon', tone: 'negative', hint: 'Hat die Erwartungen am deutlichsten verfehlt.' },
  { key: 'killking', label: 'Killkönig', short: 'KILL', entity: 'pokemon', hint: 'Der gefährlichste Angreifer der Saison.' },
  { key: 'survivalking', label: 'Überlebenskönig', short: 'SURV', entity: 'pokemon', hint: 'Kam am häufigsten lebend aus den Kämpfen.' },
  { key: 'best-offense', label: 'Beste Offensive', short: 'OFF', entity: 'team', hint: 'Das offensivstärkste Team.' },
  { key: 'best-defense', label: 'Beste Defensive', short: 'DEF', entity: 'team', hint: 'Das defensivstärkste Team.' },
  { key: 'best-support', label: 'Bester Support', short: 'SUP', entity: 'pokemon', hint: 'Bester Unterstützer für das eigene Team.' },
  { key: 'best-disruptor', label: 'Bester Störer', short: 'STÖR', entity: 'pokemon', hint: 'Hat gegnerische Pläne am wirkungsvollsten gestört.' },
  { key: 'best-fieldsetter', label: 'Bester Feldsetter', short: 'FELD', entity: 'pokemon', hint: 'Hat das Kampffeld am wirkungsvollsten kontrolliert.' },
  { key: 'best-partners', label: 'Beste Partner', short: 'DUO', entity: 'pair', hint: 'Das beste Zusammenspiel zweier Pokémon.' },
  { key: 'biggest-threat', label: 'Größter Threat', short: 'THRT', entity: 'pokemon', hint: 'Das Pokémon, um das am meisten herumgebaut wurde.' },
  { key: 'best-tier-s', label: 'Bestes S-Tier', short: 'S', entity: 'pokemon', tier: 'S', hint: 'Bestes Pokémon aus dem S-Tier.' },
  { key: 'best-tier-a', label: 'Bestes A-Tier', short: 'A', entity: 'pokemon', tier: 'A', hint: 'Bestes Pokémon aus dem A-Tier.' },
  { key: 'best-tier-b', label: 'Bestes B-Tier', short: 'B', entity: 'pokemon', tier: 'B', hint: 'Bestes Pokémon aus dem B-Tier.' },
  { key: 'best-tier-c', label: 'Bestes C-Tier', short: 'C', entity: 'pokemon', tier: 'C', hint: 'Bestes Pokémon aus dem C-Tier.' },
  { key: 'best-tier-d', label: 'Bestes D-Tier', short: 'D', entity: 'pokemon', tier: 'D', hint: 'Bestes Pokémon aus dem D-Tier.' },
  { key: 'best-match', label: 'Bestes Match', short: 'MTCH', entity: 'match', hint: 'Das spannendste Match der Saison.' },
  { key: 'best-draft', label: 'Bester Draft', short: 'DRFT', entity: 'team', hint: 'Das Team mit dem besten Draft.' },
  { key: 'best-transfer', label: 'Bestes Transferfenster', short: 'TRSF', entity: 'team', hint: 'Das Team mit dem besten Wintertransfer.' },
  { key: 'best-mega', label: 'Bestes Mega-Pokémon', short: 'MEGA', entity: 'pokemon', filter: 'mega', hint: 'Beste Mega-Entwicklung der Saison.' },
  { key: 'best-no-mega', label: 'Bestes Pokémon ohne Mega-Stein', short: 'NOMG', entity: 'pokemon', filter: 'nomega', hint: 'Bestes Pokémon ohne Mega-Entwicklung.' },
  { key: 'team-mvp', label: 'Most Valuable Pokémon', short: 'TMVP', entity: 'pokemon', perTeam: true, hint: 'Wertvollstes Pokémon dieses Teams — je Team eine eigene Abstimmung.' },
];

export const ALL_AWARDS = [...MATCHDAY_AWARDS, ...SEASON_AWARDS];
export const AWARD_BY_KEY = Object.fromEntries(ALL_AWARDS.map((a) => [a.key, a]));

// Doc-ID einer Abstimmung. Spieltag-Awards je Spieltag, Team-MVP je Team.
export function awardDocId(key, { day = null, teamId = null, season = 1 } = {}) {
  const p = `s${season}`;
  if (day != null) return `${p}-${key}-d${day}`;
  if (teamId) return `${p}-${key}-${teamId}`;
  return `${p}-${key}`;
}

// Stabile Option-ID. Bei Paaren reihenfolge-unabhängig.
export function optionId(entity, value) {
  if (entity === 'pair') {
    const names = (Array.isArray(value) ? value : [value?.a, value?.b]).filter(Boolean);
    return [...names].sort().join(' + ');
  }
  return String(Array.isArray(value) ? value[0] : (value?.id ?? value ?? ''));
}

// Nominierungen beider Spieler zu einer Optionsliste zusammenführen (dedupliziert,
// mit Herkunft je Option). Reihenfolge: Janik zuerst, dann Henriks Ergänzungen.
export function mergedOptions(award) {
  const out = [];
  const byId = Object.create(null);
  PLAYERS.forEach((player) => {
    ((award?.nominations || {})[player] || []).forEach((nom) => {
      if (!nom) return;
      const id = nom.id || optionId(award?.entity, nom.value ?? nom.names ?? nom.name);
      if (!id) return;
      if (byId[id]) {
        if (!byId[id].by.includes(player)) byId[id].by.push(player);
        return;
      }
      byId[id] = { ...nom, id, by: [player] };
      out.push(byId[id]);
    });
  });
  return out;
}

// Zahl der offenen Nominierungsplätze eines Spielers.
export function remainingNominations(award, player) {
  const n = ((award?.nominations || {})[player] || []).length;
  return Math.max(0, MAX_NOMINATIONS - n);
}

export function hasVoted(award, player) {
  return !!(award?.voted || {})[player];
}

// Status-Fortschreibung: sind beide Nominierungen bestätigt, beginnt die Abstimmung;
// liegen beide Stimmzettel vor, ist die Abstimmung abgeschlossen.
export function nextStatus(award) {
  const status = award?.status || 'nominating';
  if (status === 'nominating') {
    const confirmed = award?.confirmed || {};
    return PLAYERS.every((p) => confirmed[p]) ? 'voting' : 'nominating';
  }
  if (status === 'voting') {
    return PLAYERS.every((p) => hasVoted(award, p)) ? 'done' : 'voting';
  }
  return status;
}

function clampVote(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return VOTE_MIN;
  return Math.max(VOTE_MIN, Math.min(VOTE_MAX, n));
}

// Auswertung: Mittelwert der beiden Bewertungen je Option, absteigend sortiert.
// Bei Gleichstand entscheidet die Summe, dann die Option-ID (stabil).
// rank ist 1-basiert; ties teilen sich denselben Rang.
export function voteResults(award) {
  const options = mergedOptions(award);
  const votes = award?.votes || {};
  const rows = options.map((opt) => {
    const scores = {};
    let sum = 0;
    let count = 0;
    PLAYERS.forEach((p) => {
      const raw = (votes[p] || {})[opt.id];
      if (raw == null) return;
      const v = clampVote(raw);
      scores[p] = v;
      sum += v;
      count += 1;
    });
    return { ...opt, scores, sum, count, avg: count ? sum / count : 0 };
  });
  rows.sort((a, b) => b.avg - a.avg || b.sum - a.sum || String(a.id).localeCompare(String(b.id)));
  let lastAvg = null;
  let lastRank = 0;
  rows.forEach((r, i) => {
    if (lastAvg !== null && Math.abs(r.avg - lastAvg) < 1e-9) {
      r.rank = lastRank;
    } else {
      r.rank = i + 1;
      lastRank = r.rank;
      lastAvg = r.avg;
    }
  });
  return rows;
}

// Sieger einer abgeschlossenen Abstimmung. Bei Gleichstand auf Platz 1
// gewinnen ALLE Optionen mit diesem Rang.
export function awardWinners(award) {
  if ((award?.status || 'nominating') !== 'done') return [];
  const rows = voteResults(award);
  if (!rows.length) return [];
  const top = rows[0].rank;
  return rows.filter((r) => r.rank === top);
}

// Erster Sieger (Kurzform, wo nur einer angezeigt wird).
export function awardWinner(award) {
  const winners = awardWinners(award);
  return winners.length ? winners[0] : null;
}

// Enthüllungs-Reihenfolge der Siegerehrung: vom letzten Platz aufwärts bis Platz 3,
// danach Platz 1 und 2 gemeinsam. Teilen sich mehr als zwei Optionen den ersten
// Platz, wird die ganze Siegergruppe gemeinsam enthüllt.
// Rückgabe: [[option], [option], …, [p2, p1]] — der letzte Schritt aufsteigend.
export function revealSteps(rows) {
  const list = [...(rows || [])];
  if (!list.length) return [];
  const topRank = list[0].rank ?? 1;
  const winners = list.filter((r) => (r.rank ?? 1) === topRank).length;
  const topCount = Math.min(list.length, Math.max(2, winners));
  const top = list.slice(0, topCount);
  const rest = list.slice(topCount);
  const steps = rest.reverse().map((r) => [r]);
  steps.push([...top].reverse());
  return steps;
}

// Spoiler-Hinweis am Ende der Siegerehrung.
export function spoilerNote(award, me) {
  const other = PLAYERS.find((p) => p !== me) || PLAYERS[1];
  const seen = (award?.seen || {})[other];
  return seen
    ? `${other} hat die Siegerehrung schon gesehen – ihr könnt offen darüber reden.`
    : `${other} hat die Siegerehrung noch nicht gesehen – bitte nicht spoilern!`;
}

// --- Tier-Stand einer Saison -------------------------------------------------
// Die Stammdaten (pokemon.json) tragen IMMER die Einstufung der KOMMENDEN Saison —
// für „Bestes C-Tier" der Saison 1 wäre das die falsche Klasse, sobald der Pool für
// Saison 2 neu eingestuft wurde. Die Kader halten dagegen das Tier, mit dem ein
// Pokémon gezogen bzw. im Wintertransfer geholt wurde: den Stand dieser Saison.
export function seasonTiers(teams) {
  const map = Object.create(null);
  (teams || []).forEach((t) => (t?.pokemon || []).forEach((p) => {
    if (p?.name && p.tier && !map[p.name]) map[p.name] = p.tier;
  }));
  return map;
}

/** Tier eines Pokémon in der Saison des Awards — Kaderstand vor Stammdaten. */
export function tierInSeason(tiers, mon) {
  return (tiers || {})[mon?.name] || mon?.tier || null;
}

// Spieltage, an denen JEDE angesetzte Partie ein vollständiges Ergebnis hat. Erst
// dann ist ein Spieltag-Award fällig — ein angebrochener Spieltag ist noch nicht
// zu bewerten. `isComplete` kommt von außen (press.mjs), damit dieses Modul keine
// Ergebnislogik doppelt führt.
export function completedMatchdays(schedule, results, isComplete) {
  const done = new Set();
  (results || []).forEach((r) => {
    if (r && isComplete(r)) done.add(`${r.day}|${r.home}|${r.away}`);
  });
  return (schedule?.matchdays || [])
    .filter((md) => (md.matches || []).length
      && md.matches.every((m) => done.has(`${md.day}|${m.home}|${m.away}`)))
    .map((md) => md.day);
}

// Wie viele Abstimmungen warten auf DIESEN Spieler? Nominieren zählt, bis er
// „fertig" gemeldet hat, abstimmen, bis sein Stimmzettel vorliegt.
export function awaitingPlayer(instances, player) {
  if (!player) return 0;
  return (instances || []).filter((i) => (i.status === 'nominating' && !i.confirmed?.[player])
    || (i.status === 'voting' && !hasVoted(i, player))).length;
}
