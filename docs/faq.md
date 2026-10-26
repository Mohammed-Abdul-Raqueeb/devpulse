# FAQ

### My numbers disagree with Google Analytics / Plausible / Fathom.

Expected, and usually not a bug. The definitions differ — [metrics.md](metrics.md) says exactly what
DevPulse computes. The three most common causes:

- **Bots.** DevPulse excludes them by default. Some tools do not, or use a different list.
- **Sessions.** The 30-minute idle window and the `sessionStorage` lifetime are choices, not
  standards.
- **Ad blockers.** A self-hosted endpoint on your own domain is blocked far less often than a
  third-party script, so DevPulse usually reports *more* traffic than an analytics SaaS, not less.

### Does this need a cookie banner?

Not legal advice, but: DevPulse sets no cookies, stores no IP addresses, and the visitor id is a
random value in `localStorage` with no cross-site meaning. Country comes from a header your proxy
sets, not from an IP lookup.

Whether that still requires consent where you operate depends on your jurisdiction and on what you
put in event properties. If you send `{ email: ... }` on an `identify`, you are storing personal
data and the calculus changes.

### How much traffic can one instance handle?

Ingestion sustains tens of thousands of events per second on modest hardware, because each batch is
a single transaction. Reads are the real limit: aggregate queries are range scans, so they stay fast
into the low tens of millions of events per project and get noticeably slower beyond that.

Measure yours rather than trusting that number:

```bash
node scripts/load-test.mjs --key dp_live_... --batches 200 --size 100
node scripts/db-stats.mjs
```

### Why SQLite rather than Postgres?

Deployment simplicity dominates every other concern for a self-hosted tool: one file, no daemon, no
connection pool, no network hop. The reasoning and what it costs are in
[architecture.md](architecture.md).

The real ceiling is single-writer concurrency. Ingestion is the only writer, so that ceiling is
higher than it sounds.

### Can I run more than one instance?

Yes, with two caveats, both in [deployment.md](deployment.md): rate limits become per-replica, and
`ENABLE_JOBS` must be true on exactly one of them. SQLite also needs the file on a local disk, not
NFS — so scale this vertically.

### I lost my write key.

It is stored hashed and cannot be recovered. Rotate it from the project's Settings page, then update
your snippet. The old key stops working immediately.

### Can I delete one visitor's data?

Not through the UI yet. Directly:

```sql
DELETE FROM events WHERE project_id = 'prj_...' AND anonymous_id = 'anon_...';
```

For a subject access request, the same filter with `SELECT *` gives you everything stored about
them — there is nothing held outside the `events` table.

### Why are my session lengths so short?

Because the time on the last page of a visit is invisible — nothing is recorded after the final
event. Single-event sessions therefore have a length of zero. Every tool that measures this way has
the same bias; compare the number against itself over time, not against another tool.

### An event is being rejected and I cannot see why.

The `207` response body names the offending index and field. The usual causes: `anonymousId` or
`sessionId` under 8 characters, a nested object in `properties`, more than 40 property keys, or a
`url` that is not `http(s)`.

### Events post fine with curl but not from my site.

Almost always the origin allow-list. If a project has `allowedOrigins` set, a request from anywhere
else gets a `403`. Either add the origin or clear the list to allow any.

### Does the dashboard work without JavaScript?

No. Ingestion does — use the pixel endpoint, documented in [tracking.md](tracking.md).

### How do I back up?

```bash
sqlite3 data/devpulse.db ".backup '/backups/devpulse-$(date +%F).db'"
```

Use `.backup`, not `cp`: in WAL mode a plain copy can capture a torn snapshot.

### Where did my disk space go?

Deleted rows free pages but do not shrink the file. `node scripts/db-stats.mjs` reports how much is
reclaimable, and `VACUUM` reclaims it — during a quiet window, since it takes an exclusive lock.

### Can I use the SDK with Next.js / Remix / SvelteKit?

Yes. `createClient` degrades to a no-op where there is no `window`, so importing it in a
server-rendered module is safe. Pass `autoPageview: false` and call `page()` from your router, or
the first load is counted twice.
