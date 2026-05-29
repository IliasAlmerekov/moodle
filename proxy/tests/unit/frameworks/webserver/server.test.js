import assert from "node:assert/strict";
import test from "node:test";

async function importServerModule() {
  process.env.MOODLE_URL = "https://moodle.example.test";
  process.env.MOODLE_TOKEN = "test-token";
  process.env.OLLAMA_URL = "http://ollama.example.test";
  process.env.OLLAMA_MODEL = "llama-default";

  const moduleUrl = new URL("../../../../src/frameworks/webserver/server.js", import.meta.url);
  moduleUrl.searchParams.set("cacheBust", crypto.randomUUID());
  return import(moduleUrl.href);
}

function createMockApp(overrides = {}) {
  return {
    listen: overrides.listen || (async () => {}),
    close: overrides.close || (async () => {}),
    log: {
      info: overrides.logInfo || (() => {}),
      error: overrides.logError || (() => {}),
    },
  };
}

function createMockProcess() {
  const listeners = [];
  return {
    on(signal, handler) {
      listeners.push({ signal, handler });
    },
    exit(code) {
      this.exitCode = code;
    },
    _listeners: listeners,
  };
}

test("listens on configured port and host", async () => {
  let listenOpts = null;
  const mockApp = createMockApp({
    listen: async (opts) => {
      listenOpts = opts;
    },
  });

  const { startServer } = await importServerModule();
  await startServer(() => mockApp, { process: createMockProcess() });

  assert.strictEqual(listenOpts.host, "0.0.0.0");
  assert.strictEqual(typeof listenOpts.port, "number");
});

test("logs server start", async () => {
  let logged = null;
  const mockApp = createMockApp({
    logInfo: (msg) => {
      logged = msg;
    },
  });

  const { startServer } = await importServerModule();
  await startServer(() => mockApp, { process: createMockProcess() });

  assert.ok(logged.includes("Server listening"));
});

test("exits with code 1 when createApp fails", async () => {
  const mockProcess = createMockProcess();

  const { startServer } = await importServerModule();
  await startServer(
    () => {
      throw new Error("createApp failed");
    },
    { process: mockProcess },
  );

  assert.strictEqual(mockProcess.exitCode, 1);
});

test("exits with code 1 when listen fails", async () => {
  const mockProcess = createMockProcess();
  const mockApp = createMockApp({
    listen: async () => {
      throw new Error("bind failed");
    },
  });

  const { startServer } = await importServerModule();
  await startServer(() => mockApp, { process: mockProcess });

  assert.strictEqual(mockProcess.exitCode, 1);
});

test("registers SIGTERM and SIGINT handlers", async () => {
  const mockProcess = createMockProcess();

  const { startServer } = await importServerModule();
  await startServer(() => createMockApp(), { process: mockProcess });

  const signals = mockProcess._listeners.map((l) => l.signal);
  assert.ok(signals.includes("SIGTERM"));
  assert.ok(signals.includes("SIGINT"));
});
