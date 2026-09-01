import { beforeEach, describe, expect, it } from 'vitest';
import {
  createProject,
  deleteProject,
  findProject,
  listProjects,
  resolveWriteKey,
  rotateWriteKey,
  updateProject,
} from '../src/services/project.service.js';
import { createUser } from '../src/services/user.service.js';
import { freshDb, insertEvent } from './helpers.js';
import type { Db } from '../src/db/client.js';

async function owner(email = 'owner@test.local'): Promise<string> {
  const user = await createUser({ email, name: 'Owner', password: 'a-long-enough-password' });
  return user.id;
}

describe('createProject', () => {
  let db: Db;

  beforeEach(() => {
    db = freshDb();
  });

  it('derives a slug from the name when none is given', async () => {
    const { project } = createProject(await owner(), { name: 'Acme Marketing Site!' });

    expect(project.slug).toBe('acme-marketing-site');
  });

  it('returns a plaintext write key that is not stored as-is', async () => {
    const { project, writeKey } = createProject(await owner(), { name: 'Keys' });

    expect(writeKey).toMatch(/^dp_live_/);
    const row = db
      .prepare('SELECT key_hash FROM write_keys WHERE project_id = ?')
      .get(project.id) as { key_hash: string };
    expect(row.key_hash).not.toBe(writeKey);
  });

  it('rejects a duplicate slug', async () => {
    const ownerId = await owner();
    createProject(ownerId, { name: 'Dupe', slug: 'dupe' });

    expect(() => createProject(ownerId, { name: 'Dupe Again', slug: 'dupe' })).toThrow(
      /already exists/,
    );
  });

  it('defaults retention to a year', async () => {
    const { project } = createProject(await owner(), { name: 'Defaults' });

    expect(project.retentionDays).toBe(365);
  });
});

describe('resolveWriteKey', () => {
  beforeEach(() => {
    freshDb();
  });

  it('maps a live key back to its project', async () => {
    const { project, writeKey } = createProject(await owner(), { name: 'Resolve' });

    expect(resolveWriteKey(writeKey)?.id).toBe(project.id);
  });

  it('returns null for an unknown key', async () => {
    await owner();

    expect(resolveWriteKey('dp_live_nonsense')).toBeNull();
  });

  it('stops accepting a key once it has been rotated', async () => {
    const { project, writeKey } = createProject(await owner(), { name: 'Rotate' });
    const replacement = rotateWriteKey(project.id);

    expect(resolveWriteKey(writeKey)).toBeNull();
    expect(resolveWriteKey(replacement)?.id).toBe(project.id);
  });

  it('records the time a key was last used', async () => {
    const db = freshDb();
    const { project, writeKey } = createProject(await owner(), { name: 'LastUsed' });

    const before = db
      .prepare('SELECT last_used_at FROM write_keys WHERE project_id = ?')
      .get(project.id) as { last_used_at: string | null };
    expect(before.last_used_at).toBeNull();

    resolveWriteKey(writeKey);

    const after = db
      .prepare('SELECT last_used_at FROM write_keys WHERE project_id = ?')
      .get(project.id) as { last_used_at: string | null };
    expect(after.last_used_at).toBeTruthy();
  });
});

describe('findProject', () => {
  beforeEach(() => {
    freshDb();
  });

  it('looks a project up by id or by slug', async () => {
    const { project } = createProject(await owner(), { name: 'Lookup', slug: 'lookup' });

    expect(findProject(project.id)?.id).toBe(project.id);
    expect(findProject('lookup')?.id).toBe(project.id);
  });

  it('returns null when nothing matches', async () => {
    await owner();

    expect(findProject('ghost')).toBeNull();
  });
});

describe('updateProject', () => {
  it('leaves unspecified fields untouched', async () => {
    freshDb();
    const { project } = createProject(await owner(), { name: 'Before', retentionDays: 90 });

    const updated = updateProject(project.id, { name: 'After' });

    expect(updated.name).toBe('After');
    expect(updated.retentionDays).toBe(90);
  });
});

describe('deleteProject', () => {
  it('cascades to the project events', async () => {
    const db = freshDb();
    const { project } = createProject(await owner(), { name: 'Cascade' });
    insertEvent(db, { projectId: project.id });

    deleteProject(project.id);

    const { count } = db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number };
    expect(count).toBe(0);
  });

  it('throws for a project that does not exist', async () => {
    freshDb();
    await owner();

    expect(() => deleteProject('prj_ghost')).toThrow(/not found/);
  });
});

describe('listProjects', () => {
  it('scopes the list to one owner when asked', async () => {
    freshDb();
    const first = await owner('first@test.local');
    const second = await owner('second@test.local');
    createProject(first, { name: 'First Project' });
    createProject(second, { name: 'Second Project' });

    expect(listProjects()).toHaveLength(2);
    expect(listProjects(first)).toHaveLength(1);
  });
});
