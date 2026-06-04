import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "vitest";

async function importErrorHandler() {
  process.env.MOODLE_URL = "https://moodle.example.test";
  process.env.MOODLE_TOKEN = "test-token";
  process.env.OLLAMA_URL = "http://ollama.example.test";
  process.env.OLLAMA_MODEL = "llama-default";

  const handlerUrl = new URL("../../../src/middleware/errorHandler.js", import.meta.url);
  handlerUrl.searchParams.set("cacheBust", crypto.randomUUID());
  const { setupErrorHandler } = await import(handlerUrl.href);
  const { default: config } = await import("../../../src/config/env.js");
  return { setupErrorHandler, config };
}

// Captures the handler registered via setErrorHandler and a fake reply.
function run(setupErrorHandler, error) {
  let handler;
  setupErrorHandler({ setErrorHandler: (fn) => (handler = fn) });

  const reply = {
    _status: null,
    _sent: null,
    status(code) {
      this._status = code;
      return this;
    },
    send(data) {
      this._sent = data;
    },
  };
  const request = { id: "req-1", url: "/x", method: "POST", log: { error() {} } };
  handler(error, request, reply);
  return reply;
}

let savedNodeEnv;
beforeEach(() => {
  savedNodeEnv = process.env.NODE_ENV;
});
afterEach(() => {
  process.env.NODE_ENV = savedNodeEnv;
});

test("production masks a 5xx error message", async () => {
  const { setupErrorHandler, config } = await importErrorHandler();
  config.nodeEnv = "production";
  const reply = run(
    setupErrorHandler,
    Object.assign(new Error("db dsn leaked"), { statusCode: 500 }),
  );
  assert.strictEqual(reply._status, 500);
  assert.strictEqual(reply._sent.message, "Ein Fehler ist aufgetreten.");
});

test("production masks an arbitrary 4xx error message (no expose flag)", async () => {
  const { setupErrorHandler, config } = await importErrorHandler();
  config.nodeEnv = "production";
  const reply = run(
    setupErrorHandler,
    Object.assign(new Error("internal path /etc/x"), { statusCode: 403 }),
  );
  assert.strictEqual(reply._status, 403);
  assert.strictEqual(reply._sent.message, "Ein Fehler ist aufgetreten.");
});

test("production exposes a schema-validation 4xx message", async () => {
  const { setupErrorHandler, config } = await importErrorHandler();
  config.nodeEnv = "production";
  const err = Object.assign(new Error("body/message must be string"), {
    statusCode: 400,
    validation: [{ message: "must be string" }],
  });
  const reply = run(setupErrorHandler, err);
  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.message, "body/message must be string");
});

test("production exposes an error explicitly flagged expose:true", async () => {
  const { setupErrorHandler, config } = await importErrorHandler();
  config.nodeEnv = "production";
  const err = Object.assign(new Error("safe to show"), { statusCode: 400, expose: true });
  const reply = run(setupErrorHandler, err);
  assert.strictEqual(reply._sent.message, "safe to show");
});

test("development exposes the raw message", async () => {
  const { setupErrorHandler, config } = await importErrorHandler();
  config.nodeEnv = "development";
  const reply = run(
    setupErrorHandler,
    Object.assign(new Error("verbose dev detail"), { statusCode: 500 }),
  );
  assert.strictEqual(reply._sent.message, "verbose dev detail");
});
