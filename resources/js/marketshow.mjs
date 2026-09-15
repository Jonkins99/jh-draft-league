// Marktwert-Update: die Inszenierung der Veränderungen seit dem letzten Stand.
// Framework-frei (DOM + Web Animations), im Aufbau bewusst nah an ceremony.mjs.
//
// Ablauf: Anlauf -> jeder Tier-Wechsel einzeln und groß -> die fünf größten
// Gewinner und Verlierer -> Abschluss.
//
// Mobilfreundlich by design: es steht immer nur EIN Element im Mittelpunkt, die
// Bühne ist ein Grid mit fester Kopf-/Fußzeile und einem scrollbaren Mittelteil.
// Nichts wird breiter als die Bühne, es gibt keine feste Mindestbreite.

import { formatMarket, formatMarketDelta, formatPercent } from './market.mjs';

const UP = '#63bc5a';
const DOWN = '#e3350d';
const GOLD = '#ffcb05';

function reduceMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function sprite(row, cls) {
  if (!row.image) return `<span class="mvx-sprite ${cls} grid place-items-center text-mist">—</span>`;
  return `<img src="${esc(row.image)}" alt="" loading="lazy" class="mvx-sprite ${cls}" />`;
}

function tierChip(tier, color) {
  return `<span class="mvx-tier" style="color:${esc(color)};background:${esc(color)}26">${esc(tier || '—')}</span>`;
}

// Große Karte eines Tier-Wechsels.
function tierCardHtml(row, tierColor) {
  const up = row.tierDelta > 0;
  const accent = up ? UP : DOWN;
  return `<article class="mvx-card" data-dir="${up ? 'up' : 'down'}" data-mon="${esc(row.name)}" role="link" tabindex="0">
    <span class="mvx-bloom" style="--mvx-accent:${accent}"></span>
    <p class="mvx-kicker" style="color:${accent}">${up ? 'Aufstieg' : 'Abstieg'}</p>
    ${sprite(row, 'mvx-sprite--xl')}
    <h3 class="mvx-name">${esc(row.name)}</h3>
    <p class="mvx-tiers">
      ${tierChip(row.fromTier, tierColor(row.fromTier))}
      <span class="mvx-arrow" style="color:${accent}">→</span>
      ${tierChip(row.toTier, tierColor(row.toTier))}
    </p>
    <p class="mvx-value" style="color:${accent}">${esc(formatMarket(row.toValue))}</p>
    <p class="mvx-sub">
      <span>${esc(formatMarket(row.fromValue))}</span>
      <span class="mvx-dot">·</span>
      <span style="color:${accent}">${esc(formatMarketDelta(row.delta))}</span>
      <span class="mvx-dot">·</span>
      <span style="color:${accent}">${esc(formatPercent(row.pct))}</span>
    </p>
    <p class="mvx-elo">Elo ${esc(row.fromElo ?? '—')} → ${esc(row.toElo ?? '—')}</p>
  </article>`;
}

// Zeile in den Gewinner-/Verlierer-Listen.
function moverHtml(row, dir) {
  const accent = dir === 'up' ? UP : DOWN;
  return `<div class="mvx-row" data-mon="${esc(row.name)}" role="link" tabindex="0" style="--mvx-accent:${accent}">
    ${sprite(row, 'mvx-sprite--sm')}
    <span class="mvx-row-main">
      <span class="mvx-row-name">${esc(row.name)}</span>
      <span class="mvx-row-meta">${esc(formatMarket(row.fromValue))} → ${esc(formatMarket(row.toValue))}</span>
    </span>
    <span class="mvx-row-num">
      <b style="color:${accent}">${esc(formatMarketDelta(row.delta))}</b>
      <i style="color:${accent}">${esc(formatPercent(row.pct))}</i>
    </span>
  </div>`;
}

function ghostRow() {
  return `<div class="mvx-row mvx-row--ghost">
    <span class="mvx-sprite mvx-sprite--sm mvx-ghost-box"></span>
    <span class="mvx-row-main">
      <span class="mvx-ghost-bar" style="width:62%"></span>
      <span class="mvx-ghost-bar" style="width:38%"></span>
    </span>
  </div>`;
}

function burst(host, accent) {
  if (reduceMotion() || !host || !host.animate) return;
  const layer = document.createElement('div');
  layer.className = 'mvx-burst';
  host.appendChild(layer);
  const w = host.clientWidth || 360;
  const h = host.clientHeight || 360;
  const pieces = w < 520 ? 26 : 44;
  for (let i = 0; i < pieces; i++) {
    const p = document.createElement('i');
    p.style.background = i % 5 === 0 ? GOLD : accent;
    layer.appendChild(p);
    const angle = Math.random() * Math.PI * 2;
    const dist = (0.3 + Math.random() * 0.7) * Math.min(w, h) * 0.75;
    p.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(1)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
    );
  }
  setTimeout(() => layer.remove(), 1600);
}

// Zahl hochzählen (Marktwert-Ticker im Kopf der Bühne).
function tickValue(node, to, duration) {
  const target = Number(to) || 0;
  if (reduceMotion() || duration <= 0) {
    node.textContent = formatMarket(target);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    node.textContent = formatMarket(Math.round(target * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * @param {HTMLElement} root  Popover/Container, wird komplett neu geschrieben
 * @param {object} data { title, subtitle, note, totalValue, tierChanges[], up[], down[] }
 * @param {object} opts { onClose, onPickMon, tierColor }
 * @returns {{ skip(): void, stop(): void }}
 */
export function runMarketShow(root, data, opts = {}) {
  const tierColor = opts.tierColor || (() => GOLD);
  const tierChanges = data.tierChanges || [];
  const up = data.up || [];
  const down = data.down || [];
  const timers = [];
  let stopped = false;
  let finished = false;

  root.innerHTML = `<div class="mvx-stage" data-phase="intro">
    <span class="mvx-glow"></span>
    <header class="mvx-head">
      <span class="min-w-0 flex-1">
        <span class="mvx-head-title">${esc(data.title || 'Marktwert-Update')}</span>
        <span class="mvx-head-sub">${esc(data.subtitle || '')}</span>
      </span>
      <button type="button" data-mvx="skip" class="mvx-skip">Überspringen</button>
    </header>

    <div class="mvx-body">
      <section class="mvx-scene" data-scene="intro">
        <p class="mvx-kicker" style="color:${GOLD}">Die Börse schließt</p>
        <p class="mvx-total" data-mvx="total">—</p>
        <p class="mvx-total-label">Gesamtwert aller gelisteten Pokémon</p>
        <p class="mvx-count" data-mvx="count"></p>
      </section>

      <section class="mvx-scene" data-scene="tiers" hidden>
        <p class="mvx-step" data-mvx="step"></p>
        <div class="mvx-cardhost" data-mvx="cardhost"></div>
      </section>

      <section class="mvx-scene mvx-scene--wide" data-scene="movers" hidden>
        <div class="mvx-movers">
          <div class="mvx-col" data-mvx="col-up">
            <p class="mvx-col-head" style="color:${UP}">▲ Größte Gewinner</p>
            <div class="mvx-list" data-mvx="list-up"></div>
          </div>
          <div class="mvx-col" data-mvx="col-down">
            <p class="mvx-col-head" style="color:${DOWN}">▼ Größte Verlierer</p>
            <div class="mvx-list" data-mvx="list-down"></div>
          </div>
        </div>
        <div class="mvx-recap" data-mvx="recap" hidden></div>
      </section>
    </div>

    <footer class="mvx-foot">
      <p class="mvx-note" data-mvx="note">${esc(data.note || '')}</p>
      <button type="button" data-mvx="close" class="mvx-close" hidden>Fertig</button>
    </footer>
  </div>`;

  const q = (sel) => root.querySelector(sel);
  const stage = q('.mvx-stage');
  const scenes = {
    intro: q('[data-scene="intro"]'),
    tiers: q('[data-scene="tiers"]'),
    movers: q('[data-scene="movers"]'),
  };
  const totalEl = q('[data-mvx="total"]');
  const countEl = q('[data-mvx="count"]');
  const stepEl = q('[data-mvx="step"]');
  const cardHost = q('[data-mvx="cardhost"]');
  const listUp = q('[data-mvx="list-up"]');
  const listDown = q('[data-mvx="list-down"]');
  const recapEl = q('[data-mvx="recap"]');
  const closeEl = q('[data-mvx="close"]');
  const skipEl = q('[data-mvx="skip"]');

  countEl.textContent = tierChanges.length
    ? `${tierChanges.length} Tier-Wechsel · ${data.changedCount || 0} veränderte Marktwerte`
    : `Keine Tier-Wechsel · ${data.changedCount || 0} veränderte Marktwerte`;

  const show = (key) => {
    Object.entries(scenes).forEach(([k, node]) => { node.hidden = k !== key; });
    stage.dataset.phase = key;
    // Der Mittelteil scrollt; nach jedem Szenenwechsel wieder an den Anfang.
    q('.mvx-body').scrollTop = 0;
  };

  const sleep = (ms) => new Promise((resolve) => {
    if (stopped) return resolve();
    timers.push(setTimeout(resolve, ms));
  });

  function fillMovers(animate) {
    const render = (host, rows, dir) => {
      host.innerHTML = rows.length
        ? rows.map((r) => moverHtml(r, dir)).join('')
        : '<p class="mvx-none">Keine Veränderung.</p>';
      if (!animate || reduceMotion()) return;
      [...host.querySelectorAll('.mvx-row')].forEach((node, i) => {
        node.animate(
          [{ opacity: 0, transform: 'translateY(0.9rem)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, delay: 90 * i, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' },
        );
      });
    };
    render(listUp, up, 'up');
    render(listDown, down, 'down');
    if (tierChanges.length) {
      recapEl.hidden = false;
      recapEl.innerHTML = `<p class="mvx-recap-head">Alle Tier-Wechsel</p><div class="mvx-recap-list">${tierChanges
        .map((r) => `<span class="mvx-chip" data-mon="${esc(r.name)}" role="link" tabindex="0" style="--mvx-accent:${r.tierDelta > 0 ? UP : DOWN}">
            ${sprite(r, 'mvx-sprite--xs')}
            <b>${esc(r.name)}</b>
            ${tierChip(r.fromTier, tierColor(r.fromTier))}
            <em style="color:${r.tierDelta > 0 ? UP : DOWN}">→</em>
            ${tierChip(r.toTier, tierColor(r.toTier))}
          </span>`)
        .join('')}</div>`;
    }
  }

  function finishNow() {
    stopped = true;
    timers.forEach(clearTimeout);
    timers.length = 0;
    totalEl.textContent = formatMarket(data.totalValue);
    show('movers');
    fillMovers(false);
    closeEl.hidden = false;
    finished = true;
  }

  skipEl.addEventListener('click', () => { if (!finished) finishNow(); });
  if (opts.onClose) closeEl.addEventListener('click', opts.onClose);

  if (opts.onPickMon) {
    const pick = (node) => {
      const mon = node?.dataset?.mon;
      if (mon) opts.onPickMon(mon);
    };
    root.addEventListener('click', (e) => pick(e.target.closest('[data-mon]')));
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const node = e.target.closest('[data-mon]');
      if (!node) return;
      e.preventDefault();
      pick(node);
    });
  }

  (async () => {
    const slow = reduceMotion() ? 0.35 : 1;
    show('intro');
    tickValue(totalEl, data.totalValue, 1100 * slow);
    await sleep(1700 * slow);
    if (stopped) return;

    if (tierChanges.length) {
      show('tiers');
      for (let i = 0; i < tierChanges.length; i++) {
        if (stopped) return;
        const row = tierChanges[i];
        stepEl.textContent = `Tier-Wechsel ${i + 1} von ${tierChanges.length}`;
        cardHost.innerHTML = tierCardHtml(row, tierColor);
        const card = cardHost.firstElementChild;
        if (!reduceMotion() && card.animate) {
          card.animate(
            [
              { opacity: 0, transform: 'translateY(1.6rem) scale(0.94)' },
              { opacity: 1, transform: 'none' },
            ],
            { duration: 460, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' },
          );
        }
        await sleep(340 * slow);
        burst(cardHost, row.tierDelta > 0 ? UP : DOWN);
        await sleep(1450 * slow);
      }
    }
    if (stopped) return;

    show('movers');
    listUp.innerHTML = [ghostRow(), ghostRow(), ghostRow()].join('');
    listDown.innerHTML = [ghostRow(), ghostRow(), ghostRow()].join('');
    await sleep(320 * slow);
    if (stopped) return;
    fillMovers(true);
    await sleep(700 * slow);
    closeEl.hidden = false;
    finished = true;
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
