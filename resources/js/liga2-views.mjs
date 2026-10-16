// Die Ansichten der Zweiten Liga: Tabelle, Spielplan (samt Eingabe), Teams und
// Statistiken. Bewusst NICHT in main.js und nicht als Abwandlung der Erstliga-Views:
// die erste Liga bleibt, wie sie ist, die Zweite bekommt eigene, schlichtere Ansichten.
//
// Abhängigkeiten aus main.js kommen über `deps` herein (Diagramm, Farben, Hinweise) —
// so wie beim Draftplan. Daten liest jede Komponente aus `$store.liga2`.

import { computeStandings, pokemonStats, placementHistory, battleStats } from './scoring.mjs';
import { franchiseSlug, teamsOfSeason } from './seasons.mjs';
import {
  L2_TAGS, L2_TAG_LABEL, L2_SQUAD_SIZE, L2_USED, L2_BATTLES, L2_TIERS, L2_MATCHDAYS,
  rosterCheck, rosterSlots, slotsToRoster, drawBlocks, buildBlockSchedule, blankSchedule, planDraftFrom, checkSchedule, drawTags, normalizeTags,
  tagPlayer, canEnterBattle, squadsComplete, lineupsComplete, battleLineupComplete, matchComplete, completeDays, matchScore,
  l2MatchId, battleHasResult, transferDiff,
} from './liga2.mjs';
import { currentTrainer, trainerHistory, genderLabel, GENDERS, nextFromDay, normalizeTrainer } from './trainers.mjs';

const fmtDiff = (d) => (d > 0 ? `+${d}` : `${d}`);
const playerColor = (p) => (p === 'Henrik' ? '#4d90d5' : '#e3350d');

// Teile zusammensetzen, OHNE Getter auszuwerten — ein Spread würde sie einmalig
// berechnen und einfrieren (dann noch ohne `$store`).
function compose(...parts) {
  const out = {};
  parts.forEach((p) => Object.defineProperties(out, Object.getOwnPropertyDescriptors(p)));
  return out;
}

// Gemeinsame Helfer aller Zweitliga-Ansichten.
function base(deps) {
  return {
    get store() { return this.$store.liga2; },
    get season() { return this.store.season; },
    get loaded() { return this.store.loaded && this.$store.league.pokemonLoaded; },
    get me() { return this.$store.auth?.player || null; },
    get isHenrik() { return this.me === 'Henrik'; },
    get canEdit() { return !!this.me; },
    teamById(id) { return this.store.teamById(id); },
    logoUrl(file) { return deps.logoSrc(file); },
    teamColor(team) { return deps.teamColor(team); },
    playerColor,
    fmtDiff,
    tierColor(t) { return deps.TIER_COLORS[t] || '#6b7280'; },
    typeColor(t) { return deps.TYPE_COLORS[t] || '#6b7280'; },
    tagLabel(tag) { return L2_TAG_LABEL[tag] || '—'; },
    tagClass(tag) {
      return tag === 'janik' ? 'bg-flame-500/15 text-flame-400'
        : tag === 'henrik' ? 'bg-[#4d90d5]/15 text-[#8ab8ea]'
          : tag === 'ki' ? 'bg-volt-400/15 text-volt-400' : 'bg-elevated text-mist';
    },
    toast(msg) { window.dispatchEvent(new CustomEvent('toast', { detail: { msg } })); },
    goMon(name) { this.$dispatch('navigate', { key: 'pokemon', pokemonName: name }); },
    goTeam(id) { this.$dispatch('navigate', { key: 'l2teams', teamId: id }); },
    monImage(name) { return this.$store.league.pokemonAll.find((p) => p.name === name)?.image || ''; },
    withTransition(fn) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (document.startViewTransition && !reduce) document.startViewTransition(async () => { fn(); await this.$nextTick(); });
      else fn();
    },
    showPop(id) { this.$nextTick(() => document.getElementById(id)?.showPopover()); },
    hidePop(id) {
      const el = document.getElementById(id);
      if (el && el.matches(':popover-open')) el.hidePopover();
    },
  };
}

// === Tabelle ====================================================================
export function l2StandingsView(deps) {
  return compose(base(deps), {
    day: null,

    get teams() { return this.store.seasonTeams; },
    get results() { return this.store.results; },
    get playedDays() {
      return [...new Set(this.results.filter((r) => r.battles.some((b) => b.done)).map((r) => r.day))].sort((a, b) => a - b);
    },
    latestDay() {
      const d = this.playedDays;
      return d.length ? d[d.length - 1] : null;
    },
    viewDay() {
      const days = this.playedDays;
      if (this.day == null || !days.includes(this.day)) return this.latestDay();
      return this.day;
    },
    isLatest() { return this.viewDay() == null || this.viewDay() === this.latestDay(); },
    canStep(dir) {
      const days = this.playedDays;
      const i = days.indexOf(this.viewDay());
      return i >= 0 && (dir < 0 ? i > 0 : i < days.length - 1);
    },
    stepDay(dir) {
      const days = this.playedDays;
      const i = days.indexOf(this.viewDay());
      const next = days[i + (dir < 0 ? -1 : 1)];
      if (next != null) this.day = next;
    },
    rowsUpTo(day) {
      return computeStandings(this.teams, this.results.filter((r) => day == null || r.day <= day));
    },
    get rows() { return this.rowsUpTo(this.viewDay()); },
    placeDelta(teamId) {
      const days = this.playedDays;
      const i = days.indexOf(this.viewDay());
      if (i <= 0) return null;
      const prev = this.rowsUpTo(days[i - 1]);
      const now = this.rows.findIndex((r) => r.team.id === teamId);
      const was = prev.findIndex((r) => r.team.id === teamId);
      return now < 0 || was < 0 ? null : was - now;
    },
    get curve() {
      return deps.buildChart(placementHistory(this.teams, this.results), this.teams.length, (id) => {
        const t = this.teamById(id);
        return { color: t ? deps.teamColor(t) : null };
      });
    },
    get curveSvg() { return deps.chartSvgString(this.curve); },
    info(title, text) { deps.openStatInfo(null, title, text); },
  });
}

// === Statistiken ================================================================
// Nur Kennzahlen, die sich aus den schlichten Ergebnissen ableiten lassen: Aufgebote,
// Einsätze (mit Reihenfolge) und Sieger. Kills, Deaths und Überleben gibt es hier nicht.
export const L2_STAT_COLUMNS = [
  { key: 'matchups', label: 'Matchups', short: 'MU', fmt: 'int', info: 'In wie vielen Match-Aufgeboten (6 von 8) dieses Pokémon stand.' },
  { key: 'battles', label: 'Kämpfe', short: 'Kpf', fmt: 'int', info: 'In wie vielen ausgetragenen Kämpfen (4er-Einsatz) es stand.' },
  { key: 'kpfPerMu', label: 'Kämpfe/Matchup', short: 'Kpf/MU', fmt: 'num2', info: 'Durchschnittliche Kampf-Einsätze pro Match-Aufgebot (0–3).' },
  { key: 'battleShareInMu', label: 'Kämpfe % (Aufgebot)', short: 'Kpf % AG', fmt: 'pct', info: 'Wenn im Aufgebot: Anteil der drei Kämpfe, in denen es tatsächlich stand.' },
  { key: 'battleShareInRoster', label: 'Kämpfe % (Kader)', short: 'Kpf %', fmt: 'pct', info: 'Anteil aller ausgetragenen Kämpfe des Teams, in denen es stand — auch Matches ohne Nominierung zählen im Nenner.' },
  { key: 'battleWinPct', label: 'Kampf-Siegquote', short: 'Kpf-SQ', fmt: 'pct', info: 'Anteil gewonnener Kämpfe an allen Kämpfen, in denen es eingesetzt wurde.' },
  { key: 'matchWinPct', label: 'Match-Siegquote', short: 'M-SQ', fmt: 'pct', info: 'Anteil gewonnener Matches an allen Matches, in denen es im Aufgebot stand.' },
  { key: 'leads', label: 'Leads', short: 'Lead', fmt: 'int', info: 'Wie oft es unter den ersten zwei gewählten Pokémon eines Kampfes stand — die Reihenfolge der Auswahl ist die Startaufstellung.' },
  { key: 'leadShare', label: 'Lead-Quote', short: 'Lead %', fmt: 'pct', info: 'Anteil seiner Kämpfe, in denen es als Lead startete.' },
  { key: 'base_speed', label: 'Initiative', short: 'Init', fmt: 'int', info: 'Basis-Initiative aus den Stammdaten.' },
];
const L2_TEAM_COLUMNS = L2_STAT_COLUMNS.filter((c) => c.key !== 'base_speed');

function fmtL2(v, fmt) {
  const n = Number.isFinite(v) ? v : 0;
  if (fmt === 'pct') return `${Math.round(n * 100)} %`;
  if (fmt === 'num2') return n.toFixed(2).replace('.', ',');
  return String(n);
}

// Pokémon-Zeilen der Zweiten Liga — für die Statistik und das Team-Ranking. Leads und
// Lead-Quote rechnet `pokemonStats` selbst (die ersten zwei Einsätze eines Kampfes).
function l2MonRows(store, teams, results, { scopeTeamId = null, pokedex = [] } = {}) {
  return pokemonStats(teams, results, pokedex, { scopeTeamId, availability: store.availability });
}

export function l2StatsView(deps) {
  // Spaltenwahl, Reihenfolge, erste und zweite Sortierung — gerätelokal gespeichert wie in der ersten Liga.
  const cols = deps.columnsMixin('jhdl-cols-l2stats-v1', {
    catalog: L2_STAT_COLUMNS, defaults: L2_STAT_COLUMNS.map((c) => c.key), sortKey: 'battles',
  });
  return compose(base(deps), cols, {
    fType: '',
    fTier: '',
    fTeam: '',
    tiers: L2_TIERS,
    allTypes: deps.ALL_TYPES,

    init() { this.initColumns(); },

    get teams() { return this.store.seasonTeams; },
    get rows() {
      const pokedex = this.store.slotDexOf(this.season);
      let list = l2MonRows(this.store, this.teams, this.store.results, { pokedex });
      if (this.fType) list = list.filter((s) => (s.pokemon.types || []).includes(this.fType));
      if (this.fTier) list = list.filter((s) => s.pokemon.tier === this.fTier);
      if (this.fTeam) list = list.filter((s) => s.team?.id === this.fTeam);
      return this.sortRows(list);
    },
    cell(row, col) { return fmtL2(row[col.key], col.fmt); },
    info(col) { deps.openStatInfo(null, col.label, col.info); },
    statInfo(key) {
      const col = L2_STAT_COLUMNS.find((c) => c.key === key);
      if (col) this.info(col);
    },
    get hasFilters() { return !!(this.fType || this.fTier || this.fTeam); },
    clearFilters() { this.fType = ''; this.fTier = ''; this.fTeam = ''; },
  });
}

// === Teams ======================================================================
export function l2TeamsView(deps) {
  const cols = deps.columnsMixin('jhdl-cols-l2teamrank-v1', {
    catalog: L2_TEAM_COLUMNS, defaults: L2_TEAM_COLUMNS.map((c) => c.key), sortKey: 'battles',
  });
  return compose(base(deps), cols, deps.marketMixin(), {
    selectedId: null,
    addForm: null,      // { mode: 'existing'|'new', slug, name, logo, color }
    editForm: null,     // { name, logo, color }
    rosterForm: null,   // { list: [...], q, tier, winter }
    trainerForm: null,
    trainerConfirm: null,
    busy: false,
    genders: GENDERS,

    init() {
      this.initColumns();
      const nav = this.$store.nav;
      const teamId = nav?.teamId || null;
      if (nav) nav.teamId = null;
      if (teamId) this.selectedId = teamId;
    },

    get teams() { return this.store.seasonTeams; },
    get selectedTeam() { return this.selectedId ? this.teams.find((t) => t.id === this.selectedId) || this.teamById(this.selectedId) : null; },
    get color() { return this.selectedTeam ? deps.teamColor(this.selectedTeam) : '#4d90d5'; },
    get isLive() {
      const list = this.store.seasons;
      return this.season === list[list.length - 1];
    },
    open(id) { this.withTransition(() => { this.selectedId = id; window.scrollTo({ top: 0 }); }); },
    close() { this.withTransition(() => { this.selectedId = null; }); },

    rosterOf(team) {
      const order = { A: 0, B: 1, C: 2, D: 3 };
      return [...(team?.pokemon || [])].sort((a, b) => (order[a.tier] ?? 9) - (order[b.tier] ?? 9) || a.name.localeCompare(b.name));
    },
    check(team) { return rosterCheck(team?.pokemon || []); },

    // --- Tabelle, Ergebnisse, Verlauf ---------------------------------------------
    get standings() { return computeStandings(this.teams, this.store.results); },
    get row() { return this.standings.find((r) => r.team.id === this.selectedId) || null; },
    get place() {
      const i = this.standings.findIndex((r) => r.team.id === this.selectedId);
      return i < 0 ? null : i + 1;
    },
    get teamResults() {
      return this.store.results
        .filter((r) => r.home === this.selectedId || r.away === this.selectedId)
        .map((r) => {
          const side = r.home === this.selectedId ? 'home' : 'away';
          const opp = this.teamById(side === 'home' ? r.away : r.home);
          const sc = matchScore(r, side);
          const outcome = !sc.done ? 'open' : sc.own > sc.other ? 'win' : sc.own < sc.other ? 'loss' : 'draw';
          return {
            id: r.id,
            day: r.day,
            opponent: opp,
            ...sc,
            outcome,
            battles: r.battles.map((b) => ({
              done: b.done,
              own: b.score?.[side],
              opp: b.score?.[side === 'home' ? 'away' : 'home'],
              outcome: !b.done ? null : b.winner === 'draw' ? 'draw' : b.winner === side ? 'win' : 'loss',
            })),
          };
        });
    },
    get curve() {
      const hist = placementHistory(this.teams, this.store.results);
      const single = { days: hist.days, series: { [this.selectedId]: hist.series[this.selectedId] || [] } };
      return deps.buildChart(single, this.teams.length, () => ({ color: this.color }));
    },
    get curveSvg() { return deps.chartSvgString(this.curve); },
    get ranking() {
      const team = this.selectedTeam;
      if (!team) return [];
      const rows = l2MonRows(this.store, [team], this.store.results, { scopeTeamId: team.id, pokedex: this.store.slotDexOf(this.season) });
      return this.sortRows(rows);
    },
    cell(row, col) { return fmtL2(row[col.key], col.fmt); },
    info(col) { deps.openStatInfo(null, col.label, col.info); },
    statInfo(key) {
      const col = L2_TEAM_COLUMNS.find((c) => c.key === key);
      if (col) this.info(col);
    },
    openResult(id) { this.$dispatch('navigate', { key: 'l2spielplan', matchId: id }); },
    // Wintertransfer: wer im Winter kam oder ging.
    transferMark(name) {
      const t = this.store.transfer;
      if ((t.added || []).some((a) => a.teamId === this.selectedId && a.name === name)) return 'Zugang im Winter';
      return null;
    },
    get departures() {
      return (this.store.transfer.removed || []).filter((r) => r.teamId === this.selectedId);
    },

    // --- Team hinzufügen -------------------------------------------------------------
    // Vereine, die in dieser Saison noch in keiner Liga spielen.
    get candidates() {
      const season = this.season;
      const taken = new Set([
        ...teamsOfSeason(this.$store.league.teams, season).map((t) => franchiseSlug(t.id)),
        ...this.teams.map((t) => franchiseSlug(t.id)),
      ]);
      return this.$store.league.clubDirectory.filter((c) => !taken.has(c.slug));
    },
    openAdd() {
      if (!this.canEdit) return;
      this.addForm = { mode: this.candidates.length ? 'existing' : 'new', slug: this.candidates[0]?.slug || '', name: '', logo: '', color: '' };
      this.showPop('l2-team-add');
    },
    get addSlug() { return deps.clubSlug(this.addForm?.name || ''); },
    get addValid() {
      const f = this.addForm;
      if (!f) return false;
      if (f.mode === 'existing') return !!f.slug;
      return !!f.name.trim() && !!this.addSlug && !this.$store.league.clubDirectory.some((c) => c.slug === this.addSlug);
    },
    async saveAdd() {
      const f = this.addForm;
      if (!this.addValid || this.busy) return;
      this.busy = true;
      try {
        let slug = f.slug;
        if (f.mode === 'new') {
          slug = await this.$store.league.saveClub({ slug: this.addSlug, name: f.name, player: 'Henrik', logo: f.logo, color: f.color }, { isNew: true });
        }
        const club = this.$store.league.clubDirectory.find((c) => c.slug === slug) || { slug, name: f.name, logo: f.logo, color: f.color };
        const id = `s${this.season}-${slug}`;
        // Ein amtierender Trainer zieht mit — als „vor der Saison" im Amt.
        const boss = currentTrainer(club.lastTeam?.trainers || []);
        const data = {
          name: club.name,
          logo: club.logo || '',
          order: this.teams.length + 1,
          pokemon: [],
          trainers: boss ? [normalizeTrainer({ ...boss, id: null, fromDay: null, untilDay: null }, id)] : [],
        };
        const color = deps.normalizeHexColor(club.color);
        if (color) data.color = color;
        await this.store.addTeam(this.season, id, data);
        this.hidePop('l2-team-add');
        this.addForm = null;
        this.toast(`${club.name} spielt jetzt in der Zweiten Liga.`);
      } catch (e) {
        console.error('Team konnte nicht angelegt werden:', e);
        this.toast(e?.message || 'Das Team konnte nicht angelegt werden.');
      }
      this.busy = false;
    },
    // Ein Team ohne Ergebnis und ohne Spielplan-Eintrag lässt sich wieder entfernen.
    get canRemoveSelected() {
      const id = this.selectedId;
      if (!id || !this.canEdit) return false;
      const scheduled = (this.store.schedule.matchdays || []).some((md) => (md.matches || []).some((m) => m.home === id || m.away === id));
      return !scheduled && !this.store.results.some((r) => r.home === id || r.away === id);
    },
    async removeSelected() {
      if (!this.canRemoveSelected || !window.confirm(`${this.selectedTeam?.name} aus der Zweiten Liga dieser Saison entfernen?`)) return;
      await this.store.removeTeam(this.season, this.selectedId);
      this.close();
    },

    // --- Name, Wappen, Farbe -------------------------------------------------------
    get colorPresets() { return deps.TEAM_COLOR_PRESETS; },
    openEdit() {
      const t = this.selectedTeam;
      if (!t || !this.canEdit) return;
      this.editForm = { name: t.name, logo: t.logo || '', color: deps.normalizeHexColor(t.color) || this.color };
      this.showPop('l2-team-edit');
    },
    async saveEdit() {
      const f = this.editForm;
      const t = this.selectedTeam;
      if (!f || !t || !f.name.trim() || this.busy) return;
      this.busy = true;
      try {
        const color = deps.normalizeHexColor(f.color);
        // In der laufenden Saison gehört die Änderung auch ins Vereinsregister.
        if (this.isLive) {
          await this.$store.league.saveClub({ slug: franchiseSlug(t.id), name: f.name, logo: f.logo, color, player: 'Henrik' });
        } else {
          await this.store.saveTeam(this.season, t.id, { name: f.name.trim(), logo: f.logo, color });
        }
        this.hidePop('l2-team-edit');
        this.editForm = null;
      } catch (e) {
        console.error('Team konnte nicht gespeichert werden:', e);
        this.toast('Das Team konnte nicht gespeichert werden.');
      }
      this.busy = false;
    },
    async pickLogoFile(ev, form) {
      const file = ev?.target?.files?.[0];
      if (!file || !form) return;
      try { form.logo = await deps.imageToDataUrl(file); } catch (e) { this.toast('Das Bild ließ sich nicht lesen.'); }
    },

    // --- Kader ------------------------------------------------------------------------
    // Der Kader-Editor arbeitet mit acht Slots (zwei je Tier A–D). Jedes Pokémon darf in
    // jeden Slot; es gibt bewusst keinen Abgleich mit den Tiers der Stammdaten.
    openRoster() {
      const t = this.selectedTeam;
      if (!t || !this.canEdit) return;
      const played = this.store.results.some((r) => (r.home === t.id || r.away === t.id) && r.battles.some((b) => b.done));
      const { slots, overflow } = rosterSlots(t.pokemon || []);
      // mode: 'fix' = Korrektur (gilt die ganze Saison), 'winter' = Wintertransfer.
      // Hat das Team schon gespielt, muss die Art bewusst gewählt werden.
      this.rosterForm = {
        slots,
        overflow,
        active: slots.findIndex((x) => !x.mon),
        before: [...(t.pokemon || [])],
        q: '',
        tier: '',
        mode: played ? null : 'fix',
      };
      if (this.rosterForm.active < 0) this.rosterForm.active = null;
      this.showPop('l2-roster');
    },
    get rosterList() { return slotsToRoster(this.rosterForm?.slots || []); },
    // Was sich gegenüber dem gespeicherten Kader ändert — Grundlage der Transfer-Frage.
    get rosterDiff() {
      const f = this.rosterForm;
      if (!f) return { removed: [], added: [] };
      return transferDiff(this.selectedId, f.before, this.rosterList);
    },
    get rosterChanged() { return this.rosterDiff.removed.length + this.rosterDiff.added.length > 0; },
    // Beim ersten Eintragen gibt es nichts zu unterscheiden.
    get rosterNeedsMode() { return this.rosterChanged && (this.rosterForm?.before || []).length > 0; },
    isNewInRoster(name) { return this.rosterDiff.added.some((a) => a.name === name); },
    // Tier eines Pokémon in den Stammdaten — nur als Hinweis neben dem Slot.
    baseTier(name) { return this.store.pokemonOf(this.season).find((p) => p.name === name)?.tier || null; },
    selectSlot(i) {
      const f = this.rosterForm;
      if (!f) return;
      f.active = f.active === i ? null : i;
    },
    clearSlot(i) {
      const f = this.rosterForm;
      if (!f?.slots[i]) return;
      f.slots[i].mon = null;
      f.active = i;
    },
    _freeSlot(tier = null) {
      const slots = this.rosterForm?.slots || [];
      const same = tier ? slots.findIndex((x) => !x.mon && x.tier === tier) : -1;
      return same >= 0 ? same : slots.findIndex((x) => !x.mon);
    },
    restoreMon(name) {
      const f = this.rosterForm;
      const p = f?.before.find((x) => x.name === name);
      if (!p || this.rosterList.some((x) => x.name === name)) return;
      const i = this._freeSlot(p.tier);
      if (i < 0) return this.toast(`Für ${name} ist kein Slot frei — erst einen Slot leeren.`);
      f.slots[i].mon = p;
      if (f.active === i) f.active = null;
    },
    // Letzter Spieltag der Hinrunde: bis dahin zählen Abgänge, danach die Zugänge.
    get winterCutDay() {
      const days = (this.store.schedule.matchdays || []).filter((md) => md.leg !== 'rueck').map((md) => Number(md.day));
      return days.length ? Math.max(...days) : null;
    },
    get rosterSaveReady() {
      return !!this.rosterForm && (!this.rosterNeedsMode || !!this.rosterForm.mode);
    },
    get rosterFilled() { return this.rosterList.length; },
    // Wer schon in einem anderen Zweitliga-Kader dieser Saison steht — nur als Hinweis.
    get takenElsewhere() {
      const map = {};
      this.teams.forEach((t) => {
        if (t.id === this.selectedId) return;
        (t.pokemon || []).forEach((p) => { map[p.name] = t.name; });
      });
      return map;
    },
    get rosterOptions() {
      const f = this.rosterForm;
      if (!f) return [];
      const q = f.q.trim().toLowerCase();
      const have = new Set(this.rosterList.map((p) => p.name));
      const order = ['S', ...L2_TIERS];
      return this.store.pokemonOf(this.season)
        .filter((p) => !have.has(p.name))
        .filter((p) => !f.tier || p.tier === f.tier)
        .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.name_en || '').toLowerCase().includes(q))
        .sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier) || (b.cost ?? 0) - (a.cost ?? 0) || a.name.localeCompare(b.name))
        .slice(0, 120);
    },
    get rosterTarget() {
      const f = this.rosterForm;
      if (!f) return -1;
      return f.active != null && f.slots[f.active] ? f.active : this._freeSlot();
    },
    canAddMon() { return this.rosterTarget >= 0; },
    addMon(p) {
      const f = this.rosterForm;
      const i = this.rosterTarget;
      if (!f || i < 0 || !p) return;
      f.slots[i].mon = { name: p.name, name_en: p.name_en || null, dex: p.dex ?? null, types: p.types || [], cost: p.cost ?? null, image: p.image || null };
      const next = this._freeSlot();
      f.active = next >= 0 ? next : null;
      f.q = '';
    },
    async saveRoster() {
      const f = this.rosterForm;
      if (!f || this.busy || !this.rosterSaveReady) return;
      const winter = this.rosterNeedsMode && f.mode === 'winter';
      this.busy = true;
      try {
        await this.store.setRoster(this.season, this.selectedId, this.rosterList, { winter });
        this.hidePop('l2-roster');
        this.rosterForm = null;
        this.toast(winter ? 'Kader gespeichert — Ab- und Zugänge als Wintertransfer vermerkt.' : 'Kader gespeichert.');
      } catch (e) {
        console.error('Kader konnte nicht gespeichert werden:', e);
        this.toast('Der Kader konnte nicht gespeichert werden.');
      }
      this.busy = false;
    },

    // --- Trainer ------------------------------------------------------------------------
    get trainers() { return this.selectedTeam?.trainers || []; },
    get trainer() { return currentTrainer(this.trainers); },
    get trainerRows() { return trainerHistory(this.trainers); },
    genderLabel(g) { return genderLabel(g); },
    get latestPlayedDay() {
      const days = this.store.results.filter((r) => r.battles.some((b) => b.done)).map((r) => r.day);
      return days.length ? Math.max(...days) : null;
    },
    get marketTrainers() { return this.store.trainerDirectory.filter((t) => !t.office); },
    openTrainer(t = null) {
      if (!this.canEdit) return;
      this.trainerForm = t
        ? { id: t.id, name: t.name, image: t.image || '', gender: t.gender || 'd', traits: (t.traits || []).join(', '), fromDay: t.fromDay, untilDay: t.untilDay }
        : { id: null, name: '', image: '', gender: 'd', traits: '', fromDay: nextFromDay(this.trainers, this.latestPlayedDay), untilDay: null };
      this.showPop('l2-trainer');
    },
    takeFromMarket(key) {
      const t = this.marketTrainers.find((x) => x.key === key);
      if (!t || !this.trainerForm) return;
      Object.assign(this.trainerForm, { name: t.name, image: t.image || '', gender: t.gender || 'd', traits: (t.traits || []).join(', ') });
    },
    setTrainerFromDay(v) {
      if (!this.trainerForm) return;
      const n = Number(v);
      this.trainerForm.fromDay = String(v).trim() !== '' && Number.isFinite(n) ? Math.max(0, Math.round(n)) || null : null;
    },
    async saveTrainer() {
      const f = this.trainerForm;
      if (!f?.name?.trim() || this.busy) return;
      this.busy = true;
      try {
        if (f.id) await this.store.updateTrainer(this.selectedId, f);
        else await this.store.appointTrainer(this.selectedId, f);
        this.hidePop('l2-trainer');
        this.trainerForm = null;
        this.toast(f.id ? 'Trainer aktualisiert.' : `${f.name} ernannt.`);
      } catch (e) {
        console.error('Trainer speichern fehlgeschlagen:', e);
      }
      this.busy = false;
    },
    async dismissTrainer(t) {
      if (!t || !this.canEdit || !window.confirm(`${t.name} entlassen?`)) return;
      await this.store.dismissTrainer(this.selectedId, t.id, this.latestPlayedDay ?? 0);
    },
  });
}

// === Spielplan & Ergebnisse =====================================================
export function l2ScheduleView(deps) {
  return compose(base(deps), {
    busy: false,
    // Blöcke und händischer Spielplan
    blockDraft: null,      // { A: [], B: [] }
    planDraft: null,       // matchdays
    planCheck: { errors: [], hints: [] },
    // Eingabe
    entry: null,           // { matchId, day, index, home, away, step, squads, tags, lineups, battle, scores }
    detailId: null,
    returnAfter: false,
    _scrolledToOpen: false,

    init() {
      const nav = this.$store.nav;
      const matchId = nav?.matchId || null;
      const battleNo = nav?.battleNo || null;
      this.returnAfter = !!nav?.l2Return;
      if (nav) { nav.matchId = null; nav.battleNo = null; }
      if (!matchId) {
        if (this.loaded) this._scrollToOpenMatch();
        else this.$watch('loaded', (v) => { if (v) this._scrollToOpenMatch(); });
        return;
      }
      const go = () => {
        const r = this.matchFor(matchId);
        if (!r) return;
        if (battleNo) this.openEntry(r.day, r.index, { step: 'ergebnis', battle: battleNo - 1 });
        else this.openDetail(r.day, r.index);
      };
      if (this.loaded) this.$nextTick(go);
      else this.$watch('loaded', (v) => { if (v) this.$nextTick(go); });
    },

    // Einmalig nach dem Laden: die erste Partie ohne vollständiges Ergebnis in den Blick holen.
    _scrollToOpenMatch() {
      if (this._scrolledToOpen) return;
      this._scrolledToOpen = true;
      let target = null;
      for (const md of this.schedule.matchdays || []) {
        const i = (md.matches || []).findIndex((m, idx) => m.home && m.away && !matchComplete(this.resultAt(md.day, idx) || {}));
        if (i >= 0) { target = `${md.day}-${i}`; break; }
      }
      if (!target) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.$nextTick(() => requestAnimationFrame(() => {
        const root = this.$root;
        if (!root?.isConnected) return;
        root.querySelector(`[data-match-key="${target}"]`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      }));
    },

    get teams() { return this.store.seasonTeams; },
    get schedule() { return this.store.schedule; },
    get hasSchedule() { return (this.schedule.matchdays || []).length > 0; },
    get blocks() { return this.store.blocks; },
    get hasBlocks() { return this.blocks.A.length > 0 && this.blocks.B.length > 0; },
    get anyResult() { return this.store.results.some((r) => r.battles.some((b) => b.done || (b.used?.home || []).length) || (r.squads.home || []).length); },
    get legs() {
      const days = this.schedule.matchdays || [];
      return [
        { leg: 'hin', label: 'Hinrunde', days: days.filter((d) => d.leg !== 'rueck') },
        { leg: 'rueck', label: 'Rückrunde', days: days.filter((d) => d.leg === 'rueck') },
      ].filter((g) => g.days.length);
    },
    matchFor(matchId) { return this.store.results.find((r) => r.id === matchId) || this._virtual(matchId); },
    _virtual(matchId) {
      for (const md of this.schedule.matchdays || []) {
        for (let i = 0; i < (md.matches || []).length; i++) {
          if (l2MatchId(this.season, md.day, i) === matchId) {
            const m = md.matches[i];
            return { id: matchId, day: md.day, index: i, home: m.home, away: m.away, squads: { home: [], away: [] }, tags: [], lineupsSaved: false, battles: [] };
          }
        }
      }
      return null;
    },
    resultAt(day, index) {
      const r = this.store.results.find((x) => x.day === day && x.index === index);
      const md = (this.schedule.matchdays || []).find((x) => x.day === day);
      const m = md?.matches?.[index];
      // Ein Ergebnis gehört zu genau dieser Paarung — nach einer Planänderung zählt es nicht.
      if (r && m && r.home === m.home && r.away === m.away) return r;
      return null;
    },
    scoreAt(day, index) {
      const r = this.resultAt(day, index);
      if (!r) return null;
      const sc = matchScore(r, 'home');
      return sc.done ? { home: sc.own, away: sc.other, done: sc.done } : null;
    },
    battlesAt(day, index) {
      const r = this.resultAt(day, index);
      return Array.from({ length: L2_BATTLES }, (_, i) => r?.battles?.[i] || { no: i + 1, tag: r?.tags?.[i] || null, done: false });
    },
    statusAt(day, index) {
      const r = this.resultAt(day, index);
      if (!r || !(r.squads.home || []).length) return 'offen';
      if (matchComplete(r)) return 'fertig';
      if (!squadsComplete(r)) return 'Aufgebot offen';
      // Offen ist, was als Nächstes fehlt: ein Ergebnis zu einem gesetzten Einsatz oder der nächste Einsatz.
      const waiting = r.battles.some((b, i) => !b.done && battleLineupComplete(r, i));
      return waiting ? 'Ergebnis offen' : 'Einsatz offen';
    },
    canEnterAny(day, index) {
      const r = this.resultAt(day, index);
      if (!r) return false;
      return r.battles.some((b, i) => !b.done && battleLineupComplete(r, i) && canEnterBattle(this.me, b.tag, this.season, day));
    },

    // --- Blöcke ----------------------------------------------------------------------
    startBlocks() {
      if (!this.isHenrik && !this.canEdit) return;
      const ids = this.teams.map((t) => t.id);
      const cur = this.blocks;
      this.blockDraft = cur.A.length || cur.B.length
        ? { A: cur.A.filter((id) => ids.includes(id)), B: cur.B.filter((id) => ids.includes(id)) }
        : { A: [], B: [] };
      ids.forEach((id) => { if (!this.blockDraft.A.includes(id) && !this.blockDraft.B.includes(id)) this.blockDraft.B.push(id); });
    },
    blockOf(id) { return this.blockDraft?.A.includes(id) ? 'A' : 'B'; },
    toggleBlock(id) {
      const d = this.blockDraft;
      if (!d) return;
      if (d.A.includes(id)) { d.A = d.A.filter((x) => x !== id); d.B = [...d.B, id]; }
      else { d.B = d.B.filter((x) => x !== id); d.A = [...d.A, id]; }
    },
    drawBlockDraft() { this.blockDraft = drawBlocks(this.teams.map((t) => t.id)); },
    get blockDraftValid() { return !!this.blockDraft && this.blockDraft.A.length === this.blockDraft.B.length && this.blockDraft.A.length > 0; },
    async saveBlocks() {
      if (!this.blockDraftValid || this.busy) return;
      this.busy = true;
      try {
        await this.store.setBlocks(this.season, this.blockDraft);
        this.blockDraft = null;
      } catch (e) { this.toast('Die Blöcke konnten nicht gespeichert werden.'); }
      this.busy = false;
    },

    // --- Spielplan --------------------------------------------------------------------
    async drawSchedule() {
      if (!this.hasBlocks || this.busy) return;
      if (this.anyResult) return this.toast('Es gibt schon Aufgebote oder Ergebnisse — der Plan lässt sich nur noch von Hand ändern.');
      if (this.hasSchedule && !window.confirm('Den bestehenden Spielplan durch eine neue Auslosung ersetzen?')) return;
      this.busy = true;
      try { await this.store.setSchedule(this.season, buildBlockSchedule(this.blocks.A, this.blocks.B)); } catch (e) { this.toast('Der Spielplan konnte nicht gespeichert werden.'); }
      this.busy = false;
    },
    startPlanEdit() {
      const days = this.schedule.matchdays || [];
      this.planDraft = days.length ? planDraftFrom(days) : blankSchedule();
      this.recheckPlan();
    },
    cancelPlanEdit() { this.planDraft = null; },
    // Partien mit Aufgebot oder Ergebnis bleiben, wie sie sind.
    slotLocked(day, index) {
      const r = this.store.results.find((x) => x.day === day && x.index === index);
      return !!r && ((r.squads.home || []).length > 0 || r.battles.some((b) => b.done));
    },
    setSlot(dayIdx, mi, side, id) {
      const md = this.planDraft?.[dayIdx];
      if (!md || this.slotLocked(md.day, mi)) return;
      md.matches[mi][side] = id;
      this.recheckPlan();
    },
    swapSlot(dayIdx, mi) {
      const md = this.planDraft?.[dayIdx];
      if (!md || this.slotLocked(md.day, mi)) return;
      const m = md.matches[mi];
      md.matches[mi] = { home: m.away, away: m.home };
      this.recheckPlan();
    },
    // Mehr als acht Spieltage gibt es nicht. Ein überzähliger aus einem alten Stand lässt
    // sich entfernen, solange keine seiner Partien gesperrt ist.
    isExtraDay(md) { return !!md && (md.day > L2_MATCHDAYS || md.day < 1); },
    canRemovePlanDay(md) { return this.isExtraDay(md) && !(md.matches || []).some((_, mi) => this.slotLocked(md.day, mi)); },
    removePlanDay(dayIdx) {
      const md = this.planDraft?.[dayIdx];
      if (!this.canRemovePlanDay(md)) return;
      this.planDraft.splice(dayIdx, 1);
      this.recheckPlan();
    },
    setLeg(dayIdx, leg) {
      if (this.planDraft?.[dayIdx]) this.planDraft[dayIdx].leg = leg === 'rueck' ? 'rueck' : 'hin';
    },
    recheckPlan() {
      this.planCheck = checkSchedule(this.planDraft || [], this.teams.map((t) => t.id), this.hasBlocks ? this.blocks : null);
    },
    async savePlan() {
      this.recheckPlan();
      if (!this.planDraft || this.planCheck.errors.length || this.busy) return;
      this.busy = true;
      try {
        const clean = this.planDraft.map((md) => ({ day: md.day, leg: md.leg, matches: md.matches.map((m) => ({ home: m.home || '', away: m.away || '' })) }));
        await this.store.setSchedule(this.season, clean);
        this.planDraft = null;
        this.toast('Spielplan gespeichert.');
      } catch (e) { this.toast('Der Spielplan konnte nicht gespeichert werden.'); }
      this.busy = false;
    },

    // --- Eingabe -------------------------------------------------------------------------
    openEntry(day, index, { step = null, battle = 0 } = {}) {
      const md = (this.schedule.matchdays || []).find((x) => x.day === day);
      const m = md?.matches?.[index];
      if (!m?.home || !m?.away) return;
      const r = this.resultAt(day, index);
      const tags = normalizeTags(r?.tags) || drawTags();
      this.entry = {
        matchId: l2MatchId(this.season, day, index),
        day, index, home: m.home, away: m.away,
        step: step || this._entryStep(r),
        squads: { home: [...(r?.squads?.home || [])], away: [...(r?.squads?.away || [])] },
        tags,
        tagsDrawn: !normalizeTags(r?.tags),
        lineups: Array.from({ length: L2_BATTLES }, (_, i) => ({
          home: [...(r?.battles?.[i]?.used?.home || [])],
          away: [...(r?.battles?.[i]?.used?.away || [])],
        })),
        battle: step ? battle : this._nextBattle(r),
        scores: Array.from({ length: L2_BATTLES }, (_, i) => ({
          home: r?.battles?.[i]?.done ? r.battles[i].score.home : null,
          away: r?.battles?.[i]?.done ? r.battles[i].score.away : null,
        })),
        error: '',
      };
      this.showPop('l2-entry');
    },
    // Wo die Eingabe weitergeht: ohne gespeichertes Aufgebot beim Aufgebot, ein offener
    // Kampf mit Einsatz beim Ergebnis, sonst beim nächsten Einsatz.
    _entryStep(r) {
      if (!squadsComplete(r)) return 'aufgebot';
      if (matchComplete(r)) return 'ergebnis';
      const i = this._nextBattle(r);
      return battleLineupComplete(r, i) ? 'ergebnis' : 'einsatz';
    },
    _nextBattle(r) {
      const i = (r?.battles || []).findIndex((b) => !b.done);
      return i < 0 ? 0 : i;
    },
    closeEntry() {
      this.hidePop('l2-entry');
      this.entry = null;
    },
    get entryResult() { return this.entry ? this.resultAt(this.entry.day, this.entry.index) : null; },
    rosterFor(side) {
      const id = this.entry?.[side];
      return [...(this.teamById(id)?.pokemon || [])];
    },
    // Aufgebot: 6 von 8
    inSquad(side, name) { return this.entry?.squads[side].includes(name); },
    toggleSquad(side, name) {
      if (!this.isHenrik || !this.entry) return;
      const list = this.entry.squads[side];
      if (list.includes(name)) this.entry.squads[side] = list.filter((n) => n !== name);
      else if (list.length < L2_SQUAD_SIZE) this.entry.squads[side] = [...list, name];
    },
    // Kennzeichen: ein Tipp tauscht mit dem Kampf, der es bisher trug.
    setTag(i, tag) {
      if (!this.isHenrik || !this.entry || this.battleLocked(i)) return;
      const tags = [...this.entry.tags];
      const j = tags.indexOf(tag);
      if (j === i) return;
      if (j >= 0 && this.battleLocked(j)) return;
      tags[j] = tags[i];
      tags[i] = tag;
      this.entry.tags = tags;
      this.entry.tagsDrawn = false;
    },
    redrawTags() {
      if (!this.isHenrik || !this.entry) return;
      if ([0, 1, 2].some((i) => this.battleLocked(i))) return this.toast('Ein Kampf hat schon ein Ergebnis — die Kennzeichen bleiben.');
      this.entry.tags = drawTags();
      this.entry.tagsDrawn = true;
    },
    battleLocked(i) { return !!this.entryResult?.battles?.[i]?.done; },
    get squadsValid() {
      return !!this.entry && ['home', 'away'].every((s) => this.entry.squads[s].length === L2_SQUAD_SIZE) && !!normalizeTags(this.entry.tags);
    },
    // Gespeichert ist, was in der Datenbank steht — nur das schaltet die nächsten Schritte frei.
    get squadsSaved() { return squadsComplete(this.entryResult); },
    get squadsDirty() {
      const e = this.entry;
      const r = this.entryResult;
      if (!e) return false;
      const same = (a = [], b = []) => a.length === b.length && a.every((n) => b.includes(n));
      return !same(e.squads.home, r?.squads?.home) || !same(e.squads.away, r?.squads?.away)
        || (normalizeTags(e.tags) || []).join() !== (r?.tags || []).join();
    },
    async saveSquads() {
      const e = this.entry;
      if (!e || !this.isHenrik || !this.squadsValid || this.busy) return;
      this.busy = true;
      e.error = '';
      try {
        await this.store.updateMatch(e.matchId, { home: e.home, away: e.away, squads: e.squads, tags: e.tags });
        e.lineups = e.lineups.map((l) => ({ home: l.home.filter((n) => e.squads.home.includes(n)), away: l.away.filter((n) => e.squads.away.includes(n)) }));
        e.step = 'einsatz';
        this.toast('Aufgebot gespeichert.');
      } catch (err) {
        console.error('Aufgebot konnte nicht gespeichert werden:', err);
        e.error = 'Das Aufgebot konnte nicht gespeichert werden.';
      }
      this.busy = false;
    },
    // Einsätze: 4 von 6, in Reihenfolge
    usedIndex(i, side, name) { return (this.entry?.lineups[i]?.[side] || []).indexOf(name); },
    toggleUsed(i, side, name) {
      if (!this.isHenrik || !this.entry || this.battleLocked(i)) return;
      const list = this.entry.lineups[i][side];
      if (list.includes(name)) this.entry.lineups[i][side] = list.filter((n) => n !== name);
      else if (list.length < L2_USED) this.entry.lineups[i][side] = [...list, name];
    },
    lineupDone(i) {
      const l = this.entry?.lineups?.[i];
      return !!l && l.home.length === L2_USED && l.away.length === L2_USED;
    },
    // Gespeicherter Einsatz eines Kampfes — erst damit kann sein Ergebnis kommen.
    lineupSaved(i) { return battleLineupComplete(this.entryResult, i); },
    lineupDirty(i) {
      const l = this.entry?.lineups?.[i];
      const used = this.entryResult?.battles?.[i]?.used || {};
      if (!l) return false;
      return l.home.join() !== (used.home || []).join() || l.away.join() !== (used.away || []).join();
    },
    get lineupsDirty() { return [0, 1, 2].some((i) => !this.battleLocked(i) && this.lineupDirty(i)); },
    get allLineupsSaved() { return [0, 1, 2].every((i) => this.lineupSaved(i)); },
    // Gespeichert werden darf jeder Zwischenstand; ein halber Einsatz zählt nur noch nicht.
    get lineupsValid() { return !!this.entry && this.squadsSaved && this.lineupsDirty; },
    async saveLineups() {
      const e = this.entry;
      if (!e || !this.isHenrik || !this.lineupsValid || this.busy) return;
      this.busy = true;
      e.error = '';
      try {
        await this.store.updateMatch(e.matchId, { lineups: e.lineups });
        const ready = [0, 1, 2].filter((i) => !this.battleLocked(i) && this.lineupDone(i));
        if (ready.length) {
          e.step = 'ergebnis';
          e.battle = ready[0];
          this.toast(`Einsatz gespeichert — Ergebnis von Kampf ${ready.map((i) => i + 1).join(', ')} kann kommen.`);
        } else this.toast('Einsätze gespeichert.');
      } catch (err) {
        console.error('Einsätze konnten nicht gespeichert werden:', err);
        e.error = 'Die Einsätze konnten nicht gespeichert werden.';
      }
      this.busy = false;
    },
    // Ergebnisse — je Kampf, sobald sein Einsatz gespeichert ist.
    get entryReady() { return [0, 1, 2].some((i) => this.lineupSaved(i)); },
    mayEnter(i) {
      const tag = this.entryResult?.tags?.[i] || this.entry?.tags?.[i];
      return this.lineupSaved(i) && canEnterBattle(this.me, tag, this.season, this.entry?.day);
    },
    enterHint(i) {
      const tag = this.entryResult?.tags?.[i] || this.entry?.tags?.[i];
      if (!this.squadsSaved) return 'Erst das Aufgebot speichern.';
      if (!this.lineupSaved(i)) return 'Erst den Einsatz dieses Kampfes speichern.';
      if (this.mayEnter(i)) return '';
      return `Trägt ${tagPlayer(tag)} ein.`;
    },
    setScore(i, side, n) {
      if (!this.mayEnter(i)) return;
      this.entry.scores[i][side] = n;
    },
    scoreReady(i) {
      const s = this.entry?.scores?.[i];
      return s && s.home != null && s.away != null;
    },
    async saveScore(i) {
      const e = this.entry;
      if (!e || !this.mayEnter(i) || !this.scoreReady(i) || this.busy) return;
      this.busy = true;
      e.error = '';
      try {
        await this.store.updateMatch(e.matchId, { result: { index: i, home: e.scores[i].home, away: e.scores[i].away, by: this.me } });
        this.toast(`Kampf ${i + 1} gespeichert.`);
        // Weiter zum nächsten offenen Kampf — fehlt dessen Einsatz noch, zuerst dorthin.
        const next = [0, 1, 2].find((j) => j > i && !this.battleLocked(j));
        if (next != null) {
          e.battle = next;
          if (this.isHenrik && !this.lineupSaved(next)) e.step = 'einsatz';
        }
        if (this.returnAfter) {
          this.returnAfter = false;
          this.closeEntry();
          window.dispatchEvent(new CustomEvent('l2-return'));
        }
      } catch (err) {
        console.error('Ergebnis konnte nicht gespeichert werden:', err);
        e.error = 'Das Ergebnis konnte nicht gespeichert werden.';
      }
      this.busy = false;
    },
    async clearScore(i) {
      const e = this.entry;
      if (!e || !this.mayEnter(i) || this.busy || !window.confirm(`Ergebnis von Kampf ${i + 1} zurücknehmen?`)) return;
      this.busy = true;
      try {
        await this.store.updateMatch(e.matchId, { result: { index: i, clear: true } });
        e.scores[i] = { home: null, away: null };
      } catch (err) { e.error = 'Das Ergebnis konnte nicht zurückgenommen werden.'; }
      this.busy = false;
    },
    winnerLabel(i) {
      const s = this.entry?.scores?.[i];
      if (!s || s.home == null || s.away == null) return '';
      if (s.home === s.away) return 'Unentschieden';
      return `Sieg ${this.teamById(s.home > s.away ? this.entry.home : this.entry.away)?.name || ''}`;
    },

    // --- Detail -------------------------------------------------------------------------
    openDetail(day, index) {
      this.detailId = l2MatchId(this.season, day, index);
      this.showPop('l2-detail');
    },
    closeDetail() {
      this.hidePop('l2-detail');
      this.detailId = null;
    },
    get detail() {
      if (!this.detailId) return null;
      const r = this.matchFor(this.detailId);
      if (!r) return null;
      const sc = matchScore(r, 'home');
      return { ...r, homeTeam: this.teamById(r.home), awayTeam: this.teamById(r.away), homeWins: sc.own, awayWins: sc.other, played: sc.done };
    },
    editFromDetail() {
      const d = this.detail;
      if (!d) return;
      this.closeDetail();
      this.openEntry(d.day, d.index);
    },

    // --- Presse: Spieltag-Rückblick --------------------------------------------------------
    get doneDays() { return completeDays(this.schedule, this.store.results); },
    reviewArticle(day) { return this.$store.press.byId(this.$store.press.liga2ReviewId(this.season, day)); },
    canWriteReview(day) {
      const press = this.$store.press;
      return press.hasKey && this.doneDays.includes(day) && !press.busy[press.liga2ReviewId(this.season, day)];
    },
    async writeReview(day) {
      if (!this.canWriteReview(day)) return;
      await this.$store.press.generateLiga2Review(this.season, day, { force: !!this.reviewArticle(day) }).catch(() => null);
    },
    openReview(day) {
      const a = this.reviewArticle(day);
      if (a) this.$dispatch('navigate', { key: 'presse', articleId: a.id });
    },
  });
}
