import { beforeEach, describe, expect, it } from 'vitest';
import {
  breakdown,
  liveVisitors,
  metricSeries,
  overview,
} from '../src/services/analytics.service.js';
import { daysAgo, freshDb, insertEvent, insertProject } from './helpers.js';
import type { Db } from '../src/db/client.js';

const PROJECT = 'prj_test';
const range = { from: daysAgo(7), to: daysAgo(-1) };

describe('metricSeries', () => {
  let db: Db;

  beforeEach(() => {
    db = freshDb();
    insertProject(db);
  });

  it('counts events per bucket', () => {
    insertEvent(db, { timestamp: daysAgo(2) });
    insertEvent(db, { timestamp: daysAgo(2, 1) });
    insertEvent(db, { timestamp: daysAgo(1) });

    const series = metricSeries({
      projectId: PROJECT,
      metric: 'events',
      granularity: 'day',
      ...range,
    });

    expect(series.total).toBe(3);
  });

  it('pads empty buckets with zero so the chart has no gaps', () => {
    insertEvent(db, { timestamp: daysAgo(1) });

    const series = metricSeries({
      projectId: PROJECT,
      metric: 'events',
      granularity: 'day',
      ...range,
    });

    expect(series.points.length).toBeGreaterThan(5);
    expect(series.points.every((p) => typeof p.value === 'number')).toBe(true);
    expect(series.points.filter((p) => p.value === 0).length).toBeGreaterThan(0);
  });

  it('counts a repeat visitor once for the visitors metric', () => {
    insertEvent(db, { anonymousId: 'anon_repeat_0001', timestamp: daysAgo(2) });
    insertEvent(db, { anonymousId: 'anon_repeat_0001', timestamp: daysAgo(2, 2) });
    insertEvent(db, { anonymousId: 'anon_other_0001', timestamp: daysAgo(2) });

    const series = metricSeries({
      projectId: PROJECT,
      metric: 'visitors',
      granularity: 'month',
      ...range,
    });

    expect(series.total).toBe(2);
  });

  it('counts distinct sessions', () => {
    insertEvent(db, { sessionId: 'ses_aaaaaaaaaaa', timestamp: daysAgo(2) });
    insertEvent(db, { sessionId: 'ses_aaaaaaaaaaa', timestamp: daysAgo(2, 1) });
    insertEvent(db, { sessionId: 'ses_bbbbbbbbbbb', timestamp: daysAgo(2) });

    const series = metricSeries({
      projectId: PROJECT,
      metric: 'sessions',
      granularity: 'month',
      ...range,
    });

    expect(series.total).toBe(2);
  });

  it('never leaks another project rows', () => {
    insertProject(db, 'prj_other', 'other-project');
    insertEvent(db, { projectId: 'prj_other', timestamp: daysAgo(2) });
    insertEvent(db, { timestamp: daysAgo(2) });

    const series = metricSeries({
      projectId: PROJECT,
      metric: 'events',
      granularity: 'day',
      ...range,
    });

    expect(series.total).toBe(1);
  });

  it('applies an equality filter', () => {
    insertEvent(db, {
      timestamp: daysAgo(2),
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148',
    });
    insertEvent(db, { timestamp: daysAgo(2) });
    insertEvent(db, { timestamp: daysAgo(3) });

    const series = metricSeries({
      projectId: PROJECT,
      metric: 'events',
      granularity: 'day',
      filters: { device: 'mobile' },
      ...range,
    });

    expect(series.total).toBe(1);
  });

  it('treats a single-event session as a bounce', () => {
    insertEvent(db, { sessionId: 'ses_bounce00001', timestamp: daysAgo(2) });
    insertEvent(db, { sessionId: 'ses_engaged0001', timestamp: daysAgo(2) });
    insertEvent(db, { sessionId: 'ses_engaged0001', timestamp: daysAgo(2, -1) });

    const series = metricSeries({
      projectId: PROJECT,
      metric: 'bounceRate',
      granularity: 'month',
      ...range,
    });

    expect(series.total).toBeCloseTo(0.5, 3);
  });
});

describe('breakdown', () => {
  let db: Db;

  beforeEach(() => {
    db = freshDb();
    insertProject(db);
  });

  it('orders rows by descending value', () => {
    insertEvent(db, {
      url: 'https://x.test/a',
      anonymousId: 'anon_00000001',
      timestamp: daysAgo(1),
    });
    insertEvent(db, {
      url: 'https://x.test/a',
      anonymousId: 'anon_00000002',
      timestamp: daysAgo(1),
    });
    insertEvent(db, {
      url: 'https://x.test/b',
      anonymousId: 'anon_00000003',
      timestamp: daysAgo(1),
    });

    const result = breakdown({ projectId: PROJECT, dimension: 'url', limit: 10, ...range });

    expect(result.rows[0]?.key).toBe('https://x.test/a');
    expect(result.rows[0]?.value).toBe(2);
  });

  it('collapses rows beyond the limit into otherValue', () => {
    for (let i = 0; i < 5; i += 1) {
      insertEvent(db, {
        url: `https://x.test/p${i}`,
        anonymousId: `anon_0000000${i}`,
        timestamp: daysAgo(1),
      });
    }

    const result = breakdown({ projectId: PROJECT, dimension: 'url', limit: 2, ...range });

    expect(result.rows).toHaveLength(2);
    expect(result.otherValue).toBe(3);
  });

  it('shares sum to roughly one across all rows', () => {
    insertEvent(db, { country: 'IN', anonymousId: 'anon_00000001', timestamp: daysAgo(1) });
    insertEvent(db, { country: 'US', anonymousId: 'anon_00000002', timestamp: daysAgo(1) });

    const result = breakdown({ projectId: PROJECT, dimension: 'country', limit: 10, ...range });
    const sum = result.rows.reduce((acc, r) => acc + r.share, 0);

    expect(sum).toBeCloseTo(1, 3);
  });

  it('groups referrers by host', () => {
    insertEvent(db, {
      referrer: 'https://news.ycombinator.com/item?id=1',
      anonymousId: 'anon_00000001',
      timestamp: daysAgo(1),
    });
    insertEvent(db, {
      referrer: 'https://news.ycombinator.com/item?id=2',
      anonymousId: 'anon_00000002',
      timestamp: daysAgo(1),
    });

    const result = breakdown({ projectId: PROJECT, dimension: 'referrer', limit: 10, ...range });

    expect(result.rows[0]).toMatchObject({ key: 'news.ycombinator.com', value: 2 });
  });

  it('rejects a dimension that is not groupable', () => {
    expect(() =>
      breakdown({ projectId: PROJECT, dimension: 'password', limit: 10, ...range }),
    ).toThrow(/Cannot break down/);
  });

  it('returns an empty result rather than throwing when there is no data', () => {
    const result = breakdown({ projectId: PROJECT, dimension: 'url', limit: 10, ...range });

    expect(result.rows).toEqual([]);
    expect(result.otherValue).toBe(0);
  });
});

describe('overview', () => {
  it('reports totals and breakdowns together', () => {
    const db = freshDb();
    insertProject(db);
    insertEvent(db, { anonymousId: 'anon_00000001', timestamp: daysAgo(1) });
    insertEvent(db, { anonymousId: 'anon_00000002', timestamp: daysAgo(2) });

    const stats = overview(PROJECT, range);

    expect(stats.events).toBe(2);
    expect(stats.visitors).toBe(2);
    expect(stats.topPages.length).toBeGreaterThan(0);
  });
});

describe('liveVisitors', () => {
  it('counts only visitors from the last five minutes', () => {
    const db = freshDb();
    insertProject(db);
    insertEvent(db, { anonymousId: 'anon_now000001', timestamp: new Date().toISOString() });
    insertEvent(db, { anonymousId: 'anon_old000001', timestamp: daysAgo(1) });

    expect(liveVisitors(PROJECT)).toBe(1);
  });
});

describe('bot traffic', () => {
  const BOT_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

  let db: Db;

  beforeEach(() => {
    db = freshDb();
    insertProject(db);
    insertEvent(db, { anonymousId: 'anon_human000001', timestamp: daysAgo(1) });
    insertEvent(db, {
      anonymousId: 'anon_crawler0001',
      timestamp: daysAgo(1),
      userAgent: BOT_AGENT,
    });
  });

  it('leaves crawlers out of the totals by default', () => {
    const stats = overview(PROJECT, range);

    expect(stats.visitors).toBe(1);
    expect(stats.events).toBe(1);
  });

  it('counts crawlers when they are explicitly requested', () => {
    const stats = overview(PROJECT, range, {}, { includeBots: true });

    expect(stats.visitors).toBe(2);
  });

  it('leaves crawlers out of a metric series', () => {
    const series = metricSeries({
      projectId: PROJECT,
      metric: 'events',
      granularity: 'day',
      ...range,
    });

    expect(series.total).toBe(1);
  });

  it('leaves crawlers out of a breakdown', () => {
    const result = breakdown({ projectId: PROJECT, dimension: 'device', limit: 10, ...range });

    expect(result.rows.map((r) => r.key)).not.toContain('bot');
  });

  it('leaves crawlers out of the live visitor count', () => {
    insertEvent(db, {
      anonymousId: 'anon_crawler0002',
      timestamp: new Date().toISOString(),
      userAgent: BOT_AGENT,
    });

    expect(liveVisitors(PROJECT)).toBe(0);
  });
});
