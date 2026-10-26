import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { errorHandler, notFoundHandler } from '../src/middleware/error-handler.js';
import { byEmail, rateLimit, resetRateLimits } from '../src/middleware/rate-limit.js';
import { requestId } from '../src/middleware/request-id.js';
import { validateBody, validateQuery } from '../src/middleware/validate.js';
import { badRequest, conflict } from '../src/lib/errors.js';

/** A minimal app, so each test exercises one middleware rather than the stack. */
function appWith(mount: (app: express.Express) => void): express.Express {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  mount(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  resetRateLimits();
});

describe('requestId', () => {
  it('assigns an id and echoes it in the response header', async () => {
    const app = appWith((a) => a.get('/x', (req, res) => res.json({ id: req.requestId })));

    const res = await request(app).get('/x');

    expect(res.body.id).toBeTruthy();
    expect(res.headers['x-request-id']).toBe(res.body.id);
  });

  it('honours an inbound id so a trace can span a proxy', async () => {
    const app = appWith((a) => a.get('/x', (req, res) => res.json({ id: req.requestId })));

    const res = await request(app).get('/x').set('X-Request-Id', 'trace-abc-123');

    expect(res.body.id).toBe('trace-abc-123');
  });

  it('ignores an inbound id that does not look like one', async () => {
    const app = appWith((a) => a.get('/x', (req, res) => res.json({ id: req.requestId })));

    // Otherwise a client could shape what lands in every log line. A newline
    // cannot be tested here because Node's HTTP client rejects it outright,
    // which is the other half of the same defence.
    const res = await request(app).get('/x').set('X-Request-Id', 'has spaces and ; chars');

    expect(res.body.id).not.toContain(' ');
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ignores an inbound id that is too short to be one', async () => {
    const app = appWith((a) => a.get('/x', (req, res) => res.json({ id: req.requestId })));

    const res = await request(app).get('/x').set('X-Request-Id', 'abc');

    expect(res.body.id).not.toBe('abc');
  });
});

describe('errorHandler', () => {
  it('renders an AppError with its code and status', async () => {
    const app = appWith((a) =>
      a.get('/x', () => {
        throw conflict('Already exists');
      }),
    );

    const res = await request(app).get('/x');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'conflict', message: 'Already exists' });
  });

  it('turns a zod error into a 422 with field details', async () => {
    const app = appWith((a) =>
      a.get('/x', () => {
        z.object({ email: z.string().email() }).parse({ email: 'nope' });
      }),
    );

    const res = await request(app).get('/x');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.details[0].path).toBe('email');
  });

  it('hides the message of an unexpected fault behind a generic 500', async () => {
    const app = appWith((a) =>
      a.get('/x', () => {
        throw new Error('SELECT * FROM users WHERE secret = 1');
      }),
    );

    const res = await request(app).get('/x');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('internal_error');
    expect(res.body.error.message).not.toContain('SELECT');
  });

  it('answers a malformed json body with a 400, not a 500', async () => {
    const app = appWith((a) => a.post('/x', (_req, res) => res.json({ ok: true })));

    const res = await request(app).post('/x').set('Content-Type', 'application/json').send('{oops');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
  });

  it('includes the request id in the error body', async () => {
    const app = appWith((a) =>
      a.get('/x', () => {
        throw badRequest('nope');
      }),
    );

    const res = await request(app).get('/x').set('X-Request-Id', 'trace-xyz-789');

    expect(res.body.error.requestId).toBe('trace-xyz-789');
  });

  it('gives an unmatched route the same envelope', async () => {
    const res = await request(appWith(() => undefined)).get('/nothing-here');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('validate', () => {
  const bodySchema = z.object({ name: z.string().min(2), count: z.number().int() });

  it('passes a valid body through', async () => {
    const app = appWith((a) =>
      a.post('/x', validateBody(bodySchema), (req, res) => res.json(req.body)),
    );

    const res = await request(app).post('/x').send({ name: 'ok', count: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'ok', count: 3 });
  });

  it('reports every failing field, not just the first', async () => {
    const app = appWith((a) =>
      a.post('/x', validateBody(bodySchema), (_req, res) => res.json({ ok: true })),
    );

    const res = await request(app).post('/x').send({ name: 'x', count: 1.5 });

    expect(res.status).toBe(422);
    expect(res.body.error.details).toHaveLength(2);
  });

  it('replaces the query with coerced values so handlers get real types', async () => {
    const querySchema = z.object({ limit: z.coerce.number().int() });
    const app = appWith((a) =>
      a.get('/x', validateQuery(querySchema), (req, res) =>
        res.json({ type: typeof (req.query as { limit: unknown }).limit }),
      ),
    );

    const res = await request(app).get('/x').query({ limit: '25' });

    expect(res.body.type).toBe('number');
  });
});

describe('rateLimit', () => {
  it('allows requests up to the limit and rejects the next one', async () => {
    const app = appWith((a) =>
      a.get('/x', rateLimit({ windowSeconds: 60, max: 2 }), (_req, res) => res.json({ ok: true })),
    );

    expect((await request(app).get('/x')).status).toBe(200);
    expect((await request(app).get('/x')).status).toBe(200);
    expect((await request(app).get('/x')).status).toBe(429);
  });

  it('reports the remaining budget on every response', async () => {
    const app = appWith((a) =>
      a.get('/x', rateLimit({ windowSeconds: 60, max: 5 }), (_req, res) => res.json({ ok: true })),
    );

    const res = await request(app).get('/x');

    expect(res.headers['x-ratelimit-limit']).toBe('5');
    expect(res.headers['x-ratelimit-remaining']).toBe('4');
    expect(res.headers['x-ratelimit-reset']).toBeTruthy();
  });

  it('tells a throttled client when to come back', async () => {
    const app = appWith((a) =>
      a.get('/x', rateLimit({ windowSeconds: 60, max: 1 }), (_req, res) => res.json({ ok: true })),
    );

    await request(app).get('/x');
    const res = await request(app).get('/x');

    expect(res.headers['retry-after']).toBeTruthy();
    expect(res.body.error.code).toBe('rate_limited');
  });

  it('keys separate buckets so one client cannot exhaust another budget', async () => {
    const app = appWith((a) =>
      a.post('/x', rateLimit({ windowSeconds: 60, max: 1, keyBy: byEmail }), (_req, res) =>
        res.json({ ok: true }),
      ),
    );

    expect((await request(app).post('/x').send({ email: 'a@test.local' })).status).toBe(200);
    expect((await request(app).post('/x').send({ email: 'b@test.local' })).status).toBe(200);
    expect((await request(app).post('/x').send({ email: 'a@test.local' })).status).toBe(429);
  });

  it('starts over once the counters are reset', async () => {
    const app = appWith((a) =>
      a.get('/x', rateLimit({ windowSeconds: 60, max: 1 }), (_req, res) => res.json({ ok: true })),
    );

    await request(app).get('/x');
    expect((await request(app).get('/x')).status).toBe(429);

    resetRateLimits();

    expect((await request(app).get('/x')).status).toBe(200);
  });
});
