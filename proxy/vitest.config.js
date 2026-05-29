import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      include: ["src/**"],
      exclude: [
        "src/app.js",
        "src/frameworks/webserver/server.js",
        "src/application/repositories/**",
      ],
      reporter: ["text", "lcov"],
      thresholds: {
        statements: 70,
        lines: 70,
        functions: 80,
        branches: 65,
        "src/entities/**": {
          lines: 90,
        },
        "src/middleware/**": {
          lines: 90,
        },
      },
    },
  },
});
