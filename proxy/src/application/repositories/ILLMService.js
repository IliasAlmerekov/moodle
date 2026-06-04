/**
 * ILLMService — contract for LLM inference.
 * Implementations live in frameworks/llm/.
 */
export const ILLMService = {
  /**
   * Streams an assistant reply for a role-structured conversation.
   *
   * @param {Array<{role: "system"|"user"|"assistant", content: string}>} messages
   * @param {string} [model]
   * @param {AbortSignal} [signal]
   * @returns {Promise<ReadableStream>} NDJSON stream of `{ message: { content }, done }`
   */
  streamResponse: async (messages, model, signal) => {
    throw new Error("Not implemented");
  },

  /**
   * @returns {Promise<string[]>}
   */
  listModels: async () => {
    throw new Error("Not implemented");
  },
};
