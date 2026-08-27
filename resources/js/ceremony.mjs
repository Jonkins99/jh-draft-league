// Siegerehrung: baut die Bühne in ein Wurzel-Element und spielt die Enthüllung.
// Framework-frei (nur DOM + Web Animations), damit die Sequenz in der App und im
// Entwurf identisch läuft.
//
// Ablauf: letzte Platzierung zuerst, dann aufwärts bis Platz 3 — jeweils mit
// Atempause. Danach fällt das Licht (Vorhang), Platz 2 und 1 erscheinen
// gleichzeitig, das Siegel materialisiert und Konfetti fliegt.

import { revealSteps } from './awards.mjs';

const CONFETTI_COLORS = ['#ffcb05', '#e3350d', '#4d90d5', '#63bc5a', '#ab6ac8', '#eef1f6'];

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

function spriteHtml(row, cls) {
  const imgs = imagesOf(row);
  if (!imgs.length) return `<span class="grid ${cls} place-items-center rounded-lg bg-elevated text-xs text-mist">—</span>`;
  if (imgs.length === 1) return `<img src="${esc(imgs[0])}" alt="" loading="lazy" class="${cls} object-contain" />`;
  // Duo: beide Sprites nebeneinander, leicht überlappend.
  return `<span class="cer-duo">${imgs
    .map((src) => `<img src="${esc(src)}" alt="" loading="lazy" class="${cls} object-contain" />`)
    .join('')}</span>`;
}

// Ergebniszeile (enthüllt).
function plateHtml(row, accent) {
  const img = spriteHtml(row, 'size-11');
  const votes = Object.entries(row.scores || {})
    .map(([p, v]) => `<span class="whitespace-nowrap">${esc(p)} ${esc(v)}</span>`)
    .join('<span class="text-mist/40"> · </span>');
  return `<div class="cer-plate">
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
  return `<div class="cer-card${first ? ' cer-card--first' : ''}">
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

function burstConfetti(host) {
  if (reduceMotion() || !host || !host.animate) return;
  const layer = document.createElement('div');
  layer.className = 'cer-confetti';
  const w = host.clientWidth || 640;
  const h = host.clientHeight || 480;
  const pieces = w < 520 ? 70 : 120;
  const frag = document.createDocumentFragment();
  const els = [];
  for (let i = 0; i < pieces; i++) {
    const el = document.createElement('i');
    el.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    el.style.left = `${50 + (Math.random() - 0.5) * 26}%`;
    el.style.top = '34%';
    els.push(el);
    frag.appendChild(el);
  }
  layer.appendChild(frag);
  host.appendChild(layer);
  els.forEach((el) => {
    const angle = Math.random() * Math.PI * 2;
    const dist = (0.35 + Math.random() * 0.75) * Math.max(w, h) * 0.6;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist * 0.7 + h * 0.5;
    const dur = 1500 + Math.random() * 1300;
    el.animate(
      [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px,${dy * 0.25}px) rotate(${180 + Math.random() * 360}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px,${dy}px) rotate(${420 + Math.random() * 540}deg) scale(0.85)`, opacity: 0 },
      ],
      { duration: dur, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
    );
  });
  setTimeout(() => layer.remove(), 3200);
}

// data = { title, subtitle, accent, medalSvg, rows: [{id,label,sub,image,avg,scores,rank}], note }
// Rückgabe: { skip(), stop() }
export function runCeremony(root, data, opts = {}) {
  const rows = [...(data.rows || [])];
  const accent = data.accent || '#ffcb05';
  const onDone = opts.onDone || (() => {});
  const timers = [];
  let stopped = false;
  let finished = false;

  root.innerHTML = `<div class="cer-stage" data-phase="reveal" data-beat="idle">
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
    if (animate) burstConfetti(stage);
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

  (async () => {
    const slow = reduceMotion() ? 0.4 : 1;
    await sleep(500 * slow);
    for (let s = 0; s < steps.length - 1; s++) {
      if (stopped) return;
      const i = rows.indexOf(steps[s][0]);
      if (i < 0) continue;
      slotEls[i].dataset.state = 'next';
      await sleep(620 * slow);
      if (stopped) return;
      stage.dataset.beat = 'hold';
      revealSlot(i, true);
      await sleep(1150 * slow);
      stage.dataset.beat = 'idle';
    }
    if (stopped) return;
    if (steps.length > 1) {
      stage.dataset.phase = 'curtain';
      await sleep(560 * slow);
    }
    if (stopped) return;
    showFinale(true);
  })();

  return {
    skip: finishNow,
    stop() {
      stopped = true;
      timers.forEach(clearTimeout);
      timers.length = 0;
    },
  };
}
