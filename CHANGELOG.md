# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/Mohammed-Abdul-Raqueeb/devpulse/releases/tag/v1.0.0
