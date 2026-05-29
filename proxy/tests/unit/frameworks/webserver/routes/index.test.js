import assert from "node:assert/strict";
import { test } from "vitest";
import { registerRoutes } from "../../../../../src/frameworks/webserver/routes/index.js";

function createMockApp() {
  const routes = [];
  const app = {
    get(path, opts, handler) {
      if (typeof opts === "function") {
        routes.push({ method: "GET", path, handler: opts });
      } else {
        routes.push({ method: "GET", path, opts, handler });
      }
    },
    post(path, opts, handler) {
      routes.push({ method: "POST", path, opts, handler });
    },
    delete(path, opts, handler) {
      if (typeof opts === "function") {
        routes.push({ method: "DELETE", path, handler: opts });
      } else {
        routes.push({ method: "DELETE", path, opts, handler });
      }
    },
    _routes: routes,
  };
  return app;
}

function createMockControllers() {
  return {
    health: { check() {} },
    chat: { handleStream() {} },
    history: { get() {}, delete() {} },
    moodle: {
      ping() {},
      getUserCourses() {},
      getUser() {},
      debugCache() {},
    },
  };
}

test("registers exactly 8 routes", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers);

  assert.strictEqual(app._routes.length, 8);
});

test("registers GET /health", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers);

  const route = app._routes.find((r) => r.path === "/health");
  assert.ok(route);
  assert.strictEqual(route.method, "GET");
});

test("registers POST /api/chat-stream with JSON Schema validation", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers);

  const route = app._routes.find((r) => r.path === "/api/chat-stream");
  assert.ok(route);
  assert.strictEqual(route.method, "POST");
  assert.ok(route.opts);
  assert.ok(route.opts.schema);
  assert.deepStrictEqual(route.opts.schema.body, {
    type: "object",
    required: ["message"],
    properties: {
      message: { type: "string", minLength: 1, maxLength: 500 },
      userId: { type: "number" },
      chatId: { type: "string", maxLength: 64, pattern: "^[a-zA-Z0-9_-]+$" },
    },
  });
});

test("registers GET /api/chat-history/:chatId with params schema", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers);

  const route = app._routes.find(
    (r) => r.path === "/api/chat-history/:chatId" && r.method === "GET",
  );
  assert.ok(route);
  assert.ok(route.opts);
  assert.ok(route.opts.schema);
  assert.deepStrictEqual(route.opts.schema.params, {
    type: "object",
    required: ["chatId"],
    properties: {
      chatId: { type: "string", maxLength: 64, pattern: "^[a-zA-Z0-9_-]+$" },
    },
  });
});

test("registers DELETE /api/chat-history/:chatId with params schema", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers);

  const route = app._routes.find(
    (r) => r.path === "/api/chat-history/:chatId" && r.method === "DELETE",
  );
  assert.ok(route);
  assert.ok(route.opts);
  assert.ok(route.opts.schema);
  assert.deepStrictEqual(route.opts.schema.params, {
    type: "object",
    required: ["chatId"],
    properties: {
      chatId: { type: "string", maxLength: 64, pattern: "^[a-zA-Z0-9_-]+$" },
    },
  });
});

test("registers all 4 Moodle routes with params schemas where needed", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers);

  const moodlePaths = [
    "/moodle/ping",
    "/moodle/users/:userId/courses",
    "/moodle/user/:id",
    "/moodle/debug/cache",
  ];

  for (const path of moodlePaths) {
    const route = app._routes.find((r) => r.path === path);
    assert.ok(route, `Expected route ${path} to be registered`);
    assert.strictEqual(route.method, "GET");
  }

  const userCoursesRoute = app._routes.find(
    (r) => r.path === "/moodle/users/:userId/courses",
  );
  assert.ok(userCoursesRoute.opts);
  assert.deepStrictEqual(userCoursesRoute.opts.schema.params, {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer", minimum: 1 },
    },
  });

  const userRoute = app._routes.find((r) => r.path === "/moodle/user/:id");
  assert.ok(userRoute.opts);
  assert.deepStrictEqual(userRoute.opts.schema.params, {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer", minimum: 1 },
    },
  });
});

test("binds controller methods so they can use this", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers);

  const healthRoute = app._routes.find((r) => r.path === "/health");
  assert.notStrictEqual(healthRoute.handler, controllers.health.check);
  assert.strictEqual(typeof healthRoute.handler, "function");
});
