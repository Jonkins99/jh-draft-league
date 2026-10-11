// Import eines Pokémon-Datensatzes von serebii.net (Pokédex „Champions").
// Framework-frei und unter Node testbar: `parseChampionsPage` bekommt reinen Quelltext.
//
// Serebii schickt keine CORS-Freigabe — der Browser darf die Seite nicht direkt lesen.
// `fetchChampionsHtml` geht deshalb über öffentliche Durchreicher und probiert sie
// nacheinander. Klappt keiner, lässt sich der Quelltext in der Oberfläche einfügen;
// gelesen wird er hier wie eine geladene Seite.
//
// Eine Seite beschreibt eine Art mit allen Formen: die Grundform, regionale Formen
// („Stats - Alolan Ninetales"), gemeinsame Werte aller Wechselformen („Stats -
// Alternate Forms", z. B. Rotom) und je Mega-Entwicklung einen eigenen Abschnitt
// (`<h3>Mega …</h3>`). Jede davon wird ein eigener Vorschlag — in der Liga ist jede
// Form ein eigenes Pokémon.

const TYPE_DE = {
  normal: 'Normal', fire: 'Feuer', water: 'Wasser', electric: 'Elektro', grass: 'Pflanze',
  ice: 'Eis', fighting: 'Kampf', poison: 'Gift', ground: 'Boden', flying: 'Flug',
  psychic: 'Psycho', bug: 'Käfer', rock: 'Gestein', ghost: 'Geist', dragon: 'Drache',
  dark: 'Unlicht', steel: 'Stahl', fairy: 'Fee',
};

// Regionalformen heißen in der Liga „Alola-Vulnona" und „Alolan Ninetales".
const REGION_DE = { alolan: 'Alola', galarian: 'Galar', hisuian: 'Hisui', paldean: 'Paldea' };

// Rotoms Wechselformen haben eingeführte deutsche Namen.
const FORM_DE = { heat: 'Hitze', wash: 'Wasch', frost: 'Frost', fan: 'Wirbel', mow: 'Schneid' };

const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export const SEREBII_BASE = 'https://www.serebii.net';
const IMAGE_BASE = `${SEREBII_BASE}/pokemonhome/pokemon/`;

// Durchreicher in der Reihenfolge, in der sie probiert werden.
export const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
];

/**
 * Eingabe der Oberfläche -> kanonische Seitenadresse, sonst null.
 * Akzeptiert mit/ohne `www`, mit/ohne Schrägstrich am Ende, auch nur den Namen.
 */
export function normalizeChampionsUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?serebii\.net\/pokedex-champions\/([a-z0-9-]+)\/?(?:[?#].*)?$/i);
  if (m) return `${SEREBII_BASE}/pokedex-champions/${m[1].toLowerCase()}/`;
  if (/^[a-z0-9-]+$/i.test(raw)) return `${SEREBII_BASE}/pokedex-champions/${raw.toLowerCase()}/`;
  return null;
}

// Serebii liefert ISO-8859-1. Ein Durchreicher kann die Bytes unverändert weitergeben
// oder schon nach UTF-8 umgesetzt haben — erst streng UTF-8, dann Windows-1252.
export function decodePage(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/** Den Quelltext über die Durchreicher holen. Wirft, wenn keiner antwortet. */
export async function fetchChampionsHtml(url, { fetchImpl = globalThis.fetch, proxies = CORS_PROXIES, timeoutMs = 15000 } = {}) {
  const target = normalizeChampionsUrl(url);
  if (!target) throw new Error('Das ist keine Adresse aus dem Champions-Pokédex von serebii.net.');
  const errors = [];
  for (const wrap of proxies) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(wrap(target), ctrl ? { signal: ctrl.signal } : undefined);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = res.arrayBuffer ? decodePage(await res.arrayBuffer()) : await res.text();
      if (!/Base Stats - Total/i.test(html)) throw new Error('Antwort ist keine Pokédex-Seite');
      return html;
    } catch (e) {
      errors.push(e?.message || String(e));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw new Error(`Die Seite ließ sich nicht laden (${errors.join(' · ')}).`);
}

// --- Parser -------------------------------------------------------------------

function clean(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ');
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&eacute;/g, 'é')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function textOf(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function typesIn(html) {
  const out = [];
  const re = /\/type\/([a-z]+)\.gif/gi;
  let m;
  while ((m = re.exec(html))) {
    const de = TYPE_DE[m[1].toLowerCase()];
    if (de && !out.includes(de)) out.push(de);
  }
  return out;
}

// Die sechs Basiswerte hinter „Base Stats - Total" — ab Position `from`.
function statsAfter(t, from = 0) {
  const at = t.indexOf('Base Stats - Total', from);
  if (at < 0) return null;
  const slice = t.slice(at, at + 1200);
  const nums = [...slice.matchAll(/<td[^>]*class="fooinfo"[^>]*>\s*(\d{1,3})\s*<\/td>/g)].map((m) => Number(m[1]));
  if (nums.length < 6) return null;
  return { at, stats: Object.fromEntries(STAT_ORDER.map((k, i) => [k, nums[i]])) };
}

// Die Namenszeile einer Art (Grundform oder Mega): englischer Name, deutscher Name,
// Nummer und die Typzelle (bei Formen eine kleine Tabelle „Label | Typen").
function nameBlock(t, from = 0) {
  const at = t.indexOf('<td class="fooevo">Name</td>', from);
  if (at < 0) return null;
  const end = t.indexOf('Classification', at);
  const block = t.slice(at, end > at ? end : at + 6000);
  const en = textOf((block.match(/<\/tr>\s*<tr>\s*<td class="fooinfo">([\s\S]*?)<\/td>/) || [])[1]);
  const de = textOf((block.match(/<b>German<\/b>:\s*<\/td>\s*<td>([\s\S]*?)<\/td>/) || [])[1]);
  const dexRaw = (block.match(/<b>National<\/b>:\s*<\/td>\s*<td>\s*#?(\d+)/) || [])[1];
  const typeCellAt = block.lastIndexOf('<td class="cen">');
  const typeCell = typeCellAt >= 0 ? block.slice(typeCellAt) : block;
  const formTypes = [];
  const rowRe = /<tr>\s*<td width="50%">([\s\S]*?)<\/td>\s*<td width="50%">([\s\S]*?)<\/td>\s*<\/tr>/g;
  let m;
  while ((m = rowRe.exec(typeCell))) {
    const label = textOf(m[1]);
    const types = typesIn(m[2]);
    if (label && types.length) formTypes.push({ label, types });
  }
  return {
    at,
    en,
    de,
    dex: dexRaw ? Number(dexRaw) : null,
    types: formTypes.length ? formTypes[0].types : typesIn(typeCell),
    formTypes,
  };
}

function imageFile(src) {
  const m = String(src || '').match(/\/(\d{3,4}(?:-[a-z0-9]+)?\.png)$/i);
  return m ? m[1] : null;
}

function homeImage(file) {
  return file ? `${IMAGE_BASE}${file}` : null;
}

function padDex(dex) {
  return Number.isFinite(dex) ? String(dex).padStart(3, '0') : null;
}

const escapeRe = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// „Alolan Ninetales" -> „Alolan Ninetales"; „Frost Rotom" -> „Rotom-Frost";
// „Eternal Floette" -> „Floette-Eternal".
function formNameEn(label, en) {
  const l = String(label || '').trim();
  const first = norm(l).split(' ')[0];
  if (REGION_DE[first]) return l.toLowerCase().includes(norm(en)) ? l : `${l} ${en}`;
  const rest = l.replace(new RegExp(`\\b${escapeRe(en)}\\b`, 'i'), '').replace(/\s+/g, ' ').trim();
  return rest ? `${en}-${rest.replace(/\s+/g, '-')}` : en;
}

// Deutscher Vorschlag für eine Form. Nur die eingeführten Muster werden gesetzt, alles
// andere bekommt die Form in Klammern — der Name bleibt in der Oberfläche änderbar.
function formNameDe(label, en, de) {
  const words = norm(label).split(' ').filter((w) => w !== norm(en));
  const first = words[0];
  if (REGION_DE[first]) return `${REGION_DE[first]}-${de}`;
  if (words.length === 1 && FORM_DE[first]) return `${FORM_DE[first]}-${de}`;
  const rest = String(label || '').replace(new RegExp(`\\b${escapeRe(en)}\\b`, 'i'), '').trim();
  return rest ? `${de} (${rest})` : de;
}

// „Mega -Glurak" (so steht es auf der Seite) -> „Mega-Glurak", plus X/Y/Z der Überschrift.
function megaNameDe(raw, headline) {
  let name = String(raw || '').replace(/^Mega\s*-?\s*/i, 'Mega-').replace(/\s+/g, ' ').trim();
  if (!/^Mega-/i.test(name)) name = `Mega-${name}`;
  const suffix = (String(headline || '').match(/\s([XYZ])$/) || [])[1];
  if (suffix && !new RegExp(`\\s${suffix}$`).test(name)) name = `${name} ${suffix}`;
  return name;
}

// Bilder der Wechselformen: <img … alt="Fan Rotom" class="formpic">.
function formPics(t) {
  const out = [];
  const re = /<img src="([^"]+)"[^>]*alt="([^"]+)"[^>]*class="formpic"/g;
  let m;
  while ((m = re.exec(t))) out.push({ src: m[1], label: decodeEntities(m[2]) });
  return out;
}

// Passt ein Bild-/Typlabel zu einer Formbezeichnung? „Alola Form" ~ „Alolan Ninetales".
function labelMatches(a, b) {
  const wa = norm(a).split(' ').filter((w) => w.length > 2 && w !== 'form');
  const wb = norm(b).split(' ').filter((w) => w.length > 2 && w !== 'form');
  return wa.some((x) => wb.some((y) => x === y || x.slice(0, 4) === y.slice(0, 4)));
}

/**
 * Alle Pokémon einer Champions-Seite.
 * @returns {Array<{ key, label, kind: 'base'|'form'|'mega', name, name_en, dex, types, stats, base_speed, image }>}
 */
export function parseChampionsPage(html) {
  const t = clean(html);
  const megaAt = [...t.matchAll(/<h3>(Mega [^<]+)<\/h3>/g)].map((m) => ({ at: m.index, headline: textOf(m[1]) }));
  const baseEnd = megaAt.length ? megaAt[0].at : t.length;
  const base = nameBlock(t, 0);
  if (!base || !base.en) throw new Error('Auf der Seite steht kein Pokémon.');
  const dexPad = padDex(base.dex);
  const out = [];

  // Regulärer Sprite der Seite — bei Floette ist das schon die Ewige Blume.
  const sprite = imageFile((t.match(/<img[^>]*src="([^"]+)"[^>]*alt="Normal Sprite"/) || [])[1]);
  const pics = formPics(t.slice(0, baseEnd));

  // Statistik-Abschnitte der Grundform und ihrer Formen.
  const sections = [...t.slice(0, baseEnd).matchAll(/<h2>Stats(?:\s*-\s*([^<]*))?<\/h2>/g)]
    .map((m) => ({ at: m.index, label: textOf(m[1] || '') }));

  sections.forEach((sec, i) => {
    const st = statsAfter(t, sec.at);
    if (!st) return;
    if (sec.label.toLowerCase() === 'alternate forms') {
      // Gemeinsame Werte aller Wechselformen (Rotom): ein Vorschlag je Formbild, außer der Grundform.
      pics.slice(1).forEach((p) => {
        const types = base.formTypes.find((f) => norm(f.label) === norm(p.label))?.types
          || base.formTypes.find((f) => labelMatches(f.label, p.label))?.types
          || base.types;
        out.push({
          key: `form-${norm(p.label).replace(/ /g, '-')}`,
          label: p.label,
          kind: 'form',
          name: formNameDe(p.label, base.en, base.de),
          name_en: formNameEn(p.label, base.en),
          dex: base.dex,
          types,
          stats: st.stats,
          base_speed: st.stats.spe,
          image: homeImage(imageFile(p.src)),
        });
      });
      return;
    }
    const labelled = sec.label && norm(sec.label) !== norm(base.en);
    if (i === 0 || !labelled) {
      if (out.some((v) => v.kind === 'base')) return;
      out.push({
        key: 'base',
        label: labelled ? sec.label : base.en,
        kind: 'base',
        name: labelled ? formNameDe(sec.label, base.en, base.de) : base.de || base.en,
        name_en: labelled ? formNameEn(sec.label, base.en) : base.en,
        dex: base.dex,
        types: base.types,
        stats: st.stats,
        base_speed: st.stats.spe,
        image: homeImage(sprite || (dexPad ? `${dexPad}.png` : null)),
      });
      return;
    }
    const types = base.formTypes.find((f) => labelMatches(f.label, sec.label))?.types || base.types;
    const pic = pics.find((p) => labelMatches(p.label, sec.label));
    out.push({
      key: `form-${norm(sec.label).replace(/ /g, '-')}`,
      label: sec.label,
      kind: 'form',
      name: formNameDe(sec.label, base.en, base.de),
      name_en: formNameEn(sec.label, base.en),
      dex: base.dex,
      types,
      stats: st.stats,
      base_speed: st.stats.spe,
      image: homeImage(imageFile(pic?.src) || (dexPad ? `${dexPad}.png` : null)),
    });
  });

  // Mega-Entwicklungen: je Überschrift ein eigener Abschnitt mit Namen, Typen und Werten.
  megaAt.forEach((mega, i) => {
    const end = i + 1 < megaAt.length ? megaAt[i + 1].at : t.length;
    const region = t.slice(mega.at, end);
    const block = nameBlock(region, 0);
    const st = statsAfter(region, 0);
    if (!st) return;
    const img = imageFile((region.match(/<td class="pkmn"><img src="([^"]+)"/) || [])[1]);
    out.push({
      key: `mega-${norm(mega.headline).replace(/ /g, '-')}`,
      label: mega.headline,
      kind: 'mega',
      name: megaNameDe(block?.de || base.de, mega.headline),
      name_en: mega.headline,
      dex: block?.dex ?? base.dex,
      types: block?.types?.length ? block.types : base.types,
      stats: st.stats,
      base_speed: st.stats.spe,
      image: homeImage(img),
    });
  });

  if (!out.length) throw new Error('Auf der Seite stehen keine Basiswerte.');
  return out;
}
