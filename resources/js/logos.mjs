// Vereinswappen: ein Dateiname aus `public/img/teams/` (ausgelieferte Wappen) oder —
// seit Vereine über die Oberfläche entstehen — eine vollständige Adresse bzw. ein
// hochgeladenes Bild als data-URL. Framework-frei.

export const LOGO_BASE = './img/teams/';

/** Bildquelle eines Wappens; leer, wenn keins hinterlegt ist. */
export function logoSrc(file, base = LOGO_BASE) {
  const v = String(file || '').trim();
  if (!v) return '';
  if (/^(https?:|data:image\/|blob:)/i.test(v) || v.startsWith('./') || v.startsWith('/')) return v;
  return `${base}${v}`;
}
