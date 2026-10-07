# ---- build stage ----------------------------------------------------------
FROM node:22-alpine AS build

# better-sqlite3 ships prebuilt binaries, but falls back to compiling from
# source on Alpine, so the toolchain has to be present at install time.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy manifests first so a source-only change does not invalidate the
# dependency layer.
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/

RUN npm install --no-audit --no-fund

COPY tsconfig*.json vitest.config.ts ./
COPY packages ./packages

RUN npm run build --workspace=@devpulse/shared \
 && npm run build --workspace=@devpulse/api \
 && npm run build --workspace=@devpulse/web

# ---- runtime stage --------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Run unprivileged. The data directory is the only thing the process writes to.
RUN addgroup -S devpulse && adduser -S devpulse -G devpulse

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/api/package.json ./packages/api/
COPY --from=build /app/packages/api/src/db/schema.sql ./packages/api/dist/db/schema.sql
COPY --from=build /app/packages/web/dist ./packages/web/dist

RUN mkdir -p /app/data && chown -R devpulse:devpulse /app/data

USER devpulse
EXPOSE 4000

ENV DATABASE_PATH=/app/data/devpulse.db

# Hits the liveness probe, which never touches the database — a slow query must
# not get the container restarted.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "packages/api/dist/server.js"]
