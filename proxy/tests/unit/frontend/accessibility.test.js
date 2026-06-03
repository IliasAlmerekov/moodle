import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Static guard: the embedded chatbot markup must keep its accessibility hooks so
// screen readers announce streamed replies and controls are labelled. Scans the
// shipped HTML rather than a rendered DOM — cheap and dependency-free.
const HTML_FILES = ["index.html", "moodle-embed.html"];

function readHtml(name) {
  return readFileSync(
    fileURLToPath(new URL(`../../../public/chatbot/${name}`, import.meta.url)),
    "utf8",
  );
}

// Extract the opening tag that carries the given id attribute.
function openingTagWithId(html, id) {
  const match = html.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*>`, "s"));
  return match ? match[0] : "";
}

describe.each(HTML_FILES)("chatbot accessibility (%s)", (file) => {
  const html = readHtml(file);

  it("messages container is a polite live region", () => {
    const tag = openingTagWithId(html, "chatbot-messages");
    expect(tag).not.toBe("");
    expect(tag).toMatch(/role="log"/);
    expect(tag).toMatch(/aria-live="polite"/);
  });

  it("text input has an accessible label", () => {
    const tag = openingTagWithId(html, "chatbot-input");
    expect(tag).not.toBe("");
    expect(tag).toMatch(/aria-label="[^"]+"/);
  });

  it("chat window is a labelled dialog", () => {
    const tag = openingTagWithId(html, "chatbot-window");
    expect(tag).not.toBe("");
    expect(tag).toMatch(/role="dialog"/);
    expect(tag).toMatch(/aria-label="[^"]+"/);
  });

  it("toggle button advertises its expanded state", () => {
    const tag = openingTagWithId(html, "chatbot-toogle");
    expect(tag).not.toBe("");
    expect(tag).toMatch(/aria-expanded="(true|false)"/);
  });
});
