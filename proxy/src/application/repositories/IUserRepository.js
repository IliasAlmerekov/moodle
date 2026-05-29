/**
 * IUserRepository — contract for user data access.
 * Implementations live in frameworks/moodle/.
 */
export const IUserRepository = {
  /**
   * @param {number} userId
   * @returns {Promise<{id: number, firstname: string, lastname: string, email: string}>}
   */
  getUserInfo: async (userId) => {
    throw new Error("Not implemented");
  },

  /**
   * @param {number} userId
   * @returns {Promise<Array<{id: number, name: string, shortname: string}>>}
   */
  getUserCourses: async (userId) => {
    throw new Error("Not implemented");
  },
};
