export function createMockCourseRepository(data = {}) {
  const courses = data.courses ?? [];
  const contentsMap = data.contentsMap ?? new Map();

  return {
    async getAllCourses() {
      return courses;
    },

    async getCourseContents(courseId) {
      return contentsMap.get(courseId) ?? [];
    },
  };
}

export function buildMockCourseRepository(courses) {
  return createMockCourseRepository({
    courses,
    contentsMap: new Map(courses.map((c) => [c.id, c.sections ?? []])),
  });
}

export function createMockUserRepository(data = {}) {
  const users = data.users ?? [];
  const userCoursesMap = data.userCoursesMap ?? new Map();

  return {
    async getUserInfo(userId) {
      return users.find((u) => u.id === userId) ?? null;
    },

    async getUserCourses(userId) {
      return userCoursesMap.get(userId) ?? [];
    },
  };
}

export function createMockChatRepository(overrides = {}) {
  return {
    async getHistory(sessionId, limit) {
      if (overrides.getHistory) {
        return overrides.getHistory(sessionId, limit);
      }
      return [];
    },

    async appendMessage(sessionId, userId, role, content) {
      if (overrides.appendMessage) {
        return overrides.appendMessage(sessionId, userId, role, content);
      }
    },

    async clearSession(sessionId) {
      if (overrides.clearSession) {
        return overrides.clearSession(sessionId);
      }
    },
  };
}

export function createMockLLMService(overrides = {}) {
  return {
    async streamResponse(messages, model) {
      if (overrides.streamResponse) {
        return overrides.streamResponse(messages, model);
      }
      return new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(JSON.stringify({ message: { content: "Hi" }, done: true })),
          );
          controller.close();
        },
      });
    },

    async listModels() {
      if (overrides.listModels) {
        return overrides.listModels();
      }
      return ["llama3.2:3b"];
    },
  };
}
