# Tracking guide

How to send events from a client, and the decisions that matter when you do.

## The snippet

Copy it from the project's Settings page — it comes pre-filled with your write key and endpoint.
Paste it before `</body>` on every page you want to track.

It does four things worth knowing about:

1. **Generates and persists ids.** `anonymousId` goes in `localStorage` (survives the browser being
   closed), `sessionId` in `sessionStorage` (ends with the tab). That split is what makes "visitors"
   and "sessions" mean different things.
2. **Batches.** Events queue in memory and flush every 10 seconds or at 20 events.
3. **Flushes on `pagehide`, with `sendBeacon`.** This is the part people get wrong. A normal `fetch`
   is cancelled when the page unloads, which loses the last event of every visit — and the last
   event is usually the interesting one. `sendBeacon` hands the request to the browser to deliver
   after the page is gone.
4. **Uses `pagehide`, not `unload`.** `unload` does not fire reliably on mobile Safari and disables
   the back/forward cache. `pagehide` fires in both cases.

## Sending a custom event

The snippet exposes one global:

```js
devpulse('plan_selected', { plan: 'pro', seats: 4 });
devpulse('video_completed', { id: 'intro', seconds: 182 });
```

Property values must be a string, number, boolean or null. Up to 40 keys per event. No nested
objects — they are stored in a JSON column and queried with `json_extract`, which only reaches
scalars.

```js
// Won't validate:
devpulse('checkout', { items: [{ sku: 'a' }, { sku: 'b' }] });

// Do this instead:
devpulse('checkout', { itemCount: 2, firstSku: 'a', total: 59.0 });
```

## Naming events

Use `snake_case` verbs in the past tense, consistently: `signup_completed`, `plan_selected`,
`invite_sent`. The names become the vocabulary of every funnel you will ever build, and renaming one
later splits its history in two.

Keep the distinction between the name and the properties stable too. `plan_selected` with
`{plan: 'pro'}` lets you break down one event by plan. `plan_selected_pro` as its own event name
does not, and you cannot merge them afterwards.

## Server-side events

Anything that happens without a browser — a webhook, a cron job, a backend purchase — should be
sent from the server, where the write key stays secret:

```js
await fetch('https://analytics.example.com/ingest', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Write-Key': process.env.DEVPULSE_WRITE_KEY,
  },
  body: JSON.stringify({
    events: [
      {
        kind: 'track',
        name: 'subscription_renewed',
        anonymousId: user.analyticsId,
        sessionId: `server_${user.id}`,
        userId: user.id,
        timestamp: new Date().toISOString(),
        properties: { plan: user.plan, amount: 49 },
      },
    ],
  }),
});
```

Two notes. `anonymousId` should be the *same* id the browser uses for that person, or their
server-side and client-side activity will look like two different visitors — persist it on the user
record when they first sign up. And `sessionId` is required even server-side; a synthetic
`server_<id>` is fine, it just means these events will not be mixed into browsing sessions.

## Identifying users

```js
devpulse('identify', { email: 'you@example.com', plan: 'pro' });
```

Send an `identify` once a visitor becomes known. Events keep their `anonymousId`, so their history
from before they signed in is still attributed to them.

Be deliberate about what you put in there. Everything in `properties` is stored in plaintext in your
database and appears in the CSV export.

## Retrying

Treat the status code, not the body, as the signal:

| Status | What to do |
| --- | --- |
| `202` | Done |
| `207` | Some events were rejected. Read `errors[].index`, drop those, do **not** resend the batch |
| `401` / `403` | Your key is wrong or revoked, or the origin is not allowed. Stop; retrying will not help |
| `413` | Batch too large. Split it and resend |
| `429` | Back off. `Retry-After` tells you how long |
| `5xx` | Retry with exponential backoff and jitter |

The one trap is `207`: resending the whole batch duplicates every event that succeeded. Only resend
the rejected indices, and only after fixing them.

## Bots

Requests whose user agent matches a crawler pattern are stored with `device: 'bot'` rather than
dropped, so you can see crawler traffic when you want it and exclude it when you do not:

```
GET /projects/acme/analytics/overview?from=…&to=…&filter.device=desktop
```

They are kept rather than discarded because a sudden crawl is sometimes exactly what explains a
traffic spike.

## Respecting the visitor

DevPulse stores no cookies and no IP addresses. `anonymousId` is a random value in `localStorage`,
and country comes from a geo header your proxy sets, not from an IP lookup done here.

If you want to honour Do Not Track, gate the snippet yourself — the server will not do it for you:

```js
if (navigator.doNotTrack !== '1') {
  // load the snippet
}
```

## Verifying an integration

1. Open the Events page for your project.
2. Load a page on your site.
3. The pageview should appear within about 10 seconds (the flush interval).

If nothing arrives, in order:

- Look in the browser network tab for the `POST /ingest` and read its status. A 401 means the write
  key is wrong; a 403 means the origin is not on the project's allow-list.
- Check that the event cleared validation — a 207 response names the field that failed.
- Confirm your date range on the dashboard actually includes now.
