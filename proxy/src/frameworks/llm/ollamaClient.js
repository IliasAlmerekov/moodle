import config from "../../config/env.js";
import { enqueueOllamaRequest as defaultEnqueueOllamaRequest } from "./ollamaQueue.js";

function createOllamaError(message, details = {}) {
  return Object.assign(new Error(message), {
    statusCode: 502,
    ...details,
  });
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let onAbort;
  if (signal) {
    onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createOllamaError("Ollama request timed out", { cause: error });
    }

    throw createOllamaError("Ollama request failed", { cause: error });
  } finally {
    clearTimeout(timeout);
    if (signal && onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

async function assertOk(response) {
  if (response.ok) return;

  throw createOllamaError(`Ollama API error: ${response.status} ${response.statusText}`, {
    ollamaStatus: response.status,
  });
}

function normalizeModelNames(data) {
  return (data?.models ?? []).map((model) => model.name).filter(Boolean);
}

export function createOllamaClient({
  baseUrl = config.ollama.url,
  defaultModel = config.ollama.model,
  timeoutMs = config.ollama.timeoutMs,
  fetchImpl = fetch,
  enqueueOllamaRequest = defaultEnqueueOllamaRequest,
} = {}) {
  return {
    async streamResponse(prompt, model, signal) {
      return enqueueOllamaRequest(async () => {
        const response = await fetchWithTimeout(
          fetchImpl,
          `${baseUrl}/api/generate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model || defaultModel,
              prompt,
              stream: true,
            }),
          },
          timeoutMs,
          signal
        );

        await assertOk(response);
        return response.body;
      });
    },

    async listModels() {
      const response = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/api/tags`,
        {
          method: "GET",
        },
        timeoutMs
      );

      await assertOk(response);
      return normalizeModelNames(await response.json());
    },
  };
}

export const ollamaClient = createOllamaClient();
