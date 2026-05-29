const INJECTION_PATTERNS = [
  /ignore.*instructions/i,
  /ignore.*previous/i,
  /ignore your/i,
  /disregard/i,
  /<script/i,
  /jailbreak/i,
  /DAN mode/i,
  /forget everything/i,
  /system prompt/i,
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
];

/**
 * Validates a user message for type, length, and injection patterns.
 *
 * @param {unknown} msg
 * @param {Object} [opts] - Optional options.
 * @param {Object} [opts.log] - Logger (e.g. request.log). If provided, injection attempts are logged.
 * @param {string} [opts.ip] - Client IP for security audit logging.
 * @returns {string} trimmed message
 * @throws {Error} with statusCode 400 (and isInjectionAttempt true for security hits)
 */
export function validateMessage(msg, { log, ip } = {}) {
  if (typeof msg !== "string") {
    throw Object.assign(new Error("Message must be a string."), { statusCode: 400 });
  }

  const trimmed = msg.trim();
  if (trimmed.length < 1 || trimmed.length > 500) {
    throw Object.assign(new Error("Message must be between 1 and 500 characters."), {
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
