export async function getHistory({ sessionId, chatRepository, limit }) {
  return chatRepository.getHistory(sessionId, limit);
}
