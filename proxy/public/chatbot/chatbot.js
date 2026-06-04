import { addLoadingMessage } from "./loadingMessage.js";
import { removeMessage } from "./removeMessage.js";
import { sanitizeBotHtml } from "./sanitize.js";

const CHATBOT_CONFIG = window.CHATBOT_CONFIG ?? {};

function normalizeApiUrl(raw) {
  if (!raw) return window.location.origin;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return window.location.origin;
    return url.origin;
  } catch {
    return window.location.origin;
  }
}

const API_BASE_URL = normalizeApiUrl(CHATBOT_CONFIG.apiUrl);

// Signed identity token minted server-side by the Moodle embed snippet.
// The proxy verifies the HMAC signature; an unsigned request is rejected (401).
const AUTH_TS = CHATBOT_CONFIG.ts;
const AUTH_SIG = CHATBOT_CONFIG.sig;

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
  toogleButton.setAttribute("aria-expanded", "true");
  inputField.focus();
};

const closeChat = () => {
  abortActiveStream({ userInitiated: true }); // stop any in-flight stream
  chatWindow.classList.add("hidden");
  toogleButton.classList.remove("hidden");
  toogleButton.setAttribute("aria-expanded", "false");
  toogleButton.focus(); // return focus to the trigger for keyboard/SR users
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
    // Bot messages may contain formatting (links, lists) — render through the
    // sanitizer so persisted/restored LLM output cannot inject scripts.
    contentDiv.innerHTML = sanitizeBotHtml(content);
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
const historyKey = (chatId) => `chat-history:${chatId}`;

// Signed identity as request headers for chat-history GET/DELETE (no body).
// Headers (not the query string) keep userId/ts/sig out of access logs, browser
// history and the Referer header (F-08).
function authHeaders() {
  const headers = {};
  if (moodleUser?.id != null) headers["X-Chat-User"] = String(moodleUser.id);
  if (AUTH_TS != null) headers["X-Chat-Ts"] = String(AUTH_TS);
  if (AUTH_SIG != null) headers["X-Chat-Sig"] = String(AUTH_SIG);
  return headers;
}

function parsePositiveInteger(value) {
  const number = value != null ? Number(value) : null;
  return Number.isInteger(number) && number > 0 ? number : null;
}

// Save message to localStorage
const saveMessageToHistory = (chatId, role, content) => {
  if (!chatId) return;

  const key = historyKey(chatId);
  const history = JSON.parse(localStorage.getItem(key) || "[]");
  history.push({ role, content, timestamp: Date.now() });

  // Keep only last 50 messages
  const trimmed = history.slice(-50);
  localStorage.setItem(key, JSON.stringify(trimmed));
};

// Locally cached transcript is expired after this long so a previous student's
// conversation cannot linger on a shared/lab machine indefinitely (F-09).
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

// Load history from localStorage
const loadHistoryFromStorage = (chatId) => {
  if (!chatId) return [];
  const key = historyKey(chatId);
  const stored = JSON.parse(localStorage.getItem(key) || "[]");
  // Drop the cached transcript once its newest entry is older than the TTL.
  const newest = stored.length ? stored[stored.length - 1]?.timestamp ?? 0 : 0;
  if (stored.length && Date.now() - newest > HISTORY_TTL_MS) {
    localStorage.removeItem(key);
    return [];
  }
  return stored;
};

let moodleUser = null;
let chatId = null;

// Tracks the in-flight streaming request so it can be cancelled when the user
// closes the window or sends a new message, and so a stalled stream is bounded
// by a watchdog timeout instead of hanging forever (F-11).
let activeStreamController = null;
const STREAM_IDLE_TIMEOUT_MS = 60_000;

function abortActiveStream({ userInitiated = false } = {}) {
  if (activeStreamController) {
    activeStreamController.userInitiated = userInitiated;
    activeStreamController.abort();
    activeStreamController = null;
  }
}

async function initChat() {
  const configUserId = parsePositiveInteger(CHATBOT_CONFIG.userId);
  const moodleGlobalUserId = parsePositiveInteger(window.M?.cfg?.userid);
  const detectedUserId = configUserId ?? moodleGlobalUserId;
  moodleUser = detectedUserId ? { id: detectedUserId } : await detectMoodleUser();
  if (!moodleUser) return;

  chatId =
    localStorage.getItem(storageKey(moodleUser.id)) ||
    generateChatId(moodleUser.id);

  localStorage.setItem(storageKey(moodleUser.id), chatId);

  await restoreChatHistory();
}

async function restoreChatHistory() {
  try {
    // first try to load history from localStorage
    const localHistory = loadHistoryFromStorage(chatId);

    if (localHistory.length > 0) {
      messagesContainer.innerHTML = "";
      localHistory.forEach((msg) =>
        addMessage(msg.content, msg.role === "user")
      );
      return;
    }

    // if no local history, fetch from server
    const response = await fetch(`${API_BASE_URL}/api/chat-history/${chatId}`, {
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    const messages = Array.isArray(data.messages) ? data.messages : [];

    messagesContainer.innerHTML = "";

    if (!messages.length) {
      addMessage(
        "Hallo! Ich bin dein AI-Assistent. Wie kann ich dir helfen?",
        false
      );
      return;
    }
    messages.forEach((msg) => addMessage(msg.content, msg.role === "user"));
  } catch (error) {
    console.warn("Error restoring chat history:", error);
    // If there's an error, show a welcome message
    messagesContainer.innerHTML = "";
    addMessage(
      "Hallo! Ich bin dein AI-Assistent. Wie kann ich dir helfen?",
      false
    );
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

// Renders a dismissible error bubble with a retry affordance. Built with DOM
// APIs (no innerHTML) so it stays clear of the sanitizer guard; role="alert"
// makes screen readers announce it. `onRetry` re-runs the failed request.
const addErrorMessage = (onRetry) => {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message bot-message error-message";
  messageDiv.setAttribute("role", "alert");

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.textContent =
    "Entschuldigung, es gab ein Problem bei der Verarbeitung Ihrer Anfrage.";

  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.className = "chatbot-retry";
  retryButton.textContent = "Erneut versuchen";
  retryButton.addEventListener("click", () => {
    messageDiv.remove();
    onRetry();
  });

  contentDiv.appendChild(document.createElement("br"));
  contentDiv.appendChild(retryButton);
  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

// Performs the streaming request for an already-displayed user message. Split
// from sendMessageStream so a retry re-runs only the request, without
// duplicating the user bubble or its history entry.
const streamAndRender = async (message) => {
  sendButton.disabled = true;
  messagesContainer.setAttribute("aria-busy", "true"); // announce work in progress (F-17)
  const loadingId = addLoadingMessage(messagesContainer);

  // Cancel any prior in-flight stream so two streams cannot interleave into the DOM.
  abortActiveStream({ userInitiated: true });
  const controller = new AbortController();
  activeStreamController = controller;

  // Watchdog: if the server stalls (no bytes for STREAM_IDLE_TIMEOUT_MS), abort
  // so the UI is not stuck "thinking" forever. Re-armed on every chunk.
  let watchdog;
  const armWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
  };

  let botMessageDiv = null;
  let contentDiv = null;

  try {
    armWatchdog();
    const response = await fetch(`${API_BASE_URL}/api/chat-stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatId,
        message,
        userId: moodleUser.id,
        ts: AUTH_TS,
        sig: AUTH_SIG,
      }),
      signal: controller.signal,
    });

    removeMessage(loadingId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    if (!response.body) {
      throw new Error("Response has no body stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let latestSessionId = chatId;

    let fullText = "";
    // Carry a trailing partial line between reads: a single SSE JSON record can
    // be split across network chunks, which would otherwise fail JSON.parse and
    // drop a token (F-12).
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      armWatchdog();

      if (done) {
        if (contentDiv) {
          const safeHtml = sanitizeBotHtml(fixBrokenLinks(fullText));
          contentDiv.innerHTML = safeHtml;
          saveMessageToHistory(chatId, "assistant", safeHtml); // save bot response
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const rawLines = buffer.split("\n");
      buffer = rawLines.pop() ?? ""; // keep the last (possibly incomplete) line
      const lines = rawLines.filter((line) => line.trim());

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
            // Create message-content only on the first text chunk
            if (!botMessageDiv) {
              botMessageDiv = createEmptyBotMessage();
              contentDiv = botMessageDiv.querySelector(".message-content");
            }

            fullText += text;
            contentDiv.innerHTML = sanitizeBotHtml(fullText);
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
    // A user-initiated cancel (window closed / new message sent) is not an
    // error — exit quietly without an error bubble.
    if (controller.userInitiated) {
      return;
    }
    console.error("Error:", error);
    // Visible, dismissible error with a retry button (connection drop / 5xx /
    // 429 / stalled stream aborted by the watchdog).
    addErrorMessage(() => streamAndRender(message));
  } finally {
    clearTimeout(watchdog);
    if (activeStreamController === controller) {
      activeStreamController = null;
    }
    messagesContainer.setAttribute("aria-busy", "false");
    sendButton.disabled = false;
    inputField.focus();
  }
};

// function to send message
const sendMessageStream = async () => {
  const message = inputField.value.trim();

  if (!message) return;

  if (!moodleUser) {
    addMessage(
      "Moodle-Benutzer konnte nicht erkannt werden. Bitte lade die Seite neu oder melde dich erneut an.",
      false
    );
    return;
  }

  addMessage(message, true);
  saveMessageToHistory(chatId, "user", message); // save in localStorage
  inputField.value = "";

  await streamAndRender(message);
};

async function startNewChat() {
  try {
    await fetch(`${API_BASE_URL}/api/chat-history/${chatId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  } catch (error) {
    console.warn("Failed to reset chat history:", error);
  }

  // Clear localStorage for old chatId
  localStorage.removeItem(historyKey(chatId));

  messagesContainer.innerHTML = "";
  localStorage.removeItem(storageKey(moodleUser.id));
  chatId = generateChatId(moodleUser.id);
  localStorage.setItem(storageKey(moodleUser.id), chatId);

  // Show welcome message
  addMessage(
    "Hallo! Ich bin dein AI-Assistent. Wie kann ich dir helfen?",
    false
  );
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

// allow sending message with Enter key (keydown — keypress is deprecated)
inputField.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessageStream();
  }
});

// Escape closes the open dialog and returns focus to the toggle (F-14).
chatWindow.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !chatWindow.classList.contains("hidden")) {
    closeChat();
  }
});

initChat(); // Initialize chat on page load
