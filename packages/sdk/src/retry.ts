export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  /** Fraction of the delay to randomise, 0..1. */
  jitter?: number;
  random?: () => number;
}

/**
 * Exponential backoff with full-ish jitter.
 *
 * The jitter matters more than the exponent here: without it, every visitor
 * whose flush failed during an outage retries in the same instant, and the
 * server gets a synchronised thundering herd exactly as it recovers.
 */
export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const base = options.baseMs ?? 1_000;
  const max = options.maxMs ?? 30_000;
  const jitter = clamp(options.jitter ?? 0.3, 0, 1);
  const random = options.random ?? Math.random;

  const exponential = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  // Jitter is applied symmetrically, so the expected delay stays `exponential`.
  const spread = exponential * jitter;
  const delay = exponential - spread / 2 + random() * spread;

  return Math.round(clamp(delay, 0, max));
}

/** Caps how many times a batch is retried before it is given up on. */
export const MAX_FLUSH_ATTEMPTS = 5;

export function shouldRetry(attempt: number, retryable: boolean): boolean {
  return retryable && attempt < MAX_FLUSH_ATTEMPTS;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
