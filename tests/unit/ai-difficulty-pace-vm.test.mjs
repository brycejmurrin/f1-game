/* AI PACE per difficulty, pinned against a strong-player reference lap (Bryce 2026-11-25: "even in hard I'm still
 * way beating them"). docs/notes/AI-HARD-PACE-2026-11-25.md has the measurement this pins.
 *
 * THE REFERENCE is the AI controller driving the PLAYER's envelope: the fastest tier-0 car, skill 1, at the player's
 * own top speed (BAND_CEIL, 1.0) and cornering at sqrt(PLAYER_GRIP) of the AI grip envelope (the player's extra
 * lateral grip, in corner speed). It is what a driver who uses all of the player's car laps in, with the AI's line.
 * Every level is then the same car alone on the circuit (RUS, seed 1, wear off, out lap + one flying lap), so a lap
 * is a deterministic integer frame count: the bands below are the measured ratio +-0.4 %, not a fit to noise.
 *
 * Two circuits of different shape (Monza: straights and chicanes; Red Bull Ring: short, braking zones).
 *
 * If a deliberate AI pace change moves a ratio, re-measure: this file's own failure message prints every ratio and move the band WITH the change in the same PR, naming it. Never widen a band to get green.
 *
 * Run: node --test tests/unit/ai-difficulty-pace-vm.test.mjs   (~25 s)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const DT = 1 / 60;

const tune = readFileSync(new URL("../../js/physics/drive-tune.js", import.meta.url), "utf8");
const PLAYER_CORNER = Math.sqrt(parseFloat(tune.match(/PLAYER_GRIP: ([0-9.]+)/)[1]));

// Measured ratio of each level's flying lap to the reference lap, per circuit (see the note). Band: +-0.4 %.
const BANDS = {
  monza: { hard: 1.0087, normal: 1.0886, easy: 1.1346 },     // ref 116.867 s (2026-11-25; HARD was 1.0272 at corner 1.00)
  redbull: { hard: 1.0102, normal: 1.0867, easy: 1.1297 },   // ref 89.817 s (HARD was 1.0323)
};
const TOL = 0.004;

let h = null, custom = -1;
before(async () => {
  const g0 = await createGame({ track: "monza" });
  custom = g0.sandbox.Teams.LIST.findIndex((t) => t.custom);
  g0.close();
});
after(() => { if (h) h.close(); });

async function boot(track, difficulty) {
  if (h) h.close();
  h = await createGame({ track, storage: { difficulty, tyreWear: "off", team: custom, driver: 0 } });
}

/** One car alone: the out lap, then one flying lap; seconds of sim time. `ref` gives it the player's envelope. */
async function soloLap(track, code, ref) {
  h.apex.seed(1);
  await h.race(track);
  h.aiOnly();
  const cars = h.G.cars, i = cars.findIndex((c) => c.code === code);
  assert.ok(i >= 0, `${code} is on the ${track} grid`);
  for (let j = 0; j < cars.length; j++) if (j !== i && !cars[j].retired) h.apex.retire(j, "bench");
  const c = cars[i];
  if (ref) { c.skill = 1; c.tierV = 2; }
  let seen = c.lap || 0, last = null, t = 0;
  for (let f = 0; f < 600 / DT; f++) {
    h.step(1, DT); t += DT;
    assert.ok(!c.retired, `${code} retired at ${track}`);
    const lap = c.lap || 0;
    if (lap > seen) { if (last != null) return t - last; last = t; seen = lap; }
  }
  assert.fail(`${code} never finished a flying lap at ${track}`);
}

for (const track of Object.keys(BANDS)) {
  test(`AI lap time per difficulty sits in its band against the strong-player reference (${track})`, async () => {
    await boot(track, "hard");
    const D = h.sandbox.PhysicsConsts.DIFF;
    // The reference reads the player's envelope whatever HARD is set to: swap the row in for the one run.
    const keep = D.hard.corner;
    D.hard.corner = PLAYER_CORNER;
    const refLap = await soloLap(track, "RUS", true);
    D.hard.corner = keep;
    const got = {};
    for (const level of ["hard", "normal", "easy"]) {
      if (level !== "hard") await boot(track, level);
      got[level] = (await soloLap(track, "RUS", false)) / refLap;
    }
    const msg = `${track}: ref ${refLap.toFixed(3)} s; ratios ${JSON.stringify(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, +v.toFixed(4)])))}`;
    for (const [level, want] of Object.entries(BANDS[track])) {
      assert.ok(Math.abs(got[level] - want) <= TOL, `${level} ${got[level].toFixed(4)} outside ${want} +-${TOL} — ${msg}`);
    }
    // The ladder itself: HARD challenges the reference, each level below is clearly slower.
    assert.ok(got.hard < 1.02, `HARD within 2 % of a strong player — ${msg}`);
    assert.ok(got.normal > got.hard + 0.03 && got.easy > got.normal + 0.03, `levels 3 %+ apart — ${msg}`);
  });
}
