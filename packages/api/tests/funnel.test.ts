import { beforeEach, describe, expect, it } from 'vitest';
import { computeFunnel, listFunnels, saveFunnel } from '../src/services/funnel.service.js';
import { daysAgo, freshDb, insertEvent, insertProject } from './helpers.js';
import type { Db } from '../src/db/client.js';

const PROJECT = 'prj_test';
const range = { from: daysAgo(30), to: daysAgo(-1) };

const STEPS = [
  { name: 'Landed', eventName: 'page_view' },
  { name: 'Picked a plan', eventName: 'plan_selected' },
  { name: 'Signed up', eventName: 'signup_completed' },
];

describe('computeFunnel', () => {
  let db: Db;

  beforeEach(() => {
    db = freshDb();
    insertProject(db);
  });

  it('reports a full conversion when one visitor completes every step in order', () => {
    const visitor = 'anon_complete001';
    insertEvent(db, { anonymousId: visitor, name: 'page_view', timestamp: daysAgo(3) });
    insertEvent(db, { anonymousId: visitor, name: 'plan_selected', timestamp: daysAgo(3, -1) });
    insertEvent(db, { anonymousId: visitor, name: 'signup_completed', timestamp: daysAgo(3, -2) });

    const result = computeFunnel({ projectId: PROJECT, steps: STEPS, windowDays: 7, ...range });

    expect(result.steps.map((s) => s.visitors)).toEqual([1, 1, 1]);
    expect(result.steps[2]?.conversionFromStart).toBe(1);
  });

  it('drops a visitor who skips an intermediate step', () => {
    const visitor = 'anon_skipper001';
    insertEvent(db, { anonymousId: visitor, name: 'page_view', timestamp: daysAgo(3) });
    insertEvent(db, { anonymousId: visitor, name: 'signup_completed', timestamp: daysAgo(3, -1) });

    const result = computeFunnel({ projectId: PROJECT, steps: STEPS, windowDays: 7, ...range });

    expect(result.steps.map((s) => s.visitors)).toEqual([1, 0, 0]);
  });

  it('requires the steps to happen in order, not merely to exist', () => {
    const visitor = 'anon_outoforder';
    // The plan is selected *before* the pageview, so this is not a conversion.
    insertEvent(db, { anonymousId: visitor, name: 'plan_selected', timestamp: daysAgo(5) });
    insertEvent(db, { anonymousId: visitor, name: 'page_view', timestamp: daysAgo(3) });

    const result = computeFunnel({
      projectId: PROJECT,
      steps: STEPS.slice(0, 2),
      windowDays: 7,
      ...range,
    });

    expect(result.steps[1]?.visitors).toBe(0);
  });

  it('excludes a conversion that falls outside the window', () => {
    const visitor = 'anon_slowpoke01';
    insertEvent(db, { anonymousId: visitor, name: 'page_view', timestamp: daysAgo(20) });
    insertEvent(db, { anonymousId: visitor, name: 'plan_selected', timestamp: daysAgo(2) });

    const result = computeFunnel({
      projectId: PROJECT,
      steps: STEPS.slice(0, 2),
      windowDays: 7,
      ...range,
    });

    expect(result.steps[1]?.visitors).toBe(0);
  });

  it('includes that same conversion once the window is widened', () => {
    const visitor = 'anon_slowpoke01';
    insertEvent(db, { anonymousId: visitor, name: 'page_view', timestamp: daysAgo(20) });
    insertEvent(db, { anonymousId: visitor, name: 'plan_selected', timestamp: daysAgo(2) });

    const result = computeFunnel({
      projectId: PROJECT,
      steps: STEPS.slice(0, 2),
      windowDays: 30,
      ...range,
    });

    expect(result.steps[1]?.visitors).toBe(1);
  });

  it('computes stepwise and cumulative conversion separately', () => {
    for (let i = 0; i < 4; i += 1) {
      insertEvent(db, {
        anonymousId: `anon_cohort000${i}`,
        name: 'page_view',
        timestamp: daysAgo(5),
      });
    }
    insertEvent(db, {
      anonymousId: 'anon_cohort0000',
      name: 'plan_selected',
      timestamp: daysAgo(4),
    });
    insertEvent(db, {
      anonymousId: 'anon_cohort0001',
      name: 'plan_selected',
      timestamp: daysAgo(4),
    });
    insertEvent(db, {
      anonymousId: 'anon_cohort0000',
      name: 'signup_completed',
      timestamp: daysAgo(3),
    });

    const result = computeFunnel({ projectId: PROJECT, steps: STEPS, windowDays: 7, ...range });

    expect(result.steps[1]?.conversionFromPrevious).toBeCloseTo(0.5, 3);
    expect(result.steps[2]?.conversionFromPrevious).toBeCloseTo(0.5, 3);
    expect(result.steps[2]?.conversionFromStart).toBeCloseTo(0.25, 3);
  });

  it('rejects a funnel with fewer than two steps', () => {
    expect(() =>
      computeFunnel({ projectId: PROJECT, steps: STEPS.slice(0, 1), windowDays: 7, ...range }),
    ).toThrow(/at least two steps/);
  });

  it('returns zeroed steps for a project with no events', () => {
    const result = computeFunnel({ projectId: PROJECT, steps: STEPS, windowDays: 7, ...range });

    expect(result.steps.every((s) => s.visitors === 0)).toBe(true);
  });
});

describe('saved funnels', () => {
  it('round-trips a definition through the database', () => {
    const db = freshDb();
    insertProject(db);

    const saved = saveFunnel(PROJECT, 'Signup flow', STEPS);
    const listed = listFunnels(PROJECT);

    expect(saved.id).toMatch(/^fnl_/);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.steps).toEqual(STEPS);
  });
});
