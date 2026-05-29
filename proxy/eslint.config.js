import js from "@eslint/js";
import n from "eslint-plugin-n";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  n.configs["flat/recommended"],
  {
    rules: {
      "no-unused-vars": ["error", { args: "none" }],
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": "error",
      "n/no-unsupported-features/node-builtins": "off",
    },
  },
  {
    files: ["tests/**/*.js"],
    rules: {
      "n/no-unpublished-import": "off",
    },
  },
  prettier,
];
