/**
 * ILLMService — contract for LLM inference.
 * Implementations live in frameworks/llm/.
 */
export const ILLMService = {
  /**
   * @param {string} prompt
   * @param {string} model
   * @returns {Promise<ReadableStream>}
   */
  streamResponse: async (prompt, model) => {
    throw new Error("Not implemented");
  },

  /**
   * @returns {Promise<string[]>}
   */
  listModels: async () => {
    throw new Error("Not implemented");
  },
};
