import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createContentCipher,
  parseEncryptionKey,
} from "../../../../src/frameworks/persistence/contentCipher.js";

const HEX_KEY = "0".repeat(64); // 32 bytes of zero, valid 64-hex-char key

test("parseEncryptionKey accepts 64 hex chars and returns a 32-byte Buffer", () => {
  const key = parseEncryptionKey(HEX_KEY);
  assert.equal(Buffer.isBuffer(key), true);
  assert.equal(key.length, 32);
});

test("parseEncryptionKey accepts a 32-byte base64 key", () => {
  const b64 = Buffer.alloc(32, 7).toString("base64");
  const key = parseEncryptionKey(b64);
  assert.equal(key.length, 32);
});

test("parseEncryptionKey returns null for an empty key", () => {
  assert.equal(parseEncryptionKey(""), null);
  assert.equal(parseEncryptionKey(undefined), null);
});

test("parseEncryptionKey throws on a wrong-length key", () => {
  assert.throws(() => parseEncryptionKey("tooshort"), /32-byte key/);
});

test("encrypt produces a prefixed, non-plaintext payload that round-trips", () => {
  const cipher = createContentCipher(HEX_KEY);
  const plaintext = "Wie löse ich diese Aufgabe?";

  const encrypted = cipher.encrypt(plaintext);

  assert.equal(cipher.enabled, true);
  assert.equal(encrypted.startsWith("enc:v1:"), true);
  assert.equal(encrypted.includes(plaintext), false);
  assert.equal(cipher.decrypt(encrypted), plaintext);
});

test("encrypt uses a fresh IV so identical plaintext yields different ciphertext", () => {
  const cipher = createContentCipher(HEX_KEY);
  const a = cipher.encrypt("same");
  const b = cipher.encrypt("same");
  assert.notEqual(a, b);
  assert.equal(cipher.decrypt(a), "same");
  assert.equal(cipher.decrypt(b), "same");
});

test("decrypt returns legacy plaintext rows unchanged", () => {
  const cipher = createContentCipher(HEX_KEY);
  assert.equal(cipher.decrypt("old plaintext message"), "old plaintext message");
});

test("decrypt rejects tampered ciphertext (GCM auth tag)", () => {
  const cipher = createContentCipher(HEX_KEY);
  const encrypted = cipher.encrypt("secret");
  // Flip a character in the base64 body to corrupt the auth tag/ciphertext.
  const tampered = encrypted.slice(0, -2) + (encrypted.endsWith("A") ? "B" : "A") + "=";
  assert.throws(() => cipher.decrypt(tampered));
});

test("disabled cipher (no key) passes plaintext through", () => {
  const cipher = createContentCipher(null);
  assert.equal(cipher.enabled, false);
  assert.equal(cipher.encrypt("plain"), "plain");
  assert.equal(cipher.decrypt("plain"), "plain");
});
