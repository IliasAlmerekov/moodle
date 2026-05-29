import assert from "node:assert/strict";
import { test } from "vitest";
import { createCourse } from "../../../src/entities/Course.js";

test("minimal course with id and name", () => {
  const course = createCourse({ id: 1, name: "LF07" });
  assert.strictEqual(course.id, 1);
  assert.strictEqual(course.name, "LF07");
  assert.strictEqual(course.shortname, "");
  assert.strictEqual(course.summary, "");
  assert.strictEqual(course.url, null);
  assert.deepStrictEqual(course.sections, []);
});

test("course with all fields", () => {
  const course = createCourse({
    id: 1,
    name: "LF07",
    shortname: "lf07",
    summary: "Network basics",
    url: "https://moodle/course/1",
    sections: [
      {
        id: 10,
        name: "Week 1",
        modules: [
          {
            id: 100,
            name: "Intro",
            type: "page",
            url: "https://moodle/mod/100",
            files: [
              { filename: "slides.pdf", mimetype: "application/pdf", url: "https://moodle/file/1" },
            ],
          },
        ],
      },
    ],
  });
  assert.strictEqual(course.shortname, "lf07");
  assert.strictEqual(course.summary, "Network basics");
  assert.strictEqual(course.url, "https://moodle/course/1");
  assert.strictEqual(course.sections.length, 1);
  assert.strictEqual(course.sections[0].name, "Week 1");
  assert.strictEqual(course.sections[0].modules.length, 1);
  assert.strictEqual(course.sections[0].modules[0].name, "Intro");
  assert.strictEqual(course.sections[0].modules[0].files.length, 1);
  assert.strictEqual(course.sections[0].modules[0].files[0].filename, "slides.pdf");
});

test("returns frozen object", () => {
  const course = createCourse({ id: 1, name: "LF07" });
  assert.strictEqual(Object.isFrozen(course), true);
});

test("sections array is frozen", () => {
  const course = createCourse({
    id: 1,
    name: "LF07",
    sections: [{ id: 10, name: "Week 1" }],
  });
  assert.strictEqual(Object.isFrozen(course.sections), true);
});

test("modules array inside section is frozen", () => {
  const course = createCourse({
    id: 1,
    name: "LF07",
    sections: [{ id: 10, name: "Week 1", modules: [{ id: 100, name: "Intro" }] }],
  });
  assert.strictEqual(Object.isFrozen(course.sections[0].modules), true);
});

test("files array inside module is frozen", () => {
  const course = createCourse({
    id: 1,
    name: "LF07",
    sections: [
      {
        id: 10,
        name: "Week 1",
        modules: [{ id: 100, name: "Intro", files: [{ filename: "a.txt" }] }],
      },
    ],
  });
  assert.strictEqual(Object.isFrozen(course.sections[0].modules[0].files), true);
});

test("file object is frozen", () => {
  const course = createCourse({
    id: 1,
    name: "LF07",
    sections: [
      {
        id: 10,
        name: "Week 1",
        modules: [{ id: 100, name: "Intro", files: [{ filename: "a.txt" }] }],
      },
    ],
  });
  assert.strictEqual(Object.isFrozen(course.sections[0].modules[0].files[0]), true);
});

test("name is trimmed", () => {
  const course = createCourse({ id: 1, name: "  LF07  " });
  assert.strictEqual(course.name, "LF07");
});

test("missing id throws 400", () => {
  assert.throws(
    () => createCourse({ id: undefined, name: "LF07" }),
    (err) => err.statusCode === 400 && err.message === "Course id is required",
  );
});

test("null id throws 400", () => {
  assert.throws(
    () => createCourse({ id: null, name: "LF07" }),
    (err) => err.statusCode === 400 && err.message === "Course id is required",
  );
});

test("empty name throws 400", () => {
  assert.throws(
    () => createCourse({ id: 1, name: "" }),
    (err) => err.statusCode === 400 && err.message === "Course name is required",
  );
});

test("whitespace-only name throws 400", () => {
  assert.throws(
    () => createCourse({ id: 1, name: "   " }),
    (err) => err.statusCode === 400 && err.message === "Course name is required",
  );
});

test("null name throws 400", () => {
  assert.throws(
    () => createCourse({ id: 1, name: null }),
    (err) => err.statusCode === 400 && err.message === "Course name is required",
  );
});

test("defaults for optional fields", () => {
  const course = createCourse({ id: 1, name: "LF07" });
  assert.strictEqual(course.shortname, "");
  assert.strictEqual(course.summary, "");
  assert.strictEqual(course.url, null);
  assert.deepStrictEqual(course.sections, []);
});

test("defaults for nested optional fields", () => {
  const course = createCourse({
    id: 1,
    name: "LF07",
    sections: [{ id: 10, name: "Week 1" }],
  });
  assert.deepStrictEqual(course.sections[0].modules, []);
});

test("module defaults for optional fields", () => {
  const course = createCourse({
    id: 1,
    name: "LF07",
    sections: [
      {
        id: 10,
        name: "Week 1",
        modules: [{ id: 100, name: "Intro" }],
      },
    ],
  });
  assert.strictEqual(course.sections[0].modules[0].type, "");
  assert.strictEqual(course.sections[0].modules[0].url, null);
  assert.deepStrictEqual(course.sections[0].modules[0].files, []);
});

test("file defaults for optional fields", () => {
  const course = createCourse({
    id: 1,
    name: "LF07",
    sections: [
      {
        id: 10,
        name: "Week 1",
        modules: [
          {
            id: 100,
            name: "Intro",
            files: [{}],
          },
        ],
      },
    ],
  });
  assert.strictEqual(course.sections[0].modules[0].files[0].filename, "");
  assert.strictEqual(course.sections[0].modules[0].files[0].mimetype, "");
  assert.strictEqual(course.sections[0].modules[0].files[0].url, null);
});

test("section with null id throws 400", () => {
  assert.throws(
    () =>
      createCourse({
        id: 1,
        name: "LF07",
        sections: [{ id: null, name: "Week 1" }],
      }),
    (err) => err.statusCode === 400 && err.message === "Section id is required",
  );
});

test("module with null id throws 400", () => {
  assert.throws(
    () =>
      createCourse({
        id: 1,
        name: "LF07",
        sections: [
          {
            id: 10,
            name: "Week 1",
            modules: [{ id: null, name: "Intro" }],
          },
        ],
      }),
    (err) => err.statusCode === 400 && err.message === "Module id is required",
  );
});
