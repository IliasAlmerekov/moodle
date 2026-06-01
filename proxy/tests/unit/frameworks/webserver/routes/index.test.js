import assert from "node:assert/strict";
import { test } from "vitest";
import { registerRoutes } from "../../../../../src/frameworks/webserver/routes/index.js";
import { createFastifyInstance } from "../../../../../src/frameworks/webserver/fastify.js";

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

  await registerRoutes(app, controllers, { allowUnauthenticated: true });

  assert.strictEqual(app._routes.length, 8);
});

test("registers GET /health", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers, { allowUnauthenticated: true });

  const route = app._routes.find((r) => r.path === "/health");
  assert.ok(route);
  assert.strictEqual(route.method, "GET");
});

test("registers POST /api/chat-stream with JSON Schema validation", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers, { allowUnauthenticated: true });

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
      ts: { type: "number" },
      sig: { type: "string", maxLength: 128, pattern: "^[a-f0-9]+$" },
    },
  });
});

test("registers GET /api/chat-history/:chatId with params schema", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers, { allowUnauthenticated: true });

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

  await registerRoutes(app, controllers, { allowUnauthenticated: true });

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

  await registerRoutes(app, controllers, { allowUnauthenticated: true });

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

  const userCoursesRoute = app._routes.find((r) => r.path === "/moodle/users/:userId/courses");
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

  await registerRoutes(app, controllers, { allowUnauthenticated: true });

  const healthRoute = app._routes.find((r) => r.path === "/health");
  assert.notStrictEqual(healthRoute.handler, controllers.health.check);
  assert.strictEqual(typeof healthRoute.handler, "function");
});

test("registers POST /api/chat-stream with preHandler when verifyMoodleUser is provided", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();
  const mockPreHandler = async () => {};

  await registerRoutes(app, controllers, {
    verifyMoodleUser: mockPreHandler,
    allowUnauthenticated: true,
  });

  const route = app._routes.find((r) => r.path === "/api/chat-stream");
  assert.ok(route);
  assert.ok(route.opts);
  assert.deepStrictEqual(route.opts.preHandler, [mockPreHandler]);
});

test("registers POST /api/chat-stream without preHandler when verifyMoodleUser is omitted", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers, { allowUnauthenticated: true });

  const route = app._routes.find((r) => r.path === "/api/chat-stream");
  assert.ok(route);
  assert.ok(route.opts);
  assert.ok(!("preHandler" in route.opts));
});

test("POST /api/chat-stream route has compress: false to skip SSE compression", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers, { allowUnauthenticated: true });

  const route = app._routes.find((r) => r.path === "/api/chat-stream");
  assert.ok(route);
  assert.strictEqual(route.opts?.config?.compress, false);
});

test("registers POST /admin/cache/invalidate when invalidateCourseCache is provided", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers, {
    invalidateCourseCache: () => {},
    allowUnauthenticated: true,
  });

  const route = app._routes.find((r) => r.path === "/admin/cache/invalidate");
  assert.ok(route, "invalidate route should be registered");
  assert.strictEqual(route.method, "POST");
});

test("does not register /admin/cache/invalidate when invalidateCourseCache is omitted", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await registerRoutes(app, controllers, { allowUnauthenticated: true });

  const route = app._routes.find((r) => r.path === "/admin/cache/invalidate");
  assert.ok(!route, "invalidate route should not be registered without handler");
});

const BASE_CONFIG = {
  logLevel: "silent",
  nodeEnv: "test",
  cors: { origins: false },
  rateLimit: { max: 100, window: "1 minute" },
  moodle: { publicUrl: "" },
};

test("POST /admin/cache/invalidate allows 127.0.0.1", async () => {
  const app = await createFastifyInstance(BASE_CONFIG);
  let called = false;
  await registerRoutes(app, createMockControllers(), {
    invalidateCourseCache: () => {
      called = true;
    },
    allowUnauthenticated: true,
  });

  const res = await app.inject({
    method: "POST",
    url: "/admin/cache/invalidate",
    remoteAddress: "127.0.0.1",
  });

  assert.equal(res.statusCode, 200);
  assert.ok(called, "invalidateCourseCache should have been called");
});

test("POST /admin/cache/invalidate allows ::ffff:127.0.0.1", async () => {
  const app = await createFastifyInstance(BASE_CONFIG);
  await registerRoutes(app, createMockControllers(), {
    invalidateCourseCache: () => {},
    allowUnauthenticated: true,
  });

  const res = await app.inject({
    method: "POST",
    url: "/admin/cache/invalidate",
    remoteAddress: "::ffff:127.0.0.1",
  });

  assert.equal(res.statusCode, 200);
});

test("POST /admin/cache/invalidate denies non-localhost IPs", async () => {
  const app = await createFastifyInstance(BASE_CONFIG);
  await registerRoutes(app, createMockControllers(), {
    invalidateCourseCache: () => {},
    allowUnauthenticated: true,
  });

  const res = await app.inject({
    method: "POST",
    url: "/admin/cache/invalidate",
    remoteAddress: "192.168.1.100",
  });

  assert.equal(res.statusCode, 403);
});

test("throws (fails closed) when auth handlers are missing and no opt-out is given", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await assert.rejects(
    () => registerRoutes(app, controllers),
    /requires verifyMoodleUser and verifyChatOwnership/,
  );
});

test("throws when only verifyMoodleUser is provided without opt-out", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();

  await assert.rejects(
    () => registerRoutes(app, controllers, { verifyMoodleUser: async () => {} }),
    /requires verifyMoodleUser and verifyChatOwnership/,
  );
});

test("attaches both auth preHandlers to chat-history when fully wired", async () => {
  const app = createMockApp();
  const controllers = createMockControllers();
  const verifyMoodleUser = async () => {};
  const verifyChatOwnership = async () => {};

  await registerRoutes(app, controllers, { verifyMoodleUser, verifyChatOwnership });

  for (const method of ["GET", "DELETE"]) {
    const route = app._routes.find(
      (r) => r.path === "/api/chat-history/:chatId" && r.method === method,
    );
    assert.ok(route, `${method} chat-history route should be registered`);
    assert.deepStrictEqual(route.opts.preHandler, [verifyMoodleUser, verifyChatOwnership]);
  }
});
