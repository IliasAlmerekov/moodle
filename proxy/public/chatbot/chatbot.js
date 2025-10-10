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

// function to add messages to the chat window
const addMessage = (content, isUser = false) => {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user-message" : "bot-message"}`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.textContent = content;

  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

const getUserId = () => {
  let userId = null;

  // === ДИАГНОСТИКА ===
  console.log("🔍 Checking for userId...");
  console.log("window.M exists?", typeof window.M !== "undefined");
  console.log("window.M:", window.M);

  if (window.M) {
    console.log("window.M.cfg exists?", typeof window.M.cfg !== "undefined");
    console.log("window.M.cfg:", window.M.cfg);

    if (window.M.cfg) {
      console.log("window.M.cfg.userid:", window.M.cfg.userid);
    }
  }

  // Try 1: From Moodle global JS object (if available)
  try {
    if (window.M && window.M.cfg && window.M.cfg.userid) {
      userId = window.M.cfg.userid;
      console.log("✅ userId from Moodle global:", userId);
      localStorage.setItem("moodle_userid", userId);
      return userId;
    }
  } catch (error) {
    console.warn("Cannot access Moodle global object:", error);
  }

  // Try 2: From URL parameter (?userid=123)
  if (!userId) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("userid")) {
      userId = urlParams.get("userid");
      console.log("✅ userId from URL parameter:", userId);
      localStorage.setItem("moodle_userid", userId);
      return userId;
    }
  }

  // Try 3: From localStorage (if previously saved)
  if (!userId) {
    userId = localStorage.getItem("moodle_userid");
    if (userId) {
      console.log("✅ userId from localStorage:", userId);
      return userId;
    }
  }

  console.warn("⚠️ No userId found!");
  return null;
};

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
    const userId = getUserId();
    const response = await fetch(`${API_BASE_URL}/api/chat-stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: message, userId: userId }),
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
            contentDiv.textContent += text;
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
    contentDiv.textContent =
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
