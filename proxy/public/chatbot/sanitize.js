import DOMPurify from "./vendor/purify.es.mjs";

const CHATBOT_CONFIG = window.CHATBOT_CONFIG ?? {};

// LLM output is attacker-influenced (a user can phrase a message so the model
// echoes HTML) and is persisted, then re-rendered from localStorage/server.
// It must never reach innerHTML unsanitized. CSP without 'unsafe-inline' is a
// backstop, not the primary control — this sanitizer is the boundary.

// Bot replies link to Moodle course materials. The widget is embedded in Moodle
// pages, so the Moodle origin equals window.location.origin; CHATBOT_CONFIG.moodleUrl
// allows an explicit override. Anchors pointing anywhere else are stripped, so the
// model cannot smuggle links to attacker-controlled destinations.
const allowedLinkOrigin = (() => {
  try {
    return new URL(CHATBOT_CONFIG.moodleUrl ?? window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
})();

// Whitelist: only inline formatting and lists the assistant actually emits.
// No <img>, <iframe>, <script>, <style>, no data-* and no event handlers.
const ALLOWED_TAGS = [
  "a",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "p",
  "br",
  "code",
  "pre",
];
const ALLOWED_ATTR = ["href", "target", "rel"];

// Harden every surviving anchor: keep href only when it resolves to the Moodle
// origin over http(s); otherwise downgrade the link to inert text. Force a safe
// target/rel pair to avoid reverse-tabnabbing.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "A") return;

  const href = node.getAttribute("href");
  let isSafe = false;
  if (href) {
    try {
      const url = new URL(href, allowedLinkOrigin);
      isSafe =
        (url.protocol === "https:" || url.protocol === "http:") &&
        url.origin === allowedLinkOrigin;
    } catch {
      isSafe = false;
    }
  }

  if (isSafe) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  } else {
    node.removeAttribute("href");
    node.removeAttribute("target");
  }
});

export function sanitizeBotHtml(dirty) {
  return DOMPurify.sanitize(dirty ?? "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
