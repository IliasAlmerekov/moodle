export function addLoadingMessage(messagesContainer) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message bot-message";
  messageDiv.id = "loading-message";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  // Built with DOM APIs (no innerHTML) so this file carries no raw HTML sink,
  // even for a static string (F-02).
  const indicator = document.createElement("span");
  indicator.className = "typing-indicator";
  indicator.textContent = "●●●";
  contentDiv.appendChild(indicator);

  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  return "loading-message";
}
