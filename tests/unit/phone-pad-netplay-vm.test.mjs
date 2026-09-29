/* phone-pad-netplay-vm.test.mjs — PHONE AS CONTROLLER inside a MULTIPLAYER race.
 *
 * The phone and VS FRIEND ride the same WebRTC stack, so the question the owner
 * asked (2026-09-29: "make sure phone as controller still works with multi
 * player") is whether two live wires in one page stay independent, and whether
 * the phone still drives the LOCAL car once a netplay session owns the grid.
 * The REAL js/game.js boots in the Node VM (tools/lib/game-vm.cjs, which loads
 * js/net at boot); the netplay far end is __apex.netLoopback() — the multiplayer
 * specs' own — and the phone is PhonePad.padSession ↔ PhonePad.link over a
 * second NetTransport.loopback() pair, the exact calls a paired phone makes.
 *
 * Measured live the same day over REAL WebRTC (two Chromium pages, the codes
 * couriered by hand): throttle 18 → 28 m/s and full lock both ways inside the
 * session, the menu pad walking the title into the VS FRIEND lobby, PAUSE both
 * ways, and the phone link surviving netStop(). This file keeps the parts a VM
 * can hold.
 *
 * Run: node --test tests/unit/phone-pad-netplay-vm.test.mjs   (one boot, ~10 s)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g, S, A, mp, w, T0;

// The phone: a padSession on one end of a loopback pair, PhonePad.link on the
// other feeding the game's REAL Input — sampled, pumped, delivered each frame.
function phoneWire() {
  const now = () => S.performance.now();
  const [padEnd, hostEnd] = S.NetTransport.loopback({ latencyMs: 0, rnd: S.NetTransport.seededRnd(5) });
  padEnd.pump(now()); hostEnd.pump(now());
  const phone = { roll: 0, thr: 0, brk: 0, held: 0 };
  const session = S.PhonePad.padSession(padEnd, {
    roll: () => phone.roll, thr: () => phone.thr, brk: () => phone.brk, held: () => phone.held,
  }, { now, heartbeat: false });
  const link = S.PhonePad.link(hostEnd, { input: S.Input, pump: false, now, hud: () => null });
  const deliver = () => { session.sample(true); session.pump(); link.pump(); };
  return { phone, session, link, deliver, padEnd, hostEnd };
}

// n physics frames with the phone delivering before each, the session ticking after.
function drive(n) {
  const p0 = A.physState();
  for (let i = 0; i < n; i++) {
    w.deliver();
    A.step(1 / 60, 1);
    if (A.net().active) A.netTick(T0 + i * 16);
  }
  return { v0: p0.speed, v1: A.physState().speed, steer: S.Input.steer() };
}

before(async () => {
  g = await createGame({ track: "monza" });
  S = g.sandbox; A = g.apex;
  A.clearInput();                                   // live Input, not a test override
  T0 = S.performance.now();
  mp = A.netLoopback({ nowMs: T0, latencyMs: 0, interpDelayMs: 0 });
  w = phoneWire();
});
after(() => { if (g) g.close(); });

test("the net stack and the phone module load together, and a netplay session starts", () => {
  assert.equal(typeof S.PhonePad, "object", "PhonePad rides the same lazy net bundle");
  assert.equal(typeof S.NetTransport, "object");
  assert.ok(mp && mp.ok, "netLoopback started a session");
  assert.equal(A.net().active, true);
  assert.equal(A.carRoles().filter((r) => r.human).length, 2, "two humans on the grid: this page's and the peer's");
});

test("inside the session the phone's throttle drives the LOCAL car, and the rival stays network-owned", () => {
  // Reset AFTER the session starts: its start re-seats the local car.
  A.reset(0.05, 20, 0, 1);
  w.phone.thr = 1;
  const rival0 = A.carAt(mp.remoteId).s;
  const on = drive(90);
  assert.equal(S.Input.remoteActive(), true, "the phone is the live source");
  assert.ok(on.v1 > on.v0 + 3, `GAS accelerates: ${on.v0.toFixed(1)} → ${on.v1.toFixed(1)} m/s`);
  // Control: the same reset with the pedal up coasts — the throttle, not the reset, made the speed.
  A.reset(0.05, 20, 0, 1);
  w.phone.thr = 0;
  const off = drive(90);
  assert.ok(off.v1 < on.v1 - 5, `coasting ${off.v1.toFixed(1)} vs GAS ${on.v1.toFixed(1)} m/s`);
  assert.ok(Math.abs(A.carAt(mp.remoteId).s - rival0) < 0.01, "the rival, sent nothing, did not move: the phone never touches it");
  assert.equal(A.net().active, true, "the session is still up");
});

test("inside the session the phone's tilt is the steer the game reads", () => {
  A.reset(0.05, 20, 0, 1);
  w.phone.thr = 1; w.phone.roll = 25;
  const right = drive(60);
  assert.equal(S.Input.remoteSteers(), true);
  assert.ok(right.steer > 0.9, `25° right reads ${right.steer}`);
  w.phone.roll = -25;
  const left = drive(60);
  assert.ok(left.steer < -0.3, `25° left reads ${left.steer}`);
  w.phone.roll = 0;
});

test("two wires, no crosstalk: phone edges reach Input once, the session's traffic never reaches the phone link", () => {
  const ev0 = A.net().events, st0 = w.link.stats();
  w.session.event("shiftUp");
  w.deliver();
  assert.equal(S.Input.consumeShiftUp(), true, "the paddle edge arrived");
  assert.equal(S.Input.consumeShiftUp(), false, "exactly once");
  assert.equal(A.net().events, ev0, "a phone edge is not a netplay event");
  A.netPeerSend({ s: A.info().total * 0.42, x: 2.5, speed: 0 }, T0 + 5000);
  A.netTick(T0 + 5000);
  w.deliver();
  const st1 = w.link.stats();
  assert.equal(st1.junk, st0.junk, "peer state never lands on the phone link");
  assert.equal(st1.stale, 0);
});

test("stopping the session leaves the phone driving; dropping the phone leaves the session up", () => {
  A.netStop();
  assert.equal(A.net().active, false);
  assert.equal(w.link.stats().open, true, "the phone link outlives the netplay session");
  A.reset(0.05, 20, 0, 1);
  w.phone.thr = 1;
  const r = drive(60);
  assert.ok(r.v1 > r.v0 + 2, `still driving after netStop: ${r.v0.toFixed(1)} → ${r.v1.toFixed(1)} m/s`);
  // The other way round: a fresh session, then the PHONE goes.
  T0 = S.performance.now();
  const mp2 = A.netLoopback({ nowMs: T0, latencyMs: 0, interpDelayMs: 0 });
  assert.ok(mp2.ok);
  w.hostEnd.close();
  w.link.pump();
  assert.equal(S.Input.remoteActive(), false, "pedals off the moment the phone link closes");
  assert.equal(A.net().active, true, "and the multiplayer session is untouched");
  A.netStop();
});
