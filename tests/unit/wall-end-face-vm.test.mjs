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
// THE FACE IS PLANTED. The real one this test was written on (8.9 m, Monaco's
// pit-exit taper, nodes 37-41) was the openBoundary pocket #5079 removed, and
// feathering leaves no other face over 4 m on any circuit. The same 14 -> 5.1
// m step is planted on the LEFT (non-pit) side at the same nodes, so the
// mechanism is still driven across a real wall-limit drop.
function plantFace(tr) {
  for (let k = 30; k <= 40; k++) tr.barL[k] = tr.hw[k] + 9;
  for (let k = 41; k <= 46; k++) tr.barL[k] = tr.hw[k] + 0.1;
}
before(async () => {
  g = await createGame({ track: "monaco" }); await g.race("monaco", "day", "dry");
  plantFace(g.G.track);
});
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

test("the face scrub is per second, not per call, and marks the car on a wall (audit4 F6)", () => {
  const tr = g.G.track;
  const face = widestFace(tr);
  const CG = vm.runInContext("ContactGeometry", g.ctx), WEF = vm.runInContext("WallEndFace", g.ctx);
  const x0 = face.side * (face.prev - 0.5);
  const hit = (dt) => {
    const c = { human: true, _prevS: face.s - 0.5, s: face.s, x: x0, speed: 50, wasOnWall: false };
    const lim = CG.wallLimits(tr, c.s, c.x, { r: 0, l: 0, laneMin: 0, side: 0 }, { r: 99, l: 99, minOut: 0, side: 0 });
    assert.equal(WEF.apply(c, tr, lim, dt), true, "the face holds the car (dt " + dt + ")");
    return c;
  };
  const a = hit(1 / 60);
  assert.equal(a.speed, 10, "60 Hz: FACE_KEEP exactly, bit-identical to the per-tick scrub");
  assert.equal(a.wasOnWall, true, "a side wall next tick is not a second first strike");
  const b = hit(1 / 30);
  assert.ok(Math.abs(b.speed - 50 * 0.2 * 0.2) < 1e-9, "one 1/30 step scrubs what two 1/60 ticks do: " + b.speed);
});

test("reversing into a wall end that tightens as s decreases is held at the face too (#4335)", () => {
  const tr = g.G.track;
  const CG = vm.runInContext("ContactGeometry", g.ctx), WEF = vm.runInContext("WallEndFace", g.ctx);
  const out = { r: 0, l: 0, laneMin: 0, side: 0 }, post = { r: 99, l: 99, minOut: 0, side: 0 };
  let best = { drop: 0 };
  for (const side of [1, -1]) {
    let prev = null;
    for (let s = tr.total - 0.5; s > 0; s -= 0.5) {
      CG.wallLimits(tr, s, 0, out, post);
      const lim = side > 0 ? out.r : out.l;
      if (prev !== null && prev - lim > best.drop) best = { drop: prev - lim, s, side, prev };
      prev = lim;
    }
  }
  assert.ok(best.drop > 4, "anti-vacuity: a reverse face of " + best.drop.toFixed(1) + " m");
  const x0 = best.side * (best.prev - 0.5);
  const c = { human: true, _prevS: best.s + 0.5, s: best.s, x: x0, speed: -10, wasOnWall: false };
  const lim = CG.wallLimits(tr, c.s, c.x, { r: 0, l: 0, laneMin: 0, side: 0 }, { r: 99, l: 99, minOut: 0, side: 0 });
  assert.equal(WEF.apply(c, tr, lim, 1 / 60), true, "the reverse face holds the car");
  assert.equal(c.s, best.s + 0.5, "s restored");
  assert.equal(c.x, x0, "lateral position kept");
});

// D2 (2026-11-18): the guard `|x| > oldLim → ordinary pin` let a car that was SCRAPING the old wall
// (pinned at it, integrating a few cm past it each tick) through: the pin carried it across the whole
// step at speed (Baku s≈188, 1.65 m step: x 6.90 → 5.25 at 24 m/s, driven with steer only).
test("a car scraping the old wall into a face stops at the old wall limit (#5775 R10)", () => {
  const tr = g.G.track;
  const face = widestFace(tr);
  const CG = vm.runInContext("ContactGeometry", g.ctx), WEF = vm.runInContext("WallEndFace", g.ctx);
  for (const over of [0.02, 0.18, 0.6]) {           // driven measurements: 0.017-0.034 m (steer), 0.18 m (aimed)
    const c = { human: true, _prevS: face.s - 0.5, s: face.s, x: face.side * (face.prev + over), speed: 24, wasOnWall: true, vLat: 0.3 };
    const lim = CG.wallLimits(tr, c.s, c.x, { r: 0, l: 0, laneMin: 0, side: 0 }, { r: 99, l: 99, minOut: 0, side: 0 });
    assert.ok(Math.abs(c.x) > (face.side > 0 ? lim.r : lim.l), "anti-vacuity: outside the new limit");
    assert.equal(WEF.apply(c, tr, lim, 1 / 60), true, "held at the face (over " + over + " m)");
    assert.equal(c.s, face.s - 0.5, "s restored");
    assert.ok(Math.abs(Math.abs(c.x) - face.prev) < 1e-9, "pinned to the OLD wall, not the new one: " + c.x);
    assert.equal(c.vLat, 0, "slip into the wall killed, as the side pin does");
    assert.ok(Math.abs(c.speed - 24 * 0.2) < 1e-9, "scrubbed: " + c.speed);
  }
});

// D3 (2026-11-18): the LANE side of a pit-wall nose. wallLimits classes a car whose centre is past
// face + 0.125 at the first wall node as lane-side and WallClamp pinned it out to laneMin — 1.6-2.5 m
// in one step at Monaco/Baku, driven. The road side of the same nose already reached apply().
test("a car striking the lane side of the pit-wall nose stops at the nose (#5775 R11)", () => {
  const tr = g.G.track, p = tr.pit, L = tr.total;
  const CG = vm.runInContext("ContactGeometry", g.ctx), WEF = vm.runInContext("WallEndFace", g.ctx);
  const lim = { r: 0, l: 0, laneMin: 0, side: 0 }, post = { r: 99, l: 99, minOut: 0, side: 0 };
  const x = p.side * 6.6;                            // the staged/driven Monaco row: centre on the nose
  let sNose = null;                                  // first s (forward, within 400 m before sIn) with a lane pin at x
  for (let s = p.sIn - 400; s < p.sIn + 20; s += 0.25) {
    const ss = ((s % L) + L) % L;
    CG.wallLimits(tr, ss, x, lim, post);
    if (lim.laneMin > 0 && lim.side === p.side) { sNose = ss; break; }
  }
  assert.ok(sNose !== null, "anti-vacuity: Monaco's pit wall has a nose");
  const mk = (ps, s, cx) => ({ human: true, _prevS: ps, s, x: cx, speed: 20, wasOnWall: false });
  const c = mk(sNose - 0.25, sNose, x);
  CG.wallLimits(tr, c.s, c.x, lim, post);
  assert.ok(lim.laneMin - c.x * p.side > 1.5, "anti-vacuity: the lane pin would snap " + (lim.laneMin - c.x * p.side).toFixed(2) + " m");
  assert.equal(WEF.apply(c, tr, lim, 1 / 60), true, "held at the nose");
  assert.equal(c.s, sNose - 0.25, "s restored");
  assert.equal(c.x, x, "x kept");
  assert.ok(Math.abs(c.speed - 4) < 1e-9, "scrubbed: " + c.speed);
  const wallClamp = vm.runInContext("WallClamp", g.ctx);
  const driven = mk(sNose - 0.25, sNose, x);
  wallClamp.apply(driven, { track: tr, dt: 1 / 60, postLim: post });
  assert.equal(driven.s, c.s, "driving takes the end-face response before the lane pin");
  assert.equal(driven.x, x, "the old lane limit cannot move a car held at its previous position");
  assert.equal(driven.speed, c.speed);
  // Beside the wall already (the lane pin existed at _prevS): the ordinary pin, untouched.
  const d = mk(sNose + 5, sNose + 5.25, x);
  CG.wallLimits(tr, d.s, d.x, lim, post);
  assert.equal(WEF.apply(d, tr, lim, 1 / 60), false, "beside the wall: ordinary lane pin");
  // A graze (centre within NOSE_GRAZE of the lane): the ordinary lane pin — driven rows 0.24/0.27 m
  // pins entered the lane unchanged.
  const gz = mk(sNose - 0.25, sNose, 0);
  CG.wallLimits(tr, gz.s, p.side * 7.9, lim, post);
  gz.x = p.side * (lim.laneMin - 0.3);
  CG.wallLimits(tr, gz.s, gz.x, lim, post);
  assert.ok(lim.laneMin > 0, "anti-vacuity: graze car is lane-side");
  assert.equal(WEF.apply(gz, tr, lim, 1 / 60), false, "graze: ordinary lane pin");
  // In the lane already: nothing to do.
  const e = mk(sNose - 0.25, sNose, p.side * (lim.laneMin + 0.2));
  CG.wallLimits(tr, e.s, e.x, lim, post);
  assert.equal(WEF.apply(e, tr, lim, 1 / 60), false, "in the lane: no hold");
  // AI cars are never held (WallEndFace is human-only; the AI keeps its pin).
  const f = Object.assign(mk(sNose - 0.25, sNose, x), { human: false });
  CG.wallLimits(tr, f.s, f.x, lim, post);
  assert.equal(WEF.apply(f, tr, lim, 1 / 60), false, "AI: no hold");
});

// #7399 row 1 (Bryce's decision A, 2026-11-28): held at a face and punted from behind. The contact
// shove moved s past the face (shiftLong leaves _prevS) and the post-contact pin snapped x to the new
// limit: 8.4 m in one step on this planted face. The collision path now holds the face too.
test("a player held at a wall end face and hit from behind stays at the face (#7399)", () => {
  const tr = g.G.track;
  const face = widestFace(tr);
  const a = g.apex;
  a.incident({ flags: { r2Airborne: false, r3Contact: false, c1Pileup: false } });
  const x0 = face.side * (face.prev - 0.5);
  for (const gap of [4, 4.5]) {                      // AI nose into the player's tail, closing at +20 m/s
    a.jump((face.s - 0.3) / tr.total, 0, x0);
    a.setInput({ steer: 0, throttle: false, brake: true });
    a.aiPlace(0, (face.s - 0.3 - gap) / tr.total, 20, x0);
    let prevX = a.probe().x, maxDx = 0, vMax = 0, sMax = -Infinity;
    for (let i = 0; i < 40; i++) {
      a.step(1 / 60, 1);
      const p = a.probe();
      maxDx = Math.max(maxDx, Math.abs(p.x - prevX)); prevX = p.x;
      vMax = Math.max(vMax, p.speed); sMax = Math.max(sMax, p.s);
    }
    a.clearInput();
    assert.ok(vMax > 1, "anti-vacuity: the AI hit the player (peak " + vMax.toFixed(1) + " m/s, gap " + gap + ")");
    assert.ok(maxDx < 1.5, "max per-step |dx| " + maxDx.toFixed(2) + " m (gap " + gap + "; the old pin snapped " + (face.drop - 0.5).toFixed(1) + " m)");
    assert.ok(Math.abs(prevX - x0) < 0.5, "kept x at the face: " + prevX.toFixed(2) + " vs " + x0.toFixed(2));
    assert.ok(sMax < face.s, "never carried past the face: s " + sMax.toFixed(2) + " vs face " + face.s);
  }
});
