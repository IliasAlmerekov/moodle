const SAFE_CHAT_ID = /^[a-zA-Z0-9_-]+$/;

export function sanitizeChatId(chatId) {
  if (typeof chatId !== "string") return null;
  const trimmed = chatId.trim();
  if (trimmed.length > 64) return null;
  if (!SAFE_CHAT_ID.test(trimmed)) return null;
  return trimmed;
}
