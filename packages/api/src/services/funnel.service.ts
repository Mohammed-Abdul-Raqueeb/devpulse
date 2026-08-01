import {
  createId,
  type FunnelResult,
  type FunnelStepDefinition,
  type FunnelStepResult,
  type TimeRange,
} from '@devpulse/shared';
import { getDb } from '../db/client.js';
import { badRequest, notFound } from '../lib/errors.js';

export interface FunnelOptions extends TimeRange {
  projectId: string;
  steps: FunnelStepDefinition[];
  /** How long a visitor has to complete the whole funnel after entering it. */
  windowDays: number;
}

/**
 * Computes an ordered funnel.
 *
 * A visitor counts for step N only if they fired every earlier step *before* it,
 * and the whole sequence fits inside the conversion window. The implementation
 * walks the steps in order, carrying forward a map of visitor to the timestamp
 * at which they cleared the previous step — so the comparison stays strictly
 * ordered rather than merely checking that both events exist somewhere.
 */
export function computeFunnel(options: FunnelOptions): FunnelResult {
  if (options.steps.length < 2) throw badRequest('A funnel needs at least two steps');

  const windowMs = options.windowDays * 86_400_000;
  const db = getDb();

  const firstOccurrence = db.prepare(
    `SELECT anonymous_id, MIN(timestamp) AS at
     FROM events
     WHERE project_id = ? AND name = ? AND timestamp >= ? AND timestamp < ?
     GROUP BY anonymous_id`,
  );

  const rowsFor = (eventName: string, from: string): Map<string, number> => {
    const rows = firstOccurrence.all(options.projectId, eventName, from, options.to) as Array<{
      anonymous_id: string;
      at: string;
    }>;
    return new Map(rows.map((r) => [r.anonymous_id, Date.parse(r.at)]));
  };

  const results: FunnelStepResult[] = [];
  // Visitor -> the time they entered the funnel, used to enforce the window.
  let cohort = new Map<string, { enteredAt: number; clearedAt: number }>();

  options.steps.forEach((step, index) => {
    const occurrences = rowsFor(step.eventName, options.from);

    if (index === 0) {
      cohort = new Map(
        [...occurrences].map(([visitor, at]) => [visitor, { enteredAt: at, clearedAt: at }]),
      );
    } else {
      const next = new Map<string, { enteredAt: number; clearedAt: number }>();
      for (const [visitor, state] of cohort) {
        const at = occurrences.get(visitor);
        if (at === undefined) continue;
        // Must happen after the previous step and inside the window.
        if (at < state.clearedAt) continue;
        if (at - state.enteredAt > windowMs) continue;
        next.set(visitor, { enteredAt: state.enteredAt, clearedAt: at });
      }
      cohort = next;
    }

    const visitors = cohort.size;
    const previousVisitors = results[index - 1]?.visitors ?? visitors;
    const startVisitors = results[0]?.visitors ?? visitors;

    results.push({
      ...step,
      visitors,
      conversionFromPrevious: previousVisitors === 0 ? 0 : round(visitors / previousVisitors),
      conversionFromStart: startVisitors === 0 ? 0 : round(visitors / startVisitors),
    });
  });

  return { steps: results, windowDays: options.windowDays };
}

export interface SavedFunnel {
  id: string;
  projectId: string;
  name: string;
  steps: FunnelStepDefinition[];
  createdAt: string;
}

interface FunnelRow {
  id: string;
  project_id: string;
  name: string;
  steps: string;
  created_at: string;
}

export function saveFunnel(
  projectId: string,
  name: string,
  steps: FunnelStepDefinition[],
): SavedFunnel {
  const funnel: SavedFunnel = {
    id: createId('fnl'),
    projectId,
    name,
    steps,
    createdAt: new Date().toISOString(),
  };

  getDb()
    .prepare(
      'INSERT INTO saved_funnels (id, project_id, name, steps, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(funnel.id, projectId, name, JSON.stringify(steps), funnel.createdAt);

  return funnel;
}

export function listFunnels(projectId: string): SavedFunnel[] {
  const rows = getDb()
    .prepare('SELECT * FROM saved_funnels WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId) as FunnelRow[];
  return rows.map(toSavedFunnel);
}

export function deleteFunnel(id: string): void {
  const result = getDb().prepare('DELETE FROM saved_funnels WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('Funnel');
}

function toSavedFunnel(row: FunnelRow): SavedFunnel {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    steps: parseSteps(row.steps),
    createdAt: row.created_at,
  };
}

function parseSteps(raw: string): FunnelStepDefinition[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FunnelStepDefinition[]) : [];
  } catch {
    return [];
  }
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
