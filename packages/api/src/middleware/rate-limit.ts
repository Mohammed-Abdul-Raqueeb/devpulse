import type { Request, RequestHandler } from 'express';
import { rateLimited } from '../lib/errors.js';

interface Bucket {
  count: number;
  /** Epoch ms at which the window rolls over. */
  resetAt: number;
}

export interface RateLimitOptions {
  windowSeconds: number;
  max: number;
  /** Groups requests into buckets. Defaults to the client IP. */
  keyBy?: (req: Request) => string;
}

/**
 * Fixed-window limiter backed by an in-process Map.
 *
 * This is deliberately not distributed: a single-node deployment is the common
 * case for a self-hosted install, and avoiding Redis keeps the dependency list
 * short. Behind multiple replicas the effective limit is per-replica, which the
 * deployment guide calls out.
 */
/**
 * Every limiter registers its bucket map here.
 *
 * Limiters are created once per route module, so their state outlives any
 * individual app instance. `resetRateLimits()` is how a test suite that builds
 * several apps avoids tripping over counts left by an earlier test.
 */
const registry = new Set<Map<string, Bucket>>();

export function resetRateLimits(): void {
  for (const buckets of registry) buckets.clear();
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  registry.add(buckets);
  const windowMs = options.windowSeconds * 1000;
  const keyBy = options.keyBy ?? defaultKey;

  // Sweep expired buckets so a long-running process does not grow unboundedly.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  sweeper.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = keyBy(req);
    const existing = buckets.get(key);
    const bucket =
      existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(0, options.max - bucket.count);
    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));

    if (bucket.count > options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      next(rateLimited(`Rate limit exceeded. Retry in ${retryAfter}s.`));
      return;
    }

    next();
  };
}

function defaultKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** Limits ingestion per project rather than per IP, so one busy site cannot starve another. */
export const byProject = (req: Request): string => req.project?.id ?? defaultKey(req);

/** Limits auth attempts per email, which blunts credential stuffing across IPs. */
export const byEmail = (req: Request): string => {
  const body = req.body as { email?: unknown } | undefined;
  return typeof body?.email === 'string' ? body.email.toLowerCase() : defaultKey(req);
};
