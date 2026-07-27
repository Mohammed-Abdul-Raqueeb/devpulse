import { createHash } from 'node:crypto';
import {
  createId,
  createWriteKey,
  slugify,
  type CreateProjectInput,
  type Project,
  type UpdateProjectInput,
} from '@devpulse/shared';
import { getDb } from '../db/client.js';
import { toProject, type ProjectRow } from '../db/rows.js';
import { conflict, notFound } from '../lib/errors.js';

export interface CreatedProject {
  project: Project;
  /** Plaintext write key. Returned once, never retrievable again. */
  writeKey: string;
}

export function createProject(ownerId: string, input: CreateProjectInput): CreatedProject {
  const db = getDb();
  const slug = input.slug ?? slugify(input.name);

  if (db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug)) {
    throw conflict(`A project with slug "${slug}" already exists`);
  }

  const now = new Date().toISOString();
  const project: Project = {
    id: createId('prj'),
    name: input.name,
    slug,
    ownerId,
    allowedOrigins: input.allowedOrigins ?? [],
    retentionDays: input.retentionDays ?? 365,
    createdAt: now,
    updatedAt: now,
  };

  const writeKey = createWriteKey();

  // Project and its first write key are created together or not at all.
  db.transaction(() => {
    db.prepare(
      `INSERT INTO projects (id, name, slug, owner_id, allowed_origins, retention_days, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      project.id,
      project.name,
      project.slug,
      project.ownerId,
      JSON.stringify(project.allowedOrigins),
      project.retentionDays,
      project.createdAt,
      project.updatedAt,
    );

    db.prepare('INSERT INTO write_keys (id, project_id, key_hash, label) VALUES (?, ?, ?, ?)').run(
      createId('key'),
      project.id,
      hashKey(writeKey),
      'default',
    );
  })();

  return { project, writeKey };
}

export function listProjects(ownerId?: string): Project[] {
  const db = getDb();
  const rows = (
    ownerId
      ? db
          .prepare('SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC')
          .all(ownerId)
      : db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all()
  ) as ProjectRow[];
  return rows.map(toProject);
}

export function findProject(idOrSlug: string): Project | null {
  const row = getDb()
    .prepare('SELECT * FROM projects WHERE id = ? OR slug = ?')
    .get(idOrSlug, idOrSlug) as ProjectRow | undefined;
  return row ? toProject(row) : null;
}

export function requireProject(idOrSlug: string): Project {
  const project = findProject(idOrSlug);
  if (!project) throw notFound('Project');
  return project;
}

export function updateProject(id: string, input: UpdateProjectInput): Project {
  const existing = requireProject(id);
  const merged: Project = {
    ...existing,
    name: input.name ?? existing.name,
    allowedOrigins: input.allowedOrigins ?? existing.allowedOrigins,
    retentionDays: input.retentionDays ?? existing.retentionDays,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE projects SET name = ?, allowed_origins = ?, retention_days = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      merged.name,
      JSON.stringify(merged.allowedOrigins),
      merged.retentionDays,
      merged.updatedAt,
      merged.id,
    );

  return merged;
}

/** Cascades to events, write keys and saved funnels via foreign keys. */
export function deleteProject(id: string): void {
  const result = getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('Project');
}

/** Resolves a plaintext write key to its project, recording the use. */
export function resolveWriteKey(key: string): Project | null {
  const db = getDb();
  const hash = hashKey(key);
  const row = db
    .prepare(
      `SELECT p.* FROM write_keys k
       JOIN projects p ON p.id = k.project_id
       WHERE k.key_hash = ? AND k.revoked_at IS NULL`,
    )
    .get(hash) as ProjectRow | undefined;

  if (!row) return null;

  db.prepare('UPDATE write_keys SET last_used_at = ? WHERE key_hash = ?').run(
    new Date().toISOString(),
    hash,
  );
  return toProject(row);
}

/** Revokes every live key for the project and returns a fresh one. */
export function rotateWriteKey(projectId: string, label = 'default'): string {
  const db = getDb();
  requireProject(projectId);
  const key = createWriteKey();

  db.transaction(() => {
    db.prepare(
      'UPDATE write_keys SET revoked_at = ? WHERE project_id = ? AND revoked_at IS NULL',
    ).run(new Date().toISOString(), projectId);
    db.prepare('INSERT INTO write_keys (id, project_id, key_hash, label) VALUES (?, ?, ?, ?)').run(
      createId('key'),
      projectId,
      hashKey(key),
      label,
    );
  })();

  return key;
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
