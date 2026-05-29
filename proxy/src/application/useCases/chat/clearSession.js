export async function clearSession({ sessionId, chatRepository }) {
  await chatRepository.clearSession(sessionId);
  return { cleared: true, sessionId };
}
