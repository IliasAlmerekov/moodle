import assert from "node:assert/strict";
import { test } from "vitest";
import { createUserProfile } from "../../../src/entities/UserProfile.js";

test("fullname is computed from firstname + lastname", () => {
  const profile = createUserProfile({ id: 1, firstname: "John", lastname: "Doe" });
  assert.strictEqual(profile.fullname, "John Doe");
});

test("empty names fallback to 'Student'", () => {
  const profile = createUserProfile({ id: 1 });
  assert.strictEqual(profile.fullname, "Student");
});

test("whitespace-only names fallback to 'Student'", () => {
  const profile = createUserProfile({ id: 1, firstname: "  ", lastname: "  " });
  assert.strictEqual(profile.fullname, "Student");
});

test("missing id throws 400", () => {
  assert.throws(
    () => createUserProfile({ id: undefined }),
    (err) => err.statusCode === 400 && err.message === "UserProfile id is required",
  );
});

test("null id throws 400", () => {
  assert.throws(
    () => createUserProfile({ id: null }),
    (err) => err.statusCode === 400 && err.message === "UserProfile id is required",
  );
});

test("id zero is accepted (edge case)", () => {
  const profile = createUserProfile({ id: 0 });
  assert.strictEqual(profile.id, 0);
  assert.strictEqual(profile.fullname, "Student");
});

test("returns frozen object", () => {
  const profile = createUserProfile({ id: 1, firstname: "John", lastname: "Doe" });
  assert.strictEqual(Object.isFrozen(profile), true);
});

test("courses are frozen", () => {
  const profile = createUserProfile({ id: 1, courses: ["LF07"] });
  assert.strictEqual(Object.isFrozen(profile.courses), true);
});

test("email defaults to empty string", () => {
  const profile = createUserProfile({ id: 1 });
  assert.strictEqual(profile.email, "");
});

test("firstname and lastname default to empty string", () => {
  const profile = createUserProfile({ id: 1 });
  assert.strictEqual(profile.firstname, "");
  assert.strictEqual(profile.lastname, "");
});
