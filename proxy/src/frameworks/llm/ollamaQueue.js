import PQueue from "p-queue";
import config from "../../config/env.js";

const CLOSED = "CLOSED";
const OPEN = "OPEN";
const HALF_OPEN = "HALF_OPEN";

function createQueueError(message) {
  return Object.assign(new Error(message), { statusCode: 503 });
}

export function createOllamaQueue({
  concurrency = config.ollama.concurrency,
  maxQueue = config.ollama.maxQueue,
  circuitThreshold = 5,
  circuitOpenMs = 30_000,
  now = Date.now,
} = {}) {
  const queue = new PQueue({ concurrency });
  let circuitState = CLOSED;
  let consecutiveFailures = 0;
  let openedAt = 0;

  function refreshCircuitState() {
    if (circuitState === OPEN && now() - openedAt >= circuitOpenMs) {
      circuitState = HALF_OPEN;
    }
  }

  function assertCanRun() {
    refreshCircuitState();

    if (circuitState === OPEN) {
      throw createQueueError("Ollama circuit breaker is open");
    }

    if (queue.size >= maxQueue) {
      throw createQueueError("Ollama queue is full");
    }
  }

  function recordSuccess() {
    consecutiveFailures = 0;
    circuitState = CLOSED;
    openedAt = 0;
  }

  function recordFailure() {
    consecutiveFailures += 1;
    if (consecutiveFailures >= circuitThreshold || circuitState === HALF_OPEN) {
      circuitState = OPEN;
      openedAt = now();
    }
  }

  async function enqueueOllamaRequest(fn) {
    assertCanRun();

    return queue.add(async () => {
      try {
        const result = await fn();
        recordSuccess();
        return result;
      } catch (error) {
        recordFailure();
        throw error;
      }
    });
  }

  return {
    enqueueOllamaRequest,

    get queueMetrics() {
      refreshCircuitState();
      return {
        get size() {
          return queue.size;
        },
        get pending() {
          return queue.pending;
        },
        get circuitState() {
          return circuitState;
        },
        get consecutiveFailures() {
          return consecutiveFailures;
        },
      };
    },
  };
}

const defaultQueue = createOllamaQueue();

export const enqueueOllamaRequest = defaultQueue.enqueueOllamaRequest;
export const queueMetrics = defaultQueue.queueMetrics;
