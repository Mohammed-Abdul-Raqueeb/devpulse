import { beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '@devpulse/shared';
import {
  ingestBatch,
  isOriginAllowed,
  pruneExpiredEvents,
} from '../src/services/ingest.service.js';
import { daysAgo, freshDb, insertEvent, insertProject, validEvent } from './helpers.js';
import type { Db } from '../src/db/client.js';

const project: Project = {
  id: 'prj_test',
  name: 'Test Project',
  slug: 'test-project',
  ownerId: 'usr_test',
  allowedOrigins: [],
  retentionDays: 30,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('ingestBatch', () => {
  let db: Db;

  beforeEach(() => {
    db = freshDb();
    insertProject(db);
  });

  it('persists every valid event in the batch', () => {
    const result = ingestBatch([validEvent(), validEvent({ name: 'signup' })], { project });

    expect(result).toMatchObject({ accepted: 2, rejected: 0 });
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number };
    expect(count).toBe(2);
  });

  it('keeps valid events when a sibling event is malformed', () => {
    const result = ingestBatch([validEvent(), { kind: 'nope', name: '' }], { project });

    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.errors[0]?.index).toBe(1);
  });

  it('reports the index of each rejected event so a client can retry selectively', () => {
    const result = ingestBatch([{ bad: true }, validEvent(), { bad: true }], { project });

    expect(result.errors.map((e) => e.index)).toEqual([0, 2]);
  });

  it('derives device, browser and os from the user agent', () => {
    ingestBatch([validEvent()], {
      project,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });

    const row = db.prepare('SELECT device, os FROM events').get() as {
      device: string;
      os: string;
    };
    expect(row.device).toBe('mobile');
    expect(row.os).toBe('iOS');
  });

  it('clamps a timestamp from the far future back to the receive time', () => {
    const future = new Date(Date.now() + 86_400_000 * 30).toISOString();
    ingestBatch([validEvent({ timestamp: future })], { project });

    const row = db.prepare('SELECT timestamp FROM events').get() as { timestamp: string };
    expect(Date.parse(row.timestamp)).toBeLessThan(Date.now() + 10 * 60_000);
  });

  it('stores properties as JSON that round-trips', () => {
    ingestBatch([validEvent({ properties: { plan: 'pro', seats: 12, trial: false } })], {
      project,
    });

    const row = db.prepare('SELECT properties FROM events').get() as { properties: string };
    expect(JSON.parse(row.properties)).toEqual({ plan: 'pro', seats: 12, trial: false });
  });

  it('writes nothing when every event is invalid', () => {
    const result = ingestBatch([{ nope: 1 }, { nope: 2 }], { project });

    expect(result.accepted).toBe(0);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number };
    expect(count).toBe(0);
  });
});

describe('isOriginAllowed', () => {
  it('allows any origin when the list is empty', () => {
    expect(isOriginAllowed(project, 'https://anywhere.test')).toBe(true);
    expect(isOriginAllowed(project, undefined)).toBe(true);
  });

  it('allows only listed origins once the list is set', () => {
    const scoped = { ...project, allowedOrigins: ['https://acme.test'] };

    expect(isOriginAllowed(scoped, 'https://acme.test')).toBe(true);
    expect(isOriginAllowed(scoped, 'https://evil.test')).toBe(false);
  });

  it('rejects a missing origin when a list is configured', () => {
    const scoped = { ...project, allowedOrigins: ['https://acme.test'] };

    expect(isOriginAllowed(scoped, undefined)).toBe(false);
  });

  it('treats a wildcard entry as allow-all', () => {
    const scoped = { ...project, allowedOrigins: ['*'] };

    expect(isOriginAllowed(scoped, 'https://anything.test')).toBe(true);
  });
});

describe('pruneExpiredEvents', () => {
  it('deletes only events older than the retention window', () => {
    const db = freshDb();
    insertProject(db);
    insertEvent(db, { timestamp: daysAgo(45) });
    insertEvent(db, { timestamp: daysAgo(40) });
    insertEvent(db, { timestamp: daysAgo(5) });

    const deleted = pruneExpiredEvents(project);

    expect(deleted).toBe(2);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number };
    expect(count).toBe(1);
  });
});
