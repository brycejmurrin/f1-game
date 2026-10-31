/* net-snapshot.test.mjs — the wire format and the interpolation buffer.
 *
 * These are the two places multiplayer fails SILENTLY. A codec that loses a
 * bit produces a car slightly in the wrong place, not an exception.
 *
 * There is no input codec to test: under distributed authority nobody ever
 * simulates anybody else's car, so nothing needs anybody else's inputs. An
 * interpolator that mishandles the lap wrap sends a rival sprinting backwards
 * down the circuit once per lap, which looks like a physics bug and gets
 * debugged in entirely the wrong file. So both get pinned here, in a suite
 * that runs in milliseconds.
 *
 * Run: node --test tests/unit/net-snapshot.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// A strict-mode direct eval keeps its own declarations to itself, so each file
// is loaded separately and the shared math island is published on globalThis —
// snapshot.js binds M4.clamp/M4.wrapDelta at eval, exactly as the shell does.
seedLogGlobal();   // snapshot.js logs dropped packets through Log
globalThis.M4 = eval(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8") + ";M4");
globalThis.NetInterp = eval(fs.readFileSync(path.join(ROOT, "js/net/interp.js"), "utf8") + ";NetInterp");
const NetSnapshot = eval(
  fs.readFileSync(path.join(ROOT, "js/net/snapshot.js"), "utf8") + ";NetSnapshot");

const TAU = Math.PI * 2;
const car = (o) => Object.assign({
  s: 0, x: 0, head: 0, speed: 0, gear: 1, lap: 0,
  deploying: false, offroad: false, onKerb: false, braking: false,
}, o);

// ---------------------------------------------------------------------------
// Snapshot codec
// ---------------------------------------------------------------------------

test("a car round-trips within the stated quantisation", () => {
  const src = car({ s: 4213.37, x: -3.62, head: 2.1, speed: 82.4, gear: 7, lap: 12,
                    deploying: true, onKerb: true });
  const bytes = NetSnapshot.encodeSnapshot(99, [{ id: 5, car: src }]);
  const out = NetSnapshot.decodeSnapshot(bytes);

  assert.equal(out.tick, 99);
  assert.equal(out.cars.length, 1);
  const c = out.cars[0];
  assert.equal(c.id, 5);
  // 1 cm of position, 1 cm/s of speed, ~0.006 deg of heading.
  assert.ok(Math.abs(c.s - src.s) <= 0.01, `s off by ${Math.abs(c.s - src.s)}`);
  assert.ok(Math.abs(c.x - src.x) <= 0.01);
  assert.ok(Math.abs(c.speed - src.speed) <= 0.01);
  assert.ok(Math.abs(c.head - src.head) <= 0.0002);
  assert.equal(c.gear, 7);
  assert.equal(c.lap, 12);
  assert.equal(c.deploying, true);
  assert.equal(c.onKerb, true);
  assert.equal(c.offroad, false);
  assert.equal(c.braking, false);
});

test("the packet is 13 bytes per car", () => {
  // Not a micro-optimisation — it is what makes a 20 Hz full-grid broadcast
  // cost ~5 KB/s, i.e. a non-issue. If this grows, check it was on purpose.
  const one = NetSnapshot.encodeSnapshot(1, [{ id: 0, car: car({}) }]);
  const two = NetSnapshot.encodeSnapshot(1, [{ id: 0, car: car({}) }, { id: 1, car: car({}) }]);
  assert.equal(two.length - one.length, NetSnapshot.CAR_BYTES);
  assert.equal(NetSnapshot.CAR_BYTES, 13);
  assert.equal(two.length, 6 + 2 * 13);
});

test("reverse speed survives the wire", () => {
  // speed is SIGNED on purpose: the game lets a stopped car crawl backwards
  // off a wall, and an unsigned field would send it forwards at 650 m/s.
  const bytes = NetSnapshot.encodeSnapshot(1, [{ id: 0, car: car({ speed: -2.5 }) }]);
  assert.ok(Math.abs(NetSnapshot.decodeSnapshot(bytes).cars[0].speed + 2.5) <= 0.01);
});

test("a full 22-car grid still fits comfortably", () => {
  const entries = [];
  for (let i = 0; i < 22; i++) entries.push({ id: i, car: car({ s: i * 100, speed: 80 }) });
  const bytes = NetSnapshot.encodeSnapshot(1234, entries);
  assert.equal(bytes.length, 6 + 22 * 13);
  const out = NetSnapshot.decodeSnapshot(bytes);
  assert.equal(out.cars.length, 22);
  assert.equal(out.cars[21].id, 21);
  // 20 Hz of this is ~5.3 KB/s.
  assert.ok(bytes.length * 20 < 7000);
});

test("negative wire ids are omitted so the count byte matches", () => {
  const bytes = NetSnapshot.encodeSnapshot(1, [
    { id: -1, car: car({}) },
    { id: 3, car: car({ s: 10 }) },
    { id: -2, car: car({}) },
  ]);
  const out = NetSnapshot.decodeSnapshot(bytes);
  assert.equal(out.cars.length, 1);
  assert.equal(out.cars[0].id, 3);
  assert.equal(bytes[5], 1);
});

test("non-integer and out-of-range ids never fold onto wire id 0", () => {
  // `null >= 0` and `false >= 0` are true in JS; then `id & 0xff` maps them
  // (and 256) onto 0, colliding remotes on the host relay / interp map.
  const bytes = NetSnapshot.encodeSnapshot(1, [
    { id: null, car: car({ s: 100 }) },
    { id: false, car: car({ s: 101 }) },
    { id: "3", car: car({ s: 102 }) },
    { id: 1.5, car: car({ s: 103 }) },
    { id: 256, car: car({ s: 104 }) },
    { id: 0, car: car({ s: 200 }) },
    { id: 7, car: car({ s: 300 }) },
  ]);
  const out = NetSnapshot.decodeSnapshot(bytes);
  assert.equal(out.cars.length, 2);
  assert.deepEqual(out.cars.map((c) => [c.id, Math.round(c.s)]), [[0, 200], [7, 300]]);
  assert.equal(bytes[5], 2);

  const aged = NetSnapshot.encodeAged([
    { id: null, at: 10, car: car({ s: 1 }) },
    { id: 2, at: 20, car: car({ s: 2 }) },
  ]);
  const agedOut = NetSnapshot.decodeSnapshot(aged);
  assert.equal(agedOut.cars.length, 1);
  assert.equal(agedOut.cars[0].id, 2);
});

test("a truncated packet decodes to nothing rather than a garbage car", () => {
  const bytes = NetSnapshot.encodeSnapshot(1, [{ id: 0, car: car({ s: 500 }) }]);
  assert.equal(NetSnapshot.decodeSnapshot(bytes.slice(0, bytes.length - 4)), null);
  assert.equal(NetSnapshot.decodeSnapshot(new Uint8Array(2)), null);
  assert.equal(NetSnapshot.decodeSnapshot(null), null);
});

// ---------------------------------------------------------------------------
// Interpolation buffer
// ---------------------------------------------------------------------------

const TOTAL = 5000;   // a 5 km circuit

test("interpolation and prediction keep exact arc/lap wrapping with scratch output and packet extensions", () => {
  const split = (raw) => { const laps = Math.floor(raw / TOTAL); return { s: raw - laps * TOTAL, laps }; };
  for (const [a, b] of [[4990, 10], [10, 4990], [0, 0], [2500, 0]]) {
    const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0 });
    buf.push(1000, car({ s: a, lap: 3, extension: "first" }));
    buf.push(1100, car({ s: b, lap: 4, extension: "second" }));
    const out = {};
    for (const u of [0.01, 0.25, 0.5, 0.75, 0.99]) {
      const expected = split(a + M4.wrapDelta(b - a, TOTAL) * u);
      assert.equal(buf.sample(1000 + 100 * u, out), out);
      assert.equal(out.s, expected.s);
      assert.equal(out.lap, 3 + expected.laps);
      assert.equal(out.extension, u < 0.5 ? "first" : "second");
    }
  }
  for (const s of [0, 2, 4998]) for (const speed of [-100, 0, 100]) for (const lap of [3, undefined]) {
    const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0, maxExtrapMs: 250 });
    buf.push(1000, car({ s, speed, lap, extension: "retained" }));
    const out = {}, expected = split(s + speed * 0.25);
    assert.equal(buf.predict(1500, out), out);
    assert.equal(out.s, expected.s);
    assert.equal(out.lap, Number.isFinite(lap) ? lap + expected.laps : lap);
    assert.equal(out.extension, "retained");
    assert.equal(out.extrapolated, true);
  }
});

test("a car is drawn between the two packets bracketing the delayed present", () => {
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 100 });
  buf.push(1000, car({ s: 100, x: 0, speed: 50 }));
  buf.push(1100, car({ s: 150, x: 2, speed: 50 }));
  // now = 1200 => target = 1100... step back to land mid-way between packets.
  const mid = buf.sample(1150);   // target 1050, halfway
  assert.ok(Math.abs(mid.s - 125) < 0.001, `expected s=125, got ${mid.s}`);
  assert.ok(Math.abs(mid.x - 1) < 0.001);
  assert.equal(mid.extrapolated, false);
});

test("s interpolation takes the short way round the start/finish line", () => {
  // THE bug this file exists for. Without wrap handling, a car crossing the
  // line appears to drive the entire lap backwards, once per lap.
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0 });
  buf.push(0, car({ s: TOTAL - 50, speed: 100 }));
  buf.push(100, car({ s: 50, speed: 100 }));      // wrapped past the line
  const mid = buf.sample(50);
  // Halfway between 4950 and 50 the short way is exactly the line itself.
  assert.ok(mid.s > TOTAL - 5 || mid.s < 5, `should be near the line, got ${mid.s}`);
});

test("heading interpolation takes the short way round too", () => {
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0 });
  buf.push(0, car({ head: 0.1 }));
  buf.push(100, car({ head: TAU - 0.1 }));        // just the other side of 0
  const mid = buf.sample(50);
  const nearZero = Math.min(mid.head, TAU - mid.head);
  assert.ok(nearZero < 0.02, `should pass through 0, got ${mid.head}`);
});

test("a late packet extrapolates ALONG THE ROAD, and gives up after a bound", () => {
  // Extrapolating in (s, x) cannot put a car through a barrier — it follows
  // the centreline by construction. But a guess still goes stale.
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0, maxExtrapMs: 250 });
  buf.push(0, car({ s: 1000, x: 1.5, speed: 100 }));

  const at100 = buf.sample(100);
  assert.equal(at100.extrapolated, true);
  assert.ok(Math.abs(at100.s - 1010) < 0.001, `100 m/s for 0.1 s = +10 m, got ${at100.s}`);
  assert.equal(at100.x, 1.5, "lateral offset must NOT be extrapolated");

  // Capped: 2 s of silence must not fling the car 200 m up the road.
  const at2s = buf.sample(2000);
  assert.ok(Math.abs(at2s.s - 1025) < 0.001, `should cap at 250 ms (+25 m), got ${at2s.s}`);
});

test("a multi-second dropout snaps to the new pose instead of lerping across the hole", () => {
  // #3288: after ~STALE_MS of silence the next pose must not blend against the
  // pre-gap sample still sitting in the ring — that draws the car part-way back
  // along the hole. maxExtrapMs only bounds past the newest sample.
  assert.equal(NetSnapshot.MAX_INTERP_GAP_MS, 500);
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0 });
  buf.push(1000, car({ s: 100, x: 0, head: 0, speed: 50 }));
  buf.push(3000, car({ s: 300, x: 4, head: 1, speed: 50 }));   // 2 s gap > STALE_MS-ish
  const mid = buf.sample(2000);                                 // target mid-gap
  assert.ok(Math.abs(mid.s - 300) < 0.001, `expected snap to s=300, got ${mid.s}`);
  assert.equal(mid.x, 4);
  assert.equal(mid.head, 1);
  assert.equal(mid.extrapolated, false);
  // An honest publish interval still blends.
  const ok = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0 });
  ok.push(1000, car({ s: 100, x: 0, speed: 50 }));
  ok.push(1100, car({ s: 150, x: 2, speed: 50 }));
  const half = ok.sample(1050);
  assert.ok(Math.abs(half.s - 125) < 0.001, `100 ms span must still blend, got ${half.s}`);
  assert.ok(Math.abs(half.x - 1) < 0.001);
});

test("extrapolation wraps at the line rather than running past the track length", () => {
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0 });
  buf.push(0, car({ s: TOTAL - 10, speed: 100 }));
  const out = buf.sample(200);                     // +20 m, past the line
  assert.ok(out.s >= 0 && out.s < TOTAL, `s must stay on the track, got ${out.s}`);
  assert.ok(Math.abs(out.s - 10) < 0.001, `expected to wrap to ~10, got ${out.s}`);
});

test("out-of-order and duplicate packets are handled, not trusted", () => {
  // The state channel is unordered and lossy BY DESIGN, so arrival order
  // means nothing and the same packet may show up twice.
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0 });
  buf.push(200, car({ s: 300 }));
  buf.push(0, car({ s: 100 }));                    // arrives late, belongs first
  buf.push(100, car({ s: 200 }));                  // slots into the middle
  assert.equal(buf.size(), 3);
  assert.equal(buf.oldest().s, 100);
  assert.equal(buf.newest().s, 300);
  assert.ok(Math.abs(buf.sample(100).s - 200) < 0.001, "must have re-sorted by tick");

  assert.equal(buf.push(100, car({ s: 999 })), false, "duplicate tick should be refused");
  assert.equal(buf.size(), 3);
});

test("interpolation unwraps uint32 wire ticks across the long-session rollover", () => {
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0 });
  const before = 0xFFFFFFFF - 40;
  assert.equal(buf.push(before, car({ s: 100, speed: 50 })), true);
  // The wire carries this as 24 after performance.now() wraps.  Keep it after
  // `before`, rather than inserting it at the front of the ring.
  assert.equal(buf.push(24, car({ s: 110, speed: 50 })), true);
  const state = buf.sample(0x100000000 + 24);
  assert.ok(state, "post-wrap target should resolve a sample");
  assert.equal(state.s, 110);
  assert.equal(buf.push(24, car({ s: 999 })), false, "same raw tick remains a duplicate");
});

test("decoded rollover ticks use the arrival clock epoch for adaptive delay", () => {
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0, adaptive: true });
  const arrival = 0x100000000 + 120;
  assert.equal(buf.push(0xFFFFFFFF - 20, car({ s: 100, speed: 50 }), arrival - 100), true);
  assert.equal(buf.push(80, car({ s: 120, speed: 50 }), arrival), true);
  const state = buf.sample(arrival);
  assert.ok(state && state.s >= 120, "arrival-domain target should not fall behind the wrapped packet");
});

test("predict() leads sample() by exactly the interpolation delay", () => {
  // Contact must NOT be resolved against the drawn pose: sample() is
  // deliberately delayMs in the past, so a rival you are side by side with is
  // drawn a car length behind where they are. predict() is the same read
  // without the delay. This was exported but never implemented — anything that
  // called it threw — which is why it is pinned here.
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 100 });
  buf.push(1000, car({ s: 100, speed: 50 }));
  buf.push(1200, car({ s: 110, speed: 50 }));
  // At now=1200: sample targets 1100 (mid-way, s=105); predict targets 1200.
  assert.ok(Math.abs(buf.sample(1200).s - 105) < 0.001);
  assert.ok(Math.abs(buf.predict(1200).s - 110) < 0.001);
  assert.ok(buf.predict(1200).s > buf.sample(1200).s, "predict must LEAD sample");
});

test("a far-future tick is refused: it cannot pin newest or freeze the adaptive delay", () => {
  // Bug hunt 2026-09-27: one packet stamped hours ahead stuck as the newest
  // sample forever and pinned lastTick, so no honest packet ever updated the
  // jitter/delay estimate again and the rival froze on extrapolation.
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 100, adaptive: true });
  buf.push(1000, car({ s: 100, speed: 50 }), 1030);
  assert.equal(buf.push(1000 + 3600e3, car({ s: 999, speed: 50 }), 1040), false,
    "a tick an hour ahead of arrival must be refused");
  assert.equal(buf.push(1000 + NetSnapshot.MAX_AHEAD_MS + 50, car({ s: 998 }), 1045), false,
    "just past the cap is refused too");
  assert.equal(buf.newest().s, 100, "the refused tick never became the newest sample");
  // Honest packets with jittery arrival still drive the adaptive delay.
  const d0 = buf.timing().delayMs;
  for (let i = 1; i <= 20; i++) assert.equal(buf.push(1000 + i * 50, car({ s: 100 + i }), 1030 + i * 50 + (i % 2) * 40), true);
  assert.ok(buf.timing().delayMs > d0, "the delay still adapts after the bad packet");
  assert.equal(buf.newest().s, 120);
  // A modest lead (clock-offset error) is still accepted, and no arrival = no check.
  assert.equal(buf.push(3000, car({ s: 130 }), 1500), true);
  assert.equal(buf.push(1e9, car({ s: 131 })), true, "without an arrival time there is nothing to compare");
});

test("an empty buffer reports nothing rather than inventing a car", () => {
  const buf = NetSnapshot.createInterp({ total: TOTAL });
  assert.equal(buf.sample(0), null);
  assert.equal(buf.newest(), null);
});

test("the buffer is bounded, so a long session cannot grow it without limit", () => {
  const buf = NetSnapshot.createInterp({ total: TOTAL, keep: 8 });
  for (let i = 0; i < 200; i++) buf.push(i * 50, car({ s: i }));
  assert.equal(buf.size(), 8);
  assert.equal(buf.newest().s, 199, "the newest must always be kept");
});

test("discrete fields step instead of blending", () => {
  // Half a gear is not a thing, and a half-set kerb flag would flicker the
  // rumble on a rival's car. NOTE lap is deliberately NOT asserted here — it is
  // not a free-stepping discrete field, it is the high half of (lap, s) and can
  // only move when s crosses the line. The tests below own that.
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0 });
  buf.push(0, car({ gear: 3, onKerb: false }));
  buf.push(100, car({ gear: 4, onKerb: true }));
  const early = buf.sample(20), late = buf.sample(80);
  assert.equal(early.gear, 3);
  assert.equal(early.onKerb, false);
  assert.equal(late.gear, 4);
  assert.equal(late.onKerb, true);
});

// ---- lap and s cross the line TOGETHER ------------------------------------
// The gap that let a real bug through: one test above wraps s with lap held
// constant, another stepped lap with no wrap — never both at once, which is the
// only case where the two can disagree. netplay reconstructs race position as
// prog = lap*total + s, so a pair that disagrees puts the rival a whole lap out;
// the +1 case briefly ranks them leader and rubber-bands the entire AI field.
const progOf = (st) => st.lap * TOTAL + st.s;

test("prog is monotonic across the start/finish line (blend, both halves)", () => {
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0 });
  buf.push(0, car({ s: TOTAL - 50, lap: 3, speed: 100 }));
  buf.push(100, car({ s: 50, lap: 4, speed: 100 }));   // crossed at u = 0.5
  let prev = progOf(buf.sample(0));
  // Walk the whole interval, including u < 0.5 and u > 0.5 (the old code took
  // lap from whichever sample was nearer, so both halves were wrong in turn).
  for (let t = 5; t <= 100; t += 5) {
    const st = buf.sample(t);
    const prog = progOf(st);
    assert.ok(prog >= prev - 1e-6, `prog went backwards at t=${t}: ${prev} -> ${prog}`);
    assert.ok(prog - prev < TOTAL / 2, `prog jumped a lap at t=${t}: ${prev} -> ${prog}`);
    assert.ok(st.s >= 0 && st.s < TOTAL, `s out of range at t=${t}: ${st.s}`);
    prev = prog;
  }
  // And it lands exactly on the newer packet's own progress.
  assert.ok(Math.abs(progOf(buf.sample(100)) - (4 * TOTAL + 50)) < 1e-6);
});

test("a car reversing back over the line loses a lap rather than gaining one", () => {
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0 });
  buf.push(0, car({ s: 50, lap: 4, speed: -100 }));
  buf.push(100, car({ s: TOTAL - 50, lap: 3, speed: -100 }));
  // At exactly halfway the car sits ON the line (s = 0), which belongs to the
  // higher lap — so step just past it to see the crossing itself.
  assert.equal(buf.sample(50).lap, 4, "s = 0 is still the lap it completed");
  const past = buf.sample(60);
  assert.equal(past.lap, 3, "lap must step DOWN with the backward crossing");
  assert.ok(past.s > TOTAL - 20, `should be just before the line, got ${past.s}`);
  assert.ok(progOf(past) < progOf(buf.sample(50)), "prog must fall while reversing");
});

test("extrapolating across the line carries the lap with it", () => {
  // advance() wrapped s and never touched lap, so a packet gap over the line
  // showed the rival a full lap behind for up to maxExtrapMs.
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0, maxExtrapMs: 250 });
  buf.push(0, car({ s: TOTAL - 10, lap: 2, speed: 100 }));
  const before = buf.sample(50);     // 5 m on: still 5 m short of the line
  assert.equal(before.lap, 2);
  const after = buf.sample(200);     // 20 m on: 10 m past the line
  assert.equal(after.lap, 3, "lap must step with the wrap");
  assert.ok(after.s >= 0 && after.s < TOTAL);
  assert.ok(progOf(after) > progOf(before), "extrapolated prog must keep rising");
});

test("a state with no lap field is left alone by both movers", () => {
  // The buffer carries whatever the packet had; a caller that never sends lap
  // must not suddenly grow a NaN one.
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0 });
  buf.push(0, { s: TOTAL - 50, x: 0, head: 0, speed: 100 });
  buf.push(100, { s: 50, x: 0, head: 0, speed: 100 });
  assert.equal(buf.sample(50).lap, undefined);
  assert.equal(buf.sample(500).lap, undefined);   // extrapolated
});

// ---------------------------------------------------------------------------
// Brake-aware extrapolation — F_BRAKE was decoded and thrown away
// ---------------------------------------------------------------------------
/* `braking` rides in every packet (F_BRAKE) and was decoded into the view, and
 * then nothing read it: advance() moved s at a flat st.speed. A car standing on
 * the brakes was predicted to keep coming at the speed it had when the packet
 * left. And predict() extrapolates by delayMs on EVERY frame — not only during
 * a stall — so the follower's predicted contact pose overshot continuously.
 * That is the last-millisecond-brake asymmetry documented in real P2P racing
 * netcode, and here it feeds the contact solver as c._nSpd / c._nProg.
 *
 * The rate is OBSERVED from the last two packets rather than taken from a
 * constant: a literal would be a second copy of BRAKE to keep in step with the
 * physics and re-derive against PACE, which is the coupling aStd exists to
 * prevent. The wire already carries it, correctly scaled, for free.
 */
const TOT = 5000;

test("a car that is not braking extrapolates exactly as it always did", () => {
  // The safety half: the flag gates everything, so an unbraked field is
  // bit-identical to before this existed.
  const buf = NetSnapshot.createInterp({ total: TOT, delayMs: 0 });
  buf.push(1000, car({ s: 100, speed: 50, braking: false }));
  buf.push(1100, car({ s: 105, speed: 40, braking: false }));   // a real dip, flag off
  const o = buf.sample(1200);
  assert.equal(o.extrapolated, true);
  assert.equal(o.s, 105 + 40 * 0.1, "no flag, no deceleration — flat speed as before");
  assert.equal(o.speed, 40);
});

test("a braking car is predicted short of where flat speed would put it", () => {
  const buf = NetSnapshot.createInterp({ total: TOT, delayMs: 0 });
  buf.push(1000, car({ s: 100, speed: 50, braking: true }));
  buf.push(1100, car({ s: 104.5, speed: 48, braking: true }));  // 20 m/s^2 observed
  const flat = 104.5 + 48 * 0.1;
  const o = buf.sample(1200);
  assert.ok(o.s < flat, `braking must fall short of the flat ${flat}, got ${o.s}`);
  // 20 m/s^2 over 100 ms: 48*0.1 - 0.5*20*0.01 = 4.8 - 0.1 = 4.7
  assert.ok(Math.abs(o.s - (104.5 + 4.7)) < 1e-9, `expected 109.2, got ${o.s}`);
  // ...and the speed agrees with the pose, because they are one claim.
  assert.ok(Math.abs(o.speed - 46) < 1e-9, `speed should be 46, got ${o.speed}`);
});

test("the prediction never runs past a stop, or past the slow-down cap", () => {
  // A jittery pair of packets can imply an absurd rate. Two clamps bound it:
  // the car never reverses, and extrapolation may not shave more than the
  // stated share of its speed however hard the wire says it braked.
  const buf = NetSnapshot.createInterp({ total: TOT, delayMs: 0, maxExtrapMs: 1000 });
  buf.push(1000, car({ s: 100, speed: 30, braking: true }));
  buf.push(1010, car({ s: 100.2, speed: 20, braking: true }));  // 1000 m/s^2 — nonsense
  const o = buf.sample(1500);
  assert.ok(o.speed >= 0, "never negative");
  assert.ok(o.speed >= 20 * (1 - 0.35) - 1e-9, `capped at a third off, got ${o.speed}`);
  assert.ok(o.s > 100.2, "still moves forward");
  assert.ok(o.s < 100.2 + 20 * 0.5, "but less far than flat speed would take it");
});

test("one sample cannot imply a rate, and falls back to flat speed", () => {
  // Guard the guard: with nothing to difference against, the braking flag must
  // change nothing rather than invent a deceleration.
  const buf = NetSnapshot.createInterp({ total: TOT, delayMs: 0 });
  buf.push(1000, car({ s: 100, speed: 50, braking: true }));
  const o = buf.sample(1100);
  assert.equal(o.s, 100 + 50 * 0.1);
  assert.equal(o.speed, 50);
});

test("a car that is speeding up while flagged braking is not accelerated further", () => {
  // Only a positive observed deceleration counts; a negative one (speed rising)
  // must not turn into free forward speed.
  const buf = NetSnapshot.createInterp({ total: TOT, delayMs: 0 });
  buf.push(1000, car({ s: 100, speed: 40, braking: true }));
  buf.push(1100, car({ s: 104, speed: 45, braking: true }));
  const o = buf.sample(1200);
  assert.equal(o.s, 104 + 45 * 0.1, "no negative deceleration");
  assert.equal(o.speed, 45);
});

test("the adaptive delay follows one-way LATENCY, so a slow link interpolates instead of extrapolating every frame", () => {
  // Bug hunt 2026-09-28: the delay tracked jitter only, capped at 180 ms.
  // sample() aims at now − delayMs on the synced clock, so on a link slower
  // than the delay one way (or through the host RELAY, whose stamp is already
  // a delay old) every frame was past the newest packet: x, heading and speed
  // frozen between packets, the rival stepping sideways at the publish rate.
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 100, adaptive: true });
  const LAG = 160;                                   // one-way, on the synced clock
  let extrapolatedLate = 0, framesLate = 0;
  for (let i = 0; i < 400; i++) {
    const t = 1000 + i * 50, arrival = t + LAG;
    buf.push(t, car({ s: (i * 2) % TOTAL, speed: 40 }), arrival);
    // Frames between this packet and the next, as the game draws them.
    for (let f = 1; f <= 3; f++) {
      const out = buf.sample(arrival + f * 16);
      if (i >= 200) { framesLate++; if (out.extrapolated) extrapolatedLate++; }
    }
  }
  const timing = buf.timing();
  assert.ok(timing.delayMs > LAG, "the delay settles above the observed lag: " + JSON.stringify(timing));
  assert.ok(timing.delayMs <= 400, "…and under the cap");
  assert.equal(extrapolatedLate, 0, "once settled, no frame extrapolates on a steady link (" + extrapolatedLate + "/" + framesLate + ")");
  // A stall is not a latency: one packet arriving a second late does not
  // drag the delay to a second.
  buf.push(1000 + 400 * 50, car({ s: 0, speed: 40 }), 1000 + 400 * 50 + 1000);
  assert.ok(buf.timing().lagMs <= 400);
  // And the base delay is the floor: a fast link is not slowed down.
  const fast = NetSnapshot.createInterp({ total: TOTAL, delayMs: 100, adaptive: true });
  for (let i = 0; i < 100; i++) fast.push(1000 + i * 50, car({ s: i }), 1000 + i * 50 + 20);
  assert.ok(Math.abs(fast.timing().delayMs - 100) < 5, "a 20 ms link keeps the base delay: " + fast.timing().delayMs);
});

// L8-e: the host relay carries every other player's car in ONE aged packet;
// each entry keeps the moment its pose was true (header tick − age).
test("an aged multi-entry packet round-trips every car and its own stamp", () => {
  const car = (s, lap) => ({ s, x: 1.25, head: 1, speed: 70, gear: 6, lap, braking: true });
  const bytes = NetSnapshot.encodeAged([
    { id: 4, car: car(100, 2), at: 10_000 },
    { id: 9, car: car(250.5, 3), at: 9_960.4 },
    { id: -1, car: car(1, 1), at: 10_000 },          // no wire id: skipped
    { id: 7, car: car(5, 1), at: NaN },              // never posed: skipped
  ]);
  assert.equal(bytes.length, 6 + 2 * NetSnapshot.AGED_BYTES);
  const pkt = NetSnapshot.decodeSnapshot(bytes);
  assert.equal(pkt.type, NetSnapshot.TYPE_AGED);
  assert.equal(pkt.tick, 10_000, "the header is the newest pose");
  assert.deepEqual(pkt.cars.map((c) => [c.id, c.s, c.lap, c.age]), [[4, 100, 2, 0], [9, 250.5, 3, 40]]);
  assert.equal(pkt.cars[1].braking, true);
  // A plain snapshot still decodes, every entry age 0.
  const plain = NetSnapshot.decodeSnapshot(NetSnapshot.encodeSnapshot(500, [{ id: 1, car: car(3, 1) }]));
  assert.equal(plain.type, NetSnapshot.TYPE_SNAPSHOT);
  assert.equal(plain.cars[0].age, 0);
  // Truncation is refused for the aged layout too.
  assert.equal(NetSnapshot.decodeSnapshot(bytes.slice(0, bytes.length - 1)), null);
});

// ---------------------------------------------------------------------------
// adopt(): the decoded entry is stored, not copied (netplay onState)
// ---------------------------------------------------------------------------
// One reordered, duplicated, braking packet stream, pushed twice: once through
// push() (copies its argument) and once through adopt() (keeps the decoded
// object). Every pose either buffer reports must be the same number.
function adoptStream() {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 0x100000000);
  const ticks = [];
  for (let i = 0; i < 60; i++) ticks.push(1000 + i * 20);
  for (let i = 0; i + 1 < ticks.length; i += 5) [ticks[i], ticks[i + 1]] = [ticks[i + 1], ticks[i]];   // reorder
  for (let i = 7; i < ticks.length; i += 11) ticks.splice(i, 0, ticks[i - 2]);                           // duplicates
  return ticks.map((t) => {
    const k = (t - 1000) / 20;
    const src = car({ s: (4900 + k * 3.1) % TOTAL, x: Math.sin(k) * 2, head: (k * 0.4) % TAU,
                      speed: 70 - k * 0.5 + rnd(), gear: 1 + (k % 8), lap: 3 + (k > 32 ? 1 : 0),
                      braking: k % 9 > 4, onKerb: k % 3 === 0 });
    return { t, bytes: NetSnapshot.encodeSnapshot(t, [{ id: 4, car: src }]) };
  });
}

test("adopt() poses every sample/predict identically to push() over a 1 s sweep", () => {
  const copy = NetSnapshot.createInterp({ total: TOTAL, delayMs: 100, keep: 8 });
  const own = NetSnapshot.createInterp({ total: TOTAL, delayMs: 100, keep: 8 });
  for (const { t, bytes } of adoptStream()) {
    // Separate decodes: the copy path must not be handed the adopted object.
    const a = copy.push(t, NetSnapshot.decodeSnapshot(bytes).cars[0]);
    const b = own.adopt(t, NetSnapshot.decodeSnapshot(bytes).cars[0]);
    assert.equal(b, a, `accept/refuse verdict at tick ${t}`);
    assert.equal(own.size(), copy.size());
    assert.deepEqual(own.sample(t + 40, {}), copy.sample(t + 40, {}), `sample after tick ${t}`);
    assert.deepEqual(own.predict(t + 15, {}), copy.predict(t + 15, {}), `predict after tick ${t}`);
  }
  for (let now = 1000; now <= 2400; now += 7) {
    assert.deepEqual(own.sample(now), copy.sample(now), `sample(${now})`);
    assert.deepEqual(own.predict(now), copy.predict(now), `predict(${now})`);
  }
});

test("adopt() stores the decoded object itself, stamped with its tick", () => {
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0, keep: 8 });
  for (const { t, bytes } of adoptStream()) {
    const entry = NetSnapshot.decodeSnapshot(bytes).cars[0];
    if (!buf.adopt(t, entry)) {
      assert.equal(entry.t, undefined, "a refused duplicate is never stamped");
      continue;
    }
    assert.equal(entry.t, t);
    if (buf.newest().t === t) assert.equal(buf.newest(), entry, "the stored sample IS the pushed object");
  }
  const last = NetSnapshot.decodeSnapshot(NetSnapshot.encodeSnapshot(5000, [{ id: 4, car: car({ s: 7 }) }])).cars[0];
  buf.adopt(5000, last);
  assert.equal(buf.newest(), last);
  // push() still copies: its caller may reuse the object.
  const reused = car({ s: 8 });
  buf.push(5020, reused);
  assert.notEqual(buf.newest(), reused);
  assert.equal(reused.t, undefined, "push() never stamps the caller's object");
});

test("the bounded window matches a sorted keep-newest model, without per-push shift()", () => {
  const keep = 8;
  const buf = NetSnapshot.createInterp({ total: TOTAL, delayMs: 0, keep });
  const model = [];
  const shift = Array.prototype.shift;
  let shifts = 0;
  Array.prototype.shift = function () { shifts++; return shift.apply(this, arguments); };
  try {
    for (const { t, bytes } of adoptStream()) {
      buf.push(t, NetSnapshot.decodeSnapshot(bytes).cars[0]);
      if (!model.includes(t)) { model.push(t); model.sort((a, b) => a - b); }
      while (model.length > keep) model.splice(0, 1);
      assert.ok(buf.size() <= keep, `size ${buf.size()} > keep`);
      assert.equal(buf.size(), model.length);
      assert.equal(buf.oldest().t, model[0]);
      assert.equal(buf.newest().t, model[model.length - 1]);
    }
  } finally { Array.prototype.shift = shift; }
  assert.equal(shifts, 0, "trimming the oldest must not shift() the whole buffer each push");
  buf.clear();
  assert.equal(buf.size(), 0);
  assert.equal(buf.newest(), null);
});

// ---- perf hunt 9: the encoders write the entries in place, no copied list per packet ---------------------------
test("encodeSnapshot / encodeAged build no list (0 array pushes) and skip invalid entries exactly as before", () => {
  const car = { s: 120.5, x: -1.25, head: 0.5, speed: 70, gear: 6, lap: 2 };
  const src = [{ id: 1, car, at: 990 }, null, { id: 300, car, at: 1000 }, { id: 2, car, at: 1000 }, { id: 3, car, at: NaN }, { id: 4, car, at: 960 }];
  const push = Array.prototype.push;
  let pushes = 0;
  Array.prototype.push = function () { pushes++; return push.apply(this, arguments); };
  let snap, aged;
  try { snap = NetSnapshot.encodeSnapshot(1000, src); aged = NetSnapshot.encodeAged(src); }
  finally { Array.prototype.push = push; }
  assert.equal(pushes, 0, "no list copied per packet (was one push per valid entry)");
  const s = NetSnapshot.decodeSnapshot(snap), a = NetSnapshot.decodeSnapshot(aged);
  assert.deepEqual(s.cars.map((c) => c.id), [1, 2, 3, 4], "snapshot: null and out-of-range ids skipped; `at` not required");
  assert.deepEqual(a.cars.map((c) => [c.id, c.age]), [[1, 10], [2, 0], [4, 40]], "aged: a non-finite `at` skipped too; ages from the newest");
  assert.equal(a.tick, 1000);
});
