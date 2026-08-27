// Optik der Awards: gezeichnete Siegel (Pin klein, Medaille groß) als SVG-String.
// Framework-frei, damit die gleiche Geometrie in der App, in der Siegerehrung und
// im Entwurf identisch aussieht.
//
// Jedes Award ist über drei Achsen unterscheidbar — Emaille-Farbe, Grundform und
// Gravur. Dadurch bleibt es auch bei 18 px am Pokémon-Bild erkennbar.

// Emaille-Paletten: enamel = Ring/Akzent, tone = Gravur, deep = Ordensband.
const ENAMEL = {
  gold: { enamel: '#ffcb05', tone: '#fff3b0', deep: '#7a5a00' },
  crimson: { enamel: '#e3350d', tone: '#ffb4a0', deep: '#6e1a05' },
  azure: { enamel: '#4d90d5', tone: '#bcd9f4', deep: '#1d3f63' },
  jade: { enamel: '#63bc5a', tone: '#c2ebbc', deep: '#224b1e' },
  violet: { enamel: '#ab6ac8', tone: '#e2c2f0', deep: '#3f2150' },
  slate: { enamel: '#98a2b3', tone: '#d7dde6', deep: '#333a46' },
  bronze: { enamel: '#c08552', tone: '#edcda9', deep: '#4a2f16' },
  teal: { enamel: '#40c0b0', tone: '#b3ece5', deep: '#134641' },
  amber: { enamel: '#ff9d55', tone: '#ffd8b6', deep: '#5f3208' },
};

// shape: disc | rosette | shield | hex | bar
// glyph: Schlüssel aus GLYPHS
export const AWARD_STYLE = {
  // Spieltag
  'mon-of-day': { enamel: 'gold', shape: 'rosette', glyph: 'star' },
  'flop-of-day': { enamel: 'slate', shape: 'hex', glyph: 'arrowDown' },
  'surprise-of-day': { enamel: 'azure', shape: 'hex', glyph: 'spark' },
  // Saison
  'best-mon': { enamel: 'gold', shape: 'rosette', glyph: 'crown' },
  surprise: { enamel: 'violet', shape: 'disc', glyph: 'spark' },
  disappointment: { enamel: 'slate', shape: 'disc', glyph: 'arrowDown' },
  killking: { enamel: 'crimson', shape: 'disc', glyph: 'swords' },
  survivalking: { enamel: 'jade', shape: 'shield', glyph: 'heart' },
  'best-offense': { enamel: 'crimson', shape: 'shield', glyph: 'sword' },
  'best-defense': { enamel: 'azure', shape: 'shield', glyph: 'shield' },
  'best-support': { enamel: 'teal', shape: 'disc', glyph: 'plus' },
  'best-disruptor': { enamel: 'amber', shape: 'hex', glyph: 'bolt' },
  'best-fieldsetter': { enamel: 'teal', shape: 'hex', glyph: 'field' },
  'best-partners': { enamel: 'violet', shape: 'disc', glyph: 'link' },
  'biggest-threat': { enamel: 'crimson', shape: 'hex', glyph: 'target' },
  'best-tier-s': { enamel: 'crimson', shape: 'bar', glyph: 'letterS' },
  'best-tier-a': { enamel: 'gold', shape: 'bar', glyph: 'letterA' },
  'best-tier-b': { enamel: 'azure', shape: 'bar', glyph: 'letterB' },
  'best-tier-c': { enamel: 'jade', shape: 'bar', glyph: 'letterC' },
  'best-tier-d': { enamel: 'slate', shape: 'bar', glyph: 'letterD' },
  'best-match': { enamel: 'gold', shape: 'disc', glyph: 'versus' },
  'best-draft': { enamel: 'bronze', shape: 'shield', glyph: 'pokeball' },
  'best-transfer': { enamel: 'azure', shape: 'disc', glyph: 'transfer' },
  'best-mega': { enamel: 'violet', shape: 'rosette', glyph: 'gem' },
  'best-no-mega': { enamel: 'slate', shape: 'rosette', glyph: 'gemOff' },
  'team-mvp': { enamel: 'gold', shape: 'shield', glyph: 'star' },
};

const FALLBACK = { enamel: 'slate', shape: 'disc', glyph: 'star' };

// Gravuren, jeweils gezeichnet in einer 24×24-Box (Strichstärke 2, currentColor).
const GLYPHS = {
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z"/>',
  crown: '<path d="M3.5 17.5l1.2-9 4.1 3.7L12 5.5l3.2 6.7 4.1-3.7 1.2 9z"/><path d="M4.6 20.5h14.8"/>',
  arrowDown: '<path d="M12 4.5v13"/><path d="M6.2 11.8L12 17.6l5.8-5.8"/>',
  spark: '<path d="M12 3v5"/><path d="M12 16v5"/><path d="M4.6 12h5"/><path d="M14.4 12h5"/><path d="M6.9 6.9l3 3"/><path d="M14.1 14.1l3 3"/><path d="M17.1 6.9l-3 3"/><path d="M9.9 14.1l-3 3"/>',
  swords: '<path d="M5 4.5l9.5 9.5"/><path d="M19 4.5L9.5 14"/><path d="M4.2 18.4l3-3"/><path d="M19.8 18.4l-3-3"/><path d="M7.6 21l-3.4-3.4"/><path d="M16.4 21l3.4-3.4"/>',
  sword: '<path d="M18.5 3.5L9 13v4.5"/><path d="M14 3.5h4.5V8"/><path d="M5.5 20.5l4-4"/><path d="M4 15.5L8.5 20"/>',
  shield: '<path d="M12 3.5l7 2.6v5.6c0 4.1-2.8 7.2-7 8.8-4.2-1.6-7-4.7-7-8.8V6.1z"/>',
  heart: '<path d="M12 20.2S4 15.6 4 10.2A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 8 2.2c0 5.4-8 10-8 10z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  bolt: '<path d="M13.5 2.5L5 13.5h6l-1.5 8 8.5-11h-6z"/>',
  field: '<path d="M3.5 8.5h17"/><path d="M3.5 15.5h17"/><path d="M9 4.5L6 19.5"/><path d="M18 4.5l-3 15"/>',
  link: '<path d="M9.5 14.5a4 4 0 0 1 0-5.6l2-2a4 4 0 0 1 5.7 5.6l-1 1"/><path d="M14.5 9.5a4 4 0 0 1 0 5.6l-2 2a4 4 0 0 1-5.7-5.6l1-1"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1.8v3.4"/><path d="M12 18.8v3.4"/><path d="M1.8 12h3.4"/><path d="M18.8 12h3.4"/>',
  versus: '<path d="M3.5 5.5l3.8 12 3.8-12"/><path d="M20.5 5.5h-4.6l-1 5.5h4.1l-1 6.5"/>',
  pokeball: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h4.6"/><path d="M15.9 12h4.6"/><circle cx="12" cy="12" r="2.6"/>',
  transfer: '<path d="M4 8.5h12"/><path d="M13 5.5l3 3-3 3"/><path d="M20 15.5H8"/><path d="M11 12.5l-3 3 3 3"/>',
  gem: '<path d="M12 2.8l6.8 5-2.6 11.4H7.8L5.2 7.8z"/><path d="M8.2 8.2h7.6"/><path d="M12 8.2v11"/>',
  gemOff: '<path d="M12 2.8l6.8 5-2.6 11.4H7.8L5.2 7.8z"/><path d="M4.5 4.5l15 15"/>',
  letterS: 'TEXT:S',
  letterA: 'TEXT:A',
  letterB: 'TEXT:B',
  letterC: 'TEXT:C',
  letterD: 'TEXT:D',
};

// Grundformen, definiert in einem 100×100-Feld mit Mittelpunkt (50,50), r = 42.
function shapePath(shape) {
  if (shape === 'hex') return 'M50 8l36.4 21v42L50 92 13.6 71V29z';
  if (shape === 'shield') return 'M50 8l36 13v34c0 21-14.5 34.5-36 41-21.5-6.5-36-20-36-41V21z';
  if (shape === 'bar') return 'M18 20h64a10 10 0 0 1 10 10v40a10 10 0 0 1-10 10H18A10 10 0 0 1 8 70V30a10 10 0 0 1 10-10z';
  if (shape === 'rosette') {
    // 16-zackiger Ordensrand: abwechselnd r=46 und r=39.
    const pts = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 46 : 38;
      pts.push(`${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`);
    }
    return `M${pts.join('L')}Z`;
  }
  return 'M50 8a42 42 0 1 1 0 84 42 42 0 0 1 0-84z';
}

function glyphMarkup(glyph, color, scale, cx, cy) {
  const raw = GLYPHS[glyph] || GLYPHS.star;
  if (raw.startsWith('TEXT:')) {
    const letter = raw.slice(5);
    return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${color}" font-family="inherit" font-size="${(scale * 108).toFixed(1)}" font-weight="900">${letter}</text>`;
  }
  const f = (scale * 100) / 24;
  return `<g transform="translate(${cx} ${cy}) scale(${f.toFixed(4)}) translate(-12 -12)" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${raw}</g>`;
}

// Ein Siegel als SVG-String.
//   variant 'pin'    — kompakt, für die Ecke eines Pokémon-Bildes
//   variant 'medal'  — groß, mit Ordensband (Siegerehrung, Katalog)
export function awardSvg(key, { variant = 'pin', title = '' } = {}) {
  const st = AWARD_STYLE[key] || FALLBACK;
  const col = ENAMEL[st.enamel] || ENAMEL.slate;
  const body = shapePath(st.shape);
  const label = title ? `<title>${title}</title>` : '';

  if (variant === 'medal') {
    return `<svg viewBox="-6 -6 112 152" class="award-medal" role="img" aria-hidden="${title ? 'false' : 'true'}">${label}
      <path d="M32 74L20 140l30-16 30 16-12-66z" fill="${col.deep}"/>
      <path d="M32 74L20 140l30-16 30 16-12-66z" fill="none" stroke="${col.enamel}" stroke-width="2" stroke-opacity="0.55"/>
      <path d="${body}" fill="#0b0d12"/>
      <path d="${body}" fill="${col.enamel}" fill-opacity="0.14"/>
      <path d="${body}" fill="none" stroke="${col.enamel}" stroke-width="4"/>
      <circle cx="50" cy="50" r="31" fill="none" stroke="${col.enamel}" stroke-width="1.5" stroke-opacity="0.5"/>
      ${glyphMarkup(st.glyph, col.tone, 0.46, 50, 50)}
    </svg>`;
  }

  return `<svg viewBox="-4 -4 108 128" class="award-pin" role="img" aria-hidden="${title ? 'false' : 'true'}">${label}
    <path d="M34 78L26 118l24-13 24 13-8-40z" fill="${col.deep}"/>
    <path d="${body}" fill="#0b0d12"/>
    <path d="${body}" fill="${col.enamel}" fill-opacity="0.18"/>
    <path d="${body}" fill="none" stroke="${col.enamel}" stroke-width="7"/>
    ${glyphMarkup(st.glyph, col.tone, 0.52, 50, 50)}
  </svg>`;
}

// Emaille-Farbe eines Awards (für Rahmen, Text, Glow außerhalb des SVG).
export function awardColor(key) {
  const st = AWARD_STYLE[key] || FALLBACK;
  return (ENAMEL[st.enamel] || ENAMEL.slate).enamel;
}
export function awardTone(key) {
  const st = AWARD_STYLE[key] || FALLBACK;
  return (ENAMEL[st.enamel] || ENAMEL.slate).tone;
}
