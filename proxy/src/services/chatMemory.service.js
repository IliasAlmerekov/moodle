const MAX_MESSAGES = 12;
const store = new Map();

export function appendMessage(chatId, role, content) {
  if (!chatId) return;
  const history = store.get(chatId) ?? [];
  history.push({ role, content });
  store.set(chatId, history.slice(-MAX_MESSAGES));
}

export function getHistory(chatId) {
  return (chatId && store.get(chatId)) ?? [];
}

export function clearHistory(chatId) {
  store.delete(chatId);
}
