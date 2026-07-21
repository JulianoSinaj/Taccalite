import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Register the plugin in the same config object as the rule — newer ESLint
    // flat-config no longer resolves a plugin rule from a different object.
    plugins: { "react-hooks": reactHooks },
    rules: {
      // The mount-flag / localStorage-load pattern (`useEffect(() => setX(...), [])`)
      // is our intentional, SSR-safe idiom for client-only state; keep it advisory.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
    // Generated esbuild bundles (CJS) and test artifacts — never lint these.
    "dist/**",
    ".vitest-tmp/**",
    ".pw-tmp/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
