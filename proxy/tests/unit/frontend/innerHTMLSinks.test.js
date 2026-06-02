import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Static guard: every innerHTML assignment in the chatbot must either clear the
// node (assign "") or route its value through sanitizeBotHtml. This catches a
// future edit that reintroduces a raw innerHTML sink for attacker-influenced
// LLM output — the exact regression that Blocker #4 fixed.
const source = readFileSync(
  fileURLToPath(new URL("../../../public/chatbot/chatbot.js", import.meta.url)),
  "utf8",
);

// Identifiers that are bound to a sanitized value, e.g. `const safeHtml = sanitizeBotHtml(...)`.
const sanitizedBindings = new Set(
  [...source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*sanitizeBotHtml\(/g)].map((m) => m[1]),
);

const assignments = [...source.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].trim());

const isSafe = (rhs) =>
  rhs === '""' || rhs === "''" || rhs.includes("sanitizeBotHtml(") || sanitizedBindings.has(rhs);

describe("chatbot innerHTML sinks", () => {
  it("imports the sanitizer", () => {
    expect(source).toMatch(
      /import\s*\{[^}]*sanitizeBotHtml[^}]*\}\s*from\s*["']\.\/sanitize\.js["']/,
    );
  });

  it("finds the expected innerHTML assignments (guard is actually scanning)", () => {
    expect(assignments.length).toBeGreaterThan(0);
  });

  it("routes every innerHTML assignment through the sanitizer or clears it", () => {
    const unsafe = assignments.filter((rhs) => !isSafe(rhs));
    expect(unsafe).toEqual([]);
  });
});
