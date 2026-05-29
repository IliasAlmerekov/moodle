import assert from "node:assert/strict";
import { test } from "vitest";

async function importApp() {
  process.env.MOODLE_URL = "https://moodle.example.test";
  process.env.MOODLE_TOKEN = "test-token";
  process.env.OLLAMA_URL = "http://ollama.example.test";
  process.env.OLLAMA_MODEL = "llama-default";

  const moduleUrl = new URL("../../src/app.js", import.meta.url);
  moduleUrl.searchParams.set("cacheBust", crypto.randomUUID());
  return import(moduleUrl.href);
}

test("createApp returns a Fastify instance with expected decorators", async () => {
  const { createApp } = await importApp();
  const app = await createApp();

  assert.strictEqual(typeof app.listen, "function", "app.listen should be a function");
  assert.ok(app.log, "app.log should be defined");
  assert.strictEqual(typeof app.log.info, "function", "app.log.info should be a function");

  await app.close();
});

test("createApp registers routes via registerRoutes", async () => {
  const { createApp } = await importApp();
  const app = await createApp();

  const routes = app.printRoutes({ commonPrefix: false });
  assert.ok(routes.includes("/health"), "should register /health route");
  assert.ok(routes.includes("/api/chat-stream"), "should register /api/chat-stream route");
  assert.ok(routes.includes("/api/chat-history/"), "should register /api/chat-history route");
  assert.ok(routes.includes("/moodle/ping"), "should register /moodle/ping route");

  await app.close();
});

test("createApp does not throw on repeated calls", async () => {
  const { createApp } = await importApp();
  const app1 = await createApp();
  const app2 = await createApp();

  assert.ok(app1, "first app should be created");
  assert.ok(app2, "second app should be created");
  assert.notStrictEqual(app1, app2, "each call should return a new instance");

  await app1.close();
  await app2.close();
});
