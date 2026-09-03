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
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(HERE, "..", "data", "physics-baseline.json");

// Verbatim from the browser spec — the two lists must stay identical.
const SCENARIOS = [
  { name: "straight-line accel", seed: 7, frac: 0.05, speed: 20,
    steps: [{ n: 120, in: { throttle: true, steer: 0 } }] },
  { name: "steady corner load", seed: 7, frac: 0.28, speed: 55,
    steps: [{ n: 90, in: { throttle: true, steer: 0.6 } }] },
  { name: "trail brake into rotation", seed: 11, frac: 0.28, speed: 70,
    steps: [{ n: 45, in: { brake: true, steer: 0.5 } }, { n: 45, in: { throttle: true, steer: 0.3 } }] },
  { name: "off-track recovery", seed: 3, frac: 0.5, speed: 45, x: 11,
    steps: [{ n: 90, in: { throttle: true, steer: -0.4 } }] },
];
const FIELDS = ["s", "x", "speed", "slipDeg", "head", "prog"];
const R = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v * 1e4) / 1e4 : v);

test("the scenario list matches the browser spec verbatim", () => {
  const spec = fs.readFileSync(path.join(HERE, "..", "specs", "physics-characterization.spec.js"), "utf8");
  for (const s of SCENARIOS) assert.ok(spec.includes(`name: "${s.name}", seed: ${s.seed}, frac: ${s.frac}, speed: ${s.speed}`),
    `scenario "${s.name}" no longer matches the browser spec`);
  assert.ok(spec.includes("if (i % 15 === 0)") && spec.includes("Math.round(v * 1e4) / 1e4"), "spec sampling or rounding changed");
});

// ONE boot for the file (createGame ~2-3 s on this box); each scenario is its
// own test so a divergence is named by scenario and the per-test wall stays
// well under the 5 s budget. reset() between scenarios is what the browser
// spec does too — the run order is the recipe.
let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

function run(a, s) {
  a.seed(s.seed);
  a.reset(s.frac, s.speed, s.x || 0);
  const trace = [];
  for (const stage of s.steps) {
    a.setInput(stage.in);
    for (let i = 0; i < stage.n; i++) {
      a.step(1 / 60, 1);
      if (i % 15 === 0) {
        const p = a.physState();
        trace.push([p.s, p.x, p.speed, p.slipDeg, p.head, p.prog].map(R));
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
    for (let r = 0; r < w.length; r++) {
      for (let c = 0; c < FIELDS.length; c++) {
        if (v[r][c] !== w[r][c]) {
          assert.fail(`diverges at step ${r * 15} field ${FIELDS[c]}: vm=${v[r][c]} browser=${w[r][c]} ` +
            `(row vm=${JSON.stringify(v[r])} browser=${JSON.stringify(w[r])})`);
        }
      }
    }
  });
}
