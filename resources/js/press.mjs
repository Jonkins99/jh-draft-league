// Presse-Kern: Kategorien, Redaktion, Slot-Planung, Storylines.
// Framework-frei (kein Alpine, kein Firebase) — damit unter Node testbar.
//
// Ein Presse-Beitrag ist ein Dokument der Collection `press`:
//   { season, category, title, subtitle, body(HTML), authorId, teamIds[],
//     pokemonNames[], day, status, source:{…}, storylines:[…], createdAt, publishedAt }
//
// Storylines werden NICHT separat gespeichert: jeder Beitrag trägt die Storylines,
// die er fortschreibt, mit Status und Kurzfassung bei sich. Der aktuelle Stand einer
// Storyline ist damit immer der jüngste Beitrag, der sie erwähnt (siehe activeStorylines).

export const PRESS_CATEGORIES = [
  { key: 'spielbericht', label: 'Spielbericht', short: 'Bericht', color: '#4d90d5' },
  { key: 'news', label: 'News', short: 'News', color: '#63bc5a' },
  { key: 'klatsch', label: 'Klatsch und Tratsch', short: 'Klatsch', color: '#e3350d' },
  { key: 'redaktion', label: 'Redaktion', short: 'Redaktion', color: '#ffcb05' },
];

export const CATEGORY_BY_KEY = Object.fromEntries(PRESS_CATEGORIES.map((c) => [c.key, c]));

export function categoryLabel(key) {
  return CATEGORY_BY_KEY[key]?.label || 'News';
}

export function categoryColor(key) {
  return CATEGORY_BY_KEY[key]?.color || '#98a2b3';
}

// Der Pool der Pressevertreter ist bewusst hartkodiert: sechs feste Gesichter mit
// eigener Handschrift. `voice` geht wörtlich in den Prompt und steuert den Stil des
// erzeugten Textes, `beat` die inhaltliche Ausrichtung der Fragen.
export const PRESS_AUTHORS = [
  {
    id: 'alba',
    name: 'Alba',
    outlet: 'Ligamagazin „Ewige Flamme“',
    role: 'Chefreporterin',
    image: './img/press/alba.png',
    voice: 'Grande Dame des Ligajournalismus. Erzählt in großen Bögen, arbeitet mit Bildern und Pathos, '
      + 'zitiert gern und stellt jede Partie in den Zusammenhang der Saison. Wohlwollend, aber nie naiv.',
    beat: 'Große Linien, Saisonverlauf, Verantwortung, Haltung.',
  },
  {
    id: 'piaudo',
    name: 'Pia & Udo',
    outlet: 'Liga-TV',
    role: 'Reporterduo am Spielfeldrand',
    image: './img/press/piaudo.png',
    voice: 'Ein Duo vor der Kamera: Pia fragt, Udo filmt und wirft Zwischenrufe ein. Schreibt im Wir, '
      + 'atemlos, nah dran, mit Geräuschen und Szenen vom Spielfeldrand. Kurze Sätze, viel Präsens.',
    beat: 'Emotion, Szenen, unmittelbare Reaktionen, Stimmung an der Arena.',
  },
  {
    id: 'sina',
    name: 'Sina',
    outlet: 'Draft Analytics',
    role: 'Datenjournalistin',
    image: './img/press/sina.png',
    voice: 'Nüchtern, präzise, datengetrieben. Belegt jede These mit Zahlen aus den Daten (Kills, '
      + 'Einsatzquoten, Elo, Tier) und lässt zwischen den Zeilen trockene Spitzen fallen.',
    beat: 'Kennzahlen, Über- und Unterperformance, Erwartungswerte, Tabellenmathematik.',
  },
  {
    id: 'dexio',
    name: 'Dexio',
    outlet: 'Draft Analytics',
    role: 'Taktikexperte',
    image: './img/press/dexio.png',
    voice: 'Begeisterter Taktik-Nerd. Zerlegt Aufstellungen, Matchups, Typendeckung und Initiative, '
      + 'erklärt Entscheidungen und gerät über eine gelungene Rotation regelrecht ins Schwärmen.',
    beat: 'Aufgebote, Rotation, Typ-Matchups, Initiative, Kampfplan.',
  },
  {
    id: 'lebelle',
    name: 'LeBelle',
    outlet: 'Der Liga-Spiegel',
    role: 'Boulevardreporter',
    image: './img/press/lebelle.png',
    voice: 'Boulevard in Reinform. Zuspitzung, Ausrufezeichen, angebliche Insider, fette Behauptungen, '
      + 'die er am Ende des Absatzes halb wieder einfängt. Zitiert am liebsten das, was jemand fast gesagt hat.',
    beat: 'Unruhe, Gerüchte, Eitelkeiten, alles hinter den Kulissen.',
  },
  {
    id: 'matiere',
    name: 'Matière',
    outlet: 'Dossier Liga',
    role: 'Investigativreporterin',
    image: './img/press/matiere.png',
    voice: 'Kühl, investigativ, lange gebaute Sätze. Beruft sich auf „Personen aus dem Umfeld des Teams“, '
      + 'legt Widersprüche offen und lässt Fragen bewusst offen stehen. Nie laut, immer unangenehm.',
    beat: 'Widersprüche, Hintergründe, unbequeme Fragen, Machtverhältnisse.',
  },
];

export const AUTHOR_BY_ID = Object.fromEntries(PRESS_AUTHORS.map((a) => [a.id, a]));

export function authorById(id) {
  return AUTHOR_BY_ID[id] || PRESS_AUTHORS[0];
}

// === Deterministischer Zufall ==============================================
// Slot-Belegung und Autorenwahl müssen auf beiden Geräten gleich ausfallen, ohne
// dass dafür etwas gespeichert wird. Darum: Seed aus dem Schlüssel, kein Math.random.
export function hashSeed(str) {
  let h = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededFloat(seed) {
  let x = (seed || 1) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5; x >>>= 0;
  return x / 4294967296;
}

export function seededPick(list, key) {
  const arr = list || [];
  if (!arr.length) return null;
  return arr[Math.floor(seededFloat(hashSeed(key)) * arr.length) % arr.length];
}

// Zufällige Auswahl aus dem Pool (echt zufällig, für neu entstehende Beiträge).
export function randomAuthor(exclude = []) {
  const pool = PRESS_AUTHORS.filter((a) => !exclude.includes(a.id));
  const list = pool.length ? pool : PRESS_AUTHORS;
  return list[Math.floor(Math.random() * list.length)];
}

export function randomAuthors(n, exclude = []) {
  const pool = PRESS_AUTHORS.filter((a) => !exclude.includes(a.id));
  const list = [...(pool.length >= n ? pool : PRESS_AUTHORS)];
  const out = [];
  while (out.length < n && list.length) {
    out.push(list.splice(Math.floor(Math.random() * list.length), 1)[0]);
  }
  return out;
}

// === Matches & Slots =======================================================
export const BATTLES_PER_MATCH = 3;

export function matchDocId(day, matchIndex) {
  return `s1-d${day}-m${matchIndex}`;
}

// Spielplan in die tatsächliche Reihenfolge bringen: Spieltag für Spieltag, darin
// die Paarungen in Listenreihenfolge. Diese Kette entscheidet, wann der Slot „vor
// dem Spiel“ eines Teams freigeschaltet wird (nämlich mit dem Ergebnis davor).
export function matchSequence(schedule) {
  const out = [];
  (schedule?.matchdays || []).forEach((md) => {
    (md.matches || []).forEach((m, i) => {
      out.push({
        day: md.day,
        matchIndex: i,
        home: m.home,
        away: m.away,
        id: matchDocId(md.day, i),
        seq: out.length,
      });
    });
  });
  return out;
}

export function isMatchComplete(result) {
  return (result?.battles || []).filter((b) => b && b.done === true).length >= BATTLES_PER_MATCH;
}

// Welches Format liegt auf welchem Slot? Pro Team und Spieltag individuell gelost,
// aber deterministisch aus dem Schlüssel — ohne Schreibzugriff, auf jedem Gerät gleich.
export function slotPlan(teamId, day) {
  const first = seededFloat(hashSeed(`slot:${teamId}:${day}`)) < 0.5 ? 'interview' : 'pk';
  return { pre: first, post: first === 'interview' ? 'pk' : 'interview' };
}

export function sessionDocId(day, teamId, type) {
  return `s1-d${day}-${teamId}-${type}`;
}

// Einmalige Auftaktrunde: vor diesem Spieltag tritt JEDES Team einmal zur
// Pressekonferenz UND zum Interview an — 16 Termine, die den Rest der Saison
// vorbereiten. Erst wenn sie durch sind, startet der Spieltag regulär.
export const BONUS_ROUND_DAY = 8;

// Erster Spieltag mit Pressebetrieb. Die Presse ist mitten in der Saison dazu-
// gekommen; die Spieltage davor werden nicht nachträglich mit Terminen gefüllt.
// (Gleiches Muster wie MATCHDAY_AWARDS_FROM in awards.mjs.)
export const PRESS_FROM_DAY = BONUS_ROUND_DAY;

export function bonusSessionId(teamId, type) {
  return `s1-bonus-${teamId}-${type}`;
}

export function bonusSlotsFor(teamId, schedule, sessions = []) {
  const match = matchSequence(schedule).find((m) => m.day === BONUS_ROUND_DAY && (m.home === teamId || m.away === teamId));
  if (!match) return [];
  return ['pk', 'interview'].map((type) => {
    const id = bonusSessionId(teamId, type);
    return {
      id,
      day: BONUS_ROUND_DAY,
      teamId,
      opponentId: match.home === teamId ? match.away : match.home,
      home: match.home === teamId,
      matchId: null,
      slot: 'bonus',
      type,
      open: true,
      blockedBy: null,
      done: (sessions || []).some((s) => s?.id === id && s.status === 'done'),
    };
  });
}

// Sind alle 16 Termine der Auftaktrunde abgearbeitet?
export function bonusRoundComplete(teamIds, schedule, sessions) {
  const rows = (teamIds || []).flatMap((id) => bonusSlotsFor(id, schedule, sessions));
  return rows.length > 0 && rows.every((r) => r.done);
}

export function bonusRoundProgress(teamIds, schedule, sessions) {
  const rows = (teamIds || []).flatMap((id) => bonusSlotsFor(id, schedule, sessions));
  return { done: rows.filter((r) => r.done).length, total: rows.length };
}

// Alle Presse-Termine eines Teams: je Spieltag ein Interview und eine Pressekonferenz.
//   „vor dem Spiel“  — frei, sobald das im Spielplan davorliegende Match fertig ist
//   „nach dem Spiel“ — frei, sobald das eigene Match fertig ist (3. Kampf eingetragen)
// Davor liegt einmalig die Auftaktrunde; solange sie läuft, bleibt der Vor-dem-Spiel-
// Termin des Auftakt-Spieltags gesperrt.
export function pressSlots(teamId, schedule, results, sessions = [], bonusComplete = false) {
  const seq = matchSequence(schedule);
  const byId = {};
  (results || []).forEach((r) => { if (r?.id) byId[r.id] = r; });
  const out = [...bonusSlotsFor(teamId, schedule, sessions)];

  const hasSession = (id) => (sessions || []).some((s) => s?.id === id);

  seq.forEach((m) => {
    if (m.home !== teamId && m.away !== teamId) return;
    const plan = slotPlan(teamId, m.day);
    // Spieltage vor dem Pressestart bleiben leer — es sei denn, dort hat schon
    // einmal ein Termin stattgefunden.
    if (m.day < PRESS_FROM_DAY && !['pre', 'post'].some((s) => hasSession(sessionDocId(m.day, teamId, plan[s])))) return;
    const prev = m.seq > 0 ? seq[m.seq - 1] : null;
    const waitsForBonus = m.day === BONUS_ROUND_DAY && !bonusComplete;
    const preOpen = (!prev || isMatchComplete(byId[prev.id])) && !waitsForBonus;
    const postOpen = isMatchComplete(byId[m.id]);
    const opponent = m.home === teamId ? m.away : m.home;
    [['pre', preOpen], ['post', postOpen]].forEach(([slot, open]) => {
      out.push({
        id: sessionDocId(m.day, teamId, plan[slot]),
        day: m.day,
        teamId,
        opponentId: opponent,
        home: m.home === teamId,
        matchId: m.id,
        slot,
        type: plan[slot],
        open,
        // Beschreibt, worauf noch gewartet wird — die Ansicht zeigt das als Hinweis.
        blockedBy: open ? null : slot === 'pre' ? (waitsForBonus ? 'bonus' : prev?.id || null) : m.id,
      });
    });
  });

  const rank = { bonus: 0, pre: 1, post: 2 };
  return out.sort((a, b) => a.day - b.day || rank[a.slot] - rank[b.slot]);
}

export function slotLabel(slot) {
  if (slot === 'bonus') return 'Auftaktrunde';
  return slot === 'pre' ? 'Vor dem Spiel' : 'Nach dem Spiel';
}

export function typeLabel(type) {
  return type === 'pk' ? 'Pressekonferenz' : 'Interview';
}

// === Storylines ============================================================
// Der jüngste Beitrag, der eine Storyline erwähnt, definiert ihren Stand.
export const STORY_STATUS = ['neu', 'laufend', 'eskaliert', 'beruhigt', 'beendet'];

export function storyId(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'story';
}

export function collectStorylines(articles) {
  const byId = {};
  [...(articles || [])]
    .filter((a) => a && a.status !== 'pending')
    .sort((a, b) => String(a.publishedAt || '').localeCompare(String(b.publishedAt || '')))
    .forEach((a) => {
      (a.storylines || []).forEach((s) => {
        if (!s || !s.id) return;
        const prev = byId[s.id];
        byId[s.id] = {
          id: s.id,
          title: s.title || prev?.title || s.id,
          teams: s.teams?.length ? s.teams : prev?.teams || [],
          status: s.status || 'laufend',
          summary: s.summary || prev?.summary || '',
          day: a.day ?? prev?.day ?? null,
          lastAt: a.publishedAt || a.createdAt || null,
          beats: (prev?.beats || 0) + 1,
        };
      });
    });
  return Object.values(byId).sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
}

// Für den Prompt: was läuft gerade rund um dieses Team? Abgeschlossene Storylines
// werden weiterhin mitgegeben (als Gedächtnis), aber deutlich als beendet markiert.
export function activeStorylines(articles, teamId = null, limit = 12) {
  return collectStorylines(articles)
    .filter((s) => !teamId || !s.teams?.length || s.teams.includes(teamId))
    .slice(0, limit);
}

// === Beiträge ==============================================================
// Beiträge der beiden Spieler tragen immer den Stempel „Redaktion“, dürfen inhaltlich
// aber in einer anderen Rubrik stehen. Der Filter „Redaktion“ meint deshalb die
// Herkunft, alle anderen Filter meinen die Rubrik.
export function articleMatchesFilter(article, { category = '', teamId = '', authorId = '', q = '' } = {}) {
  if (!article) return false;
  if (category === 'redaktion') {
    if (!article.editorial && article.category !== 'redaktion') return false;
  } else if (category && article.category !== category) return false;
  if (teamId && !(article.teamIds || []).includes(teamId)) return false;
  if (authorId && article.authorId !== authorId) return false;
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  const hay = `${article.title || ''} ${article.subtitle || ''} ${plainText(article.body)}`.toLowerCase();
  return hay.includes(needle);
}

export function sortArticles(list) {
  return [...(list || [])].sort((a, b) => {
    const ta = a?.publishedAt || a?.createdAt || '';
    const tb = b?.publishedAt || b?.createdAt || '';
    return String(tb).localeCompare(String(ta));
  });
}

export function plainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|h\d|li|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerpt(article, len = 180) {
  const t = plainText(article?.body);
  return t.length > len ? `${t.slice(0, len).replace(/\s+\S*$/, '')}…` : t;
}

export function readingMinutes(article) {
  const words = plainText(article?.body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Die Beiträge schreiben nur zwei Personen und ein Modell — trotzdem wird das HTML
// vor dem Speichern auf eine kleine Whitelist reduziert. Das hält den Textkörper
// sauber (kein Inline-Style-Wildwuchs aus der Zwischenablage) und schließt
// Script-Injektion über einen kopierten Schnipsel aus.
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'hr', 'span',
]);
const ALLOWED_ATTRS = { a: ['href', 'title'], img: ['src', 'alt'] };

export function sanitizeHtml(html) {
  const input = String(html || '');
  if (typeof document === 'undefined') return input.replace(/<script[\s\S]*?<\/script>/gi, '');
  const tpl = document.createElement('template');
  tpl.innerHTML = input;

  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) return;
      if (child.nodeType !== 1) return child.remove();
      const tag = child.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        // Unbekanntes Element auflösen statt löschen: der Text bleibt erhalten.
        const frag = document.createDocumentFragment();
        [...child.childNodes].forEach((n) => frag.appendChild(n));
        child.replaceWith(frag);
        return walk(node);
      }
      const keep = ALLOWED_ATTRS[tag] || [];
      [...child.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (!keep.includes(name)) return child.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) child.removeAttribute(attr.name);
      });
      if (tag === 'a') {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
      walk(child);
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

// Das Modell liefert den Text als Absatz-Array — daraus wird der Textkörper gebaut.
// Ein Eintrag, der mit „> “ beginnt, wird zum Zitatblock, „## “ zur Zwischenüberschrift.
export function paragraphsToHtml(list) {
  return (Array.isArray(list) ? list : [String(list || '')])
    .map((raw) => String(raw || '').trim())
    .filter(Boolean)
    .map((p) => {
      if (p.startsWith('## ')) return `<h3>${escapeHtml(p.slice(3))}</h3>`;
      if (p.startsWith('> ')) return `<blockquote>${inlineHtml(p.slice(2))}</blockquote>`;
      return `<p>${inlineHtml(p)}</p>`;
    })
    .join('');
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Sehr kleines Inline-Markup: **fett** und *kursiv* — mehr braucht der Fließtext nicht.
function inlineHtml(str) {
  return escapeHtml(str)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>');
}

// === Anzeige ===============================================================
const DATE_FMT = { day: '2-digit', month: 'long', year: 'numeric' };

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', DATE_FMT);
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('de-DE', DATE_FMT)}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}
