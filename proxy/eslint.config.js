import js from "@eslint/js";
import n from "eslint-plugin-n";

export default [
  js.configs.recommended,
  n.configs["flat/recommended"],
  {
    rules: {
      "no-unused-vars": ["error", { args: "none" }],
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": "error",
    },
  },
  {
    files: ["tests/**/*.js"],
    rules: {
      "n/no-unpublished-import": "off",
    },
  },
  {
    rules: {
      "n/no-unsupported-features/node-builtins": "off",
    },
  },
];
