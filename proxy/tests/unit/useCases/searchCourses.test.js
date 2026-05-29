import assert from "node:assert/strict";
import { test } from "vitest";
import { searchCourses } from "../../../src/application/useCases/courses/searchCourses.js";
import { mockCourses } from "../../fixtures/mockCourseData.js";
import { buildMockCourseRepository } from "../../fixtures/mockRepositories.js";

test("exact match by course name returns LF07", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({ query: "lf07", courseRepository: repo });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.course.name, "LF07 Netzwerktechnik");
});

test("match by shortname returns WP212", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({ query: "wp212", courseRepository: repo });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.course.name, "WP212 Webprogrammierung");
});

test("nonexistent query returns found false", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({ query: "xyznonexistent", courseRepository: repo });
  assert.strictEqual(result.found, false);
  assert.strictEqual(result.message, "Course not found");
});

test("quoted query performs phrase match", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({ query: '"Netzwerktechnik"', courseRepository: repo });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.course.name, "LF07 Netzwerktechnik");
});

test("number in query boosts shortname match", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({ query: "07", courseRepository: repo });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.course.name, "LF07 Netzwerktechnik");
});

test("empty query returns found false without crashing", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({ query: "", courseRepository: repo });
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
  const result = await searchCourses({ query: "lf07", courseRepository: repo });
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
  const result = await searchCourses({ query: "lf07", courseRepository: repo });
  assert.strictEqual(result.found, false);
  assert.strictEqual(result.message, "Course search unavailable");
});

test("course search unavailable when repository throws", async () => {
  const repo = {
    getAllCourses: async () => {
      throw new Error("DB error");
    },
  };
  const result = await searchCourses({ query: "lf07", courseRepository: repo });
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
  const result = await searchCourses({ query: "lf99", courseRepository: repo });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.sections.length, 3); // MAX_SECTIONS_IN_RESPONSE
});

test("stop words are ignored in query", async () => {
  const repo = buildMockCourseRepository(mockCourses);
  const result = await searchCourses({ query: "lf07 und netzwerk", courseRepository: repo });
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
  const result = await searchCourses({ query: "lf10", courseRepository: repo });
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.sections.length, 2);
  assert.strictEqual(result.sections[0].name, "Alpha");
  assert.strictEqual(result.sections[1].name, "Beta");
});
