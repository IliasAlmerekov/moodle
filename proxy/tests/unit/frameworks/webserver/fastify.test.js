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

test("static cacheable assets get Cache-Control: public, max-age=86400", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    nodeEnv: "test",
    cors: { origins: false },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };

  const app = await createFastifyInstance(config);

  const response = await app.inject({ method: "GET", url: "/chatbot/chatbot.css" });

  assert.equal(response.statusCode, 200);
  const cc = response.headers["cache-control"];
  assert.ok(cc, "Cache-Control header should be set");
  assert.ok(cc.includes("max-age=86400"), `Expected max-age=86400, got: ${cc}`);
});

test("entrypoint files get Cache-Control: no-cache", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    nodeEnv: "test",
    cors: { origins: false },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };

  const app = await createFastifyInstance(config);

  for (const file of ["/chatbot/index.html", "/chatbot/moodle-embed.html", "/chatbot/chatbot.js"]) {
    const response = await app.inject({ method: "GET", url: file });
    assert.equal(response.statusCode, 200, `${file} should return 200`);
    const cc = response.headers["cache-control"];
    assert.ok(cc, `Cache-Control should be set for ${file}`);
    assert.ok(cc.includes("no-cache"), `Expected no-cache for ${file}, got: ${cc}`);
  }
});

test("chatbot entrypoints use cache-busted script URLs", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    nodeEnv: "test",
    cors: { origins: false },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };

  const app = await createFastifyInstance(config);

  for (const file of ["/chatbot/index.html", "/chatbot/moodle-embed.html"]) {
    const response = await app.inject({ method: "GET", url: file });
    assert.equal(response.statusCode, 200, `${file} should return 200`);
    assert.ok(
      response.body.includes("chatbot.js?v="),
      `${file} should bypass previously cached chatbot.js`,
    );
  }
});

test("chatbot buttons are explicit non-submit buttons", async () => {
  const { createFastifyInstance } = await importFastifyFactory();

  const config = {
    logLevel: "silent",
    nodeEnv: "test",
    cors: { origins: false },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };

  const app = await createFastifyInstance(config);

  for (const file of ["/chatbot/index.html", "/chatbot/moodle-embed.html"]) {
    const response = await app.inject({ method: "GET", url: file });
    assert.equal(response.statusCode, 200, `${file} should return 200`);
    const buttonCount = response.body.match(/<button\b/g)?.length ?? 0;
    const nonSubmitCount = response.body.match(/<button\b[^>]*\btype="button"/g)?.length ?? 0;
    assert.ok(buttonCount > 0, `${file} should contain buttons`);
    assert.equal(nonSubmitCount, buttonCount, `${file} should mark every button type="button"`);
  }
});

test("chatbot.js contains normalizeApiUrl for apiUrl validation", async () => {
  const { createFastifyInstance } = await importFastifyFactory();
  const config = {
    logLevel: "silent",
    nodeEnv: "test",
    cors: { origins: false },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };
  const app = await createFastifyInstance(config);
  const response = await app.inject({ method: "GET", url: "/chatbot/chatbot.js" });
  assert.equal(response.statusCode, 200);
  assert.ok(
    response.body.includes("normalizeApiUrl"),
    "chatbot.js must validate apiUrl via normalizeApiUrl",
  );
  await app.close();
});

test("chatbot.js uses Number.isInteger for userId validation", async () => {
  const { createFastifyInstance } = await importFastifyFactory();
  const config = {
    logLevel: "silent",
    nodeEnv: "test",
    cors: { origins: false },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };
  const app = await createFastifyInstance(config);
  const response = await app.inject({ method: "GET", url: "/chatbot/chatbot.js" });
  assert.equal(response.statusCode, 200);
  assert.ok(
    response.body.includes("Number.isInteger"),
    "chatbot.js must reject non-integer userId values",
  );
  await app.close();
});

test("chatbot.js contains DOM fallback via detectMoodleUser", async () => {
  const { createFastifyInstance } = await importFastifyFactory();
  const config = {
    logLevel: "silent",
    nodeEnv: "test",
    cors: { origins: false },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };
  const app = await createFastifyInstance(config);
  const response = await app.inject({ method: "GET", url: "/chatbot/chatbot.js" });
  assert.equal(response.statusCode, 200);
  assert.ok(
    response.body.includes("detectMoodleUser"),
    "chatbot.js must fall back to DOM detection when CHATBOT_CONFIG.userId is absent",
  );
  assert.ok(
    response.body.includes("CHATBOT_CONFIG"),
    "chatbot.js must read configuration from window.CHATBOT_CONFIG",
  );
  await app.close();
});

test("chatbot.js uses Moodle M.cfg.userid as userId fallback", async () => {
  const { createFastifyInstance } = await importFastifyFactory();
  const config = {
    logLevel: "silent",
    nodeEnv: "test",
    cors: { origins: false },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };
  const app = await createFastifyInstance(config);
  const response = await app.inject({ method: "GET", url: "/chatbot/chatbot.js" });
  assert.equal(response.statusCode, 200);
  assert.ok(
    response.body.includes("M?.cfg?.userid"),
    "chatbot.js must fall back to Moodle's global M.cfg.userid",
  );
  await app.close();
});

test("chatbot.js reports missing Moodle user instead of silently ignoring send", async () => {
  const { createFastifyInstance } = await importFastifyFactory();
  const config = {
    logLevel: "silent",
    nodeEnv: "test",
    cors: { origins: false },
    rateLimit: { max: 100, window: "1 minute" },
    moodle: { publicUrl: "" },
  };
  const app = await createFastifyInstance(config);
  const response = await app.inject({ method: "GET", url: "/chatbot/chatbot.js" });
  assert.equal(response.statusCode, 200);
  assert.ok(
    response.body.includes("Moodle-Benutzer konnte nicht erkannt werden"),
    "chatbot.js must show a visible error when no Moodle user id is available",
  );
  assert.ok(
    !response.body.includes("if (!message || !moodleUser) return;"),
    "chatbot.js must not silently return when moodleUser is missing",
  );
  await app.close();
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
