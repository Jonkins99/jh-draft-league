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
//     [rivalität: heerashai-sv | beast-force]
//
// Aufgelöst wird er ERST BEIM ANZEIGEN, nicht beim Speichern. Das hat drei Gründe:
// der gespeicherte Beitrag bleibt reiner Text und braucht keine weitere Whitelist;
// ein Marktwert zeigt immer den heutigen Stand statt den vom Tag des Beitrags; und
// im Editor bleibt der Baustein als Zeile sichtbar und lässt sich verschieben.
//
// Ein Baustein MUSS nicht allein im Absatz stehen. Steht er mitten im Satz — und genau
// das tut das Modell regelmäßig, allen Prompt-Regeln zum Trotz —, wird der Absatz an
// der Stelle aufgetrennt: Text davor, Kachel, Text danach. Ohne das blieb „[statistik:
// Mega-Floette]" als roher Text im Fließtext stehen. Weil beim Anzeigen aufgelöst wird,
// gilt die Auftrennung rückwirkend auch für längst gespeicherte Beiträge.
//
// Dazu kommt die Freitext-Tabelle in Pipe-Schreibweise — Zeilen aus lauter
// `| Zelle | Zelle |` werden zu einer echten Tabelle. Das ist bewusst Text und kein
// <table> im Textkörper: so übersteht die Tabelle den Sanitizer, bleibt im Editor
// zeilenweise bearbeitbar und lässt sich ohne Tabellenwerkzeug tippen.

import { formatMarket, formatMarketDelta, marketValue, historyPoints } from './market.mjs';
import { currentTrainer } from './trainers.mjs';
import { videoEmbed } from './video.mjs';
import { battleStats, computeStandings, pokemonStats } from './scoring.mjs';
import { rivalry, splitPair } from './career.mjs';

/** Die Bausteine, die es gibt — auch die Liste für den Prompt. */
// „rivalitaet" ist dieselbe Kachel wie „rivalität" — ohne Umlaut getippt.
export const TILE_KINDS = ['marktwert', 'verlauf', 'statistik', 'team', 'trainer', 'ergebnis', 'tabelle', 'video', 'bild', 'rivalität', 'rivalitaet'];

const TILE_RE = /^\s*\[\s*(marktwert|verlauf|statistik|team|trainer|ergebnis|tabelle|video|bild|rivalität|rivalitaet)\s*:\s*([^\]]+?)\s*\]\s*$/i;

/**
 * Dieselben Bausteine, beschriftet — die Auswahlleiste im Editor. `source` sagt, woher
 * der Schlüssel kommt: `mon` (Pokémon-Name), `team` (Team-Id), `match` (Match-Id),
 * `url` (Bild-Adresse).
 */
export const TILE_MENU = [
  { kind: 'marktwert', label: 'Marktwert', hint: 'Bild, Marktwert und Tier eines Pokémon', source: 'mon' },
  { kind: 'verlauf', label: 'Verlauf', hint: 'Marktwert-Kurve über die Saison', source: 'mon' },
  { kind: 'statistik', label: 'Bilanz', hint: 'Kills, Deaths, K/D, Einsätze, Quoten', source: 'mon' },
  { kind: 'team', label: 'Verein', hint: 'Logo, Name und Kaderwert', source: 'team' },
  { kind: 'trainer', label: 'Trainer', hint: 'Foto und Name des amtierenden Trainers', source: 'team' },
  { kind: 'ergebnis', label: 'Ergebnis', hint: 'Kampf- und Kill-Stand einer Partie', source: 'match' },
  { kind: 'tabelle', label: 'Tabelle', hint: 'Ausschnitt um ein Team — oder die Spitze', source: 'team' },
  { kind: 'video', label: 'Video', hint: 'das Video zum Spiel', source: 'match' },
  { kind: 'bild', label: 'Bild', hint: 'ein Bild über seine Adresse', source: 'url' },
  { kind: 'rivalität', label: 'Rivalität', hint: 'Bilanz zweier Vereine über alle Saisons', source: 'pair' },
];

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

// Vergleichsform eines Schlüssels: ohne Diakritika, ohne Trennzeichen, klein. Damit
// treffen „Mega Floette", „mega-floette" und „Méga‑Floette" dieselbe Zeile. Der Wert
// ist NUR zum Vergleichen gut — angezeigt wird immer der Name aus den Stammdaten.
export function normKey(value) {
  return String(value ?? '')
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

// Schreibweisen, die dasselbe meinen können: der Schlüssel selbst, ohne Satzzeichen am
// Ende und ohne angehängte Klammer („Glurak (S-Tier)"). Die Klammer wird NICHT immer
// entfernt — „Floette (Ewige Blume)" ist ein echter Name.
function keyVariants(key) {
  const raw = String(key ?? '').trim().replace(/[,.;:!?\u2026]+$/, '').trim();
  return [...new Set([raw, raw.replace(/\s*\([^)]*\)\s*$/, '')].map(normKey).filter(Boolean))];
}

/** Ein Pokémon aus den Stammdaten — deutscher Name, englischer Name, sonst eindeutiger Anfang. */
export function findMon(pokedex, key) {
  const list = pokedex || [];
  const tries = keyVariants(key);
  if (!tries.length) return null;
  for (const k of tries) {
    const hit = list.find((p) => normKey(p.name) === k) || list.find((p) => normKey(p.name_en) === k);
    if (hit) return hit;
  }
  // Letzter Versuch: ein Namensanfang, der nur auf eine Zeile passt. Bei zwei Treffern
  // („Mega-Glurak" -> X und Y) bleibt es beim Fehlschlag, geraten wird nicht.
  const k = tries[0];
  if (k.length >= 4) {
    const near = list.filter((p) => normKey(p.name).startsWith(k));
    if (near.length === 1) return near[0];
  }
  return null;
}

/** Die Saisonnummer aus einer Dokument-ID wegnehmen: `s2-heerashai-sv` -> `heerashai-sv`. */
function franchisePart(id) {
  return String(id || '').replace(/^s\d+-/i, '');
}

/**
 * Ein Team — Dokument-ID, Name oder Franchise-Slug ohne Saisonpräfix. Die Saison-Teams
 * gehen vor: `heerashai-sv` ohne Präfix gibt es in jeder Saison einmal, gemeint ist die
 * laufende.
 */
export function findTeam(key, { teams, seasonTeams } = {}) {
  const k = normKey(key);
  if (!k) return null;
  const all = teams || [];
  const order = [...new Set([...(seasonTeams || []), ...all])];
  return order.find((t) => normKey(t.id) === k)
    || order.find((t) => normKey(t.name) === k)
    || order.find((t) => normKey(franchisePart(t.id)) === k)
    || order.find((t) => normKey(t.id).endsWith(k))
    || null;
}

/** Ein Ergebnis — volle Match-ID oder der Teil ohne Saisonpräfix (`d3-m0`). */
export function findResult(results, key) {
  const k = normKey(key);
  if (!k) return null;
  const list = results || [];
  return list.find((r) => normKey(r.id) === k)
    || list.find((r) => normKey(franchisePart(r.id)) === k)
    || list.find((r) => normKey(r.id).endsWith(k))
    || null;
}

function monTile(key, { pokedex, eloIndex }) {
  const mon = findMon(pokedex, key);
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

function teamTile(key, { teams, seasonTeams, logoBase, squadValue }) {
  const team = findTeam(key, { teams, seasonTeams });
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

function trainerTile(key, { teams, seasonTeams, logoBase }) {
  const team = findTeam(key, { teams, seasonTeams });
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
  const r = findResult(results, key);
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
  const r = findResult(results, key);
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
  const mon = findMon(pokedex, key);
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
  const mon = findMon(pokedex, key);
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
  const needle = normKey(key);
  let slice;
  let label;
  if (needle === 'top' || needle === 'spitze') {
    slice = table.slice(0, 3).map((r, i) => ({ r, place: i + 1 }));
    label = 'Tabellenspitze';
  } else {
    const wanted = findTeam(key, { teams: table.map((r) => r.team), seasonTeams });
    const at = wanted ? table.findIndex((r) => r.team.id === wanted.id) : -1;
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

// Zwei Vereine über alle Saisons: Bilanz, die heißesten Duelle und die Geschichten
// zwischen ihnen. `storylines` kommt aus collectStorylines (press.mjs).
function rivalryTile(key, { teams, seasonTeams, results, logoBase, storylines }) {
  const pair = splitPair(key);
  if (!pair) return null;
  const ta = findTeam(pair[0], { teams, seasonTeams });
  const tb = findTeam(pair[1], { teams, seasonTeams });
  if (!ta || !tb || ta.id === tb.id) return null;
  const r = rivalry(ta.id, tb.id, results, storylines);
  const side = (team, wins, win) => `<span class="press-score-side${win ? ' is-win' : ''}">
      ${team.logo ? `<img src="${esc(logoBase)}${esc(team.logo)}" alt="${esc(team.name)}" loading="lazy" />` : ''}
      <span class="press-score-team">${esc(team.name)}</span>
      <span class="press-score-num">${wins}</span>
    </span>`;
  const duels = r.hottest.map((g) => `<li>Saison ${esc(g.season)} · Spieltag ${esc(g.day ?? '?')} · ${g.battlesA}:${g.battlesB} <span>(Kills ${g.killsA}:${g.killsB})</span></li>`).join('');
  const stories = r.storylines.slice(0, 3).map((st) => `<li>${esc(st.title)} <span>· ${esc(st.status)}</span></li>`).join('');
  return `<figure class="press-tile press-tile-score press-tile-rival">
    <span class="press-tile-label">Rivalität · ${r.matches === 1 ? '1 Duell' : `${r.matches} Duelle`}</span>
    <span class="press-score-row">
      ${side(ta, r.winsA, r.winsA > r.winsB)}
      <span class="press-score-sep">:</span>
      ${side(tb, r.winsB, r.winsB > r.winsA)}
    </span>
    <figcaption class="press-tile-sub">${r.matches
      ? `Siege · ${r.draws ? `${r.draws} Remis · ` : ''}Kämpfe ${r.battlesA}:${r.battlesB} · Kills ${r.killsA}:${r.killsB}`
      : 'Noch kein direktes Duell'}</figcaption>
    ${duels ? `<ul class="press-rival-list"><li class="press-rival-head">Die heißesten Duelle</li>${duels}</ul>` : ''}
    ${stories ? `<ul class="press-rival-list"><li class="press-rival-head">Geschichten zwischen beiden</li>${stories}</ul>` : ''}
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
  'rivalität': rivalryTile,
  rivalitaet: rivalryTile,
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

// === Bausteine im Satz ======================================================
// Das Modell hält sich nicht zuverlässig an „ein Baustein steht allein im Absatz".
// Deshalb wird gesucht statt geprüft: jede Fundstelle im Text, mit Position.

const TILE_SCAN_RE = new RegExp(`\\[\\s*(${TILE_KINDS.join('|')})\\s*:\\s*([^\\[\\]]*?)\\s*\\]`, 'gi');

/**
 * Alle Bausteine in einem Text, in Leserichtung:
 * `[{ kind, key, start, end }]`. `start`/`end` sind Positionen im übergebenen Text.
 */
export function findTiles(text) {
  const input = String(text || '');
  const out = [];
  TILE_SCAN_RE.lastIndex = 0;
  let m;
  while ((m = TILE_SCAN_RE.exec(input))) {
    out.push({
      kind: m[1].toLowerCase(),
      key: m[2].trim(),
      start: m.index,
      end: m.index + m[0].length,
    });
    if (TILE_SCAN_RE.lastIndex === m.index) TILE_SCAN_RE.lastIndex++;
  }
  return out;
}

/**
 * Bausteine aus einem Text nehmen. Für Vorschautext, Lesedauer und Suche: dort ist
 * „[statistik: Glurak]" nur Rauschen.
 */
export function stripTiles(text) {
  return String(text ?? '').replace(TILE_SCAN_RE, '');
}

// === Freitext-Tabelle =======================================================
// `| Spalte | Spalte |` je Zeile, dazwischen optional `| --- | ---: |` als Trenner.
// Bewusst Text statt <table>: so übersteht die Tabelle den Sanitizer und bleibt im
// Editor eine Zeile, die man tippen und verschieben kann.

const PIPE_ROW_RE = /^\s*\|(.+)\|\s*$/;
const PIPE_SEP_CELL_RE = /^:?-{2,}:?$/;

/** `| a | b |` -> `['a', 'b']`, sonst null. Eine einzelne Spalte gilt nicht als Zeile. */
export function parsePipeRow(line) {
  const m = PIPE_ROW_RE.exec(String(line ?? '').replace(/ /g, ' '));
  if (!m) return null;
  const cells = m[1].split('|').map((c) => c.trim());
  return cells.length >= 2 ? cells : null;
}

/**
 * Zeilen -> `{ head, align, rows, width }`, oder null, wenn daraus keine Tabelle wird.
 * Ohne Trennerzeile ist die erste Zeile der Kopf — anders liest niemand eine Tabelle.
 */
export function parsePipeTable(lines) {
  const rows = [];
  for (const line of lines || []) {
    const cells = parsePipeRow(line);
    if (!cells) return null;
    rows.push(cells);
  }
  if (rows.length < 2) return null;
  const isSep = (cells) => cells.every((c) => PIPE_SEP_CELL_RE.test(c));
  if (isSep(rows[0])) return null;
  const head = rows[0];
  let body = rows.slice(1);
  let align = [];
  if (isSep(body[0])) {
    align = body[0].map((c) => {
      const left = c.startsWith(':');
      const right = c.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      return '';
    });
    body = body.slice(1);
  }
  if (!body.length) return null;
  const width = Math.max(head.length, ...body.map((r) => r.length));
  return { head, align, rows: body, width };
}

// In einer Tabellenzelle ist die Auszeichnung verloren (die Zeile ist Text) — `**fett**`
// gibt sie zurück. Mehr braucht eine Zelle nicht.
function cellHtml(text) {
  return esc(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/** Eine geparste Tabelle als HTML. */
export function pipeTableHtml(table) {
  if (!table) return null;
  const pad = (row) => Array.from({ length: table.width }, (_, i) => row[i] ?? '');
  const attr = (i) => (table.align[i] ? ` style="text-align:${table.align[i]}"` : '');
  const head = pad(table.head).map((c, i) => `<th${attr(i)}>${cellHtml(c)}</th>`).join('');
  const body = table.rows.map((row) => `<tr>${pad(row).map((c, i) => `<td${attr(i)}>${cellHtml(c)}</td>`).join('')}</tr>`).join('');
  return `<figure class="press-tile press-tile-grid">
    <div class="press-grid-scroll">
      <table class="press-grid">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </figure>`;
}

// === Anzeige ================================================================

const BLOCK_TAGS = new Set(['P', 'DIV', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'LI']);

function fragmentText(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html || '');
  return tpl.content.textContent || '';
}

// Die Zeilen eines Blocks — <br> trennt. null, sobald eine nicht leere Zeile keine
// Tabellenzeile ist: dann gehört der Block nicht zu einer Tabelle.
function pipeLinesOf(el) {
  if (!el || !BLOCK_TAGS.has(el.tagName)) return null;
  const parts = el.innerHTML.split(/<br\s*\/?>/i).map(fragmentText);
  const lines = parts.map((t) => t.trim()).filter(Boolean);
  if (!lines.length) return null;
  return lines.every((l) => parsePipeRow(l)) ? lines : null;
}

// Aufeinanderfolgende Blöcke aus Tabellenzeilen zu einer Tabelle zusammenfassen.
function renderPipeTables(root) {
  const nodes = [...root.children];
  let i = 0;
  while (i < nodes.length) {
    const lines = pipeLinesOf(nodes[i]);
    if (!lines) { i++; continue; }
    const group = [nodes[i]];
    const all = [...lines];
    let j = i + 1;
    while (j < nodes.length) {
      const more = pipeLinesOf(nodes[j]);
      if (!more) break;
      group.push(nodes[j]);
      all.push(...more);
      j++;
    }
    const markup = pipeTableHtml(parsePipeTable(all));
    if (markup) {
      const holder = document.createElement('template');
      holder.innerHTML = markup;
      group[0].replaceWith(holder.content);
      group.slice(1).forEach((n) => n.remove());
    }
    i = j;
  }
}

// Textknoten eines Elements mit ihrer Position im Gesamttext — die Brücke zwischen
// „Fundstelle im textContent" und „Stelle im DOM".
function textSpans(el) {
  const out = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let node;
  while ((node = walker.nextNode())) {
    const len = node.nodeValue.length;
    out.push({ node, start: pos, end: pos + len });
    pos += len;
  }
  return out;
}

// Alles ab `index` aus dem Element herausnehmen. Der Rest bleibt als `el` stehen,
// die Positionen davor bleiben damit gültig — deshalb wird von hinten nach vorn
// aufgeteilt.
function cutFrom(el, index) {
  const range = document.createRange();
  const at = textSpans(el).find((s) => index >= s.start && index < s.end);
  if (at) range.setStart(at.node, index - at.start);
  else range.setStart(el, el.childNodes.length);
  range.setEnd(el, el.childNodes.length);
  return range.extractContents();
}

// Ein Stück Text aus dem Element nehmen, ohne es aufzuteilen — der Weg für einen
// Baustein, der sich nicht auflösen lässt.
function removeRange(el, from, to) {
  const spans = textSpans(el);
  const a = spans.find((s) => from >= s.start && from < s.end);
  const b = spans.find((s) => to > s.start && to <= s.end);
  if (!a || !b) return;
  const range = document.createRange();
  range.setStart(a.node, from - a.start);
  range.setEnd(b.node, to - b.start);
  range.deleteContents();
}

// Was nach dem Herausschneiden zurückbleibt: ein leerer Textknoten (den lässt
// extractContents stehen) und der Zeilentrenner, auf dem der Baustein saß.
function trimTrailing(el) {
  while (el.lastChild) {
    const last = el.lastChild;
    if (last.nodeType === 3 && !last.nodeValue.trim()) last.remove();
    else if (last.nodeName === 'BR') last.remove();
    else break;
  }
}

function hasSubstance(node) {
  if (!node) return false;
  if ((node.textContent || '').trim()) return true;
  return !!(node.querySelector && node.querySelector('img, iframe, svg'));
}

/**
 * Bausteine eines Blocks auflösen — auch mitten im Satz. Der Block wird an der
 * Fundstelle aufgetrennt: Text davor bleibt, die Kachel kommt dahinter, der Rest in
 * einen neuen Block derselben Sorte. Ein Baustein, dessen Schlüssel ins Leere zeigt,
 * verschwindet aus dem Text — die rohe Klammer im Fließtext war der eigentliche Fehler.
 */
function resolveBlock(el, src) {
  const found = findTiles(el.textContent || '');
  if (!found.length) return;
  // Ein Listenpunkt wird NICHT aufgeteilt — sonst bekäme jede Hälfte ihren eigenen
  // Aufzählungspunkt. Dort verschwindet die Klammer aus dem Satz und die Kachel
  // hängt sich hinten an den Punkt.
  if (el.tagName === 'LI') {
    const stack = [];
    for (let i = found.length - 1; i >= 0; i--) {
      const markup = tileHtml(found[i], src);
      removeRange(el, found[i].start, found[i].end);
      if (markup) stack.unshift(markup);
    }
    stack.forEach((markup) => {
      const holder = document.createElement('template');
      holder.innerHTML = markup;
      el.appendChild(holder.content);
    });
    return;
  }
  for (let i = found.length - 1; i >= 0; i--) {
    const tile = found[i];
    const markup = tileHtml(tile, src);
    // Zeigt der Schlüssel ins Leere, bleibt der Absatz, wie er ist — nur die rohe
    // Klammer verschwindet. Aufteilen wäre hier ein Absatzbruch ohne Grund.
    if (!markup) {
      removeRange(el, tile.start, tile.end);
      continue;
    }
    const tail = cutFrom(el, tile.end);
    cutFrom(el, tile.start);
    trimTrailing(el);
    const frag = document.createDocumentFragment();
    const holder = document.createElement('template');
    holder.innerHTML = markup;
    frag.appendChild(holder.content);
    if (hasSubstance(tail)) {
      const rest = el.cloneNode(false);
      rest.appendChild(tail);
      frag.appendChild(rest);
    }
    el.after(frag);
  }
  if (!hasSubstance(el)) el.remove();
}

/**
 * Den Textkörper eines Beitrags für die Anzeige aufbereiten: Freitext-Tabellen werden
 * gesetzt, Bausteine aufgelöst — egal, ob sie allein im Absatz oder mitten im Satz
 * stehen. Alles andere bleibt unangetastet.
 * Erwartet und liefert HTML; ohne DOM (Node) kommt die Eingabe unverändert zurück.
 */
export function renderTiles(html, src = {}) {
  const input = String(html || '');
  if (!input || typeof document === 'undefined') return input;
  const tpl = document.createElement('template');
  tpl.innerHTML = input;
  renderPipeTables(tpl.content);
  // Nur der innerste Block wird aufgeteilt: Der textContent eines Elternblocks enthält
  // auch den Text seiner Kinder, die Fundstellen zeigten dort auf die falsche Stelle.
  const blocks = [...tpl.content.querySelectorAll('p, div, h2, h3, h4, blockquote, li')]
    .filter((el) => !el.closest('.press-tile') && !el.querySelector('p, div, h2, h3, h4, blockquote, li, ul, ol'));
  blocks.forEach((el) => {
    if (!tpl.content.contains(el)) return;
    resolveBlock(el, src);
  });
  return tpl.innerHTML;
}
