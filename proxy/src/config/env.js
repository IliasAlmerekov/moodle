// Load environment variables from .env file
const {
  MOODLE_URL,
  MOODLE_TOKEN,
  OLLAMA_URL,
  OLLAMA_MODEL,
  PUBLIC_MOODLE_URL,
  PORT = "3000",
} = process.env;

// remove trailing slashes
const moodleBaseUrl = MOODLE_URL ? MOODLE_URL.replace(/\/$/, "") : "";
const ollamaBaseUrl = OLLAMA_URL ? OLLAMA_URL.replace(/\/$/, "") : "";

//define required variables
const requiredVars = {
  MOODLE_URL,
  MOODLE_TOKEN,
  OLLAMA_URL,
  OLLAMA_MODEL,
};

// validate required variables
const missingVars = [];
for (const [key, value] of Object.entries(requiredVars)) {
  if (!value) {
    missingVars.push(key);
  }
}

// export the configuration object
const config = {
  // server config
  port: Number(PORT),

  // moodle config
  moodle: {
    url: moodleBaseUrl,
    publicUrl: PUBLIC_MOODLE_URL?.replace(/\/$/, "") ?? "",
    token: MOODLE_TOKEN,
    isConfigured: Boolean(moodleBaseUrl && MOODLE_TOKEN),
  },

  // ollama config
  ollama: {
    url: ollamaBaseUrl,
    model: OLLAMA_MODEL,
    isConfigured: Boolean(ollamaBaseUrl && OLLAMA_MODEL),
  },

  // validation status
  validation: {
    missingVars,
  },
};

export default config;
