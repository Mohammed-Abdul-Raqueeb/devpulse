# DevPulse

Self-hosted product analytics you can actually read the source of. An event ingestion API, an
aggregation engine over SQLite, and a dashboard — one repository, one `npm install`, no external
services.

[![CI](https://github.com/Mohammed-Abdul-Raqueeb/devpulse/actions/workflows/ci.yml/badge.svg)](https://github.com/Mohammed-Abdul-Raqueeb/devpulse/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Why this exists

Most analytics tools make you choose between handing your visitors' data to a third party and
running a cluster. DevPulse takes a third option: a single Node process and a single SQLite file
that will comfortably handle millions of events per project on a $5 VPS.

It is also small enough to read end to end, which is the point — if a number on the dashboard looks
wrong, you can follow it from the SQL that produced it back to the event that caused it.

## What it does

- **Event ingestion** — batched `POST /ingest`, a `sendBeacon`-friendly pixel fallback, per-event
  validation so one malformed event never costs you the batch, and partial-success reporting.
- **Aggregation** — visitors, events, sessions, bounce rate and average session length, bucketed by
  hour / day / week / month, with zero-padded series and period-over-period deltas.
- **Breakdowns** — top pages, referrers (grouped by host), countries, devices, browsers and OSes.
- **Funnels** — ordered, windowed conversion analysis. A step only counts if the visitor fired every
  earlier step *before* it, inside the conversion window.
- **Dashboard** — a React app with a hand-rolled SVG chart, light/dark theming and keyboard
  navigation. No chart library, no CSS framework.
- **Operations** — hashed write keys with rotation, JWT auth with rotating refresh tokens, per-project
  rate limiting, retention sweeps, CSV streaming export and a `/health` endpoint a load balancer can
  read.

## Quick start

```bash
git clone https://github.com/Mohammed-Abdul-Raqueeb/devpulse.git
cd devpulse
npm install

cp .env.example .env
# Generate a real secret — the API refuses to start without one:
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env

npm run seed      # 60 days of shaped demo traffic
npm run dev       # API on :4000, dashboard on :5173
```

Open <http://localhost:5173> and sign in with `demo@devpulse.dev` / `devpulse-demo-password`.

## Sending events

Grab the snippet from the project's Settings page, or post directly:

```bash
curl -X POST http://localhost:4000/ingest \
  -H 'Content-Type: application/json' \
  -H "X-Write-Key: $DEVPULSE_WRITE_KEY" \
  -d '{
    "events": [{
      "kind": "track",
      "name": "signup_completed",
      "anonymousId": "anon_8f2c1a9b4e7d",
      "sessionId": "ses_3b7e9f1c2a8d",
      "url": "https://acme.example/signup",
      "properties": { "plan": "pro", "seats": 4 }
    }]
  }'
```

A `202` means the whole batch was stored. A `207` means some events were rejected, and the body
names the offending indices so you can retry selectively.

## Layout

```
packages/
├── shared/   Types, zod schemas and pure helpers. Imported by both sides.
├── api/      Express + better-sqlite3. Ingestion, aggregation, auth, jobs.
└── web/      React + Vite dashboard.
docs/
├── api.md          Endpoint reference
├── architecture.md Why it is built this way
├── deployment.md   Running it in production
└── tracking.md     Client integration guide
```

The dependency rule is one-directional: `shared` knows about nobody, `api` and `web` both know about
`shared`, and they never know about each other. That is what lets a request schema be the single
source of truth for both server validation and dashboard forms.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API and dashboard together, both watching |
| `npm run build` | Type-check and build all three packages |
| `npm test` | Run the full vitest suite |
| `npm run coverage` | Suite plus a coverage report |
| `npm run lint` | ESLint, warnings treated as errors |
| `npm run typecheck` | `tsc --build` across the project references |
| `npm run seed` | Generate demo data |
| `npm run verify` | Everything CI runs, locally |

## Documentation

- [Architecture](docs/architecture.md) — the design decisions and the reasoning behind them
- [API reference](docs/api.md) — every endpoint, with request and response shapes
- [Tracking guide](docs/tracking.md) — integrating a client
- [Deployment](docs/deployment.md) — Docker, reverse proxies, backups
- [Contributing](CONTRIBUTING.md) — how to work on it

## License

MIT © Mohammed Abdul Raqueeb
