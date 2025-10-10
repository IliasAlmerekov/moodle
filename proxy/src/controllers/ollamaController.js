import config from "../config/env.js";
import { getModels } from "../services/ollama.service.js";

export async function getOllamaModels(request, reply) {
  if (!config.ollama.isConfigured) {
    reply.code(503);
    return { status: "error", message: "Ollama is not configured" };
  }

  try {
    const models = await getModels();
    return models;
  } catch (error) {
    request.log.error({ error: error }, "Failed to reach Ollama instance");
    reply.code(502);
    return {
      status: "error",
      message: "Unable to reach Ollama",
      detail: error.message,
    };
  }
}
