// Trainer eines Teams — framework-frei, damit die Logik unter Node testbar bleibt.
//
// Trainer sind eine eigene Position: sie kämpfen nicht, stehen in keinem Draft und
// tauchen in keiner Statistik auf. Gespeichert werden sie als Array im Team-Dokument
// (`teams/<id>.trainers`), damit kein zusätzlicher Snapshot-Listener und keine neue
// Firestore-Regel nötig sind.
//
// Amtszeit wird in Liga-Einheiten geführt, nicht in Kalenderdaten:
//   fromDay  = null -> „vor der Saison" (Pre), sonst der erste Spieltag im Amt
//   untilDay = null -> amtierend, sonst der letzte Spieltag im Amt

export const GENDERS = [
  { key: 'm', label: 'männlich' },
  { key: 'w', label: 'weiblich' },
  { key: 'd', label: 'divers' },
];

const GENDER_BY_KEY = Object.fromEntries(GENDERS.map((g) => [g.key, g]));

// Schreibweisen aus dem Startdatensatz und der Oberfläche auf den Schlüssel abbilden.
export function normalizeGender(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return 'd';
  if (v === 'm' || v.startsWith('männ') || v.startsWith('mann') || v === 'male') return 'm';
  if (v === 'w' || v === 'f' || v.startsWith('weib') || v === 'female') return 'w';
  return 'd';
}

export function genderLabel(key) {
  return GENDER_BY_KEY[normalizeGender(key)]?.label || 'divers';
}

// „hohe Wellen schlagend, fröhlich" -> ['hohe Wellen schlagend', 'fröhlich']
export function parseTraits(value) {
  if (Array.isArray(value)) return value.map((t) => String(t).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

// Zeitraum-Angaben des Startdatensatzes: „S1 Pre", „S1 MD6", „Current".
function parseBoundary(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^current$/i.test(v) || /^aktuell$/i.test(v)) return null;
  if (/pre$/i.test(v)) return null;
  const md = v.match(/md\s*(\d+)/i) || v.match(/(\d+)\s*$/);
  return md ? Number(md[1]) : null;
}

// „S1 Pre-S1 MD5" / „S1 MD6-Current" / „S1 Pre-Current" -> { fromDay, untilDay }.
// Der Bindestrich in „S1 MD6-Current" trennt die Grenzen; Bindestriche innerhalb
// einer Grenze kommen im Format nicht vor.
export function parsePeriod(raw) {
  const v = String(raw || '').trim();
  if (!v) return { fromDay: null, untilDay: null };
  const i = v.indexOf('-');
  if (i < 0) return { fromDay: parseBoundary(v), untilDay: null };
  return { fromDay: parseBoundary(v.slice(0, i)), untilDay: parseBoundary(v.slice(i + 1)) };
}

let seq = 0;
export function trainerId(teamId, name) {
  const slug = String(name || 'trainer')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'trainer';
  return `${teamId || 't'}-${slug}-${Date.now().toString(36)}${(seq++).toString(36)}`;
}

// Rohdaten (Formular oder CSV) auf das Speicherformat normalisieren.
export function normalizeTrainer(raw, teamId) {
  const name = String(raw?.name || '').trim();
  return {
    id: raw?.id || trainerId(teamId, name),
    name,
    image: String(raw?.image || '').trim(),
    gender: normalizeGender(raw?.gender),
    traits: parseTraits(raw?.traits),
    fromDay: Number.isFinite(raw?.fromDay) ? raw.fromDay : null,
    untilDay: Number.isFinite(raw?.untilDay) ? raw.untilDay : null,
  };
}

// Chronologisch: früheste Amtszeit zuerst. „Pre" (null) gilt als Spieltag 0,
// ein laufendes Amt (untilDay null) als offenes Ende.
export function sortTrainers(list) {
  return [...(list || [])].sort((a, b) => {
    const fa = a?.fromDay ?? 0;
    const fb = b?.fromDay ?? 0;
    if (fa !== fb) return fa - fb;
    const ua = a?.untilDay ?? Number.POSITIVE_INFINITY;
    const ub = b?.untilDay ?? Number.POSITIVE_INFINITY;
    return ua - ub;
  });
}

// Amtierender Trainer: der mit offenem Ende, sonst keiner.
export function currentTrainer(list) {
  const sorted = sortTrainers(list);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i] && sorted[i].untilDay == null) return sorted[i];
  }
  return null;
}

// Historie (neueste zuerst) inklusive Kennzeichnung des laufenden Amts.
export function trainerHistory(list) {
  const sorted = sortTrainers(list);
  const cur = currentTrainer(list);
  return sorted
    .slice()
    .reverse()
    .map((t) => ({ ...t, current: !!cur && t.id === cur.id, period: periodLabel(t) }));
}

export function dayLabel(day, { open = 'heute', pre = 'vor der Saison' } = {}) {
  if (day == null) return open;
  if (day <= 0) return pre;
  return `Spieltag ${day}`;
}

// „Vor der Saison – Spieltag 5" bzw. „Ab Spieltag 6 – heute".
export function periodLabel(trainer) {
  const from = trainer?.fromDay == null ? 'Vor der Saison' : `Ab Spieltag ${trainer.fromDay}`;
  const until = trainer?.untilDay == null ? 'heute' : `Spieltag ${trainer.untilDay}`;
  return `${from} – ${until}`;
}

// Entlassen: das laufende Amt endet mit dem angegebenen Spieltag, der Nachfolger
// beginnt mit dem darauffolgenden. `latestDay` ist der jüngste gespielte Spieltag.
export function nextFromDay(list, latestDay) {
  const ends = (list || []).map((t) => t?.untilDay).filter((v) => Number.isFinite(v));
  const base = Number.isFinite(latestDay) ? [...ends, latestDay] : ends;
  if (!base.length) return null;
  return Math.max(...base) + 1;
}

// Ein Amt beenden und die Liste zurückgeben (reine Funktion, kein Schreibzugriff).
export function withDismissed(list, trainerId2, untilDay) {
  return (list || []).map((t) => (t && t.id === trainerId2 ? { ...t, untilDay: untilDay ?? null } : t));
}

// === Charakter-Eigenschaften der Pokémon ===================================
// Wie bei den Trainern, aber als freie Einträge statt kommagetrennt: ein Eintrag
// darf ein Stichwort oder ein ganzer Satz sein (und damit selbst Kommas tragen).
// Gespeichert am Team-Dokument unter `monTraits.<Pokémon-Name>`.
export const MAX_MON_TRAITS = 12;
export const MAX_MON_TRAIT_LENGTH = 240;

export function normalizeMonTraits(list) {
  const seen = new Set();
  const out = [];
  (Array.isArray(list) ? list : []).forEach((raw) => {
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_MON_TRAIT_LENGTH);
    const key = text.toLowerCase();
    if (!text || seen.has(key) || out.length >= MAX_MON_TRAITS) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

export function monTraitsOf(team, name) {
  const list = team?.monTraits?.[name];
  return Array.isArray(list) ? list : [];
}
