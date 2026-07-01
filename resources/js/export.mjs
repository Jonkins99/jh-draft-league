// Export-Funktionen: baut aus den Liga-Daten flache Datensätze und liefert sie als
// JSON, XML, CSV oder Excel (.xlsx) zum Download. Reines Modul (Firebase/Alpine-frei).
import * as XLSX from 'xlsx';
import { battleStats, computeStandings, pokemonStats } from './scoring.mjs';

// --- Serialisierung --------------------------------------------------------
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function sheetToCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const head = cols.map(csvCell).join(';');
  const body = rows.map((r) => cols.map((c) => csvCell(r[c])).join(';')).join('\n');
  return `${head}\n${body}`;
}
function xmlEscape(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function sheetToXml(name, rows) {
  const body = rows
    .map((r) => {
      const cells = Object.entries(r)
        .map(([k, v]) => `      <cell name="${xmlEscape(k)}">${xmlEscape(v)}</cell>`)
        .join('\n');
      return `    <row>\n${cells}\n    </row>`;
    })
    .join('\n');
  return `  <sheet name="${xmlEscape(name)}">\n${body}\n  </sheet>`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// dataset = { filename, sheets: [{ name, rows }] }
export function exportDataset(dataset, format) {
  const { filename, sheets } = dataset;
  const single = sheets.length === 1;

  if (format === 'json') {
    const payload = single ? sheets[0].rows : Object.fromEntries(sheets.map((s) => [s.name, s.rows]));
    triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${filename}.json`);
    return;
  }
  if (format === 'csv') {
    const text = single
      ? sheetToCsv(sheets[0].rows)
      : sheets.map((s) => `# ${s.name}\n${sheetToCsv(s.rows)}`).join('\n\n');
    triggerDownload(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
    return;
  }
  if (format === 'xml') {
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n<export>\n${sheets.map((s) => sheetToXml(s.name, s.rows)).join('\n')}\n</export>`;
    triggerDownload(new Blob([text], { type: 'application/xml' }), `${filename}.xml`);
    return;
  }
  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    sheets.forEach((s) => {
      const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{}]);
      XLSX.utils.book_append_sheet(wb, ws, (s.name || 'Blatt').slice(0, 31));
    });
    XLSX.writeFile(wb, `${filename}.xlsx`);
  }
}

// --- Helfer ----------------------------------------------------------------
const pct = (x) => Math.round((Number.isFinite(x) ? x : 0) * 1000) / 10; // 0.5 -> 50, 1 Nachkommastelle
const legLabel = (leg) => (leg === 'rueck' ? 'Rückrunde' : 'Hinrunde');
const winnerLabel = (w, home, away) => (w === 'home' ? home : w === 'away' ? away : w === 'draw' ? 'Unentschieden' : '—');

function resultMap(results) {
  const map = {};
  (results || []).forEach((r) => { if (r?.id) map[r.id] = r; });
  return map;
}

// --- Datensatz-Builder -----------------------------------------------------
export function buildScheduleExport(teams, results, schedule) {
  const teamById = Object.fromEntries((teams || []).map((t) => [t.id, t]));
  const map = resultMap(results);
  const rows = [];
  (schedule?.matchdays || []).forEach((md) => {
    (md.matches || []).forEach((m, i) => {
      const home = teamById[m.home];
      const away = teamById[m.away];
      const r = map[`s1-d${md.day}-m${i}`];
      let hw = 0, aw = 0, done = 0;
      const battleScores = [];
      (r?.battles || []).forEach((b) => {
        if (b && b.done) {
          const s = battleStats(b);
          hw += s.homePoints; aw += s.awayPoints; done += 1;
          battleScores.push(`${s.homeSurvivors}:${s.awaySurvivors}`);
        } else battleScores.push('–');
      });
      rows.push({
        Spieltag: md.day,
        Runde: legLabel(md.leg),
        Heim: home?.name || m.home,
        'Heim-Spieler': home?.player || '',
        Gast: away?.name || m.away,
        'Gast-Spieler': away?.player || '',
        Status: done ? 'gespielt' : 'offen',
        'Kämpfe Heim': done ? hw : '',
        'Kämpfe Gast': done ? aw : '',
        Sieger: done ? (hw > aw ? home?.name : aw > hw ? away?.name : 'Unentschieden') : '',
        'Kampf 1': battleScores[0] || '–',
        'Kampf 2': battleScores[1] || '–',
        'Kampf 3': battleScores[2] || '–',
      });
    });
  });
  return { filename: 'jhdl-spielplan', sheets: [{ name: 'Spielplan', rows }] };
}

export function buildBattleDetailsExport(teams, results, schedule) {
  const teamById = Object.fromEntries((teams || []).map((t) => [t.id, t]));
  const map = resultMap(results);
  const battleRows = [];
  const killRows = [];
  const order = [];
  (schedule?.matchdays || []).forEach((md) => (md.matches || []).forEach((m, i) => order.push({ day: md.day, i, m })));

  order.forEach(({ day, i, m }) => {
    const r = map[`s1-d${day}-m${i}`];
    if (!r) return;
    const home = teamById[m.home];
    const away = teamById[m.away];
    const matchLabel = `${home?.name || m.home} vs ${away?.name || m.away}`;
    const sideTeam = (side) => (side === 'home' ? home : away);
    (r.battles || []).forEach((b, bi) => {
      if (!b || !b.done) return;
      const s = battleStats(b);
      battleRows.push({
        Spieltag: day,
        Match: matchLabel,
        Kampf: bi + 1,
        Sieger: winnerLabel(s.winner, home?.name, away?.name),
        'Überlebende Heim': s.homeSurvivors,
        'Überlebende Gast': s.awaySurvivors,
        'Kills Heim': s.homeKills,
        'Kills Gast': s.awayKills,
        'Einsatz Heim': (b.used?.home || []).join(', '),
        'Einsatz Gast': (b.used?.away || []).join(', '),
      });
      (b.kills || []).forEach((k) => {
        if (!k) return;
        const art = k.killerSide == null ? 'nicht angerechnet'
          : k.killerSide === k.victimSide ? 'Self-Kill' : 'Kill';
        killRows.push({
          Spieltag: day,
          Match: matchLabel,
          Kampf: bi + 1,
          Art: art,
          Killer: k.killer || '',
          'Killer-Team': k.killerSide ? sideTeam(k.killerSide)?.name || '' : '',
          Opfer: k.victim || '',
          'Opfer-Team': sideTeam(k.victimSide)?.name || '',
        });
      });
    });
  });
  return {
    filename: 'jhdl-kampf-details',
    sheets: [
      { name: 'Kämpfe', rows: battleRows },
      { name: 'Kills', rows: killRows },
    ],
  };
}

export function buildStandingsExport(teams, results) {
  const rows = computeStandings(teams, results).map((r, i) => ({
    Platz: i + 1,
    Team: r.team.name,
    Spieler: r.team.player,
    Matches: r.played,
    Siege: r.won,
    Unentschieden: r.draw,
    Niederlagen: r.lost,
    Kills: r.kills,
    Deaths: r.deaths,
    Differenz: r.diff,
    Punkte: r.points,
  }));
  return { filename: 'jhdl-tabelle', sheets: [{ name: 'Tabelle', rows }] };
}

export function buildRankingExport(teams, results, pokemon) {
  const speed = Object.fromEntries((pokemon || []).map((p) => [p.name, p.base_speed]));
  const rows = pokemonStats(teams, results)
    .sort((a, b) => b.kills - a.kills || a.pokemon.name.localeCompare(b.pokemon.name))
    .map((s) => ({
      Pokémon: s.pokemon.name,
      Team: s.team?.name || '',
      Spieler: s.team?.player || '',
      Typen: (s.pokemon.types || []).join('/'),
      Tier: s.pokemon.tier || '',
      Kills: s.kills,
      Deaths: s.deaths,
      'K/D': Math.round(s.kd * 100) / 100,
      Matchups: s.matchups,
      Kämpfe: s.battles,
      'Kills/Kampf': Math.round(s.killsPerBattle * 100) / 100,
      'Kampf-Siegquote %': pct(s.battleWinPct),
      'Match-Siegquote %': pct(s.matchWinPct),
      'Überlebensrate %': pct(s.survivalRate),
      Init: speed[s.pokemon.name] ?? '',
      Kosten: s.pokemon.cost ?? '',
    }));
  return { filename: 'jhdl-pokemon-ranking', sheets: [{ name: 'Ranking', rows }] };
}

export function buildTeamsExport(teams, pokemon) {
  const speed = Object.fromEntries((pokemon || []).map((p) => [p.name, p.base_speed]));
  const rank = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  const rows = [];
  (teams || []).forEach((t) => {
    [...(t.pokemon || [])]
      .sort((a, b) => (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9))
      .forEach((p, i) => {
        rows.push({
          Team: t.name,
          Spieler: t.player,
          Slot: i + 1,
          Pokémon: p.name,
          Typen: (p.types || []).join('/'),
          Tier: p.tier || '',
          Kosten: p.cost ?? '',
          Init: speed[p.name] ?? '',
        });
      });
  });
  return { filename: 'jhdl-teams', sheets: [{ name: 'Teams', rows }] };
}

export function buildDraftpoolExport(pokemon, teams) {
  const owner = {};
  (teams || []).forEach((t) => (t.pokemon || []).forEach((p) => { owner[p.name] = t; }));
  const rows = (pokemon || []).map((p) => ({
    Pokémon: p.name,
    Englisch: p.name_en || '',
    Dex: p.dex ?? '',
    Typen: (p.types || []).join('/'),
    Tier: p.tier || '',
    Kosten: p.cost ?? '',
    Init: p.base_speed ?? '',
    'Gedraftet von': owner[p.name]?.name || '',
    Spieler: owner[p.name]?.player || '',
  }));
  return { filename: 'jhdl-draftpool', sheets: [{ name: 'Draftpool', rows }] };
}
