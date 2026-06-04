import assert from "node:assert/strict";
import { test } from "vitest";
import { searchCourses } from "../../../src/application/useCases/courses/searchCourses.js";
import { mockCourses } from "../../fixtures/mockCourseData.js";
import { buildMockCourseRepository } from "../../fixtures/mockRepositories.js";

// All ids in the mock fixture — used to simulate a user enrolled in every course.
// searchCourses is now fail-closed: any call without an explicit `allowedIds`
// returns { found: false, message: "Course not found" } without touching the
// repository. Tests that exercise ranking/contents pass `allowedIds: allIds`
// to bypass the authorization gate while keeping the rest of the behavior
// under test.
const allIds = mockCourses.map((c) => c.id);

test("exact match by course name returns LF07", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({
    query: "lf07",
    courseRepository: repo,
    allowedIds: allIds,
  });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.course.name, "LF07 Netzwerktechnik");
});

test("match by shortname returns WP212", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({
    query: "wp212",
    courseRepository: repo,
    allowedIds: allIds,
  });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.course.name, "WP212 Webprogrammierung");
});

test("nonexistent query returns found false", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({
    query: "xyznonexistent",
    courseRepository: repo,
    allowedIds: allIds,
  });
  assert.strictEqual(result.found, false);
  assert.strictEqual(result.message, "Course not found");
});

test("quoted query performs phrase match", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({
    query: '"Netzwerktechnik"',
    courseRepository: repo,
    allowedIds: allIds,
  });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.course.name, "LF07 Netzwerktechnik");
});

test("number in query boosts shortname match", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({
    query: "07",
    courseRepository: repo,
    allowedIds: allIds,
  });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.course.name, "LF07 Netzwerktechnik");
});

test("empty query returns found false without crashing", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({
    query: "",
    courseRepository: repo,
    allowedIds: allIds,
  });
  assert.strictEqual(result.found, false);
  assert.strictEqual(result.message, "Course not found");
});

test("allowedIds filters out non-matching courses", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({
    query: "lf07",
    courseRepository: repo,
    allowedIds: [2, 3],
  });
  assert.strictEqual(result.found, false);
  assert.strictEqual(result.message, "Course not found");
});

test("allowedIds includes matching course", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({
    query: "lf07",
    courseRepository: repo,
    allowedIds: [1, 2],
  });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.course.name, "LF07 Netzwerktechnik");
});

test("returns course sections when course is found", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({
    query: "lf07",
    courseRepository: repo,
    allowedIds: allIds,
  });
  assert.strictEqual(result.found, true);
  assert.ok(Array.isArray(result.sections));
  assert.strictEqual(result.sections.length, 2);
  assert.strictEqual(result.sections[0].name, "Woche 1: Einführung");
});

test("course search unavailable when getCourseContents throws", async () => {
  const repo = {
    getAllCourses: async () => mockCourses,
    getCourseContents: async () => {
      throw new Error("Timeout");
    },
  };
  const result = await searchCourses({
    query: "lf07",
    courseRepository: repo,
    allowedIds: allIds,
  });
  assert.strictEqual(result.found, false);
  assert.strictEqual(result.message, "Course search unavailable");
});

test("course search unavailable when repository throws", async () => {
  const repo = {
    getAllCourses: async () => {
      throw new Error("DB error");
    },
  };
  const result = await searchCourses({
    query: "lf07",
    courseRepository: repo,
    allowedIds: allIds,
  });
  assert.strictEqual(result.found, false);
  assert.strictEqual(result.message, "Course search unavailable");
});

test("MAX_SECTIONS_IN_RESPONSE limits returned sections", async () => {
  const manySections = Array.from({ length: 5 }, (_, i) => ({
    id: 100 + i,
    name: `Woche ${i + 1}`,
    modules: [],
  }));
  const courses = [
    {
      id: 99,
      name: "LF99 Test",
      shortname: "lf99",
      summary: "Test course",
      url: "https://moodle.example/course/view.php?id=99",
      sections: manySections,
    },
  ];
  const repo = buildMockCourseRepository(courses);
  const result = await searchCourses({
    query: "lf99",
    courseRepository: repo,
    allowedIds: [99],
  });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.sections.length, 5); // MAX_SECTIONS_IN_RESPONSE
});

test("checkpoint query matches section and module descriptions", async () => {
  const courses = [
    {
      id: 3,
      name: "Bili Hackathon",
      shortname: "bili",
      summary: "Hackathon course",
      url: "https://moodle.example/course/view.php?id=3",
      sections: [
        {
          id: 31,
          name: "Sprint 1 - Understand the challenge",
          summary: "Preparation for Checkpoint 1",
          modules: [
            {
              id: 301,
              name: "Checkpoint 1 submission",
              type: "assign",
              description: "Submit your problem statement and research summary.",
              files: [],
            },
          ],
        },
        {
          id: 32,
          name: "Sprint 2 - Ideate your solution",
          summary: "Preparation for Checkpoint 2",
          modules: [
            {
              id: 302,
              name: "Ideation canvas",
              type: "resource",
              description: "Helpful material for Checkpoint 2 deliverables.",
              files: [{ filename: "Walt Disney.pdf", path: "/Sprint 2/" }],
            },
          ],
        },
      ],
    },
  ];
  const repo = buildMockCourseRepository(courses);
  const result = await searchCourses({
    query: "Bili Hackathon Checkpoint 2 what do I submit",
    courseRepository: repo,
    allowedIds: [3],
  });

  assert.strictEqual(result.found, true);
  assert.strictEqual(result.course.name, "Bili Hackathon");
  assert.strictEqual(result.sections[0].name, "Sprint 2 - Ideate your solution");
});

test("checkpoint query includes related hackathon course context", async () => {
  const courses = [
    {
      id: 2,
      name: "Klassenkurs IT4bili",
      shortname: "it4bili",
      summary: "Class course",
      url: "https://moodle.example/course/view.php?id=2",
      sections: [
        {
          id: 20,
          name: "Lernfeld 7: Hackathon",
          modules: [
            {
              id: 15,
              name: "Planning and Agreements",
              type: "page",
              summary:
                "Checkpoint 1: Problem Definition & Team Organization (10%) Checkpoint 2: Ideate Your Solution (20%)",
              files: [{ filename: "index.html", path: "/" }],
            },
          ],
        },
      ],
    },
    {
      id: 3,
      name: "Bili Hackathon",
      shortname: "bili",
      summary: "Hackathon course",
      url: "https://moodle.example/course/view.php?id=3",
      sections: [
        {
          id: 32,
          name: "Sprint 2 - Ideate your solution",
          modules: [
            {
              id: 53,
              name: "Walt Disney",
              type: "resource",
              files: [{ filename: "Walt Disney.pptx", path: "/" }],
            },
          ],
        },
      ],
    },
  ];
  const repo = buildMockCourseRepository(courses);
  const result = await searchCourses({
    query: "Bili Hackathon Checkpoint 2 what do I submit",
    courseRepository: repo,
    allowedIds: [2, 3],
  });

  assert.strictEqual(result.found, true);
  assert.strictEqual(result.course.name, "Klassenkurs IT4bili");
  assert.strictEqual(result.sections[0].name, "Lernfeld 7: Hackathon");
  assert.strictEqual(result.relatedCourses[0].course.name, "Bili Hackathon");
  assert.strictEqual(result.relatedCourses[0].sections[0].name, "Sprint 2 - Ideate your solution");
});

test("stop words are ignored in query", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({
    query: "lf07 und netzwerk",
    courseRepository: repo,
    allowedIds: allIds,
  });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.course.name, "LF07 Netzwerktechnik");
});

test("fallback returns all sections when no token-matching sections", async () => {
  const courses = [
    {
      id: 10,
      name: "LF10 Mystery",
      shortname: "lf10",
      summary: "Mystery course",
      url: "https://moodle.example/course/view.php?id=10",
      sections: [
        { id: 1, name: "Alpha", modules: [] },
        { id: 2, name: "Beta", modules: [] },
      ],
    },
  ];
  const repo = buildMockCourseRepository(courses);
  const result = await searchCourses({
    query: "lf10",
    courseRepository: repo,
    allowedIds: [10],
  });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.sections.length, 2);
  assert.strictEqual(result.sections[0].name, "Alpha");
  assert.strictEqual(result.sections[1].name, "Beta");
});

// --- Fail-closed authorization (searchCourses enforces allowedIds) ---

test("searchCourses returns found false when allowedIds is omitted", async () => {
  // No repository mock is needed: the fail-closed short-circuit must return
  // before any repository call, proving authorization is enforced at the
  // function boundary, not by the caller.
  const result = await searchCourses({
    query: "lf07",
    courseRepository: {
      getAllCourses: async () => {
        throw new Error("repository must not be called when allowedIds is missing");
      },
      getCourseContents: async () => {
        throw new Error("repository must not be called when allowedIds is missing");
      },
    },
  });
  assert.strictEqual(result.found, false);
  assert.strictEqual(result.message, "Course not found");
});

test("searchCourses returns found false when allowedIds is empty", async () => {
  const result = await searchCourses({
    query: "lf07",
    courseRepository: {
      getAllCourses: async () => {
        throw new Error("repository must not be called when allowedIds is empty");
      },
      getCourseContents: async () => {
        throw new Error("repository must not be called when allowedIds is empty");
      },
    },
    allowedIds: [],
  });
  assert.strictEqual(result.found, false);
  assert.strictEqual(result.message, "Course not found");
});
