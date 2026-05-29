import assert from "node:assert/strict";
import { test } from "vitest";
import {
  normalize,
  tokenize,
  pickRelevantSections,
  scoreCourse,
  rankCourses,
} from "../../../src/application/useCases/courses/searchCourses.js";

test("normalize lowercases and trims", () => {
  assert.strictEqual(normalize("  LF07  "), "lf07");
});

test("normalize handles null/undefined", () => {
  assert.strictEqual(normalize(null), "");
  assert.strictEqual(normalize(undefined), "");
});

test("tokenize splits and filters short words", () => {
  const tokens = tokenize("a bc def");
  assert.deepStrictEqual(tokens, ["bc", "def"]);
});

test("tokenize filters stop words", () => {
  const tokens = tokenize("lf07 und netzwerk");
  assert.deepStrictEqual(tokens, ["lf07", "netzwerk"]);
});

test("pickRelevantSections matches section name", () => {
  const course = {
    sections: [
      { id: 1, name: "Woche 1: Einführung", modules: [] },
      { id: 2, name: "Woche 2: TCP/IP", modules: [] },
    ],
  };
  const ids = pickRelevantSections(course, ["einführung"]);
  assert.strictEqual(ids.has(1), true);
  assert.strictEqual(ids.has(2), false);
});

test("pickRelevantSections matches module name", () => {
  const course = {
    sections: [
      {
        id: 1,
        name: "Week 1",
        modules: [{ id: 10, name: "Linux Intro", files: [] }],
      },
    ],
  };
  const ids = pickRelevantSections(course, ["linux"]);
  assert.strictEqual(ids.has(1), true);
});

test("pickRelevantSections matches file filename", () => {
  const course = {
    sections: [
      {
        id: 1,
        name: "Week 1",
        modules: [
          {
            id: 10,
            name: "Intro",
            files: [{ filename: "slides.pdf" }],
          },
        ],
      },
    ],
  };
  const ids = pickRelevantSections(course, ["slides"]);
  assert.strictEqual(ids.has(1), true);
});

test("pickRelevantSections returns empty set when nothing matches", () => {
  const course = {
    sections: [{ id: 1, name: "Week 1", modules: [] }],
  };
  const ids = pickRelevantSections(course, ["xyz"]);
  assert.strictEqual(ids.size, 0);
});

test("scoreCourse boosts phrase match", () => {
  const course = { name: "LF07 Netzwerktechnik", shortname: "lf07", sections: [] };
  const result = scoreCourse(course, [], ["netzwerktechnik"]);
  assert.ok(result.score > 200);
});

test("scoreCourse scores token match in name and shortname", () => {
  const course = { name: "LF07 Netzwerktechnik", shortname: "lf07", sections: [] };
  const result = scoreCourse(course, ["lf07"], []);
  assert.ok(result.score >= 20);
  assert.strictEqual(result.tokenMatches, 1);
});

test("scoreCourse adds lf boost", () => {
  const course = { name: "LF07", shortname: "lf07", sections: [] };
  const result = scoreCourse(course, ["lf"], []);
  assert.ok(result.score >= 35); // 20 token + 15 lf boost
});

test("scoreCourse adds number boost in shortname", () => {
  const course = { name: "LF07", shortname: "lf07", sections: [] };
  const result = scoreCourse(course, ["07"], []);
  assert.ok(result.score >= 45); // 20 token + 25 number boost
});

test("scoreCourse adds bilingual hackathon boost", () => {
  const course = { name: "Bilingual Hackathon KI", shortname: "bili_hackathon", sections: [] };
  const result = scoreCourse(course, ["bili"], []);
  assert.ok(result.score >= 45); // 20 token + 25 ki boost
});

test("scoreCourse scores file hits and all-tokens bonus", () => {
  const course = {
    name: "Course",
    shortname: "c1",
    sections: [
      {
        id: 1,
        name: "Sec",
        modules: [
          {
            id: 10,
            name: "Mod",
            files: [{ filename: "tcp_ip_guide.pdf" }],
          },
        ],
      },
    ],
  };
  const result = scoreCourse(course, ["tcp", "ip"], []);
  // 2 tokens hit in filename = 2*25 = 50, plus all tokens bonus = 50
  assert.ok(result.score >= 100);
});

test("scoreCourse handles malformed course data gracefully", () => {
  const course = { name: "Course", shortname: "c1", sections: null };
  const result = scoreCourse(course, ["x"], []);
  assert.strictEqual(result.score, 0);
});

test("rankCourses sorts by score descending", () => {
  const courses = [
    { id: 1, name: "A", shortname: "a", sections: [] },
    { id: 2, name: "B", shortname: "b", sections: [] },
  ];
  const ranked = rankCourses(courses, ["a"], ["b"]);
  // A gets +20 token, B gets +200 phrase → B first
  assert.strictEqual(ranked[0].course.id, 2);
  assert.strictEqual(ranked[1].course.id, 1);
});

test("rankCourses skips zero-score courses", () => {
  const courses = [
    { id: 1, name: "A", shortname: "a", sections: [] },
    { id: 2, name: "B", shortname: "b", sections: [] },
  ];
  const ranked = rankCourses(courses, ["nonexistent"], []);
  assert.strictEqual(ranked.length, 0);
});

test("rankCourses tie-breaks by tokenMatches then sectionIds size", () => {
  const courses = [
    { id: 1, name: "AB", shortname: "ab", sections: [{ id: 10, name: "S1", modules: [] }] },
    { id: 2, name: "AB", shortname: "ab", sections: [] },
  ];
  const ranked = rankCourses(courses, ["ab"], []);
  assert.strictEqual(ranked[0].course.id, 1); // larger sectionIds size wins tie
  assert.strictEqual(ranked[1].course.id, 2);
});
