import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // happy-dom (used by the //@vitest-environment happy-dom frontend tests)
    // otherwise eagerly fetches iframe/script/style resources while parsing the
    // dirty HTML we feed the sanitizer — e.g. <iframe src="https://evil.test">.
    // Disable all resource loading so the suite is deterministic and offline.
    environmentOptions: {
      happyDOM: {
        settings: {
          disableJavaScriptFileLoading: true,
          disableJavaScriptEvaluation: true,
          disableCSSFileLoading: true,
          disableIframePageLoading: true,
          disableComputedStyleRendering: true,
        },
      },
    },
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
