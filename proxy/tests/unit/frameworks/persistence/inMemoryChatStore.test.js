import assert from "node:assert/strict";
import { test } from "vitest";

async function importInMemoryChatStore() {
  const moduleUrl = new URL("../../../../src/frameworks/persistence/inMemoryChatStore.js", import.meta.url);
  moduleUrl.searchParams.set("cacheBust", crypto.randomUUID());
  return import(moduleUrl.href);
}

test("inMemoryChatStore appends messages and returns chronological limited history", async () => {
  let now = 1_000;
  const { createInMemoryChatStore } = await importInMemoryChatStore();
  const store = createInMemoryChatStore({ now: () => now });

  await store.appendMessage("session-1", 42, "user", "Hallo");
  now += 1;
  await store.appendMessage("session-1", 42, "assistant", "Hi");
  now += 1;
  await store.appendMessage("session-1", 42, "user", "Second");

  const history = await store.getHistory("session-1", 2);

  assert.deepEqual(history, [
    { role: "assistant", content: "Hi", timestamp: 1_001 },
    { role: "user", content: "Second", timestamp: 1_002 },
  ]);
});

test("inMemoryChatStore clears one session without touching another session", async () => {
  const { createInMemoryChatStore } = await importInMemoryChatStore();
  const store = createInMemoryChatStore();

  await store.appendMessage("session-1", 1, "user", "delete me");
  await store.appendMessage("session-2", 2, "user", "keep me");
  await store.clearSession("session-1");

  assert.deepEqual(await store.getHistory("session-1", 10), []);
  assert.equal((await store.getHistory("session-2", 10))[0].content, "keep me");
});

test("inMemoryChatStore trims old messages after append and keeps latest 48", async () => {
  let now = 10_000;
  const { createInMemoryChatStore } = await importInMemoryChatStore();
  const store = createInMemoryChatStore({ now: () => now, maxMessages: 48 });

  for (let i = 0; i < 55; i += 1) {
    now += 1;
    await store.appendMessage("session-1", 7, "user", `message-${i}`);
  }

  const history = await store.getHistory("session-1", 100);

  assert.equal(history.length, 48);
  assert.equal(history[0].content, "message-7");
  assert.equal(history[47].content, "message-54");
});

test("createInMemoryChatStore returns isolated repositories", async () => {
  const { createInMemoryChatStore } = await importInMemoryChatStore();
  const firstStore = createInMemoryChatStore();
  const secondStore = createInMemoryChatStore();

  await firstStore.appendMessage("session-1", 1, "user", "first");

  assert.equal((await firstStore.getHistory("session-1", 10)).length, 1);
  assert.deepEqual(await secondStore.getHistory("session-1", 10), []);
});
