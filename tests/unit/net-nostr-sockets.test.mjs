/* net-nostr-sockets.test.mjs — the room-code exchange's relay sockets, on a fake WebSocket.
 *
 * Two things a phone host hit in the field:
 *   - the REQ carried `since: now()` from Trystero — THIS device's clock — and a
 *     relay applies it to live events, so a phone a few minutes fast never
 *     heard the host's offer;
 *   - a socket the browser closed while the page was hidden (the host
 *     switching to a messaging app to send the code) was never reopened, so
 *     the room went deaf and the host was told "Nobody joined".
 * The module is evaluated in a VM with a WebSocket the test drives by hand and
 * a stub of the two vendored Trystero helpers it calls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function boot() {
  const sockets = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url; this.readyState = 0; this.sent = [];
      this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
      sockets.push(this);
    }
    send(frame) { this.sent.push(frame); }
    close() { if (this.readyState === 3) return; this.readyState = 3; if (this.onclose) this.onclose({}); }
    // test controls
    open() { this.readyState = 1; if (this.onopen) this.onopen(); }
    drop() { this.readyState = 3; if (this.onclose) this.onclose({}); }   // the browser killed it
  }
  const listeners = new Map();
  const document = {
    hidden: false,
    addEventListener: (ev, fn) => listeners.set(ev, fn),
    removeEventListener: (ev, fn) => { if (listeners.get(ev) === fn) listeners.delete(ev); },
  };
  // The two vendored Trystero helpers the exchange calls, with Trystero's
  // own REQ shape (kinds / since / #x), so the test proves what is stripped.
  const mod = {
    subscribe: (subId, topic) => JSON.stringify(["REQ", subId, { kinds: [22222], since: Math.floor(Date.now() / 1000), "#x": [topic] }]),
    createEvent: async (topic, content) => JSON.stringify(["EVENT", { id: "id" + Math.random().toString(36).slice(2), kind: 22222, content, tags: [["x", topic]] }]),
  };
  const sb = {
    console, Object, Array, String, Number, Promise, JSON, Math, Date, Map, Set, Error, TypeError, URL,
    Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, DataView,
    setTimeout, clearTimeout, setInterval, clearInterval,
    crypto: webcrypto,
    WebSocket: FakeWebSocket,
    document,
    localStorage: { getItem: (k) => (k === "apex26.nostrRelays" ? JSON.stringify(["wss://a.test", "wss://b.test"]) : null), setItem() {}, removeItem() {} },
    Log: { info() {}, warn() {}, error() {} },
    __importNostr: () => Promise.resolve(mod),
  };
  const ctx = vm.createContext(sb);
  for (const f of ["js/net/bytes.js", "js/net/rendezvous.js"]) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  const src = read("js/net/nostr.js");
  assert.ok(src.includes('import("@trystero-p2p/nostr")'), "the vendored import is the seam this test replaces");
  vm.runInContext(src.replace('import("@trystero-p2p/nostr")', "__importNostr()").replace(/^const\b/gm, "var"), ctx, { filename: "js/net/nostr.js" });
  const NetNostr = vm.runInContext("NetNostr", ctx);
  const tick = () => new Promise((r) => setTimeout(r, 20));
  // The topics are PBKDF2-stretched (120 000 rounds) before any socket opens.
  const untilSockets = async (n) => { for (let i = 0; i < 300 && sockets.length < n; i++) await tick(); };
  return { NetNostr, sockets, document, listeners, tick, untilSockets, fire: (ev) => { const fn = listeners.get(ev); if (fn) fn(); } };
}

test("the REQ carries no `since`: a fast device clock must not filter the host's offer", async () => {
  const h = boot();
  const p = h.NetNostr.directExchange({ code: "ABCDEF", send: "OFFER", onJoiner: () => {} });
  await h.untilSockets(2);
  assert.equal(h.sockets.length, 2, "one socket per relay");
  h.sockets[0].open();
  await h.tick();
  const req = JSON.parse(h.sockets[0].sent[0]);
  assert.equal(req[0], "REQ");
  assert.ok(Array.isArray(req[2].kinds) && req[2]["#x"], "kinds and the topic tag survive");
  assert.equal(req[2].since, undefined, "no device-clock lower bound");
  const room = await p;
  assert.equal(room.ok, true);
  room.stop();
});

test("a socket the browser dropped is reopened, and once at return to the foreground", async () => {
  const h = boot();
  const p = h.NetNostr.directExchange({ code: "ABCDEF", send: "OFFER", onJoiner: () => {} });
  await h.tick();
  const room = await p;
  const [a, b] = h.sockets;
  a.open(); b.open();
  await h.tick();
  // The page is hidden; the browser kills both sockets.
  h.document.hidden = true;
  a.drop(); b.drop();
  assert.equal(h.sockets.length, 2, "nothing reopens while hidden and before the backoff");
  // Back to the foreground: reopened at once, one per relay, no duplicates.
  h.document.hidden = false;
  h.fire("visibilitychange");
  assert.equal(h.sockets.length, 4, "one new socket per relay");
  assert.deepEqual(h.sockets.slice(2).map((s) => s.url).sort(), ["wss://a.test", "wss://b.test"]);
  h.fire("visibilitychange");
  assert.equal(h.sockets.length, 4, "a second visibility event opens nothing while those are connecting");
  h.sockets[2].open();
  assert.equal(JSON.parse(h.sockets[2].sent[0])[0], "REQ", "the reopened socket re-subscribes");
  // With the page visible, a dropped socket comes back on the backoff alone.
  h.sockets[2].drop();
  assert.equal(h.sockets.length, 4);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(h.sockets.length, 5, "reopened after the first backoff step");
  assert.equal(h.sockets[4].url, "wss://a.test");
  room.stop();
  await h.tick();
  assert.equal(h.listeners.size, 0, "stop() removes the visibility listener");
});

test("after stop() a closing socket is not reopened", async () => {
  const h = boot();
  const room = await h.NetNostr.directExchange({ code: "ABCDEF", send: "OFFER", onJoiner: () => {} });
  await h.untilSockets(1);
  h.sockets[0].open();
  room.stop();
  const n = h.sockets.length;
  h.fire("visibilitychange");
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(h.sockets.length, n, "nothing reopens once the exchange is over");
});

test("JOIN_TIMEOUT_MS is the ~8–15 s lobby join target, not a two-minute hang", () => {
  const h = boot();
  assert.ok(h.NetNostr.JOIN_TIMEOUT_MS >= 8000, "enough headroom for relay open + a few reposts");
  assert.ok(h.NetNostr.JOIN_TIMEOUT_MS <= 15000, "fake/missing codes must not sit on Looking for…");
});

test("HOST_TIMEOUT_MS is ~120 s so a typed room code still works (#1061 guest stay short)", () => {
  const h = boot();
  assert.ok(h.NetNostr.HOST_TIMEOUT_MS >= 60000, "host must outlast a human carrying the code");
  assert.ok(h.NetNostr.HOST_TIMEOUT_MS <= 180000, "not forever — INVITE ANOTHER refreshes");
  assert.ok(h.NetNostr.HOST_TIMEOUT_MS > h.NetNostr.JOIN_TIMEOUT_MS * 4,
    "host and guest deadlines must not share the 12 s JOIN window");
});

test("Nostr expired copy is actionable (no false 'couple of minutes' claim)", () => {
  const src = read("js/net/nostr.js");
  assert.match(src, /Nobody answered that code/);
  assert.match(src, /Check the six characters/);
  assert.match(src, /fresh one/);
  assert.doesNotMatch(src, /Codes only last a couple of minutes/);
});

test("host expiry uses HOST_TIMEOUT_MS; guest keeps JOIN_TIMEOUT_MS (source)", () => {
  const src = read("js/net/nostr.js");
  assert.match(src, /const HOST_TIMEOUT_MS = 120000/);
  assert.match(src, /hosting \? HOST_TIMEOUT_MS : JOIN_TIMEOUT_MS/);
  assert.match(src, /clearExpire\(\)/, "guest clears expiry once the answer is posted");
});

test("host room survives past JOIN_TIMEOUT; guest still expires around it (acceptance)", async () => {
  // Live repro 14296/3faf59d9: host code T9Q4VH died at 12 s with JOIN_TIMEOUT
  // shared across roles. Real timers (PBKDF2 needs them); host + guest run in
  // parallel so wall time is one JOIN_TIMEOUT window, not two.
  const hostH = boot();
  const guestH = boot();
  let hostFail = null;
  const hostP = hostH.NetNostr.directExchange({
    code: "T9Q4VH", send: "OFFER", onJoiner: () => {},
    onFail: (r) => { hostFail = r; },
  });
  const guestP = guestH.NetNostr.directExchange({
    code: "ZZZZZZ",
    reply: async () => { throw new Error("no offer expected"); },
  });
  await Promise.all([hostH.untilSockets(1), guestH.untilSockets(1)]);
  hostH.sockets[0].open();
  guestH.sockets[0].open();
  const hostRoom = await hostP;
  assert.equal(hostRoom.ok, true, "host exchange resolves to a live room handle");

  const joinMs = guestH.NetNostr.JOIN_TIMEOUT_MS;
  assert.ok(joinMs <= 15000, "#1061 guest window intact");
  const guestRes = await Promise.race([
    guestP,
    new Promise((_, rej) => setTimeout(() => rej(new Error("guest hung past JOIN_TIMEOUT")), joinMs + 3000)),
  ]).then((r) => r, (e) => e);
  assert.equal(guestRes && guestRes.ok, false, "missing-code guest still fails");
  assert.equal(guestRes && guestRes.error, "expired", "…with expired, not a hang");

  // Same wall time is still well under HOST_TIMEOUT — host must not have fired onFail.
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(hostFail, null, "host must NOT expire at JOIN_TIMEOUT");
  assert.ok(hostH.sockets.some((s) => s.readyState === 1), "host sockets still open past guest expiry");
  hostRoom.stop();
});
