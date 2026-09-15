// Saison-Abschluss: die Ruhmeshalle der JH Draft League.
// Framework-frei (nur DOM + Web Animations), damit sie sich wie die Siegerehrung
// überall gleich abspielen und unter Node auf ihre Datenaufbereitung testen lässt.
//
// Zwei Teile:
//   buildFinaleScript(...)  — aus dem Liga-Zustand wird ein Drehbuch aus Szenen
//   runFinale(root, script) — spielt das Drehbuch ab (Play/Pause, vor, zurück)
//
// Dramaturgie: von unten nach oben durch die Tabelle. Je weiter oben, desto länger
// und aufwendiger die Szene — die Top 3 bekommen ihren kompletten Kader zu sehen,
// der Meister zusätzlich eine eigene Parade und die Pokal-Szene.

import { computeStandings, placementHistory, pokemonStats, battleStats } from './scoring.mjs';
import { currentTrainer, trainerHistory, periodLabel } from './trainers.mjs';
import { AWARD_BY_KEY, awardWinners } from './awards.mjs';

const GOLD = '#ffcb05';

// Szenenlängen in Millisekunden. Bewusst großzügig — die Animation darf dauern.
export const SCENE_MS = {
  intro: 7000,
  rest: 10500,
  third: 17000,
  second: 18500,
  champion: 34000,
  trophy: 14000,
  outro: 13000,
};

// Der Pokal — bewusst als eigene Grafik, damit die Szene ohne Bilddatei auskommt.
const TROPHY_SVG = `<svg viewBox="0 0 120 150" class="fin-trophy-svg" aria-hidden="true">
  <defs>
    <linearGradient id="fin-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff3cc"/>
      <stop offset="0.45" stop-color="#ffcb05"/>
      <stop offset="1" stop-color="#a8791a"/>
    </linearGradient>
    <linearGradient id="fin-gold-soft" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe89a"/>
      <stop offset="1" stop-color="#c9a227"/>
    </linearGradient>
  </defs>
  <path d="M30 14h60v30a30 30 0 0 1-60 0z" fill="url(#fin-gold)"/>
  <path d="M30 20H18a16 16 0 0 0 16 24z" fill="url(#fin-gold-soft)"/>
  <path d="M90 20h12a16 16 0 0 1-16 24z" fill="url(#fin-gold-soft)"/>
  <rect x="54" y="74" width="12" height="24" rx="2" fill="url(#fin-gold-soft)"/>
  <path d="M38 98h44l6 16H32z" fill="url(#fin-gold)"/>
  <rect x="26" y="114" width="68" height="14" rx="3" fill="url(#fin-gold-soft)"/>
  <circle cx="60" cy="36" r="11" fill="none" stroke="#7a5a10" stroke-width="2.5" opacity="0.5"/>
  <path d="M60 28l2.6 5.6 6 .8-4.4 4.3 1.1 6.1-5.3-2.9-5.3 2.9 1.1-6.1-4.4-4.3 6-.8z" fill="#7a5a10" opacity="0.55"/>
</svg>`;

export function reduceMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function signed(n) {
  const v = Number(n) || 0;
  return v > 0 ? `+${v}` : String(v);
}

// === Drehbuch ==============================================================

// Der Weg eines Teams durch die Tabelle, plus bester und schlechtester Platz.
function pathOf(teamId, history) {
  const points = (history.series?.[teamId] || []).map((p) => ({ day: p.day, place: p.place }));
  const places = points.map((p) => p.place);
  return {
    points,
    best: places.length ? Math.min(...places) : null,
    worst: places.length ? Math.max(...places) : null,
    start: places.length ? places[0] : null,
    end: places.length ? places[places.length - 1] : null,
  };
}

// Alle Partien eines Teams in Spieltagsreihenfolge, mit Ausgang aus seiner Sicht.
function matchesOf(teamId, results, teamById) {
  return (results || [])
    .filter((r) => (r.home === teamId || r.away === teamId) && (r.battles || []).some((b) => b && b.done))
    .sort((a, b) => (a.day || 0) - (b.day || 0))
    .map((r) => {
      const side = r.home === teamId ? 'home' : 'away';
      const opp = teamById[side === 'home' ? r.away : r.home] || null;
      let own = 0;
      let other = 0;
      let kills = 0;
      let deaths = 0;
      (r.battles || []).forEach((b) => {
        if (!b || !b.done) return;
        const s = battleStats(b);
        if (s.winner === side) own += 1;
        else if (s.winner !== 'draw') other += 1;
        kills += side === 'home' ? s.homeKills : s.awayKills;
        deaths += side === 'home' ? s.homeDeaths : s.awayDeaths;
      });
      return {
        day: r.day ?? null,
        opponent: opp?.name || '?',
        opponentLogo: opp?.logo || null,
        home: side === 'home',
        score: `${own}:${other}`,
        outcome: own > other ? 'sieg' : other > own ? 'niederlage' : 'remis',
        kills,
        deaths,
        diff: kills - deaths,
      };
    });
}

// Kader eines Teams, nach Wirkung sortiert. Die Statistik ist ergebnisgetrieben —
// deshalb wird sie auf das Team eingegrenzt (Wintertransfer!).
function rosterOf(team, results, pokedex) {
  const stats = pokemonStats([team], results, pokedex, { scopeTeamId: team.id });
  const byName = Object.fromEntries(stats.map((s) => [s.pokemon?.name, s]));
  return (team.pokemon || []).map((p) => {
    const st = byName[p.name] || {};
    return {
      name: p.name,
      image: p.image || null,
      tier: p.tier || null,
      types: p.types || [],
      kills: st.kills || 0,
      deaths: st.deaths || 0,
      battles: st.battles || 0,
      matchups: st.matchups || 0,
      diff: (st.kills || 0) - (st.deaths || 0),
    };
  }).sort((a, b) => b.kills - a.kills || b.diff - a.diff || a.name.localeCompare(b.name));
}

function trainerOf(team) {
  const cur = currentTrainer(team?.trainers || []);
  const history = trainerHistory(team?.trainers || []);
  if (!cur && !history.length) return null;
  const t = cur || history[0];
  return {
    name: t.name,
    image: t.image || null,
    traits: t.traits || [],
    period: periodLabel(t),
    current: !!cur,
    changes: Math.max(0, history.length - 1),
  };
}

// Auszeichnungen, die auf dieses Team oder eines seiner Pokémon zeigen.
function awardsOf(team, awardDocs) {
  const roster = new Set((team.pokemon || []).map((p) => p.name));
  const out = [];
  (awardDocs || []).forEach((raw) => {
    if (!raw || raw.status !== 'done') return;
    const key = String(raw.id || '')
      .replace(/^s1-/, '')
      .replace(/-d\d+$/, '')
      .replace(new RegExp(`-${team.id}$`), '');
    const def = AWARD_BY_KEY[key];
    if (!def) return;
    const day = /-d(\d+)$/.exec(raw.id || '')?.[1];
    awardWinners(raw).forEach((w) => {
      const id = String(w.id || '');
      const hit = def.entity === 'team'
        ? id === team.id
        : id.split(' + ').some((n) => roster.has(n.trim()));
      if (!hit) return;
      out.push({ key, label: def.label, winner: w.label || id, day: day ? Number(day) : null });
    });
  });
  return out;
}

/**
 * Baut das Drehbuch. `src` = { teams, results, schedule, pokedex, awardDocs }.
 * Rückgabe: { complete, scenes: [...], season: {...} }
 */
export function buildFinaleScript(src = {}) {
  const season = Number.isFinite(src.season) ? src.season : 1;
  const seasonTeams = (src.teams || []).filter((t) => (Number.isFinite(t.season) ? t.season : 1) === season);
  const results = src.results || [];
  const teamById = Object.fromEntries(seasonTeams.map((t) => [t.id, t]));
  const table = computeStandings(seasonTeams, results);
  const history = placementHistory(seasonTeams, results);

  const planned = (src.schedule?.matchdays || []).reduce((n, md) => n + (md.matches || []).length, 0);
  const played = results.filter((r) => (r.battles || []).some((b) => b && b.done)).length;
  const complete = planned > 0 && results.filter((r) => (r.battles || []).filter((b) => b && b.done).length >= 3).length >= planned;

  const totals = table.reduce(
    (acc, r) => ({ kills: acc.kills + r.kills, points: acc.points + r.points, matches: acc.matches + r.played }),
    { kills: 0, points: 0, matches: 0 },
  );
  const byPlayer = (player) => table.filter((r) => r.team.player === player);
  const playerSum = (player) => byPlayer(player).reduce(
    (acc, r) => ({
      punkte: acc.punkte + r.points,
      kills: acc.kills + r.kills,
      deaths: acc.deaths + r.deaths,
      bestePlatzierung: Math.min(acc.bestePlatzierung, table.indexOf(r) + 1),
    }),
    { punkte: 0, kills: 0, deaths: 0, bestePlatzierung: 99 },
  );

  const allMons = pokemonStats(seasonTeams, results, src.pokedex || []);
  const topScorer = [...allMons].sort((a, b) => b.kills - a.kills)[0] || null;
  const topSurvivor = [...allMons]
    .filter((m) => m.battles >= 3)
    .sort((a, b) => b.survivalRate - a.survivalRate || b.battles - a.battles)[0] || null;

  const scenes = [];
  scenes.push({
    kind: 'intro',
    title: 'Ruhmeshalle',
    subtitle: `Saison ${season} der JH Draft League`,
    facts: [
      { label: 'Teams', value: String(seasonTeams.length) },
      { label: 'Spieltage', value: String(new Set((src.schedule?.matchdays || []).map((m) => m.day)).size || 0) },
      { label: 'Partien', value: String(played) },
      { label: 'Kills', value: String(totals.kills) },
    ],
    ms: SCENE_MS.intro,
  });

  const last = table.length;
  [...table].reverse().forEach((row, i) => {
    const place = last - i;
    const team = row.team;
    const rank = place === 1 ? 'champion' : place === 2 ? 'second' : place === 3 ? 'third' : 'rest';
    const roster = rosterOf(team, results, src.pokedex || []);
    const matches = matchesOf(team.id, results, teamById);
    scenes.push({
      kind: place === 1 ? 'champion' : 'team',
      rank,
      place,
      team: { id: team.id, name: team.name, player: team.player, logo: team.logo },
      record: {
        played: row.played,
        won: row.won,
        draw: row.draw,
        lost: row.lost,
        points: row.points,
        kills: row.kills,
        deaths: row.deaths,
        diff: row.diff,
      },
      path: pathOf(team.id, history),
      matches,
      // Die Top 3 zeigen den kompletten Kader, alle anderen ihre wichtigsten Pokémon.
      roster: place <= 3 ? roster : roster.slice(0, 4),
      rosterFull: place <= 3,
      trainer: trainerOf(team),
      awards: awardsOf(team, src.awardDocs || []),
      best: matches.filter((m) => m.outcome === 'sieg').sort((a, b) => b.diff - a.diff)[0] || null,
      ms: SCENE_MS[rank] ?? SCENE_MS.rest,
    });
  });

  const champ = table[0];
  if (champ) {
    scenes.push({
      kind: 'trophy',
      season,
      team: { id: champ.team.id, name: champ.team.name, player: champ.team.player, logo: champ.team.logo },
      points: champ.points,
      record: `${champ.won} Siege · ${champ.draw} Unentschieden · ${champ.lost} Niederlagen`,
      kills: champ.kills,
      diff: champ.diff,
      trainer: trainerOf(champ.team),
      ms: SCENE_MS.trophy,
    });
  }

  scenes.push({
    kind: 'outro',
    season,
    title: 'Und am Ende zählt nur eins',
    duel: { Janik: playerSum('Janik'), Henrik: playerSum('Henrik') },
    leaders: [
      topScorer ? { label: 'Meiste Kills', name: topScorer.pokemon?.name, image: topScorer.pokemon?.image, value: `${topScorer.kills}` } : null,
      topSurvivor ? { label: 'Höchste Überlebensrate', name: topSurvivor.pokemon?.name, image: topSurvivor.pokemon?.image, value: `${Math.round((topSurvivor.survivalRate || 0) * 100)} %` } : null,
      table[0] ? { label: 'Meister', name: table[0].team.name, image: null, value: `${table[0].points} Punkte` } : null,
    ].filter(Boolean),
    ms: SCENE_MS.outro,
  });

  return {
    complete,
    planned,
    played,
    champion: table[0]?.team || null,
    totalMs: scenes.reduce((n, s) => n + s.ms, 0),
    scenes,
  };
}

// === Darstellung ===========================================================

// Verlaufskurve der Tabellenplätze. Platz 1 liegt oben; die Linie wird beim
// Abspielen von links nach rechts gezeichnet.
function pathSvg(path, teamsCount) {
  const pts = path?.points || [];
  if (pts.length < 2) return '';
  const w = 100;
  const h = 34;
  const n = pts.length;
  const x = (i) => (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (place) => {
    const span = Math.max(1, teamsCount - 1);
    return 2 + ((place - 1) / span) * (h - 4);
  };
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(p.place).toFixed(2)}`).join(' ');
  const dots = pts
    .map((p, i) => `<circle cx="${x(i).toFixed(2)}" cy="${y(p.place).toFixed(2)}" r="1.5" fill="${GOLD}" opacity="0.85"/>`)
    .join('');
  return `<svg class="fin-path" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path class="fin-path-line" d="${d}" fill="none" stroke="${GOLD}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

function monHtml(mon, { big = false } = {}) {
  const img = mon.image
    ? `<img src="${esc(mon.image)}" alt="" loading="lazy" class="${big ? 'size-24' : 'size-16'} object-contain" />`
    : `<span class="grid ${big ? 'size-24' : 'size-16'} place-items-center text-xs text-mist">—</span>`;
  return `<div class="fin-mon" data-mon="${esc(mon.name)}" role="link" tabindex="0" title="${esc(mon.name)} öffnen">
    ${mon.tier ? `<span class="fin-tier">${esc(mon.tier)}</span>` : ''}
    ${img}
    <p class="fin-mon-name">${esc(mon.name)}</p>
    <p class="fin-mon-stat"><b>${mon.kills}</b> K · ${mon.deaths} D</p>
  </div>`;
}

function trainerHtml(trainer, big = false) {
  if (!trainer) return '';
  const img = trainer.image
    ? `<img src="${esc(trainer.image)}" alt="" loading="lazy" class="${big ? 'size-28' : 'size-16'} rounded-2xl object-cover" />`
    : `<span class="grid ${big ? 'size-28' : 'size-16'} place-items-center rounded-2xl bg-elevated text-mist">
        <svg viewBox="0 0 24 24" class="size-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>
      </span>`;
  return `<div class="fin-trainer">
    ${img}
    <div class="min-w-0">
      <p class="fin-label">Trainer</p>
      <p class="fin-trainer-name">${esc(trainer.name)}</p>
      <p class="fin-sub">${esc(trainer.period)}${trainer.changes ? ` · ${trainer.changes} Wechsel` : ''}</p>
      ${trainer.traits.length ? `<p class="fin-traits">${trainer.traits.map((t) => `<span>${esc(t)}</span>`).join('')}</p>` : ''}
    </div>
  </div>`;
}

function recordHtml(record) {
  return `<div class="fin-record">
    ${[
      ['Punkte', record.points],
      ['Bilanz', `${record.won}·${record.draw}·${record.lost}`],
      ['Kills', record.kills],
      ['Deaths', record.deaths],
      ['Differenz', signed(record.diff)],
    ].map(([l, v]) => `<span><b>${esc(v)}</b><i>${esc(l)}</i></span>`).join('')}
  </div>`;
}

function matchesHtml(matches, limit) {
  const rows = (matches || []).slice(0, limit);
  if (!rows.length) return '';
  return `<div class="fin-matches">${rows.map((m) => `
    <span class="fin-match" data-outcome="${m.outcome}">
      <i>ST ${m.day ?? '?'}</i>
      <b>${esc(m.score)}</b>
      <em>${m.home ? 'gg.' : 'bei'} ${esc(m.opponent)}</em>
    </span>`).join('')}</div>`;
}

function sceneHtml(scene, ctx) {
  if (scene.kind === 'intro') {
    return `<div class="fin-scene fin-scene--intro">
      <p class="fin-kicker">${esc(scene.subtitle)}</p>
      <h2 class="fin-title">${esc(scene.title)}</h2>
      <p class="fin-lead">Wir gehen die Tabelle von unten nach oben durch. Am Ende steht der Meister.</p>
      <div class="fin-facts">${scene.facts.map((f) => `<span><b>${esc(f.value)}</b><i>${esc(f.label)}</i></span>`).join('')}</div>
    </div>`;
  }

  if (scene.kind === 'trophy') {
    return `<div class="fin-scene fin-scene--trophy">
      <p class="fin-kicker">Meister der Saison ${esc(scene.season)}</p>
      <div class="fin-trophy">${TROPHY_SVG}</div>
      <h2 class="fin-title">${esc(scene.team.name)}</h2>
      <p class="fin-champ-player" data-player="${esc(scene.team.player)}">${esc(scene.team.player)}</p>
      <div class="fin-facts">
        <span><b>${scene.points}</b><i>Punkte</i></span>
        <span><b>${scene.kills}</b><i>Kills</i></span>
        <span><b>${signed(scene.diff)}</b><i>Differenz</i></span>
      </div>
      <p class="fin-lead">${esc(scene.record)}${scene.trainer ? ` · Trainer ${esc(scene.trainer.name)}` : ''}</p>
    </div>`;
  }

  if (scene.kind === 'outro') {
    const d = scene.duel;
    const lead = d.Janik.punkte === d.Henrik.punkte
      ? 'Gleichstand im Spielerduell.'
      : `${d.Janik.punkte > d.Henrik.punkte ? 'Janik' : 'Henrik'} gewinnt das Spielerduell.`;
    return `<div class="fin-scene fin-scene--outro">
      <h2 class="fin-title">${esc(scene.title)}</h2>
      <div class="fin-duel">
        ${['Janik', 'Henrik'].map((p) => `
          <div class="fin-duel-side" data-player="${p}">
            <p class="fin-duel-name">${p}</p>
            <p class="fin-duel-points">${d[p].punkte}</p>
            <p class="fin-sub">Punkte · ${d[p].kills} Kills · beste Platzierung ${d[p].bestePlatzierung}</p>
          </div>`).join('<span class="fin-duel-vs">vs</span>')}
      </div>
      <p class="fin-lead">${esc(lead)}</p>
      <div class="fin-leaders">${scene.leaders.map((l) => `
        <span class="fin-leader">
          ${l.image ? `<img src="${esc(l.image)}" alt="" loading="lazy" class="size-14 object-contain" />` : ''}
          <i>${esc(l.label)}</i>
          <b>${esc(l.name)}</b>
          <em>${esc(l.value)}</em>
        </span>`).join('')}</div>
      <p class="fin-outro-end">Saison ${esc(scene.season)} · Ende</p>
    </div>`;
  }

  const champion = scene.kind === 'champion';
  const logo = scene.team.logo ? `<img src="${ctx.logoBase}${esc(scene.team.logo)}" alt="" class="fin-logo" />` : '';
  const placeLabel = champion ? 'Meister' : `Platz ${scene.place}`;

  return `<div class="fin-scene fin-scene--team" data-rank="${scene.rank}">
    <header class="fin-head">
      <span class="fin-place">${champion ? '★' : scene.place}</span>
      ${logo}
      <div class="min-w-0">
        <p class="fin-kicker">${esc(placeLabel)}</p>
        <h2 class="fin-team">${esc(scene.team.name)}</h2>
        <p class="fin-sub" data-player="${esc(scene.team.player)}">${esc(scene.team.player)}</p>
      </div>
    </header>

    ${recordHtml(scene.record)}

    <div class="fin-cols">
      <div class="fin-col">
        <p class="fin-label">Weg durch die Saison</p>
        ${pathSvg(scene.path, ctx.teamsCount) || '<p class="fin-sub">Kein Verlauf vorhanden.</p>'}
        <p class="fin-sub">${scene.path.best ? `Bester Stand: Platz ${scene.path.best} · schlechtester: Platz ${scene.path.worst}` : ''}</p>
        ${matchesHtml(scene.matches, champion ? 14 : 7)}
      </div>
      <div class="fin-col">
        ${trainerHtml(scene.trainer, champion)}
        ${scene.awards.length ? `<div class="fin-awards"><p class="fin-label">Auszeichnungen</p>
          ${scene.awards.slice(0, 6).map((a) => `<span class="fin-award">${esc(a.label)}${a.day ? ` · ST ${a.day}` : ''} — ${esc(a.winner)}</span>`).join('')}
        </div>` : ''}
      </div>
    </div>

    <p class="fin-label fin-roster-label">${scene.rosterFull ? 'Der komplette Kader' : 'Die wichtigsten Pokémon'}</p>
    <div class="fin-roster" data-count="${scene.roster.length}">
      ${scene.roster.map((m, i) => monHtml(m, { big: champion && i < 3 })).join('')}
    </div>
  </div>`;
}

// === Abspielen =============================================================

/**
 * @param {HTMLElement} root  Wurzel (z. B. ein Popover)
 * @param {object} script     Ergebnis von buildFinaleScript
 * @param {object} opts       { logoBase, teamsCount, onClose, onPickMon }
 */
export function runFinale(root, script, opts = {}) {
  const scenes = script.scenes || [];
  const ctx = { logoBase: opts.logoBase || './img/teams/', teamsCount: opts.teamsCount || 8 };
  const slow = reduceMotion() ? 0.35 : 1;

  let index = 0;
  let paused = false;
  let timer = null;
  let sceneStart = 0;
  let remaining = 0;
  let stopped = false;

  root.innerHTML = `<div class="fin-stage" data-flare="none">
    <span class="fin-bg"></span>
    <div class="fin-viewport" data-fin="viewport"></div>

    <div class="fin-bar">
      <div class="fin-progress"><span data-fin="progress"></span></div>
      <div class="fin-controls">
        <button type="button" data-fin="prev" aria-label="Vorherige Szene">
          <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button type="button" data-fin="play" aria-label="Pause">
          <svg data-fin="icon-pause" viewBox="0 0 24 24" class="size-4" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          <svg data-fin="icon-play" viewBox="0 0 24 24" class="size-4" fill="currentColor" style="display:none"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button type="button" data-fin="next" aria-label="Nächste Szene">
          <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
        </button>
        <span class="fin-counter" data-fin="counter"></span>
        <button type="button" data-fin="close" class="fin-close">Beenden</button>
      </div>
    </div>
  </div>`;

  const stage = root.querySelector('.fin-stage');
  const viewport = root.querySelector('[data-fin="viewport"]');
  const progress = root.querySelector('[data-fin="progress"]');
  const counter = root.querySelector('[data-fin="counter"]');
  const playBtn = root.querySelector('[data-fin="play"]');
  const iconPause = root.querySelector('[data-fin="icon-pause"]');
  const iconPlay = root.querySelector('[data-fin="icon-play"]');

  let scrollRaf = null;
  const clear = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = null; }
  };

  // Ist eine Szene höher als die Bühne, wandert sie im Takt der Szene nach unten —
  // wie ein Abspann. Ohne das bliebe der untere Teil des Kaders ungesehen.
  function autoScroll(ms) {
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    viewport.scrollTop = 0;
    if (reduceMotion()) return;
    const max = viewport.scrollHeight - viewport.clientHeight;
    if (max <= 8) return;
    const delay = Math.min(1600, ms * 0.18);
    const span = Math.max(1200, ms - delay - 900);
    const t0 = performance.now();
    const step = (now) => {
      if (stopped || paused) { scrollRaf = null; return; }
      const t = Math.min(1, Math.max(0, (now - t0 - delay) / span));
      // Sanft anfahren und ausrollen, damit nichts ruckt.
      const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
      viewport.scrollTop = max * eased;
      scrollRaf = t < 1 ? requestAnimationFrame(step) : null;
    };
    scrollRaf = requestAnimationFrame(step);
  }

  const schedule = (ms) => {
    clear();
    remaining = ms;
    sceneStart = performance.now();
    timer = setTimeout(() => { if (!stopped) go(index + 1); }, ms);
  };

  // Goldregen zur Pokal-Szene — der einzige Moment, in dem die Ruhmeshalle laut wird.
  function goldRain(host) {
    if (reduceMotion() || !host || !host.animate) return;
    const layer = document.createElement('div');
    layer.className = 'fin-confetti';
    host.appendChild(layer);
    const w = host.clientWidth || 800;
    const h = host.clientHeight || 600;
    const frag = document.createDocumentFragment();
    const els = [];
    const colors = ['#fff3cc', '#ffcb05', '#c9a227', '#eef1f6'];
    for (let i = 0; i < (w < 520 ? 90 : 160); i++) {
      const el = document.createElement('i');
      el.style.background = colors[i % colors.length];
      el.style.left = `${Math.random() * 100}%`;
      el.style.top = '-6%';
      els.push(el);
      frag.appendChild(el);
    }
    layer.appendChild(frag);
    els.forEach((el) => {
      const drift = (Math.random() - 0.5) * w * 0.35;
      el.animate(
        [
          { transform: 'translate(0,0) rotate(0deg)', opacity: 0 },
          { transform: `translate(${drift * 0.4}px,${h * 0.35}px) rotate(${180 + Math.random() * 360}deg)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${drift}px,${h * 1.15}px) rotate(${540 + Math.random() * 720}deg)`, opacity: 0.9 },
        ],
        { duration: 3600 + Math.random() * 2600, delay: Math.random() * 2200, easing: 'cubic-bezier(0.3, 0.1, 0.5, 1)', fill: 'forwards' },
      );
    });
    setTimeout(() => layer.remove(), 8000);
  }

  function paint(scene) {
    viewport.innerHTML = sceneHtml(scene, ctx);
    // Lichtstrahlen und Goldschein liegen im Bühnenhintergrund, nicht in der Szene:
    // dort würden sie die Höhe des Scrollbereichs aufblähen.
    stage.dataset.flare = scene.kind === 'trophy' || scene.kind === 'champion' ? 'crown'
      : scene.kind === 'intro' || scene.kind === 'outro' ? 'rays'
      : 'none';
    const el = viewport.firstElementChild;
    if (!el) return;
    if (scene.kind === 'trophy') goldRain(stage);
    // Der Kader tritt gestaffelt auf — das ist der Ruhmeshallen-Moment.
    const mons = [...el.querySelectorAll('.fin-mon')];
    const step = Math.min(220, Math.max(90, (scene.ms * 0.45) / Math.max(1, mons.length))) * slow;
    mons.forEach((m, i) => { m.style.animationDelay = `${600 * slow + i * step}ms`; });
    const line = el.querySelector('.fin-path-line');
    if (line && line.getTotalLength) {
      const len = line.getTotalLength();
      line.style.strokeDasharray = String(len);
      line.style.strokeDashoffset = String(len);
      line.style.animation = `fin-draw ${1600 * slow}ms 500ms cubic-bezier(0.22,1,0.36,1) forwards`;
    }
  }

  function go(next) {
    if (stopped) return;
    if (next >= scenes.length) {
      clear();
      paused = true;
      syncPlay();
      index = scenes.length - 1;
      updateChrome();
      return;
    }
    index = Math.max(0, next);
    const scene = scenes[index];
    paint(scene);
    updateChrome();
    if (!paused) {
      const ms = Math.max(1800, scene.ms * slow);
      schedule(ms);
      runProgress(ms);
      requestAnimationFrame(() => autoScroll(ms));
    } else {
      progress.style.transition = 'none';
      progress.style.width = '0%';
    }
  }

  function runProgress(ms) {
    progress.style.transition = 'none';
    progress.style.width = '0%';
    // Erzwingt einen Reflow, sonst schluckt der Browser den Start der Transition.
    void progress.offsetWidth;
    progress.style.transition = `width ${ms}ms linear`;
    progress.style.width = '100%';
  }

  function updateChrome() {
    counter.textContent = `${index + 1} / ${scenes.length}`;
  }

  function syncPlay() {
    iconPause.style.display = paused ? 'none' : '';
    iconPlay.style.display = paused ? '' : 'none';
    playBtn.setAttribute('aria-label', paused ? 'Weiter' : 'Pause');
  }

  function togglePlay() {
    paused = !paused;
    syncPlay();
    if (paused) {
      clear();
      const done = performance.now() - sceneStart;
      remaining = Math.max(400, remaining - done);
      const pct = progress.getBoundingClientRect().width / Math.max(1, progress.parentElement.getBoundingClientRect().width);
      progress.style.transition = 'none';
      progress.style.width = `${Math.min(100, pct * 100)}%`;
    } else {
      schedule(remaining);
      progress.style.transition = `width ${remaining}ms linear`;
      progress.style.width = '100%';
    }
  }

  root.querySelector('[data-fin="prev"]').addEventListener('click', () => { paused = false; syncPlay(); go(index - 1); });
  root.querySelector('[data-fin="next"]').addEventListener('click', () => { paused = false; syncPlay(); go(index + 1); });
  playBtn.addEventListener('click', togglePlay);
  if (opts.onClose) root.querySelector('[data-fin="close"]').addEventListener('click', opts.onClose);

  if (opts.onPickMon) {
    const pick = (el) => { if (el?.dataset?.mon) opts.onPickMon(el.dataset.mon); };
    root.addEventListener('click', (e) => pick(e.target.closest('[data-mon]')));
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('[data-mon]');
      if (!el) return;
      e.preventDefault();
      pick(el);
    });
  }

  syncPlay();
  go(0);

  return {
    next: () => go(index + 1),
    prev: () => go(index - 1),
    toggle: togglePlay,
    stop() {
      stopped = true;
      clear();
    },
  };
}
