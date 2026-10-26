import type { EventKind, EventProperties, IncomingEvent } from '@devpulse/shared';
import { clearIdentity, memoryStorage, resolveIdentity, type StorageLike } from './identity.js';
import { EventQueue } from './queue.js';
import { createHttpTransport, type Transport } from './transport.js';
import { backoffDelay, shouldRetry } from './retry.js';

export const SDK_VERSION = '1.1.0';

export interface ClientOptions {
  /** Project write key. Safe to ship in client code. */
  writeKey: string;
  /** Full ingest URL, e.g. `https://analytics.example.com/ingest`. */
  endpoint: string;
  /** Flush this many buffered events, or on the interval, whichever comes first. */
  flushAt?: number;
  flushIntervalMs?: number;
  /** Skip the automatic first pageview, for an SPA that reports its own. */
  autoPageview?: boolean;
  /** Honour the browser Do Not Track setting. Off by default: it is your call. */
  respectDoNotTrack?: boolean;
  /** Overridable for tests and for non-browser hosts. */
  transport?: Transport;
  localStorage?: StorageLike;
  sessionStorage?: StorageLike;
  now?: () => number;
  onError?: (error: Error) => void;
}

export interface DevPulseClient {
  /** Records a named event with optional properties. */
  track(name: string, properties?: EventProperties): void;
  /** Records a pageview. Call this on every route change in an SPA. */
  page(url?: string): void;
  /** Associates the current visitor with a known user. */
  identify(userId: string, properties?: EventProperties): void;
  /** Sends everything buffered. Awaits the result. */
  flush(): Promise<void>;
  /** Stops timers and listeners, flushing once on the way out. */
  shutdown(): Promise<void>;
  /** Clears the stored visitor and session ids. */
  reset(): void;
  readonly pending: number;
}

/**
 * Creates a tracking client.
 *
 * Every browser dependency is injectable and defaulted, so the same code runs
 * in a test, in an SPA and during server-side rendering (where it becomes a
 * no-op rather than throwing on a missing `window`).
 */
export function createClient(options: ClientOptions): DevPulseClient {
  const now = options.now ?? Date.now;
  const transport = options.transport ?? createHttpTransport();
  const queue = new EventQueue({ flushAt: options.flushAt ?? 20 });

  const local = options.localStorage ?? browserStorage('local');
  const session = options.sessionStorage ?? browserStorage('session');

  const disabled = options.respectDoNotTrack === true && doNotTrackEnabled();
  let stopped = disabled;
  let attempt = 0;
  let inFlight: Promise<void> = Promise.resolve();

  const report = (error: unknown): void => {
    options.onError?.(error instanceof Error ? error : new Error(String(error)));
  };

  const build = (
    kind: EventKind,
    name: string,
    extra: Partial<IncomingEvent> = {},
  ): IncomingEvent => {
    const identity = resolveIdentity({ local, session, now });
    return {
      kind,
      name,
      anonymousId: identity.anonymousId,
      sessionId: identity.sessionId,
      timestamp: new Date(now()).toISOString(),
      ...currentLocation(),
      ...extra,
    };
  };

  const enqueue = (event: IncomingEvent): void => {
    if (stopped) return;
    queue.push(event);
    if (queue.shouldFlush) void flush();
  };

  /**
   * Flushes serially.
   *
   * Chaining onto `inFlight` means two rapid triggers cannot both drain the
   * queue and send overlapping batches, which would reorder events and double
   * the request count for no benefit.
   */
  const flush = (beacon = false): Promise<void> => {
    inFlight = inFlight.then(() => flushOnce(beacon)).catch(report);
    return inFlight;
  };

  const flushOnce = async (beacon: boolean): Promise<void> => {
    const { events } = queue.drain();
    if (events.length === 0) return;

    const result = await transport({
      endpoint: options.endpoint,
      writeKey: options.writeKey,
      events,
      sdk: `web/${SDK_VERSION}`,
      beacon,
    });

    if (result.ok) {
      attempt = 0;
      return;
    }

    attempt += 1;

    if (!shouldRetry(attempt, result.retryable)) {
      // Permanent failure, or out of attempts: drop the batch rather than
      // retrying forever and growing the buffer behind it.
      report(new Error(`DevPulse: dropped ${events.length} events (HTTP ${result.status})`));
      attempt = 0;
      return;
    }

    queue.requeue(events);
    if (!beacon) scheduleRetry(backoffDelay(attempt));
  };

  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleRetry = (delay: number): void => {
    if (stopped || retryTimer !== undefined) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void flush();
    }, delay);
  };

  // ---- timers and page lifecycle ----

  const interval = options.flushIntervalMs ?? 10_000;
  const intervalTimer =
    interval > 0 && !stopped ? setInterval(() => void flush(), interval) : undefined;

  const onPageHide = (): void => {
    // A regular fetch is cancelled on unload, which loses the last event of
    // every visit, so the final flush goes out as a beacon.
    void flush(true);
  };

  if (!stopped && typeof window !== 'undefined') {
    window.addEventListener('pagehide', onPageHide);
    // Mobile Safari may never fire pagehide when the app is backgrounded.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onPageHide();
    });
  }

  const client: DevPulseClient = {
    track(name, properties) {
      enqueue(build('track', name, properties ? { properties } : {}));
    },

    page(url) {
      enqueue(
        build('pageview', 'page_view', {
          ...(url ? { url } : {}),
          ...currentReferrer(),
        }),
      );
    },

    identify(userId, properties) {
      enqueue(build('identify', 'identify', { userId, ...(properties ? { properties } : {}) }));
    },

    flush() {
      return flush();
    },

    async shutdown() {
      stopped = true;
      if (intervalTimer !== undefined) clearInterval(intervalTimer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);

      // One last drain, bypassing the `stopped` guard that enqueue respects.
      await inFlight.then(() => flushOnce(false)).catch(report);
    },

    reset() {
      queue.clear();
      clearIdentity({ local, session });
    },

    get pending() {
      return queue.size;
    },
  };

  if (options.autoPageview !== false) client.page();

  return client;
}

function currentLocation(): Pick<IncomingEvent, 'url'> {
  if (typeof location === 'undefined') return {};
  return { url: location.href };
}

function currentReferrer(): Pick<IncomingEvent, 'referrer'> {
  if (typeof document === 'undefined' || !document.referrer) return {};
  return { referrer: document.referrer };
}

function doNotTrackEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const value = (navigator as { doNotTrack?: string }).doNotTrack;
  return value === '1' || value === 'yes';
}

/** Falls back to an in-memory store when the browser denies access. */
function browserStorage(kind: 'local' | 'session'): StorageLike {
  try {
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    // Touching a key is the only reliable way to detect a blocked store.
    const probe = '__dp_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return memoryStorage();
  }
}
