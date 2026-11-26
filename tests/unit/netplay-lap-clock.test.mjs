/* netplay lap and clock sync (#6766): relayed LAP clamp, silent-host lap resync, clock step clears interp. */
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
globalThis.NetWire = eval(src("js/net/wire-schema.js") + ";NetWire");   // NetSession / QualiWire / NetPlay read the wire table
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
  return {
    sent: [], states: [],
    clearHandlers() { events.clear(); state = null; close = null; return this; },
    onState(fn) { state = fn; return this; },
    onClose(fn) { close = fn; return this; },
    onEvent(type, fn) {
      if (!events.has(type)) events.set(type, []);
      events.get(type).push(fn);
      return this;
    },
    sendEvent(type, data) { this.sent.push({ type, data }); return true; },
    sendState() { return true; },
    pump() { return true; },
    alive: () => true,
    peerToLocal: (t) => t,
    setTimeoutMs: (ms) => ms,
    stats: () => ({}),
    close() { const fn = close; close = null; if (fn) fn("local"); },
    feed(tick, wire, car, at = tick) {
      if (state) state(NetSnapshot.encodeSnapshot(tick, [{ id: wire, car }]), at);
    },
    deliver(type, data) { for (const fn of events.get(type) || []) fn(data); },
  };
}

const pose = (s, lap = 1) => ({ s, x: 0, head: 0, speed: 60, gear: 5, lap });

function hostWith2() {
  const G = stubG(3, 0); G.lapsTarget = 5;
  const net = NetPlay.create(G);
  const a = fakeSession(), b = fakeSession();
  const r = net.start({ role: "host", session: a,
    sessions: [{ id: "a", session: a, kind: "driver" }, { id: "b", session: b, kind: "driver" }],
    peers: [{ id: "a", kind: "driver" }, { id: "b", kind: "driver" }] });
  assert.equal(r.ok, true);
  return { G, net, a, b };
}

test("W5: a relayed LAP clamps the owner's lap to lapsTarget+1", () => {
  const { G, net, a, b } = hostWith2();
  const wireA = net.status().remotes[0].wire;
  a.feed(1000, wireA, pose(100), 1000);
  net.tick(1000);
  a.deliver("lap", { lap: 999, time: 90, code: G.cars[wireA].code, driverId: G.cars[wireA].driverId });
  const out = b.sent.filter((m) => m.type === "lap");
  assert.ok(out.length, "host relays the LAP to the other guest");
  assert.ok(out[0].data.lap <= G.lapsTarget + 1, "relayed lap " + out[0].data.lap + " is clamped");
  a.deliver("lap", { lap: -5, time: 90, code: G.cars[wireA].code, driverId: G.cars[wireA].driverId });
  assert.equal(b.sent.filter((m) => m.type === "lap").pop().data.lap, 0, "a negative lap clamps to 0");
});

test("#6544 row 5: a clock step clears the rivals' interpolation buffers", () => {
  const G = stubG(3, 1);
  const net = NetPlay.create(G);
  const s = fakeSession();
  let stepFn = null;
  s.onClockStep = function (fn) { stepFn = fn; return this; };
  assert.equal(net.start({ role: "guest", session: s }).ok, true);
  assert.equal(typeof stepFn, "function", "netplay subscribes to the session's clock step");
  s.feed(1000, 0, pose(50), 1000);
  net.tick(1000);
  const buffered = () => net.status().remotes.map((r) => r.buffered).reduce((x, y) => x + y, 0);
  assert.ok(buffered() > 0, "precondition: a pose is buffered");
  stepFn();
  assert.equal(buffered(), 0, "the step dropped poses stamped with the old offset");
});

test("W4: a host that was silent across two crossings resyncs the lap on goWire", () => {
  const { G, net, a } = hostWith2();
  const w = net.status().remotes[0].wire, car = G.cars[w];
  G.raceT = 10;
  a.feed(1000, w, pose(4900, 1), 1000);
  net.tick(1000);
  net.tick(1100);
  // silent for 2200 ms (> STALE_MS): the car goes to the local AI
  net.tick(3300);
  G.raceT = 400;   // 390 s of race clock: two 5000 m laps fit at 200 m/s
  assert.equal(car.human, false, "silent rival is the local AI's");
  a.feed(3300, w, pose(200, 3), 3300);
  for (let t = 3350; t <= 3600; t += 50) net.tick(t);
  assert.equal(car.lap, 3, "lap resynced to the wire's, not prev+1");
});

function silentThen(packets, spoof) {
  const { G, net, a } = hostWith2();
  const w = net.status().remotes[0].wire, car = G.cars[w];
  G.raceT = 10;
  a.feed(1000, w, pose(4900, 1), 1000);
  net.tick(1000); net.tick(1100);
  net.tick(3300);
  G.raceT = 400;
  for (const [at, p] of packets) a.feed(at, w, p, at);
  for (let t = 3350; t <= 3600; t += 50) net.tick(t);
  return { G, net, a, w, car, spoof };
}

test("W4: two packets before the tick keep the first gap (resync still happens)", () => {
  const { car } = silentThen([[3300, pose(200, 3)], [3310, pose(205, 3)]]);
  assert.equal(car.lap, 3);
});

test("W4: the resync allowance expires: a later lap jump with no crossing is refused", () => {
  const { G, net, a, w, car } = silentThen([[3300, pose(200, 1)]]);
  assert.equal(car.lap, 1);
  G.raceT = 420;   // past the 2 s window
  for (let t = 3650, i = 0; i < 6; i++, t += 50) { a.feed(t, w, pose(210 + i, 4), t); net.tick(t); }
  assert.ok(car.lap <= 2, "no multi-lap jump without a crossing, got " + car.lap);
});
