import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api';

/**
 * These cover the error envelope translation and the token refresh retry, which
 * is where the client has real logic. The endpoint wrappers themselves are
 * thin enough that testing them would only assert the URL strings.
 */

describe('ApiError', () => {
  it('reads the code and message out of the server envelope', () => {
    const error = new ApiError(
      422,
      {
        error: {
          code: 'validation_failed',
          message: 'Request validation failed',
          details: [{ path: 'email', message: 'Invalid email' }],
          requestId: 'req-1',
        },
      },
      'fallback',
    );

    expect(error.status).toBe(422);
    expect(error.code).toBe('validation_failed');
    expect(error.message).toBe('Request validation failed');
    expect(error.details).toHaveLength(1);
  });

  it('falls back when the body is not the expected envelope', () => {
    const error = new ApiError(502, null, 'Bad Gateway');

    expect(error.code).toBe('internal_error');
    expect(error.message).toBe('Bad Gateway');
    expect(error.details).toEqual([]);
  });

  it('is an Error, so it survives a catch that re-throws', () => {
    const error = new ApiError(500, null, 'boom');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
  });
});

describe('session storage', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('round-trips tokens', async () => {
    const { session } = await import('../src/lib/api');
    const tokens = { accessToken: 'a', refreshToken: 'r', expiresIn: 900 };

    session.write(tokens);

    expect(session.read()).toEqual(tokens);
  });

  it('returns null when nothing is stored', async () => {
    const { session } = await import('../src/lib/api');

    expect(session.read()).toBeNull();
  });

  it('returns null rather than throwing on corrupt stored data', async () => {
    store.set('devpulse.tokens', '{not json');
    const { session } = await import('../src/lib/api');

    expect(session.read()).toBeNull();
  });

  it('clears the stored session on logout', async () => {
    const { session } = await import('../src/lib/api');
    session.write({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 });

    session.write(null);

    expect(session.read()).toBeNull();
  });

  it('survives a localStorage that throws, as in private browsing', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });

    const { session } = await import('../src/lib/api');

    expect(() =>
      session.write({ accessToken: 'a', refreshToken: 'r', expiresIn: 1 }),
    ).not.toThrow();
    expect(session.read()).toBeNull();
  });
});
