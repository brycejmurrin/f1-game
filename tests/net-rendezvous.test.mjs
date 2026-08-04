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
 * Run: node --test tests/net-rendezvous.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
      if (!room[slot]) return send(404, { error: "not_found" });
      return send(200, { payload: room[slot] });
    }
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const payload = JSON.parse(body || "{}").payload;
      if (typeof payload !== "string" || !payload) return send(400, { error: "bad_payload" });
      if (slot === "offer" && room.offer && room.offer !== payload) {
        return send(409, { error: "taken" });
      }
      room[slot] = payload;
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
    const got = await NetRendezvous.get(code, "offer");
    assert.equal(got.ok, true);
    assert.equal(got.body.payload, "APEX1.s.OFFER");

    assert.equal((await NetRendezvous.put(code, "answer", "APEX1.s.ANSWER")).ok, true);
    const back = await NetRendezvous.get(code, "answer");
    assert.equal(back.body.payload, "APEX1.s.ANSWER");
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

test("with no relay configured it says so instead of pretending", async () => {
  NetRendezvous.setUrl(null);
  assert.equal(NetRendezvous.configured(), false);
  const res = await NetRendezvous.get("ABCDEF", "offer");
  assert.equal(res.ok, false);
  assert.equal(res.error, "not_configured");
  // Not silence, and not a stack trace: the message names the alternative.
  assert.match(res.message, /invite link/i);
});
