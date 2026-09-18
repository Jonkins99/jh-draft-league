// Brücke zur Gemini Developer API (generativelanguage.googleapis.com).
// Bewusst ohne SDK: ein einziger POST mit fetch reicht und kostet kein Bundle.
//
// Der API-Key liegt GERÄTELOKAL (localStorage, siehe PRESS_KEY in main.js) und wird
// nie nach Firestore geschrieben — die Datenbank ist offen lesbar, ein Key hätte darin
// nichts verloren. Ohne Key bleibt die Presse-Ansicht bedienbar, es entstehen nur keine
// neuen Beiträge.

export const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', hint: 'Aktuellstes Flash — Standard.' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', hint: 'Eine Stufe darunter, günstiger.' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', hint: 'Am günstigsten, knappere Texte.' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)', hint: 'Vorschau, kann sich ändern.' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', hint: 'Langsamer, stilistisch am stärksten.' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'Vorgänger-Generation.' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', hint: 'Vorgänger-Generation, stärkerer Stil.' },
];

export const DEFAULT_MODEL = 'gemini-3.8-flash';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const isGen3 = (model) => /^gemini-3/.test(String(model || ''));

// Zwei Schlüsselformate im Umlauf: die alten `AIza…` gehören in den Header `x-goog-api-key`,
// die neuen `AQ.…` („Authentication Key", seit 2026 das einzige, was AI Studio ausgibt)
// werden dort als Access-Token gelesen und mit ACCESS_TOKEN_TYPE_UNSUPPORTED abgewiesen —
// sie gehören in `Authorization: Bearer`. Schlägt das eine fehl, probiert generateJson
// automatisch das andere, damit ein Formatwechsel bei Google hier nichts umwirft.
function authHeader(apiKey, scheme) {
  return scheme === 'bearer' ? { Authorization: `Bearer ${apiKey}` } : { 'x-goog-api-key': apiKey };
}

function preferredScheme(apiKey) {
  return String(apiKey || '').startsWith('AQ.') ? 'bearer' : 'key';
}

// Alle aktuellen Modelle denken vor der Antwort, und die Denk-Tokens zählen gegen
// `maxOutputTokens`. Ohne Deckel frisst das Denken bei knappem Budget die gesamte Antwort
// auf: die Anfrage gelingt, `parts` bleibt leer, finishReason ist MAX_TOKENS. Die
// 3er-Generation steuert das über `thinkingLevel` (minimal|low|medium|high), die 2.5er über
// ein Token-Budget; beides zusammen in einer Anfrage ist ein Fehler.
function thinkingConfigFor(model, level) {
  if (isGen3(model)) return { thinkingLevel: level || 'low' };
  if (/2\.5/.test(String(model || ''))) return { thinkingBudget: level === 'minimal' ? 0 : 1024 };
  return null;
}

export class GeminiError extends Error {
  // `retryable` unterscheidet das, was beim naechsten Anlauf anders ausgehen kann
  // (Ueberlastung, Kontingent, abgeschnittene oder unlesbare Antwort), von dem, was
  // ohne Zutun nie gelingt (falscher Schluessel, unbekanntes Modell).
  constructor(message, { status = 0, detail = '', retryable = false, model = '', truncated = false } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.detail = detail;
    this.retryable = retryable;
    this.model = model;
    // Abgeschnitten heisst: der naechste Anlauf braucht mehr Platz, nicht nur Geduld.
    this.truncated = truncated;
  }
}

// Antwort-Schema im OpenAPI-Subset. `propertyOrdering` hilft dem Modell, die Felder in
// einer sinnvollen Reihenfolge zu erzeugen (erst denken, dann formulieren).
export function schemaOf(properties, required = []) {
  return {
    type: 'OBJECT',
    properties,
    required,
    propertyOrdering: Object.keys(properties),
  };
}

export const S = {
  string: (description) => ({ type: 'STRING', description }),
  number: (description) => ({ type: 'NUMBER', description }),
  bool: (description) => ({ type: 'BOOLEAN', description }),
  enum: (values, description) => ({ type: 'STRING', enum: values, description }),
  array: (items, description) => ({ type: 'ARRAY', items, description }),
  object: (properties, required = [], description) => ({ ...schemaOf(properties, required), description }),
};

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p?.text || '').join('').trim();
}

// Manche Antworten kommen trotz responseMimeType in einen Codeblock gewickelt.
function parseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new GeminiError('Die Antwort war kein gültiges JSON.', { detail: cleaned.slice(0, 400), retryable: true });
  }
}

// Ein einzelner Anlauf. Die Wiederholung liegt eine Ebene darüber in `generateJson`.
async function attemptGenerate({
  apiKey, model = DEFAULT_MODEL, system, prompt, schema, media = null,
  temperature = 1.15, maxOutputTokens = 4096, signal = null, thinking = null,
}) {
  if (!apiKey) throw new GeminiError('Kein API-Key hinterlegt.');

  const think = thinkingConfigFor(model, thinking);
  // Anhänge stehen vor dem Text: das Modell soll erst hören, dann die Anweisung lesen.
  const parts = [
    ...(media || []).filter((m) => m?.data).map((m) => ({ inlineData: { mimeType: m.mimeType || 'audio/webm', data: m.data } })),
    { text: prompt },
  ];
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      // Die 3er-Generation läuft ausdrücklich auf Temperatur 1.0; abweichende Werte
      // lassen sie bei längeren Texten in Wiederholungen laufen.
      temperature: isGen3(model) ? 1 : temperature,
      topP: 0.95,
      maxOutputTokens,
      responseMimeType: 'application/json',
      ...(schema ? { responseSchema: schema } : {}),
      ...(think ? { thinkingConfig: think } : {}),
    },
    // Die Liga lebt von zugespitzten Zitaten und Sticheleien; die Standardfilter
    // greifen dafür zu früh. Harte Kategorien bleiben unangetastet.
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
  const send = async (scheme, payload) => {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(apiKey, scheme) },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      throw new GeminiError('Die Redaktion ist nicht erreichbar (Netzwerkfehler).', { detail: String(e), retryable: true, model });
    }
    if (res.ok) return { res, data: await res.json() };
    let detail = '';
    let reason = '';
    try {
      const err = await res.json();
      detail = err?.error?.message || '';
      reason = err?.error?.details?.find((d) => d?.reason)?.reason || err?.error?.status || '';
    } catch (e) { /* Fehlertext nicht auswertbar — Status reicht */ }
    return { res, detail, reason };
  };

  const scheme = preferredScheme(apiKey);
  let out = await send(scheme, body);

  // Das Schlüsselformat sagt nur, was wahrscheinlich passt. Wird es abgewiesen, ist das
  // andere Verfahren einen Versuch wert, bevor der Fehler beim Nutzer landet.
  if (!out.res.ok && out.res.status === 401) {
    const alt = await send(scheme === 'bearer' ? 'key' : 'bearer', body);
    if (alt.res.ok || alt.res.status !== 401) out = alt;
  }

  // `thinkingLevel` ist jung; sollte es ein Modell noch nicht kennen, lieber ohne
  // Denksteuerung antworten als gar nicht.
  if (!out.res.ok && out.res.status === 400 && /thinking/i.test(out.detail || '')) {
    const { thinkingConfig, ...rest } = body.generationConfig;
    out = await send(scheme, { ...body, generationConfig: rest });
  }

  if (!out.res.ok) {
    const { res, detail = '', reason = '' } = out;
    const both = `${reason} ${detail}`;
    const msg = /ACCESS_TOKEN_TYPE_UNSUPPORTED|API_KEY_SERVICE_BLOCKED/i.test(both)
        ? 'Der Schlüssel wird für die Gemini-API nicht akzeptiert — in Google AI Studio prüfen, ob er für die Generative Language API freigegeben ist.'
      : /API_KEY_INVALID|API key not valid/i.test(both)
        ? 'Der API-Key wurde abgelehnt — bitte neu aus dem AI Studio kopieren.'
      : /SERVICE_DISABLED|has not been used in project|is disabled/i.test(detail)
        ? 'Die Generative Language API ist im Google-Projekt des Keys nicht aktiviert.'
      : res.status === 401 ? 'Der Schlüssel wurde nicht akzeptiert.'
      : res.status === 403 ? 'Zugriff verweigert — API-Key prüfen.'
      : res.status === 429 ? 'Kontingent erschöpft — später erneut versuchen.'
      : res.status === 404 ? `Modell „${model}" ist für diesen Schlüssel nicht verfügbar.`
      : res.status >= 500 ? 'Die Redaktion antwortet gerade nicht (Serverfehler).'
      : `Anfrage fehlgeschlagen (HTTP ${res.status}).`;
    // Überlastung, Kontingent und Serverfehler sind Zustände, keine Fehler in der Anfrage.
    const retryable = res.status === 429 || res.status >= 500 || res.status === 408;
    throw new GeminiError(detail ? `${msg} (${detail})` : msg, { status: res.status, detail, retryable, model });
  }

  const data = out.data;
  const blocked = data?.promptFeedback?.blockReason;
  if (blocked) throw new GeminiError(`Die Anfrage wurde blockiert (${blocked}).`, { model });
  const finish = data?.candidates?.[0]?.finishReason;
  const text = extractText(data);
  if (!text) {
    const msg = finish === 'MAX_TOKENS' ? 'Die Antwort wurde abgeschnitten — bitte erneut versuchen.'
      : finish === 'SAFETY' ? 'Die Antwort wurde von den Inhaltsfiltern gestoppt.'
      : finish === 'RECITATION' ? 'Die Antwort wurde wegen Zitat-Erkennung gestoppt.'
      : `Die Antwort war leer${finish ? ` (${finish})` : ''}.`;
    // Eine abgeschnittene oder leere Antwort geht beim nächsten Anlauf oft durch;
    // ein Inhaltsfilter dagegen nie.
    throw new GeminiError(msg, {
      detail: JSON.stringify(data?.usageMetadata || {}),
      retryable: finish === 'MAX_TOKENS' || !finish,
      model,
      truncated: finish === 'MAX_TOKENS',
    });
  }
  return parseJson(text);
}

// Wie oft ein Anlauf, der beim nächsten Mal anders ausgehen kann, wiederholt wird.
export const GEMINI_ATTEMPTS = 3;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Einen JSON-Datensatz erzeugen lassen — mit Wiederholung bei Zuständen, die vorübergehen.
 *
 * Ein überlastetes Modell, ein erschöpftes Minutenkontingent, eine abgeschnittene oder
 * unlesbare Antwort: das sind keine Fehler in der Anfrage, sondern Momente. Genau daran
 * ist früher ein Presse-Beitrag als Ruine liegen geblieben. Deshalb wird hier bis zu
 * `attempts` Mal angeklopft, mit wachsender Pause dazwischen; abgeschnittene Antworten
 * bekommen beim nächsten Anlauf mehr Platz und weniger Denkzeit, damit der Text auch
 * wirklich in das Budget passt. Was ohne Zutun nie gelingt (falscher Schlüssel, gesperrtes
 * Modell, Inhaltsfilter), fliegt sofort nach oben.
 *
 * @param {object} opts
 * @param {string} opts.apiKey   Gemini-API-Key (gerätelokal)
 * @param {string} opts.model    Modell-ID
 * @param {string} opts.system   Systeminstruktion (Rolle, Regeln)
 * @param {string} opts.prompt   Nutzeranweisung inkl. Metadaten
 * @param {object} opts.schema   Antwortschema
 * @param {number} opts.temperature
 * @param {Array}  opts.media    Optionale Anhänge: [{ mimeType, data(base64) }]
 * @param {number} opts.attempts Anläufe insgesamt (1 = keine Wiederholung)
 * @param {function} opts.onRetry  Wird vor jeder Wiederholung mit { attempt, attempts, error } gerufen
 */
export async function generateJson(opts) {
  const attempts = Math.max(1, opts?.attempts ?? GEMINI_ATTEMPTS);
  const onRetry = typeof opts?.onRetry === 'function' ? opts.onRetry : null;
  const baseTokens = opts?.maxOutputTokens ?? 4096;
  let last = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Nach einer abgeschnittenen Antwort mehr Platz und weniger Denkzeit — sonst
    // läuft der zweite Anlauf in dieselbe Wand wie der erste.
    const grown = last?.truncated ? Math.min(32768, Math.round(baseTokens * 1.6)) : baseTokens;
    const thinking = last?.truncated ? 'minimal' : opts?.thinking ?? null;
    try {
      return await attemptGenerate({ ...opts, maxOutputTokens: grown, thinking });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      if (!e?.retryable || attempt === attempts) throw e;
      last = e;
      if (onRetry) { try { onRetry({ attempt, attempts, error: e }); } catch (err) { /* nur Anzeige */ } }
      // Wachsende Pause mit etwas Streuung: zwei offene Geräte klopfen sonst im Takt.
      await wait(Math.round((900 * (2 ** (attempt - 1))) * (0.8 + Math.random() * 0.4)));
    }
  }
  throw last;
}

// Schneller Funktionstest für die Einstellungen: erzeugt einen winzigen Datensatz.
export async function testKey({ apiKey, model }) {
  const out = await generateJson({
    apiKey,
    model,
    prompt: 'Antworte mit {"ok": true} und einem kurzen deutschen Gruß im Feld "gruss".',
    schema: schemaOf({ ok: S.bool(), gruss: S.string() }, ['ok', 'gruss']),
    temperature: 0.2,
    maxOutputTokens: 512,
    thinking: 'minimal',
  });
  return out;
}
