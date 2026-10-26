import { describe, expect, it } from 'vitest';
import type { IncomingEvent } from '@devpulse/shared';
import { EventQueue } from '../src/queue.js';
import { backoffDelay, MAX_FLUSH_ATTEMPTS, shouldRetry } from '../src/retry.js';
import { isRetryableStatus } from '../src/transport.js';

function event(name: string): IncomingEvent {
  return {
    kind: 'track',
    name,
    anonymousId: 'anon_abcdef123456',
    sessionId: 'ses_abcdef123456',
  };
}

describe('EventQueue', () => {
  it('reports its size as events are buffered', () => {
    const queue = new EventQueue();

    queue.push(event('a'));
    queue.push(event('b'));

    expect(queue.size).toBe(2);
  });

  it('asks for a flush once the threshold is reached', () => {
    const queue = new EventQueue({ flushAt: 3 });

    queue.push(event('a'));
    queue.push(event('b'));
    expect(queue.shouldFlush).toBe(false);

    queue.push(event('c'));
    expect(queue.shouldFlush).toBe(true);
  });

  it('drains in insertion order and empties the buffer', () => {
    const queue = new EventQueue();
    queue.push(event('first'));
    queue.push(event('second'));

    const { events } = queue.drain();

    expect(events.map((e) => e.name)).toEqual(['first', 'second']);
    expect(queue.size).toBe(0);
  });

  it('drains to nothing when empty rather than throwing', () => {
    expect(new EventQueue().drain()).toEqual({ events: [], dropped: 0 });
  });

  it('drops the oldest event at capacity, keeping recent activity', () => {
    const queue = new EventQueue({ flushAt: 2, capacity: 3 });
    for (const name of ['a', 'b', 'c', 'd']) queue.push(event(name));

    const { events, dropped } = queue.drain();

    expect(events.map((e) => e.name)).toEqual(['b', 'c', 'd']);
    expect(dropped).toBe(1);
  });

  it('requeues a failed batch at the front so ordering survives a retry', () => {
    const queue = new EventQueue();
    queue.push(event('newer'));

    queue.requeue([event('older-1'), event('older-2')]);

    expect(queue.drain().events.map((e) => e.name)).toEqual(['older-1', 'older-2', 'newer']);
  });

  it('discards the oldest of a requeued batch rather than exceeding capacity', () => {
    const queue = new EventQueue({ flushAt: 2, capacity: 3 });
    queue.push(event('live-1'));
    queue.push(event('live-2'));

    queue.requeue([event('retry-1'), event('retry-2')]);

    const { events, dropped } = queue.drain();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.name)).toEqual(['retry-2', 'live-1', 'live-2']);
    expect(dropped).toBe(1);
  });

  it('never buffers a flush threshold larger than one api batch', () => {
    const queue = new EventQueue({ flushAt: 10_000 });
    for (let i = 0; i < 251; i += 1) queue.push(event(`e${i}`));

    // The API caps a batch at 250 events, so a drain must not exceed it.
    expect(queue.drain().events).toHaveLength(250);
  });

  it('clears everything, including the dropped counter', () => {
    const queue = new EventQueue({ flushAt: 1, capacity: 1 });
    queue.push(event('a'));
    queue.push(event('b'));

    queue.clear();

    expect(queue.size).toBe(0);
    expect(queue.dropped).toBe(0);
  });
});

describe('backoffDelay', () => {
  it('grows exponentially across attempts', () => {
    const fixed = { jitter: 0, random: () => 0.5 };

    expect(backoffDelay(1, fixed)).toBe(1_000);
    expect(backoffDelay(2, fixed)).toBe(2_000);
    expect(backoffDelay(3, fixed)).toBe(4_000);
  });

  it('caps the delay at the configured maximum', () => {
    expect(backoffDelay(20, { jitter: 0, random: () => 0.5, maxMs: 30_000 })).toBe(30_000);
  });

  it('spreads retries around the nominal delay', () => {
    const low = backoffDelay(3, { jitter: 1, random: () => 0 });
    const high = backoffDelay(3, { jitter: 1, random: () => 1 });

    expect(low).toBeLessThan(4_000);
    expect(high).toBeGreaterThan(4_000);
  });

  it('never returns a negative delay', () => {
    expect(backoffDelay(1, { jitter: 1, random: () => 0 })).toBeGreaterThanOrEqual(0);
  });
});

describe('shouldRetry', () => {
  it('retries a transient failure within the attempt budget', () => {
    expect(shouldRetry(1, true)).toBe(true);
  });

  it('gives up once the attempt budget is spent', () => {
    expect(shouldRetry(MAX_FLUSH_ATTEMPTS, true)).toBe(false);
  });

  it('never retries a permanent failure', () => {
    expect(shouldRetry(1, false)).toBe(false);
  });
});

describe('isRetryableStatus', () => {
  it('retries a network error and server faults', () => {
    expect(isRetryableStatus(0)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it('retries throttling and timeouts', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
  });

  it('does not retry a rejected key or an oversized batch', () => {
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(413)).toBe(false);
  });

  it('does not retry a partial success, which would duplicate events', () => {
    expect(isRetryableStatus(207)).toBe(false);
  });
});
