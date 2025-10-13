import { addLoadingMessage } from "./loadingMessage.js";
import { removeMessage } from "./removeMessage.js";

const API_BASE_URL = "http://192.168.178.49:3000"; // api raspi

const toogleButton = document.getElementById("chatbot-toogle");
const chatWindow = document.getElementById("chatbot-window");
const closeButton = document.getElementById("chatbot-close");
const messagesContainer = document.getElementById("chatbot-messages");
const inputField = document.getElementById("chatbot-input");
const sendButton = document.getElementById("chatbot-send");

// function to open and close the chat window
const openChat = () => {
  chatWindow.classList.remove("hidden");
  toogleButton.classList.add("hidden");
  inputField.focus();
};

const closeChat = () => {
  chatWindow.classList.add("hidden");
  toogleButton.classList.remove("hidden");
};

// function to convert markdown links to HTML
// Example: [Moodle](https://moodle.org) -> <a href="https://moodle.org" target="_blank">Moodle</a>
const convertMarkdownLinks = (text) => {
  // Convert markdown links [text](url) to HTML <a> tags
  // Opens links in new tab with security attributes
  return text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
};

// function to add messages to the chat window
const addMessage = (content, isUser = false) => {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user-message" : "bot-message"}`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  if (isUser) {
    // User messages as plain text (for security)
    contentDiv.textContent = content;
  } else {
    // Bot messages support links
    contentDiv.innerHTML = convertMarkdownLinks(content);
  }

  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

async function detectMoodleUser() {
  const profileLink =
    document.querySelector('#usermenu a[href*="/user/profile.php"]') ||
    document.querySelector('#usermenu a[href*="/user/view.php"]') ||
    document.querySelector('a[href*="/user/profile.php?id="]') ||
    document.querySelector('a[href*="/user/view.php?id="]');

  if (!profileLink) return null;

  const url = new URL(profileLink.href, window.location.origin);
  const id = Number(url.searchParams.get("id"));
  if (!id) return null;

  return {
    id: Number(id),
  };
}

const moodleUserId = await detectMoodleUser();

// function to send message
const sendMessageStream = async () => {
  const message = inputField.value.trim();

  if (!message) return;

  addMessage(message, true);
  inputField.value = "";
  sendButton.disabled = true;

  const loadingId = addLoadingMessage(messagesContainer);

  const botMessageDiv = createEmptyBotMessage();
  const contentDiv = botMessageDiv.querySelector(".message-content");

  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message,
        userId: moodleUserId.id,
      }),
    });

    removeMessage(loadingId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, { stream: true });

      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          // Strip "data: " prefix if present (SSE format)
          const jsonStr = line.startsWith("data: ") ? line.substring(6) : line;

          // Skip [DONE] signal
          if (jsonStr === "[DONE]") {
            continue;
          }

          const data = JSON.parse(jsonStr);

          // Handle both "response" and "text" fields
          const text = data.response || data.text || "";
          if (text) {
            // Append text and convert markdown links
            const currentText = contentDiv.textContent + text;
            contentDiv.innerHTML = convertMarkdownLinks(currentText);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        } catch (e) {
          console.warn("Failed to parse chunk:", line, e);
        }
      }
    }
  } catch (error) {
    removeMessage(loadingId);
    console.error("Error:", error);
    contentDiv.innerHTML =
      "Entschuldigung, es gab ein Problem bei der Verarbeitung Ihrer Anfrage.";
  } finally {
    sendButton.disabled = false;
    inputField.focus();
  }
};

function createEmptyBotMessage() {
  const messageDiv = document.createElement("div");
  messageDiv.classList = "message bot-message";

  const contentDiv = document.createElement("div");
  contentDiv.classList = "message-content";
  contentDiv.textContent = "";

  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  return messageDiv;
}

// event listeners
toogleButton.addEventListener("click", openChat);
closeButton.addEventListener("click", closeChat);
sendButton.addEventListener("click", sendMessageStream);

// allow sending message with Enter key

inputField.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessageStream();
  }
});
