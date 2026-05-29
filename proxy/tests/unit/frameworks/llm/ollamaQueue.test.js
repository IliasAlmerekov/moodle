import assert from "node:assert/strict";
import { test } from "vitest";

async function importOllamaQueue() {
  process.env.MOODLE_URL = "https://moodle.example.test";
  process.env.MOODLE_TOKEN = "test-token";
  process.env.OLLAMA_URL = "http://ollama.example.test";
  process.env.OLLAMA_MODEL = "llama-default";

  const moduleUrl = new URL("../../../../src/frameworks/llm/ollamaQueue.js", import.meta.url);
  moduleUrl.searchParams.set("cacheBust", crypto.randomUUID());
  return import(moduleUrl.href);
}

test("ollamaQueue rejects requests when queued work reaches maxQueue", async () => {
  const { createOllamaQueue } = await importOllamaQueue();
  const queue = createOllamaQueue({ concurrency: 1, maxQueue: 1 });
  let releaseFirst;

  const first = queue.enqueueOllamaRequest(
    () =>
      new Promise((resolve) => {
        releaseFirst = resolve;
      }),
  );
  const second = queue.enqueueOllamaRequest(() => "queued");

  await assert.rejects(() => queue.enqueueOllamaRequest(() => "rejected"), {
    message: "Ollama queue is full",
    statusCode: 503,
  });
  assert.equal(queue.queueMetrics.pending, 1);
  assert.equal(queue.queueMetrics.size, 1);

  releaseFirst("first");
  assert.equal(await first, "first");
  assert.equal(await second, "queued");
});

test("ollamaQueue opens circuit after five consecutive failures", async () => {
  const { createOllamaQueue } = await importOllamaQueue();
  let now = 1_000;
  let calls = 0;
  const queue = createOllamaQueue({
    concurrency: 1,
    maxQueue: 10,
    circuitThreshold: 5,
    circuitOpenMs: 30_000,
    now: () => now,
  });

  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(() =>
      queue.enqueueOllamaRequest(async () => {
        calls += 1;
        throw new Error("ollama failed");
      }),
    );
  }

  await assert.rejects(() => queue.enqueueOllamaRequest(() => "blocked"), {
    message: "Ollama circuit breaker is open",
    statusCode: 503,
  });
  assert.equal(calls, 5);
  assert.equal(queue.queueMetrics.circuitState, "OPEN");

  now += 30_001;
  assert.equal(await queue.enqueueOllamaRequest(() => "recovered"), "recovered");
  assert.equal(queue.queueMetrics.circuitState, "CLOSED");
});

test("ollamaQueue resets consecutive failure count after a success", async () => {
  const { createOllamaQueue } = await importOllamaQueue();
  const queue = createOllamaQueue({ concurrency: 1, maxQueue: 10, circuitThreshold: 5 });

  for (let i = 0; i < 4; i += 1) {
    await assert.rejects(() => queue.enqueueOllamaRequest(() => Promise.reject(new Error("fail"))));
  }

  assert.equal(await queue.enqueueOllamaRequest(() => "ok"), "ok");

  for (let i = 0; i < 4; i += 1) {
    await assert.rejects(() => queue.enqueueOllamaRequest(() => Promise.reject(new Error("fail"))));
  }

  assert.equal(queue.queueMetrics.circuitState, "CLOSED");
});
