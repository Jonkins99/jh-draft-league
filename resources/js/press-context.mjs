// Metadaten-Aufbereitung für die Presse: aus dem Liga-Zustand wird ein kompaktes,
// selbsterklärendes JSON-Objekt, das als einzige Faktenquelle in den Prompt geht.
//
// Grundsatz: NUR hier wird interpretiert, was das Modell später erzählen darf. Alles,
// was nicht in diesem Objekt steht, gilt im Prompt als „nicht bekannt" — dadurch
// erfindet das Modell keine Ergebnisse, Namen oder Tabellenstände.
//
// Framework-frei: nur scoring/awards/trainers/press, kein Alpine, kein Firebase.

import { battleStats, computeStandings, pokemonStats } from './scoring.mjs';
import { AWARD_BY_KEY, awardWinners } from './awards.mjs';
import { currentTrainer, trainerHistory, periodLabel, genderLabel } from './trainers.mjs';
import { activeStorylines, authorById, categoryLabel, matchSequence, isMatchComplete, plainText } from './press.mjs';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pct = (n) => `${Math.round((Number(n) || 0) * 100)} %`;

function teamById(teams, id) {
  return (teams || []).find((t) => t.id === id) || null;
}

function eloFor(eloRows, name) {
  const row = (eloRows || []).find((r) => r?.resolved === name);
  return row ? { elo: row.elo, eloRang: row.rang, prognoseTier: row.projectedTier } : {};
}

// === Tabelle ===============================================================
export function standingsBlock(seasonTeams, results) {
  return computeStandings(seasonTeams, results).map((r, i) => ({
    platz: i + 1,
    team: r.team.name,
    teamId: r.team.id,
    spieler: r.team.player,
    matches: r.played,
    punkte: r.points,
    kaempfeGewonnen: r.won,
    kaempfeUnentschieden: r.draw,
    kaempfeVerloren: r.lost,
    kills: r.kills,
    deaths: r.deaths,
    killDifferenz: r.diff,
  }));
}

// === Matchdaten ============================================================
// Ein Ergebnis in Erzählform: wer stand drin, wer hat wen besiegt, wie ging es aus.
export function matchBlock(result, teams, day) {
  if (!result) return null;
  const home = teamById(teams, result.home);
  const away = teamById(teams, result.away);
  let homeWins = 0;
  let awayWins = 0;

  const battles = (result.battles || []).map((b, i) => {
    if (!b || !b.done) return { kampf: i + 1, ausgetragen: false };
    const s = battleStats(b);
    if (s.winner === 'home') homeWins += 1;
    else if (s.winner === 'away') awayWins += 1;
    return {
      kampf: i + 1,
      ausgetragen: true,
      sieger: s.winner === 'draw' ? 'unentschieden' : s.winner === 'home' ? home?.name : away?.name,
      aufstellungHeim: b.used?.home || [],
      aufstellungAuswaerts: b.used?.away || [],
      ueberlebendeHeim: s.homeSurvivors,
      ueberlebendeAuswaerts: s.awaySurvivors,
      killsHeim: s.homeKills,
      killsAuswaerts: s.awayKills,
      kampfverlauf: (b.kills || []).map((k) => ({
        besiegt: k.victim,
        besiegtTeam: k.victimSide === 'home' ? home?.name : away?.name,
        durch: k.killer || null,
        durchTeam: k.killerSide == null ? null : k.killerSide === 'home' ? home?.name : away?.name,
        eigenverschulden: k.killerSide != null && k.killerSide === k.victimSide,
      })),
    };
  });

  return {
    spieltag: day ?? result.day ?? null,
    heim: home?.name || result.home,
    heimId: result.home,
    auswaerts: away?.name || result.away,
    auswaertsId: result.away,
    spielerHeim: home?.player || null,
    spielerAuswaerts: away?.player || null,
    endstand: `${homeWins}:${awayWins}`,
    sieger: homeWins > awayWins ? home?.name : awayWins > homeWins ? away?.name : 'unentschieden',
    aufgebotHeim: result.squads?.home || [],
    aufgebotAuswaerts: result.squads?.away || [],
    kaempfe: battles,
  };
}

// === Team ==================================================================
function formBlock(teamId, results, teams, limit = 5) {
  return (results || [])
    .filter((r) => (r.home === teamId || r.away === teamId) && (r.battles || []).some((b) => b && b.done))
    .sort((a, b) => (a.day || 0) - (b.day || 0))
    .slice(-limit)
    .map((r) => {
      const own = r.home === teamId ? 'home' : 'away';
      const opp = teamById(teams, own === 'home' ? r.away : r.home);
      let w = 0;
      let l = 0;
      let kills = 0;
      let deaths = 0;
      (r.battles || []).forEach((b) => {
        if (!b || !b.done) return;
        const s = battleStats(b);
        if (s.winner === own) w += 1;
        else if (s.winner !== 'draw') l += 1;
        kills += own === 'home' ? s.homeKills : s.awayKills;
        deaths += own === 'home' ? s.homeDeaths : s.awayDeaths;
      });
      return {
        spieltag: r.day,
        gegner: opp?.name || '?',
        heimspiel: own === 'home',
        ergebnis: `${w}:${l}`,
        ausgang: w > l ? 'Sieg' : l > w ? 'Niederlage' : 'Unentschieden',
        kills,
        deaths,
      };
    })
    .reverse();
}

function rosterBlock(team, results, pokedex, eloRows) {
  const stats = pokemonStats([team], results, pokedex, { scopeTeamId: team.id });
  const byName = Object.fromEntries(stats.map((s) => [s.pokemon?.name, s]));
  return (team.pokemon || []).map((p) => {
    const st = byName[p.name] || {};
    return {
      name: p.name,
      tier: p.tier,
      draftKosten: p.cost ?? null,
      typen: p.types || [],
      initiative: p.base_speed ?? null,
      ...eloFor(eloRows, p.name),
      kills: st.kills || 0,
      deaths: st.deaths || 0,
      kaempfe: st.battles || 0,
      aufgebote: st.matchups || 0,
      kampfSiegquote: pct(st.battleWinPct),
      ueberlebensrate: pct(st.survivalRate),
      einsatzquoteKader: pct(st.battleShareInRoster),
      killsProKampf: round2(st.killsPerBattle),
    };
  });
}

function trainerBlock(team) {
  const cur = currentTrainer(team?.trainers || []);
  const history = trainerHistory(team?.trainers || []);
  return {
    aktuell: cur
      ? {
        name: cur.name,
        geschlecht: genderLabel(cur.gender),
        persoenlichkeit: cur.traits || [],
        amtszeit: periodLabel(cur),
        seitSpieltag: cur.fromDay ?? 'vor der Saison',
      }
      : null,
    vorgaenger: history.filter((t) => !t.current).map((t) => ({ name: t.name, amtszeit: t.period, persoenlichkeit: t.traits || [] })),
    trainerwechselBisher: Math.max(0, history.length - 1),
  };
}

function awardsBlock(team, awardDocs) {
  const rosterNames = new Set((team.pokemon || []).map((p) => p.name));
  const out = [];
  (awardDocs || []).forEach((docu) => {
    if (!docu || docu.status !== 'done') return;
    const key = String(docu.id || '').replace(/^s1-/, '').replace(/-d\d+$/, '').replace(new RegExp(`-${team.id}$`), '');
    const def = AWARD_BY_KEY[key];
    if (!def) return;
    const day = /-d(\d+)$/.exec(docu.id || '')?.[1];
    awardWinners(docu).forEach((w) => {
      const id = String(w.id || '');
      const hit = def.entity === 'team' ? id === team.id : rosterNames.has(id);
      if (!hit) return;
      out.push({
        auszeichnung: def.label,
        spieltag: day ? Number(day) : null,
        gewinner: w.label || id,
      });
    });
  });
  return out;
}

export function teamBlock(team, { teams, results, schedule, pokedex, eloRows, awardDocs }) {
  if (!team) return null;
  const table = standingsBlock((teams || []).filter((t) => t.season === 1), results);
  const row = table.find((r) => r.teamId === team.id);
  return {
    name: team.name,
    id: team.id,
    spieler: team.player,
    tabellenplatz: row?.platz ?? null,
    punkte: row?.punkte ?? 0,
    killDifferenz: row?.killDifferenz ?? 0,
    trainer: trainerBlock(team),
    kader: rosterBlock(team, results, pokedex, eloRows),
    letzteErgebnisse: formBlock(team.id, results, teams),
    naechsteSpiele: upcomingFor(team.id, schedule, results, teams, 3),
    auszeichnungen: awardsBlock(team, awardDocs),
  };
}

// === Spielplan =============================================================
export function upcomingFor(teamId, schedule, results, teams, limit = 3) {
  const byId = Object.fromEntries((results || []).map((r) => [r.id, r]));
  return matchSequence(schedule)
    .filter((m) => (m.home === teamId || m.away === teamId) && !isMatchComplete(byId[m.id]))
    .slice(0, limit)
    .map((m) => ({
      spieltag: m.day,
      gegner: teamById(teams, m.home === teamId ? m.away : m.home)?.name || '?',
      heimspiel: m.home === teamId,
    }));
}

// Wo steht die Saison? Daraus leitet das Modell ab, ob es um den Titel, um nichts
// mehr oder um den Anschluss geht — und ob der letzte Spieltag bevorsteht.
export function seasonBlock(schedule, results) {
  const days = (schedule?.matchdays || []).map((d) => d.day);
  const total = days.length;
  const byId = Object.fromEntries((results || []).map((r) => [r.id, r]));
  const completed = matchSequence(schedule).filter((m) => isMatchComplete(byId[m.id]));
  const playedDays = [...new Set(completed.map((m) => m.day))].sort((a, b) => a - b);
  const current = playedDays.length ? playedDays[playedDays.length - 1] : 0;
  const remaining = Math.max(0, total - current);
  return {
    spieltageGesamt: total,
    zuletztGespielterSpieltag: current,
    verbleibendeSpieltage: remaining,
    phase: total === 0 ? 'Vorbereitung'
      : current === 0 ? 'Saisonstart'
      : remaining === 0 ? 'Saison beendet'
      : remaining === 1 ? 'letzter Spieltag'
      : current <= total / 3 ? 'frühe Saisonphase'
      : current <= (2 * total) / 3 ? 'Saisonmitte'
      : 'Schlussphase',
  };
}

// === Presse-Gedächtnis =====================================================
// Die letzten Beiträge zu einem Team — damit sich Geschichten fortschreiben, statt
// bei null anzufangen. Redaktionelle Beiträge der Spieler sind dabei ausdrücklich
// als Steuerungssignal markiert.
export function newsBlock(articles, teamId, limit = 8) {
  return (articles || [])
    .filter((a) => a && a.status !== 'pending' && a.title)
    .filter((a) => !teamId || (a.teamIds || []).includes(teamId))
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
    .slice(0, limit)
    .map((a) => ({
      titel: a.title,
      kategorie: categoryLabel(a.category),
      autor: authorById(a.authorId)?.name,
      spieltag: a.day ?? null,
      vonDerRedaktionDerSpieler: a.category === 'redaktion',
      inhalt: plainText(a.body).slice(0, 900),
    }));
}

export function storyBlock(articles, teamId) {
  return activeStorylines(articles, teamId).map((s) => ({
    id: s.id,
    titel: s.title,
    status: s.status,
    stand: s.summary,
    beitraege: s.beats,
    letzterSpieltag: s.day,
  }));
}

// === Gesamtkontext =========================================================
/**
 * Der vollständige Metadatensatz für einen Prompt.
 * @param {object} src   { teams, results, schedule, pokedex, eloRows, awardDocs, articles }
 * @param {object} focus { teamIds:[…], matchId, day }
 */
export function buildContext(src, focus = {}) {
  const seasonTeams = (src.teams || []).filter((t) => t.season === 1);
  const focusIds = (focus.teamIds || []).filter(Boolean);
  const result = focus.matchId ? (src.results || []).find((r) => r.id === focus.matchId) : null;

  return {
    saison: seasonBlock(src.schedule, src.results),
    tabelle: standingsBlock(seasonTeams, src.results),
    spielerDuell: playerDuelBlock(seasonTeams, src.results),
    match: result ? matchBlock(result, src.teams, focus.day) : null,
    // Von den Spielern selbst notierter Kampfverlauf — die einzige Quelle mit Details
    // aus dem Kampf, die über die reinen Zahlen hinausgeht.
    kampfverlauf: battleLogBlock(src.battleLogs, focus),
    teams: focusIds.map((id) => teamBlock(teamById(src.teams, id), { ...src, teams: src.teams })).filter(Boolean),
    ligaweiteBestwerte: leaderBlock(seasonTeams, src.results, src.pokedex, src.eloRows),
    laufendeGeschichten: storyBlock(src.articles, focusIds[0] || null),
    letzteBerichte: newsBlock(src.articles, focusIds[0] || null),
    letzteBerichteLigaweit: newsBlock(src.articles, null, 6),
  };
}

// Der von den Spielern notierte Kampfverlauf zum Match im Fokus — und, damit sich
// spätere Beiträge darauf berufen können, die letzten Verläufe der Fokus-Teams.
function battleLogBlock(logs, focus = {}) {
  const list = logs || [];
  const entriesOf = (log) => Object.entries(log?.entries || {})
    .map(([spieler, e]) => ({ spieler, text: String(e?.text || '').trim() }))
    .filter((e) => e.text);

  const current = focus.matchId ? list.find((l) => l.id === focus.matchId) : null;
  const focusIds = (focus.teamIds || []).filter(Boolean);
  const weitere = list
    .filter((l) => l && l.id !== focus.matchId)
    .filter((l) => !focusIds.length || focusIds.includes(l.home) || focusIds.includes(l.away))
    .sort((a, b) => (b.day || 0) - (a.day || 0))
    .slice(0, 3)
    .map((l) => ({ matchId: l.id, spieltag: l.day ?? null, notizen: entriesOf(l) }))
    .filter((l) => l.notizen.length);

  const zumMatch = current ? entriesOf(current) : [];
  if (!zumMatch.length && !weitere.length) return null;
  return {
    hinweis: 'Von den Spielern selbst notiert (auch per Sprachnotiz). Fakten, keine Wertung — '
      + 'als Detailquelle nutzbar, aber nicht wörtlich übernehmen.',
    zumMatch,
    weitere,
  };
}

// Janik gegen Henrik — das eigentliche Duell hinter den acht Teams.
function playerDuelBlock(seasonTeams, results) {
  const table = standingsBlock(seasonTeams, results);
  const sum = (player) => table.filter((r) => r.spieler === player).reduce(
    (acc, r) => ({
      punkte: acc.punkte + r.punkte,
      killDifferenz: acc.killDifferenz + r.killDifferenz,
      bestePlatzierung: Math.min(acc.bestePlatzierung, r.platz),
    }),
    { punkte: 0, killDifferenz: 0, bestePlatzierung: 99 },
  );
  return { Janik: sum('Janik'), Henrik: sum('Henrik') };
}

// Die auffälligsten Pokémon der Liga — als Maßstab, an dem eine Leistung gemessen
// werden kann („acht Kills, ligaweit nur von X übertroffen").
function leaderBlock(seasonTeams, results, pokedex, eloRows) {
  const stats = pokemonStats(seasonTeams, results, pokedex)
    .filter((s) => s.battles > 0)
    .map((s) => ({
      name: s.pokemon?.name,
      team: s.team?.name || 'ohne Team',
      tier: s.pokemon?.tier,
      ...eloFor(eloRows, s.pokemon?.name),
      kills: s.kills,
      deaths: s.deaths,
      kaempfe: s.battles,
      ueberlebensrate: pct(s.survivalRate),
    }));
  const top = (key, n = 5) => [...stats].sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, n);
  return {
    meisteKills: top('kills'),
    meisteDeaths: top('deaths'),
    // Unter- und Überperformer: teures Tier ohne Wirkung bzw. billiges Tier mit Wirkung.
    ueberraschungen: stats.filter((s) => ['C', 'D'].includes(s.tier) && s.kills >= 3).slice(0, 6),
    enttaeuschungen: stats.filter((s) => ['S', 'A'].includes(s.tier) && s.kills <= 1 && s.kaempfe >= 3).slice(0, 6),
  };
}
