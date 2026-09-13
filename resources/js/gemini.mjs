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
  temperature = 1.15, maxOutputTokens = 4096, signal = null, thinking = null,
}) {
  if (!apiKey) throw new GeminiError('Kein API-Key hinterlegt.');

  const think = thinkingConfigFor(model, thinking);
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
      throw new GeminiError('Die Redaktion ist nicht erreichbar (Netzwerkfehler).', { detail: String(e) });
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
    throw new GeminiError(detail ? `${msg} (${detail})` : msg, { status: res.status, detail });
  }

  const data = out.data;
  const blocked = data?.promptFeedback?.blockReason;
  if (blocked) throw new GeminiError(`Die Anfrage wurde blockiert (${blocked}).`);
  const finish = data?.candidates?.[0]?.finishReason;
  const text = extractText(data);
  if (!text) {
    const msg = finish === 'MAX_TOKENS' ? 'Die Antwort wurde abgeschnitten — bitte erneut versuchen.'
      : finish === 'SAFETY' ? 'Die Antwort wurde von den Inhaltsfiltern gestoppt.'
      : finish === 'RECITATION' ? 'Die Antwort wurde wegen Zitat-Erkennung gestoppt.'
      : `Die Antwort war leer${finish ? ` (${finish})` : ''}.`;
    throw new GeminiError(msg, { detail: JSON.stringify(data?.usageMetadata || {}) });
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
    maxOutputTokens: 512,
    thinking: 'minimal',
  });
  return out;
}
