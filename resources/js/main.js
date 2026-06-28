import Alpine from 'alpinejs';
import { db } from './firebase.js';
import { collection, doc, onSnapshot, writeBatch, arrayUnion, setDoc } from 'firebase/firestore';
import { battleStats, computeStandings, pokemonStats, placementHistory, speedTiers, applySpeedMod, typeMultiplier, ALL_TYPES, pokemonProfile, defensiveChart, offensiveChart } from './scoring.mjs';

const PICKS_PER_TEAM = 10;
const TIER_ORDER = ['S', 'A', 'B', 'C', 'D'];

const ICONS = {
  pokeball: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h6"/><path d="M15 12h6"/><circle cx="12" cy="12" r="2.6"/></svg>`,
  standings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V12"/><path d="M12 21V4"/><path d="M19 21v-6"/><path d="M3 21h18"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`,
  teams: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.4a3.2 3.2 0 0 1 0 5.2"/><path d="M17.6 14.6a5.5 5.5 0 0 1 2.9 5.4"/></svg>`,
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

const ACCESS_KEY = 'jhdl-access-v1';
const ACCESS_HASH = 'b1cf8aac575a8627eb910e7df1962aa0d50621d7f1007fdeaa838d6fdce66883';

// Persistente, gerätelokale Anzeige-Einstellungen der Team-Analyse-Bereiche.
const SPEED_SETTINGS_KEY = 'jhdl-speedtiers-v1'; // { [monName]: { show, x15, x2 } }
const WEAK_SETTINGS_KEY = 'jhdl-weakness-v1';   // { [monName]: true }  (ausgeschlossen)

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

const STAT_MODES = [
  { key: 'kills', label: 'Kills' },
  { key: 'deaths', label: 'Deaths' },
  { key: 'matchups', label: 'Matchups' },
  { key: 'battles', label: 'Kämpfe' },
];

// Neutrale Linienfarbe — Teams werden im Diagramm über ihr Logo an jedem Datenpunkt
// identifiziert, nicht über eine hinterlegte Team-Farbe.
const CHART_LINE = '#4b5563';

// Aus dem Platzierungsverlauf eine SVG-Geometrie bauen (Platz 1 oben, gespielte Spieltage als X).
// styleFor(teamId, i) -> { logo } liefert das Logo, das an jedem Datenpunkt gezeichnet wird.
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
      color: CHART_LINE,
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

function rankPokemon(arr, mode, dir) {
  return [...arr].sort(
    (a, b) => (dir === 'asc' ? a[mode] - b[mode] : b[mode] - a[mode]) || a.pokemon.name.localeCompare(b.pokemon.name),
  );
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

async function sha256(value) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function gate() {
  return {
    unlocked: false,
    pw: '',
    error: false,
    checking: false,

    init() {
      this.unlocked = localStorage.getItem(ACCESS_KEY) === ACCESS_HASH;
    },

    async submit() {
      if (this.checking) return;
      this.checking = true;
      this.error = false;

      const hash = await sha256(this.pw);
      if (hash === ACCESS_HASH) {
        localStorage.setItem(ACCESS_KEY, ACCESS_HASH);
        this.unlocked = true;
        this.$store.league.ensureNotifyPermission?.();
      } else {
        this.error = true;
        this.pw = '';
      }
      this.checking = false;
    },
  };
}

function app() {
  return {
    current: 'draft',
    toasts: [],
    _toastSeq: 0,

    // Verlinkungs-Navigation: Ziel im nav-Store ablegen, dann Ansicht laden.
    onNavigate(detail) {
      if (!detail || !detail.key) return;
      const nav = this.$store.nav;
      if (nav) {
        nav.teamId = detail.teamId || null;
        nav.matchId = detail.matchId || null;
        nav.pokemonName = detail.pokemonName || null;
        // Herkunft merken, damit der Pokémon→Pokémon-Wechsel nicht die ursprüngliche
        // Ausgangsansicht überschreibt.
        if (detail.key === 'pokemon' && this.current !== 'pokemon') nav.from = this.current;
      }
      this.load(detail.key);
    },

    pushToast(detail) {
      if (!detail || !detail.msg) return;
      const id = ++this._toastSeq;
      this.toasts.push({ id, msg: detail.msg, icon: detail.icon || null });
      setTimeout(() => { this.toasts = this.toasts.filter((t) => t.id !== id); }, 4500);
    },

    // Reihenfolge abhängig vom Draft-Status: vor/während des Drafts Draft→Teams→
    // Spielplan→Tabelle, nach Abschluss umgekehrt (Tabelle zuerst).
    get items() {
      const base = [
        { key: 'draft', label: 'Draft', file: './pages/draft.html', icon: ICONS.pokeball },
        { key: 'teams', label: 'Teams', file: './pages/teams.html', icon: ICONS.teams },
        { key: 'spieltag', label: 'Spielplan', file: './pages/spieltag.html', icon: ICONS.bolt },
        { key: 'tabelle', label: 'Tabelle', file: './pages/tabelle.html', icon: ICONS.standings },
      ];
      return this.$store.league.draft?.status === 'done' ? [...base].reverse() : base;
    },

    // Vollständiger Route-Katalog inkl. versteckter Pokémon-Detailansicht (nicht in
    // Sidebar/Mobile-Nav, nur per Verlinkung erreichbar).
    get routes() {
      return [...this.items, { key: 'pokemon', file: './pages/pokemon.html' }];
    },

    isActive(key) {
      return this.current === key;
    },

    closeMobileNav() {
      const el = document.getElementById('mobile-nav');
      if (el && el.matches(':popover-open')) el.hidePopover();
    },

    async load(key, { animate = true } = {}) {
      const item = this.routes.find((i) => i.key === key);
      if (!item) return;

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
  };
}

function draftBoard() {
  return {
    q: '',
    candidate: null,
    busy: false,

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

    // Aktueller Pick im Snake-System
    get currentPick() {
      const d = this.draft;
      if (!this.running || !d.order || !d.order.length) return null;
      const n = d.order.length;
      const round = Math.floor(d.pickIndex / n);
      const pos = d.pickIndex % n;
      const idx = round % 2 === 0 ? pos : n - 1 - pos;
      return { teamId: d.order[idx], round: round + 1, pickNo: d.pickIndex + 1 };
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

    // Letzte Picks (neueste zuerst) — aus Snake-Reihenfolge + Team-Rostern rekonstruiert.
    // Picks landen pro Team in Pick-Reihenfolge im roster; die globale Reihenfolge ergibt
    // sich aus order[] + pickIndex, daher kein separater Pick-Log nötig.
    get recentPicks() {
      const d = this.draft;
      const order = d.order || [];
      const n = order.length;
      if (!n) return [];
      const made = Math.min(d.pickIndex || 0, n * PICKS_PER_TEAM);
      const counts = {};
      const picks = [];
      for (let k = 0; k < made; k++) {
        const round = Math.floor(k / n);
        const pos = k % n;
        const idx = round % 2 === 0 ? pos : n - 1 - pos;
        const teamId = order[idx];
        const occ = counts[teamId] || 0;
        counts[teamId] = occ + 1;
        const team = this.teamById(teamId);
        const mon = team?.pokemon?.[occ] || null;
        if (mon) picks.push({ pickNo: k + 1, round: round + 1, team, mon });
      }
      return picks.slice(-9).reverse();
    },

    get draftedNames() {
      const set = new Set();
      this.league.teams.forEach((t) => (t.pokemon || []).forEach((p) => set.add(p.name)));
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

    isPickable(p) {
      if (!this.running || !this.currentTeam) return false;
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

    choose(p) {
      if (!this.isPickable(p) || this.busy) return;
      this.candidate = p;
      this.$nextTick(() => document.getElementById('pick-confirm')?.showPopover());
    },

    async confirmPick() {
      if (!this.candidate || !this.currentTeam || this.busy) return;
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
  };
}

function teamsView() {
  return {
    selectedId: null,
    statMode: 'kills',
    statDir: 'desc',
    statModes: STAT_MODES,

    // Speed-Tiers: gerätelokal persistierte Anzeige-Einstellungen je Pokémon.
    spdSort: 'desc',
    spdSettings: {},
    // Schwächen/Resistenzen: ausgeschlossene Pokémon (gerätelokal).
    weakExcluded: {},
    allTypes: ALL_TYPES,

    // Beim Laden: ggf. per Verlinkung übergebenes Team direkt öffnen.
    init() {
      this.spdSettings = loadJson(SPEED_SETTINGS_KEY);
      this.weakExcluded = loadJson(WEAK_SETTINGS_KEY);
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
        if (!b || !b.done || !b.score) return { done: false };
        done++;
        const s = battleStats(b.score);
        ownWins += side === 'home' ? s.homePoints : s.awayPoints;
        oppWins += side === 'home' ? s.awayPoints : s.homePoints;
        return {
          done: true,
          own: side === 'home' ? b.score.home : b.score.away,
          opp: side === 'home' ? b.score.away : b.score.home,
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
      }));
    },
    get teamCurveSvg() {
      return chartSvgString(this.teamCurve);
    },

    // --- Pokémon-Ranking des Teams ---
    get teamRanking() {
      const team = this.selectedTeam;
      if (!team) return [];
      return rankPokemon(pokemonStats([team], this.league.results), this.statMode, this.statDir);
    },
    vtName(p) {
      return pokemonVtName(p);
    },
    setStatMode(m) {
      if (m === this.statMode) return;
      withReorderTransition(() => (this.statMode = m), () => this.$nextTick());
    },
    toggleStatDir() {
      withReorderTransition(() => (this.statDir = this.statDir === 'desc' ? 'asc' : 'desc'), () => this.$nextTick());
    },
    fmtDiff(d) {
      return d > 0 ? `+${d}` : `${d}`;
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
      return { show: s.show !== false, x15: !!s.x15, x2: !!s.x2 };
    },
    spdToggle(name, key) {
      const cur = this.spdGet(name);
      cur[key] = !cur[key];
      this.spdSettings = { ...this.spdSettings, [name]: cur };
      saveJson(SPEED_SETTINGS_KEY, this.spdSettings);
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
      const invs = [
        { key: 's0', label: '0' },
        { key: 's32', label: '32' },
        { key: 's32n', label: '32+' },
      ];
      const rows = [];
      for (const mon of (team.pokemon || [])) {
        const s = this.spdGet(mon.name);
        if (!s.show) continue;
        const base = this.baseSpeedFor(mon);
        if (base == null) continue;
        const tiers = speedTiers(base);
        const mods = [{ key: 'x1', label: '×1', mult: 1 }];
        if (s.x15) mods.push({ key: 'x15', label: '×1,5', mult: 1.5 });
        if (s.x2) mods.push({ key: 'x2', label: '×2', mult: 2 });
        for (const inv of invs) {
          for (const mod of mods) {
            rows.push({
              id: `${mon.name}|${inv.key}|${mod.key}`,
              mon,
              inv: inv.label,
              invKey: inv.key,
              mod: mod.label,
              modKey: mod.key,
              speed: applySpeedMod(tiers[inv.key], mod.mult),
            });
          }
        }
      }
      const dir = this.spdSort === 'asc' ? 1 : -1;
      rows.sort((a, b) => dir * (a.speed - b.speed) || a.mon.name.localeCompare(b.mon.name));
      return rows;
    },
    invColor(key) {
      return key === 's32n' ? '#ffcb05' : key === 's32' ? '#ff5a36' : '#98a2b3';
    },
    modColor(key) {
      return key === 'x2' ? '#63bc5a' : key === 'x15' ? '#4d90d5' : '#98a2b3';
    },

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

function scheduleView() {
  return {
    busy: false,
    saving: false,
    editing: null, // { day, matchIndex, home, away, docId }
    step: 0, // 0 = Aufgebot, 1..3 = Kämpfe
    form: null,
    detail: null, // { day, matchIndex, home, away }
    _pendingMatch: null,
    _scrolledToOpen: false,

    // Beim Laden: ggf. per Verlinkung übergebene Match-Detailansicht öffnen, sonst
    // einmalig zum ersten offenen Spiel scrollen.
    init() {
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
      return `s1-d${day}-m${matchIndex}`;
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
        if (b && b.done && b.score) {
          any = true;
          const s = battleStats(b.score);
          home += s.homePoints;
          away += s.awayPoints;
        }
      });
      return any ? { home, away } : null;
    },
    // Gesamtsieger eines Matches (gewonnene Kämpfe je Seite), für Karten-Akzent.
    matchOutcome(day, matchIndex) {
      const s = this.summaryFor(day, matchIndex);
      if (!s) return null;
      return { ...s, winner: s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw' };
    },

    // --- Match-Detailansicht (read-only) ---
    monImageFor(teamId, name) {
      const t = this.teamById(teamId);
      return (t?.pokemon || []).find((p) => p.name === name)?.image || '';
    },
    openDetail(day, matchIndex, home, away) {
      // Nur öffnen, wenn ein Ergebnis existiert; sonst direkt in die Eingabe.
      if (!this.resultFor(day, matchIndex)) return this.openEntry(day, matchIndex, home, away);
      this.detail = { day, matchIndex, home, away };
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
        const s = battleStats(b.score);
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
      };
    },

    // --- Eingabe-Stepper ---
    roster(side) {
      const t = this.teamById(this.editing?.[side]);
      const rank = { S: 0, A: 1, B: 2, C: 3, D: 4 };
      return [...(t?.pokemon || [])].sort((a, b) => (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9));
    },
    monImage(side, name) {
      return this.roster(side).find((p) => p.name === name)?.image || '';
    },

    blankBattle() {
      return { used: { home: [], away: [] }, winner: null, survivors: null, fate: {} };
    },
    openEntry(day, matchIndex, home, away) {
      const existing = this.resultFor(day, matchIndex);
      this.editing = { day, matchIndex, home, away, docId: this.resultDocId(day, matchIndex) };
      this.step = 0;
      this.form = existing ? this.hydrate(existing) : {
        squads: { home: [], away: [] },
        battles: [this.blankBattle(), this.blankBattle(), this.blankBattle()],
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
        let winner = 'draw';
        let survivors = null;
        const sh = b.score?.home ?? 0;
        const sa = b.score?.away ?? 0;
        if (sh > sa) { winner = 'home'; survivors = sh; }
        else if (sa > sh) { winner = 'away'; survivors = sa; }
        return { used, winner, survivors, fate };
      });
      return { squads: { home: [...(r.squads?.home || [])], away: [...(r.squads?.away || [])] }, battles };
    },
    closeEntry() {
      const el = document.getElementById('result-entry');
      if (el && el.matches(':popover-open')) el.hidePopover();
      this.editing = null;
      this.form = null;
      this.step = 0;
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

    // Endstand
    setWinner(side) {
      const b = this.currentBattle();
      b.winner = side;
      if (side === 'draw') b.survivors = null;
    },
    setSurvivors(n) {
      this.currentBattle().survivors = n;
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
      if (b.winner !== 'draw' && !(b.survivors >= 1 && b.survivors <= 4)) return false;
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
        const score =
          b.winner === 'home' ? { home: b.survivors || 0, away: 0 }
          : b.winner === 'away' ? { home: 0, away: b.survivors || 0 }
          : { home: 0, away: 0 };
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
          kills,
        };
      });
      return {
        season: 1,
        day: this.editing.day,
        matchIndex: this.editing.matchIndex,
        home: this.editing.home,
        away: this.editing.away,
        squads: { home: [...this.form.squads.home], away: [...this.form.squads.away] },
        battles,
      };
    },
    async save() {
      if (this.saving) return;
      this.saving = true;
      try {
        await this.league.saveResult(this.editing.docId, this.serialize());
        this.closeEntry();
      } catch (e) {
        console.error('Ergebnis speichern fehlgeschlagen:', e);
      }
      this.saving = false;
    },
  };
}

function standingsView() {
  return {
    get league() {
      return this.$store.league;
    },
    get loaded() {
      return this.league.teamsLoaded && this.league.resultsLoaded;
    },
    get rows() {
      return computeStandings(this.league.seasonTeams, this.league.results);
    },

    // --- Liga-weites Platzierungs-Diagramm (alle Teams) ---
    get curve() {
      return buildChart(
        placementHistory(this.league.seasonTeams, this.league.results),
        this.league.seasonTeams.length,
        (teamId) => {
          const t = this.teamById(teamId);
          return { logo: t ? this.logoUrl(t.logo) : null };
        },
      );
    },
    get curveSvg() {
      return chartSvgString(this.curve);
    },

    // --- Liga-weites Pokémon-Ranking (alle Teams) ---
    statMode: 'kills',
    statDir: 'desc',
    statModes: STAT_MODES,
    get ranking() {
      return rankPokemon(pokemonStats(this.league.seasonTeams, this.league.results), this.statMode, this.statDir);
    },
    vtName(p) {
      return pokemonVtName(p);
    },
    setStatMode(m) {
      if (m === this.statMode) return;
      withReorderTransition(() => (this.statMode = m), () => this.$nextTick());
    },
    toggleStatDir() {
      withReorderTransition(() => (this.statDir = this.statDir === 'desc' ? 'asc' : 'desc'), () => this.$nextTick());
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

    // Ziel-Pokémon + Herkunft aus dem nav-Store puffern (nicht löschen -> Reload/Watch).
    init() {
      const nav = this.$store.nav;
      this.name = nav?.pokemonName || null;
      this.from = nav?.from || null;
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
        this._profileCache = pokemonProfile(this.name, this.league.seasonTeams, this.league.results);
      }
      return this._profileCache;
    },
    get team() {
      return this.profile?.team || null;
    },

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
        { key: 's0', label: '0' },
        { key: 's32', label: '32' },
        { key: 's32n', label: '32+' },
      ];
      const mods = [
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
      return key === 's32n' ? '#ffcb05' : key === 's32' ? '#ff5a36' : '#98a2b3';
    },
    modColor(key) {
      return key === 'x2' ? '#63bc5a' : key === 'x15' ? '#4d90d5' : '#98a2b3';
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
  };
}

window.Alpine = Alpine;

Alpine.store('league', {
  teams: [],
  pokemon: [],
  draft: { status: 'idle', order: [], pickIndex: 0 },
  schedule: { matchdays: [] },
  results: [],
  teamsLoaded: false,
  pokemonLoaded: false,
  draftLoaded: false,
  scheduleLoaded: false,
  resultsLoaded: false,

  // Pick-Benachrichtigungen
  _rosterCounts: {},
  _notifyArmed: false,
  _audioCtx: null,

  get seasonTeams() {
    return [...this.teams]
      .filter((t) => t.season === 1)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  init() {
    this.loadPokemon();

    onSnapshot(collection(db, 'teams'), (snap) => {
      const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.detectPicks(next);
      this.teams = next;
      this.teamsLoaded = true;
    });

    onSnapshot(doc(db, 'drafts', 's1'), (snap) => {
      this.draft = snap.exists() ? snap.data() : { status: 'idle', order: [], pickIndex: 0 };
      this.draftLoaded = true;
    });

    onSnapshot(doc(db, 'schedules', 's1'), (snap) => {
      this.schedule = snap.exists() ? snap.data() : { matchdays: [] };
      this.scheduleLoaded = true;
    });

    onSnapshot(collection(db, 'results'), (snap) => {
      this.results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

  async startDraft() {
    const ids = this.seasonTeams.map((t) => t.id);
    if (!ids.length) return;
    const order = shuffle(ids);
    const batch = writeBatch(db);
    ids.forEach((id) => batch.update(doc(db, 'teams', id), { pokemon: [] }));
    batch.set(doc(db, 'drafts', 's1'), { season: 1, status: 'running', order, pickIndex: 0 });
    await batch.commit();
  },

  async generateSchedule() {
    const janik = this.seasonTeams.filter((t) => t.player === 'Janik').map((t) => t.id);
    const henrik = this.seasonTeams.filter((t) => t.player === 'Henrik').map((t) => t.id);
    if (!janik.length || !henrik.length) return;
    const matchdays = buildSchedule(janik, henrik);
    await setDoc(doc(db, 'schedules', 's1'), {
      season: 1,
      createdAt: new Date().toISOString(),
      matchdays,
    });
  },

  async saveResult(docId, data) {
    await setDoc(doc(db, 'results', docId), { ...data, updatedAt: new Date().toISOString() });
  },

  async pick(teamId, pokemon) {
    const n = this.draft.order.length;
    const total = n * 10;
    const nextIndex = this.draft.pickIndex + 1;
    const status = nextIndex >= total ? 'done' : 'running';
    const batch = writeBatch(db);
    batch.update(doc(db, 'teams', teamId), { pokemon: arrayUnion(pokemon) });
    batch.update(doc(db, 'drafts', 's1'), { pickIndex: nextIndex, status });
    await batch.commit();
  },
});

// Einfacher Navigations-Übergabepuffer: ein Klick setzt ein Ziel, die Ziel-View liest
// es beim init() aus und räumt auf.
Alpine.store('nav', { teamId: null, matchId: null, pokemonName: null, from: null });

Alpine.data('gate', gate);
Alpine.data('app', app);
Alpine.data('draftBoard', draftBoard);
Alpine.data('teamsView', teamsView);
Alpine.data('scheduleView', scheduleView);
Alpine.data('standingsView', standingsView);
Alpine.data('pokemonView', pokemonView);
Alpine.start();
