/* Drop and spectate contracts for the race connection layer.
 *
 * A dropped driver's car goes to AI while the host race keeps running;
 * spectators share the host's connection fan-out but never consume a car seat
 * or publish authoritative state.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";
import { netStubG } from "../helpers/fake-g.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
globalThis.M4 = eval(src("js/core/mat4.js") + ";M4");
globalThis.NetInterp = eval(src("js/net/interp.js") + ";NetInterp");
globalThis.NetSnapshot = eval(src("js/net/snapshot.js") + ";NetSnapshot");
globalThis.NetIce = eval(src("js/net/ice.js") + ";NetIce");
globalThis.NetTransport = eval(src("js/net/transport.js") + ";NetTransport");
globalThis.NetSession = eval(src("js/net/session.js") + ";NetSession");
const spectatePath = path.join(ROOT, "js/net/spectate.js");
globalThis.NetSpectate = fs.existsSync(spectatePath)
  ? eval(fs.readFileSync(spectatePath, "utf8") + ";NetSpectate")
  : undefined;
globalThis.QualiWire = eval(src("js/net/quali-wire.js") + ";QualiWire");
globalThis.StrategyWire = eval(src("js/net/strategy-wire.js") + ";StrategyWire");
const NetPlay = eval(src("js/net/netplay.js") + ";NetPlay");
globalThis.Tracks = { sample: (_track, _s, out) => { out.t[0] = 0; out.t[2] = 1; return out; } };

function stubG(n = 4, local = 0) {
  const G = netStubG(n, local, { track: { total: 5000, n: 500, def: { id: "monza" } } });
  for (const c of G.cars) c.lap = 1;
  return G;
}

function fakeSession() {
  const events = new Map();
  let state = null;
  let close = null;
  const stepHandlers = [];
  return {
    sent: [], states: [],
    clearHandlers() { events.clear(); state = null; close = null; stepHandlers.length = 0; return this; },
    onState(fn) { state = fn; return this; },
    onClose(fn) { close = fn; return this; },
    onStep(fn) { stepHandlers.push(fn); return this; },
    fireStep(info) { for (const fn of stepHandlers.slice()) fn(info); },
    onEvent(type, fn) {
      if (!events.has(type)) events.set(type, []);
      events.get(type).push(fn);
      return this;
    },
    sendEvent(type, data) { this.sent.push({ type, data }); return true; },
    sendState(bytes) { this.states.push(NetSnapshot.decodeSnapshot(bytes)); return true; },
    pump() { return true; },
    alive: () => true,
    peerToLocal: (t) => t,
    setTimeoutMs: (ms) => ms,
    stats: () => ({}),
    close() { const fn = close; close = null; if (fn) fn("local"); },
    drop(why = "transport") { if (close) close(why); },
    feed(tick, wire, car, at = tick) {
      if (state) state(NetSnapshot.encodeSnapshot(tick, [{ id: wire, car }]), at);
    },
    deliver(type, data) {
      for (const fn of events.get(type) || []) fn(data);
    },
  };
}

const pose = (s) => ({ s, x: 0, head: 0, speed: 60, gear: 5, lap: 1 });

test("a dropped driver hands its car to AI while the host race stays live", () => {
  const hostG = stubG(3, 0), guestG = stubG(3, 1);
  const host = NetPlay.create(hostG), guest = NetPlay.create(guestG);
  const firstWire = NetTransport.loopback({ latencyMs: 0 });
  const firstHost = NetSession.create({ transport: firstWire[0] });
  const firstGuest = NetSession.create({ transport: firstWire[1] });
  assert.equal(host.start({
    role: "host",
    session: firstHost,
    sessions: [{ id: "driver-a", session: firstHost, kind: "driver" }],
    peers: [{ id: "driver-a", kind: "driver" }],
  }).ok, true);
  assert.equal(guest.start({ role: "guest", session: firstGuest }).ok, true);
  let t = 1000;
  for (let i = 0; i < 20; i++) { t += 25; host.tick(t); guest.tick(t); }
  const wire = host.status().remotes[0].wire;
  const car = hostG.cars[wire];

  firstGuest.close();
  for (let i = 0; i < 5; i++) { t += 25; host.tick(t); guest.tick(t); }
  assert.equal(host.active(), true, "the host race keeps running when its last driver drops");
  assert.equal(guest.active(), false, "the dropped side leaves its old session");
  assert.equal(car.human, false, "AI covers the disconnected car");
  // H3-9 (2026-10-22): rejoin() had no production caller (the lobby never
  // re-adopts a race connection), so it and its REJOIN event were removed.
  assert.equal(host.rejoin, undefined, "NetPlay exposes no dead rejoin()");
});

test("a spectator consumes no grid seat, receives field state, and cannot publish inputs", () => {
  assert.ok(NetSpectate, "js/net/spectate.js defines the spectator policy module");
  assert.match(src("js/net/lobby.js"), /const MAX_GUESTS = 3;/,
    "spectators share the connection layer without changing the three guest seats");
  const G = stubG(4);
  const net = NetPlay.create(G);
  const spectator = fakeSession();
  assert.equal(net.start({
    role: "host",
    session: spectator,
    sessions: [{ id: "watch-a", session: spectator, kind: "spectator" }],
    peers: [{ id: "watch-a", kind: "spectator" }],
  }).ok, true);

  assert.equal(net.status().remotes.length, 0, "a spectator-only audience occupies no car");
  assert.equal(net.status().spectators, 1);
  const before = G.cars.map((car) => car.human);
  spectator.feed(1000, 2, pose(999), 1000);
  net.tick(1000);
  assert.deepEqual(G.cars.map((car) => car.human), before, "spectator state has no authority");

  for (let t = 1050; t <= 1200; t += 50) net.tick(t);
  assert.ok(spectator.states.some((packet) => packet && packet.cars.length),
    "the host fan-out sends race state to the spectator");

  const SG = stubG(4, -1);
  const watch = NetPlay.create(SG);
  const host = fakeSession();
  assert.equal(watch.start({ role: "spectator", session: host }).ok, true);
  host.feed(2000, 0, pose(432), 2000);
  watch.tick(2000);
  assert.equal(SG.cars[0].s, 432, "the spectator renders received car state");
  assert.equal(host.states.length, 0, "a spectator never publishes a local snapshot");
  assert.equal(watch.sendEvent("lap", { lap: 2 }), false, "a spectator cannot publish race inputs/events");
  assert.equal(watch.ownsRaceControl(), false);
  assert.equal(watch.ownsClassification(), false);
});

test("host teardown closes every driver and spectator transport", () => {
  const net = NetPlay.create(stubG(4));
  const peers = ["driver", "spectator", "driver"].map((kind, i) => {
    const [wire] = NetTransport.loopback({ latencyMs: 0 });
    return { id: "peer-" + i, kind, wire, session: NetSession.create({ transport: wire }) };
  });
  assert.equal(net.start({ role: "host", session: peers[0].session, sessions: peers, peers }).ok, true);
  net.tick(1000);
  assert.equal(net.stop("local"), true);
  assert.deepEqual(peers.map(({ wire }) => wire.status), ["closed", "closed", "closed"]);
});

// ---- #6766 W5: host LAP relay must clamp d.lap like clampWire (0..lapsTarget+1) ----
// Tip 94c9f19bf5: Math.floor only — a bogus wire lap 999 is forwarded to other guests.
test("host LAP relay clamps a bogus wire lap to 0..lapsTarget+1 (#6766 W5)", () => {
  const G = stubG(3, 0);
  G.lapsTarget = 5;
  const net = NetPlay.create(G);
  const a = fakeSession(), b = fakeSession();
  assert.equal(net.start({
    role: "host",
    session: a,
    sessions: [{ id: "a", session: a }, { id: "b", session: b }],
    peers: [{ id: "a" }, { id: "b" }],
  }).ok, true);
  const sender = G.cars[1];
  a.deliver(NetPlay.EV.LAP, {
    lap: 999, time: 91.2, best: 90.5, code: sender.code, driverId: sender.driverId,
  });
  const relayed = b.sent.filter((m) => m.type === NetPlay.EV.LAP);
  assert.equal(relayed.length, 1, "the host relays the sender's LAP to the other guest");
  assert.equal(relayed[0].data.lap, G.lapsTarget + 1,
    "relayed lap must share clampWire's 0..lapsTarget+1 bound (tip forwarded 999 unclamped)");
  net.stop();
});

// ---- #6766 W4: after silence, goWire must resync the posed lap to the wire ----
// Tip: gateLap only adds 1 per crossing, so a multi-lap gap after goLocal leaves
// the posed lap behind the owner's wire lap.
test("after silence across two crossings, goWire resyncs the posed lap to the wire (#6766 W4)", () => {
  const G = stubG(2, 0);
  G.lapsTarget = 5;
  G.track.total = 5000;
  G.raceT = 200;
  const net = NetPlay.create(G);
  const s = fakeSession();
  assert.equal(net.start({ role: "host", session: s, interpDelayMs: 0 }).ok, true);
  const rival = G.cars[1];
  let t = 10_000;
  s.feed(t, 1, { s: 2500, x: 0, head: 0, speed: 60, gear: 5, lap: 1 }, t);
  G.netNow = t; net.tick(t);
  assert.equal(rival.lap, 1, "precondition: posed on lap 1");
  t += 2_100; G.netNow = t; net.tick(t);
  assert.equal(net.owns(rival), false, "precondition: silence handed the car to local AI");
  assert.equal(rival._nOwnerLap, 1);
  // Owner kept racing: wire resumes two crossings ahead, mid-lap (no s-wrap for gateLap).
  s.feed(t + 50, 1, { s: 2600, x: 0, head: 0, speed: 60, gear: 5, lap: 3 }, t + 50);
  t += 100; G.netNow = t; G.raceT = 210; net.tick(t);
  assert.equal(net.owns(rival), true, "a fresh pose restores wire ownership");
  assert.equal(rival.lap, 3,
    "posed lap must resync to the wire on goWire within the speed bound (tip lagged at ownerLap/gateLap+1)");
  net.stop();
});

// ---- #6766 #6544 row 5: a clock step must clear interp or old-t packets hand the rival to AI ----
test("a clock-offset step clears interp so old-t packets do not hand the rival to local AI (#6766 row 5)", () => {
  const G = stubG(2, 0);
  G.lapsTarget = 5;
  const net = NetPlay.create(G);
  const s = fakeSession();
  assert.equal(net.start({ role: "host", session: s, interpDelayMs: 0 }).ok, true);
  const rival = G.cars[1];
  let t = 20_000;
  for (let k = 0; k < 10; k++) {
    s.feed(t + k * 50, 1, { s: 100 + k, x: 0, head: 0, speed: 60, gear: 5, lap: 1 }, t + k * 50);
    G.netNow = t + k * 50; net.tick(G.netNow);
  }
  assert.equal(net.owns(rival), true, "precondition: on the wire");
  assert.ok(net.status().buffered >= 2, "precondition: interp holds pre-step samples");
  // A confirmed clock step must clear the ring (session onStep → netplay). Without
  // that, the post-step packets below splice under the old newest and never renew
  // heardAt, so STALE_MS hands the rival to local AI.
  if (typeof s.fireStep === "function") s.fireStep();
  const stepped = t - 2_500;
  for (let k = 0; k < 6; k++) {
    const at = t + 600 + k * 50;
    s.feed(stepped + k * 50, 1, { s: 200 + k, x: 0, head: 0, speed: 60, gear: 5, lap: 1 }, at);
    G.netNow = at; net.tick(at);
  }
  G.netNow = t + 600 + 2_200; net.tick(G.netNow);
  assert.equal(net.owns(rival), true,
    "after a clock step the rival must stay on the wire (tip kept old-t samples and went stale)");
  assert.deepEqual(net.status().stale, []);
  net.stop();
});
