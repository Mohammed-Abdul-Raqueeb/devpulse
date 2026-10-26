import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const sharedSrc = fileURLToPath(new URL('./packages/shared/src', import.meta.url));

/**
 * Tests resolve @devpulse/shared to its source rather than its build output, so
 * a change there is picked up without a build step and coverage reports real
 * lines instead of compiled ones.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@devpulse/shared': `${sharedSrc}/index.ts`,
    },
  },
  test: {
    environment: 'node',
    // Only the dashboard needs a DOM; a jsdom environment for the API and SDK
    // suites would cost seconds per run for nothing.
    environmentMatchGlobs: [['packages/web/tests/**', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/*/tests/**/*.test.ts', 'packages/*/tests/**/*.test.tsx'],
    css: false,
    globals: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/db/seed.ts', '**/index.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
      },
    },
  },
});
