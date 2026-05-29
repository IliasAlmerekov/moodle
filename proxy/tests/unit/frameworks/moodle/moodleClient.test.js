import assert from "node:assert/strict";
import { test } from "vitest";

async function importMoodleClient() {
  process.env.MOODLE_URL = "https://moodle.example.test";
  process.env.MOODLE_TOKEN = "test-token";
  process.env.OLLAMA_URL = "http://ollama.test";
  process.env.OLLAMA_MODEL = "llama-test";

  const moduleUrl = new URL("../../../../src/frameworks/moodle/moodleClient.js", import.meta.url);
  moduleUrl.searchParams.set("cacheBust", crypto.randomUUID());
  return import(moduleUrl.href);
}

test("moodleClient calls Moodle REST API with token and wsfunction", async () => {
  const fetchCalls = [];
  globalThis.fetch = async (url) => {
    fetchCalls.push(new URL(url));
    return new Response(JSON.stringify([{ id: 1, fullname: "Course A" }]), { status: 200 });
  };

  const { moodleClient } = await importMoodleClient();

  const courses = await moodleClient.getAllCourses();

  assert.deepEqual(courses, [{ id: 1, fullname: "Course A" }]);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].origin, "https://moodle.example.test");
  assert.equal(fetchCalls[0].pathname, "/webservice/rest/server.php");
  assert.equal(fetchCalls[0].searchParams.get("wstoken"), "test-token");
  assert.equal(fetchCalls[0].searchParams.get("wsfunction"), "core_course_get_courses");
  assert.equal(fetchCalls[0].searchParams.get("moodlewsrestformat"), "json");
});

test("moodleClient converts Moodle API exceptions into useful errors", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ exception: "moodle_exception", errorcode: "invalidtoken", message: "Invalid token" }), {
      status: 200,
    });

  const { moodleClient } = await importMoodleClient();

  await assert.rejects(() => moodleClient.getAllCourses(), {
    message: "Moodle error: Invalid token",
    statusCode: 502,
    moodleErrorCode: "invalidtoken",
  });
});

test("moodleClient retries transient fetch failures before returning data", async () => {
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error("network down");
    }

    return new Response(JSON.stringify([{ id: 7, fullname: "Recovered" }]), { status: 200 });
  };

  const { moodleClient } = await importMoodleClient();

  const courses = await moodleClient.getAllCourses();

  assert.deepEqual(courses, [{ id: 7, fullname: "Recovered" }]);
  assert.equal(attempts, 3);
});

test("moodleClient maps user and course repository methods to Moodle functions", async () => {
  const functions = [];
  globalThis.fetch = async (url) => {
    const requestUrl = new URL(url);
    functions.push(requestUrl.searchParams.get("wsfunction"));

    if (requestUrl.searchParams.get("wsfunction") === "core_user_get_users_by_field") {
      return new Response(JSON.stringify([{ id: 42, firstname: "Ada" }]), { status: 200 });
    }

    return new Response(JSON.stringify([]), { status: 200 });
  };

  const { moodleClient } = await importMoodleClient();

  await moodleClient.getCourseContents(12);
  await moodleClient.getUserInfo(42);
  await moodleClient.getUserCourses(42);

  assert.deepEqual(functions, [
    "core_course_get_contents",
    "core_user_get_users_by_field",
    "core_enrol_get_users_courses",
  ]);
});
