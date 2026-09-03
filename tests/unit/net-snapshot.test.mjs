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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// A strict-mode direct eval keeps its own declarations to itself, so each file
// is loaded separately and the shared math island is published on globalThis —
// snapshot.js binds M4.clamp/M4.wrapDelta at eval, exactly as the shell does.
globalThis.M4 = eval(fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8") + ";M4");
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
