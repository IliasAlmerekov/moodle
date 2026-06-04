import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Application-layer encryption for chat message content (PR-01). Message text is
// personal data of minors, so it must not sit in the SQLite file as plaintext.
// Only the `content` column is encrypted; metadata (role, ids, timestamps) stays
// queryable. A leaked DB file is useless without the key, which lives in the
// environment/secret store rather than in the database.
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length
const AUTH_TAG_BYTES = 16;
// Marks an encrypted payload. Rows without it are treated as legacy plaintext so
// existing data keeps reading after encryption is switched on.
const PREFIX = "enc:v1:";

// Accept a 32-byte key as 64 hex chars or base64. Returns a 32-byte Buffer or
// throws — fail fast on a misconfigured key rather than silently weakening.
export function parseEncryptionKey(raw) {
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) {
    return decoded;
  }
  throw new Error(
    "CHAT_ENCRYPTION_KEY must be a 32-byte key (64 hex chars or base64). " +
      "Generate one with: openssl rand -hex 32",
  );
}

function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Builds a content cipher. With no key it is an identity passthrough (plaintext)
 * — acceptable for local development; production must supply a key (enforced in
 * config/env.js). `decrypt` always tolerates legacy plaintext rows.
 *
 * @param {string|Buffer|null} [key] raw key string, parsed Buffer, or null
 */
export function createContentCipher(key) {
  const keyBuffer = Buffer.isBuffer(key) ? key : parseEncryptionKey(key);

  if (!keyBuffer) {
    return {
      enabled: false,
      encrypt: (plaintext) => plaintext,
      decrypt: (stored) => (isEncrypted(stored) ? "" : stored),
    };
  }

  return {
    enabled: true,

    encrypt(plaintext) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
      const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
    },

    decrypt(stored) {
      // Legacy plaintext written before encryption was enabled — return as-is.
      if (!isEncrypted(stored)) return stored;

      const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
      const iv = raw.subarray(0, IV_BYTES);
      const authTag = raw.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
      const ciphertext = raw.subarray(IV_BYTES + AUTH_TAG_BYTES);
      const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    },
  };
}
