// Bausteine im Presse-Beitrag: Marktwertkacheln, Trainer- und Vereinsbilder,
// Ergebniskacheln und das Video zum Spiel.
// Framework-frei (kein Alpine, kein Firebase) — damit unter Node testbar.
//
// Ein Baustein steht als eigener Absatz im Textkörper und sieht so aus:
//
//     [marktwert: Glurak]
//     [team: s1-heerashai-sv]
//     [trainer: s1-heerashai-sv]
//     [ergebnis: s1-d3-m0]
//     [video: s1-d3-m0]
//
// Aufgelöst wird er ERST BEIM ANZEIGEN, nicht beim Speichern. Das hat drei Gründe:
// der gespeicherte Beitrag bleibt reiner Text und braucht keine weitere Whitelist;
// ein Marktwert zeigt immer den heutigen Stand statt den vom Tag des Beitrags; und
// im Editor bleibt der Baustein als Zeile sichtbar und lässt sich verschieben.

import { formatMarket, marketValue } from './market.mjs';
import { currentTrainer } from './trainers.mjs';
import { videoEmbed } from './video.mjs';
import { battleStats } from './scoring.mjs';

/** Die Bausteine, die es gibt — auch die Liste für den Prompt. */
export const TILE_KINDS = ['marktwert', 'team', 'trainer', 'ergebnis', 'video'];

const TILE_RE = /^\s*\[\s*(marktwert|team|trainer|ergebnis|video)\s*:\s*([^\]]+?)\s*\]\s*$/i;

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

const BUILDERS = {
  marktwert: monTile,
  team: teamTile,
  trainer: trainerTile,
  ergebnis: resultTile,
  video: videoTile,
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
