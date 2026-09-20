// Draftplan: die Vorbereitung eines Drafts — Kandidaten je Slot, Pfade durch diese
// Kandidaten, und die Auswertung eines Pfades (Typen, Initiative, Vorschläge).
//
// Framework-frei (kein Alpine, kein Firebase) und damit unter Node testbar. Gespeichert
// wird der Plan gerätelokal und — verschlüsselt — in der privaten Ablage des Spielers;
// hier steht nur, WAS ein Plan ist und was aus ihm folgt.
//
// DAS MODELL IN EINEM ABSATZ. Ein Plan gehört zu genau einem Team und hat zehn feste
// Slots (zwei je Tier). In jeden Slot lädt man beliebig viele Kandidaten. Ein PFAD
// wählt aus diesen Kandidaten je Slot höchstens einen aus. Pfade bilden einen BAUM:
// Ein Kind kennt nur die Slots, in denen es von seinem Elternpfad ABWEICHT — alles
// davor bleibt lebendig verknüpft. Deshalb bleibt „zwei Pfade unterscheiden sich erst
// ab Slot 7" genau eine Zeile Daten, und eine Korrektur im Hauptplan wandert von selbst
// in alle Abzweigungen. Das ist der ganze Trick gegen die kombinatorische Flut.
//
// Die REIHENFOLGE ist eine eigene Größe: In welcher Folge man seine Slots ziehen will,
// hat mit dem Tier wenig zu tun — ein wichtiges C-Tier holt man in Runde 1. Sie liegt
// am Plan und kann je Pfad überschrieben werden.

import { ALL_TYPES, typeMultiplier } from './scoring.mjs';

/** Tiers in Draft-Reihenfolge. */
export const PLAN_TIERS = ['S', 'A', 'B', 'C', 'D'];

/** Wie viele Pokémon ein Team je Tier halten darf. */
export const SLOTS_PER_TIER = 2;

/** Die zehn Slots eines Kaders, in Tier-Reihenfolge. */
export const SLOT_KEYS = PLAN_TIERS.flatMap((t) => [`${t}1`, `${t}2`]);

/** Farben der Pfade — in dieser Reihenfolge vergeben, danach von vorn. */
export const PATH_COLORS = [
  '#e3350d', '#3aa9ff', '#ffcb05', '#63bc5a', '#b46bff', '#ff9d55', '#2fd3c4', '#ff5fa2',
];

/** Höchstzahl Pfade je Plan — darüber hinaus wird ein Plan unlesbar, nicht mächtiger. */
export const MAX_PATHS = 12;

export const slotTier = (key) => String(key || '').charAt(0);
export const slotNo = (key) => Number(String(key || '').slice(1)) || 1;
export const slotLabel = (key) => `${slotTier(key)}${slotNo(key)}`;

const nameOf = (p) => (typeof p === 'string' ? p : p?.name || '');
const uniq = (list) => [...new Set(list)];

let idCounter = 0;
/** Kurze, im Plan eindeutige ID. Reicht für einen gerätelokalen Datensatz. */
export function newId(prefix = 'p') {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

// === Anlegen und Reparieren =================================================

/** Ein leerer Plan: zehn leere Hüllen, ein Pfad, nichts gewählt. */
export function blankPlan(teamId) {
  const root = { id: newId('pf'), name: 'Plan A', color: PATH_COLORS[0], parentId: null, own: {}, order: null, note: '' };
  return {
    v: 1,
    teamId: teamId || null,
    order: [...SLOT_KEYS],
    slots: Object.fromEntries(SLOT_KEYS.map((k) => [k, []])),
    paths: [root],
    activePathId: root.id,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Macht aus einem beliebigen gespeicherten Stand einen gültigen Plan.
 *
 * Gerätelokale Daten überleben Umbauten und fremde Geräte; deshalb wird hier alles
 * geradegezogen, statt sich auf die Form zu verlassen: unbekannte Slots fliegen raus,
 * verwaiste Elternpfade werden zu Wurzeln, ein Pfad ohne Farbe bekommt eine.
 */
export function normalizePlan(raw, teamId) {
  const base = blankPlan(teamId);
  if (!raw || typeof raw !== 'object') return base;

  const slots = {};
  SLOT_KEYS.forEach((key) => {
    const list = Array.isArray(raw.slots?.[key]) ? raw.slots[key] : [];
    slots[key] = uniq(list.map(nameOf).filter(Boolean));
  });

  const order = sanitizeOrder(raw.order);

  const seen = new Set();
  let paths = (Array.isArray(raw.paths) ? raw.paths : [])
    .filter((p) => p && p.id && !seen.has(p.id) && seen.add(p.id))
    .map((p, i) => ({
      id: String(p.id),
      name: String(p.name || `Pfad ${i + 1}`).slice(0, 60),
      color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : PATH_COLORS[i % PATH_COLORS.length],
      parentId: p.parentId ? String(p.parentId) : null,
      own: sanitizePicks(p.own, slots),
      order: p.order ? sanitizeOrder(p.order) : null,
      note: String(p.note || '').slice(0, 2000),
      archived: !!p.archived,
    }));

  if (!paths.length) paths = base.paths;

  // Verwaiste oder zyklische Elternschaft auflösen — sonst hängt effectivePicks.
  const byId = new Map(paths.map((p) => [p.id, p]));
  paths.forEach((p) => {
    if (p.parentId && !byId.has(p.parentId)) p.parentId = null;
  });
  paths.forEach((p) => {
    const seenUp = new Set([p.id]);
    let cur = p;
    while (cur.parentId) {
      if (seenUp.has(cur.parentId)) { cur.parentId = null; break; }
      seenUp.add(cur.parentId);
      cur = byId.get(cur.parentId);
      if (!cur) break;
    }
  });

  const activePathId = byId.has(raw.activePathId) ? raw.activePathId : paths[0].id;

  return {
    v: 1,
    teamId: teamId || raw.teamId || null,
    order,
    slots,
    paths,
    activePathId,
    updatedAt: raw.updatedAt || base.updatedAt,
  };
}

function sanitizeOrder(raw) {
  const list = (Array.isArray(raw) ? raw : []).filter((k) => SLOT_KEYS.includes(k));
  return uniq([...list, ...SLOT_KEYS]);
}

function sanitizePicks(raw, slots) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  SLOT_KEYS.forEach((key) => {
    if (!(key in raw)) return;
    // `null` ist eine Aussage: Dieser Pfad lässt den Slot bewusst leer, obwohl der
    // Elternpfad dort etwas stehen hat. Ohne sie gäbe es kein „ohne" in einer Abzweigung.
    if (raw[key] === null) { out[key] = null; return; }
    const name = nameOf(raw[key]);
    // Eine Wahl, die im Slot gar nicht mehr als Kandidat liegt, ist keine Wahl.
    if (name && (slots[key] || []).includes(name)) out[key] = name;
  });
  return out;
}

// === Pfade ==================================================================

export function pathById(plan, id) {
  return (plan?.paths || []).find((p) => p.id === id) || null;
}

export function activePath(plan) {
  return pathById(plan, plan?.activePathId) || (plan?.paths || [])[0] || null;
}

export function childrenOf(plan, id) {
  return (plan?.paths || []).filter((p) => p.parentId === id);
}

/**
 * Die tatsächliche Wahl eines Pfades je Slot: die eigenen Abweichungen über dem,
 * was der Elternpfad sagt. Genau hier entsteht die lebendige Verknüpfung.
 */
export function effectivePicks(plan, pathId) {
  const chain = [];
  let cur = pathById(plan, pathId);
  const guard = new Set();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? pathById(plan, cur.parentId) : null;
  }
  const out = {};
  chain.forEach((p) => Object.assign(out, p.own || {}));
  return out;
}

/** Die Wunschreihenfolge eines Pfades: eigene, sonst die des Elternpfades, sonst die des Plans. */
export function effectiveOrder(plan, pathId) {
  let cur = pathById(plan, pathId);
  const guard = new Set();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    if (cur.order) return sanitizeOrder(cur.order);
    cur = cur.parentId ? pathById(plan, cur.parentId) : null;
  }
  return sanitizeOrder(plan?.order);
}

/**
 * Alle Pfade in Anzeigereihenfolge: Tiefensuche über den Baum, Geschwister in der
 * gespeicherten Priorität. Die Tiefe trägt die Abstammung in die Liste.
 */
export function orderedPaths(plan) {
  const out = [];
  const walk = (parentId, depth) => {
    (plan?.paths || [])
      .filter((p) => (p.parentId || null) === parentId)
      .forEach((p) => {
        out.push({ path: p, depth });
        walk(p.id, depth + 1);
      });
  };
  walk(null, 0);
  // Ein Pfad, dessen Elternteil aus der Liste gefallen ist, darf nicht verschwinden.
  (plan?.paths || []).forEach((p) => {
    if (!out.some((r) => r.path.id === p.id)) out.push({ path: p, depth: 0 });
  });
  return out;
}

/**
 * Wo trennt sich dieser Pfad von seinem Elternpfad? Der erste Slot in der
 * Wunschreihenfolge, in dem beide etwas anderes wollen.
 */
export function divergence(plan, pathId) {
  const path = pathById(plan, pathId);
  if (!path?.parentId) return null;
  const mine = effectivePicks(plan, pathId);
  const parent = effectivePicks(plan, path.parentId);
  const order = effectiveOrder(plan, pathId);
  const slot = order.find((key) => (mine[key] || null) !== (parent[key] || null));
  if (!slot) return null;
  return { slot, own: mine[slot] || null, parent: parent[slot] || null };
}

/** Wie viele Slots hat dieser Pfad belegt? */
export function planProgress(plan, pathId) {
  const picks = effectivePicks(plan, pathId);
  const filled = SLOT_KEYS.filter((k) => picks[k]).length;
  return { filled, total: SLOT_KEYS.length };
}

/** Je Slot und Kandidat: welche Pfade laufen über ihn? */
export function usageMap(plan) {
  const out = {};
  SLOT_KEYS.forEach((key) => { out[key] = {}; });
  (plan?.paths || []).forEach((p) => {
    const picks = effectivePicks(plan, p.id);
    SLOT_KEYS.forEach((key) => {
      const name = picks[key];
      if (!name) return;
      (out[key][name] = out[key][name] || []).push(p.id);
    });
  });
  return out;
}

/** Die Pokémon eines Pfades in Tier-Reihenfolge, angereichert aus dem Pool. */
export function pathMons(plan, pathId, pokedex = []) {
  const byName = new Map((pokedex || []).map((p) => [p.name, p]));
  const picks = effectivePicks(plan, pathId);
  return SLOT_KEYS
    .filter((key) => picks[key])
    .map((key) => ({ slot: key, ...(byName.get(picks[key]) || { name: picks[key], types: [], tier: slotTier(key) }) }));
}

// === Der laufende Draft =====================================================

/**
 * Was der laufende Draft über meinen Plan sagt.
 *
 * @param {Array}  seasonTeams  alle Teams DIESER Saison (Kader inline)
 * @param {string} teamId       das eigene Team
 */
export function liveState(seasonTeams = [], teamId = null) {
  const mine = new Map();
  const takenByOthers = new Set();
  const tierCount = {};
  (seasonTeams || []).forEach((t) => {
    (t?.pokemon || []).forEach((p) => {
      const name = nameOf(p);
      if (!name) return;
      if (t.id === teamId) {
        mine.set(name, p.tier || null);
        if (p.tier) tierCount[p.tier] = (tierCount[p.tier] || 0) + 1;
      } else {
        takenByOthers.add(name);
      }
    });
  });
  const tierFull = {};
  PLAN_TIERS.forEach((t) => { tierFull[t] = (tierCount[t] || 0) >= SLOTS_PER_TIER; });
  return { mine, takenByOthers, tierCount, tierFull, active: mine.size > 0 || takenByOthers.size > 0 };
}

/** Steht dieser Kandidat noch zur Verfügung, ist er schon meiner, oder ist er weg? */
export function monState(name, tier, live) {
  if (!live) return 'open';
  if (live.mine?.has(name)) return 'secured';
  if (live.takenByOthers?.has(name)) return 'lost';
  if (tier && live.tierFull?.[tier]) return 'lost';
  return 'open';
}

/**
 * Ist dieser Pfad noch erreichbar?
 *
 * Zwei Gründe machen ihn unerreichbar: Ein Wunsch ist weggeschnappt worden, oder ich
 * habe in einem Tier mehr Pokémon gezogen, als der Pfad dort noch unterbringen kann.
 * Der zweite Fall ist der subtile — er trifft jeden Pfad, den ich mit einem eigenen
 * Pick verlassen habe.
 */
export function pathViability(picks, live) {
  const blocked = [];
  const secured = [];
  if (!live?.active) {
    return { ok: true, blocked, secured, conflicts: [], reason: null };
  }
  SLOT_KEYS.forEach((key) => {
    const name = picks?.[key];
    if (!name) return;
    if (live.mine.has(name)) secured.push(name);
    else if (live.takenByOthers.has(name)) blocked.push({ slot: key, name });
  });

  const conflicts = [];
  PLAN_TIERS.forEach((tier) => {
    const wanted = SLOT_KEYS.filter((k) => slotTier(k) === tier && picks?.[k]).map((k) => picks[k]);
    const free = SLOTS_PER_TIER - wanted.length;
    const own = [...live.mine.entries()].filter(([, t]) => t === tier).map(([n]) => n);
    const extra = own.filter((n) => !wanted.includes(n));
    if (extra.length > free) conflicts.push({ tier, extra });
  });

  const ok = !blocked.length && !conflicts.length;
  return {
    ok,
    blocked,
    secured,
    conflicts,
    reason: blocked.length ? 'weg' : conflicts.length ? 'eigener-pick' : null,
  };
}

/**
 * Der nächste Zug laut Plan: der erste Slot der Wunschreihenfolge, der noch nicht
 * gesichert ist und dessen Wunsch noch zu haben ist.
 */
export function nextTarget(plan, pathId, live) {
  const picks = effectivePicks(plan, pathId);
  const order = effectiveOrder(plan, pathId);
  for (const slot of order) {
    const name = picks[slot];
    if (!name) continue;
    const state = monState(name, slotTier(slot), live);
    if (state === 'secured') continue;
    if (state === 'lost') return { slot, name, state: 'lost' };
    return { slot, name, state: 'open' };
  }
  return null;
}

/**
 * Wie dünn steht der Pfad? Je Slot, der noch offen ist: wie viele Kandidaten dieses
 * Slots überhaupt noch zu haben sind. Null Ersatz heißt: Hier entscheidet sich alles.
 */
export function planRisks(plan, pathId, live) {
  const picks = effectivePicks(plan, pathId);
  const order = effectiveOrder(plan, pathId);
  return order
    .filter((slot) => picks[slot] && monState(picks[slot], slotTier(slot), live) === 'open')
    .map((slot) => {
      const alternatives = (plan.slots?.[slot] || [])
        .filter((n) => n !== picks[slot])
        .filter((n) => monState(n, slotTier(slot), live) === 'open');
      return { slot, name: picks[slot], alternatives: alternatives.length, names: alternatives };
    });
}

// === Typenprofil ============================================================

// Gewicht eines Multiplikators im Bedrohungswert. Vierfach zählt mehr als zweifach,
// eine Immunität mehr als eine Viertel-Resistenz — sonst verschwindet der Unterschied
// zwischen „hält stand" und „steht daneben".
const PRESSURE = { 4: 1.6, 2: 1, 1: 0, 0.5: -0.9, 0.25: -1.4, 0: -1.7 };
const pressureOf = (mult) => (mult in PRESSURE ? PRESSURE[mult] : mult > 1 ? 1.6 : mult < 1 ? -1.4 : 0);

/** Je Angriffstyp: wie viele meiner Pokémon er trifft, und wie schwer das wiegt. */
export function coverageOf(mons = []) {
  return ALL_TYPES.map((type) => {
    let weak = 0, resist = 0, immune = 0, pressure = 0;
    const cells = (mons || []).map((m) => {
      const mult = typeMultiplier(type, m.types || []);
      if (mult === 0) immune++;
      else if (mult > 1) weak++;
      else if (mult < 1) resist++;
      pressure += pressureOf(mult);
      return { name: m.name, image: m.image, mult };
    });
    return { type, weak, resist, immune, net: weak - resist - immune, pressure, cells };
  });
}

/**
 * Ein einziger Zahlenwert für „wie angreifbar ist dieser Kader".
 *
 * Quadriert, damit ein Loch, in das drei Pokémon fallen, schwerer wiegt als drei
 * Löcher mit je einem. Genau das ist im Doppelkampf der Unterschied.
 */
export function riskScore(mons = []) {
  return coverageOf(mons).reduce((sum, r) => sum + Math.max(0, r.pressure) ** 2, 0);
}

/** Die Typen, unter denen ein Kader am meisten leidet — stärkste zuerst. */
export function weakSpots(mons = [], limit = 4) {
  return coverageOf(mons)
    .filter((r) => r.pressure > 0)
    .sort((a, b) => b.pressure - a.pressure || a.type.localeCompare(b.type))
    .slice(0, limit);
}

/**
 * Welche Pokémon würden das Typenprofil dieses Pfades am stärksten glätten?
 *
 * Gerechnet wird der tatsächliche Gewinn: Bedrohungswert vorher minus nachher. Damit
 * gewinnt nicht das Pokémon mit den meisten Resistenzen, sondern das, dessen
 * Resistenzen dort liegen, wo dieser Kader gerade blutet.
 */
export function suggestCoverage(mons = [], pokedex = [], opts = {}) {
  const { exclude = new Set(), live = null, openTiers = null, limit = 8 } = opts;
  const before = riskScore(mons);
  const spots = weakSpots(mons, 6);
  const spotByType = new Map(spots.map((s) => [s.type, s.pressure]));

  const rows = (pokedex || [])
    .filter((p) => p?.name && !exclude.has(p.name))
    .filter((p) => !openTiers || openTiers[p.tier])
    .filter((p) => monState(p.name, p.tier, live) === 'open')
    .map((p) => {
      const after = riskScore([...mons, p]);
      const covers = [];
      const adds = [];
      spots.forEach((s) => {
        const mult = typeMultiplier(s.type, p.types || []);
        if (mult < 1) covers.push({ type: s.type, mult });
        else if (mult > 1) adds.push({ type: s.type, mult });
      });
      return { mon: p, gain: before - after, covers, adds, weight: covers.reduce((n, c) => n + (spotByType.get(c.type) || 0), 0) };
    })
    .filter((r) => r.gain > 0.01)
    .sort((a, b) => b.gain - a.gain || b.weight - a.weight || (b.mon.cost ?? 0) - (a.mon.cost ?? 0) || a.mon.name.localeCompare(b.mon.name));

  return rows.slice(0, limit);
}

// === Initiative =============================================================

/**
 * Wo sitzt dieser Kader im Initiative-Spektrum des gesamten Pools?
 *
 * Es geht nicht um exakte Werte, sondern um Lücken: Basiswerte reichen, um zu sehen,
 * ob ein ganzer Bereich unbesetzt ist. `hist` ist der Pool als Hintergrund, `pins`
 * sind die eigenen Pokémon, `gaps` sind die unbesetzten Strecken, in denen der Pool
 * aber etwas zu bieten hätte.
 */
export function speedProfile(mons = [], pokedex = [], opts = {}) {
  const { buckets = 26, gapMin = 22, gapPool = 6, pinRows = 4, pinGap = 8 } = opts;
  const speeds = (pokedex || []).map((p) => p?.base_speed).filter((v) => Number.isFinite(v));
  const min = speeds.length ? Math.min(...speeds) : 0;
  const max = speeds.length ? Math.max(...speeds) : 200;
  const span = Math.max(1, max - min);
  const pct = (v) => ((Math.min(max, Math.max(min, v)) - min) / span) * 100;

  const counts = new Array(buckets).fill(0);
  speeds.forEach((v) => {
    const i = Math.min(buckets - 1, Math.floor(((v - min) / span) * buckets));
    counts[i] += 1;
  });
  const peak = Math.max(1, ...counts);
  const hist = counts.map((count, i) => ({
    from: Math.round(min + (span * i) / buckets),
    to: Math.round(min + (span * (i + 1)) / buckets),
    count,
    height: (count / peak) * 100,
  }));

  const pins = (mons || [])
    .filter((m) => Number.isFinite(m?.base_speed))
    .map((m) => ({ name: m.name, image: m.image, tier: m.tier, speed: m.base_speed, pct: pct(m.base_speed) }))
    .sort((a, b) => a.speed - b.speed);

  // Dicht beieinanderliegende Pokémon auf mehrere Zeilen verteilen, sonst verdecken sich
  // die Marken auf einem schmalen Bildschirm gegenseitig. Gerechnet wird in Prozent der
  // Leiste — das gilt für jede Breite gleich.
  const lastAt = new Array(pinRows).fill(null);
  pins.forEach((p) => {
    let row = 0;
    let oldest = Infinity;
    for (let r = 0; r < pinRows; r++) {
      const last = lastAt[r];
      if (last === null || p.pct - last >= pinGap) { row = r; oldest = null; break; }
      if (last < oldest) { oldest = last; row = r; }
    }
    p.row = row;
    lastAt[row] = p.pct;
  });

  // Nur Lücken ZWISCHEN zwei eigenen Pokémon zählen. „Nichts unter 40" oder „nichts über
  // 130" ist keine Lücke, sondern eine Entscheidung — und würde den halben Balken einfärben.
  const poolBetween = (lo, hi) => speeds.filter((v) => v > lo && v < hi).length;
  const gaps = [];
  for (let i = 0; i < pins.length - 1; i++) {
    const a = pins[i].speed;
    const b = pins[i + 1].speed;
    if (b - a < gapMin) continue;
    const count = poolBetween(a, b);
    if (count < gapPool) continue;
    gaps.push({ from: a, to: b, count, left: pct(a), width: pct(b) - pct(a) });
  }

  return { min, max, hist, pins, gaps };
}

// === Kennzahlen eines Plans =================================================

/** Kurzfassung eines Pfades für Listen: Fortschritt, Kosten, Bedrohungswert. */
export function pathSummary(plan, pathId, pokedex = [], live = null) {
  const mons = pathMons(plan, pathId, pokedex);
  const picks = effectivePicks(plan, pathId);
  const via = pathViability(picks, live);
  return {
    filled: mons.length,
    total: SLOT_KEYS.length,
    cost: mons.reduce((sum, m) => sum + (m.cost || 0), 0),
    risk: Math.round(riskScore(mons) * 10) / 10,
    secured: via.secured.length,
    ok: via.ok,
    reason: via.reason,
    blocked: via.blocked,
    conflicts: via.conflicts,
  };
}
