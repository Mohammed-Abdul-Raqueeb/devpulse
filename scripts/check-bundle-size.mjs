#!/usr/bin/env node
/**
 * Fails the build when a bundle outgrows its budget.
 *
 * The dashboard deliberately ships no chart library and no CSS framework. That
 * is easy to say in a README and easy to undo in a pull request, so the claim
 * is enforced here instead: gzipped, because that is what a visitor downloads.
 *
 *   node scripts/check-bundle-size.mjs
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Budgets in kB, gzipped. Raise one only with a reason in the commit message. */
const BUDGETS = [
  { label: 'dashboard app', match: /^index-.*\.js$/, maxKb: 40 },
  { label: 'react vendor', match: /^react-.*\.js$/, maxKb: 60 },
  { label: 'stylesheet', match: /^index-.*\.css$/, maxKb: 8 },
];

const ASSETS = 'packages/web/dist/assets';

if (!existsSync(ASSETS)) {
  console.error(`No build output at ${ASSETS}. Run "npm run build" first.`);
  process.exit(1);
}

const files = readdirSync(ASSETS);
let failed = false;

console.log('\nBundle sizes (gzipped)');
console.log('─'.repeat(52));

for (const budget of BUDGETS) {
  const name = files.find((file) => budget.match.test(file));

  if (!name) {
    console.error(`MISSING  ${budget.label} — no file matching ${budget.match}`);
    failed = true;
    continue;
  }

  const sizeKb = gzipSync(readFileSync(join(ASSETS, name))).byteLength / 1024;
  const over = sizeKb > budget.maxKb;
  if (over) failed = true;

  const status = over ? 'OVER ' : 'ok   ';
  console.log(
    `${status} ${budget.label.padEnd(16)} ${sizeKb.toFixed(1).padStart(6)} kB / ${String(budget.maxKb).padStart(3)} kB`,
  );
}

console.log('─'.repeat(52));

if (failed) {
  console.error('\nA bundle is over budget. Either trim it, or raise the budget deliberately.');
  process.exit(1);
}

console.log('All bundles within budget.\n');
