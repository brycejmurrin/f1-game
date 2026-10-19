/* physics-characterization-vm.test.mjs — the browser characterization spec's
 * recipe, replayed in the Node VM against the SAME committed baseline.
 *
 * tests/specs/physics-characterization.spec.js pins the driving model's numbers
 * across commits; tests/data/physics-baseline.json is the ground truth it wrote
 * from a real Chromium run. This file drives tools/lib/game-vm.cjs through the
 * identical scenarios (seed, reset, scripted inputs, 1/60 steps, a physState
 * row every 15 steps, rounded to 1e-4) and asserts equality with that file —
 * so it proves two things at once: the harness IS the browser's physics, and
 * an edit that moves the model is caught in ~3 s without a browser.
 *
 * NEVER regenerate the baseline from here: it belongs to the browser spec
 * (APEX_UPDATE_BASELINE=1 npx playwright test physics-characterization). A
 * divergence is reported as the first differing scenario / step / field with
 * both values — read it, do not loosen it.
 *
 * Run: node --test tests/unit/physics-characterization-vm.test.mjs
 */
import { test, before, after } from "node:test";
import { SCENARIOS, FIELDS, WIDE, AI, fieldsOf } from "../helpers/physics-scenarios.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(HERE, "..", "data", "physics-baseline.json");

const R = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v * 1e4) / 1e4 : v);

const browserSource = () => fs.readFileSync(path.join(HERE, "..", "specs", "physics-characterization.spec.js"), "utf8");

// Independent anchors keep meaningful recipe edits visible, including changes
// formerly checked by mutating a duplicate literal in the browser source.
function assertRecipeContract(recipes) {
  assert.deepEqual(recipes.map((s) => s.name), ["straight-line accel", "steady corner load",
    "trail brake into rotation", "off-track recovery", "right-hand loaded corner",
    "boost and x-mode on the straight", "kerb strike", "ai car launch", "wet right-hand corner"]);
  assert.deepEqual([recipes[0].steps[0].n, recipes[1].steps[0].in.steer, recipes[3].x,
    recipes[0].steps[0].in.throttle, recipes[5].boost, recipes[8].wx, recipes[7].ai],
  [120, 0.6, 11, true, true, "wet", 1]);
  assert.deepEqual(recipes[2].steps, [
    { n: 45, in: { brake: true, steer: 0.5 } },
    { n: 45, in: { throttle: true, steer: 0.3 } },
  ]);
  for (const recipe of recipes) {
    assert.equal(typeof recipe.name, "string");
    assert.ok(Number.isInteger(recipe.seed));
    assert.ok(Number.isFinite(recipe.frac) && recipe.frac >= 0 && recipe.frac < 1);
    assert.ok(Number.isFinite(recipe.speed));
    assert.ok(recipe.steps.length > 0);
    for (const stage of recipe.steps) {
      assert.ok(Number.isInteger(stage.n) && stage.n > 0);
      assert.ok(Number.isFinite(stage.in.steer));
    }
  }
}

test("shared recipes retain order, schema, independent anchors and immutable nested inputs", () => {
  assertRecipeContract(SCENARIOS);
  assert.deepEqual(JSON.parse(JSON.stringify(SCENARIOS)), SCENARIOS, "recipes remain serializable page.evaluate inputs");
  function assertFrozen(value) {
    if (value && typeof value === "object") {
      assert.ok(Object.isFrozen(value));
      for (const child of Object.values(value)) assertFrozen(child);
    }
  }
  assertFrozen(SCENARIOS);
  for (const fields of [FIELDS, WIDE, AI]) assertFrozen(fields);
  assert.deepEqual(fieldsOf({ wide: true, ai: 1 }), ["s", "x", "speed", "slipDeg", "head", "prog",
    "yawRate", "gear", "aeroX", "energy", "ai.s", "ai.x", "ai.speed"]);
  const fields = fieldsOf({});
  fields.reverse();
  assert.equal(fieldsOf({})[0], "s", "field lists are fresh per caller");
});

test("recipe contract detects duration, input, offset, flags, weather and order changes", () => {
  const mutations = [
    (s) => { s[0].steps[0].n = 121; }, (s) => { s[1].steps[0].in.steer = 0.7; },
    (s) => { s[3].x = 12; }, (s) => { s[0].steps[0].in.throttle = false; },
    (s) => { s[5].boost = false; }, (s) => { s[8].wx = "dry"; },
    (s) => { s[7].ai = 2; }, (s) => { s.reverse(); },
    (s) => { s[2].steps.reverse(); },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(SCENARIOS);
    mutate(changed);
    assert.throws(() => assertRecipeContract(changed), assert.AssertionError);
  }
});

test("browser retains its independent runner, sampling, columns and factory seat", () => {
  const spec = browserSource();
  assert.ok(spec.includes('from "../helpers/physics-scenarios.mjs"'), "browser imports the shared recipes");
  assert.ok(spec.includes("if (i % 15 === 0)") && spec.includes("Math.round(v * 1e4) / 1e4"), "spec sampling or rounding changed");
  assert.ok(spec.includes("row.push(p.yawRate, c.gear, p.aeroX, c.energy)") && spec.includes("row.push(q.s, q.x, q.speed)"),
    "spec wide/ai columns changed: keep them identical to run() below");
  assert.ok(spec.includes("pinFactorySeat"),
    "browser characterization must pin factory McLaren before loadTrack so GarageDefaults cannot move the baseline");
});

// ONE boot for the file (createGame ~2-3 s on this box); each scenario is its
// own test so a divergence is named by scenario and the per-test wall stays
// well under the 5 s budget. reset() between scenarios is what the browser
// spec does too — the run order is the recipe.
//
// A3: grip-sensitive baselines assume dry. createGame({track}) races with
// wx||"dry", but we re-pin and assert wetness so a leftover wet enum / arc
// cannot silently rescale gripMult under the committed numbers.
let g = null;
before(async () => {
  g = await createGame({ track: "monza", wx: "dry" });
  g.apex.weather("dry");
  g.apex.step(0, 1);
});
after(() => { if (g) g.close(); });

test("A3: characterization boot pins dry weather and zero wetness", () => {
  assert.equal(g.G.raceWeather, "dry");
  assert.equal(g.G.trackWetness(), 0);
  assert.equal(g.G.trackWetness(), 0);
  assert.equal(g.G.frame.wetness || 0, 0);   // render() is the one producer now (unset until a frame renders; every reader defaults to 0)
  assert.equal(g.G.gripMult({ tread: 0 }), 1);
});

function run(a, s) {
  a.weather(s.wx || "dry");
  a.step(0, 1);
  a.seed(s.seed);
  a.reset(s.frac, s.speed, s.x || 0);
  if (s.aero) a.aero(true);
  if (s.boost) a.setBoost(true);
  const trace = [];
  for (const stage of s.steps) {
    a.setInput(stage.in);
    for (let i = 0; i < stage.n; i++) {
      a.step(1 / 60, 1);
      if (i % 15 === 0) {
        const p = a.physState();
        const row = [p.s, p.x, p.speed, p.slipDeg, p.head, p.prog];
        if (s.wide) { const c = a.carAt(); row.push(p.yawRate, c.gear, p.aeroX, c.energy); }
        if (s.ai != null) { const q = a.carAt(s.ai); row.push(q.s, q.x, q.speed); }
        trace.push(row.map(R));
      }
    }
  }
  a.clearInput();
  return trace;
}

const want = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
for (const s of SCENARIOS) {
  test(`"${s.name}" reproduces the browser baseline number for number`, () => {
    const w = want[s.name];
    assert.ok(Array.isArray(w), `baseline lacks scenario "${s.name}"`);
    const v = run(g.apex, s);
    assert.equal(v.length, w.length, `${v.length} rows vs baseline ${w.length}`);
    const fields = fieldsOf(s);
    for (let r = 0; r < w.length; r++) {
      assert.equal(w[r].length, fields.length, `baseline row ${r} has ${w[r].length} fields, recipe wants ${fields.length}`);
      for (let c = 0; c < fields.length; c++) {
        if (v[r][c] !== w[r][c]) {
          assert.fail(`diverges at step ${r * 15} field ${fields[c]}: vm=${v[r][c]} browser=${w[r][c]} ` +
            `(row vm=${JSON.stringify(v[r])} browser=${JSON.stringify(w[r])})`);
        }
      }
    }
  });
}
