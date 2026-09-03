/* net-session.test.mjs — clock sync, routing and liveness, over a fake wire.
 *
 * Two sessions are wired to each other through the loopback transport, with
 * the two peers given DELIBERATELY DIFFERENT clocks. That is the realistic
 * case — two browsers share no clock at all — and it is the case that silently
 * ruins interpolation if the offset estimate is wrong: every snapshot lands in
 * the buffer at the wrong moment, so rivals stutter or lead/lag by a constant
 * amount that looks like lag but isn't.
 *
 * Run: node --test tests/unit/net-session.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
const load = (rel, name) => eval(fs.readFileSync(path.join(ROOT, rel), "utf8") + ";" + name);
// The shared math island, published so the files below resolve M4 at eval time
// (a strict-mode direct eval keeps its own declarations to itself).
globalThis.M4 = load("js/core/mat4.js", "M4");
const NetTransport = load("js/net/transport.js", "NetTransport");
// session.js shares NetSnapshot's ONE toView() rather than keeping a second
// copy that can drift. Loading it is not optional decoration: without it every
// state packet throws inside the message handler, the transport swallows the
// throw (a handler bug must not read as a disconnect), and the session simply
// never syncs its clock — a failure mode with no error message at all.
const NetSnapshot = load("js/net/snapshot.js", "NetSnapshot");
const NetSession = load("js/net/session.js", "NetSession");

const seededRnd = (seed) => {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0x100000000; };
};

// Two peers whose clocks disagree by `skew` ms, on a link with `latency` ms
// each way. Driving both from one virtual clock keeps every assertion exact.
function pair({ latency = 50, skew = 0, jitter = 0, loss = 0, seed = 1 } = {}) {
  const [ta, tb] = NetTransport.loopback({ latencyMs: latency, jitterMs: jitter, loss, rnd: seededRnd(seed) });
  const a = NetSession.create({ transport: ta, pingEveryMs: 100 });
  const b = NetSession.create({ transport: tb, pingEveryMs: 100 });
  let t = 0;
  return {
    a, b,
    // A single virtual clock; B simply reads `skew` higher than A.
    // The step is 1 ms deliberately: a coarser pump quantises each leg of the
    // round trip by up to a step, which shows up as tens of ms of apparent
    // offset error and would be measuring this harness rather than the
    // estimator. The real game pumps every frame, which is finer than this.
    advance(ms, step = 1) {
      for (let i = 0; i < ms; i += step) {
        t += step;
        a.pump(t);
        b.pump(t + skew);
      }
      return t;
    },
    now: () => t,
  };
}

test("clock offset is recovered across peers with unrelated clocks", () => {
  // B's clock reads 10 s ahead of A's. A must learn that, or every snapshot B
  // sends lands 10 s in A's future and the rival never draws at all.
  const p = pair({ latency: 50, skew: 10000 });
  p.advance(1500);

  assert.ok(p.a.synced(), "A should have a clock sample");
  assert.ok(p.b.synced(), "B should have a clock sample");
  assert.ok(Math.abs(p.a.offset() - 10000) < 5, `A's offset should be ~+10000, got ${p.a.offset()}`);
  assert.ok(Math.abs(p.b.offset() + 10000) < 5, `B's offset should be ~-10000, got ${p.b.offset()}`);
});

test("round-trip time is measured, and the one-way lag is half of it", () => {
  const p = pair({ latency: 50 });
  p.advance(1500);
  assert.ok(Math.abs(p.a.rtt() - 100) < 5, `100 ms round trip expected, got ${p.a.rtt()}`);
  assert.ok(Math.abs(p.a.lagMs() - 50) < 3, `50 ms one-way expected, got ${p.a.lagMs()}`);
});

test("a peer timestamp converts onto our timeline and back", () => {
  const p = pair({ latency: 40, skew: -7500 });
  p.advance(1500);
  const theirs = 1234567;
  const ours = p.a.peerToLocal(theirs);
  assert.ok(Math.abs(p.a.localToPeer(ours) - theirs) < 0.001, "conversion must round-trip");
  assert.ok(Math.abs(ours - (theirs + 7500)) < 5, "their clock is 7.5 s behind ours");
});

test("jitter does not drag the offset estimate around", () => {
  // The lowest-RTT sample is kept rather than the mean, because a slow reply
  // is a queued reply and queuing is pure error in the offset. Averaging would
  // fold that error in; this asserts it does not.
  const p = pair({ latency: 50, jitter: 40, skew: 3000, seed: 7 });
  p.advance(4000);
  assert.ok(Math.abs(p.a.offset() - 3000) < 25,
    `offset should hold near 3000 despite jitter, got ${p.a.offset()}`);
});

test("state packets are delivered to the game; ping/pong never are", () => {
  // Clock traffic shares the unreliable channel with snapshots, so the router
  // has to keep them apart — a ping reaching the snapshot decoder would be
  // read as a car at a garbage position.
  const p = pair({ latency: 20 });
  const got = [];
  p.b.onState((bytes) => got.push(new Uint8Array(bytes.buffer || bytes).slice()));
  // Sync first: unreliable STATE is held until synced() so a pre-PONG
  // snapshot cannot land at offset 0 and warp the rival when the clock lands.
  p.advance(1000);
  assert.ok(p.b.synced(), "clock must sync before game state is accepted");
  p.a.sendState(new Uint8Array([1, 2, 3, 4]));   // type 1 = snapshot
  p.advance(200);

  assert.equal(got.length, 1, `exactly one game packet expected, got ${got.length}`);
  assert.deepEqual(Array.from(got[0]), [1, 2, 3, 4]);
});

test("a pre-sync snapshot is held and delivered once the clock lands", () => {
  const p = pair({ latency: 20 });
  const got = [];
  p.b.onState((bytes) => got.push(new Uint8Array(bytes.buffer || bytes).slice()));
  assert.equal(p.b.synced(), false);
  p.a.sendState(new Uint8Array([1, 2, 3, 4]));
  // Snapshot one-way is 20 ms; the answering PONG needs the ping's 20+20.
  p.advance(30);
  assert.equal(got.length, 0, "unreliable STATE is held until the first PONG");
  p.advance(1000);
  assert.ok(p.b.synced(), "clock must sync");
  assert.equal(got.length, 1, "the held snapshot is flushed on PONG");
  assert.deepEqual(Array.from(got[0]), [1, 2, 3, 4]);
});

test("events are typed, and only their own handler sees them", () => {
  const p = pair({ latency: 10 });
  const laps = [], settings = [];
  p.b.onEvent("lap", (d) => laps.push(d));
  p.b.onEvent("settings", (d) => settings.push(d));

  p.a.sendEvent("lap", { driver: 4, time: 81.23 });
  p.a.sendEvent("settings", { track: "monza", laps: 5 });
  p.a.sendEvent("unhandled", { ignored: true });
  p.advance(200);

  assert.deepEqual(laps, [{ driver: 4, time: 81.23 }]);
  assert.deepEqual(settings, [{ track: "monza", laps: 5 }]);
});

test("events survive a lossy link because they ride the reliable channel", () => {
  // Lap times and race settings cannot be dropped. 60% loss on the state
  // channel must not touch them.
  const p = pair({ latency: 30, loss: 0.6, seed: 11 });
  const got = [];
  p.b.onEvent("x", (d) => got.push(d));
  for (let i = 0; i < 25; i++) p.a.sendEvent("x", i);
  p.advance(500);
  assert.equal(got.length, 25, "every event must arrive");
  assert.deepEqual(got, Array.from({ length: 25 }, (_, i) => i));
});

test("a malformed event is dropped rather than thrown", () => {
  const [ta, tb] = NetTransport.loopback({ latencyMs: 0, rnd: seededRnd(3) });
  const b = NetSession.create({ transport: tb });
  let fired = 0;
  b.onEvent("x", () => fired++);
  ta.send("event", "{ not json");
  ta.send("event", JSON.stringify({ no: "type field" }));
  b.pump(10);                       // must not throw
  assert.equal(fired, 0);
  assert.equal(b.alive(), true, "a bad event is not a disconnect");
});

test("silence is detected, and reported once", () => {
  const p = pair({ latency: 20 });
  const closes = [];
  p.a.onClose((why) => closes.push(why));
  p.advance(600);
  assert.equal(p.a.alive(), true, "still talking");

  // Pull the wire: A keeps pumping but nothing arrives.
  p.b.close();
  const t = p.now();
  for (let i = 0; i < 400; i++) p.a.pump(t + i * 10);

  assert.equal(p.a.alive(), false, "A should have noticed the silence");
  assert.ok(closes.length >= 1, "close should fire");
  assert.ok(closes.filter((c) => c === "timeout").length <= 1, "timeout must fire at most once");
});

test("a stall in OUR loop is not silence from THEM", () => {
  // Reported from a real race, half a second after lights-out: the guest built
  // the circuit — several seconds of blocked main thread on a phone, during
  // which nothing pumps — and the first pump afterwards saw the whole stall as
  // peer silence and announced RIVAL DISCONNECTED, handing a perfectly healthy
  // rival back to the AI. The same shape covers a backgrounded tab and a GC
  // pause. A gap in our own pumping says nothing about the other end.
  const p = pair({ latency: 20 });
  const closes = [];
  p.a.onClose((why) => closes.push(why));
  p.advance(600);
  assert.equal(p.a.alive(), true, "talking before the stall");

  // Both peers freeze for 10 s — far past timeoutMs — then resume together,
  // exactly as two paused game loops do.
  const t = p.now();
  const after = t + 10000;
  p.a.pump(after);
  p.b.pump(after);
  assert.equal(p.a.alive(), true, "a shared stall must not read as a disconnect");
  assert.deepEqual(closes, []);

  // ...and the connection carries on working.
  for (let i = 1; i < 400; i++) { p.a.pump(after + i); p.b.pump(after + i); }
  assert.equal(p.a.alive(), true, "still alive after the stall");

  // The forgiveness must NOT make a real disconnect undetectable: once we are
  // pumping normally again, silence still kills.
  p.b.close();
  for (let i = 400; i < 1500; i++) p.a.pump(after + i * 10);
  assert.equal(p.a.alive(), false, "a genuine silence must still be caught");
});

test("a slow connect is never mistaken for a disconnect", () => {
  // The death clock only starts once the peer has actually been heard from.
  // Otherwise a session that takes 3 s to establish would kill itself.
  const [ta] = NetTransport.loopback({ latencyMs: 0, rnd: seededRnd(5) });
  const a = NetSession.create({ transport: ta, timeoutMs: 500 });
  let closed = false;
  a.onClose(() => { closed = true; });
  for (let i = 0; i < 500; i++) a.pump(i * 10);   // 5 s, peer never replies
  assert.equal(closed, false, "must not time out before the first packet ever arrives");
  assert.equal(a.alive(), true);
});

test("a throwing state handler does not kill the session", () => {
  const p = pair({ latency: 10 });
  let second = 0;
  p.b.onState(() => { throw new Error("consumer bug"); });
  p.b.onState(() => second++);
  p.advance(200);   // sync before STATE is accepted
  assert.ok(p.b.synced());
  p.a.sendState(new Uint8Array([1, 0, 0, 0, 0, 0]));
  p.advance(200);
  assert.equal(second, 1, "the other handler should still run");
  assert.equal(p.b.alive(), true, "a consumer bug is not a disconnect");
});

test("a session that times out CLOSES ITS TRANSPORT, not just its bookkeeping", () => {
  // The leak, found by a survey read of the file: the timeout branch in pump()
  // set `alive = false` and fired the close handlers but never touched the
  // transport — and close() below it opens with `if (!alive) return;`, so once
  // the death clock had fired NOTHING could ever tear the connection down.
  // A peer that vanished (rather than saying BYE) therefore left its
  // RTCPeerConnection and both data channels open for the life of the tab, and
  // every timed-out session added another set. Invisible from the game: the
  // rival goes back to the AI either way, which is exactly why it survived.
  //
  // Asserted on the TRANSPORT, because that is the resource that leaked. The
  // spy wraps ONE side of a real loopback pair rather than standing alone: a
  // lone transport is never heard from, so its death clock never starts (see
  // "a slow connect is never mistaken for a disconnect") and a test built that
  // way passes while asserting nothing at all. The peer has to talk first.
  const [ta, tb] = NetTransport.loopback({ latencyMs: 0, rnd: seededRnd(11) });
  let closedTimes = 0;
  const spy = Object.create(ta);
  spy.close = () => { closedTimes++; ta.close(); };
  const a = NetSession.create({ transport: spy, pingEveryMs: 100, timeoutMs: 500 });
  const b = NetSession.create({ transport: tb, pingEveryMs: 100 });
  const whys = [];
  a.onClose((w) => whys.push(w));

  // Talk normally, so A has actually heard from B and the death clock starts.
  for (let t = 0; t < 600; t++) { a.pump(t); b.pump(t); }
  assert.equal(a.alive(), true, "the pair must be healthy before the wire is pulled");
  assert.equal(closedTimes, 0, "nothing closes a healthy transport");

  // Pull the wire: B stops pumping entirely and A hears nothing more.
  for (let t = 600; t < 3000; t++) a.pump(t);

  assert.equal(a.alive(), false, "A must have noticed the silence");
  assert.deepEqual(whys, ["timeout"], "the close reason must still be `timeout`");
  assert.equal(closedTimes, 1, "the transport must be closed exactly once on timeout");
  // And the guard that made this unrecoverable stays honest: the `!alive`
  // early return in close() must not let a later close() double-close.
  a.close();
  assert.equal(closedTimes, 1, "close() after a timeout must not close the transport again");
});

// ── round 8: release is latched separately from alive ────────────────────────
test("after the transport closes itself, session.close() neither throws nor re-closes", () => {
  // The transport's close event marks it RELEASED — it closed itself, there
  // is nothing left to release. A later session.close() must be a clean
  // no-op: the old shape (`if (!alive) return` before any transport work)
  // hid the opposite bug, where close() could never reach the transport at
  // all once an event had flipped `alive` first.
  const [ta, tb] = NetTransport.loopback({ latencyMs: 0, rnd: seededRnd(21) });
  let closedTimes = 0;
  const spy = Object.create(ta);
  spy.close = () => { closedTimes++; ta.close(); };
  const a = NetSession.create({ transport: spy, pingEveryMs: 100 });
  const whys = [];
  a.onClose((w) => whys.push(w));
  a.pump(0); tb.pump(0);
  tb.close();                          // peer side pulls the plug
  a.pump(1);                           // deliver the close
  assert.equal(a.alive(), false);
  assert.deepEqual(whys, ["transport"]);
  a.close();                           // must not re-close or re-fire
  assert.equal(closedTimes, 0, "the transport closed itself; nothing to release");
  assert.deepEqual(whys, ["transport"], "close handlers fire once");
});

// EVERY TEST ABOVE WIRES TWO SESSIONS TOGETHER, which is the one arrangement
// that cannot expose this bug: both ends run session.js, so a PING is always
// answered. __apex.netLoopback builds a different shape — a session on the
// game's side and a BARE NetTransport endpoint as the far end — and a bare
// endpoint answers nothing. synced() never becomes true, so every snapshot
// lands in heldState and the game is handed nothing, while the session still
// reports alive with a fresh lastHeard: connected, no rival, no error.
//
// That is exactly what the multiplayer-session browser specs were failing on
// (buffered: 0 on every one of them), and no unit test could see it because
// the only harness here was session-to-session. These two are the missing
// shape: bare endpoint without the responder, and with it.
function bareFarEnd({ latency = 0 } = {}) {
  const [ta, tb] = NetTransport.loopback({ latencyMs: latency, rnd: seededRnd(31) });
  const T0 = 1000;
  ta.pump(T0); tb.pump(T0);                       // both epochs, as netLoopback does
  return { near: ta, far: tb, T0 };
}
// A REAL-LENGTH snapshot, not a 4-byte stub: PING_BYTES is 13, so a short
// stub is rejected by the length check alone and the type check below never
// gets to prove itself (checked — with the type check removed a 4-byte body
// still passes, a 24-byte one does not).
const snapshotBytes = () => { const u = new Uint8Array(24); u[0] = 1; u[1] = 2; u[2] = 3; u[3] = 4; return u; };

test("a session talking to a BARE endpoint never syncs, and the game gets nothing", () => {
  const { near, far, T0 } = bareFarEnd();
  const session = NetSession.create({ transport: near });
  const got = [];
  session.onState((bytes) => got.push(bytes));
  session.pump(T0);                               // sends the first PING
  far.pump(T0);                                   // the far end receives it and ignores it
  far.send(NetTransport.STATE, snapshotBytes());
  session.pump(T0 + 10);

  assert.equal(session.synced(), false, "nothing can answer the PING, so no clock sample exists");
  assert.equal(got.length, 0, "the snapshot is held, not delivered");
  // The trap that makes this silent: none of the obvious health signals move.
  assert.equal(session.alive(), true, "the session still reports itself alive");
  assert.equal(session.lastHeard(), T0 + 10, "and still reports hearing the peer");
});

test("autoPong makes a bare endpoint stand in for a peer, and state flows", () => {
  const { near, far, T0 } = bareFarEnd();
  assert.equal(NetSession.autoPong(far), true, "autoPong attaches to a transport endpoint");
  const session = NetSession.create({ transport: near });
  const got = [];
  session.onState((bytes) => got.push(bytes));
  session.pump(T0);                               // PING out at t0
  far.pump(T0);                                   // PONG queued, stamped with the far clock
  far.send(NetTransport.STATE, snapshotBytes());
  session.pump(T0 + 10);                          // PONG then snapshot, in send order

  assert.equal(session.synced(), true, "one round trip is enough");
  assert.equal(session.rtt(), 10, "the round trip is the two pumps' separation");
  assert.equal(got.length, 1, "the snapshot reaches the game on the same pump");
  assert.deepEqual(Array.from(new Uint8Array(got[0].buffer || got[0])).slice(0, 4), [1, 2, 3, 4],
    "the bytes the game receives are the bytes the peer sent");
});

test("autoPong answers only PINGs, and refuses a transport it cannot use", () => {
  const { near, far, T0 } = bareFarEnd();
  NetSession.autoPong(far);
  const session = NetSession.create({ transport: near });
  const seen = [];
  session.onState((bytes) => seen.push(bytes));
  session.pump(T0); far.pump(T0);
  // A snapshot arriving at the far end must not be answered as if it were a
  // ping — a PONG built from snapshot bytes poisons offset for the session.
  near.send(NetTransport.STATE, snapshotBytes());
  far.pump(T0 + 5);
  session.pump(T0 + 10);
  assert.equal(session.stats().samples, 1, "exactly one clock sample: the PING's, not the snapshot's");
  assert.equal(NetSession.autoPong(null), false);
  assert.equal(NetSession.autoPong({}), false, "a thing with no onMessage/send is not a transport");
});

// The handshake rides the SAME unreliable channel as the snapshots, and a
// snapshot is not handed to the game until synced() — so on a lossy link the
// rival simply does not appear, with no error and nothing on screen, for as
// long as the round trip keeps failing. At the steady-state 500 ms cadence and
// 50% loss (both legs must survive, so 25% per attempt) one second of pumping
// is a coin flip: 221 of 500 seeded links. Pinging every 100 ms UNTIL the
// first sample lands takes that to 473 of 500, and 4 s to 500 of 500.
test("an unsynced session pings harder than a synced one", () => {
  const sent = [];
  const fake = {
    onMessage() { return this; }, onClose() { return this; },
    send(channel, data) { sent.push({ channel, at: data && data.length }); return true; },
    pump() { return 0; }, close() {},
  };
  const s = NetSession.create({ transport: fake });
  // Nothing answers, so synced() stays false and the fast cadence holds.
  for (let t = 0; t <= 1000; t += 25) s.pump(t);
  assert.equal(s.synced(), false);
  const unsyncedPings = sent.length;
  assert.ok(unsyncedPings >= 9,
    `expected ~10 pings in 1 s at the 100 ms sync cadence, got ${unsyncedPings}`);
  // And the steady-state cadence is the slower one: a session given the SAME
  // second at 500 ms would send about two.
  const slow = NetSession.create({ transport: fake, syncPingEveryMs: 500 });
  const before = sent.length;
  for (let t = 0; t <= 1000; t += 25) slow.pump(t);
  const slowPings = sent.length - before;
  assert.ok(slowPings <= 3 && slowPings < unsyncedPings,
    `500 ms cadence should send ~2-3 pings in a second, got ${slowPings} against ${unsyncedPings}`);
});

test("the fast cadence stops once the clock has landed", () => {
  // A real loopback pair with an answering far end, so synced() actually flips,
  // and a counter on the near end's send so the cadence is measured on the
  // wire rather than inferred from sample counts (which saturate at
  // clockSamples and cannot tell 100 ms from 500 ms).
  const [ta, tb] = NetTransport.loopback({ latencyMs: 0, rnd: seededRnd(41) });
  NetSession.autoPong(tb);
  let pings = 0;
  const send = ta.send.bind(ta);
  ta.send = (channel, data) => {
    if (channel === NetTransport.STATE && data && data.length === 13) pings++;
    return send(channel, data);
  };
  const s = NetSession.create({ transport: ta, pingEveryMs: 500, syncPingEveryMs: 100 });
  let t = 0;
  const step = () => { t += 25; s.pump(t); tb.pump(t); };
  while (t < 300) step();
  assert.ok(s.synced(), "a clean link syncs inside 300 ms even at the slow cadence");
  const afterSync = pings;
  while (t < 1300) step();                 // one more second, now synced
  const steady = pings - afterSync;
  assert.ok(steady >= 1 && steady <= 3,
    `a synced session pings ~2x per second at 500 ms, sent ${steady}`);
});
