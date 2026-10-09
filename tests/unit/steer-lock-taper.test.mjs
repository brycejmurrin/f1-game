/* steer-lock-taper.test.mjs — low-speed lock hold in js/game.js lockTaper.
 *
 * Fail-before: hyperbolic 1/(1+vs/ref) alone strips lock at hairpin speed
 * (Monaco Loews ~10 m/s needs ~0.39 rad Ackermann; notch-7 applied ~0.28).
 * Hold full lock for vs≤15, blend 15→30, raw taper for vs≥30 so racing
 * speeds (≥60 m/s) stay bit-identical to the pre-fix formula.
 *
 * Run: node --test tests/unit/steer-lock-taper.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

/** Pre-fix hyperbolic taper (bit-identical reference for vs ≥ 30). */
function rawTaper(vs, ref) {
  return 1 / (1 + vs / ref);
}

/** Shipped lockTaper: plateau ≤15, blend 15–30, raw ≥30. */
function lockTaper(vs, ref) {
  const raw = rawTaper(vs, ref);
  return vs <= 15 ? 1 : (vs >= 30 ? raw : 1 + (raw - 1) * (vs - 15) / 15);
}

test("game.js ships the vs≤15 hold / 15–30 blend / raw≥30 lockTaper", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(src, /const vs = vStd\(Math\.abs\(c\.speed\)\),\s*raw = 1 \/ \(1 \+ vs \/ STEER_SPEED_REF\),\s*lockTaper = vs <= 15 \? 1 : \(vs >= 30 \? raw : 1 \+ \(raw - 1\) \* \(vs - 15\) \/ 15\)/);
  assert.equal(/const lockTaper = 1 \/ \(1 \+ vStd\(Math\.abs\(c\.speed\)\) \/ STEER_SPEED_REF\);/.test(src), false,
    "old one-line hyperbolic lockTaper must be gone");
});

test("vs ≤ 15 holds full lock (taper = 1)", () => {
  const ref = 55;
  for (const vs of [0, 5, 8, 10, 12, 15]) {
    assert.equal(lockTaper(vs, ref), 1, `vs=${vs}`);
  }
});

test("vs ≥ 30 is bit-identical to the old hyperbolic taper", () => {
  const ref = 55;
  for (const vs of [30, 45, 55, 60, 71.4, 80, 95, 120]) {
    const got = lockTaper(vs, ref);
    const old = rawTaper(vs, ref);
    assert.ok(Object.is(got, old), `vs=${vs}: got ${got} vs old ${old}`);
  }
});

test("blend 15–30 is monotone and lands on the endpoints", () => {
  const ref = 55;
  assert.equal(lockTaper(15, ref), 1);
  assert.ok(Object.is(lockTaper(30, ref), rawTaper(30, ref)));
  let prev = lockTaper(15, ref);
  for (let vs = 16; vs <= 30; vs++) {
    const t = lockTaper(vs, ref);
    assert.ok(t <= prev + 1e-15, `monotone decreasing at vs=${vs}`);
    assert.ok(t >= rawTaper(vs, ref) - 1e-15, `blend stays ≥ raw at vs=${vs}`);
    prev = t;
  }
});

test("applied full-lock delta: hairpin holds STEER_MAX_SLIP; ≥60 m/s matches old taper", async () => {
  const { createGame } = require("../../tools/lib/game-vm.cjs");
  const DT = 1 / 60;
  const g = await createGame({ track: "monza", storage: { difficulty: "normal", autoThrottle: false } });
  await g.race("monza", "day", "dry");
  const P = g.G.player, S = g.sandbox, track = g.G.track;
  for (const c of g.G.cars) if (c !== P) { c.retired = true; c.x = 80; }
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
  S.Tracks.sample(track, 0, smp);
  const head0 = Math.atan2(smp.t[0], smp.t[2]);
  const pin = () => { P.px = smp.p[0]; P.pz = smp.p[2]; P.s = 0; P.x = 0; };
  const measure = (v) => {
    g.apex.jump(0, v, 0);
    P.vLat = 0; P.yawRateCur = 0; P.head = head0; pin();
    let last = 0;
    for (let i = 0; i < 30; i++) {
      g.apex.setInput({ steer: 1, throttle: P.speed < v - 0.2, brake: P.speed > v + 1.5 });
      g.step(1, DT); pin();
      last = P.steerAngle || 0;
    }
    return last;
  };
  const lock = g.G.STEER_MAX_SLIP;
  const ref = g.G.STEER_SPEED_REF;
  const vStd = (v) => g.G.vStd ? g.G.vStd(v) : v / Math.max(g.G.PACE || 1, 0.05);

  const d10 = measure(10);
  assert.ok(Math.abs(d10 - lock) < 0.01,
    `at 10 m/s full lock ≈ STEER_MAX_SLIP (${lock}), got ${d10}`);

  const d60 = measure(60);
  const vs60 = vStd(Math.abs(P.speed));
  const expect60 = lock * rawTaper(vs60, ref);
  // Bit-identical taper ⇒ applied delta matches old formula within float noise from speed hold.
  assert.ok(Math.abs(d60 - expect60) < 0.008,
    `at ~60 m/s delta ${d60} must match old raw taper expect ${expect60} (vs=${vs60})`);

  // Pure bit-identical gate on the taper itself at every vs ≥ 60.
  for (const vs of [60, 70, 80, 100]) {
    assert.ok(Object.is(lockTaper(vs, ref), rawTaper(vs, ref)), `Object.is taper at vs=${vs}`);
  }
  g.close();
});
