/* kerb-drive-from-rest-vm.test.mjs — a car at rest on a kerb pulls away (#6481, #6480 K1, #5775 R3).
 *
 * THE DEFECT, measured on 0d28a237 before the fix: the kerb speed cut in
 * updateCarLongitudinal (js/game.js) was a flat 6·(1-kerbGripSm)/0.3 m/s² —
 * 6 m/s² at kerbGripSm 0.7 — with no low-speed floor, larger than the drive
 * from rest (~5 m/s² here), so speed clamped to 0 every frame:
 *   - player, Suzuka s 1228.4 x 6.45, full throttle from rest: 0.00 m/s for
 *     3 s until rescuePlayer fired (x 5.0, off the kerb: 0 → 13.9 m/s in 3 s);
 *   - AI-only field, seed 5 (apex.seed(5), then race, then aiOnly): ANT sat on
 *     the kerb at s 1226 x 6.81 under 3 m/s from 40.7 s to 45.4 s (4.7 s, every
 *     frame on the kerb) until its rescue fired.
 * The fix fades the cut in below vStd 10 m/s; at speed it is the same cut, so
 * the at-speed kerb penalty below is pinned unchanged (characterization).
 * Run: node --test tests/unit/kerb-drive-from-rest-vm.test.mjs   (~1 min, two boots)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const DT = 1 / 60, S_KERB = 1228.4, X_KERB = 6.45, X_ROAD = 5.0;
const THROTTLE = { steer: 0, throttle: true, brake: false };
let g = null;
before(async () => {
  g = await createGame({ track: "suzuka" });
  await g.race("suzuka");
  g.apex.headless(true); g.apex.go();
  g.G.cars.forEach((c, i) => { if (!c.isPlayer) g.apex.retire(i, "bench"); });
});
after(() => { if (g) g.close(); });

// Place the player at (S_KERB, x) at `speed`, hold full throttle for `steps`.
function run(x, speed, steps) {
  const p = g.G.player;
  g.apex.jump(S_KERB / g.G.track.total, speed, x); p.kerbGripSm = 1;
  const v0 = p.speed; let kerb = 0, maxRescue = 0;
  for (let i = 0; i < steps; i++) {
    g.apex.act(THROTTLE, DT, 1);
    kerb += p.onKerb ? 1 : 0; maxRescue = Math.max(maxRescue, p.rescueT || 0);
  }
  return { dv: p.speed - v0, speed: p.speed, kerb, maxRescue };
}

test("the player at rest on a kerb accelerates away under throttle, with no rescue", () => {
  const r = run(X_KERB, 0, 90);
  assert.ok(r.kerb > 60, `the trial must start and stay on the kerb (on it ${r.kerb}/90 frames)`);
  assert.ok(r.speed > 2, `on the kerb from rest: ${r.speed.toFixed(2)} m/s after 1.5 s of full throttle (stalled at 0 before #6481)`);
  assert.ok(r.maxRescue < 3, `the rescue must not be what frees it (rescueT reached ${r.maxRescue.toFixed(2)})`);
  const road = run(X_ROAD, 0, 90);
  assert.equal(road.kerb, 0, "the road control trial is off the kerb");
  assert.ok(r.speed < road.speed, `the kerb still costs speed from rest (kerb ${r.speed.toFixed(2)} vs road ${road.speed.toFixed(2)} m/s)`);
});

// Characterization: the kerb's slowing AT SPEED is unchanged by #6481. The
// penalty is the road trial's speed gain minus the kerb trial's over 0.5 s, at
// a ground speed whose vStd is past the fade. Measured on 0d28a237, before
// the fix: 20 m/s → 0.7688 m/s, 40 m/s → 0.3837 m/s. The 1e-2 band is there
// so an unrelated drag/aero/kerb-grip retune need not re-pin; a fade leaking
// past vStd 10 (or a re-scaled cut) moves the penalty by more than that.
test("at speed the kerb costs the same speed as before #6481", () => {
  for (const [v, pinned] of [[20, 0.7688], [40, 0.3837]]) {
    const kerb = run(X_KERB, v, 30), road = run(X_ROAD, v, 30);
    assert.ok(kerb.kerb > 0 && road.kerb === 0, `${v} m/s: kerb trial touches the kerb, road trial does not`);
    const penalty = road.dv - kerb.dv;
    assert.ok(Math.abs(penalty - pinned) < 1e-2, `${v} m/s: kerb penalty ${penalty.toFixed(4)} m/s, pinned ${pinned}`);
  }
});

test("Suzuka seed 5, AI-only: no car stalls on a kerb (ANT sat at 0 for 4.7 s before #6481)", async () => {
  const h = await createGame({ track: "suzuka" });
  try {
    h.apex.seed(5); await h.race("suzuka"); h.aiOnly();
    const G = h.G, cars = G.cars.filter((c) => !c.isPlayer && !c.human);
    const slowOnKerb = new Map();
    let worst = { code: "", t: 0, raceT: 0 }, kerbFrames = 0;
    for (let f = 0; f < 50 * 60; f++) {
      h.step(1, DT);
      for (const c of cars) {
        if (c.retired || c.finished) continue;
        if (c.onKerb) kerbFrames++;
        const t = c.speed < 3 && c.onKerb && G.raceT > 5 ? (slowOnKerb.get(c.code) || 0) + DT : 0;
        slowOnKerb.set(c.code, t);
        if (t > worst.t) worst = { code: c.code, t, raceT: G.raceT };
      }
    }
    assert.ok(kerbFrames > 0, "the field rode a kerb at all (else this passes vacuously)");
    assert.ok(G.raceT > 45, `the race ran past the repro window (raceT ${G.raceT.toFixed(1)})`);
    assert.ok(worst.t < 0.75, `${worst.code} under 3 m/s on a kerb for ${worst.t.toFixed(2)} s (at raceT ${worst.raceT.toFixed(1)})`);
  } finally { h.close(); }
});
