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
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function boot({ joinMs, listenMs, stableMs } = {}) {
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
    setTimeout, clearTimeout, setInterval, clearInterval, btoa, atob,
    crypto: webcrypto,
    WebSocket: FakeWebSocket,
    document,
    localStorage: { getItem: (k) => (k === "apex26.nostrRelays" ? JSON.stringify(["wss://a.test", "wss://b.test"]) : null), setItem() {}, removeItem() {} },
    Log: { info() {}, warn() {}, error() {} },
    __importNostr: () => Promise.resolve(mod),
  };
  const ctx = vm.createContext(sb);
  for (const f of ["js/net/bytes.js", "js/net/rendezvous.js"]) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  const src = read("js/net/nostr.js");
  assert.ok(src.includes('import("@trystero-p2p/nostr")'), "the vendored import is the seam this test replaces");
  let patched = src.replace('import("@trystero-p2p/nostr")', "__importNostr()").replace(/^const\b/gm, "var");
  // A shortened guest find-window, so the reply-deadline case runs in seconds.
  if (joinMs) patched = patched.replace("const JOIN_TIMEOUT_MS = 12000", "const JOIN_TIMEOUT_MS = " + joinMs);
  if (listenMs) patched = patched.replace("const LISTEN_TIMEOUT_MS = 300000", "const LISTEN_TIMEOUT_MS = " + listenMs);
  if (stableMs) patched = patched.replace("Date.now() - openAt >= 5000", "Date.now() - openAt >= " + stableMs);
  vm.runInContext(patched, ctx, { filename: absSrc("js/net/nostr.js") });
  const NetNostr = vm.runInContext("NetNostr", ctx);
  const tick = () => new Promise((r) => setTimeout(r, 20));
  // The topics are PBKDF2-stretched (120 000 rounds) before any socket opens.
  const untilSockets = async (n) => { for (let i = 0; i < 300 && sockets.length < n; i++) await tick(); };
  return { NetNostr, NetRendezvous: vm.runInContext("NetRendezvous", ctx), NetBytes: vm.runInContext("NetBytes", ctx), sockets, document, listeners, tick, untilSockets, fire: (ev) => { const fn = listeners.get(ev); if (fn) fn(); } };
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

test("a relay that opens then closes keeps backing off; one that stayed up is retried at 1 s (#4472)", async () => {
  const h = boot({ stableMs: 150 });
  const room = await h.NetNostr.directExchange({ code: "ABCDEF", send: "OFFER", onJoiner: () => {} });
  await h.untilSockets(2);
  const url = h.sockets[0].url;
  const count = () => h.sockets.filter((s) => s.url === url).length;
  h.sockets[0].open(); h.sockets[0].drop();                      // flap 1: closes at once
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(count(), 2, "first retry after 1 s");
  h.sockets.filter((s) => s.url === url)[1].open(); h.sockets.filter((s) => s.url === url)[1].drop();   // flap 2
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(count(), 2, "second retry waits 2 s, not 1 s: the open did not reset the backoff");
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(count(), 3, "second retry after 2 s");
  const third = h.sockets.filter((s) => s.url === url)[2];
  third.open();
  await new Promise((r) => setTimeout(r, 200));                  // stayed open past stableMs
  third.drop();
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(count(), 4, "a socket that stayed up earns the 1 s backoff again");
  room.stop();
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
  assert.match(src, /Check the letters/);
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

test("a guest that finds the offer late is not expired while it builds the answer (bug-hunt 8.3)", async () => {
  // JOIN_TIMEOUT_MS (shortened to 1.5 s here) is the window to FIND the offer.
  // The reply (build + ICE gather) takes 2.5 s: longer than the whole window.
  // Before the fix the join timer kept running, won, and heard() returned
  // without ever publishing the answer.
  const h = boot({ joinMs: 1500 });
  assert.equal(h.NetNostr.JOIN_TIMEOUT_MS, 1500, "the patch took");
  const token = { cancelled: false };
  let res = null, replyDone = false;
  const p = h.NetNostr.directExchange({
    code: "ABCDEF", token,
    reply: async () => { await new Promise((r) => setTimeout(r, 2500)); replyDone = true; return "ANSWER"; },
  }).then((r) => { res = r; return r; });
  await h.untilSockets(1);
  const w = h.sockets[0];
  w.open();
  const sealed = await h.NetRendezvous.seal("ABCDEF", "OFFER", "offer");
  const now = Math.floor(Date.now() / 1000);
  w.onmessage({ data: JSON.stringify(["EVENT", "s1", {
    content: h.NetBytes.bytesToB64(sealed), created_at: now,
  }]) });
  await new Promise((r) => setTimeout(r, 3300));      // past find window AND the reply
  assert.equal(replyDone, true, "precondition: the reply finished after the find window");
  assert.equal(res, null, "the exchange was not expired mid-reply");
  assert.ok(w.sent.some((f) => f.startsWith('["EVENT"')), "the answer reached the wire");
  token.cancelled = true;                              // tick() finishes it within a second
  await p;
});

test("a replayed old offer is ignored; a fresh offer is still answered (created_at floor)", async () => {
  // since is stripped (clock skew). Without a local floor a relay replaying an
  // earlier host session's offer would be answered. hostStartedAt − ~30 s.
  const h = boot();
  let answered = 0;
  const token = { cancelled: false };
  const p = h.NetNostr.directExchange({
    code: "ABCDEF", token,
    reply: async () => { answered++; return "ANSWER"; },
  });
  await h.untilSockets(1);
  const w = h.sockets[0];
  w.open();
  await h.tick();
  const req = JSON.parse(w.sent[0]);
  assert.equal(req[2].since, undefined, "since stays stripped");

  const now = Math.floor(Date.now() / 1000);
  const staleSealed = await h.NetRendezvous.seal("ABCDEF", "OLD-OFFER", "offer");
  w.onmessage({ data: JSON.stringify(["EVENT", "s1", {
    content: h.NetBytes.bytesToB64(staleSealed),
    created_at: now - 3600,
  }]) });
  await h.tick();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(answered, 0, "stale offer must not be answered");
  assert.ok(!w.sent.some((f) => f.startsWith('["EVENT"')), "no answer on the wire for stale");

  const freshSealed = await h.NetRendezvous.seal("ABCDEF", "NEW-OFFER", "offer");
  w.onmessage({ data: JSON.stringify(["EVENT", "s1", {
    content: h.NetBytes.bytesToB64(freshSealed),
    created_at: now,
  }]) });
  await h.tick();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(answered, 1, "fresh offer is answered");
  assert.ok(w.sent.some((f) => f.startsWith('["EVENT"')), "answer published for fresh offer");
  token.cancelled = true;
  await p;
});

// A relay replays an offer the host already used for an earlier guest (inside
// the 300 s created_at slack). The guest answered it, latched, and ignored the
// host's current offer; the host dropped the answer as wrong_offer.
async function guestHears(h, w, text, createdAt) {
  const sealed = await h.NetRendezvous.seal("ABCDEF", text, "offer");
  w.onmessage({ data: JSON.stringify(["EVENT", "s1", { content: h.NetBytes.bytesToB64(sealed), created_at: createdAt }]) });
  for (let i = 0; i < 10; i++) await h.tick();
}
for (const reanswer of [true, false]) {
  test(`a guest ${reanswer ? "answers" : "(without reanswer) ignores"} a NEWER offer after answering a replayed one`, async () => {
    const h = boot();
    const replies = [];
    const token = { cancelled: false };
    const p = h.NetNostr.directExchange({ code: "ABCDEF", token, reanswer,
      reply: async (offer) => { replies.push(offer); return "ANSWER-" + offer; } });
    await h.untilSockets(1);
    const w = h.sockets[0];
    w.open();
    const now = Math.floor(Date.now() / 1000);
    await guestHears(h, w, "CONSUMED-OFFER", now - 60);   // replayed: inside the slack
    assert.deepEqual(replies, ["CONSUMED-OFFER"], "the first offer heard is answered at once");
    await guestHears(h, w, "CONSUMED-OFFER", now - 55);   // a re-post of the same offer
    await guestHears(h, w, "OLDER-OFFER", now - 120);     // signed earlier by the host
    assert.equal(replies.length, 1, "neither a re-post nor an older offer is answered again");
    await guestHears(h, w, "CURRENT-OFFER", now);         // the host's live offer
    if (reanswer) {
      assert.deepEqual(replies, ["CONSUMED-OFFER", "CURRENT-OFFER"], "the newer offer is answered");
      const published = w.sent.filter((f) => f.startsWith('["EVENT"')).length;
      assert.ok(published >= 2, "both answers reached the wire");
    } else {
      assert.equal(replies.length, 1, "control: the default exchange still latches");
    }
    token.cancelled = true;
    await p;
  });
}

test("a guest's re-answer that fails keeps the answer already on the wire, and re-answers are bounded", async () => {
  const h = boot();
  const replies = [];
  const token = { cancelled: false };
  const p = h.NetNostr.directExchange({ code: "ABCDEF", token, reanswer: true,
    reply: async (offer) => { replies.push(offer); return offer === "B" ? null : "ANSWER-" + offer; } });
  await h.untilSockets(1);
  const w = h.sockets[0];
  w.open();
  const now = Math.floor(Date.now() / 1000);
  await guestHears(h, w, "A", now - 10);
  await guestHears(h, w, "B", now - 9);        // reply refuses (e.g. already connected)
  let settledEarly = false;
  p.then(() => { settledEarly = true; });
  for (let i = 0; i < 10; i++) await h.tick();
  assert.equal(settledEarly, false, "a failed re-answer does not fail the exchange");
  for (let k = 0; k < 6; k++) await guestHears(h, w, "C" + k, now - 8 + k);
  assert.equal(replies.length, 1 + h.NetNostr.REANSWER_MAX, "at most REANSWER_MAX further offers are answered");
  token.cancelled = true;
  await p;
});

// A relay refusing our event for its timestamp means this device's clock is
// off; the advice blamed the room code ("Every room relay is refusing this code").
test("a relay refusing our event as too old says the clock is off, not the code", async () => {
  const h = boot();
  const advised = [];
  const room = await h.NetNostr.directExchange({ code: "ABCDEF", send: "OFFER", onJoiner: () => {},
    onFail: (r) => advised.push(r) });
  await h.untilSockets(2);
  const [a] = h.sockets;
  a.open();
  for (let i = 0; i < 300 && !a.sent.some((f) => f.startsWith('["EVENT"')); i++) await h.tick();
  const ev = JSON.parse(a.sent.find((f) => f.startsWith('["EVENT"')))[1];
  a.onmessage({ data: JSON.stringify(["OK", ev.id, false, "invalid: created_at too early"]) });
  assert.equal(advised.length, 1, "advised once");
  assert.equal(advised[0].error, "clock_skew");
  assert.equal(advised[0].advisory, true);
  assert.match(advised[0].message, /clock/i);
  assert.doesNotMatch(advised[0].message, /this code/i);
  a.onmessage({ data: JSON.stringify(["OK", ev.id, false, "blocked: pubkey not admitted"]) });
  assert.equal(advised.length, 1, "no second, contradicting advisory");
  assert.ok(h.NetNostr.CLOCK_REFUSAL.test("invalid: event creation date is too far off from the current time"));
  assert.ok(!h.NetNostr.CLOCK_REFUSAL.test("blocked: pubkey not in our web of trust"));
  room.stop();
});

test("the ICE-restart listener holds one socket set for a race, not a re-dial every JOIN window (perf hunt 6)", async (t) => {
  // Scaled clock, 1/120: JOIN 12 s -> 100 ms, LISTEN 300 s -> 2.5 s, so one
  // real second is a fake 120 s of healthy racing. The loop is transport.js
  // answerRestart: a quiet relay ("expired") is worth another listen.
  const SCALE = 120, joinMs = 12000 / SCALE, listenMs = 300000 / SCALE, fake120s = 120000 / SCALE;
  const race = async (listen) => {
    const h = boot({ joinMs, listenMs });
    assert.equal(h.NetNostr.LISTEN_TIMEOUT_MS, listenMs, "the patch took");
    const token = { cancelled: false }, t0 = Date.now();
    setTimeout(() => { token.cancelled = true; }, fake120s);
    let r = null;
    do r = await h.NetNostr.directExchange({ code: "R3STRT", token, listen, reply: async () => null });
    while (r && r.error === "expired" && !token.cancelled);
    assert.ok(Date.now() - t0 >= fake120s, "the listener ran the whole window");
    return h.sockets.length;
  };
  const relays = 2;   // the stub's apex26.nostrRelays
  const before = await race(false), after = await race(true);
  t.diagnostic(`sockets per fake 120 s with ${relays} relays: ${before} (JOIN window) -> ${after} (listen window)`);
  assert.equal(after, relays, "one WebSocket (one TLS handshake) per relay for the whole fake 120 s");
  assert.ok(before >= 2 * relays, `control: the JOIN-window listener re-dialled (${before} sockets)`);
});
