import { getHistory, clearHistory } from "../services/chatMemory.service.js";

export async function getChatHistory(request, reply) {
  const { chatId } = request.params;
  if (!chatId) {
    reply.code(400);
    return { error: "Chat is required" };
  }

  const message = getHistory(chatId);
  return { chatId, message };
}
export async function resetChatHistory(request, reply) {
  const { chatId } = request.params;
  if (!chatId) {
    reply.code(400);
    return { error: "Chat is required" };
  }

  clearHistory(chatId);
  return { status: "ok" };
}
