import { addLoadingMessage } from "./loadingMessage.js";
import { removeMessage } from "./removeMessage.js";

const API_BASE_URL = "http://192.168.178.49:3000"; // api raspi

let toogleButton;
let chatWindow;
let closeButton;
let messagesContainer;
let inputField;
let sendButton;

let currentUser = null;
let moodleToken = null;

const TOKEN_STORAGE_KEY = "moodle_token";
const USER_STORAGE_KEY = "moodle_user";

// function to open and close the chat window
const openChat = async () => {
  chatWindow.classList.remove("hidden");
  toogleButton.classList.add("hidden");
  inputField.focus();

  // load user profile
  await fetchUserProfile();
};

const closeChat = () => {
  chatWindow.classList.add("hidden");
  toogleButton.classList.remove("hidden");
};

// function to convert markdown links to HTML
// Example: [Moodle](https://moodle.org) → <a href="https://moodle.org" target="_blank">Moodle</a>
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

// function to get userId
async function fetchUserProfile(retry = false) {
  try {
    if (currentUser && !retry) {
      return currentUser;
    }

    const session = await ensureUserSession(retry);

    if (session.fromLogin && session.user) {
      setCurrentUser(session.user);
      console.log("User profile fetched:", currentUser);
      return currentUser;
    }

    if (!session.token) {
      throw new Error("Missing Moodle token after login");
    }

    const response = await fetch(`${API_BASE_URL}/moodle/me`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (response.status === 401 && !retry) {
      clearStoredSession();
      return fetchUserProfile(true);
    }

    const data = await response.json();

    if (data.status === "ok") {
      const userData = {
        id: data.user.id,
        firstname: data.user.firstname,
        lastname: data.user.lastname,
        email: data.user.email,
        courses: data.courses, // array of courses
      };

      setCurrentUser(userData);
      console.log("User profile fetched:", currentUser);
      return currentUser;
    }
  } catch (error) {
    if (error.message === "LOGIN_CANCELLED") {
      console.info("Moodle login cancelled by user");
    } else {
      console.warn("Could not fetch userId from API:", error);
    }
  }

  return currentUser;
}

// function to send message
const sendMessageStream = async () => {
  const message = inputField.value.trim();

  if (!message) return;

  if (!currentUser) {
    await fetchUserProfile();
    if (!currentUser) {
      addMessage(
        "Dein Moodle-Profil konnte nicht geladen werden. Bitte versuche es nach einer erneuten Anmeldung erneut."
      );
      return;
    }
  }

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
        user: currentUser,
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

// Initialize when DOM is ready
function initChatbot() {
  // Get DOM elements
  toogleButton = document.getElementById("chatbot-toogle");
  chatWindow = document.getElementById("chatbot-window");
  closeButton = document.getElementById("chatbot-close");
  messagesContainer = document.getElementById("chatbot-messages");
  inputField = document.getElementById("chatbot-input");
  sendButton = document.getElementById("chatbot-send");

  // Check if all elements exist
  if (!toogleButton || !chatWindow || !closeButton || !messagesContainer || !inputField || !sendButton) {
    console.error("Chatbot: Required DOM elements not found");
    return;
  }

  // Restore session
  restoreStoredSession();

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

  console.log("✅ Chatbot initialized");
}

// Initialize when DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChatbot);
} else {
  // DOM already loaded
  initChatbot();
}

function setCurrentUser(userData) {
  currentUser = userData;
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(currentUser));
}

function restoreStoredSession() {
  const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  const storedUser = localStorage.getItem(USER_STORAGE_KEY);

  if (storedToken) {
    moodleToken = storedToken;
  }

  if (storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
    } catch (error) {
      console.warn("Failed to parse stored Moodle user:", error);
      currentUser = null;
    }
  }
}

function clearStoredSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  moodleToken = null;
  currentUser = null;
}

async function ensureUserSession(forceLogin = false) {
  if (!forceLogin && moodleToken) {
    return { token: moodleToken };
  }

  if (!forceLogin) {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken) {
      moodleToken = storedToken;
      return { token: storedToken };
    }
  }

  const credentials = await requestUserCredentials();

  if (!credentials) {
    throw new Error("LOGIN_CANCELLED");
  }

  const response = await fetch(`${API_BASE_URL}/moodle/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  const data = await response.json();

  if (!response.ok || data.status !== "ok" || !data.token) {
    throw new Error(data.message || "Login failed");
  }

  moodleToken = data.token;
  localStorage.setItem(TOKEN_STORAGE_KEY, data.token);

  if (data.user) {
    const userProfile = {
      id: data.user.id,
      firstname: data.user.firstname,
      lastname: data.user.lastname,
      email: data.user.email,
      courses: data.courses || [],
    };

    setCurrentUser(userProfile);

    return {
      token: data.token,
      user: userProfile,
      fromLogin: true,
    };
  }

  return {
    token: data.token,
    fromLogin: true,
  };
}

async function requestUserCredentials() {
  const username = prompt("Bitte gib deinen Moodle-Benutzernamen ein:");

  if (username === null) {
    return null;
  }

  const trimmedUsername = username.trim();

  if (!trimmedUsername) {
    return null;
  }

  const password = prompt("Bitte gib dein Moodle-Passwort ein:");

  if (password === null || password === "") {
    return null;
  }

  return {
    username: trimmedUsername,
    password,
  };
}
