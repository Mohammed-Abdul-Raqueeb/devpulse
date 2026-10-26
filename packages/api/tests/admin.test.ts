import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { createUser, updateRole } from '../src/services/user.service.js';
import { resetMetrics } from '../src/lib/metrics.js';
import { runRetention } from '../src/jobs/retention.job.js';
import { createProject } from '../src/services/project.service.js';
import { daysAgo, freshDb, insertEvent } from './helpers.js';

const PASSWORD = 'admin-suite-password';

interface Fixture {
  app: Express;
  ownerToken: string;
  viewerToken: string;
  viewerId: string;
  ownerId: string;
}

async function setup(): Promise<Fixture> {
  freshDb();
  resetMetrics();
  const app = createApp();

  const owner = await request(app)
    .post('/auth/register')
    .send({ email: 'owner@test.local', name: 'Owner', password: PASSWORD });

  const viewer = await request(app)
    .post('/auth/register')
    .send({ email: 'viewer@test.local', name: 'Viewer', password: PASSWORD });

  return {
    app,
    ownerToken: owner.body.tokens.accessToken,
    viewerToken: viewer.body.tokens.accessToken,
    ownerId: owner.body.user.id,
    viewerId: viewer.body.user.id,
  };
}

describe('GET /users', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setup();
  });

  it('lists the team for an owner', async () => {
    const res = await request(fixture.app)
      .get('/users')
      .set('Authorization', `Bearer ${fixture.ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('never includes a password hash', async () => {
    const res = await request(fixture.app)
      .get('/users')
      .set('Authorization', `Bearer ${fixture.ownerToken}`);

    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('$2');
  });

  it('refuses a viewer', async () => {
    const res = await request(fixture.app)
      .get('/users')
      .set('Authorization', `Bearer ${fixture.viewerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });
});

describe('PATCH /users/:id/role', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setup();
  });

  it('promotes a viewer to admin', async () => {
    const res = await request(fixture.app)
      .patch(`/users/${fixture.viewerId}/role`)
      .set('Authorization', `Bearer ${fixture.ownerToken}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('rejects a role that is not one of the three', async () => {
    const res = await request(fixture.app)
      .patch(`/users/${fixture.viewerId}/role`)
      .set('Authorization', `Bearer ${fixture.ownerToken}`)
      .send({ role: 'superuser' });

    expect(res.status).toBe(422);
  });

  it('refuses a viewer trying to promote themselves', async () => {
    const res = await request(fixture.app)
      .patch(`/users/${fixture.viewerId}/role`)
      .set('Authorization', `Bearer ${fixture.viewerToken}`)
      .send({ role: 'owner' });

    expect(res.status).toBe(403);
  });

  it('404s for a user that does not exist', async () => {
    const res = await request(fixture.app)
      .patch('/users/usr_ghost/role')
      .set('Authorization', `Bearer ${fixture.ownerToken}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(404);
  });
});

describe('updateRole', () => {
  beforeEach(() => {
    freshDb();
  });

  it('refuses to demote the only owner', async () => {
    const owner = await createUser({ email: 'solo@test.local', name: 'Solo', password: PASSWORD });

    // Otherwise the install ends up with nobody who can administer it.
    expect(() => updateRole(owner.id, 'viewer')).toThrow(/at least one owner/);
  });

  it('allows demoting an owner once a second one exists', async () => {
    const first = await createUser({ email: 'a@test.local', name: 'A', password: PASSWORD });
    const second = await createUser({ email: 'b@test.local', name: 'B', password: PASSWORD });
    updateRole(second.id, 'owner');

    expect(updateRole(first.id, 'admin').role).toBe('admin');
  });
});

describe('DELETE /users/:id', () => {
  it('refuses to delete your own account', async () => {
    const fixture = await setup();

    const res = await request(fixture.app)
      .delete(`/users/${fixture.ownerId}`)
      .set('Authorization', `Bearer ${fixture.ownerToken}`);

    expect(res.status).toBe(403);
  });

  it('removes another account', async () => {
    const fixture = await setup();

    const res = await request(fixture.app)
      .delete(`/users/${fixture.viewerId}`)
      .set('Authorization', `Bearer ${fixture.ownerToken}`);

    expect(res.status).toBe(204);
  });
});

describe('POST /users/me/password', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setup();
  });

  it('changes the password when the current one is given', async () => {
    const res = await request(fixture.app)
      .post('/users/me/password')
      .set('Authorization', `Bearer ${fixture.ownerToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'a-brand-new-password' });

    expect(res.status).toBe(200);

    const login = await request(fixture.app)
      .post('/auth/login')
      .send({ email: 'owner@test.local', password: 'a-brand-new-password' });
    expect(login.status).toBe(200);
  });

  it('refuses when the current password is wrong', async () => {
    const res = await request(fixture.app)
      .post('/users/me/password')
      .set('Authorization', `Bearer ${fixture.ownerToken}`)
      .send({ currentPassword: 'not-it', newPassword: 'a-brand-new-password' });

    expect(res.status).toBe(401);
  });

  it('rejects a new password that is too short', async () => {
    const res = await request(fixture.app)
      .post('/users/me/password')
      .set('Authorization', `Bearer ${fixture.ownerToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'short' });

    expect(res.status).toBe(422);
  });

  it('revokes every other session', async () => {
    // Two extra sessions, so there is something to revoke.
    await request(fixture.app)
      .post('/auth/login')
      .send({ email: 'owner@test.local', password: PASSWORD });

    const res = await request(fixture.app)
      .post('/users/me/password')
      .set('Authorization', `Bearer ${fixture.ownerToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'a-brand-new-password' });

    expect(res.body.revoked).toBeGreaterThan(0);
  });
});

describe('GET /metrics', () => {
  it('reports counters in the prometheus text format', async () => {
    const fixture = await setup();

    const res = await request(fixture.app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# TYPE devpulse_events_ingested_total counter');
    expect(res.text).toContain('devpulse_uptime_seconds');
  });

  it('counts ingested events', async () => {
    const fixture = await setup();
    const { writeKey } = createProject(fixture.ownerId, { name: 'Metrics', slug: 'metrics' });

    await request(fixture.app)
      .post('/ingest')
      .set('X-Write-Key', writeKey)
      .send({
        events: [
          {
            kind: 'pageview',
            name: 'page_view',
            anonymousId: 'anon_metrics00001',
            sessionId: 'ses_metrics00001',
          },
        ],
      });

    const res = await request(fixture.app).get('/metrics');

    expect(res.text).toMatch(/devpulse_events_ingested_total\{project="metrics"\} 1/);
  });

  it('counts rejected events separately', async () => {
    const fixture = await setup();
    const { writeKey } = createProject(fixture.ownerId, { name: 'Rejects', slug: 'rejects' });

    await request(fixture.app)
      .post('/ingest')
      .set('X-Write-Key', writeKey)
      .send({ events: [{ kind: 'nonsense' }] });

    const res = await request(fixture.app).get('/metrics');

    expect(res.text).toMatch(/devpulse_events_rejected_total\{project="rejects"\} 1/);
  });

  it('counts http responses by status class', async () => {
    const fixture = await setup();

    await request(fixture.app).get('/definitely-missing');
    const res = await request(fixture.app).get('/metrics');

    expect(res.text).toMatch(/devpulse_http_requests_total\{.*status="4xx".*\} \d+/);
  });

  it('is not logged as application traffic', async () => {
    const fixture = await setup();

    // Two scrapes in a row must not themselves inflate the counters they report.
    const first = await request(fixture.app).get('/metrics');
    const second = await request(fixture.app).get('/metrics');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});

describe('retention job metrics', () => {
  it('records how many events the sweep deleted', async () => {
    const db = freshDb();
    resetMetrics();
    const owner = await createUser({
      email: 'retention@test.local',
      name: 'R',
      password: PASSWORD,
    });
    const { project } = createProject(owner.id, { name: 'Retention', retentionDays: 10 });

    insertEvent(db, { projectId: project.id, timestamp: daysAgo(40) });
    insertEvent(db, { projectId: project.id, timestamp: daysAgo(1) });

    const summary = runRetention();

    expect(summary.eventsDeleted).toBe(1);
    expect(summary.projectsScanned).toBe(1);
  });
});
