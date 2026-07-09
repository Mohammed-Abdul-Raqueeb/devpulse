import type { DeviceType } from '../types/event.js';

interface ParsedAgent {
  device: DeviceType;
  browser: string | null;
  os: string | null;
}

const BOT_PATTERN = /bot|crawler|spider|crawling|headless|lighthouse|pingdom|curl|wget/i;
const TABLET_PATTERN = /ipad|tablet|playbook|silk|kindle/i;
const MOBILE_PATTERN = /mobi|iphone|ipod|android.*mobile|windows phone/i;

const BROWSERS: Array<[RegExp, string]> = [
  [/edg\//i, 'Edge'],
  [/opr\/|opera/i, 'Opera'],
  [/samsungbrowser/i, 'Samsung Internet'],
  [/chrome\/|crios/i, 'Chrome'],
  [/firefox\/|fxios/i, 'Firefox'],
  [/safari\//i, 'Safari'],
];

const OPERATING_SYSTEMS: Array<[RegExp, string]> = [
  [/windows nt/i, 'Windows'],
  [/android/i, 'Android'],
  [/iphone|ipad|ipod/i, 'iOS'],
  [/mac os x/i, 'macOS'],
  [/cros/i, 'ChromeOS'],
  [/linux/i, 'Linux'],
];

/**
 * A deliberately small user-agent parser. It covers the buckets the dashboard
 * actually shows and avoids pulling in a multi-megabyte regex database.
 */
export function parseUserAgent(ua: string | undefined): ParsedAgent {
  if (!ua) return { device: 'unknown', browser: null, os: null };
  if (BOT_PATTERN.test(ua)) return { device: 'bot', browser: null, os: null };

  const device: DeviceType = TABLET_PATTERN.test(ua)
    ? 'tablet'
    : MOBILE_PATTERN.test(ua)
      ? 'mobile'
      : 'desktop';

  return { device, browser: firstMatch(ua, BROWSERS), os: firstMatch(ua, OPERATING_SYSTEMS) };
}

function firstMatch(ua: string, table: Array<[RegExp, string]>): string | null {
  for (const [pattern, label] of table) {
    if (pattern.test(ua)) return label;
  }
  return null;
}
