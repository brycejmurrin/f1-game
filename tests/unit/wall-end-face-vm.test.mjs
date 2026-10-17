/* wall-end-face-vm.test.mjs — #1623: a wall that steps INWARD along s (the pit-wall
 * taper, the end of a run-off) is an end face. The lateral pin used to teleport a
 * car that was legally inside the old, wider limit by the whole step (measured
 * 8.9 m on Monaco's pit entry); WallEndFace holds s, scrubs speed and keeps x.
 * Real game in the Node VM (tools/lib/game-vm.cjs), the player stepped through
 * the physics across the face.
 *
 * Run: node --test tests/unit/wall-end-face-vm.test.mjs   (~15 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monaco" }); await g.race("monaco", "day", "dry"); });
after(() => { if (g) g.close(); });

/** The widest one-step tightening of the wall limit with the car on the road side. */
function widestFace(tr) {
  const CG = vm.runInContext("ContactGeometry", g.ctx);
  const out = { r: 0, l: 0, laneMin: 0, side: 0 }, post = { r: 99, l: 99, minOut: 0, side: 0 };
  let best = { drop: 0 };
  for (const side of [1, -1]) {
    let prev = null;
    for (let s = 0; s < tr.total; s += 0.5) {
      CG.wallLimits(tr, s, 0, out, post);
      const lim = side > 0 ? out.r : out.l;
      if (prev !== null && prev - lim > best.drop) best = { drop: prev - lim, s, side, prev, lim };
      prev = lim;
    }
  }
  return best;
}

test("a player driven across a wall end face keeps x (|dx| < 1.5 m) and is scrubbed, not teleported", () => {
  const tr = g.G.track;
  const face = widestFace(tr);
  assert.ok(face.drop > 4, "anti-vacuity: Monaco has a face of " + face.drop.toFixed(1) + " m");
  const a = g.apex;
  a.incident({ flags: { r2Airborne: false, r3Contact: false, c1Pileup: false } });
  const x0 = face.side * (face.prev - 0.5);          // legally inside the wide limit, outside the tight one
  a.jump((face.s - 14) / tr.total, 55, x0);
  a.setInput({ steer: 0, throttle: true });
  const p0 = a.probe();
  assert.ok(Math.abs(Math.abs(p0.x) - Math.abs(x0)) < 0.6, "parked where asked: " + p0.x + " vs " + x0);
  let prevX = p0.x, maxDx = 0, vIn = p0.speed, vMin = Infinity, crossed = false;
  for (let i = 0; i < 60; i++) {
    a.step(1 / 60, 1);
    const p = a.probe();
    maxDx = Math.max(maxDx, Math.abs(p.x - prevX)); prevX = p.x;
    if (p.s > face.s - 3) { crossed = true; vMin = Math.min(vMin, p.speed); }
  }
  a.clearInput();
  assert.ok(crossed, "the car reached the face");
  assert.ok(maxDx < 1.5, "max per-step |dx| " + maxDx.toFixed(2) + " m (the old pin snapped " + (face.drop - 0.5).toFixed(1) + " m)");
  assert.ok(vMin < vIn * 0.5, "speed scrubbed at the face: " + vMin.toFixed(1) + " of " + vIn.toFixed(1));
});
