/* ot-ahead-scan-gate.test.mjs — the updateCar O(n) overtake ahead walk is gated.
 *
 * Line-level CDP (Monza, 22 cars): the walk was ~17 % of updateCar positionTicks
 * and pulled pits.inLane to ~2.6 % of all JS self-time, even on steps where
 * gapAhead is unused (no detection-line crossing, no OT allowance). The gate
 * must keep the scan body when gapAhead matters, and skip it otherwise.
 *
 * Run: node --test tests/unit/ot-ahead-scan-gate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInContext } from "node:vm";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
void readFileSync; void join; void dirname; void fileURLToPath;

// The REAL updateCar in the game VM, with Collide.scanOtAhead counted per car (T3-06). The old file
// regex-matched game.js and re-implemented the gate (need()) in the test, so only OM.crossed was real.
async function rig() {
  const g = await createGame({ track: "monza" });
  g.G.daily.stop();
  await g.G.startRace(); g.apex.go(); g.apex.headless(true);
  runInContext(`globalThis.__scans = new Map(); globalThis.__reach = new Map();
    const real = Collide.scanOtAhead;
    Collide.scanOtAhead = function (c, L, w) {
      __scans.set(c.code, (__scans.get(c.code) || 0) + 1); __reach.set(c.code, w);
      return real.apply(this, arguments);
    };`, g.ctx);
  g.ctx.__track = g.G.track;
  const scans = (c) => g.ctx.__scans.get(c.code) || 0;
  const place = (c, s, speed) => { g.apex.aiPlace(g.G.cars.indexOf(c), s / g.G.track.total, speed, 0); c.lap = Math.max(c.lap, 2); c.otE = 0; c.otOn = false; c._otS = c.s; c._otLap = c.lap; };
  const ai = g.G.cars.find((c) => !c.human);
  // Everyone else out of the way so the car under test is the only one that can earn or fire.
  for (const o of g.G.cars) if (o !== ai) g.apex.retire(g.G.cars.indexOf(o));
  return { g, ai, scans, place, det: runInContext("OvertakeMode.detectS(__track)", g.ctx) };
}

test("the ahead scan is skipped in clear air with no allowance, and runs when OT energy is held", async () => {
  const { g, ai, scans, place, det } = await rig();
  try {
    place(ai, det - 600, 55);                        // mid-lap, far from the detection line
    const before = scans(ai);
    g.step(20);
    assert.equal(scans(ai), before, "clear air, no allowance, no crossing: the O(n) walk is skipped");
    ai.otE = 0.5;
    const held = scans(ai);
    g.step(10);
    assert.ok(scans(ai) - held >= 9, "a held allowance pays for the walk every step: " + (scans(ai) - held));
  } finally { g.close(); }
});

test("the ahead scan runs on the step that crosses the detection line while detection is open, and not when it is closed", async () => {
  const { g, ai, scans, place, det } = await rig();
  try {
    place(ai, det - 4, 60);                          // ~0.07 s from the line
    const before = scans(ai);
    g.step(10);
    assert.ok(scans(ai) > before, "crossing detection while open: scan");
    // Closed: a caution at level 3 (SC) shuts detection (RaceControl.otDetectOpen).
    g.G.holdCaution(3, "test safety car"); g.G.applyCaution({ level: 3 });
    place(ai, det - 4, 60);
    const closed = scans(ai);
    g.step(10);
    assert.equal(scans(ai), closed, "crossing while closed: the gap is unused, no walk");
  } finally { g.close(); }
});

test("a held allowance keeps a finite, positive ahead-search radius while reversing", async () => {
  const { g, ai, scans, place, det } = await rig();
  try {
    place(ai, det - 600, 5);
    ai.otE = 0.5;
    ai.speed = -6;                                   // a held allowance can outlive a forward pass
    const before = scans(ai);
    g.step(2);
    assert.ok(scans(ai) > before, "the walk still runs");
    const w = g.ctx.__reach.get(ai.code);
    assert.ok(Number.isFinite(w) && w >= 1, "reach is OT_GAP * max(0, speed) + 1, never negative: " + w);
  } finally { g.close(); }
});
