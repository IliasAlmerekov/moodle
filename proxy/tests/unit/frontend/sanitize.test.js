// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from "vitest";

let sanitizeBotHtml;
let origin;

beforeAll(async () => {
  origin = globalThis.window.location.origin;
  ({ sanitizeBotHtml } = await import("../../../public/chatbot/sanitize.js"));
});

describe("sanitizeBotHtml", () => {
  it("strips <script> tags", () => {
    const out = sanitizeBotHtml("hi<script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).toContain("hi");
  });

  it("strips inline event handlers", () => {
    const out = sanitizeBotHtml('<b onmouseover="alert(1)">x</b>');
    expect(out).not.toContain("onmouseover");
    expect(out).toContain("<b>x</b>");
  });

  it("removes <img> with onerror payload", () => {
    const out = sanitizeBotHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("onerror");
  });

  it("removes <iframe>", () => {
    const out = sanitizeBotHtml('<iframe src="https://evil.test"></iframe>');
    expect(out).not.toContain("<iframe");
  });

  it("keeps whitelisted formatting tags", () => {
    const out = sanitizeBotHtml("<ul><li><b>a</b></li></ul>");
    expect(out).toBe("<ul><li><b>a</b></li></ul>");
  });

  it("keeps same-origin links and forces safe target/rel", () => {
    const out = sanitizeBotHtml(`<a href="${origin}/course/view.php?id=5">course</a>`);
    expect(out).toContain(`href="${origin}/course/view.php?id=5"`);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("strips href on cross-origin links but keeps the text", () => {
    const out = sanitizeBotHtml('<a href="https://evil.test/steal">click</a>');
    expect(out).not.toContain("href");
    expect(out).toContain("click");
  });

  it("strips javascript: hrefs", () => {
    const out = sanitizeBotHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("href");
  });

  it("returns empty string for nullish input", () => {
    expect(sanitizeBotHtml(null)).toBe("");
    expect(sanitizeBotHtml(undefined)).toBe("");
  });
});
