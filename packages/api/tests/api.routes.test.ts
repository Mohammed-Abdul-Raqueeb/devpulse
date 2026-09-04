import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { createProject } from '../src/services/project.service.js';
import { freshDb } from './helpers.js';

const PASSWORD = 'integration-test-password';

interface Fixture {
  app: Express;
  accessToken: string;
  writeKey: string;
  projectId: string;
  slug: string;
}

async function setup(): Promise<Fixture> {
  freshDb();
  const app = createApp();

  const register = await request(app)
    .post('/auth/register')
    .send({ email: 'owner@test.local', name: 'Owner', password: PASSWORD });

  const { project, writeKey } = createProject(register.body.user.id, {
    name: 'Routes Project',
    slug: 'routes-project',
  });

  return {
    app,
    accessToken: register.body.tokens.accessToken,
    writeKey,
    projectId: project.id,
    slug: project.slug,
  };
}

describe('GET /health', () => {
  it('reports ok with a reachable database', async () => {
    const { app } = await setup();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.ok).toBe(true);
  });
});

describe('auth routes', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setup();
  });

  it('returns the current user for a valid token', async () => {
    const res = await request(fixture.app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${fixture.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('owner@test.local');
  });

  it('rejects a request with no token', async () => {
    const res = await request(fixture.app).get('/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('logs a user in with the right password', async () => {
    const res = await request(fixture.app)
      .post('/auth/login')
      .send({ email: 'owner@test.local', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeTruthy();
  });

  it('gives the same error for a wrong password and an unknown account', async () => {
    const wrongPassword = await request(fixture.app)
      .post('/auth/login')
      .send({ email: 'owner@test.local', password: 'not-the-password' });
    const unknownEmail = await request(fixture.app)
      .post('/auth/login')
      .send({ email: 'nobody@test.local', password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('reports field-level details on a validation failure', async () => {
    const res = await request(fixture.app)
      .post('/auth/register')
      .send({ email: 'not-an-email', name: 'x', password: 'short' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });
});

describe('POST /ingest', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setup();
  });

  const event = {
    kind: 'pageview',
    name: 'page_view',
    anonymousId: 'anon_route_000001',
    sessionId: 'ses_route_000001',
    url: 'https://acme.test/pricing',
  };

  it('accepts a batch with a valid write key', async () => {
    const res = await request(fixture.app)
      .post('/ingest')
      .set('X-Write-Key', fixture.writeKey)
      .send({ events: [event] });

    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(1);
  });

  it('rejects a request with no write key', async () => {
    const res = await request(fixture.app)
      .post('/ingest')
      .send({ events: [event] });

    expect(res.status).toBe(401);
  });

  it('rejects an unknown write key', async () => {
    const res = await request(fixture.app)
      .post('/ingest')
      .set('X-Write-Key', 'dp_live_not_a_real_key')
      .send({ events: [event] });

    expect(res.status).toBe(401);
  });

  it('answers 207 when the batch was only partly accepted', async () => {
    const res = await request(fixture.app)
      .post('/ingest')
      .set('X-Write-Key', fixture.writeKey)
      .send({ events: [event, { kind: 'bogus' }] });

    expect(res.status).toBe(207);
    expect(res.body).toMatchObject({ accepted: 1, rejected: 1 });
  });

  it('serves a tracking pixel', async () => {
    const res = await request(fixture.app).get('/ingest/pixel.gif').query({
      key: fixture.writeKey,
      name: 'page_view',
      anonymousId: 'anon_pixel_00001',
      sessionId: 'ses_pixel_00001',
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/gif');
  });
});

describe('analytics routes', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setup();
    await request(fixture.app)
      .post('/ingest')
      .set('X-Write-Key', fixture.writeKey)
      .send({
        events: [
          {
            kind: 'pageview',
            name: 'page_view',
            anonymousId: 'anon_an_0000001',
            sessionId: 'ses_an_0000001',
            url: 'https://acme.test/',
          },
        ],
      });
  });

  const range = {
    from: new Date(Date.now() - 86_400_000).toISOString(),
    to: new Date(Date.now() + 86_400_000).toISOString(),
  };

  it('returns an overview for an authenticated caller', async () => {
    const res = await request(fixture.app)
      .get(`/projects/${fixture.slug}/analytics/overview`)
      .query(range)
      .set('Authorization', `Bearer ${fixture.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.events).toBe(1);
  });

  it('refuses an unauthenticated overview request', async () => {
    const res = await request(fixture.app)
      .get(`/projects/${fixture.slug}/analytics/overview`)
      .query(range);

    expect(res.status).toBe(401);
  });

  it('rejects a range whose end precedes its start', async () => {
    const res = await request(fixture.app)
      .get(`/projects/${fixture.slug}/analytics/overview`)
      .query({ from: range.to, to: range.from })
      .set('Authorization', `Bearer ${fixture.accessToken}`);

    expect(res.status).toBe(422);
  });

  it('404s on an unknown project', async () => {
    const res = await request(fixture.app)
      .get('/projects/no-such-project/analytics/overview')
      .query(range)
      .set('Authorization', `Bearer ${fixture.accessToken}`);

    expect(res.status).toBe(404);
  });

  it('returns a padded time series', async () => {
    const res = await request(fixture.app)
      .get(`/projects/${fixture.slug}/analytics/series`)
      .query({ ...range, metric: 'events', granularity: 'day' })
      .set('Authorization', `Bearer ${fixture.accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.points)).toBe(true);
  });

  it('lists events newest first with a cursor', async () => {
    const res = await request(fixture.app)
      .get(`/projects/${fixture.slug}/events`)
      .query({ limit: 10 })
      .set('Authorization', `Bearer ${fixture.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.page.hasMore).toBe(false);
  });
});

describe('unmatched routes', () => {
  it('returns the standard error envelope with a request id', async () => {
    const { app } = await setup();

    const res = await request(app).get('/definitely-not-a-route');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
