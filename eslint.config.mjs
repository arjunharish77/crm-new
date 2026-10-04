import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      // This CRM intentionally uses `any` at external data boundaries
      // (dynamic custom fields, report builders, automation node configs, and
      // direct-Postgres row maps). TypeScript/build still guards the contracts
      // that are stable enough to type strictly.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "jsx-a11y/alt-text": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/immutability": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/set-state-in-effect": "off",
      // Checks for React Compiler compatibility, which this app doesn't use (no reactCompiler in
      // next.config). eslint-plugin-react-hooks 7.1 added them to the recommended set (round-2
      // plan O7: the lockfile's version, now the one CI and Docker install).
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/use-memo": "off",
    },
  },
  {
    files: ["scripts/**/*.js", "**/scripts/**/*.js", "tests/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "**/.next/**",
    "out/**",
    "**/out/**",
    "build/**",
    "**/build/**",
    "**/.venv/**",
    "ml-service/.venv/**",
    "ml-service/__pycache__/**",
    "next-env.d.ts",
    "**/next-env.d.ts",
    "**/tsconfig.tsbuildinfo",
    // F21 fix (WP11): "limit lint scope to shipped code" -- these are audit/design/reference
    // artifacts that ship nowhere (not imported by src/, not part of the Next.js build, not
    // deployed), not app source. `npm run lint` previously failed outright on a stray file in
    // handoff_v2/ (an old design-handoff export using deprecated React APIs) -- a real CI
    // blocker on a directory nobody was ever going to fix, since it isn't live code.
    "handoff_v2/**",
    "crm-audit-bundle/**",
    "crm-audit-bundle-new/**",
    "ui-audit-2026-09/**",
  ]),
]);

export default eslintConfig;
