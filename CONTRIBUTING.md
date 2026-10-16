# Contributing

## Getting set up

```bash
npm install
cp .env.example .env
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env
npm run seed
npm run dev
```

Run `npm run verify` before opening a pull request — it runs exactly what CI runs, so a green local
check means a green CI run.

## Where code goes

| Package | Rule |
| --- | --- |
| `shared` | Pure. No I/O, no imports from `api` or `web`. Must be safe to bundle into a browser |
| `api` | All SQL lives in `services/`. Routes validate, delegate and serialise — nothing else |
| `web` | Components take data as props. Fetching happens in a page or a hook, never in a component |

If a request shape is needed on both sides, it belongs in `shared/schemas` as a zod schema. That is
what stops the dashboard and the API disagreeing about a field.

## Style

Prettier and ESLint decide formatting; do not argue with them in review. Beyond that:

- Comments explain *why*, not *what*. If a line needs a comment to say what it does, rename
  something instead.
- Prefer a named function over a long inline arrow — stack traces get much more useful.
- `type` imports are explicit (`import type { … }`). The lint rule enforces it.
- No `any`. `unknown` plus a narrowing check is almost always what was meant.

## Tests

Vitest, with tests in `packages/*/tests/`. One behaviour per test, and a name that reads as a
sentence about the behaviour rather than the function:

```ts
// good
it('drops a visitor who skips an intermediate step', …)

// not good
it('computeFunnel works', …)
```

Each test arranges its own data through the helpers in `tests/helpers.ts`, and `freshDb()` gives it
an isolated in-memory database. No test may depend on another having run.

Bug fixes come with a test that fails before the fix. That is the only way to know it is actually
fixed and stays fixed.

## Commits

Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`, `ci:`,
`build:`, `style:`.

One logical change per commit. "Fix the funnel window bug" is a commit; "fix the funnel window bug
and reformat the whole file" is two.

## Adding a dependency

The bar is high, especially in `web` — the dashboard currently ships no chart library and no CSS
framework, and that is deliberate. Before adding one, say in the pull request what it replaces and
what it costs in bundle size.
