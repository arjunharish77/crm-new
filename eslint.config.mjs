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
  ]),
]);

export default eslintConfig;
