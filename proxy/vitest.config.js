import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 70,
        functions: 75,
        branches: 55,
      },
    },
  },
});
