# API reference

Base URL: `http://localhost:4000` in development.

Two kinds of credential:

| Credential | Header | Used by | Grants |
| --- | --- | --- | --- |
| Write key | `X-Write-Key: dp_live_…` | Customer websites | Writing events to one project |
| Access token | `Authorization: Bearer <jwt>` | The dashboard | Reading analytics, managing projects |

A write key can only write. An access token can only read and administer. Neither can do the other's
job, so a leaked snippet cannot read your analytics.

## Error envelope

Every non-2xx response has the same shape:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Request validation failed",
    "details": [{ "path": "events.0.anonymousId", "message": "String must contain at least 8 character(s)" }],
    "requestId": "3f8c9a12-5b4e-4c21-9f7a-1d2e3b4c5d6e"
  }
}
```

`code` is stable and safe to switch on. `message` is for humans and may change. `requestId` appears
in the server logs for the same request — quote it in a bug report.

Codes: `bad_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `payload_too_large`,
`rate_limited`, `validation_failed`, `internal_error`.

## Rate limits

| Scope | Window | Limit | Keyed by |
| --- | --- | --- | --- |
| `/ingest` | 60s | 600 | Project |
| Read endpoints | 60s | 120 | IP |
| `/auth/*` | 15min | 10 | Email |

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`. A 429
also carries `Retry-After` in seconds.

---

## Ingestion

### `POST /ingest`

Auth: write key. Max body 1 MB, max 250 events per batch.

```json
{
  "events": [
    {
      "kind": "pageview",
      "name": "page_view",
      "anonymousId": "anon_8f2c1a9b4e7d",
      "sessionId": "ses_3b7e9f1c2a8d",
      "timestamp": "2026-10-26T09:14:22.000Z",
      "url": "https://acme.example/pricing",
      "referrer": "https://news.ycombinator.com/",
      "properties": { "plan": "pro", "seats": 4 }
    }
  ],
  "sdk": "snippet/1.0"
}
```

Field notes:

- `kind` — one of `pageview`, `track`, `identify`, `error`.
- `anonymousId` / `sessionId` — 8–128 characters. Generate them client-side and persist them in
  `localStorage` and `sessionStorage` respectively.
- `timestamp` — optional. Clamped server-side to at most 5 minutes ahead and 7 days behind, so a
  wrong client clock cannot corrupt your charts.
- `properties` — up to 40 keys, values must be string / number / boolean / null. No nesting; it maps
  to a JSON column that is queried with `json_extract`.
- `url`, `referrer` — `country`, `device`, `browser` and `os` are derived server-side and cannot be
  spoofed by the client.

Responses:

| Status | Meaning |
| --- | --- |
| `202` | Every event stored |
| `207` | Partially stored — check `errors` |
| `401` | Missing, unknown or revoked write key |
| `403` | Origin not on the project allow-list |
| `413` | Body over 1 MB |
| `422` | The envelope itself was malformed |

```json
{ "accepted": 3, "rejected": 1, "errors": [{ "index": 2, "message": "name: String must contain at least 1 character(s)" }] }
```

### `GET /ingest/pixel.gif`

Auth: write key via `?key=`. For clients that cannot run JavaScript. Takes `name`, `anonymousId`,
`sessionId` and optional `url` as query parameters, and always returns a 1×1 GIF with a `200` so a
tracking failure never renders a broken image.

---

## Authentication

### `POST /auth/register`

The first account created on an install becomes the `owner`; every account after it is a `viewer`
until promoted.

```json
{ "email": "you@example.com", "name": "Your Name", "password": "at-least-ten-chars" }
```

Returns `201` with `{ user, tokens }`.

### `POST /auth/login`

Returns `200` with `{ user, tokens }`. A wrong password and an unknown email return the identical
401, so the endpoint cannot be used to enumerate accounts.

### `POST /auth/refresh`

```json
{ "refreshToken": "…" }
```

Refresh tokens are single-use: the presented token is deleted as its replacement is issued. Reusing
one is a 401 — if that happens unexpectedly, the token was replayed.

### `POST /auth/logout`

Auth: bearer. Revokes every refresh token for the caller. Returns `{ "revoked": 2 }`.

### `GET /auth/me`

Auth: bearer. Returns `{ user }`.

---

## Projects

All project endpoints need a bearer token.

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| `GET` | `/projects` | viewer | Viewers see only their own |
| `POST` | `/projects` | admin | Returns the plaintext write key **once** |
| `GET` | `/projects/:idOrSlug` | viewer | Includes a stored-event count |
| `PATCH` | `/projects/:id` | admin | `name`, `allowedOrigins`, `retentionDays` |
| `DELETE` | `/projects/:id` | owner | Cascades to every event |
| `POST` | `/projects/:id/rotate-key` | admin | Revokes all live keys, returns a new one |
| `GET` | `/projects/:id/schema` | viewer | Event names and property keys in use |

`POST /projects` response:

```json
{
  "project": { "id": "prj_…", "name": "Acme", "slug": "acme", "retentionDays": 365, "allowedOrigins": [] },
  "writeKey": "dp_live_…"
}
```

The key is stored hashed. It is not retrievable — rotation is the only recovery.

---

## Analytics

All of these take `from` and `to` as ISO timestamps or `YYYY-MM-DD` dates. The range is half-open:
`[from, to)`. `:project` accepts an id or a slug.

Any read endpoint also accepts `filter.<dimension>=<value>`, for example
`?filter.device=mobile&filter.properties.plan=pro`. Unknown filter keys are ignored rather than
rejected, so adding a filter to the dashboard never breaks against an older API.

### `GET /projects/:project/analytics/overview`

Everything the overview screen needs, in one round trip.

```json
{
  "range": { "from": "…", "to": "…" },
  "visitors": 4821, "events": 19043, "sessions": 6120,
  "bounceRate": 0.4137, "avgSessionSeconds": 94.2,
  "topPages":     [{ "key": "https://acme.example/", "value": 1820, "share": 0.3776 }],
  "topReferrers": [{ "key": "news.ycombinator.com", "value": 640, "share": 0.1328 }],
  "devices":      [{ "key": "desktop", "value": 3012, "share": 0.6247 }],
  "countries":    [{ "key": "IN", "value": 980, "share": 0.2033 }]
}
```

### `GET /projects/:project/analytics/series`

Query: `metric`, `granularity` (default `day`), plus the range.

- `metric` — `events`, `visitors`, `sessions`, `bounceRate`, `avgSessionSeconds`
- `granularity` — `hour`, `day`, `week`, `month`

```json
{
  "metric": "visitors", "granularity": "day",
  "points": [{ "bucket": "2026-10-20T00:00:00.000Z", "value": 612 }],
  "total": 4821, "previousTotal": 4190
}
```

Empty buckets are returned as zeroes rather than omitted, so the series can be plotted directly.
`previousTotal` is the same metric over the immediately preceding window of equal length.

### `GET /projects/:project/analytics/breakdown`

Query: `dimension`, `limit` (1–100, default 10), plus the range.

`dimension` is one of `url`, `referrer`, `country`, `device`, `browser`, `os`, `name`. Referrers are
grouped by host, so one site is a single row. Rows past `limit` are collapsed into `otherValue`.

### `GET /projects/:project/analytics/live`

`{ "visitors": 17 }` — distinct visitors in the last five minutes.

### `POST /projects/:project/analytics/funnel`

```json
{
  "from": "2026-10-01", "to": "2026-10-26", "windowDays": 7,
  "steps": [
    { "name": "Landed",      "eventName": "page_view" },
    { "name": "Picked plan", "eventName": "plan_selected" },
    { "name": "Signed up",   "eventName": "signup_completed" }
  ]
}
```

2–8 steps. A visitor counts for a step only if they fired every earlier step *before* it and the
whole sequence fits inside `windowDays` of their entry.

```json
{
  "windowDays": 7,
  "steps": [
    { "name": "Landed", "eventName": "page_view", "visitors": 4821, "conversionFromPrevious": 1, "conversionFromStart": 1 },
    { "name": "Picked plan", "eventName": "plan_selected", "visitors": 912, "conversionFromPrevious": 0.1892, "conversionFromStart": 0.1892 },
    { "name": "Signed up", "eventName": "signup_completed", "visitors": 341, "conversionFromPrevious": 0.374, "conversionFromStart": 0.0707 }
  ]
}
```

---

## Events

### `GET /projects/:project/events`

Query: `limit` (1–200, default 50), `cursor`, `from`, `to`, `name`, `kind`.

```json
{
  "data": [ { "id": "evt_…", "kind": "pageview", "name": "page_view", "…": "…" } ],
  "page": { "limit": 50, "cursor": "MjAyNi0xMC0yNi4uLg", "hasMore": true }
}
```

Newest first, keyset paginated. Pass the returned `cursor` back to get the next page; `null` means
you have reached the end. Cursors are opaque — do not construct them.

### `GET /projects/:project/events/export.csv`

Query: `from`, `to` (both required). Streams CSV, so the range size is bounded by your patience
rather than by server memory. One header row, then one row per event with `properties` as a JSON
string.

---

## Funnels (saved)

| Method | Path | Role |
| --- | --- | --- |
| `GET` | `/projects/:project/funnels` | viewer |
| `POST` | `/projects/:project/funnels` | admin |
| `DELETE` | `/projects/:project/funnels/:id` | admin |

---

## Health

### `GET /health`

```json
{ "status": "ok", "version": "1.0.0", "uptimeSeconds": 8241, "checks": { "database": { "ok": true } } }
```

Returns `503` with `"status": "degraded"` when a dependency check fails, so a load balancer can act
on the status code alone.

### `GET /health/live`

Process liveness only — never touches the database. Use this for a Kubernetes liveness probe and
`/health` for readiness.

---

## Added in 1.1.0

### Bot filtering

Every analytics read excludes crawler traffic by default. Pass `includeBots=true` to include it:

```
GET /projects/acme/analytics/overview?from=…&to=…&includeBots=true
```

The raw event feed (`GET /projects/:project/events`) always shows everything, bots included — it is
the view you reach for when explaining a spike.

### `GET /projects/:project/analytics/retention`

Cohort retention. Query: `from`, `to`, `period` (`day` | `week` | `month`, default `week`),
`periods` (1–24, default 8).

```json
{
  "period": "week",
  "periods": 8,
  "rows": [
    {
      "cohort": "2026-10-05T00:00:00.000Z",
      "size": 420,
      "retained": [420, 168, 101, 84],
      "rates": [1, 0.4, 0.2405, 0.2]
    }
  ]
}
```

A visitor belongs to the cohort of their **first ever** visit, not their first visit inside the
range, so widening the range never moves anyone between cohorts. `retained` is shorter than
`periods` for recent cohorts that have not had time to return — a missing entry means "not yet",
which is a different thing from `0`.

### `GET /projects/:project/events/export.ndjson`

The same export as `export.csv`, in newline-delimited JSON. Query: `from`, `to`.

Preferred when the destination is a pipeline rather than a spreadsheet: `properties` stays a real
object instead of a quoted JSON string in a cell. Also safer to truncate — every complete line is
usable even if the connection drops, which is not true of a JSON array.

### Users

All of these need a bearer token.

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| `GET` | `/users` | admin | The whole team. Never includes password hashes |
| `PATCH` | `/users/:id/role` | owner | `{ "role": "owner" \| "admin" \| "viewer" }` |
| `DELETE` | `/users/:id` | owner | Cascades to their projects. Cannot delete yourself |
| `POST` | `/users/me/password` | any | `{ currentPassword, newPassword }` |

The last owner cannot be demoted or deleted — otherwise an install ends up with nobody able to
administer it, and the only recovery is editing the database by hand.

`POST /users/me/password` requires the current password even though the caller is already
authenticated, which stops someone with a borrowed open session locking the real owner out. It
returns `{ "revoked": n }`: every other session is signed out, which is the point of changing a
password after a suspected compromise.

### `GET /metrics`

Prometheus text format, unauthenticated — a scraper cannot easily hold a rotating JWT.

```
# TYPE devpulse_events_ingested_total counter
devpulse_events_ingested_total{project="acme-marketing"} 19043
devpulse_events_rejected_total{project="acme-marketing"} 12
devpulse_http_requests_total{method="POST",status="2xx"} 8210
devpulse_retention_events_deleted_total 51200
# TYPE devpulse_uptime_seconds gauge
devpulse_uptime_seconds 8241
devpulse_events_stored 19043
devpulse_projects_total 3
```

It exposes counts and no event contents, but keep it off the public internet at the reverse proxy
anyway. Values are per-process, so Prometheus is expected to aggregate across replicas.
