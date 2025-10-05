import Fastify from "fastify";
import cors from "@fastify/cors";

const {
  MOODLE_URL,
  MOODLE_TOKEN,
  OLLAMA_URL,
  OLLAMA_MODEL,
  NODE_ENV = "production",
} = process.env;

const PORT = Number(process.env.PORT ?? 3000);

const fastify = Fastify({
  logger: {
    level: NODE_ENV === "production" ? "info" : "debug",
  },
});

fastify.register(cors, {
  // For development, you can be permissive. For production, you might want to restrict this.
  origin: "*",
});

const moodleBaseUrl = MOODLE_URL ? MOODLE_URL.replace(/\/$/, "") : "";
const ollamaBaseUrl = OLLAMA_URL ? OLLAMA_URL.replace(/\/$/, "") : "";

const requiredVars = {
  MOODLE_URL,
  MOODLE_TOKEN,
  OLLAMA_URL,
  OLLAMA_MODEL,
};

for (const [key, value] of Object.entries(requiredVars)) {
  if (!value) {
    fastify.log.warn(`${key} is not defined. Some routes may be unavailable.`);
  }
}

/**
 * Send a prompt to the Ollama and get a response.
 * @param {string} prompt - The prompt to send from user.
 * @param {string} model - The Ollama model to use.
 * @returns {Promise<string>} - The response from ollama.
 */
async function callOllama(prompt, model) {
  // check if ollamaBaseUrl is configured
  if (!ollamaBaseUrl) {
    throw new Error("OLLAMA_URL is not configured");
  }

  // construct the url
  const url = `${ollamaBaseUrl}/api/generate`;

  // construct the body
  const body = {
    model: model,
    prompt: prompt,
    stream: false,
  };

  // make the request
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  // check for errors
  if (!response.ok) {
    throw new Error(`Ollama API returned status: ${response.status}`);
  }

  // parse the response
  const data = await response.json();

  // return the response text
  return data.response;
}

/**
 * Send a prompt to the Ollama and get a response.
 * @param {string} prompt - The prompt to send from user.
 * @param {string} model - The Ollama model to use.
 * @returns {Promise<ReadableStream>} - The response stream from ollama.
 */
async function callOllamaStream(prompt, model) {
  if (!ollamaBaseUrl) {
    throw new Error("OLLAMA_URL is not configured");
  }

  const url = `${ollamaBaseUrl}/api/generate`;

  const body = {
    model: model,
    prompt: prompt,
    stream: true,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama API returned status: ${response.status}: ${response.statusText}`
    );
  }

  // return the response body as a stream
  return response.body;
}

fastify.get("/health", async () => ({
  status: "ok",
  moodleConfigured: Boolean(moodleBaseUrl && MOODLE_TOKEN),
  ollamaConfigured: Boolean(ollamaBaseUrl && OLLAMA_MODEL),
}));

fastify.post("/api/chat", async (request, reply) => {
  const { message } = request.body;

  if (!message) {
    reply.code(400);
    return { error: "Message is required" };
  }

  fastify.log.info(`Received message: ${message}`);

  // call the Ollama API
  try {
    const aiResponse = await callOllama(message, OLLAMA_MODEL);
    return { reply: aiResponse };
  } catch (error) {
    // log the error
    request.log.error({ error: error }, "Failed to get response from Ollama");

    // return a 502 Bad Gateway error
    reply.code(502);
    return {
      error: "Unable to reach AI service",
      detail: error.message,
    };
  }
});

// Endpoint for streaming responses from Ollama
fastify.post("/api/chat-stream", async (request, reply) => {
  const { message } = request.body;

  if (!message) {
    reply.code(400);
    return { error: "Message is required" };
  }

  fastify.log.info(`Received streaming message: ${message}`);

  try {
    // Call Ollama to get a response stream
    const ollamaStream = await callOllamaStream(message, OLLAMA_MODEL);

    // Set headers for streaming response (including CORS headers!)
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      // CORS headers - must be added manually for raw responses
      "Access-Control-Allow-Origin": "http://192.168.178.49:8080",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });

    // create a reader to read the stream
    const reader = ollamaStream.getReader();
    const decoder = new TextDecoder();

    // Function to read and forward chunks
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // End of stream
        reply.raw.write("data: [DONE]\n\n");
        reply.raw.end();
        break;
      }

      //decode the chunk
      const chunk = decoder.decode(value, { stream: true });

      // chunk may contain multiple lines, split them
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const json = JSON.parse(line);

          // Send each line as a server-sent event
          if (json.response) {
            reply.raw.write(
              `data: ${JSON.stringify({ text: json.response })}\n\n`
            );
          }

          // if generation is done, send [DONE] event
          if (json.done) {
            reply.raw.write("data: [DONE]\n\n");
            reply.raw.end();
            return;
          }
        } catch (e) {
          fastify.log.warn(`Failed to parse line as JSON: ${line}`);
        }
      }
    }
  } catch (error) {
    request.log.error(
      { error: error },
      "Failed to get streaming response from Ollama"
    );

    if (!reply.sent) {
      reply.code(502);
      return {
        error: "Unable to reach AI service",
        detail: error.message,
      };
    }
  }
});

fastify.get("/moodle/ping", async (request, reply) => {
  if (!moodleBaseUrl) {
    reply.code(503);
    return { status: "error", message: "MOODLE_URL is not configured" };
  }

  try {
    const response = await fetch(moodleBaseUrl, { method: "HEAD" });
    return {
      status: response.ok ? "up" : "degraded",
      httpStatus: response.status,
    };
  } catch (error) {
    request.log.error({ err: error }, "Failed to reach Moodle instance");
    reply.code(502);
    return {
      status: "error",
      message: "Unable to reach Moodle",
      detail: error.message,
    };
  }
});

fastify.get("/ollama/models", async (request, reply) => {
  if (!ollamaBaseUrl) {
    reply.code(503);
    return { status: "error", message: "OLLAMA_URL is not configured" };
  }

  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`);
    if (!response.ok) {
      reply.code(502);
      return {
        status: "error",
        message: "Ollama returned an error",
        httpStatus: response.status,
      };
    }
    const data = await response.json();
    return data;
  } catch (error) {
    request.log.error({ err: error }, "Failed to reach Ollama instance");
    reply.code(502);
    return {
      status: "error",
      message: "Unable to reach Ollama",
      detail: error.message,
    };
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
  } catch (error) {
    fastify.log.error(error, "Failed to start server");
    process.exit(1);
  }
};

start();
