// Die Alpine-Komponente des Draftplans.
//
// Sie liegt bewusst NICHT in der main.js: Der Entwurf (draftplan-entwurf.html) fährt
// dieselbe Komponente mit erfundenen Daten hoch, und die main.js zieht beim Import die
// ganze Anwendung samt Firebase mit. Registriert wird sie trotzdem dort — hier steht
// nur die Fabrik, ihre Abhängigkeiten kommen von außen herein.
//
// Die Rechenarbeit liegt komplett in draftplan.mjs; hier stehen Zustand, Bedienung und
// die Geometrie des Pfad-Boards.

import {
  SLOT_KEYS, PLAN_TIERS, SLOTS_PER_TIER, PATH_COLORS, MAX_PATHS,
  slotTier, blankPlan, normalizePlan, newId,
  pathById, effectivePicks, effectiveOrder, orderedPaths, divergence,
  usageMap, pathMons, liveState, monState,
  coverageOf, weakSpots, suggestCoverage, speedProfile, pathSummary,
} from './draftplan.mjs';

// Das Pfad-Board rechnet in festen Pixeln statt zu messen: Die Linien laufen über
// Kandidaten, deren Position aus Spalten- und Zeilenindex eindeutig folgt. Dieselben
// Werte landen als CSS-Variablen am Board — Zeichnung und Layout können nicht
// auseinanderlaufen, und es gibt kein Nachmessen beim Nachladen der Bilder.
export const BOARD = { colW: 116, colGap: 30, headH: 46, chipH: 44, chipGap: 6 };

export function draftPlanView(deps = {}) {
  const {
    loadJson = () => ({}),
    saveJson = () => {},
    tierColor = () => '#6b7280',
    typeColor = () => '#6b7280',
    plansKey = 'jhdl-draftplan-v1',
    uiKey = 'jhdl-draftplan-ui-v1',
    // Ablage am Konto: { available(), load() -> plans|null, save(plans) }. Ist sie
    // gesetzt, liegt der Plan AUSSCHLIESSLICH dort (verschlüsselt) — gerätelokal
    // bleiben nur die Bedienvorlieben. Ohne sie (Entwurf) gilt der localStorage.
    remote = null,
  } = deps;

  return {
    plans: {},
    teamId: null,
    view: 'board',
    layout: 'liste',
    showLost: false,
    showDead: false,
    pickerSlot: null,
    pickerQuery: '',
    menu: null,
    pathForm: null,
    confirm: null,
    focusSlot: null,
    _memo: {},
    _ready: {},
    // Zustand der Konto-Ablage: 'local' (ohne Ablage), 'off' (nicht angemeldet),
    // 'loading', 'loadError', 'ready', 'saving', 'error' (Speichern gescheitert).
    store: remote ? 'loading' : 'local',
    storeError: '',
    _storeFor: null,
    _saveTimer: null,

    // --- Aufbau ------------------------------------------------------------
    init() {
      this.plans = remote ? {} : (loadJson(plansKey) || {});
      const ui = loadJson(uiKey) || {};
      this.view = ['board', 'pfade', 'analyse'].includes(ui.view) ? ui.view : 'board';
      this.layout = ui.layout === 'linien' ? 'linien' : 'liste';
      this.showLost = !!ui.showLost;
      this.teamId = ui.teamId || null;
      this.$watch('teamId', () => this.saveUi());
      this.$watch('view', () => this.saveUi());
      this.$watch('layout', () => this.saveUi());
      this.$watch('showLost', () => this.saveUi());
    },

    // Den Plan des angemeldeten Spielers aus der Ablage holen — auch nach einem
    // späteren Login, deshalb aus ensure() heraus und je Spieler nur einmal.
    async syncRemote() {
      if (!remote) return;
      const who = this.$store.auth.player || null;
      if (this._storeFor === who) return;
      this._storeFor = who;
      if (!who || !remote.available()) {
        this.store = 'off';
        this.plans = {};
        this._ready = {};
        return;
      }
      this.store = 'loading';
      try {
        const plans = (await remote.load()) || {};
        if (this._storeFor !== who) return;
        this.plans = plans;
        this._ready = {};
        this._memo = {};
        this.store = 'ready';
        this.storeError = '';
      } catch (e) {
        // Ohne bekannten Stand wird nichts angezeigt und damit nichts überschrieben.
        this.store = 'loadError';
        this.storeError = 'Der Draftplan konnte nicht geladen werden. Bitte die Seite neu laden.';
      }
    },

    saveUi() {
      saveJson(uiKey, { teamId: this.teamId, view: this.view, layout: this.layout, showLost: this.showLost });
    },

    get league() { return this.$store.league; },
    get loaded() {
      const storeReady = !remote || ['ready', 'saving', 'error', 'off'].includes(this.store);
      return storeReady && this.league.pokemonLoaded && this.league.teamsLoaded && this.league.draftLoaded;
    },
    get loggedIn() { return !!this.$store.auth.player; },

    // Planen lässt sich nur für die eigenen Teams. Ohne Anmeldung gibt es kein „eigen" —
    // dann steht die ganze Saison zur Wahl und nichts wird in die Ablage gespiegelt.
    get teams() {
      const mine = this.$store.auth.myTeams || [];
      return mine.length ? mine : this.league.seasonTeams;
    },
    get team() {
      const list = this.teams;
      if (!list.length) return null;
      return list.find((t) => t.id === this.teamId) || list[0];
    },

    // Angelegt und geradegezogen wird aus einem x-effect heraus, nicht im Getter: Ein
    // Getter, der schreibt, würde Alpines Auswertung im Kreis schicken.
    ensure() {
      if (remote && this._storeFor !== (this.$store.auth.player || null)) { this.syncRemote(); return; }
      if (remote && this.store === 'loading') return;
      const list = this.teams;
      if (!list.length) return;
      const id = list.some((t) => t.id === this.teamId) ? this.teamId : list[0].id;
      if (this.teamId !== id) this.teamId = id;
      if (this._ready[id]) return;
      this.plans = { ...this.plans, [id]: normalizePlan(this.plans[id], id) };
      this._ready[id] = true;
    },

    get plan() {
      return this.teamId ? this.plans[this.teamId] || null : null;
    },

    commit() {
      const plan = this.plans[this.teamId];
      if (plan) plan.updatedAt = new Date().toISOString();
      this._memo = {};
      const snapshot = JSON.parse(JSON.stringify(this.plans));
      if (!remote) { saveJson(plansKey, snapshot); return; }
      if (!['ready', 'saving', 'error'].includes(this.store) || !remote.available()) return;
      // Klicks kommen in Serie — gebündelt schreiben, der letzte Stand gewinnt.
      clearTimeout(this._saveTimer);
      this.store = 'saving';
      this._saveTimer = setTimeout(async () => {
        try {
          await remote.save(JSON.parse(JSON.stringify(this.plans)));
          this.store = 'ready';
          this.storeError = '';
        } catch (e) {
          this.store = 'error';
          this.storeError = 'Der Draftplan konnte nicht gespeichert werden.';
        }
      }, 800);
    },

    selectTeam(id) {
      this.teamId = id;
      this.menu = null;
      this.pickerSlot = null;
      this._memo = {};
      this.ensure();
    },

    // --- Was schon vergeben ist --------------------------------------------
    // Der Plan kennt den Draft nur als BESTAND: Wer bereits in einem Kader steht, ist
    // keine Option mehr. Der Ablauf des Drafts — wer wann zieht — gehört ins Board.
    get live() {
      return liveState(this.league.seasonTeams, this.teamId);
    },

    // --- Pfade -------------------------------------------------------------
    get activeId() { return this.plan?.activePathId || null; },
    get active() { return this.plan ? pathById(this.plan, this.activeId) : null; },
    setActive(id) {
      if (!this.plan) return;
      this.plan.activePathId = id;
      this.commit();
    },
    picksOf(id) { return this.plan ? effectivePicks(this.plan, id) : {}; },
    get activePicks() { return this.picksOf(this.activeId); },
    get activeOrder() { return this.plan ? effectiveOrder(this.plan, this.activeId) : [...SLOT_KEYS]; },

    get usage() {
      return this.plan ? usageMap(this.plan) : {};
    },
    colorOf(pathId) { return pathById(this.plan, pathId)?.color || '#6b7280'; },

    // Alle Pfade mit allem, was die Liste zeigt — Abstammung, Fortschritt, Erreichbarkeit.
    get pathRows() {
      if (!this.plan) return [];
      const live = this.live;
      const dex = this.league.pokemon;
      return orderedPaths(this.plan).map(({ path, depth }) => ({
        path,
        depth,
        summary: pathSummary(this.plan, path.id, dex, live),
        fork: divergence(this.plan, path.id),
        active: path.id === this.activeId,
      }));
    },
    get livePaths() { return this.pathRows.filter((r) => r.summary.ok); },
    get activeDead() { return this.pathRows.some((r) => r.active && !r.summary.ok); },
    get deadPaths() { return this.pathRows.filter((r) => !r.summary.ok); },
    get pathCount() { return this.plan?.paths?.length || 0; },
    get canAddPath() { return this.pathCount < MAX_PATHS; },

    nextColor() {
      const used = new Set((this.plan?.paths || []).map((p) => p.color));
      return PATH_COLORS.find((c) => !used.has(c)) || PATH_COLORS[this.pathCount % PATH_COLORS.length];
    },

    // Eine Abzweigung übernimmt alles bis zu diesem Slot und geht ab hier eigene Wege.
    // Sie ist mit dem Elternpfad verknüpft: Was davor korrigiert wird, wandert mit.
    forkAt(slot, name) {
      if (!this.plan || !this.canAddPath) return null;
      const parent = this.active;
      if (!parent) return null;
      const path = {
        id: newId('pf'),
        name: slot ? `Ab ${slot}` : `${parent.name} (Kopie)`,
        color: this.nextColor(),
        parentId: parent.id,
        own: slot ? { [slot]: name || null } : {},
        order: null,
        note: '',
      };
      const at = this.plan.paths.findIndex((p) => p.id === parent.id);
      this.plan.paths.splice(at + 1, 0, path);
      this.plan.activePathId = path.id;
      this.menu = null;
      this.commit();
      return path;
    },

    // Eine Kopie steht NEBEN dem Pfad, nicht unter ihm: Sie erbt dessen Wahl vollständig
    // als eigene und ist danach unabhängig.
    duplicatePath(id = this.activeId) {
      if (!this.plan || !this.canAddPath) return;
      const src = pathById(this.plan, id);
      if (!src) return;
      const path = {
        id: newId('pf'),
        name: `${src.name} (Kopie)`,
        color: this.nextColor(),
        parentId: src.parentId,
        own: { ...effectivePicks(this.plan, id) },
        order: src.order ? [...src.order] : null,
        note: src.note || '',
      };
      const at = this.plan.paths.findIndex((p) => p.id === id);
      this.plan.paths.splice(at + 1, 0, path);
      this.plan.activePathId = path.id;
      this.commit();
    },

    addPath() {
      if (!this.plan || !this.canAddPath) return;
      const path = {
        id: newId('pf'),
        name: `Plan ${String.fromCharCode(65 + this.pathCount)}`,
        color: this.nextColor(),
        parentId: null,
        own: {},
        order: null,
        note: '',
      };
      this.plan.paths.push(path);
      this.plan.activePathId = path.id;
      this.commit();
    },

    // Beim Löschen erben die Kinder die Wahl des Gelöschten als eigene — ihre Pfade
    // bleiben damit exakt das, was sie vorher waren.
    removePath(id) {
      if (!this.plan || this.plan.paths.length <= 1) return;
      const victim = pathById(this.plan, id);
      if (!victim) return;
      this.plan.paths.forEach((p) => {
        if (p.parentId !== id) return;
        p.own = { ...victim.own, ...p.own };
        p.parentId = victim.parentId;
        if (!p.order && victim.order) p.order = [...victim.order];
      });
      this.plan.paths = this.plan.paths.filter((p) => p.id !== id);
      if (this.plan.activePathId === id) this.plan.activePathId = this.plan.paths[0].id;
      this.confirm = null;
      this.commit();
    },

    movePath(id, dir) {
      if (!this.plan) return;
      const list = this.plan.paths;
      const at = list.findIndex((p) => p.id === id);
      const parent = list[at]?.parentId || null;
      // Verschoben wird nur innerhalb der Geschwister — die Abstammung bleibt heil.
      const siblings = list.map((p, i) => ({ p, i })).filter((r) => (r.p.parentId || null) === parent);
      const pos = siblings.findIndex((r) => r.p.id === id);
      const target = siblings[pos + dir];
      if (!target) return;
      list[at] = target.p;
      list[target.i] = siblings[pos].p;
      this.commit();
    },

    openPathForm(id) {
      const p = pathById(this.plan, id);
      if (!p) return;
      this.pathForm = { id: p.id, name: p.name, color: p.color, note: p.note || '', ownOrder: !!p.order };
      this.$nextTick(() => document.getElementById('dp-path-form')?.showPopover());
    },
    savePathForm() {
      const form = this.pathForm;
      const p = form && pathById(this.plan, form.id);
      if (!p) return;
      p.name = String(form.name || '').trim().slice(0, 60) || p.name;
      p.color = /^#[0-9a-f]{6}$/i.test(form.color) ? form.color : p.color;
      p.note = String(form.note || '').slice(0, 2000);
      if (form.ownOrder && !p.order) p.order = effectiveOrder(this.plan, p.id);
      if (!form.ownOrder && p.order) p.order = null;
      this.closePop('dp-path-form');
      this.pathForm = null;
      this.commit();
    },
    get colorChoices() { return PATH_COLORS; },

    // --- Slots und Kandidaten ----------------------------------------------
    get columns() {
      const plan = this.plan;
      if (!plan) return [];
      const live = this.live;
      const picks = this.activePicks;
      const usage = this.usage;
      const byName = new Map(this.league.pokemon.map((p) => [p.name, p]));

      return this.activeOrder.map((slot, i) => {
        const tier = slotTier(slot);
        const all = (plan.slots[slot] || []).map((name) => {
          const state = monState(name, tier, live);
          return {
            name,
            mon: byName.get(name) || { name, types: [], image: '' },
            state,
            chosen: picks[slot] === name,
            paths: (usage[slot]?.[name] || []),
          };
        });
        // Gesichertes zuerst, Verlorenes ans Ende — die Spalte erzählt den Stand von oben nach unten.
        const rank = (c) => (c.state === 'secured' ? 0 : c.state === 'lost' ? 2 : 1);
        const sorted = [...all].sort((a, b) => rank(a) - rank(b));
        const shown = this.showLost || !live.active ? sorted : sorted.filter((c) => c.state !== 'lost' || c.chosen);
        return {
          slot,
          tier,
          step: i + 1,
          pick: picks[slot] || null,
          candidates: shown,
          hidden: sorted.length - shown.length,
          openCount: sorted.filter((c) => c.state === 'open').length,
          securedName: sorted.find((c) => c.state === 'secured')?.name || null,
        };
      });
    },

    columnOf(slot) { return this.columns.find((c) => c.slot === slot) || null; },

    get planEmpty() {
      return SLOT_KEYS.every((k) => !(this.plan?.slots?.[k] || []).length);
    },

    addCandidate(slot, name) {
      const plan = this.plan;
      if (!plan || !name) return;
      const list = plan.slots[slot] || (plan.slots[slot] = []);
      if (!list.includes(name)) list.push(name);
      // Der erste Kandidat eines Slots ist fast immer auch der Wunsch — einmal sparen.
      if (!this.activePicks[slot]) this.choose(slot, name, { silent: true });
      this.commit();
    },

    removeCandidate(slot, name) {
      const plan = this.plan;
      if (!plan) return;
      plan.slots[slot] = (plan.slots[slot] || []).filter((n) => n !== name);
      plan.paths.forEach((p) => {
        if (p.own && p.own[slot] === name) delete p.own[slot];
      });
      this.menu = null;
      this.commit();
    },

    // Eine Wahl, die schon vom Elternpfad kommt, wird NICHT eigens gespeichert —
    // sonst reißt die Verknüpfung und eine spätere Korrektur oben bliebe hier liegen.
    choose(slot, name, { silent = false } = {}) {
      const plan = this.plan;
      const path = this.active;
      if (!plan || !path) return;
      const parentPicks = path.parentId ? effectivePicks(plan, path.parentId) : {};
      const same = this.activePicks[slot] === name;
      const next = same ? null : name;

      if ((parentPicks[slot] || null) === next) delete path.own[slot];
      else path.own[slot] = next;

      this.menu = null;
      this.focusSlot = null;
      if (!silent) this.commit();
    },

    isInherited(slot) {
      const path = this.active;
      return !!path && !(slot in (path.own || {}));
    },

    moveSlot(slot, dir) {
      const plan = this.plan;
      if (!plan) return;
      const path = this.active;
      const list = [...this.activeOrder];
      const at = list.indexOf(slot);
      if (at < 0 || at + dir < 0 || at + dir >= list.length) return;
      [list[at], list[at + dir]] = [list[at + dir], list[at]];
      if (path?.order) path.order = list;
      else plan.order = list;
      this.commit();
    },
    resetOrder() {
      const plan = this.plan;
      if (!plan) return;
      const path = this.active;
      if (path?.order) path.order = [...SLOT_KEYS];
      else plan.order = [...SLOT_KEYS];
      this.commit();
    },
    get orderIsCustom() {
      return this.activeOrder.join() !== SLOT_KEYS.join();
    },

    // --- Kandidaten hinzufügen (Auswahlblatt) ------------------------------
    openPicker(slot) {
      this.pickerSlot = slot;
      this.pickerQuery = '';
      this.menu = null;
      this.$nextTick(() => {
        document.getElementById('dp-picker')?.showPopover();
        document.getElementById('dp-picker-input')?.focus();
      });
    },
    closePicker() {
      this.closePop('dp-picker');
      this.pickerSlot = null;
    },
    get pickerTier() { return this.pickerSlot ? slotTier(this.pickerSlot) : null; },
    get pickerResults() {
      const slot = this.pickerSlot;
      if (!slot) return [];
      const tier = slotTier(slot);
      const term = this.pickerQuery.trim().toLowerCase();
      const already = new Set(this.plan?.slots[slot] || []);
      const live = this.live;
      return this.league.pokemon
        .filter((p) => p.tier === tier)
        .filter((p) => !already.has(p.name))
        .filter((p) => !term
          || p.name.toLowerCase().includes(term)
          || (p.name_en || '').toLowerCase().includes(term)
          || (p.types || []).some((t) => t.toLowerCase().includes(term)))
        .map((p) => ({ mon: p, state: monState(p.name, tier, live) }))
        .sort((a, b) => (a.state === 'lost') - (b.state === 'lost') || a.mon.name.localeCompare(b.mon.name));
    },
    pickerAdd(name) {
      if (!this.pickerSlot) return;
      this.addCandidate(this.pickerSlot, name);
    },

    // --- Kandidaten-Menü ---------------------------------------------------
    openMenu(slot, name) {
      this.menu = { slot, name };
      this.$nextTick(() => document.getElementById('dp-menu')?.showPopover());
    },
    closeMenu() {
      this.closePop('dp-menu');
      this.menu = null;
    },
    get menuMon() {
      return this.menu ? this.league.pokemon.find((p) => p.name === this.menu.name) || { name: this.menu.name } : null;
    },
    get menuPaths() {
      if (!this.menu) return [];
      return (this.usage[this.menu.slot]?.[this.menu.name] || []).map((id) => pathById(this.plan, id)).filter(Boolean);
    },

    // --- Auswertung --------------------------------------------------------
    memo(key, build) {
      const sig = `${key}|${this.teamId}|${this.activeId}|${JSON.stringify(this.activePicks)}|${this.live.mine.size}|${this.live.takenByOthers.size}`;
      if (this._memo[key]?.sig !== sig) this._memo[key] = { sig, value: build() };
      return this._memo[key].value;
    },

    get analysisMons() {
      return this.plan ? pathMons(this.plan, this.activeId, this.league.pokemon) : [];
    },
    get coverage() {
      return this.memo('cov', () => coverageOf(this.analysisMons)
        .sort((a, b) => b.pressure - a.pressure || a.type.localeCompare(b.type)));
    },
    get weakTop() {
      return this.memo('weak', () => weakSpots(this.analysisMons, 4));
    },
    get openTiers() {
      const picks = this.activePicks;
      const out = {};
      PLAN_TIERS.forEach((tier) => {
        const used = SLOT_KEYS.filter((k) => slotTier(k) === tier && picks[k]).length;
        out[tier] = used < SLOTS_PER_TIER;
      });
      return out;
    },
    get suggestions() {
      return this.memo('sug', () => suggestCoverage(this.analysisMons, this.league.pokemon, {
        exclude: new Set(this.analysisMons.map((m) => m.name)),
        live: this.live,
        openTiers: this.openTiers,
        limit: 8,
      }));
    },
    get speed() {
      return this.memo('spd', () => speedProfile(this.analysisMons, this.league.pokemon));
    },
    // Ein Vorschlag landet im ersten freien Slot seines Tiers und wird dort gleich gewählt.
    adoptSuggestion(mon) {
      const picks = this.activePicks;
      const slot = SLOT_KEYS.find((k) => slotTier(k) === mon.tier && !picks[k]);
      if (!slot) return;
      this.addCandidate(slot, mon.name);
      this.choose(slot, mon.name);
      this.view = 'board';
    },

    // Ein Pfad stirbt fast immer an EINER Stelle. Statt ihn nur auszugrauen, führt der
    // Weg zurück direkt dorthin: Pfad aktivieren, Liste öffnen, den Slot in den Blick.
    repairPath(id) {
      const row = this.pathRows.find((r) => r.path.id === id);
      const slot = row?.summary.blocked?.[0]?.slot
        || (row?.summary.conflicts?.[0] && SLOT_KEYS.find((k) => slotTier(k) === row.summary.conflicts[0].tier))
        || null;
      this.setActive(id);
      this.view = 'board';
      this.layout = 'liste';
      this.focusSlot = slot;
      this.$nextTick(() => {
        document.querySelector(`[data-slot="${slot}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    },
    // --- Board-Geometrie ---------------------------------------------------
    get board() { return BOARD; },
    get boardStyle() {
      return `--dp-col:${BOARD.colW}px;--dp-gap:${BOARD.colGap}px;--dp-head:${BOARD.headH}px;--dp-chip:${BOARD.chipH}px;--dp-chip-gap:${BOARD.chipGap}px`;
    },
    get boardWidth() {
      return this.columns.length * (BOARD.colW + BOARD.colGap) - BOARD.colGap;
    },
    get boardHeight() {
      const rows = Math.max(1, ...this.columns.map((c) => c.candidates.length));
      return BOARD.headH + rows * (BOARD.chipH + BOARD.chipGap) + BOARD.chipH + BOARD.chipGap;
    },
    pointAt(colIndex, rowIndex, offset = 0) {
      const left = colIndex * (BOARD.colW + BOARD.colGap);
      return {
        left,
        right: left + BOARD.colW,
        y: BOARD.headH + rowIndex * (BOARD.chipH + BOARD.chipGap) + BOARD.chipH / 2 + offset,
      };
    },

    // Eine Linie je Pfad, quer durch die Spalten — gezeichnet wird aber nur in den
    // Zwischenräumen: Über einer Kachel wäre die Linie ohnehin verdeckt, und genau diese
    // Lücken sind es, die den Verlauf lesbar machen. Laufen mehrere Pfade durch dieselben
    // Kandidaten, versetzt sie ein kleiner Höhenversatz gegeneinander.
    get pathLines() {
      const plan = this.plan;
      if (!plan) return [];
      const cols = this.columns;
      const visible = this.showDead ? this.pathRows : this.livePaths;
      const spread = 2.5;
      const mid = (visible.length - 1) / 2;

      return visible.map((row, ri) => {
        const picks = this.picksOf(row.path.id);
        const offset = (ri - mid) * spread;
        const points = [];
        cols.forEach((col, i) => {
          const name = picks[col.slot];
          if (!name) return;
          const at = col.candidates.findIndex((c) => c.name === name);
          if (at < 0) return;
          points.push(this.pointAt(i, at, offset));
        });
        return {
          id: row.path.id,
          color: row.path.color,
          active: row.path.id === this.activeId,
          ok: row.summary.ok,
          d: gutterCurves(points),
        };
      }).filter((l) => l.d);
    },

    // Als Zeichenkette, nicht als x-for: Ein <template> innerhalb eines <svg> landet im
    // falschen Namensraum und wird vom Parser aus dem Baum gehoben. `innerHTML` an einem
    // SVG-Element parst dagegen korrekt im SVG-Namensraum.
    get linesSvg() {
      return this.pathLines.map((l) => (
        `<path fill="none" stroke-linecap="round" stroke-linejoin="round" d="${l.d}" stroke="${l.color}"`
        + ` stroke-width="${l.active ? 3 : 1.5}" opacity="${l.active ? 0.95 : 0.4}"`
        + `${l.ok ? '' : ' stroke-dasharray="4 5"'} />`
      )).join('');
    },

    // --- Kleinkram ---------------------------------------------------------
    tierColor(tier) { return tierColor(tier); },
    typeColor(type) { return typeColor(type); },
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
    goMon(name) {
      this.$dispatch('navigate', { key: 'pokemon', pokemonName: name });
    },
    closePop(id) {
      const el = document.getElementById(id);
      if (el && el.matches(':popover-open')) el.hidePopover();
    },
    askRemovePath(id) {
      this.confirm = { kind: 'path', id, name: pathById(this.plan, id)?.name || '' };
      this.$nextTick(() => document.getElementById('dp-confirm')?.showPopover());
    },
    resetPlan() {
      if (!this.team) return;
      this.plans = { ...this.plans, [this.team.id]: blankPlan(this.team.id) };
      this._memo = {};
      this.confirm = null;
      this.closePop('dp-confirm');
      this.commit();
    },
    askReset() {
      this.confirm = { kind: 'plan' };
      this.$nextTick(() => document.getElementById('dp-confirm')?.showPopover());
    },
    runConfirm() {
      if (this.confirm?.kind === 'path') { this.removePath(this.confirm.id); this.closePop('dp-confirm'); }
      else if (this.confirm?.kind === 'plan') this.resetPlan();
    },
  };
}

// Je Zwischenraum ein eigener Kurvenzug, alle in einem Pfad. Waagerecht auslaufende
// Bezierkurven statt Geraden: Zwei Pfade, die sich kreuzen, bleiben so unterscheidbar.
function gutterCurves(points) {
  if (!points || points.length < 2) return '';
  let d = '';
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = Math.max(12, (b.left - a.right) * 0.5);
    d += `M ${a.right} ${a.y} C ${a.right + dx} ${a.y}, ${b.left - dx} ${b.y}, ${b.left} ${b.y} `;
  }
  return d.trim();
}
