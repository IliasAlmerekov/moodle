// Best-effort, defense-in-depth ONLY. This blocklist is a cheap first filter,
// not the security boundary. The real guarantees are architectural: the system
// prompt is not a secret, no secrets are reachable by the model, and course
// search is fail-closed to the user's own enrolments (see streamChat.js). A
// determined attacker can bypass any keyword list via paraphrase, obfuscation,
// or another language — do not rely on it. Patterns are deliberately scoped to
// limit false positives on legitimate course questions (e.g. "Was ist ein
// System Prompt?" or "wie aktiviere ich den Developer Mode?" must pass).
const INJECTION_PATTERNS = [
  /ignore.*instructions/i,
  /ignore.*previous/i,
  /ignore your/i,
  // Scoped: only flag "disregard" aimed at instructions, not casual usage.
  /disregard.*(?:instruction|previous|above|prior|rule|prompt)/i,
  /<script/i,
  /jailbreak/i,
  /DAN mode/i,
  /forget everything/i,
  // Scoped: a leading verb/possessive must precede "system prompt" so that
  // merely mentioning the term in a genuine question does not trip the filter.
  /(?:reveal|show|print|repeat|output|leak|your|the)\s+(?:the\s+)?system[- ]?prompt/i,
  /leak.*(?:prompt|instructions)/i,
  /reveal.*(?:prompt|instructions)/i,
  /output.*initialization/i,
  /print.*initialization/i,
  /show.*initialization/i,
  /pretend to be/i,
  /you are now/i,
  /roleplay as/i,
  /simulate being/i,
  /<\?php/i,
  /<\?=/i,
  /javascript:/i,
  /on(?:error|load|click)=/i,
  // German-language variants — the primary audience is German-speaking
  // students, so English-only patterns would miss the obvious attempts.
  /ignoriere.*(?:anweisung|vorherige|alle|regel)/i,
  /vergiss.*(?:alles|anweisung)/i,
  /(?:zeig|verrat|gib).*system[- ]?prompt/i,
];

/**
 * Validates a user message for type, length, and injection patterns.
 *
 * @param {unknown} msg
 * @param {Object} [opts] - Optional options.
 * @param {Object} [opts.log] - Logger (e.g. request.log). If provided, injection attempts are logged.
 * @param {string} [opts.ip] - Client IP for security audit logging.
 * @param {number} [opts.maxLength=500] - Max allowed length; callers pass config.chat.maxMessageLength.
 * @returns {string} trimmed message
 * @throws {Error} with statusCode 400 (and isInjectionAttempt true for security hits)
 */
export function validateMessage(msg, { log, ip, maxLength = 500 } = {}) {
  if (typeof msg !== "string") {
    throw Object.assign(new Error("Message must be a string."), { statusCode: 400 });
  }

  const trimmed = msg.trim();
  if (trimmed.length < 1 || trimmed.length > maxLength) {
    throw Object.assign(new Error(`Message must be between 1 and ${maxLength} characters.`), {
      statusCode: 400,
    });
  }

  if (INJECTION_PATTERNS.some((p) => p.test(trimmed))) {
    if (log && typeof log.warn === "function") {
      log.warn({ security: true, type: "injection_attempt", ip });
    }
    throw Object.assign(new Error("Invalid input."), {
      statusCode: 400,
      isInjectionAttempt: true,
    });
  }

  return trimmed;
}
