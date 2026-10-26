import { beforeEach, describe, expect, it } from 'vitest';
import {
  countEvents,
  listEventNames,
  listEvents,
  listPropertyKeys,
} from '../src/services/event.service.js';
import { Writable } from 'node:stream';
import { csvCell, streamEventsCsv, toCsv } from '../src/services/export.service.js';
import { buildWhere, bucketExpression, resolveDimension } from '../src/services/query.builder.js';
import { daysAgo, freshDb, insertEvent, insertProject } from './helpers.js';
import type { Db } from '../src/db/client.js';

const PROJECT = 'prj_test';

describe('listEvents', () => {
  let db: Db;

  beforeEach(() => {
    db = freshDb();
    insertProject(db);
  });

  it('returns events newest first', () => {
    insertEvent(db, { name: 'older', timestamp: daysAgo(3) });
    insertEvent(db, { name: 'newer', timestamp: daysAgo(1) });

    const page = listEvents({ projectId: PROJECT, limit: 10 });

    expect(page.data.map((e) => e.name)).toEqual(['newer', 'older']);
  });

  it('reports hasMore and a cursor when the page is full', () => {
    for (let i = 0; i < 5; i += 1) insertEvent(db, { timestamp: daysAgo(i + 1) });

    const page = listEvents({ projectId: PROJECT, limit: 2 });

    expect(page.data).toHaveLength(2);
    expect(page.page.hasMore).toBe(true);
    expect(page.page.cursor).toBeTruthy();
  });

  it('walks the whole feed through its cursors without repeating a row', () => {
    for (let i = 0; i < 7; i += 1) insertEvent(db, { timestamp: daysAgo(i + 1) });

    const seen: string[] = [];
    let cursor: string | null = null;

    do {
      const page = listEvents({
        projectId: PROJECT,
        limit: 3,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...page.data.map((e) => e.id));
      cursor = page.page.cursor;
    } while (cursor);

    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  it('ends with a null cursor on the last page', () => {
    insertEvent(db, { timestamp: daysAgo(1) });

    const page = listEvents({ projectId: PROJECT, limit: 10 });

    expect(page.page.cursor).toBeNull();
    expect(page.page.hasMore).toBe(false);
  });

  it('rejects a malformed cursor instead of returning garbage', () => {
    expect(() => listEvents({ projectId: PROJECT, limit: 10, cursor: 'bm9wZQ' })).toThrow(
      /Malformed pagination cursor/,
    );
  });

  it('filters by event name', () => {
    insertEvent(db, { name: 'signup', timestamp: daysAgo(1) });
    insertEvent(db, { name: 'page_view', timestamp: daysAgo(1) });

    const page = listEvents({ projectId: PROJECT, limit: 10, filters: { name: 'signup' } });

    expect(page.data).toHaveLength(1);
  });

  it('parses properties back into an object', () => {
    insertEvent(db, { properties: { plan: 'pro' }, timestamp: daysAgo(1) });

    const page = listEvents({ projectId: PROJECT, limit: 10 });

    expect(page.data[0]?.properties).toEqual({ plan: 'pro' });
  });
});

describe('countEvents', () => {
  it('counts only the given project', () => {
    const db = freshDb();
    insertProject(db);
    insertProject(db, 'prj_other', 'other');
    insertEvent(db);
    insertEvent(db, { projectId: 'prj_other' });

    expect(countEvents(PROJECT)).toBe(1);
  });
});

describe('schema discovery', () => {
  let db: Db;

  beforeEach(() => {
    db = freshDb();
    insertProject(db);
  });

  it('lists event names most used first', () => {
    insertEvent(db, { name: 'page_view' });
    insertEvent(db, { name: 'page_view' });
    insertEvent(db, { name: 'signup' });

    expect(listEventNames(PROJECT)[0]).toBe('page_view');
  });

  it('collects property keys across events, sorted and deduplicated', () => {
    insertEvent(db, { properties: { plan: 'pro', seats: 3 } });
    insertEvent(db, { properties: { plan: 'team' } });

    expect(listPropertyKeys(PROJECT)).toEqual(['plan', 'seats']);
  });
});

describe('buildWhere', () => {
  it('always scopes to a project and a time window', () => {
    const where = buildWhere('prj_1', 'A', 'B');

    expect(where.sql).toContain('project_id = ? AND timestamp >= ? AND timestamp < ?');
    expect(where.params).toEqual(['prj_1', 'A', 'B']);
  });

  it('excludes crawler traffic by default', () => {
    expect(buildWhere('prj_1', 'A', 'B').sql).toContain("device != 'bot'");
  });

  it('includes crawler traffic when asked, without adding a parameter', () => {
    const where = buildWhere('prj_1', 'A', 'B', {}, { includeBots: true });

    expect(where.sql).not.toContain('bot');
    expect(where.params).toHaveLength(3);
  });

  it('binds filter values as parameters rather than inlining them', () => {
    const where = buildWhere('prj_1', 'A', 'B', { device: "mobile' OR 1=1 --" });

    expect(where.sql).toContain('device = ?');
    expect(where.params).toContain("mobile' OR 1=1 --");
  });

  it('ignores a filter key that is not on the allow-list', () => {
    const where = buildWhere('prj_1', 'A', 'B', { password: 'x' });

    expect(where.sql).not.toContain('password');
    expect(where.params).toHaveLength(3);
  });

  it('supports filtering inside the properties blob', () => {
    const where = buildWhere('prj_1', 'A', 'B', { 'properties.plan': 'pro' });

    expect(where.sql).toContain('json_extract(properties, ?)');
    expect(where.params).toContain('$."plan"');
  });

  it('drops a properties path containing suspicious characters', () => {
    const where = buildWhere('prj_1', 'A', 'B', { 'properties.a"b': 'x' });

    expect(where.sql).not.toContain('json_extract');
  });
});

describe('resolveDimension', () => {
  it('maps a camelCase dimension to its column', () => {
    expect(resolveDimension('userId')).toBe('user_id');
  });

  it('returns null for anything not groupable', () => {
    expect(resolveDimension('password_hash')).toBeNull();
  });
});

describe('bucketExpression', () => {
  it('produces a sortable prefix per granularity', () => {
    expect(bucketExpression('hour')).toContain('%H:00:00');
    expect(bucketExpression('month')).toContain('%Y-%m-01');
  });

  it('accepts an alternative source column', () => {
    expect(bucketExpression('day', 'MIN(timestamp)')).toContain('MIN(timestamp)');
  });
});

describe('csv helpers', () => {
  it('leaves a plain value unquoted', () => {
    expect(csvCell('page_view')).toBe('page_view');
  });

  it('quotes a value containing a comma', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
  });

  it('doubles embedded quotes', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('renders null and undefined as empty cells', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('writes a header-only file for an empty row set', () => {
    expect(toCsv([], ['a', 'b'])).toBe('a,b\n');
  });

  it('writes one line per row', () => {
    const csv = toCsv(
      [
        { a: 1, b: 'x' },
        { a: 2, b: 'y' },
      ],
      ['a', 'b'],
    );

    expect(csv).toBe('a,b\n1,x\n2,y\n');
  });
});

describe('streamEventsCsv', () => {
  /**
   * A writable that reports a full buffer on every write, which is what forces
   * the backpressure path. An earlier version used `for...of` here and SQLite
   * finalised the statement on the first pause, truncating the export.
   */
  class BackpressuredSink extends Writable {
    chunks: string[] = [];

    override _write(
      chunk: Buffer | string,
      _encoding: string,
      callback: (error?: Error | null) => void,
    ): void {
      this.chunks.push(chunk.toString());
      // Defer the callback so `write()` returns false and a drain is needed.
      setImmediate(callback);
    }

    get text(): string {
      return this.chunks.join('');
    }
  }

  it('streams every row even when the sink applies backpressure', async () => {
    const db = freshDb();
    insertProject(db);
    const total = 500;
    for (let i = 0; i < total; i += 1) {
      insertEvent(db, { name: `event_${i}`, timestamp: daysAgo(1, i % 20) });
    }

    const sink = new BackpressuredSink({ highWaterMark: 1 });
    const finished = new Promise<void>((resolve, reject) => {
      sink.on('finish', resolve);
      sink.on('error', reject);
    });

    streamEventsCsv(sink, { projectId: PROJECT, from: daysAgo(3), to: daysAgo(-1) });
    await finished;

    const lines = sink.text.trimEnd().split('\n');
    // One header row plus one row per event.
    expect(lines).toHaveLength(total + 1);
    expect(lines[0]).toContain('id,timestamp,kind,name');
  });

  it('writes a header even when the range contains no events', async () => {
    const db = freshDb();
    insertProject(db);

    const sink = new BackpressuredSink({ highWaterMark: 1 });
    const finished = new Promise<void>((resolve) => sink.on('finish', resolve));

    streamEventsCsv(sink, { projectId: PROJECT, from: daysAgo(3), to: daysAgo(2) });
    await finished;

    expect(sink.text.trimEnd()).toBe(
      'id,timestamp,kind,name,anonymous_id,user_id,session_id,url,referrer,country,device,browser,os,properties',
    );
  });
});
