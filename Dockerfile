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

# Full dependency tree (the seed script uses tsx; migrations run at startup).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY package.json next.config.ts drizzle.config.ts tsconfig.json ./
COPY lib ./lib
COPY scripts ./scripts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/data

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
