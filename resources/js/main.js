import Alpine from 'alpinejs';
import { db } from './firebase.js';
import { collection, doc, onSnapshot, writeBatch, arrayUnion, setDoc } from 'firebase/firestore';
import { battleStats, computeStandings, pokemonStats, placementHistory } from './scoring.mjs';

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

const SERIES_COLORS = ['#e3350d', '#ffcb05', '#4d90d5', '#63bc5a', '#ab6ac8', '#ff9d55', '#73cec0', '#ec8fe6'];

// Aus dem Platzierungsverlauf eine SVG-Geometrie bauen (Platz 1 oben, gespielte Spieltage als X).
function buildChart(history, teamsCount, colorFor) {
  const W = 640, H = 240, padL = 30, padR = 14, padT = 14, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const days = history.days || [];
  const n = Math.max(1, teamsCount);
  const minDay = days.length ? days[0] : 1;
  const maxDay = days.length ? days[days.length - 1] : 1;
  const xFor = (d) => (maxDay === minDay ? padL + innerW / 2 : padL + ((d - minDay) / (maxDay - minDay)) * innerW);
  const yFor = (place) => (n <= 1 ? padT + innerH / 2 : padT + ((place - 1) / (n - 1)) * innerH);
  const lines = Object.entries(history.series || {}).map(([teamId, pts], i) => ({
    teamId,
    color: colorFor ? colorFor(teamId, i) : SERIES_COLORS[i % SERIES_COLORS.length],
    dots: pts.map((p) => ({ day: p.day, place: p.place, x: xFor(p.day), y: yFor(p.place) })),
    path: pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${xFor(p.day).toFixed(1)} ${yFor(p.place).toFixed(1)}`).join(' '),
  }));
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
  const lines = chart.lines
    .map(
      (ln) =>
        `<path d="${ln.path}" fill="none" stroke="${ln.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` +
        ln.dots.map((d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="3.5" fill="${ln.color}"/>`).join(''),
    )
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

    isActive(key) {
      return this.current === key;
    },

    closeMobileNav() {
      const el = document.getElementById('mobile-nav');
      if (el && el.matches(':popover-open')) el.hidePopover();
    },

    async load(key, { animate = true } = {}) {
      const item = this.items.find((i) => i.key === key);
      if (!item) return;

      this.closeMobileNav();

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
      return buildChart(single, this.teams.length, () => '#e3350d');
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
  };
}

function scheduleView() {
  return {
    busy: false,
    saving: false,
    editing: null, // { day, matchIndex, home, away, docId }
    step: 0, // 0 = Aufgebot, 1..3 = Kämpfe
    form: null,

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
      return buildChart(placementHistory(this.league.seasonTeams, this.league.results), this.league.seasonTeams.length);
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

  get seasonTeams() {
    return [...this.teams]
      .filter((t) => t.season === 1)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  init() {
    this.loadPokemon();

    onSnapshot(collection(db, 'teams'), (snap) => {
      this.teams = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

Alpine.data('gate', gate);
Alpine.data('app', app);
Alpine.data('draftBoard', draftBoard);
Alpine.data('teamsView', teamsView);
Alpine.data('scheduleView', scheduleView);
Alpine.data('standingsView', standingsView);
Alpine.start();
