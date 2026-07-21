# syntax=docker/dockerfile:1
# ── Multi-stage build for the Taccalite platform (Next.js 16 + SQLite) ─────────

FROM node:20-bookworm-slim AS base
WORKDIR /app
# better-sqlite3 ships prebuilt binaries for common platforms; build tools are a
# safety net in case a source build is needed.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# gosu lets the root entrypoint fix the data-volume ownership and then drop to
# the unprivileged `node` user for the migrate/seed step and the server itself.
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*

# Full dependency tree (the seed script uses tsx; migrations run at startup).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY package.json next.config.ts drizzle.config.ts tsconfig.json ./
COPY lib ./lib
COPY scripts ./scripts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# App files are owned by `node`; the entrypoint runs as root only to chown the
# bind-mounted /app/data, then execs the server as `node` via gosu.
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/data && chown -R node:node /app

EXPOSE 3000

# Container-level healthcheck (used by Coolify and plain `docker run`; Compose
# defines its own equivalent). Node 20 ships a global fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
