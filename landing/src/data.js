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
    metric: '15',
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
    afterCode: '40 files · 417 tests · 0 vulns · CI green',
    metric: '0 → 417',
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
  { id: 'input', label: 'inputGuard', sub: '28 patterns · length · type', kind: 'guard' },
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
    defense: 'inputGuard · 28 patterns · structured log',
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
// HERO SCRIPTS — three light, generic scripts the hero-stage chat
// streams by default. They introduce the assistant (greeting),
// surface the student's enrolment state ("how many courses do I
// have?"), and answer "what can you do?" with features that exist
// in proxy/src — no aspirational copy. The hero chat is the first
// thing a jury member reads, so it stays small and welcoming;
// Bili-Hackathon-specific content lives in CHAT_SCRIPTS and shows
// up in the full demo section below.
// =====================================================================
export const HERO_SCRIPTS = [
  {
    q: 'Hi',
    a: 'Hi there! I am your AI assistant for this Moodle. Ask me about your courses, files, or assignments — I will search your own course content and answer with a local model.',
  },
  {
    q: 'How many courses do I have?',
    a: 'You have 2 courses: Klassenkurs IT4bili and Bili Hackathon.',
  },
  {
    q: 'What can you do?',
    a: 'I search only your enrolled courses, ground every answer in real course material, and stream the response token by token. Your messages stay on this server and your chat history is encrypted at rest.',
  },
]

// =====================================================================
// SSE TRACE — what the browser actually receives during streaming.
// Shown in the "Raw" tab of the chat demo to make SSE tangible.
// Reset to mirror the new hero greeting ("Hi there! I am your AI
// assistant…") so the Raw tab stays in sync with the chat the user
// just triggered. Same NDJSON-as-SSE shape Ollama returns in
// production.
// =====================================================================
export const SSE_TRACE = [
  'event: message',
  'id: 1',
  'data: {"model":"llama3.2:3b","response":"Hi there! "}',
  '',
  'event: message',
  'id: 2',
  'data: {"response":"I am your AI assistant for this Moodle. "}',
  '',
  'event: message',
  'id: 3',
  'data: {"response":"Ask me about your courses, files, or assignments.","done":true}',
  '',
  'event: done',
  'data: [DONE]',
]

// =====================================================================
// CHAT SCRIPTS — scripted demo conversations, token-by-token streaming.
// Each "answer" streams in like a real SSE response. The four scripts
// mirror the flow a real student hits on the first session: course
// links, course files, submission requirements, deep template lookup.
// Grammar was tightened across the board (capital "I", "Bili" not
// "Billi", "send me the links" instead of "get me link", etc.).
// =====================================================================
// The chat itself stays text-only. The four corresponding screenshots
// from the live Moodle AI Chatbot instance render in a separate
// "Real answers" section right after the chat — see SCREENSHOTS
// below. Keeping them out of the bubble lets the chat feel like a
// pure streaming demo and gives the screenshots a stage of their own.
export const CHAT_SCRIPTS = [
  {
    q: 'Can you share the link to the Bili Hackathon course?',
    a: 'Here you go — the direct link to **Bili Hackathon** is below. You can also open it from your Moodle dashboard under *My Courses*.',
  },
  {
    q: 'Can you send me the link to the Walt Disney file?',
    a: 'Sure! I found the **Walt Disney** ideation method file in your *Bili Hackathon* course. The link is below.',
  },
  {
    q: 'What do I have to submit for Checkpoint 1 in Bili Hackathon?',
    a: 'For **Checkpoint 1** in Bili Hackathon you need to hand in your *Define the Problem* artefacts. The full submission checklist is shown below.',
  },
  {
    q: 'How do I find the 3-6-5-Brain file?',
    a: 'The **3-6-5 Brainwriting** template lives inside *Bili Hackathon* under the *Sprint 1* section. The direct link is below.',
  },
]

// =====================================================================
// SCREENSHOTS — four real screenshots from the Moodle AI Chatbot
// running at itech-bs14.de, paired with the four CHAT_SCRIPTS. The
// "Real answers" section below the chat renders them as a 2×2 grid
// of cards, each with a caption that mirrors the streamed answer.
// `num` is a small "01" / "02" / "03" / "04" tag in the top-right
// corner of the card so the order reads even out of context.
// =====================================================================
export const SCREENSHOTS = [
  {
    num: '01',
    src: '/link.png',
    alt: 'Direct link to the Bili Hackathon course on Moodle',
    caption: 'Direct link to the Bili Hackathon course, from My Courses.',
  },
  {
    num: '02',
    src: '/walt_disney.png',
    alt: 'Walt Disney ideation file inside the Bili Hackathon course',
    caption: 'Walt Disney ideation method file, in the Bili Hackathon course.',
  },
  {
    num: '03',
    src: '/checkpoint.png',
    alt: 'Checkpoint 1 submission requirements for Bili Hackathon',
    caption: 'Checkpoint 1 submission requirements, in plain language.',
  },
  {
    num: '04',
    src: '/3-6-5-file.png',
    alt: '3-6-5 Brainwriting template inside the Bili Hackathon course',
    caption: '3-6-5 Brainwriting template, located in Sprint 1.',
  },
]
