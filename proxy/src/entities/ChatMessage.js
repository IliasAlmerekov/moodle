const VALID_ROLES = ["user", "assistant"];

export function createChatMessage({ role, content, timestamp }) {
  if (!VALID_ROLES.includes(role)) {
    throw Object.assign(new Error(`Invalid role: ${role}`), { statusCode: 400 });
  }
  if (!content?.trim()) {
    throw Object.assign(new Error("Content cannot be empty"), { statusCode: 400 });
  }
  return Object.freeze({
    role,
    content: content.trim(),
    timestamp: timestamp ?? Date.now(),
  });
}
