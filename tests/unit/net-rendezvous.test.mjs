/* net-rendezvous.test.mjs — the room-code client, against a REAL relay.
 *
 * The relay is a throwaway node HTTP server implementing the same contract as
 * worker/rendezvous.js: POST/GET /r/<code>/<offer|answer>, 404 when nothing is
 * there, 409 when a live offer would be overwritten. Real fetch, real status
 * codes, real JSON — the only thing not exercised is Cloudflare itself.
 *
 * That matters because this module's whole job is to FAIL SOFTLY. It is the one
 * part of the game that depends on a service somebody has to keep alive, so
 * "the relay is down", "the relay is slow", "nobody is at that code" and "this
 * build has no relay" must each produce a distinct, actionable result rather
 * than an exception escaping into a click handler.
 *
 * Run: node --test tests/unit/net-rendezvous.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();

// The module reads localStorage; node has none. A two-line stand-in is enough
// and keeps the module itself free of test-only branches.
globalThis.localStorage = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, String(v)); },
  removeItem(k) { this._m.delete(k); },
};

const NetRendezvous = eval(
  fs.readFileSync(path.join(ROOT, "js/net/rendezvous.js"), "utf8") + ";NetRendezvous");

// ---------------------------------------------------------------------------
// A stand-in for worker/rendezvous.js, same contract.
// ---------------------------------------------------------------------------
function relay(opts = {}) {
  const rooms = new Map();          // code -> {offer, answer}
  const server = http.createServer((req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(obj == null ? "" : JSON.stringify(obj));
    };
    if (opts.dead) return send(500, { error: "boom" });
    if (opts.hang) return;          // never responds — the timeout path

    const m = req.url.match(/^\/r\/([0-9A-Z]+)\/(offer|answer)$/);
    if (!m) return send(404, { error: "not_found" });
    const [, code, slot] = m;
    const room = rooms.get(code) || {};

    if (req.method === "GET") {
      // flakyGets: answer the first N polls with a 429 — the transient hiccup
      // waitFor() must ride out rather than abort the two-minute wait on.
      if (opts.flakyGets > 0) { opts.flakyGets--; return send(429, { error: "rate_limited" }); }
      if (!room[slot]) return send(404, { error: "not_found" });
      return send(200, { payload: room[slot].payload });
    }
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      const payload = parsed.payload;
      const owner = parsed.owner || null;
      if (typeof payload !== "string" || !payload) return send(400, { error: "bad_payload" });
      if (slot === "offer" && room.offer) {
        const sameOwner = owner && room.offer.owner && owner === room.offer.owner;
        const sameLegacy = !owner && !room.offer.owner && room.offer.payload === payload;
        if (!sameOwner && !sameLegacy) return send(409, { error: "taken" });
      }
      room[slot] = { payload, owner };
      rooms.set(code, room);
      send(200, { ok: true });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      NetRendezvous.setUrl(url);
      resolve({ url, rooms, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

// ---------------------------------------------------------------------------
// The code itself
// ---------------------------------------------------------------------------

test("codes avoid the characters people mishear", () => {
  // The entire point is that six characters survive being read aloud. 0/O and
  // 1/I/L are where that breaks, so they are not in the alphabet at all.
  for (const bad of ["0", "O", "1", "I", "L"]) {
    assert.ok(!NetRendezvous.ALPHABET.includes(bad), `${bad} should not be usable`);
  }
  for (let i = 0; i < 200; i++) {
    const c = NetRendezvous.makeCode();
    assert.equal(c.length, NetRendezvous.CODE_LEN);
    assert.ok(NetRendezvous.valid(c), `${c} should be valid`);
  }
});

test("codes are not sequential or repeated", () => {
  // A predictable code is one somebody else can already be sitting on.
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(NetRendezvous.makeCode());
  assert.ok(seen.size > 495, `expected near-unique codes, got ${seen.size}/500`);
});

test("typing is forgiving about case and spacing, strict about the rest", () => {
  const c = NetRendezvous.makeCode();
  assert.equal(NetRendezvous.normalise(c.toLowerCase()), c);
  assert.equal(NetRendezvous.normalise(` ${c.slice(0, 3)}-${c.slice(3)} `), c);
  // But a genuinely wrong code stays wrong rather than being coerced into a
  // DIFFERENT valid room, which would silently connect two strangers.
  assert.equal(NetRendezvous.valid("ABC"), false);
  assert.equal(NetRendezvous.valid("ABCDEFGH"), false);
  assert.equal(NetRendezvous.valid(""), false);
});

// ---------------------------------------------------------------------------
// Against the relay
// ---------------------------------------------------------------------------

test("the two halves meet at the same code", async () => {
  const r = await relay();
  try {
    const code = NetRendezvous.makeCode();
    assert.equal((await NetRendezvous.put(code, "offer", "APEX1.s.OFFER")).ok, true);
    const stored = r.rooms.get(code).offer;
    assert.match(stored.payload, /^v1\./, "private relay must store a versioned ciphertext envelope");
    assert.ok(!stored.payload.includes("APEX1.s.OFFER"), "SDP code must not be visible to the relay");
    assert.match(stored.owner, /^[A-Za-z0-9_-]{16,128}$/, "offer carries a stable ownership capability");
    const got = await NetRendezvous.get(code, "offer");
    assert.equal(got.ok, true);
    assert.equal(got.body.payload, "APEX1.s.OFFER");

    assert.equal((await NetRendezvous.put(code, "answer", "APEX1.s.ANSWER")).ok, true);
    const back = await NetRendezvous.get(code, "answer");
    assert.equal(back.body.payload, "APEX1.s.ANSWER");
  } finally { await r.close(); }
});

test("an encrypted offer retry changes ciphertext but keeps ownership", async () => {
  const r = await relay();
  try {
    const code = NetRendezvous.makeCode();
    assert.equal((await NetRendezvous.put(code, "offer", "SAME-OFFER")).ok, true);
    const first = { ...r.rooms.get(code).offer };
    assert.equal((await NetRendezvous.put(code, "offer", "SAME-OFFER")).ok, true);
    const second = r.rooms.get(code).offer;
    assert.equal(second.owner, first.owner, "a retry must prove it is the same host");
    assert.notEqual(second.payload, first.payload, "AES-GCM must still use a fresh IV");
    assert.equal((await NetRendezvous.get(code, "offer")).body.payload, "SAME-OFFER");
  } finally { await r.close(); }
});

test("new clients can read a legacy two-minute plaintext mailbox record", async () => {
  const r = await relay();
  try {
    const code = NetRendezvous.makeCode();
    r.rooms.set(code, { offer: { payload: "LEGACY-OFFER", owner: null } });
    const got = await NetRendezvous.get(code, "offer");
    assert.equal(got.ok, true);
    assert.equal(got.body.payload, "LEGACY-OFFER");
  } finally { await r.close(); }
});

test("the private-relay backend still trades both ways", async () => {
  // swap() is what the lobby calls. With a private relay it is a post then a
  // poll; with the public relay network it is a live room. Same shape either
  // way, which is the point of the seam.
  const r = await relay();
  try {
    const code = NetRendezvous.makeCode();
    setTimeout(() => NetRendezvous.put(code, "answer", "THEIR-ANSWER"), 250);
    const out = await NetRendezvous.swap({
      code, mine: "MY-OFFER", slot: "offer", want: "answer", token: { cancelled: false },
    });
    assert.equal(out.ok, true);
    assert.equal(out.payload, "THEIR-ANSWER");
    // ...and our own half really was left for them.
    assert.equal((await NetRendezvous.get(code, "offer")).body.payload, "MY-OFFER");
    const firstOwner = r.rooms.get(code).offer.owner;
    const retry = await NetRendezvous.swap({
      code, mine: "MY-OFFER", slot: "offer", want: "answer", token: { cancelled: false },
    });
    assert.equal(retry.ok, true, "the lobby's production swap path can retry its randomized envelope");
    assert.equal(r.rooms.get(code).offer.owner, firstOwner,
      "a repeated host attempt must keep the original ownership capability");
  } finally { await r.close(); }
});

test("a replier waits first, then posts what it produced", async () => {
  // The guest cannot answer until it has seen the invite. Getting this backwards
  // is exactly the bug the first version shipped.
  const r = await relay();
  try {
    const code = NetRendezvous.makeCode();
    await NetRendezvous.put(code, "offer", "THE-INVITE");
    let saw = null;
    const out = await NetRendezvous.swap({
      code, slot: "answer", want: "offer", token: { cancelled: false },
      reply: async (got) => { saw = got; return "ANSWER-TO-" + got; },
    });
    assert.equal(out.ok, true);
    assert.equal(saw, "THE-INVITE", "the reply must receive what the host posted");
    assert.equal(out.payload, "THE-INVITE");
    assert.equal((await NetRendezvous.get(code, "answer")).body.payload, "ANSWER-TO-THE-INVITE");
  } finally { await r.close(); }
});

test("a reply that fails reports it rather than posting nothing", async () => {
  const r = await relay();
  try {
    const code = NetRendezvous.makeCode();
    await NetRendezvous.put(code, "offer", "THE-INVITE");
    const out = await NetRendezvous.swap({
      code, slot: "answer", want: "offer", token: { cancelled: false },
      reply: async () => null,
    });
    assert.equal(out.ok, false);
    assert.equal(out.error, "reply_failed");
  } finally { await r.close(); }
});

test("waitFor resolves as soon as the other side posts", async () => {
  const r = await relay();
  try {
    const code = NetRendezvous.makeCode();
    const token = { cancelled: false };
    const pending = NetRendezvous.waitFor(code, "answer", token);
    setTimeout(() => NetRendezvous.put(code, "answer", "LATE-ARRIVAL"), 300);
    const got = await pending;
    assert.equal(got.ok, true);
    assert.equal(got.payload, "LATE-ARRIVAL");
  } finally { await r.close(); }
});

test("waitFor stops when it is cancelled, and does not resolve later", async () => {
  // A poll that outlives the screen that started it keeps hitting a server
  // nobody is looking at.
  const r = await relay();
  try {
    const code = NetRendezvous.makeCode();
    const token = { cancelled: false };
    const pending = NetRendezvous.waitFor(code, "answer", token);
    setTimeout(() => { token.cancelled = true; }, 200);
    const got = await pending;
    assert.equal(got.ok, false);
    assert.equal(got.error, "cancelled");
  } finally { await r.close(); }
});

test("an empty code reports nobody there, not an error", async () => {
  const r = await relay();
  try {
    const res = await NetRendezvous.get(NetRendezvous.makeCode(), "offer");
    assert.equal(res.ok, false);
    assert.equal(res.error, "not_found");
    assert.match(res.message, /nobody/i);
  } finally { await r.close(); }
});

test("a second host on a live code is refused rather than stealing the guest", async () => {
  const r = await relay();
  try {
    const code = NetRendezvous.makeCode();
    await NetRendezvous.put(code, "offer", "FIRST-HOST");
    const clash = await NetRendezvous.put(code, "offer", "SECOND-HOST");
    assert.equal(clash.ok, false);
    assert.equal(clash.error, "taken");
    // The first host's guest still finds the right room.
    assert.equal((await NetRendezvous.get(code, "offer")).body.payload, "FIRST-HOST");
  } finally { await r.close(); }
});

test("a dead relay is reported, never thrown", async () => {
  // This is the failure that matters: the one service in the game is down and
  // the lobby has to say so and fall back, not throw inside a click handler.
  const r = await relay({ dead: true });
  try {
    const res = await NetRendezvous.get("ABCDEF", "offer");
    assert.equal(res.ok, false);
    assert.equal(res.error, "relay");
    assert.match(res.message, /invite link/i, "should point at the path that still works");
  } finally { await r.close(); }
});

test("an unreachable relay is reported, never thrown", async () => {
  const r = await relay();
  await r.close();                                  // nothing is listening now
  const res = await NetRendezvous.get("ABCDEF", "offer");
  assert.equal(res.ok, false);
  assert.equal(res.error, "offline");
});

test("room codes are available with nothing configured at all", () => {
  // The point of the public-broker backend: no deploy, no URL, no terminal.
  // configured() is unconditionally true because the fallback always exists;
  // usingPrivateRelay() is the one that says WHICH backend will be used.
  NetRendezvous.setUrl(null);
  assert.equal(NetRendezvous.configured(), true);
  assert.equal(NetRendezvous.usingPrivateRelay(), false);
  NetRendezvous.setUrl("https://example.invalid");
  assert.equal(NetRendezvous.usingPrivateRelay(), true, "a set URL takes precedence");
  NetRendezvous.setUrl(null);
});

// ---------------------------------------------------------------------------
// The encryption that makes a PUBLIC broker safe to meet on
// ---------------------------------------------------------------------------

test("the payload round-trips under the room code", async () => {
  const code = NetRendezvous.makeCode();
  const secret = "APEX1.s." + "aB3-_x9Zq".repeat(20);
  const sealed = await NetRendezvous.seal(code, secret);
  assert.ok(sealed.length > secret.length, "should carry an IV and a tag");
  assert.equal(await NetRendezvous.open(code, sealed), secret);
});

test("a wrong code cannot read the payload", async () => {
  // This is the whole security claim: the broker is public, anyone may
  // subscribe, and the code is the only secret. If a near-miss decrypted, the
  // room code would be decoration.
  const a = NetRendezvous.makeCode();
  let b = NetRendezvous.makeCode();
  while (b === a) b = NetRendezvous.makeCode();
  const sealed = await NetRendezvous.seal(a, "APEX1.s.SECRET");
  assert.equal(await NetRendezvous.open(b, sealed), null);
  // Ciphertext tampering fails the GCM tag rather than yielding a mangled SDP.
  const tampered = sealed.slice();
  tampered[tampered.length - 1] ^= 0xff;
  assert.equal(await NetRendezvous.open(a, tampered), null);
});

test("two seals of the same text differ", async () => {
  // A fresh IV each time. Identical ciphertext on a public broker would leak
  // that two people are exchanging the same invite.
  const code = NetRendezvous.makeCode();
  const one = await NetRendezvous.seal(code, "same");
  const two = await NetRendezvous.seal(code, "same");
  assert.notDeepEqual([...one], [...two]);
});

test("the topic does not leak the room code", async () => {
  // Topics on a public broker are enumerable. If the topic contained the code,
  // watching the namespace would hand out the codes themselves.
  const code = NetRendezvous.makeCode();
  const topic = await NetRendezvous.topicFor(code, "offer");
  assert.ok(!topic.includes(code), `${topic} must not contain ${code}`);
  assert.ok(topic.endsWith("/offer"));
  // ...but it must be stable, or the two peers would never meet.
  assert.equal(await NetRendezvous.topicFor(code.toLowerCase(), "offer"), topic);
});

// ── round 8: the key derives once per code ───────────────────────────────────
test("repeated seals and opens of one code run PBKDF2 exactly once", async () => {
  // 120 000 rounds per derivation, and the callers are hot (repost every 5 s,
  // one per relay onopen, one per inbound frame). The memo keys on the
  // normalised code; the wrong-code test above already proves a DIFFERENT
  // code cannot be served the cached key.
  const orig = crypto.subtle.deriveKey.bind(crypto.subtle);
  let derives = 0;
  Object.defineProperty(crypto.subtle, "deriveKey", {
    configurable: true,
    value: (...args) => { derives++; return orig(...args); },
  });
  try {
    const code = "APEX1.z.MEMOCODE";
    const s1 = await NetRendezvous.seal(code, "one");
    const s2 = await NetRendezvous.seal(code, "two");
    assert.equal(await NetRendezvous.open(code, s1), "one");
    assert.equal(await NetRendezvous.open(code, s2), "two");
    assert.equal(derives, 1, `PBKDF2 ran ${derives}× for one code`);
    await NetRendezvous.seal("APEX1.z.OTHERCODE", "x");
    assert.equal(derives, 2, "a new code derives a new key");
  } finally {
    delete crypto.subtle.deriveKey;
  }
});

test("waitFor() rides out a transient 429 instead of aborting the wait", async () => {
  const r = await relay({ flakyGets: 2 });
  try {
    const code = NetRendezvous.makeCode();
    assert.equal((await NetRendezvous.put(code, "answer", "APEX1.s.ANSWER")).ok, true);
    const got = await NetRendezvous.waitFor(code, "answer", null, null);
    assert.equal(got.ok, true, "two rate-limited polls then the payload: " + JSON.stringify(got));
    assert.equal(got.payload, "APEX1.s.ANSWER");
  } finally { await r.close(); }
});

test("waitFor() still gives up on a relay that is refusing every poll", async () => {
  const r = await relay({ flakyGets: 99 });
  try {
    const code = NetRendezvous.makeCode();
    const got = await NetRendezvous.waitFor(code, "answer", null, null);
    assert.equal(got.ok, false);
    assert.equal(got.error, "rate_limited", "the last transient error is what comes back after the streak cap");
  } finally { await r.close(); }
});
