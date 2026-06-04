import assert from "node:assert/strict";
import { test } from "vitest";

async function importMoodleCache() {
  process.env.MOODLE_URL = "https://moodle.example.test";
  process.env.MOODLE_TOKEN = "test-token";
  process.env.OLLAMA_URL = "http://ollama.test";
  process.env.OLLAMA_MODEL = "llama-test";
  process.env.CACHE_TTL_COURSES = "100";
  process.env.CACHE_TTL_USERS = "50";

  const moduleUrl = new URL("../../../../src/frameworks/moodle/moodleCache.js", import.meta.url);
  moduleUrl.searchParams.set("cacheBust", crypto.randomUUID());
  return import(moduleUrl.href);
}

function createLogger() {
  const entries = [];
  return {
    entries,
    info(meta, message) {
      entries.push({ level: "info", meta, message });
    },
  };
}

test("moodleCache loads and reuses structured course data until course TTL expires", async () => {
  const calls = { getAllCourses: 0, getCourseContents: 0 };
  let now = 1_000;
  const logger = createLogger();
  const client = {
    async getAllCourses() {
      calls.getAllCourses += 1;
      return [{ id: 11, fullname: "Learning Field 8", shortname: "LF8", summary: "Routing" }];
    },
    async getCourseContents(courseId) {
      calls.getCourseContents += 1;
      return [
        {
          id: 101,
          name: `Section ${courseId}`,
          summary: "Checkpoint deliverables and rubric",
          modules: [
            {
              id: 201,
              name: "Navigator",
              description: "Submit your checkpoint file here",
              modname: "resource",
              url: "https://moodle.example.test/mod/resource/view.php?id=201",
              contents: [
                {
                  type: "file",
                  filename: "routing.pdf",
                  mimetype: "application/pdf",
                  filepath: "/Sprint 2/",
                  fileurl:
                    "https://moodle.example.test/webservice/pluginfile.php/1/mod_resource/content/routing.pdf?token=secret",
                },
              ],
            },
            {
              id: 202,
              name: "Planning and Agreements",
              modname: "page",
              contents: [
                {
                  type: "file",
                  filename: "index.html",
                  mimetype: "text/html",
                  filepath: "/",
                  fileurl:
                    "https://moodle.example.test/webservice/pluginfile.php/2/mod_page/content/index.html",
                },
              ],
            },
          ],
        },
      ];
    },
    async getTextFile(fileUrl) {
      assert.equal(
        fileUrl,
        "https://moodle.example.test/webservice/pluginfile.php/2/mod_page/content/index.html",
      );
      return "<h2>Planning and Agreements</h2><p>Checkpoint 2: Ideate Your Solution (20%)</p>";
    },
  };

  const { createMoodleCache } = await importMoodleCache();
  const cache = createMoodleCache({ client, logger, now: () => now, courseTtl: 100, userTtl: 50 });

  const first = await cache.getAllCourses();
  const second = await cache.getAllCourses();
  const sections = await cache.getCourseContents(11);
  now += 101;
  await cache.getAllCourses();

  assert.deepEqual(first, second);
  assert.equal(calls.getAllCourses, 2);
  assert.equal(calls.getCourseContents, 2);
  assert.equal(first[0].name, "Learning Field 8");
  assert.equal(first[0].url, "https://moodle.example.test/course/view.php?id=11");
  assert.equal(sections[0].summary, "Checkpoint deliverables and rubric");
  assert.equal(
    sections[0].modules[0].url,
    "https://moodle.example.test/mod/resource/view.php?id=201",
  );
  assert.equal(sections[0].modules[0].summary, "Submit your checkpoint file here");
  assert.equal(sections[0].modules[0].files[0].path, "/Sprint 2/");
  assert.equal(
    sections[0].modules[0].files[0].url,
    "https://moodle.example.test/pluginfile.php/1/mod_resource/content/routing.pdf",
  );
  assert.equal(
    sections[0].modules[1].summary,
    "Planning and Agreements Checkpoint 2: Ideate Your Solution (20%)",
  );
  assert.equal(cache.stats.courses.hits, 2);
  assert.equal(cache.stats.courses.misses, 2);
  assert.equal(
    logger.entries.some((entry) => entry.message === "Moodle course cache hit"),
    true,
  );
  assert.equal(
    logger.entries.some((entry) => entry.message === "Moodle course cache miss"),
    true,
  );
});

test("moodleCache invalidates course cache explicitly", async () => {
  let version = 0;
  const client = {
    async getAllCourses() {
      version += 1;
      return [{ id: 1, fullname: `Course ${version}`, shortname: "C1" }];
    },
    async getCourseContents() {
      return [];
    },
  };

  const { createMoodleCache } = await importMoodleCache();
  const cache = createMoodleCache({ client, logger: createLogger(), now: () => 1_000 });

  const first = await cache.getAllCourses();
  cache.invalidateCourseCache();
  const second = await cache.getAllCourses();

  assert.equal(first[0].name, "Course 1");
  assert.equal(second[0].name, "Course 2");
  assert.equal(cache.stats.courses.entries, 1);
});

test("moodleCache caches user info and user courses by user id until user TTL expires", async () => {
  const calls = { getUserInfo: 0, getUserCourses: 0 };
  let now = 5_000;
  const logger = createLogger();
  const client = {
    async getUserInfo(userId) {
      calls.getUserInfo += 1;
      return { id: userId, firstname: "Ada", lastname: "Lovelace", email: "ada@example.test" };
    },
    async getUserCourses(userId) {
      calls.getUserCourses += 1;
      return [{ id: 7, fullname: `Math for ${userId}`, shortname: "MATH" }];
    },
  };

  const { createMoodleCache } = await importMoodleCache();
  const cache = createMoodleCache({ client, logger, now: () => now, userTtl: 50 });

  const firstInfo = await cache.getUserInfo(42);
  const secondInfo = await cache.getUserInfo(42);
  const firstCourses = await cache.getUserCourses(42);
  const secondCourses = await cache.getUserCourses(42);
  cache.invalidateUserCache(42);
  await cache.getUserInfo(42);
  now += 51;
  await cache.getUserCourses(42);

  assert.deepEqual(firstInfo, secondInfo);
  assert.deepEqual(firstCourses, secondCourses);
  assert.equal(calls.getUserInfo, 2);
  assert.equal(calls.getUserCourses, 2);
  assert.equal(cache.stats.users.entries, 1);
  assert.equal(cache.stats.users.hits, 2);
  assert.equal(cache.stats.users.misses, 4);
  assert.equal(
    logger.entries.some((entry) => entry.message === "Moodle user cache hit"),
    true,
  );
  assert.equal(
    logger.entries.some((entry) => entry.message === "Moodle user cache miss"),
    true,
  );
});
