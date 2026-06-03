import assert from "node:assert/strict";
import { test } from "vitest";
import { createMoodleController } from "../../../../src/adapters/controllers/moodleController.js";

function createMockRequest(overrides = {}) {
  const errors = [];
  return {
    params: overrides.params ?? {},
    log: {
      error(data) {
        errors.push(data);
      },
      info() {},
      warn() {},
    },
    _errors: errors,
  };
}

function createMockReply() {
  return {
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
}

function createMockRepositories() {
  return {
    userRepository: {
      async getUserInfo(userId) {
        return { id: userId, firstname: "Test", lastname: "User", email: "test@example.com" };
      },
      async getUserCourses() {
        return [{ id: 1, name: "LF07", shortname: "lf07" }];
      },
    },
  };
}

test("ping returns ok", async () => {
  const deps = createMockRepositories();
  const controller = createMoodleController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.ping(request, reply);

  assert.strictEqual(reply._status, null);
  assert.strictEqual(reply._sent.status, "ok");
});

test("getUserCourses returns courses for valid userId", async () => {
  const deps = createMockRepositories();
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: { userId: "42" } });
  const reply = createMockReply();

  await controller.getUserCourses(request, reply);

  assert.strictEqual(reply._status, null);
  assert.strictEqual(reply._sent.status, "ok");
  assert.strictEqual(reply._sent.userId, 42);
  assert.strictEqual(reply._sent.courses.length, 1);
  assert.strictEqual(reply._sent.courses[0].name, "LF07");
});

test("getUserCourses returns 400 for missing userId", async () => {
  const deps = createMockRepositories();
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: {} });
  const reply = createMockReply();

  await controller.getUserCourses(request, reply);

  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.error, "Invalid user ID");
});

test("getUserCourses returns 400 for non-numeric userId", async () => {
  const deps = createMockRepositories();
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: { userId: "abc" } });
  const reply = createMockReply();

  await controller.getUserCourses(request, reply);

  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.error, "Invalid user ID");
});

test("getUserCourses returns 400 for zero userId", async () => {
  const deps = createMockRepositories();
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: { userId: "0" } });
  const reply = createMockReply();

  await controller.getUserCourses(request, reply);

  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.error, "Invalid user ID");
});

test("getUserCourses returns 400 for negative userId", async () => {
  const deps = createMockRepositories();
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: { userId: "-1" } });
  const reply = createMockReply();

  await controller.getUserCourses(request, reply);

  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.error, "Invalid user ID");
});

test("getUserCourses proxies err.statusCode when repository throws with statusCode", async () => {
  const deps = createMockRepositories();
  deps.userRepository = {
    async getUserCourses() {
      throw Object.assign(new Error("Moodle unreachable"), { statusCode: 502 });
    },
  };
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: { userId: "1" } });
  const reply = createMockReply();

  await controller.getUserCourses(request, reply);

  assert.strictEqual(reply._status, 502);
  assert.strictEqual(reply._sent.error, "Failed to retrieve user courses");
  assert.strictEqual(request._errors.length, 1);
  assert.strictEqual(request._errors[0].err.message, "Moodle unreachable");
});

test("getUserCourses returns 500 and logs error when repository throws without statusCode", async () => {
  const deps = createMockRepositories();
  deps.userRepository = {
    async getUserCourses() {
      throw new Error("Moodle down");
    },
  };
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: { userId: "1" } });
  const reply = createMockReply();

  await controller.getUserCourses(request, reply);

  assert.strictEqual(reply._status, 500);
  assert.strictEqual(reply._sent.error, "Failed to retrieve user courses");
  assert.strictEqual(request._errors.length, 1);
  assert.strictEqual(request._errors[0].err.message, "Moodle down");
});

test("getUser returns user info for valid id", async () => {
  const deps = createMockRepositories();
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: { id: "7" } });
  const reply = createMockReply();

  await controller.getUser(request, reply);

  assert.strictEqual(reply._status, null);
  assert.strictEqual(reply._sent.status, "ok");
  assert.strictEqual(reply._sent.userId, 7);
  assert.strictEqual(reply._sent.firstname, "Test");
  assert.strictEqual(reply._sent.lastname, "User");
  assert.strictEqual(reply._sent.fullname, "Test User");
  assert.strictEqual(reply._sent.email, "test@example.com");
});

test("getUser returns fallback fullname when names are empty", async () => {
  const deps = createMockRepositories();
  deps.userRepository = {
    async getUserInfo(userId) {
      return { id: userId, firstname: "", lastname: "", email: "anon@example.com" };
    },
    async getUserCourses() {
      return [];
    },
  };
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: { id: "99" } });
  const reply = createMockReply();

  await controller.getUser(request, reply);

  assert.strictEqual(reply._sent.fullname, "Student");
});

test("getUser returns 400 for missing id", async () => {
  const deps = createMockRepositories();
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: {} });
  const reply = createMockReply();

  await controller.getUser(request, reply);

  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.error, "Invalid user ID");
});

test("getUser returns 400 for non-numeric id", async () => {
  const deps = createMockRepositories();
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: { id: "xyz" } });
  const reply = createMockReply();

  await controller.getUser(request, reply);

  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.error, "Invalid user ID");
});

test("getUser returns 404 when userRepository returns null", async () => {
  const deps = createMockRepositories();
  deps.userRepository = {
    async getUserInfo() {
      return null;
    },
    async getUserCourses() {
      return [];
    },
  };
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: { id: "1" } });
  const reply = createMockReply();

  await controller.getUser(request, reply);

  assert.strictEqual(reply._status, 404);
  assert.strictEqual(reply._sent.error, "User not found");
});

test("getUser proxies err.statusCode when repository throws with statusCode", async () => {
  const deps = createMockRepositories();
  deps.userRepository = {
    async getUserInfo() {
      throw Object.assign(new Error("Moodle unreachable"), { statusCode: 502 });
    },
    async getUserCourses() {
      return [];
    },
  };
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: { id: "1" } });
  const reply = createMockReply();

  await controller.getUser(request, reply);

  assert.strictEqual(reply._status, 502);
  assert.strictEqual(reply._sent.error, "Failed to retrieve user info");
  assert.strictEqual(request._errors.length, 1);
  assert.strictEqual(request._errors[0].err.message, "Moodle unreachable");
});

test("getUser returns 500 and logs error when repository throws without statusCode", async () => {
  const deps = createMockRepositories();
  deps.userRepository = {
    async getUserInfo() {
      throw new Error("Moodle down");
    },
    async getUserCourses() {
      return [];
    },
  };
  const controller = createMoodleController(deps);
  const request = createMockRequest({ params: { id: "1" } });
  const reply = createMockReply();

  await controller.getUser(request, reply);

  assert.strictEqual(reply._status, 500);
  assert.strictEqual(reply._sent.error, "Failed to retrieve user info");
  assert.strictEqual(request._errors.length, 1);
  assert.strictEqual(request._errors[0].err.message, "Moodle down");
});

test("getUserCourses returns 404 in production", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const deps = createMockRepositories();
    const controller = createMoodleController(deps);
    const request = createMockRequest({ params: { userId: "42" } });
    const reply = createMockReply();

    await controller.getUserCourses(request, reply);

    assert.strictEqual(reply._status, 404);
    assert.strictEqual(reply._sent.error, "Not found");
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("getUser returns 404 in production", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const deps = createMockRepositories();
    const controller = createMoodleController(deps);
    const request = createMockRequest({ params: { id: "7" } });
    const reply = createMockReply();

    await controller.getUser(request, reply);

    assert.strictEqual(reply._status, 404);
    assert.strictEqual(reply._sent.error, "Not found");
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("debugCache returns stats in non-production when getCacheStats provided", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const deps = createMockRepositories();
    deps.getCacheStats = () => ({ courses: { hits: 5, misses: 1 } });
    const controller = createMoodleController(deps);
    const request = createMockRequest();
    const reply = createMockReply();

    await controller.debugCache(request, reply);

    assert.strictEqual(reply._status, null);
    assert.strictEqual(reply._sent.status, "ok");
    assert.deepStrictEqual(reply._sent.cache, { courses: { hits: 5, misses: 1 } });
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("debugCache returns 404 in production", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const deps = createMockRepositories();
    deps.getCacheStats = () => ({ courses: { hits: 5 } });
    const controller = createMoodleController(deps);
    const request = createMockRequest();
    const reply = createMockReply();

    await controller.debugCache(request, reply);

    assert.strictEqual(reply._status, 404);
    assert.strictEqual(reply._sent.error, "Not found");
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("debugCache returns 404 when getCacheStats not provided", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const deps = createMockRepositories();
    const controller = createMoodleController(deps);
    const request = createMockRequest();
    const reply = createMockReply();

    await controller.debugCache(request, reply);

    assert.strictEqual(reply._status, 404);
    assert.strictEqual(reply._sent.error, "Cache stats not available");
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("debugCache returns 500 when getCacheStats throws", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const deps = createMockRepositories();
    deps.getCacheStats = () => {
      throw new Error("stats error");
    };
    const controller = createMoodleController(deps);
    const request = createMockRequest();
    const reply = createMockReply();

    await controller.debugCache(request, reply);

    assert.strictEqual(reply._status, 500);
    assert.strictEqual(reply._sent.error, "Failed to retrieve cache stats");
    assert.strictEqual(request._errors.length, 1);
    assert.strictEqual(request._errors[0].err.message, "stats error");
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});
