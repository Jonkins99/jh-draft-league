// Siegerehrung: baut die Bühne in ein Wurzel-Element und spielt die Enthüllung.
// Framework-frei (nur DOM + Web Animations), damit die Sequenz in der App und im
// Entwurf identisch läuft.
//
// Ablauf: letzte Platzierung zuerst, dann aufwärts bis Platz 3 — jeweils mit
// Atempause. Danach fällt das Licht (Vorhang), Platz 2 und 1 erscheinen
// gleichzeitig, das Siegel materialisiert und es wird gefeiert.
//
// Fünf Inszenierungen teilen sich diesen Ablauf und werden zufällig gewählt
// (siehe CEREMONY_VARIANTS). Sie unterscheiden sich in Tempo, Enthüllungsgeste
// und Schlusseffekt — die Dramaturgie bleibt dieselbe.

import { revealSteps } from './awards.mjs';

const CONFETTI_COLORS = ['#ffcb05', '#e3350d', '#4d90d5', '#63bc5a', '#ab6ac8', '#eef1f6'];

// === Varianten =============================================================
// Fünf Inszenierungen derselben Sequenz. Sie unterscheiden sich vor allem im
// TEMPO und in der Art, wie eine Platte ins Bild kommt — die Reihenfolge (letzter
// Platz zuerst) bleibt überall gleich, damit die Spannung erhalten bleibt.
// Das Aussehen steckt in awards.css unter `.cer-stage[data-variant="…"]`.
export const CEREMONY_VARIANTS = [
  {
    key: 'spotlight',
    label: 'Bühnenlicht',
    // lead = Vorlauf, tease = Anspannung vor der Platte, hold = Nachklang, curtain = Blackout
    timing: { lead: 500, tease: 620, hold: 1150, curtain: 560 },
    burst: 'confetti',
  },
  {
    key: 'countdown',
    label: 'Schlagzahl',
    timing: { lead: 320, tease: 280, hold: 640, curtain: 380 },
    burst: 'rings',
  },
  {
    key: 'flipboard',
    label: 'Anzeigetafel',
    timing: { lead: 420, tease: 460, hold: 950, curtain: 520 },
    burst: 'beams',
  },
  {
    key: 'anflug',
    label: 'Anflug',
    timing: { lead: 520, tease: 760, hold: 1050, curtain: 660 },
    burst: 'sparks',
  },
  {
    key: 'gala',
    label: 'Gala',
    timing: { lead: 820, tease: 920, hold: 1500, curtain: 900 },
    burst: 'embers',
  },
];

export const VARIANT_BY_KEY = Object.fromEntries(CEREMONY_VARIANTS.map((v) => [v.key, v]));

/** Zufällige Inszenierung — jede Siegerehrung sieht damit etwas anders aus. */
export function pickCeremonyVariant(exclude = null) {
  const pool = CEREMONY_VARIANTS.filter((v) => v.key !== exclude);
  const list = pool.length ? pool : CEREMONY_VARIANTS;
  return list[Math.floor(Math.random() * list.length)];
}

function reduceMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmtScore(v) {
  return (Math.round((Number(v) || 0) * 10) / 10).toFixed(1).replace('.', ',');
}

// Sprites einer Option. Duo-Awards („Beste Partner") zeigen beide Pokémon.
function imagesOf(row) {
  const list = Array.isArray(row?.images) ? row.images.filter(Boolean) : [];
  if (list.length) return list;
  return row?.image ? [row.image] : [];
}

// Pokémon-Namen einer Option, parallel zu den Sprites. Nur gesetzt, wenn der
// Award überhaupt auf Pokémon zeigt (nicht bei Team-/Match-Awards).
function monsOf(row) {
  return Array.isArray(row?.mons) ? row.mons.filter(Boolean) : [];
}

// Sprite ggf. als Link auf die Pokémon-Detailseite. Bei Duo-Awards ist jeder
// Sprite für sich anklickbar, sonst trägt die ganze Box den Link.
function monLink(inner, mon) {
  if (!mon) return inner;
  return `<button type="button" class="cer-monlink" data-mon="${esc(mon)}" title="${esc(mon)} öffnen">${inner}</button>`;
}

function spriteHtml(row, cls) {
  const imgs = imagesOf(row);
  const mons = monsOf(row);
  if (!imgs.length) return `<span class="grid ${cls} place-items-center rounded-lg bg-elevated text-xs text-mist">—</span>`;
  if (imgs.length === 1) return `<img src="${esc(imgs[0])}" alt="" loading="lazy" class="${cls} object-contain" />`;
  // Duo: beide Sprites nebeneinander, leicht überlappend.
  return `<span class="cer-duo">${imgs
    .map((src, i) => monLink(`<img src="${esc(src)}" alt="" loading="lazy" class="${cls} object-contain" />`, mons.length > 1 ? mons[i] : null))
    .join('')}</span>`;
}

// Ergebniszeile (enthüllt).
function plateHtml(row, accent) {
  const img = spriteHtml(row, 'size-11');
  const votes = Object.entries(row.scores || {})
    .map(([p, v]) => `<span class="whitespace-nowrap">${esc(p)} ${esc(v)}</span>`)
    .join('<span class="text-mist/40"> · </span>');
  const single = monsOf(row).length === 1 ? monsOf(row)[0] : null;
  return `<div class="cer-plate"${single ? ` data-mon="${esc(single)}" role="link" tabindex="0" title="${esc(single)} öffnen"` : ''}>
    <span class="cer-rank" style="color:${row.rank <= 3 ? accent : ''}">${row.rank}</span>
    ${img}
    <span class="min-w-0 text-left">
      <span class="block truncate font-display text-base font-bold text-ink">${esc(row.label)}</span>
      <span class="block truncate text-xs text-mist">${votes || '—'}</span>
    </span>
    <span class="cer-score" data-score="${row.avg}">0,0</span>
  </div>`;
}

function ghostHtml() {
  return `<div class="cer-ghost">
    <span class="cer-ghost-bar w-6"></span>
    <span class="size-11 shrink-0 rounded-lg bg-elevated/50"></span>
    <span class="min-w-0 flex-1 space-y-1.5">
      <span class="cer-ghost-bar block w-2/3"></span>
      <span class="cer-ghost-bar block w-1/3"></span>
    </span>
  </div>`;
}

function cardHtml(row, { first, accent, medalSvg }) {
  const img = `<span class="mx-auto block w-fit">${spriteHtml(row, first ? 'size-32' : 'size-20')}</span>`;
  const votes = Object.entries(row.scores || {})
    .map(([p, v]) => `${esc(p)} ${esc(v)}`)
    .join(' · ');
  const single = monsOf(row).length === 1 ? monsOf(row)[0] : null;
  return `<div class="cer-card${first ? ' cer-card--first' : ''}"${single ? ` data-mon="${esc(single)}" role="link" tabindex="0" title="${esc(single)} öffnen"` : ''}>
    ${first ? '<span class="cer-bloom"></span>' : ''}
    <p class="font-display text-[11px] font-bold uppercase tracking-[0.3em]" style="color:${first ? accent : '#98a2b3'}">
      ${first ? 'Sieger' : `Platz ${row.rank}`}
    </p>
    ${first && medalSvg ? `<span class="cer-seal mt-2 block">${medalSvg}</span>` : ''}
    ${img}
    <p class="mt-2 font-display ${first ? 'text-2xl' : 'text-lg'} font-bold text-ink">${esc(row.label)}</p>
    <p class="mt-0.5 text-xs text-mist">${votes}</p>
    <p class="mt-2 font-display ${first ? 'text-4xl' : 'text-2xl'} font-black tabular-nums" style="color:${first ? accent : '#eef1f6'}">${fmtScore(row.avg)}</p>
  </div>`;
}

// Zahl von 0 auf den Zielwert hochzählen.
function tickScore(el, target, duration) {
  const to = Number(target) || 0;
  if (reduceMotion() || duration <= 0) {
    el.textContent = fmtScore(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = fmtScore(to * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Jede Variante feiert anders. Alle fünf Effekte teilen sich dieselbe Bühne
// (eine absolut liegende Ebene, die sich nach ein paar Sekunden selbst entfernt).
function makeLayer(host, cls) {
  const layer = document.createElement('div');
  layer.className = cls;
  host.appendChild(layer);
  return layer;
}

function burstConfetti(host, w, h) {
  const layer = makeLayer(host, 'cer-confetti');
  const pieces = w < 520 ? 70 : 120;
  const els = [];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < pieces; i++) {
    const el = document.createElement('i');
    el.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    el.style.left = `${50 + (Math.random() - 0.5) * 26}%`;
    el.style.top = '34%';
    els.push(el);
    frag.appendChild(el);
  }
  layer.appendChild(frag);
  els.forEach((el) => {
    const angle = Math.random() * Math.PI * 2;
    const dist = (0.35 + Math.random() * 0.75) * Math.max(w, h) * 0.6;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist * 0.7 + h * 0.5;
    el.animate(
      [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px,${dy * 0.25}px) rotate(${180 + Math.random() * 360}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px,${dy}px) rotate(${420 + Math.random() * 540}deg) scale(0.85)`, opacity: 0 },
      ],
      { duration: 1500 + Math.random() * 1300, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
    );
  });
  return 3200;
}

// Schlagzahl: drei Schockwellen, die vom Podest nach außen laufen.
function burstRings(host, w, h) {
  const layer = makeLayer(host, 'cer-confetti');
  const size = Math.max(w, h);
  for (let i = 0; i < 4; i++) {
    const el = document.createElement('b');
    el.className = 'cer-ring';
    layer.appendChild(el);
    el.animate(
      [
        { width: '0px', height: '0px', opacity: 0.85, borderWidth: '10px' },
        { width: `${size * 1.6}px`, height: `${size * 1.6}px`, opacity: 0, borderWidth: '1px' },
      ],
      { duration: 1100 + i * 220, delay: i * 190, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
    );
  }
  return 2600;
}

// Anzeigetafel: Lichtbalken klappen vom Podest nach außen auf.
function burstBeams(host, w, h) {
  const layer = makeLayer(host, 'cer-confetti');
  const count = 14;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('b');
    el.className = 'cer-beam';
    el.style.background = `linear-gradient(to top, ${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}, transparent)`;
    el.style.height = `${Math.max(w, h)}px`;
    layer.appendChild(el);
    const angle = -90 + (i - (count - 1) / 2) * (170 / count);
    el.animate(
      [
        { transform: `translate(-50%, 0) rotate(${angle}deg) scaleY(0)`, opacity: 0 },
        { transform: `translate(-50%, 0) rotate(${angle}deg) scaleY(1)`, opacity: 0.55, offset: 0.35 },
        { transform: `translate(-50%, 0) rotate(${angle + 12}deg) scaleY(1)`, opacity: 0 },
      ],
      { duration: 1400 + Math.random() * 500, delay: i * 35, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
    );
  }
  return 2400;
}

// Anflug: Funken schießen nach oben und verglühen.
function burstSparks(host, w, h) {
  const layer = makeLayer(host, 'cer-confetti');
  const pieces = w < 520 ? 60 : 110;
  const frag = document.createDocumentFragment();
  const els = [];
  for (let i = 0; i < pieces; i++) {
    const el = document.createElement('u');
    el.className = 'cer-spark';
    el.style.background = CONFETTI_COLORS[i % 3];
    el.style.left = `${50 + (Math.random() - 0.5) * 60}%`;
    el.style.top = '60%';
    els.push(el);
    frag.appendChild(el);
  }
  layer.appendChild(frag);
  els.forEach((el) => {
    const dx = (Math.random() - 0.5) * w * 0.5;
    const dy = -(0.3 + Math.random() * 0.8) * h;
    el.animate(
      [
        { transform: 'translate(0,0) scaleY(1)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px,${dy * 0.55}px) scaleY(2.4)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${dx}px,${dy}px) scaleY(0.4)`, opacity: 0 },
      ],
      { duration: 1300 + Math.random() * 1100, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
    );
  });
  return 2800;
}

// Gala: Goldflocken schweben langsam durchs Bild.
function burstEmbers(host, w, h) {
  const layer = makeLayer(host, 'cer-confetti');
  const pieces = w < 520 ? 40 : 70;
  const frag = document.createDocumentFragment();
  const els = [];
  for (let i = 0; i < pieces; i++) {
    const el = document.createElement('s');
    el.className = 'cer-ember';
    el.style.left = `${Math.random() * 100}%`;
    el.style.top = `${60 + Math.random() * 45}%`;
    el.style.scale = `${0.5 + Math.random() * 1.1}`;
    els.push(el);
    frag.appendChild(el);
  }
  layer.appendChild(frag);
  els.forEach((el) => {
    const drift = (Math.random() - 0.5) * w * 0.25;
    el.animate(
      [
        { transform: 'translate(0,0)', opacity: 0 },
        { transform: `translate(${drift * 0.4}px,${-h * 0.35}px)`, opacity: 0.9, offset: 0.35 },
        { transform: `translate(${drift}px,${-h * 1.05}px)`, opacity: 0 },
      ],
      { duration: 3200 + Math.random() * 2600, delay: Math.random() * 900, easing: 'ease-out', fill: 'forwards' },
    );
  });
  return 6400;
}

const BURSTS = {
  confetti: burstConfetti,
  rings: burstRings,
  beams: burstBeams,
  sparks: burstSparks,
  embers: burstEmbers,
};

function celebrate(host, kind) {
  if (reduceMotion() || !host || !host.animate) return;
  const fn = BURSTS[kind] || burstConfetti;
  const w = host.clientWidth || 640;
  const h = host.clientHeight || 480;
  const layerLife = fn(host, w, h);
  const layer = host.lastElementChild;
  setTimeout(() => layer?.remove(), layerLife);
}

// data = { title, subtitle, accent, medalSvg, rows: [{id,label,sub,image,avg,scores,rank}], note }
// Rückgabe: { skip(), stop() }
export function runCeremony(root, data, opts = {}) {
  const rows = [...(data.rows || [])];
  const accent = data.accent || '#ffcb05';
  const onDone = opts.onDone || (() => {});
  const variant = VARIANT_BY_KEY[opts.variant] || pickCeremonyVariant();
  const timers = [];
  let stopped = false;
  let finished = false;

  root.innerHTML = `<div class="cer-stage" data-phase="reveal" data-beat="idle" data-variant="${esc(variant.key)}">
    <span class="cer-spot"></span>
    <header class="flex items-start gap-3">
      <span class="w-10 shrink-0" data-cer="badge">${data.medalSvg || ''}</span>
      <span class="min-w-0 flex-1">
        <span class="block font-display text-lg font-bold uppercase tracking-wider text-ink sm:text-2xl">${esc(data.title)}</span>
        <span class="block text-xs text-mist sm:text-sm">${esc(data.subtitle || '')}</span>
      </span>
      <button type="button" data-cer="skip" class="cer-skip shrink-0 rounded-lg border border-line px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-mist transition-colors hover:text-flame-400">Überspringen</button>
    </header>
    <div class="cer-body py-4">
      <div class="cer-inner">
        <div class="cer-slots" data-cer="slots"></div>
        <div class="cer-top" data-cer="top" style="display:none"></div>
      </div>
    </div>
    <footer class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-xs text-mist sm:text-sm" data-cer="note" style="visibility:hidden">${esc(data.note || '')}</p>
      <button type="button" data-cer="close" class="shrink-0 rounded-xl bg-flame-500 px-4 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-flame-600" style="visibility:hidden">Fertig</button>
    </footer>
  </div>`;

  const stage = root.querySelector('.cer-stage');
  const slotsHost = root.querySelector('[data-cer="slots"]');
  const topHost = root.querySelector('[data-cer="top"]');
  const noteEl = root.querySelector('[data-cer="note"]');
  const closeEl = root.querySelector('[data-cer="close"]');
  const skipEl = root.querySelector('[data-cer="skip"]');

  slotsHost.innerHTML = rows
    .map((r) => `<div class="cer-slot" data-state="pending" data-slot="${esc(r.id)}">${ghostHtml()}</div>`)
    .join('');
  const slotEls = [...slotsHost.querySelectorAll('.cer-slot')];

  // Reihenfolge kommt aus awards.mjs: letzter Platz zuerst, die Siegergruppe zuletzt.
  const steps = revealSteps(rows);
  const topRank = rows.length ? (rows[0].rank ?? 1) : 1;
  // Der letzte Schritt ist aufsteigend sortiert -> zurückdrehen auf Rang-Reihenfolge.
  const topGroup = steps.length ? [...steps[steps.length - 1]].reverse() : [];

  const sleep = (ms) => new Promise((resolve) => {
    if (stopped) return resolve();
    timers.push(setTimeout(resolve, ms));
  });

  const revealSlot = (i, animate = true) => {
    const el = slotEls[i];
    if (!el) return;
    el.dataset.state = animate ? 'revealed' : 'static';
    el.innerHTML = plateHtml(rows[i], accent);
    const score = el.querySelector('.cer-score');
    if (score) tickScore(score, rows[i].avg, animate ? 700 : 0);
  };

  const showFinale = (animate = true) => {
    stage.dataset.phase = 'finale';
    // Die schon enthüllten Plätze bleiben als kleine Rückschau unter dem Podest
    // stehen; die Platzhalter der Siegergruppe verschwinden.
    slotEls.slice(0, topGroup.length).forEach((el) => el.remove());
    slotsHost.classList.add('cer-slots--recap');
    if (!slotsHost.children.length) slotsHost.style.display = 'none';
    topHost.style.display = '';
    if (topHost.nextSibling !== slotsHost) slotsHost.parentNode.insertBefore(topHost, slotsHost);
    // Reihenfolge auf dem Podest: niedrigster Platz links, Sieger rechts.
    // Bei Gleichstand auf Platz 1 sind alle Karten Sieger-Karten.
    topHost.dataset.count = String(topGroup.length);
    topHost.innerHTML = [...topGroup].reverse()
      .map((row) => cardHtml(row, {
        first: row.rank === topRank,
        accent,
        medalSvg: row.rank === topRank ? (data.medalSvg || '') : '',
      }))
      .join('');
    if (animate) celebrate(stage, variant.burst);
    noteEl.style.visibility = 'visible';
    closeEl.style.visibility = 'visible';
    finished = true;
    onDone();
  };

  const finishNow = () => {
    stopped = true;
    timers.forEach(clearTimeout);
    timers.length = 0;
    for (let i = rows.length - 1; i >= topGroup.length; i--) revealSlot(i, false);
    showFinale(false);
  };

  skipEl.addEventListener('click', () => { if (!finished) finishNow(); });
  if (opts.onClose) closeEl.addEventListener('click', opts.onClose);

  // Klick auf eine Pokémon-Box oder einen einzelnen Duo-Sprite öffnet die
  // Detailseite. Delegiert, weil Platten und Karten erst im Verlauf entstehen.
  if (opts.onPickMon) {
    const pick = (el) => {
      const mon = el?.dataset?.mon;
      if (mon) opts.onPickMon(mon);
    };
    root.addEventListener('click', (e) => pick(e.target.closest('[data-mon]')));
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('[data-mon]');
      if (!el) return;
      e.preventDefault();
      pick(el);
    });
  }

  (async () => {
    const slow = reduceMotion() ? 0.4 : 1;
    const t = variant.timing;
    await sleep(t.lead * slow);
    for (let s = 0; s < steps.length - 1; s++) {
      if (stopped) return;
      const i = rows.indexOf(steps[s][0]);
      if (i < 0) continue;
      slotEls[i].dataset.state = 'next';
      await sleep(t.tease * slow);
      if (stopped) return;
      stage.dataset.beat = 'hold';
      revealSlot(i, true);
      await sleep(t.hold * slow);
      stage.dataset.beat = 'idle';
    }
    if (stopped) return;
    if (steps.length > 1) {
      stage.dataset.phase = 'curtain';
      await sleep(t.curtain * slow);
    }
    if (stopped) return;
    showFinale(true);
  })();

  return {
    variant: variant.key,
    skip: finishNow,
    stop() {
      stopped = true;
      timers.forEach(clearTimeout);
      timers.length = 0;
    },
  };
}
