// Der Store der Zweiten Liga (`Alpine.store('liga2')`).
//
// Er hat keinen eigenen Listener: Die Saisondokumente `drafts/liga2-s<N>` kommen über
// den drafts-Listener des league-Stores herein. Hier werden sie in die Form gebracht,
// in der auch die erste Liga rechnet (Teams, Ergebnisse, Spielplan, Transfer) — mit
// denselben Gettern (`seasonTeams`, `results`, `schedule` …), nur aus anderen Quellen.
// Alle Listen sind je Dokument zwischengespeichert; ein Snapshot ersetzt das Dokument
// und damit den Eintrag.
//
// Geschrieben wird ausschließlich hier. Ergebnisse laufen über eine Transaktion
// (`updateL2Match`), weil beide Spieler am selben Match schreiben: Henrik die
// Aufstellung, Janik sein Ergebnis.

import { doc, setDoc, runTransaction, deleteField } from 'firebase/firestore';
import { db } from './firebase.js';
import {
  l2DocId, seasonOfL2Doc, l2TeamsOf, l2ResultsOf, l2ScheduleOf, l2BlocksOf, l2TransferOf,
  l2MatchKey, parseL2MatchId, updateL2Match, pendingEntries, transferDiff, mergeTransfer,
} from './liga2.mjs';
import { transferAvailability, computeStandings } from './scoring.mjs';
import { seasonPrefix } from './seasons.mjs';
import { normalizeTrainer, currentTrainer, withDismissed } from './trainers.mjs';

const EMPTY = Object.freeze({});
const cache = new Map(); // docId -> { doc, teams, results, schedule, blocks, transfer }
// Saisonübergreifende Listen — stabil, solange sich kein Saisondokument ändert. Der
// Trainermarkt und die Vereinsansicht cachen nach Objektidentität.
let allCache = null;

export function createLiga2Store(Alpine) {
  const league = () => Alpine.store('league');

  // Die Zweite Liga spielt mit den Tiers IHRER Saison (wie der Draft der ersten Liga
  // derselben Saison), nicht mit der jüngsten Einstufung aus pokemon.json. Auch schon
  // gespeicherte Kader folgen dem — das Tier am Kadereintrag ist nur der Stand beim Eintragen.
  const view = (season) => {
    const id = l2DocId(season);
    const d = league()._drafts[id] || null;
    const dex = league().pokemonInSeasonTiers(season);
    const hit = cache.get(id);
    if (hit && hit.doc === d && hit.dex === dex) return hit;
    const s = Number(season);
    const tierOf = new Map(dex.map((p) => [p.name, p]));
    const next = {
      doc: d,
      dex,
      teams: l2TeamsOf(d, s).map((t) => ({
        ...t,
        pokemon: t.pokemon.map((p) => {
          const m = tierOf.get(p?.name);
          return m && (m.tier !== p.tier || m.cost !== p.cost) ? { ...p, tier: m.tier, cost: m.cost } : p;
        }),
      })),
      results: l2ResultsOf(d, s),
      schedule: l2ScheduleOf(d),
      blocks: l2BlocksOf(d),
      transfer: l2TransferOf(d),
    };
    cache.set(id, next);
    return next;
  };

  const ref = (season) => doc(db, 'drafts', l2DocId(season));
  const stamp = () => new Date().toISOString();

  return {
    // --- Lesen ----------------------------------------------------------------
    get season() { return Alpine.store('season')?.current || 1; },
    get prefix() { return seasonPrefix(this.season); },
    get loaded() { return !!league().draftLoaded; },
    get teamsLoaded() { return this.loaded; },
    get resultsLoaded() { return this.loaded; },
    get scheduleLoaded() { return this.loaded; },
    get pokemonLoaded() { return league().pokemonLoaded; },
    // Die Saisons sind die der ersten Liga — jede hat ihre Zweite Liga, auch eine leere.
    get seasons() { return league().seasons; },
    get docSeasons() {
      return Object.keys(league()._drafts || {}).map(seasonOfL2Doc).filter((n) => n != null).sort((a, b) => a - b);
    },

    teamsOf(season) { return view(season).teams; },
    resultsOf(season) { return view(season).results; },
    scheduleOf(season) { return view(season).schedule; },
    blocksOf(season) { return view(season).blocks; },
    transferOf(season) { return view(season).transfer; },
    docOf(season) { return view(season).doc; },

    get seasonTeams() { return this.teamsOf(this.season); },
    get results() { return this.resultsOf(this.season); },
    get schedule() { return this.scheduleOf(this.season); },
    get blocks() { return this.blocksOf(this.season); },
    get transfer() { return this.transferOf(this.season); },

    // Über alle Saisons — für Ewige Tabelle, Vereine und Trainermarkt.
    _allSeasons() {
      return [...new Set([...this.seasons, ...this.docSeasons])].sort((a, b) => a - b);
    },
    _all() {
      const views = this._allSeasons().map((s) => view(s));
      if (!allCache || allCache.views.length !== views.length || allCache.views.some((v, i) => v !== views[i])) {
        allCache = {
          views,
          teams: views.flatMap((v) => v.teams),
          results: views.flatMap((v) => v.results),
        };
      }
      return allCache;
    },
    get allTeams() { return this._all().teams; },
    get teams() { return this.allTeams; },
    get allResults() { return this._all().results; },
    get allSchedules() {
      return Object.fromEntries(this._allSeasons().map((s) => [seasonPrefix(s), this.scheduleOf(s)]));
    },
    get availability() {
      const out = {};
      this._allSeasons().forEach((s) => Object.assign(out, transferAvailability(this.transferOf(s), this.scheduleOf(s))));
      return out;
    },
    get pokemon() { return this.pokemonOf(this.season); },
    pokemonOf(season) { return league().pokemonInSeasonTiers(season); },
    teamById(id) { return this.allTeams.find((t) => t.id === id) || null; },
    tableOf(season, uptoDay = null) {
      const results = this.resultsOf(season).filter((r) => uptoDay == null || r.day <= uptoDay);
      return computeStandings(this.teamsOf(season), results);
    },

    // Was `player` gerade eintragen kann — über alle Saisons, die jüngste zuerst.
    pendingFor(player) {
      if (!player || !this.loaded) return [];
      return pendingEntries(player, this._allSeasons().map((season) => ({
        season, teams: this.teamsOf(season), results: this.resultsOf(season),
      })));
    },

    // --- Teams ----------------------------------------------------------------
    async saveTeam(season, teamId, patch = {}) {
      const data = {};
      ['name', 'logo', 'order'].forEach((k) => { if (patch[k] !== undefined) data[k] = patch[k]; });
      if (patch.color !== undefined) data.color = patch.color || deleteField();
      await setDoc(ref(season), { season: Number(season), teams: { [teamId]: data }, updatedAt: stamp() }, { merge: true });
    },
    async setTeamColor(teamId, color) {
      const { season } = parseTeam(teamId);
      await this.saveTeam(season, teamId, { color: color || null });
    },
    async addTeam(season, teamId, data) {
      await setDoc(ref(season), { season: Number(season), teams: { [teamId]: data }, updatedAt: stamp() }, { merge: true });
    },
    async removeTeam(season, teamId) {
      await setDoc(ref(season), { teams: { [teamId]: deleteField() }, updatedAt: stamp() }, { merge: true });
    },

    /**
     * Den Kader setzen. Als Wintertransfer markiert, landen Ab- und Zugänge im
     * Transfer-Bestand der Saison — wie nach dem Transferfenster der ersten Liga.
     */
    async setRoster(season, teamId, pokemon, { winter = false } = {}) {
      const r = ref(season);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(r);
        const data = snap.exists() ? snap.data() : {};
        const before = data.teams?.[teamId]?.pokemon || [];
        const write = { season: Number(season), teams: { [teamId]: { pokemon } }, updatedAt: stamp() };
        if (winter) {
          const diff = transferDiff(teamId, before, pokemon, { at: stamp() });
          const next = mergeTransfer(l2TransferOf(data), diff);
          write.transfer = { removed: next.removed, added: next.added };
        }
        tx.set(r, write, { merge: true });
      });
    },

    // --- Trainer (wie in der ersten Liga: als Liste am Team) ---------------------
    _trainersOf(teamId) {
      return [...(this.teamById(teamId)?.trainers || [])];
    },
    async _saveTrainers(teamId, list) {
      const { season } = parseTeam(teamId);
      await setDoc(ref(season), { teams: { [teamId]: { trainers: list } }, updatedAt: stamp() }, { merge: true });
    },
    async appointTrainer(teamId, raw) {
      const list = this._trainersOf(teamId);
      const entry = normalizeTrainer(raw, teamId);
      const cur = currentTrainer(list);
      let next = list;
      if (cur && cur.id !== entry.id) {
        const until = Number.isFinite(entry.fromDay) ? entry.fromDay - 1 : null;
        next = withDismissed(next, cur.id, until);
      }
      next = [...next.filter((t) => t.id !== entry.id), entry];
      await this._saveTrainers(teamId, next);
    },
    async updateTrainer(teamId, raw) {
      if (!raw?.id) return;
      const entry = normalizeTrainer(raw, teamId);
      await this._saveTrainers(teamId, this._trainersOf(teamId).map((t) => (t && t.id === entry.id ? entry : t)));
    },
    async dismissTrainer(teamId, trainerId, untilDay) {
      await this._saveTrainers(teamId, withDismissed(this._trainersOf(teamId), trainerId, untilDay));
    },
    async removeTrainer(teamId, trainerId) {
      await this._saveTrainers(teamId, this._trainersOf(teamId).filter((t) => t && t.id !== trainerId));
    },
    get trainerDirectory() { return league().trainerDirectory; },
    monTraitsFor(name, team) { return league().monTraitsFor(name, team); },

    // --- Blöcke und Spielplan ----------------------------------------------------
    async setBlocks(season, blocks) {
      await setDoc(ref(season), {
        season: Number(season),
        blocks: { A: [...(blocks?.A || [])], B: [...(blocks?.B || [])] },
        updatedAt: stamp(),
      }, { merge: true });
    },
    async setSchedule(season, matchdays) {
      await setDoc(ref(season), {
        season: Number(season),
        schedule: { matchdays: matchdays || [], updatedAt: stamp() },
        updatedAt: stamp(),
      }, { merge: true });
    },

    // --- Ergebnisse --------------------------------------------------------------
    /** Ein Match fortschreiben (Aufgebote, Kennzeichen, Einsätze, Ergebnis). */
    async updateMatch(matchId, change) {
      const parsed = parseL2MatchId(matchId);
      if (!parsed) throw new Error('Unbekanntes Match.');
      const r = ref(parsed.season);
      const key = l2MatchKey(parsed.day, parsed.index);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(r);
        const data = snap.exists() ? snap.data() : {};
        const next = updateL2Match(data.results?.[key] || {}, { ...change, day: parsed.day }, { at: stamp() });
        tx.set(r, { season: parsed.season, results: { [key]: next }, updatedAt: stamp() }, { merge: true });
      });
    },
  };
}

function parseTeam(teamId) {
  const m = String(teamId || '').match(/^s(\d+)-/);
  return { season: m ? Number(m[1]) : 1 };
}

export { EMPTY as L2_EMPTY };
