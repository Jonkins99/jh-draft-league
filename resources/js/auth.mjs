// Anmeldung und gerätelokale Verschlüsselung.
// Framework-frei (kein Alpine, kein Firebase) — damit unter Node testbar.
//
// Es gibt genau zwei Konten: Janik und Henrik. Ein Konto existiert erst, sobald
// beim ersten Login ein Passwort hinterlegt wurde; das Dokument dazu liegt in der
// Collection `users` unter der ID aus `userId()`:
//
//   { player, createdAt, updatedAt,
//     auth: { algo, iterations, salt, hash },   // Passwortprüfung
//     enc:  { algo, iterations, salt } }        // Ableitung des Datenschlüssels
//
// Die Firestore-Regeln sind offen — Vertraulichkeit entsteht deshalb nicht über
// Leserechte, sondern über den Inhalt: private Daten werden mit einem Schlüssel
// verschlüsselt, der ausschließlich aus dem Passwort abgeleitet wird. Ohne das
// Passwort steht in der Datenbank nur Chiffrat.

export const PLAYERS = ['Janik', 'Henrik'];

export const PBKDF2_ITERATIONS = 210000;
export const KDF_ALGO = 'PBKDF2-SHA256';
export const CIPHER_ALGO = 'AES-GCM-256';

export function userId(player) {
  return String(player || '').trim().toLowerCase();
}

export function playerOf(id) {
  return PLAYERS.find((p) => userId(p) === userId(id)) || null;
}

export function otherPlayer(player) {
  return PLAYERS.find((p) => p !== player) || null;
}

// --- Byte-Helfer -----------------------------------------------------------
const subtle = () => globalThis.crypto.subtle;

export function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex) {
  const s = String(hex || '');
  const out = new Uint8Array(Math.floor(s.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomHex(bytes = 16) {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return toHex(buf);
}

function toBase64(bytes) {
  const arr = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

function fromBase64(str) {
  const bin = atob(String(str || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- Ableitung -------------------------------------------------------------
async function pbkdf2(password, saltHex, iterations, bits = 256) {
  const base = await subtle().importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const derived = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations },
    base,
    bits,
  );
  return new Uint8Array(derived);
}

/** Prüfsumme des Passworts (hex) — landet als `auth.hash` im Nutzerdokument. */
export async function deriveAuthHash(password, salt, iterations = PBKDF2_ITERATIONS) {
  return toHex(await pbkdf2(password, salt, iterations));
}

/** Rohschlüssel für die Verschlüsselung (hex) — verlässt das Gerät nie. */
export async function deriveDataKey(password, salt, iterations = PBKDF2_ITERATIONS) {
  return toHex(await pbkdf2(password, salt, iterations));
}

/** Frisches Konto: Passwort setzen. Liefert Dokumentfelder und den Datenschlüssel. */
export async function createCredential(player, password) {
  const authSalt = randomHex(16);
  const encSalt = randomHex(16);
  const [hash, dataKey] = await Promise.all([
    deriveAuthHash(password, authSalt),
    deriveDataKey(password, encSalt),
  ]);
  return {
    dataKey,
    hash,
    record: {
      player,
      auth: { algo: KDF_ALGO, iterations: PBKDF2_ITERATIONS, salt: authSalt, hash },
      enc: { algo: KDF_ALGO, iterations: PBKDF2_ITERATIONS, salt: encSalt },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

/** Passwort gegen ein bestehendes Nutzerdokument prüfen. */
export async function verifyCredential(record, password) {
  const auth = record?.auth;
  if (!auth?.salt || !auth?.hash) return { ok: false, hash: null, dataKey: null };
  const hash = await deriveAuthHash(password, auth.salt, auth.iterations || PBKDF2_ITERATIONS);
  if (hash !== auth.hash) return { ok: false, hash: null, dataKey: null };
  const enc = record.enc || {};
  const dataKey = enc.salt ? await deriveDataKey(password, enc.salt, enc.iterations || PBKDF2_ITERATIONS) : null;
  return { ok: true, hash, dataKey };
}

// --- Verschlüsselung -------------------------------------------------------
async function aesKey(dataKeyHex) {
  return subtle().importKey('raw', fromHex(dataKeyHex), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Beliebiges JSON-fähiges Objekt verschlüsseln. Ergebnis ist Firestore-tauglich. */
export async function encryptJson(dataKeyHex, value) {
  const key = await aesKey(dataKeyHex);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const plain = new TextEncoder().encode(JSON.stringify(value ?? null));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain);
  return { v: 1, algo: CIPHER_ALGO, iv: toHex(iv), ct: toBase64(ct) };
}

/** Gegenstück zu encryptJson. Wirft, wenn der Schlüssel nicht passt. */
export async function decryptJson(dataKeyHex, payload) {
  if (!payload || !payload.ct || !payload.iv) return null;
  const key = await aesKey(dataKeyHex);
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromHex(payload.iv) }, key, fromBase64(payload.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

// --- Gerätesitzung ---------------------------------------------------------
// Auf dem Gerät bleiben Spieler, Passwort-Prüfsumme und Datenschlüssel liegen.
// Beim Start wird die Prüfsumme gegen das Nutzerdokument gehalten; ändert sich das
// Passwort, fällt die Sitzung damit automatisch weg.
export function isValidSession(session, record) {
  if (!session?.player || !session?.hash) return false;
  if (!record?.auth?.hash) return false;
  return playerOf(session.player) === record.player && session.hash === record.auth.hash;
}

// --- Besitzverhältnisse ----------------------------------------------------
export function ownsTeam(player, team) {
  return !!player && !!team && team.player === player;
}

export function teamIdsOf(player, teams) {
  return (teams || []).filter((t) => ownsTeam(player, t)).map((t) => t.id);
}
