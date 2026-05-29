import assert from "node:assert/strict";
import { test } from "vitest";

async function importOllamaClient() {
  process.env.MOODLE_URL = "https://moodle.example.test";
  process.env.MOODLE_TOKEN = "test-token";
  process.env.OLLAMA_URL = "http://ollama.example.test";
  process.env.OLLAMA_MODEL = "llama-default";
  process.env.OLLAMA_TIMEOUT_MS = "25";

  const moduleUrl = new URL("../../../../src/frameworks/llm/ollamaClient.js", import.meta.url);
  moduleUrl.searchParams.set("cacheBust", crypto.randomUUID());
  return import(moduleUrl.href);
}

test("ollamaClient enqueues streamResponse calls through Ollama queue", async () => {
  const body = new ReadableStream();
  let enqueueCalls = 0;
  let fetchCalls = 0;
  const enqueueOllamaRequest = async (fn) => {
    enqueueCalls += 1;
    return fn();
  };
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response(body, { status: 200 });
  };

  const { createOllamaClient } = await importOllamaClient();
  const client = createOllamaClient({
    baseUrl: "http://ollama.example.test",
    defaultModel: "llama-default",
    timeoutMs: 1_000,
    fetchImpl,
    enqueueOllamaRequest,
  });

  assert.equal(await client.streamResponse("Hallo"), body);
  assert.equal(enqueueCalls, 1);
  assert.equal(fetchCalls, 1);
});
