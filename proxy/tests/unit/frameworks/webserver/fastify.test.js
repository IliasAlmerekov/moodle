import assert from "node:assert/strict";
import { test } from "vitest";

async function importFastifyFactory() {
  const moduleUrl = new URL("../../../../src/frameworks/webserver/fastify.js", import.meta.url);
  moduleUrl.searchParams.set("cacheBust", crypto.randomUUID());
  return import(moduleUrl.href);
}

test("createFastifyInstance returns a configured Fastify app", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    nodeEnv: "test",
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
    nodeEnv: "test",
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
  const csp = response.headers["content-security-policy"];
  assert.ok(csp, "helmet should add CSP header");
  assert.ok(
    csp.includes("https://www.itech-bs14.de"),
    "CSP connect-src should include Moodle origin",
  );
  assert.equal(
    response.headers["x-frame-options"],
    "SAMEORIGIN",
    "helmet should allow same-origin iframe",
  );
  assert.ok(response.headers["access-control-allow-origin"], "cors should add ACAO header");
  assert.ok(
    response.headers["x-ratelimit-limit"],
    "rate-limit should add x-ratelimit-limit header",
  );
});

test("CSP connect-src excludes external domains when publicUrl is empty", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    nodeEnv: "test",
    cors: { origins: false },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };

  const app = await createFastifyInstance(config);

  app.get("/csp-test", async () => ({ ok: true }));

  const response = await app.inject({ method: "GET", url: "/csp-test" });

  assert.equal(response.statusCode, 200);
  const csp = response.headers["content-security-policy"];
  assert.ok(csp, "helmet should add CSP header");
  assert.ok(csp.includes("connect-src 'self'"), "CSP connect-src should only contain 'self'");
  assert.ok(
    !csp.includes("https://"),
    "CSP connect-src should not contain any HTTPS origin when publicUrl is empty",
  );
});

test("rate limit plugin returns German message on 429", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    nodeEnv: "test",
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
    nodeEnv: "test",
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
  assert.equal(
    response.headers["access-control-allow-origin"],
    undefined,
    "disallowed origin should not receive ACAO",
  );
});

test("cors allows configured origins", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    nodeEnv: "test",
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
    nodeEnv: "test",
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
    nodeEnv: "test",
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
