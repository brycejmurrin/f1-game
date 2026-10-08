/* light-presets-knob-range.test.mjs — every shipped preset value must sit inside
 * its TUNE_DEFS min/max (js/lighting/profiles.js clamps on apply; out-of-range
 * presets hide the true look from the tuner slider and duplicate dead pins).
 *
 * Run: node --test tests/unit/light-presets-knob-range.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** Knob-less preset keys allowed by design (none today — add with a comment why). */
const KNOBLESS_ALLOW = new Set([
  // e.g. "legacyAlias": reason
]);

function tuneDefs() {
  const ctx = vm.createContext({ GLX: { isMobile: false }, Math, Object });
  vm.runInContext(read("js/lighting/knobs.js"), ctx, { filename: "js/lighting/knobs.js" });
  return vm.runInContext("LightKnobs.TUNE_DEFS", ctx);
}

function presets() {
  const ctx = vm.createContext({ window: {}, Math, JSON, Object, Array });
  vm.runInContext(read("js/lighting/presets.js"), ctx, { filename: "js/lighting/presets.js" });
  const P = vm.runInContext("window.LightPresets", ctx);
  assert.ok(P && typeof P === "object", "presets.js did not assign window.LightPresets");
  return P;
}

test("every shipped preset value is inside its knob [min, max]", () => {
  const byId = Object.fromEntries(tuneDefs().map((d) => [d.id, d]));
  const P = presets();
  const bad = [];
  for (const [profile, map] of Object.entries(P)) {
    for (const [id, value] of Object.entries(map)) {
      if (typeof value !== "number") continue;
      if (KNOBLESS_ALLOW.has(id)) continue;
      const d = byId[id];
      if (!d) {
        bad.push(`${profile}: unknown knob ${id}=${value}`);
        continue;
      }
      if (value < d.min || value > d.max) {
        bad.push(`${profile}: ${id}=${value} outside [${d.min}, ${d.max}]`);
      }
    }
  }
  assert.deepEqual(bad, [],
    "a preset pins a knob outside its slider range — profiles.js clamps at runtime, " +
    "so the tuner cannot show the shipped value and the JSON lies about the look");
});
