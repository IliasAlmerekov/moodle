## NotebookLM Message Journey

This is the kid-friendly tour of how a single message travels through our setup.

### Step 1 — Moodle Chat Window (Raspberry Pi)
- The student pops open the Moodle chat bubble, types a question, and presses send.
- The widget (`public/chatbot/chatbot.js`) posts the text to `http://192.168.178.49:3000/api/chat-stream`.
- The JSON body looks like `{ "message": "...", "userId": 123 }`, so the proxy knows both the words and who wrote them.

### Step 2 — Raspberry Pi Proxy Hears the Knock
- Fastify listens on `/api/chat-stream` and triggers `handleChatStream` (`proxy/src/controllers/chatController.js`).
- The controller grabs the user profile and list of enrolled courses from Moodle (`moodle.service.js`) and caches them for a short time.
- It also restores the chat history from memory and pulls fresh course snippets using the smart search helper (`courseSearch.service.js`).

### Step 3 — Build the Prompt Packet
- With the profile, history, and course context in hand, the proxy writes a single prompt that tells the assistant who is asking, what they are studying, and what they just said.
- The message bundle includes:
  - system instructions with Moodle context,
  - the running dialogue,
  - the student’s brand-new question.

### Step 4 — Send It to Ollama on the Laptop
- `ollama.service.js` streams that bundle over to `OLLAMA_URL/api/generate`, which points to the laptop where Ollama runs the Gemma 2.5 model (NotebookLM).
- Ollama answers chunk by chunk, so the proxy starts forwarding text the moment it appears instead of waiting for the full reply.

### Step 5 — Paint the Answer Live
- The browser keeps an open SSE connection, receives each chunk, and turns it into chat bubbles.
- Markdown links arrive in the text and are converted to clickable anchors right away.
- When the proxy sends `[DONE]`, the widget removes the loading dots and the student can ask the next question.

So the full ride is:
`Moodle chat widget → Fastify proxy on Raspberry Pi → Moodle data + cached courses → Ollama (Gemma 2.5) on the laptop → live SSE response back into Moodle`.

Same roller coaster every time—only the questions change.
