import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // FractPath-specific ignores (do not lint archived code)
    "_app_unused/**",
    "_archived_scripts/**",
    "supabase/**",
    "packages/**/dist/**",
  ]),

  // Pragmatic project overrides (MVP-safe)
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },

  // Test-only override: allow require() in tests (Node-style harness)
  {
    files: [
      "src/**/__tests__/**/*.{ts,tsx}",
      "packages/**/src/**/__tests__/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
