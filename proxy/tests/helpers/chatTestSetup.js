import Fastify from "fastify";
import { registerRoutes } from "../../src/frameworks/webserver/routes/index.js";
import { beforeAll, afterAll } from "vitest";
import { createMockChatRepository } from "../fixtures/mockRepositories.js";

let savedEnv;

beforeAll(() => {
  savedEnv = { ...process.env };
  process.env.MOODLE_URL = "https://moodle.example.test";
  process.env.MOODLE_TOKEN = "test-token";
  process.env.OLLAMA_URL = "http://ollama.example.test";
  process.env.OLLAMA_MODEL = "llama-default";
});

afterAll(() => {
  Object.keys(process.env).forEach((k) => delete process.env[k]);
  Object.assign(process.env, savedEnv);
});

export async function importChatController() {
  const moduleUrl = new URL("../../src/adapters/controllers/chatController.js", import.meta.url);
  moduleUrl.searchParams.set("cacheBust", crypto.randomUUID());
  return import(moduleUrl.href);
}

export function createMockChatDeps() {
  return {
    chatRepository: createMockChatRepository(),
    userRepository: {
      async getUserInfo() {
        return { id: 1, firstname: "Test", lastname: "User", email: "test@example.com" };
      },
      async getUserCourses() {
        return [];
      },
    },
    courseRepository: {
      async getAllCourses() {
        return [];
      },
      async getCourseContents() {
        return [];
      },
    },
    llmService: {
      async streamResponse() {
        return new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify({ response: "Hi", done: true })),
            );
            controller.close();
          },
        });
      },
    },
  };
}

export async function buildChatApp() {
  const { createChatController } = await importChatController();
  const app = Fastify({ logger: false });
  const chat = createChatController(createMockChatDeps());
  const controllers = {
    chat,
    history: { async get() {}, async delete() {} },
    moodle: {
      async ping() {},
      async getUserCourses() {},
      async getUser() {},
      async debugCache() {},
    },
    health: { async check() {} },
  };
  await registerRoutes(app, controllers);
  return app;
}
