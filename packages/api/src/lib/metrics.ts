/**
 * A tiny Prometheus-format metrics registry.
 *
 * `prom-client` would be the obvious dependency, but DevPulse needs four
 * counters and a histogram-free latency summary, and this is the entire
 * implementation. It stays in-process, so a multi-replica deployment exposes
 * per-replica numbers that Prometheus is expected to aggregate.
 */

type Labels = Record<string, string>;

interface Counter {
  help: string;
  values: Map<string, { labels: Labels; value: number }>;
}

const counters = new Map<string, Counter>();

/** Registers a counter up front, so it is reported as 0 rather than absent. */
export function registerCounter(name: string, help: string): void {
  if (!counters.has(name)) counters.set(name, { help, values: new Map() });
}

export function increment(name: string, labels: Labels = {}, by = 1): void {
  const counter = counters.get(name);
  if (!counter) return;

  const key = labelKey(labels);
  const existing = counter.values.get(key);
  if (existing) existing.value += by;
  else counter.values.set(key, { labels, value: by });
}

export function readCounter(name: string, labels: Labels = {}): number {
  return counters.get(name)?.values.get(labelKey(labels))?.value ?? 0;
}

/** Clears every value. Used between tests. */
export function resetMetrics(): void {
  for (const counter of counters.values()) counter.values.clear();
}

export interface Gauge {
  name: string;
  help: string;
  /** Read at scrape time, so a gauge is always current rather than cached. */
  read: () => number;
}

const gauges: Gauge[] = [];

export function registerGauge(gauge: Gauge): void {
  if (!gauges.some((g) => g.name === gauge.name)) gauges.push(gauge);
}

/** Renders the registry in the Prometheus text exposition format. */
export function renderMetrics(): string {
  const lines: string[] = [];

  for (const [name, counter] of counters) {
    lines.push(`# HELP ${name} ${counter.help}`);
    lines.push(`# TYPE ${name} counter`);
    if (counter.values.size === 0) {
      lines.push(`${name} 0`);
      continue;
    }
    for (const { labels, value } of counter.values.values()) {
      lines.push(`${name}${renderLabels(labels)} ${value}`);
    }
  }

  for (const gauge of gauges) {
    lines.push(`# HELP ${gauge.name} ${gauge.help}`);
    lines.push(`# TYPE ${gauge.name} gauge`);
    // A gauge that throws must not take the whole scrape down with it.
    let value = Number.NaN;
    try {
      value = gauge.read();
    } catch {
      value = Number.NaN;
    }
    lines.push(`${gauge.name} ${Number.isFinite(value) ? value : 0}`);
  }

  return `${lines.join('\n')}\n`;
}

function labelKey(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key]}`)
    .join(',');
}

function renderLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  const rendered = entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(',');
  return `{${rendered}}`;
}

/** Backslash, quote and newline are the three characters the format reserves. */
function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// ---- the metrics DevPulse actually reports -------------------------------

export const EVENTS_INGESTED = 'devpulse_events_ingested_total';
export const EVENTS_REJECTED = 'devpulse_events_rejected_total';
export const HTTP_REQUESTS = 'devpulse_http_requests_total';
export const RETENTION_DELETED = 'devpulse_retention_events_deleted_total';

registerCounter(EVENTS_INGESTED, 'Events accepted by the ingestion endpoint.');
registerCounter(EVENTS_REJECTED, 'Events rejected during ingestion, by reason.');
registerCounter(HTTP_REQUESTS, 'HTTP requests handled, by method and status class.');
registerCounter(RETENTION_DELETED, 'Events deleted by the retention sweep.');
