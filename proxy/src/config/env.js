const {
  NODE_ENV = "development",
  MOODLE_URL,
  MOODLE_TOKEN,
  OLLAMA_URL,
  OLLAMA_MODEL,
  PUBLIC_MOODLE_URL,
  PORT = "3000",
  CORS_ORIGIN,
  RATE_LIMIT_MAX = "20",
  RATE_LIMIT_WINDOW = "1 minute",
  USER_RATE_LIMIT_MAX = "10",
  USER_RATE_LIMIT_WINDOW_MS = "60000",
  CACHE_TTL_COURSES = "300000",
  CACHE_TTL_USERS = "60000",
  MAX_MESSAGE_LENGTH = "500",
  MAX_HISTORY_MESSAGES = "12",
  CHAT_RETENTION_DAYS = "90",
  LOG_LEVEL = "info",
  OLLAMA_CONCURRENCY = "2",
  OLLAMA_MAX_QUEUE = "20",
  OLLAMA_TIMEOUT_MS = "120000",
  CHAT_DB_PATH = "../data/chat.db",
  CHATBOT_AUTH_SECRET = "",
  AUTH_TOKEN_TTL_MS = "7200000",
  TRUST_PROXY = "1",
} = process.env;

// Behind a single reverse proxy (nginx), a hop count (the default "1") is the
// secure choice: it trusts only the IP appended by our proxy and ignores
// client-spoofed X-Forwarded-For entries. Accepts "true"/"false", an integer
// hop count, or a comma-separated list of trusted subnets/IPs.
function parseTrustProxy(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  const hops = Number(value);
  if (Number.isInteger(hops) && hops >= 0) return hops;
  return value;
}

const missing = Object.entries({ MOODLE_URL, MOODLE_TOKEN, OLLAMA_URL, OLLAMA_MODEL })
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

// Identity verification depends on a shared HMAC secret that the Moodle embed
// snippet uses to sign the userId. Without it, the server cannot prove who the
// caller is, so it must be present in production.
if (NODE_ENV === "production" && !CHATBOT_AUTH_SECRET) {
  throw new Error("Missing required environment variable: CHATBOT_AUTH_SECRET");
}

const moodleBaseUrl = MOODLE_URL.replace(/\/$/, "");
const ollamaBaseUrl = OLLAMA_URL.replace(/\/$/, "");

const retentionDays = Number(CHAT_RETENTION_DAYS);
const chatRetentionMs =
  Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays * 24 * 60 * 60 * 1000 : 0;

const config = {
  nodeEnv: NODE_ENV,
  port: Number(PORT),
  logLevel: LOG_LEVEL,
  trustProxy: parseTrustProxy(TRUST_PROXY),

  moodle: {
    url: moodleBaseUrl,
    publicUrl: PUBLIC_MOODLE_URL?.replace(/\/$/, "") ?? "",
    token: MOODLE_TOKEN,
    isConfigured: true,
  },

  cors: {
    origins: CORS_ORIGIN ? CORS_ORIGIN.split(",") : false,
  },

  rateLimit: {
    max: Number(RATE_LIMIT_MAX),
    window: RATE_LIMIT_WINDOW,
  },

  userRateLimit: {
    max: Number(USER_RATE_LIMIT_MAX),
    windowMs: Number(USER_RATE_LIMIT_WINDOW_MS),
  },

  auth: {
    secret: CHATBOT_AUTH_SECRET,
    tokenTtlMs: Number(AUTH_TOKEN_TTL_MS),
  },

  cache: {
    courseTtl: Number(CACHE_TTL_COURSES),
    userTtl: Number(CACHE_TTL_USERS),
  },

  ollama: {
    url: ollamaBaseUrl,
    model: OLLAMA_MODEL,
    concurrency: Number(OLLAMA_CONCURRENCY),
    maxQueue: Number(OLLAMA_MAX_QUEUE),
    timeoutMs: Number(OLLAMA_TIMEOUT_MS),
    isConfigured: true,
  },

  chat: {
    dbPath: CHAT_DB_PATH,
    maxMessageLength: Number(MAX_MESSAGE_LENGTH),
    maxHistoryMessages: Number(MAX_HISTORY_MESSAGES),
    // Sessions idle longer than this are pruned on startup. 0 disables retention.
    retentionMs: chatRetentionMs,
  },
};

export default config;
