# syntax=docker/dockerfile:1
# ── Multi-stage build — Next.js 16 standalone + SQLite ─────────────────────────
# The runner ships only the traced standalone server (with better-sqlite3's
# prebuilt binary) + a precompiled seed bundle — no full node_modules, no tsx, no
# C build toolchain. For strict reproducibility, operators can pin the base images
# by digest (node:20-bookworm-slim@sha256:… / caddy:2@sha256:…).

FROM node:20-bookworm-slim AS base
WORKDIR /app

# ── Dependencies (build toolchain lives here only, never in the runner) ────────
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ── Build: Next standalone output + precompiled (tsx-free) seed/reset bundles ──
FROM deps AS build
COPY . .
# Match the runtime env so build-time module evaluation behaves like production —
# in particular RUN_MIGRATIONS_ON_BOOT stays off, so importing the DB client while
# Next collects route data never triggers a migration (which would race across
# build workers on a fresh empty DB).
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm run db:compile-seed && npm run db:compile-reset

# ── Runner: minimal image ──────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# gosu lets the root entrypoint fix the data/backups volume ownership and then
# drop to the unprivileged `node` user for seed + server.
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*

# Standalone server (traced deps incl. the native better-sqlite3 binary), static
# assets, public files, the precompiled seed, drizzle migrations, ops scripts.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/dist/seed.cjs ./seed.cjs
COPY --from=build /app/dist/reset.cjs ./reset.cjs
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/backup-container.sh /app/scripts/scheduler.sh ./scripts/
COPY --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh ./scripts/backup-container.sh ./scripts/scheduler.sh \
  && mkdir -p /app/data /app/backups && chown -R node:node /app

EXPOSE 3000

# Container-level healthcheck (Compose defines its own equivalent). Node 20 ships
# a global fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
