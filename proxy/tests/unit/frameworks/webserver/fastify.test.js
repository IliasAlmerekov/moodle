import assert from "node:assert/strict";
import test from "node:test";

async function importFastifyFactory() {
  const moduleUrl = new URL("../../../../src/frameworks/webserver/fastify.js", import.meta.url);
  moduleUrl.searchParams.set("cacheBust", crypto.randomUUID());
  return import(moduleUrl.href);
}

test("createFastifyInstance returns a configured Fastify app", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    cors: { origins: ["http://localhost:8080"] },
    rateLimit: { max: 20, window: "1 minute" },
    moodle: { publicUrl: "https://www.itech-bs14.de" },
  };

  const app = await createFastifyInstance(config);

  assert.ok(app, "app should be defined");
  assert.ok(app.log, "app.log should be defined");
  assert.equal(typeof app.inject, "function", "app.inject should be a function");
});

test("registered plugins add expected headers", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    cors: { origins: ["http://localhost:8080"] },
    rateLimit: { max: 20, window: "1 minute" },
    moodle: { publicUrl: "https://www.itech-bs14.de" },
  };

  const app = await createFastifyInstance(config);

  app.get("/test", async () => ({ ok: true }));

  const response = await app.inject({
    method: "GET",
    url: "/test",
    headers: { origin: "http://localhost:8080" },
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.headers["content-security-policy"], "helmet should add CSP header");
  assert.ok(response.headers["access-control-allow-origin"], "cors should add ACAO header");
  assert.ok(response.headers["x-ratelimit-limit"], "rate-limit should add x-ratelimit-limit header");
});

test("rate limit plugin returns German message on 429", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    cors: { origins: false },
    rateLimit: { max: 1, window: "1 minute" },
    moodle: { publicUrl: "" },
  };

  const app = await createFastifyInstance(config);

  app.get("/limited", async () => ({ ok: true }));

  // First request passes
  const first = await app.inject({ method: "GET", url: "/limited" });
  assert.equal(first.statusCode, 200);

  // Second request triggers rate limit
  const second = await app.inject({ method: "GET", url: "/limited" });
  assert.equal(second.statusCode, 429);
  const body = JSON.parse(second.payload);
  assert.equal(body.message, "Zu viele Anfragen. Bitte warte eine Minute.");
});

test("cors rejects disallowed origins", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    cors: { origins: ["https://allowed.example"] },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };

  const app = await createFastifyInstance(config);

  app.get("/cors-test", async () => ({ ok: true }));

  const response = await app.inject({
    method: "GET",
    url: "/cors-test",
    headers: { origin: "https://disallowed.example" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], undefined, "disallowed origin should not receive ACAO");
});

test("cors allows configured origins", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    cors: { origins: ["https://allowed.example"] },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };

  const app = await createFastifyInstance(config);

  app.get("/cors-test", async () => ({ ok: true }));

  const response = await app.inject({
    method: "GET",
    url: "/cors-test",
    headers: { origin: "https://allowed.example" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], "https://allowed.example");
});

test("fastify instance uses request ID header", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    cors: { origins: false },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };

  const app = await createFastifyInstance(config);

  app.get("/req-id", async (request) => ({ id: request.id }));

  const customId = "test-request-123";
  const response = await app.inject({
    method: "GET",
    url: "/req-id",
    headers: { "x-request-id": customId },
  });

  const body = JSON.parse(response.payload);
  assert.equal(body.id, customId, "request id should be taken from x-request-id header");
});

test("fastify instance generates request ID when header is missing", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    cors: { origins: false },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };

  const app = await createFastifyInstance(config);

  app.get("/req-id", async (request) => ({ id: request.id }));

  const response = await app.inject({
    method: "GET",
    url: "/req-id",
  });

  const body = JSON.parse(response.payload);
  assert.equal(typeof body.id, "string");
  assert.ok(body.id.length > 0, "request id should be auto-generated");
});
