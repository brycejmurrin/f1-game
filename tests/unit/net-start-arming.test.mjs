/* net-start-arming.test.mjs — the guest that reaches the grid FIRST, and the
 * pose a host relays between guests, over a real loopback wire.
 *
 * ARMED: the guest sent it once, from start(). While the host was still inside
 * `await G.startRace()` its LOBBY session kept pumping (qualifying needs it),
 * found no ARMED handler and dropped it. Nothing re-sent it, so the host named
 * the moment only on the 20 s ARM_WAIT backstop — measured 19-20 s against
 * 25 ms when the host started first (bug hunt 2026-09-22).
 *
 * RELAY: the host poses a guest's car from interp.sample(now), which is
 * delayMs old, and used to stamp it `now` in its own packet — so another
 * guest's predict() placed that car ~8 m behind at 80 m/s.
 *
 * Run: node --test tests/unit/net-start-arming.test.mjs   (npm run test:net-unit)
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
globalThis.M4 = eval(src("js/core/mat4.js") + ";M4");
globalThis.NetTransport = eval(src("js/net/transport.js") + ";NetTransport");
globalThis.NetSnapshot = eval(src("js/net/snapshot.js") + ";NetSnapshot");
globalThis.NetSession = eval(src("js/net/session.js") + ";NetSession");
globalThis.Tracks = { sample: (t, s, o) => { o.t = [0, 0, 1]; return o; } };
const NetPlay = eval(src("js/net/netplay.js") + ";NetPlay");

function stubG(n) {
  const car = (i, local) => ({ idx: i, local, human: local, isPlayer: local, s: i * 10, x: 0, px: 0, pz: 0,
    speed: 0, head: 0, lap: 0, mods: null, name: "D" + i, code: "D" + i, driverId: "drv" + i });
  const cars = [];
  for (let i = 0; i < n; i++) cars.push(car(i, i === 0));
  return {
    cars, player: cars[0], track: { total: 5000, n: 500 }, netStart: null, netNow: null,
    wireId: (c) => c.idx, setCarRole: (c, h, l) => { c.human = h; c.local = l; },
    announce() {}, applyCaution() {}, COUNTDOWN_S: 3,
    worldFromTrack: (s, x) => ({ x: s, y: 0, z: x, px: s, pz: x, head: 0 }), groundY: () => 0, trackAt: () => ({}),
  };
}

test("a guest whose circuit built first still gets the start named promptly", () => {
  const [ta, tb] = NetTransport.loopback({ latencyMs: 20 });
  const hs = NetSession.create({ transport: ta }), gs = NetSession.create({ transport: tb });
  hs.onEvent("hello", () => {});                  // the LOBBY's handlers: no ARMED among them
  let t = 0;
  for (let i = 0; i < 20; i++) { t += 25; hs.pump(t); gs.pump(t); }
  const Gg = stubG(2), ng = NetPlay.create(Gg);
  assert.equal(ng.start({ role: "guest", session: gs }).ok, true);
  // The host is still inside `await G.startRace()`: its lobby timer keeps pumping.
  for (let i = 0; i < 20; i++) { t += 25; hs.pump(t); ng.tick(t); }
  const Gh = stubG(2), nh = NetPlay.create(Gh);
  Gh.netNow = t;
  nh.start({ role: "host", session: hs, sessions: [{ id: 1, session: hs }], peers: [{ id: 1, profile: null }] });
  const h0 = t;
  nh.hostStart();
  let named = null;
  for (let i = 0; i < 1400 && named == null; i++) { t += 25; nh.tick(t); ng.tick(t); if (Gh.netStart) named = t; }
  assert.ok(named != null, "the host named the moment");
  assert.ok(named - h0 < 3000, `named ${named - h0} ms after hostStart — not the 20 s ARM_WAIT backstop`);
});

test("the snapshot interpolator reports the time it last posed", () => {
  const interp = NetSnapshot.createInterp({ delayMs: 100 });
  interp.push(1000, { s: 0, x: 0, lap: 1, speed: 80 });
  interp.push(1100, { s: 8, x: 0, lap: 1, speed: 80 });
  interp.sample(1200, {});
  assert.equal(interp.presentedAt(), 1100, "sample(now) poses now - delayMs, and a relay must stamp that time");
});

test("the host holds the grid 45 s for a guest that cannot arm yet, and says so (a split start was the 20 s alternative)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../js/net/netplay.js", import.meta.url), "utf8");
  assert.match(src, /const ARM_WAIT_MS = 45000;/);
  assert.match(src, /const HOLD_MAX_MS = ARM_WAIT_MS \+ 10000;/, "the guest's own backstop still outlasts the host's wait");
  assert.match(src, /G\.announce\("WAITING FOR RIVAL — "/);
});

test("the named moment lands at the SAME instant on a guest whose clock is 5 s off the host's", () => {
  // rtc-sync-probe 2026-09-28: the guest went green 3.3 s before the host —
  // exactly the two pages' clock offset. START went out pre-converted to the
  // guest's clock (localToPeer) and armStart converted it AGAIN (peerToLocal).
  // Loopback peers share one clock, so no spec saw it. Here the guest's clock
  // runs SKEW ahead of the host's: each side pumps with its own time, the
  // sessions measure the offset from PING/PONG, and the instant must agree.
  const SKEW = 5000;
  const [ta, tb] = NetTransport.loopback({ latencyMs: 20 });
  const hs = NetSession.create({ transport: ta }), gs = NetSession.create({ transport: tb });
  let t = 1000;
  const pump = () => { t += 25; hs.pump(t); gs.pump(t + SKEW); };
  for (let i = 0; i < 40; i++) pump();
  assert.ok(hs.synced() && gs.synced(), "both clocks synced over the loopback");
  assert.ok(Math.abs(hs.offset() - SKEW) < 30, `host sees the guest ${hs.offset()} ms ahead`);
  const Gh = stubG(2), nh = NetPlay.create(Gh);
  const Gg = stubG(2), ng = NetPlay.create(Gg);
  assert.equal(ng.start({ role: "guest", session: gs }).ok, true);
  nh.start({ role: "host", session: hs, sessions: [{ id: 1, session: hs }], peers: [{ id: 1, profile: null }] });
  Gh.netNow = t; Gg.netNow = t + SKEW;
  nh.hostStart();
  for (let i = 0; i < 200 && !(Gh.netStart && Gg.netStart); i++) {
    pump(); Gh.netNow = t; Gg.netNow = t + SKEW;
    nh.tick(t); ng.tick(t + SKEW);
  }
  assert.ok(Gh.netStart && Gg.netStart, "both sides hold a start");
  // The same physical instant: the guest's `at` is the host's `at` plus the skew.
  const err = Gg.netStart.at - (Gh.netStart.at + SKEW);
  assert.ok(Math.abs(err) < 40, `guest at − (host at + skew) = ${err} ms (was −${SKEW} with the double conversion)`);
  assert.equal(Gg.netStart.hold, Gh.netStart.hold, "one hold for both");
});
