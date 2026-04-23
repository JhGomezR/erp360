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
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // react-hooks v7 compiler rules — downgrade to warn; app does not use React Compiler
      "react-hooks/set-state-in-effect":            "warn",
      "react-hooks/purity":                         "warn",
      "react-hooks/immutability":                   "warn",
      "react-hooks/refs":                           "warn",
      "react-hooks/globals":                        "warn",
      "react-hooks/static-components":              "warn",
      "react-hooks/use-memo":                       "warn",
      "react-hooks/component-hook-factories":       "warn",
      "react-hooks/preserve-manual-memoization":    "warn",
      "react-hooks/error-boundaries":               "warn",
      "react-hooks/set-state-in-render":            "warn",
      "react-hooks/config":                         "warn",
      "react-hooks/gating":                         "warn",
    },
  },
]);

export default eslintConfig;
