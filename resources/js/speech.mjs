// Vorlesen der Presse-Beiträge über die Web Speech API des Browsers.
// Framework-frei: keine Abhängigkeit, kein Konto, kein Schlüssel — gesprochen wird
// mit den Stimmen, die Betriebssystem bzw. Browser mitbringen. Die Synthese wird
// hereingereicht (`synth`, `Utterance`), damit die Logik unter Node testbar bleibt.
//
// Zwei Eigenheiten der Browser bestimmen den Aufbau:
// - Chrome bricht eine einzelne Äußerung nach rund 15 Sekunden kommentarlos ab.
//   Gesprochen wird deshalb in kurzen Stücken (Satzgrenzen, höchstens MAX_CHUNK Zeichen).
// - `pause()`/`resume()` sind auf Android und iOS unzuverlässig. Pausiert wird daher
//   über `cancel()` und die gemerkte Stelle; „Weiter" setzt am Anfang des Stücks an.

export const MAX_CHUNK = 220;
export const RATES = [0.8, 0.9, 1, 1.1, 1.25, 1.5];

// Hinweise im Stimmennamen, die auf eine neuronale bzw. hochwertige Stimme deuten
// (Edge „… Online (Natural)", Chrome „Google Deutsch", Apple „Premium/Enhanced").
const QUALITY_HINTS = [
  [/natural|neural/i, 60],
  [/online/i, 25],
  [/premium/i, 50],
  [/enhanced|erweitert/i, 40],
  [/google/i, 30],
  [/siri/i, 20],
];
// Bekannte, ordentliche deutsche Systemstimmen.
const GOOD_NAMES = /katja|conrad|amala|seraphina|florian|anna|petra|markus|helena|yannick|viktoria/i;
// Spielzeug- und Effektstimmen, die niemand für einen Artikel will.
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley/i;

/** Punktzahl einer Stimme für deutschen Text, höher ist besser; -1 = unbrauchbar. */
export function voiceScore(voice, lang = 'de') {
  if (!voice) return -1;
  const vl = String(voice.lang || '').toLowerCase().replace('_', '-');
  const want = lang.toLowerCase();
  if (!vl.startsWith(want)) return -1;
  let score = 100;
  if (vl === `${want}-de`) score += 15;
  const name = String(voice.name || '');
  QUALITY_HINTS.forEach(([re, pts]) => { if (re.test(name)) score += pts; });
  if (GOOD_NAMES.test(name)) score += 10;
  if (NOVELTY.test(name)) score -= 80;
  if (voice.default) score += 2;
  return score;
}

/** Brauchbare Stimmen für die Sprache, beste zuerst. */
export function rankVoices(voices, lang = 'de') {
  return (voices || [])
    .map((v) => ({ v, s: voiceScore(v, lang) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || String(a.v.name).localeCompare(String(b.v.name)))
    .map((x) => x.v);
}

/** Die gemerkte Stimme, sofern noch vorhanden — sonst die beste. */
export function pickVoice(voices, uri, lang = 'de') {
  const ranked = rankVoices(voices, lang);
  return ranked.find((v) => v.voiceURI === uri) || ranked[0] || null;
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Zerlegt Text in sprechbare Stücke: an Satzgrenzen, zu lange Sätze zusätzlich
 * an Komma/Semikolon/Gedankenstrich, notfalls an einem Leerzeichen.
 */
export function splitChunks(text, max = MAX_CHUNK) {
  const t = clean(text);
  if (!t) return [];
  const sentences = t.match(/[^.!?…]+(?:[.!?…]+["'»«“”)]*|$)\s*/g) || [t];
  const out = [];
  const push = (piece) => {
    let p = clean(piece);
    while (p.length > max) {
      const window = p.slice(0, max);
      let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(' – '), window.lastIndexOf(' — '));
      if (cut < max * 0.4) cut = window.lastIndexOf(' ');
      if (cut <= 0) cut = max;
      out.push(clean(p.slice(0, cut + 1)));
      p = clean(p.slice(cut + 1));
    }
    if (p) out.push(p);
  };
  let buf = '';
  sentences.forEach((s) => {
    const next = buf ? `${buf} ${clean(s)}` : clean(s);
    if (next.length <= max) { buf = next; return; }
    if (buf) push(buf);
    buf = clean(s);
  });
  if (buf) push(buf);
  return out.filter(Boolean);
}

/** „Name: Text" am Absatzanfang (Protokoll einer Sendung) — sonst null. */
export function speakerOf(text) {
  const m = clean(text).match(/^([^:.!?]{2,40}):\s+(.+)$/);
  return m ? { speaker: m[1].trim(), text: m[2].trim() } : null;
}

/**
 * Baut aus Kopf und Absätzen die Liste der Stücke.
 * `blocks`: [{ text, speaker? }] in Lesereihenfolge; `speaker` setzt, wer im Protokoll spricht.
 * Ergebnis: [{ text, block, speaker }] — `block` ist der Index des Absatzes (für die Markierung),
 * -1 für den Kopf.
 */
export function buildSegments({ title = '', subtitle = '', byline = '' } = {}, blocks = [], { announce = () => true } = {}) {
  const segs = [];
  const head = [subtitle, title].map(clean).filter(Boolean).map((s) => (/[.!?…]$/.test(s) ? s : `${s}.`));
  if (byline) head.push(`${clean(byline)}.`);
  head.forEach((h) => splitChunks(h).forEach((text) => segs.push({ text, block: -1, speaker: null })));
  let last = null;
  blocks.forEach((b, i) => {
    const speaker = b.speaker || null;
    let text = clean(b.text);
    if (!text) return;
    if (speaker && speaker !== last && announce(speaker)) text = `${speaker}: ${text}`;
    last = speaker || last;
    splitChunks(text).forEach((t) => segs.push({ text: t, block: i, speaker }));
  });
  return segs;
}

/**
 * Verteilt die Sprecher einer Sendung auf verschiedene Stimmen. Reichen die Stimmen
 * nicht, teilen sich Sprecher eine Stimme mit anderer Tonhöhe — und werden beim
 * Wechsel mit Namen angekündigt (`shared`).
 */
export function assignSpeakerVoices(speakers, voices, preferred = null) {
  const pool = preferred ? [preferred, ...voices.filter((v) => v !== preferred)] : [...voices];
  const map = {};
  const shared = new Set();
  const pitches = [1, 0.85, 1.15, 0.75, 1.25];
  const uniq = [...new Set(speakers.filter(Boolean))];
  uniq.forEach((sp, i) => {
    const voice = pool.length ? pool[i % pool.length] : null;
    const round = pool.length ? Math.floor(i / pool.length) : i;
    map[sp] = { voice, pitch: pitches[round % pitches.length] };
    if (uniq.length > pool.length) shared.add(sp);
  });
  return { map, shared };
}

/**
 * Steuerung des Vorlesens. `onChange(state)` meldet { status, index, total, block }.
 * status: 'idle' | 'playing' | 'paused'.
 */
export function createReader({ synth, Utterance, onChange = () => {} }) {
  let segs = [];
  let index = 0;
  let status = 'idle';
  let opts = { rate: 1, voice: null, voiceFor: null, lang: 'de-DE' };
  let token = 0;

  const emit = () => onChange({
    status, index, total: segs.length, block: segs[index]?.block ?? null,
  });

  const speakAt = (i) => {
    const my = ++token;
    if (i >= segs.length) { status = 'idle'; index = 0; emit(); return; }
    index = i;
    const seg = segs[i];
    const u = new Utterance(seg.text);
    const per = seg.speaker && opts.voiceFor ? opts.voiceFor(seg.speaker) : null;
    const voice = per?.voice || opts.voice;
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = opts.lang;
    u.rate = opts.rate;
    u.pitch = per?.pitch ?? 1;
    u.onend = () => { if (my === token && status === 'playing') speakAt(i + 1); };
    u.onerror = (e) => {
      if (my !== token || status !== 'playing') return;
      const err = e?.error;
      if (err === 'interrupted' || err === 'canceled') return;
      speakAt(i + 1);
    };
    status = 'playing';
    emit();
    synth.speak(u);
  };

  return {
    get status() { return status; },
    get index() { return index; },
    get total() { return segs.length; },
    play(list, o = {}) {
      token++;
      synth.cancel();
      segs = list || [];
      opts = { ...opts, ...o };
      speakAt(0);
    },
    pause() {
      if (status !== 'playing') return;
      status = 'paused';
      token++;
      synth.cancel();
      emit();
    },
    resume() {
      if (status !== 'paused') return;
      speakAt(index);
    },
    // Springt um `delta` Absätze (bzw. Stücke im Kopf) vor oder zurück.
    skip(delta) {
      if (!segs.length) return;
      const cur = segs[index]?.block ?? -1;
      let i = index;
      if (delta > 0) {
        while (i < segs.length && segs[i].block === cur) i++;
      } else {
        while (i > 0 && segs[i - 1].block === cur) i--;
        // Am Absatzanfang geht es einen Absatz zurück, sonst an seinen Anfang.
        if (i === index && i > 0) {
          const prev = segs[i - 1].block;
          i--;
          while (i > 0 && segs[i - 1].block === prev) i--;
        }
      }
      if (i >= segs.length) { this.stop(); return; }
      token++;
      synth.cancel();
      if (status === 'paused') { index = i; emit(); return; }
      speakAt(i);
    },
    // Neue Geschwindigkeit/Stimme gilt ab dem laufenden Stück.
    update(o = {}) {
      opts = { ...opts, ...o };
      if (status === 'playing') { token++; synth.cancel(); speakAt(index); }
    },
    stop() {
      token++;
      synth.cancel();
      status = 'idle';
      index = 0;
      segs = [];
      emit();
    },
  };
}
