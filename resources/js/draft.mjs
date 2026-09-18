// Draft-Logik ab Saison 2: Reihenfolge und Vertragsverlängerungen.
//
// Framework-frei (kein Alpine, kein Firebase) und damit unter Node testbar. Die
// Schreibzugriffe liegen weiterhin im league-Store; hier steht nur, WAS gilt.
//
// Zwei Neuerungen gegenüber Saison 1:
//
// 1. DIE REIHENFOLGE WIRD NICHT MEHR AUSGELOST, sondern aus der Endtabelle der
//    Vorsaison abgeleitet. Platz 1 zieht zuerst. Die Plätze 7 und 8 steigen ab; an
//    ihre Stelle treten neue Teams, die immer dem Spieler gehören, dessen Team
//    abgestiegen ist. Gehören beide Aufsteiger demselben Spieler, entscheidet er
//    selbst, welcher von beiden an Position 7 zieht.
//
// 2. VERTRAGSVERLÄNGERUNGEN. Jedes Team, das schon in der Vorsaison dabei war, kann
//    bis zu fünf Pokémon aus seinem alten Kader zurückholen — je Tier eines. Zu
//    Beginn jeder Draft-Runde bekommt es die Gelegenheit, eine davon einzulösen;
//    tut es das, zieht es sein Pokémon sofort und hat damit seinen Zug dieser Runde
//    verbraucht. Verzichten ist immer erlaubt, die Verlängerung bleibt dann erhalten.
//    Der Haken: Bis auf die erste Runde kann ein anderes Team ein infrage kommendes
//    Pokémon vorher regulär wegschnappen. Ist keines der Pokémon eines Tiers mehr
//    zu haben, verfällt die Verlängerung von selbst.
//
// Im Code heißt das Ganze „renewal"; im Frontend und in der Presse ist ausschließlich
// von Vertragsverlängerungen die Rede.

import { franchiseSlug, seasonOfTeam } from './seasons.mjs';

/** Tiers, für die es je eine Vertragsverlängerung gibt — in Draft-Reihenfolge. */
export const RENEWAL_TIERS = ['S', 'A', 'B', 'C', 'D'];

/** Wie viele Teams eine Saison überdauern; der Rest steigt ab. */
export const RELEGATION_FROM_PLACE = 7;

/** Wie viele Pokémon ein Team je Tier halten darf. */
export const SLOTS_PER_TIER = 2;

/**
 * Nach welcher Tier-Angabe die Vertragsverlängerungen sortiert werden.
 *
 * ENTSCHIEDEN: Es gilt das Tier der NEUEN Saison (`current`, Stand `pokemon.json`).
 * Wechselt ein Pokémon zwischen den Saisons das Tier, zählt also seine heutige Klasse,
 * nicht die von damals. Damit bleibt „höchstens zwei je Tier" in jedem Fall heil: Was
 * über eine Verlängerung kommt, belegt genau den Platz, den es auch als reguläres Pick
 * belegt hätte. Der Preis dafür ist, dass ein Team in einem Tier drei Kandidaten haben
 * kann und in einem anderen keinen — deshalb spricht die Oberfläche von „den
 * verfügbaren Pokémon dieses Tiers" und nie von „den beiden".
 *
 * `previous` bildet die andere Lesart ab (Tier der Vorsaison) und bleibt nur als
 * Umschalter stehen, falls die Regel je wieder zur Debatte steht.
 */
export const RENEWAL_TIER_SOURCE = 'current';

const nameOf = (p) => (typeof p === 'string' ? p : p?.name || '');

/**
 * Der Kader, den ein Franchise am Ende der Vorsaison hatte — aufgeschlüsselt nach dem
 * Tier, das für den kommenden Draft gilt.
 *
 * @param {Array}  teams    alle Teams aller Saisons
 * @param {number} season   die Saison, für die gedraftet wird
 * @param {Array}  pokedex  Stammdaten (liefern das aktuelle Tier)
 * @returns {Object<string, Array<{name, tier, prevTier, image}>>} Schlüssel: Team-ID der NEUEN Saison
 */
export function previousRosters(teams, season, pokedex = []) {
  const target = Number(season);
  const byName = {};
  (pokedex || []).forEach((p) => { if (p?.name) byName[p.name] = p; });

  const prev = {};
  (teams || []).forEach((t) => {
    if (seasonOfTeam(t) !== target - 1) return;
    prev[franchiseSlug(t.id)] = t;
  });

  const out = {};
  (teams || []).forEach((t) => {
    if (seasonOfTeam(t) !== target) return;
    const old = prev[franchiseSlug(t.id)];
    if (!old) return;
    out[t.id] = (old.pokemon || []).map((p) => {
      const name = nameOf(p);
      const meta = byName[name] || {};
      const prevTier = p?.tier || meta.tier || null;
      return {
        name,
        tier: RENEWAL_TIER_SOURCE === 'previous' ? prevTier : (meta.tier || prevTier),
        prevTier,
        image: meta.image || p?.image || '',
      };
    }).filter((p) => p.name);
  });
  return out;
}

/** Teams, die überhaupt Vertragsverlängerungen haben — in Reihenfolge des Drafts. */
export function renewalTeams(draft, prevRosters) {
  return (draft?.order || []).filter((id) => (prevRosters?.[id] || []).length > 0);
}

/**
 * Stand der fünf Vertragsverlängerungen eines Teams.
 *
 * @param {string} teamId
 * @param {Array}  prevRoster   Kader der Vorsaison (siehe previousRosters)
 * @param {object} draft        Draft-Dokument (renewals[])
 * @param {Set}    taken        bereits gedraftete Pokémon-Namen (ligaweit)
 * @param {Array}  roster       aktueller Kader des Teams in diesem Draft
 * @returns {Array<{tier, status:'used'|'open'|'expired', name, options}>}
 */
export function renewalState(teamId, prevRoster, draft, taken, roster = []) {
  const used = {};
  (draft?.renewals || []).forEach((r) => {
    if (r?.teamId === teamId && r?.tier) used[r.tier] = r;
  });
  const tierCount = {};
  (roster || []).forEach((p) => { if (p?.tier) tierCount[p.tier] = (tierCount[p.tier] || 0) + 1; });

  return RENEWAL_TIERS.map((tier) => {
    if (used[tier]) return { tier, status: 'used', name: used[tier].name, options: [] };
    const candidates = (prevRoster || [])
      .filter((p) => p.tier === tier)
      .filter((p) => !taken?.has(p.name));
    // Verfallen ist sie, wenn kein Pokémon dieses Tiers mehr zu haben ist — oder wenn
    // das Team seine beiden Plätze in diesem Tier schon regulär gefüllt hat.
    const full = (tierCount[tier] || 0) >= SLOTS_PER_TIER;
    if (!candidates.length || full) return { tier, status: 'expired', name: null, options: [] };
    return { tier, status: 'open', name: null, options: candidates };
  });
}

/** Hat dieses Team in diesem Draft noch eine einlösbare Vertragsverlängerung? */
export function hasOpenRenewal(state) {
  return (state || []).some((r) => r.status === 'open');
}

/** Die Runde (0-basiert), in der ein Pick mit diesem Index liegt. */
export function roundOfPick(pickIndex, teamCount) {
  const n = Math.max(1, teamCount);
  return Math.floor((Number(pickIndex) || 0) / n);
}

/** Die Snake-Reihenfolge einer Runde: gerade Runden vorwärts, ungerade rückwärts. */
export function snakeOrder(order, round) {
  const list = [...(order || [])];
  return round % 2 === 0 ? list : list.reverse();
}

/** Wer hat in dieser Runde bereits per Vertragsverlängerung gezogen? */
export function renewedIn(draft, round) {
  return new Set((draft?.renewals || []).filter((r) => r?.round === round).map((r) => r.teamId));
}

/**
 * Ist gerade das Fenster für Vertragsverlängerungen offen — und wenn ja, wer ist dran?
 *
 * Das Fenster öffnet sich zu Beginn jeder Runde und schließt, sobald jedes Team mit
 * einer noch einlösbaren Verlängerung entschieden hat (einlösen oder verzichten).
 *
 * @param {object} draft
 * @param {function} openFor  teamId -> boolean: hat dieses Team noch eine einlösbare?
 * @returns {{round:number, teamId:string}|null}
 */
export function renewalTurn(draft, openFor) {
  const round = draft?.renewalRound;
  if (!Number.isFinite(round)) return null;
  const done = new Set(draft?.renewalDone || []);
  const queue = snakeOrder(draft?.order || [], round)
    .filter((id) => !done.has(id))
    .filter((id) => openFor(id));
  return queue.length ? { round, teamId: queue[0] } : null;
}

/**
 * Wer ist regulär am Zug?
 *
 * Jede Runde hat genau so viele Züge wie Teams. Wer die Runde per Vertragsverlängerung
 * eröffnet hat, ist darin schon durch und fällt aus der Reihe — sein Zug wurde
 * vorgezogen.
 *
 * @returns {{teamId, round, pickNo}|null}
 */
export function currentPick(draft, { picksPerTeam = 10 } = {}) {
  const order = draft?.order || [];
  const n = order.length;
  if (!n) return null;
  const pickIndex = Number(draft?.pickIndex) || 0;
  if (pickIndex >= n * picksPerTeam) return null;
  const round = roundOfPick(pickIndex, n);
  const renewed = renewedIn(draft, round);
  const queue = snakeOrder(order, round).filter((id) => !renewed.has(id));
  const madeInRound = pickIndex % n;
  const teamId = queue[madeInRound - renewed.size];
  if (!teamId) return null;
  return { teamId, round: round + 1, pickNo: pickIndex + 1 };
}

// === Reihenfolge =============================================================

/**
 * Die Draft-Reihenfolge einer neuen Saison.
 *
 * Die Plätze 1 bis 6 stehen fest: Der Tabellenerste der Vorsaison zieht zuerst. Die
 * Plätze 7 und 8 gehen an die Aufsteiger, und ein Aufsteiger gehört immer dem Spieler,
 * dessen Team abgestiegen ist. Sind es zwei Spieler, entscheidet der Abstiegsplatz
 * (der Siebte der Vorsaison kommt vor dem Achten). Gehören beide Aufsteiger demselben
 * Spieler, kann diese Frage nicht gerechnet werden — dann muss er wählen.
 *
 * @param {object} args
 * @param {Array}  args.prevTable  Endtabelle der Vorsaison (computeStandings, Platz 1 zuerst)
 * @param {Array}  args.teams      Teams der NEUEN Saison
 * @param {string} args.firstPromoted  Team-ID, die bei gleicher Zugehörigkeit Platz 7 bekommt
 * @returns {{order:string[], choice:{player:string, options:string[]}|null, promoted:string[]}}
 */
export function buildDraftOrder({ prevTable = [], teams = [], firstPromoted = null } = {}) {
  const byFranchise = {};
  (teams || []).forEach((t) => { if (t?.id) byFranchise[franchiseSlug(t.id)] = t; });

  const kept = [];
  const relegated = [];
  (prevTable || []).forEach((row, i) => {
    const slug = franchiseSlug(row?.team?.id);
    const next = byFranchise[slug];
    if (i < RELEGATION_FROM_PLACE - 1 && next) kept.push(next.id);
    else relegated.push({ place: i + 1, player: row?.team?.player || null });
  });

  const keptSet = new Set(kept);
  const promoted = (teams || []).map((t) => t.id).filter((id) => !keptSet.has(id));

  // Ohne Vorsaison (oder ohne verwertbare Tabelle) bleibt es bei der bisherigen Auslosung.
  if (!kept.length) return { order: [], choice: null, promoted };

  if (promoted.length <= 1) return { order: [...kept, ...promoted], choice: null, promoted };

  const teamById = {};
  (teams || []).forEach((t) => { if (t?.id) teamById[t.id] = t; });
  const players = [...new Set(promoted.map((id) => teamById[id]?.player).filter(Boolean))];

  if (players.length > 1) {
    // Je Spieler ein Aufsteiger: Der Abstiegsplatz entscheidet, wer zuerst zieht.
    const placeOf = (player) => {
      const hit = relegated.find((r) => r.player === player);
      return hit ? hit.place : 99;
    };
    const sorted = [...promoted].sort((a, b) => {
      const pa = placeOf(teamById[a]?.player);
      const pb = placeOf(teamById[b]?.player);
      return pa - pb || String(a).localeCompare(String(b));
    });
    return { order: [...kept, ...sorted], choice: null, promoted };
  }

  // Beide Aufsteiger gehören demselben Spieler — das kann nur er entscheiden.
  const player = players[0] || null;
  if (firstPromoted && promoted.includes(firstPromoted)) {
    const rest = promoted.filter((id) => id !== firstPromoted);
    return { order: [...kept, firstPromoted, ...rest], choice: null, promoted };
  }
  return { order: kept, choice: { player, options: promoted }, promoted };
}
