/* hot-path-memo-vm.test.mjs — #7070 (#6506 rows 2 + 6) in the real game
 * (tools/lib/game-vm.cjs runs js/game.js on an inert DOM).
 *
 * Row 2: RaceControl.lowGrip() — asked by every paceVmax / xVmaxGain of every
 * car through PaceMath.aeroWetK — is read ONCE per step inside game.js's
 * per-car loop (raceCtl.stepBegin/stepEnd), not once per call. Base read the
 * road wetness ~200 times a step on a 22-car wet race; the memo leaves only
 * the handful of other readers. Outside the window it stays live.
 * Row 6: checkRetirements hands AiDrive.stallSweep ONE function (stallRetire),
 * not a fresh arrow each step (a spy on the AiDrive global, bound before game.js).
 *
 * Run: node --test tests/unit/hot-path-memo-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

let g;
const sweepFns = [];
// Rebind the frozen AiDrive global to a frozen copy whose stallSweep records its callback.
function onEval(rel, ctx) {
  if (!/ai-drive\.js$/.test(rel)) return;
  const AD = ctx.AiDrive, orig = AD.stallSweep;
  ctx.AiDrive = Object.freeze(Object.assign({}, AD, { stallSweep(cars, dt, green, onRetire) { sweepFns.push(onRetire); return orig.apply(this, arguments); } }));
}
before(async () => { g = await createGame({ track: "monza", onEval, storage: { raceDraft: { weather: "dry", tod: "default", mixed: true, laps: "3" } } }); });
after(() => g?.close());

test("row 2: a wet race reads the road wetness a handful of times per step, not per car call", async () => {
  await g.apex.race("monza", "day", "rain");
  g.apex.go();
  g.apex.headless(true);
  g.apex.step(1 / 60, 120);
  assert.equal(g.apex.caution().lowGrip, true, "rain is low grip");
  const orig = g.G.trackWetness;
  let n = 0;
  g.G.trackWetness = function () { n++; return orig.apply(this, arguments); };
  try {
    g.apex.step(1 / 60, 10);
    const perStep = n / 10;
    assert.ok(g.G.cars.length >= 10, "a full field");
    assert.ok(perStep < g.G.cars.length, `wetness reads per step ${perStep} < cars ${g.G.cars.length} (base: ~200)`);
  } finally { g.G.trackWetness = orig; }
});

test("row 2: lowGrip is live outside a step window and read once inside one", () => {
  let n = 0;
  const G = { store: { get() { return false; }, set() {} }, raceWeather: "rain", trackWetness() { n++; return 0.9; } };
  const rc = vm.runInContext("RaceControl", g.ctx).create(G);
  rc.lowGrip(); rc.lowGrip(); rc.lowGrip();
  assert.equal(n, 3, "outside a step lowGrip reads live");
  n = 0;
  rc.stepGrip(true);
  for (let i = 0; i < 50; i++) assert.equal(rc.lowGrip(), true);
  assert.equal(n, 1, "one read per step window");
  rc.stepGrip(false);
  G.trackWetness = () => { n++; return 0; };
  n = 0;
  assert.equal(rc.lowGrip(), false, "closing the window drops the memo: a dried track reads dry");
  assert.equal(n, 1);
  rc.stepGrip(true);
  G.trackWetness = () => 0.9;
  assert.equal(rc.lowGrip(), true, "opening a window drops the previous window's answer");
  rc.stepGrip(false);
});

test("row 6: stallSweep gets one stable function, not a per-step arrow", () => {
  sweepFns.length = 0;
  g.apex.step(1 / 60, 5);
  assert.ok(sweepFns.length >= 5, `stallSweep ran each step (${sweepFns.length})`);
  assert.equal(typeof sweepFns[0], "function");
  assert.equal(new Set(sweepFns).size, 1, "the same function every step");
});
