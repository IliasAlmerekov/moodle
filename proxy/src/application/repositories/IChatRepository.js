/**
 * IChatRepository — contract for chat history persistence.
 * Implementations live in frameworks/persistence/.
 */
export const IChatRepository = {
  /**
   * @param {string} sessionId
   * @param {number} limit
   * @returns {Promise<Array<{role: string, content: string, timestamp: number}>>}
   */
  getHistory: async (sessionId, limit) => {
    throw new Error("Not implemented");
  },

  /**
   * @param {string} sessionId
   * @param {number} userId
   * @param {string} role
   * @param {string} content
   * @returns {Promise<void>}
   */
  appendMessage: async (sessionId, userId, role, content) => {
    throw new Error("Not implemented");
  },

  /**
   * @param {string} sessionId
   * @returns {Promise<void>}
   */
  clearSession: async (sessionId) => {
    throw new Error("Not implemented");
  },
};
