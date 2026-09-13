// Brücke zur Gemini Developer API (generativelanguage.googleapis.com).
// Bewusst ohne SDK: ein einziger POST mit fetch reicht und kostet kein Bundle.
//
// Der API-Key liegt GERÄTELOKAL (localStorage, siehe PRESS_KEY in main.js) und wird
// nie nach Firestore geschrieben — die Datenbank ist offen lesbar, ein Key hätte darin
// nichts verloren. Ohne Key bleibt die Presse-Ansicht bedienbar, es entstehen nur keine
// neuen Beiträge.

export const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'Schnell und günstig — Standard.' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', hint: 'Langsamer, dafür stilistisch stärker.' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', hint: 'Am günstigsten, knappere Texte.' },
];

export const DEFAULT_MODEL = 'gemini-2.5-flash';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends Error {
  constructor(message, { status = 0, detail = '' } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.detail = detail;
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
    throw new GeminiError('Die Antwort war kein gültiges JSON.', { detail: cleaned.slice(0, 400) });
  }
}

/**
 * Einen JSON-Datensatz erzeugen lassen.
 * @param {object} opts
 * @param {string} opts.apiKey   Gemini-API-Key (gerätelokal)
 * @param {string} opts.model    Modell-ID
 * @param {string} opts.system   Systeminstruktion (Rolle, Regeln)
 * @param {string} opts.prompt   Nutzeranweisung inkl. Metadaten
 * @param {object} opts.schema   Antwortschema
 * @param {number} opts.temperature
 */
export async function generateJson({
  apiKey, model = DEFAULT_MODEL, system, prompt, schema,
  temperature = 1.15, maxOutputTokens = 4096, signal = null,
}) {
  if (!apiKey) throw new GeminiError('Kein API-Key hinterlegt.');

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      topP: 0.95,
      maxOutputTokens,
      responseMimeType: 'application/json',
      ...(schema ? { responseSchema: schema } : {}),
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

  let res;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new GeminiError('Die Redaktion ist nicht erreichbar (Netzwerkfehler).', { detail: String(e) });
  }

  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = err?.error?.message || '';
    } catch (e) { /* Fehlertext nicht auswertbar — Status reicht */ }
    const msg = res.status === 400 && /API key/i.test(detail) ? 'Der API-Key wurde abgelehnt.'
      : res.status === 403 ? 'Zugriff verweigert — API-Key prüfen.'
      : res.status === 429 ? 'Zu viele Anfragen — kurz warten und erneut versuchen.'
      : `Anfrage fehlgeschlagen (HTTP ${res.status}).`;
    throw new GeminiError(msg, { status: res.status, detail });
  }

  const data = await res.json();
  const blocked = data?.promptFeedback?.blockReason;
  if (blocked) throw new GeminiError(`Die Anfrage wurde blockiert (${blocked}).`);
  const finish = data?.candidates?.[0]?.finishReason;
  const text = extractText(data);
  if (!text) {
    throw new GeminiError(finish === 'MAX_TOKENS'
      ? 'Die Antwort wurde abgeschnitten — bitte erneut versuchen.'
      : 'Die Antwort war leer.');
  }
  return parseJson(text);
}

// Schneller Funktionstest für die Einstellungen: erzeugt einen winzigen Datensatz.
export async function testKey({ apiKey, model }) {
  const out = await generateJson({
    apiKey,
    model,
    prompt: 'Antworte mit {"ok": true} und einem kurzen deutschen Gruß im Feld "gruss".',
    schema: schemaOf({ ok: S.bool(), gruss: S.string() }, ['ok', 'gruss']),
    temperature: 0.2,
    maxOutputTokens: 256,
  });
  return out;
}
