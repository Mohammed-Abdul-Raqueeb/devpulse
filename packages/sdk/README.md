# @devpulse/sdk

Browser tracking client for DevPulse. Around 2 kB gzipped, no dependencies at runtime.

The install snippet on the Settings page is fine for a static site. Use this package instead when
you have a build step — it gives you types, an SPA-aware `page()` call, retry with backoff, and a
`shutdown()` you can call from a test.

## Install

```bash
npm install @devpulse/sdk
```

## Use

```ts
import { createClient } from '@devpulse/sdk';

export const analytics = createClient({
  writeKey: import.meta.env.VITE_DEVPULSE_KEY,
  endpoint: 'https://analytics.example.com/ingest',
});

analytics.track('plan_selected', { plan: 'pro', seats: 4 });
analytics.identify('usr_8f2c1a9b', { email: 'you@example.com' });
```

The write key is meant to be public — it can only write events to one project, never read them.

### Single-page apps

`createClient` sends one pageview on creation. After that, routing is yours to report:

```ts
router.afterEach((to) => analytics.page(to.fullPath));
```

Pass `autoPageview: false` if your router fires on first load too, or you will double-count the
landing page.

## Options

| Option | Default | Notes |
| --- | --- | --- |
| `writeKey` | — | Required |
| `endpoint` | — | Required. Full ingest URL |
| `flushAt` | `20` | Send once this many events are buffered |
| `flushIntervalMs` | `10000` | Also send on this interval. `0` disables the timer |
| `autoPageview` | `true` | Send a pageview when the client is created |
| `respectDoNotTrack` | `false` | When true, a visitor with DNT set is not tracked at all |
| `onError` | — | Called with dropped-batch and transport errors |
| `transport` | HTTP | Replaceable, for tests |
| `localStorage` / `sessionStorage` | browser | Replaceable, for tests or a cookie-backed store |

## How delivery works

Events are buffered and sent in batches, because one request per event is both slower for the
visitor and more expensive for you.

Three things trigger a send: the buffer reaching `flushAt`, the `flushIntervalMs` timer, and the
page going away. That last one uses `navigator.sendBeacon`, since a normal `fetch` is cancelled on
unload — and the last event of a visit is usually the one you care about. `visibilitychange` is
also handled, because mobile Safari may never fire `pagehide` when an app is backgrounded.

A failed send is put back at the front of the buffer and retried with exponential backoff plus
jitter, up to five attempts. The jitter is the important part: without it, every visitor whose
flush failed during an outage retries in the same instant.

Not everything is retried. A `401`, `403` or `413` fails identically forever, so the batch is
dropped and `onError` is called. A `207` is a *partial* success — the accepted events are already
stored, so resending would duplicate them.

The buffer is capped at 500 events. At capacity the oldest event is dropped, on the grounds that
after a long outage the most recent activity is the more useful thing to keep.

## Degrading gracefully

Nothing here throws into your application.

Blocked storage (Safari private browsing, a third-party context, a full quota) falls back to an
in-memory store — you lose visitor continuity across reloads, not the whole integration. In a
server-rendered context there is no `window`, so the lifecycle listeners are skipped.

## Testing against it

Inject a transport and assert on what it was handed:

```ts
const sent: SendRequest[] = [];

const analytics = createClient({
  writeKey: 'test',
  endpoint: 'https://analytics.test/ingest',
  autoPageview: false,
  flushIntervalMs: 0,
  transport: async (request) => {
    sent.push(request);
    return { ok: true, status: 202, retryable: false };
  },
});

analytics.track('signup_completed');
await analytics.flush();

expect(sent[0].events[0].name).toBe('signup_completed');
```

## Identity

`anonymousId` lives in `localStorage` and survives the browser closing. `sessionId` lives in
`sessionStorage` and additionally expires after 30 minutes of inactivity, so a tab left open
overnight starts a new visit rather than reporting one sixteen-hour session.

`reset()` clears both — call it on sign-out if you do not want the next user on a shared machine
attributed to the previous one.
