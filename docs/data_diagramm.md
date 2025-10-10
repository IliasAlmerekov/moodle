CLIENT
  │
  │ POST /api/chat { message: "What is Docker?", userId: 5 }
  │
  ↓
┌─────────────────────────────────────────────────────┐
│ ROUTE (chat.route.js)                               │
│ fastify.post("/api/chat", handleChat)               │
│                                                     │       │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────┐
│ CONTROLLER (chatController.js)                      │
│ export async function handleChat(request, reply)    │
│                                                     │
│ 1. Validation: if (!message) return { error }       │
│ 2. call Services:                                   │
│    ├─→ getUserInfo(5)    ──┐                        │
│    └─→ callOllama(prompt) ──┤                       │
│                            │                        │
│                            ↓                        │
│                     ┌──────────────────┐            │
│                     │ SERVICE (moodle) │            │
│                     │ return {         │            │
│                     │   id: 5,         │            │
│                     │   firstname: "J" │            │
│                     │ }                │            │
│                     └──────────────────┘            │
│                            ↓                        │
│                     ┌──────────────────┐            │
│                     │ SERVICE (ollama) │            │
│                     │ return "Docker   │            │
│                     │   is a platform" │            │
│                     └──────────────────┘            │
│                            │                        │
│ 3. Response               ←┘                        │
│                                                     │
│ return controller:                                  │
│ {                                                   │
│   success: true,                                    │
│   user: { id: 5, name: "John Doe" },                │
│   reply: "Docker is a platform..."                  │
│ }                                                   │
└────────────────────┬────────────────────────────────┘
                     │
                     │ Fastify return JSON
                     │
                     ↓
CLIENT get HTTP Response:
Status: 200 OK
Content-Type: application/json

{
  "success": true,
  "user": { "id": 5, "name": "John Doe" },
  "reply": "Docker is a platform..."
}





┌─────────────┐
│  Schüler    │  Richard in Moodle (userid=3)
│  (Richard)  │
└──────┬──────┘
       │
       │ Open Moodle Site
       ↓
┌─────────────────────────────────────────┐
│     Moodle (Homepage)                   │
│  ┌───────────────────────────────────┐  │
│  │  JavaScript code (M.cfg.userid=3) │  │ ← Moodle saved userid on global
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  Chatbot as HTML                  │  │
│  │  chatbot.js load                  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
       │
       │ Richard ask: "Can you get me my courses?"
       ↓
┌─────────────────────────────────────────┐
│  chatbot.js (frontend)                  │
│  1. getUserId() → get    M.cfg.userid   │
│     → search: userid=3                  │
│  2. send POST request:                  │
│     {                                   │
│       message: "Can you get me...",     │
│       userId: 3                         │
│     }                                   │
└─────────────┬───────────────────────────┘
              │
              │ HTTP POST /api/chat-stream
              ↓
┌─────────────────────────────────────────┐
│  Proxy (Fastify on Raspberry Pi)        │
│  chat.route.js:                         │
│  1. Get { message, userId: 3 }          │
│  2. call getUserInfo(3)                 │
│  3. call getUserCourses(3)              │
└─────────────┬───────────────────────────┘
              │
              │ Use ADMIN Token
              ↓
┌─────────────────────────────────────────┐
│  Moodle Web Service API                 │
│  moodle.service.js:                     │
│  1. GET /webservice/rest/server.php?    │
│     wstoken=ADMIN_TOKEN                 │ ← Admin token to all permission
│     wsfunction=core_user_get_users...   │
│     field=id&values[0]=3                │ ← ask userId=3
│                                         │
│  2. Moodle check:                       │
│     - token valid? ✅                   │
│     - has permission? ✅ (admin token)  │
│     - return data userId=3              │
│       { firstname: "Richard", ... }     │
└─────────────┬───────────────────────────┘
              │
              │ Response user data
              ↓
┌─────────────────────────────────────────┐
│  Proxy create context:                  │
│  systemPrompt = `                       │
│    Du hilfst Richard Helmel.            │
│    Kurse:                               │
│    - IT4Billi                           │
│    - Hackathon                          │
│  `                                      │
└─────────────┬───────────────────────────┘
              │
              │ Full prompt
              ↓
┌─────────────────────────────────────────┐
│  Ollama (AI on Laptop)                  │
│  GET:                                   │
│  "Du hilfst Richard Helmel....          │
│   Kurse: IT4Billi, Hackathon            │
│   Frage: Can you get me my...?"         │
│                                         │
│  AI understand context and answer:      │
│  "Du bist in IT4Billi und Hackathon!"   │
└─────────────┬───────────────────────────┘
              │
              │ Streaming response
              ↓
┌─────────────────────────────────────────┐
│  Proxy send data                        │
│  (Server-Sent Events)                   │
└─────────────┬───────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────┐
│  chatbot.js GET response                │
│  and show in UI chat                    │
└─────────────────────────────────────────┘