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

// function to send message

const sendMessage = async () => {
  const message = inputField.value.trim();

  if (!message) return;

  addMessage(message, true);

  inputField.value = "";
  sendButton.disabled = true;

  // here will request to backend

  setTimeout(() => {
    addMessage("Danke für deine Nachricht! KI wird bald verfügbar sein.");
    sendButton.disabled = false;
    inputField.focus();
  }, 1000);
};

// event listeners
toogleButton.addEventListener("click", openChat);
closeButton.addEventListener("click", closeChat);
sendButton.addEventListener("click", sendMessage);

// allow sending message with Enter key

inputField.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});
