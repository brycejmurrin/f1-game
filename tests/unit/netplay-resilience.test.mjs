/* Rejoin and spectate contracts for the race connection layer.
 *
 * A rejoining driver reclaims the same wire/car after a hard transport close;
 * spectators share the host's connection fan-out but never consume a car seat
 * or publish authoritative state.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
globalThis.M4 = eval(src("js/core/mat4.js") + ";M4");
globalThis.NetSnapshot = eval(src("js/net/snapshot.js") + ";NetSnapshot");
globalThis.NetTransport = eval(src("js/net/transport.js") + ";NetTransport");
globalThis.NetSession = eval(src("js/net/session.js") + ";NetSession");
const spectatePath = path.join(ROOT, "js/net/spectate.js");
globalThis.NetSpectate = fs.existsSync(spectatePath)
  ? eval(fs.readFileSync(spectatePath, "utf8") + ";NetSpectate")
  : undefined;
const NetPlay = eval(src("js/net/netplay.js") + ";NetPlay");
globalThis.Tracks = { sample: (_track, _s, out) => { out.t[0] = 0; out.t[2] = 1; return out; } };

function stubG(n = 4, local = 0) {
  const cars = Array.from({ length: n }, (_, i) => ({
    idx: i, local: i === local, human: i === local, isPlayer: i === local,
    s: i * 10, x: 0, px: 0, pz: 0, speed: 0, head: 0, lap: 1,
    name: "D" + i, code: "D" + i, driverId: "drv" + i,
  }));
  return {
    cars, player: local >= 0 ? cars[local] : null,
    track: { total: 5000, n: 500, def: { id: "monza" } },
    lapsTarget: 3, raceT: 20, netNow: null, netStart: null, COUNTDOWN_S: 3,
    wireId: (car) => car.idx,
    setCarRole(car, human, isLocal) { car.human = human; car.local = isLocal; },
    worldFromTrack: (s, x) => ({ x, z: s }),
    announce() {},
  };
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

test("a dropped driver rejoins the live host over a fresh loopback and resyncs state", () => {
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
  assert.equal(host.active(), true, "the host race stays reconnectable when its last driver drops");
  assert.equal(guest.active(), false, "the dropped side leaves its old session");
  assert.equal(car.human, false, "AI covers the disconnected car");

  const secondWire = NetTransport.loopback({ latencyMs: 0 });
  const secondHost = NetSession.create({ transport: secondWire[0] });
  const secondGuest = NetSession.create({ transport: secondWire[1] });
  const joined = host.rejoin({ id: "driver-a", session: secondHost });
  assert.deepEqual(joined, { ok: true, wire });
  assert.equal(guest.start({ role: "guest", session: secondGuest }).ok, true);
  assert.equal(car.human, true);
  assert.equal(host.owns(car), true);
  for (let i = 0; i < 20; i++) { t += 25; host.tick(t); guest.tick(t); }
  guestG.player.s = 777;
  for (let i = 0; i < 12; i++) { t += 25; guest.tick(t); host.tick(t); }
  assert.ok(Math.abs(car.s - 777) < 1,
    "the returning owner's fresh snapshot replaces fallback AI state: " + car.s);
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
