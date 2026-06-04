import assert from "node:assert/strict";
import { test } from "vitest";
import { LOG_REDACT_PATHS } from "../../../../src/frameworks/webserver/fastify.js";

// The logger wires these paths into pino's `redact` (see createFastifyInstance).
// This guards the contract: student message content / signatures / credentials
// are covered, and no broad `*.message` wildcard is used (it would clobber
// `err.message` and make error logs useless).

test("redaction covers chat message content and signature under both body shapes", () => {
  for (const leaf of ["message", "content", "sig"]) {
    assert.ok(
      LOG_REDACT_PATHS.includes(`body.${leaf}`),
      `expected body.${leaf} to be redacted`,
    );
    assert.ok(
      LOG_REDACT_PATHS.includes(`req.body.${leaf}`),
      `expected req.body.${leaf} to be redacted`,
    );
  }
});

test("redaction covers Authorization and Cookie request headers", () => {
  assert.ok(LOG_REDACT_PATHS.includes("req.headers.authorization"));
  assert.ok(LOG_REDACT_PATHS.includes("req.headers.cookie"));
});

test("redaction uses no wildcard that would clobber err.message", () => {
  assert.ok(!LOG_REDACT_PATHS.some((p) => p === "*.message" || p === "message"));
});
