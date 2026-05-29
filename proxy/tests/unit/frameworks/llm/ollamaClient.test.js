import assert from "node:assert/strict";
import test from "node:test";

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

test("ollamaClient streams generated responses through /api/generate", async () => {
  const body = new ReadableStream();
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(body, { status: 200 });
  };

  const { createOllamaClient } = await importOllamaClient();
  const client = createOllamaClient({
    baseUrl: "http://ollama.example.test",
    defaultModel: "llama-default",
    timeoutMs: 1_000,
    fetchImpl,
  });

  const stream = await client.streamResponse("Hallo", "llama-custom");

  assert.equal(stream, body);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://ollama.example.test/api/generate");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    model: "llama-custom",
    prompt: "Hallo",
    stream: true,
  });
  assert.equal(requests[0].options.signal instanceof AbortSignal, true);
});

test("ollamaClient lists model names from /api/tags", async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, "http://ollama.example.test/api/tags");
    return new Response(
      JSON.stringify({
        models: [{ name: "llama3.2:3b" }, { name: "mistral" }, { digest: "ignored" }],
      }),
      { status: 200 }
    );
  };

  const { createOllamaClient } = await importOllamaClient();
  const client = createOllamaClient({
    baseUrl: "http://ollama.example.test",
    defaultModel: "llama-default",
    timeoutMs: 1_000,
    fetchImpl,
  });

  const models = await client.listModels();

  assert.deepEqual(models, ["llama3.2:3b", "mistral"]);
});

test("ollamaClient throws statusCode 502 when Ollama returns non-200", async () => {
  const fetchImpl = async () => new Response("nope", { status: 503, statusText: "Unavailable" });

  const { createOllamaClient } = await importOllamaClient();
  const client = createOllamaClient({
    baseUrl: "http://ollama.example.test",
    defaultModel: "llama-default",
    timeoutMs: 1_000,
    fetchImpl,
  });

  await assert.rejects(() => client.streamResponse("Hallo"), {
    message: "Ollama API error: 503 Unavailable",
    statusCode: 502,
  });
});

test("ollamaClient aborts slow requests after configured timeout", async () => {
  const fetchImpl = async (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });

  const { createOllamaClient } = await importOllamaClient();
  const client = createOllamaClient({
    baseUrl: "http://ollama.example.test",
    defaultModel: "llama-default",
    timeoutMs: 1,
    fetchImpl,
  });

  await assert.rejects(() => client.listModels(), {
    message: "Ollama request timed out",
    statusCode: 502,
  });
});
