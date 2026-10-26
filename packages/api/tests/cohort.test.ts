import { beforeEach, describe, expect, it } from 'vitest';
import { computeRetention } from '../src/services/cohort.service.js';
import { freshDb, insertEvent, insertProject } from './helpers.js';
import type { Db } from '../src/db/client.js';

const PROJECT = 'prj_test';

/** Fixed calendar so week boundaries are predictable: 2026-03-02 is a Monday. */
const WEEK_1 = '2026-03-02T10:00:00.000Z';
const WEEK_2 = '2026-03-09T10:00:00.000Z';
const WEEK_3 = '2026-03-16T10:00:00.000Z';

const range = { from: '2026-03-02T00:00:00.000Z', to: '2026-03-23T00:00:00.000Z' };

describe('computeRetention', () => {
  let db: Db;

  beforeEach(() => {
    db = freshDb();
    insertProject(db);
  });

  it('puts a visitor in the cohort of the week they first appeared', () => {
    insertEvent(db, { anonymousId: 'anon_w1_000001', timestamp: WEEK_1 });

    const report = computeRetention({ projectId: PROJECT, period: 'week', periods: 3, ...range });

    expect(report.rows[0]?.cohort).toBe('2026-03-02T00:00:00.000Z');
    expect(report.rows[0]?.size).toBe(1);
    expect(report.rows[1]?.size).toBe(0);
  });

  it('counts the cohort as fully present in its own period', () => {
    insertEvent(db, { anonymousId: 'anon_w1_000001', timestamp: WEEK_1 });
    insertEvent(db, { anonymousId: 'anon_w1_000002', timestamp: WEEK_1 });

    const report = computeRetention({ projectId: PROJECT, period: 'week', periods: 3, ...range });

    expect(report.rows[0]?.retained[0]).toBe(2);
    expect(report.rows[0]?.rates[0]).toBe(1);
  });

  it('counts only the visitors who came back in a later period', () => {
    insertEvent(db, { anonymousId: 'anon_loyal_0001', timestamp: WEEK_1 });
    insertEvent(db, { anonymousId: 'anon_loyal_0001', timestamp: WEEK_2 });
    insertEvent(db, { anonymousId: 'anon_gone__0001', timestamp: WEEK_1 });

    const report = computeRetention({ projectId: PROJECT, period: 'week', periods: 3, ...range });

    expect(report.rows[0]?.retained).toEqual([2, 1, 0]);
    expect(report.rows[0]?.rates[1]).toBeCloseTo(0.5, 4);
  });

  it('allows a visitor to skip a period and return later', () => {
    insertEvent(db, { anonymousId: 'anon_skipper001', timestamp: WEEK_1 });
    insertEvent(db, { anonymousId: 'anon_skipper001', timestamp: WEEK_3 });

    const report = computeRetention({ projectId: PROJECT, period: 'week', periods: 3, ...range });

    expect(report.rows[0]?.retained).toEqual([1, 0, 1]);
  });

  it('does not treat a returning visitor as a new cohort member', () => {
    // First seen in week 1, active again in week 2: week 2's cohort is empty.
    insertEvent(db, { anonymousId: 'anon_returner01', timestamp: WEEK_1 });
    insertEvent(db, { anonymousId: 'anon_returner01', timestamp: WEEK_2 });

    const report = computeRetention({ projectId: PROJECT, period: 'week', periods: 3, ...range });

    expect(report.rows[1]?.size).toBe(0);
  });

  it('excludes a visitor whose first-ever visit predates the window', () => {
    // Without the all-history first-seen lookup, this visitor would look brand
    // new and inflate the first cohort.
    insertEvent(db, { anonymousId: 'anon_veteran001', timestamp: '2026-01-05T10:00:00.000Z' });
    insertEvent(db, { anonymousId: 'anon_veteran001', timestamp: WEEK_1 });

    const report = computeRetention({ projectId: PROJECT, period: 'week', periods: 3, ...range });

    expect(report.rows[0]?.size).toBe(0);
  });

  it('follows a recent cohort only as far as the window allows', () => {
    insertEvent(db, { anonymousId: 'anon_w3_000001', timestamp: WEEK_3 });

    const report = computeRetention({ projectId: PROJECT, period: 'week', periods: 8, ...range });

    // The third week is the last in range, so it has exactly one period of data.
    expect(report.rows[2]?.retained).toHaveLength(1);
  });

  it('ignores crawler traffic', () => {
    insertEvent(db, {
      anonymousId: 'anon_crawler001',
      timestamp: WEEK_1,
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    });

    const report = computeRetention({ projectId: PROJECT, period: 'week', periods: 3, ...range });

    expect(report.rows[0]?.size).toBe(0);
  });

  it('supports daily cohorts', () => {
    insertEvent(db, { anonymousId: 'anon_day_000001', timestamp: '2026-03-02T08:00:00.000Z' });
    insertEvent(db, { anonymousId: 'anon_day_000001', timestamp: '2026-03-03T08:00:00.000Z' });

    const report = computeRetention({
      projectId: PROJECT,
      period: 'day',
      periods: 3,
      from: '2026-03-02T00:00:00.000Z',
      to: '2026-03-05T00:00:00.000Z',
    });

    expect(report.rows[0]?.retained).toEqual([1, 1, 0]);
  });

  it('rejects a period count outside the supported range', () => {
    expect(() =>
      computeRetention({ projectId: PROJECT, period: 'week', periods: 99, ...range }),
    ).toThrow(/periods must be between/);
  });

  it('returns empty rows for a project with no events', () => {
    const report = computeRetention({ projectId: PROJECT, period: 'week', periods: 3, ...range });

    expect(report.rows.every((row) => row.size === 0)).toBe(true);
  });

  it('reports a zero rate rather than dividing by an empty cohort', () => {
    const report = computeRetention({ projectId: PROJECT, period: 'week', periods: 3, ...range });

    expect(report.rows[0]?.rates.every((rate) => rate === 0)).toBe(true);
  });
});
