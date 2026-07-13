import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Descriptive identifiers only: no single-letter/abbreviated names.
      // Property names are exempt (DB columns and proto fields are contracts).
      "id-length": ["error", { min: 4, properties: "never" }],
      // Layering rules: pages/components must not reach into repo directly.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/*/repo/*", "@/server/common/db"],
              message:
                "UI must not import the repo layer — go through a usecase (server) or the Connect client (browser).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/**", "src/pages/api/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    ignores: [".next/**", "node_modules/**"],
  },
];

export default config;
