// Interaktives Marktwert-Liniendiagramm — framework-frei (DOM + SVG), damit es in
// jeder View ohne Alpine-Abhängigkeit läuft.
//
// Gezeichnet wird in CSS-Pixeln statt in einem skalierten viewBox-Koordinatensystem:
// nur so bleiben Schriftgrößen auf dem Telefon lesbar und das Diagramm erzeugt nie
// mehr Breite als sein Container. Bei jeder Größenänderung wird neu gezeichnet.
//
// Bedienung: Zeigen/Tippen wählt den nächstgelegenen Zeitpunkt, eine Führungslinie
// und ein Tooltip nennen die genauen Werte. Tier-Wechsel sitzen als Ring auf dem
// Punkt, die Tier-Grenzen liegen als Bänder im Hintergrund.

const NS = 'http://www.w3.org/2000/svg';

const AXIS = '#98a2b3';
const GRID = '#262d3a';

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([k, v]) => { if (v != null) node.setAttribute(k, String(v)); });
  return node;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// „Runde" Stufen für die Werteachse.
// Logarithmisch zuerst 1/2/5 je Zehnerpotenz; deckt ein enger Ausschnitt damit
// weniger als drei Stufen ab, wird die Reihe verfeinert — sonst hätte ein
// Diagramm, das nur von 75 bis 110 Mio. reicht, exakt eine Beschriftung.
function niceTicks(min, max, scale, count) {
  if (!(max > 0)) return [];
  if (scale === 'log') {
    const lo = Math.max(1, min);
    const build = (mults) => {
      const out = [];
      for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(max)); e++) {
        mults.forEach((m) => {
          const v = m * 10 ** e;
          if (v >= lo * 0.98 && v <= max * 1.02) out.push(v);
        });
      }
      return out.sort((a, b) => a - b);
    };
    let out = build([1, 2, 5]);
    if (out.length < 3) out = build([1, 1.5, 2, 3, 5, 7]);
    if (out.length < 3) out = build([1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 4, 5, 6, 8]);
    // Zu viele Stufen auf kleinen Geräten ausdünnen.
    const step = Math.ceil(out.length / Math.max(2, count));
    return out.filter((_, i) => i % step === 0);
  }
  const span = max - min;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.01; v += step) out.push(v);
  return out;
}

/**
 * @param {HTMLElement} host   Container (bekommt position:relative über die CSS-Klasse)
 * @param {object} cfg
 *   series       [{ key, label, color, image, width, highlight, dimmed, points:[{key,label,short,value,tier,tierChanged,elo}] }]
 *   stops        [{ key, label, short }]  Reihenfolge der X-Achse
 *   bands        [{ tier, color, from, to }]  Werte-Bereiche der Tiers (null = offen)
 *   scale        'log' | 'linear'
 *   format       (v) => string
 *   legend       boolean
 *   emptyText    string
 * @returns {{ destroy(): void, redraw(): void }}
 */
export function renderMarketChart(host, cfg) {
  if (!host) return { destroy() {}, redraw() {} };
  const state = { cfg, hidden: new Set() };

  host.classList.add('mv-chart');
  host.innerHTML = '<div class="mv-plot"></div><div class="mv-tip" hidden></div><div class="mv-legend" hidden></div>';
  const plot = host.querySelector('.mv-plot');
  const tip = host.querySelector('.mv-tip');
  const legend = host.querySelector('.mv-legend');

  let frame = null;
  let geom = null;
  let active = -1;

  const visible = () => state.cfg.series.filter((s) => !state.hidden.has(s.key));

  function buildLegend() {
    const list = state.cfg.series;
    if (!state.cfg.legend || list.length < 2) { legend.hidden = true; return; }
    legend.hidden = false;
    legend.innerHTML = list
      .map((s) => `<button type="button" class="mv-legend-item${state.hidden.has(s.key) ? ' is-off' : ''}${s.highlight ? ' is-lead' : ''}" data-key="${esc(s.key)}">
        <i style="background:${esc(s.color)}"></i><span>${esc(s.label)}</span>
      </button>`)
      .join('');
  }

  legend.addEventListener('click', (e) => {
    const btn = e.target.closest('.mv-legend-item');
    if (!btn) return;
    const key = btn.dataset.key;
    if (state.hidden.has(key)) state.hidden.delete(key);
    else if (visible().length > 1) state.hidden.add(key);
    buildLegend();
    draw();
  });

  function draw() {
    const width = Math.max(200, Math.floor(host.clientWidth || plot.clientWidth || 320));
    const c = state.cfg;
    const stops = c.stops || [];
    const series = visible();
    const values = series.flatMap((s) => (s.points || []).map((p) => p.value)).filter((v) => Number.isFinite(v) && v > 0);
    if (!values.length || stops.length < 1) {
      plot.innerHTML = `<p class="mv-empty">${esc(c.emptyText || 'Noch keine Verlaufsdaten.')}</p>`;
      tip.hidden = true;
      geom = null;
      return;
    }

    const narrow = width < 460;
    const height = Math.round(clamp(width * (narrow ? 0.78 : 0.5), 200, 320));
    const scale = c.scale === 'linear' ? 'linear' : 'log';
    const fmt = c.format || ((v) => String(v));

    let min = Math.min(...values);
    let max = Math.max(...values);
    if (scale === 'log') {
      min = min / 1.35;
      max = max * 1.35;
    } else {
      const pad = (max - min || max) * 0.12;
      min = Math.max(0, min - pad);
      max = max + pad;
    }
    const ticks = niceTicks(min, max, scale, narrow ? 4 : 6);
    if (ticks.length) {
      min = Math.min(min, ticks[0]);
      max = Math.max(max, ticks[ticks.length - 1]);
    }

    const labelW = Math.max(...ticks.map((t) => fmt(t).length), 6) * (narrow ? 5.6 : 6.2);
    const padL = Math.round(clamp(labelW + 8, 40, 84));
    const padR = narrow ? 14 : 22;
    const padT = 12;
    const padB = 30;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const tv = (v) => (scale === 'log' ? Math.log10(Math.max(1, v)) : v);
    const lo = tv(min);
    const hi = tv(max);
    const yFor = (v) => padT + innerH - ((tv(v) - lo) / (hi - lo || 1)) * innerH;
    const xFor = (i) => (stops.length === 1 ? padL + innerW / 2 : padL + (i / (stops.length - 1)) * innerW);

    const svg = el('svg', {
      width, height, viewBox: `0 0 ${width} ${height}`, class: 'mv-svg',
      role: 'img', 'aria-label': c.ariaLabel || 'Marktwert-Verlauf',
    });

    // --- Tier-Bänder ------------------------------------------------------
    (c.bands || []).forEach((b) => {
      const top = b.to == null ? padT : yFor(b.to);
      const bottom = b.from == null ? padT + innerH : yFor(b.from);
      const y0 = clamp(Math.min(top, bottom), padT, padT + innerH);
      const y1 = clamp(Math.max(top, bottom), padT, padT + innerH);
      if (y1 - y0 < 1) return;
      svg.appendChild(el('rect', {
        x: padL, y: y0, width: innerW, height: y1 - y0, fill: b.color, 'fill-opacity': 0.09,
      }));
      if (b.to != null) {
        const y = yFor(b.to);
        if (y > padT && y < padT + innerH) {
          svg.appendChild(el('line', {
            x1: padL, x2: padL + innerW, y1: y, y2: y,
            stroke: b.color, 'stroke-opacity': 0.55, 'stroke-width': 1, 'stroke-dasharray': '4 4',
          }));
        }
      }
      if (y1 - y0 > 15) {
        const t = el('text', {
          x: padL + innerW - 3, y: (y0 + y1) / 2 + 3.5, 'text-anchor': 'end',
          fill: b.color, 'fill-opacity': 0.75, 'font-size': 10, 'font-weight': 700,
        });
        t.textContent = b.tier;
        svg.appendChild(t);
      }
    });

    // --- Werteachse -------------------------------------------------------
    ticks.forEach((v) => {
      const y = yFor(v);
      if (y < padT - 1 || y > padT + innerH + 1) return;
      svg.appendChild(el('line', { x1: padL, x2: padL + innerW, y1: y, y2: y, stroke: GRID, 'stroke-width': 1 }));
      const t = el('text', { x: padL - 6, y: y + 3.5, 'text-anchor': 'end', fill: AXIS, 'font-size': narrow ? 9 : 10 });
      t.textContent = fmt(v);
      svg.appendChild(t);
    });

    // --- Zeitachse --------------------------------------------------------
    const every = Math.ceil(stops.length / (narrow ? 4 : 8));
    stops.forEach((s, i) => {
      const x = xFor(i);
      if (i % every !== 0 && i !== stops.length - 1) return;
      const t = el('text', {
        x, y: height - 10, 'text-anchor': i === 0 ? 'start' : i === stops.length - 1 ? 'end' : 'middle',
        fill: AXIS, 'font-size': narrow ? 9 : 10,
      });
      t.textContent = s.short || s.label;
      svg.appendChild(t);
    });

    // --- Führungslinie ----------------------------------------------------
    const guide = el('line', { y1: padT, y2: padT + innerH, stroke: '#eef1f6', 'stroke-opacity': 0.35, 'stroke-width': 1, class: 'mv-guide' });
    guide.style.display = 'none';
    svg.appendChild(guide);

    // --- Linien -----------------------------------------------------------
    const dotGroups = [];
    const ordered = [...series].sort((a, b) => (a.highlight ? 1 : 0) - (b.highlight ? 1 : 0));
    ordered.forEach((s) => {
      const pts = stops
        .map((stop, i) => {
          const p = (s.points || []).find((x) => x.key === stop.key);
          return p && Number.isFinite(p.value) ? { ...p, i, x: xFor(i), y: yFor(p.value) } : null;
        })
        .filter(Boolean);
      if (!pts.length) return;
      const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      svg.appendChild(el('path', {
        d, fill: 'none', stroke: s.color,
        'stroke-opacity': s.dimmed ? 0.4 : 1,
        'stroke-width': s.highlight ? 3 : s.dimmed ? 1.4 : 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }));
      // Tier-Wechsel bekommen einen auffälligen Ring, sonst ein kleiner Punkt.
      const group = el('g');
      pts.forEach((p) => {
        if (p.tierChanged) {
          group.appendChild(el('circle', {
            cx: p.x, cy: p.y, r: 6, fill: 'none', stroke: p.tierColor || s.color, 'stroke-width': 2,
          }));
        }
        group.appendChild(el('circle', {
          cx: p.x, cy: p.y, r: s.highlight ? 3.2 : 2.4, fill: s.color, 'fill-opacity': s.dimmed ? 0.5 : 1,
        }));
      });
      svg.appendChild(group);
      dotGroups.push({ s, pts });
    });

    // Hervorgehobene Marker, die beim Zeigen erscheinen.
    const markers = el('g', { class: 'mv-markers' });
    markers.style.display = 'none';
    svg.appendChild(markers);

    plot.innerHTML = '';
    plot.appendChild(svg);
    geom = { width, height, padL, padR, padT, padB, innerW, innerH, xFor, stops, dotGroups, guide, markers, fmt, svg };
    if (active >= 0) showAt(active);
  }

  function hideTip() {
    active = -1;
    tip.hidden = true;
    if (geom) {
      geom.guide.style.display = 'none';
      geom.markers.style.display = 'none';
    }
  }

  function showAt(i) {
    if (!geom) return;
    const idx = clamp(i, 0, geom.stops.length - 1);
    const stop = geom.stops[idx];
    const rows = geom.dotGroups
      .map(({ s, pts }) => {
        const p = pts.find((x) => x.i === idx);
        return p ? { s, p } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.p.value - a.p.value);
    if (!rows.length) return;
    active = idx;

    const x = geom.xFor(idx);
    geom.guide.setAttribute('x1', x);
    geom.guide.setAttribute('x2', x);
    geom.guide.style.display = '';

    geom.markers.innerHTML = '';
    rows.forEach(({ s, p }) => {
      geom.markers.appendChild(el('circle', { cx: p.x, cy: p.y, r: 6.5, fill: '#0b0d12', stroke: s.color, 'stroke-width': 2.5 }));
    });
    geom.markers.style.display = '';

    const many = rows.length > 6;
    const list = (many ? rows.slice(0, 6) : rows)
      .map(({ s, p }) => `<span class="mv-tip-row">
        <i style="background:${esc(s.color)}"></i>
        <b>${esc(s.label)}</b>
        <u>${esc(geom.fmt(p.value))}</u>
      </span>`)
      .join('');
    const tierLine = rows.length === 1 && rows[0].p.tier
      ? `<span class="mv-tip-meta">Tier ${esc(rows[0].p.tier)}${rows[0].p.elo != null ? ` · Elo ${esc(rows[0].p.elo)}` : ''}${rows[0].p.tierChanged ? ' · Tier-Wechsel' : ''}</span>`
      : '';
    tip.innerHTML = `<span class="mv-tip-head">${esc(stop.label)}</span>${list}${many ? `<span class="mv-tip-meta">+ ${rows.length - 6} weitere</span>` : ''}${tierLine}`;
    tip.hidden = false;

    // Tooltip innerhalb des Containers halten — auf dem Telefon sonst abgeschnitten.
    const w = tip.offsetWidth || 160;
    const left = clamp(x - w / 2, 4, Math.max(4, host.clientWidth - w - 4));
    tip.style.left = `${left}px`;
    tip.style.top = `${geom.padT}px`;
  }

  function pick(clientX) {
    if (!geom) return;
    const rect = geom.svg.getBoundingClientRect();
    const rel = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    geom.stops.forEach((_, i) => {
      const d = Math.abs(geom.xFor(i) - rel);
      if (d < bestD) { bestD = d; best = i; }
    });
    showAt(best);
  }

  const onMove = (e) => pick(e.clientX);
  const onLeave = () => hideTip();
  plot.addEventListener('pointerdown', onMove);
  plot.addEventListener('pointermove', onMove);
  plot.addEventListener('pointerleave', onLeave);
  plot.addEventListener('pointercancel', onLeave);

  const schedule = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { frame = null; draw(); });
  };

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
  if (ro) ro.observe(host);

  buildLegend();
  draw();

  return {
    redraw: schedule,
    update(next) {
      state.cfg = next;
      state.hidden = new Set([...state.hidden].filter((k) => next.series.some((s) => s.key === k)));
      active = -1;
      buildLegend();
      draw();
    },
    destroy() {
      if (ro) ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
      plot.removeEventListener('pointerdown', onMove);
      plot.removeEventListener('pointermove', onMove);
      plot.removeEventListener('pointerleave', onLeave);
      plot.removeEventListener('pointercancel', onLeave);
      host.innerHTML = '';
    },
  };
}
