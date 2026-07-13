import { describe, expect, it } from 'vitest';
import {
  breakdownQuerySchema,
  createProjectSchema,
  incomingEventSchema,
  ingestBodySchema,
  loginSchema,
  MAX_BATCH_SIZE,
  metricQuerySchema,
  registerSchema,
  strictIngestBodySchema,
  slugSchema,
  timeRangeSchema,
} from '../src/schemas/index.js';

const validEvent = {
  kind: 'pageview',
  name: 'page_view',
  anonymousId: 'anon_abcdef123456',
  sessionId: 'ses_abcdef123456',
};

describe('incomingEventSchema', () => {
  it('accepts a minimal valid event', () => {
    expect(incomingEventSchema.safeParse(validEvent).success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(incomingEventSchema.safeParse({ ...validEvent, kind: 'telepathy' }).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(incomingEventSchema.safeParse({ ...validEvent, name: '' }).success).toBe(false);
  });

  it('rejects an anonymousId that is too short to be a real id', () => {
    expect(incomingEventSchema.safeParse({ ...validEvent, anonymousId: 'abc' }).success).toBe(
      false,
    );
  });

  it('rejects a url that is not a url', () => {
    expect(
      incomingEventSchema.safeParse({ ...validEvent, url: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });

  it('accepts scalar property values', () => {
    const result = incomingEventSchema.safeParse({
      ...validEvent,
      properties: { plan: 'pro', seats: 4, trial: false, note: null },
    });

    expect(result.success).toBe(true);
  });

  it('rejects a nested object in properties', () => {
    const result = incomingEventSchema.safeParse({
      ...validEvent,
      properties: { nested: { deep: true } },
    });

    expect(result.success).toBe(false);
  });

  it('rejects more than forty property keys', () => {
    const properties = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, i]));

    expect(incomingEventSchema.safeParse({ ...validEvent, properties }).success).toBe(false);
  });
});

describe('ingestBodySchema', () => {
  it('requires at least one event', () => {
    expect(ingestBodySchema.safeParse({ events: [] }).success).toBe(false);
  });

  it('accepts a batch at the size limit', () => {
    const events = Array.from({ length: MAX_BATCH_SIZE }, () => validEvent);

    expect(ingestBodySchema.safeParse({ events }).success).toBe(true);
  });

  it('rejects a batch one over the limit', () => {
    const events = Array.from({ length: MAX_BATCH_SIZE + 1 }, () => validEvent);

    expect(ingestBodySchema.safeParse({ events }).success).toBe(false);
  });
});

describe('slugSchema', () => {
  it('accepts lowercase hyphenated words', () => {
    expect(slugSchema.safeParse('acme-marketing-site').success).toBe(true);
  });

  it.each(['Acme', 'acme_site', 'acme--site', '-acme', 'acme-'])('rejects %s', (value) => {
    expect(slugSchema.safeParse(value).success).toBe(false);
  });
});

describe('createProjectSchema', () => {
  it('fills in defaults for the optional fields', () => {
    const parsed = createProjectSchema.parse({ name: 'Acme' });

    expect(parsed.retentionDays).toBe(365);
    expect(parsed.allowedOrigins).toEqual([]);
  });

  it('rejects an origin that includes a path', () => {
    const result = createProjectSchema.safeParse({
      name: 'Acme',
      allowedOrigins: ['https://acme.test/app'],
    });

    expect(result.success).toBe(false);
  });

  it('accepts a wildcard origin', () => {
    expect(createProjectSchema.safeParse({ name: 'Acme', allowedOrigins: ['*'] }).success).toBe(
      true,
    );
  });
});

describe('registerSchema', () => {
  it('lowercases the email', () => {
    const parsed = registerSchema.parse({
      email: 'Owner@Example.COM',
      name: 'Owner',
      password: 'long-enough-password',
    });

    expect(parsed.email).toBe('owner@example.com');
  });

  it('rejects a password under ten characters', () => {
    const result = registerSchema.safeParse({
      email: 'owner@example.com',
      name: 'Owner',
      password: 'short',
    });

    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('does not impose a length floor on the submitted password', () => {
    const result = loginSchema.safeParse({ email: 'a@b.co', password: 'x' });

    expect(result.success).toBe(true);
  });
});

describe('timeRangeSchema', () => {
  it('rejects a range that ends before it starts', () => {
    const result = timeRangeSchema.safeParse({
      from: '2026-03-10T00:00:00Z',
      to: '2026-03-01T00:00:00Z',
    });

    expect(result.success).toBe(false);
  });

  it('accepts date-only input', () => {
    expect(timeRangeSchema.safeParse({ from: '2026-03-01', to: '2026-03-10' }).success).toBe(true);
  });
});

describe('metricQuerySchema', () => {
  it('defaults granularity to day', () => {
    const parsed = metricQuerySchema.parse({
      from: '2026-03-01',
      to: '2026-03-10',
      metric: 'visitors',
    });

    expect(parsed.granularity).toBe('day');
  });

  it('rejects an unknown metric', () => {
    const result = metricQuerySchema.safeParse({
      from: '2026-03-01',
      to: '2026-03-10',
      metric: 'vibes',
    });

    expect(result.success).toBe(false);
  });
});

describe('breakdownQuerySchema', () => {
  it('coerces a numeric limit from the query string', () => {
    const parsed = breakdownQuerySchema.parse({
      from: '2026-03-01',
      to: '2026-03-10',
      dimension: 'url',
      limit: '25',
    });

    expect(parsed.limit).toBe(25);
  });

  it('rejects a dimension outside the allow-list', () => {
    const result = breakdownQuerySchema.safeParse({
      from: '2026-03-01',
      to: '2026-03-10',
      dimension: 'password',
    });

    expect(result.success).toBe(false);
  });
});

describe('strictIngestBodySchema', () => {
  it('accepts a batch where every event is valid', () => {
    expect(strictIngestBodySchema.safeParse({ events: [validEvent] }).success).toBe(true);
  });

  it('rejects the whole batch when one event is malformed', () => {
    const result = strictIngestBodySchema.safeParse({ events: [validEvent, { kind: 'bogus' }] });

    expect(result.success).toBe(false);
  });

  it('is the strict counterpart of the lenient envelope the API uses', () => {
    const body = { events: [validEvent, { kind: 'bogus' }] };

    // The API accepts the envelope and rejects individual events at ingest time.
    expect(ingestBodySchema.safeParse(body).success).toBe(true);
    expect(strictIngestBodySchema.safeParse(body).success).toBe(false);
  });
});
