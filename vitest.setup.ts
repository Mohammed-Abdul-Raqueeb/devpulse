/**
 * Runs before every test file.
 *
 * The API parses its environment at import time and refuses to start on a bad
 * config, so the variables it requires must exist before any module is loaded.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-secret-value-at-least-32-characters-long';
process.env.DATABASE_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';
process.env.ENABLE_JOBS = 'false';
