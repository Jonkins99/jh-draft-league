// Der Trainermarkt: jeder Trainer, der je an einer Seitenlinie stand oder im Pool
// angelegt wurde — saisonübergreifend, framework-frei und unter Node testbar.
//
// Trainer haben keine eigene Collection. Amtszeiten stehen weiterhin am Team-Dokument
// (`teams/<id>.trainers`); der Markt setzt sie über alle Vereine und Saisons zu einer
// Person zusammen. Wer noch nie im Amt war, liegt im Pool (`drafts/trainerpool`) —
// dort entstehen neue Trainer, bevor ein Verein sie verpflichtet.
//
// Eine Person ist ein NAME (`trainerKey`): Im Startdatensatz und in der Oberfläche
// entsteht je Amtszeit ein neuer Eintrag mit eigener ID, der Name ist das, was gleich
// bleibt.

import { battleStats } from './scoring.mjs';
import { franchiseSlug, franchiseTeams, seasonOfId, seasonOfTeam } from './seasons.mjs';
import { franchiseTrainerHistory, normalizeGender, parseTraits } from './trainers.mjs';

export function trainerKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Ein Pool-Eintrag im Speicherformat. Die ID ist der Namensschlüssel — zwei Einträge
// gleichen Namens wären dieselbe Person.
export function normalizePoolTrainer(raw) {
  const name = String(raw?.name || '').replace(/\s+/g, ' ').trim();
  return {
    id: trainerKey(name),
    name,
    image: String(raw?.image || '').trim(),
    gender: normalizeGender(raw?.gender),
    traits: parseTraits(raw?.traits),
  };
}

// Liegt ein Ergebnis in einer Amtszeit? Grenzen sind (Saison, Spieltag); „vor der
// Saison" zählt als Spieltag 0, ein offenes Ende als unbegrenzt.
function inStint(stint, season, day) {
  const d = Number(day) || 0;
  if (season < stint.from.season || season > stint.until.season) return false;
  if (season === stint.from.season && d < (stint.from.day ?? 0)) return false;
  if (season === stint.until.season && !stint.until.open && d > stint.until.day) return false;
  return true;
}

function blankStats() {
  return { matches: 0, won: 0, draw: 0, lost: 0, battles: 0, battlesWon: 0, battlesDraw: 0, battlesLost: 0, kills: 0, deaths: 0 };
}

function addStats(into, from) {
  Object.keys(into).forEach((k) => { into[k] += from[k] || 0; });
  return into;
}

function finishStats(s) {
  return {
    ...s,
    points: s.battlesWon,
    diff: s.kills - s.deaths,
    pointsPerMatch: s.matches ? s.battlesWon / s.matches : null,
    battleWinRate: s.battles ? s.battlesWon / s.battles : null,
  };
}

// Was hat ein Verein in dieser Amtszeit geleistet? Gezählt wird jedes Ergebnis des
// Franchise innerhalb der Grenzen, nur fertige Kämpfe.
function stintStats(stint, slug, results) {
  const s = blankStats();
  (results || []).forEach((r) => {
    if (!r) return;
    const side = franchiseSlug(r.home) === slug ? 'home' : franchiseSlug(r.away) === slug ? 'away' : null;
    if (!side || !inStint(stint, seasonOfId(r.id), r.day)) return;
    const opp = side === 'home' ? 'away' : 'home';
    let own = 0;
    let other = 0;
    let done = 0;
    (r.battles || []).forEach((b) => {
      if (!b?.done) return;
      const st = battleStats(b);
      done += 1;
      own += st[`${side}Points`];
      other += st[`${opp}Points`];
      s.kills += st[`${side}Kills`];
      s.deaths += st[`${side}Deaths`];
      if (st.winner === side) s.battlesWon += 1;
      else if (st.winner === opp) s.battlesLost += 1;
      else s.battlesDraw += 1;
    });
    if (!done) return;
    s.battles += done;
    s.matches += 1;
    if (own > other) s.won += 1;
    else if (own < other) s.lost += 1;
    else s.draw += 1;
  });
  return finishStats(s);
}

/**
 * Das Verzeichnis aller Trainer.
 * @param {object} o
 * @param {Array}  o.teams    alle Teams aller Saisons
 * @param {Array}  o.results  alle Ergebnisse aller Saisons
 * @param {object} o.pool     { <key>: { name, image, gender, traits, createdAt, createdBy } }
 * @returns {Array<{ key, name, image, gender, traits, inPool, office, stints, totals, seasons, lastSeen }>}
 *   office  — { teamId, teamName, logo, since } beim amtierenden Verein der jüngsten Saison, sonst null
 *   stints  — Amtszeiten, jüngste zuerst, je mit Verein und Zahlen
 */
export function trainerDirectory({ teams = [], results = [], pool = {} } = {}) {
  const latestSeason = Math.max(1, ...(teams || []).map(seasonOfTeam).filter(Number.isFinite));
  const slugs = [...new Set((teams || []).map((t) => franchiseSlug(t.id)))];
  const byKey = {};
  const person = (name) => {
    const key = trainerKey(name);
    if (!key) return null;
    return byKey[key] || (byKey[key] = {
      key, name, image: '', gender: '', traits: [], inPool: false, office: null, stints: [], seasons: new Set(), lastSeen: null,
    });
  };

  slugs.forEach((slug) => {
    const chain = franchiseTeams(teams, slug);
    const latest = chain[chain.length - 1];
    const history = franchiseTrainerHistory(chain.map((t) => ({ season: seasonOfTeam(t), trainers: t.trainers || [] })));
    history.forEach((h) => {
      const p = person(h.name);
      if (!p) return;
      const teamAt = chain.find((t) => seasonOfTeam(t) === h.until.season) || latest;
      const stats = stintStats(h, slug, results);
      // Im Amt ist nur, wer bei einem Verein der JÜNGSTEN Saison noch amtiert — ein
      // offenes Amt bei einem abgestiegenen Verein endet mit dessen letzter Saison.
      const active = h.until.open && h.until.season === latestSeason && seasonOfTeam(latest) === latestSeason;
      p.stints.push({
        id: h.id,
        slug,
        teamId: teamAt?.id || null,
        teamName: teamAt?.name || slug,
        logo: teamAt?.logo || '',
        from: h.from,
        until: h.until,
        active,
        period: active ? h.period : h.period.replace(/ – heute$/, ' – Saisonende'),
        stats,
      });
      h.seasons.forEach((s) => p.seasons.add(s));
      // Das Bild und die Eigenschaften der jüngsten Amtszeit gelten.
      const rank = h.until.season * 1000 + (h.until.open ? 999 : h.until.day || 0);
      if (p.lastSeen == null || rank >= p.lastSeen) {
        p.lastSeen = rank;
        if (h.image) p.image = h.image;
        if (h.traits?.length) p.traits = h.traits;
        if (h.gender) p.gender = h.gender;
      }
      if (active) p.office = { teamId: latest.id, teamName: latest.name, logo: latest.logo || '', since: h.from };
    });
  });

  Object.entries(pool || {}).forEach(([id, raw]) => {
    const p = person(raw?.name || id);
    if (!p) return;
    p.inPool = true;
    p.poolId = id;
    p.createdAt = raw?.createdAt || null;
    // Was im Pool gepflegt ist, ergänzt — es überschreibt keine Angabe aus einem Amt.
    if (!p.image && raw?.image) p.image = raw.image;
    if (!p.traits.length && raw?.traits?.length) p.traits = parseTraits(raw.traits);
    if (!p.gender && raw?.gender) p.gender = normalizeGender(raw.gender);
  });

  return Object.values(byKey).map((p) => {
    const stints = p.stints.sort((a, b) => (b.until.season - a.until.season) || ((b.until.open ? 999 : b.until.day || 0) - (a.until.open ? 999 : a.until.day || 0)));
    const totals = finishStats(stints.reduce((acc, s) => addStats(acc, s.stats), blankStats()));
    return {
      ...p,
      gender: p.gender || 'd',
      stints,
      totals,
      clubs: [...new Set(stints.map((s) => s.slug))].length,
      seasons: [...p.seasons].sort((a, b) => a - b),
    };
  }).sort((a, b) => (!!b.office - !!a.office) || b.totals.matches - a.totals.matches || a.name.localeCompare(b.name));
}
