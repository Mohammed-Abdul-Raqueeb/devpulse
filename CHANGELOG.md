# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-26

### Added

- **`@devpulse/sdk`** — a typed browser tracking client, ~2 kB gzipped with no runtime
  dependencies. Batches events, flushes on `pagehide` with `sendBeacon`, retries transient failures
  with jittered backoff, and degrades to in-memory identity when storage is blocked. Every browser
  dependency is injectable, so it is testable without a DOM.
- **Cohort retention** — `GET /projects/:project/analytics/retention` plus a dashboard screen with
  the cohort triangle. A visitor belongs to the cohort of their first *ever* visit, so widening the
  range never reshuffles cohorts.
- **Team administration** — list members, change roles and remove accounts, with the last owner
  protected from demotion. Users can change their own password, which signs out every other session.
- **Prometheus metrics** at `GET /metrics`: events ingested and rejected, HTTP responses by status
  class, retention deletions, uptime and stored-event gauges.
- **NDJSON export** — `GET /projects/:project/events/export.ndjson`, for a pipeline rather than a
  spreadsheet.
- **Saved funnels in the dashboard** — save the current steps, reload them later, delete them.
- **Keyboard shortcuts** — `1`–`5` switch the date range, `b` toggles bot traffic. Ignored while
  typing in a field.
- **Docs** — [metrics.md](docs/metrics.md) defines every number and names where each is biased;
  [faq.md](docs/faq.md) answers the recurring questions.
- Devcontainer, editor settings, a `Makefile`, CodeQL scanning, a tagged-release workflow that
  publishes a multi-arch image, and a CI-enforced bundle size budget.

### Changed

- **Crawler traffic is now excluded from every analytics number by default** — visitors, events,
  sessions, bounce rate, session length, breakdowns, retention and the live count. Bot hits are
  still stored, and `includeBots=true` brings them back. The raw event feed is unchanged and still
  shows everything.
- A render error in one dashboard screen no longer blanks the whole app; an error boundary keeps the
  shell usable.
- An unknown route shows a not-found screen instead of silently redirecting to the project list,
  which used to make a renamed project look deleted.
- CI tests against Node 24 as well as 20 and 22, pins the runner image, and runs on the current
  action versions.

### Fixed

- Nothing: no defects were reported against 1.0.0.

## [1.0.0] - 2026-10-26

First stable release.

### Added

- **Ingestion** — batched `POST /ingest` with per-event validation and partial-success reporting,
  plus a `sendBeacon`-friendly pixel endpoint for clients without JavaScript.
- **Aggregation** — visitors, events, sessions, bounce rate and average session length over hour,
  day, week and month buckets, with zero-padded series and period-over-period deltas.
- **Breakdowns** — pages, referrers grouped by host, countries, devices, browsers and operating
  systems, with an `Other` bucket for the long tail.
- **Funnels** — ordered, windowed conversion analysis, plus saved funnel definitions.
- **Auth** — JWT access tokens with single-use rotating refresh tokens, bcrypt password hashing and
  three coarse roles.
- **Projects** — hashed write keys with rotation, per-project origin allow-lists and retention
  windows.
- **Dashboard** — React app with an inline-SVG chart, light/dark theming, live visitor count and a
  streaming CSV export.
- **Operations** — `/health` and `/health/live`, per-project rate limiting, a retention sweep job,
  graceful shutdown and structured JSON logging with secret redaction.

[1.1.0]: https://github.com/Mohammed-Abdul-Raqueeb/devpulse/releases/tag/v1.1.0
[1.0.0]: https://github.com/Mohammed-Abdul-Raqueeb/devpulse/releases/tag/v1.0.0
