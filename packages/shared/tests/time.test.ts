import { describe, expect, it } from 'vitest';
import {
  clampTimestamp,
  enumerateBuckets,
  floorToBucket,
  nextBucket,
  previousRange,
  suggestGranularity,
} from '../src/utils/time.js';

describe('floorToBucket', () => {
  const sample = new Date('2026-03-18T14:37:52.413Z'); // a Wednesday

  it('truncates to the start of the hour', () => {
    expect(floorToBucket(sample, 'hour').toISOString()).toBe('2026-03-18T14:00:00.000Z');
  });

  it('truncates to midnight UTC', () => {
    expect(floorToBucket(sample, 'day').toISOString()).toBe('2026-03-18T00:00:00.000Z');
  });

  it('truncates to the preceding Monday', () => {
    expect(floorToBucket(sample, 'week').toISOString()).toBe('2026-03-16T00:00:00.000Z');
  });

  it('treats Sunday as the end of its week, not the start', () => {
    const sunday = new Date('2026-03-22T10:00:00.000Z');

    expect(floorToBucket(sunday, 'week').toISOString()).toBe('2026-03-16T00:00:00.000Z');
  });

  it('truncates to the first of the month', () => {
    expect(floorToBucket(sample, 'month').toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('does not mutate its argument', () => {
    const original = sample.toISOString();
    floorToBucket(sample, 'month');

    expect(sample.toISOString()).toBe(original);
  });
});

describe('nextBucket', () => {
  it('advances by one hour', () => {
    const at = new Date('2026-03-18T14:00:00.000Z');

    expect(nextBucket(at, 'hour').toISOString()).toBe('2026-03-18T15:00:00.000Z');
  });

  it('advances across a month boundary of unequal length', () => {
    const at = new Date('2026-01-01T00:00:00.000Z');

    expect(nextBucket(at, 'month').toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('advances from February without overshooting', () => {
    const at = new Date('2026-02-01T00:00:00.000Z');

    expect(nextBucket(at, 'month').toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('enumerateBuckets', () => {
  it('covers a range half-open on the right', () => {
    const buckets = enumerateBuckets(
      { from: '2026-03-01T00:00:00.000Z', to: '2026-03-04T00:00:00.000Z' },
      'day',
    );

    expect(buckets).toEqual([
      '2026-03-01T00:00:00.000Z',
      '2026-03-02T00:00:00.000Z',
      '2026-03-03T00:00:00.000Z',
    ]);
  });

  it('returns an empty list when the range is inverted', () => {
    const buckets = enumerateBuckets(
      { from: '2026-03-04T00:00:00.000Z', to: '2026-03-01T00:00:00.000Z' },
      'day',
    );

    expect(buckets).toEqual([]);
  });

  it('snaps a mid-bucket start down to the bucket boundary', () => {
    const buckets = enumerateBuckets(
      { from: '2026-03-01T13:45:00.000Z', to: '2026-03-02T00:00:00.000Z' },
      'day',
    );

    expect(buckets[0]).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('previousRange', () => {
  it('returns the equally long window ending where the range begins', () => {
    const previous = previousRange({
      from: '2026-03-08T00:00:00.000Z',
      to: '2026-03-15T00:00:00.000Z',
    });

    expect(previous).toEqual({
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-08T00:00:00.000Z',
    });
  });
});

describe('suggestGranularity', () => {
  const span = (hours: number): { from: string; to: string } => ({
    from: new Date(0).toISOString(),
    to: new Date(hours * 3_600_000).toISOString(),
  });

  it('uses hours for a short range', () => {
    expect(suggestGranularity(span(24))).toBe('hour');
  });

  it('uses days for a month', () => {
    expect(suggestGranularity(span(24 * 30))).toBe('day');
  });

  it('uses weeks for a year', () => {
    expect(suggestGranularity(span(24 * 365))).toBe('week');
  });

  it('uses months for several years', () => {
    expect(suggestGranularity(span(24 * 365 * 5))).toBe('month');
  });
});

describe('clampTimestamp', () => {
  const now = new Date('2026-03-18T12:00:00.000Z');

  it('falls back to now when the input is missing', () => {
    expect(clampTimestamp(undefined, now)).toBe(now.toISOString());
  });

  it('falls back to now when the input is unparseable', () => {
    expect(clampTimestamp('yesterday-ish', now)).toBe(now.toISOString());
  });

  it('keeps a plausible timestamp as given', () => {
    const at = '2026-03-18T11:30:00.000Z';

    expect(clampTimestamp(at, now)).toBe(at);
  });

  it('pulls a far-future timestamp back toward now', () => {
    const clamped = clampTimestamp('2030-01-01T00:00:00.000Z', now);

    expect(Date.parse(clamped)).toBeLessThanOrEqual(now.getTime() + 5 * 60_000);
  });

  it('pushes a very old timestamp forward to the retention edge', () => {
    const clamped = clampTimestamp('2020-01-01T00:00:00.000Z', now);

    expect(Date.parse(clamped)).toBe(now.getTime() - 7 * 86_400_000);
  });
});
