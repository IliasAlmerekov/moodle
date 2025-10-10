import config from "../config/env.js";

// function to get models

export const getModels = async () => {
  if (!config.ollama.url) {
    throw new Error("Ollama is not configured");
  }

  const response = await fetch(`${config.ollama.url}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama returned an error: ${response.status}`);
  }

  return response.json();
};

// streaming version
/**
 * Send a prompt to the Ollama and get a response.
 * @param {string} prompt - The prompt to send from user.
 * @param {string} model - The model to use (optional, defaults to config.ollama.model).
 * @returns {Promise<ReadableStream>} - The response stream from ollama.
 */

export const callOllamaStream = async (prompt, model) => {
  if (!config.ollama.url) {
    throw new Error("OLLAMA_URL is not configured");
  }

  const url = `${config.ollama.url}/api/generate`;

  const body = {
    model: model || config.ollama.model,
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
};
