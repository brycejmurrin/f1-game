/* light-grid.test.mjs — every shipped lighting value must be REACHABLE on its
 * own slider.
 *
 * The LIGHTING TUNER renders each knob as `<input type="range" min step>`, so
 * the thumb can only ever land on min + k*step. A shipped preset value that is
 * not on that grid cannot be represented: the readout prints the true value
 * while the thumb snaps to the nearest notch, and the two disagree on screen.
 *
 * The damage is not cosmetic. js/game/light-store.js `set()` stores a player
 * override whenever the incoming value differs from `fallback(id)` — and
 * `fallback` includes the SHIPPED preset for the current condition. With
 * keyMul shipped at 0.85 against a 0.02 grid, the slider can only emit 0.84 or
 * 0.86, so:
 *   - the first nudge writes an override and the profile flips to "(1 tuned)",
 *     even if the player was only trying to put it back where it was; and
 *   - 0.85 is then unreachable through the UI forever — only RESET restores it.
 * MEASURED before this guard: 481 of the 1,921 shipped values (25%), across 30
 * knobs, plus two TUNE_DEFS defaults (godrayLowBoost 0.55, shadowStr 1.15)
 * which were off their OWN slider's grid.
 *
 * The fix was to refine the step on the affected knobs to 0.01 rather than
 * round the presets: 0.01 divides the old 0.02/0.05 steps, so every previously
 * reachable value stays reachable and NO shipped value changed — the baked
 * look, which was tuned by eye, is untouched. Rounding the presets instead
 * would have edited 481 hand-tuned values to fit the widget.
 *
 * Run: node --test tests/unit/light-grid.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** TUNE_DEFS entries are object literals, usually one per line — but at least
 *  one (carEnvCube) wraps, so split on the `{ id:` boundary rather than by
 *  line. A knob whose `def` is a runtime expression rather than a literal
 *  (carEnvCube again, which is tier-gated on GLX.isMobile) yields def
 *  undefined; its range is still checked, its default is skipped. */
function defs() {
  const src = read("js/game/lighting.js");
  const starts = [...src.matchAll(/\{\s*id:\s*"(\w+)"/g)];
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const chunk = src.slice(starts[i].index,
      i + 1 < starts.length ? starts[i + 1].index : starts[i].index + 4000);
    const num = (k) => {
      const m = chunk.match(new RegExp(`\\b${k}:\\s*(-?[\\d.]+)`));
      return m ? Number(m[1]) : undefined;
    };
    const d = { id: starts[i][1], min: num("min"), max: num("max"), step: num("step"), def: num("def") };
    if (d.min === undefined || d.step === undefined) continue;
    out.push(d);
  }
  return out;
}

/** The presets file assigns `window.LightPresets`; run it against a stub window. */
function presets() {
  const ctx = vm.createContext({ window: {}, Math, JSON, Object, Array });
  vm.runInContext(read("js/game/light-presets.js"), ctx, { filename: "js/game/light-presets.js" });
  return vm.runInContext("window.LightPresets", ctx);
}

/** Grid test done in INTEGER space. A float test is wrong here: (0.06-0)/0.02
 *  is 2.9999999999999996, so `% 1` flags 223 perfectly on-grid values as off.
 *  Scale by the decimals actually present and use integer remainder. */
const decimals = (x) => {
  const s = String(x), i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
};
function onGrid(v, min, step) {
  const p = Math.max(decimals(v), decimals(min), decimals(step)) + 2;
  const k = Math.round(10 ** p);
  const s = Math.round(step * k);
  return s !== 0 && Math.round((v - min) * k) % s === 0;
}

test("the integer grid test does not trip on binary-float representation", () => {
  // Guards the guard: these are all exactly on-grid, and a naive
  // ((v-min)/step) % 1 check calls every one of them off-grid.
  assert.ok(onGrid(0.06, 0, 0.02), "0.06 is 3 steps of 0.02");
  assert.ok(onGrid(1.15, 0, 0.01), "1.15 is 115 steps of 0.01");
  assert.ok(onGrid(2.5, 0.2, 0.05), "2.5 is 46 steps of 0.05 from 0.2");
  assert.ok(!onGrid(0.85, 0, 0.02), "0.85 is half a step off a 0.02 grid");
  assert.ok(!onGrid(0.58, 0, 0.05), "0.58 is not on a 0.05 grid");
});

test("every TUNE_DEFS default sits on its own slider's step grid", () => {
  const D = defs();
  assert.ok(D.length > 150, `only parsed ${D.length} knobs — the scan broke, not the file`);
  const bad = D
    .filter((d) => d.def !== undefined && !onGrid(d.def, d.min, d.step))
    .map((d) => `${d.id}: def ${d.def} is off the ${d.step} grid from ${d.min}`);
  assert.deepEqual(bad, [],
    "a knob's own shipped default cannot be selected on its slider — the thumb snaps to a " +
    "neighbouring notch while the readout prints the true value. Refine the knob's step so " +
    "the default lands on grid (a step that DIVIDES the old one keeps every existing value " +
    "reachable); do not round the default to fit the widget.");
});

test("every shipped preset value sits on its knob's step grid", () => {
  const byId = new Map(defs().map((d) => [d.id, d]));
  const P = presets();
  assert.ok(P && typeof P === "object", "light-presets.js did not assign window.LightPresets");

  const offenders = new Map();   // id -> {count, sample}
  let checked = 0;
  for (const key of Object.keys(P)) {
    for (const [id, v] of Object.entries(P[key])) {
      const d = byId.get(id);
      if (!d || typeof v !== "number") continue;
      checked++;
      if (onGrid(v, d.min, d.step)) continue;
      const rec = offenders.get(id) || { count: 0, sample: `${v} in "${key}"` };
      rec.count++;
      offenders.set(id, rec);
    }
  }
  assert.ok(checked > 1500, `only ${checked} values checked — the scan broke, not the file`);

  const bad = [...offenders.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([id, r]) => `${id} x${r.count} (e.g. ${r.sample}, step ${byId.get(id).step})`);
  assert.deepEqual(bad, [],
    "a shipped lighting preset holds a value its own slider cannot select. The thumb snaps to " +
    "the nearest notch, and because light-store.js set() stores anything differing from " +
    "fallback(id), the player's first nudge silently persists the SNAPPED value as an override " +
    "and flips the profile to \"(N tuned)\". Refine that knob's step to a divisor of the " +
    "current one rather than rounding the preset.");
});
