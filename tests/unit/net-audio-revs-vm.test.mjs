/* net-audio-revs-vm.test.mjs — VS FRIEND guest hears net-owned rivals at real pitch, not IDLE_RPM.
 * updateCar() returned for netPlay.owns(c) before c.rpm was set; poseRemote writes gear/speed only.
 * Run: node --test tests/unit/net-audio-revs-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame, settle } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
const { install } = require("./fake-audio-vm.cjs");

function fakeSession() {
  const h = new Map();
  let stateFn = null;
  return {
    clearHandlers() { h.clear(); stateFn = null; return this; },
    onState(fn) { stateFn = fn; return this; },
    onClose() { return this; },
    onEvent(t, fn) { (h.get(t) || h.set(t, []).get(t)).push(fn); return this; },
    sendEvent() { return true; },
    sendState() { return true; },
    pump() { return true; },
    alive: () => true,
    lagMs: () => 0,
    rtt: () => 0,
    synced: () => true,
    peerToLocal: (t) => t,
    localToPeer: (t) => t,
    stats: () => ({}),
    close() { return true; },
    deliverState(bytes, at) { if (stateFn) stateFn(bytes, at); },
  };
}

async function bootRaceNetGuest() {
  let fa = null;
  const g = await createGame({ carMeshes: false, onSandbox: (sb) => { fa = install(sb); } });
  const sb = g.sandbox;
  sb.dispatchEvent({ type: "pointerdown", pointerType: "mouse" });
  await settle(() => !sb.GameAudio._stub && !sb.AudioPanel._stub, 4000);
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  sb.GameAudio.init();
  await g.race("monza", "day", "dry");
  const G = g.G;
  const player = G.player;
  const s = fakeSession();
  const r = G.netPlay.start({ role: "guest", session: s });
  assert.equal(r.ok, true, "net guest session must start");
  return { g, sb, fa, G, player, s };
}

test("net-owned rivals at speed use rpmFor gear/speed, not makeCars IDLE_RPM", async () => {
  const { g, sb, G, player, s } = await bootRaceNetGuest();
  try {
    g.apex.setInput({ throttle: true, steer: 0 });
    g.step(60 * 8);
    const rival = G.cars.find((c) => c !== player && !c.retired);
    const wid = G.wireId;
    let now = 100000;
    for (let f = 0; f < 240; f++) {
      now += 1000 / 60;
      const truth = {
        s: G.wrapS(player.s + 8), x: player.x + 3, head: player.head,
        speed: player.speed, gear: player.gear, lap: Math.max(1, player.lap),
      };
      const entries = G.cars.map((c) => ({
        id: wid(c),
        car: c === rival ? truth : { s: G.wrapS(player.s - 600), x: 0, head: 0, speed: 70, gear: 7, lap: 1 },
      }));
      s.deliverState(sb.NetSnapshot.encodeSnapshot(Math.round(now), entries), now);
      G.netPlay.tick(now);
      g.step(1);
    }
    const PC = sb.PhysicsConsts;
    assert.equal(G.netPlay.owns(rival), true);
    assert.ok(rival.speed > 30, "rival must be moving fast");
    assert.notEqual(rival.rpm, PC.IDLE_RPM, "rival rpm must track speed, not idle");
    const idleFast = G.cars.filter((c) => c !== player && G.netPlay.owns(c) && c.speed > 30 && c.rpm === PC.IDLE_RPM);
    assert.equal(idleFast.length, 0, "no net-owned car >30 m/s may stay at IDLE_RPM");
    const voices = sb.GameAudio.rivalState().filter((v) => v.gain > 0.001);
    assert.ok(voices.length > 0, "rival engine voice must be audible");
    assert.ok(voices[0].hz > 200, "rival pitch must be race revs, not ~94 Hz idle");
  } finally { g.close(); }
});
