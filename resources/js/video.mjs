// Videos zu einem Match. Ein Video deckt immer alle drei Kämpfe ab und hängt
// deshalb am Ergebnis-Dokument, nicht am einzelnen Kampf.
// Framework-frei (kein Alpine, kein Firebase) — damit unter Node testbar.
//
// Eingebettet wird ausschließlich, was sich sicher als YouTube erkennen lässt.
// Alles andere bleibt ein Link: ein fremder Host in einem iframe ist eine Wette,
// die man an dieser Stelle nicht eingehen muss.

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Eingabe säubern: getrimmt, nur http/https, sonst leer. */
export function normalizeVideoUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.toString();
  } catch {
    return '';
  }
}

// „1h2m3s" oder „83" -> Sekunden. Alles andere -> 0.
function toSeconds(raw) {
  const s = String(raw || '').trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

/** Die YouTube-Video-ID aus allen gängigen Adressformen, oder null. */
export function youtubeId(url) {
  const clean = normalizeVideoUrl(url);
  if (!clean) return null;
  let u;
  try { u = new URL(clean); } catch { return null; }
  const host = u.hostname.replace(/^www\./i, '').toLowerCase();

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return YT_ID.test(id) ? id : null;
  }
  if (!/(^|\.)(youtube\.com|youtube-nocookie\.com)$/i.test(host)) return null;

  const v = u.searchParams.get('v');
  if (v && YT_ID.test(v)) return v;

  const parts = u.pathname.split('/').filter(Boolean);
  const i = parts.findIndex((p) => ['embed', 'shorts', 'live', 'v'].includes(p));
  const id = i >= 0 ? parts[i + 1] : null;
  return id && YT_ID.test(id) ? id : null;
}

/**
 * Was sich aus einer Adresse machen lässt:
 *   { kind: 'youtube'|'link', url, embedUrl, thumbUrl, start }
 * `embedUrl` ist null, wenn sich nichts einbetten lässt — dann bleibt der Link.
 */
export function videoEmbed(url) {
  const clean = normalizeVideoUrl(url);
  if (!clean) return null;
  const id = youtubeId(clean);
  if (!id) return { kind: 'link', url: clean, embedUrl: null, thumbUrl: null, start: 0 };

  let start = 0;
  try {
    const u = new URL(clean);
    start = toSeconds(u.searchParams.get('t') || u.searchParams.get('start') || '');
  } catch { /* der Zeitstempel ist Beiwerk */ }

  const params = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' });
  if (start > 0) params.set('start', String(start));
  return {
    kind: 'youtube',
    url: clean,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`,
    thumbUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    start,
  };
}

/** Kurzform für die Anzeige: „youtube.com" statt der ganzen Adresse. */
export function videoHostLabel(url) {
  const clean = normalizeVideoUrl(url);
  if (!clean) return '';
  try { return new URL(clean).hostname.replace(/^www\./i, ''); } catch { return ''; }
}
