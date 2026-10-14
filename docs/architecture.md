# Architecture

This document explains why DevPulse is built the way it is. The code tells you what it does; this
tells you what the alternatives were and why they were not chosen.

## The shape of the problem

Analytics is a write-heavy, read-bursty workload with an unusual property: the writes are tiny,
independent and tolerant of loss, while the reads are large aggregates that must feel instant. Most
of the design follows from taking that seriously.

```
   customer website                DevPulse
  ┌─────────────────┐     ┌──────────────────────────────────┐
  │ tracking snippet│     │                                  │
  │  batches events ├────►│ POST /ingest                      │
  │  flushes on     │     │   ├─ write key -> project         │
  │  pagehide       │     │   ├─ per-event zod validation     │
  └─────────────────┘     │   └─ one transaction per batch    │
                          │                 │                 │
                          │                 ▼                 │
                          │          ┌─────────────┐          │
                          │          │  SQLite WAL │          │
                          │          └──────┬──────┘          │
                          │                 │                 │
  ┌─────────────────┐     │  GET /analytics/* (aggregates)    │
  │ React dashboard │◄────┤  GET /events      (keyset page)   │
  └─────────────────┘     │  POST /analytics/funnel           │
                          └──────────────────────────────────┘
```

## Why SQLite

The obvious choice would be Postgres, or a columnar store like ClickHouse. SQLite was chosen because
the deployment story dominates everything else for a self-hosted tool: one file, no daemon, no
connection pool, no network hop between the API and its data.

The performance concern is misplaced at this scale. With WAL mode and batched transactions, a single
Node process sustains tens of thousands of event inserts per second, and the composite index on
`(project_id, timestamp)` serves every dashboard query by range scan. The real ceiling is
single-writer concurrency, and ingestion is the only writer.

What was given up:

- **Horizontal write scaling.** One file means one writer. If you outgrow that, you have outgrown
  this tool.
- **Columnar aggregation speed.** A `COUNT(DISTINCT anonymous_id)` over 50M rows is a scan, not a
  pre-aggregated lookup. Acceptable up to a few tens of millions of events per project.

The repository pattern in `services/` keeps SQL in one layer, so swapping the store later would be a
contained change rather than a rewrite.

### Pragmas

`journal_mode = WAL` lets the dashboard read while a batch is being written — without it, every
ingest blocks every query. `synchronous = NORMAL` trades durability on an OS crash for a large write
speedup, which is the right trade for analytics events specifically: losing the last few hundred
milliseconds of pageviews costs nothing, and the alternative is an fsync per batch.

## Why a monorepo with a shared package

The `shared` package exists for one reason: a request schema should be defined once. The dashboard
validates a form with the same zod schema the API validates the request with, so a field cannot
drift between the two and the mismatch cannot reach production.

The constraint that makes this work is that `shared` imports nothing from either side and touches
neither the network nor the filesystem — so it is safe to bundle into the browser.

## Validation strategy

Validation happens at exactly one boundary: `middleware/validate.ts` parses the request against a
schema and *replaces* the request part with the parsed result. Handlers therefore receive coerced,
typed values and never re-check them. There is no second validation layer in the services, because
two layers means two places to forget.

Ingestion is the deliberate exception. It validates per event rather than per request, because
rejecting a 200-event batch over one bad event would make a client's retry logic much harder and
would lose 199 good events. The response reports which indices failed.

## The funnel algorithm

A naive funnel asks "did this visitor fire event A and event B?" — which counts someone who signed
up and *then* looked at pricing as a conversion.

`computeFunnel` instead walks the steps in order, carrying a map of visitor to the timestamp at
which they cleared the previous step. A visitor advances only if their first occurrence of the next
event is *after* that timestamp and within the conversion window of their entry. That makes the
result an ordered sequence rather than a set intersection.

The cost is one query per step rather than one query total. With the `(project_id, name, timestamp)`
index each is a cheap range scan, and a funnel is capped at eight steps.

## Pagination

The event feed uses keyset pagination on `(timestamp, id)` rather than `LIMIT/OFFSET`.

Offset pagination re-scans every skipped row, so page 500 costs 500 pages of work. Worse, on a feed
that is being appended to, rows shift between requests — so scrolling can both skip and duplicate
events. Seeking on the sort key is stable under concurrent writes and uses the index directly. The
cursor is the opaque base64 of `timestamp|id`, so clients cannot construct one and the encoding can
change without breaking them.

## Session metrics

Bounce rate and average session length cannot be computed with a plain `GROUP BY` over events: they
are aggregates *of aggregates*. Both are computed in a subquery that rolls events up per session
first, then averages across sessions.

This is also why the window total is recomputed from scratch rather than averaged from the per-bucket
values — averaging the per-bucket averages would weight a quiet hour as heavily as a busy one.

## Rate limiting

The limiter is an in-process fixed window `Map`. For a single-node self-hosted install this is
correct and costs nothing; adding Redis would be the single largest operational burden in the
project for a feature most installs do not need.

Behind multiple replicas the effective limit becomes per-replica. That is documented in
[deployment.md](deployment.md) rather than silently wrong.

Ingestion is limited per *project* rather than per IP, so one busy customer site cannot exhaust the
budget of another. Auth attempts are limited per email, which blunts credential stuffing spread
across many IPs.

## Secrets

Write keys and refresh tokens are stored as SHA-256 hashes; passwords use bcrypt at cost 12. The
distinction matters: write keys and refresh tokens are long random values, so a fast hash is enough
and a slow one would make every ingest expensive. Passwords are low-entropy and chosen by humans, so
they need a deliberately slow KDF.

The consequence is that a plaintext write key is shown exactly once, at creation, and rotation is
the only recovery path. That is a real usability cost accepted to make a database dump useless to an
attacker.

## Error handling

There is one error type (`AppError`) and one place that formats a response (`middleware/error-handler.ts`).
Everything else throws. Routes do not build error bodies, which is what keeps the envelope
consistent enough for the dashboard to switch on `error.code` rather than parse messages.

An error that is *not* an `AppError` is treated as a fault: logged with a stack and reported as a
generic 500, so an internal message never leaks to a client.

## What is deliberately missing

- **Real-time streaming.** The live count polls every 30 seconds and pauses when the tab is hidden.
  A websocket would add a connection lifecycle to maintain for a number that does not need to be
  sub-second.
- **A plugin system.** Nothing here needs extension points yet, and designing them before there is a
  second use case usually produces the wrong abstraction.
- **Multi-tenant row-level security.** Project scoping is enforced in `buildWhere`, which every
  analytics query goes through. A single chokepoint is easier to audit than a policy engine.
