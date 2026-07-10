import { describe, expect, it } from 'vitest';
import {
  formatCompact,
  formatDuration,
  formatPercent,
  normalizePath,
  referrerHost,
  relativeChange,
} from '../src/utils/format.js';

describe('formatCompact', () => {
  it('leaves small numbers alone', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(947)).toBe('947');
  });

  it('abbreviates thousands', () => {
    expect(formatCompact(1234)).toBe('1.2K');
    expect(formatCompact(12_400)).toBe('12K');
  });

  it('abbreviates millions and billions', () => {
    expect(formatCompact(2_500_000)).toBe('2.5M');
    expect(formatCompact(3_200_000_000)).toBe('3.2B');
  });

  it('drops a trailing .0 rather than printing it', () => {
    expect(formatCompact(1000)).toBe('1K');
  });

  it('handles negatives symmetrically', () => {
    expect(formatCompact(-1500)).toBe('-1.5K');
  });
});

describe('formatPercent', () => {
  it('renders one decimal by default', () => {
    expect(formatPercent(0.4213)).toBe('42.1%');
  });

  it('respects a requested precision', () => {
    expect(formatPercent(0.4213, 0)).toBe('42%');
  });

  it('renders zero and one cleanly', () => {
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(1)).toBe('100.0%');
  });
});

describe('formatDuration', () => {
  it('renders sub-minute durations in seconds', () => {
    expect(formatDuration(42)).toBe('42s');
  });

  it('renders minutes with seconds', () => {
    expect(formatDuration(135)).toBe('2m 15s');
  });

  it('renders hours with minutes and drops the seconds', () => {
    expect(formatDuration(3725)).toBe('1h 2m');
  });

  it('floors a fractional duration to zero', () => {
    expect(formatDuration(0.4)).toBe('0s');
  });
});

describe('relativeChange', () => {
  it('reports growth as a positive fraction', () => {
    expect(relativeChange(150, 100)).toBeCloseTo(0.5, 6);
  });

  it('reports decline as a negative fraction', () => {
    expect(relativeChange(50, 100)).toBeCloseTo(-0.5, 6);
  });

  it('returns null when there is no baseline to compare against', () => {
    expect(relativeChange(10, 0)).toBeNull();
  });

  it('calls zero-to-zero no change rather than undefined', () => {
    expect(relativeChange(0, 0)).toBe(0);
  });
});

describe('normalizePath', () => {
  it('strips the query string', () => {
    expect(normalizePath('https://x.test/pricing?utm_source=hn')).toBe('/pricing');
  });

  it('strips a trailing slash', () => {
    expect(normalizePath('https://x.test/docs/')).toBe('/docs');
  });

  it('keeps the root path as a single slash', () => {
    expect(normalizePath('https://x.test/')).toBe('/');
  });

  it('degrades gracefully on a non-URL', () => {
    expect(normalizePath('/already/a/path?x=1')).toBe('/already/a/path');
  });
});

describe('referrerHost', () => {
  it('extracts the host', () => {
    expect(referrerHost('https://news.ycombinator.com/item?id=1')).toBe('news.ycombinator.com');
  });

  it('calls an empty referrer direct traffic', () => {
    expect(referrerHost('')).toBe('direct');
    expect(referrerHost(null)).toBe('direct');
    expect(referrerHost(undefined)).toBe('direct');
  });

  it('falls back to direct on a malformed referrer', () => {
    expect(referrerHost('not a url at all')).toBe('direct');
  });
});
