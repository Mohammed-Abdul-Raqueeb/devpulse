import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { memoryStorage } from '../src/identity.js';
import type { SendRequest, SendResult } from '../src/transport.js';

interface Recorder {
  calls: SendRequest[];
  transport: (request: SendRequest) => Promise<SendResult>;
}

/** A transport that records what it was asked to send and answers as told. */
function recorder(reply: (call: number) => SendResult): Recorder {
  const calls: SendRequest[] = [];
  return {
    calls,
    transport: (request) => {
      calls.push(request);
      return Promise.resolve(reply(calls.length));
    },
  };
}

const ok = (): SendResult => ({ ok: true, status: 202, retryable: false });
const serverError = (): SendResult => ({ ok: false, status: 503, retryable: true });
const rejected = (): SendResult => ({ ok: false, status: 401, retryable: false });

function client(overrides: Partial<Parameters<typeof createClient>[0]> = {}) {
  return createClient({
    writeKey: 'dp_live_test',
    endpoint: 'https://analytics.test/ingest',
    autoPageview: false,
    flushIntervalMs: 0,
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    ...overrides,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createClient', () => {
  it('buffers an event instead of sending it immediately', () => {
    const sink = recorder(ok);
    const dp = client({ transport: sink.transport });

    dp.track('signup_completed');

    expect(dp.pending).toBe(1);
    expect(sink.calls).toHaveLength(0);
  });

  it('sends the buffered events on an explicit flush', async () => {
    const sink = recorder(ok);
    const dp = client({ transport: sink.transport });

    dp.track('a');
    dp.track('b');
    await dp.flush();

    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0]?.events.map((e) => e.name)).toEqual(['a', 'b']);
    expect(dp.pending).toBe(0);
  });

  it('flushes by itself once the threshold is reached', async () => {
    const sink = recorder(ok);
    const dp = client({ transport: sink.transport, flushAt: 2 });

    dp.track('a');
    dp.track('b');
    await dp.flush();

    expect(sink.calls).toHaveLength(1);
  });

  it('sends nothing when there is nothing buffered', async () => {
    const sink = recorder(ok);

    await client({ transport: sink.transport }).flush();

    expect(sink.calls).toHaveLength(0);
  });

  it('stamps the write key and sdk version on every batch', async () => {
    const sink = recorder(ok);
    const dp = client({ transport: sink.transport });

    dp.track('a');
    await dp.flush();

    expect(sink.calls[0]).toMatchObject({
      writeKey: 'dp_live_test',
      endpoint: 'https://analytics.test/ingest',
    });
    expect(sink.calls[0]?.sdk).toMatch(/^web\/\d+\.\d+\.\d+$/);
  });

  it('gives every event from one visit the same visitor and session', async () => {
    const sink = recorder(ok);
    const dp = client({ transport: sink.transport });

    dp.track('a');
    dp.track('b');
    await dp.flush();

    const [first, second] = sink.calls[0]!.events;
    expect(first?.anonymousId).toBe(second?.anonymousId);
    expect(first?.sessionId).toBe(second?.sessionId);
  });

  it('records the three event kinds distinctly', async () => {
    const sink = recorder(ok);
    const dp = client({ transport: sink.transport });

    dp.page('https://acme.test/pricing');
    dp.track('plan_selected', { plan: 'pro' });
    dp.identify('usr_1', { email: 'a@b.co' });
    await dp.flush();

    const events = sink.calls[0]!.events;
    expect(events.map((e) => e.kind)).toEqual(['pageview', 'track', 'identify']);
    expect(events[1]?.properties).toEqual({ plan: 'pro' });
    expect(events[2]?.userId).toBe('usr_1');
  });

  it('sends an automatic pageview unless it is turned off', async () => {
    const sink = recorder(ok);
    const dp = client({ transport: sink.transport, autoPageview: true });

    await dp.flush();

    expect(sink.calls[0]?.events[0]?.kind).toBe('pageview');
  });

  it('puts a failed batch back so nothing is lost', async () => {
    vi.useFakeTimers();
    const sink = recorder(serverError);
    const dp = client({ transport: sink.transport });

    dp.track('a');
    await dp.flush();

    expect(sink.calls).toHaveLength(1);
    expect(dp.pending).toBe(1);
  });

  it('retries a transient failure and succeeds on the second try', async () => {
    vi.useFakeTimers();
    const sink = recorder((call) => (call === 1 ? serverError() : ok()));
    const dp = client({ transport: sink.transport });

    dp.track('a');
    await dp.flush();
    expect(dp.pending).toBe(1);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(sink.calls.length).toBeGreaterThanOrEqual(2);
    expect(dp.pending).toBe(0);
  });

  it('drops a batch the server rejected permanently, and reports it', async () => {
    const errors: Error[] = [];
    const sink = recorder(rejected);
    const dp = client({ transport: sink.transport, onError: (e) => errors.push(e) });

    dp.track('a');
    await dp.flush();

    // Retrying a 401 forever would just waste the visitor's bandwidth.
    expect(dp.pending).toBe(0);
    expect(errors[0]?.message).toMatch(/dropped 1 events \(HTTP 401\)/);
  });

  it('does not send overlapping batches when flushed twice in a row', async () => {
    const sink = recorder(ok);
    const dp = client({ transport: sink.transport });

    dp.track('a');
    const first = dp.flush();
    dp.track('b');
    const second = dp.flush();
    await Promise.all([first, second]);

    const sent = sink.calls.flatMap((c) => c.events.map((e) => e.name));
    expect(sent).toEqual(['a', 'b']);
  });

  it('collects nothing at all when do-not-track is honoured', async () => {
    const sink = recorder(ok);
    vi.stubGlobal('navigator', { doNotTrack: '1' });

    const dp = client({ transport: sink.transport, respectDoNotTrack: true, autoPageview: true });
    dp.track('a');
    await dp.flush();

    expect(dp.pending).toBe(0);
    expect(sink.calls).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('flushes what is left on shutdown', async () => {
    const sink = recorder(ok);
    const dp = client({ transport: sink.transport });

    dp.track('a');
    await dp.shutdown();

    expect(sink.calls).toHaveLength(1);
    expect(dp.pending).toBe(0);
  });

  it('stops accepting events after shutdown', async () => {
    const sink = recorder(ok);
    const dp = client({ transport: sink.transport });

    await dp.shutdown();
    dp.track('too-late');

    expect(dp.pending).toBe(0);
  });

  it('issues a new visitor id after a reset', async () => {
    const sink = recorder(ok);
    const dp = client({ transport: sink.transport });

    dp.track('before');
    await dp.flush();
    const before = sink.calls[0]!.events[0]!.anonymousId;

    dp.reset();
    dp.track('after');
    await dp.flush();

    expect(sink.calls[1]!.events[0]!.anonymousId).not.toBe(before);
  });

  it('flushes on an interval when one is configured', async () => {
    vi.useFakeTimers();
    const sink = recorder(ok);
    const dp = client({ transport: sink.transport, flushIntervalMs: 5_000 });

    dp.track('a');
    await vi.advanceTimersByTimeAsync(5_100);

    expect(sink.calls).toHaveLength(1);
  });
});
