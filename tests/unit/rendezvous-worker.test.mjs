import assert from "node:assert/strict";
import test from "node:test";

import worker, { Room } from "../../worker/rendezvous.js";

function roomHarness() {
  const records = new Map();
  const calls = { get: 0, put: 0, alarm: 0, deleteAll: 0 };
  const state = {
    storage: {
      async get(key) { calls.get++; return records.get(key); },
      async put(key, value) { calls.put++; records.set(key, value); },
      async setAlarm() { calls.alarm++; },
      async deleteAll() { calls.deleteAll++; records.clear(); },
    },
  };
  return { room: new Room(state), records, calls };
}

const url = "https://relay.test/r/ABCDEF/offer?slot=offer";

test("Worker stores a valid bounded payload", async () => {
  const h = roomHarness();
  const response = await h.room.fetch(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "APEX1.s.OFFER" }),
  }));

  assert.equal(response.status, 200);
  assert.equal(h.calls.put, 1);
  assert.equal(h.records.get("offer").payload, "APEX1.s.OFFER");
  assert.equal(h.records.get("offer").owner, null, "legacy clients remain accepted");
});

test("Worker uses the owner capability instead of randomized ciphertext equality", async () => {
  const h = roomHarness();
  const owner = "owner_capability_123456";
  const post = (payload, cap = owner) => h.room.fetch(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload, owner: cap }),
  }));

  assert.equal((await post("v1.first-ciphertext")).status, 200);
  assert.equal((await post("v1.second-ciphertext")).status, 200,
    "same owner may retry with a fresh AES-GCM IV");
  assert.equal((await post("v1.attacker", "different_owner_12345")).status, 409);
  assert.equal(h.records.get("offer").payload, "v1.second-ciphertext");
});

test("Worker rejects an oversized Content-Length before reading the stream", async () => {
  const h = roomHarness();
  let pulls = 0;
  const body = new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new TextEncoder().encode("{")); },
  });
  const response = await h.room.fetch(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "100000" },
    body,
    duplex: "half",
  }));

  assert.equal(response.status, 413);
  // Node's Request constructor pre-pulls one chunk while wrapping a stream. The
  // Worker itself must not ask for another; reading the body would hang here
  // because this source deliberately never closes.
  assert.ok(pulls <= 1, "declared oversize bodies should not be consumed by the Worker");
  assert.equal(h.calls.put, 0);
});

test("Worker byte-caps a streamed body without Content-Length before JSON parsing", async () => {
  const h = roomHarness();
  const invalidOversizeJson = "{" + "x".repeat(20000);
  const response = await h.room.fetch(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: invalidOversizeJson,
  }));

  assert.equal(response.status, 413, "size wins over the malformed-JSON error");
  assert.equal(h.calls.put, 0);
});

test("Worker rejects irrelevant JSON padding around a short valid payload", async () => {
  const h = roomHarness();
  const response = await h.room.fetch(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "ok", junk: "x".repeat(20000) }),
  }));

  assert.equal(response.status, 413);
  assert.equal(h.calls.get, 0, "oversized requests must not touch Durable Object storage");
  assert.equal(h.calls.put, 0);
});

test("Worker applies the payload limit in bytes, not UTF-16 characters", async () => {
  const h = roomHarness();
  // 4,101 two-byte UTF-8 characters: under 8,192 JS characters, over 8,192
  // bytes, while the complete JSON body still fits inside the envelope cap.
  const response = await h.room.fetch(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "é".repeat(4101) }),
  }));

  assert.equal(response.status, 413);
  assert.equal(h.calls.put, 0);
});

test("Worker rejects non-client room-code lengths before allocating a Durable Object", async () => {
  let ids = 0;
  const env = { ROOM: { idFromName() { ids++; }, get() { throw new Error("unreachable"); } } };
  const response = await worker.fetch(new Request("https://relay.test/r/ABCD/offer"), env);
  assert.equal(response.status, 404);
  assert.equal(ids, 0);
});

test("Worker rate-limits room creation before allocating more Durable Objects", async () => {
  let ids = 0;
  const stub = { fetch: async () => new Response('{"ok":true}', { status: 200 }) };
  const env = { ROOM: { idFromName(code) { ids++; return code; }, get() { return stub; } } };
  const headers = {
    "content-type": "application/json",
    "cf-connecting-ip": "203.0.113.77",
  };
  let last;
  for (let i = 0; i < 21; i++) {
    const code = i.toString(36).toUpperCase().padStart(6, "0");
    last = await worker.fetch(new Request(`https://relay.test/r/${code}/offer`, {
      method: "POST", headers, body: JSON.stringify({ payload: "x" }),
    }), env);
  }
  assert.equal(last.status, 429);
  assert.equal(last.headers.get("retry-after"), "60");
  assert.equal(ids, 20, "limited requests must not resolve or create a Durable Object");
});

test("Worker rate-bucket storage is hard-capped under fresh address churn", async () => {
  const stub = { fetch: async () => new Response('{"ok":true}', { status: 200 }) };
  const env = { ROOM: { idFromName(code) { return code; }, get() { return stub; } } };
  const target = "2001:db8:rate::1";
  const post = (ip) => worker.fetch(new Request("https://relay.test/r/ABCDEF/offer", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ payload: "x" }),
  }), env);

  for (let i = 0; i < 20; i++) assert.equal((await post(target)).status, 200);
  assert.equal((await post(target)).status, 429, "the target bucket starts exhausted");

  // More than the configured 4,096 fresh buckets must evict the oldest one;
  // the old implementation retained every fresh entry and this remained 429.
  for (let i = 0; i < 4110; i++) {
    const ip = `2001:db8:churn::${i.toString(16)}`;
    const res = await worker.fetch(new Request("https://relay.test/r/ABCDEF/offer", {
      method: "GET", headers: { "cf-connecting-ip": ip },
    }), env);
    assert.equal(res.status, 200);
  }
  assert.equal((await post(target)).status, 200,
    "the least-recently-used bucket must have been evicted to enforce the cap");
});
