/* drill-grip.test.mjs — LEARN's friction-circle drill (js/learn-drills/grip.js, #7040 / #6559 step 4): the pure dot,
 * the medal rule and the registry's variant plumbing. The VM run (deterministic score and medal over two runs) is the
 * hand-off's next step (PR body). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const abs = (rel) => fileURLToPath(new URL("../../" + rel, import.meta.url));
const src = (rel) => readFileSync(abs(rel), "utf8");
function load() {
  const ctx = vm.createContext({ console, Math, Object, Array, Number, String, Map, Set, Error, Float32Array });
  for (const rel of ["js/learn-drills/registry.js", "js/learn-drills/grip.js"]) vm.runInContext(src(rel), ctx, { filename: abs(rel) });
  return ctx;
}

test("the dot: y is the brake's share, x the lateral use of what it left; the rim is radius 1", () => {
  const GripDrill = vm.runInContext("GripDrill", load());
  assert.deepEqual({ ...GripDrill.circle({ axFrac: 1, frontUtil: 1, rearUtil: 0 }) }, { x: 0, y: 1, r: 1 });
  const half = GripDrill.circle({ axFrac: 0.6, frontUtil: 0.2, rearUtil: 1 });
  assert.ok(Math.abs(half.x - 0.8) < 1e-9 && Math.abs(half.r - 1) < 1e-9, "full lateral use of the left budget is on the rim");
  const mid = GripDrill.circle({ axFrac: 0, frontUtil: 0.5, rearUtil: 0.4 });
  assert.equal(mid.r, 0.5);
  assert.equal(GripDrill.circle({ axFrac: 2, frontUtil: 3 }).r, 1, "capped at 1");
});

test("medals: bronze is a clean run, silver 75 %, gold 88 % within 0.15 s of the best TRAIL gate", () => {
  const GripDrill = vm.runInContext("GripDrill", load());
  const run = (value, variant, gateS, clean = true) => ({ value, variant, gateS, clean });
  assert.equal(GripDrill.medals(run(95, "trail", 8, false), []), null);
  assert.equal(GripDrill.medals(run(40, "vline", 8), []), "bronze");
  assert.equal(GripDrill.medals(run(80, "vline", 8), []), "silver");
  assert.equal(GripDrill.medals(run(90, "vline", 8), []), "silver", "no TRAIL run yet: no gate to be within");
  assert.equal(GripDrill.medals(run(90, "trail", 8), []), "gold");
  assert.equal(GripDrill.medals(run(90, "trail", 8.2), [run(85, "trail", 8)]), "silver", "0.2 s off the best TRAIL gate");
  assert.equal(GripDrill.medals(run(90, "free", 8.1), [run(85, "trail", 8)]), "gold");
});

test("the drill registers on the braking lesson with three variants and the grip goal", () => {
  const ctx = load();
  const d = vm.runInContext("DrillRegistry.get('grip')", ctx);
  assert.equal(d.lesson, "braking");
  assert.equal(d.goal, "grip");
  assert.deepEqual(Array.from(d.variants, v => v.id), ["vline", "trail", "free"]);
  assert.equal(d.setup.session, "tt", "solo: a Time Trial grid is the player alone");
  assert.equal(vm.runInContext("GripDrill.define() === DrillRegistry.get('grip')", ctx), true, "define is idempotent");
});
