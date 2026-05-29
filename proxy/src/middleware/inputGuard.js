const INJECTION_PATTERNS = [
  /ignore.*instructions/i,
  /ignore.*previous/i,
  /<script/i,
  /jailbreak/i,
  /DAN mode/i,
  /forget everything/i,
  /system prompt/i,
  /you are now/i,
  /roleplay as/i,
  /simulate being/i,
];

/**
 * Validates a user message for type, length, and injection patterns.
 *
 * @param {unknown} msg
 * @returns {string} trimmed message
 * @throws {Error} with statusCode 400 (and isInjectionAttempt true for security hits)
 */
export function validateMessage(msg) {
  if (typeof msg !== "string") {
    throw Object.assign(new Error("Message must be a string."), { statusCode: 400 });
  }

  const trimmed = msg.trim();
  if (trimmed.length < 1 || trimmed.length > 500) {
    throw Object.assign(
      new Error("Message must be between 1 and 500 characters."),
      { statusCode: 400 },
    );
  }

  if (INJECTION_PATTERNS.some((p) => p.test(trimmed))) {
    throw Object.assign(new Error("Invalid input."), {
      statusCode: 400,
      isInjectionAttempt: true,
    });
  }

  return trimmed;
}
