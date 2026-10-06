#!/usr/bin/env node
/**
 * Prints what is actually in the database: row counts, per-project volume,
 * index sizes and the file size on disk. Useful for answering "why is this
 * 4 GB" without opening a SQL shell.
 *
 *   node scripts/db-stats.mjs [path/to/devpulse.db]
 */

import Database from 'better-sqlite3';
import { statSync } from 'node:fs';

const path = process.argv[2] ?? './data/devpulse.db';

let db;
try {
  // Read-only: this script must never be able to damage a production database.
  db = new Database(path, { readonly: true, fileMustExist: true });
} catch (err) {
  console.error(`Could not open ${path}: ${err.message}`);
  process.exit(1);
}

const bytes = (n) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
};

console.log(`\nDatabase  ${path}`);
console.log(`On disk   ${bytes(statSync(path).size)}`);

const pageCount = db.pragma('page_count', { simple: true });
const pageSize = db.pragma('page_size', { simple: true });
const freelist = db.pragma('freelist_count', { simple: true });

console.log(`Pages     ${pageCount} x ${bytes(pageSize)}`);
console.log(`Freelist  ${freelist} pages (${bytes(freelist * pageSize)} reclaimable with VACUUM)`);

console.log('\nRow counts');
console.log('─'.repeat(52));
const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
  .all();

for (const { name } of tables) {
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get();
  console.log(`${name.padEnd(20)} ${String(count).padStart(12)}`);
}

const projects = db.prepare('SELECT id, name, slug, retention_days FROM projects').all();

if (projects.length > 0) {
  console.log('\nPer project');
  console.log('─'.repeat(72));
  console.log(
    `${'project'.padEnd(26)}${'events'.padStart(12)}${'visitors'.padStart(11)}${'oldest'.padStart(13)}${'retention'.padStart(10)}`,
  );

  const stats = db.prepare(
    `SELECT COUNT(*) AS events,
            COUNT(DISTINCT anonymous_id) AS visitors,
            MIN(timestamp) AS oldest
     FROM events WHERE project_id = ?`,
  );

  for (const project of projects) {
    const row = stats.get(project.id);
    const oldest = row.oldest ? row.oldest.slice(0, 10) : '—';
    console.log(
      `${project.slug.slice(0, 25).padEnd(26)}${String(row.events).padStart(12)}${String(row.visitors).padStart(11)}${oldest.padStart(13)}${`${project.retention_days}d`.padStart(10)}`,
    );
  }
}

console.log('\nIndexes');
console.log('─'.repeat(52));
const indexes = db
  .prepare(
    `SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`,
  )
  .all();

for (const index of indexes) {
  console.log(`${index.name.padEnd(32)} on ${index.tbl_name}`);
}

console.log();
db.close();
