/**
 * Identifier generation.
 *
 * Everything here uses the Web Crypto API rather than `node:crypto`, because
 * this package is bundled into the browser as well as run on the server, and a
 * Node builtin here would break the dashboard build. `globalThis.crypto` is
 * available in Node 18+ and in every browser DevPulse targets.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Prefixed, roughly sortable identifier: `evt_m2k9x7a1b3c8d2e9f`.
 *
 * The timestamp prefix means ids from the same millisecond cluster together in
 * an index, which keeps inserts appending to the end of the B-tree rather than
 * scattering writes across it.
 */
export function createId(prefix: string): string {
  const time = Date.now().toString(36).padStart(9, '0');
  const random = Array.from(randomBytes(8), (byte) => ALPHABET[byte % ALPHABET.length]).join('');
  return `${prefix}_${time}${random}`;
}

/** Opaque project secret, shown to the user exactly once. 192 bits of entropy. */
export function createWriteKey(): string {
  return `dp_live_${toBase64Url(randomBytes(24))}`;
}

/** 256-bit opaque refresh token. Stored hashed, never as given out. */
export function createRefreshToken(): string {
  return toBase64Url(randomBytes(32));
}

export function createRequestId(): string {
  return crypto.randomUUID();
}

/** Base64url without padding, implemented directly so no Buffer is needed. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];

    out += BASE64URL[a >> 2];
    out += BASE64URL[((a & 0b11) << 4) | ((b ?? 0) >> 4)];
    if (b === undefined) break;

    out += BASE64URL[((b & 0b1111) << 2) | ((c ?? 0) >> 6)];
    if (c === undefined) break;

    out += BASE64URL[c & 0b111111];
  }

  return out;
}

/**
 * Derives a slug from a display name.
 *
 * Falls back to a random slug when the name has no url-safe characters at all —
 * a project called "???" still needs somewhere to live.
 */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  if (base !== '') return base;

  const suffix = Array.from(randomBytes(3), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `project-${suffix}`;
}
