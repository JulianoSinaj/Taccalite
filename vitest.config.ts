import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Vitest config for the domain/unit suite (Node environment).
 *
 * - `@/*` resolves to the repo root, matching tsconfig paths.
 * - `server-only` is stubbed so modules guarded with `import "server-only"` can be
 *   exercised under Node.
 * - Env is forced to a dev-like profile so `lib/env`'s production secret guard
 *   doesn't fire, and a throwaway SQLite path is used by the DB-integration tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": resolve(__dirname, "test/stubs/server-only.ts"),
      "@": resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: {
      NODE_ENV: "development",
      DATABASE_URL: "./.vitest-tmp/test.db",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      RUN_MIGRATIONS_ON_BOOT: "1",
    },
    // The DB-integration tests share one migrated SQLite singleton, so run test
    // files sequentially to avoid cross-file contention on that file.
    fileParallelism: false,
  },
});
