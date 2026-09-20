// Bausteine im Presse-Beitrag: Marktwertkacheln, Trainer- und Vereinsbilder,
// Ergebniskacheln und das Video zum Spiel.
// Framework-frei (kein Alpine, kein Firebase) — damit unter Node testbar.
//
// Ein Baustein steht als eigener Absatz im Textkörper und sieht so aus:
//
//     [marktwert: Glurak]
//     [verlauf: Glurak]
//     [statistik: Glurak]
//     [team: s1-heerashai-sv]
//     [trainer: s1-heerashai-sv]
//     [ergebnis: s1-d3-m0]
//     [tabelle: s1-heerashai-sv]
//     [video: s1-d3-m0]
//     [bild: https://…/foto.jpg]
//
// Aufgelöst wird er ERST BEIM ANZEIGEN, nicht beim Speichern. Das hat drei Gründe:
// der gespeicherte Beitrag bleibt reiner Text und braucht keine weitere Whitelist;
// ein Marktwert zeigt immer den heutigen Stand statt den vom Tag des Beitrags; und
// im Editor bleibt der Baustein als Zeile sichtbar und lässt sich verschieben.

import { formatMarket, formatMarketDelta, marketValue, historyPoints } from './market.mjs';
import { currentTrainer } from './trainers.mjs';
import { videoEmbed } from './video.mjs';
import { battleStats, computeStandings, pokemonStats } from './scoring.mjs';

/** Die Bausteine, die es gibt — auch die Liste für den Prompt. */
export const TILE_KINDS = ['marktwert', 'verlauf', 'statistik', 'team', 'trainer', 'ergebnis', 'tabelle', 'video', 'bild'];

const TILE_RE = /^\s*\[\s*(marktwert|verlauf|statistik|team|trainer|ergebnis|tabelle|video|bild)\s*:\s*([^\]]+?)\s*\]\s*$/i;

/** `[marktwert: Glurak]` -> { kind: 'marktwert', key: 'Glurak' }, sonst null. */
export function parseTile(text) {
  const m = TILE_RE.exec(String(text || ''));
  if (!m) return null;
  return { kind: m[1].toLowerCase(), key: m[2].trim() };
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Ein Name, der ungefähr passt, reicht: das Modell schreibt „Glurak" und meint die
// Zeile aus den Stammdaten, trifft aber nicht immer Groß-/Kleinschreibung.
function looseFind(list, key, pick) {
  const needle = String(key || '').trim().toLowerCase();
  if (!needle) return null;
  return (list || []).find((x) => String(pick(x) || '').trim().toLowerCase() === needle) || null;
}

function monTile(key, { pokedex, eloIndex }) {
  const mon = looseFind(pokedex, key, (p) => p.name);
  if (!mon) return null;
  const row = eloIndex?.[mon.name] || null;
  const value = row ? marketValue(row.elo) : null;
  return `<figure class="press-tile press-tile-mon">
    ${mon.image ? `<img src="${esc(mon.image)}" alt="${esc(mon.name)}" loading="lazy" />` : ''}
    <figcaption>
      <span class="press-tile-label">Marktwert</span>
      <span class="press-tile-name">${esc(mon.name)}</span>
      <span class="press-tile-value">${esc(value ? formatMarket(value) : 'kein Wert im Sheet')}</span>
      ${row ? `<span class="press-tile-sub">Elo ${esc(row.elo)}${row.projectedTier ? ` · Tier ${esc(row.projectedTier)}` : ''}</span>` : ''}
    </figcaption>
  </figure>`;
}

function teamTile(key, { teams, logoBase, squadValue }) {
  const team = looseFind(teams, key, (t) => t.id) || looseFind(teams, key, (t) => t.name);
  if (!team) return null;
  const value = typeof squadValue === 'function' ? squadValue(team) : null;
  return `<figure class="press-tile press-tile-team">
    ${team.logo ? `<img src="${esc(logoBase)}${esc(team.logo)}" alt="${esc(team.name)}" loading="lazy" />` : ''}
    <figcaption>
      <span class="press-tile-label">${esc(team.player || 'Verein')}</span>
      <span class="press-tile-name">${esc(team.name)}</span>
      ${value ? `<span class="press-tile-value">${esc(formatMarket(value))}</span><span class="press-tile-sub">Kaderwert</span>` : ''}
    </figcaption>
  </figure>`;
}

function trainerTile(key, { teams, logoBase }) {
  const team = looseFind(teams, key, (t) => t.id) || looseFind(teams, key, (t) => t.name);
  // Zweiter Versuch: der Schlüssel benennt den Trainer selbst.
  let trainer = team ? currentTrainer(team.trainers) : null;
  let owner = team;
  if (!trainer) {
    for (const t of teams || []) {
      const hit = looseFind(t.trainers, key, (x) => x.name);
      if (hit) { trainer = hit; owner = t; break; }
    }
  }
  if (!trainer) return null;
  const period = trainer.untilDay == null
    ? 'amtierend'
    : `bis Spieltag ${trainer.untilDay}`;
  return `<figure class="press-tile press-tile-trainer">
    ${trainer.image
      ? `<img src="${esc(trainer.image)}" alt="${esc(trainer.name)}" loading="lazy" />`
      : (owner?.logo ? `<img src="${esc(logoBase)}${esc(owner.logo)}" alt="${esc(owner.name)}" loading="lazy" />` : '')}
    <figcaption>
      <span class="press-tile-label">Trainer${owner ? ` · ${esc(owner.name)}` : ''}</span>
      <span class="press-tile-name">${esc(trainer.name)}</span>
      <span class="press-tile-sub">${esc(period)}</span>
    </figcaption>
  </figure>`;
}

// Kampf- und Kill-Stand eines Matches. Beide Zahlen gehören zusammen: Punkte
// entscheidet der Sieger je Kampf, die Kill-Differenz ist das zweite Ergebnis.
function resultTile(key, { results, teams, logoBase }) {
  const r = (results || []).find((x) => x.id === key);
  if (!r) return null;
  const home = looseFind(teams, r.home, (t) => t.id);
  const away = looseFind(teams, r.away, (t) => t.id);
  let hw = 0; let aw = 0; let hk = 0; let ak = 0; let played = 0;
  (r.battles || []).forEach((b) => {
    if (!b?.done) return;
    played++;
    const s = battleStats(b);
    if (s.winner === 'home') hw++;
    else if (s.winner === 'away') aw++;
    hk += s.homeKills;
    ak += s.awayKills;
  });
  if (!played) return null;
  const side = (team, wins, win) => `<span class="press-score-side${win ? ' is-win' : ''}">
      ${team?.logo ? `<img src="${esc(logoBase)}${esc(team.logo)}" alt="${esc(team.name)}" loading="lazy" />` : ''}
      <span class="press-score-team">${esc(team?.name || '?')}</span>
      <span class="press-score-num">${wins}</span>
    </span>`;
  return `<figure class="press-tile press-tile-score">
    <span class="press-tile-label">Spieltag ${esc(r.day ?? '?')}</span>
    <span class="press-score-row">
      ${side(home, hw, hw > aw)}
      <span class="press-score-sep">:</span>
      ${side(away, aw, aw > hw)}
    </span>
    <figcaption class="press-tile-sub">Kämpfe · Kills ${hk}:${ak}</figcaption>
  </figure>`;
}

function videoTile(key, { results }) {
  const r = (results || []).find((x) => x.id === key);
  const embed = videoEmbed(r?.videoUrl);
  if (!embed) return null;
  if (!embed.embedUrl) {
    return `<figure class="press-tile press-tile-video">
      <a href="${esc(embed.url)}" target="_blank" rel="noopener noreferrer">Video zum Spiel öffnen</a>
    </figure>`;
  }
  return `<figure class="press-tile press-tile-video">
    <span class="press-video-frame">
      <iframe src="${esc(embed.embedUrl)}" title="Video zum Spiel" loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
    </span>
    <figcaption class="press-tile-sub">Das Video deckt alle drei Kämpfe ab.</figcaption>
  </figure>`;
}

// Marktwert eines Pokémon über die Saison — als kleine Kurve. Gezeichnet wird in den
// Stützstellen des Sheets; gerechnet wird logarithmisch, weil die Beträge nach oben
// eskalieren und eine lineare Achse den halben Verlauf platt auf die Grundlinie drückt.
function historyTile(key, { pokedex, eloIndex }) {
  const mon = looseFind(pokedex, key, (p) => p.name);
  const row = mon ? eloIndex?.[mon.name] : null;
  const pts = historyPoints(row).filter((h) => h.value > 0);
  if (!mon || pts.length < 2) return null;

  const W = 320;
  const H = 90;
  const values = pts.map((h) => Math.log(h.value));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const xy = values.map((v, i) => ({
    x: 6 + (i / (values.length - 1)) * (W - 12),
    y: H - 10 - ((v - lo) / span) * (H - 24),
  }));
  const path = xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L ${xy[xy.length - 1].x.toFixed(1)} ${H} L ${xy[0].x.toFixed(1)} ${H} Z`;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const up = last.value >= first.value;
  const color = up ? '#63bc5a' : '#e3350d';

  return `<figure class="press-tile press-tile-history">
    <figcaption>
      <span class="press-tile-label">Marktwert im Verlauf</span>
      <span class="press-tile-name">${esc(mon.name)}</span>
      <span class="press-tile-value">${esc(formatMarket(last.value))}</span>
      <span class="press-tile-sub">${esc(first.short || first.label || 'Start')} → ${esc(last.short || last.label || 'heute')} · ${esc(formatMarketDelta(last.value - first.value))}</span>
    </figcaption>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${area}" fill="${color}" opacity="0.14" />
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="${xy[xy.length - 1].x.toFixed(1)}" cy="${xy[xy.length - 1].y.toFixed(1)}" r="3.5" fill="${color}" />
    </svg>
  </figure>`;
}

// Die harten Zahlen eines Pokémon — damit ein Satz über „trägt das Team" belegt ist.
function statTile(key, { pokedex, results, availability }) {
  const mon = looseFind(pokedex, key, (p) => p.name);
  if (!mon) return null;
  const row = pokemonStats(results || [], [mon], { availability })[0];
  if (!row || !row.battles) return null;
  const cells = [
    ['Kills', row.kills],
    ['Deaths', row.deaths],
    ['K/D', row.kd.toFixed(2).replace('.', ',')],
    ['Kämpfe', row.battles],
    ['Siegquote', `${Math.round((row.battleWinPct || 0) * 100)} %`],
    ['Überlebt', `${Math.round((row.survivalRate || 0) * 100)} %`],
  ];
  return `<figure class="press-tile press-tile-stats">
    ${mon.image ? `<img src="${esc(mon.image)}" alt="${esc(mon.name)}" loading="lazy" />` : ''}
    <figcaption>
      <span class="press-tile-label">Bilanz</span>
      <span class="press-tile-name">${esc(mon.name)}</span>
      <span class="press-stat-grid">
        ${cells.map(([l, v]) => `<span class="press-stat"><span class="press-stat-num">${esc(v)}</span><span class="press-stat-label">${esc(l)}</span></span>`).join('')}
      </span>
    </figcaption>
  </figure>`;
}

// Ausschnitt der Tabelle: das genannte Team mit je einem Nachbarn — oder die Spitze,
// wenn der Schlüssel „top" lautet. Eine ganze Tabelle im Fließtext liest niemand.
function tableTile(key, { seasonTeams, teams, results, logoBase }) {
  // Für eine Tabelle zählen nur die Teams DIESER Saison — `teams` hält den Gesamtbestand.
  const table = computeStandings(seasonTeams || teams || [], results || []);
  if (table.length < 2) return null;
  const needle = String(key || '').trim().toLowerCase();
  let slice;
  let label;
  if (needle === 'top' || needle === 'spitze') {
    slice = table.slice(0, 3).map((r, i) => ({ r, place: i + 1 }));
    label = 'Tabellenspitze';
  } else {
    const at = table.findIndex((r) => String(r.team.id).toLowerCase() === needle
      || String(r.team.name).trim().toLowerCase() === needle);
    if (at < 0) return null;
    const from = Math.max(0, Math.min(at - 1, table.length - 3));
    slice = table.slice(from, from + 3).map((r, i) => ({ r, place: from + i + 1, focus: from + i === at }));
    label = 'Tabelle';
  }
  const rows = slice.map(({ r, place, focus }) => `<span class="press-table-row${focus ? ' is-focus' : ''}">
      <span class="press-table-place">${place}</span>
      ${r.team.logo ? `<img src="${esc(logoBase)}${esc(r.team.logo)}" alt="${esc(r.team.name)}" loading="lazy" />` : ''}
      <span class="press-table-name">${esc(r.team.name)}</span>
      <span class="press-table-diff">${r.diff > 0 ? '+' : ''}${r.diff}</span>
      <span class="press-table-pts">${r.points}</span>
    </span>`).join('');
  return `<figure class="press-tile press-tile-table">
    <span class="press-tile-label">${esc(label)}</span>
    ${rows}
    <figcaption class="press-tile-sub">Platz · Team · Kill-Differenz · Punkte</figcaption>
  </figure>`;
}

// Ein Bild, das im Auftrag mitgegeben wurde. Nur http(s) — alles andere wäre ein
// Freibrief für beliebige URL-Schemata in einem src-Attribut.
function imageTile(key) {
  const url = String(key || '').trim();
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) return null;
  return `<figure class="press-tile press-tile-image">
    <img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
  </figure>`;
}

const BUILDERS = {
  marktwert: monTile,
  verlauf: historyTile,
  statistik: statTile,
  team: teamTile,
  trainer: trainerTile,
  ergebnis: resultTile,
  tabelle: tableTile,
  video: videoTile,
  bild: imageTile,
};

/**
 * Einen Baustein zu HTML machen. `null`, wenn der Schlüssel ins Leere zeigt —
 * dann bleibt der Absatz stehen, wie das Modell ihn geschrieben hat.
 * `src`: { pokedex, eloIndex, teams, results, logoBase, squadValue }
 */
export function tileHtml(tile, src = {}) {
  if (!tile) return null;
  const build = BUILDERS[tile.kind];
  if (!build) return null;
  try {
    return build(tile.key, { logoBase: './img/teams/', ...src }) || null;
  } catch {
    return null;
  }
}

// Bild-Adressen in einem Freitext (Auftrag der Redaktionsleitung, Notiz, Absatz).
const IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+?\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s"'<>]*)?/gi;

/** Alle Bild-Adressen eines Textes, ohne Dubletten. */
export function imageUrlsIn(text) {
  return [...new Set(String(text || '').match(IMAGE_URL_RE) || [])];
}

/**
 * Bild-Adressen aus einem Auftrag sicher im Beitrag unterbringen.
 *
 * Der Auftrag kann Bilder mitgeben; das Modell hat sie bisher gern als nackte Adresse
 * in den Fließtext geschrieben, wo sie nur als Text steht. Hier wird nachgezogen: Was
 * schon als Baustein drinsteht, bleibt, wo es ist. Was als rohe Adresse im Text steht,
 * fliegt dort raus und kommt als Baustein zurück.
 */
export function withImageTiles(html, urls = []) {
  let out = String(html || '');
  const list = [...new Set(urls)].filter(Boolean);
  list.forEach((url) => {
    if (new RegExp(`\\[\\s*bild\\s*:\\s*${escapeRe(url)}\\s*\\]`, 'i').test(out)) return;
    out = out.replace(new RegExp(escapeRe(url), 'gi'), '');
    out += `<p>[bild: ${url}]</p>`;
  });
  return out.replace(/<p>(\s|&nbsp;)*<\/p>/gi, '');
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Den Textkörper eines Beitrags für die Anzeige aufbereiten: Absätze, die NUR aus
 * einem Baustein bestehen, werden ersetzt. Alles andere bleibt unangetastet.
 * Erwartet und liefert HTML; ohne DOM (Node) kommt die Eingabe unverändert zurück.
 */
export function renderTiles(html, src = {}) {
  const input = String(html || '');
  if (!input || typeof document === 'undefined') return input;
  const tpl = document.createElement('template');
  tpl.innerHTML = input;
  [...tpl.content.querySelectorAll('p')].forEach((p) => {
    const tile = parseTile(p.textContent);
    if (!tile) return;
    const out = tileHtml(tile, src);
    if (!out) return;
    const holder = document.createElement('template');
    holder.innerHTML = out;
    p.replaceWith(holder.content);
  });
  return tpl.innerHTML;
}
