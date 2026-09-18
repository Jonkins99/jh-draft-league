import Alpine from 'alpinejs';
import { db } from './firebase.js';
import { collection, doc, getDoc, onSnapshot, writeBatch, arrayUnion, setDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { battleStats, mergeResult, computeStandings, pokemonStats, placementHistory, speedTiers, speedCases, clampSp, applySpeedMod, typeMultiplier, ALL_TYPES, pokemonProfile, defensiveChart, offensiveChart, playerDuel, showdownExport, teamBattleTotals, isMega, baseFormOf, pokezoneUrl, draftPicks, transferAvailability } from './scoring.mjs';
import {
  exportDataset, buildScheduleExport, buildBattleDetailsExport, buildStandingsExport,
  buildRankingExport, buildTeamsExport, buildDraftpoolExport, buildDraftOrderExport,
} from './export.mjs';
import { fetchEloRows, readEloCache, writeEloCache, resolveEloName, unresolvedEloNames } from './elo.mjs';
import {
  PLAYERS, MAX_NOMINATIONS, MATCHDAY_AWARDS, SEASON_AWARDS, AWARD_BY_KEY,
  awardDocId, optionId, mergedOptions, remainingNominations, hasVoted, nextStatus,
  voteResults, awardWinner, awardWinners, spoilerNote, awardableDays, MATCHDAY_AWARDS_FROM,
} from './awards.mjs';
import { awardSvg, awardColor } from './award-visuals.mjs';
import {
  marketValue, formatMarket, formatMarketDelta, formatPercent, eloIndex,
  squadMarketValue, tierBoundaries, historyPoints, historyStops, squadHistory,
  snapshotOf, diffSnapshots, historyDiff, stopKeyForDay, parseHistoryLabel, tierForElo,
  transferCutIndex, rosterAtIndex, rosterSpans,
} from './market.mjs';
import {
  SEASON_ALL, seasonPrefix, seasonOfId, seasonOfTeam, franchiseSlug, seasonsFrom,
  teamsOfSeason, resultsOfSeason, allTimeTable, seasonSummaries, allTimePlayers,
  allTimePokemon, buildRecords, awardLeaderboard, newcomersOfSeason,
} from './seasons.mjs';
import {
  RENEWAL_TIERS, previousRosters, renewalState, hasOpenRenewal, renewalTurn,
  currentPick as draftCurrentPick, buildDraftOrder, renewedIn, snakeOrder,
} from './draft.mjs';
import { normalizeVideoUrl, videoEmbed, videoHostLabel } from './video.mjs';
import { renderTiles, TILE_KINDS } from './press-tiles.mjs';
import { renderMarketChart } from './marketchart.mjs';
import { runMarketShow } from './marketshow.mjs';
import { runCeremony } from './ceremony.mjs';
import { buildFinaleScript, runFinale } from './finale.mjs';
import {
  GENDERS, genderLabel, normalizeTrainer, currentTrainer, trainerHistory,
  nextFromDay, withDismissed,
} from './trainers.mjs';
import {
  CALC_GEN, CALC_GAME_TYPE, STATS as CALC_STATS, STAT_KEYS as CALC_STAT_KEYS,
  NATURES as CALC_NATURES, BOOST_STEPS as CALC_BOOST_STEPS,
  statLabel as calcStatLabel, natureLabel as calcNatureLabel, natureByDe as calcNatureByDe,
  speciesKey as calcSpeciesKey, spToEv as calcSpToEv, clampSpValue as clampCalcSp,
  damagePercent as calcDamagePercent, percentLabel as calcPercentLabel,
  percentTone as calcPercentTone, hitsToKo as calcHitsToKo, boostLabel as calcBoostLabel,
  spSetToConfig as calcSpSetToConfig, configToSpSet as calcConfigToSpSet,
  blankSpSet as calcBlankSpSet, parseLegacyEvs as calcParseLegacyEvs, typeDe as calcTypeDe,
} from './damagecalc.mjs';
import {
  PRESS_CATEGORIES, PRESS_AUTHORS, AI_CATEGORY, authorById, categoryLabel, categoryColor,
  manualCategories, categoriesOf, normalizeCategories,
  randomAuthor, randomAuthors, pressSlots, slotLabel, typeLabel, isMatchComplete, isPressReleased, matchDocId,
  bonusRoundComplete, bonusRoundProgress, bonusSlotsFor, BONUS_ROUND_DAY, PRESS_FROM_DAY,
  outlookSlotFor, outlookSessionId, outlookProgress, seasonComplete, OUTLOOK_QUESTIONS,
  collectStorylines, sanitizeHtml, paragraphsToHtml, excerpt, readingMinutes,
  formatDate, formatDateTime, sortArticles, articleMatchesFilter, storyId,
} from './press.mjs';
import { buildContext, isReference } from './press-context.mjs';
import {
  DEFAULT_PROMPTS, PROMPT_DEFS, buildSystem, buildUserPrompt, buildDirection,
  ARTICLE_SCHEMA, ARTICLE_SCHEMA_WITH_CATEGORY, ARTICLE_SCHEMA_FREE_CATEGORY, QUESTIONS_SCHEMA,
} from './press-prompts.mjs';
import { generateJson, testKey, GEMINI_MODELS, DEFAULT_MODEL } from './gemini.mjs';
import {
  PLAYERS as AUTH_PLAYERS, userId, playerOf, otherPlayer,
  createCredential, verifyCredential, isValidSession,
  encryptJson, decryptJson, ownsTeam as authOwnsTeam, teamIdsOf,
} from './auth.mjs';
import {
  NOTE_SCOPE, blankNotes, normalizeNotes, teamNote, matchNote, withNote, countNotes,
  blankLog, logText, logUpdatedAt, hasLog, logAuthors, logToText,
} from './notes.mjs';

const PICKS_PER_TEAM = 10;
const TIER_ORDER = ['S', 'A', 'B', 'C', 'D'];

const ICONS = {
  draft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="13" width="5.5" height="8" rx="1.5"/><rect x="9.25" y="13" width="5.5" height="8" rx="1.5"/><rect x="16" y="13" width="5.5" height="8" rx="1.5"/><path d="M12 10V3"/><path d="m9 6 3-3 3 3"/></svg>`,
  standings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18"/><path d="M3 14.5h18"/><path d="M8.5 9v11"/></svg>`,
  schedule: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M7 14h3"/><path d="M14 14h3"/><path d="M7 17.5h3"/><path d="M14 17.5h3"/></svg>`,
  teams: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 5.8v5.4c0 4.3 3.1 8.1 7.5 9.6 4.4-1.5 7.5-5.3 7.5-9.6V5.8z"/><path d="M9 10.5h6"/><path d="M12 10.5v4.5"/></svg>`,
  player: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><path d="M2 20a5 5 0 0 1 10 0"/><path d="M12 20a5 5 0 0 1 10 0"/></svg>`,
  build: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="7" height="12" rx="2"/><rect x="14.5" y="6" width="7" height="12" rx="2"/><path d="M12 4v3.5"/><path d="M12 10.5v3"/><path d="M12 16.5v3.5"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  transfer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13"/><path d="m14 5 3 3-3 3"/><path d="M20 16H7"/><path d="m10 13-3 3 3 3"/></svg>`,
  award: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><path d="M8.2 14.2 6.5 21l5.5-2.8L17.5 21l-1.7-6.8"/></svg>`,
  stats: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="11" width="3" height="5" rx="0.5"/><rect x="12" y="7" width="3" height="9" rx="0.5"/><rect x="17" y="13" width="3" height="3" rx="0.5"/></svg>`,
  press: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13a1 1 0 0 1 1 1v12a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1z"/><path d="M18 9h2a1 1 0 0 1 1 1v8"/><path d="M7 9h7"/><path d="M7 13h7"/><path d="M7 17h4"/></svg>`,
  record: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8v5a4 4 0 0 1-8 0z"/><path d="M8 5H5v2a3 3 0 0 0 3 3"/><path d="M16 5h3v2a3 3 0 0 1-3 3"/><path d="M12 12v4"/><path d="M9 20h6"/><path d="M10 16h4l1 4H9z"/></svg>`,
};

const TYPE_COLORS = {
  Normal: '#9099a1',
  Feuer: '#ff9d55',
  Wasser: '#4d90d5',
  Elektro: '#f4d23c',
  Pflanze: '#63bc5a',
  Eis: '#73cec0',
  Kampf: '#ce4069',
  Gift: '#ab6ac8',
  Boden: '#d97746',
  Flug: '#8fa9de',
  Psycho: '#f97176',
  'Käfer': '#90c12c',
  Gestein: '#c7b78b',
  Geist: '#5269ac',
  Drache: '#0b6dc3',
  Unlicht: '#5a5366',
  Stahl: '#5a8ea2',
  Fee: '#ec8fe6',
};

const TIER_COLORS = {
  S: '#e3350d',
  A: '#ffcb05',
  B: '#4d90d5',
  C: '#63bc5a',
  D: '#9099a1',
};

// Anmeldung: Spieler, Passwort-Prüfsumme und Datenschlüssel bleiben gerätelokal,
// damit man sich nicht bei jedem Aufruf neu anmelden muss.
const AUTH_KEY = 'jhdl-auth-v1';       // { player, hash, key }

// Persistente, gerätelokale Anzeige-Einstellungen der Team-Analyse-Bereiche.
const SPEED_SETTINGS_KEY = 'jhdl-speedtiers-v1'; // { [monName]: { show, x15, x2, sp, nat } }
const WEAK_SETTINGS_KEY = 'jhdl-weakness-v1';   // { [monName]: true }  (ausgeschlossen)

// Matchup-Markierungen: pro Team-Paarung (reihenfolge-unabhängig) je Pokémon eine Farbe,
// die durch Klick rotiert. Rein gerätelokal, nur für den Nutzer selbst.
const MATCHUP_MARKS_KEY = 'jhdl-matchup-marks-v1'; // { [pairKey]: { [monName]: 'green'|'yellow'|'orange'|'red' } }
const MARK_CYCLE = [null, 'green', 'yellow', 'orange', 'red'];
const MARK_COLORS = { green: '#63bc5a', yellow: '#ffcb05', orange: '#ff9d55', red: '#e3350d' };

// Wer sitzt an diesem Gerät? Steuert, wessen Nominierungen/Stimmen gespeichert werden.
const SIDEBAR_KEY = 'jhdl-sidebar-v1'; // { collapsed: bool }
const SQ_KEY = 'jhdl-spieler-sq-v1';   // { mode:'abs'|'pct', min:number }

// Teambuilding: zuletzt geöffnetes Matchup + letzte 6 (gerätelokal).
const TB_RECENT_KEY = 'jhdl-tb-recent-v1';   // { last: {a,b}, recent: [{a,b}, …≤6] }
// Notizen & Moveset je Pokémon PRO Matchup (reihenfolge-unabhängiger markPairKey).
const TB_NOTES_KEY = 'jhdl-tb-notes-v1';     // { [markPairKey]: { [monName]: { note, moveset } } }
const TB_TILEVIEW_KEY = 'jhdl-tb-tileview-v1'; // { v: 'nur'|'notes'|'moves'|'all' }
// Filter „nur grün markierte" – getrennt für Kader-Kacheln und Initiative-Tierlist.
const TB_GREENONLY_KEY = 'jhdl-tb-greenonly-v1'; // { tiles: bool, speed: bool }
const TB_CALC_KEY = 'jhdl-tb-calc-v1';           // { open: bool }  (Eingaben je Paarung separat)
const TB_LOG_KEY = 'jhdl-tb-log-v1';             // { open: bool }  (Notiz-/Verlaufsbereich)

// Presse: Zugangsdaten der Redaktion liegen bewusst NUR auf dem Gerät. Firestore ist
// offen lesbar — ein API-Key hätte dort nichts verloren.
const PRESS_KEY = 'jhdl-press-key-v1';           // { key, model }
const PRESS_FILTER_KEY = 'jhdl-press-filter-v1'; // { category, teamId, q }
// Freie Beiträge je Spieltag — freigeschaltet mit dem 1., 2. und 3. fertigen Match.
const RANDOM_ARTICLES_PER_DAY = 3;
// Freie Beiträge der Pause zwischen zwei Saisons. Sie werden nicht auf einen Schlag
// freigeschaltet, sondern nacheinander — je einer mit jeder abgeschlossenen
// Ausblicks-Pressekonferenz. So bleibt die Pause über Wochen in Bewegung.
const OFFSEASON_ARTICLES = 5;

// Marktwerte: letzter gesehener Stand + das Ergebnis des letzten Updates.
// Beides gerätelokal — die Animation zeigt, was SEIT DEM LETZTEN BESUCH passiert ist.
// Gewählter Saison-Bereich: eine Saisonnummer oder 'all' (saisonübergreifend).
const SEASON_KEY = 'jhdl-season-v1'; // { scope }

const ELO_PREV_KEY = 'jhdl-elo-prev-v1';   // { [name]: { elo, tier } }
const ELO_DIFF_KEY = 'jhdl-elo-lastdiff-v1'; // { at, tierChanges, up, down, changed, total }

// Kurzkürzel je Typ für die kompakte Schwächen-Matrix.
const TYPE_ABBR = {
  Normal: 'NOR', Feuer: 'FEU', Wasser: 'WAS', Elektro: 'ELE', Pflanze: 'PFL',
  Eis: 'EIS', Kampf: 'KAM', Gift: 'GIF', Boden: 'BOD', Flug: 'FLU', Psycho: 'PSY',
  'Käfer': 'KÄF', Gestein: 'GES', Geist: 'GEI', Drache: 'DRA', Unlicht: 'UNL',
  Stahl: 'STA', Fee: 'FEE',
};

function loadJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') || {};
  } catch (e) {
    return {};
  }
}
function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
  if (isSyncedKey(key)) syncHook?.(key);
}

// === Teambuilder-Daten: gerätelokal, auf Wunsch verschlüsselt in der Datenbank ===
// Alles, was unter diesen Präfixen im localStorage liegt, gehört inhaltlich zum
// Teambuilder: Sets und Notizen, Speed-Tier-Einstellungen, Markierungen der Paarungen
// und die Eingaben des Schadensrechners. Der Store unten spiegelt genau diese Schlüssel.
const SYNC_PREFIXES = ['jhdl-tb-', 'jhdl-speedtiers-', 'jhdl-weakness-', 'jhdl-matchup-marks-'];
const SYNC_SCOPE = 'teambuilder';
const SYNC_AUTO_KEY = 'jhdl-tb-sync-v1'; // { auto: bool }

function isSyncedKey(key) {
  const k = String(key || '');
  return k !== SYNC_AUTO_KEY && SYNC_PREFIXES.some((prefix) => k.startsWith(prefix));
}

// Wird vom Sync-Store gesetzt; bleibt null, solange niemand mithört.
let syncHook = null;

// === Speed-Tier-Einstellungen (geteilt) =====================================
// Anzeige-Konfiguration eines Pokémon in den Initiative-Tabellen. `sp = null`
// bedeutet „Standardannahme": 0 UND 32 SP. `nat` wählt die Wesen-Varianten.
const NAT_MODES = ['both', 'all', 'neutral', 'up', 'down'];
const NAT_LABELS = {
  both: 'neutral & Init+',
  all: 'Init−, neutral & Init+',
  neutral: 'nur neutral',
  up: 'nur Init+',
  down: 'nur Init−',
};

function normalizeSpd(raw) {
  const s = raw || {};
  return {
    sp: s.sp == null ? null : clampSp(s.sp),
    nat: NAT_MODES.includes(s.nat) ? s.nat : 'both',
  };
}
// Kurzform für den Konfigurations-Knopf: „0/32" (Standard) oder der SP-Wert.
function spdBadge(cfg) {
  return cfg.sp == null ? '0/32' : String(cfg.sp);
}
// Farbe eines Investment-Falls: 0 SP neutral grau, investiert orange, Init+-Wesen gelb,
// Init−-Wesen violett. `nature` ist 'up'|'neutral'|'down' (Boolean weiterhin erlaubt).
function invTone(sp, nature) {
  if (nature === true || nature === 'up') return '#ffcb05';
  if (nature === 'down') return '#ab6ac8';
  return sp > 0 ? '#ff5a36' : '#98a2b3';
}
// Aktive In-Battle-Modifikatoren eines Pokémon. ×1 immer; ×1,5/×2 direkt an der Zeile,
// ×0,5/×0,67 (Grollrolle/Klebenetz) nur über den Konfigurations-Dialog.
const SPEED_MOD_DEFS = [
  { key: 'x05', label: '×0,5', mult: 0.5, color: '#ab6ac8' },
  { key: 'x067', label: '×0,67', mult: 2 / 3, color: '#c08552' },
  { key: 'x15', label: '×1,5', mult: 1.5, color: '#4d90d5' },
  { key: 'x2', label: '×2', mult: 2, color: '#63bc5a' },
];
const SPEED_MOD_BY_KEY = Object.fromEntries(SPEED_MOD_DEFS.map((m) => [m.key, m]));
function speedMods(cfg) {
  const mods = [{ key: 'x1', label: '×1', mult: 1 }];
  SPEED_MOD_DEFS.forEach((m) => { if (cfg[m.key]) mods.push({ key: m.key, label: m.label, mult: m.mult }); });
  return mods;
}
function modTone(key) {
  return SPEED_MOD_BY_KEY[key]?.color || '#98a2b3';
}

// === Statistik-Katalog ======================================================
// Zentrale Definition aller Pokémon-Kennzahlen: Beschriftung, Kurzform, Format
// und Erklärtext (für die Info-Popovers). Reihenfolge = Standard-Spaltenreihenfolge.
const STAT_CATALOG = [
  { key: 'kills', label: 'Kills', short: 'K', fmt: 'int', info: 'Anzahl gegnerischer Pokémon, die dieses Pokémon besiegt hat. Self-Kills zählen nicht.' },
  { key: 'deaths', label: 'Deaths', short: 'D', fmt: 'int', info: 'Wie oft dieses Pokémon besiegt wurde – inklusive Self-Kills und ohne Verursacher.' },
  { key: 'kd', label: 'K/D', short: 'K/D', fmt: 'num2', info: 'Verhältnis Kills zu Deaths (Kills geteilt durch Deaths, Nenner mindestens 1).' },
  { key: 'killsPerBattle', label: 'Kills/Kampf', short: 'K/Kpf', fmt: 'num2', info: 'Durchschnittliche Kills pro eingesetztem Kampf.' },
  { key: 'kpfPerMu', label: 'Kämpfe/Matchup', short: 'Kpf/MU', fmt: 'num2', info: 'Durchschnittliche Kampf-Einsätze pro Match-Aufgebot (0–3): Wie oft ein nominiertes Pokémon tatsächlich in einem der bis zu drei Kämpfe steht.' },
  { key: 'battleShareInMu', label: 'Kämpfe % (Aufgebot)', short: 'Kpf % AG', fmt: 'pct', info: 'Einsatzquote im Matchup: Wenn nominiert (6er-Aufgebot), Anteil der bis zu drei Kämpfe, in denen dieses Pokémon tatsächlich stand. Matches ohne Nominierung bleiben außen vor.' },
  { key: 'battleShareInRoster', label: 'Kämpfe % (Kader)', short: 'Kpf %', fmt: 'pct', info: 'Einsatzquote im Kader: Anteil aller ausgetragenen Kämpfe des Teams, in denen dieses Pokémon stand — Matches, in denen es nicht nominiert war, zählen hier im Nenner mit. Zeigt also, wie viel vom gesamten Kampfgeschehen des Teams über dieses Pokémon lief. Ein im Wintertransfer geholtes Pokémon zählt erst ab der Rückrunde mit — die Hinrunde war für es nicht spielbar.' },
  { key: 'matchups', label: 'Matchups', short: 'MU', fmt: 'int', info: 'In wie vielen Match-Aufgeboten (6 von 10) dieses Pokémon stand.' },
  { key: 'battles', label: 'Kämpfe', short: 'Kpf', fmt: 'int', info: 'In wie vielen ausgetragenen Kämpfen (4er-Einsatz) es stand.' },
  { key: 'battleWinPct', label: 'Kampf-Siegquote', short: 'Kpf-SQ', fmt: 'pct', info: 'Anteil gewonnener Kämpfe an allen Kämpfen, in denen es eingesetzt wurde.' },
  { key: 'matchWinPct', label: 'Match-Siegquote', short: 'M-SQ', fmt: 'pct', info: 'Anteil gewonnener Matches an allen Matches, in denen es im Aufgebot stand.' },
  { key: 'survivalRate', label: 'Überlebensrate', short: 'Überl.', fmt: 'pct', info: 'Anteil der Kämpfe, die es überlebt hat (kein Death).' },
  { key: 'base_speed', label: 'Initiative', short: 'Init', fmt: 'int', info: 'Basis-Initiative (Speed-Basiswert) aus den Stammdaten.' },
  { key: 'marktwert', label: 'Marktwert', short: 'MW', fmt: 'market', info: 'Aktueller Marktwert, umgerechnet aus dem Elo-Wert des öffentlichen Draft-Sheets. Nach oben eskalieren die Beträge, im unteren Korridor liegen sie dicht beieinander. „—" heißt: im Sheet nicht gefunden.' },
  { key: 'elo', label: 'Elo', short: 'Elo', fmt: 'elo', info: 'Der rohe Elo-Wert hinter dem Marktwert — aus dem öffentlichen Draft-Sheet. „—" heißt: im Sheet nicht gefunden.' },
  { key: 'cost', label: 'Kosten', short: 'Kosten', fmt: 'int', info: 'Draft-Kosten (Punkte) des Pokémon.' },
  // `scope: 'all'` — nur im saisonübergreifenden Bereich sinnvoll und dort auch nur
  // dort sichtbar (siehe columnsMixin).
  { key: 'seasonsPlayed', label: 'Saisons', short: 'Sais.', fmt: 'int', scope: 'all', info: 'In wie vielen Saisons dieses Pokémon mindestens einmal im Aufgebot stand.' },
  { key: 'clubs', label: 'Teams', short: 'Teams', fmt: 'int', scope: 'all', info: 'Für wie viele verschiedene Teams dieses Pokémon über die Saisons hinweg gespielt hat.' },
];
const STAT_BY_KEY = Object.fromEntries(STAT_CATALOG.map((s) => [s.key, s]));
const STAT_KEYS = STAT_CATALOG.map((s) => s.key);
const DEFAULT_COLS = ['kills', 'deaths', 'matchups', 'battles'];

// Weitere Erklärtexte für Kennzahlen außerhalb der Tabellen (Info-Popovers).
const EXTRA_INFO = {
  matchupPct: 'Anteil der Matches, in denen dieses Pokémon im 6er-Aufgebot stand.',
  battleShare: 'Anteil der Team-Kämpfe, in denen dieses Pokémon eingesetzt wurde.',
  diff: 'Kill-Differenz: Kills minus Deaths. Zweites Sortierkriterium der Tabelle.',
  points: 'Ein Punkt je gewonnenem Kampf über die gesamte Saison.',
  avgPlace: 'Durchschnittliche Tabellenplatzierung aller Teams dieses Spielers.',
};

function fmtStat(value, fmt) {
  const v = Number.isFinite(value) ? value : 0;
  if (fmt === 'pct') return `${Math.round(v * 100)} %`;
  if (fmt === 'num2') return v.toFixed(2);
  if (fmt === 'elo') return v > 0 ? String(Math.round(v)) : '—';
  if (fmt === 'market') return v > 0 ? formatMarket(v) : '—';
  return String(v);
}

// Elo-Wert UND daraus abgeleiteten Marktwert an Ranking-Zeilen hängen (0 = unbekannt).
function withElo(list, eloRows) {
  const byName = {};
  (eloRows || []).forEach((r) => { if (r?.resolved) byName[r.resolved] = r.elo; });
  return list.map((s) => {
    const e = byName[s.pokemon?.name];
    const elo = Number.isFinite(e) ? e : 0;
    return { ...s, elo, marktwert: elo > 0 ? marketValue(elo) : 0 };
  });
}

// Tier-Bänder für die Verlaufsdiagramme: die Elo-Grenzen aus dem Sheet, umgerechnet
// in Marktwerte, damit sie auf der Werteachse liegen.
function marketBands(eloRows) {
  return tierBoundaries(eloRows).map((b) => ({
    tier: b.tier,
    color: TIER_COLORS[b.tier] || '#6b7280',
    from: b.minElo == null ? null : marketValue(b.minElo),
    to: b.maxElo == null ? null : marketValue(b.maxElo),
  }));
}

// Rang eines Tiers (S bester). Unbekannt/leer -> hinten.
function tierRank(t) {
  const i = TIER_ORDER.indexOf(t);
  return i < 0 ? 99 : i;
}

// Relative Zeit („vor 3 min") für den Elo-Aktualisierungs-Zeitstempel.
function fmtAgo(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 45) return 'gerade eben';
  const min = Math.round(sec / 60);
  if (min < 60) return `vor ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} h`;
  return `vor ${Math.round(h / 24)} d`;
}

// Spalten-Steuerung (Sichtbarkeit, Reihenfolge, Sortierung, Drag&Drop) als
// wiederverwendbarer Mixin – wird in Team- und Liga-Ranking eingespreizt.
function columnsMixin(storageKey) {
  return {
    colStorageKey: storageKey,
    colOrder: [...STAT_KEYS],
    colVisible: Object.fromEntries(STAT_KEYS.map((k) => [k, DEFAULT_COLS.includes(k)])),
    sortKey: 'kills',
    sortDir: 'desc',
    sortKey2: '',      // optionale zweite Sortiermetrik ('' = aus)
    sortDir2: 'desc',
    viewMode: 'table', // 'table' | 'cards'
    catalog: STAT_CATALOG,
    _dragKey: null,

    initColumns() {
      const saved = loadJson(this.colStorageKey);
      if (saved && Array.isArray(saved.order)) {
        // Nur bekannte Keys übernehmen, fehlende hinten anhängen (Katalog-Erweiterungen).
        const known = saved.order.filter((k) => STAT_BY_KEY[k]);
        const missing = STAT_KEYS.filter((k) => !known.includes(k));
        this.colOrder = [...known, ...missing];
      }
      if (saved && saved.visible) {
        this.colVisible = Object.fromEntries(STAT_KEYS.map((k) => [k, !!saved.visible[k]]));
      }
      if (saved && STAT_BY_KEY[saved.sortKey]) this.sortKey = saved.sortKey;
      if (saved && (saved.sortDir === 'asc' || saved.sortDir === 'desc')) this.sortDir = saved.sortDir;
      if (saved && STAT_BY_KEY[saved.sortKey2]) this.sortKey2 = saved.sortKey2;
      if (saved && (saved.sortDir2 === 'asc' || saved.sortDir2 === 'desc')) this.sortDir2 = saved.sortDir2;
      if (saved && (saved.view === 'table' || saved.view === 'cards')) this.viewMode = saved.view;
      if (!this.visibleCols().length) this.colVisible[this.colOrder[0]] = true; // nie 0 Spalten
    },
    saveColumns() {
      saveJson(this.colStorageKey, {
        order: this.colOrder,
        visible: this.colVisible,
        sortKey: this.sortKey,
        sortDir: this.sortDir,
        sortKey2: this.sortKey2,
        sortDir2: this.sortDir2,
        view: this.viewMode,
      });
    },
    toggleView() {
      this.viewMode = this.viewMode === 'table' ? 'cards' : 'table';
      this.saveColumns();
    },
    // Als Methoden (nicht Getter!): der Object-Spread beim Einspreizen des Mixins
    // würde Getter sonst einmalig auswerten und einfrieren.
    // Kennzahlen, die nur in einem Bereich Sinn ergeben, verschwinden im anderen —
    // `scope: 'all'` erscheint ausschließlich saisonübergreifend.
    inScope(stat) {
      if (!stat) return false;
      if (!stat.scope) return true;
      return (stat.scope === 'all') === !!Alpine.store('season')?.isAll;
    },
    orderedCatalog() {
      return this.colOrder.map((k) => STAT_BY_KEY[k]).filter((x) => this.inScope(x));
    },
    visibleCols() {
      return this.colOrder
        .filter((k) => this.colVisible[k])
        .map((k) => STAT_BY_KEY[k])
        .filter((x) => this.inScope(x));
    },
    toggleCol(key) {
      const on = !this.colVisible[key];
      if (!on && this.visibleCols().length <= 1) return; // mindestens eine Spalte
      this.colVisible = { ...this.colVisible, [key]: on };
      if (this.sortKey === key && !on) {
        const first = this.visibleCols()[0];
        if (first) this.sortKey = first.key;
      }
      this.saveColumns();
    },
    // Sortieren nach einer ausgeblendeten Kennzahl ist erlaubt — die Auswahl der
    // zweiten Metrik listet daher den kompletten Katalog.
    sortChoices() {
      return this.orderedCatalog().filter((c) => c.key !== this.sortKey);
    },
    setSort(key) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        this.sortKey = key;
        this.sortDir = 'desc';
      }
      // Die zweite Metrik darf nicht die erste doppeln.
      if (this.sortKey2 === this.sortKey) this.sortKey2 = '';
      this.saveColumns();
    },
    // Zweite Sortiermetrik: greift bei Gleichstand in der ersten.
    setSort2(key) {
      this.sortKey2 = key === this.sortKey ? '' : (STAT_BY_KEY[key] ? key : '');
      this.saveColumns();
    },
    toggleSortDir2() {
      this.sortDir2 = this.sortDir2 === 'desc' ? 'asc' : 'desc';
      this.saveColumns();
    },
    sortRows(rows) {
      const key = this.sortKey;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      const key2 = STAT_BY_KEY[this.sortKey2] ? this.sortKey2 : null;
      const dir2 = this.sortDir2 === 'asc' ? 1 : -1;
      return [...rows].sort((a, b) => {
        const primary = dir * ((a[key] ?? 0) - (b[key] ?? 0));
        if (primary) return primary;
        if (key2) {
          const secondary = dir2 * ((a[key2] ?? 0) - (b[key2] ?? 0));
          if (secondary) return secondary;
        }
        return a.pokemon.name.localeCompare(b.pokemon.name);
      });
    },
    colValue(row, key) {
      return fmtStat(row[key], STAT_BY_KEY[key]?.fmt);
    },
    // Pointer-basiertes Drag&Drop (touch-tauglich) im Spalten-Popover.
    colDragStart(key, e) {
      this._dragKey = key;
      if (e?.target?.setPointerCapture && e.pointerId != null) {
        try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
      }
    },
    colDragMove(e) {
      if (!this._dragKey) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-col-key]');
      const overKey = el?.dataset?.colKey;
      if (!overKey || overKey === this._dragKey) return;
      const order = [...this.colOrder];
      const from = order.indexOf(this._dragKey);
      const to = order.indexOf(overKey);
      if (from < 0 || to < 0) return;
      order.splice(from, 1);
      order.splice(to, 0, this._dragKey);
      this.colOrder = order;
    },
    colDragEnd() {
      if (!this._dragKey) return;
      this._dragKey = null;
      this.saveColumns();
    },
  };
}

// Text für ein HTML-Attribut in einem generierten String absichern.
function escAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// SVG-Pfade eines Wesen-Knopfs aus einer „d1|d2"-Kurzschreibweise (x-html).
function natIcon(spec) {
  return String(spec || '')
    .split('|')
    .filter(Boolean)
    .map((d) => `<path d="${d}"/>`)
    .join('');
}

// Info-Popover global öffnen (Light-Dismiss). Reicht Titel + Text an das App-Level weiter.
function openStatInfo(el, title, text) {
  window.dispatchEvent(new CustomEvent('stat-info', { detail: { title, text } }));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Bipartiter Spielplan: jedes Team von Janik trifft auf jedes Team von Henrik.
// Hinrunde über Rotation -> n Spieltage, je ein perfektes Matching (kein Team doppelt,
// nie gleicher Spieler). Rückrunde: gleiche Paarungen, neu gemischte Reihenfolge,
// getauschtes Heimrecht.
function buildSchedule(janikIds, henrikIds) {
  const n = Math.min(janikIds.length, henrikIds.length);
  if (n === 0) return [];
  const J = shuffle(janikIds).slice(0, n);
  const H = shuffle(henrikIds).slice(0, n);

  const hin = [];
  for (let i = 0; i < n; i++) {
    hin.push(J.map((home, j) => ({ home, away: H[(j + i) % n] })));
  }

  const rueck = shuffle(hin).map((md) =>
    shuffle(md).map((m) => ({ home: m.away, away: m.home })),
  );

  const matchdays = [];
  hin.forEach((matches, i) => matchdays.push({ day: i + 1, leg: 'hin', matches }));
  rueck.forEach((matches, i) => matchdays.push({ day: n + i + 1, leg: 'rueck', matches }));
  return matchdays;
}

// Rückfallfarbe für Linien ohne eigene Team-Farbe.
const CHART_LINE = '#4b5563';

// Aus dem Platzierungsverlauf eine SVG-Geometrie bauen (Platz 1 oben, gespielte Spieltage als X).
// styleFor(teamId, i) -> { logo, color } liefert Logo und Linienfarbe je Team.
function buildChart(history, teamsCount, styleFor) {
  const W = 640, H = 240, padL = 34, padR = 26, padT = 18, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const days = history.days || [];
  const n = Math.max(1, teamsCount);
  const minDay = days.length ? days[0] : 1;
  const maxDay = days.length ? days[days.length - 1] : 1;
  const xFor = (d) => (maxDay === minDay ? padL + innerW / 2 : padL + ((d - minDay) / (maxDay - minDay)) * innerW);
  const yFor = (place) => (n <= 1 ? padT + innerH / 2 : padT + ((place - 1) / (n - 1)) * innerH);
  const lines = Object.entries(history.series || {}).map(([teamId, pts], i) => {
    const style = (styleFor && styleFor(teamId, i)) || {};
    const dots = pts.map((p) => ({ day: p.day, place: p.place, x: xFor(p.day), y: yFor(p.place) }));
    return {
      teamId,
      color: style.color || CHART_LINE,
      logo: style.logo || null,
      dots,
      end: dots.length ? dots[dots.length - 1] : null,
      path: pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${xFor(p.day).toFixed(1)} ${yFor(p.place).toFixed(1)}`).join(' '),
    };
  });
  return {
    W, H, padL, padR, padT, padB,
    lines,
    yTicks: Array.from({ length: n }, (_, i) => ({ place: i + 1, y: yFor(i + 1) })),
    xTicks: days.map((d) => ({ day: d, x: xFor(d) })),
    hasData: days.length > 0,
  };
}

// Liniendiagramm als SVG-String (x-html); x-for im SVG-Namespace ist unzuverlässig.
function chartSvgString(chart) {
  if (!chart.hasData) return '';
  const grid = chart.yTicks
    .map(
      (t) =>
        `<line x1="${chart.padL}" x2="${chart.W - chart.padR}" y1="${t.y.toFixed(1)}" y2="${t.y.toFixed(1)}" stroke="#262d3a" stroke-width="1"/>` +
        `<text x="${chart.padL - 6}" y="${(t.y + 3).toFixed(1)}" text-anchor="end" fill="#98a2b3" font-size="10">${t.place}</text>`,
    )
    .join('');
  const xlabels = chart.xTicks
    .map((t) => `<text x="${t.x.toFixed(1)}" y="${chart.H - 8}" text-anchor="middle" fill="#98a2b3" font-size="10">${t.day}</text>`)
    .join('');
  // Logo-Marker an jedem Datenpunkt; der letzte (aktuellster Spieltag) etwas größer.
  const logoDot = (ln, d, i, j, last) => {
    const r = last ? 11 : 8.5;
    const id = `vt-clip-${i}-${j}`;
    if (!ln.logo) return `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="3.5" fill="${ln.color}"/>`;
    return (
      `<clipPath id="${id}"><circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${(r - 1.5).toFixed(1)}"/></clipPath>` +
      `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${r}" fill="#0f1219" stroke="#2a313d" stroke-width="1.5"/>` +
      `<image href="${ln.logo}" x="${(d.x - (r - 1.5)).toFixed(1)}" y="${(d.y - (r - 1.5)).toFixed(1)}" width="${((r - 1.5) * 2).toFixed(1)}" height="${((r - 1.5) * 2).toFixed(1)}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`
    );
  };
  const lines = chart.lines
    .map((ln, i) => {
      const lastIdx = ln.dots.length - 1;
      const path = `<path d="${ln.path}" fill="none" stroke="${ln.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const markers = ln.dots.map((d, j) => logoDot(ln, d, i, j, j === lastIdx)).join('');
      return path + markers;
    })
    .join('');
  return `<svg viewBox="0 0 ${chart.W} ${chart.H}" class="w-full" style="min-width:34rem" preserveAspectRatio="xMidYMid meet">${grid}${xlabels}${lines}</svg>`;
}

// Farbreihe für Diagramme mit mehreren Linien (Teams, Kader). Bewusst kräftig und
// gut unterscheidbar; die Team-Spielerfarbe reicht bei acht Teams nicht aus.
const SERIES_COLORS = [
  '#e3350d', '#4d90d5', '#63bc5a', '#ffcb05', '#ab6ac8',
  '#ff9d55', '#38bdf8', '#f472b6', '#22d3ee', '#a3e635',
];

function seriesColor(i) {
  return SERIES_COLORS[i % SERIES_COLORS.length];
}

// Vorschläge im Farbwähler. Bewusst kräftig und auf dunklem Grund lesbar; die
// eigentliche Wahl ist damit nicht begrenzt (der Wähler kennt auch das Farbfeld).
const TEAM_COLOR_PRESETS = [
  { hex: '#e3350d', name: 'Flammenrot' },
  { hex: '#ff7a18', name: 'Glutorange' },
  { hex: '#ffcb05', name: 'Blitzgelb' },
  { hex: '#a3e635', name: 'Giftgrün' },
  { hex: '#63bc5a', name: 'Blattgrün' },
  { hex: '#22d3ee', name: 'Eisblau' },
  { hex: '#38bdf8', name: 'Himmelblau' },
  { hex: '#4d90d5', name: 'Tiefblau' },
  { hex: '#8b5cf6', name: 'Psychoviolett' },
  { hex: '#f472b6', name: 'Feenrosa' },
  { hex: '#c08552', name: 'Bodenbraun' },
  { hex: '#98a2b3', name: 'Stahlgrau' },
];

// Nur waschechte 6-stellige Hex-Farben werden übernommen — alles andere wäre ein
// Freibrief für beliebige CSS-Werte in einem :style-Ausdruck.
function normalizeHexColor(value) {
  const v = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

/**
 * Die Farbe, mit der ein Team seitenweit dargestellt wird: die vom Besitzer gewählte,
 * sonst eine feste Ableitung aus der Team-ID. Die Ableitung ist stabil — dasselbe Team
 * bekommt in jedem Diagramm dieselbe Farbe, auch ohne hinterlegte Wahl.
 */
function teamColor(team) {
  const chosen = normalizeHexColor(team?.color);
  if (chosen) return chosen;
  const id = String(team?.id || '');
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return SERIES_COLORS[h % SERIES_COLORS.length];
}

// Eine Pokémon-Linie für das Marktwert-Verlaufsdiagramm. Tier-Wechsel werden am
// Punkt markiert, damit im Diagramm sichtbar wird, wann sich die Klasse ändert.
function monSeries(row, bounds, opts = {}) {
  let prevTier = null;
  const only = opts.only || null;
  const points = historyPoints(row).filter((h) => !only || only.has(h.key)).map((h) => {
    const meta = parseHistoryLabel(h.label);
    const tier = tierForElo(bounds, h.elo);
    const changed = prevTier != null && tier != null && tier !== prevTier;
    prevTier = tier;
    return {
      key: h.key, label: meta.label, short: meta.short,
      value: h.value, elo: h.elo, tier, tierChanged: changed,
      tierColor: TIER_COLORS[tier] || '#6b7280',
    };
  });
  return {
    key: row.resolved,
    label: opts.label || row.resolved,
    color: opts.color || '#4d90d5',
    highlight: !!opts.highlight,
    dimmed: !!opts.dimmed,
    points,
  };
}

// Diagramm an ein Element binden und bei neuen Sheet-Daten aktualisieren.
// `build()` liefert die komplette Konfiguration; der Beobachter wird je Schlüssel
// nur einmal registriert, auch wenn x-init erneut läuft.
function bindMarketChart(ctx, el, key, build) {
  if (!el) return;
  ctx._charts = ctx._charts || {};
  ctx._charts[key]?.destroy?.();
  ctx._charts[key] = renderMarketChart(el, build());
  ctx._chartWatched = ctx._chartWatched || {};
  if (ctx._chartWatched[key]) return;
  ctx._chartWatched[key] = true;
  const refresh = () => ctx._charts[key]?.update(build());
  ctx.$watch('$store.elo.rows', refresh);
  ctx.$watch('$store.league.teams', refresh);
}

// Stabiler, eindeutiger view-transition-name je Pokémon (dex trennt Geschlechts-/Formen).
function pokemonVtName(p) {
  const slug = (p?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `mon-${p?.dex ?? 'x'}-${slug}`;
}

// Umsortier-Transition: nur die benannten Kacheln sollen morphen, nicht der ganze
// Content-Bereich. Daher .view-Transition-Namen kurzzeitig deaktivieren.
function withReorderTransition(fn, nextTick) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) {
    fn();
    return;
  }
  const view = document.querySelector('.view');
  const prev = view ? view.style.viewTransitionName : '';
  if (view) view.style.viewTransitionName = 'none';
  const t = document.startViewTransition(async () => {
    fn();
    await nextTick();
  });
  t.finished.finally(() => {
    if (view) view.style.viewTransitionName = prev;
  });
}

// Anmeldemaske: erst Konto wählen, dann Passwort setzen bzw. eingeben.
// Die eigentliche Logik liegt im Store, damit der Rest der App sie mitnutzen kann.
function authGate() {
  return {
    step: 'choose',
    choice: null,
    pw: '',
    pw2: '',
    error: '',
    busy: false,
    showPw: false,

    get auth() { return this.$store.auth; },
    get ready() { return this.auth.loaded; },
    get unlocked() { return this.auth.isLoggedIn; },
    get players() { return this.auth.players; },
    get isNew() { return !!this.choice && !this.auth.hasAccount(this.choice); },

    playerColor(player) { return player === 'Henrik' ? '#4d90d5' : '#e3350d'; },

    pick(player) {
      this.choice = player;
      this.step = 'password';
      this.pw = '';
      this.pw2 = '';
      this.error = '';
      this.$nextTick(() => this.$refs.pwField?.focus());
    },

    back() {
      this.step = 'choose';
      this.choice = null;
      this.pw = '';
      this.pw2 = '';
      this.error = '';
    },

    async submit() {
      if (this.busy || !this.choice) return;
      this.error = '';

      if (this.isNew) {
        if (this.pw.length < 6) { this.error = 'Das Passwort braucht mindestens sechs Zeichen.'; return; }
        if (this.pw !== this.pw2) { this.error = 'Die beiden Eingaben stimmen nicht überein.'; this.pw2 = ''; return; }
      } else if (!this.pw) {
        this.error = 'Bitte gib dein Passwort ein.';
        return;
      }

      this.busy = true;
      try {
        const res = this.isNew
          ? await this.auth.register(this.choice, this.pw)
          : await this.auth.login(this.choice, this.pw);
        if (!res.ok) {
          this.error = res.error || 'Das hat nicht geklappt.';
          this.pw = '';
          this.pw2 = '';
        } else {
          this.$store.league.ensureNotifyPermission?.();
        }
      } finally {
        this.busy = false;
      }
    },
  };
}

function app() {
  return {
    current: null,
    toasts: [],
    _toastSeq: 0,
    _booted: false,

    // Verlauf: eigener Stack für die Zurück-Leiste, gespiegelt in history.state.
    _stack: [],
    _navIdx: -1,
    _fromHistory: false,

    // Globale Suche (Strg/⌘ + K)
    searchQ: '',
    searchIndex: 0,
    // Info-Popover (geteilt)
    info: { title: '', text: '' },
    // Sidebar ein-/ausklappbar (gerätelokal)
    navCollapsed: false,

    initApp() {
      this.navCollapsed = !!loadJson(SIDEBAR_KEY).collapsed;
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
          e.preventDefault();
          this.openSearch();
        }
      });
      window.addEventListener('stat-info', (e) => this.showInfo(e.detail));
      this.initBlurOnOutside();
      this.initHistory();
      this.bootView();
    },

    // === Verlauf ============================================================
    // Die App hat weiterhin kein URL-Routing: jede Ansicht legt einen History-
    // Eintrag mit UNVERÄNDERTER URL an. Damit funktioniert der Browser-Zurück-
    // Knopf, ohne dass Deep-Links oder ein Server-Rewrite nötig wären.
    initHistory() {
      window.addEventListener('popstate', (e) => {
        const entry = e.state?.jhdl;
        if (!entry) return;
        this._navIdx = Number.isFinite(entry.idx) ? entry.idx : 0;
        this._fromHistory = true;
        this.applyNavParams(entry.params || {});
        this._syncBackFlag();
        this.load(entry.key, { animate: true });
      });
    },
    // Ziel-Parameter (Team, Match, Pokémon…) in den Übergabepuffer schreiben.
    applyNavParams(params) {
      const nav = this.$store.nav;
      if (!nav) return;
      nav.teamId = params.teamId || null;
      nav.matchId = params.matchId || null;
      nav.pokemonName = params.pokemonName || null;
      nav.teamAId = params.teamAId || null;
      nav.teamBId = params.teamBId || null;
      nav.from = params.from || null;
    },
    _pushHistory(key, params) {
      const entry = { key, params: params || {}, label: this.labelFor(key) };
      this._stack = this._stack.slice(0, this._navIdx + 1);
      this._stack.push(entry);
      this._navIdx = this._stack.length - 1;
      try {
        history.pushState({ jhdl: { ...entry, idx: this._navIdx } }, '');
      } catch (e) { /* private mode o.ä. — Verlauf bleibt dann nur in-memory */ }
      this._syncBackFlag();
    },
    _replaceHistory(key, params) {
      const entry = { key, params: params || {}, label: this.labelFor(key) };
      this._stack = [entry];
      this._navIdx = 0;
      try {
        history.replaceState({ jhdl: { ...entry, idx: 0 } }, '');
      } catch (e) { /* s.o. */ }
      this._syncBackFlag();
    },
    _syncBackFlag() {
      if (this.$store.nav) this.$store.nav.canBack = this.canGoBack;
    },
    labelFor(key) {
      if (key === 'pokemon') return 'Pokémon';
      return this.routes.find((r) => r.key === key)?.label || 'Ansicht';
    },
    get canGoBack() {
      return this._navIdx > 0;
    },
    // Beschriftung der Zurück-Leiste: die Ansicht, zu der es zurückgeht.
    get backLabel() {
      const prev = this._stack[this._navIdx - 1];
      return prev?.label ? `Zurück zu ${prev.label}` : 'Zurück';
    },
    goBack() {
      if (!this.canGoBack) return;
      history.back();
    },
    // Sidebar/Mobile-Nav: Ansicht ohne Ziel-Parameter öffnen.
    navTo(key) {
      this.applyNavParams({});
      this.load(key, { params: {} });
    },

    toggleNav() {
      this.navCollapsed = !this.navCollapsed;
      saveJson(SIDEBAR_KEY, { collapsed: this.navCollapsed });
    },

    // iPadOS/Safari geben den Fokus nicht ab, wenn man neben ein Eingabefeld tippt —
    // die Bildschirmtastatur bleibt dann offen. Ein Tap auf neutrale Fläche (kein
    // Formularelement, kein Button, kein Label) nimmt darum aktiv den Fokus.
    initBlurOnOutside() {
      const interactive = 'input, textarea, select, button, a, label, [contenteditable="true"], [popover]';
      const blurIfOutside = (e) => {
        const el = document.activeElement;
        if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
        if (e.target instanceof Element && e.target.closest(interactive)) return;
        el.blur();
      };
      // pointerdown deckt Maus + Stift ab, touchend zusätzlich iPadOS-Gesten.
      document.addEventListener('pointerdown', blurIfOutside, true);
      document.addEventListener('touchend', blurIfOutside, true);
    },

    // === Startansicht ======================================================
    // Sie hängt vom Liga-Zustand ab, also erst entscheiden, wenn Draft-, Transfer-
    // und Spielplan-Snapshot da sind. Falls Firestore nicht antwortet, nach einem
    // kurzen Timeout trotzdem starten (Fallback-Reihenfolge in startKey()).
    bootView() {
      if (this.bootReady) return this.boot();
      this.$watch('bootReady', () => { if (this.bootReady) this.boot(); });
      setTimeout(() => this.boot(), 4000);
    },
    boot() {
      if (this._booted) return;
      this._booted = true;
      this.load(this.startKey(), { animate: false, replace: true });
    },
    get bootReady() {
      const l = this.$store.league;
      return !!(l.draftLoaded && l.transferLoaded && l.scheduleLoaded);
    },
    // Laufender Transfer > laufender Draft > Spielplan (sobald ausgelost) > Draft.
    startKey() {
      const l = this.$store.league;
      if (l.transfer?.status === 'running') return 'transfer';
      if (l.draft?.status === 'running') return 'draft';
      if ((l.schedule?.matchdays || []).length) return 'spieltag';
      return 'draft';
    },
    get isMac() {
      return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    },
    get shortcutHint() {
      return this.isMac ? '⌘K' : 'Strg K';
    },

    // Verlinkungs-Navigation: Ziel im nav-Store ablegen, dann Ansicht laden.
    onNavigate(detail) {
      if (!detail || !detail.key) return;
      const params = {
        teamId: detail.teamId || null,
        matchId: detail.matchId || null,
        pokemonName: detail.pokemonName || null,
        teamAId: detail.teamAId || null,
        teamBId: detail.teamBId || null,
        // Herkunft merken, damit der Pokémon→Pokémon-Wechsel nicht die ursprüngliche
        // Ausgangsansicht überschreibt.
        from: detail.key === 'pokemon' && this.current !== 'pokemon' ? this.current : (this.$store.nav?.from || null),
      };
      this.applyNavParams(params);
      this.load(detail.key, { params });
    },

    pushToast(detail) {
      if (!detail || !detail.msg) return;
      const id = ++this._toastSeq;
      this.toasts.push({ id, msg: detail.msg, icon: detail.icon || null });
      setTimeout(() => { this.toasts = this.toasts.filter((t) => t.id !== id); }, 4500);
    },

    // Feste Reihenfolge nach Relevanz. Transfer erscheint erst nach abgeschlossenem
    // Draft; ein laufender Draft bzw. ein laufendes Transferfenster rückt vorübergehend
    // auf Position 1.
    get items() {
      const byKey = {
        tabelle: { key: 'tabelle', label: 'Tabelle', file: './pages/tabelle.html', icon: ICONS.standings },
        spieltag: { key: 'spieltag', label: 'Spielplan', file: './pages/spieltag.html', icon: ICONS.schedule },
        teambuilding: { key: 'teambuilding', label: 'Teambuilding', file: './pages/teambuilding.html', icon: ICONS.build },
        teams: { key: 'teams', label: 'Teams', file: './pages/teams.html', icon: ICONS.teams },
        stats: { key: 'stats', label: 'Statistiken', file: './pages/statistiken.html', icon: ICONS.stats },
        presse: { key: 'presse', label: 'Presse', file: './pages/presse.html', icon: ICONS.press },
        awards: { key: 'awards', label: 'Awards', file: './pages/awards.html', icon: ICONS.award },
        spieler: { key: 'spieler', label: 'Spieler', file: './pages/spieler.html', icon: ICONS.player },
        draft: { key: 'draft', label: 'Draft', file: './pages/draft.html', icon: ICONS.draft },
        transfer: { key: 'transfer', label: 'Transfer', file: './pages/transfer.html', icon: ICONS.transfer },
        rekorde: { key: 'rekorde', label: 'Rekorde', file: './pages/rekorde.html', icon: ICONS.record },
      };
      const l = this.$store.league;
      // Saisonübergreifend gibt es nur, was über Saisongrenzen hinweg Sinn ergibt:
      // Spielplan, Teambuilding, Teams, Draft und Transfer gehören immer zu genau
      // einer Saison und fallen deshalb weg; dafür kommen die Rekorde dazu.
      if (this.$store.season?.isAll) {
        return ['tabelle', 'stats', 'presse', 'awards', 'spieler', 'rekorde'].map((k) => byKey[k]);
      }
      const keys = ['tabelle', 'spieltag', 'teambuilding', 'teams', 'stats', 'presse', 'awards', 'spieler', 'draft'];
      if (l.draft?.status === 'done') keys.push('transfer');
      const hot = l.transfer?.status === 'running' ? 'transfer'
        : l.draft?.status === 'running' ? 'draft'
        : null;
      const ordered = hot ? [hot, ...keys.filter((k) => k !== hot)] : keys;
      return ordered.map((k) => byKey[k]).filter(Boolean);
    },

    // Vollständiger Route-Katalog inkl. versteckter Pokémon-Detailansicht (nicht in
    // Sidebar/Mobile-Nav, nur per Verlinkung erreichbar).
    get routes() {
      return [...this.items, { key: 'pokemon', file: './pages/pokemon.html' }];
    },

    isActive(key) {
      return this.current === key;
    },

    // Saisonwechsel: die aktuelle Ansicht bleibt, wenn es sie im neuen Bereich gibt —
    // sonst zurück auf die Tabelle. Neu laden muss sie in jedem Fall, damit die
    // Komponente ihre Daten für den neuen Bereich holt.
    // --- Saison-Umschalter --------------------------------------------------
    // „Live" ist nur die jüngste Saison; ältere Bereiche und der übergreifende
    // sind Archiv und sollen nicht pulsieren.
    get isLiveSeason() {
      const list = this.$store.season.list;
      return this.$store.season.scope === list[list.length - 1];
    },
    seasonHint(scope) {
      const l = this.$store.league;
      if (scope === SEASON_ALL) return 'Ewige Tabelle, Rekorde, Langzeitstatistik';
      const teams = teamsOfSeason(l.teams, scope).length;
      const summary = seasonSummaries(l.teams, l.allResults, l.allSchedules).find((x) => x.season === scope);
      if (!summary || !summary.matches) return `${teams} Teams · noch keine Partie`;
      if (summary.champion && !summary.running) return `${teams} Teams · Meister ${summary.champion.name}`;
      return `${teams} Teams · ${summary.matches} Partien gespielt`;
    },
    pickSeason(scope) {
      this.$store.season.set(scope);
      const el = document.getElementById('season-pick');
      if (el && el.matches(':popover-open')) el.hidePopover();
    },

    onSeasonChange() {
      const key = this.items.some((i) => i.key === this.current) ? this.current : 'tabelle';
      this.load(key, { animate: true, replace: true });
    },

    closeMobileNav() {
      const el = document.getElementById('mobile-nav');
      if (el && el.matches(':popover-open')) el.hidePopover();
    },

    async load(key, { animate = true, params = null, replace = false } = {}) {
      const item = this.routes.find((i) => i.key === key);
      if (!item) return;

      // Verlauf fortschreiben — außer die Navigation kam gerade AUS dem Verlauf.
      if (this._fromHistory) this._fromHistory = false;
      else if (replace) this._replaceHistory(key, params);
      else this._pushHistory(key, params);

      this.closeMobileNav();
      this.$store.league.ensureNotifyPermission?.();

      let html;
      try {
        const res = await fetch(item.file, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
      } catch (e) {
        html = `<div class="rounded-2xl border border-line bg-panel p-8 text-mist">Diese Ansicht konnte nicht geladen werden. Bitte die Seite neu laden.</div>`;
      }

      const swap = () => {
        const view = this.$refs.view;
        view.innerHTML = html;
        Alpine.initTree(view);
        this.current = key;
        // Scroll immer zurücksetzen; nur der Spieltag scrollt danach selbst zum
        // nächsten offenen Spiel. So bleibt die Tiefscroll-Logik auf den Spieltag begrenzt.
        window.scrollTo({ top: 0 });
      };

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (animate && document.startViewTransition && !reduce) {
        document.startViewTransition(async () => {
          swap();
          await this.$nextTick();
        });
      } else {
        swap();
      }
    },

    // === Info-Popover (geteilt) ============================================
    showInfo(detail) {
      if (!detail) return;
      this.info = { title: detail.title || 'Info', text: detail.text || '' };
      this.$nextTick(() => document.getElementById('stat-info')?.showPopover());
    },

    // === Globale Suche =====================================================
    openSearch() {
      this.searchQ = '';
      this.searchIndex = 0;
      const el = document.getElementById('search-pop');
      if (el && !el.matches(':popover-open')) el.showPopover();
      this.$nextTick(() => this.$refs.searchInput?.focus());
    },
    closeSearch() {
      const el = document.getElementById('search-pop');
      if (el && el.matches(':popover-open')) el.hidePopover();
    },
    get searchResults() {
      const q = this.searchQ.trim().toLowerCase();
      if (!q) return [];
      const league = this.$store.league;
      const out = [];
      // Teams
      (league.seasonTeams || []).forEach((t) => {
        if (t.name.toLowerCase().includes(q) || (t.player || '').toLowerCase().includes(q)) {
          out.push({ type: 'Team', label: t.name, sub: t.player, teamId: t.id, key: 'teams', logo: `./img/teams/${t.logo}` });
        }
      });
      // Pokémon
      (league.pokemon || []).forEach((p) => {
        if (p.name.toLowerCase().includes(q) || (p.name_en || '').toLowerCase().includes(q) || (p.types || []).some((ty) => ty.toLowerCase().includes(q))) {
          out.push({ type: 'Pokémon', label: p.name, sub: (p.types || []).join(' · '), pokemonName: p.name, key: 'pokemon', image: p.image });
        }
      });
      // Matches
      const teamById = (id) => (league.teams || []).find((t) => t.id === id);
      (league.schedule?.matchdays || []).forEach((md) => {
        (md.matches || []).forEach((m, i) => {
          const home = teamById(m.home);
          const away = teamById(m.away);
          const label = `${home?.name || ''} vs ${away?.name || ''}`;
          if (label.toLowerCase().includes(q) || `spieltag ${md.day}`.includes(q) || `st ${md.day}`.includes(q)) {
            out.push({ type: 'Match', label, sub: `Spieltag ${md.day}`, matchId: matchDocId(md.day, i, league.season), key: 'spieltag' });
          }
        });
      });
      return out.slice(0, 24);
    },
    searchMove(dir) {
      const n = this.searchResults.length;
      if (!n) return;
      this.searchIndex = (this.searchIndex + dir + n) % n;
    },
    selectSearch(res) {
      const r = res || this.searchResults[this.searchIndex];
      if (!r) return;
      this.closeSearch();
      this.$dispatch('navigate', {
        key: r.key,
        teamId: r.teamId || null,
        matchId: r.matchId || null,
        pokemonName: r.pokemonName || null,
      });
    },
  };
}

function draftBoard() {
  return {
    q: '',
    candidate: null,
    busy: false,
    // Vertragsverlängerung: das im Dialog gewählte Pokémon, bis bestätigt wird.
    renewPick: null,
    _prevKey: null,
    _prevCache: null,

    get league() {
      return this.$store.league;
    },
    get loaded() {
      return this.league.pokemonLoaded && this.league.draftLoaded && this.league.teamsLoaded;
    },
    get draft() {
      return this.league.draft;
    },
    get status() {
      return this.draft.status || 'idle';
    },
    get running() {
      return this.status === 'running';
    },
    get total() {
      const n = this.draft.order?.length || this.league.seasonTeams.length || 8;
      return n * PICKS_PER_TEAM;
    },

    teamById(id) {
      return this.league.teams.find((t) => t.id === id) || null;
    },

    // Aktueller Pick im Snake-System. Wer die Runde per Vertragsverlängerung eröffnet
    // hat, ist darin durch und fällt aus der Reihe.
    get currentPick() {
      if (!this.running) return null;
      return draftCurrentPick(this.draft, { picksPerTeam: PICKS_PER_TEAM });
    },
    get currentTeam() {
      const cp = this.currentPick;
      return cp ? this.teamById(cp.teamId) : null;
    },
    get currentRoster() {
      return this.currentTeam?.pokemon || [];
    },

    // 10 feste Slots, je 2 pro Tier (S→D), gefüllt mit dem Pick oder null
    get rosterSlots() {
      const roster = this.currentRoster;
      return TIER_ORDER.map((tier) => {
        const mons = roster.filter((p) => p.tier === tier);
        return { tier, slots: [mons[0] || null, mons[1] || null] };
      });
    },

    // Reihenfolge (Logos) für die Anzeige
    get orderTeams() {
      return (this.draft.order || []).map((id) => this.teamById(id)).filter(Boolean);
    },

    // === Vertragsverlängerungen =============================================
    // Intern „renewal"; im Frontend heißt es ausschließlich Vertragsverlängerung.
    get renewalTiers() { return RENEWAL_TIERS; },
    // Memoisiert wie das Pokémon-Profil: Die Kader der VORSAISON ändern sich während
    // dieses Drafts nicht mehr, werden aber in jeder Zeile der Übersicht gebraucht.
    get prevRosters() {
      const key = `${this.league.season}|${this.league.teams?.length || 0}|${this.league.pokemon?.length || 0}`;
      if (this._prevKey !== key) {
        this._prevKey = key;
        this._prevCache = this.league.prevRosters;
      }
      return this._prevCache || {};
    },
    prevRosterOf(teamId) { return this.prevRosters[teamId] || []; },
    // Alle fünf Verlängerungen eines Teams mit ihrem Stand.
    renewalsOf(teamId) {
      return renewalState(
        teamId,
        this.prevRosterOf(teamId),
        this.draft,
        this.draftedNames,
        this.teamById(teamId)?.pokemon || [],
      );
    },
    hasRenewals(teamId) { return this.prevRosterOf(teamId).length > 0; },
    // Alle Teams mit Vertragsverlängerungen, in Draft-Reihenfolge.
    get renewalTeams() {
      return (this.draft.order || []).filter((id) => this.hasRenewals(id));
    },
    get renewalBoard() {
      return this.renewalTeams
        .map((id) => ({ team: this.teamById(id), renewals: this.renewalsOf(id) }))
        .filter((r) => r.team);
    },
    // Gibt es überhaupt eine Vorsaison, aus der sich die Reihenfolge ableiten lässt?
    get hasPreviousSeason() {
      return this.league.previousTable().length > 0;
    },
    // Wer ist im offenen Fenster als Nächstes dran? null = kein Fenster offen.
    get renewalTurn() {
      if (!this.running) return null;
      return renewalTurn(this.draft, (id) => hasOpenRenewal(this.renewalsOf(id)));
    },
    get renewalTeam() {
      const t = this.renewalTurn;
      return t ? this.teamById(t.teamId) : null;
    },
    get renewalOpen() { return !!this.renewalTurn; },
    get isMyRenewal() {
      return this.renewalOpen && this.$store.auth.ownsTeam(this.renewalTeam);
    },
    // Die einlösbaren Verlängerungen des Teams, das gerade dran ist.
    get renewalOptions() {
      const t = this.renewalTurn;
      if (!t) return [];
      return this.renewalsOf(t.teamId).filter((r) => r.status === 'open');
    },
    // Wer hat in dieser Runde schon per Verlängerung gezogen?
    renewedThisRound(teamId) {
      const d = this.draft;
      const n = d.order?.length || 1;
      const round = Math.floor((d.pickIndex || 0) / n);
      return renewedIn(d, round).has(teamId);
    },
    renewalLabel(status) {
      return status === 'used' ? 'eingelöst' : status === 'expired' ? 'verfallen' : 'offen';
    },
    // Alle eingelösten Verlängerungen, jüngste zuerst — für den Verlauf.
    get renewalLog() {
      return [...(this.draft.renewals || [])]
        .sort((a, b) => (b.round ?? 0) - (a.round ?? 0) || String(b.at || '').localeCompare(String(a.at || '')))
        .map((r) => ({
          ...r,
          team: this.teamById(r.teamId),
          mon: this.league.pokemon.find((p) => p.name === r.name) || { name: r.name },
        }));
    },

    // --- Reihenfolge festzurren --------------------------------------------
    get orderChoice() { return this.draft.orderChoice || null; },
    get needsOrderChoice() { return this.status === 'order' && !!this.orderChoice; },
    get isMyOrderChoice() {
      return this.needsOrderChoice && this.$store.auth.player === this.orderChoice.player;
    },
    get orderChoiceTeams() {
      return (this.orderChoice?.options || []).map((id) => this.teamById(id)).filter(Boolean);
    },
    async chooseFirstPromoted(teamId) {
      if (!this.isMyOrderChoice || this.busy) return;
      this.busy = true;
      try {
        await this.league.chooseFirstPromoted(teamId);
      } catch (e) {
        console.error('Reihenfolge konnte nicht gesetzt werden:', e);
      }
      this.busy = false;
    },

    // Letzte Picks (neueste zuerst) — aus Snake-Reihenfolge + Team-Rostern rekonstruiert.
    // Picks landen pro Team in Pick-Reihenfolge im roster; die globale Reihenfolge ergibt
    // sich aus order[] + pickIndex, daher kein separater Pick-Log nötig.
    get allPicks() {
      return draftPicks(this.league.teams, this.draft, this.league.transfer, this.league.pokemon, PICKS_PER_TEAM);
    },
    get recentPicks() {
      return this.allPicks.slice(-9).reverse();
    },

    // --- Draft-Verlauf (vollständig, nach Runden gruppiert) ---
    get draftRounds() {
      const byRound = new Map();
      this.allPicks.forEach((p) => {
        if (!byRound.has(p.round)) byRound.set(p.round, []);
        byRound.get(p.round).push(p);
      });
      return [...byRound.entries()].map(([round, picks]) => ({ round, picks }));
    },
    // Mindestens ein Pick, dessen Draft-Position durch den Transfer unscharf ist.
    get draftHistoryApprox() {
      return this.allPicks.some((p) => p.approx);
    },

    // Vergriffen ist ein Pokémon nur innerhalb DIESER Saison. Über alle Teams zu
    // zählen wäre ab Saison 2 fatal: Die Kader der Vorsaison würden den halben Pool
    // sperren — und jede Vertragsverlängerung sofort verfallen lassen.
    get draftedNames() {
      const set = new Set();
      this.league.seasonTeams.forEach((t) => (t.pokemon || []).forEach((p) => set.add(p.name)));
      return set;
    },

    get currentTierCounts() {
      const counts = {};
      (this.currentRoster || []).forEach((p) => {
        counts[p.tier] = (counts[p.tier] || 0) + 1;
      });
      return counts;
    },

    // Der Pool hängt nur von Suche + Pokémon-Liste ab; die Items bleiben die
    // stabilen Original-Objekte (stabile x-for-Keys). Die Pickability wird NICHT hier
    // in die Items annotiert, sondern pro Karte über isPickable()/isTaken() im :class
    // berechnet. Sonst aktualisiert x-for die wiederverwendeten Karten bei einem reinen
    // draft-Wechsel (Team-Wechsel ohne teams-Änderung) nicht.
    get groups() {
      const term = this.q.trim().toLowerCase();
      const filtered = this.league.pokemon.filter(
        (p) =>
          !term ||
          p.name.toLowerCase().includes(term) ||
          (p.name_en || '').toLowerCase().includes(term) ||
          (p.types || []).some((t) => t.toLowerCase().includes(term)),
      );
      return TIER_ORDER.map((tier) => ({
        tier,
        mons: filtered.filter((p) => p.tier === tier),
      })).filter((g) => g.mons.length > 0);
    },

    isTaken(p) {
      return this.draftedNames.has(p.name);
    },

    // Am Zug ist immer ein bestimmtes Team — ziehen darf nur, wem es gehört.
    get isMyTurn() {
      return this.$store.auth.ownsTeam(this.currentTeam);
    },
    get waitingFor() {
      return this.currentTeam?.player || null;
    },

    isPickable(p) {
      // Solange das Fenster für Vertragsverlängerungen offen ist, wird nicht regulär gezogen.
      if (!this.running || this.renewalOpen || !this.currentTeam || !this.isMyTurn) return false;
      if (this.draftedNames.has(p.name)) return false;
      return (this.currentTierCounts[p.tier] || 0) < 2;
    },

    typeColor(type) {
      return TYPE_COLORS[type] || '#6b7280';
    },
    tierColor(tier) {
      return TIER_COLORS[tier] || '#6b7280';
    },
    playerColor(player) {
      return player === 'Henrik' ? '#4d90d5' : '#e3350d';
    },
    logoUrl(file) {
      return `./img/teams/${file}`;
    },
    goMon(name) {
      this.$dispatch('navigate', { key: 'pokemon', pokemonName: name });
    },

    // Sobald echte Ergebnisse erfasst sind, darf der Draft nicht mehr zurückgesetzt
    // werden — sonst verlieren die bereits gespeicherten Ergebnisse ihre Kader-Basis.
    get hasResults() {
      return (this.league.results || []).some((r) => (r.battles || []).some((b) => b && b.done));
    },

    async startDraft() {
      this.closeConfirm('draft-confirm');
      if (this.hasResults) return;
      await this.league.startDraft();
    },

    // --- Vertragsverlängerung einlösen -------------------------------------
    openRenewal() {
      if (!this.isMyRenewal) return;
      this.renewPick = null;
      this.$nextTick(() => document.getElementById('renewal-pick')?.showPopover());
    },
    closeRenewal() {
      const el = document.getElementById('renewal-pick');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.renewPick = null;
    },
    chooseRenewal(tier, mon) {
      this.renewPick = { tier, mon };
    },
    async confirmRenewal() {
      const t = this.renewalTurn;
      const pick = this.renewPick;
      if (!t || !pick || this.busy || !this.isMyRenewal) return;
      this.busy = true;
      try {
        const full = this.league.pokemon.find((p) => p.name === pick.mon.name) || {};
        await this.league.renewContract(t.teamId, pick.tier, {
          name: pick.mon.name,
          tier: full.tier || pick.tier,
          image: full.image || pick.mon.image || '',
          cost: full.cost ?? null,
          types: full.types || [],
          base_speed: full.base_speed ?? null,
        });
        this.closeRenewal();
      } catch (e) {
        console.error('Vertragsverlängerung fehlgeschlagen:', e);
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Die Vertragsverlängerung ist nicht durchgegangen.' } }));
      }
      this.busy = false;
    },
    async passRenewal() {
      const t = this.renewalTurn;
      if (!t || this.busy || !this.isMyRenewal) return;
      this.busy = true;
      try {
        await this.league.skipRenewal(t.teamId);
      } catch (e) {
        console.error('Verzicht konnte nicht gespeichert werden:', e);
      }
      this.busy = false;
    },

    choose(p) {
      if (!this.isPickable(p) || this.busy) return;
      this.candidate = p;
      this.$nextTick(() => document.getElementById('pick-confirm')?.showPopover());
    },

    async confirmPick() {
      if (!this.candidate || !this.currentTeam || this.busy || !this.isMyTurn) return;
      this.busy = true;
      const c = this.candidate;
      const clean = {
        name: c.name,
        name_en: c.name_en || null,
        dex: c.dex ?? null,
        types: c.types || [],
        tier: c.tier,
        cost: c.cost ?? null,
        image: c.image || null,
      };
      try {
        await this.league.pick(this.currentTeam.id, clean);
      } catch (e) {
        console.error('Pick fehlgeschlagen:', e);
      }
      this.closeConfirm('pick-confirm');
      this.candidate = null;
      this.busy = false;
    },

    closeConfirm(id) {
      const el = document.getElementById(id);
      if (el && el.matches(':popover-open')) el.hidePopover();
    },
    // Draftpool exportieren
    runExport(fmt) {
      exportDataset(buildDraftpoolExport(this.league.pokemon, this.league.seasonTeams), fmt);
      const el = document.getElementById('exp-draft');
      if (el && el.matches(':popover-open')) el.hidePopover();
    },
    // Komplette Draft-Reihenfolge exportieren
    get hasDraftHistory() {
      return this.allPicks.length > 0;
    },
    runOrderExport(fmt) {
      exportDataset(buildDraftOrderExport(this.allPicks, this.draft, this.league.teams), fmt);
      const el = document.getElementById('exp-draft');
      if (el && el.matches(':popover-open')) el.hidePopover();
    },
  };
}

function teamsView() {
  return {
    ...columnsMixin('jhdl-cols-teamrank-v1'),
    selectedId: null,

    // Speed-Tiers: gerätelokal persistierte Anzeige-Einstellungen je Pokémon.
    spdSort: 'desc',
    spdSettings: {},
    spdEdit: null, // Pokémon-Name im SP-/Wesen-Dialog
    // Schwächen/Resistenzen: ausgeschlossene Pokémon (gerätelokal).
    weakExcluded: {},
    allTypes: ALL_TYPES,
    // Farbwähler im Hero: der Entwurf, bis „Übernehmen" gedrückt ist.
    colorDraft: null,
    colorBusy: false,

    // Beim Laden: ggf. per Verlinkung übergebenes Team direkt öffnen.
    init() {
      this.initColumns();
      this.spdSettings = loadJson(SPEED_SETTINGS_KEY);
      this.weakExcluded = loadJson(WEAK_SETTINGS_KEY);
      this.$store.elo.ensureLoaded();
      this.$store.notes.ensureLoaded();
      const nav = this.$store.nav;
      const teamId = nav?.teamId || null;
      if (nav) nav.teamId = null;
      if (!teamId) return;
      if (this.loaded) this.open(teamId);
      else this.$watch('loaded', () => { if (this.loaded && this.selectedId == null) this.open(teamId); });
    },

    get league() {
      return this.$store.league;
    },
    get loaded() {
      return this.league.teamsLoaded;
    },
    get teams() {
      return this.league.seasonTeams;
    },
    teamById(id) {
      return this.league.teams.find((t) => t.id === id) || null;
    },
    // Aus dem Store auflösen, damit Roster-Updates auch im Detail live ankommen.
    get selectedTeam() {
      return this.selectedId ? this.league.teams.find((t) => t.id === this.selectedId) || null : null;
    },

    // --- Tabellen-Kontext des Teams ---
    get standings() {
      return computeStandings(this.teams, this.league.results);
    },
    get teamRow() {
      return this.standings.find((r) => r.team.id === this.selectedId) || null;
    },
    get teamPlace() {
      const i = this.standings.findIndex((r) => r.team.id === this.selectedId);
      return i < 0 ? null : i + 1;
    },
    get teamResults() {
      return (this.league.results || [])
        .filter((r) => r.home === this.selectedId || r.away === this.selectedId)
        .map((r) => this.matchSummary(r))
        .sort((a, b) => (a.day || 0) - (b.day || 0));
    },
    matchSummary(r) {
      const side = r.home === this.selectedId ? 'home' : 'away';
      const opp = this.teamById(side === 'home' ? r.away : r.home);
      let ownWins = 0;
      let oppWins = 0;
      let done = 0;
      const battles = (r.battles || []).map((b) => {
        if (!b || !b.done) return { done: false };
        done++;
        const s = battleStats(b);
        ownWins += side === 'home' ? s.homePoints : s.awayPoints;
        oppWins += side === 'home' ? s.awayPoints : s.homePoints;
        return {
          done: true,
          own: side === 'home' ? s.homeSurvivors : s.awaySurvivors,
          opp: side === 'home' ? s.awaySurvivors : s.homeSurvivors,
          outcome: s.winner === 'draw' ? 'draw' : s.winner === side ? 'win' : 'loss',
        };
      });
      const outcome = done === 0 ? 'open' : ownWins > oppWins ? 'win' : ownWins < oppWins ? 'loss' : 'draw';
      return { id: r.id, day: r.day, opponent: opp, ownWins, oppWins, done, outcome, battles };
    },
    get teamCurve() {
      const hist = placementHistory(this.teams, this.league.results);
      const single = { days: hist.days, series: { [this.selectedId]: hist.series[this.selectedId] || [] } };
      const team = this.selectedTeam;
      return buildChart(single, this.teams.length, () => ({
        logo: team ? this.logoUrl(team.logo) : null,
        color: team ? teamColor(team) : null,
      }));
    },
    get teamCurveSvg() {
      return chartSvgString(this.teamCurve);
    },

    // === Marktwerte ========================================================
    fmtMarket(v) { return formatMarket(v); },
    fmtMarketDelta(v) { return formatMarketDelta(v); },
    fmtPct(v) { return formatPercent(v); },

    teamValue(team) {
      return squadMarketValue(team?.pokemon || [], this.$store.elo.index());
    },
    get teamMarket() {
      return this.teamValue(this.selectedTeam);
    },
    // Platz im Vergleich aller Teams — die Zahl neben dem Gesamtwert im Kopf.
    get teamMarketRank() {
      const sorted = [...this.teams].sort((a, b) => this.teamValue(b) - this.teamValue(a));
      const i = sorted.findIndex((t) => t.id === this.selectedId);
      return i < 0 ? null : i + 1;
    },
    // Kader nach Marktwert, teuerstes zuerst.
    get rosterByValue() {
      const index = this.$store.elo.index();
      return (this.selectedTeam?.pokemon || [])
        .map((p) => {
          const row = index[p.name];
          return { ...p, value: row ? marketValue(row.elo) : null, elo: row?.elo ?? null };
        })
        .sort((a, b) => (b.value || 0) - (a.value || 0));
    },
    // --- Kaderstand zu einem Zeitpunkt -------------------------------------
    // Der Wintertransfer teilt die Saison: an den Spieltagen davor stand ein anderer
    // Kader auf dem Platz als danach. Das Transfer-Dokument kennt keinen Spieltag —
    // der Schnitt kommt aus der Verlaufsspalte „Transfer", ersatzweise aus dem
    // letzten Spieltag der Hinrunde.
    _rosterCut(team) {
      const season = seasonOfTeam(team);
      const days = (this.league.scheduleOf(season).matchdays || [])
        .filter((md) => md.leg === 'hin')
        .map((md) => md.day);
      return {
        transfer: this.league.transferOf(season),
        cutIndex: transferCutIndex(this.$store.elo.stops(), {
          season,
          afterDay: days.length ? Math.max(...days) : null,
        }),
      };
    },
    _squadPoints(team) {
      if (!team) return [];
      const { transfer, cutIndex } = this._rosterCut(team);
      return squadHistory(
        (stop, i) => rosterAtIndex(team, transfer, i, cutIndex),
        this.$store.elo.index(),
        this.$store.elo.stops(),
      );
    },

    // Entwicklung des Gesamtwerts über den bekannten Verlauf.
    get teamMarketSpan() {
      const pts = this._squadPoints(this.selectedTeam);
      if (pts.length < 2) return null;
      const first = pts[0];
      const last = pts[pts.length - 1];
      return {
        first, last,
        delta: last.value - first.value,
        pct: first.value > 0 ? ((last.value - first.value) / first.value) * 100 : 0,
      };
    },

    _teamSeries(highlightId) {
      return this.teams.map((t) => ({
        key: t.id,
        label: t.name,
        color: teamColor(t),
        highlight: highlightId === t.id,
        dimmed: !!highlightId && highlightId !== t.id,
        points: this._squadPoints(t),
      }));
    },
    _teamChartConfig(highlightId) {
      return {
        series: this._teamSeries(highlightId),
        stops: this.$store.elo.stops(),
        bands: [],
        scale: 'linear',
        legend: true,
        format: (v) => formatMarket(v, { unit: false }),
        ariaLabel: 'Gesamtmarktwert der Teams im Verlauf',
        emptyText: 'Noch keine Verlaufsdaten im Sheet.',
      };
    },
    // Vergleich aller Teams, das eigene hervorgehoben (Detailansicht).
    mountTeamValueChart(el) {
      bindMarketChart(this, el, 'teamvalue', () => this._teamChartConfig(this.selectedId));
    },
    // Derselbe Vergleich ohne Hervorhebung (Teams-Übersicht).
    mountLeagueValueChart(el) {
      bindMarketChart(this, el, 'leaguevalue', () => this._teamChartConfig(null));
    },
    // Jedes Pokémon des Kaders als eigene Linie, mit Tier-Grenzen im Hintergrund.
    // Gezeigt wird jedes Pokémon nur für die Zeitpunkte, an denen es dem Team gehörte:
    // Abgänge enden am Wintertransfer, Zugänge beginnen dort.
    mountRosterChart(el) {
      bindMarketChart(this, el, 'roster', () => {
        const store = this.$store.elo;
        const index = store.index();
        const bounds = tierBoundaries(store.rows);
        const team = this.selectedTeam;
        const { transfer, cutIndex } = this._rosterCut(team);
        const series = rosterSpans(team, transfer, store.stops(), cutIndex)
          .map((span, i) => {
            const row = index[span.name];
            if (!row) return null;
            const suffix = span.left ? ' (abgegeben)' : span.joined ? ' (Zugang)' : '';
            return monSeries(row, bounds, {
              color: seriesColor(i),
              label: `${span.name}${suffix}`,
              only: span.keys,
            });
          })
          .filter((s) => s && s.points.length);
        return {
          series,
          stops: store.stops(),
          bands: marketBands(store.rows),
          scale: 'log',
          legend: true,
          format: (v) => formatMarket(v, { unit: false }),
          ariaLabel: 'Marktwert-Verlauf des Kaders',
          emptyText: 'Noch keine Verlaufsdaten im Sheet.',
        };
      });
    },

    // --- Pokémon-Ranking des Teams (konfigurierbare Tabelle) ---
    get teamRanking() {
      const team = this.selectedTeam;
      if (!team) return [];
      const rows = this.enrichSpeed(pokemonStats([team], this.league.results, this.league.pokemon, { scopeTeamId: team.id, availability: this.league.availability }));
      return this.sortRows(withElo(rows, this.$store.elo.rows));
    },
    enrichSpeed(list) {
      return list.map((s) => ({ ...s, base_speed: this.baseSpeedFor(s.pokemon) ?? 0 }));
    },
    vtName(p) {
      return pokemonVtName(p);
    },
    sortByCol(key) {
      withReorderTransition(() => this.setSort(key), () => this.$nextTick());
    },
    statInfo(key) {
      const s = STAT_BY_KEY[key];
      if (s) openStatInfo(null, s.label, s.info);
    },
    fmtDiff(d) {
      return d > 0 ? `+${d}` : `${d}`;
    },
    // Teams exportieren (Übersicht)
    runExport(fmt) {
      exportDataset(buildTeamsExport(this.league.seasonTeams, this.league.pokemon), fmt);
      const el = document.getElementById('exp-teams');
      if (el && el.matches(':popover-open')) el.hidePopover();
    },

    open(id) {
      this.withTransition(() => {
        this.selectedId = id;
        window.scrollTo({ top: 0 });
      });
    },
    close() {
      this.withTransition(() => {
        this.selectedId = null;
      });
    },
    withTransition(fn) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (document.startViewTransition && !reduce) {
        document.startViewTransition(async () => {
          fn();
          await this.$nextTick();
        });
      } else {
        fn();
      }
    },

    rosterByTier(team) {
      const rank = { S: 0, A: 1, B: 2, C: 3, D: 4 };
      return [...(team?.pokemon || [])].sort((a, b) => (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9));
    },

    // === Speed-Tiers ========================================================
    // Gedraftete Pokémon werden ohne base_speed gespeichert -> aus der Stammliste
    // (pokemon.json im Store) per Name auflösen.
    get speedReady() {
      return this.league.pokemonLoaded;
    },
    baseSpeedFor(mon) {
      const m = this.league.pokemon.find((p) => p.name === mon.name);
      const v = m?.base_speed ?? mon.base_speed;
      return Number.isFinite(v) ? v : null;
    },
    spdGet(name) {
      const s = this.spdSettings[name] || {};
      return {
        show: s.show !== false,
        x15: !!s.x15, x2: !!s.x2, x05: !!s.x05, x067: !!s.x067,
        ...normalizeSpd(s),
      };
    },
    // Zusatz-Modifikatoren (×0,5 / ×0,67) — nur im Konfigurations-Dialog.
    extraMods() { return SPEED_MOD_DEFS.filter((m) => m.key === 'x05' || m.key === 'x067'); },
    natIcon(spec) { return natIcon(spec); },
    spdToggle(name, key) {
      const cur = this.spdGet(name);
      cur[key] = !cur[key];
      this.spdSave(name, cur);
    },
    spdSave(name, cfg) {
      this.spdSettings = { ...this.spdSettings, [name]: cfg };
      saveJson(SPEED_SETTINGS_KEY, this.spdSettings);
    },
    // Eigener SP-Wert (0–32) statt der Standardannahme 0 & 32.
    spdSetSp(name, value) {
      this.spdSave(name, { ...this.spdGet(name), sp: clampSp(value) });
    },
    spdResetSp(name) {
      this.spdSave(name, { ...this.spdGet(name), sp: null });
    },
    spdSetNat(name, nat) {
      this.spdSave(name, { ...this.spdGet(name), nat: NAT_MODES.includes(nat) ? nat : 'both' });
    },
    spdBadge(name) {
      return spdBadge(this.spdGet(name));
    },
    natLabel(nat) {
      return NAT_LABELS[nat] || NAT_LABELS.both;
    },
    // Konfigurations-Dialog (ein geteiltes Popover, Pokémon über spdEdit gewählt).
    openSpdConfig(name) {
      this.spdEdit = name;
      this.$nextTick(() => document.getElementById('spd-config')?.showPopover());
    },
    closeSpdConfig() {
      const el = document.getElementById('spd-config');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.spdEdit = null;
    },
    get spdEditMon() {
      if (!this.spdEdit) return null;
      return (this.selectedTeam?.pokemon || []).find((p) => p.name === this.spdEdit) || null;
    },
    // Vorschau der Zeilen, die für das gewählte Pokémon entstehen.
    get spdEditPreview() {
      const mon = this.spdEditMon;
      const base = mon ? this.baseSpeedFor(mon) : null;
      if (base == null) return [];
      return speedCases(base, this.spdGet(mon.name)).map((c) => ({ ...c, color: invTone(c.sp, c.nature) }));
    },
    toggleSpdSort() {
      this.spdSort = this.spdSort === 'desc' ? 'asc' : 'desc';
    },
    // Anzeige-Pokémon der Steuerung (Kader nach Tier sortiert).
    get speedMons() {
      return this.rosterByTier(this.selectedTeam);
    },
    // Eine Zeile je (Pokémon × Investment-Fall × aktivem Modifikator).
    get speedRows() {
      const team = this.selectedTeam;
      if (!team || !this.speedReady) return [];
      const rows = [];
      for (const mon of (team.pokemon || [])) {
        const cfg = this.spdGet(mon.name);
        if (!cfg.show) continue;
        const base = this.baseSpeedFor(mon);
        if (base == null) continue;
        const mods = speedMods(cfg);
        for (const inv of speedCases(base, cfg)) {
          for (const mod of mods) {
            rows.push({
              id: `${mon.name}|${inv.key}|${mod.key}`,
              mon,
              inv: inv.label,
              invKey: inv.key,
              invColor: invTone(inv.sp, inv.nature),
              mod: mod.label,
              modKey: mod.key,
              speed: applySpeedMod(inv.speed, mod.mult),
            });
          }
        }
      }
      const dir = this.spdSort === 'asc' ? 1 : -1;
      rows.sort((a, b) => dir * (a.speed - b.speed) || a.mon.name.localeCompare(b.mon.name));
      return rows;
    },
    modColor(key) { return modTone(key); },

    // === Schwächen & Resistenzen ===========================================
    weakIncluded(name) {
      return !this.weakExcluded[name];
    },
    toggleWeak(name) {
      const next = { ...this.weakExcluded };
      if (next[name]) delete next[name];
      else next[name] = true;
      this.weakExcluded = next;
      saveJson(WEAK_SETTINGS_KEY, this.weakExcluded);
    },
    get weakMons() {
      return (this.selectedTeam?.pokemon || []).filter((m) => this.weakIncluded(m.name));
    },
    // Je Angriffstyp: Multiplikator je einbezogenem Pokémon + Zählung schwach/resistent/immun.
    get weakByType() {
      const mons = this.weakMons;
      return ALL_TYPES.map((type) => {
        let weak = 0, resist = 0, immune = 0;
        const cells = mons.map((m) => {
          const mult = typeMultiplier(type, m.types || []);
          if (mult === 0) immune++;
          else if (mult > 1) weak++;
          else if (mult < 1) resist++;
          return { name: m.name, image: m.image, mult };
        });
        return { type, weak, resist, immune, net: weak - resist - immune, cells };
      });
    },
    // Für die Übersichtskarten: nach Netto-Bedrohung absteigend (größte Schwächen zuerst).
    get weakSummary() {
      return [...this.weakByType].sort((a, b) => b.net - a.net || a.type.localeCompare(b.type));
    },
    // Detail-Matrix: ein Eintrag je einbezogenem Pokémon mit Multiplikator je Typ.
    get weakMatrix() {
      return this.weakMons.map((m) => ({
        name: m.name,
        image: m.image,
        types: m.types || [],
        cells: ALL_TYPES.map((type) => ({ type, mult: typeMultiplier(type, m.types || []) })),
      }));
    },
    typeAbbr(type) {
      return TYPE_ABBR[type] || type.slice(0, 3).toUpperCase();
    },
    // Farbe + Label eines Effektivitäts-Multiplikators.
    multLabel(mult) {
      if (mult === 0) return '0';
      if (mult === 0.25) return '¼';
      if (mult === 0.5) return '½';
      if (mult === 1) return '·';
      return String(mult);
    },
    multStyle(mult) {
      if (mult >= 4) return 'background:rgba(227,53,13,0.85);color:#fff';
      if (mult > 1) return 'background:rgba(227,53,13,0.4);color:#ffd9cf';
      if (mult === 0) return 'background:rgba(152,162,179,0.16);color:#98a2b3';
      if (mult <= 0.25) return 'background:rgba(99,188,90,0.7);color:#06210a';
      if (mult < 1) return 'background:rgba(99,188,90,0.3);color:#bbe9b3';
      return 'color:#5b6573';
    },

    // --- Trainer ---
    // Eigene Position: kein Kampf, kein Draft, keine Statistik — nur hier sichtbar.
    genders: GENDERS,
    trainerForm: null,   // { id?, name, image, gender, traits, fromDay }
    trainerBusy: false,
    trainerConfirm: null, // Trainer, dessen Entlassung bestätigt werden soll

    // --- Private Notiz zum Team ---
    teamNoteText() {
      return this.selectedId ? this.$store.notes.teamNote(this.selectedId) : '';
    },
    setTeamNote(text) {
      if (this.selectedId) this.$store.notes.set('teams', this.selectedId, text);
    },

    // Trainerwechsel sind Sache des Teambesitzers — fremde Teams bleiben nur lesbar.
    get ownsSelected() {
      return this.$store.auth.ownsTeam(this.selectedTeam);
    },

    // === Teamfarbe ==========================================================
    // Die Farbe des Teams trägt den Hero und färbt die Team-Linien in jedem
    // Diagramm der Anwendung. Gewählt wird sie nur vom Besitzer.
    get colorPresets() { return TEAM_COLOR_PRESETS; },
    teamColorOf(team) { return teamColor(team); },
    get selectedColor() { return teamColor(this.selectedTeam); },
    get hasOwnColor() { return !!normalizeHexColor(this.selectedTeam?.color); },
    openColorPicker() {
      if (!this.ownsSelected) return;
      this.colorDraft = this.selectedColor;
      this.$nextTick(() => document.getElementById('team-color')?.showPopover());
    },
    closeColorPicker() {
      const el = document.getElementById('team-color');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.colorDraft = null;
    },
    pickColor(hex) {
      const clean = normalizeHexColor(hex);
      if (clean) this.colorDraft = clean;
    },
    async saveColor() {
      if (!this.ownsSelected || this.colorBusy) return;
      const hex = normalizeHexColor(this.colorDraft);
      if (!hex) return;
      this.colorBusy = true;
      try {
        await this.league.setTeamColor(this.selectedId, hex);
        this.closeColorPicker();
      } catch (e) {
        console.error('Teamfarbe konnte nicht gespeichert werden:', e);
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Die Farbe konnte nicht gespeichert werden.' } }));
      }
      this.colorBusy = false;
    },
    async clearColor() {
      if (!this.ownsSelected || this.colorBusy) return;
      this.colorBusy = true;
      try {
        await this.league.setTeamColor(this.selectedId, null);
        this.closeColorPicker();
      } catch (e) {
        console.error('Teamfarbe konnte nicht zurückgesetzt werden:', e);
      }
      this.colorBusy = false;
    },

    get trainers() {
      return Array.isArray(this.selectedTeam?.trainers) ? this.selectedTeam.trainers : [];
    },
    get currentTrainer() {
      return currentTrainer(this.trainers);
    },
    get trainerHistory() {
      return trainerHistory(this.trainers);
    },
    genderLabel(key) { return genderLabel(key); },
    // Jüngster gespielter Spieltag — Basis für Amtszeiten.
    get latestPlayedDay() {
      const days = (this.league.results || [])
        .filter((r) => (r.battles || []).some((b) => b && b.done))
        .map((r) => r.day)
        .filter((d) => d != null);
      return days.length ? Math.max(...days) : null;
    },
    openTrainerForm(trainer = null) {
      if (!this.ownsSelected) return;
      const suggested = nextFromDay(this.trainers, this.latestPlayedDay);
      this.trainerForm = trainer
        ? { id: trainer.id, name: trainer.name, image: trainer.image, gender: trainer.gender, traits: (trainer.traits || []).join(', '), fromDay: trainer.fromDay, untilDay: trainer.untilDay }
        : { id: null, name: '', image: '', gender: 'd', traits: '', fromDay: suggested, untilDay: null };
      this.$nextTick(() => document.getElementById('trainer-form')?.showPopover());
    },
    closeTrainerForm() {
      const el = document.getElementById('trainer-form');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.trainerForm = null;
    },
    setTrainerFromDay(value) {
      if (!this.trainerForm) return;
      const n = Number(value);
      this.trainerForm.fromDay = Number.isFinite(n) && String(value).trim() !== '' ? Math.max(0, Math.round(n)) || null : null;
    },
    get trainerFormValid() {
      return !!this.trainerForm?.name?.trim();
    },
    get trainerFormTraits() {
      return (this.trainerForm?.traits || '').split(',').map((t) => t.trim()).filter(Boolean);
    },
    async saveTrainer() {
      if (!this.trainerFormValid || this.trainerBusy || !this.selectedId || !this.ownsSelected) return;
      this.trainerBusy = true;
      try {
        const payload = { ...this.trainerForm };
        if (payload.id) await this.league.updateTrainer(this.selectedId, payload);
        else await this.league.appointTrainer(this.selectedId, payload);
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: payload.id ? 'Trainer aktualisiert.' : `${payload.name} ernannt.` } }));
        this.closeTrainerForm();
      } catch (e) { console.error('Trainer speichern fehlgeschlagen:', e); }
      this.trainerBusy = false;
    },
    askDismiss(trainer) {
      if (!this.ownsSelected) return;
      this.trainerConfirm = trainer;
      this.$nextTick(() => document.getElementById('trainer-dismiss')?.showPopover());
    },
    closeDismiss() {
      const el = document.getElementById('trainer-dismiss');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.trainerConfirm = null;
    },
    get dismissDay() {
      const d = this.latestPlayedDay;
      return Number.isFinite(d) ? d : 0;
    },
    async confirmDismiss() {
      if (!this.trainerConfirm || this.trainerBusy || !this.selectedId || !this.ownsSelected) return;
      this.trainerBusy = true;
      try {
        await this.league.dismissTrainer(this.selectedId, this.trainerConfirm.id, this.dismissDay);
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `${this.trainerConfirm.name} entlassen.` } }));
        this.closeDismiss();
      } catch (e) { console.error('Entlassung fehlgeschlagen:', e); }
      this.trainerBusy = false;
    },

    // --- Draft-Verlauf dieses Teams ---
    get teamDraftPicks() {
      if (!this.selectedId) return [];
      return draftPicks(this.league.teams, this.league.draft, this.league.transfer, this.league.pokemon, PICKS_PER_TEAM)
        .filter((p) => p.teamId === this.selectedId);
    },
    get teamDraftApprox() {
      return this.teamDraftPicks.some((p) => p.approx);
    },

    logoUrl(file) {
      return `./img/teams/${file}`;
    },
    playerColor(player) {
      return player === 'Henrik' ? '#4d90d5' : '#e3350d';
    },
    typeColor(type) {
      return TYPE_COLORS[type] || '#6b7280';
    },
    tierColor(tier) {
      return TIER_COLORS[tier] || '#6b7280';
    },
    goMon(name) {
      this.$dispatch('navigate', { key: 'pokemon', pokemonName: name });
    },
  };
}

// === Saison-Abschluss ======================================================
// Die Ruhmeshalle lässt sich aus dem Spielplan UND aus der Tabelle starten, sobald
// das letzte Ergebnis der Saison steht — und beliebig oft wiederholen.
// Mixin: ausschließlich Methoden, keine Getter (Spread würde Getter einfrieren).
function seasonFinaleMixin() {
  return {
    _finale: null,

    // Billiger Test für die Anzeige des Knopfes — das Drehbuch selbst entsteht
    // erst beim Start, weil es die ganze Saison durchrechnet.
    seasonComplete() {
      const l = this.$store.league;
      if (!l.scheduleLoaded || !l.resultsLoaded) return false;
      const planned = (l.schedule?.matchdays || []).reduce((n, md) => n + (md.matches || []).length, 0);
      if (!planned) return false;
      const done = (l.results || []).filter((r) => (r.battles || []).filter((b) => b && b.done).length >= 3).length;
      return done >= planned;
    },

    seasonChampion() {
      const l = this.$store.league;
      return computeStandings(l.seasonTeams, l.results)[0]?.team || null;
    },

    openFinale() {
      const l = this.$store.league;
      if (!this.seasonComplete()) return;
      const pop = document.getElementById('season-finale');
      if (!pop) return;
      const script = buildFinaleScript({
        season: l.season,
        teams: l.teams,
        results: l.results,
        schedule: l.schedule,
        pokedex: l.pokemon,
        awardDocs: this.$store.awards?.docs || [],
      });
      this._finale?.stop?.();
      pop.showPopover();
      this._finale = runFinale(pop, script, {
        logoBase: './img/teams/',
        teamsCount: l.seasonTeams.length || 8,
        onClose: () => this.closeFinale(),
        onPickMon: (name) => { this.closeFinale(); this.$dispatch('navigate', { key: 'pokemon', pokemonName: name }); },
      });
    },

    closeFinale() {
      this._finale?.stop?.();
      this._finale = null;
      const pop = document.getElementById('season-finale');
      if (pop && pop.matches(':popover-open')) pop.hidePopover();
    },
  };
}

function scheduleView() {
  return {
    ...battleLogMixin(),
    ...seasonFinaleMixin(),
    busy: false,
    saving: false,
    saveError: null,
    releasing: false,
    editing: null, // { day, matchIndex, home, away, docId }
    step: 0, // 0 = Aufgebot, 1..3 = Kämpfe
    form: null,
    detail: null, // { day, matchIndex, home, away }
    video: null,  // { day, matchIndex, url, embed, home, away }
    _pendingMatch: null,
    _scrolledToOpen: false,

    // Beim Laden: ggf. per Verlinkung übergebene Match-Detailansicht öffnen, sonst
    // einmalig zum ersten offenen Spiel scrollen.
    init() {
      this.$watch('$store.battleLogs.logs', () => this.logRehydrate());
      const nav = this.$store.nav;
      this._pendingMatch = nav?.matchId || null;
      if (nav) nav.matchId = null;
      if (this._pendingMatch) {
        if (this.loaded) this._tryOpenPending();
        else this.$watch('loaded', () => this._tryOpenPending());
        return;
      }
      if (this.loaded) this._scrollToOpenMatch();
      else this.$watch('loaded', () => this._scrollToOpenMatch());
    },
    _tryOpenPending() {
      if (!this._pendingMatch || !this.loaded) return;
      const m = /d(\d+)-m(\d+)/.exec(this._pendingMatch);
      if (!m) { this._pendingMatch = null; return; }
      const md = this.matchdays.find((d) => d.day === +m[1]);
      const match = md?.matches?.[+m[2]];
      if (match) {
        this._pendingMatch = null;
        this.openDetail(+m[1], +m[2], match.home, match.away);
      }
    },
    // Einmalig nach dem Laden: erstes Match ohne Ergebnis in den Viewport holen.
    _scrollToOpenMatch() {
      if (this._scrolledToOpen || !this.loaded) return;
      let target = null;
      for (const md of this.matchdays) {
        const idx = (md.matches || []).findIndex((m, i) => !this.summaryFor(md.day, i));
        if (idx >= 0) { target = `${md.day}-${idx}`; break; }
      }
      // Auch ohne offenes Spiel nur einmal versuchen — alle Spiele fertig: nicht scrollen.
      this._scrolledToOpen = true;
      if (!target) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.$nextTick(() => {
        // Defensiv: nur scrollen, wenn der Spielplan noch im DOM hängt (current === 'spieltag').
        const root = this.$root;
        if (!root || !root.isConnected) return;
        const el = root.querySelector(`[data-match-key="${target}"]`) || document.querySelector(`[data-match-key="${target}"]`);
        if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      });
    },
    openMon(name) {
      this.closeDetail();
      this.$dispatch('navigate', { key: 'pokemon', pokemonName: name });
    },

    get league() {
      return this.$store.league;
    },
    get loaded() {
      return this.league.teamsLoaded && this.league.scheduleLoaded && this.league.resultsLoaded;
    },
    get matchdays() {
      return this.league.schedule.matchdays || [];
    },
    get hasSchedule() {
      return this.matchdays.length > 0;
    },
    // Sobald Ergebnisse erfasst sind, darf der Spielplan nicht neu ausgelost werden —
    // sonst hängen die gespeicherten Ergebnisse an falschen Paarungen/Spieltagen.
    get hasResults() {
      return (this.league.results || []).some((r) => (r.battles || []).some((b) => b && b.done));
    },
    legGroups() {
      const groups = { hin: [], rueck: [] };
      this.matchdays.forEach((d) => (groups[d.leg] || (groups[d.leg] = [])).push(d));
      return [
        { leg: 'hin', label: 'Hinrunde', days: groups.hin },
        { leg: 'rueck', label: 'Rückrunde', days: groups.rueck },
      ].filter((g) => g.days.length);
    },

    teamById(id) {
      return this.league.teams.find((t) => t.id === id) || null;
    },
    logoUrl(file) {
      return `./img/teams/${file}`;
    },
    playerColor(player) {
      return player === 'Henrik' ? '#4d90d5' : '#e3350d';
    },

    async generate() {
      this.closeConfirm('schedule-confirm');
      if (this.busy || this.hasResults) return;
      this.busy = true;
      try {
        await this.league.generateSchedule();
      } catch (e) {
        console.error('Spielplan-Auslosung fehlgeschlagen:', e);
      }
      this.busy = false;
    },

    closeConfirm(id) {
      const el = document.getElementById(id);
      if (el && el.matches(':popover-open')) el.hidePopover();
    },

    // --- Ergebnis: Anzeige auf den Karten ---
    resultDocId(day, matchIndex) {
      return matchDocId(day, matchIndex, this.league.season);
    },
    resultFor(day, matchIndex) {
      const id = this.resultDocId(day, matchIndex);
      return this.league.results.find((r) => r.id === id) || null;
    },
    // Match-Stand = gewonnene Kämpfe je Seite (nur fertige Kämpfe), sonst null
    summaryFor(day, matchIndex) {
      const r = this.resultFor(day, matchIndex);
      if (!r) return null;
      let home = 0;
      let away = 0;
      let any = false;
      (r.battles || []).forEach((b) => {
        if (b && b.done) {
          any = true;
          const s = battleStats(b);
          home += s.homePoints;
          away += s.awayPoints;
        }
      });
      return any ? { home, away } : null;
    },
    // Zweites Ergebnis derselben Partie: erzielte Kills je Seite über alle
    // ausgetragenen Kämpfe. Entkoppelt vom Kampf-Ergebnis (siehe battleStats).
    killSummaryFor(day, matchIndex) {
      const r = this.resultFor(day, matchIndex);
      if (!r) return null;
      let home = 0;
      let away = 0;
      let any = false;
      (r.battles || []).forEach((b) => {
        if (!b || !b.done) return;
        any = true;
        const s = battleStats(b);
        home += s.homeKills;
        away += s.awayKills;
      });
      return any ? { home, away, winner: home > away ? 'home' : away > home ? 'away' : 'draw' } : null;
    },
    // Gesamtsieger eines Matches (gewonnene Kämpfe je Seite), für Karten-Akzent.
    matchOutcome(day, matchIndex) {
      const s = this.summaryFor(day, matchIndex);
      if (!s) return null;
      return { ...s, winner: s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw' };
    },

    // --- Match-Detailansicht (read-only) ---
    // Nach dem Wintertransfer stehen in alten Ergebnissen Pokémon, die dem Team
    // nicht mehr gehören — dann aus den Stammdaten (pokemon.json) auflösen.
    monImageFor(teamId, name) {
      const t = this.teamById(teamId);
      const own = (t?.pokemon || []).find((p) => p.name === name)?.image;
      return own || this.league.pokemon.find((p) => p.name === name)?.image || '';
    },
    openDetail(day, matchIndex, home, away) {
      // Nur öffnen, wenn ein Ergebnis existiert; sonst direkt in die Eingabe.
      if (!this.resultFor(day, matchIndex)) return this.openEntry(day, matchIndex, home, away);
      this.detail = { day, matchIndex, home, away };
      this.logSelect(this.resultDocId(day, matchIndex), { day, home, away });
      this.$store.notes.ensureLoaded();
      this.$nextTick(() => document.getElementById('match-detail')?.showPopover());
    },
    closeDetail() {
      const el = document.getElementById('match-detail');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.detail = null;
    },
    editFromDetail() {
      const d = this.detail;
      if (!d) return;
      this.closeDetail();
      this.openEntry(d.day, d.matchIndex, d.home, d.away);
    },
    // Strukturierte, anzeigefertige Daten des aktuell gewählten Matches.
    get matchDetail() {
      const dt = this.detail;
      if (!dt) return null;
      const r = this.resultFor(dt.day, dt.matchIndex);
      const home = this.teamById(dt.home);
      const away = this.teamById(dt.away);

      const battles = (r?.battles || []).map((b, i) => {
        if (!b || !b.done) return { no: i + 1, done: false };
        const s = battleStats(b);
        const sideMons = (side) => {
          const teamId = side === 'home' ? dt.home : dt.away;
          return (b.used?.[side] || []).map((name) => {
            const kill = (b.kills || []).find((k) => k.victimSide === side && k.victim === name);
            let status = 'survived', by = null, byNone = false, self = false;
            if (kill) {
              status = 'defeated';
              if (kill.killerSide == null) byNone = true;
              else { self = kill.killerSide === side; by = kill.killer; }
            }
            const frags = (b.kills || [])
              .filter((k) => k.killerSide === side && k.killer === name && k.killerSide !== k.victimSide)
              .map((k) => k.victim);
            return { name, image: this.monImageFor(teamId, name), status, by, byNone, self, frags };
          });
        };
        return {
          no: i + 1,
          done: true,
          winner: s.winner,
          home: { mons: sideMons('home'), survivors: b.score?.home ?? 0, kills: s.homeKills },
          away: { mons: sideMons('away'), survivors: b.score?.away ?? 0, kills: s.awayKills },
        };
      });

      let homeWins = 0, awayWins = 0, homeKills = 0, awayKills = 0, played = 0;
      battles.forEach((b) => {
        if (!b.done) return;
        played++;
        if (b.winner === 'home') homeWins++;
        else if (b.winner === 'away') awayWins++;
        homeKills += b.home.kills;
        awayKills += b.away.kills;
      });
      const squads = {
        home: (r?.squads?.home || []).map((name) => ({ name, image: this.monImageFor(dt.home, name) })),
        away: (r?.squads?.away || []).map((name) => ({ name, image: this.monImageFor(dt.away, name) })),
      };
      return {
        day: dt.day, home, away, battles, squads, played,
        homeWins, awayWins, homeKills, awayKills,
        winner: homeWins > awayWins ? 'home' : awayWins > homeWins ? 'away' : 'draw',
        complete: isMatchComplete(r),
        videoUrl: r?.videoUrl || null,
        pressReady: !!r?.pressReady,
      };
    },

    // --- Eingabe-Stepper ---
    roster(side) {
      const t = this.teamById(this.editing?.[side]);
      const rank = { S: 0, A: 1, B: 2, C: 3, D: 4 };
      return [...(t?.pokemon || [])].sort((a, b) => (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9));
    },
    monImage(side, name) {
      const own = this.roster(side).find((p) => p.name === name)?.image;
      return own || this.league.pokemon.find((p) => p.name === name)?.image || '';
    },

    // Sieger, Ergebnis (Überlebende je Seite) und Kill-Log sind entkoppelt.
    blankBattle() {
      return { used: { home: [], away: [] }, winner: null, score: { home: null, away: null }, fate: {} };
    },
    // Matchup-Reiter nur bei neuer Eingabe (noch kein gespeichertes Ergebnis).
    get isNewEntry() {
      return !!this.editing && !this.resultFor(this.editing.day, this.editing.matchIndex);
    },
    // Volle 10er-Kader beider Seiten (für den Matchup-Screenshot).
    fullRoster(side) {
      return this.roster(side);
    },
    openEntry(day, matchIndex, home, away) {
      // Ohne geladene Ergebnisse wüsste das Formular nicht, was schon eingetragen
      // ist — und würde es beim Speichern überschreiben.
      if (!this.league.resultsLoaded) {
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Ergebnisse werden noch geladen — einen Moment.' } }));
        return;
      }
      const existing = this.resultFor(day, matchIndex);
      this.editing = { day, matchIndex, home, away, docId: this.resultDocId(day, matchIndex) };
      this.logSelect(this.resultDocId(day, matchIndex), { day, home, away });
      this.$store.notes.ensureLoaded();
      this.step = 0;
      this.form = existing ? this.hydrate(existing) : {
        squads: { home: [], away: [] },
        battles: [this.blankBattle(), this.blankBattle(), this.blankBattle()],
        videoUrl: '',
      };
      this.$nextTick(() => document.getElementById('result-entry')?.showPopover());
    },
    hydrate(r) {
      const battles = [0, 1, 2].map((i) => {
        const b = (r.battles || [])[i];
        if (!b) return this.blankBattle();
        const used = { home: [...(b.used?.home || [])], away: [...(b.used?.away || [])] };
        const fate = {};
        used.home.forEach((n) => (fate[`home:${n}`] = 'survived'));
        used.away.forEach((n) => (fate[`away:${n}`] = 'survived'));
        (b.kills || []).forEach((k) => {
          const key = `${k.victimSide}:${k.victim}`;
          if (k.killerSide == null) fate[key] = 'none';
          else if (k.killerSide === k.victimSide) fate[key] = `self:${k.killer}`;
          else fate[key] = `opp:${k.killer}`;
        });
        let winner = b.winner;
        const sh = b.score?.home ?? 0;
        const sa = b.score?.away ?? 0;
        if (winner !== 'home' && winner !== 'away' && winner !== 'draw') {
          winner = sh > sa ? 'home' : sa > sh ? 'away' : 'draw';
        }
        return { used, winner, score: { home: b.score?.home ?? null, away: b.score?.away ?? null }, fate };
      });
        return {
        squads: { home: [...(r.squads?.home || [])], away: [...(r.squads?.away || [])] },
        battles,
        videoUrl: r.videoUrl || '',
      };
    },
    closeEntry() {
      const el = document.getElementById('result-entry');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.editing = null;
      this.form = null;
      this.step = 0;
      this.saveError = null;
    },

    // Aufgebot (6 von 10)
    inSquad(side, name) {
      return this.form.squads[side].includes(name);
    },
    toggleSquad(side, name) {
      const arr = this.form.squads[side];
      const i = arr.indexOf(name);
      if (i >= 0) {
        arr.splice(i, 1);
        // aus allen Kampf-Aufgeboten entfernen
        this.form.battles.forEach((b) => {
          const u = b.used[side];
          const j = u.indexOf(name);
          if (j >= 0) u.splice(j, 1);
          delete b.fate[`${side}:${name}`];
        });
      } else if (arr.length < 6) {
        arr.push(name);
      }
    },
    squadCount(side) {
      return this.form.squads[side].length;
    },
    get squadValid() {
      return this.squadCount('home') === 6 && this.squadCount('away') === 6;
    },

    // Kampf-Einsatz (4 von 6)
    currentBattle() {
      return this.step >= 1 ? this.form.battles[this.step - 1] : null;
    },
    inUsed(side, name) {
      return this.currentBattle().used[side].includes(name);
    },
    toggleUsed(side, name) {
      const b = this.currentBattle();
      const arr = b.used[side];
      const i = arr.indexOf(name);
      if (i >= 0) {
        arr.splice(i, 1);
        delete b.fate[`${side}:${name}`];
      } else if (arr.length < 4) {
        arr.push(name);
      }
    },
    usedCount(side) {
      return this.currentBattle().used[side].length;
    },

    // Sieger (frei wählbar, unabhängig vom Ergebnis)
    setWinner(side) {
      this.currentBattle().winner = side;
    },
    // Ergebnis: Überlebende je Seite (0–4), frei eintragbar
    setScore(side, n) {
      this.currentBattle().score[side] = n;
    },

    // Kill-Log
    fielded(side) {
      const b = this.currentBattle();
      return b.used[side].map((name) => ({ side, name, image: this.monImage(side, name) }));
    },
    killerOptions(side) {
      const b = this.currentBattle();
      const opp = side === 'home' ? 'away' : 'home';
      return { opponents: [...b.used[opp]], own: [...b.used[side]] };
    },
    fateOf(mon) {
      return this.currentBattle().fate[`${mon.side}:${mon.name}`] || '';
    },
    setFate(mon, value) {
      this.currentBattle().fate[`${mon.side}:${mon.name}`] = value;
    },

    // Validierung
    battleValid(b) {
      if (!b) return false;
      if (b.used.home.length !== 4 || b.used.away.length !== 4) return false;
      if (!['home', 'away', 'draw'].includes(b.winner)) return false;
      const sh = b.score?.home;
      const sa = b.score?.away;
      if (!(sh >= 0 && sh <= 4) || !(sa >= 0 && sa <= 4)) return false;
      const keys = [
        ...b.used.home.map((n) => `home:${n}`),
        ...b.used.away.map((n) => `away:${n}`),
      ];
      return keys.every((k) => b.fate[k]);
    },
    get currentBattleValid() {
      return this.battleValid(this.currentBattle());
    },

    serialize() {
      const battles = this.form.battles.map((b) => {
        const score = { home: b.score?.home ?? 0, away: b.score?.away ?? 0 };
        const kills = [];
        ['home', 'away'].forEach((side) => {
          b.used[side].forEach((name) => {
            const v = b.fate[`${side}:${name}`];
            if (!v || v === 'survived') return;
            if (v === 'none') kills.push({ victimSide: side, victim: name, killerSide: null, killer: null });
            else if (v.startsWith('self:')) kills.push({ victimSide: side, victim: name, killerSide: side, killer: v.slice(5) });
            else if (v.startsWith('opp:')) kills.push({ victimSide: side, victim: name, killerSide: side === 'home' ? 'away' : 'home', killer: v.slice(4) });
          });
        });
        return {
          done: this.battleValid(b),
          used: { home: [...b.used.home], away: [...b.used.away] },
          score,
          winner: b.winner || null,
          kills,
        };
      });
      return {
        season: this.league.season,
        day: this.editing.day,
        matchIndex: this.editing.matchIndex,
        home: this.editing.home,
        away: this.editing.away,
        squads: { home: [...this.form.squads.home], away: [...this.form.squads.away] },
        battles,
        videoUrl: normalizeVideoUrl(this.form.videoUrl) || null,
      };
    },
    // --- Kampfverlauf & Notizen ---
    matchNoteId() {
      const m = this.editing || this.detail;
      return m ? this.resultDocId(m.day, m.matchIndex) : null;
    },
    matchNote() {
      const id = this.matchNoteId();
      return id ? this.$store.notes.matchNote(id) : '';
    },
    setMatchNote(text) {
      const id = this.matchNoteId();
      if (id) this.$store.notes.set('matches', id, text);
    },

    // Erst der Kampfverlauf, dann das Ergebnis: Der Verlauf ist der Teil, der sich
    // nicht rekonstruieren lässt. Scheitert etwas, bleibt die Eingabe offen und der
    // Fehler steht auf dem Bildschirm — nicht nur in der Konsole.
    async save() {
      if (this.saving) return;
      this.saving = true;
      const docId = this.editing.docId;
      let logOk = true;
      try {
        if (this.logDirty()) logOk = await this.logSave(docId);
        await this.league.saveResult(docId, this.serialize());
        if (logOk) {
          const wasReady = this.entryPressReady;
          const complete = this.form.battles.every((b) => this.battleValid(b));
          this.closeEntry();
          // Der Freigabe-Knopf braucht das gespeicherte Ergebnis — nach dem Schließen
          // bleibt sonst unklar, dass die Presse noch wartet.
          if (complete && !wasReady) {
            window.dispatchEvent(new CustomEvent('toast', {
              detail: { msg: 'Gespeichert. Für die Presse ist das Spiel noch nicht freigegeben.' },
            }));
          }
        } else {
          window.dispatchEvent(new CustomEvent('toast', {
            detail: { msg: 'Ergebnis gespeichert — der Kampfverlauf noch nicht. Bitte erneut speichern.' },
          }));
        }
      } catch (e) {
        console.error('Ergebnis speichern fehlgeschlagen:', e);
        this.saveError = e?.message || 'Das Ergebnis konnte nicht gespeichert werden.';
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: this.saveError } }));
      }
      this.saving = false;
    },

    // --- Video zum Match ----------------------------------------------------
    // Ein Video deckt alle drei Kämpfe ab und hängt deshalb am Ergebnis.
    setVideoUrl(value) {
      this.form.videoUrl = value;
    },
    videoValid() {
      const v = String(this.form?.videoUrl || '').trim();
      return !v || !!normalizeVideoUrl(v);
    },
    videoInfo(url) {
      return videoEmbed(url);
    },
    videoHost(url) {
      return videoHostLabel(url);
    },
    videoFor(day, matchIndex) {
      return this.resultFor(day, matchIndex)?.videoUrl || null;
    },
    hasVideo(day, matchIndex) {
      return !!this.videoFor(day, matchIndex);
    },
    openVideo(day, matchIndex) {
      const url = this.videoFor(day, matchIndex);
      if (!url) return;
      const match = (this.matchdays.find((d) => d.day === day)?.matches || [])[matchIndex];
      this.video = {
        day,
        matchIndex,
        url,
        embed: videoEmbed(url),
        home: match?.home || null,
        away: match?.away || null,
      };
      this.$nextTick(() => document.getElementById('match-video')?.showPopover());
    },
    closeVideo() {
      const el = document.getElementById('match-video');
      if (el && el.matches(':popover-open')) el.hidePopover();
      // Das iframe muss aus dem DOM, sonst spielt der Ton weiter.
      this.video = null;
    },

    // --- Pressefreigabe -----------------------------------------------------
    // Die Presse beginnt erst, wenn Ergebnis UND Kampfverlauf final sind. Vorher
    // schriebe sie über einen Stand, der sich noch ändert.
    pressReadyFor(day, matchIndex) {
      return !!this.resultFor(day, matchIndex)?.pressReady;
    },
    get entryComplete() {
      const r = this.editing ? this.resultFor(this.editing.day, this.editing.matchIndex) : null;
      return isMatchComplete(r);
    },
    get entryPressReady() {
      return !!this.editing && this.pressReadyFor(this.editing.day, this.editing.matchIndex);
    },
    async togglePressRelease() {
      const e = this.editing || this.detail;
      if (!e || this.releasing) return;
      const docId = this.resultDocId(e.day, e.matchIndex);
      const next = !this.pressReadyFor(e.day, e.matchIndex);
      this.releasing = true;
      try {
        if (next && this.logDirty()) await this.logSave(docId);
        await this.league.setPressReady(docId, next, this.$store.auth.me);
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { msg: next ? 'Für die Presse freigegeben.' : 'Freigabe zurückgenommen.' },
        }));
      } catch (err) {
        console.error('Pressefreigabe fehlgeschlagen:', err);
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Die Freigabe konnte nicht gespeichert werden.' } }));
      }
      this.releasing = false;
    },

    // --- Export ---
    runExport(kind, fmt) {
      const l = this.league;
      const ds = kind === 'schedule'
        ? buildScheduleExport(l.teams, l.results, l.schedule)
        : buildBattleDetailsExport(l.teams, l.results, l.schedule);
      exportDataset(ds, fmt);
      const el = document.getElementById('exp-spieltag');
      if (el && el.matches(':popover-open')) el.hidePopover();
    },
  };
}

function standingsView() {
  return {
    ...seasonFinaleMixin(),
    // Ausgewählter Zwischenstand (Spieltag). null = aktueller Stand.
    day: null,

    init() {},

    // --- Saisonübergreifend -------------------------------------------------
    get isAll() {
      return this.$store.season.isAll;
    },
    get allTimeRows() {
      return allTimeTable(this.league.teams, this.league.allResults, { schedules: this.league.allSchedules });
    },
    get seasonCards() {
      return seasonSummaries(this.league.teams, this.league.allResults, this.league.allSchedules);
    },

    get league() {
      return this.$store.league;
    },
    get loaded() {
      return this.league.teamsLoaded && this.league.resultsLoaded;
    },

    // --- Zwischenstände je Spieltag ---
    get playedDays() {
      return [...new Set(
        (this.league.results || [])
          .filter((r) => (r.battles || []).some((b) => b && b.done))
          .map((r) => r.day)
          .filter((d) => d != null),
      )].sort((a, b) => a - b);
    },
    get latestDay() {
      const d = this.playedDays;
      return d.length ? d[d.length - 1] : null;
    },
    // Effektiv angezeigter Spieltag — ohne Auswahl der jüngste gespielte.
    get viewDay() {
      const days = this.playedDays;
      if (this.day == null) return this.latestDay;
      return days.includes(this.day) ? this.day : this.latestDay;
    },
    get isLatest() {
      return this.viewDay == null || this.viewDay === this.latestDay;
    },
    resultsUpTo(day) {
      if (day == null) return this.league.results;
      return (this.league.results || []).filter((r) => (r.day ?? 0) <= day);
    },
    canStep(dir) {
      const days = this.playedDays;
      const i = days.indexOf(this.viewDay);
      if (i < 0) return false;
      return dir < 0 ? i > 0 : i < days.length - 1;
    },
    stepDay(dir) {
      const days = this.playedDays;
      const i = days.indexOf(this.viewDay);
      if (i < 0) return;
      const next = days[i + (dir < 0 ? -1 : 1)];
      if (next != null) this.day = next;
    },
    toLatest() { this.day = null; },

    get rows() {
      return computeStandings(this.league.seasonTeams, this.resultsUpTo(this.viewDay));
    },
    // Tabelle des vorherigen gespielten Spieltags — Basis für die Platz-Veränderung.
    get prevRows() {
      const days = this.playedDays;
      const i = days.indexOf(this.viewDay);
      if (i <= 0) return null;
      return computeStandings(this.league.seasonTeams, this.resultsUpTo(days[i - 1]));
    },
    // Positiv = im Vergleich zum Vorspieltag verbessert.
    placeDelta(teamId) {
      const prev = this.prevRows;
      if (!prev) return null;
      const now = this.rows.findIndex((r) => r.team.id === teamId);
      const was = prev.findIndex((r) => r.team.id === teamId);
      if (now < 0 || was < 0) return null;
      return was - now;
    },

    // --- Liga-weites Platzierungs-Diagramm (alle Teams) ---
    get curve() {
      return buildChart(
        placementHistory(this.league.seasonTeams, this.league.results),
        this.league.seasonTeams.length,
        (teamId) => {
          const t = this.teamById(teamId);
          return { logo: t ? this.logoUrl(t.logo) : null, color: t ? teamColor(t) : null };
        },
      );
    },
    get curveSvg() {
      return chartSvgString(this.curve);
    },

    statInfo(key) {
      const s = STAT_BY_KEY[key];
      if (s) return openStatInfo(null, s.label, s.info);
      if (EXTRA_INFO[key]) openStatInfo(null, key, EXTRA_INFO[key]);
    },
    info(title, text) { openStatInfo(null, title, text); },
    // Export: Tabelle
    runExport(fmt) {
      const l = this.league;
      exportDataset(buildStandingsExport(l.seasonTeams, l.results), fmt);
      const el = document.getElementById('exp-tabelle');
      if (el && el.matches(':popover-open')) el.hidePopover();
    },

    teamById(id) {
      return this.league.teams.find((t) => t.id === id) || null;
    },
    logoUrl(file) {
      return `./img/teams/${file}`;
    },
    playerColor(player) {
      return player === 'Henrik' ? '#4d90d5' : '#e3350d';
    },
    fmtDiff(d) {
      return d > 0 ? `+${d}` : `${d}`;
    },
  };
}

// === Statistiken: Pokémon-Ranking (Stats) + Elo-/Tier-Prognose (Elo) ========
function statsView() {
  return {
    ...columnsMixin('jhdl-cols-leaguerank-v1'),
    tab: 'stats', // 'stats' | 'elo'
    // Ranking-Filter (Stats-Tab)
    fType: '',
    fTier: '',
    fTeam: '',
    allTypes: ALL_TYPES,
    tiers: TIER_ORDER,
    // Marktwert-Tabellen-Sortierung
    eloSortKey: 'rang',
    eloSortDir: 'asc',
    _show: null,

    init() {
      this.initColumns();
      const saved = loadJson('jhdl-stats-tab-v1');
      if (saved && (saved.tab === 'stats' || saved.tab === 'elo')) this.tab = saved.tab;
      const es = loadJson('jhdl-elo-sort-v1');
      if (es && es.key) { this.eloSortKey = es.key; this.eloSortDir = es.dir === 'desc' ? 'desc' : 'asc'; }
      this.$store.elo.ensureLoaded();
    },
    setTab(t) {
      this.tab = t;
      saveJson('jhdl-stats-tab-v1', { tab: t });
      if (t === 'elo') this.$store.elo.ensureLoaded();
    },

    get league() {
      return this.$store.league;
    },
    get loaded() {
      return this.league.teamsLoaded && this.league.resultsLoaded && this.league.pokemonLoaded;
    },

    get isAll() {
      return this.$store.season.isAll;
    },

    // --- Stats-Tab: filterbares Pokémon-Ranking ---
    // Saisonübergreifend zählt der Gesamtbestand; innerhalb einer Saison nur deren
    // Teams und Ergebnisse. Die Attribution bleibt in beiden Fällen result-getrieben.
    get baseRanking() {
      const l = this.league;
      const speed = l.pokemon;
      const raw = this.isAll
        ? allTimePokemon(l.teams, l.allResults, l.pokemon)
        : pokemonStats(l.seasonTeams, l.results, l.pokemon, { availability: l.availability });
      const rows = raw.map((s) => ({
        ...s,
        base_speed: (speed.find((p) => p.name === s.pokemon.name)?.base_speed) ?? 0,
      }));
      return withElo(rows, this.$store.elo.rows);
    },
    get filterTeams() {
      return this.isAll ? this.league.teams : this.league.seasonTeams;
    },
    get hasFilters() {
      return !!(this.fType || this.fTier || this.fTeam);
    },
    clearFilters() {
      this.fType = '';
      this.fTier = '';
      this.fTeam = '';
    },
    get ranking() {
      let list = this.baseRanking;
      if (this.fType) list = list.filter((s) => (s.pokemon.types || []).includes(this.fType));
      if (this.fTier) list = list.filter((s) => s.pokemon.tier === this.fTier);
      if (this.fTeam) list = list.filter((s) => s.team?.id === this.fTeam);
      return this.sortRows(list);
    },
    vtName(p) {
      return pokemonVtName(p);
    },
    sortByCol(key) {
      withReorderTransition(() => this.setSort(key), () => this.$nextTick());
    },
    // Team-Wappen (URL) für den Kachel-Hintergrund, sonst null.
    teamLogo(s) {
      return s.team ? this.logoUrl(s.team.logo) : null;
    },
    runExport(fmt) {
      const l = this.league;
      exportDataset(this.isAll
        ? buildRankingExport(l.teams, l.allResults, l.pokemon)
        : buildRankingExport(l.seasonTeams, l.results, l.pokemon), fmt);
      const el = document.getElementById('exp-stats');
      if (el && el.matches(':popover-open')) el.hidePopover();
    },

    // --- Marktwert-Tab ---
    get eloStore() { return this.$store.elo; },
    get eloLoading() { return this.$store.elo.loading; },
    get eloError() { return this.$store.elo.error; },
    get hasElo() { return (this.$store.elo.rows || []).length > 0; },
    get eloUpdatedText() { return fmtAgo(this.$store.elo.fetchedAt); },
    get marketTotal() { return formatMarket(this.$store.elo.totalValue()); },
    get hasLastUpdate() { return !!this.$store.elo.lastDiff; },
    get lastUpdateText() { return fmtAgo(this.$store.elo.lastDiff?.at); },
    fmtMarket(v) { return formatMarket(v); },
    fmtMarketDelta(v) { return formatMarketDelta(v); },
    fmtPct(v) { return formatPercent(v); },
    refreshElo() { this.$store.elo.refresh(); },

    // Zeilentönung bei Tier-Wechseln. Die sticky Spalte darf ihre Grundfarbe NICHT
    // verlieren, sonst scheinen beim seitlichen Scrollen die Zellen dahinter durch —
    // die Tönung läuft dort deshalb über background-image statt background.
    rowTint(delta) {
      if (delta > 0) return 'background:rgba(99,188,90,0.07)';
      if (delta < 0) return 'background:rgba(227,53,13,0.07)';
      return '';
    },
    stickyTint(delta) {
      const tint = delta > 0 ? 'rgba(99,188,90,0.07)' : delta < 0 ? 'rgba(227,53,13,0.07)' : null;
      return tint ? `background-image:linear-gradient(${tint},${tint})` : '';
    },

    // Marktwert-Update: erst neu laden, dann das Ergebnis inszenieren. Auch ohne
    // Veränderung läuft die Bühne — dann eben mit leerer Bilanz.
    async startMarketUpdate() {
      if (this.$store.elo.loading) return;
      await this.$store.elo.refresh();
      this.showMarketUpdate();
    },
    // Bild + Team an die Diff-Zeilen hängen; das Diff-Modul kennt nur Namen.
    _decorate(rows) {
      const monByName = {};
      (this.league.pokemon || []).forEach((p) => { monByName[p.name] = p; });
      return (rows || []).map((r) => ({ ...r, image: monByName[r.name]?.image || null }));
    },
    showMarketUpdate() {
      const diff = this.$store.elo.lastDiff;
      const pop = document.getElementById('market-show');
      if (!pop) return;
      this._show?.stop?.();
      pop.showPopover();
      this._show = runMarketShow(pop, {
        title: 'Marktwert-Update',
        subtitle: diff ? `Stand ${formatDateTime(diff.at)}` : 'Noch kein Vergleichsstand',
        note: diff
          ? `${diff.tierChanges.length} Tier-Wechsel · ${diff.changed} von ${diff.total} Pokémon bewegt.`
          : 'Beim nächsten Update wird hier der Vergleich zum jetzigen Stand gezeigt.',
        totalValue: this.$store.elo.totalValue(),
        changedCount: diff?.changed || 0,
        tierChanges: this._decorate(diff?.tierChanges),
        up: this._decorate(diff?.up),
        down: this._decorate(diff?.down),
      }, {
        tierColor: (t) => this.tierColor(t),
        onClose: () => pop.hidePopover(),
        onPickMon: (name) => { pop.hidePopover(); this.goMon(name); },
      });
    },
    closeMarketShow() {
      this._show?.stop?.();
      this._show = null;
    },

    // Tier-Delta: >0 = Aufstieg (Prognose-Tier besser), <0 = Abstieg, 0 = gleich/unbekannt.
    tierDelta(cur, proj) {
      if (!cur || !proj) return 0;
      const a = tierRank(cur), b = tierRank(proj);
      if (a === 99 || b === 99) return 0;
      return a - b;
    },
    // Sheet-Zeilen mit Stammdaten (Bild, aktuelles Tier) + aktuellem Team anreichern.
    eloEnriched() {
      const rows = this.$store.elo.rows || [];
      const monByName = {};
      (this.league.pokemon || []).forEach((p) => { monByName[p.name] = p; });
      const teamByMon = {};
      (this.league.seasonTeams || []).forEach((t) => (t.pokemon || []).forEach((p) => { teamByMon[p.name] = t; }));
      return rows.map((r) => {
        const mon = monByName[r.resolved] || null;
        const currentTier = mon?.tier || null;
        const team = teamByMon[r.resolved] || null;
        return {
          rang: r.rang, name: r.resolved, sheetName: r.name, elo: r.elo,
          market: marketValue(r.elo),
          image: mon?.image || null,
          currentTier, projectedTier: r.projectedTier, team,
          delta: this.tierDelta(currentTier, r.projectedTier),
        };
      });
    },
    sortEloRows(rows) {
      const key = this.eloSortKey, dir = this.eloSortDir === 'asc' ? 1 : -1;
      const val = (r) => {
        if (key === 'name') return r.name || '';
        if (key === 'team') return r.team?.name || '';
        if (key === 'currentTier') return tierRank(r.currentTier);
        if (key === 'projectedTier') return tierRank(r.projectedTier);
        if (key === 'elo' || key === 'market') return Number.isFinite(r.elo) ? r.elo : -1;
        return Number.isFinite(r.rang) ? r.rang : 9999;
      };
      return [...rows].sort((a, b) => {
        const va = val(a), vb = val(b);
        if (typeof va === 'string') return dir * va.localeCompare(vb) || (a.rang ?? 0) - (b.rang ?? 0);
        return dir * (va - vb) || (a.rang ?? 0) - (b.rang ?? 0);
      });
    },
    get eloRows() { return this.sortEloRows(this.eloEnriched()); },
    // Namen aus dem Sheet, zu denen es kein Pokémon in den Stammdaten gibt —
    // in aller Regel eine Umbenennung im Sheet, die in `ALIAS` nachgezogen werden muss.
    get eloUnresolved() {
      return unresolvedEloNames(this.$store.elo.rows || [], this.league.pokemon || []);
    },
    setEloSort(key) {
      if (this.eloSortKey === key) this.eloSortDir = this.eloSortDir === 'asc' ? 'desc' : 'asc';
      else { this.eloSortKey = key; this.eloSortDir = (key === 'elo' || key === 'market') ? 'desc' : 'asc'; }
      saveJson('jhdl-elo-sort-v1', { key: this.eloSortKey, dir: this.eloSortDir });
    },
    eloSortIndicator(key) {
      if (this.eloSortKey !== key) return '';
      return this.eloSortDir === 'desc' ? '↓' : '↑';
    },
    get tierChanges() {
      const changed = this.eloEnriched().filter((r) => r.delta !== 0);
      return {
        up: changed.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta || (b.elo ?? 0) - (a.elo ?? 0)),
        down: changed.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta || (b.elo ?? 0) - (a.elo ?? 0)),
      };
    },

    statInfo(key) {
      const s = STAT_BY_KEY[key];
      if (s) return openStatInfo(null, s.label, s.info);
      if (EXTRA_INFO[key]) openStatInfo(null, key, EXTRA_INFO[key]);
    },
    info(title, text) { openStatInfo(null, title, text); },
    teamById(id) {
      return this.league.teams.find((t) => t.id === id) || null;
    },
    logoUrl(file) {
      return `./img/teams/${file}`;
    },
    playerColor(player) {
      return player === 'Henrik' ? '#4d90d5' : '#e3350d';
    },
    typeColor(type) {
      return TYPE_COLORS[type] || '#6b7280';
    },
    tierColor(tier) {
      return TIER_COLORS[tier] || '#6b7280';
    },
    fmtDiff(d) {
      return d > 0 ? `+${d}` : `${d}`;
    },
    goMon(name) {
      this.$dispatch('navigate', { key: 'pokemon', pokemonName: name });
    },
  };
}

function pokemonView() {
  return {
    name: null,
    from: null,
    _profileCache: null,
    _profileKey: null,
    // Partner-/Gegner-Bilanzen: absolute Zahlen oder Prozent.
    recMode: 'abs', // 'abs' | 'pct'
    recMin: 1,      // Mindest-Anzahl gemeinsamer Kämpfe

    // Ziel-Pokémon + Herkunft aus dem nav-Store puffern (nicht löschen -> Reload/Watch).
    init() {
      const nav = this.$store.nav;
      this.name = nav?.pokemonName || null;
      this.from = nav?.from || null;
      const saved = loadJson('jhdl-mon-rec-v1');
      if (saved.mode === 'pct' || saved.mode === 'abs') this.recMode = saved.mode;
      if (Number.isFinite(saved.min)) this.recMin = Math.max(1, saved.min);
      this.$store.elo.ensureLoaded();
      // Falls die Daten beim ersten Render noch nicht da sind, neu auswerten sobald geladen.
      if (!this.loaded) {
        this.$watch('loaded', () => { /* Getter re-evaluieren automatisch */ });
      }
    },

    get league() {
      return this.$store.league;
    },
    get loaded() {
      return this.league.pokemonLoaded && this.league.teamsLoaded && this.league.resultsLoaded;
    },

    // Stammdaten aus pokemon.json (enthält types, base_speed, image, tier, cost, dex, name_en).
    get mon() {
      if (!this.name) return null;
      return this.league.pokemon.find((p) => p.name === this.name) || null;
    },

    // Statistik-Profil (scoring.mjs). Memoisiert über Name + Ergebnis-/Team-Stand.
    get profile() {
      if (!this.name || !this.loaded) return null;
      const key = `${this.name}|${this.league.results?.length || 0}|${this.league.teams?.length || 0}`;
      if (this._profileKey !== key) {
        this._profileKey = key;
        this._profileCache = pokemonProfile(this.name, this.league.seasonTeams, this.league.results, this.league.pokemon, { availability: this.league.availability });
      }
      return this._profileCache;
    },
    get team() {
      return this.profile?.team || null;
    },

    // Elo-/Tier-Prognose dieses Pokémon aus dem Sheet-Store (oder null).
    get elo() {
      const row = (this.$store.elo.rows || []).find((r) => r.resolved === this.name);
      if (!row) return null;
      const cur = this.mon?.tier || null;
      const proj = row.projectedTier || null;
      let delta = 0;
      if (cur && proj) {
        const a = tierRank(cur), b = tierRank(proj);
        if (a !== 99 && b !== 99) delta = a - b;
      }
      return {
        rang: row.rang, elo: row.elo, market: marketValue(row.elo),
        currentTier: cur, projectedTier: proj, delta,
      };
    },
    get eloLoading() { return this.$store.elo.loading; },
    fmtMarket(v) { return formatMarket(v); },
    fmtMarketDelta(v) { return formatMarketDelta(v); },
    // Marktwert-Veränderungen kommen bereits in Prozent (0–100), die Kennzahlen
    // dieser Ansicht dagegen als Anteil (0–1) — deshalb zwei getrennte Helfer.
    fmtMarketPct(v) { return formatPercent(v); },

    // === Marktwert-Verlauf =================================================
    get marketRow() {
      return this.$store.elo.index()[this.name] || null;
    },
    get hasMarketHistory() {
      return (this.marketRow?.history || []).length > 1;
    },
    // Bilanz über den gesamten bekannten Verlauf: Start, Höchststand, Veränderung.
    get marketSpan() {
      const pts = historyPoints(this.marketRow);
      if (pts.length < 2) return null;
      const first = pts[0];
      const last = pts[pts.length - 1];
      const peak = pts.reduce((a, b) => (b.value > a.value ? b : a));
      const low = pts.reduce((a, b) => (b.value < a.value ? b : a));
      return {
        first, last, peak, low,
        delta: last.value - first.value,
        pct: first.value > 0 ? ((last.value - first.value) / first.value) * 100 : 0,
      };
    },
    mountMarketChart(el) {
      bindMarketChart(this, el, 'mon', () => {
        const store = this.$store.elo;
        const row = store.index()[this.name];
        const bounds = tierBoundaries(store.rows);
        return {
          series: row ? [monSeries(row, bounds, { color: '#ff5a36', highlight: true })] : [],
          stops: historyStops(store.rows),
          bands: marketBands(store.rows),
          scale: 'log',
          format: (v) => formatMarket(v, { unit: false }),
          ariaLabel: `Marktwert-Verlauf von ${this.name}`,
          emptyText: 'Für dieses Pokémon liegt noch kein Verlauf im Sheet.',
        };
      });
    },

    // === Partner- und Gegner-Bilanzen ======================================
    // Auf Kampf-Ebene: mit wem wurde am häufigsten gewonnen/verloren und gegen
    // wen. Prozent-Modus bezieht sich auf die gemeinsamen Kämpfe des Paares.
    setRecMode(mode) {
      this.recMode = mode === 'pct' ? 'pct' : 'abs';
      saveJson('jhdl-mon-rec-v1', { mode: this.recMode, min: this.recMin });
    },
    setRecMin(v) {
      this.recMin = Math.max(1, Math.min(30, Math.round(Number(v) || 1)));
      saveJson('jhdl-mon-rec-v1', { mode: this.recMode, min: this.recMin });
    },
    // kind: 'partner' | 'opponent', outcome: 'w' | 'l'
    recList(kind, outcome) {
      const src = (kind === 'partner' ? this.profile?.partnerRecords : this.profile?.opponentRecords) || [];
      const pool = src.filter((r) => r.total >= this.recMin && r[outcome] > 0);
      const pct = this.recMode === 'pct';
      return [...pool]
        .sort((a, b) => {
          if (pct) {
            const pa = a[outcome] / a.total;
            const pb = b[outcome] / b.total;
            return pb - pa || b[outcome] - a[outcome] || a.name.localeCompare(b.name);
          }
          return b[outcome] - a[outcome] || b.total - a.total || a.name.localeCompare(b.name);
        })
        .slice(0, 5);
    },
    // Anzeigewert einer Bilanz-Zeile.
    recValue(row, outcome) {
      if (this.recMode === 'pct') return `${Math.round((row[outcome] / Math.max(1, row.total)) * 100)} %`;
      return `${row[outcome]}×`;
    },
    recSub(row, outcome) {
      const pct = Math.round((row[outcome] / Math.max(1, row.total)) * 100);
      return this.recMode === 'pct'
        ? `${row[outcome]} von ${row.total} Kämpfen`
        : `${pct} % von ${row.total} Kämpfen`;
    },
    get recBlocks() {
      return [
        { kind: 'partner', outcome: 'w', label: 'Erfolgreichste Partner', hint: 'Gemeinsam gewonnen', accent: '#63bc5a', empty: 'Noch kein gemeinsamer Sieg.' },
        { kind: 'partner', outcome: 'l', label: 'Unglücklichste Partner', hint: 'Gemeinsam verloren', accent: '#ff9d55', empty: 'Noch keine gemeinsame Niederlage.' },
        { kind: 'opponent', outcome: 'w', label: 'Liebste Gegner', hint: 'Gegen sie gewonnen', accent: '#4d90d5', empty: 'Noch kein Sieg gegen einen Gegner.' },
        { kind: 'opponent', outcome: 'l', label: 'Härteste Gegner', hint: 'Gegen sie verloren', accent: '#e3350d', empty: 'Noch keine Niederlage.' },
      ];
    },
    get hasRecords() {
      return !!(this.profile?.partnerRecords?.length || this.profile?.opponentRecords?.length);
    },

    // Fallback, wenn die Detailseite ohne Verlauf geöffnet wurde (z. B. direkt
    // nach dem Start): zurück zur Herkunftsansicht.
    back() {
      this.$dispatch('navigate', { key: this.from || 'teams' });
    },
    goMon(name) {
      this.$dispatch('navigate', { key: 'pokemon', pokemonName: name });
    },

    // === Initiative-Panel ====================================================
    // Eine Zeile je (Investment × Modifikator); base aus mon.base_speed.
    get speedRows() {
      const mon = this.mon;
      const base = mon?.base_speed;
      if (!Number.isFinite(base)) return [];
      const tiers = speedTiers(base);
      const invs = [
        { key: 's0d', label: '0−' },
        { key: 's0', label: '0' },
        { key: 's32', label: '32' },
        { key: 's32n', label: '32+' },
      ];
      const mods = [
        { key: 'x05', label: '×0,5', mult: 0.5 },
        { key: 'x1', label: '×1', mult: 1 },
        { key: 'x15', label: '×1,5', mult: 1.5 },
        { key: 'x2', label: '×2', mult: 2 },
      ];
      const rows = [];
      for (const inv of invs) {
        for (const mod of mods) {
          rows.push({
            id: `${inv.key}|${mod.key}`,
            inv: inv.label,
            invKey: inv.key,
            mod: mod.label,
            modKey: mod.key,
            speed: applySpeedMod(tiers[inv.key], mod.mult),
          });
        }
      }
      return rows;
    },
    invColor(key) {
      if (key === 's32n') return '#ffcb05';
      if (key === 's32') return '#ff5a36';
      if (key === 's0d' || key === 's32d') return '#ab6ac8';
      return '#98a2b3';
    },
    modColor(key) {
      return modTone(key);
    },

    // Rang nach base_speed über alle Pokémon mit base_speed.
    get speedRank() {
      const mon = this.mon;
      const base = mon?.base_speed;
      if (!Number.isFinite(base)) return null;
      const speeds = this.league.pokemon
        .map((p) => p.base_speed)
        .filter((v) => Number.isFinite(v));
      const total = speeds.length;
      if (!total) return null;
      const faster = speeds.filter((v) => v < base).length;
      const rank = speeds.filter((v) => v > base).length + 1;
      return { rank, total, faster };
    },

    // === Typ-Tabellen (scoring.mjs) =========================================
    get defChart() {
      return defensiveChart(this.mon?.types || []);
    },
    get offCoverage() {
      return offensiveChart(this.mon?.types || []);
    },

    // === Draft-Runde/Pick rekonstruieren ====================================
    // Snake über draft.order + Position im Team-Roster — analog draftBoard.recentPicks.
    get draftPick() {
      const team = this.team;
      const order = this.league.draft?.order || [];
      const n = order.length;
      if (!team || !n || !this.name) return null;
      const roster = team.pokemon || [];
      const rosterIdx = roster.findIndex((p) => p.name === this.name);
      if (rosterIdx < 0) return null;
      const teamPos = order.indexOf(team.id);
      if (teamPos < 0) return null;
      // rosterIdx = wievielter Pick des Teams (0-basiert) => Runde = rosterIdx.
      const round = rosterIdx;
      // Snake: in geraden Runden in order-Reihenfolge, in ungeraden umgekehrt.
      const pos = round % 2 === 0 ? teamPos : n - 1 - teamPos;
      const pickNo = round * n + pos + 1;
      return { round: round + 1, pickNo };
    },

    // === Awards ==============================================================
    // Alle Abstimmungen, in denen dieses Pokémon nominiert war — gewonnene zuerst.
    get awardHistory() {
      return this.name ? this.$store.awards.historyForPokemon(this.name) : [];
    },
    get awardsWonCount() {
      return this.awardHistory.filter((a) => a.won).length;
    },
    awardPendingLabel(a) {
      if (a.status === 'nominating') return 'Nominierung läuft';
      if (a.status === 'voting') return 'Abstimmung läuft';
      return 'Ergebnis verdeckt';
    },
    fmtAvg(v) { return (Math.round((Number(v) || 0) * 10) / 10).toFixed(1).replace('.', ','); },

    // === Helfer ==============================================================
    logoUrl(file) {
      return `./img/teams/${file}`;
    },
    // Bild eines Pokémon per Name aus den Stammdaten (für Historie/Partner-Listen).
    monImage(name) {
      return this.league.pokemon.find((p) => p.name === name)?.image || '';
    },
    playerColor(player) {
      return player === 'Henrik' ? '#4d90d5' : '#e3350d';
    },
    typeColor(type) {
      return TYPE_COLORS[type] || '#6b7280';
    },
    tierColor(tier) {
      return TIER_COLORS[tier] || '#6b7280';
    },
    multLabel(mult) {
      if (mult === 0) return '0';
      if (mult === 0.25) return '¼';
      if (mult === 0.5) return '½';
      if (mult === 1) return '·';
      return String(mult);
    },
    multStyle(mult) {
      if (mult >= 4) return 'background:rgba(227,53,13,0.85);color:#fff';
      if (mult > 1) return 'background:rgba(227,53,13,0.4);color:#ffd9cf';
      if (mult === 0) return 'background:rgba(152,162,179,0.16);color:#98a2b3';
      if (mult <= 0.25) return 'background:rgba(99,188,90,0.7);color:#06210a';
      if (mult < 1) return 'background:rgba(99,188,90,0.3);color:#bbe9b3';
      return 'color:#5b6573';
    },
    // Anteil als Prozent, z.B. 0.72 -> „72 %".
    fmtPct(x) {
      const v = Number.isFinite(x) ? x : 0;
      return `${Math.round(v * 100)} %`;
    },
    // Info-Popover zu einer Kennzahl öffnen (aus Katalog oder Zusatztexten).
    statInfo(key) {
      const s = STAT_BY_KEY[key];
      if (s) return openStatInfo(null, s.label, s.info);
      if (EXTRA_INFO[key]) openStatInfo(null, key, EXTRA_INFO[key]);
    },
    info(title, text) {
      openStatInfo(null, title, text);
    },
  };
}

// === Spieler-Duell (Janik ⚔ Henrik) ========================================
// === Rekorde: Bestmarken über alle Saisons ==================================
// Nur im saisonübergreifenden Bereich erreichbar. Alles wird gerechnet, nichts
// gepflegt — ein neuer Rekord entsteht mit dem Ergebnis, das ihn aufstellt.
function recordsView() {
  return {
    groups: [
      { key: 'pokemon', label: 'Pokémon', hint: 'Bestmarken einzelner Pokémon über alle Saisons.' },
      { key: 'team', label: 'Teams', hint: 'Was Teams in einzelnen Partien und ganzen Saisons geschafft haben.' },
      { key: 'markt', label: 'Marktwerte', hint: 'Die Extremwerte aus dem Draft-Sheet.' },
      { key: 'liga', label: 'Liga', hint: 'Bestmarken, die der ganzen Liga gehören.' },
    ],

    init() {
      this.$store.elo.ensureLoaded();
    },

    get league() { return this.$store.league; },
    get loaded() {
      const l = this.league;
      return l.teamsLoaded && l.resultsLoaded && l.pokemonLoaded;
    },
    get records() {
      const l = this.league;
      return buildRecords({
        teams: l.teams,
        results: l.allResults,
        pokedex: l.pokemon,
        eloRows: this.$store.elo.rows || [],
        awardDocs: this.$store.awards?.docs || [],
      });
    },
    recordsOf(group) {
      return this.records.filter((r) => r.group === group);
    },
    get hasAny() {
      return this.records.length > 0;
    },

    // Der Wert eines Rekords: entweder eine fertige Beschriftung oder ein Betrag.
    // NICHT `valueOf` nennen — das überschreibt Object.prototype und Alpine löst in
    // der Ausdrucksauswertung dann die eingebaute Methode auf.
    recordValue(rec) {
      if (rec.money != null) return rec.signed ? formatMarketDelta(rec.money) : formatMarket(rec.money);
      return rec.display || String(rec.value);
    },
    // „Saison 1 · Spieltag 6" — ein Kalenderdatum führt die Liga nicht.
    whenLabel(rec) {
      return this.holderWhen(rec.holders?.[0]) || 'über alle Saisons';
    },
    // Dasselbe je Halter: Teilen sich mehrere den Rekord, stellten sie ihn zu
    // unterschiedlichen Zeitpunkten auf.
    holderWhen(holder) {
      const w = holder?.when;
      if (!w) return '';
      const parts = [];
      if (w.season) parts.push(`Saison ${w.season}`);
      if (w.day) parts.push(`Spieltag ${w.day}`);
      if (w.battle) parts.push(`Kampf ${w.battle}`);
      if (w.stop) parts.push(w.stop);
      return parts.join(' · ');
    },
    open(rec, holder = null) {
      const h = holder || rec.holder;
      if (h?.teamId && !h?.image) {
        this.$dispatch('navigate', { key: 'teams', teamId: h.teamId });
        return;
      }
      if (h?.image || rec.group === 'pokemon' || rec.group === 'markt') {
        if (this.league.pokemon.some((p) => p.name === h?.name)) {
          this.$dispatch('navigate', { key: 'pokemon', pokemonName: h.name });
          return;
        }
      }
      if (h?.teamId) this.$dispatch('navigate', { key: 'teams', teamId: h.teamId });
    },
    logoUrl(file) { return `./img/teams/${file}`; },
    teamById(id) { return this.league.teams.find((t) => t.id === id) || null; },
    info(rec) { openStatInfo(null, rec.label, rec.info || ''); },
  };
}

function spielerView() {
  return {
    // Top-Pokémon: nach Kills oder nach Kampf-Siegquote.
    topTab: 'kills', // 'kills' | 'sq'
    sqMode: 'abs',   // 'abs' = Mindestzahl Kämpfe | 'pct' = Anteil der Team-Kämpfe
    sqMin: 4,
    sqPct: 40,       // in Prozent

    init() {
      const saved = loadJson(SQ_KEY);
      if (saved.tab === 'sq' || saved.tab === 'kills') this.topTab = saved.tab;
      if (saved.mode === 'pct' || saved.mode === 'abs') this.sqMode = saved.mode;
      if (Number.isFinite(saved.min)) this.sqMin = Math.max(1, Math.min(60, saved.min));
      if (Number.isFinite(saved.pct)) this.sqPct = Math.max(1, Math.min(100, saved.pct));
    },
    saveSq() {
      saveJson(SQ_KEY, { tab: this.topTab, mode: this.sqMode, min: this.sqMin, pct: this.sqPct });
    },
    setTopTab(t) { this.topTab = t; this.saveSq(); },
    setSqMode(m) { this.sqMode = m === 'pct' ? 'pct' : 'abs'; this.saveSq(); },
    setSqMin(v) { this.sqMin = Math.max(1, Math.min(60, Math.round(Number(v) || 1))); this.saveSq(); },
    setSqPct(v) { this.sqPct = Math.max(1, Math.min(100, Math.round(Number(v) || 1))); this.saveSq(); },
    get sqThresholdLabel() {
      return this.sqMode === 'pct'
        ? `ab ${this.sqPct} % der Team-Kämpfe`
        : `ab ${this.sqMin} ${this.sqMin === 1 ? 'Kampf' : 'Kämpfen'}`;
    },

    // Kennzahlen aller Pokémon + ausgetragene Kämpfe je Team (für die relative Schwelle).
    // Saisonübergreifend zählt der Gesamtbestand — `playerDuel` und `pokemonStats`
    // aggregieren über die übergebene Menge und brauchen dafür keine Sonderlogik.
    get isAll() {
      return this.$store.season.isAll;
    },
    get scopeTeams() {
      return this.isAll ? this.league.teams : this.league.seasonTeams;
    },
    get scopeResults() {
      return this.isAll ? this.league.allResults : this.league.results;
    },
    get monStats() {
      return pokemonStats(this.scopeTeams, this.scopeResults, this.league.pokemon, { availability: this.league.availability });
    },
    get teamBattles() {
      return teamBattleTotals(this.scopeResults);
    },
    // Titel und Saisons je Spieler — nur saisonübergreifend interessant.
    get playerSeasons() {
      return allTimePlayers(this.league.teams, this.league.allResults, this.league.allSchedules);
    },
    playerRow(player) {
      return this.playerSeasons.find((r) => r.player === player) || null;
    },
    // Top 5 nach Kampf-Siegquote, gefiltert über die eingestellte Mindest-Einsatzzahl.
    topBySq(player) {
      const totals = this.teamBattles;
      const min = this.sqMin;
      const pct = this.sqPct / 100;
      return this.monStats
        .filter((s) => s.team?.player === player && s.battles > 0)
        .map((s) => ({ ...s, teamBattles: totals[s.team.id] || 0 }))
        .filter((s) => (this.sqMode === 'pct'
          ? s.teamBattles > 0 && s.battles / s.teamBattles >= pct
          : s.battles >= min))
        .sort((a, b) => b.battleWinPct - a.battleWinPct || b.battles - a.battles || a.pokemon.name.localeCompare(b.pokemon.name))
        .slice(0, 5);
    },
    topList(p) {
      return this.topTab === 'sq' ? this.topBySq(p.player) : p.data.top;
    },
    topValue(s) {
      return this.topTab === 'sq' ? this.fmtPct(s.battleWinPct) : `${s.kills} K`;
    },
    topSub(s) {
      return this.topTab === 'sq' ? `${s.battleWins}/${s.battles} Kämpfe` : `${s.battles} Kämpfe`;
    },

    get league() {
      return this.$store.league;
    },
    get loaded() {
      return this.league.teamsLoaded && this.league.resultsLoaded && this.league.pokemonLoaded;
    },
    get duel() {
      return playerDuel(this.scopeTeams, this.scopeResults);
    },
    get janik() { return this.duel.janik; },
    get henrik() { return this.duel.henrik; },
    get hasData() { return this.duel.totalBattles > 0; },
    get metrics() {
      const j = this.janik;
      const h = this.henrik;
      return [
        { label: 'Matches gewonnen', a: j.matchWins, b: h.matchWins, info: 'Gewonnene Matches über die gesamte Saison.' },
        { label: 'Kämpfe gewonnen', a: j.battleWins, b: h.battleWins, info: 'Gewonnene Einzelkämpfe (je Match bis zu drei).' },
        { label: 'Kills gesamt', a: j.kills, b: h.kills, info: 'Insgesamt besiegte gegnerische Pokémon.' },
        { label: 'Deaths gesamt', a: j.deaths, b: h.deaths, info: 'Insgesamt verlorene eigene Pokémon.' },
        { label: 'Kill-Differenz', a: j.diff, b: h.diff, info: 'Kills minus Deaths über alle Teams des Spielers.' },
        { label: 'Punkte gesamt', a: j.points, b: h.points, info: 'Summe der gewonnenen Kämpfe (ein Punkt je Sieg).' },
      ];
    },
    playerColor(player) {
      return player === 'Henrik' ? '#4d90d5' : '#e3350d';
    },
    monImage(name) {
      return this.league.pokemon.find((p) => p.name === name)?.image || '';
    },
    monTeam(name) {
      return this.league.teams.find((t) => (t.pokemon || []).some((p) => p.name === name)) || null;
    },
    logoUrl(file) { return `./img/teams/${file}`; },
    fmtPct(x) { return `${Math.round((Number.isFinite(x) ? x : 0) * 100)} %`; },
    fmtDiff(d) { return d > 0 ? `+${d}` : `${d}`; },
    fmtAvg(x) { return x == null ? '—' : x.toFixed(2); },
    // Balkenanteil (0..100) für den Vergleichsbalken.
    share(a, b) {
      const t = (a || 0) + (b || 0);
      return t ? Math.round((a / t) * 100) : 50;
    },
    goMon(name) { this.$dispatch('navigate', { key: 'pokemon', pokemonName: name }); },
    goTeam(id) { this.$dispatch('navigate', { key: 'teams', teamId: id }); },
    statInfo(key) {
      const s = STAT_BY_KEY[key];
      if (s) return openStatInfo(null, s.label, s.info);
      if (EXTRA_INFO[key]) openStatInfo(null, key, EXTRA_INFO[key]);
    },
    info(title, text) { openStatInfo(null, title, text); },
  };
}

// === Schadensrechner (Teambuilder) =========================================
// Rechnet mit @smogon/calc auf Generation 9 im Doppelkampf — das Format von
// „Pokémon Champions"-VGC. Sowohl das Rechenpaket (≈130 kB) als auch die
// deutsche Namensbrücke werden erst beim ersten Öffnen nachgeladen, damit der
// Start des Teambuilders unverändert schlank bleibt.
const CALC_I18N_URL = './data/i18n-de.json';

function blankCalcSide() {
  return {
    name: null,
    nature: 'Robust',
    ability: '',
    item: '',
    sp: Object.fromEntries(CALC_STAT_KEYS.map((k) => [k, 0])),
    boosts: Object.fromEntries(CALC_STAT_KEYS.map((k) => [k, 0])),
    moves: ['', '', '', ''],
  };
}

// Achtung: Dieser Mixin wird per Spread eingesetzt — `{ ...mixin() }` WERTET
// Getter aus und kopiert nur deren Ergebnis. Alles, was sich zur Laufzeit ändert,
// steht hier deshalb als Methode, nicht als Getter.
function damageCalcMixin() {
  return {
    calcOpen: false,
    calcReady: false,
    calcLoading: false,
    calcError: '',
    calcAtk: blankCalcSide(),
    calcDef: blankCalcSide(),
    calcRows: [],
    calcStatDefs: CALC_STATS,
    calcNatures: CALC_NATURES,
    calcBoostSteps: CALC_BOOST_STEPS,
    _calc: null,   // { gen, Pokemon, Move, Field, calculate }
    _calcI18n: null, // { moves, abilities, items } de -> en (plus Rückrichtung)

    // --- Laden ---------------------------------------------------------------
    async ensureCalc() {
      if (this.calcReady || this.calcLoading) return;
      this.calcLoading = true;
      this.calcError = '';
      try {
        const [mod, res] = await Promise.all([
          import('@smogon/calc'),
          fetch(CALC_I18N_URL, { cache: 'force-cache' }),
        ]);
        const pkg = mod.default || mod;
        const gen = pkg.Generations.get(CALC_GEN);
        this._calc = { pkg, gen };
        const raw = res.ok ? await res.json() : { moves: {}, abilities: {}, items: {} };
        const invert = (o) => Object.fromEntries(Object.entries(o).map(([de, en]) => [en, de]));
        this._calcI18n = {
          moves: raw.moves || {},
          abilities: raw.abilities || {},
          items: raw.items || {},
          movesEn: invert(raw.moves || {}),
          abilitiesEn: invert(raw.abilities || {}),
          itemsEn: invert(raw.items || {}),
          moveNames: Object.keys(raw.moves || {}).sort((a, b) => a.localeCompare(b, 'de')),
          abilityNames: Object.keys(raw.abilities || {}).sort((a, b) => a.localeCompare(b, 'de')),
          itemNames: Object.keys(raw.items || {}).sort((a, b) => a.localeCompare(b, 'de')),
        };
        this.calcReady = true;
        this.recalc();
      } catch (e) {
        console.error('Schadensrechner konnte nicht geladen werden:', e);
        this.calcError = 'Der Schadensrechner konnte nicht geladen werden.';
      }
      this.calcLoading = false;
    },
    toggleCalc() {
      this.calcOpen = !this.calcOpen;
      saveJson(TB_CALC_KEY, { open: this.calcOpen });
      if (this.calcOpen) this.ensureCalc();
    },

    // --- Auswahl -------------------------------------------------------------
    // Nur Pokémon des aktuellen Matchups stehen zur Wahl.
    calcMons() {
      const list = [];
      [['a', this.teamA], ['b', this.teamB]].forEach(([side, team]) => {
        if (!team) return;
        this.allMons(team).forEach((m) => list.push({ ...m, side, teamName: team.name, player: team.player }));
      });
      return list;
    },
    calcMon(side) {
      const name = side === 'atk' ? this.calcAtk.name : this.calcDef.name;
      return this.calcMons().find((m) => m.name === name) || null;
    },
    calcSide(side) { return side === 'atk' ? this.calcAtk : this.calcDef; },
    calcSetMon(side, name) {
      if (name && !this.calcMons().some((m) => m.name === name)) return;
      const target = this.calcSide(side);
      target.name = name || null;
      this.calcPersist();
      this.recalc();
    },
    calcSwap() {
      const a = this.calcAtk;
      const b = this.calcDef;
      // Attacken gehören zum Angreifer und wandern deshalb mit.
      this.calcAtk = { ...b, moves: b.moves?.length ? b.moves : ['', '', '', ''] };
      this.calcDef = { ...a };
      this.calcPersist();
      this.recalc();
    },
    calcSetNature(side, de) {
      this.calcSide(side).nature = de;
      this.calcPersist();
      this.recalc();
    },
    calcSetField(side, field, value) {
      this.calcSide(side)[field] = value;
      this.calcPersist();
      this.recalc();
    },
    calcSetSp(side, stat, value) {
      this.calcSide(side).sp[stat] = clampCalcSp(value);
      this.calcPersist();
      this.recalc();
    },
    calcSetBoost(side, stat, value) {
      const n = Math.max(-6, Math.min(6, Math.round(Number(value) || 0)));
      this.calcSide(side).boosts[stat] = n;
      this.calcPersist();
      this.recalc();
    },
    calcSetMove(i, value) {
      const moves = [...this.calcAtk.moves];
      moves[i] = value;
      this.calcAtk.moves = moves;
      this.calcPersist();
      this.recalc();
    },
    calcNatureLabel(de) { return calcNatureLabel(de); },
    calcStatLabel(key) { return calcStatLabel(key); },
    calcBoostLabel(v) { return calcBoostLabel(v); },

    // --- Namenslisten (deutsch) ---------------------------------------------
    calcMoveNames() { return this._calcI18n?.moveNames || []; },
    calcAbilityNames() { return this._calcI18n?.abilityNames || []; },
    calcItemNames() { return this._calcI18n?.itemNames || []; },
    // Deutsche Eingabe auf den englischen Namen abbilden; unbekannte Eingaben
    // gehen unverändert durch (englische Namen bleiben so nutzbar).
    calcToEn(kind, value) {
      const v = String(value || '').trim();
      if (!v) return '';
      return this._calcI18n?.[kind]?.[v] || v;
    },

    // --- Rechnung ------------------------------------------------------------
    calcPokemon(side) {
      if (!this._calc) return null;
      const cfg = this.calcSide(side);
      const mon = this.calcMon(side);
      if (!mon) return null;
      const meta = this.league.pokemon.find((p) => p.name === mon.name) || mon;
      const key = calcSpeciesKey(meta.name_en || mon.name);
      const nature = calcNatureByDe(cfg.nature) || CALC_NATURES[0];
      try {
        return new this._calc.pkg.Pokemon(this._calc.gen, key, {
          level: 50,
          nature: nature.en,
          ability: this.calcToEn('abilities', cfg.ability) || undefined,
          item: this.calcToEn('items', cfg.item) || undefined,
          ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
          evs: Object.fromEntries(CALC_STAT_KEYS.map((k) => [k, calcSpToEv(cfg.sp[k])])),
          boosts: { ...cfg.boosts },
        });
      } catch (e) {
        return null;
      }
    },
    recalc() {
      if (!this.calcReady) { this.calcRows = []; return; }
      const attacker = this.calcPokemon('atk');
      const defender = this.calcPokemon('def');
      if (!attacker || !defender) { this.calcRows = []; return; }
      const field = new this._calc.pkg.Field({ gameType: CALC_GAME_TYPE });
      const rows = [];
      this.calcAtk.moves.forEach((m, i) => {
        const name = String(m || '').trim();
        if (!name) return;
        const en = this.calcToEn('moves', name);
        try {
          // Unbekannte Namen erzeugt @smogon/calc stillschweigend als 0-BP-Attacke —
          // deshalb vorher im Attacken-Register nachsehen.
          if (!this._calc.gen.moves.get(this._calc.pkg.toID(en))) throw new Error('unbekannte Attacke');
          const move = new this._calc.pkg.Move(this._calc.gen, en);
          const result = this._calc.pkg.calculate(this._calc.gen, attacker, defender, move, field);
          const dmg = Array.isArray(result.damage) ? result.damage.flat() : [result.damage];
          const nums = dmg.map((v) => Number(v) || 0);
          const range = calcDamagePercent(Math.min(...nums), Math.max(...nums), defender.maxHP());
          rows.push({
            i,
            name,
            type: calcTypeDe(move.type),
            category: move.category === 'Physical' ? 'Physisch' : move.category === 'Special' ? 'Spezial' : 'Status',
            bp: move.bp || 0,
            range,
            label: calcPercentLabel(range),
            tone: calcPercentTone(range.max),
            hits: calcHitsToKo(range.max),
            ko: result.kochance ? (() => { try { return result.kochance().text || ''; } catch (e) { return ''; } })() : '',
          });
        } catch (e) {
          rows.push({ i, name, error: true, label: 'Attacke unbekannt', tone: '#98a2b3' });
        }
      });
      this.calcRows = rows;
    },
    // Errechnete Statuswerte einer Seite (für die kleine Werteleiste).
    calcStatValues(side) {
      const p = this.calcPokemon(side);
      if (!p) return null;
      return p.stats;
    },

    // --- Verknüpfung mit dem Matchup-Moveset --------------------------------
    // Aus dem hinterlegten Moveset heraus den Rechner füllen …
    calcLoadFromMoveset(side) {
      const mon = this.calcMon(side);
      if (!mon) return;
      const ms = this.notes[mon.name]?.moveset;
      if (!ms) return;
      const cfg = this.calcSide(side);
      cfg.ability = ms.ability || '';
      cfg.item = ms.item || '';
      const parsed = calcSpSetToConfig(ms.sp || {});
      CALC_STAT_KEYS.forEach((k) => { cfg.sp[k] = parsed.sp[k]; });
      cfg.nature = parsed.nature?.de || 'Robust';
      if (side === 'atk') cfg.moves = [0, 1, 2, 3].map((i) => (ms.moves && ms.moves[i]) || '');
      this.calcPersist();
      this.recalc();
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `Set von ${mon.name} geladen.` } }));
    },
    // … und umgekehrt die Eingaben ins Moveset schreiben.
    calcApplyToMoveset(side) {
      const mon = this.calcMon(side);
      if (!mon || !this.notes[mon.name]) return;
      const cfg = this.calcSide(side);
      const ms = this.notes[mon.name].moveset;
      ms.ability = cfg.ability || '';
      ms.item = cfg.item || '';
      ms.sp = calcConfigToSpSet(cfg.sp, cfg.nature);
      if (side === 'atk') ms.moves = [0, 1, 2, 3].map((i) => cfg.moves[i] || '');
      this.saveNotes();
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `Set in das Moveset von ${mon.name} übernommen.` } }));
    },
    // --- Zustand (gerätelokal je Paarung) ------------------------------------
    calcPersist() {
      saveJson(this.calcKey(), { atk: this.calcAtk, def: this.calcDef });
    },
    calcKey() { return `jhdl-tb-calc-${this.markPairKey()}`; },
    calcLoadPair() {
      const stored = loadJson(this.calcKey());
      const hydrate = (raw) => {
        const base = blankCalcSide();
        if (!raw) return base;
        return {
          ...base,
          ...raw,
          sp: { ...base.sp, ...(raw.sp || {}) },
          boosts: { ...base.boosts, ...(raw.boosts || {}) },
          moves: [0, 1, 2, 3].map((i) => (raw.moves && raw.moves[i]) || ''),
        };
      };
      this.calcAtk = hydrate(stored.atk);
      this.calcDef = hydrate(stored.def);
      const names = new Set(this.calcMons().map((m) => m.name));
      // Nach einem Team-Wechsel auf das erste Pokémon der jeweiligen Seite fallen.
      if (!names.has(this.calcAtk.name)) this.calcAtk.name = this.allMons(this.teamA)[0]?.name || null;
      if (!names.has(this.calcDef.name)) this.calcDef.name = this.allMons(this.teamB)[0]?.name || null;
      this.calcRows = [];
      if (this.calcReady) this.recalc();
    },
  };
}

// === Kampfverlauf: schreiben und einsprechen ================================
// Als Mixin, weil der Verlauf an zwei Stellen gepflegt wird: beim Eintragen des
// Ergebnisses (Spieltag) und im Teambuilder neben dem Schadensrechner.
// Achtung: Mixins werden per Spread eingesetzt — deshalb ausschließlich Methoden,
// keine Getter (ein Getter würde beim Spread einmalig ausgewertet und eingefroren).
// Der geteilte Kampfverlauf eines Matches. Nur noch die Ergebniseingabe bindet ihn
// ein: Er gehört zum Ergebnis und wird von Hand geschrieben.
//
// Robustheit hat hier Vorrang vor Bequemlichkeit — ein verlorener Verlauf lässt sich
// nicht rekonstruieren. Deshalb:
// - Der Entwurf liegt zusätzlich gerätelokal und wird beim Öffnen zurückgeholt.
// - Gespeichert wird nur, wenn der Bestand aus der Datenbank bekannt ist; sonst
//   wüsste der Editor nicht, was er überschreibt.
// - Der Text wird an die Match-ID gebunden, mit der er geschrieben wurde.
function battleLogMixin() {
  return {
    logMatchId: null,
    logMeta: {},
    logDraft: '',
    logSynced: '',
    logSaving: false,
    logError: null,
    logOpen: false,

    logStore() { return this.$store.battleLogs; },
    logMe() { return this.$store.auth.me; },

    // Den Verlauf eines Matches in den Editor holen. Ein noch nicht gespeicherter
    // Entwurf desselben Matches bleibt erhalten.
    logSelect(matchId, meta = {}) {
      if (matchId && this.logMatchId === matchId) return;
      this.logMatchId = matchId || null;
      this.logMeta = meta;
      const text = matchId ? this.logStore().textFor(matchId, this.logMe()) : '';
      this.logSynced = text;
      // Ein Entwurf, der beim letzten Mal nicht ankam, wird nicht stillschweigend
      // verworfen — er ist der jüngere Stand.
      const local = matchId ? logDraftRead(matchId, this.logMe()) : null;
      this.logDraft = local != null && local !== text ? local : text;
      this.logError = null;
    },

    logDirty() { return this.logDraft !== this.logSynced; },

    // Jede Änderung im Editor sofort gerätelokal sichern.
    logTouch(value) {
      this.logDraft = value;
      if (this.logMatchId) logDraftWrite(this.logMatchId, this.logMe(), value);
    },

    // Der Verlauf kommt per Snapshot: beim ersten Laden und wenn der andere Spieler
    // schreibt. Solange nichts Eigenes im Editor steht, zieht er nach.
    logRehydrate() {
      if (!this.logMatchId || this.logDirty()) return;
      const text = this.logStore().textFor(this.logMatchId, this.logMe());
      if (text !== this.logSynced) {
        this.logDraft = text;
        this.logSynced = text;
      }
    },
    logOtherPlayer() { return this.$store.auth.other; },
    logOtherText() {
      const other = this.logOtherPlayer();
      return this.logMatchId && other ? this.logStore().textFor(this.logMatchId, other) : '';
    },
    logUpdatedLabel() {
      const at = this.logMatchId ? this.logStore().updatedAtFor(this.logMatchId, this.logMe()) : null;
      return at ? formatDateTime(at) : '';
    },

    async logSave(matchId = this.logMatchId) {
      if (!matchId || this.logSaving) return false;
      // Die Match-ID darf sich zwischen Tippen und Speichern nicht verschoben haben,
      // sonst landet der Text am falschen Match.
      if (matchId !== this.logMatchId) return false;
      if (!this.logStore().loaded) {
        this.logError = 'Der gespeicherte Stand ist noch nicht geladen — bitte kurz warten.';
        return false;
      }
      if (!this.logMe()) {
        this.logError = 'Ohne Anmeldung lässt sich der Verlauf nicht speichern.';
        return false;
      }
      this.logSaving = true;
      const text = this.logDraft;
      const ok = await this.logStore().save(matchId, this.logMe(), text, this.logMeta || {});
      if (ok) {
        this.logSynced = text;
        logDraftClear(matchId, this.logMe());
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Kampfverlauf gespeichert.' } }));
      } else {
        this.logError = this.logStore().lastError;
      }
      this.logSaving = false;
      return ok;
    },
  };
}

// Der Entwurf des Kampfverlaufs liegt zusätzlich gerätelokal. Er ist das Netz für
// den Fall, dass das Speichern fehlschlägt oder der Browser dazwischen schließt.
const LOG_DRAFT_KEY = 'jhdl-battlelog-draft-v1'; // { "<matchId>|<player>": text }

function logDraftRead(matchId, player) {
  const all = loadJson(LOG_DRAFT_KEY);
  const v = all[`${matchId}|${player}`];
  return typeof v === 'string' ? v : null;
}

function logDraftWrite(matchId, player, text) {
  const all = loadJson(LOG_DRAFT_KEY);
  all[`${matchId}|${player}`] = String(text || '');
  saveJson(LOG_DRAFT_KEY, all);
}

function logDraftClear(matchId, player) {
  const all = loadJson(LOG_DRAFT_KEY);
  delete all[`${matchId}|${player}`];
  saveJson(LOG_DRAFT_KEY, all);
}

// === Teambuilding: zwei Teams gegenüberstellen =============================
function teambuildingView() {
  return {
    ...damageCalcMixin(),
    // Notiz-/Verlaufsbereich neben dem Rechner (gerätelokal gemerkt). Geschrieben
    // wird hier nur die private Matchup-Notiz — der geteilte Kampfverlauf gehört
    // zum Ergebnis und entsteht ausschließlich in der Ergebniseingabe.
    notePanelOpen: false,
    pairMatchId: null,
    priorOpen: false,
    teamAId: null,
    teamBId: null,
    inactive: {}, // name -> true (deaktiviert)
    mods: {},     // name -> { x15, x2 }
    marks: {},    // name -> Markierungsfarbe (pro Paarung)
    notes: {},    // name -> { note, moveset } (pro Matchup)
    tileView: 'nur', // 'nur' (Kader-Raster) | 'sets' (Notiz + Moveset je Pokémon)
    wipeConfirm: null, // { scope:'one'|'all', name }
    greenOnly: { tiles: false, speed: false }, // Filter „nur grün markierte"
    recent: [],   // [{a,b}] zuletzt geöffnete Matchups
    spdSort: 'desc',
    weakSort: { key: 'sum', dir: 'desc' }, // Schwächen-Vergleich: 'sum' | 'a' | 'b'
    spdEdit: null, // Pokémon-Name im SP-/Wesen-Dialog
    allTypes: ALL_TYPES,
    // Showdown-Export
    exportSide: 'a',
    exportMode: 'all', // 'all' | 'green' | 'greenplus'
    exportExtra: {},   // name -> true (manuelle Ergänzung bei 'greenplus')
    exportText: '',

    init() {
      const tv = loadJson(TB_TILEVIEW_KEY);
      // Aus vier Ansichten sind zwei geworden — alles, was mehr als die Kacheln
      // zeigte, landet in „Movesets".
      if (tv.v === 'nur') this.tileView = 'nur';
      else if (['notes', 'moves', 'all', 'sets'].includes(tv.v)) this.tileView = 'sets';
      const go = loadJson(TB_GREENONLY_KEY);
      this.greenOnly = { tiles: !!go.tiles, speed: !!go.speed };
      this.calcOpen = !!loadJson(TB_CALC_KEY).open;
      if (this.calcOpen) this.ensureCalc();
      this.notePanelOpen = !!loadJson(TB_LOG_KEY).open;
      this.$store.notes.ensureLoaded();
      const store = loadJson(TB_RECENT_KEY);
      this.recent = Array.isArray(store.recent) ? store.recent : [];
      const nav = this.$store.nav;
      const preA = nav?.teamAId || null;
      const preB = nav?.teamBId || null;
      if (nav) { nav.teamAId = null; nav.teamBId = null; }
      const start = () => {
        if (preA || preB) this.applyPair(preA, preB);
        else if (store.last && this.teamById(store.last.a) && this.teamById(store.last.b)) this.applyPair(store.last.a, store.last.b);
        else this.pickDefaults();
      };
      if (this.loaded) start();
      else this.$watch('loaded', () => { if (this.loaded && this.teamAId == null) start(); });
    },
    // Von außen (Spieltag-Link) vorgegebene Paarung übernehmen.
    applyPair(aId, bId) {
      this.teamAId = aId || this.teams[0]?.id || null;
      this.teamBId = bId || this.teams.find((t) => t.id !== this.teamAId)?.id || null;
      this.loadPair();
    },
    get league() { return this.$store.league; },
    get loaded() { return this.league.teamsLoaded && this.league.pokemonLoaded; },
    get teams() { return this.league.seasonTeams; },
    teamById(id) { return this.league.teams.find((t) => t.id === id) || null; },
    pickDefaults() {
      const j = this.teams.find((t) => t.player === 'Janik');
      const h = this.teams.find((t) => t.player === 'Henrik');
      this.teamAId = j?.id || this.teams[0]?.id || null;
      this.teamBId = h?.id || this.teams.find((t) => t.id !== this.teamAId)?.id || null;
      this.loadPair();
    },
    get teamA() { return this.teamById(this.teamAId); },
    get teamB() { return this.teamById(this.teamBId); },
    get ready() { return !!(this.teamA && this.teamB); },
    setTeam(side, id) {
      if (side === 'a') this.teamAId = id; else this.teamBId = id;
      this.loadPair();
    },
    pairKey() { return `jhdl-tb-${this.teamAId}-${this.teamBId}`; },
    // Reihenfolge-unabhängiger Schlüssel für die Markierungen dieser Paarung.
    markPairKey() { return [this.teamAId, this.teamBId].filter(Boolean).sort().join('|'); },
    loadPair() {
      const s = loadJson(this.pairKey());
      this.inactive = s.inactive || {};
      this.mods = s.mods || {};
      this.marks = loadJson(MATCHUP_MARKS_KEY)[this.markPairKey()] || {};
      this.loadNotes();
      this.calcLoadPair();
      this.selectPairMatch();
      this.recordRecent();
      this.exportExtra = {};
      this.exportText = '';
    },
    savePair() { saveJson(this.pairKey(), { inactive: this.inactive, mods: this.mods }); },

    // === Notizen & Moveset (pro Matchup) ====================================
    loadNotes() {
      const stored = loadJson(TB_NOTES_KEY)[this.markPairKey()] || {};
      const names = [...this.allMons(this.teamA), ...this.allMons(this.teamB)].map((m) => m.name);
      const notes = {};
      names.forEach((n) => {
        const d = stored[n] || {};
        const ms = d.moveset || {};
        // Mega-Pokémon brauchen zwingend ihren Stein — Item einmalig vorbelegen,
        // solange für dieses Pokémon in diesem Matchup noch nichts hinterlegt ist.
        const preset = !d.moveset && isMega(n) ? 'Mega-Stein' : '';
        // Statuswerte liegen seit dem Schadensrechner in sechs Einzelfeldern
        // („32+", „14-"). Alte Freitext-Angaben werden einmalig übernommen; der
        // Originaltext bleibt als Hinweis stehen, damit nichts verloren geht.
        const sp = ms.sp && typeof ms.sp === 'object'
          ? { ...calcBlankSpSet(), ...ms.sp }
          : calcParseLegacyEvs(ms.evs);
        notes[n] = {
          note: d.note || '',
          moveset: {
            item: ms.item || preset,
            ability: ms.ability || '',
            moves: [0, 1, 2, 3].map((i) => (ms.moves && ms.moves[i]) || ''),
            sp,
            evs: ms.sp ? '' : (ms.evs || ''),
          },
        };
      });
      this.notes = notes;
    },
    saveNotes() {
      const all = loadJson(TB_NOTES_KEY);
      all[this.markPairKey()] = this.notes;
      saveJson(TB_NOTES_KEY, all);
    },
    // Ob ein Pokémon bereits Notiz/Moveset-Inhalt hat (für einen dezenten Marker).
    hasNote(name) {
      const d = this.notes[name];
      if (!d) return false;
      const ms = d.moveset || {};
      const anySp = Object.values(ms.sp || {}).some((v) => String(v || '').trim());
      return !!(d.note || ms.item || ms.ability || ms.evs || anySp || (ms.moves || []).some((m) => m));
    },
    setTileView(v) {
      this.tileView = v === 'sets' ? 'sets' : 'nur';
      saveJson(TB_TILEVIEW_KEY, { v: this.tileView });
    },
    // Die Set-Kacheln richten sich nach der BREITE DES BEREICHS, nicht nach dem
    // Fenster: bei eingeklappter Seitenleiste stehen auf einem Tablet drei
    // nebeneinander, bei ausgeklappter zwei.
    get tileGridClass() {
      return this.tileView === 'nur'
        ? 'grid-cols-5 sm:grid-cols-10'
        : 'grid-cols-1 @min-[34rem]:grid-cols-2 @min-[52rem]:grid-cols-3';
    },

    // === Sets leeren ========================================================
    // Nach der Hinrunde stehen die alten Sets noch überall — einzeln oder für
    // beide Teams auf einmal wegräumen, jeweils erst nach Rückfrage.
    blankSetFor(name) {
      return {
        note: '',
        moveset: {
          item: isMega(name) ? 'Mega-Stein' : '',
          ability: '',
          moves: ['', '', '', ''],
          sp: calcBlankSpSet(),
          evs: '',
        },
      };
    },
    askWipe(scope, name = null) {
      this.wipeConfirm = { scope, name };
      this.$nextTick(() => document.getElementById('tb-wipe')?.showPopover());
    },
    closeWipe() {
      const el = document.getElementById('tb-wipe');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.wipeConfirm = null;
    },
    get wipeCount() {
      if (this.wipeConfirm?.scope === 'one') return this.hasNote(this.wipeConfirm.name) ? 1 : 0;
      return Object.keys(this.notes).filter((n) => this.hasNote(n)).length;
    },
    confirmWipe() {
      const c = this.wipeConfirm;
      if (!c) return;
      if (c.scope === 'one') {
        if (!c.name) return this.closeWipe();
        this.notes = { ...this.notes, [c.name]: this.blankSetFor(c.name) };
      } else {
        const next = {};
        Object.keys(this.notes).forEach((n) => { next[n] = this.blankSetFor(n); });
        this.notes = next;
      }
      this.saveNotes();
      this.closeWipe();
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { msg: c.scope === 'one' ? `Set von ${c.name} geleert.` : 'Alle Sets dieser Paarung geleert.' },
      }));
    },

    // === Filter „nur grün markierte" ========================================
    // Gilt getrennt für die Kader-Kacheln (beide Ansichten) und die
    // Initiative-Tierlist; gerätelokal, unabhängig von der Paarung.
    toggleGreenOnly(which) {
      this.greenOnly = { ...this.greenOnly, [which]: !this.greenOnly[which] };
      saveJson(TB_GREENONLY_KEY, this.greenOnly);
    },
    isGreen(name) { return this.marks[name] === 'green'; },
    // Kacheln des Matchup-Bereichs (optional auf grün markierte reduziert).
    tileMons(team) {
      const mons = this.allMons(team);
      return this.greenOnly.tiles ? mons.filter((m) => this.isGreen(m.name)) : mons;
    },
    greenCount(team) { return this.greenMons(team).length; },
    get greenTotal() { return this.greenCount(this.teamA) + this.greenCount(this.teamB); },

    // === Zuletzt geöffnete Matchups =========================================
    recordRecent() {
      const a = this.teamAId, b = this.teamBId;
      if (!a || !b) return;
      const store = loadJson(TB_RECENT_KEY);
      const prev = Array.isArray(store.recent) ? store.recent : [];
      const key = [a, b].slice().sort().join('|');
      const filtered = prev.filter((p) => [p.a, p.b].slice().sort().join('|') !== key);
      const recent = [{ a, b }, ...filtered].slice(0, 6);
      saveJson(TB_RECENT_KEY, { last: { a, b }, recent });
      this.recent = recent;
    },
    applyRecent(val) {
      if (!val) return;
      const [a, b] = String(val).split('>');
      if (a && b) this.applyPair(a, b);
    },
    recentLabel(p) {
      return `${this.teamById(p.a)?.name || '?'} vs ${this.teamById(p.b)?.name || '?'}`;
    },

    // === Matchup-Markierungen ===============================================
    markGet(name) { return this.marks[name] || null; },
    markColor(c) { return MARK_COLORS[c] || 'transparent'; },
    markCycle(name) {
      const i = MARK_CYCLE.indexOf(this.markGet(name));
      this.markSet(name, MARK_CYCLE[(i + 1) % MARK_CYCLE.length]);
    },
    markSet(name, value) {
      const m = { ...this.marks };
      if (value) m[name] = value; else delete m[name];
      this.marks = m;
      const all = loadJson(MATCHUP_MARKS_KEY);
      all[this.markPairKey()] = this.marks;
      saveJson(MATCHUP_MARKS_KEY, all);
    },
    // Gedrückthalten auf einer Kachel setzt die Markierung direkt auf „aus" —
    // sonst müsste man die ganze Farbfolge durchklicken. Der Klick, der auf das
    // Loslassen folgt, wird unterdrückt.
    _markHold: null,
    _markSuppress: false,
    markHoldStart(name) {
      this.markHoldEnd();
      this._markHold = setTimeout(() => {
        this._markHold = null;
        this._markSuppress = true;
        if (this.markGet(name)) {
          this.markSet(name, null);
          window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `Markierung entfernt – ${name}` } }));
        }
      }, 450);
    },
    markHoldEnd() {
      if (this._markHold) clearTimeout(this._markHold);
      this._markHold = null;
    },
    // Die Farbfolge lässt sich in beiden Ansichten durchklicken. In der
    // Set-Ansicht liegt der Auslöser bewusst nur auf der Kopfzeile der Kachel —
    // die Eingabefelder darunter bleiben davon unberührt.
    markTappable() { return true; },
    markTap(name) {
      this.markHoldEnd();
      if (this._markSuppress) { this._markSuppress = false; return; }
      this.markCycle(name);
    },

    // === Showdown-Export ====================================================
    get exportTeam() { return this.exportSide === 'a' ? this.teamA : this.teamB; },
    greenMons(team) { return this.allMons(team).filter((m) => this.marks[m.name] === 'green'); },
    // Übrige Pokémon des Teams (nicht grün) für die manuelle Ergänzung.
    get exportRest() {
      const team = this.exportTeam;
      if (!team) return [];
      return this.allMons(team).filter((m) => this.marks[m.name] !== 'green');
    },
    exportSelection() {
      const team = this.exportTeam;
      if (!team) return [];
      if (this.exportMode === 'all') return this.allMons(team);
      const green = this.greenMons(team);
      if (this.exportMode === 'green') return green;
      // greenplus: grüne + manuell gewählte, dedupliziert, max. 6.
      const extra = this.allMons(team).filter((m) => this.exportExtra[m.name] && this.marks[m.name] !== 'green');
      const seen = new Set();
      return [...green, ...extra].filter((m) => (seen.has(m.name) ? false : seen.add(m.name))).slice(0, 6);
    },
    get exportCount() { return this.exportSelection().length; },
    toggleExportExtra(name) {
      const n = { ...this.exportExtra };
      if (n[name]) delete n[name]; else n[name] = true;
      this.exportExtra = n;
      this.buildExport();
    },
    buildExport() { this.exportText = showdownExport(this.exportSelection()); },
    openExport() {
      this.buildExport();
      this.$nextTick(() => document.getElementById('sd-export')?.showPopover());
    },
    async copyExport() {
      try { await navigator.clipboard?.writeText(this.exportText); } catch (e) {}
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Showdown-Export kopiert.' } }));
    },
    isActive(name) { return !this.inactive[name]; },
    toggleActive(name) {
      const n = { ...this.inactive };
      if (n[name]) delete n[name]; else n[name] = true;
      this.inactive = n;
      this.savePair();
    },
    modGet(name) {
      const m = this.mods[name] || {};
      return {
        x15: !!m.x15, x2: !!m.x2, x05: !!m.x05, x067: !!m.x067,
        baseVariant: !!m.baseVariant,
        ...normalizeSpd(m),
      };
    },
    extraMods() { return SPEED_MOD_DEFS.filter((m) => m.key === 'x05' || m.key === 'x067'); },
    natIcon(spec) { return natIcon(spec); },
    modToggle(name, key) {
      const cur = this.modGet(name);
      cur[key] = !cur[key];
      this.modSave(name, cur);
    },
    modSave(name, cfg) {
      this.mods = { ...this.mods, [name]: cfg };
      this.savePair();
    },
    // Eigener SP-Wert (0–32) statt der Standardannahme 0 & 32 – je Matchup.
    modSetSp(name, value) {
      this.modSave(name, { ...this.modGet(name), sp: clampSp(value) });
    },
    modResetSp(name) {
      this.modSave(name, { ...this.modGet(name), sp: null });
    },
    modSetNat(name, nat) {
      this.modSave(name, { ...this.modGet(name), nat: NAT_MODES.includes(nat) ? nat : 'both' });
    },
    spdBadge(name) {
      return spdBadge(this.modGet(name));
    },
    natLabel(nat) {
      return NAT_LABELS[nat] || NAT_LABELS.both;
    },
    // --- Initiative ⇄ Moveset ------------------------------------------------
    // Die Initiative-Einstellung der Tierlist (SP + Wesen) und das Init-Feld des
    // Matchup-Movesets beschreiben dieselbe Sache. Beide Richtungen sind deshalb
    // per Knopfdruck übertragbar.
    spdToMoveset(name) {
      const ms = this.notes[name]?.moveset;
      if (!ms) return;
      const cfg = this.modGet(name);
      const sp = cfg.sp == null ? 32 : cfg.sp;
      const nat = cfg.nat === 'up' ? 'up' : cfg.nat === 'down' ? 'down' : 'neutral';
      ms.sp = { ...calcBlankSpSet(), ...(ms.sp || {}), spe: `${clampCalcSp(sp)}${nat === 'up' ? '+' : nat === 'down' ? '-' : ''}` };
      this.saveNotes();
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `Initiative in das Moveset von ${name} übernommen.` } }));
    },
    movesetToSpd(name) {
      const field = this.notes[name]?.moveset?.sp?.spe;
      const parsed = calcSpSetToConfig({ spe: field });
      if (!String(field || '').trim()) {
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Im Moveset ist keine Initiative hinterlegt.' } }));
        return;
      }
      this.modSave(name, { ...this.modGet(name), sp: parsed.sp.spe, nat: parsed.up === 'spe' ? 'up' : parsed.down === 'spe' ? 'down' : 'both' });
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `Initiative von ${name} aus dem Moveset übernommen.` } }));
    },
    // Ob für dieses Pokémon überhaupt ein Init-Wert im Moveset steht.
    movesetHasSpeed(name) {
      return !!String(this.notes[name]?.moveset?.sp?.spe || '').trim();
    },

    // Dialog-Aliase, damit das SP-/Wesen-Popover in beiden Views identisch ist.
    spdGet(name) { return this.modGet(name); },
    spdToggle(name, key) { this.modToggle(name, key); },
    spdSetSp(name, value) { this.modSetSp(name, value); },
    spdResetSp(name) { this.modResetSp(name); },
    spdSetNat(name, nat) { this.modSetNat(name, nat); },
    openSpdConfig(name) {
      this.spdEdit = name;
      this.$nextTick(() => document.getElementById('spd-config')?.showPopover());
    },
    closeSpdConfig() {
      const el = document.getElementById('spd-config');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.spdEdit = null;
    },
    get spdEditMon() {
      if (!this.spdEdit) return null;
      return [...this.allMons(this.teamA), ...this.allMons(this.teamB)].find((p) => p.name === this.spdEdit) || null;
    },
    get spdEditPreview() {
      const mon = this.spdEditMon;
      const base = mon ? this.baseSpeedFor(mon) : null;
      if (base == null) return [];
      return speedCases(base, this.modGet(mon.name)).map((c) => ({ ...c, color: invTone(c.sp, c.nature) }));
    },

    // === Mega-Pokémon: Nicht-Mega-Variante ==================================
    // Vor der Mega-Entwicklung zählt die Basis-Initiative. Sie lässt sich je
    // Matchup zusätzlich in die Tierlist aufnehmen.
    megaBaseOf(mon) {
      const full = this.league.pokemon.find((p) => p.name === mon?.name) || mon;
      return baseFormOf(full, this.league.pokemon);
    },
    get spdEditBase() {
      const mon = this.spdEditMon;
      return mon ? this.megaBaseOf(mon) : null;
    },
    get spdEditBasePreview() {
      const base = this.spdEditBase;
      const mon = this.spdEditMon;
      if (!base || !Number.isFinite(base.base_speed)) return [];
      return speedCases(base.base_speed, this.modGet(mon.name)).map((c) => ({ ...c, color: invTone(c.sp, c.nature) }));
    },
    toggleBaseVariant(name) {
      const cur = this.modGet(name);
      this.modSave(name, { ...cur, baseVariant: !cur.baseVariant });
    },
    allMons(team) {
      const rank = { S: 0, A: 1, B: 2, C: 3, D: 4 };
      return [...(team?.pokemon || [])].sort((a, b) => (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9));
    },
    activeMons(team) {
      return this.allMons(team).filter((p) => this.isActive(p.name));
    },
    baseSpeedFor(mon) {
      const m = this.league.pokemon.find((p) => p.name === mon.name);
      const v = m?.base_speed ?? mon.base_speed;
      return Number.isFinite(v) ? v : null;
    },
    playerColor(player) { return player === 'Henrik' ? '#4d90d5' : '#e3350d'; },
    logoUrl(file) { return `./img/teams/${file}`; },
    typeColor(type) { return TYPE_COLORS[type] || '#6b7280'; },
    tierColor(tier) { return TIER_COLORS[tier] || '#6b7280'; },
    goMon(name) { this.$dispatch('navigate', { key: 'pokemon', pokemonName: name }); },
    // Externe Detailseite auf pokemon-zone.com (Slug über den englischen Namen).
    pokezoneLink(name) {
      const en = this.league.pokemon.find((p) => p.name === name)?.name_en;
      return en ? pokezoneUrl(en) : null;
    },
    toggleSpdSort() { this.spdSort = this.spdSort === 'desc' ? 'asc' : 'desc'; },

    // Pokémon der Initiative-Tierlist: aktive (optional nur grün markierte).
    speedMons(team) {
      const mons = this.activeMons(team);
      return this.greenOnly.speed ? mons.filter((m) => this.isGreen(m.name)) : mons;
    },
    // Gemeinsame Initiative-Tierlist beider Teams, nach Team eingefärbt.
    get combinedSpeedRows() {
      const rows = [];
      [['a', this.teamA], ['b', this.teamB]].forEach(([side, team]) => {
        if (!team) return;
        this.speedMons(team).forEach((mon) => {
          const cfg = this.modGet(mon.name);
          const mods = speedMods(cfg);
          // Formen dieses Kader-Eintrags: das Pokémon selbst und — bei Megas mit
          // aktivierter Basisvariante — zusätzlich die Nicht-Mega-Form.
          const forms = [];
          const own = this.baseSpeedFor(mon);
          if (own != null) forms.push({ mon, base: own, tag: null, key: 'self' });
          if (cfg.baseVariant) {
            const bf = this.megaBaseOf(mon);
            if (bf && Number.isFinite(bf.base_speed)) {
              forms.push({ mon: bf, base: bf.base_speed, tag: 'vor Mega', key: 'base' });
            }
          }
          forms.forEach((form) => {
            speedCases(form.base, cfg).forEach((inv) => mods.forEach((mod) => {
              rows.push({
                id: `${side}|${mon.name}|${form.key}|${inv.key}|${mod.key}`,
                side, team, mon: form.mon, tag: form.tag,
                inv: inv.label, invKey: inv.key, invColor: invTone(inv.sp, inv.nature),
                mod: mod.label, modKey: mod.key,
                speed: applySpeedMod(inv.speed, mod.mult),
                color: this.playerColor(team.player),
              });
            }));
          });
        });
      });
      const dir = this.spdSort === 'asc' ? 1 : -1;
      rows.sort((a, b) => dir * (a.speed - b.speed) || a.mon.name.localeCompare(b.mon.name));
      return rows;
    },
    modColor(key) { return modTone(key); },

    // Effektivität von STAB-Attacken: bester Multiplikator, den attackerSide mit
    // den eigenen Typen gegen jedes aktive Pokémon der Gegenseite erzielt.
    threat(attacker, defenderMon) {
      const atkTypes = [...new Set(this.activeMons(attacker).flatMap((m) => m.types || []))];
      return atkTypes.reduce((best, atk) => Math.max(best, typeMultiplier(atk, defenderMon.types || [])), 0);
    },
    threatList(attackerSide) {
      const attacker = attackerSide === 'a' ? this.teamA : this.teamB;
      const defender = attackerSide === 'a' ? this.teamB : this.teamA;
      if (!attacker || !defender) return [];
      return this.activeMons(defender)
        .map((m) => ({ mon: m, mult: this.threat(attacker, m), color: this.playerColor(defender.player) }))
        .sort((a, b) => b.mult - a.mult || a.mon.name.localeCompare(b.mon.name));
    },
    // Schwächen-Vergleich je Angriffstyp (Anzahl aktiver Pokémon mit Schwäche).
    // Sortierbar nach gemeinsamer Summe oder nach einem der beiden Teams.
    setWeakSort(key) {
      this.weakSort = this.weakSort.key === key
        ? { key, dir: this.weakSort.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' };
    },
    weakSortArrow(key) {
      if (this.weakSort.key !== key) return '';
      return this.weakSort.dir === 'desc' ? '▼' : '▲';
    },
    get weakCompare() {
      const count = (team) => ALL_TYPES.map((type) => this.activeMons(team).filter((m) => typeMultiplier(type, m.types || []) > 1).length);
      const a = count(this.teamA);
      const b = count(this.teamB);
      const { key, dir } = this.weakSort;
      const sign = dir === 'asc' ? -1 : 1;
      return ALL_TYPES
        .map((type, i) => ({ type, a: a[i], b: b[i], sum: a[i] + b[i] }))
        .sort((x, y) => sign * (y[key] - x[key]) || x.type.localeCompare(y.type));
    },
    multLabel(mult) {
      if (mult === 0) return '0';
      if (mult === 0.25) return '¼';
      if (mult === 0.5) return '½';
      if (mult === 1) return '·';
      return `${mult}×`;
    },
    multStyle(mult) {
      if (mult >= 4) return 'background:rgba(227,53,13,0.85);color:#fff';
      if (mult > 1) return 'background:rgba(227,53,13,0.4);color:#ffd9cf';
      if (mult === 0) return 'background:rgba(152,162,179,0.16);color:#98a2b3';
      if (mult <= 0.25) return 'background:rgba(99,188,90,0.7);color:#06210a';
      if (mult < 1) return 'background:rgba(99,188,90,0.3);color:#bbe9b3';
      return 'color:#5b6573';
    },

    // === Matchup-Notizen im Teambuilder ======================================
    // Die private Notiz zur Paarung wird hier geführt; der geteilte Kampfverlauf
    // ist nur lesbar — geschrieben wird er zum Ergebnis im Spielplan.
    toggleNotePanel() {
      this.notePanelOpen = !this.notePanelOpen;
      saveJson(TB_LOG_KEY, { open: this.notePanelOpen });
    },

    // Alle Partien dieser beiden Teams aus dem Spielplan, in Spieltagsreihenfolge.
    pairMatches() {
      const a = this.teamAId;
      const b = this.teamBId;
      if (!a || !b) return [];
      const out = [];
      (this.league.schedule?.matchdays || []).forEach((md) => {
        (md.matches || []).forEach((m, i) => {
          const hit = (m.home === a && m.away === b) || (m.home === b && m.away === a);
          if (!hit) return;
          const id = matchDocId(md.day, i, this.league.season);
          const result = (this.league.results || []).find((r) => r.id === id) || null;
          out.push({
            id,
            day: md.day,
            leg: md.leg === 'rueck' ? 'Rückrunde' : 'Hinrunde',
            home: m.home,
            away: m.away,
            played: (result?.battles || []).some((x) => x && x.done),
            complete: isMatchComplete(result),
          });
        });
      });
      return out.sort((x, y) => x.day - y.day);
    },

    // Standardwahl: die erste noch nicht abgeschlossene Partie, sonst die letzte.
    selectPairMatch(matchId = null) {
      const list = this.pairMatches();
      if (!list.length) { this.pairMatchId = null; return; }
      const target = (matchId && list.find((m) => m.id === matchId))
        || list.find((m) => !m.complete)
        || list[list.length - 1];
      this.pairMatchId = target.id;
    },

    currentPairMatch() {
      return this.pairMatches().find((m) => m.id === this.pairMatchId) || null;
    },
    // Der geteilte Verlauf zur gewählten Partie — nur zum Nachlesen.
    pairLogAuthors() {
      return this.pairMatchId ? this.$store.battleLogs.authorsFor(this.pairMatchId) : [];
    },
    pairLogText(player) {
      return this.pairMatchId ? this.$store.battleLogs.textFor(this.pairMatchId, player) : '';
    },
    pairMatchLabel(m) {
      return m ? `Spieltag ${m.day} · ${m.leg}${m.complete ? ' · gespielt' : ''}` : '';
    },
    // Partien derselben Paarung, die VOR der gewählten liegen — im Rückrunden-
    // Teambuilding also das Hinspiel samt Notizen und Verlauf.
    priorPairMatches() {
      const cur = this.currentPairMatch();
      if (!cur) return [];
      return this.pairMatches().filter((m) => m.day < cur.day);
    },
    hasPriorContent() {
      return this.priorPairMatches().some(
        (m) => this.$store.notes.hasMatchNote(m.id) || this.$store.battleLogs.has(m.id),
      );
    },

    matchupNote(matchId) {
      return this.$store.notes.matchNote(matchId || this.pairMatchId || '');
    },
    setMatchupNote(text) {
      if (this.pairMatchId) this.$store.notes.set('matches', this.pairMatchId, text);
    },
  };
}

// === Wintertransfer-Draft ==================================================
function transferView() {
  return {
    busy: false,
    candidate: null, // { type:'remove'|'pick', mon }
    q: '',           // Pool-Suche (Pick-Phase)

    get league() { return this.$store.league; },
    get loaded() {
      return this.league.teamsLoaded && this.league.resultsLoaded && this.league.draftLoaded && this.league.transferLoaded;
    },
    get transfer() { return this.league.transfer; },
    get status() { return this.transfer.status || 'idle'; },
    get running() { return this.status === 'running'; },
    get draftDone() { return this.league.draft?.status === 'done'; },
    get order() { return this.transfer.order || []; },
    get n() { return this.order.length; },
    get total() { return 4 * this.n; },

    teamById(id) { return this.league.teams.find((t) => t.id === id) || null; },

    // Aktueller Zug im 4-Runden-Snake.
    get currentPick() {
      const t = this.transfer;
      if (!this.running || !this.n) return null;
      const round = Math.floor(t.pickIndex / this.n); // 0..3
      const pos = t.pickIndex % this.n;
      const idx = round % 2 === 0 ? pos : this.n - 1 - pos;
      return { teamId: this.order[idx], round: round + 1, phase: round < 2 ? 'remove' : 'pick', pickNo: t.pickIndex + 1 };
    },
    get currentTeam() { const cp = this.currentPick; return cp ? this.teamById(cp.teamId) : null; },
    // Auch im Transfer zieht nur, wem das Team gehört.
    get isMyTurn() { return this.$store.auth.ownsTeam(this.currentTeam); },
    get waitingFor() { return this.currentTeam?.player || null; },
    get currentRoster() {
      const rank = { S: 0, A: 1, B: 2, C: 3, D: 4 };
      return [...(this.currentTeam?.pokemon || [])].sort((a, b) => (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9));
    },
    get orderTeams() { return this.order.map((id) => this.teamById(id)).filter(Boolean); },

    // Alle aktuell gerosterten Namen (für Pool-Ausschluss).
    get rosteredNames() {
      const s = new Set();
      this.league.teams.forEach((t) => (t.pokemon || []).forEach((p) => s.add(p.name)));
      return s;
    },

    // Tier-Credits eines Teams: abgegeben (R1/R2) minus bereits zurückgepickt.
    creditsFor(teamId) {
      const c = {};
      (this.transfer.removed || []).forEach((r) => { if (r.teamId === teamId) c[r.tier] = (c[r.tier] || 0) + 1; });
      (this.transfer.added || []).forEach((a) => { if (a.teamId === teamId) c[a.tier] = (c[a.tier] || 0) - 1; });
      return c;
    },
    get currentCredits() { return this.currentTeam ? this.creditsFor(this.currentTeam.id) : {}; },
    get pickableTiers() { return TIER_ORDER.filter((t) => (this.currentCredits[t] || 0) > 0); },
    get canPickAny() { return this.pickableTiers.length > 0; },

    // Pool je pickbarem Tier: Pokémon dieses Tiers, die in KEINEM Roster stehen.
    poolGroups() {
      const rostered = this.rosteredNames;
      const term = this.q.trim().toLowerCase();
      return this.pickableTiers.map((tier) => ({
        tier,
        mons: this.league.pokemon.filter((p) => p.tier === tier && !rostered.has(p.name)
          && (!term || p.name.toLowerCase().includes(term) || (p.name_en || '').toLowerCase().includes(term)
            || (p.types || []).some((ty) => ty.toLowerCase().includes(term)))),
      })).filter((g) => g.mons.length > 0);
    },

    // Verlauf (Abgaben, Picks und Verzichte) in Zug-Reihenfolge. `at` = pickIndex des
    // Zugs; Alt-Einträge ohne `at` behalten über die stabile Sortierung ihre Ordnung.
    get log() {
      const rows = [];
      (this.transfer.removed || []).forEach((r) => rows.push({ ...r, kind: 'remove' }));
      (this.transfer.added || []).forEach((a) => rows.push({ ...a, kind: 'pick' }));
      (this.transfer.skipped || []).forEach((s) => rows.push({ ...s, kind: 'skip', name: null, tier: null }));
      return rows.sort((a, b) => (a.round || 0) - (b.round || 0) || (a.at ?? 0) - (b.at ?? 0));
    },
    // Beschriftung eines Verlaufs-Eintrags.
    logLabel(row) {
      if (row.kind === 'remove') return 'abgegeben';
      if (row.kind === 'pick') return 'gepickt';
      return row.phase === 'pick' ? 'kein Pick' : 'keine Abgabe';
    },
    monImage(name) { return this.league.pokemon.find((p) => p.name === name)?.image || ''; },

    // --- Aktionen (mit Bestätigung) ---
    askRemove(mon) { if (this.busy || !this.isMyTurn) return; this.candidate = { type: 'remove', mon }; this.$nextTick(() => document.getElementById('transfer-confirm')?.showPopover()); },
    askPick(mon) { if (this.busy || !this.isMyTurn) return; this.candidate = { type: 'pick', mon }; this.$nextTick(() => document.getElementById('transfer-confirm')?.showPopover()); },
    closeConfirm(id) { const el = document.getElementById(id); if (el && el.matches(':popover-open')) el.hidePopover(); },
    async confirmAction() {
      if (!this.candidate || !this.currentTeam || this.busy || !this.isMyTurn) return;
      this.busy = true;
      try {
        if (this.candidate.type === 'remove') await this.league.transferRemove(this.currentTeam.id, this.candidate.mon.name);
        else await this.league.transferPick(this.currentTeam.id, this.candidate.mon);
      } catch (e) { console.error('Transfer-Aktion fehlgeschlagen:', e); }
      this.closeConfirm('transfer-confirm');
      this.candidate = null;
      this.busy = false;
    },
    async skip() {
      if (this.busy || !this.currentTeam || !this.isMyTurn) return;
      this.busy = true;
      try { await this.league.transferSkip(this.currentTeam.id, this.currentPick?.phase || 'remove'); }
      catch (e) { console.error(e); }
      this.busy = false;
    },
    async start() { this.closeConfirm('transfer-start-confirm'); if (this.busy || !this.draftDone) return; this.busy = true; try { await this.league.startTransfer(); } catch (e) { console.error(e); } this.busy = false; },

    logoUrl(file) { return `./img/teams/${file}`; },
    playerColor(player) { return player === 'Henrik' ? '#4d90d5' : '#e3350d'; },
    tierColor(tier) { return TIER_COLORS[tier] || '#6b7280'; },
    typeColor(type) { return TYPE_COLORS[type] || '#6b7280'; },
    goMon(name) { this.$dispatch('navigate', { key: 'pokemon', pokemonName: name }); },
  };
}

// === Awards: Nominieren, Abstimmen, Siegerehrung ============================
function awardsView() {
  return {
    tab: 'open',   // 'open' | 'done' | 'next'
    dialog: null,  // { mode: 'nominate' | 'vote', inst }
    draft: [],     // Nominierungen des eigenen Spielers im Dialog
    pair: [],      // Zwischenauswahl für Duo-Awards (2 Pokémon)
    votes: {},     // { optionId: 0…10 }
    q: '',
    busy: false,
    _cer: null,

    init() {
      const t = loadJson('jhdl-awards-tab-v1');
      if (['open', 'done', 'next'].includes(t.tab)) this.tab = t.tab;
    },
    setTab(t) {
      this.tab = t;
      saveJson('jhdl-awards-tab-v1', { tab: t });
    },

    get league() { return this.$store.league; },
    get store() { return this.$store.awards; },
    get me() { return this.store.me; },
    get loaded() {
      const l = this.league;
      return l.teamsLoaded && l.resultsLoaded && l.scheduleLoaded && l.pokemonLoaded && this.store.loaded;
    },
    teamById(id) { return this.league.teams.find((t) => t.id === id) || null; },
    logoUrl(file) { return `./img/teams/${file}`; },
    monImage(name) { return this.league.pokemon.find((p) => p.name === name)?.image || ''; },
    playerColor(player) { return player === 'Henrik' ? '#4d90d5' : '#e3350d'; },

    // --- Saisonübergreifendes Archiv ---------------------------------------
    // Abgestimmt wird immer in einer Saison; übergreifend gibt es nur die Bilanz.
    get isAll() {
      return this.$store.season.isAll;
    },
    // Mittelwert einer Abstimmung, so beschriftet wie in der Siegerehrung.
    fmtScore(v) {
      return (Math.round((Number(v) || 0) * 10) / 10).toFixed(1).replace('.', ',');
    },
    get awardBoard() {
      return awardLeaderboard(this.store.docs, this.league.pokemon, this.league.teams);
    },
    // Alle abgeschlossenen Abstimmungen, nach Saison gruppiert und darin nach
    // Spieltag sortiert. Der Sieger steht nicht im Dokument — er wird gerechnet.
    get awardArchive() {
      const bySeason = {};
      (this.store.docs || []).forEach((d) => {
        if (!d || d.status !== 'done') return;
        const winner = awardWinner(d);
        if (!winner) return;
        const season = seasonOfId(d.id);
        const def = AWARD_BY_KEY[d.key];
        (bySeason[season] = bySeason[season] || []).push({
          id: d.id,
          season,
          day: d.day ?? null,
          teamId: d.teamId ?? null,
          entity: d.entity || 'pokemon',
          award: def?.label || d.key,
          winner: winner.label || winner.id,
          image: (d.entity || 'pokemon') === 'pokemon' ? this.monImage(winner.label || winner.id) : null,
          score: winner.avg,
        });
      });
      return Object.keys(bySeason)
        .map(Number)
        .sort((a, b) => b - a)
        .map((season) => ({
          season,
          rows: bySeason[season].sort((a, b) => (a.day ?? 99) - (b.day ?? 99) || a.award.localeCompare(b.award)),
        }));
    },
    get archiveCount() {
      return this.awardArchive.reduce((sum, g) => sum + g.rows.length, 0);
    },
    color(key) { return awardColor(key); },
    medal(key) { return this.store.medalHtml(key); },

    // --- Was ist gespielt, was ist damit fällig? ---
    get playedDays() {
      const set = new Set();
      (this.league.results || []).forEach((r) => {
        if (r?.day != null && (r.battles || []).some((b) => b && b.done)) set.add(r.day);
      });
      return [...set].sort((a, b) => a - b);
    },
    get scheduleDays() {
      return (this.league.schedule?.matchdays || []).map((m) => m.day);
    },
    // Saison-Awards sind erst dran, wenn JEDES Spiel JEDES Spieltags ein
    // Ergebnis hat — nicht schon, wenn ein Spieltag angefangen wurde.
    get seasonComplete() {
      const matchdays = this.league.schedule?.matchdays || [];
      if (!matchdays.length) return false;
      const byId = {};
      (this.league.results || []).forEach((r) => { if (r?.id) byId[r.id] = r; });
      return matchdays.every((md) => {
        const matches = md.matches || [];
        if (!matches.length) return false;
        return matches.every((m, i) => {
          const r = byId[matchDocId(md.day, i, this.league.season)];
          return !!r && (r.battles || []).some((b) => b && b.done);
        });
      });
    },
    // Wie viele Spiele noch fehlen, bis die Saison-Awards starten.
    get openMatches() {
      const byId = {};
      (this.league.results || []).forEach((r) => { if (r?.id) byId[r.id] = r; });
      let open = 0;
      (this.league.schedule?.matchdays || []).forEach((md) => {
        (md.matches || []).forEach((m, i) => {
          const r = byId[matchDocId(md.day, i, this.league.season)];
          if (!r || !(r.battles || []).some((b) => b && b.done)) open += 1;
        });
      });
      return open;
    },
    // Spieltag-Awards erst ab dem Spieltag, an dem das Feature live ging.
    get awardDays() {
      return awardableDays(this.playedDays);
    },
    get firstAwardDay() { return MATCHDAY_AWARDS_FROM; },
    get skippedDays() {
      return this.playedDays.filter((d) => d < MATCHDAY_AWARDS_FROM).length;
    },

    // Alle Abstimmungen, die es geben kann: Spieltag-Awards je gespieltem Spieltag,
    // Saison-Awards erst nach dem letzten Spieltag (Team-MVP je Team).
    get allInstances() {
      const out = [];
      [...this.awardDays].reverse().forEach((day) => {
        MATCHDAY_AWARDS.forEach((a) => out.push(this.store.instance({ key: a.key, day })));
      });
      if (this.seasonComplete) {
        SEASON_AWARDS.forEach((a) => {
          if (a.perTeam) this.league.seasonTeams.forEach((t) => out.push(this.store.instance({ key: a.key, teamId: t.id })));
          else out.push(this.store.instance({ key: a.key }));
        });
      }
      return out;
    },
    get openInstances() { return this.allInstances.filter((i) => i.status !== 'done'); },
    get doneInstances() {
      return this.allInstances
        .filter((i) => i.status === 'done')
        .map((i) => ({ inst: i, winners: this.winnerCards(i), rows: voteResults(i) }));
    },
    // Sieger einer Abstimmung fürs Anzeigen aufbereiten (mit beiden Duo-Sprites).
    winnerCards(inst) {
      return awardWinners(inst).map((w) => ({
        ...w,
        label: w.label || w.id,
        images: Array.isArray(w.images) && w.images.length
          ? w.images
          : (inst.entity === 'pair'
            ? String(w.id).split(' + ').map((n) => this.monImage(n.trim())).filter(Boolean)
            : [w.image || this.monImage(w.id)].filter(Boolean)),
      }));
    },
    // Was noch kommt: nicht gespielte Spieltage und — solange die Saison läuft —
    // die Saison-Awards.
    get upcoming() {
      const out = [];
      this.scheduleDays.filter((d) => !this.playedDays.includes(d) && d >= MATCHDAY_AWARDS_FROM).forEach((day) => {
        MATCHDAY_AWARDS.forEach((a) => out.push({ key: a.key, title: a.label, when: `Spieltag ${day}`, why: 'sobald Ergebnisse erfasst sind' }));
      });
      if (!this.seasonComplete) {
        SEASON_AWARDS.forEach((a) => out.push({
          key: a.key,
          title: a.label,
          when: a.perTeam ? `Saison 1 · ${this.league.seasonTeams.length} Abstimmungen` : 'Saison 1',
          why: 'nach dem letzten Spieltag',
        }));
      }
      return out;
    },

    subtitle(inst) {
      if (inst.day != null) return `Spieltag ${inst.day}`;
      if (inst.teamId) return this.teamById(inst.teamId)?.name || 'Team';
      return 'Saison 1';
    },
    // Zustand aus Sicht des eigenen Spielers.
    stateOf(inst) {
      const me = this.me;
      if (inst.status === 'done') return inst.seen?.[me] ? 'seen' : 'ceremony';
      if (inst.status === 'voting') return hasVoted(inst, me) ? 'waitVote' : 'vote';
      return inst.confirmed?.[me] ? 'waitNom' : 'nominate';
    },
    stateLabel(inst) {
      const other = this.store.other;
      return {
        nominate: 'Nominieren',
        waitNom: `Wartet auf ${other}`,
        vote: 'Abstimmen',
        waitVote: `Wartet auf ${other}`,
        ceremony: 'Siegerehrung',
        seen: 'Ergebnis ansehen',
      }[this.stateOf(inst)];
    },
    stateColor(inst) {
      return {
        nominate: '#ffcb05',
        waitNom: '#98a2b3',
        vote: '#e3350d',
        waitVote: '#98a2b3',
        ceremony: '#63bc5a',
        seen: '#98a2b3',
      }[this.stateOf(inst)];
    },
    // Kurzinfo unter dem Award-Namen.
    stateHint(inst) {
      const mine = (inst.nominations?.[this.me] || []).length;
      const theirs = (inst.nominations?.[this.store.other] || []).length;
      if (inst.status === 'nominating') return `${mine} von dir nominiert · ${theirs} von ${this.store.other}`;
      if (inst.status === 'voting') {
        const n = mergedOptions(inst).length;
        return `Abstimmung läuft · ${n} ${n === 1 ? 'Option' : 'Optionen'}`;
      }
      return 'Beide Stimmen liegen vor';
    },
    actOn(inst) {
      const st = this.stateOf(inst);
      if (st === 'nominate' || st === 'waitNom') return this.openNominate(inst);
      if (st === 'vote') return this.openVote(inst);
      if (st === 'waitVote') return this.openVote(inst);
      return this.openCeremony(inst);
    },

    // --- Optionen, die nominiert werden können ---
    monUniverse(inst) {
      const league = this.league;
      let names = [];
      if (inst.day != null) {
        const set = new Set();
        (league.results || []).filter((r) => r.day === inst.day).forEach((r) => {
          ['home', 'away'].forEach((side) => (r.squads?.[side] || []).forEach((n) => set.add(n)));
        });
        names = [...set];
      } else if (inst.teamId) {
        names = (this.teamById(inst.teamId)?.pokemon || []).map((p) => p.name);
      } else {
        const set = new Set();
        (league.teams || []).forEach((t) => (t.pokemon || []).forEach((p) => set.add(p.name)));
        (league.results || []).forEach((r) => ['home', 'away'].forEach((side) => (r.squads?.[side] || []).forEach((n) => set.add(n))));
        names = [...set];
      }
      const def = inst.def || {};
      let mons = names.map((n) => league.pokemon.find((p) => p.name === n) || { name: n });
      if (def.tier) mons = mons.filter((m) => m.tier === def.tier);
      if (def.filter === 'mega') mons = mons.filter((m) => isMega(m.name));
      if (def.filter === 'nomega') mons = mons.filter((m) => !isMega(m.name));
      return mons.sort((a, b) => a.name.localeCompare(b.name));
    },
    monTeamName(name) {
      const t = this.league.teams.find((x) => (x.pokemon || []).some((p) => p.name === name));
      return t?.name || 'Frei';
    },
    optionsFor(inst) {
      if (inst.entity === 'team') {
        return this.league.seasonTeams.map((t) => ({ id: t.id, label: t.name, image: this.logoUrl(t.logo), sub: t.player }));
      }
      if (inst.entity === 'match') {
        return (this.league.results || [])
          .filter((r) => (r.battles || []).some((b) => b && b.done))
          .sort((a, b) => (a.day || 0) - (b.day || 0))
          .map((r) => {
            const h = this.teamById(r.home);
            const a = this.teamById(r.away);
            return {
              id: r.id,
              label: `${h?.name || '?'} vs ${a?.name || '?'}`,
              image: h ? this.logoUrl(h.logo) : '',
              sub: `Spieltag ${r.day}`,
            };
          });
      }
      return this.monUniverse(inst).map((m) => ({
        id: m.name, label: m.name, image: m.image || '', sub: this.monTeamName(m.name),
      }));
    },
    get dialogOptions() {
      if (!this.dialog) return [];
      const q = this.q.trim().toLowerCase();
      const list = this.optionsFor(this.dialog.inst);
      return q ? list.filter((o) => o.label.toLowerCase().includes(q) || (o.sub || '').toLowerCase().includes(q)) : list;
    },

    // --- Nominierungs-Dialog ---
    openNominate(inst) {
      this.dialog = { mode: 'nominate', inst };
      this.draft = [...(inst.nominations?.[this.me] || [])];
      this.pair = [];
      this.q = '';
      this.$nextTick(() => document.getElementById('award-nominate')?.showPopover());
    },
    closeDialog() {
      ['award-nominate', 'award-vote'].forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.matches(':popover-open')) el.hidePopover();
      });
      this.dialog = null;
    },
    get draftFull() { return this.draft.length >= MAX_NOMINATIONS; },
    isDrafted(id) { return this.draft.some((d) => d.id === id); },
    isPaired(id) { return this.pair.some((p) => p.id === id); },
    // Auswahl umschalten. Duo-Awards sammeln zwei Pokémon zu einer Option.
    toggleDraft(opt) {
      const inst = this.dialog?.inst;
      if (!inst) return;
      if (inst.entity === 'pair') {
        if (this.isPaired(opt.id)) { this.pair = this.pair.filter((p) => p.id !== opt.id); return; }
        const next = [...this.pair, opt];
        if (next.length < 2) { this.pair = next; return; }
        const id = optionId('pair', next.map((p) => p.id));
        this.pair = [];
        if (this.draft.some((d) => d.id === id) || this.draftFull) return;
        // Beide Sprites merken, damit die Siegerehrung das Duo auch als Duo zeigt.
        this.draft = [...this.draft, {
          id, label: id, sub: 'Duo',
          image: next[0].image || '',
          images: next.map((p) => p.image || '').filter(Boolean),
        }];
        return;
      }
      if (this.isDrafted(opt.id)) { this.draft = this.draft.filter((d) => d.id !== opt.id); return; }
      if (this.draftFull) return;
      this.draft = [...this.draft, { id: opt.id, label: opt.label, image: opt.image || '', sub: opt.sub || '' }];
    },
    removeDraft(id) { this.draft = this.draft.filter((d) => d.id !== id); },

    async confirmNoms() {
      if (this.busy || !this.dialog) return;
      this.busy = true;
      try {
        await this.store.confirmNominations(this.dialog.inst, this.draft);
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `Nominierungen bestätigt — jetzt fehlt ${this.store.other}.` } }));
        this.closeDialog();
      } catch (e) { console.error(e); }
      this.busy = false;
    },
    async startVote() {
      if (this.busy || !this.dialog) return;
      this.busy = true;
      try {
        await this.store.startVoting(this.dialog.inst, this.draft);
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Abstimmung gestartet.' } }));
        this.closeDialog();
      } catch (e) { console.error(e); }
      this.busy = false;
    },

    // --- Abstimmungs-Dialog ---
    openVote(inst) {
      this.dialog = { mode: 'vote', inst };
      const own = inst.votes?.[this.me] || {};
      const opts = mergedOptions(inst);
      this.votes = Object.fromEntries(opts.map((o) => [o.id, Number.isFinite(own[o.id]) ? own[o.id] : 5]));
      this.$nextTick(() => document.getElementById('award-vote')?.showPopover());
    },
    get voteOptions() {
      return this.dialog ? mergedOptions(this.dialog.inst) : [];
    },
    setVote(id, value) {
      this.votes = { ...this.votes, [id]: Math.max(0, Math.min(10, Math.round(Number(value) || 0))) };
    },
    voteColor(v) {
      if (v >= 8) return '#63bc5a';
      if (v >= 5) return '#ffcb05';
      if (v >= 3) return '#ff9d55';
      return '#98a2b3';
    },
    get myVoteDone() {
      return this.dialog ? hasVoted(this.dialog.inst, this.me) : false;
    },
    async submitVote() {
      if (this.busy || !this.dialog) return;
      this.busy = true;
      try {
        await this.store.submitVotes(this.dialog.inst, this.votes);
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Bewertung abgeschickt.' } }));
        this.closeDialog();
      } catch (e) { console.error(e); }
      this.busy = false;
    },

    // --- Siegerehrung ---
    openCeremony(inst) {
      // Nur Pokémon-Awards führen zu einer Detailseite — Team- und Match-Awards
      // zeigen zwar Logos, aber kein Pokémon.
      const entity = inst.def?.entity || inst.entity;
      const monsOf = (r) => {
        if (entity === 'pokemon') return [r.id];
        if (entity === 'pair') return String(r.id).split(' + ').map((n) => n.trim()).filter(Boolean);
        return [];
      };
      const rows = voteResults(inst).map((r) => ({
        ...r,
        label: r.label || r.id,
        image: r.image || this.monImage(r.id) || '',
        // Duo-Awards tragen zwei Sprites; ältere Nominierungen werden aus dem
        // Namen („A + B") nachgeladen.
        images: Array.isArray(r.images) && r.images.length
          ? r.images
          : (inst.entity === 'pair'
            ? String(r.id).split(' + ').map((n) => this.monImage(n.trim())).filter(Boolean)
            : []),
        mons: monsOf(r),
      }));
      if (!rows.length) return;
      const note = spoilerNote(inst, this.me);
      const pop = document.getElementById('award-ceremony');
      if (!pop) return;
      this._cer?.stop?.();
      pop.showPopover();
      this._cer = runCeremony(pop, {
        title: inst.def?.label || inst.key,
        subtitle: this.subtitle(inst),
        accent: awardColor(inst.key),
        medalSvg: this.store.medalHtml(inst.key),
        rows,
        note,
      }, {
        onDone: () => { this.store.markSeen(inst).catch((e) => console.error(e)); },
        onClose: () => this.closeCeremony(),
        onPickMon: (name) => { this.closeCeremony(); this.goMon(name); },
      });
    },
    closeCeremony() {
      this._cer?.stop?.();
      this._cer = null;
      const pop = document.getElementById('award-ceremony');
      if (pop && pop.matches(':popover-open')) pop.hidePopover();
    },

    // Einzelnes Siegel als Pin (unabhängig vom Sieger-Index — hier ist der
    // Gewinner ja gerade das Thema der Karte).
    pinSvg(inst) {
      return this.store._slot({ key: inst.key, day: inst.day, teamId: inst.teamId });
    },
    fmtAvg(v) { return (Math.round((Number(v) || 0) * 10) / 10).toFixed(1).replace('.', ','); },
    goMon(name) { this.$dispatch('navigate', { key: 'pokemon', pokemonName: name }); },
    goTeam(id) { this.$dispatch('navigate', { key: 'teams', teamId: id }); },
    info(title, text) { openStatInfo(null, title, text); },
  };
}

window.Alpine = Alpine;

// === Presse-Ansicht =========================================================
// Zwei Reiter: „Newsroom" (filterbares Listing) und „Termine" (Interviews und
// Pressekonferenzen). Das Zahnrad oben rechts öffnet die Redaktionseinstellungen.
function presseView() {
  return {
    tab: 'newsroom',
    fCat: '',
    fTeam: '',
    q: '',
    openId: null,
    composer: null,
    commission: null,
    settings: null,
    stage: null,
    pickTeam: null,
    busySlot: null,
    // Modellwahl für den nächsten Anlauf, je gescheitertem Beitrag bzw. Termin.
    // Bewusst nur in der Ansicht: sie überlebt keinen Wechsel und ändert die
    // Voreinstellung im Zahnrad nicht.
    retryModels: {},

    init() {
      const saved = loadJson(PRESS_FILTER_KEY);
      this.fCat = saved.category || '';
      this.fTeam = saved.teamId || '';
      // Elo fließt in die Metadaten ein — beim Öffnen der Presse einmalig nachladen.
      this.$store.elo?.ensureLoaded?.();
      this.pickTeam = this.defaultTeamId();
      const nav = this.$store.nav;
      if (nav?.teamId) { this.fTeam = nav.teamId; this.pickTeam = nav.teamId; nav.teamId = null; }
    },

    get press() { return this.$store.press; },
    get league() { return this.$store.league; },
    get loaded() {
      return this.league.teamsLoaded && this.league.scheduleLoaded && this.league.resultsLoaded && this.press.articlesLoaded;
    },
    get categories() { return PRESS_CATEGORIES; },
    get authors() { return PRESS_AUTHORS; },

    teamById(id) { return this.league.teams.find((t) => t.id === id) || null; },
    logoUrl(file) { return `./img/teams/${file}`; },
    teamLogo(id) {
      const t = this.teamById(id);
      return t ? this.logoUrl(t.logo) : '';
    },
    playerColor(player) { return player === 'Henrik' ? '#4d90d5' : '#e3350d'; },
    monImage(name) { return this.league.pokemon.find((p) => p.name === name)?.image || ''; },
    author(id) { return authorById(id); },
    catLabel(key) { return categoryLabel(key); },
    catColor(key) { return categoryColor(key); },
    catsOf(article) { return categoriesOf(article); },
    fmtDate(iso) { return formatDate(iso); },
    fmtDateTime(iso) { return formatDateTime(iso); },
    defaultTeamId() {
      const mine = this.$store.auth.myTeams;
      return (mine[0] || this.league.seasonTeams[0])?.id || null;
    },

    // --- Newsroom ------------------------------------------------------------
    persistFilters() {
      saveJson(PRESS_FILTER_KEY, { category: this.fCat, teamId: this.fTeam });
    },
    setCat(key) {
      this.fCat = this.fCat === key ? '' : key;
      this.persistFilters();
    },
    setTeamFilter(id) {
      this.fTeam = id;
      this.persistFilters();
    },
    clearFilters() {
      this.fCat = '';
      this.fTeam = '';
      this.q = '';
      this.persistFilters();
    },
    get hasFilters() { return !!(this.fCat || this.fTeam || this.q.trim()); },
    get feed() {
      return sortArticles(this.press.articles)
        .filter((a) => articleMatchesFilter(a, { category: this.fCat, teamId: this.fTeam, q: this.q }));
    },
    countFor(key) {
      return this.press.articles.filter((a) => articleMatchesFilter(a, { category: key, teamId: this.fTeam })).length;
    },
    excerptOf(a) { return excerpt(a, 200); },
    minutesOf(a) { return readingMinutes(a); },
    // Der oberste Beitrag bekommt die große Aufmachung — aber nur ungefiltert.
    get lead() {
      return !this.hasFilters && this.feed.length ? this.feed[0] : null;
    },
    get rest() {
      return this.lead ? this.feed.slice(1) : this.feed;
    },

    openArticle(id) {
      this.openId = id;
      this.$nextTick(() => document.getElementById('press-article')?.showPopover());
    },
    closeArticle() {
      const el = document.getElementById('press-article');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.openId = null;
    },
    get article() { return this.openId ? this.press.byId(this.openId) : null; },
    // Der Textkörper mit aufgelösten Bausteinen. Aufgelöst wird beim Anzeigen, damit
    // eine Marktwertkachel den heutigen Stand zeigt und nicht den vom Redaktionstag.
    get articleBody() {
      const a = this.article;
      if (!a) return '';
      const l = this.league;
      return renderTiles(a.body || '', {
        pokedex: l.pokemon,
        eloIndex: this.$store.elo.index(),
        teams: l.teams,
        results: l.allResults,
        logoBase: './img/teams/',
        squadValue: (team) => squadMarketValue(team.pokemon || [], this.$store.elo.index()),
      });
    },
    goTeam(id) {
      this.closeArticle();
      this.$dispatch('navigate', { key: 'teams', teamId: id });
    },
    goMon(name) {
      this.closeArticle();
      this.$dispatch('navigate', { key: 'pokemon', pokemonName: name });
    },
    goMatch(matchId) {
      this.closeArticle();
      this.$dispatch('navigate', { key: 'spieltag', matchId });
    },
    async removeArticle(id) {
      if (!id) return;
      this.closeArticle();
      await this.press.deleteArticle(id);
    },

    // --- Redaktioneller Beitrag ---------------------------------------------
    // Das Bearbeitungsfeld ist ein natives contenteditable. Der Textkörper wird
    // NICHT über $refs nachgereicht (das ging auf Mobilgeräten schief, wenn das
    // Popover später aufging), sondern direkt beim Anlegen des Elements gesetzt —
    // siehe hydrateEditor(), aufgerufen aus x-init am Editor selbst.
    openComposer(existing = null) {
      this.closeArticle();
      const cats = categoriesOf(existing || {});
      this.composer = {
        id: existing?.id || null,
        title: existing?.title || '',
        subtitle: existing?.subtitle || '',
        categories: cats.length ? cats : ['redaktion'],
        authorId: existing?.authorId || PRESS_AUTHORS[0].id,
        teamIds: [...(existing?.teamIds || [])],
        day: existing?.day ?? this.latestDay,
        body: existing?.body || '',
        imageSelected: false,
        saving: false,
      };
      this._rteImage = null;
      this.$nextTick(() => document.getElementById('press-composer')?.showPopover());
    },
    // Wird vom Editor-Element selbst aufgerufen, sobald es im DOM steht.
    hydrateEditor(el) {
      if (!el || !this.composer) return;
      el.innerHTML = this.composer.body || '<p><br></p>';
      // Ohne Absatztrenner erzeugen manche Browser beim Enter nur ein <br> —
      // dann entstünde nie ein neuer Absatz.
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
    },
    // Jede Eingabe sofort in den Entwurf spiegeln: so kann der Text auch dann nicht
    // verloren gehen, wenn das Feld zwischendurch neu aufgebaut wird.
    syncEditor(el) {
      if (this.composer && el) this.composer.body = el.innerHTML;
    },
    closeComposer() {
      const el = document.getElementById('press-composer');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.composer = null;
      this._rteImage = null;
    },
    toggleComposerTeam(id) {
      const arr = this.composer.teamIds;
      const i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1);
      else arr.push(id);
    },
    // --- Rubriken (mehrere je Beitrag) ---
    get composerCategories() { return manualCategories(); },
    hasComposerCat(key) { return (this.composer?.categories || []).includes(key); },
    toggleComposerCat(key) {
      if (!this.composer) return;
      const arr = [...this.composer.categories];
      const i = arr.indexOf(key);
      if (i >= 0) arr.splice(i, 1);
      else arr.push(key);
      // Ohne Rubrik geht es nicht — die zuletzt entfernte bleibt dann stehen.
      this.composer.categories = arr.length ? arr : [key];
    },
    get composerValid() {
      return !!this.composer && this.composer.title.trim().length > 1;
    },
    // Der Editor nutzt das native contenteditable; execCommand ist dafür weiterhin
    // der einzige Weg ohne eigene Selection-Verwaltung.
    rte(cmd, value = null) {
      this.$refs.editor?.focus();
      document.execCommand(cmd, false, value);
      this.syncEditor(this.$refs.editor);
    },
    rteBlock(tag) {
      this.rte('formatBlock', tag);
    },
    // Enter in einem Textknoten ohne Blockumgebung erzeugt sonst nur ein <br>.
    // Ein vorgeschalteter Absatz sorgt dafür, dass ein einzelnes Enter reicht.
    rteEnter(event) {
      if (event.shiftKey) return;
      let block = '';
      try { block = document.queryCommandValue('formatBlock') || ''; } catch (e) {}
      if (!block || block.toLowerCase() === 'div') {
        try { document.execCommand('formatBlock', false, 'p'); } catch (e) {}
      }
    },
    rteLink() {
      const url = window.prompt('Ziel-Adresse des Links:', 'https://');
      if (url) this.rte('createLink', url);
    },
    rteImage() {
      const url = window.prompt('Bild-Adresse (URL):', 'https://');
      if (url) this.rte('insertImage', url);
    },
    // Ein Klick auf ein Bild wählt es aus; die Breite lässt sich danach über die
    // Leiste setzen. Der DOM-Knoten liegt bewusst außerhalb des reaktiven Zustands.
    rtePick(event) {
      const img = event.target?.tagName === 'IMG' ? event.target : null;
      this._rteImage = img;
      if (this.composer) this.composer.imageSelected = !!img;
    },
    rteImageWidth(pct) {
      const img = this._rteImage;
      if (!img) return;
      img.setAttribute('style', `width:${Math.min(100, Math.max(5, pct))}%`);
      this.syncEditor(this.$refs.editor);
    },
    rteImageDrop() {
      const img = this._rteImage;
      if (!img) return;
      img.remove();
      this._rteImage = null;
      if (this.composer) this.composer.imageSelected = false;
      this.syncEditor(this.$refs.editor);
    },
    async saveComposer() {
      if (!this.composerValid || this.composer.saving) return;
      this.composer.saving = true;
      try {
        const id = await this.press.publishEditorial({
          ...this.composer,
          category: this.composer.categories[0],
          body: this.$refs.editor?.innerHTML || this.composer.body,
        });
        this.closeComposer();
        this.openArticle(id);
      } catch (e) {
        console.error('Beitrag konnte nicht veröffentlicht werden:', e);
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Der Beitrag konnte nicht gespeichert werden.' } }));
        if (this.composer) this.composer.saving = false;
      }
    },

    // --- Termine -------------------------------------------------------------
    get latestDay() {
      const days = (this.league.results || []).filter((r) => isMatchComplete(r)).map((r) => r.day);
      return days.length ? Math.max(...days) : null;
    },
    get teamsForPicker() { return this.league.seasonTeams; },
    get bonusDay() { return BONUS_ROUND_DAY; },
    get pressFromDay() { return PRESS_FROM_DAY; },
    get bonusProgress() {
      return bonusRoundProgress(this.league.seasonTeams.map((t) => t.id), this.league.schedule, this.press.sessions);
    },
    get bonusComplete() {
      return bonusRoundComplete(this.league.seasonTeams.map((t) => t.id), this.league.schedule, this.press.sessions);
    },
    bonusOpenFor(teamId) {
      return bonusSlotsFor(teamId, this.league.schedule, this.press.sessions).filter((r) => !r.done).length;
    },
    // Termine, die für ein Team gerade offen sind — Grundlage des Indikators
    // an der Teamauswahl.
    pendingFor(teamId) {
      return pressSlots(teamId, this.league.schedule, this.league.results, this.press.sessions, this.bonusComplete)
        .filter((row) => row.open && this.press.sessionById(row.id)?.status !== 'done')
        .length;
    },
    // Auftreten darf nur, wem das Team gehört.
    ownsTeamId(teamId) { return this.$store.auth.ownsTeamId(teamId); },
    get ownsPickTeam() { return this.ownsTeamId(this.pickTeam); },
    get pickTeamPlayer() { return this.teamById(this.pickTeam)?.player || ''; },
    get slots() {
      if (!this.pickTeam) return [];
      return pressSlots(this.pickTeam, this.league.schedule, this.league.results, this.press.sessions, this.bonusComplete);
    },
    // Anstehend zuerst: offene Termine ohne Sitzung, danach laufende, dann erledigte.
    get slotGroups() {
      const bonus = [];
      const open = [];
      const done = [];
      const later = [];
      const outlook = [];
      this.slots.forEach((s) => {
        const session = this.press.sessionById(s.id);
        const row = { ...s, session };
        if (s.slot === 'outlook' && session?.status !== 'done') outlook.push(row);
        else if (s.slot === 'bonus' && session?.status !== 'done') bonus.push(row);
        else if (!s.open) later.push(row);
        else if (session?.status === 'done') done.push(row);
        else open.push(row);
      });
      return [
        { key: 'outlook', label: 'Nach der Saison · vor Transfer und Draft', rows: outlook },
        { key: 'bonus', label: `Auftaktrunde vor Spieltag ${BONUS_ROUND_DAY}`, rows: bonus },
        { key: 'open', label: 'Jetzt dran', rows: open.reverse() },
        { key: 'later', label: 'Noch gesperrt', rows: later },
        { key: 'done', label: 'Erledigt', rows: done.reverse() },
      ].filter((g) => g.rows.length);
    },
    slotLabel(slot) { return slotLabel(slot); },
    typeLabel(type) { return typeLabel(type); },
    slotSubtitle(row) {
      if (!row) return '';
      if (row.slot === 'outlook') return `Ausblick · ${OUTLOOK_QUESTIONS} Fragen zu Bilanz, Transfer und Draft`;
      if (row.slot === 'bonus') return `Auftaktrunde · Bilanz und Ausblick vor Spieltag ${row.day}`;
      const opp = this.teamById(row.opponentId)?.name || '?';
      return `Spieltag ${row.day} · ${slotLabel(row.slot)} · ${row.home ? 'gegen' : 'bei'} ${opp}`;
    },
    blockedHint(row) {
      if (row.open) return '';
      if (row.blockedBy === 'season') return 'Frei, sobald jede Partie der Saison ein vollständiges Ergebnis hat.';
      if (row.blockedBy === 'bonus') return `Frei, sobald alle Teams die Auftaktrunde hinter sich haben – erst dann beginnt Spieltag ${BONUS_ROUND_DAY}.`;
      return row.slot === 'pre'
        ? 'Frei, sobald die Partie davor im Spielplan ein Ergebnis hat.'
        : 'Frei, sobald das eigene Match komplett eingetragen ist.';
    },

    get currentTrainerOf() {
      const t = this.teamById(this.pickTeam);
      return currentTrainer(t?.trainers || []);
    },
    rosterOf(teamId) {
      return this.teamById(teamId)?.pokemon || [];
    },

    // --- Bühne (Interview / Pressekonferenz) ---------------------------------
    beginSlot(row) {
      if (!row.open) return;
      const session = this.press.sessionById(row.id);
      if (session?.status === 'done' && session.articleId) return this.openArticle(session.articleId);
      if (!this.ownsTeamId(row.teamId)) return;
      this.stage = {
        slot: row,
        phase: session?.status === 'open' ? 'ask' : session?.status === 'error' ? 'error' : 'role',
        index: 0,
        answers: [],
        custom: '',
        writing: false,
        articleId: null,
      };
      if (session?.status === 'generating' || session?.status === 'writing') this.stage.phase = 'wait';
      this.$nextTick(() => document.getElementById('press-stage')?.showPopover());
    },
    closeStage() {
      const el = document.getElementById('press-stage');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.stage = null;
    },
    get session() {
      return this.stage ? this.press.sessionById(this.stage.slot.id) : null;
    },
    get stageAuthors() {
      return (this.session?.authorIds || []).map((id) => authorById(id));
    },
    get stageQuestion() {
      return this.session?.questions?.[this.stage?.index || 0] || null;
    },
    get stageAsker() {
      return this.stageQuestion ? authorById(this.stageQuestion.authorId) : authorById(this.session?.authorIds?.[0]);
    },
    // Rollen zur Auswahl: Trainer zuerst, danach der Kader. Die Pressekonferenz
    // richtet sich grundsätzlich an den Trainer.
    get roleOptions() {
      const team = this.teamById(this.stage?.slot?.teamId);
      const out = [];
      const tr = currentTrainer(team?.trainers || []);
      if (tr) out.push({ kind: 'trainer', name: tr.name, image: tr.image || '', traits: tr.traits || [] });
      if (this.stage?.slot?.type !== 'pk') {
        (team?.pokemon || []).forEach((p) => out.push({ kind: 'pokemon', name: p.name, image: p.image || '', traits: [] }));
      }
      return out;
    },
    async chooseRole(role) {
      if (!this.stage) return;
      this.stage.phase = 'wait';
      const id = await this.press.startSession(this.stage.slot, role);
      if (!this.stage) return;
      this.stage.phase = id ? 'ask' : 'error';
      this.stage.index = 0;
      this.stage.answers = [];
    },
    answerWith(option) {
      this.pushAnswer({ text: option.text, stance: option.stance, custom: false });
    },
    answerCustom() {
      const text = (this.stage.custom || '').trim();
      if (text.length < 2) return;
      this.pushAnswer({ text, stance: null, custom: true });
    },
    async pushAnswer(answer) {
      const q = this.stageQuestion;
      if (!q || !this.stage) return;
      this.stage.answers = [...this.stage.answers.filter((a) => a.questionId !== q.id), { questionId: q.id, ...answer }];
      this.stage.custom = '';
      if (this.stage.index < (this.session?.questions?.length || 3) - 1) {
        this.stage.index += 1;
        return;
      }
      this.stage.phase = 'writing';
      const articleId = await this.press.submitAnswers(this.stage.slot.id, this.stage.answers);
      if (!this.stage) return;
      if (articleId) {
        this.stage.articleId = articleId;
        this.stage.phase = 'done';
      } else {
        this.stage.phase = 'error';
      }
    },
    stageBack() {
      if (this.stage && this.stage.index > 0) this.stage.index -= 1;
    },
    answerFor(qid) {
      return this.stage?.answers.find((a) => a.questionId === qid) || null;
    },
    readStageArticle() {
      const id = this.stage?.articleId || this.session?.articleId;
      this.closeStage();
      if (id) this.openArticle(id);
    },
    // Denselben Termin noch einmal versuchen: liegen die Antworten schon vor, wird
    // nur der Beitrag neu geschrieben — niemand soll fünf Fragen zweimal beantworten.
    async retryStageNow() {
      if (!this.stage) return;
      const id = this.stage.slot.id;
      const model = this.retryModelFor(id);
      const hasAnswers = (this.session?.answers || []).length > 0;
      this.stage.phase = hasAnswers ? 'writing' : 'wait';
      const out = await this.press.retrySession(id, model);
      if (!this.stage) return;
      const s = this.press.sessionById(id);
      if (s?.status === 'done') {
        this.stage.articleId = out || s.articleId;
        this.stage.phase = 'done';
      } else if (s?.status === 'open') {
        this.stage.phase = 'ask';
        this.stage.index = 0;
        this.stage.answers = [];
      } else {
        this.stage.phase = 'error';
      }
    },
    // Der harte Weg: Termin verwerfen und bei der Rollenwahl neu beginnen.
    async retryStage() {
      if (!this.stage) return;
      await this.press.resetSession(this.stage.slot.id);
      this.stage.phase = 'role';
      this.stage.index = 0;
      this.stage.answers = [];
    },

    // --- Einstellungen (Zahnrad) --------------------------------------------
    get promptDefs() { return PROMPT_DEFS; },
    get models() { return GEMINI_MODELS; },
    openSettings() {
      const p = this.press.prompts;
      this.settings = {
        tab: this.press.hasKey ? 'prompts' : 'zugang',
        key: this.press.apiKey,
        model: this.press.model,
        promptKey: PROMPT_DEFS[0].key,
        prompts: Object.fromEntries(PROMPT_DEFS.map((d) => [d.key, p[d.key] || ''])),
        testing: false,
        testMsg: '',
        testOk: false,
        saving: false,
        backfilling: false,
      };
      this.$nextTick(() => document.getElementById('press-settings')?.showPopover());
    },
    closeSettings() {
      const el = document.getElementById('press-settings');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.settings = null;
    },
    saveAccess() {
      this.press.saveAccess(this.settings.key, this.settings.model);
      this.settings.testMsg = 'Gespeichert.';
    },
    async testAccess() {
      if (!this.settings || this.settings.testing) return;
      const key = String(this.settings.key || '').trim();
      if (!key) {
        this.settings.testOk = false;
        this.settings.testMsg = 'Bitte zuerst einen Schlüssel eintragen.';
        return;
      }
      this.settings.testing = true;
      this.settings.testMsg = '';
      try {
        await testKey({ apiKey: key, model: this.settings.model });
        this.settings.testOk = true;
        this.settings.testMsg = 'Verbindung steht.';
      } catch (e) {
        // Der Wortlaut der API steht bewusst mit in der Meldung — ohne ihn lässt sich
        // ein abgelehnter Schlüssel nicht von einer nicht freigeschalteten API unterscheiden.
        this.settings.testOk = false;
        this.settings.testMsg = e?.message || 'Verbindung fehlgeschlagen.';
        console.error('Gemini-Verbindungstest fehlgeschlagen:', e?.status || '', e?.message || e, e?.detail || '');
      }
      this.settings.testing = false;
    },
    resetPrompt(key) {
      this.settings.prompts[key] = DEFAULT_PROMPTS[key];
    },
    isPromptChanged(key) {
      return (this.settings?.prompts?.[key] || '') !== DEFAULT_PROMPTS[key];
    },
    async savePrompts() {
      if (!this.settings || this.settings.saving) return;
      this.settings.saving = true;
      try {
        await this.press.savePrompts(this.settings.prompts);
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Redaktionsaufträge gespeichert.' } }));
      } catch (e) {
        console.error('Prompts speichern fehlgeschlagen:', e);
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Speichern fehlgeschlagen.' } }));
      }
      this.settings.saving = false;
    },
    get missingReports() {
      return this.press.missingReports.map((r) => ({
        id: r.id,
        day: r.day,
        label: `${this.teamById(r.home)?.name || '?'} vs ${this.teamById(r.away)?.name || '?'}`,
      }));
    },
    get awaitingRelease() {
      return this.press.awaitingRelease.map((r) => ({
        id: r.id,
        day: r.day,
        label: `${this.teamById(r.home)?.name || '?'} vs ${this.teamById(r.away)?.name || '?'}`,
      }));
    },
    // Einen einzelnen Saison-/Pausenbeitrag von Hand anstoßen.
    writeSeasonPiece(row) {
      if (row.kind === 'review') return this.press.generateSeasonReview({ force: true });
      if (row.kind === 'team') return this.press.generateTeamReview(row.teamId, { force: true });
      return this.press.generateOffseasonArticle(row.index, { force: true });
    },
    async backfillReports() {
      if (!this.settings || this.settings.backfilling) return;
      this.settings.backfilling = true;
      // Bewusst nacheinander: das schont das Kontingent und hält die Reihenfolge der
      // Geschichten chronologisch.
      for (const row of [...this.press.missingReports]) {
        await this.press.generateReport(row.id);
      }
      if (this.settings) this.settings.backfilling = false;
    },
    // --- Auftragsbeitrag ----------------------------------------------------
    openCommission() {
      this.closeArticle();
      this.commission = {
        brief: '',
        teamIds: this.fTeam ? [this.fTeam] : [],
        authorId: '',
        day: this.latestDay ?? null,
        busy: false,
        error: '',
      };
      this.$nextTick(() => document.getElementById('press-commission')?.showPopover());
    },
    closeCommission() {
      if (this.commission?.busy) return;
      const el = document.getElementById('press-commission');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.commission = null;
    },
    toggleCommissionTeam(id) {
      if (!this.commission) return;
      const has = this.commission.teamIds.includes(id);
      this.commission.teamIds = has
        ? this.commission.teamIds.filter((t) => t !== id)
        : [...this.commission.teamIds, id];
    },
    async sendCommission() {
      const c = this.commission;
      if (!c || c.busy || String(c.brief || '').trim().length < 8) return;
      c.busy = true;
      c.error = '';
      const id = await this.press.commissionArticle({
        brief: c.brief,
        teamIds: c.teamIds,
        authorId: c.authorId || null,
        day: Number.isFinite(c.day) ? c.day : null,
      });
      if (!this.commission) return;
      this.commission.busy = false;
      if (!id) {
        this.commission.error = this.press.lastError || 'Der Beitrag ist nicht zustande gekommen.';
        return;
      }
      this.closeCommission();
      this.openArticle(id);
    },

    // --- Dauerhafte Referenz ------------------------------------------------
    isReference(a) { return this.press.isReferenceArticle(a); },
    async toggleReference(a) {
      if (!a?.id) return;
      // Was ohnehin als Referenz gilt (Redaktion der Spieler, Saison-Rückblick),
      // lässt sich nicht abwählen — dort ist der Schalter nur eine Anzeige.
      await this.press.setReference(a.id, !a.reference);
    },

    // --- Wiederholung nach einem Fehlschlag ---------------------------------
    modelLabel(id) { return this.press.modelLabel(id); },
    // Womit wurde es versucht? Beitrag und Termin merken es sich; fehlt die Angabe
    // (Altbestand), gilt das eingestellte Modell.
    failedModelFor(id) {
      return this.press.byId(id)?.errorModel || this.press.sessionById(id)?.errorModel || this.press.model;
    },
    retryModelFor(id) {
      return this.retryModels[id] || this.failedModelFor(id);
    },
    setRetryModel(id, model) {
      this.retryModels = { ...this.retryModels, [id]: model };
    },
    canRetry(a) { return this.press.canRetry(a); },
    async regenerate(articleId) {
      const model = this.retryModelFor(articleId);
      this.closeArticle();
      await this.press.retryArticle(articleId, model);
    },
    isBusy(id) { return !!this.press.busy[id]; },
    get anyBusy() { return Object.keys(this.press.busy).length > 0; },

    // --- Storylines ----------------------------------------------------------
    get storyRows() {
      return this.press.storylines
        .filter((s) => !this.fTeam || !s.teams?.length || s.teams.includes(this.fTeam))
        .slice(0, 8);
    },
    storyColor(status) {
      return status === 'eskaliert' ? '#e3350d'
        : status === 'beruhigt' ? '#63bc5a'
        : status === 'beendet' ? '#98a2b3'
        : status === 'neu' ? '#ffcb05'
        : '#4d90d5';
    },
  };
}

// === Anmeldung ==============================================================
// Genau zwei Konten, hart verdrahtet. Ein Konto entsteht, sobald beim ersten Login
// ein Passwort hinterlegt wird; die Prüfdaten liegen in der Collection `users`.
//
// Die Firestore-Regeln sind offen — der andere Spieler könnte private Dokumente also
// technisch lesen. Vertraulichkeit entsteht deshalb über den Inhalt: alles Private
// wird mit einem Schlüssel verschlüsselt, der ausschließlich aus dem Passwort
// abgeleitet wird und das Gerät nie verlässt.
Alpine.store('auth', {
  users: {},
  loaded: false,
  blocked: false,
  player: null,
  dataKey: null,
  players: AUTH_PLAYERS,
  // Entschlüsselte private Bereiche, je Scope: { value, loaded, error }
  _private: {},

  init() {
    onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const next = {};
        snap.docs.forEach((d) => { next[d.id] = { id: d.id, ...d.data() }; });
        this.users = next;
        this.loaded = true;
        this.restore();
      },
      (err) => {
        console.error('users-Collection nicht lesbar:', err);
        this.blocked = true;
        this.loaded = true;
      },
    );
  },

  // Gerätesitzung wiederherstellen — nur, wenn die abgelegte Prüfsumme noch zum
  // hinterlegten Passwort passt. Nach einem Passwortwechsel greift das nicht mehr.
  restore() {
    if (this.player) return;
    const session = loadJson(AUTH_KEY);
    if (!session?.player) return;
    const record = this.recordFor(session.player);
    if (isValidSession(session, record)) {
      this.player = record.player;
      this.dataKey = session.key || null;
    } else if (record) {
      localStorage.removeItem(AUTH_KEY);
    }
  },

  get isLoggedIn() { return !!this.player; },
  get me() { return this.player; },
  get other() { return otherPlayer(this.player); },

  recordFor(player) { return this.users[userId(player)] || null; },
  hasAccount(player) { return !!this.recordFor(player)?.auth?.hash; },

  async register(player, password) {
    if (!AUTH_PLAYERS.includes(player)) return { ok: false, error: 'Unbekanntes Konto.' };
    if (this.hasAccount(player)) return { ok: false, error: 'Für dieses Konto gibt es bereits ein Passwort.' };
    try {
      const { record, hash, dataKey } = await createCredential(player, password);
      await setDoc(doc(db, 'users', userId(player)), record);
      this._start(player, hash, dataKey);
      return { ok: true };
    } catch (e) {
      console.error('Konto konnte nicht angelegt werden:', e);
      return { ok: false, error: 'Das Konto konnte nicht gespeichert werden.' };
    }
  },

  async login(player, password) {
    const record = this.recordFor(player);
    if (!record) return { ok: false, error: 'Für dieses Konto ist noch kein Passwort hinterlegt.' };
    try {
      const { ok, hash, dataKey } = await verifyCredential(record, password);
      if (!ok) return { ok: false, error: 'Falsches Passwort.' };
      this._start(record.player, hash, dataKey);
      return { ok: true };
    } catch (e) {
      console.error('Anmeldung fehlgeschlagen:', e);
      return { ok: false, error: 'Die Anmeldung ist fehlgeschlagen.' };
    }
  },

  _start(player, hash, dataKey) {
    this.player = player;
    this.dataKey = dataKey;
    this._private = {};
    saveJson(AUTH_KEY, { player, hash, key: dataKey });
    Alpine.store('awards')?.onPlayerChange?.(player);
  },

  logout() {
    this.player = null;
    this.dataKey = null;
    this._private = {};
    localStorage.removeItem(AUTH_KEY);
  },

  // --- Besitzverhältnisse --------------------------------------------------
  isMe(player) { return !!player && player === this.player; },
  ownsTeam(team) { return authOwnsTeam(this.player, team); },
  ownsTeamId(teamId) {
    return this.ownsTeam((Alpine.store('league')?.teams || []).find((t) => t.id === teamId));
  },
  get myTeamIds() { return teamIdsOf(this.player, Alpine.store('league')?.teams || []); },
  get myTeams() { return (Alpine.store('league')?.seasonTeams || []).filter((t) => this.ownsTeam(t)); },

  // --- Private, verschlüsselte Ablage --------------------------------------
  // Ein Dokument je Spieler und Bereich; der Klartext entsteht nur im Browser.
  _docId(scope) { return `${userId(this.player)}-${scope}`; },

  slot(scope) {
    if (!this._private[scope]) this._private = { ...this._private, [scope]: { value: null, loaded: false, error: null } };
    return this._private[scope];
  },

  async loadPrivate(scope, fallback = null) {
    if (!this.isLoggedIn || !this.dataKey) return fallback;
    const cached = this._private[scope];
    if (cached?.loaded) return cached.value ?? fallback;
    try {
      const snap = await getDoc(doc(db, 'private', this._docId(scope)));
      const value = snap.exists() ? await decryptJson(this.dataKey, snap.data()?.payload) : null;
      this._private = { ...this._private, [scope]: { value, loaded: true, error: null } };
      return value ?? fallback;
    } catch (e) {
      console.error(`Privater Bereich "${scope}" konnte nicht gelesen werden:`, e);
      this._private = { ...this._private, [scope]: { value: null, loaded: true, error: e?.message || 'Fehler' } };
      return fallback;
    }
  },

  async savePrivate(scope, value) {
    if (!this.isLoggedIn || !this.dataKey) throw new Error('Nicht angemeldet.');
    const payload = await encryptJson(this.dataKey, value);
    await setDoc(doc(db, 'private', this._docId(scope)), {
      owner: userId(this.player),
      scope,
      payload,
      updatedAt: new Date().toISOString(),
    });
    this._private = { ...this._private, [scope]: { value, loaded: true, error: null } };
    return true;
  },

  privateUpdatedAt(scope) { return this._private[scope]?.updatedAt || null; },
});

// Der gewählte Saison-Bereich. Entweder eine Saisonnummer oder 'all' für die
// saisonübergreifende Ansicht. Gerätelokal gemerkt — beide Spieler dürfen
// unabhängig voneinander in verschiedenen Saisons unterwegs sein.
Alpine.store('season', {
  scope: 1,

  init() {
    const saved = loadJson(SEASON_KEY);
    if (saved?.scope === SEASON_ALL || Number.isFinite(saved?.scope)) this.scope = saved.scope;
  },

  // Alle Saisons, für die Teams existieren.
  get list() {
    return seasonsFrom(Alpine.store('league')?.teams || []);
  },
  get isAll() {
    return this.scope === SEASON_ALL;
  },
  // Die Saison, mit der gerechnet wird. Im saisonübergreifenden Bereich (und bei
  // einer gespeicherten Saison, die es nicht mehr gibt) die jüngste.
  get current() {
    const list = this.list;
    if (this.isAll) return list[list.length - 1] || 1;
    return list.includes(this.scope) ? this.scope : list[list.length - 1] || 1;
  },
  get label() {
    return this.labelOf(this.scope);
  },
  labelOf(scope) {
    return scope === SEASON_ALL ? 'Saisonübergreifend' : `Saison ${scope}`;
  },
  // Kurzform für das Abzeichen im Umschalter — muss in ein kleines Quadrat passen.
  shortLabelOf(scope) {
    return scope === SEASON_ALL ? '∞' : `S${scope}`;
  },
  // Die Einträge des Umschalters: jede Saison, dann der übergreifende Bereich.
  get options() {
    return [...this.list.map((v) => ({ value: v, label: this.labelOf(v) })),
      { value: SEASON_ALL, label: this.labelOf(SEASON_ALL) }];
  },
  isActive(scope) {
    return this.scope === scope;
  },
  set(scope) {
    const next = scope === SEASON_ALL ? SEASON_ALL : Number(scope);
    if (next === this.scope) return;
    this.scope = next;
    saveJson(SEASON_KEY, { scope: next });
    window.dispatchEvent(new CustomEvent('season-change', { detail: { scope: next } }));
  },
});

// Der Store hält IMMER den Gesamtbestand; was eine Ansicht sieht, entscheidet der
// gewählte Saison-Bereich (`Alpine.store('season')`). Draft, Spielplan, Transfer und
// Ergebnisse kommen deshalb als ganze Collection herein und werden über Getter auf
// die aktive Saison eingeschränkt — ein Saisonwechsel braucht so keine neuen Listener.
Alpine.store('league', {
  teams: [],
  pokemon: [],
  _drafts: {},      // { s1: {…}, 'transfer-s1': {…} }
  _schedules: {},   // { s1: {…} }
  allResults: [],
  teamsLoaded: false,
  pokemonLoaded: false,
  draftLoaded: false,
  scheduleLoaded: false,
  resultsLoaded: false,
  transferLoaded: false,

  // Pick-Benachrichtigungen
  _rosterCounts: {},
  _notifyArmed: false,
  _audioCtx: null,

  // Die aktive Saison. Im saisonübergreifenden Bereich ist das die jüngste — dort
  // wird ohnehin nur mit den `all*`-Sichten gearbeitet.
  get season() {
    return Alpine.store('season')?.current || 1;
  },
  get prefix() {
    return seasonPrefix(this.season);
  },
  get seasons() {
    return seasonsFrom(this.teams);
  },
  get draft() {
    return this._drafts[this.prefix]
      || { status: 'idle', order: [], pickIndex: 0, renewals: [], renewalRound: null, renewalDone: [] };
  },
  get transfer() {
    return this.transferOf(this.season);
  },
  // Dieselben Dokumente für eine beliebige Saison — die Marktwert-Verläufe brauchen
  // den Transfer der Saison, zu der ein Team gehört, nicht den der aktiven.
  transferOf(season) {
    return this._drafts[`transfer-${seasonPrefix(season)}`]
      || { status: 'idle', order: [], pickIndex: 0, removed: [], added: [], skipped: [] };
  },
  scheduleOf(season) {
    return this._schedules[seasonPrefix(season)] || { matchdays: [] };
  },
  get schedule() {
    return this._schedules[this.prefix] || { matchdays: [] };
  },
  get results() {
    return resultsOfSeason(this.allResults, this.season);
  },
  get seasonTeams() {
    return teamsOfSeason(this.teams, this.season);
  },
  // Alle Spielpläne — die Langzeitsichten brauchen sie, um eine abgeschlossene
  // Saison von einer laufenden zu unterscheiden.
  get allSchedules() {
    return this._schedules;
  },
  // Kaderfenster über ALLE Saisons: ab bzw. bis zu welchem Spieltag ein Pokémon einem
  // Team gehörte. Die Statistik braucht das, damit ein im Wintertransfer geholtes
  // Pokémon nicht so gerechnet wird, als hätte es die Hinrunde auf der Bank verbracht.
  // Die Schlüssel tragen die Team-ID und damit die Saison in sich — eine Karte reicht.
  get availability() {
    const out = {};
    Object.keys(this._schedules).forEach((prefix) => {
      const season = Number(String(prefix).replace(/^s/, ''));
      if (!Number.isFinite(season)) return;
      Object.assign(out, transferAvailability(this.transferOf(season), this._schedules[prefix]));
    });
    return out;
  },

  init() {
    this.loadPokemon();

    onSnapshot(collection(db, 'teams'), (snap) => {
      const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.detectPicks(next);
      this.teams = next;
      this.teamsLoaded = true;
    });

    onSnapshot(collection(db, 'drafts'), (snap) => {
      const next = {};
      snap.docs.forEach((d) => { next[d.id] = d.data(); });
      this._drafts = next;
      this.draftLoaded = true;
      this.transferLoaded = true;
    });

    onSnapshot(collection(db, 'schedules'), (snap) => {
      const next = {};
      snap.docs.forEach((d) => { next[d.id] = d.data(); });
      this._schedules = next;
      this.scheduleLoaded = true;
    });

    onSnapshot(collection(db, 'results'), (snap) => {
      this.allResults = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.resultsLoaded = true;
    });
  },

  async loadPokemon() {
    try {
      const res = await fetch('./data/pokemon.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.pokemon = await res.json();
    } catch (e) {
      console.error('pokemon.json konnte nicht geladen werden:', e);
    } finally {
      this.pokemonLoaded = true;
    }
  },

  // Neue Picks anhand wachsender Roster erkennen (unabhängig vom pickIndex-Timing).
  // Erste Snapshot-Runde nur seeden, danach pro neuem Pokémon eine Benachrichtigung.
  detectPicks(nextTeams) {
    const prev = this._rosterCounts || {};
    const counts = {};
    const fresh = [];
    nextTeams.forEach((t) => {
      const len = (t.pokemon || []).length;
      counts[t.id] = len;
      const before = prev[t.id];
      if (before != null && len > before) {
        for (let i = before; i < len; i++) fresh.push({ team: t, mon: (t.pokemon || [])[i] });
      }
    });
    this._rosterCounts = counts;
    if (!this._notifyArmed) { this._notifyArmed = true; return; }
    if (this.draft?.status === 'running') fresh.forEach((p) => p.mon && this.notifyPick(p.team, p.mon));
  },

  // Bei User-Geste aufrufen: Audio-Context entsperren + Notification-Permission anfragen.
  ensureNotifyPermission() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx && !this._audioCtx) this._audioCtx = new Ctx();
      if (this._audioCtx && this._audioCtx.state === 'suspended') this._audioCtx.resume();
    } catch (e) {}
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    } catch (e) {}
  },

  playPickSound() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!this._audioCtx) this._audioCtx = new Ctx();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      [880, 1318.5].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        const t0 = now + i * 0.09;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
        o.connect(g).connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + 0.14);
      });
    } catch (e) {}
  },

  notifyPick(team, mon) {
    const title = `${team?.player || ''} draftet ${mon?.name || ''}`.trim();
    this.playPickSound();
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const n = new Notification(title, {
          body: `${team?.name || ''} · Tier ${mon?.tier || '?'}`,
          icon: mon?.image || undefined,
          tag: 'jhdl-pick',
          renotify: true,
          silent: true,
        });
        setTimeout(() => { try { n.close(); } catch (e) {} }, 5000);
      }
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `${title} · ${team?.name || ''}`, icon: mon?.image || null } }));
  },

  // Die Endtabelle der Vorsaison — Grundlage der Draft-Reihenfolge ab Saison 2.
  previousTable(season = this.season) {
    const prev = Number(season) - 1;
    if (!Number.isFinite(prev) || prev < 1) return [];
    const teams = teamsOfSeason(this.teams, prev);
    if (!teams.length) return [];
    return computeStandings(teams, resultsOfSeason(this.allResults, prev));
  },
  // Die Kader der Vorsaison je Franchise — Grundlage der Vertragsverlängerungen.
  get prevRosters() {
    return previousRosters(this.teams, this.season, this.pokemon);
  },

  /**
   * Draft eröffnen.
   *
   * Saison 1 wird weiterhin ausgelost. Ab Saison 2 ergibt sich die Reihenfolge aus der
   * Endtabelle: Platz 1 zieht zuerst, die Aufsteiger schließen hinten an. Gehören beide
   * Aufsteiger demselben Spieler, bleibt der Draft zunächst im Zustand `order` stehen —
   * erst seine Wahl macht die Reihenfolge vollständig.
   */
  async startDraft({ firstPromoted = null } = {}) {
    const ids = this.seasonTeams.map((t) => t.id);
    if (!ids.length) return;
    const built = buildDraftOrder({
      prevTable: this.previousTable(),
      teams: this.seasonTeams,
      firstPromoted,
    });
    const pending = built.choice && built.order.length !== ids.length ? built.choice : null;
    // Ohne Vorsaison wird ausgelost. Bleibt sonst ein Team übrig, das die Tabelle nicht
    // kennt (neues Franchise, gelöschte Vorsaison), hängt es hinten an — ein Draft ohne
    // alle Teams wäre schlimmer als eine unschöne Reihenfolge.
    let order = built.order;
    if (!order.length) order = shuffle(ids);
    else if (!pending && order.length !== ids.length) {
      const seen = new Set(order);
      order = [...order, ...ids.filter((id) => !seen.has(id))];
    }

    const batch = writeBatch(db);
    ids.forEach((id) => batch.update(doc(db, 'teams', id), { pokemon: [] }));
    batch.set(doc(db, 'drafts', this.prefix), {
      season: this.season,
      status: pending ? 'order' : 'running',
      order,
      pickIndex: 0,
      // Vertragsverlängerungen: das Fenster der ersten Runde steht sofort offen.
      renewals: [],
      renewalRound: pending ? null : 0,
      renewalDone: [],
      orderChoice: pending,
    });
    await batch.commit();
  },

  /** Die offene Frage der Reihenfolge beantworten: Welcher Aufsteiger zieht an Position 7? */
  async chooseFirstPromoted(teamId) {
    const d = this.draft;
    const options = d?.orderChoice?.options || [];
    if (!options.includes(teamId)) return;
    const order = [...(d.order || []), teamId, ...options.filter((id) => id !== teamId)];
    await setDoc(doc(db, 'drafts', this.prefix), {
      status: 'running', order, pickIndex: 0, renewalRound: 0, renewalDone: [], orderChoice: null,
    }, { merge: true });
  },

  async generateSchedule() {
    const janik = this.seasonTeams.filter((t) => t.player === 'Janik').map((t) => t.id);
    const henrik = this.seasonTeams.filter((t) => t.player === 'Henrik').map((t) => t.id);
    if (!janik.length || !henrik.length) return;
    const matchdays = buildSchedule(janik, henrik);
    await setDoc(doc(db, 'schedules', this.prefix), {
      season: this.season,
      createdAt: new Date().toISOString(),
      matchdays,
    });
  },

  // Ein Ergebnis wird im Ganzen geschrieben — deshalb in einer Transaktion und
  // über `mergeResult`: ein fertiger Kampf im Bestand wird nie durch einen leeren
  // ersetzt, egal ob das Formular veraltet ist oder ein zweites Gerät schneller war.
  async saveResult(docId, data) {
    const ref = doc(db, 'results', docId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const merged = mergeResult(snap.exists() ? snap.data() : null, data);
      tx.set(ref, { ...merged, updatedAt: new Date().toISOString() });
    });
  },

  // Freigabe für die Presse: erst danach entstehen Spielbericht und Zufallsbeiträge.
  // Sie bestätigt, dass Ergebnis UND Kampfverlauf final sind.
  async setPressReady(docId, ready, player = null) {
    await setDoc(
      doc(db, 'results', docId),
      {
        pressReady: !!ready,
        pressReadyAt: ready ? new Date().toISOString() : null,
        pressReadyBy: ready ? player || null : null,
      },
      { merge: true },
    );
  },

  // Video zum Match (deckt alle drei Kämpfe ab). Leere Eingabe löscht den Eintrag.
  async saveMatchVideo(docId, url) {
    const clean = normalizeVideoUrl(url);
    await setDoc(doc(db, 'results', docId), { videoUrl: clean || null }, { merge: true });
    return clean;
  },

  // === Team-Farbe ===========================================================
  // Die Farbe steht am Team-Dokument und ist damit für alle Geräte dieselbe. `null`
  // setzt auf die aus der Team-ID abgeleitete Farbe zurück.
  async setTeamColor(teamId, color) {
    if (!teamId) return;
    await setDoc(doc(db, 'teams', teamId), { color: normalizeHexColor(color) }, { merge: true });
  },

  // === Trainer ==============================================================
  // Trainer liegen als Array im Team-Dokument; ein Wechsel ist damit ein einziger
  // Schreibvorgang und braucht weder eigene Collection noch eigene Regel.
  async appointTrainer(teamId, raw) {
    const team = this.teams.find((t) => t.id === teamId);
    if (!team) return;
    const list = Array.isArray(team.trainers) ? team.trainers : [];
    const entry = normalizeTrainer(raw, teamId);
    // Ein evtl. noch amtierender Trainer wird zum Vortag des Nachfolgers beendet.
    const cur = currentTrainer(list);
    let next = list;
    if (cur && cur.id !== entry.id) {
      const until = Number.isFinite(entry.fromDay) ? entry.fromDay - 1 : null;
      next = withDismissed(next, cur.id, until);
    }
    next = [...next.filter((t) => t.id !== entry.id), entry];
    await setDoc(doc(db, 'teams', teamId), { trainers: next }, { merge: true });
  },

  async updateTrainer(teamId, raw) {
    const team = this.teams.find((t) => t.id === teamId);
    if (!team || !raw?.id) return;
    const list = Array.isArray(team.trainers) ? team.trainers : [];
    const entry = normalizeTrainer(raw, teamId);
    const next = list.map((t) => (t && t.id === entry.id ? entry : t));
    await setDoc(doc(db, 'teams', teamId), { trainers: next }, { merge: true });
  },

  async dismissTrainer(teamId, trainerId, untilDay) {
    const team = this.teams.find((t) => t.id === teamId);
    if (!team) return;
    const list = Array.isArray(team.trainers) ? team.trainers : [];
    await setDoc(doc(db, 'teams', teamId), { trainers: withDismissed(list, trainerId, untilDay) }, { merge: true });
  },

  async removeTrainer(teamId, trainerId) {
    const team = this.teams.find((t) => t.id === teamId);
    if (!team) return;
    const list = Array.isArray(team.trainers) ? team.trainers : [];
    await setDoc(doc(db, 'teams', teamId), { trainers: list.filter((t) => t && t.id !== trainerId) }, { merge: true });
  },

  async pick(teamId, pokemon) {
    const n = this.draft.order.length;
    const total = n * 10;
    const nextIndex = this.draft.pickIndex + 1;
    const status = nextIndex >= total ? 'done' : 'running';
    const batch = writeBatch(db);
    batch.update(doc(db, 'teams', teamId), { pokemon: arrayUnion(pokemon) });
    batch.update(doc(db, 'drafts', this.prefix), { pickIndex: nextIndex, status, ...this._renewalWindow(nextIndex, n, total) });
    await batch.commit();
  },

  // === Vertragsverlängerungen ===============================================
  // Zu Beginn jeder Runde öffnet sich das Fenster erneut — bis zum letzten Pick.
  _renewalWindow(nextIndex, n, total) {
    if (nextIndex >= total || nextIndex % n !== 0) return {};
    return { renewalRound: nextIndex / n, renewalDone: [] };
  },

  /** Eine Vertragsverlängerung einlösen: das Pokémon kommt sofort ins Team. */
  async renewContract(teamId, tier, pokemon) {
    const d = this.draft;
    const n = d.order?.length || 0;
    if (!n || !pokemon?.name) return;
    const total = n * 10;
    const round = Number(d.renewalRound);
    if (!Number.isFinite(round)) return;
    const nextIndex = (d.pickIndex || 0) + 1;
    const status = nextIndex >= total ? 'done' : 'running';
    const entry = { teamId, tier, name: pokemon.name, round, at: new Date().toISOString() };
    const batch = writeBatch(db);
    batch.update(doc(db, 'teams', teamId), { pokemon: arrayUnion(pokemon) });
    batch.update(doc(db, 'drafts', this.prefix), {
      pickIndex: nextIndex,
      status,
      renewals: arrayUnion(entry),
      renewalDone: arrayUnion(teamId),
      // Der Zug ist verbraucht; ein Rundenwechsel öffnet das Fenster neu.
      ...this._renewalWindow(nextIndex, n, total),
    });
    await batch.commit();
  },

  /** Auf die Vertragsverlängerung dieser Runde verzichten — sie bleibt erhalten. */
  async skipRenewal(teamId) {
    if (!Number.isFinite(Number(this.draft?.renewalRound))) return;
    await setDoc(doc(db, 'drafts', this.prefix), { renewalDone: arrayUnion(teamId) }, { merge: true });
  },

  // === Wintertransfer =======================================================
  // 4 Runden Snake, Reihenfolge = Tabellenplatz (schlechtester zuerst). Bestehende
  // Ergebnisse bleiben erhalten; nur die Roster werden verändert.
  async startTransfer() {
    const order = computeStandings(this.seasonTeams, this.results).map((r) => r.team.id).reverse();
    if (!order.length) return;
    await setDoc(doc(db, 'drafts', `transfer-${this.prefix}`), {
      season: this.season, status: 'running', order, pickIndex: 0, removed: [], added: [], skipped: [],
    });
  },

  _transferRound() {
    const n = this.transfer.order?.length || 1;
    return Math.floor((this.transfer.pickIndex || 0) / n) + 1;
  },
  // pickIndex vorrücken; nach 4 Runden abschließen.
  _transferAdvance(batch, extra = {}) {
    const n = this.transfer.order?.length || 0;
    const next = (this.transfer.pickIndex || 0) + 1;
    const status = next >= 4 * n ? 'done' : 'running';
    batch.update(doc(db, 'drafts', `transfer-${this.prefix}`), { pickIndex: next, status, ...extra });
  },

  async transferRemove(teamId, monName) {
    const team = this.teams.find((t) => t.id === teamId);
    const mon = (team?.pokemon || []).find((p) => p.name === monName);
    if (!mon) return;
    const round = this._transferRound();
    const at = this.transfer.pickIndex || 0;
    const nextRoster = team.pokemon.filter((p) => p.name !== monName);
    const batch = writeBatch(db);
    batch.update(doc(db, 'teams', teamId), { pokemon: nextRoster });
    this._transferAdvance(batch, { removed: arrayUnion({ teamId, name: monName, tier: mon.tier, round, at }) });
    await batch.commit();
  },

  // Verzicht wird protokolliert, damit er im Verlauf sichtbar bleibt.
  async transferSkip(teamId, phase) {
    const round = this._transferRound();
    const at = this.transfer.pickIndex || 0;
    const batch = writeBatch(db);
    this._transferAdvance(batch, {
      skipped: arrayUnion({ teamId: teamId || null, round, at, phase: phase === 'pick' ? 'pick' : 'remove' }),
    });
    await batch.commit();
  },

  async transferPick(teamId, pokemon) {
    const clean = {
      name: pokemon.name, name_en: pokemon.name_en || null, dex: pokemon.dex ?? null,
      types: pokemon.types || [], tier: pokemon.tier, cost: pokemon.cost ?? null, image: pokemon.image || null,
    };
    const round = this._transferRound();
    const at = this.transfer.pickIndex || 0;
    const batch = writeBatch(db);
    batch.update(doc(db, 'teams', teamId), { pokemon: arrayUnion(clean) });
    this._transferAdvance(batch, { added: arrayUnion({ teamId, name: clean.name, tier: clean.tier, round, at }) });
    await batch.commit();
  },
});

// === Awards =================================================================
// Eine Firestore-Doc je Abstimmung (Collection `awards`, ID aus awardDocId).
// Der „eigene Spieler" ist gerätelokal gewählt (kein Login) und entscheidet,
// unter wessen Namen nominiert, abgestimmt und die Siegerehrung quittiert wird.
Alpine.store('awards', {
  docs: [],
  loaded: false,
  // true, wenn Firestore die Collection `awards` verweigert (Regeln nicht erweitert).
  blocked: false,
  players: PLAYERS,
  // Sieger-Index für die Pins: { pokemon: {name:[key,…]}, team: {}, match: {}, }
  index: { pokemon: {}, team: {}, match: {} },

  // Wer an diesem Gerät sitzt, ergibt sich aus der Anmeldung — nicht mehr aus
  // einer Auswahl in der Ansicht.
  get me() {
    return Alpine.store('auth')?.player || null;
  },

  init() {
    this.initPinTaps();
    window.addEventListener('season-change', () => this.rebuildIndex());
    onSnapshot(
      collection(db, 'awards'),
      (snap) => {
        this.docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        this.blocked = false;
        this.loaded = true;
        this.rebuildIndex();
      },
      (err) => {
        // Ohne Regel für `awards` bleibt die Liga bedienbar; nur die Awards fehlen.
        console.error('awards-Collection nicht lesbar:', err);
        this.blocked = true;
        this.loaded = true;
      },
    );
  },

  // Der Pin-Index hängt am angemeldeten Spieler (Spoilerschutz) und am gewählten
  // Saison-Bereich — beides muss ihn neu bauen.
  onPlayerChange() {
    this.rebuildIndex();
  },
  get other() {
    return PLAYERS.find((p) => p !== this.me) || PLAYERS[1];
  },

  byId(id) {
    return this.docs.find((d) => d.id === id) || null;
  },

  // Instanz einer Abstimmung — auch wenn in Firestore noch nichts steht.
  get season() {
    return Alpine.store('league')?.season || 1;
  },

  instance(meta) {
    const def = AWARD_BY_KEY[meta.key];
    const id = awardDocId(meta.key, { ...meta, season: this.season });
    const raw = this.byId(id);
    return {
      key: meta.key,
      day: meta.day ?? null,
      teamId: meta.teamId ?? null,
      label: meta.label || def?.label || meta.key,
      def,
      entity: def?.entity || 'pokemon',
      id,
      exists: !!raw,
      status: raw?.status || 'nominating',
      nominations: raw?.nominations || {},
      confirmed: raw?.confirmed || {},
      votes: raw?.votes || {},
      voted: raw?.voted || {},
      seen: raw?.seen || {},
    };
  },

  // --- Schreibzugriffe ---
  async _write(inst, data) {
    await setDoc(
      doc(db, 'awards', inst.id),
      {
        season: this.season,
        key: inst.key,
        day: inst.day ?? null,
        teamId: inst.teamId ?? null,
        entity: inst.entity,
        updatedAt: new Date().toISOString(),
        ...data,
      },
      { merge: true },
    );
  },

  // Nominierungen zwischenspeichern (Dialog bleibt offen).
  async saveNominations(inst, options) {
    await this._write(inst, { nominations: { [this.me]: options.slice(0, MAX_NOMINATIONS) } });
  },
  // Bestätigen und auf den anderen warten. Sind beide fertig, startet die Abstimmung.
  async confirmNominations(inst, options) {
    const confirmed = { ...inst.confirmed, [this.me]: true };
    const status = nextStatus({ ...inst, confirmed, status: 'nominating' });
    await this._write(inst, {
      nominations: { [this.me]: options.slice(0, MAX_NOMINATIONS) },
      confirmed: { [this.me]: true },
      status,
    });
  },
  // Abstimmung sofort starten (überspringt das Warten).
  async startVoting(inst, options) {
    await this._write(inst, {
      nominations: { [this.me]: options.slice(0, MAX_NOMINATIONS) },
      confirmed: { [this.me]: true },
      status: 'voting',
    });
  },
  async submitVotes(inst, votes) {
    const voted = { ...inst.voted, [this.me]: true };
    const status = nextStatus({ ...inst, voted, status: 'voting' });
    await this._write(inst, { votes: { [this.me]: votes }, voted: { [this.me]: true }, status });
  },
  async markSeen(inst) {
    if (inst.seen?.[this.me]) return;
    await this._write(inst, { seen: { [this.me]: true } });
  },
  async reopenNominations(inst) {
    await this._write(inst, { status: 'nominating', confirmed: { Janik: false, Henrik: false } });
  },

  // --- Sieger-Index für die Pins ---
  // Ein Pin erscheint erst, wenn DER EIGENE Spieler die Siegerehrung gesehen hat —
  // sonst würde die Tabelle das Ergebnis vorwegnehmen.
  rebuildIndex() {
    const idx = { pokemon: {}, team: {}, match: {} };
    // In einer Saison zeigen die Siegel nur deren Auszeichnungen; saisonübergreifend
    // alle. Deshalb wird der Index auch beim Bereichswechsel neu gebaut.
    const all = !!Alpine.store('season')?.isAll;
    const season = this.season;
    const push = (kind, id, entry) => {
      if (!id) return;
      (idx[kind][id] = idx[kind][id] || []).push(entry);
    };
    this.docs.forEach((raw) => {
      if (raw?.status !== 'done') return;
      if (!raw?.seen?.[this.me]) return;
      if (!all && seasonOfId(raw.id) !== season) return;
      const entity = raw.entity || AWARD_BY_KEY[raw.key]?.entity || 'pokemon';
      // Bei Gleichstand auf Platz 1 bekommen alle Sieger den Pin.
      awardWinners(raw).forEach((win) => {
        const entry = { key: raw.key, day: raw.day ?? null, teamId: raw.teamId ?? null, winner: win.label || win.id };
        if (entity === 'team') push('team', win.id, entry);
        else if (entity === 'match') push('match', win.id, entry);
        else if (entity === 'pair') String(win.id).split(' + ').forEach((n) => push('pokemon', n.trim(), entry));
        else push('pokemon', win.id, entry);
      });
    });
    // Saison-Awards vor Spieltag-Awards, innerhalb der Katalog-Reihenfolge;
    // bei mehrfach vergebenen Spieltag-Awards der jüngste Spieltag zuerst.
    const rank = {};
    SEASON_AWARDS.forEach((a, i) => { rank[a.key] = i; });
    MATCHDAY_AWARDS.forEach((a, i) => { rank[a.key] = 100 + i; });
    Object.values(idx).forEach((bag) => {
      Object.keys(bag).forEach((id) => bag[id].sort(
        (a, b) => (rank[a.key] ?? 999) - (rank[b.key] ?? 999) || (b.day ?? 0) - (a.day ?? 0),
      ));
    });
    this.index = idx;
  },

  keysFor(kind, id) {
    return (this.index?.[kind] || {})[id] || [];
  },

  // Award-Historie eines Pokémon: jede Abstimmung, in der es nominiert war.
  // Die Auswertung bleibt verdeckt, solange der eigene Spieler die zugehörige
  // Siegerehrung nicht gesehen hat — derselbe Spoilerschutz wie bei den Pins.
  // Rückgabe: [{ id, key, label, when, day, teamId, status, by, nominatedBy,
  //              revealed, rank, avg, scores, total, won }]
  historyForPokemon(name) {
    if (!name) return [];
    const rank = {};
    SEASON_AWARDS.forEach((a, i) => { rank[a.key] = i; });
    MATCHDAY_AWARDS.forEach((a, i) => { rank[a.key] = 100 + i; });
    const out = [];
    this.docs.forEach((raw) => {
      if (!raw) return;
      const def = AWARD_BY_KEY[raw.key];
      const entity = raw.entity || def?.entity || 'pokemon';
      if (entity !== 'pokemon' && entity !== 'pair') return;
      const rows = voteResults(raw);
      const hit = rows.find((r) => (entity === 'pair'
        ? String(r.id).split(' + ').map((n) => n.trim()).includes(name)
        : String(r.id) === name));
      if (!hit) return;
      const status = raw.status || 'nominating';
      const revealed = status === 'done' && !!raw?.seen?.[this.me];
      const b = this.blurb({ key: raw.key, day: raw.day ?? null, teamId: raw.teamId ?? null });
      out.push({
        id: raw.id,
        key: raw.key,
        label: b.label,
        when: b.when,
        hint: b.hint,
        day: raw.day ?? null,
        teamId: raw.teamId ?? null,
        entity,
        optionId: hit.id,
        partner: entity === 'pair'
          ? String(hit.id).split(' + ').map((n) => n.trim()).find((n) => n !== name) || null
          : null,
        status,
        nominatedBy: hit.by || [],
        revealed,
        rank: revealed ? hit.rank : null,
        avg: revealed ? hit.avg : null,
        scores: revealed ? hit.scores : null,
        total: rows.length,
        won: revealed && hit.rank === 1,
      });
    });
    return out.sort((a, b2) => {
      if (a.won !== b2.won) return a.won ? -1 : 1;
      return (rank[a.key] ?? 999) - (rank[b2.key] ?? 999) || (b2.day ?? 0) - (a.day ?? 0);
    });
  },
  // Kurztext einer Auszeichnung: „welcher Award von wann".
  blurb(entry) {
    const def = AWARD_BY_KEY[entry.key];
    const label = def?.label || entry.key;
    if (entry.day != null) return { label, when: `Spieltag ${entry.day}`, hint: def?.hint || '' };
    if (entry.teamId) {
      const team = (Alpine.store('league').teams || []).find((t) => t.id === entry.teamId);
      return { label, when: `Saison 1 · ${team?.name || 'Team'}`, hint: def?.hint || '' };
    }
    return { label, when: 'Saison 1', hint: def?.hint || '' };
  },
  // Ein Pin: Hover zeigt den Titel, Klick/Tap das geteilte Info-Popover.
  _slot(entry) {
    const b = this.blurb(entry);
    const title = `${b.label} · ${b.when}`;
    const text = b.hint ? `${b.hint} Vergeben: ${b.when}.` : `Vergeben: ${b.when}.`;
    return `<button type="button" class="pin-slot" data-award-pin title="${escAttr(title)}"
      aria-label="${escAttr(title)}" data-pin-title="${escAttr(b.label)}" data-pin-text="${escAttr(text)}">${awardSvg(entry.key, { variant: 'pin' })}</button>`;
  },
  // Pin-Ecke als HTML (x-html). Leerer String, wenn nichts zu zeigen ist.
  pinHtml(kind, id, size = '') {
    const list = this.keysFor(kind, id);
    if (!list.length) return '';
    const shown = list.slice(0, 3);
    const rest = list.slice(3);
    const slots = shown.map((e) => this._slot(e)).join('');
    let more = '';
    if (rest.length) {
      const label = `${rest.length} weitere Auszeichnungen`;
      const text = rest.map((e) => { const b = this.blurb(e); return `${b.label} (${b.when})`; }).join(', ');
      more = `<button type="button" class="pin-more" data-award-pin title="${escAttr(text)}"
        data-pin-title="${escAttr(label)}" data-pin-text="${escAttr(text)}">+${rest.length}</button>`;
    }
    return `<span class="pin-corner"${size ? ` data-size="${size}"` : ''}>${slots}${more}</span>`;
  },
  // Klick/Tap auf einen Pin: Titel + „von wann" im geteilten Info-Popover.
  // Delegiert, weil die Pins per x-html eingesetzt werden (kein Alpine-Baum).
  initPinTaps() {
    document.addEventListener('click', (e) => {
      const el = e.target instanceof Element ? e.target.closest('[data-award-pin]') : null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      openStatInfo(null, el.dataset.pinTitle || 'Auszeichnung', el.dataset.pinText || '');
    }, true);
  },
  medalHtml(key) {
    return awardSvg(key, { variant: 'medal', title: AWARD_BY_KEY[key]?.label || key });
  },
  color(key) {
    return awardColor(key);
  },
});

// Einfacher Navigations-Übergabepuffer: ein Klick setzt ein Ziel, die Ziel-View liest
// es beim init() aus und räumt auf.
// canBack spiegelt den Verlaufs-Stack der Shell, damit einzelne Views (z. B. die
// Pokémon-Detailseite) ihren eigenen Zurück-Knopf nur als Fallback zeigen.
// === Presse =================================================================
// Drei Firestore-Quellen: `press` (Beiträge), `pressSessions` (Interviews und
// Pressekonferenzen) und `settings/press` (die änderbaren Redaktionsaufträge).
// Der API-Key liegt gerätelokal — siehe PRESS_KEY.
//
// Spielberichte entstehen automatisch, sobald ein Match seinen dritten Kampf bekommt.
// Der Auslöser ist die BEOBACHTETE Zustandsänderung, nicht der Bestand: beim Laden
// wird der aktuelle Stand nur gemerkt, damit nicht die halbe Saison nachgeschrieben
// wird. Für Lücken gibt es „Fehlende Berichte" in den Einstellungen.
let pressSeenComplete = null;
// Dasselbe für die Marktwert-Updates: welche Spieltage waren beim letzten Durchlauf
// schon „fertig UND im Sheet bewertet"? Bewusst außerhalb der Alpine-Reaktivität.
let pressSeenMarket = null;
// Und für das Saisonende: war die Saison beim letzten Durchlauf schon komplett?
let pressSeenSeasonEnd = null;
// Welche Pool-Zugänge wurden in dieser Sitzung schon angestoßen? Der Beitrag zu den
// Neuzugängen hängt am Bestand, nicht an einer Änderung — ohne diese Sperre würde ein
// Fehlschlag den Effekt sofort wieder auslösen und sich im Kreis drehen.
const pressTriedNewcomers = new Set();

// Beschreibt dem Modell, wann der Termin stattfindet — die Auftaktrunde liegt
// außerhalb des normalen Rhythmus und braucht ihre eigene Einordnung.
function situationLine(s) {
  if (s.slot === 'outlook') {
    return 'Die Saison ist gespielt. Vor dem Wintertransfer und dem Draft der nächsten Saison tritt '
      + 'das Team ein letztes Mal vor die Presse: Bilanz, Kaderplanung, Verbleib einzelner Pokémon '
      + 'und die Ansage für die nächste Saison. Was hier versprochen wird, wird später zitiert.';
  }
  if (s.slot === 'bonus') {
    return `Es ist die große Presserunde vor Spieltag ${s.day}: Nach der bisherigen Saison tritt jedes `
      + 'Team noch einmal geschlossen vor die Presse, bevor es weitergeht. Ziehe Bilanz über die bisherige '
      + 'Saison, ordne die Tabellensituation ein und blicke auf das, was noch kommt.';
  }
  return `Spieltag ${s.day}, ${s.slot === 'pre' ? 'unmittelbar VOR dem Match' : 'unmittelbar NACH dem Match'}.`;
}

Alpine.store('press', {
  articles: [],
  sessions: [],
  config: { prompts: {} },
  articlesLoaded: false,
  sessionsLoaded: false,
  configLoaded: false,
  blocked: false,
  apiKey: '',
  model: DEFAULT_MODEL,
  busy: {},
  lastError: null,

  init() {
    const saved = loadJson(PRESS_KEY);
    this.apiKey = saved.key || '';
    // Ein abgelegtes Modell, das es nicht mehr gibt, würde das Auswahlfeld leer lassen.
    this.model = GEMINI_MODELS.some((m) => m.id === saved.model) ? saved.model : DEFAULT_MODEL;

    onSnapshot(
      collection(db, 'press'),
      (snap) => {
        this.articles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        this.articlesLoaded = true;
        this.blocked = false;
      },
      (err) => {
        console.error('press-Collection nicht lesbar:', err);
        this.blocked = true;
        this.articlesLoaded = true;
      },
    );

    onSnapshot(
      collection(db, 'pressSessions'),
      (snap) => {
        this.sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        this.sessionsLoaded = true;
      },
      () => { this.sessionsLoaded = true; },
    );

    onSnapshot(
      doc(db, 'settings', 'press'),
      (snap) => {
        this.config = snap.exists() ? snap.data() : { prompts: {} };
        this.configLoaded = true;
      },
      () => { this.configLoaded = true; },
    );

    Alpine.effect(() => this._watchResults());
    Alpine.effect(() => this._watchMarket());
    Alpine.effect(() => this._watchSeasonEnd());
    Alpine.effect(() => this._watchNewcomers());
  },

  // --- Zugang --------------------------------------------------------------
  get hasKey() {
    return !!this.apiKey;
  },
  saveAccess(key, model) {
    this.apiKey = String(key || '').trim();
    this.model = model || DEFAULT_MODEL;
    saveJson(PRESS_KEY, { key: this.apiKey, model: this.model });
  },

  // --- Redaktionsaufträge --------------------------------------------------
  get prompts() {
    return { ...DEFAULT_PROMPTS, ...(this.config?.prompts || {}) };
  },
  promptFor(key) {
    return this.prompts[key] || DEFAULT_PROMPTS[key] || '';
  },
  async savePrompts(next) {
    const clean = {};
    Object.entries(next || {}).forEach(([k, v]) => {
      const text = String(v || '').trim();
      // Nur Abweichungen speichern — ein zurückgesetzter Auftrag fällt damit
      // automatisch wieder auf die Vorlage zurück.
      if (text && text !== DEFAULT_PROMPTS[k]) clean[k] = text;
    });
    await setDoc(doc(db, 'settings', 'press'), { prompts: clean, updatedAt: new Date().toISOString() }, { merge: true });
  },

  // --- Zugriff -------------------------------------------------------------
  byId(id) {
    return this.articles.find((a) => a.id === id) || null;
  },
  sessionById(id) {
    return this.sessions.find((s) => s.id === id) || null;
  },
  get prefix() {
    return Alpine.store('league')?.prefix || 's1';
  },
  reportIdFor(matchId) {
    return `${this.prefix}-report-${String(matchId).replace(/^s\d+-/, '')}`;
  },
  get storylines() {
    return collectStorylines(this.articles);
  },
  // Was zuletzt erzählt wurde — hält die Regie davon ab, sich zu wiederholen.
  recentArchetypes(limit = 10) {
    return sortArticles(this.articles)
      .slice(0, limit)
      .map((a) => a.archetype)
      .filter(Boolean);
  },

  contextFor(focus) {
    const l = Alpine.store('league');
    return buildContext(
      {
        season: l.season,
        teams: l.teams,
        results: l.results,
        schedule: l.schedule,
        transfer: l.transfer,
        draft: l.draft,
        prevRosters: l.prevRosters,
        pokedex: l.pokemon,
        eloRows: Alpine.store('elo')?.rows || [],
        awardDocs: Alpine.store('awards')?.docs || [],
        articles: this.articles,
        battleLogs: Alpine.store('battleLogs')?.logs || [],
      },
      focus,
    );
  },

  // --- Automatik -----------------------------------------------------------
  _watchResults() {
    const l = Alpine.store('league');
    if (!l.resultsLoaded || !l.scheduleLoaded || !l.teamsLoaded) return;
    // Nicht die Vollständigkeit löst aus, sondern die Freigabe: erst sie sagt, dass
    // Ergebnis und Kampfverlauf endgültig sind.
    const done = new Set((l.results || [])
      .filter((r) => (r.day ?? 0) >= PRESS_FROM_DAY && isPressReleased(r))
      .map((r) => r.id));
    const known = pressSeenComplete;
    pressSeenComplete = done;
    if (known === null) return;
    if (!this.articlesLoaded || !this.hasKey) return;
    // Bewusst aus dem Effekt heraus verzögert: generateReport liest und schreibt
    // reaktive Felder (busy, articles) und würde den Effekt sonst selbst neu auslösen.
    const fresh = [...done].filter((id) => !known.has(id));
    fresh.forEach((id) => { setTimeout(() => this.generateReport(id).catch(() => {}), 0); });
    // Je Spieltag drei freie Beiträge: einer nach dem ersten, zweiten und dritten
    // abgeschlossenen Spiel dieses Spieltags.
    [...new Set(fresh.map((id) => (l.results || []).find((r) => r.id === id)?.day).filter((d) => d != null))]
      .forEach((day) => { setTimeout(() => this.fillRandomArticles(day).catch(() => {}), 1500); });
  },

  // Wie viele Matches eines Spieltags sind fertig? Für die Automatik zählt nur, was
  // auch freigegeben ist; von Hand nachholen lässt sich jedes vollständige Match.
  completedOnDay(day, { released = true } = {}) {
    const l = Alpine.store('league');
    const ok = released ? isPressReleased : isMatchComplete;
    return (l.results || []).filter((r) => r.day === day && ok(r)).length;
  },

  randomIdFor(day, index) {
    return `${this.prefix}-rand-d${day}-${index + 1}`;
  },

  // Die Zufallsbeiträge, die für einen Spieltag freigeschaltet, aber noch nicht
  // geschrieben sind.
  missingRandomFor(day, opts = {}) {
    const slots = Math.min(RANDOM_ARTICLES_PER_DAY, this.completedOnDay(day, opts));
    const out = [];
    for (let i = 0; i < slots; i++) {
      const id = this.randomIdFor(day, i);
      const existing = this.byId(id);
      if (!existing || existing.status === 'error') out.push({ id, day, index: i });
    }
    return out;
  },

  get missingRandom() {
    const l = Alpine.store('league');
    const days = [...new Set((l.schedule?.matchdays || []).map((md) => md.day))]
      .filter((d) => d >= PRESS_FROM_DAY);
    return days.flatMap((d) => this.missingRandomFor(d, { released: false }));
  },

  async fillRandomArticles(day) {
    for (const row of this.missingRandomFor(day)) {
      // Nacheinander: sonst schreiben drei Aufrufe gleichzeitig dieselbe Geschichte.
      await this.generateRandomArticle(day, row.index).catch(() => null);
    }
  },

  /**
   * Freier Beitrag ohne vorausgehenden Termin. Drei Stück je Spieltag, freigeschaltet
   * mit dem ersten, zweiten und dritten abgeschlossenen Spiel des Spieltags.
   */
  async generateRandomArticle(day, index, { force = false, model = null } = {}) {
    if (!this.hasKey) return null;
    const id = this.randomIdFor(day, index);
    if (this.busy[id]) return null;
    const existing = this.byId(id);
    if (!force && existing && existing.status !== 'error') return null;

    const ref = doc(db, 'press', id);
    const author = randomAuthor();
    const createdAt = new Date().toISOString();
    // Vor der Transaktion holen: `l` wird schon im Platzhalter-Dokument gebraucht.
    const l = Alpine.store('league');
    this.busy = { ...this.busy, [id]: true };

    try {
      const claimed = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists() && !force && snap.data()?.status !== 'error') return false;
        tx.set(ref, {
          season: l.season, category: 'news', categories: ['news', AI_CATEGORY], status: 'pending',
          authorId: author.id, teamIds: [], day, title: '', subtitle: '', body: '',
          source: { type: 'random', day, index }, storylines: [], createdAt, publishedAt: createdAt, error: null,
        });
        return true;
      });
      if (!claimed) return null;

      const dayTeams = (l.schedule?.matchdays || [])
        .filter((md) => md.day === day)
        .flatMap((md) => (md.matches || []).flatMap((m) => [m.home, m.away]));
      const direction = buildDirection(this.recentArchetypes());
      const data = await generateJson({
        apiKey: this.apiKey,
        model: this._modelOf(model),
        system: buildSystem({ author }),
        prompt: buildUserPrompt({
          task: this.promptFor('random'),
          direction: direction.text,
          context: this.contextFor({ teamIds: dayTeams, day }),
          addendum: `ANLASS: Spieltag ${day} läuft, ${this.completedOnDay(day)} Partien sind abgeschlossen. `
            + `Dies ist der ${index + 1}. von ${RANDOM_ARTICLES_PER_DAY} freien Beiträgen dieses Spieltags — `
            + 'such dir ein Thema, das die anderen Beiträge dieses Spieltags nicht schon hatten.',
        }),
        schema: ARTICLE_SCHEMA_FREE_CATEGORY,
        maxOutputTokens: 8192,
      });

      const known = new Set((l.teams || []).map((t) => t.id));
      const docData = this._articleDoc(data, {
        category: ['news', 'klatsch', 'geruechte', 'informationen'].includes(data.kategorie) ? data.kategorie : 'news',
        authorId: author.id,
        teamIds: [...new Set(dayTeams)].filter((t) => known.has(t)),
        day,
        source: { type: 'random', day, index },
        createdAt,
      });
      await setDoc(ref, docData);
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `Neuer Beitrag: ${docData.title}` } }));
      return id;
    } catch (e) {
      console.error('Zufallsbeitrag fehlgeschlagen:', e);
      await this._fail(ref, e?.message || 'Unbekannter Fehler', this._modelOf(model));
      return null;
    } finally {
      const next = { ...this.busy };
      delete next[id];
      this.busy = next;
    }
  },

  // --- Neu im Pool ---------------------------------------------------------
  // Einmalig je Saison: Sobald der Pokémon-Pool Zugänge für eine Saison führt, ordnet
  // Scott sie ein. Ausgelöst wird das vom Bestand, nicht von einer Änderung — der
  // Beitrag entsteht also auch dann, wenn die Daten schon vor dem ersten Laden da waren.
  newcomerIdFor(season) {
    return `${seasonPrefix(season)}-newcomers`;
  },
  // Für welche Saisons gibt es Zugänge, zu denen noch kein Beitrag existiert?
  get missingNewcomers() {
    const l = Alpine.store('league');
    if (!l.pokemonLoaded || !this.articlesLoaded) return [];
    const seasons = [...new Set((l.pokemon || []).map((p) => Number(p?.since)).filter(Number.isFinite))];
    return seasons
      .sort((a, b) => a - b)
      .map((season) => ({ season, id: this.newcomerIdFor(season) }))
      .filter(({ id }) => {
        const a = this.byId(id);
        return !a || a.status === 'error';
      });
  },
  _watchNewcomers() {
    const l = Alpine.store('league');
    if (!l.pokemonLoaded || !l.teamsLoaded || !this.articlesLoaded || !this.hasKey) return;
    const next = this.missingNewcomers.find((row) => !pressTriedNewcomers.has(row.id));
    if (!next) return;
    pressTriedNewcomers.add(next.id);
    // Aus dem Effekt heraus verzögert: der Erzeuger schreibt reaktive Felder.
    setTimeout(() => this.generateNewcomers(next.season).catch(() => {}), 4000);
  },
  async generateNewcomers(season, { force = false, model = null } = {}) {
    if (!this.hasKey) return null;
    const l = Alpine.store('league');
    const list = newcomersOfSeason(l.pokemon || [], season);
    if (!list.length) return null;
    const id = this.newcomerIdFor(season);
    if (this.busy[id]) return null;
    const existing = this.byId(id);
    if (!force && existing && existing.status !== 'error') return null;

    const ref = doc(db, 'press', id);
    // Scouting und Transfers sind Scotts Ressort — hier schreibt kein anderer.
    const author = authorById('scott');
    const createdAt = new Date().toISOString();
    this.busy = { ...this.busy, [id]: true };

    try {
      const claimed = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists() && !force && snap.data()?.status !== 'error') return false;
        tx.set(ref, {
          season: l.season, category: 'informationen', categories: ['informationen', AI_CATEGORY],
          status: 'pending', authorId: author.id, teamIds: [], day: null, title: '', subtitle: '', body: '',
          source: { type: 'newcomers', season }, storylines: [], createdAt, publishedAt: createdAt, error: null,
        });
        return true;
      });
      if (!claimed) return null;

      const direction = buildDirection(this.recentArchetypes());
      const data = await generateJson({
        apiKey: this.apiKey,
        model: this._modelOf(model),
        system: buildSystem({ author }),
        prompt: buildUserPrompt({
          task: this.promptFor('newcomers'),
          direction: direction.text,
          context: this.contextFor({ newcomerSeason: season }),
          addendum: `ANLASS: Für Saison ${season} sind ${list.length} Pokémon neu im Draft-Pool. `
            + 'Der Block "neuImPool" in den Metadaten führt sie mit Tier, Punktwert, Typen und Initiative. '
            + 'Elo-Werte und Marktwerte gibt es für sie noch nicht, und auch die Tiers der bisherigen '
            + 'Pokémon stehen für die neue Saison noch nicht fest.',
        }),
        schema: ARTICLE_SCHEMA,
        maxOutputTokens: 12288,
      });

      const docData = this._articleDoc(data, {
        category: 'informationen',
        authorId: author.id,
        teamIds: [],
        day: null,
        source: { type: 'newcomers', season },
        createdAt,
      });
      await setDoc(ref, docData);
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `Neu im Pool: ${docData.title}` } }));
      return id;
    } catch (e) {
      console.error('Beitrag zu den Neuzugängen fehlgeschlagen:', e);
      await this._fail(ref, e?.message || 'Unbekannter Fehler', this._modelOf(model));
      return null;
    } finally {
      const next = { ...this.busy };
      delete next[id];
      this.busy = next;
    }
  },

  // --- Marktwert-Update ----------------------------------------------------
  marketIdFor(day) {
    return `${this.prefix}-market-d${day}`;
  },
  // Ein Spieltag ist „bewertet", wenn jede geplante Partie dieses Spieltags drei
  // fertige Kämpfe hat UND das Sheet eine Verlaufsspalte für den Spieltag führt.
  // Der zweite Teil ist der eigentliche Auslöser: er erscheint erst, wenn nach dem
  // letzten Spiel tatsächlich aktualisiert wurde.
  // `released` unterscheidet Automatik von Nachholen: die Automatik wartet auf die
  // Pressefreigabe, von Hand nachholen lässt sich jeder vollständige Spieltag.
  marketDaysReady({ released = true } = {}) {
    const l = Alpine.store('league');
    const rows = Alpine.store('elo')?.rows || [];
    if (!rows.length) return [];
    const ok = released ? isPressReleased : isMatchComplete;
    return (l.schedule?.matchdays || [])
      .filter((md) => (md.day ?? 0) >= PRESS_FROM_DAY)
      .filter((md) => {
        const matches = md.matches || [];
        if (!matches.length) return false;
        return matches.every((_, i) => {
          const r = (l.results || []).find((x) => x.id === matchDocId(md.day, i));
          return r && ok(r);
        });
      })
      .map((md) => md.day)
      .filter((day) => !!stopKeyForDay(rows, day));
  },
  get missingMarketUpdates() {
    return this.marketDaysReady({ released: false })
      .filter((day) => {
        const existing = this.byId(this.marketIdFor(day));
        return !existing || existing.status === 'error';
      })
      .map((day) => ({ day, id: this.marketIdFor(day) }));
  },
  _watchMarket() {
    const l = Alpine.store('league');
    const elo = Alpine.store('elo');
    if (!l.resultsLoaded || !l.scheduleLoaded || !l.teamsLoaded || !elo.loaded) return;
    // Reaktive Lesevorgänge, damit der Effekt bei neuen Sheet-Daten erneut läuft.
    void elo.rows.length;
    void elo.fetchedAt;
    const ready = new Set(this.marketDaysReady());
    const known = pressSeenMarket;
    pressSeenMarket = ready;
    if (known === null) return;
    if (!this.articlesLoaded || !this.hasKey) return;
    [...ready].filter((d) => !known.has(d))
      .forEach((day) => { setTimeout(() => this.generateMarketUpdate(day).catch(() => {}), 2500); });
  },

  /**
   * „Marktwert-Update nach Spieltag X" — ein Beitrag je Spieltag, sobald der
   * Spieltag komplett ist und das Sheet die neuen Werte führt.
   */
  async generateMarketUpdate(day, { force = false, model = null } = {}) {
    if (!this.hasKey) return null;
    const id = this.marketIdFor(day);
    if (this.busy[id]) return null;
    const existing = this.byId(id);
    if (!force && existing && existing.status !== 'error') return null;

    const ref = doc(db, 'press', id);
    const author = randomAuthor();
    const createdAt = new Date().toISOString();
    this.busy = { ...this.busy, [id]: true };

    try {
      const claimed = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists() && !force && snap.data()?.status !== 'error') return false;
        tx.set(ref, {
          season: Alpine.store('league').season, category: 'informationen', categories: ['informationen', AI_CATEGORY],
          status: 'pending', authorId: author.id, teamIds: [], day, title: '', subtitle: '', body: '',
          source: { type: 'market', day }, storylines: [], createdAt, publishedAt: createdAt, error: null,
        });
        return true;
      });
      if (!claimed) return null;

      const l = Alpine.store('league');
      const dayTeams = (l.schedule?.matchdays || [])
        .filter((md) => md.day === day)
        .flatMap((md) => (md.matches || []).flatMap((m) => [m.home, m.away]));
      const direction = buildDirection(this.recentArchetypes());
      const data = await generateJson({
        apiKey: this.apiKey,
        model: this._modelOf(model),
        system: buildSystem({ author }),
        prompt: buildUserPrompt({
          task: this.promptFor('marketUpdate'),
          direction: direction.text,
          context: this.contextFor({ teamIds: dayTeams, day, marketDay: day }),
          addendum: `ANLASS: Spieltag ${day} ist vollständig gespielt und die Marktwerte sind neu berechnet. `
            + 'Der Block "marktwerte" in den Metadaten enthält die Tier-Wechsel, die größten Gewinner und '
            + 'Verlierer sowie die Rangliste der Kaderwerte. Die Überschrift muss den Spieltag erkennbar machen.',
        }),
        schema: ARTICLE_SCHEMA,
        maxOutputTokens: 8192,
      });

      const known = new Set((l.teams || []).map((t) => t.id));
      const docData = this._articleDoc(data, {
        category: 'informationen',
        authorId: author.id,
        teamIds: [...new Set(dayTeams)].filter((t) => known.has(t)),
        day,
        source: { type: 'market', day },
        createdAt,
      });
      await setDoc(ref, docData);
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `Marktwert-Update nach Spieltag ${day} veröffentlicht.` } }));
      return id;
    } catch (e) {
      console.error('Marktwert-Update fehlgeschlagen:', e);
      await this._fail(ref, e?.message || 'Unbekannter Fehler', this._modelOf(model));
      return null;
    } finally {
      const next = { ...this.busy };
      delete next[id];
      this.busy = next;
    }
  },

  // --- Saisonende und Pause ------------------------------------------------
  // Der Pressebetrieb hört nicht mit dem letzten Spieltag auf: erst der große
  // Rückblick, dann ein Saisonzeugnis je Team, danach — im Takt der Ausblicks-
  // Pressekonferenzen — die freien Beiträge der Pause.
  get seasonDone() {
    const l = Alpine.store('league');
    return seasonComplete(l.schedule, l.results);
  },
  reviewId() {
    return `${this.prefix}-review`;
  },
  teamReviewId(teamId) {
    return `${this.prefix}-off-${teamId}`;
  },
  offseasonId(index) {
    return `${this.prefix}-off-free-${index + 1}`;
  },
  // Wie viele Teams haben ihre Ausblicksrunde hinter sich? Das ist der Taktgeber
  // für die freien Beiträge der Pause.
  get outlookDone() {
    const l = Alpine.store('league');
    return outlookProgress(
      (l.seasonTeams || []).map((t) => t.id),
      l.schedule, l.results, this.sessions,
    );
  },
  // Alles, was am Saisonende noch geschrieben werden will — in der Reihenfolge,
  // in der es erscheinen soll.
  get missingSeasonPress() {
    if (!this.seasonDone) return [];
    const l = Alpine.store('league');
    const out = [];
    const open = (id) => {
      const a = this.byId(id);
      return !a || a.status === 'error';
    };
    if (open(this.reviewId())) out.push({ kind: 'review', id: this.reviewId(), label: 'Saison-Rückblick' });
    (l.seasonTeams || []).forEach((t) => {
      const id = this.teamReviewId(t.id);
      if (open(id)) out.push({ kind: 'team', id, teamId: t.id, label: `Saisonzeugnis · ${t.name}` });
    });
    const unlocked = Math.min(OFFSEASON_ARTICLES, this.outlookDone.done);
    for (let i = 0; i < unlocked; i++) {
      const id = this.offseasonId(i);
      if (open(id)) out.push({ kind: 'offseason', id, index: i, label: `Beitrag aus der Pause ${i + 1}` });
    }
    return out;
  },
  _watchSeasonEnd() {
    const l = Alpine.store('league');
    if (!l.resultsLoaded || !l.scheduleLoaded || !l.teamsLoaded) return;
    // Reaktive Lesevorgänge: Ergebnisse und erledigte Ausblicksrunden.
    const done = this.seasonDone;
    const outlook = this.outlookDone.done;
    const known = pressSeenSeasonEnd;
    pressSeenSeasonEnd = { done, outlook };
    if (known === null) return;
    if (!this.articlesLoaded || !this.hasKey) return;
    // Nur bei einer echten Veränderung loslegen — sonst schreibt jeder Snapshot mit.
    if (known.done === done && known.outlook === outlook) return;
    if (!done) return;
    setTimeout(() => this.fillSeasonPress().catch(() => {}), 3000);
  },
  async fillSeasonPress() {
    // Nacheinander: die Beiträge bauen aufeinander auf, und drei parallele Aufrufe
    // würden dieselbe Geschichte dreimal erzählen.
    for (const row of this.missingSeasonPress) {
      if (row.kind === 'review') await this.generateSeasonReview().catch(() => null);
      else if (row.kind === 'team') await this.generateTeamReview(row.teamId).catch(() => null);
      else await this.generateOffseasonArticle(row.index).catch(() => null);
    }
  },

  // Gemeinsamer Ablauf für alle drei Sorten: Platz per Transaktion belegen,
  // schreiben lassen, Dokument ersetzen.
  async _generateSeasonPiece({ id, category, teamIds, sourceType, sourceExtra = {}, promptKey, addendum, maxOutputTokens = 8192, force = false, model = null, toast }) {
    if (!this.hasKey) return null;
    if (this.busy[id]) return null;
    const existing = this.byId(id);
    if (!force && existing && existing.status !== 'error') return null;

    const l = Alpine.store('league');
    const ref = doc(db, 'press', id);
    const author = randomAuthor();
    const createdAt = new Date().toISOString();
    this.busy = { ...this.busy, [id]: true };

    try {
      const claimed = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists() && !force && snap.data()?.status !== 'error') return false;
        tx.set(ref, {
          season: l.season, category, categories: [category, AI_CATEGORY], status: 'pending',
          authorId: author.id, teamIds, day: null, title: '', subtitle: '', body: '',
          source: { type: sourceType, season: l.season, ...sourceExtra }, storylines: [], createdAt, publishedAt: createdAt, error: null,
        });
        return true;
      });
      if (!claimed) return null;

      const direction = buildDirection(this.recentArchetypes());
      const data = await generateJson({
        apiKey: this.apiKey,
        model: this._modelOf(model),
        system: buildSystem({ author }),
        prompt: buildUserPrompt({
          task: this.promptFor(promptKey),
          direction: direction.text,
          context: this.contextFor({ teamIds, seasonEnd: true }),
          addendum,
        }),
        schema: promptKey === 'offseason' ? ARTICLE_SCHEMA_FREE_CATEGORY : ARTICLE_SCHEMA,
        maxOutputTokens,
      });

      const known = new Set((l.teams || []).map((t) => t.id));
      const docData = this._articleDoc(data, {
        category: promptKey === 'offseason'
          ? (['news', 'klatsch', 'geruechte', 'informationen'].includes(data.kategorie) ? data.kategorie : 'news')
          : category,
        authorId: author.id,
        teamIds: teamIds.filter((t) => known.has(t)),
        day: null,
        source: { type: sourceType, season: l.season, ...sourceExtra },
        createdAt,
      });
      await setDoc(ref, docData);
      if (toast) window.dispatchEvent(new CustomEvent('toast', { detail: { msg: toast(docData) } }));
      return id;
    } catch (e) {
      console.error('Saisonbeitrag fehlgeschlagen:', e);
      await this._fail(ref, e?.message || 'Unbekannter Fehler', this._modelOf(model));
      return null;
    } finally {
      const next = { ...this.busy };
      delete next[id];
      this.busy = next;
    }
  },

  /** Der große Rückblick — ein Text, der die ganze Saison in Kapiteln erzählt. */
  async generateSeasonReview({ force = false, model = null } = {}) {
    const l = Alpine.store('league');
    if (!this.seasonDone) return null;
    return this._generateSeasonPiece({
      id: this.reviewId(),
      category: 'informationen',
      teamIds: (l.seasonTeams || []).map((t) => t.id),
      sourceType: 'review',
      promptKey: 'seasonReview',
      // Deutlich mehr Platz als ein normaler Beitrag — das hier ist der Langtext.
      maxOutputTokens: 24576,
      addendum: `ANLASS: Saison ${l.season} ist zu Ende. Dies ist DER Rückblick auf die Spielzeit — `
        + 'der Block "saisonabschluss" in den Metadaten enthält die Endtabelle und jede Geschichte, '
        + 'die im Lauf der Saison eröffnet wurde. Keine davon darf unerwähnt bleiben.',
      force,
      model,
      toast: () => `Saison-Rückblick veröffentlicht.`,
    });
  },

  /** Ein Saisonzeugnis je Team. */
  async generateTeamReview(teamId, { force = false, model = null } = {}) {
    const l = Alpine.store('league');
    if (!this.seasonDone) return null;
    const team = (l.teams || []).find((t) => t.id === teamId);
    if (!team) return null;
    return this._generateSeasonPiece({
      id: this.teamReviewId(teamId),
      category: 'news',
      teamIds: [teamId],
      sourceType: 'teamReview',
      // Die Team-ID gehört in die Quelle: ohne sie wüsste ein späterer Anlauf nicht,
      // für welches Team das Zeugnis war.
      sourceExtra: { teamId },
      promptKey: 'seasonTeamReview',
      addendum: `ANLASS: Saisonzeugnis für ${team.name}. Die Saison ist abgeschlossen; `
        + 'der Beitrag bewertet ausschließlich dieses Team und blickt auf Transferfenster und Draft voraus.',
      force,
      model,
      toast: (d) => `Saisonzeugnis: ${d.title}`,
    });
  },

  /** Ein freier Beitrag aus der Pause. */
  async generateOffseasonArticle(index, { force = false, model = null } = {}) {
    const l = Alpine.store('league');
    if (!this.seasonDone) return null;
    return this._generateSeasonPiece({
      id: this.offseasonId(index),
      category: 'news',
      teamIds: (l.seasonTeams || []).map((t) => t.id),
      sourceType: 'offseason',
      sourceExtra: { index },
      promptKey: 'offseason',
      addendum: `ANLASS: Die Liga ist in der Pause. ${this.outlookDone.done} von ${this.outlookDone.total} Teams `
        + `waren bereits zur Ausblicks-Pressekonferenz. Dies ist der ${index + 1}. von ${OFFSEASON_ARTICLES} `
        + 'Beiträgen der Pause — such dir ein Thema, das die anderen noch nicht hatten.',
      force,
      model,
      toast: (d) => `Neuer Beitrag: ${d.title}`,
    });
  },

  // Matches mit vollständigem Ergebnis, zu denen noch kein Bericht existiert —
  // erst ab dem Spieltag, mit dem der Pressebetrieb aufgenommen wurde.
  get missingReports() {
    const l = Alpine.store('league');
    return (l.results || [])
      .filter((r) => (r.day ?? 0) >= PRESS_FROM_DAY && isMatchComplete(r) && !this.byId(this.reportIdFor(r.id)))
      .sort((a, b) => (a.day || 0) - (b.day || 0) || String(a.id).localeCompare(String(b.id)));
  },
  // Vollständig eingetragen, aber noch nicht freigegeben. Solange ein Match hier
  // steht, rührt die Automatik es nicht an — das erklärt, warum nichts entsteht.
  get awaitingRelease() {
    const l = Alpine.store('league');
    return (l.results || [])
      .filter((r) => (r.day ?? 0) >= PRESS_FROM_DAY && isMatchComplete(r) && !r.pressReady)
      .sort((a, b) => (a.day || 0) - (b.day || 0) || String(a.id).localeCompare(String(b.id)));
  },

  // --- Beiträge schreiben --------------------------------------------------
  // Die Antwort des Modells in ein Beitragsdokument übersetzen. Team-IDs und
  // Pokémon-Namen werden gegen die Stammdaten geprüft, damit nichts Erfundenes
  // in die Verlinkungen gerät.
  _articleDoc(data, meta) {
    const l = Alpine.store('league');
    const knownTeams = new Set((l.teams || []).map((t) => t.id));
    const knownMons = new Set((l.pokemon || []).map((p) => p.name));
    const teamIds = [...new Set([...(meta.teamIds || [])])].filter((id) => knownTeams.has(id));
    const storylines = (data.storylines || [])
      .filter((s) => s && (s.id || s.titel))
      .slice(0, 4)
      .map((s) => ({
        id: storyId(s.id || s.titel),
        title: String(s.titel || '').trim() || storyId(s.id),
        teams: (s.teams || []).filter((id) => knownTeams.has(id)),
        status: ['neu', 'laufend', 'eskaliert', 'beruhigt', 'beendet'].includes(s.status) ? s.status : 'laufend',
        summary: String(s.stand || '').trim(),
      }));
    // Alles, was hier entsteht, ist KI-geschrieben — und steht damit zusätzlich in
    // der Rubrik „Erste Liga".
    const cats = normalizeCategories(meta.category, [...(meta.categories || []), AI_CATEGORY]);
    return {
      season: l.season,
      category: cats.category,
      categories: cats.categories,
      editorial: !!meta.editorial,
      title: String(data.titel || '').trim() || 'Ohne Titel',
      subtitle: String(data.dachzeile || '').trim(),
      body: sanitizeHtml(paragraphsToHtml(data.absaetze)),
      authorId: meta.authorId,
      teamIds,
      pokemonNames: (data.erwaehntePokemon || []).filter((n) => knownMons.has(n)).slice(0, 12),
      day: meta.day ?? null,
      archetype: data.archetyp ? storyId(data.archetyp) : null,
      storylines,
      source: meta.source || { type: 'manual' },
      status: 'ready',
      error: null,
      createdAt: meta.createdAt || new Date().toISOString(),
      publishedAt: new Date().toISOString(),
    };
  },

  // Ein gescheiterter Beitrag merkt sich, mit WELCHEM Modell er gescheitert ist —
  // nur so kann der Wiederholungs-Knopf ein anderes anbieten.
  async _fail(ref, message, model = null) {
    this.lastError = message;
    try {
      await setDoc(ref, {
        status: 'error', error: message, errorModel: model || this.model,
        publishedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) { /* wenn selbst das scheitert, bleibt nur die Meldung in der Ansicht */ }
  },

  // --- Wiederholung nach einem Fehlschlag ----------------------------------
  // Ein Modell-Kürzel, das es nicht (mehr) gibt, fällt auf das eingestellte zurück.
  _modelOf(model) {
    return GEMINI_MODELS.some((m) => m.id === model) ? model : this.model;
  },
  modelLabel(id) {
    return GEMINI_MODELS.find((m) => m.id === id)?.label || id || '—';
  },
  /**
   * Einen gescheiterten Beitrag neu schreiben lassen — egal, woher er stammt.
   * Die Quelle im Dokument sagt, welcher Erzeuger zuständig ist; `model` erlaubt
   * dabei ein anderes Modell als das eingestellte.
   */
  async retryArticle(id, model = null) {
    const a = this.byId(id);
    if (!a) return null;
    const src = a.source || {};
    const opts = { force: true, model };
    switch (src.type) {
      case 'match': return this.generateReport(src.matchId, opts);
      case 'random': return this.generateRandomArticle(src.day, src.index, opts);
      case 'market': return this.generateMarketUpdate(src.day, opts);
      case 'review': return this.generateSeasonReview(opts);
      case 'teamReview': return this.generateTeamReview(src.teamId || a.teamIds?.[0], opts);
      case 'offseason': return this.generateOffseasonArticle(src.index, opts);
      case 'commission': return this.generateCommissioned(id, opts);
      case 'newcomers': return this.generateNewcomers(src.season, opts);
      case 'pk':
      case 'interview': return this.retrySession(src.sessionId, model);
      default: return null;
    }
  },
  // Kann dieser Beitrag überhaupt neu geschrieben werden? Redaktionelle Beiträge
  // von Hand (`manual`) nicht — dort gibt es nichts zu wiederholen.
  canRetry(a) {
    const type = a?.source?.type;
    if (!type || type === 'manual') return false;
    if ((type === 'pk' || type === 'interview')) return !!this.sessionById(a.source.sessionId);
    return true;
  },
  /**
   * Einen Termin neu aufsetzen. Liegen schon Antworten vor, wird nur der Beitrag
   * neu geschrieben — die Fragen und die gegebenen Antworten bleiben erhalten.
   */
  async retrySession(sessionId, model = null) {
    const s = this.sessionById(sessionId);
    if (!s) return null;
    if ((s.answers || []).length && (s.questions || []).length) {
      return this.submitAnswers(sessionId, s.answers, { model });
    }
    if (!s.role) return null;
    return this.startSession(
      { id: sessionId, day: s.day, teamId: s.teamId, opponentId: s.opponentId, matchId: s.matchId, type: s.type, slot: s.slot },
      s.role,
      { model },
    );
  },

  /**
   * Spielbericht zu einem abgeschlossenen Match.
   * Der Platz im Regal wird per Transaktion belegt, damit nicht beide Geräte
   * gleichzeitig losschreiben, wenn beide gerade offen sind.
   */
  async generateReport(matchId, { force = false, model = null } = {}) {
    const l = Alpine.store('league');
    const result = (l.results || []).find((r) => r.id === matchId);
    if (!result || !isMatchComplete(result)) return null;
    if (!this.hasKey) return null;

    const id = this.reportIdFor(matchId);
    if (this.busy[id]) return null;
    if (!force && this.byId(id)) return null;

    const ref = doc(db, 'press', id);
    const author = randomAuthor();
    const createdAt = new Date().toISOString();
    this.busy = { ...this.busy, [id]: true };

    try {
      const claimed = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists() && !force && snap.data()?.status !== 'error') return false;
        tx.set(ref, {
          season: l.season, category: 'spielbericht', status: 'pending', authorId: author.id,
          teamIds: [result.home, result.away], day: result.day ?? null, title: '', subtitle: '', body: '',
          source: { type: 'match', matchId }, storylines: [], createdAt, publishedAt: createdAt, error: null,
        });
        return true;
      });
      if (!claimed) return null;

      const direction = buildDirection(this.recentArchetypes());
      const data = await generateJson({
        apiKey: this.apiKey,
        model: this._modelOf(model),
        system: buildSystem({ author }),
        prompt: buildUserPrompt({
          task: this.promptFor('report'),
          direction: direction.text,
          context: this.contextFor({ teamIds: [result.home, result.away], matchId, day: result.day }),
        }),
        schema: ARTICLE_SCHEMA,
        maxOutputTokens: 8192,
      });

      const docData = this._articleDoc(data, {
        category: 'spielbericht',
        authorId: author.id,
        teamIds: [result.home, result.away],
        day: result.day ?? null,
        source: { type: 'match', matchId },
        createdAt,
      });
      await setDoc(ref, docData);
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `Neuer Spielbericht: ${docData.title}` } }));
      return id;
    } catch (e) {
      console.error('Spielbericht fehlgeschlagen:', e);
      await this._fail(ref, e?.message || 'Unbekannter Fehler', this._modelOf(model));
      return null;
    } finally {
      const next = { ...this.busy };
      delete next[id];
      this.busy = next;
    }
  },

  // --- Interview & Pressekonferenz -----------------------------------------
  /**
   * Fragen erzeugen und die Sitzung eröffnen.
   * @param {object} slot  Eintrag aus pressSlots()
   * @param {object} role  { kind:'trainer'|'pokemon', name, image, traits[] }
   */
  async startSession(slot, role, { model = null } = {}) {
    if (!this.hasKey || !slot || !role) return null;
    const id = slot.id;
    if (this.busy[id]) return null;
    const ref = doc(db, 'pressSessions', id);
    const l = Alpine.store('league');
    const team = (l.teams || []).find((t) => t.id === slot.teamId);
    const isPk = slot.type === 'pk';
    // Die Ausblicksrunde nach der Saison hat mehr Fragen als ein normaler Termin.
    const count = slot.slot === 'outlook' ? OUTLOOK_QUESTIONS : 3;
    // Ein Gesicht im Einzelinterview, mehrere auf dem Podium der Pressekonferenz.
    // Mehr Fragen als Gesichter ist erlaubt — dann fragt jemand zweimal.
    const cast = isPk ? randomAuthors(Math.min(count, PRESS_AUTHORS.length)) : [randomAuthor()];
    // Vorgabe für die Fragenhärte: in der Pressekonferenz je Frage rund 35 Prozent,
    // in der Ausblicksrunde sind zwei der fünf Fragen fest provokant.
    const spicy = slot.slot === 'outlook'
      ? shuffle(Array.from({ length: count }, (_, i) => i < 2))
      : isPk ? Array.from({ length: count }, () => Math.random() < 0.35) : Array.from({ length: count }, () => true);
    const createdAt = new Date().toISOString();

    this.busy = { ...this.busy, [id]: true };
    try {
      await setDoc(ref, {
        season: l.season, day: slot.day, teamId: slot.teamId, opponentId: slot.opponentId || null,
        matchId: slot.matchId, type: slot.type, slot: slot.slot, role,
        authorIds: cast.map((a) => a.id), questions: [], answers: [],
        status: 'generating', articleId: null, error: null, createdAt, updatedAt: createdAt,
      });

      const context = this.contextFor({
        teamIds: [slot.teamId, slot.opponentId].filter(Boolean),
        matchId: slot.slot === 'post' ? slot.matchId : null,
        day: slot.day,
      });
      const direction = buildDirection(this.recentArchetypes());
      const addendum = [
        `SITUATION: ${typeLabel(slot.type)} von ${team?.name || slot.teamId}. ${situationLine(slot)}`,
        `BEFRAGT WIRD: ${role.kind === 'trainer' ? `Trainer ${role.name}` : `das Pokémon ${role.name} aus dem Kader`}`
          + `${role.traits?.length ? ` — Persönlichkeit: ${role.traits.join(', ')}` : ''}.`
          + (role.kind === 'pokemon' ? ' Pokémon geben in dieser Liga selbst Auskunft; sprich es direkt an.' : ''),
        `FRAGESTELLER (${count} Fragen in dieser Reihenfolge, autorId exakt übernehmen):`,
        ...Array.from({ length: count }, (_, i) => {
          const a = cast[i % cast.length];
          return `  ${i + 1}. autorId "${a.id}" — ${a.name}, ${a.role} bei ${a.outlet}. Ressort: ${a.beat}. `
            + `Diese Frage ist ${spicy[i] ? 'PROVOKANT' : 'SACHLICH'} (Feld "provokant" entsprechend setzen).`;
        }),
      ].join('\n');

      const data = await generateJson({
        apiKey: this.apiKey,
        model: this._modelOf(model),
        system: buildSystem({ author: isPk ? null : cast[0], extra: isPk ? 'Du moderierst die Pressekonferenz und formulierst die Fragen der anwesenden Pressevertreter in deren jeweiliger Handschrift.' : '' }),
        prompt: buildUserPrompt({
          task: this.promptFor(slot.slot === 'outlook' ? 'outlookQuestions' : isPk ? 'pkQuestions' : 'interviewQuestions'),
          direction: direction.text,
          context,
          addendum,
        }),
        schema: QUESTIONS_SCHEMA,
        maxOutputTokens: 6144,
      });

      const questions = (data.fragen || []).slice(0, count).map((q, i) => ({
        id: `q${i + 1}`,
        authorId: cast.find((a) => a.id === q.autorId)?.id || cast[i % cast.length].id,
        topic: String(q.thema || '').trim(),
        text: String(q.frage || '').trim(),
        provocative: isPk ? !!spicy[i] : true,
        options: (q.antwortvorschlaege || []).slice(0, 3).map((o) => ({
          stance: ['souveraen', 'ausweichend', 'angriff'].includes(o?.haltung) ? o.haltung : 'souveraen',
          text: String(o?.text || '').trim(),
        })).filter((o) => o.text),
      })).filter((q) => q.text);

      if (questions.length < count) throw new Error(`Es kamen weniger als ${count} Fragen zurück.`);
      await setDoc(ref, { questions, status: 'open', updatedAt: new Date().toISOString() }, { merge: true });
      return id;
    } catch (e) {
      console.error('Fragen konnten nicht erzeugt werden:', e);
      this.lastError = e?.message || 'Unbekannter Fehler';
      await setDoc(ref, { status: 'error', error: this.lastError, errorModel: this._modelOf(model), updatedAt: new Date().toISOString() }, { merge: true });
      return null;
    } finally {
      const next = { ...this.busy };
      delete next[id];
      this.busy = next;
    }
  },

  /** Antworten abgeben und daraus den Beitrag schreiben lassen. */
  async submitAnswers(sessionId, answers, { model = null } = {}) {
    const session = this.sessionById(sessionId);
    if (!session || !this.hasKey) return null;
    if (this.busy[sessionId]) return null;
    const ref = doc(db, 'pressSessions', sessionId);
    const l = Alpine.store('league');
    const team = (l.teams || []).find((t) => t.id === session.teamId);
    const isPk = session.type === 'pk';
    const lead = authorById(session.authorIds?.[0]);
    // Beitrags-ID aus der Sitzungs-ID: so kollidiert die Auftaktrunde nicht mit den
    // regulären Terminen desselben Spieltags.
    const articleId = `${l.prefix}-art-${String(sessionId).replace(/^s\d+-/, '')}`;
    const articleRef = doc(db, 'press', articleId);
    const createdAt = new Date().toISOString();

    this.busy = { ...this.busy, [sessionId]: true };
    try {
      await setDoc(ref, { answers, status: 'writing', updatedAt: createdAt }, { merge: true });
      await setDoc(articleRef, {
        season: l.season, category: isPk ? 'news' : 'klatsch', status: 'pending', authorId: lead.id,
        teamIds: [session.teamId], day: session.day ?? null, title: '', subtitle: '', body: '',
        source: { type: isPk ? 'pk' : 'interview', sessionId }, storylines: [],
        createdAt, publishedAt: createdAt, error: null,
      });

      const transcript = (session.questions || []).map((q, i) => {
        const a = answers.find((x) => x.questionId === q.id) || {};
        const author = authorById(q.authorId);
        return [
          `FRAGE ${i + 1} (${author.name}, ${author.outlet}${q.provocative ? ', bewusst provokant' : ''}):`,
          `  ${q.text}`,
          `ANTWORT (${session.role?.kind === 'trainer' ? `Trainer ${session.role?.name}` : session.role?.name}${a.custom ? ', frei formuliert' : `, gewählte Haltung: ${a.stance || 'unbekannt'}`}):`,
          `  ${a.text || '(keine Antwort)'}`,
        ].join('\n');
      }).join('\n\n');

      const direction = buildDirection(this.recentArchetypes());
      const addendum = [
        `SITUATION: ${typeLabel(session.type)} von ${team?.name || session.teamId}. ${situationLine(session)}`,
        `BEFRAGT WURDE: ${session.role?.kind === 'trainer' ? `Trainer ${session.role?.name}` : `das Pokémon ${session.role?.name}`}`
          + `${session.role?.traits?.length ? ` (${session.role.traits.join(', ')})` : ''}.`,
        `ANWESENDE PRESSEVERTRETER: ${(session.authorIds || []).map((x) => authorById(x).name).join(', ')}.`,
        session.slot === 'outlook'
          ? 'ANLASS: Die Ausblicksrunde nach der Saison. Der Beitrag arbeitet heraus, was sich das Team '
            + 'für Transferfenster und Draft vorgenommen hat — und hält jede Festlegung so fest, dass '
            + 'sie später zitierbar ist. Nichts davon ist beschlossen; es sind Absichten.'
          : '',
        '',
        'WORTPROTOKOLL:',
        transcript,
      ].filter(Boolean).join('\n');

      const data = await generateJson({
        apiKey: this.apiKey,
        model: this._modelOf(model),
        system: buildSystem({ author: lead }),
        prompt: buildUserPrompt({
          task: this.promptFor(isPk ? 'pkArticle' : 'interviewArticle'),
          direction: direction.text,
          context: this.contextFor({
            teamIds: [session.teamId, session.opponentId].filter(Boolean),
            matchId: session.slot === 'post' ? session.matchId : null,
            day: session.day,
          }),
          addendum,
        }),
        schema: isPk ? ARTICLE_SCHEMA_WITH_CATEGORY : ARTICLE_SCHEMA,
        maxOutputTokens: 8192,
      });

      const docData = this._articleDoc(data, {
        category: isPk ? (data.kategorie === 'klatsch' ? 'klatsch' : 'news') : 'klatsch',
        authorId: lead.id,
        teamIds: [session.teamId, session.opponentId].filter(Boolean),
        day: session.day ?? null,
        source: { type: isPk ? 'pk' : 'interview', sessionId },
        createdAt,
      });
      await setDoc(articleRef, docData);
      await setDoc(ref, { status: 'done', articleId, updatedAt: new Date().toISOString() }, { merge: true });
      return articleId;
    } catch (e) {
      console.error('Beitrag konnte nicht erzeugt werden:', e);
      this.lastError = e?.message || 'Unbekannter Fehler';
      await setDoc(ref, { status: 'error', error: this.lastError, errorModel: this._modelOf(model), updatedAt: new Date().toISOString() }, { merge: true });
      await this._fail(articleRef, this.lastError, this._modelOf(model));
      return null;
    } finally {
      const next = { ...this.busy };
      delete next[sessionId];
      this.busy = next;
    }
  },

  // Eine Sitzung verwerfen (z. B. nach einem Fehlschlag), damit sie neu starten kann.
  async resetSession(sessionId) {
    try {
      await deleteDoc(doc(db, 'pressSessions', sessionId));
    } catch (e) {
      console.error('Sitzung konnte nicht zurückgesetzt werden:', e);
    }
  },

  // --- Redaktionelle Beiträge der Spieler ----------------------------------
  async publishEditorial(input) {
    const id = input.id || `${this.prefix}-ed-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
    const existing = input.id ? this.byId(input.id) : null;
    const body = sanitizeHtml(input.body || '');
    const cats = normalizeCategories(input.category || 'redaktion', input.categories || []);
    await setDoc(doc(db, 'press', id), {
      season: Alpine.store('league')?.season || 1,
      category: cats.category,
      categories: cats.categories,
      editorial: true,
      title: String(input.title || '').trim() || 'Ohne Titel',
      subtitle: String(input.subtitle || '').trim(),
      body,
      authorId: input.authorId || PRESS_AUTHORS[0].id,
      teamIds: input.teamIds || [],
      pokemonNames: [],
      day: input.day ?? null,
      archetype: null,
      storylines: [],
      source: { type: 'manual' },
      status: 'ready',
      error: null,
      createdAt: existing?.createdAt || new Date().toISOString(),
      publishedAt: existing?.publishedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return id;
  },

  async deleteArticle(id) {
    await deleteDoc(doc(db, 'press', id));
  },

  // --- Dauerhafte Referenz --------------------------------------------------
  // Ein so markierter Beitrag geht in JEDEN weiteren Kontext ein, egal wie alt er
  // ist und wie viel seither geschrieben wurde. Gedacht für Erklärstücke („Wie
  // funktioniert die Liga?"), die sonst nach ein paar Spieltagen aus dem Kontext
  // fallen und damit für immer weg sind.
  async setReference(id, on) {
    if (!id) return;
    await setDoc(doc(db, 'press', id), { reference: !!on }, { merge: true });
  },
  isReferenceArticle(a) {
    return isReference(a);
  },

  // --- Auftragsbeitrag ------------------------------------------------------
  /**
   * Einen Beitrag mit frei formuliertem Auftrag schreiben lassen.
   * Der Auftragstext bleibt an der Quelle des Dokuments stehen — nur so kann ein
   * späterer Anlauf dieselbe Vorgabe noch einmal verwenden.
   */
  async commissionArticle({ brief, teamIds = [], day = null, authorId = null, model = null } = {}) {
    const text = String(brief || '').trim();
    if (!text || !this.hasKey) return null;
    const id = `${this.prefix}-cmd-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
    const l = Alpine.store('league');
    const known = new Set((l.teams || []).map((t) => t.id));
    const author = (authorId && PRESS_AUTHORS.find((a) => a.id === authorId)) || randomAuthor();
    await setDoc(doc(db, 'press', id), {
      season: l.season, category: 'news', categories: ['news', AI_CATEGORY], status: 'pending',
      authorId: author.id, teamIds: teamIds.filter((t) => known.has(t)), day, title: '', subtitle: '', body: '',
      source: { type: 'commission', brief: text, authorId: author.id, teamIds, day },
      storylines: [], createdAt: new Date().toISOString(), publishedAt: new Date().toISOString(), error: null,
    });
    return this.generateCommissioned(id, { force: true, model });
  },

  async generateCommissioned(id, { force = false, model = null } = {}) {
    if (!this.hasKey || !id) return null;
    if (this.busy[id]) return null;
    const existing = this.byId(id);
    const src = existing?.source || {};
    const brief = String(src.brief || '').trim();
    if (!brief) return null;
    if (!force && existing && existing.status === 'ready') return null;

    const l = Alpine.store('league');
    const ref = doc(db, 'press', id);
    const author = authorById(src.authorId) || randomAuthor();
    const createdAt = existing?.createdAt || new Date().toISOString();
    const teamIds = (src.teamIds || []).filter(Boolean);
    const day = src.day ?? null;
    this.busy = { ...this.busy, [id]: true };

    try {
      const direction = buildDirection(this.recentArchetypes());
      const data = await generateJson({
        apiKey: this.apiKey,
        model: this._modelOf(model),
        system: buildSystem({ author }),
        prompt: buildUserPrompt({
          task: this.promptFor('commission'),
          direction: direction.text,
          context: this.contextFor({ teamIds, day }),
          addendum: `AUFTRAG DER REDAKTIONSLEITUNG (wörtlich):\n${brief}`,
        }),
        schema: ARTICLE_SCHEMA_FREE_CATEGORY,
        maxOutputTokens: 8192,
      });

      const known = new Set((l.teams || []).map((t) => t.id));
      const docData = this._articleDoc(data, {
        category: ['news', 'klatsch', 'geruechte', 'informationen'].includes(data.kategorie) ? data.kategorie : 'news',
        authorId: author.id,
        teamIds: teamIds.filter((t) => known.has(t)),
        day,
        source: { type: 'commission', brief, authorId: author.id, teamIds, day },
        createdAt,
      });
      await setDoc(ref, docData);
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: `Auftragsbeitrag: ${docData.title}` } }));
      return id;
    } catch (e) {
      console.error('Auftragsbeitrag fehlgeschlagen:', e);
      await this._fail(ref, e?.message || 'Unbekannter Fehler', this._modelOf(model));
      return null;
    } finally {
      const next = { ...this.busy };
      delete next[id];
      this.busy = next;
    }
  },
});

// === Notizen ================================================================
// Private Freitexte zu Teams und Matches. Sie liegen verschlüsselt im privaten
// Dokument des angemeldeten Spielers — der andere sieht in der Datenbank nur Chiffrat.
Alpine.store('notes', {
  data: blankNotes(),
  loaded: false,
  loading: false,
  saving: false,
  lastError: null,
  _timer: null,
  _pending: null,

  get available() { return Alpine.store('auth').isLoggedIn; },

  async ensureLoaded() {
    if (this.loaded || this.loading || !this.available) return;
    this.loading = true;
    try {
      this.data = normalizeNotes(await Alpine.store('auth').loadPrivate(NOTE_SCOPE));
      this.loaded = true;
    } catch (e) {
      console.error('Notizen konnten nicht geladen werden:', e);
      this.lastError = 'Die Notizen konnten nicht geladen werden.';
    } finally {
      this.loading = false;
    }
  },

  teamNote(teamId) { return teamNote(this.data, teamId); },
  matchNote(matchId) { return matchNote(this.data, matchId); },
  hasTeamNote(teamId) { return !!this.teamNote(teamId).trim(); },
  hasMatchNote(matchId) { return !!this.matchNote(matchId).trim(); },
  get count() { return countNotes(this.data); },

  // Tippen erzeugt viele Änderungen — gebündelt und verzögert speichern.
  set(kind, id, text) {
    if (!this.available) return;
    this.data = withNote(this.data, kind, id, text);
    this._pending = this.data;
    this.saving = true;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 1200);
  },

  async flush() {
    clearTimeout(this._timer);
    if (!this._pending || !this.available) { this.saving = false; return; }
    const payload = this._pending;
    this._pending = null;
    try {
      await Alpine.store('auth').savePrivate(NOTE_SCOPE, payload);
      this.lastError = null;
    } catch (e) {
      console.error('Notiz konnte nicht gespeichert werden:', e);
      this.lastError = 'Die Notiz konnte nicht gespeichert werden.';
    } finally {
      this.saving = false;
    }
  },
});

// === Kampfverlauf ===========================================================
// Anders als die Notizen ist der Kampfverlauf GETEILT: beide Spieler führen einen
// eigenen Abschnitt und dürfen beide lesen. Er ist Gedächtnisstütze für die Rückrunde
// und Detailquelle für die Presse — deshalb liegt er im Klartext.
Alpine.store('battleLogs', {
  logs: [],
  loaded: false,
  saving: false,
  lastError: null,

  init() {
    onSnapshot(
      collection(db, 'battleLogs'),
      (snap) => {
        this.logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        this.loaded = true;
      },
      (err) => {
        console.error('battleLogs-Collection nicht lesbar:', err);
        this.loaded = true;
      },
    );
  },

  byId(matchId) { return this.logs.find((l) => l.id === matchId) || null; },
  textFor(matchId, player) { return logText(this.byId(matchId), player); },
  updatedAtFor(matchId, player) { return logUpdatedAt(this.byId(matchId), player); },
  has(matchId) { return hasLog(this.byId(matchId)); },
  authorsFor(matchId) { return logAuthors(this.byId(matchId)); },
  plainFor(matchId) { return logToText(this.byId(matchId)); },

  async save(matchId, player, text, meta = {}) {
    if (!matchId || !player) return false;
    this.saving = true;
    try {
      await setDoc(
        doc(db, 'battleLogs', matchId),
        {
          ...blankLog(matchId, meta),
          entries: { [player]: { text: String(text || ''), updatedAt: new Date().toISOString() } },
        },
        { merge: true },
      );
      this.lastError = null;
      return true;
    } catch (e) {
      console.error('Kampfverlauf konnte nicht gespeichert werden:', e);
      this.lastError = 'Der Kampfverlauf konnte nicht gespeichert werden.';
      return false;
    } finally {
      this.saving = false;
    }
  },
});

// === Teambuilder-Sync =======================================================
// Spiegelt die gerätelokalen Teambuilder-Daten verschlüsselt in die Datenbank, damit
// sie auf jedem Gerät bereitstehen — und nur für den eigenen Spieler lesbar sind.
Alpine.store('tbsync', {
  auto: false,
  busy: false,
  lastError: null,
  uploadedAt: null,
  remoteAt: null,
  checked: false,
  _timer: null,

  init() {
    this.auto = !!loadJson(SYNC_AUTO_KEY).auto;
    syncHook = () => this.schedule();
  },

  setAuto(on) {
    this.auto = !!on;
    saveJson(SYNC_AUTO_KEY, { auto: this.auto });
    if (this.auto) this.schedule();
  },

  // Schreibvorgänge kommen in Serie (Tippen im Moveset, Farbklicks) — deshalb
  // gebündelt und verzögert hochladen.
  schedule() {
    if (!this.auto || !Alpine.store('auth').isLoggedIn) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.upload({ silent: true }), 2500);
  },

  snapshot() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!isSyncedKey(key)) continue;
      data[key] = localStorage.getItem(key);
    }
    return data;
  },

  get localCount() { return Object.keys(this.snapshot()).length; },

  async upload({ silent = false } = {}) {
    const auth = Alpine.store('auth');
    if (!auth.isLoggedIn || this.busy) return false;
    this.busy = true;
    this.lastError = null;
    try {
      const payload = { savedAt: new Date().toISOString(), entries: this.snapshot() };
      await auth.savePrivate(SYNC_SCOPE, payload);
      this.uploadedAt = payload.savedAt;
      this.remoteAt = payload.savedAt;
      this.checked = true;
      if (!silent) window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Teambuilder-Daten gesichert.' } }));
      return true;
    } catch (e) {
      console.error('Teambuilder-Sync fehlgeschlagen:', e);
      this.lastError = 'Die Daten konnten nicht gesichert werden.';
      if (!silent) window.dispatchEvent(new CustomEvent('toast', { detail: { msg: this.lastError } }));
      return false;
    } finally {
      this.busy = false;
    }
  },

  async peek() {
    const auth = Alpine.store('auth');
    if (!auth.isLoggedIn || this.checked) return;
    this.checked = true;
    try {
      const data = await auth.loadPrivate(SYNC_SCOPE);
      this.remoteAt = data?.savedAt || null;
    } catch (e) {
      this.lastError = 'Der gespeicherte Stand konnte nicht gelesen werden.';
    }
  },

  // Der entfernte Stand ersetzt die lokalen Teambuilder-Schlüssel vollständig —
  // sonst blieben gelöschte Einträge auf dem Gerät zurück.
  async download() {
    const auth = Alpine.store('auth');
    if (!auth.isLoggedIn || this.busy) return false;
    this.busy = true;
    this.lastError = null;
    try {
      const data = await auth.loadPrivate(SYNC_SCOPE);
      const entries = data?.entries;
      if (!entries || !Object.keys(entries).length) {
        this.lastError = 'Es liegt noch kein gesicherter Stand vor.';
        return false;
      }
      Object.keys(this.snapshot()).forEach((key) => localStorage.removeItem(key));
      Object.entries(entries).forEach(([key, value]) => {
        if (isSyncedKey(key) && typeof value === 'string') localStorage.setItem(key, value);
      });
      this.remoteAt = data.savedAt || null;
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Teambuilder-Daten geladen — die Ansicht wird neu aufgebaut.' } }));
      setTimeout(() => window.location.reload(), 600);
      return true;
    } catch (e) {
      console.error('Teambuilder-Sync (laden) fehlgeschlagen:', e);
      this.lastError = 'Die Daten konnten nicht geladen werden.';
      return false;
    } finally {
      this.busy = false;
    }
  },

  fmt(iso) { return iso ? formatDateTime(iso) : '—'; },
});

Alpine.store('nav', { teamId: null, matchId: null, pokemonName: null, from: null, teamAId: null, teamBId: null, canBack: false });

// Marktwerte (Elo-Quelle) aus dem öffentlichen Sheet — clientseitig, ohne Key.
// Cache im localStorage; „Marktwert-Update" (refresh) lädt live neu.
//
// Der Vergleich läuft über eine gerätelokale Momentaufnahme: ein Update kann
// jederzeit passieren (auch mitten im Spieltag, nach einem einzelnen Spiel), der
// Verlauf im Sheet rückt dagegen nur spieltagsweise vor. Für die Inszenierung
// zählt deshalb der Sprung gegenüber dem zuletzt HIER gesehenen Stand.
Alpine.store('elo', {
  rows: [],
  fetchedAt: null,
  loading: false,
  error: false,
  loaded: false,
  prev: {},        // { name: { elo, tier } } — Stand vor dem letzten Update
  lastDiff: null,  // Ergebnis des letzten Updates, für die Wiederholung der Animation

  init() {
    const cache = readEloCache();
    if (cache) { this.rows = cache.rows || []; this.fetchedAt = cache.fetchedAt || null; }
    this.prev = loadJson(ELO_PREV_KEY) || {};
    const diff = loadJson(ELO_DIFF_KEY);
    this.lastDiff = diff && diff.at ? diff : null;
    this.loaded = true;
  },
  // Beim ersten Bedarf einmalig live nachladen, falls noch kein Stand vorliegt.
  ensureLoaded() {
    if (!this.fetchedAt && !this.loading) this.refresh({ announce: false });
  },
  async refresh({ announce = true } = {}) {
    if (this.loading) return null;
    this.loading = true;
    this.error = false;
    try {
      const data = await fetchEloRows();
      const before = Object.keys(this.prev || {}).length ? this.prev : snapshotOf(this.rows);
      const after = snapshotOf(data.rows);
      this.rows = data.rows;
      this.fetchedAt = data.fetchedAt;
      writeEloCache({ rows: this.rows, fetchedAt: this.fetchedAt });

      const diff = diffSnapshots(before, after);
      // Ein Lauf ohne jede Änderung überschreibt den letzten echten Stand nicht —
      // sonst wäre die Animation nach einem beiläufigen Nachladen leer.
      if (Object.keys(before).length && diff.changed) {
        this.lastDiff = { at: this.fetchedAt, ...diff };
        saveJson(ELO_DIFF_KEY, this.lastDiff);
      }
      this.prev = after;
      saveJson(ELO_PREV_KEY, after);
      if (announce) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { msg: diff.changed ? `Marktwerte aktualisiert · ${diff.changed} Veränderungen` : 'Marktwerte aktualisiert · keine Veränderung' },
        }));
      }
      return diff;
    } catch (e) {
      this.error = true;
      console.error('Marktwerte konnten nicht geladen werden:', e);
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Marktwerte konnten nicht geladen werden.' } }));
      return null;
    } finally {
      this.loading = false;
    }
  },

  // --- Abgeleitete Sichten -------------------------------------------------
  index() {
    return eloIndex(this.rows);
  },
  stops() {
    return historyStops(this.rows);
  },
  bands() {
    return marketBands(this.rows);
  },
  marketOf(name) {
    const row = this.index()[name];
    return row ? marketValue(row.elo) : null;
  },
  eloOf(name) {
    const row = this.index()[name];
    return row && Number.isFinite(row.elo) ? row.elo : null;
  },
  // Gesamtwert aller gelisteten Pokémon — die „Marktkapitalisierung" der Liga.
  totalValue() {
    return (this.rows || []).reduce((sum, r) => sum + (marketValue(r.elo) || 0), 0);
  },
});

Alpine.data('authGate', authGate);
Alpine.data('app', app);
Alpine.data('draftBoard', draftBoard);
Alpine.data('teamsView', teamsView);
Alpine.data('scheduleView', scheduleView);
Alpine.data('standingsView', standingsView);
Alpine.data('statsView', statsView);
Alpine.data('pokemonView', pokemonView);
Alpine.data('spielerView', spielerView);
Alpine.data('teambuildingView', teambuildingView);
Alpine.data('transferView', transferView);
Alpine.data('awardsView', awardsView);
Alpine.data('recordsView', recordsView);
Alpine.data('presseView', presseView);
Alpine.start();
