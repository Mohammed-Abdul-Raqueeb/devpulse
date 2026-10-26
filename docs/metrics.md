# Metrics defined

Every analytics tool computes these slightly differently, and the differences are rarely written
down. Here is exactly what DevPulse means by each number, so you can tell whether a figure
disagrees with another tool because of a bug or because of a definition.

## Bots are excluded by default

Requests whose user agent matches a crawler pattern are stored with `device: 'bot'` and left out of
every analytics number: visitors, events, sessions, bounce rate, session length, breakdowns,
retention and the live count.

They are stored rather than discarded, because a sudden crawl is often exactly what explains a
traffic spike. Pass `includeBots=true`, or hit the toggle on the dashboard, to see them.

The raw event feed is the one exception — it always shows everything, since that is the view you
reach for when you are trying to explain something.

## Visitors

`COUNT(DISTINCT anonymous_id)` within the range.

`anonymousId` is a random value the client persists in `localStorage`. So:

- A visitor who clears site data, switches browser or switches device counts again.
- A visitor who returns next month is the *same* visitor, not a new one.
- Visitors do not sum across periods. Two weeks each with 100 visitors is not 200 visitors for the
  fortnight — a single query over the fortnight is the only correct way to get that number, which is
  why the dashboard re-queries rather than adding up buckets.

## Sessions

`COUNT(DISTINCT session_id)`.

`sessionId` lives in `sessionStorage`, so it ends when the tab does, and it also expires after
**30 minutes of inactivity**. The idle clock resets on every event, so fifty minutes of steady
browsing is one session, while a thirty-one minute coffee break splits it into two.

A tab left open overnight therefore reports two sessions, not one sixteen-hour one.

## Events

`COUNT(*)` — every row, including pageviews, custom events, identifies and errors. This is the only
metric that is a plain row count, and the only one that sums across periods.

## Bounce rate

The fraction of sessions with **one event or fewer**.

Computed as an aggregate of an aggregate: events are rolled up per session first, then averaged
across sessions. Two consequences worth knowing:

- It is a fraction, not a percentage — `0.4137` on the API, rendered as `41.4%`.
- The window total is recomputed from scratch rather than averaged from the per-bucket values.
  Averaging the averages would weight a quiet hour as heavily as a busy one.

A visitor who reads one page thoroughly and leaves satisfied is a bounce here. That is the standard
definition, and it is a weakness of the metric rather than of this implementation — if you care
about engaged single-page visits, track a custom event and build a funnel instead.

## Average session length

`MAX(timestamp) - MIN(timestamp)` per session, averaged across sessions, in seconds.

This systematically **under-reports**, and unavoidably so: the time spent on the last page of a
visit is invisible, because nothing is recorded after the final event. A single-event session
therefore has a length of exactly zero, which also drags the average down.

Compare this number against itself over time, not against another tool.

## Funnels

A visitor counts for step *N* only if they fired every earlier step **before** it, and the whole
sequence fits inside the conversion window (default 7 days, measured from their entry).

This is stricter than the common implementation, which asks only whether both events exist
somewhere in the range — that version counts someone who signed up and *then* looked at pricing as
a conversion.

- `conversionFromPrevious` — fraction of the previous step that reached this one. This is the number
  that tells you where the problem is.
- `conversionFromStart` — fraction of step one that reached this one. This is the shape of the
  funnel.

Only a visitor's **first** occurrence of each event is considered, so repeatedly firing a step does
not help them advance.

## Retention cohorts

A visitor belongs to the cohort of the period in which they were **first ever seen**, not their
first visit inside the selected range. That lookup scans all of a project's history.

It matters more than it sounds: without it, a visitor from last year looks brand new this week and
every cohort reports impossibly good retention. It also means widening the date range never moves
anyone between cohorts.

- Column 0 is always 100% — a cohort is by definition present in its own period.
- A blank cell is a period the cohort has not reached yet. A `0%` cell means nobody came back.
- A visitor may skip a period and return later; they count in whichever periods they were active.

## Breakdowns

Rows are ranked by `COUNT(DISTINCT anonymous_id)` — visitors, not events. A single visitor
reloading a page twenty times is one row-unit, not twenty.

`share` is each row's fraction of the **total across all rows**, including the ones collapsed into
`otherValue`. So the visible shares will not sum to 1 when the breakdown was truncated.

Referrers are grouped by host, so every link from `news.ycombinator.com` is one row. An empty
referrer is reported as `direct`.

Note that the bars on the dashboard are scaled against the **largest row**, not the total — the
point of that view is comparison between rows, so the top item always fills the width.

## Live visitors

Distinct non-bot `anonymous_id` values seen in the last five minutes. The dashboard polls it every
30 seconds and pauses while the tab is hidden, so it can lag by up to half a minute.

## Time buckets

All bucketing is **UTC**, not the viewer's timezone. A "day" is a UTC day.

That is a deliberate trade: it means every viewer of the same dashboard sees the same numbers, at
the cost of the boundaries not lining up with your local midnight. Weeks start on Monday.

Series are zero-padded, so an empty bucket is returned as `0` rather than omitted — a gap in a chart
and a zero mean different things, and this way you always get the latter.

## Operational metrics

Separate from analytics, `GET /metrics` exposes Prometheus counters about the service itself:
events ingested and rejected, HTTP responses by status class, retention deletions, uptime, and
stored-event and project gauges.

These are per-process. Behind multiple replicas, Prometheus is expected to aggregate them.
