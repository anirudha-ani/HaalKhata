/** ESLint flat config for the mobile app: TypeScript + hooks rules + naming conventions. */

import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const config = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Descriptive identifiers only: no single-letter/abbreviated names.
      // Property names are exempt (proto fields are contracts).
      "id-length": ["error", { min: 4, properties: "never" }],
    },
  },
  {
    files: ["app/**/*.tsx", "src/**/*.tsx"],
    ignores: ["src/components/ui/Text.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "react-native",
          importNames: ["Text"],
          message: "Use @/components/ui/Text so iOS Dynamic Type changes remeasure existing text.",
        }],
      }],
    },
  },
  {
    ignores: [".expo/**", "node_modules/**", "dist/**", "android/**", "ios/**"],
  },
);

export default config;
