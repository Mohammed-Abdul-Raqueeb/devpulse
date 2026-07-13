import { describe, expect, it } from 'vitest';
import { parseUserAgent } from '../src/utils/useragent.js';
import { createId, createWriteKey, slugify } from '../src/utils/id.js';

const AGENTS = {
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  curl: 'curl/8.7.1',
};

describe('parseUserAgent', () => {
  it('identifies a desktop Chrome on Windows', () => {
    expect(parseUserAgent(AGENTS.windowsChrome)).toEqual({
      device: 'desktop',
      browser: 'Chrome',
      os: 'Windows',
    });
  });

  it('identifies Safari on macOS', () => {
    expect(parseUserAgent(AGENTS.macSafari)).toEqual({
      device: 'desktop',
      browser: 'Safari',
      os: 'macOS',
    });
  });

  it('identifies an iPhone as mobile', () => {
    expect(parseUserAgent(AGENTS.iphone)).toMatchObject({ device: 'mobile', os: 'iOS' });
  });

  it('identifies an Android phone as mobile', () => {
    expect(parseUserAgent(AGENTS.androidChrome)).toMatchObject({
      device: 'mobile',
      os: 'Android',
    });
  });

  it('separates a tablet from a phone', () => {
    expect(parseUserAgent(AGENTS.ipad).device).toBe('tablet');
  });

  it('prefers Edge over the Chrome token it also carries', () => {
    expect(parseUserAgent(AGENTS.edge).browser).toBe('Edge');
  });

  it('identifies Firefox on Linux', () => {
    expect(parseUserAgent(AGENTS.firefox)).toEqual({
      device: 'desktop',
      browser: 'Firefox',
      os: 'Linux',
    });
  });

  it('buckets crawlers separately so they can be excluded', () => {
    expect(parseUserAgent(AGENTS.googlebot).device).toBe('bot');
    expect(parseUserAgent(AGENTS.curl).device).toBe('bot');
  });

  it('returns unknown for a missing user agent', () => {
    expect(parseUserAgent(undefined)).toEqual({ device: 'unknown', browser: null, os: null });
  });
});

describe('createId', () => {
  it('uses the given prefix', () => {
    expect(createId('evt')).toMatch(/^evt_[0-9a-z]+$/);
  });

  it('does not collide across a large batch', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => createId('evt')));

    expect(ids.size).toBe(2000);
  });
});

describe('createWriteKey', () => {
  it('is prefixed so a leaked key is recognisable in a log', () => {
    expect(createWriteKey()).toMatch(/^dp_live_[A-Za-z0-9_-]+$/);
  });

  it('is long enough to resist guessing', () => {
    expect(createWriteKey().length).toBeGreaterThan(30);
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Acme Marketing Site')).toBe('acme-marketing-site');
  });

  it('drops punctuation', () => {
    expect(slugify('Acme! & Co.')).toBe('acme-co');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  spaced out  ')).toBe('spaced-out');
  });

  it('falls back to a generated slug when nothing usable remains', () => {
    expect(slugify('!!!')).toMatch(/^project-[0-9a-f]{6}$/);
  });
});
