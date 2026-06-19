import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

/**
 * Flat config for the whole workspace.
 *
 * Globals are scoped per package rather than declared once: the API must not be
 * able to reference `document`, and the dashboard must not reference `process`,
 * and getting a `no-undef` error is a cheaper way to learn that than a runtime
 * crash in the wrong environment.
 */

const sharedRules = {
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  eqeqeq: ['error', 'smart'],
  'prefer-const': 'error',
  'no-var': 'error',
  'object-shorthand': 'error',
  'no-nested-ternary': 'off',
};

export default [
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/*.d.ts'],
  },

  js.configs.recommended,

  // Shared: pure code, so it gets no environment globals beyond the standard
  // library — that is what keeps it safe to bundle into a browser.
  {
    files: ['packages/shared/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      // No Node globals on purpose. A `Buffer` or `process` reference here
      // would break the dashboard build, and a lint error is a much faster way
      // to find that out than a rollup failure.
      globals: { ...globals.es2022, crypto: 'readonly', URL: 'readonly' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { ...tsPlugin.configs.recommended.rules, ...sharedRules },
  },

  // API: Node.
  {
    files: ['packages/api/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { ...tsPlugin.configs.recommended.rules, ...sharedRules },
  },

  // Dashboard: browser, plus JSX and the hook rules.
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, JSX: 'readonly', React: 'readonly' },
    },
    plugins: { '@typescript-eslint': tsPlugin, 'react-hooks': reactHooks },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...sharedRules,
      /*
       * Off deliberately.
       *
       * The rule's advice — synchronise with external systems, do not set state
       * in an effect body — is right, but tracking a fetch's loading state is
       * exactly the case it cannot express: `useAsync` subscribes to an external
       * system (the API) whose first act is to become pending. Every suggested
       * alternative (Suspense, an external store) is a larger dependency than
       * the problem warrants here. The effects that remain are confined to
       * `useAsync` and `useAuth`, and both guard against stale and unmounted
       * updates explicitly.
       */
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // Tests: assertions legitimately reach for non-null and any.
  {
    files: ['**/tests/**/*.{ts,tsx}', 'vitest.setup.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...sharedRules,
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Operator scripts and build config: Node, and printing to stdout is the point.
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { 'no-console': 'off' },
  },

  prettier,
];
