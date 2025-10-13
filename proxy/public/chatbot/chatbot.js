import { addLoadingMessage } from "./loadingMessage.js";
import { removeMessage } from "./removeMessage.js";

const API_BASE_URL = "http://192.168.137.102:3000"; // api raspi

const toogleButton = document.getElementById("chatbot-toogle");
const chatWindow = document.getElementById("chatbot-window");
const closeButton = document.getElementById("chatbot-close");
const messagesContainer = document.getElementById("chatbot-messages");
const inputField = document.getElementById("chatbot-input");
const sendButton = document.getElementById("chatbot-send");
const newChatButton = document.getElementById("chatbot-new-chat");

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

// Fix broken HTML links (when <a is missing from stream)
// Example: href="url" target="_blank">text</a> -> <a href="url" target="_blank">text</a>
const fixBrokenLinks = (text) => {
  // Fix missing <a tag
  let fixed = text.replace(
    /href="([^"]+)"\s+target="_blank">([^<]+)<\/a>/g,
    '<a href="$1" target="_blank">$2</a>'
  );

  // Also fix URLs without proper link tags - convert plain URLs to clickable links
  fixed = fixed.replace(/(https?:\/\/[^\s<>"]+)/g, (match, url) => {
    // Don't replace if already inside an <a> tag
    if (fixed.indexOf(`href="${url}"`) !== -1) {
      return match;
    }
    return `<a href="${url}" target="_blank">${url}</a>`;
  });

  return fixed;
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
    // Bot messages: Render HTML directly (for links like <a href="...">)
    // NO escaping - HTML tags should work!
    contentDiv.innerHTML = content;
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

const storageKey = (userId) => `chat-session:${userId}`;

let moodleUser = null;
let chatId = null;

async function initChat() {
  moodleUser = await detectMoodleUser();
  if (!moodleUser) return;

  chatId =
    localStorage.getItem(storageKey(moodleUser.id)) ||
    generateChatId(moodleUser.id);

  localStorage.setItem(storageKey(moodleUser.id), chatId);

  await restoreChatHistory();
}

async function restoreChatHistory() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-history/${chatId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    messagesContainer.innerHTML = "";

    if (!data.messages.length) {
      addMessage(
        "Hallo! Ich bin dein AI-Assistent. Wie kann ich dir helfen?",
        false
      );
      return;
    }
    data.messages.forEach((msg) =>
      addMessage(msg.content, msg.role === "user")
    );
  } catch (error) {
    console.warn("Error restoring chat history:", error);
  }
}

function generateChatId(userId) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `moodle-${userId}-${crypto.randomUUID()}`;
  }

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
    const random = template.replace(/[xy]/g, (c) => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    return `moodle-${userId}-${random}`;
  }

  const fallback =
    Date.now().toString(36) + Math.random().toString(36).slice(2);
  return `moodle-${userId}-${fallback}`;
}

// function to send message
const sendMessageStream = async () => {
  const message = inputField.value.trim();

  if (!message || moodleUser) return;

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
        chatId,
        message,
        userId: moodleUser.id,
      }),
    });

    removeMessage(loadingId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let latestSessionId = chatId;

    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        const fixedText = fixBrokenLinks(fullText);
        contentDiv.innerHTML = fixedText;
        break;
      }

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
          if (data.sessionId && data.sessionId !== chatId) {
            chatId = data.sessionId;
            latestSessionId = data.sessionId;
            localStorage.setItem(storageKey(moodleUser.id), chatId);
          }

          // Handle both "response" and "text" fields
          const text = data.response || data.text || "";
          if (text) {
            fullText += text;
            contentDiv.innerHTML = fullText;
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        } catch (e) {
          console.warn("Failed to parse chunk:", line, e);
        }
      }
    }

    localStorage.setItem(storageKey(moodleUser.id), latestSessionId);
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

async function startNewChat() {
  try {
    await fetch(`${API_BASE_URL}/api/chat-history/${chatId}`, {
      method: "DELETE",
    });
  } catch (error) {
    console.warn("Failed to reset chat history:", error);
  }

  messagesContainer.innerHTML = "";
  localStorage.removeItem(storageKey(moodleUser.id));
  chatId = generateChatId(moodleUser.id);
  localStorage.setItem(storageKey(moodleUser.id), chatId);
}

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
newChatButton.addEventListener("click", startNewChat);

// allow sending message with Enter key

inputField.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessageStream();
  }
});

initChat(); // Initialize chat on page load
