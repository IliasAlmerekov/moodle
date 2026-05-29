/**
 * ICourseRepository — contract for course data access.
 * Implementations live in frameworks/moodle/.
 */
export const ICourseRepository = {
  /**
   * @returns {Promise<Array<{id: number, name: string, shortname: string, summary: string, url: string|null}>>}
   */
  getAllCourses: async () => {
    throw new Error("Not implemented");
  },

  /**
   * @param {number} courseId
   * @returns {Promise<Array<{id: number, name: string, modules: Array<{id: number, name: string, type: string, url: string|null, files: Array<{filename: string, mimetype: string, url: string|null}>}>}>>}
   */
  getCourseContents: async (courseId) => {
    throw new Error("Not implemented");
  },
};
