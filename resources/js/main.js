import Alpine from 'alpinejs';
import { db } from './firebase.js';
import { collection, doc, onSnapshot, writeBatch, arrayUnion, setDoc } from 'firebase/firestore';
import { battleStats, computeStandings, pokemonStats, placementHistory, speedTiers, applySpeedMod, typeMultiplier, ALL_TYPES, pokemonProfile, defensiveChart, offensiveChart, playerDuel, showdownExport } from './scoring.mjs';
import {
  exportDataset, buildScheduleExport, buildBattleDetailsExport, buildStandingsExport,
  buildRankingExport, buildTeamsExport, buildDraftpoolExport,
} from './export.mjs';
import { fetchEloRows, readEloCache, writeEloCache, resolveEloName } from './elo.mjs';

const PICKS_PER_TEAM = 10;
const TIER_ORDER = ['S', 'A', 'B', 'C', 'D'];

const ICONS = {
  pokeball: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h6"/><path d="M15 12h6"/><circle cx="12" cy="12" r="2.6"/></svg>`,
  standings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V12"/><path d="M12 21V4"/><path d="M19 21v-6"/><path d="M3 21h18"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`,
  teams: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.4a3.2 3.2 0 0 1 0 5.2"/><path d="M17.6 14.6a5.5 5.5 0 0 1 2.9 5.4"/></svg>`,
  player: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><path d="M2 20a5 5 0 0 1 10 0"/><path d="M12 20a5 5 0 0 1 10 0"/></svg>`,
  build: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h7"/><path d="M3 12h7"/><path d="M3 17h7"/><path d="M14 7h7"/><path d="M14 12h7"/><path d="M14 17h7"/><circle cx="14" cy="7" r="0.5"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  transfer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13"/><path d="m14 5 3 3-3 3"/><path d="M20 16H7"/><path d="m10 13-3 3 3 3"/></svg>`,
  stats: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="11" width="3" height="5" rx="0.5"/><rect x="12" y="7" width="3" height="9" rx="0.5"/><rect x="17" y="13" width="3" height="3" rx="0.5"/></svg>`,
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

// Matchup-Markierungen: pro Team-Paarung (reihenfolge-unabhängig) je Pokémon eine Farbe,
// die durch Klick rotiert. Rein gerätelokal, nur für den Nutzer selbst.
const MATCHUP_MARKS_KEY = 'jhdl-matchup-marks-v1'; // { [pairKey]: { [monName]: 'green'|'yellow'|'orange'|'red' } }
const MARK_CYCLE = [null, 'green', 'yellow', 'orange', 'red'];
const MARK_COLORS = { green: '#63bc5a', yellow: '#ffcb05', orange: '#ff9d55', red: '#e3350d' };

// Teambuilding: zuletzt geöffnetes Matchup + letzte 6 (gerätelokal).
const TB_RECENT_KEY = 'jhdl-tb-recent-v1';   // { last: {a,b}, recent: [{a,b}, …≤6] }
// Notizen & Moveset je Pokémon PRO Matchup (reihenfolge-unabhängiger markPairKey).
const TB_NOTES_KEY = 'jhdl-tb-notes-v1';     // { [markPairKey]: { [monName]: { note, moveset } } }
const TB_TILEVIEW_KEY = 'jhdl-tb-tileview-v1'; // { v: 'nur'|'notes'|'moves'|'all' }

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

// === Statistik-Katalog ======================================================
// Zentrale Definition aller Pokémon-Kennzahlen: Beschriftung, Kurzform, Format
// und Erklärtext (für die Info-Popovers). Reihenfolge = Standard-Spaltenreihenfolge.
const STAT_CATALOG = [
  { key: 'kills', label: 'Kills', short: 'K', fmt: 'int', info: 'Anzahl gegnerischer Pokémon, die dieses Pokémon besiegt hat. Self-Kills zählen nicht.' },
  { key: 'deaths', label: 'Deaths', short: 'D', fmt: 'int', info: 'Wie oft dieses Pokémon besiegt wurde – inklusive Self-Kills und ohne Verursacher.' },
  { key: 'kd', label: 'K/D', short: 'K/D', fmt: 'num2', info: 'Verhältnis Kills zu Deaths (Kills geteilt durch Deaths, Nenner mindestens 1).' },
  { key: 'killsPerBattle', label: 'Kills/Kampf', short: 'K/Kpf', fmt: 'num2', info: 'Durchschnittliche Kills pro eingesetztem Kampf.' },
  { key: 'kpfPerMu', label: 'Kämpfe/Matchup', short: 'Kpf/MU', fmt: 'num2', info: 'Durchschnittliche Kampf-Einsätze pro Match-Aufgebot (0–3): Wie oft ein nominiertes Pokémon tatsächlich in einem der bis zu drei Kämpfe steht.' },
  { key: 'battleShareInMu', label: 'Kämpfe %', short: 'Kpf %', fmt: 'pct', info: 'Einsatzquote im Matchup: Wenn nominiert (6er-Aufgebot), Anteil der bis zu drei Kämpfe, in denen dieses Pokémon tatsächlich stand.' },
  { key: 'matchups', label: 'Matchups', short: 'MU', fmt: 'int', info: 'In wie vielen Match-Aufgeboten (6 von 10) dieses Pokémon stand.' },
  { key: 'battles', label: 'Kämpfe', short: 'Kpf', fmt: 'int', info: 'In wie vielen ausgetragenen Kämpfen (4er-Einsatz) es stand.' },
  { key: 'battleWinPct', label: 'Kampf-Siegquote', short: 'Kpf-SQ', fmt: 'pct', info: 'Anteil gewonnener Kämpfe an allen Kämpfen, in denen es eingesetzt wurde.' },
  { key: 'matchWinPct', label: 'Match-Siegquote', short: 'M-SQ', fmt: 'pct', info: 'Anteil gewonnener Matches an allen Matches, in denen es im Aufgebot stand.' },
  { key: 'survivalRate', label: 'Überlebensrate', short: 'Überl.', fmt: 'pct', info: 'Anteil der Kämpfe, die es überlebt hat (kein Death).' },
  { key: 'base_speed', label: 'Initiative', short: 'Init', fmt: 'int', info: 'Basis-Initiative (Speed-Basiswert) aus den Stammdaten.' },
  { key: 'cost', label: 'Kosten', short: 'Kosten', fmt: 'int', info: 'Draft-Kosten (Punkte) des Pokémon.' },
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
  return String(v);
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
      if (saved && (saved.view === 'table' || saved.view === 'cards')) this.viewMode = saved.view;
      if (!this.visibleCols().length) this.colVisible[this.colOrder[0]] = true; // nie 0 Spalten
    },
    saveColumns() {
      saveJson(this.colStorageKey, {
        order: this.colOrder,
        visible: this.colVisible,
        sortKey: this.sortKey,
        sortDir: this.sortDir,
        view: this.viewMode,
      });
    },
    toggleView() {
      this.viewMode = this.viewMode === 'table' ? 'cards' : 'table';
      this.saveColumns();
    },
    // Als Methoden (nicht Getter!): der Object-Spread beim Einspreizen des Mixins
    // würde Getter sonst einmalig auswerten und einfrieren.
    orderedCatalog() {
      return this.colOrder.map((k) => STAT_BY_KEY[k]).filter(Boolean);
    },
    visibleCols() {
      return this.colOrder.filter((k) => this.colVisible[k]).map((k) => STAT_BY_KEY[k]);
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
    setSort(key) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        this.sortKey = key;
        this.sortDir = 'desc';
      }
      this.saveColumns();
    },
    sortRows(rows) {
      const key = this.sortKey;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      return [...rows].sort(
        (a, b) => dir * ((a[key] ?? 0) - (b[key] ?? 0)) || a.pokemon.name.localeCompare(b.pokemon.name),
      );
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

    // Globale Suche (Strg/⌘ + K)
    searchQ: '',
    searchIndex: 0,
    // Info-Popover (geteilt)
    info: { title: '', text: '' },

    initApp() {
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
          e.preventDefault();
          this.openSearch();
        }
      });
      window.addEventListener('stat-info', (e) => this.showInfo(e.detail));
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
      const nav = this.$store.nav;
      if (nav) {
        nav.teamId = detail.teamId || null;
        nav.matchId = detail.matchId || null;
        nav.pokemonName = detail.pokemonName || null;
        nav.teamAId = detail.teamAId || null;
        nav.teamBId = detail.teamBId || null;
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
        { key: 'teambuilding', label: 'Teambuilding', file: './pages/teambuilding.html', icon: ICONS.build },
        { key: 'spieltag', label: 'Spielplan', file: './pages/spieltag.html', icon: ICONS.bolt },
        { key: 'tabelle', label: 'Tabelle', file: './pages/tabelle.html', icon: ICONS.standings },
        { key: 'stats', label: 'Statistiken', file: './pages/statistiken.html', icon: ICONS.stats },
        { key: 'spieler', label: 'Spieler', file: './pages/spieler.html', icon: ICONS.player },
      ];
      const done = this.$store.league.draft?.status === 'done';
      if (!done) return base;
      // Transfer erst nach abgeschlossenem Draft (mitten in der Saison).
      const withTransfer = [
        base[0],
        { key: 'transfer', label: 'Transfer', file: './pages/transfer.html', icon: ICONS.transfer },
        ...base.slice(1),
      ];
      return withTransfer.reverse();
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
            out.push({ type: 'Match', label, sub: `Spieltag ${md.day}`, matchId: `s1-d${md.day}-m${i}`, key: 'spieltag' });
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
    // Draftpool exportieren
    runExport(fmt) {
      exportDataset(buildDraftpoolExport(this.league.pokemon, this.league.teams), fmt);
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
    // Schwächen/Resistenzen: ausgeschlossene Pokémon (gerätelokal).
    weakExcluded: {},
    allTypes: ALL_TYPES,

    // Beim Laden: ggf. per Verlinkung übergebenes Team direkt öffnen.
    init() {
      this.initColumns();
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
      }));
    },
    get teamCurveSvg() {
      return chartSvgString(this.teamCurve);
    },

    // --- Pokémon-Ranking des Teams (konfigurierbare Tabelle) ---
    get teamRanking() {
      const team = this.selectedTeam;
      if (!team) return [];
      return this.sortRows(this.enrichSpeed(pokemonStats([team], this.league.results, this.league.pokemon, { scopeTeamId: team.id })));
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
      exportDataset(buildTeamsExport(this.league.teams, this.league.pokemon), fmt);
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
        if (b && b.done) {
          any = true;
          const s = battleStats(b);
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
        let winner = b.winner;
        const sh = b.score?.home ?? 0;
        const sa = b.score?.away ?? 0;
        if (winner !== 'home' && winner !== 'away' && winner !== 'draw') {
          winner = sh > sa ? 'home' : sa > sh ? 'away' : 'draw';
        }
        return { used, winner, score: { home: b.score?.home ?? null, away: b.score?.away ?? null }, fate };
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
    init() {},

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
    // Elo-Tabellen-Sortierung
    eloSortKey: 'rang',
    eloSortDir: 'asc',

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

    // --- Stats-Tab: filterbares Pokémon-Ranking ---
    get baseRanking() {
      const speed = this.league.pokemon;
      return pokemonStats(this.league.seasonTeams, this.league.results, this.league.pokemon).map((s) => ({
        ...s,
        base_speed: (speed.find((p) => p.name === s.pokemon.name)?.base_speed) ?? 0,
      }));
    },
    get filterTeams() {
      return this.league.seasonTeams;
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
      exportDataset(buildRankingExport(l.seasonTeams, l.results, l.pokemon), fmt);
      const el = document.getElementById('exp-stats');
      if (el && el.matches(':popover-open')) el.hidePopover();
    },

    // --- Elo-Tab ---
    get eloStore() { return this.$store.elo; },
    get eloLoading() { return this.$store.elo.loading; },
    get eloError() { return this.$store.elo.error; },
    get hasElo() { return (this.$store.elo.rows || []).length > 0; },
    get eloUpdatedText() { return fmtAgo(this.$store.elo.fetchedAt); },
    refreshElo() { this.$store.elo.refresh(); },

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
      (this.league.teams || []).forEach((t) => (t.pokemon || []).forEach((p) => { teamByMon[p.name] = t; }));
      return rows.map((r) => {
        const mon = monByName[r.resolved] || null;
        const currentTier = mon?.tier || null;
        const team = teamByMon[r.resolved] || null;
        return {
          rang: r.rang, name: r.resolved, sheetName: r.name, elo: r.elo,
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
        if (key === 'elo') return Number.isFinite(r.elo) ? r.elo : -1;
        return Number.isFinite(r.rang) ? r.rang : 9999;
      };
      return [...rows].sort((a, b) => {
        const va = val(a), vb = val(b);
        if (typeof va === 'string') return dir * va.localeCompare(vb) || (a.rang ?? 0) - (b.rang ?? 0);
        return dir * (va - vb) || (a.rang ?? 0) - (b.rang ?? 0);
      });
    },
    get eloRows() { return this.sortEloRows(this.eloEnriched()); },
    setEloSort(key) {
      if (this.eloSortKey === key) this.eloSortDir = this.eloSortDir === 'asc' ? 'desc' : 'asc';
      else { this.eloSortKey = key; this.eloSortDir = key === 'elo' ? 'desc' : 'asc'; }
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

    // Ziel-Pokémon + Herkunft aus dem nav-Store puffern (nicht löschen -> Reload/Watch).
    init() {
      const nav = this.$store.nav;
      this.name = nav?.pokemonName || null;
      this.from = nav?.from || null;
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
        this._profileCache = pokemonProfile(this.name, this.league.seasonTeams, this.league.results, this.league.pokemon);
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
      return { rang: row.rang, elo: row.elo, currentTier: cur, projectedTier: proj, delta };
    },
    get eloLoading() { return this.$store.elo.loading; },

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
function spielerView() {
  return {
    get league() {
      return this.$store.league;
    },
    get loaded() {
      return this.league.teamsLoaded && this.league.resultsLoaded && this.league.pokemonLoaded;
    },
    get duel() {
      return playerDuel(this.league.seasonTeams, this.league.results);
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

// === Teambuilding: zwei Teams gegenüberstellen =============================
function teambuildingView() {
  return {
    teamAId: null,
    teamBId: null,
    inactive: {}, // name -> true (deaktiviert)
    mods: {},     // name -> { x15, x2 }
    marks: {},    // name -> Markierungsfarbe (pro Paarung)
    notes: {},    // name -> { note, moveset } (pro Matchup)
    tileView: 'nur', // 'nur' | 'notes' | 'moves' | 'all'
    recent: [],   // [{a,b}] zuletzt geöffnete Matchups
    spdSort: 'desc',
    allTypes: ALL_TYPES,
    // Showdown-Export
    exportSide: 'a',
    exportMode: 'all', // 'all' | 'green' | 'greenplus'
    exportExtra: {},   // name -> true (manuelle Ergänzung bei 'greenplus')
    exportText: '',

    init() {
      const tv = loadJson(TB_TILEVIEW_KEY);
      if (['nur', 'notes', 'moves', 'all'].includes(tv.v)) this.tileView = tv.v;
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
        notes[n] = {
          note: d.note || '',
          moveset: {
            item: ms.item || '',
            ability: ms.ability || '',
            moves: [0, 1, 2, 3].map((i) => (ms.moves && ms.moves[i]) || ''),
            evs: ms.evs || '',
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
      return !!(d.note || ms.item || ms.ability || ms.evs || (ms.moves || []).some((m) => m));
    },
    setTileView(v) {
      this.tileView = v;
      saveJson(TB_TILEVIEW_KEY, { v });
    },
    get tileGridClass() {
      return this.tileView === 'nur'
        ? 'grid-cols-5 sm:grid-cols-10'
        : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3';
    },

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
      const next = MARK_CYCLE[(i + 1) % MARK_CYCLE.length];
      const m = { ...this.marks };
      if (next) m[name] = next; else delete m[name];
      this.marks = m;
      const all = loadJson(MATCHUP_MARKS_KEY);
      all[this.markPairKey()] = this.marks;
      saveJson(MATCHUP_MARKS_KEY, all);
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
      return { x15: !!m.x15, x2: !!m.x2 };
    },
    modToggle(name, key) {
      const cur = this.modGet(name);
      cur[key] = !cur[key];
      this.mods = { ...this.mods, [name]: cur };
      this.savePair();
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
    toggleSpdSort() { this.spdSort = this.spdSort === 'desc' ? 'asc' : 'desc'; },

    // Gemeinsame Initiative-Tierlist beider Teams, nach Team eingefärbt.
    get combinedSpeedRows() {
      const invs = [{ key: 's0', label: '0' }, { key: 's32', label: '32' }, { key: 's32n', label: '32+' }];
      const rows = [];
      [['a', this.teamA], ['b', this.teamB]].forEach(([side, team]) => {
        if (!team) return;
        this.activeMons(team).forEach((mon) => {
          const base = this.baseSpeedFor(mon);
          if (base == null) return;
          const tiers = speedTiers(base);
          const m = this.modGet(mon.name);
          const mods = [{ key: 'x1', label: '×1', mult: 1 }];
          if (m.x15) mods.push({ key: 'x15', label: '×1,5', mult: 1.5 });
          if (m.x2) mods.push({ key: 'x2', label: '×2', mult: 2 });
          invs.forEach((inv) => mods.forEach((mod) => {
            rows.push({
              id: `${side}|${mon.name}|${inv.key}|${mod.key}`,
              side, team, mon,
              inv: inv.label, invKey: inv.key, mod: mod.label, modKey: mod.key,
              speed: applySpeedMod(tiers[inv.key], mod.mult),
              color: this.playerColor(team.player),
            });
          }));
        });
      });
      const dir = this.spdSort === 'asc' ? 1 : -1;
      rows.sort((a, b) => dir * (a.speed - b.speed) || a.mon.name.localeCompare(b.mon.name));
      return rows;
    },
    invColor(key) { return key === 's32n' ? '#ffcb05' : key === 's32' ? '#ff5a36' : '#98a2b3'; },
    modColor(key) { return key === 'x2' ? '#63bc5a' : key === 'x15' ? '#4d90d5' : '#98a2b3'; },

    // Bedrohungs-Matrix: bester Multiplikator, den attackerSide gegen jedes aktive
    // Pokémon der Gegenseite erzielt (STAB-Typen der aktiven Pokémon).
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
    get weakCompare() {
      const count = (team) => ALL_TYPES.map((type) => this.activeMons(team).filter((m) => typeMultiplier(type, m.types || []) > 1).length);
      const a = count(this.teamA);
      const b = count(this.teamB);
      return ALL_TYPES
        .map((type, i) => ({ type, a: a[i], b: b[i] }))
        .sort((x, y) => (y.a + y.b) - (x.a + x.b) || x.type.localeCompare(y.type));
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

    // Verlauf (Abgaben + Picks) nach Runde.
    get log() {
      const rows = [];
      (this.transfer.removed || []).forEach((r) => rows.push({ ...r, kind: 'remove' }));
      (this.transfer.added || []).forEach((a) => rows.push({ ...a, kind: 'pick' }));
      return rows.sort((a, b) => (a.round || 0) - (b.round || 0));
    },
    monImage(name) { return this.league.pokemon.find((p) => p.name === name)?.image || ''; },

    // --- Aktionen (mit Bestätigung) ---
    askRemove(mon) { if (this.busy) return; this.candidate = { type: 'remove', mon }; this.$nextTick(() => document.getElementById('transfer-confirm')?.showPopover()); },
    askPick(mon) { if (this.busy) return; this.candidate = { type: 'pick', mon }; this.$nextTick(() => document.getElementById('transfer-confirm')?.showPopover()); },
    closeConfirm(id) { const el = document.getElementById(id); if (el && el.matches(':popover-open')) el.hidePopover(); },
    async confirmAction() {
      if (!this.candidate || !this.currentTeam || this.busy) return;
      this.busy = true;
      try {
        if (this.candidate.type === 'remove') await this.league.transferRemove(this.currentTeam.id, this.candidate.mon.name);
        else await this.league.transferPick(this.currentTeam.id, this.candidate.mon);
      } catch (e) { console.error('Transfer-Aktion fehlgeschlagen:', e); }
      this.closeConfirm('transfer-confirm');
      this.candidate = null;
      this.busy = false;
    },
    async skip() { if (this.busy) return; this.busy = true; try { await this.league.transferSkip(); } catch (e) { console.error(e); } this.busy = false; },
    async start() { this.closeConfirm('transfer-start-confirm'); if (this.busy || !this.draftDone) return; this.busy = true; try { await this.league.startTransfer(); } catch (e) { console.error(e); } this.busy = false; },

    logoUrl(file) { return `./img/teams/${file}`; },
    playerColor(player) { return player === 'Henrik' ? '#4d90d5' : '#e3350d'; },
    tierColor(tier) { return TIER_COLORS[tier] || '#6b7280'; },
    typeColor(type) { return TYPE_COLORS[type] || '#6b7280'; },
    goMon(name) { this.$dispatch('navigate', { key: 'pokemon', pokemonName: name }); },
  };
}

window.Alpine = Alpine;

Alpine.store('league', {
  teams: [],
  pokemon: [],
  draft: { status: 'idle', order: [], pickIndex: 0 },
  schedule: { matchdays: [] },
  results: [],
  transfer: { status: 'idle', order: [], pickIndex: 0, removed: [], added: [] },
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

    onSnapshot(doc(db, 'drafts', 'transfer-s1'), (snap) => {
      this.transfer = snap.exists() ? snap.data() : { status: 'idle', order: [], pickIndex: 0, removed: [], added: [] };
      this.transferLoaded = true;
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

  // === Wintertransfer =======================================================
  // 4 Runden Snake, Reihenfolge = Tabellenplatz (schlechtester zuerst). Bestehende
  // Ergebnisse bleiben erhalten; nur die Roster werden verändert.
  async startTransfer() {
    const order = computeStandings(this.seasonTeams, this.results).map((r) => r.team.id).reverse();
    if (!order.length) return;
    await setDoc(doc(db, 'drafts', 'transfer-s1'), {
      season: 1, status: 'running', order, pickIndex: 0, removed: [], added: [],
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
    batch.update(doc(db, 'drafts', 'transfer-s1'), { pickIndex: next, status, ...extra });
  },

  async transferRemove(teamId, monName) {
    const team = this.teams.find((t) => t.id === teamId);
    const mon = (team?.pokemon || []).find((p) => p.name === monName);
    if (!mon) return;
    const round = this._transferRound();
    const nextRoster = team.pokemon.filter((p) => p.name !== monName);
    const batch = writeBatch(db);
    batch.update(doc(db, 'teams', teamId), { pokemon: nextRoster });
    this._transferAdvance(batch, { removed: arrayUnion({ teamId, name: monName, tier: mon.tier, round }) });
    await batch.commit();
  },

  async transferSkip() {
    const batch = writeBatch(db);
    this._transferAdvance(batch);
    await batch.commit();
  },

  async transferPick(teamId, pokemon) {
    const clean = {
      name: pokemon.name, name_en: pokemon.name_en || null, dex: pokemon.dex ?? null,
      types: pokemon.types || [], tier: pokemon.tier, cost: pokemon.cost ?? null, image: pokemon.image || null,
    };
    const round = this._transferRound();
    const batch = writeBatch(db);
    batch.update(doc(db, 'teams', teamId), { pokemon: arrayUnion(clean) });
    this._transferAdvance(batch, { added: arrayUnion({ teamId, name: clean.name, tier: clean.tier, round }) });
    await batch.commit();
  },
});

// Einfacher Navigations-Übergabepuffer: ein Klick setzt ein Ziel, die Ziel-View liest
// es beim init() aus und räumt auf.
Alpine.store('nav', { teamId: null, matchId: null, pokemonName: null, from: null, teamAId: null, teamBId: null });

// Elo-/Tier-Prognose aus dem öffentlichen Sheet (clientseitig, ohne Key). Cache im
// localStorage; per Knopfdruck (refresh) live neu geladen.
Alpine.store('elo', {
  rows: [],
  fetchedAt: null,
  loading: false,
  error: false,
  loaded: false,

  init() {
    const cache = readEloCache();
    if (cache) { this.rows = cache.rows || []; this.fetchedAt = cache.fetchedAt || null; }
    this.loaded = true;
  },
  // Beim ersten Bedarf einmalig live nachladen, falls noch kein Stand vorliegt.
  ensureLoaded() {
    if (!this.fetchedAt && !this.loading) this.refresh();
  },
  async refresh() {
    if (this.loading) return;
    this.loading = true;
    this.error = false;
    try {
      const data = await fetchEloRows();
      this.rows = data.rows;
      this.fetchedAt = data.fetchedAt;
      writeEloCache({ rows: this.rows, fetchedAt: this.fetchedAt });
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Elo-Daten aktualisiert.' } }));
    } catch (e) {
      this.error = true;
      console.error('Elo-Daten konnten nicht geladen werden:', e);
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Elo-Daten konnten nicht geladen werden.' } }));
    } finally {
      this.loading = false;
    }
  },
});

Alpine.data('gate', gate);
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
Alpine.start();
