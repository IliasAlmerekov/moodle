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
  LOG_LEVEL = "info",
  OLLAMA_CONCURRENCY = "2",
  OLLAMA_MAX_QUEUE = "20",
  OLLAMA_TIMEOUT_MS = "120000",
  CHAT_DB_PATH = "../data/chat.db",
  CHATBOT_AUTH_SECRET = "",
  AUTH_TOKEN_TTL_MS = "7200000",
} = process.env;

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

const config = {
  nodeEnv: NODE_ENV,
  port: Number(PORT),
  logLevel: LOG_LEVEL,

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
  },
};

export default config;
