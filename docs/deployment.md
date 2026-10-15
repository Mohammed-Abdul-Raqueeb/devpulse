# Deployment

DevPulse is one Node process and one SQLite file. The whole deployment story follows from that.

## Environment

The API parses its environment once, at startup, and refuses to boot on a bad value rather than
failing later as a 500. Every variable:

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | Set `production` to get JSON logs |
| `PORT` | `4000` | |
| `HOST` | `0.0.0.0` | |
| `DATABASE_PATH` | `./data/devpulse.db` | Directory is created if missing |
| `JWT_SECRET` | — | **Required**, ≥32 characters |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Keep short; refresh is cheap |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated. Dashboard origins only |
| `LOG_LEVEL` | `info` | |
| `ENABLE_JOBS` | `true` | Set `false` on replicas — see below |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`TRUST_PROXY` matters more than it looks: with it unset behind nginx, every request appears to come
from the proxy's IP, so IP-keyed rate limiting collapses into a single global bucket.

## Docker

```bash
docker compose up -d --build
docker compose exec api node dist/db/seed.js   # optional demo data
```

The compose file mounts `./data` so the database survives a container rebuild. That volume is the
entirety of your state — back it up and you have backed up everything.

## Behind a reverse proxy

```nginx
server {
  listen 443 ssl http2;
  server_name analytics.example.com;

  # The dashboard: a static SPA build.
  location / {
    root /var/www/devpulse;
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:4000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Ingestion is called cross-origin from customer sites; let it through
  # without the dashboard's origin restrictions.
  location /api/ingest {
    proxy_pass http://127.0.0.1:4000/ingest;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header CF-IPCountry $http_cf_ipcountry;
  }
}
```

If you terminate TLS at Cloudflare, the `CF-IPCountry` header is what populates the country
breakdown. Without a geo header, `country` stays null and that breakdown is empty — which is a
feature if you would rather not record it.

## Running more than one instance

Two things become per-instance rather than global:

**Rate limiting.** The limiter is an in-process `Map`, so N replicas means N times the configured
limit. Either divide the limits by your replica count or do the limiting at the proxy.

**Background jobs.** Set `ENABLE_JOBS=false` on every replica but one. Running the retention sweep
on several instances at once is harmless but wasteful — they will contend for the single write lock.

SQLite itself is the harder constraint: concurrent writers need the file on a local disk, not NFS.
In practice, scale this vertically.

## Backups

```bash
# Online backup — safe while the API is running, unlike `cp`.
sqlite3 data/devpulse.db ".backup '/backups/devpulse-$(date +%F).db'"
```

Use `.backup`, not `cp`. In WAL mode a plain copy can capture a torn snapshot — the main file
without the matching WAL contents.

To restore, stop the API, replace the file, and start it again. Migrations are idempotent, so the
next boot brings an older database up to the current schema by itself.

## Retention

Each project has its own `retentionDays`. A sweep runs every 6 hours, deletes per project rather
than globally (a long `DELETE` holds the write lock, and per-project keeps the stall brief), and
reclaims freed pages with an incremental vacuum.

The file does not shrink on its own. To actually reclaim disk after a large deletion:

```bash
sqlite3 data/devpulse.db "VACUUM;"
```

That rewrites the whole database and takes an exclusive lock, so do it during a quiet window.

## Health checks

| Probe | Endpoint | Why |
| --- | --- | --- |
| Liveness | `/health/live` | Never touches the database, so a slow query cannot get the container killed |
| Readiness | `/health` | Returns `503` when the database is unreachable |

## Observability

Production logs are newline-delimited JSON on stdout, which any shipper can parse. Every line
carries the `requestId`, which is also in the `X-Request-Id` response header and in every error
body — so a user-reported error maps to its log lines directly.

Authorization headers, write keys, cookies, passwords and refresh tokens are redacted by the logger
rather than filtered at the shipper. That is deliberate: the secret should never leave the process
in the first place.

## Hardening checklist

- [ ] `JWT_SECRET` is random and not shared with any other environment
- [ ] `CORS_ORIGINS` lists only your dashboard origin
- [ ] Each project's `allowedOrigins` is set, so a leaked write key is not usable from anywhere
- [ ] `TRUST_PROXY=true` and the proxy sets `X-Forwarded-For`
- [ ] TLS terminates before the API; the API itself is not internet-facing on `:4000`
- [ ] The `data/` volume is backed up, and a restore has actually been tested
- [ ] `ENABLE_JOBS` is true on exactly one instance
