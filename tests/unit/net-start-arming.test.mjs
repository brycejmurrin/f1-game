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
