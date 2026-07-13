# @devpulse/shared

Types, validation schemas and pure helpers used by both the API and the dashboard.

Nothing in this package may import from `@devpulse/api` or `@devpulse/web`, and nothing here
touches the network or the filesystem — that keeps it safe to bundle into the browser.

```
src/
├── types/      TypeScript contracts (no runtime output)
├── schemas/    zod schemas; the single source of truth for request validation
├── utils/      pure functions: time bucketing, formatting, id generation, UA parsing
└── constants.ts
```

## Why schemas live here

The dashboard validates forms with the same schema the API validates requests with, so a
field can never drift between the two. `zod` is the only runtime dependency.
