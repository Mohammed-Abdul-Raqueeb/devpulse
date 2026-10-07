#!/usr/bin/env node
/**
 * Ingestion load generator.
 *
 * Measures what the API sustains on your hardware rather than quoting a number
 * from someone else's. Reports the latency distribution, not just the mean —
 * the mean hides the tail, and the tail is what a client actually notices.
 *
 *   node scripts/load-test.mjs --key dp_live_... --batches 200 --size 100
 */

import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4000/ingest' },
    key: { type: 'string' },
    batches: { type: 'string', default: '100' },
    size: { type: 'string', default: '50' },
    concurrency: { type: 'string', default: '8' },
  },
});

if (!values.key) {
  console.error('Missing --key. Create a project to get a write key.');
  process.exit(1);
}

const batches = Number(values.batches);
const size = Number(values.size);
const concurrency = Number(values.concurrency);

function makeBatch() {
  const anon = `anon_${Math.random().toString(36).slice(2, 14)}`;
  const session = `ses_${Math.random().toString(36).slice(2, 14)}`;

  return {
    events: Array.from({ length: size }, (_, i) => ({
      kind: 'pageview',
      name: 'page_view',
      anonymousId: anon,
      sessionId: session,
      timestamp: new Date().toISOString(),
      url: `https://load.test/page-${i % 12}`,
      properties: { index: i },
    })),
  };
}

async function postBatch() {
  const startedAt = performance.now();
  const response = await fetch(values.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Write-Key': values.key },
    body: JSON.stringify(makeBatch()),
  });
  // Drain the body: leaving it unread keeps the socket busy and skews the next timing.
  await response.text();
  return { ms: performance.now() - startedAt, status: response.status };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function main() {
  console.log(`Posting ${batches} batches of ${size} events at concurrency ${concurrency}…`);

  const latencies = [];
  const statuses = new Map();
  let dispatched = 0;
  const startedAt = performance.now();

  // A fixed pool of workers pulling from a shared counter keeps exactly
  // `concurrency` requests in flight, which a Promise.all over chunks does not.
  const worker = async () => {
    while (dispatched < batches) {
      dispatched += 1;
      const result = await postBatch();
      latencies.push(result.ms);
      statuses.set(result.status, (statuses.get(result.status) ?? 0) + 1);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  const totalSeconds = (performance.now() - startedAt) / 1000;
  const sorted = [...latencies].sort((a, b) => a - b);
  const events = batches * size;

  console.log('\nResults');
  console.log('─'.repeat(44));
  console.log(`events            ${events}`);
  console.log(`wall time         ${totalSeconds.toFixed(2)}s`);
  console.log(`throughput        ${Math.round(events / totalSeconds)} events/s`);
  console.log(`batches/s         ${(batches / totalSeconds).toFixed(1)}`);
  console.log('─'.repeat(44));
  console.log(`latency p50       ${percentile(sorted, 50).toFixed(1)}ms`);
  console.log(`latency p95       ${percentile(sorted, 95).toFixed(1)}ms`);
  console.log(`latency p99       ${percentile(sorted, 99).toFixed(1)}ms`);
  console.log(`latency max       ${percentile(sorted, 100).toFixed(1)}ms`);
  console.log('─'.repeat(44));
  for (const [status, count] of [...statuses].sort()) {
    console.log(`HTTP ${status}          ${count}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
