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
import * as espree from "espree";
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

// Read only literal recipe data, never evaluate the browser module or import
// Playwright. Full AST equality catches durations, inputs, offsets and order.
function browserScenarios(source) {
  const ast = espree.parse(source, {ecmaVersion: "latest", sourceType: "module"});
  const literal = (node) => {
    if (node.type === "Literal") return node.value;
    if (node.type === "UnaryExpression" && node.operator === "-") return -literal(node.argument);
    if (node.type === "ArrayExpression") return node.elements.map(literal);
    if (node.type === "ObjectExpression") return Object.fromEntries(node.properties.map((p) => {
      assert.equal(p.type, "Property", "recipe must remain serializable data");
      return [p.key.name ?? p.key.value, literal(p.value)];
    }));
    assert.fail(`unsupported recipe node ${node.type}; keep browser and VM recipes comparable`);
  };
  const declaration = ast.body.filter((n) => n.type === "VariableDeclaration")
    .flatMap((n) => n.declarations).find((n) => n.id.name === "SCENARIOS");
  assert.ok(declaration, "browser recipe SCENARIOS is required");
  return literal(declaration.init);
}
const browserSource = () => fs.readFileSync(path.join(HERE, "..", "specs", "physics-characterization.spec.js"), "utf8");

test("the complete ordered scenario recipes match the browser spec", () => {
  const spec = browserSource();
  assert.deepEqual(browserScenarios(spec), SCENARIOS, "browser/VM recipe drift: compare every input, duration, lateral offset and scenario/stage order");
  assert.ok(spec.includes("if (i % 15 === 0)") && spec.includes("Math.round(v * 1e4) / 1e4"), "spec sampling or rounding changed");
  assert.ok(spec.includes("pinFactorySeat"),
    "browser characterization must pin factory McLaren before loadTrack so GarageDefaults cannot move the baseline");
});

test("recipe parity detects changes invisible to scenario-name checks", () => {
  const source = browserSource();
  for (const [from, to] of [["n: 120", "n: 121"], ["steer: 0.6", "steer: 0.7"],
    ["x: 11", "x: 12"], ["throttle: true, steer: 0", "throttle: false, steer: 0"]]) {
    assert.ok(source.includes(from), `mutation anchor missing: ${from}`);
    assert.notDeepEqual(browserScenarios(source.replace(from, to)), SCENARIOS, from);
  }
  const reordered = browserScenarios(source);
  reordered.reverse();
  assert.notDeepEqual(reordered, SCENARIOS, "scenario order matters");
  const stages = browserScenarios(source);
  stages.find((s) => s.name === "trail brake into rotation").steps.reverse();
  assert.notDeepEqual(stages, SCENARIOS, "stage order matters");
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
  a.weather("dry");
  a.step(0, 1);
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
