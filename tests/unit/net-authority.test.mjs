/* net-authority.test.mjs — WHO IS ALLOWED TO DECLARE WHAT, over a fake wire.
 *
 * js/net/netplay.js states its authority model in one place, as two predicates:
 *
 *     function ownsRaceControl()    { return !active || role === "host"; }
 *     function ownsClassification() { return !active || role === "host"; }
 *
 * The SEND sides have always consulted it — nameTheMoment() and reportCaution()
 * both refuse outright unless this side is the host. The RECEIVE side did not,
 * and that asymmetry is not covered by the star topology. The star protects the
 * GUESTS, who only ever hear from the host; it leaves the HOST exposed, because
 * a host holds one session per guest and bound these handlers to every one of
 * them. So a guest could set the host's netStart (lights out on the host's
 * screen, at a moment of the guest's choosing), apply a caution to the host's
 * race, or fill the field whose own declaration reads "the host's
 * classification, if sent".
 *
 * This is the EVENT-channel twin of a bug the same file already fixed on the
 * STATE channel and documented at length in onState(): "Routing on entry.id
 * alone let a guest pose any car on the grid — including another player's."
 * Same shape, same file, other channel — which is the reason these tests exist
 * as behaviour rather than as a note.
 *
 * The harness drives NetPlay with a stub G and a hand-rolled session, so the
 * whole thing runs in `node --test` in milliseconds. That matters: authority is
 * exactly the kind of property worth being able to test cheaply and often, and
 * before this file the only way to reach netplay.js at all was a browser spec.
 *
 * Run: node --test tests/unit/net-authority.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";
import { fnSource } from "../helpers/fn-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
// netplay.js closes over NetSnapshot and NetSession as globals, so they have to
// exist by the time create() runs. Loading the real ones (rather than stubbing)
// keeps the interp buffer honest and costs nothing.
globalThis.M4 = eval(src("js/core/mat4.js") + ";M4");   // shared math island — snapshot.js binds M4 at eval
const NetSnapshot = eval(src("js/net/snapshot.js") + ";NetSnapshot");
const NetSession = eval(src("js/net/session.js") + ";NetSession");
globalThis.NetSnapshot = NetSnapshot;
globalThis.NetSession = NetSession;
const NetPlay = eval(src("js/net/netplay.js") + ";NetPlay");

test("a host RESULT must be a bijection before its timing mutates any guest car", () => {
  const netOrderSource = fnSource(src("js/game.js"), "function netOrder(order)");
  const classify = (verdict) => {
    const cars = [{ driverId: "a", finishT: 10 }, { driverId: "b", finishT: 20 }, { driverId: "c", finishT: 30 }];
    const netPlay = { active: () => true, ownsClassification: () => false, peerResult: () => verdict };
    const context = vm.createContext({ cars, netPlay, Map, Set, Number, Array });
    vm.runInContext(netOrderSource, context);
    return { cars, order: Array.from(vm.runInContext("netOrder(cars.slice())", context), (c) => c.driverId) };
  };
  for (const verdict of [
    [{ d: "a", t: 111 }, { d: "a", t: 222 }, { d: "b", t: 333 }],
    [{ d: "a", t: 111 }, { d: "b", t: 222 }, { d: "unknown", t: 333 }],
    [{ d: "a", t: 111 }, { d: "b", t: 222 }, { d: "c", t: "bad" }],
  ]) {
    const { cars, order } = classify(verdict);
    assert.deepEqual(order, ["a", "b", "c"]);
    assert.deepEqual(cars.map((c) => c.finishT), [10, 20, 30]);
  }
  const accepted = classify([{ d: "c", t: 31 }, { d: "a", t: 11 }, { d: "b", t: 21 }]);
  assert.deepEqual(accepted.order, ["c", "a", "b"]);
  assert.deepEqual(accepted.cars.map((c) => c.finishT), [11, 21, 31]);
});

test("host RESULT preserves authoritative laps and NC status, with optional fields for older payloads", () => {
  const netOrderSource = fnSource(src("js/game.js"), "function netOrder(order)");
  const cars = [{ driverId: "winner", lap: 11, classified: true }, { driverId: "guest", lap: 10, classified: true }];
  let verdict;
  const netPlay = { active: () => true, ownsClassification: () => true, reportResult: (rows) => { verdict = rows; } };
  const ctx = vm.createContext({ cars, netPlay });
  vm.runInContext(netOrderSource, ctx);
  cars[1].lap = 8; cars[1].classified = false;
  vm.runInContext("netOrder(cars)", ctx);
  assert.equal(verdict[1].classified, false); assert.equal(verdict[1].lap, 8);
  // The guest's delayed pose had crossed another line and locally qualified.
  cars[1].lap = 10; cars[1].classified = true;
  netPlay.ownsClassification = () => false; netPlay.peerResult = () => verdict;
  vm.runInContext("netOrder(cars)", ctx);
  assert.equal(cars[1].lap, 8); assert.equal(cars[1].classified, false);
  verdict = [{ d: "winner" }, { d: "guest" }];
  vm.runInContext("netOrder(cars)", ctx);
  assert.equal(cars[1].lap, 8); assert.equal(cars[1].classified, false, "absent fields preserve the existing verdict");
  for (const field of [{ classified: "false" }, { lap: -1 }, { lap: 2.5 }, { lap: 256 }]) {
    verdict = [{ d: "winner", lap: 1, classified: false }, { d: "guest", ...field }];
    vm.runInContext("netOrder(cars)", ctx);
    assert.equal(cars[0].lap, 11); assert.equal(cars[0].classified, true, "the entire verdict validates before any mutation");
  }
});

/** A session NetPlay can bind to, with a hand-fed inbound event channel. */
function fakeSession() {
  const handlers = new Map();
  const closeHandlers = [];
  const sent = [];
  return {
    sent, closed: 0,
    clearHandlers() { handlers.clear(); closeHandlers.length = 0; return this; },
    onState() { return this; },
    onClose(fn) { closeHandlers.push(fn); return this; },
    onEvent(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
      return this;
    },
    sendEvent(t, d) { sent.push({ t, d }); return true; },
    sendState() { return true; },
    pump() { return true; },
    alive: () => true,
    lagMs: () => 0,
    rtt: () => 0,
    synced: () => true,
    peerToLocal: (t) => t,
    localToPeer: (t) => t,
    stats: () => ({}),
    // Mirror real NetSession.close(): flip alive, then fire onClose("local")
    // synchronously. A stub that only cleared handlers hid stop()→close()→
    // onClose("local") re-entering stop while inactive (BYE / local quit).
    close() {
      this.closed++;
      const fns = closeHandlers.slice();
      handlers.clear();
      closeHandlers.length = 0;
      for (const fn of fns) fn("local");
      return true;
    },
    disconnect(why = "transport") {
      for (const fn of [...closeHandlers]) fn(why);
    },
    handlerCount() {
      let n = closeHandlers.length;
      for (const list of handlers.values()) n += list.length;
      return n;
    },
    /** Deliver an inbound event AS IF the peer on this connection had sent it. */
    deliver(type, data) { for (const fn of handlers.get(type) || []) fn(data); },
  };
}

test("no_slot rolls back the car role and disposes the unadopted session", () => {
  const G = stubG(2);
  // No local car means start must fail, but slot selection will temporarily
  // claim one of these cars before it discovers that the local side is absent.
  for (const car of G.cars) { car.local = false; car.human = false; car.isPlayer = false; }
  G.player = null;
  const net = NetPlay.create(G);
  const s = fakeSession();

  const out = net.start({ role: "guest", session: s });

  assert.deepEqual(out, {
    ok: false,
    error: "no_slot",
    message: "Could not find a grid slot for both drivers.",
  });
  assert.equal(net.active(), false);
  assert.equal(s.closed, 1, "a rejected session must not keep its transport alive");
  assert.equal(s.handlerCount(), 0, "a rejected session must not retain NetPlay handlers");
  assert.equal(G.cars.some((car) => car.human || car.local), false,
    "a partially claimed grid car must return to AI ownership");
});

/** A G façade with just enough of a grid for start() to seat `n - 1` rivals. */
function stubG(n) {
  const car = (i, local) => ({
    idx: i, local: !!local, human: !!local, isPlayer: !!local,
    s: i * 10, x: 0, px: 0, pz: 0, speed: 0, head: 0, lap: 0, mods: null,
    name: "D" + i, code: "D" + i, driverId: "drv" + i,
  });
  const cars = [];
  for (let i = 0; i < (n || 2); i++) cars.push(car(i, i === 0));
  const G = {
    cars,
    player: cars[0],
    track: { total: 5000, n: 500 },
    netStart: null,
    netNow: null,
    caughtCautions: [],
    caughtQuali: [],
    caughtQLive: [],
    announcements: [],
    wireId: (c) => c.idx,
    setCarRole: (c, human, local) => { c.human = human; c.local = local; },
    announce: (message) => { G.announcements.push(message); },
    applyCaution: (d) => { G.caughtCautions.push(d); },
    onPeerQuali: (d) => { G.caughtQuali.push(d); },
    onPeerQualiLive: (d) => { G.caughtQLive.push(d); },
    COUNTDOWN_S: 3,
  };
  return G;
}

/** A started NetPlay in `role`, plus the session its peer speaks over. */
function started(role) {
  const G = stubG();
  const net = NetPlay.create(G);
  const s = fakeSession();
  const r = net.start({ role, session: s });
  assert.equal(r.ok, true, `start() must succeed for a ${role}: ${r.error || ""}`);
  return { G, net, s };
}

test("the harness itself works — a GUEST obeys the host's START", () => {
  // ANTI-VACUITY, and the reason it is first: every test below asserts that
  // something does NOT happen, and all of them would pass just as well against
  // a harness whose events never arrive at all. This one pins that the exact
  // same delivery DOES take effect on the side that is supposed to obey it.
  const { G, s } = started("guest");
  s.deliver("start", { at: 12345, hold: 1.0 });
  assert.ok(G.netStart, "a guest must obey a START from the host");
  assert.equal(G.netStart.at, 12345);
  assert.equal(G.netStart.hold, 1.0);
});

test("a guest keeps racing after the host leaves and is told that rivals are now AI", () => {
  const { G, net, s } = started("guest");
  const rival = G.cars[1];
  assert.equal(rival.human, true, "the connected host owns the rival before disconnect");

  s.disconnect("transport");

  assert.equal(net.active(), false, "the network session ends");
  assert.equal(rival.human, false, "the host's car returns to local AI");
  assert.ok(G.announcements.some((m) => /HOST LEFT — RIVALS NOW AI/.test(m)),
    `the continuing race needs an honest visible announcement: ${G.announcements.join(" | ")}`);
});

test("a HOST ignores a START arriving from a guest", () => {
  // The host names lights-out itself, in nameTheMoment(). A START on the wire
  // can only have come from a guest, and a guest does not get to start the
  // host's race — nor to re-start it mid-race at an instant of its choosing.
  const { G, s } = started("host");
  s.deliver("start", { at: 999, hold: 5 });
  assert.equal(G.netStart, null, "a guest must not be able to set the host's netStart");
});

test("a HOST ignores a CAUTION arriving from a guest", () => {
  // reportCaution() already refuses to SEND unless host; the caution machine is
  // the host's (docs/MULTIPLAYER.md: "the HOST owns it in multiplayer"). A
  // guest that could apply one could neutralise a race it was losing.
  const { G, s } = started("host");
  s.deliver("caution", { kind: "sc", lap: 3 });
  assert.deepEqual(G.caughtCautions, [], "a guest must not apply a caution on the host");
});

test("a GUEST obeys a CAUTION from the host", () => {
  const { G, s } = started("guest");
  s.deliver("caution", { kind: "sc", lap: 3 });
  assert.deepEqual(G.caughtCautions, [{ kind: "sc", lap: 3 }], "the host's caution is authoritative");
});

test("a HOST ignores a RESULT arriving from a guest", () => {
  // peerResult is declared "the host's classification, if sent" and is consumed
  // only on the guest path — so a host that accepted one was storing a value
  // its own name says cannot exist, and publishing it through peerResult().
  const { net, s } = started("host");
  s.deliver("result", { rows: [{ pos: 1, name: "not yours" }] });
  assert.equal(net.peerResult(), null, "the host owns classification; a guest's RESULT is not it");
});

test("a GUEST obeys a RESULT from the host", () => {
  const { net, s } = started("guest");
  const rows = [{ d: "drv1", t: 10, p: 0 }, { d: "drv0", t: 11, p: 0 }];
  s.deliver("result", rows);
  assert.deepEqual(net.peerResult(), rows);
});

test("a malformed host RESULT does not end the guest's classification wait", () => {
  const { net, s } = started("guest");
  for (const rows of [[{ d: "drv0" }, { d: "drv0" }],
    [{ d: "drv0", classified: "false" }, { d: "drv1" }],
    [{ d: "drv0" }, { d: "drv1", lap: -1 }]]) {
    s.deliver("result", rows); assert.equal(net.peerResult(), null);
  }
  assert.equal(net.awaitingResult(1000), true);
});

test("the per-peer events a host DOES own are still accepted from a guest", () => {
  // The gate must be narrow. LAP and QUALI are a peer speaking about ITSELF,
  // which is precisely what it has authority over — a fix that swallowed those
  // would silently stop a host scoring its guests, and would look exactly like
  // this one from the outside.
  const { net, s } = started("host");
  // Product LAP is {lap, time, best, code} (js/game.js reportLap) — not a
  // wireId. sendersOwnDriver matches code OR driverId so a guest still scores.
  s.deliver("lap", { lap: 2, time: 91.2, code: "D1" });
  assert.equal(net.peerLaps().length, 1, "a guest still reports its own laps to the host");
});

// ---- QUALI / QLIVE: the driverId is bound to the sender ---------------------
// A qualifying time is an input to the GRID, and the payload names its driver —
// so on the host the payload's word is checked against the car filed for the
// connection the event arrived on (the event-channel twin of onState's
// per-connection narrowing). The started() harness seats the peer in cars[1],
// whose driverId is "drv1".

test("a HOST accepts a QUALI naming the sender's own driver", () => {
  // Anti-vacuity for the three drop-tests below: same delivery, same host,
  // only the driverId differs.
  const { G, s } = started("host");
  s.deliver("quali", { driverId: "drv1", t: 61.25 });
  assert.deepEqual(G.caughtQuali, [{ driverId: "drv1", t: 61.25 }]);
});

test("a HOST drops a QUALI naming another driver", () => {
  const { G, s } = started("host");
  // The host's own player, and a bystander the sender does not own: a guest
  // that could post either would be assembling somebody else's grid slot.
  s.deliver("quali", { driverId: "drv0", t: 1.0 });
  s.deliver("quali", { driverId: "somebody-else", t: 59.0 });
  assert.deepEqual(G.caughtQuali, [], "a guest may post a qualifying time for ITS OWN driver only");
});

test("a HOST drops a QUALI naming no driver at all", () => {
  // driverId is the whole claim; absent, there is nothing to bind to the
  // sender and nothing downstream could file the time against.
  const { G, s } = started("host");
  s.deliver("quali", { t: 59.0 });
  assert.deepEqual(G.caughtQuali, []);
});

test("a GUEST accepts the host's QUALI for any driver", () => {
  // Guest side there is nothing to narrow to: the only connection is the
  // host's, and the host legitimately speaks for the whole field — in a room
  // of three or more, another guest's time can only arrive via the host.
  const { G, s } = started("guest");
  s.deliver("quali", { driverId: "anyone-at-all", t: 60.5 });
  assert.deepEqual(G.caughtQuali, [{ driverId: "anyone-at-all", t: 60.5 }]);
});

test("lobby relay hook sees only sender-bound, normalized qualifying events", () => {
  const s = fakeSession();
  const accepted = [];
  const G = { onPeerQuali() {}, onPeerQualiLive() {} };
  NetPlay.bindQuali(s, (d) => d.driverId === "bravo:1", G,
    (type, d) => accepted.push({ type, driverId: d.driverId, t: d.t }));
  s.deliver("quali", { driverId: "alpha:0", t: 71 });
  s.deliver("quali", { driverId: "bravo:1", t: "71" });
  s.deliver("quali", { driverId: "bravo:1", t: 9000 });
  s.deliver("qlive", { driverId: "bravo:1", t: 10.5, frac: 0.3 });
  assert.deepEqual(accepted, [
    { type: "quali", driverId: "bravo:1", t: 71 },
    { type: "qlive", driverId: "bravo:1", t: 10.5 },
  ]);
});

// ---- QUALI t is COERCED and BOUNDED at one site (NetPlay.validQuali) -------
// Both receivers used to gate on a bare `d.t > 0`, which "70" and `true` pass;
// the value was stored as sent and quali-model.js threw on `.toFixed`. The
// wire value is now Number()'d, bounded to a lap a human can drive, and handed
// on as a number — by NetPlay.bindQuali, which BOTH phases register.
test("a QUALI whose t is a numeric string arrives as a NUMBER; junk and implausible laps never arrive", () => {
  const { G, s } = started("guest");                 // guest: no sender binding to get in the way
  s.deliver("quali", { driverId: "x", t: "70.125" });
  assert.deepEqual(G.caughtQuali, [{ driverId: "x", t: 70.125 }]);
  assert.equal(typeof G.caughtQuali[0].t, "number");
  for (const t of [true, "abc", NaN, Infinity, -5, 0, 5, 20, 3600, 1e9, null, undefined, {}, []]) {
    s.deliver("quali", { driverId: "x", t });
  }
  assert.equal(G.caughtQuali.length, 1, "nothing outside (20 s, 1 h) or non-numeric reaches the game");
  assert.deepEqual(NetPlay.validQuali({ driverId: "d", t: "61" }), { driverId: "d", t: 61 });
  assert.equal(NetPlay.validQuali({ t: 61 }), null, "no driverId, no claim");
  assert.equal(NetPlay.validQuali("61"), null);
  // QLIVE is bounded rather than refused — it is a clock, not a grid input.
  s.deliver("qlive", { driverId: "x", t: "12.5", frac: "2" });
  assert.deepEqual(G.caughtQLive.at(-1), { driverId: "x", t: 12.5, frac: 1 });
  s.deliver("qlive", { driverId: "x", t: NaN, frac: -1 });
  assert.deepEqual(G.caughtQLive.at(-1), { driverId: "x", t: 0, frac: 0 });
});

test("QLIVE is bound to the sender on the host the same way", () => {
  // Display-only, but keyed by the same driverId — unbound, the same spoof
  // paints a lap-in-progress over another driver's name.
  const { G, s } = started("host");
  s.deliver("qlive", { driverId: "drv1", t: 12.4, frac: 0.2 });
  s.deliver("qlive", { driverId: "drv0", t: 1.0, frac: 0.9 });
  assert.deepEqual(G.caughtQLive, [{ driverId: "drv1", t: 12.4, frac: 0.2 }]);
});

test("IN-RACE phase: the host caps one connection's QUALI+QLIVE at the lobby's shared rate (bug-hunt 2)", () => {
  const { G, s } = started("host");
  assert.equal(typeof NetPlay.QUALI_RATE, "number", "one shared constant with the lobby");
  for (let i = 0; i < 3; i++) s.deliver("qlive", { driverId: "drv1", t: 5 + i, frac: 0.1 });
  assert.equal(G.caughtQLive.length, 3, "a real client's rate passes untouched");
  for (let i = 0; i < 200; i++) s.deliver("qlive", { driverId: "drv1", t: 9, frac: 0.2 });
  assert.equal(G.caughtQLive.length, NetPlay.QUALI_RATE, "a flood stops at the cap (got " + G.caughtQLive.length + ")");
  for (let i = 0; i < 50; i++) s.deliver("quali", { driverId: "drv1", t: 80 });
  assert.equal((G.caughtQuali || []).length, 0, "QUALI shares the window with QLIVE");
});

// ---- the star does not launder a guest's declaration ------------------------

test("a guest's CAUTION neither applies on a two-guest host nor reaches the other guest", () => {
  // "Dropped by another guest" in the only form the star topology can express:
  // a guest has one connection, to the host, so the only way guest A's caution
  // could reach guest B is the host applying or relaying it. Pin both offices
  // shut on a host actually holding two guests.
  const G = stubG(3);
  const net = NetPlay.create(G);
  const sa = fakeSession();
  const sb = fakeSession();
  const r = net.start({
    role: "host",
    session: sa,  // the lobby hands over both forms — sessions is the map, session the first entry
    sessions: [{ id: "a", session: sa }, { id: "b", session: sb }],
    peers: [{ id: "a" }, { id: "b" }],
  });
  assert.equal(r.ok, true, `start() must seat two guests: ${r.error || ""}`);
  const sentBefore = sb.sent.length;
  sa.deliver("caution", { kind: "sc", lap: 2 });
  assert.deepEqual(G.caughtCautions, [], "guest A's caution must not apply on the host");
  const relayed = sb.sent.slice(sentBefore).filter((m) => m.t === "caution");
  assert.deepEqual(relayed, [], "guest A's caution must not be relayed to guest B");
});

test("on a two-guest host, each guest's QUALI is accepted for its own seat only", () => {
  // The binding is PER CONNECTION, not "any driver some guest owns": guest B
  // must not be able to post guest A's time either.
  const G = stubG(3);
  const net = NetPlay.create(G);
  const sa = fakeSession();
  const sb = fakeSession();
  const r = net.start({
    role: "host",
    session: sa,  // the lobby hands over both forms — sessions is the map, session the first entry
    sessions: [{ id: "a", session: sa }, { id: "b", session: sb }],
    peers: [{ id: "a" }, { id: "b" }],
  });
  assert.equal(r.ok, true, `start() must seat two guests: ${r.error || ""}`);
  // pickRemoteSlot walks the grid in order, so peer "a" is seated in cars[1]
  // ("drv1") and peer "b" in cars[2] ("drv2") — verified by the accepted
  // deliveries below rather than assumed: each seat's own time landing is what
  // proves the mapping this test's drop-assertion depends on.
  sa.deliver("quali", { driverId: "drv2", t: 58.0 });  // A speaking for B: dropped
  sa.deliver("quali", { driverId: "drv1", t: 61.0 });  // A speaking for itself: accepted
  sb.deliver("quali", { driverId: "drv2", t: 60.75 }); // B speaking for itself: accepted
  assert.deepEqual(G.caughtQuali, [
    { driverId: "drv1", t: 61.0 },
    { driverId: "drv2", t: 60.75 },
  ]);
});

// ---------------------------------------------------------------------------
// THE LOBBY PHASE — where qualifying actually runs.
//
// The NetPlay gate above covers the window after the hand-off, but qualifying
// happens BEFORE it: the lobby keeps the connection through the whole session
// (its reportQuali header says so) and registers its own QUALI/QLIVE handlers
// in onConnected(). Those must apply the same sender binding, or the gate
// guards an empty room — during every qualifying session a guest could still
// post {driverId: the host's, t: 0.001} and qualiDriven() (js/game.js) would
// overwrite the host's own driven lap with it.
//
// These tests drive the REAL js/net/lobby.js over a loopback transport, the
// exact route the browser room specs take (__apex.lobbyFake + lobbyWatch):
// host()/join() build the transport from an injected factory, watchForOpen()
// reaches onConnected(), and the far endpoint plays the other person. The DOM
// is a stub that answers null — every lobby render path already tolerates a
// missing element, because the room can be replaced by the garage at any time.
// ---------------------------------------------------------------------------

globalThis.NetPlay = NetPlay;
globalThis.NetBytes = eval(src("js/net/bytes.js") + ";NetBytes");   // transport/handshake bind it at call time
const NetTransport = eval(src("js/net/transport.js") + ";NetTransport");
globalThis.NetTransport = NetTransport;
const NetHandshake = eval(src("js/net/handshake.js") + ";NetHandshake");
globalThis.NetHandshake = NetHandshake;
globalThis.document = { getElementById: () => null, addEventListener: () => {} };
// Three teams so the guest's seat, the host's seat and a bystander's are all
// distinct. driverId is seasonDriverId's format (js/core/store.js): "team:seat".
globalThis.Teams = {
  LIST: [
    { id: "alpha", name: "Alpha", drivers: [{ code: "AL1", name: "A One", num: 1 }, { code: "AL2", name: "A Two", num: 2 }] },
    { id: "bravo", name: "Bravo", drivers: [{ code: "BR1", name: "B One", num: 3 }, { code: "BR2", name: "B Two", num: 4 }] },
    { id: "chase", name: "Chase", drivers: [{ code: "CH1", name: "C One", num: 5 }, { code: "CH2", name: "C Two", num: 6 }] },
  ],
};
globalThis.Tracks = { LIST: Array.from({ length: 6 }, (_, i) => ({ id: "track-" + i })) };
// LobbyCodes peels paste/share/scan/QR from lobby; ApexClipboard is its write/read
// home. Both must be eval'd before lobby.js — LOBBY-phase create() calls
// LobbyCodes.create immediately (CI Pure-node fast went red without them).
globalThis.ApexClipboard = eval(src("js/core/clipboard.js") + ";ApexClipboard");
globalThis.NetQr = globalThis.NetQr || { draw: () => false };
globalThis.NetScan = globalThis.NetScan || { supported: () => false, create: () => ({ start: async () => ({ ok: false }), stop() {} }) };
globalThis.LobbyCodes = eval(src("js/net/lobby-codes.js") + ";LobbyCodes");
const NetLobby = eval(src("js/net/lobby.js") + ";NetLobby");

function lobbyG() {
  const G = {
    teamIdx: 0, driverIdx: 0,             // the local player holds alpha:0
    trackIdx: 0, raceLaps: 3, raceWeather: "dry", raceTimeOfDay: "day",
    raceQuali: true, raceGrid: "quali", difficulty: 1, raceChangeable: false, wxArcPlan: null,
    caughtQuali: [], caughtQLive: [],
    onPeerQuali: (d) => { G.caughtQuali.push(d); },
    onPeerQualiLive: (d) => { G.caughtQLive.push(d); },
    setNetRoom: () => {},
    store: { get: (k, dflt) => dflt, set: () => {} },
  };
  return G;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A REAL lobby in `role`, connected over loopback; `peerSays` is the far end. */
async function lobbyUp(role) {
  const G = lobbyG();
  const lobby = NetLobby.create(G);
  let far = null;
  lobby.setTransportFactory(() => {
    const pair = NetTransport.loopback({ latencyMs: 0 });
    far = pair[1];
    return pair[0];
  });
  // readyIce() would otherwise race a real credentials fetch for 2.5 s.
  const oldPrefetch = NetTransport.prefetchIce;
  NetTransport.prefetchIce = () => null;
  try {
    if (role === "host") await lobby.host(); else await lobby.join();
  } finally {
    NetTransport.prefetchIce = oldPrefetch;
  }
  // The connect-watcher's first poll is 250 ms out; a loopback is open the
  // moment it exists, so one poll is all it takes to reach onConnected().
  lobby.watchForOpen();
  await sleep(400);
  assert.ok(far, "the transport factory must have been asked for a connection");
  assert.equal(lobby.status().guests > 0 || role === "guest", true, "the lobby must have connected");
  // Send as the other person, exactly like __apex.lobbyPeerEvent: the far
  // endpoint's pump flushes the send, and the lobby's own 25 ms pump timer
  // delivers it — so every send is followed by a settle().
  const peerSays = (t, d) => { far.send("event", JSON.stringify({ t, d })); far.pump(performance.now()); };
  const settle = () => sleep(80);
  return { G, lobby, peerSays, settle };
}

test("LOBBY phase: the host accepts a guest's own-seat QUALI", async () => {
  // Anti-vacuity for the drop-tests below — same wire, same host, only the
  // driverId differs. The guest's HELLO filed it in bravo seat 1, so its own
  // driverId is "bravo:1".
  const { G, lobby, peerSays, settle } = await lobbyUp("host");
  try {
    peerSays("hello", { team: "bravo", driver: 1 });
    await settle();
    peerSays("quali", { driverId: "bravo:1", t: 61.25 });
    await settle();
    assert.deepEqual(G.caughtQuali, [{ driverId: "bravo:1", t: 61.25 }]);
  } finally { lobby.cancel(); }
});

test("LOBBY phase: the host drops a QUALI naming another driver", async () => {
  const { G, lobby, peerSays, settle } = await lobbyUp("host");
  try {
    peerSays("hello", { team: "bravo", driver: 1 });
    await settle();
    // The host's own seat (alpha:0) — the exact spoof that would overwrite
    // the host's driven lap through qualiDriven() — and a bystander's.
    peerSays("quali", { driverId: "alpha:0", t: 0.001 });
    peerSays("quali", { driverId: "chase:0", t: 59.0 });
    await settle();
    assert.deepEqual(G.caughtQuali, [], "a guest may post a qualifying time for ITS OWN seat only");
  } finally { lobby.cancel(); }
});

test("LOBBY phase: no HELLO filed means no claim at all", async () => {
  // HELLO always precedes a driven lap in the real flow (it is sent at
  // connect); a connection that never introduced itself speaks for nobody.
  const { G, lobby, peerSays, settle } = await lobbyUp("host");
  try {
    peerSays("quali", { driverId: "bravo:1", t: 59.0 });
    await settle();
    assert.deepEqual(G.caughtQuali, []);
  } finally { lobby.cancel(); }
});

test("LOBBY phase: the same coercion applies before the hand-off", async () => {
  const { G, lobby, peerSays, settle } = await lobbyUp("guest");
  try {
    peerSays("quali", { driverId: "anyone", t: "70" });
    peerSays("quali", { driverId: "anyone", t: true });
    peerSays("quali", { driverId: "anyone", t: 4000 });
    await settle();
    assert.deepEqual(G.caughtQuali, [{ driverId: "anyone", t: 70 }], "one validation site for both phases");
  } finally { lobby.cancel(); }
});

test("LOBBY phase: more than five HELLOs (or READYs) in a second are dropped, per connection", async () => {
  // Every HELLO re-renders, re-resolves seat clashes and is relayed by the
  // host; every READY re-renders. Nothing legitimate needs more than a
  // handful a second, so past the fifth in a rolling second the rest are
  // ignored — and a second later the window is open again.
  const { lobby, peerSays, settle } = await lobbyUp("guest");
  try {
    for (let i = 0; i < 9; i++) peerSays("hello", { team: "bravo", driver: i % 2, tag: i });
    await settle();
    assert.equal(lobby.roomState().peer.tag, 4, "the fifth HELLO is the last one accepted");
    for (let i = 0; i < 9; i++) peerSays("ready", { ready: i % 2 === 0 });
    await settle();
    assert.equal(lobby.roomState().peerReady, true, "READY #5 (index 4, true) stands; #6..9 are dropped");
    await sleep(1100);
    peerSays("hello", { team: "bravo", driver: 1, tag: 99 });
    await settle();
    assert.equal(lobby.roomState().peer.tag, 99, "the window rolls: a later HELLO is accepted again");
  } finally { lobby.cancel(); }
});

test("LOBBY phase: QLIVE is bound to the sender the same way", async () => {
  const { G, lobby, peerSays, settle } = await lobbyUp("host");
  try {
    peerSays("hello", { team: "bravo", driver: 1 });
    await settle();
    peerSays("qlive", { driverId: "bravo:1", t: 12.4, frac: 0.2 });
    peerSays("qlive", { driverId: "alpha:0", t: 1.0, frac: 0.9 });
    await settle();
    assert.deepEqual(G.caughtQLive, [{ driverId: "bravo:1", t: 12.4, frac: 0.2 }]);
  } finally { lobby.cancel(); }
});

test("LOBBY phase: a guest accepts the host's QUALI for any driver", async () => {
  // Guest side there is nothing to narrow to: its one connection is the
  // host's, which legitimately speaks for the whole field — another guest's
  // time can only ever arrive through it.
  const { G, lobby, peerSays, settle } = await lobbyUp("guest");
  try {
    peerSays("quali", { driverId: "anyone-at-all", t: 60.5 });
    await settle();
    assert.deepEqual(G.caughtQuali, [{ driverId: "anyone-at-all", t: 60.5 }]);
  } finally { lobby.cancel(); }
});

test("LOBBY phase: SETTINGS is validated atomically before guest state changes", async () => {
  const { G, lobby, peerSays, settle } = await lobbyUp("guest");
  const snapshot = () => ({
    track: G.trackIdx, laps: G.raceLaps, weather: G.raceWeather,
    tod: G.raceTimeOfDay, quali: G.raceQuali, difficulty: G.difficulty, grid: G.raceGrid,
    changeable: G.raceChangeable, wxArc: G.wxArcPlan,
  });
  try {
    const before = snapshot();
    const invalid = [
      { track: 999 },
      { laps: '<img src=x onerror="globalThis.pwned=1">' },
      { weather: "hurricane" },
      { tod: { toString: "night" } },
      { difficulty: "impossible" },
      { quali: 1 },
      { grid: "chaos" },
      { grid: 7 },
      { changeable: "yes" },
      { wxArc: { to: "hurricane", dur: 60 } },
      { wxArc: { to: "wet", dur: 5 } },
      { wxArc: { to: "wet", dur: 60.5 } },
      { wxArc: ["wet", 60] },
      // Atomicity: valid fields alongside one invalid field change nothing.
      { track: 4, laps: 7, weather: "wet", tod: "night", difficulty: "hard", quali: "yes" },
    ];
    for (const payload of invalid) {
      peerSays("settings", payload);
      await settle();
      assert.deepEqual(snapshot(), before, JSON.stringify(payload));
    }

    peerSays("settings", {
      track: 4, laps: 7, weather: "wet", tod: "night", difficulty: "hard", quali: false, grid: "random",
      changeable: true, wxArc: { to: "rain", dur: 240 },
    });
    await settle();
    assert.deepEqual(snapshot(), {
      track: 4, laps: 7, weather: "wet", tod: "night", difficulty: "hard", quali: false, grid: "random",
      changeable: true, wxArc: { to: "rain", dur: 240 },
    });
    peerSays("settings", { wxArc: null });
    await settle();
    assert.equal(snapshot().wxArc, null, "the host can withdraw the plan");
  } finally { lobby.cancel(); }
});

// ── netplay hardening: the local seat, room rules, NO TIME ──────────────────

test("LOBBY phase: a guest whose HELLO claims the HOST's seat cannot post the host's time", async () => {
  // The sender binding keys on the HELLO profile, and a HELLO can name any
  // seat — so a guest claiming alpha:0 (the host's) passed it and overwrote
  // the host's own driven lap. The local seat is never a peer's to post.
  const { G, lobby, peerSays, settle } = await lobbyUp("host");
  try {
    peerSays("hello", { team: "alpha", driver: 0 });
    await settle();
    peerSays("quali", { driverId: "alpha:0", t: 21.5 });
    await settle();
    assert.deepEqual(G.caughtQuali, [], "the host's own seat is only ever the host's lap");
  } finally { lobby.cancel(); }
});

test("LOBBY phase: a guest drops a relayed QUALI naming its OWN seat", async () => {
  const { G, lobby, peerSays, settle } = await lobbyUp("guest");   // local seat alpha:0
  try {
    peerSays("quali", { driverId: "alpha:0", t: 61.0 });
    peerSays("quali", { driverId: "bravo:1", t: 62.0 });
    await settle();
    assert.deepEqual(G.caughtQuali, [{ driverId: "bravo:1", t: 62.0 }]);
  } finally { lobby.cancel(); }
});

test("LOBBY phase: room tyre-wear / reliability rules never overwrite the guest's SAVED choice", async () => {
  const { G, lobby, peerSays, settle } = await lobbyUp("guest");
  // game.js's setters persist (store "tyreWear" / "reliability"); mirror that.
  const saved = new Map([["tyreWear", "off"]]);   // "reliability" never saved
  G.store = {
    get: (k, d) => (saved.has(k) ? saved.get(k) : d),
    set: (k, v) => { saved.set(k, v); return true; },
    rawDel: (k) => { saved.delete(k); return true; },
  };
  let tyres = "off", reliab = "off";
  Object.defineProperty(G, "raceTyreWear", { get: () => tyres, set: (v) => { tyres = v; saved.set("tyreWear", v); } });
  Object.defineProperty(G, "raceReliability", { get: () => reliab, set: (v) => { reliab = v; saved.set("reliability", v); } });
  try {
    peerSays("settings", { tyres: "real", reliab: "real" });
    await settle();
    assert.equal(G.raceTyreWear, "real", "the room's rule applies to this race");
    assert.equal(G.raceReliability, "real");
    assert.equal(saved.get("tyreWear"), "off", "the guest's saved tyre wear is untouched");
    assert.equal(saved.has("reliability"), false, "an unset save stays unset");
  } finally { lobby.cancel(); }
});

test("NO TIME crosses as a marker, never as the synthetic back-of-grid time", () => {
  // A lap deleted for track limits is Infinity locally (quali-model's NO
  // TIME); the old sender posted the sheet's slow+1 filler as a real time.
  const sent = [];
  const rep = NetPlay.qualiReporters((type, d) => { sent.push(JSON.parse(JSON.stringify({ type, d }))); return true; }, () => true);
  assert.equal(rep.reportQuali("bravo:1", Infinity), true);
  assert.deepEqual(sent[0], { type: NetPlay.EV.QUALI, d: { driverId: "bravo:1", t: null, noTime: true } });
  const q = NetPlay.validQuali(sent[0].d);
  assert.equal(q.t, Infinity, "received as quali-model's own NO TIME value");
  assert.equal(q.noTime, true);
  // Without the marker an Infinity/null t is still junk.
  assert.equal(NetPlay.validQuali({ driverId: "x", t: null }), null);
  // End to end on a host: the guest's NO TIME lands as Infinity for its seat.
  const { G, s } = started("host");
  s.deliver("quali", { driverId: "drv1", t: null, noTime: true });
  assert.deepEqual(G.caughtQuali, [{ driverId: "drv1", t: Infinity, noTime: true }]);
});

test("QualiNet: a peer entry never replaces the local player's time; NO TIME is kept", () => {
  const QualiNet = eval(src("js/race/quali-net.js") + ";QualiNet");
  const player = { driverId: "alpha:0", lastLap: 0, best: Infinity };
  const q = QualiNet.create({
    $: () => null, fmtTime: String, isQuali: () => false, getPlayer: () => player, getCars: () => [],
    openQuali: () => {}, applyPeerQuali: () => {}, getNetPlay: () => ({ rivalDriverIds: () => [] }), getNetLobby: () => null,
  });
  q.onPeerQuali({ driverId: "alpha:0", t: 30 });          // a spoof of OUR seat
  q.onPeerQuali({ driverId: "bravo:1", t: Infinity });    // a rival's NO TIME
  q.onPeerQuali({ driverId: "chase:0", t: 70 });
  const m = q.driven(80);
  assert.equal(m.get("alpha:0"), 80, "our own lap, never the peer's");
  assert.equal(m.get("bravo:1"), Infinity, "NO TIME reaches quali-model as Infinity");
  assert.equal(m.get("chase:0"), 70);
});

// ── round 8: session-scoped state and the arming population ─────────────────

test("stop() clears the armed start — a quit mid-countdown must not leak into the next race", () => {
  // game.js clears netStart only when a countdown runs to COMPLETION, so a
  // friend race quit during the lights left a past-dated netStart behind and
  // the NEXT solo race lit all five lamps in one frame and skipped its
  // countdown. stop() owns the session's clock (it already nulls G.netNow);
  // the armed start is the same clock's state.
  const { G, net, s } = started("guest");
  s.deliver("start", { at: 12345, hold: 1.0 });
  assert.ok(G.netStart, "precondition: the guest armed the start");
  net.stop("local");
  assert.equal(G.netStart, null, "stop() must clear the armed start with the session");
});

test("a peer WITHOUT a grid slot cannot arm the start", () => {
  // armedPeers counts session ids while allArmed() compares against remotes
  // (wireId-keyed). A joiner that got no car (start()'s `if (!car) continue`)
  // still has a bound session — its ARMED alone used to satisfy allArmed()
  // and the host named lights-out while the SEATED peer was still building
  // its circuit: the skipped-countdown bug, reintroduced through the side
  // door. stubG(2) has exactly one free car, so peer 2 goes slotless.
  const G = stubG(2);
  const net = NetPlay.create(G);
  const seated = fakeSession(), slotless = fakeSession();
  const r = net.start({
    role: "host",
    session: seated,   // satisfies the no_transport gate; `sessions` wins below
    sessions: [{ id: 1, session: seated }, { id: 2, session: slotless }],
    peers: [{ id: 1, profile: null }, { id: 2, profile: null }],
  });
  assert.equal(r.ok, true, `host start must succeed: ${r.error || ""}`);
  assert.equal(net.hostStart(), true, "no one armed yet — the host waits");
  assert.equal(G.netStart, null, "precondition: the moment is not yet named");

  slotless.deliver("armed", {});
  assert.equal(G.netStart, null,
    "a slotless peer's ARMED must not name the moment while the seated peer builds");
  assert.deepEqual(seated.sent.filter((m) => m.t === "start"), [],
    "no START goes out on the slotless peer's word");

  seated.deliver("armed", {});
  assert.ok(G.netStart, "the SEATED peer's ARMED names the moment");
  assert.equal(seated.sent.filter((m) => m.t === "start").length, 1);
});

test("pickRemoteSlot keeps any-fallback only when profile is null", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/net/netplay.js"), "utf8");
  assert.match(src, /lastSlotFallback = "profile-miss"/);
  assert.match(src, /pickRemoteSlot\(null\) has always had the any-free-car/);

  const tagged = (n) => {
    const G = stubG(n);
    const ids = ["mclaren", "ferrari", "redbull"];
    for (let i = 1; i < G.cars.length; i++) {
      G.cars[i].team = { id: ids[(i - 1) % ids.length] };
      G.cars[i].seat = 0;
    }
    return G;
  };

  const Gany = tagged(4);
  const netAny = NetPlay.create(Gany);
  const ok = netAny.start({ role: "host", session: fakeSession() });
  assert.equal(ok.ok, true, `null profile must still seat any free car: ${ok.error || ""}`);
  assert.equal(netAny.status().slotFallback, "any");

  const Gmiss = tagged(4);
  const netMiss = NetPlay.create(Gmiss);
  const miss = netMiss.start({
    role: "host",
    session: fakeSession(),
    peerProfile: { team: "haas", driver: 0 },
  });
  assert.equal(miss.ok, false);
  assert.equal(miss.error, "no_slot");
  assert.equal(netMiss.status().slotFallback, "profile-miss");
});


test("strategy events require this race epoch and the sender's own car", () => {
  const G = stubG(3); G.track.def = { id: "monza" };
  const net = NetPlay.create(G), a = fakeSession(), b = fakeSession();
  net.start({ role: "host", session: a, sessions: [{id:"a",session:a},{id:"b",session:b}] });
  const model = a.sent.find(e => e.t === NetPlay.EV.MODEL).d;
  a.deliver(NetPlay.EV.MODEL, {...model, epoch:"peer-a"});
  b.deliver(NetPlay.EV.MODEL, {...model, epoch:"peer-b"});
  const data = {...NetPlay.strategyState({tyreWear:.7, pitState:"box"},1,"monza"),epoch:model.epoch};
  a.deliver(NetPlay.EV.STRATEGY,data);
  assert.equal(G.cars[1].tyreWear,.7);
  assert.equal(b.sent.filter(e=>e.t===NetPlay.EV.STRATEGY).at(-1).d.epoch,"peer-b");
  a.deliver(NetPlay.EV.STRATEGY,{...data,wire:2});
  assert.equal(G.cars[2].tyreWear,undefined,"a guest cannot change another guest's tyres");
  a.deliver(NetPlay.EV.STRATEGY,{...data,wire:0});
  assert.equal(G.player.tyreWear,undefined,"a guest cannot change the host's tyres");
  a.deliver(NetPlay.EV.STRATEGY,{...data,epoch:"old-race",fields:{tyreWear:.1}});
  assert.equal(G.cars[1].tyreWear,.7,"same-track stale events are ignored");
  net.stop();
});

// ---- the HOST's AI retires on the guest too ------------------------------
// Bug hunt 2026-10-05 G5. retireCar reported only the LOCAL car, so a guest
// posed a host-retired AI as running: it counted in the guest's order and
// contact, the sheet printed "0 pts" for a DNF, and after the host left the
// guest's own AI drove the parked car off the wall.
function guestWithHostAi() {
  const G = stubG(3);                                  // 0 = us, 1 = the host's human, 2 = the host's AI
  G.retired = [];
  G.retireCar = (c, why) => { c.retired = true; c.dnf = why; G.retired.push(c.code); };
  const net = NetPlay.create(G);
  const s = fakeSession();
  assert.equal(net.start({ role: "guest", session: s }).ok, true);
  return { G, net, s, ai: G.cars[2] };
}

test("a GUEST parks the host's AI when the host reports its retirement", () => {
  const { G, net, s, ai } = guestWithHostAi();
  assert.equal(net.owns(ai), true, "precondition: the host's AI is posed from the wire");
  const epoch = (s.sent.find((e) => e.t === "model" || e.t === NetPlay.EV.MODEL) || {}).d?.epoch;
  s.deliver("lap", { lap: 4, time: null, best: null, code: ai.code, driverId: ai.driverId, retired: "engine", invalid: true, epoch });
  assert.equal(ai.retired, true, "retired on the guest as on the host");
  assert.equal(ai.dnf, "engine");
  assert.deepEqual(G.retired, [ai.code], "through retireCar: parked and announced once");
  s.deliver("lap", { lap: 4, time: null, best: null, code: ai.code, driverId: ai.driverId, retired: "engine", invalid: true });
  assert.deepEqual(G.retired, [ai.code], "a repeat changes nothing");
  s.disconnect("transport");
  assert.equal(ai.retired, true, "after the host leaves the car stays out (updateCar never drives a retirement)");
});

test("a HOST ignores a guest's claim that one of the host's AI retired", () => {
  const G = stubG(3);
  G.retireCar = () => { throw new Error("a guest cannot retire the host's AI"); };
  const net = NetPlay.create(G);
  const s = fakeSession();
  assert.equal(net.start({ role: "host", session: s }).ok, true);
  const ai = G.cars.find((c) => !c.human);
  s.deliver("lap", { lap: 4, time: null, best: null, code: ai.code, driverId: ai.driverId, retired: "engine", invalid: true });
  assert.equal(!!ai.retired, false);
});

test("retireCar reports the host's own AI retirements on the reliable channel, not only the local car's", () => {
  const body = fnSource(src("js/game.js"), "function retireCar(c, reason)");
  assert.match(body, /c\.local \|\| \(!c\.human && netPlay\.ownsRaceControl\(\)\)/, "the host owns its AI's word");
  assert.match(body, /driverId: c\.driverId/, "the guest finds the AI by driverId");
});

// ---- a finish is the OWNER's crossing, a retirement the owner's word -------
// Bug hunt 2026-09-28. A LAPPED car is flagged out at a lap BELOW lapsTarget
// (RaceControl.lineTransition) and reports its `fin` with that lap; the
// receiver gated the finish on `lap > lapsTarget`, so the fin sat in _nFin
// for good and finishDelay held the other screen to the 360 s/lap hard cap.
test("a lapped rival's finish (fin at a lap below the target) finishes it on the other peer", () => {
  const { G, s } = started("host");
  G.lapsTarget = 3; G.raceT = 100;
  G.player.finished = true; G.player.lap = 4;           // the host has already raised the flag
  const rival = G.cars[1];
  rival.lap = 2;                                       // its pose: on lap 2, flagged out at this crossing
  s.deliver("lap", { lap: 2, time: null, best: null, code: "D1", fin: 99.5, invalid: true });
  assert.equal(rival.finished, true, "the owner's crossing lap is the finishing crossing");
  assert.equal(rival.finishT, 99.5);
  assert.equal(rival._nFin, null);
});

test("a fin ahead of the pose waits for the pose to reach THAT lap, not the target", () => {
  const { G, s } = started("host");
  G.lapsTarget = 3; G.raceT = 100;
  G.player.finished = true; G.player.lap = 4;
  const rival = G.cars[1];
  rival.lap = 1;                                       // the pose trails the crossing by the interp delay
  s.deliver("lap", { lap: 2, time: null, best: null, code: "D1", fin: 99.5, invalid: true });
  assert.equal(!!rival.finished, false, "not yet: the drawn car has not crossed");
  assert.equal(rival._nFin, 99.5);
  assert.equal(rival._nFinLap, 2, "…and it is lap 2 it waits for, not lapsTarget + 1");
});

test("a full-distance finish still needs the pose past the target, as before", () => {
  const { G, s } = started("host");
  G.lapsTarget = 3; G.raceT = 200;
  const rival = G.cars[1];
  rival.lap = 3;
  s.deliver("lap", { lap: 4, time: 90, best: 90, code: "D1", fin: 199.8 });
  assert.equal(!!rival.finished, false);
  assert.equal(rival._nFinLap, 4);
  rival.lap = 4;
  s.deliver("lap", { lap: 4, time: null, best: null, code: "D1", fin: 199.8, invalid: true });
  assert.equal(rival.finished, true);
});

test("a rival's retirement arrives on the LAP event and parks it as retired, once", () => {
  // Nothing carried it: the 13 B snapshot has no flag, so a retired rival
  // stood "still running" and the other screen waited for the hard cap.
  const { G, s } = started("host");
  G.lapsTarget = 3; G.raceT = 50;
  const rival = G.cars[1];
  s.deliver("lap", { lap: 1, time: null, best: null, code: "D1", retired: "engine", invalid: true });
  assert.equal(rival.retired, true);
  assert.equal(rival.dnf, "engine");
  s.deliver("lap", { lap: 1, time: null, best: null, code: "D1", fin: 49.9, invalid: true });
  assert.equal(!!rival.finished, false, "a retired car does not also finish");
  const other = started("host");
  other.G.lapsTarget = 3;
  other.s.deliver("lap", { lap: 1, code: "D1", retired: 12, invalid: true });
  assert.equal(!!other.G.cars[1].retired, false, "a retirement is a reason string, nothing else");
});

test("a rival handed back to the AI does not time the rest of its lap as a whole one", () => {
  // While net-owned the car skipped updateCar, so lapTime never ran: the AI's
  // first crossing after a handback timed the REMAINING part of the lap as a
  // whole one — a 25 s "fastest lap" for a rival that had left.
  const { G, s } = started("guest");
  const rival = G.cars[1];
  rival.lapTime = 0; rival._secT0 = 0;
  s.disconnect("transport");
  assert.equal(rival.incidentInvalidLap, true, "the lap in progress is untimed");
  assert.equal(rival.lapTime, 0);
  assert.equal(rival._secT0, null);
});

test("a stale disconnect reason does not outlive the race: stop() on an inactive session forgets it", () => {
  const { net, s } = started("guest");
  s.disconnect("transport");
  assert.equal(net.status().reason, "transport", "during THIS race the pause menu may say so");
  assert.equal(net.stop("local"), false, "nothing to stop…");
  assert.equal(net.status().reason, null, "…but the next solo race must not read 'Disconnected'");
});

// stop() closes sockets after active=false. Real NetSession.close() fires
// onClose("local") synchronously; that used to re-enter stop("local") while
// inactive, clear lastReason, and fire onStop — so a mid-race BYE restored
// the guest's lobby rules (restoreOwnRules) and erased the disconnect reason.
// Transport drops delete the session before stop() and never hit this path;
// the old fakeSession.close() also never fired onClose, so the suite missed it.
test("a mid-race BYE keeps lastReason and does not fire onStop (race continues offline)", () => {
  for (const role of ["guest", "host"]) {
    const G = stubG();
    const net = NetPlay.create(G);
    const s = fakeSession();
    let onStopCalls = 0;
    assert.equal(net.start({ role, session: s, onStop: () => { onStopCalls++; } }).ok, true);
    s.deliver("bye", {});
    assert.equal(net.active(), false, `${role}: network session ends`);
    assert.equal(net.status().reason, "bye", `${role}: the clean leave reason must survive stop()→close()`);
    assert.equal(onStopCalls, 0, `${role}: onStop is local-quit only; a peer BYE keeps racing with AI`);
    assert.equal(G.cars[1].human, false, `${role}: the rival returns to AI`);
  }
  // Host with another guest still racing: close() reports "local", but the
  // leave was clean — reason must stay "bye" while active remains true.
  const G = stubG(3);
  const net = NetPlay.create(G);
  const sA = fakeSession(), sB = fakeSession();
  let onStopCalls = 0;
  assert.equal(net.start({
    role: "host", session: sA, onStop: () => { onStopCalls++; },
    sessions: [{ id: "a", session: sA }, { id: "b", session: sB }],
  }).ok, true);
  sA.deliver("bye", {});
  assert.equal(net.active(), true, "one of two guests leaving does not end the race");
  assert.equal(net.status().reason, "bye");
  assert.equal(onStopCalls, 0);
  assert.equal(sB.sent.some((m) => m.t === "left"), true);
});

test("a local stop fires onStop once and keeps reason local through socket teardown", () => {
  const G = stubG();
  const net = NetPlay.create(G);
  const s = fakeSession();
  let onStopCalls = 0;
  assert.equal(net.start({ role: "guest", session: s, onStop: () => { onStopCalls++; } }).ok, true);
  assert.equal(net.stop("local"), true);
  assert.equal(onStopCalls, 1, "restoreOwnRules runs once for a deliberate local quit");
  assert.equal(net.status().reason, "local", "close()'s onClose(local) must not clear the stop reason");
});

// ---- the own-car snapshot is stamped when its POSE is, not when the frame is ----
// netPlay.tick runs BEFORE the frame's physics steps, so the pose it publishes
// is last frame's. Stamped `now`, every rival drew us 16–33 ms (a metre or more
// at speed) behind where we actually were (bug hunt 2026-09-28).
test("the published snapshot carries the pose time the game loop hands in", () => {
  const G = stubG();
  const net = NetPlay.create(G);
  const s = fakeSession();
  const ticks = [];
  s.sendState = (bytes) => { const d = NetSnapshot.decodeSnapshot(bytes); if (d) ticks.push(d.tick); return true; };
  assert.equal(net.start({ role: "guest", session: s }).ok, true);
  net.tick(10000, 9978);                         // pose 22 ms old: last frame's physics
  assert.deepEqual(ticks, [9978], "stamped with the pose time");
  net.tick(20000);                               // a test pumping by hand: the pose is `now`
  assert.deepEqual(ticks.slice(1), [20000]);
  net.tick(30000, 30050);                        // from the future: not a clock we trust
  net.tick(40000, 39000);                        // a second old: a stall, not last frame
  assert.deepEqual(ticks.slice(2), [30000, 40000], "out-of-bounds pose times fall back to the frame");
});

// ---- L8-e netcode polish: arrival stamps, a fixed 20 Hz, one relay datagram per guest ----
function stateSession() {
  const s = fakeSession();
  s.states = [];
  s.onState = function (fn) { this._state = fn; return this; };
  s.sendState = function (bytes) { this.states.push(NetSnapshot.decodeSnapshot(bytes)); return true; };
  s.feed = function (tick, id, car, at) { this._state(NetSnapshot.encodeSnapshot(tick, [{ id, car }]), at); };
  return s;
}
function poseG(n) {
  if (!globalThis.Tracks.sample) globalThis.Tracks.sample = (_t, _s, out) => { out.t[0] = 0; out.t[2] = 1; return out; };
  const G = stubG(n);
  G.lapsTarget = 5; G.raceT = 10;
  G.worldFromTrack = (sv, x) => ({ x, y: 0, z: sv, nx: 0, nz: 1 });
  return G;
}
const lapPose = (sv) => ({ s: sv, x: 0, head: 0, speed: 60, gear: 5, lap: 1 });

test("the host relays every other guest's car in ONE aged datagram per guest, each with its own stamp", () => {
  const G = poseG(4);
  const net = NetPlay.create(G);
  const ss = { a: stateSession(), b: stateSession(), c: stateSession() };
  assert.equal(net.start({ role: "host", session: ss.a,
    sessions: Object.entries(ss).map(([id, session]) => ({ id, session })),
    peers: [{ id: "a" }, { id: "b" }, { id: "c" }] }).ok, true);
  // a → cars[1], b → cars[2], c → cars[3] (pickRemoteSlot walks the grid in order).
  let t = 10_000;
  for (let k = 0; k < 12; k++, t += 50) {
    for (const s of Object.values(ss)) s.states.length = 0;
    ss.a.feed(t - 30, 1, lapPose(100 + k), t - 10);
    ss.b.feed(t - 70, 2, lapPose(200 + k), t - 10);
    ss.c.feed(t - 50, 3, lapPose(300 + k), t - 10);
    G.netNow = t;
    net.tick(t);
  }
  for (const [name, own] of [["a", 1], ["b", 2], ["c", 3]]) {
    const got = ss[name].states;
    const relays = got.filter((p) => p && p.type === NetSnapshot.TYPE_AGED);
    assert.equal(relays.length, 1, `guest ${name}: one relay datagram per publish, not one per car`);
    assert.deepEqual(relays[0].cars.map((c) => c.id).sort(), [1, 2, 3].filter((i) => i !== own),
      `guest ${name}: every OTHER guest, never its own car`);
    assert.equal(got.length, 2, `guest ${name}: the host's own car + ONE relay (was 1 + 2)`);
  }
  net.stop();
});

test("a guest poses each entry of an aged relay at ITS OWN stamp (tick − age)", () => {
  const G = poseG(3);
  const net = NetPlay.create(G);
  const s = stateSession();
  // A guest seats the host and the relayed second guest (the lobby's roster).
  assert.equal(net.start({ role: "guest", session: s, peers: [{ id: "peer" }, { id: "g2" }] }).ok, true);
  // The host relays cars 1 and 2 posed 0 and 40 ms before the header tick;
  // the packet lands at 5010. Each entry's lag is arrival − ITS OWN stamp.
  s._state(NetSnapshot.encodeAged([
    { id: 1, car: lapPose(100), at: 5000 }, { id: 2, car: lapPose(200), at: 4960 },
  ]), 5010);
  const lag = Object.fromEntries(net.status().remotes.map((r) => [r.wire, Math.round(r.timing.lagMs)]));
  assert.deepEqual(lag, { 1: 10, 2: 50 });
  net.stop();
});

test("the publish rate is a fixed 20 Hz at 30, 60 and 144 fps", () => {
  for (const fps of [30, 60, 144]) {
    const G = poseG(2);
    const net = NetPlay.create(G);
    const s = stateSession();
    assert.equal(net.start({ role: "guest", session: s }).ok, true);
    const frame = 1000 / fps;
    for (let t = 10_000; t < 20_000; t += frame) { G.netNow = t; net.tick(t); }
    const own = s.states.filter((p) => p && p.type === NetSnapshot.TYPE_SNAPSHOT).length;
    assert.ok(Math.abs(own - 200) <= 2, `${fps} fps published ${own} in 10 s, want 200 (20 Hz)`);
    net.stop();
  }
});

test("a rival's lag is measured from the transport's ARRIVAL stamp, not the frame that drained it", () => {
  const run = (stamp) => {
    const G = poseG(2);
    const net = NetPlay.create(G);
    const s = stateSession();
    assert.equal(net.start({ role: "guest", session: s }).ok, true);
    // Every packet ARRIVES 40 ms after its tick and is drained by a frame 30 ms later.
    for (let k = 0; k < 80; k++) {
      const tick = 10_000 + k * 50;
      G.netNow = tick + 70;
      s.feed(tick, 1, lapPose(100 + k), stamp ? tick + 40 : undefined);
    }
    const timing = net.status().remotes[0].timing;
    net.stop();
    return timing;
  };
  const arrived = run(true), drained = run(false);
  assert.ok(Math.abs(arrived.lagMs - 40) < 3, "lag read from the arrival stamp: " + arrived.lagMs);
  assert.ok(Math.abs(drained.lagMs - 70) < 3, "no stamp: the frame time, as before: " + drained.lagMs);
});

// ---- L8-f: AI replication + the race silence grace (docs/notes/MULTIPLAYER-AI-REPLICATION.md) ----
test("the host publishes its AI field at 10 Hz in each guest's aged packet, never that guest's own car", () => {
  const G = poseG(5);                 // cars[0] host, [1] guest a, [2..4] AI
  const net = NetPlay.create(G);
  const a = stateSession();
  assert.equal(net.start({ role: "host", session: a }).ok, true);
  let t = 10_000;
  a.feed(t - 20, 1, lapPose(50), t - 10);
  for (let k = 0; k < 20; k++, t += 50) { G.netNow = t; net.tick(t); }   // 20 publishes = 1 s
  const aged = a.states.filter((p) => p && p.type === NetSnapshot.TYPE_AGED);
  assert.equal(aged.length, 10, "AI rides every other publish: 10 Hz");
  for (const p of aged) assert.deepEqual(p.cars.map((c) => c.id).sort(), [2, 3, 4], "the AI only — not the host (own packet), not guest a's own car");
  assert.equal(a.states.filter((p) => p && p.type === NetSnapshot.TYPE_SNAPSHOT).length, 20, "the host's own car still at 20 Hz");
  net.stop();
});

test("a guest seats the host's AI as host-owned remotes and poses them from the packet", () => {
  const G = poseG(4);                 // cars[0] guest (local), [1] host, [2..3] AI
  const net = NetPlay.create(G);
  const s = stateSession();
  assert.equal(net.start({ role: "guest", session: s }).ok, true);
  const ai = G.cars[2];
  assert.equal(net.status().hostAi, 2, "both AI cars are the host's");
  assert.equal(net.owns(ai), true, "updateCar skips it: this screen never simulates the host's AI");
  assert.equal(ai.human, false, "its role stays AI");
  for (let k = 0; k < 10; k++) {
    const tick = 10_000 + k * 100;
    s._state(NetSnapshot.encodeAged([{ id: 2, car: lapPose(400 + k * 5), at: tick }, { id: 3, car: lapPose(900), at: tick }]), tick + 30);
    G.netNow = tick + 30; net.tick(tick + 30);
  }
  assert.ok(ai.s > 400 && ai.s < 450, "posed from the host's packets: s=" + ai.s);
  assert.equal(net.owns(G.cars[1]), true, "the host's own car is a human rival as before");
  // Without replication (hostAi: false) the guest simulates its own AI, as before.
  const G2 = poseG(4), net2 = NetPlay.create(G2);
  assert.equal(net2.start({ role: "guest", session: stateSession(), hostAi: false }).ok, true);
  assert.equal(net2.owns(G2.cars[2]), false);
  net.stop(); net2.stop();
});

test("the host's actual AI retirement reaches a guest, including one that binds after it happened", () => {
  const host = poseG(3), guest = poseG(3);
  host.track.def = guest.track.def = { id: "monza" };
  guest.cars[0].local = guest.cars[0].human = false;
  guest.cars[1].local = guest.cars[1].human = true; guest.player = guest.cars[1];
  const hn = NetPlay.create(host), gn = NetPlay.create(guest), hs = stateSession(), gs = stateSession();
  hn.start({ role: "host", session: hs }); gn.start({ role: "guest", session: gs });
  const hm = hs.sent.find((e) => e.t === "model").d, gm = gs.sent.find((e) => e.t === "model").d;
  hs.deliver("model", gm); gs.deliver("model", hm);
  // Execute the game's real sender, not a reproduction of its local/host gate.
  vm.runInNewContext(fnSource(src("js/game.js"), "function retireCar(c, reason)") + ";retireCar(car, 'engine');", {
    car: host.cars[2], netPlay: hn, incidentSim: { release() {} }, track: host.track,
    smp: { hw: 8, t: [0, 0, 1] }, Tracks: { sample() {}, wallAt: () => 10 },
    clamp: M4.clamp, worldFromTrack: (s, x) => ({ x, z: s }), IDLE_RPM: 4000,
    OvertakeMode: { reset() {} }, announce() {}, soundOn: false, pits: { clearArm() {} },   // retireCar clears a stale pit arm (bug-hunt 7.3)
  });
  const event = hs.sent.filter((e) => e.t === "lap" && e.d.driverId === "drv2").at(-1);
  assert.ok(event, "the host sends an AI retirement immediately");
  assert.equal(event.d.epoch, gm.epoch, "state belongs to the receiver's race");
  gs.deliver(event.t, event.d);
  assert.equal(guest.cars[2].retired, true);
  assert.equal(guest.cars[2].dnf, "engine");
  assert.equal(guest.cars.filter((c) => !c.retired).includes(guest.cars[2]), false, "the game's ranked/collision filter excludes it");
  assert.equal(gn.owns(guest.cars[2]), true, "the parked car is still posed by its host");
  gs.feed(10000, 2, lapPose(1200), 10000); gn.tick(10000);
  assert.equal(guest.cars[2].retired, true, "an older unreliable pose cannot resurrect terminal state");
  // A new receiver epoch simulates late binding/rejoining after the DNF event.
  const late = poseG(3); late.track.def = { id: "monza" };
  const ln = NetPlay.create(late), ls = stateSession(); ln.start({ role: "guest", session: ls });
  hs.deliver("model", ls.sent.find((e) => e.t === "model").d);
  hs.sent.length = 0; hn.tick(10000);
  const repeated = hs.sent.find((e) => e.t === "lap" && e.d.driverId === "drv2");
  assert.ok(repeated, "the existing reliable sync repeats terminal AI state");
  ls.deliver(repeated.t, repeated.d);
  assert.equal(late.cars[2].retired, true);
  // ONCE per arriving receiver, not once a second for the rest of the race: every repeat was a reliable
  // event per retired car per guest, filling a frozen guest's inbox.
  hs.sent.length = 0; hn.tick(11500); hn.tick(13000);
  assert.ok(hs.sent.some((e) => e.t === NetPlay.EV.STRATEGY), "the 1 s strategy block ran on both ticks");
  assert.equal(hs.sent.filter((e) => e.t === "lap" && e.d.driverId === "drv2").length, 0, "the terminal state is not re-broadcast");
  hs.deliver("model", ls.sent.find((e) => e.t === "model").d);   // another receiver binds: now it is owed again
  hs.sent.length = 0; hn.tick(14500);
  assert.equal(hs.sent.filter((e) => e.t === "lap" && e.d.driverId === "drv2").length, 1);
  hn.stop(); gn.stop(); ln.stop();
});

test("AI retirements require the host and the current receiver epoch", () => {
  const G = poseG(3), net = NetPlay.create(G), s = stateSession();
  net.start({ role: "guest", session: s });
  const epoch = s.sent.find((e) => e.t === "model").d.epoch;
  const retirement = { driverId: "drv2", code: "D2", lap: 1, retired: "engine", invalid: true };
  for (const d of [retirement, { ...retirement, epoch: "previous-race" }]) {
    s.deliver("lap", d); assert.equal(!!G.cars[2].retired, false);
  }
  s.deliver("lap", { ...retirement, epoch }); assert.equal(G.cars[2].retired, true);
  net.stop();
  const host = poseG(3), hn = NetPlay.create(host), hs = stateSession();
  hn.start({ role: "host", session: hs });
  hs.deliver("lap", { ...retirement, epoch: hs.sent.find((e) => e.t === "model").d.epoch });
  assert.equal(!!host.cars[2].retired, false, "a guest cannot retire host AI");
  assert.equal(!!host.cars[1].retired, false, "nor can the spoof retire another car by accident");
  hn.stop();
});

test("silence grace: a rival quiet > 2 s is the local AI's, back on the wire when it speaks; the race session waits 25 s", () => {
  const G = poseG(3);
  const net = NetPlay.create(G);
  const s = stateSession();
  let timeout = null;
  s.setTimeoutMs = (ms) => { timeout = ms; return ms; };
  assert.equal(net.start({ role: "host", session: s }).ok, true);
  assert.equal(timeout, 25_000, "the race session's silence grace (the lobby keeps 6 s)");
  const rival = G.cars[1];
  let t = 10_000;
  s.feed(t, 1, lapPose(100), t + 10);
  G.netNow = t + 20; net.tick(t + 20);
  assert.equal(net.owns(rival), true);
  assert.equal(rival.human, true);
  t += 2_100; G.netNow = t; net.tick(t);                       // 2.1 s of nothing
  assert.equal(net.owns(rival), false, "silent: the local AI drives it, it is not parked on the line");
  assert.equal(rival.human, false);
  assert.equal(rival.dnfAt, null, "no stale AI reliability plan may retire it meanwhile");
  assert.deepEqual(net.status().stale, [1]);
  s.feed(t + 100, 1, lapPose(300), t + 110);                   // it speaks again
  t += 150; G.netNow = t; net.tick(t);
  assert.equal(net.owns(rival), true, "back on the wire");
  assert.equal(rival.human, true);
  assert.deepEqual(net.status().stale, []);
  net.stop();
});

// ---- a rival that left while a guest was still BUILDING (sibling register 8.1) ----
// The host's race-phase LEFT ({wire}) reached a guest whose session still held the LOBBY's handlers,
// which read only the lobby phase's `from`: it seated the leaver as a human nobody would move, and
// finishDelay waited the 360 s/lap hard cap on it.
test("the host tells a guest that arms late about a rival that left before it was built", () => {
  const host = poseG(3), hn = NetPlay.create(host);
  const ss = { a: stateSession(), b: stateSession() };
  assert.equal(hn.start({ role: "host", session: ss.a,
    sessions: Object.entries(ss).map(([k, session], i) => ({ id: i + 1, session })),
    peers: [{ id: 1 }, { id: 2 }] }).ok, true);
  const lefts = (sess) => sess.sent.filter((e) => e.t === NetPlay.EV.LEFT);
  ss.b.disconnect("transport");                                   // guest b leaves while guest a is still building
  assert.equal(lefts(ss.a).length, 1, "the live broadcast, which a still-building guest cannot read");
  ss.a.deliver(NetPlay.EV.ARMED, {});                              // a's circuit is built; its handlers are bound
  assert.equal(lefts(ss.a).length, 2, "…so ARMED earns the LEFT again");
  assert.deepEqual(lefts(ss.a)[1].d, { wire: 2, why: "transport" });
  ss.a.deliver(NetPlay.EV.ARMED, {});                              // ARMED is re-sent each second until START lands
  assert.equal(lefts(ss.a).length, 2, "…once per arriving guest, not on every repeat");
  // The guest that was building: seated b as a human rival; the resent LEFT frees it.
  const guest = poseG(3), gn = NetPlay.create(guest), gs = stateSession();
  assert.equal(gn.start({ role: "guest", session: gs, peers: [{ id: 1 }, { id: 2 }] }).ok, true);
  assert.equal(guest.cars[2].human, true, "precondition: seated as a human rival");
  gs.deliver(NetPlay.EV.LEFT, lefts(ss.a)[1].d);
  assert.equal(guest.cars[2].human, false, "the leaver is the local AI's");
  hn.stop(); gn.stop();
});

test("a human rival that never speaks is the local AI's after the start's own backstop, not never", () => {
  const G = poseG(3), net = NetPlay.create(G), s = stateSession();
  assert.equal(net.start({ role: "guest", session: s, peers: [{ id: 1 }, { id: 2 }] }).ok, true);
  const rival = G.cars[2];
  let t = 10_000;
  G.netNow = t; net.tick(t);
  t += 54_000; G.netNow = t; net.tick(t);
  assert.equal(rival.human, true, "a rival still building stays parked where it is, as before");
  t += 2_000; G.netNow = t; net.tick(t);
  assert.equal(rival.human, false, "past HOLD_MAX_MS of silence it is handed to the local AI");
  assert.equal(net.owns(rival), false);
  assert.ok(net.status().stale.includes(2));
  s.feed(t + 100, 2, lapPose(300), t + 110);                      // a packet still brings it back
  t += 150; G.netNow = t; net.tick(t);
  assert.equal(net.owns(rival), true);
  net.stop();
});

test("a session ending hands the HOST's AI cars back scrubbed too, not only the human rivals", () => {
  // aiRemotes skipped updateCar like any net-owned car, so their lapTime never
  // advanced: the first line crossing after the host timed out recorded a
  // short bogus best lap for ~19 cars (fastest-lap badge, radio call, results).
  const G = poseG(4);                 // cars[0] guest, [1] host, [2..3] the host's AI
  const net = NetPlay.create(G);
  assert.equal(net.start({ role: "guest", session: stateSession() }).ok, true);
  assert.equal(net.status().hostAi, 2, "two cars are the host's AI");
  for (const c of G.cars.slice(1)) { c.lapTime = 0; c._secT0 = 0; c.incidentInvalidLap = false; c.dnfAt = 5; c.dnfWhy = "x"; c._nOk = true; }
  net.stop("timeout");
  for (const c of G.cars.slice(1)) {
    assert.equal(c.incidentInvalidLap, true, c.code + ": the lap in progress is untimed");
    assert.equal(c.lapTime, 0, c.code);
    assert.equal(c._secT0, null, c.code);
    assert.equal(c.dnfAt, null, c.code);
    assert.equal(c._nOk, false, c.code);
  }
});

test("a hidden tab keeps pumping the session but publishes no pose; it resumes on return", () => {
  // Physics runs from rAF only, so a backgrounded tab's pose is frozen at the
  // last speed. Publishing it made peers solve contact against a ghost and
  // kept the silence rule (-> local AI) from ever firing.
  const G = stubG();
  const net = NetPlay.create(G);
  const s = fakeSession();
  const published = [];
  let pumps = 0;
  s.sendState = (bytes) => { published.push(NetSnapshot.decodeSnapshot(bytes)); return true; };
  s.pump = () => { pumps++; return true; };
  assert.equal(net.start({ role: "guest", session: s }).ok, true);
  const had = Object.getOwnPropertyDescriptor(globalThis, "document");
  try {
    globalThis.document = { hidden: true };
    net.tick(10000); net.tick(10500); net.tick(11000);
    assert.equal(pumps, 3, "pings still pumped: the session stays alive");
    assert.equal(published.length, 0, "no own-car entry while hidden");
    globalThis.document = { hidden: false };
    net.tick(11500);
    assert.equal(published.length, 1, "publishing resumes the moment the tab is back");
    assert.equal(published[0].cars.length, 1);
  } finally {
    if (had) Object.defineProperty(globalThis, "document", had); else delete globalThis.document;
  }
});
