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

const route = "https://relay.test/v3/r/" + "a".repeat(64) + "/offer";
const url = route + "?slot=offer";

test("Worker stores a valid bounded payload", async () => {
  const h = roomHarness();
  const response = await h.room.fetch(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "v2.c2VhbGVkLW9mZmVy" }),
  }));

  assert.equal(response.status, 200);
  assert.equal(h.calls.put, 1);
  assert.equal(h.records.get("offer").payload, "v2.c2VhbGVkLW9mZmVy");
  assert.equal(h.records.get("offer").owner, null, "an owner capability is optional");
});

test("Worker stores only the v2 sealed envelope — plaintext and v1 are refused", async () => {
  // 2026-09-10: the room-code payload is AES-GCM under a per-envelope salt with
  // the slot as AAD (js/net/rendezvous.js). Anything else is free storage on a
  // Durable Object, so it is a 400, never a put.
  const h = roomHarness();
  for (const payload of ["APEX1.s.OFFER", "v1.legacy-ciphertext", "v2.", ""]) {
    const response = await h.room.fetch(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    }));
    assert.equal(response.status, 400, JSON.stringify(payload) + " must be refused");
  }
  assert.equal(h.calls.put, 0);
});

test("Worker uses the owner capability instead of randomized ciphertext equality", async () => {
  const h = roomHarness();
  const owner = "owner_capability_123456";
  const post = (payload, cap = owner) => h.room.fetch(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload, owner: cap }),
  }));

  assert.equal((await post("v2.first-ciphertext")).status, 200);
  assert.equal((await post("v2.second-ciphertext")).status, 200,
    "same owner may retry with a fresh salt + IV");
  assert.equal((await post("v2.attacker", "different_owner_12345")).status, 409);
  assert.equal(h.records.get("offer").payload, "v2.second-ciphertext");
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
  // 6,200 two-byte UTF-8 characters: under 12,288 JS characters, over 12,288
  // bytes, while the complete JSON body still fits inside the envelope cap.
  const response = await h.room.fetch(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "v2." + "é".repeat(6200) }),
  }));

  assert.equal(response.status, 413);
  assert.equal(h.calls.put, 0);
});

test("Worker rejects non-client room-code lengths before allocating a Durable Object", async () => {
  let ids = 0;
  const env = { ROOM: { idFromName() { ids++; }, get() { throw new Error("unreachable"); } } };
  const response = await worker.fetch(new Request("https://relay.test/v3/r/abcd/offer"), env);
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
    const code = i.toString(16).padStart(64, "0");
    last = await worker.fetch(new Request(`https://relay.test/v3/r/${code}/offer`, {
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
  const post = (ip) => worker.fetch(new Request(route, {
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
    const res = await worker.fetch(new Request(route, {
      method: "GET", headers: { "cf-connecting-ip": ip },
    }), env);
    assert.equal(res.status, 200);
  }
  assert.equal((await post(target)).status, 200,
    "the least-recently-used bucket must have been evicted to enforce the cap");
});


test("Worker refuses legacy secret-bearing routes and advertises the private protocol", async () => {
  const names = [];
  const h = roomHarness();
  const env = { ROOM: { idFromName(name) { names.push(name); return name; }, get() { return h.room; } } };
  const legacy = await worker.fetch(new Request("https://relay.test/r/ABC234/offer"), env);
  assert.equal(legacy.status, 426);
  assert.equal(names.length, 0, "legacy requests never name a Durable Object");
  const created = await worker.fetch(new Request(route, {
    method: "POST", body: JSON.stringify({ payload: "v2.ciphertext", owner: "owner_capability_123456" }),
  }), env);
  assert.equal(created.status, 200);
  assert.equal(names[0], "v3:" + "a".repeat(64));
  assert.equal(created.headers.get("x-apex-rendezvous"), "3");
  assert.match(created.headers.get("access-control-expose-headers"), /x-apex-rendezvous/);
  const read = await worker.fetch(new Request(route), env);
  assert.equal((await read.json()).payload, "v2.ciphertext");
  const missing = await worker.fetch(new Request(route.replace("/offer", "/answer")), env);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("x-apex-rendezvous"), "3", "new empty room differs from an old Worker");
});
