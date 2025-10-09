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
│ 2. call Services:                                  │
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