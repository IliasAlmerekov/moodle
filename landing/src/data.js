// Content model for the landing — grounded in the project's source code
// (package.json, streamChat.js, auth.js, inputGuard.js, fastify.js).
// All numbers and code snippets are real; nothing is aspirational.

import { Shield, Layers, FlaskConical, Sparkles } from 'lucide-react'

// =====================================================================
// PROGRESS — before/after snapshot for the jury-facing "Progress at a
// glance" section. Drives the interactive tab-stepper: one card visible
// at a time, big icon, big metric, one Before/After row.
// Numbers are sourced from PROJECT_STATE.md, not invented.
// =====================================================================
export const PROGRESS = [
  {
    id: '01',
    title: 'Security',
    icon: Shield,
    short: 'Hardcoded IPs and missing guards — closed end-to-end.',
    beforeCode: 'fetch("http://192.168.178.84:3000/api/chat")',
    afterCode: 'fetch(process.env.PUBLIC_MOODLE_URL + "/api/chat")',
    metric: '9',
    metricLabel: 'security fixes shipped',
  },
  {
    id: '02',
    title: 'Architecture',
    icon: Layers,
    short: 'From one 370-line file to four inward-only layers.',
    beforeCode: 'src/chatController.js (370 lines, mixed concerns)',
    afterCode: 'streamChat + createChatController + ollamaClient',
    metric: '4 / 81',
    metricLabel: 'layers · roadmap tasks',
  },
  {
    id: '03',
    title: 'Quality',
    icon: FlaskConical,
    short: 'Zero tests and no CI gate — a full quality net, in place.',
    beforeCode: 'npm test → no tests found',
    afterCode: '36 files · 376 tests · 0 vulns · CI green',
    metric: '0 → 376',
    metricLabel: 'tests, 0 audit hits, 3 CI jobs',
  },
  {
    id: '04',
    title: 'UX',
    icon: Sparkles,
    short: 'Blocking answers with no accessibility — streamed and a11y-first.',
    beforeCode: 'setTimeout(poll, 1000); showSpinner()',
    afterCode: 'EventSource("/api/chat-stream"); role="log"',
    metric: 'a11y 0 → 8',
    metricLabel: 'accessibility tests + retry UI',
  },
]

// =====================================================================
// ARCHITECTURE — labelled flow of one chat request, end-to-end.
// Used by the SVG flow diagram in the "Architecture" section.
// =====================================================================
export const ARCHITECTURE_NODES = [
  { id: 'client', label: 'Browser', sub: 'moodle-embed', kind: 'client' },
  { id: 'verify', label: 'verifyMoodleUser', sub: 'HMAC-SHA256 · timing-safe', kind: 'verify' },
  { id: 'ownership', label: 'verifyChatStreamOwnership', sub: 'chatId owner == verified', kind: 'verify' },
  { id: 'input', label: 'inputGuard', sub: '24 patterns · length · type', kind: 'guard' },
  { id: 'enrol', label: 'resolveUserProfile', sub: 'enrolments · profile · courses', kind: 'fetch' },
  { id: 'search', label: 'searchCourses', sub: 'fail-closed · allowedIds', kind: 'search' },
  { id: 'prompt', label: 'buildPrompt', sub: 'grounded · jailbreak-immune', kind: 'build' },
  { id: 'ollama', label: 'ollamaClient', sub: 'circuit breaker · queue', kind: 'llm' },
  { id: 'sse', label: 'SSE relay', sub: 'backpressure-aware · abort on close', kind: 'pipe' },
  { id: 'sanitize', label: 'sanitizeBotHtml', sub: 'DOMPurify allowlist', kind: 'sanitize' },
  { id: 'render', label: 'innerHTML', sub: 'role=log · aria-live', kind: 'render' },
]

// SVG edge list (rendered in order).
export const ARCHITECTURE_EDGES = [
  ['client', 'verify'],
  ['verify', 'ownership'],
  ['ownership', 'input'],
  ['input', 'enrol'],
  ['enrol', 'search'],
  ['search', 'prompt'],
  ['prompt', 'ollama'],
  ['ollama', 'sse'],
  ['sse', 'sanitize'],
  ['sanitize', 'render'],
]

// =====================================================================
// THREAT MODEL — pairs each attack with the corresponding defense
// from the source code. Dark gray chip = attack, green chip = defense.
// =====================================================================
export const THREAT_MODEL = [
  {
    attack: 'IDOR via predictable chatId',
    detail: 'Read or delete another user\'s history by guessing the id.',
    defense: 'verifyChatOwnership preHandler',
    ref: 'middleware/auth.js',
  },
  {
    attack: 'Body-supplied userId',
    detail: 'Spoof identity in POST body to receive personalised answers.',
    defense: 'HMAC-SHA256 signed token · timingSafeEqual',
    ref: 'crypto.timingSafeEqual',
  },
  {
    attack: 'Stored XSS via LLM output',
    detail: 'Attacker shapes the prompt so the model returns <script>.',
    defense: 'DOMPurify allowlist + CSP backstop',
    ref: 'public/chatbot/sanitize.js',
  },
  {
    attack: 'Prompt injection at the input',
    detail: 'Ignore previous / DAN / reveal system prompt.',
    defense: 'inputGuard · 24 patterns · structured log',
    ref: 'middleware/inputGuard.js',
  },
  {
    attack: 'DoS via Ollama saturation',
    detail: 'Hammering the LLM endpoint exhausts the host.',
    defense: 'P-Queue + circuit breaker (5 errors → 30s)',
    ref: 'ollamaQueue.js',
  },
  {
    attack: 'Spoofed client IP behind nginx',
    detail: 'Client sets X-Forwarded-For to bypass per-IP rate limit.',
    defense: 'trustProxy: 1 (single hop) · structured log',
    ref: 'fastify.js',
  },
]

// =====================================================================
// DEMO GREETING — the very first bot message in the hero chat demo.
// German opener to match the real Moodle instance (itech-bs14.de /
// Berufsschule 14, Bremen) where students write the assistant in DE.
// =====================================================================
export const DEMO_GREETING =
  'Hallo! Ich bin dein AI-Assistent. Wie kann ich dir helfen?'

// =====================================================================
// SSE TRACE — what the browser actually receives during streaming.
// Shown in the "Raw" tab of the chat demo to make SSE tangible.
// Patched to mirror the new "Hi there! 👋 Welcome!" bot answer.
// =====================================================================
export const SSE_TRACE = [
  'event: message',
  'id: 1',
  'data: {"model":"llama3.2:3b","response":"Hi "}',
  '',
  'event: message',
  'id: 2',
  'data: {"response":"there! 👋 Welcome! "}',
  '',
  'event: message',
  'id: 3',
  'data: {"response":"How can I help "}',
  '',
  'event: message',
  'id: 4',
  'data: {"response":"you today? "}',
  '',
  'event: message',
  'id: 5',
  'data: {"response":"Feel free to ask me anything ","done":false}',
  '',
  'event: message',
  'id: 6',
  'data: {"response":"about your Moodle courses.","done":true}',
  '',
  'event: done',
  'data: [DONE]',
]

// =====================================================================
// CHAT SCRIPTS — scripted demo conversations, token-by-token streaming.
// Each "answer" streams in like a real SSE response. The four scripts
// mirror the flow a real student hits on the first session: greeting,
// course list, course links, course deep-dive.
// Grammar was tightened across the board (capital "I", "Bili" not
// "Billi", "send me the links" instead of "get me link", etc.).
// =====================================================================
export const CHAT_SCRIPTS = [
  {
    q: 'Hi',
    a: 'Hi there! 👋 Welcome! How can I help you today? Feel free to ask me anything about your Moodle courses.',
  },
  {
    q: 'How many courses do I have?',
    a: 'You currently have **2 courses**:\n1. **Klassenkurs IT4bili**\n2. **Bili Hackathon**\nIs there anything specific you would like to know about one of these courses? 😊',
  },
  {
    q: 'Can you send me the links for both courses?',
    a: 'Sure! Here are the links to both of your courses:\n1. **Klassenkurs IT4bili** — unfortunately, I don\'t have the URL for this course in the available course information.\n2. **Bili Hackathon** — Bili Hackathon\nIf you need the link for **Klassenkurs IT4bili**, you may want to check your Moodle dashboard or course list directly. Would you like help with anything else? 😊',
  },
  {
    q: 'Can you explain the Bili Hackathon course to me?',
    a: 'Of course! Here is an overview of the **Bili Hackathon** course based on the available information:\n\n**Course Structure**\nThe course is divided into **3 main sections**:\n\n1. **Sprint 1: Define the Problem** — focuses on Design Thinking fundamentals, including:\n   - Empathize and define methods\n   - Observation techniques (AEIOU)\n   - Empathy maps and personas\n   - Problem trees\n   - Brainwriting 6-3-5\n\n2. **Sprint 2: Ideate Your Solution** — covers ideation techniques:\n   - Critical issues\n   - Brainwriting\n   - Walt Disney method\n   - Sketching ideas\n   - Value Proposition Canvas\n   - Social Service Model Canvas\n\n3. **Development Sprints** — hands-on technical work:\n   - Arduino & Raspberry Pi presentations\n   - Tutorials on Arduino and Raspberry Pi\n   - Communication between Arduino and Pi\n   - Prototyping\n   - Business Model Canvas\n\nWould you like more details on any specific section or topic? 😊 You can also access the course here: Bili Hackathon.',
  },
]
