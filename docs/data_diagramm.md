# End-to-End Chatbot Workflow

This document walks through the full lifecycle of a chat message, from the moment a Moodle user opens the widget to the point where the AI response is streamed back into the UI. Each stage lists the main actors, the files that implement the logic, and concrete data examples to help you map the flow into a mindmap.

## 1. User Actions and Frontend Boot Sequence (`proxy/public/chatbot/chatbot.js`)
- The user opens the chatbot toggle on a Moodle page. Helper functions `openChat` / `closeChat` show or hide the panel and focus the input.
- On script load, `fetchUserId()` sends a `GET` request to `/moodle/whoami`. If successful, it stores the Moodle `userId` in memory and `localStorage`.
- The user types a question and presses *Send* (or hits Enter). `sendMessageStream()` appends the user bubble, clears the input, disables the button, and injects a loading indicator via `addLoadingMessage`.

**Example initial user info request**
```http
GET http://<proxy-host>:3000/moodle/whoami
Accept: application/json
```
```json
{
  "status": "ok",
  "userId": 42,
  "username": "student42",
  "firstname": "Alex",
  "lastname": "Doe"
}
```

## 2. Sending the Chat Message to the Proxy Server
- `sendMessageStream()` issues a `POST` to `/api/chat-stream` with the message text and the resolved `userId`.
- The frontend expects a text/event-stream (Server-Sent Events, SSE) response. Once headers arrive, the spinner is removed and an empty bot bubble is added to accumulate the answer.
- Streaming chunks are read through a `ReadableStreamReader`; each chunk is decoded before being split into SSE lines.

**Example request payload**
```http
POST http://<proxy-host>:3000/api/chat-stream
Content-Type: application/json

{
  "message": "Could you summarise the last lecture?",
  "userId": 42
}
```

## 3. Fastify Routing Pipeline (`proxy/src/server.mjs`, `proxy/src/routes/chat.route.js`)
- `server.mjs` bootstraps Fastify, registers CORS, serves static assets, and mounts all route modules.
- `chat.route.js` attaches `fastify.post("/api/chat-stream", handleChatStream)`; every chat submission lands here before hitting the controller.
- During startup, the server logs missing environment variables so operators see misconfigurations early.

## 4. Chat Controller Business Logic (`proxy/src/controllers/chatController.js`)
- `handleChatStream` validates the payload: if `message` is empty, it returns `400 Bad Request`.
- It logs the incoming question and attempts to build a personalised system prompt with Moodle data via `buildSystemPrompt(userId, logger)`.
- The final prompt concatenates the system context and the German marker `die Frage: <message>`, keeping the conversation format consistent.
- `callOllamaStream(fullPrompt, config.ollama.model)` is invoked to obtain an AI-generated streaming response. Errors are caught and translated into `502` responses when possible.

**Example constructed prompt**
```
Du unterstützt Alex Doe.
Aktuell ist der Benutzer in folgenden Kursen eingeschrieben:
- Einführung in KI
- Datenbanken I

### Antwortformat:
1. Verstehen der Frage im Kontext des Kurses
...

die Frage: Could you summarise the last lecture?
```

## 5. Moodle Integration (`proxy/src/services/moodle.service.js`, `proxy/src/controllers/moodleController.js`)
- `callMoodleAPI(functionName, params)` builds `MOODLE_URL/webservice/rest/server.php` with query parameters `wstoken`, `wsfunction`, `moodlewsrestformat=json`, plus the specific args.
- `getUserInfo(userId)` wraps `core_user_get_users_by_field` and returns the first matching profile.
- `getUserCourses(userId)` uses `core_enrol_get_users_courses` to retrieve course enrolments; the controller converts this into bullet points for the system prompt.
- Public endpoints exposed by Fastify (`/moodle/whoami`, `/moodle/user/:userId`, `/moodle/user/:userId/courses`) provide diagnostics and support the frontend.

**Example Moodle REST call**
```http
GET https://moodle.example.edu/webservice/rest/server.php?\
wstoken=XYZ123&wsfunction=core_enrol_get_users_courses&\
userid=42&moodlewsrestformat=json
```
```json
[
  {
    "id": 7,
    "fullname": "Einführung in KI",
    "shortname": "AI101"
  },
  {
    "id": 9,
    "fullname": "Datenbanken I",
    "shortname": "DB1"
  }
]
```

## 6. Ollama Integration (`proxy/src/services/ollama.service.js`)
- `callOllamaStream(prompt, model)` posts to `OLLAMA_URL/api/generate` with `stream: true`.
- If `OLLAMA_URL` or the HTTP status is invalid, an exception is thrown and handled by the controller, triggering a `502` response upstream.
- The function resolves with the raw `ReadableStream`, leaving message framing to `streamOllamaResponse`.

**Example Ollama request body**
```json
{
  "model": "llama3:latest",
  "prompt": "Du unterstützt Alex Doe...\ndie Frage: Could you summarise the last lecture?",
  "stream": true
}
```

## 7. Streaming the AI Response Back to the Client
- Successfully obtaining the stream, the controller sets SSE-friendly headers:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
  - plus permissive CORS headers.
- `streamOllamaResponse` reads the Ollama stream chunk-by-chunk. Each chunk is parsed as JSON and rewrapped as SSE lines (`data: {...}\n\n`) for the browser.
- When Ollama signals completion (`json.done === true`) or the stream ends, the controller sends `data: [DONE]` and closes the connection.

**Example SSE emission**
```
data: {"text":"Natürlich! In der letzten Vorlesung haben wir über neuronale Netze gesprochen."}

data: {"text":" Wir haben die Grundstruktur von Perzeptron, Feedforward-Netzen und Backpropagation analysiert."}

data: [DONE]
```

## 8. Client-Side Stream Consumption
- The browser reads the SSE response using the `ReadableStreamReader` returned by `response.body.getReader()`.
- Every decoded chunk is split on newline; lines that start with `data: ` are trimmed and parsed.
- Fields `response` or `text` are appended directly to the current bot message, creating the typewriter effect.
- `[DONE]` terminates the loop, re-enables the send button, and refocuses the text field so the user can keep chatting.

## 9. Configuration and Environment Checks (`proxy/src/config/env.js`)
- Required environment variables:
  - `MOODLE_URL`
  - `MOODLE_TOKEN`
  - `OLLAMA_URL`
  - `OLLAMA_MODEL`
  - `PORT` (optional, defaults to `3000`)
- URLs are normalised to drop trailing slashes; boolean `isConfigured` flags help controllers detect missing integrations.
- At startup, the server logs `Missing required environment variables: ...` if any entries are absent.

## 10. Error Handling and Resilience
- **Client side**
  - Network or parsing errors display: “Entschuldigung, es gab ein Problem…” while keeping the UI interactive.
  - Local `localStorage` preserves the last known Moodle `userId`, allowing retries if `/moodle/whoami` temporarily fails.
- **Server side**
  - `400 Bad Request` when `message` is absent.
  - `502 Bad Gateway` if Ollama cannot be reached or returns a non-OK status.
  - Missing Moodle context downgrades to the default system prompt with an informative log warning.
  - All external calls use `try/catch` to avoid crashing the Fastify worker.

## 11. Mindmap-Friendly Summary
1. **Client widget** loads, fetches current Moodle user, prepares UI.
2. **User submits message** → browser sends `POST /api/chat-stream` with `{ message, userId }`.
3. **Fastify route** passes the request to `handleChatStream`.
4. **Controller** builds a personalised prompt using Moodle services (fallback to default if needed).
5. **Ollama service** generates a streaming response based on the prompt.
6. **Server streaming** repackages Ollama chunks into SSE and sends them to the browser.
7. **Frontend renderer** appends each chunk, closes on `[DONE]`, and reopens the input field for follow-up questions.

When building a mindmap, consider separate branches for *Client UI*, *Proxy/Fastify*, *Moodle API*, *Ollama AI*, *Streaming layer*, and *Error handling*. The data examples above can be attached as notes to illustrate payloads at each integration point.
