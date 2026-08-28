import { createId, parseUserAgent } from '@devpulse/shared';
import { getDb } from './client.js';
import { migrate } from './migrate.js';
import { createProject } from '../services/project.service.js';
import { createUser } from '../services/user.service.js';
import { logger } from '../lib/logger.js';

/**
 * Generates a realistic 60 days of traffic so the dashboard has something to
 * draw on a fresh checkout. Numbers are shaped, not uniform: weekday peaks,
 * a working-hours curve, and a long tail of referrers.
 */

const PAGES = [
  { path: '/', weight: 30 },
  { path: '/pricing', weight: 14 },
  { path: '/docs', weight: 18 },
  { path: '/docs/quickstart', weight: 10 },
  { path: '/blog/self-hosting-analytics', weight: 8 },
  { path: '/changelog', weight: 5 },
  { path: '/signup', weight: 9 },
  { path: '/login', weight: 6 },
];

const REFERRERS = [
  { url: '', weight: 34 },
  { url: 'https://news.ycombinator.com/', weight: 16 },
  { url: 'https://www.google.com/', weight: 22 },
  { url: 'https://github.com/', weight: 10 },
  { url: 'https://www.reddit.com/r/selfhosted', weight: 9 },
  { url: 'https://twitter.com/', weight: 9 },
];

const COUNTRIES = [
  { code: 'IN', weight: 20 },
  { code: 'US', weight: 24 },
  { code: 'DE', weight: 11 },
  { code: 'GB', weight: 10 },
  { code: 'BR', weight: 8 },
  { code: 'JP', weight: 7 },
  { code: 'NL', weight: 6 },
  { code: 'CA', weight: 7 },
  { code: 'AU', weight: 7 },
];

const AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/133.0',
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

const DAYS = 60;
const BASE_SESSIONS_PER_DAY = 140;

function pick<T extends { weight: number }>(table: T[]): T {
  const total = table.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of table) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return table[table.length - 1]!;
}

/** Weekends run quieter, and there is a slow upward trend across the window. */
function sessionsForDay(dayIndex: number, date: Date): number {
  const weekday = date.getUTCDay();
  const weekendFactor = weekday === 0 || weekday === 6 ? 0.55 : 1;
  const growth = 1 + (dayIndex / DAYS) * 0.6;
  const noise = 0.8 + Math.random() * 0.4;
  return Math.round(BASE_SESSIONS_PER_DAY * weekendFactor * growth * noise);
}

/** Traffic peaks mid-afternoon UTC and bottoms out overnight. */
function hourOfDay(): number {
  const curve = [1, 1, 1, 1, 2, 3, 5, 7, 9, 11, 12, 12, 11, 12, 13, 12, 10, 8, 7, 6, 5, 4, 3, 2];
  return pick(curve.map((weight, hour) => ({ hour, weight }))).hour;
}

export function seed(): void {
  const db = getDb();
  migrate(db);

  const existing = db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number };
  if (existing.count > 0) {
    logger.warn({ events: existing.count }, 'database already has events, skipping seed');
    return;
  }

  void createUser({
    email: 'demo@devpulse.dev',
    name: 'Demo Owner',
    password: 'devpulse-demo-password',
    role: 'owner',
  }).then((user) => {
    const { project, writeKey } = createProject(user.id, {
      name: 'Acme Marketing Site',
      slug: 'acme-marketing',
      allowedOrigins: [],
      retentionDays: 365,
    });

    generateEvents(project.id);

    logger.info(
      { email: 'demo@devpulse.dev', password: 'devpulse-demo-password', writeKey },
      'seed complete',
    );
  });
}

function generateEvents(projectId: string): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO events (
       id, project_id, kind, name, anonymous_id, user_id, session_id,
       timestamp, received_at, url, referrer, country, device, browser, os, properties
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const now = Date.now();
  let total = 0;

  const writeDay = db.transaction((dayIndex: number) => {
    const dayStart = new Date(now - (DAYS - dayIndex) * 86_400_000);
    dayStart.setUTCHours(0, 0, 0, 0);

    for (let s = 0; s < sessionsForDay(dayIndex, dayStart); s += 1) {
      const anonymousId = `anon_${Math.random().toString(36).slice(2, 14)}`;
      const sessionId = `ses_${Math.random().toString(36).slice(2, 14)}`;
      const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)]!;
      const parsed = parseUserAgent(agent);
      const country = pick(COUNTRIES).code;
      const referrer = pick(REFERRERS).url;

      // Most visits are one or two pages; a few go deep.
      const depth = Math.random() < 0.45 ? 1 : 1 + Math.floor(Math.random() * 5);
      let cursor = dayStart.getTime() + hourOfDay() * 3_600_000 + Math.random() * 3_600_000;

      for (let p = 0; p < depth; p += 1) {
        const page = pick(PAGES).path;
        const at = new Date(cursor).toISOString();

        insert.run(
          createId('evt'),
          projectId,
          'pageview',
          'page_view',
          anonymousId,
          null,
          sessionId,
          at,
          at,
          `https://acme.example${page}`,
          p === 0 ? referrer || null : null,
          country,
          parsed.device,
          parsed.browser,
          parsed.os,
          JSON.stringify({ depth: p + 1 }),
        );
        total += 1;

        // A share of visitors on /pricing or /signup convert further.
        if ((page === '/pricing' || page === '/signup') && Math.random() < 0.25) {
          const conversionAt = new Date(cursor + 25_000).toISOString();
          insert.run(
            createId('evt'),
            projectId,
            'track',
            page === '/pricing' ? 'plan_selected' : 'signup_completed',
            anonymousId,
            null,
            sessionId,
            conversionAt,
            conversionAt,
            `https://acme.example${page}`,
            null,
            country,
            parsed.device,
            parsed.browser,
            parsed.os,
            JSON.stringify({ plan: Math.random() < 0.7 ? 'pro' : 'team' }),
          );
          total += 1;
        }

        cursor += 20_000 + Math.random() * 180_000;
      }
    }
  });

  for (let day = 0; day < DAYS; day += 1) writeDay(day);
  logger.info({ events: total, days: DAYS }, 'generated demo events');
}

seed();
