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
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

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

/** A session NetPlay can bind to, with a hand-fed inbound event channel. */
function fakeSession() {
  const handlers = new Map();
  const sent = [];
  return {
    sent, closed: 0,
    clearHandlers() { handlers.clear(); return this; },
    onState() { return this; },
    onClose() { return this; },
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
    close() { this.closed++; handlers.clear(); return true; },
    handlerCount() {
      let n = 0;
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
    wireId: (c) => c.idx,
    setCarRole: (c, human, local) => { c.human = human; c.local = local; },
    announce: () => {},
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
  const rows = { rows: [{ pos: 1, name: "host order" }] };
  s.deliver("result", rows);
  assert.deepEqual(net.peerResult(), rows);
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

test("QLIVE is bound to the sender on the host the same way", () => {
  // Display-only, but keyed by the same driverId — unbound, the same spoof
  // paints a lap-in-progress over another driver's name.
  const { G, s } = started("host");
  s.deliver("qlive", { driverId: "drv1", t: 12.4, frac: 0.2 });
  s.deliver("qlive", { driverId: "drv0", t: 1.0, frac: 0.9 });
  assert.deepEqual(G.caughtQLive, [{ driverId: "drv1", t: 12.4, frac: 0.2 }]);
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
