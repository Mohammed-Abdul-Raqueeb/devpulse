import { SESSION_IDLE_MINUTES } from '@devpulse/shared';

/**
 * The slice of `Storage` the SDK actually uses.
 *
 * Declaring it as an interface rather than taking `Storage` directly is what
 * lets the tests drive identity resolution without a DOM, and lets a host app
 * substitute a cookie-backed or in-memory store when `localStorage` is blocked.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Identity {
  anonymousId: string;
  sessionId: string;
  /** True when this call started a new session rather than resuming one. */
  isNewSession: boolean;
}

export interface IdentityOptions {
  /** Survives the browser closing. Holds the visitor id. */
  local: StorageLike;
  /** Cleared with the tab. Holds the session id and its last-seen time. */
  session: StorageLike;
  now?: () => number;
  /** Inactivity after which a visit counts as a new session. */
  idleMinutes?: number;
}

const ANON_KEY = 'dp_anon';
const SESSION_KEY = 'dp_ses';
const SEEN_KEY = 'dp_seen';

/**
 * Resolves the visitor and session ids, creating or rotating them as needed.
 *
 * The visitor id lives in local storage and the session id in session storage,
 * which is what makes "visitors" and "sessions" mean different things. The
 * session additionally expires after an idle period, so a tab left open
 * overnight starts a new visit in the morning rather than reporting one
 * sixteen-hour session.
 */
export function resolveIdentity(options: IdentityOptions): Identity {
  const now = options.now ?? Date.now;
  const idleMs = (options.idleMinutes ?? SESSION_IDLE_MINUTES) * 60_000;
  const timestamp = now();

  const anonymousId = readOrCreate(options.local, ANON_KEY, () => randomId('anon'));

  const storedSession = safeGet(options.session, SESSION_KEY);
  const lastSeen = Number(safeGet(options.session, SEEN_KEY) ?? Number.NaN);
  const expired = !Number.isFinite(lastSeen) || timestamp - lastSeen > idleMs;

  let sessionId = storedSession;
  let isNewSession = false;

  if (!sessionId || expired) {
    sessionId = randomId('ses');
    isNewSession = true;
    safeSet(options.session, SESSION_KEY, sessionId);
  }

  // Touch on every resolve, so the idle window is measured from the last event
  // rather than from the start of the session.
  safeSet(options.session, SEEN_KEY, String(timestamp));

  return { anonymousId, sessionId, isNewSession };
}

/** Forgets the visitor and session entirely. Used by an opt-out control. */
export function clearIdentity(options: Pick<IdentityOptions, 'local' | 'session'>): void {
  safeRemove(options.local, ANON_KEY);
  safeRemove(options.session, SESSION_KEY);
  safeRemove(options.session, SEEN_KEY);
}

/**
 * A prefixed random id.
 *
 * Prefers `crypto.getRandomValues`, but falls back to `Math.random` when it is
 * unavailable — these ids are pseudonymous labels, not secrets, so a weaker
 * source is better than failing to track at all.
 */
export function randomId(prefix: string): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let body = '';

  const webCrypto = typeof crypto !== 'undefined' ? crypto : undefined;
  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(12);
    webCrypto.getRandomValues(bytes);
    for (const byte of bytes) body += alphabet[byte % alphabet.length];
  } else {
    for (let i = 0; i < 12; i += 1) {
      body += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }

  return `${prefix}_${body}`;
}

function readOrCreate(storage: StorageLike, key: string, create: () => string): string {
  const existing = safeGet(storage, key);
  if (existing) return existing;

  const value = create();
  safeSet(storage, key, value);
  return value;
}

/*
 * Storage throws rather than returning null in a few real situations: Safari
 * private browsing, a blocked third-party context, and a full quota. Every
 * access is wrapped so tracking degrades to per-pageview ids instead of taking
 * the host page down with it.
 */

function safeGet(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    /* ignored on purpose */
  }
}

function safeRemove(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* ignored on purpose */
  }
}

/** An in-memory `StorageLike`, used when the real thing is unavailable. */
export function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}
