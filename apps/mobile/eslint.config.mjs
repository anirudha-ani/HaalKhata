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
    ignores: [".expo/**", "node_modules/**", "dist/**", "android/**", "ios/**"],
  },
);

export default config;
