import { describe, expect, it } from 'vitest';
import {
  clearIdentity,
  memoryStorage,
  randomId,
  resolveIdentity,
  type StorageLike,
} from '../src/identity.js';

function stores(): { local: StorageLike; session: StorageLike } {
  return { local: memoryStorage(), session: memoryStorage() };
}

describe('resolveIdentity', () => {
  it('creates a visitor and a session on the first call', () => {
    const identity = resolveIdentity({ ...stores(), now: () => 1_000 });

    expect(identity.anonymousId).toMatch(/^anon_[0-9a-z]{12}$/);
    expect(identity.sessionId).toMatch(/^ses_[0-9a-z]{12}$/);
    expect(identity.isNewSession).toBe(true);
  });

  it('reuses both ids on an immediate second call', () => {
    const store = stores();
    const first = resolveIdentity({ ...store, now: () => 1_000 });
    const second = resolveIdentity({ ...store, now: () => 2_000 });

    expect(second.anonymousId).toBe(first.anonymousId);
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.isNewSession).toBe(false);
  });

  it('starts a new session after the idle window, keeping the visitor', () => {
    const store = stores();
    const first = resolveIdentity({ ...store, now: () => 0, idleMinutes: 30 });
    const later = resolveIdentity({ ...store, now: () => 31 * 60_000, idleMinutes: 30 });

    expect(later.anonymousId).toBe(first.anonymousId);
    expect(later.sessionId).not.toBe(first.sessionId);
    expect(later.isNewSession).toBe(true);
  });

  it('keeps the session alive while activity continues inside the window', () => {
    const store = stores();
    const first = resolveIdentity({ ...store, now: () => 0, idleMinutes: 30 });
    // Each touch resets the idle clock, so 50 minutes of steady activity is one
    // session rather than two.
    const mid = resolveIdentity({ ...store, now: () => 25 * 60_000, idleMinutes: 30 });
    const end = resolveIdentity({ ...store, now: () => 50 * 60_000, idleMinutes: 30 });

    expect(mid.sessionId).toBe(first.sessionId);
    expect(end.sessionId).toBe(first.sessionId);
  });

  it('survives a session store that has lost its last-seen marker', () => {
    const store = stores();
    resolveIdentity({ ...store, now: () => 1_000 });
    store.session.removeItem('dp_seen');

    const next = resolveIdentity({ ...store, now: () => 2_000 });

    expect(next.isNewSession).toBe(true);
    expect(next.sessionId).toMatch(/^ses_/);
  });

  it('does not throw when storage is blocked, as in private browsing', () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };

    const identity = resolveIdentity({ local: blocked, session: blocked, now: () => 1 });

    expect(identity.anonymousId).toMatch(/^anon_/);
    expect(identity.sessionId).toMatch(/^ses_/);
  });

  it('issues fresh ids every time when nothing can be persisted', () => {
    const blocked: StorageLike = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    const first = resolveIdentity({ local: blocked, session: blocked });
    const second = resolveIdentity({ local: blocked, session: blocked });

    expect(second.anonymousId).not.toBe(first.anonymousId);
  });
});

describe('clearIdentity', () => {
  it('forgets the visitor so the next call starts over', () => {
    const store = stores();
    const before = resolveIdentity({ ...store, now: () => 1_000 });

    clearIdentity(store);
    const after = resolveIdentity({ ...store, now: () => 1_100 });

    expect(after.anonymousId).not.toBe(before.anonymousId);
    expect(after.sessionId).not.toBe(before.sessionId);
  });
});

describe('randomId', () => {
  it('uses the given prefix', () => {
    expect(randomId('anon')).toMatch(/^anon_[0-9a-z]{12}$/);
  });

  it('does not collide across a large batch', () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => randomId('ses')));

    expect(ids.size).toBe(5_000);
  });
});

describe('memoryStorage', () => {
  it('behaves like a storage for the keys the sdk uses', () => {
    const storage = memoryStorage();

    expect(storage.getItem('missing')).toBeNull();
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
    storage.removeItem('k');
    expect(storage.getItem('k')).toBeNull();
  });
});
