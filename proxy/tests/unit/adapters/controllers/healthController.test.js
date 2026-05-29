import assert from "node:assert/strict";
import { test } from "vitest";
import { createHealthController } from "../../../../src/adapters/controllers/healthController.js";

function createMockRequest(overrides = {}) {
  const errors = [];
  return {
    log: {
      error(data) { errors.push(data); },
      info() {},
      warn() {},
    },
    _errors: errors,
    ...overrides,
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

function createMockRepositories({ moodleOk = true, ollamaOk = true } = {}) {
  return {
    courseRepository: {
      async getAllCourses() {
        if (!moodleOk) {
          throw Object.assign(new Error("Moodle unreachable"), { statusCode: 502 });
        }
        return [{ id: 1, name: "LF07" }];
      },
    },
    llmService: {
      async listModels() {
        if (!ollamaOk) {
          throw Object.assign(new Error("Ollama unreachable"), { statusCode: 502 });
        }
        return ["llama3.2:3b"];
      },
    },
    version: "0.1.0",
    getUptime: () => 42,
  };
}

test("check returns 200 when all services are healthy", async () => {
  const deps = createMockRepositories();
  const controller = createHealthController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.check(request, reply);

  assert.strictEqual(reply._status, 200);
  assert.strictEqual(reply._sent.status, "ok");
  assert.strictEqual(reply._sent.services.moodle, "ok");
  assert.strictEqual(reply._sent.services.ollama, "ok");
  assert.strictEqual(typeof reply._sent.timestamp, "string");
  assert.strictEqual(reply._sent.uptime, 42);
  assert.strictEqual(reply._sent.version, "0.1.0");
});

test("check returns 503 when moodle is down", async () => {
  const deps = createMockRepositories({ moodleOk: false, ollamaOk: true });
  const controller = createHealthController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.check(request, reply);

  assert.strictEqual(reply._status, 503);
  assert.strictEqual(reply._sent.status, "degraded");
  assert.strictEqual(reply._sent.services.moodle, "error");
  assert.strictEqual(reply._sent.services.ollama, "ok");
});

test("check returns 503 when ollama is down", async () => {
  const deps = createMockRepositories({ moodleOk: true, ollamaOk: false });
  const controller = createHealthController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.check(request, reply);

  assert.strictEqual(reply._status, 503);
  assert.strictEqual(reply._sent.status, "degraded");
  assert.strictEqual(reply._sent.services.moodle, "ok");
  assert.strictEqual(reply._sent.services.ollama, "error");
});

test("check returns 503 when both services are down", async () => {
  const deps = createMockRepositories({ moodleOk: false, ollamaOk: false });
  const controller = createHealthController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.check(request, reply);

  assert.strictEqual(reply._status, 503);
  assert.strictEqual(reply._sent.status, "degraded");
  assert.strictEqual(reply._sent.services.moodle, "error");
  assert.strictEqual(reply._sent.services.ollama, "error");
});

test("check includes cache stats when getCacheStats is provided", async () => {
  const deps = createMockRepositories();
  deps.getCacheStats = () => ({ courses: { hits: 5, misses: 1 } });
  const controller = createHealthController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.check(request, reply);

  assert.strictEqual(reply._status, 200);
  assert.deepStrictEqual(reply._sent.cache, { courses: { hits: 5, misses: 1 } });
});

test("check includes queue metrics when getQueueMetrics is provided", async () => {
  const deps = createMockRepositories();
  deps.getQueueMetrics = () => ({ size: 0, pending: 0, circuitState: "CLOSED" });
  const controller = createHealthController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.check(request, reply);

  assert.strictEqual(reply._status, 200);
  assert.deepStrictEqual(reply._sent.queue, { size: 0, pending: 0, circuitState: "CLOSED" });
});

test("check omits cache and queue when optional deps are missing", async () => {
  const deps = createMockRepositories();
  const controller = createHealthController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.check(request, reply);

  assert.strictEqual(reply._status, 200);
  assert.strictEqual("cache" in reply._sent, false);
  assert.strictEqual("queue" in reply._sent, false);
});

test("check logs error and includes error object when getCacheStats throws", async () => {
  const deps = createMockRepositories();
  deps.getCacheStats = () => {
    throw new Error("stats crash");
  };
  const controller = createHealthController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.check(request, reply);

  assert.strictEqual(reply._status, 200);
  assert.deepStrictEqual(reply._sent.cache, { error: "Failed to retrieve cache stats" });
  assert.strictEqual(request._errors.length, 1);
  assert.strictEqual(request._errors[0].err.message, "stats crash");
});

test("check logs error and includes error object when getQueueMetrics throws", async () => {
  const deps = createMockRepositories();
  deps.getQueueMetrics = () => {
    throw new Error("metrics crash");
  };
  const controller = createHealthController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.check(request, reply);

  assert.strictEqual(reply._status, 200);
  assert.deepStrictEqual(reply._sent.queue, { error: "Failed to retrieve queue metrics" });
  assert.strictEqual(request._errors.length, 1);
  assert.strictEqual(request._errors[0].err.message, "metrics crash");
});

test("check still returns 503 when services fail even if stats providers throw", async () => {
  const deps = createMockRepositories({ moodleOk: false, ollamaOk: false });
  deps.getCacheStats = () => {
    throw new Error("stats crash");
  };
  deps.getQueueMetrics = () => {
    throw new Error("metrics crash");
  };
  const controller = createHealthController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.check(request, reply);

  assert.strictEqual(reply._status, 503);
  assert.strictEqual(reply._sent.status, "degraded");
  assert.deepStrictEqual(reply._sent.cache, { error: "Failed to retrieve cache stats" });
  assert.deepStrictEqual(reply._sent.queue, { error: "Failed to retrieve queue metrics" });
  assert.strictEqual(request._errors.length, 2);
});

test("check uses default version 0.0.0 when version not provided", async () => {
  const deps = createMockRepositories();
  delete deps.version;
  const controller = createHealthController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.check(request, reply);

  assert.strictEqual(reply._status, 200);
  assert.strictEqual(reply._sent.version, "0.0.0");
});

test("check uses default getUptime when not provided", async () => {
  const deps = createMockRepositories();
  delete deps.getUptime;
  const controller = createHealthController(deps);
  const request = createMockRequest();
  const reply = createMockReply();

  await controller.check(request, reply);

  assert.strictEqual(reply._status, 200);
  assert.strictEqual(typeof reply._sent.uptime, "number");
  assert.strictEqual(reply._sent.uptime >= 0, true);
});
