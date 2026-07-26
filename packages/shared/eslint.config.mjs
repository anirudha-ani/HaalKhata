/** ESLint flat config for the shared package: TypeScript + naming conventions. */

import js from "@eslint/js";
import tseslint from "typescript-eslint";

const config = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Descriptive identifiers only: no single-letter/abbreviated names.
      // Property names are exempt (query-key tuples mirror server contracts).
      "id-length": ["error", { min: 4, properties: "never" }],
      // This package is consumed by a Next.js app and a React Native app;
      // anything renderer- or runtime-specific belongs in the app, not here.
      "no-restricted-globals": [
        "error",
        { name: "window", message: "@haalkhata/shared must stay platform-agnostic (no DOM)." },
        { name: "document", message: "@haalkhata/shared must stay platform-agnostic (no DOM)." },
        { name: "process", message: "@haalkhata/shared must stay platform-agnostic (no Node APIs)." },
      ],
    },
  },
  {
    ignores: ["node_modules/**"],
  },
);

export default config;
