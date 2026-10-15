/* cam-avoid-vm.test.mjs — the open-circuit broadcast cams must not heave over
 * the structures the road passes under.
 *
 * THE BUG THIS GUARDS. CamAvoid.freeEye lifted the eye over every solid prop
 * box it was "inside". The prop registry stores AXIS-ALIGNED boxes, so a start
 * gantry, a bridge or an angled stand has a box that holds the tarmac itself:
 * Monza LOW at s=5 was judged inside the start gantry (+10 m), Monaco
 * CINEMATIC inside a 51 m `structure` (+35 m), Bahrain LOW +11 / +13 m — each
 * dropping back a few metres later. With the race damper that is a ~6 m heave
 * per overhead structure per lap. The road is always clear (FlybySeq.onRoadPose
 * says the same for the planner), so a corridor eye is never lifted.
 *
 * WHY A VM SUITE. camVantage(mode, s, …) is a pure function of the built track,
 * so the sweep is exact and takes seconds. A STEP is a vertical change between
 * two samples 1 m of arc apart; a step with 3 m or more of horizontal travel is
 * a shot CUT (cinematic swaps slots), not a lift, and is excluded.
 *
 * PIT WALL. The pit-wall rig stands its eye a fixed lateral distance outside
 * the kerb, and it was not in CamAvoid.MODES, so wherever a stand or building
 * sits on the pit side the player's PIT WALL view was filmed from inside it:
 * 1.7 % of Vegas, 5.1 % of Singapore and 15.6 % of Mexico's lap (track gallery
 * B/D, 2026-10-15; 44 of 51 circuits). The road corridor is still exempt.
 *
 * Run: node --test tests/unit/cam-avoid-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const games = {};
const PITWALL_TRACKS = ["vegas", "singapore", "mexico"];
before(async () => {
  games.monza = await createGame({ track: "monza" });
  games.monaco = await createGame({ track: "monaco" });
  for (const id of PITWALL_TRACKS) games[id] = await createGame({ track: id });
});
after(() => { for (const k of Object.keys(games)) games[k].close(); });

const OPTS = { dt: 0, snap: true, reduceMotion: true };

/** Largest |Δeye.y| between samples 1 m apart, ignoring cuts. */
function maxHeave(g, mode) {
  const L = g.G.track.total;
  let prev = null, max = 0, at = 0;
  for (let s = 0; s < L; s += 1) {
    const e = g.G.camVantage(mode, s, 1.5, 60, 0, OPTS).eye.slice();
    if (prev && Math.hypot(e[0] - prev[0], e[2] - prev[2]) < 3) {
      const d = Math.abs(e[1] - prev[1]);
      if (d > max) { max = d; at = s; }
    }
    prev = e;
  }
  return { max, at };
}

for (const id of ["monza", "monaco"]) {
  for (const mode of ["low", "cinematic"]) {
    test(`${id} ${mode}: no overhead structure heaves the eye`, () => {
      const { max, at } = maxHeave(games[id], mode);
      assert.ok(max < 1.5, `${id} ${mode} eye.y moves ${max.toFixed(2)} m in 1 m of arc at s=${at}`);
    });
  }
}

test("the start gantry (Monza s=5) no longer lifts the LOW eye", () => {
  const g = games.monza;
  const y = (s) => g.G.camVantage("low", s, 1.5, 60, 0, OPTS).eye[1];
  assert.ok(Math.abs(y(5) - y(2)) < 0.5, "eye under the gantry stays at its road-level height");
});

test("every mode steps <= 0.52 m (2 dp) per 0.5 m of arc across the s=0 seam and L/2", () => {
  const g = games.monza, L = g.G.track.total;
  const modes = g.sandbox.CamModes.CAM_MODES.map((m) => m.id);
  assert.equal(modes.length, 20, "the seam claim covers the 20 shipped modes");
  for (const mode of modes) {
    for (const base of [0, L / 2]) {
      let prev = null;
      for (let q = -20; q <= 20; q++) {
        const s = (((base + q * 0.5) % L) + L) % L;
        const v = g.G.camVantage(mode, s, 1.5, 60, 0, OPTS);
        const e = [...v.eye, ...v.tgt];
        assert.ok(e.every(Number.isFinite), `${mode} non-finite at s=${s}`);
        if (prev) {
          const d = Math.hypot(e[0] - prev[0], e[1] - prev[1], e[2] - prev[2]);
          assert.ok(+d.toFixed(2) <= 0.52, `${mode} steps ${d.toFixed(2)} m at s=${s.toFixed(1)}`);
        }
        prev = e;
      }
    }
  }
});

for (const id of PITWALL_TRACKS) {
  test(`${id} pitwall: the eye is never inside a solid prop off the road`, () => {
    const g = games[id], T = g.G.track, L = T.total, sb = g.sandbox;
    const bad = [];
    for (let s = 0; s < L; s += 5) {
      const eye = g.G.camVantage("pitwall", s, 1.5, 60, 0, OPTS).eye;
      const hit = sb.FlybySeq.insideProp(T, eye, 0);
      if (hit && !sb.CamAvoid.roadClear(T, eye, 0)) bad.push(`s=${s} ${hit.kind}`);
    }
    assert.deepEqual(bad.slice(0, 5), [], `${id} pitwall eye inside ${bad.length} props`);
  });
}
