import assert from "node:assert/strict";
import { test } from "vitest";
import { streamChat } from "../../../src/application/useCases/chat/streamChat.js";

// LLM mock: yields a single NDJSON line with `done: true` so streamChat's outer
// loop exits immediately without writing any assistant reply.
function makeDoneStream() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"done":true}\n'));
      controller.close();
    },
  });
}

function makeNoopAppendMessage() {
  return async () => {};
}

function makeNoopGetHistory() {
  return async () => [];
}

function makeLlmService() {
  return {
    streamResponse: async () => makeDoneStream(),
  };
}

function makeChatRepository() {
  return {
    getHistory: makeNoopGetHistory(),
    appendMessage: makeNoopAppendMessage(),
    clearSession: async () => {},
  };
}

function makeTrackingChatRepository() {
  const appended = [];
  return {
    appended,
    getHistory: async () => [],
    appendMessage: async (...args) => {
      appended.push(args);
    },
    clearSession: async () => {},
  };
}

function makeUserRepository({ info, courses, fail } = {}) {
  if (fail) {
    return {
      getUserInfo: async () => {
        throw new Error("moodle down");
      },
      getUserCourses: async () => {
        throw new Error("moodle down");
      },
    };
  }
  return {
    getUserInfo: async (id) => info ?? { id, firstname: "Max", lastname: "Mustermann" },
    getUserCourses: async () => courses ?? [],
  };
}

function makeCourseRepository() {
  // streamChat never invokes this directly; searchCourses is mocked as a plain
  // function so the LLM flow does not touch the real repository.
  return {
    getAllCourses: async () => [],
    getCourseContents: async () => [],
  };
}

test("streamChat passes userProfile course ids to searchCourses as allowedIds", async () => {
  const userRepository = makeUserRepository({
    courses: [
      { id: 5, name: "LF07", shortname: "LF07" },
      { id: 12, name: "LF08", shortname: "LF08" },
    ],
  });
  const observed = [];
  const searchCourses = async (args) => {
    observed.push(args);
    return { found: false };
  };

  await streamChat({
    message: "Was ist LF07?",
    userId: 42,
    sessionId: "session-42-ts",
    chatRepository: makeChatRepository(),
    courseRepository: makeCourseRepository(),
    userRepository,
    llmService: makeLlmService(),
    searchCourses,
    model: "test",
    moodleBaseUrl: "https://moodle.example",
    onChunk: async () => {},
  });

  assert.strictEqual(observed.length, 1);
  assert.deepStrictEqual(observed[0].allowedIds, [5, 12]);
});

test("streamChat includes enrolled course links in LLM system context", async () => {
  const userRepository = makeUserRepository({
    courses: [
      { id: 5, name: "LF07", shortname: "LF07" },
      { id: 12, fullname: "LF08 Serveradministration", shortname: "LF08" },
    ],
  });
  let messagesForLlm = [];
  const llmService = {
    streamResponse: async (messages) => {
      messagesForLlm = messages;
      return makeDoneStream();
    },
  };

  await streamChat({
    message: "can you get me link for both courses?",
    userId: 42,
    sessionId: "session-42-links",
    chatRepository: makeChatRepository(),
    courseRepository: makeCourseRepository(),
    userRepository,
    llmService,
    searchCourses: async () => ({ found: false }),
    model: "test",
    moodleBaseUrl: "https://moodle.example",
    onChunk: async () => {},
  });

  const system = messagesForLlm[0].content;
  assert.ok(system.includes("LF07 | KURS-LINK: https://moodle.example/course/view.php?id=5"));
  assert.ok(
    system.includes(
      "LF08 Serveradministration | KURS-LINK: https://moodle.example/course/view.php?id=12",
    ),
  );
});

test("streamChat passes empty allowedIds when userProfile has no courses (searchCourses is fail-closed)", async () => {
  const userRepository = makeUserRepository({ courses: [] });
  const observed = [];
  const searchCourses = async (args) => {
    observed.push(args);
    return { found: false };
  };

  await streamChat({
    message: "Moodle Kurs anything",
    userId: 7,
    sessionId: "session-7-ts",
    chatRepository: makeChatRepository(),
    courseRepository: makeCourseRepository(),
    userRepository,
    llmService: makeLlmService(),
    searchCourses,
    model: "test",
    moodleBaseUrl: "https://moodle.example",
    onChunk: async () => {},
  });

  assert.deepStrictEqual(observed[0].allowedIds, []);
});

test("streamChat filters out non-positive-integer course ids before passing allowedIds", async () => {
  const userRepository = makeUserRepository({
    courses: [
      { id: 5, name: "LF07", shortname: "LF07" },
      { id: "abc", name: "Broken", shortname: "X" },
      { id: 0, name: "Zero", shortname: "Z" },
      { id: -3, name: "Negative", shortname: "N" },
      { id: 1.5, name: "Float", shortname: "F" },
      { id: null, name: "NullId", shortname: "K" },
      { id: 9, name: "LF09", shortname: "LF09" },
    ],
  });
  const observed = [];
  const searchCourses = async (args) => {
    observed.push(args);
    return { found: false };
  };

  await streamChat({
    message: "Was ist LF07?",
    userId: 1,
    sessionId: "session-1-ts",
    chatRepository: makeChatRepository(),
    courseRepository: makeCourseRepository(),
    userRepository,
    llmService: makeLlmService(),
    searchCourses,
    model: "test",
    moodleBaseUrl: "https://moodle.example",
    onChunk: async () => {},
  });

  assert.deepStrictEqual(observed[0].allowedIds, [5, 9]);
});

test("streamChat passes empty allowedIds when every course id is invalid", async () => {
  const userRepository = makeUserRepository({
    courses: [
      { id: "x", name: "Bad", shortname: "B" },
      { id: 0, name: "Zero", shortname: "Z" },
    ],
  });
  const observed = [];
  const searchCourses = async (args) => {
    observed.push(args);
    return { found: false };
  };

  await streamChat({
    message: "Moodle Kurs x",
    userId: 1,
    sessionId: "session-1-ts",
    chatRepository: makeChatRepository(),
    courseRepository: makeCourseRepository(),
    userRepository,
    llmService: makeLlmService(),
    searchCourses,
    model: "test",
    moodleBaseUrl: "https://moodle.example",
    onChunk: async () => {},
  });

  assert.deepStrictEqual(observed[0].allowedIds, []);
});

test("streamChat passes empty allowedIds when userRepository throws (fallback profile has no courses)", async () => {
  const userRepository = makeUserRepository({ fail: true });
  const observed = [];
  const searchCourses = async (args) => {
    observed.push(args);
    return { found: false };
  };

  await streamChat({
    message: "Moodle Kurs anything",
    userId: 99,
    sessionId: "session-99-ts",
    chatRepository: makeChatRepository(),
    courseRepository: makeCourseRepository(),
    userRepository,
    llmService: makeLlmService(),
    searchCourses,
    model: "test",
    moodleBaseUrl: "https://moodle.example",
    onChunk: async () => {},
  });

  assert.deepStrictEqual(observed[0].allowedIds, []);
});

test("streamChat answers out-of-scope weather questions without calling course search or LLM", async () => {
  const chatRepository = makeTrackingChatRepository();
  const chunks = [];

  await streamChat({
    message: "Wie ist das Wetter morgen?",
    userId: 42,
    sessionId: "session-42-weather",
    chatRepository,
    courseRepository: makeCourseRepository(),
    userRepository: makeUserRepository(),
    llmService: {
      streamResponse: async () => {
        throw new Error("LLM must not be called for out-of-scope questions");
      },
    },
    searchCourses: async () => {
      throw new Error("course search must not be called for out-of-scope questions");
    },
    model: "test",
    moodleBaseUrl: "https://moodle.example",
    onChunk: async (chunk) => {
      chunks.push(chunk);
    },
  });

  assert.deepStrictEqual(chunks, [
    "Ich beantworte nur Fragen zu Moodle, Lernen und deinen Kursen.",
  ]);
  assert.deepStrictEqual(chatRepository.appended, [
    ["session-42-weather", 42, "user", "Wie ist das Wetter morgen?"],
    [
      "session-42-weather",
      42,
      "assistant",
      "Ich beantworte nur Fragen zu Moodle, Lernen und deinen Kursen.",
    ],
  ]);
});

test("streamChat still sends Moodle and learning questions to course search and LLM", async () => {
  const observedQueries = [];
  let llmCalled = false;

  await streamChat({
    message: "Erkläre mir die Arrays aus meinem LF07 Kurs",
    userId: 42,
    sessionId: "session-42-learning",
    chatRepository: makeChatRepository(),
    courseRepository: makeCourseRepository(),
    userRepository: makeUserRepository({
      courses: [{ id: 7, name: "LF07", shortname: "LF07" }],
    }),
    llmService: {
      streamResponse: async () => {
        llmCalled = true;
        return makeDoneStream();
      },
    },
    searchCourses: async (args) => {
      observedQueries.push(args.query);
      return { found: false };
    },
    model: "test",
    moodleBaseUrl: "https://moodle.example",
    onChunk: async () => {},
  });

  assert.deepStrictEqual(observedQueries, ["Erkläre mir die Arrays aus meinem LF07 Kurs"]);
  assert.strictEqual(llmCalled, true);
});
