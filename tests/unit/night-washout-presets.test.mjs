/* night-washout-presets.test.mjs — per-track night|dry mast / street pool trims.
 *
 * Qatar/Bahrain carry the full flood-mast ring fix (docs/notes/NIGHT-MAST-POOLS-2026-10-05.md).
 * Abu Dhabi, Madrid and Jeddah ship the same BEAM CORE / cone / bleed package when
 * lamp-bake + SwiftShader shots still read as a flat pool under tall masts or
 * dense street rows.
 *
 * Run: node --test tests/unit/night-washout-presets.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function presets() {
  const ctx = vm.createContext({ window: {}, Math, JSON, Object, Array });
  vm.runInContext(read("js/lighting/presets.js"), ctx, { filename: absSrc("js/lighting/presets.js") });
  return vm.runInContext("window.LightPresets", ctx);
}

test("night mast and street lamps use the shared dry pools with their local beam settings", () => {
  const P = presets();
  const knobs = "js/lighting/knobs.js";
  const defaults = vm.runInNewContext(read(knobs) + ";LightKnobs.LT", { GLX: { isMobile: false } }, { filename: absSrc(knobs) });
  for (const id of ["qatar", "bahrain", "abudhabi", "madrid", "jeddah"]) {
    const key = id + "|night|dry";
    assert.ok(P[key], key);
    const resolved = { ...defaults, ...P["*"], ...P["*|night|dry"], ...P[key] };
    for (const [knob, value] of Object.entries({
      // The fleet *|night|dry entry is the tip's (Bryce 2026-11-21 "A2: tip fleet entry"; retune #6046).
      poolEnergy: 0.6, keyMul: 1.2, lampRadiusMul: 0.8, bounceK: 0.06,
      beamCore: 0.5, beamCone: 0.5, bleedMul: 0.6, lampTemp: 0,
    })) assert.equal(resolved[knob], value, key + "." + knob);
    if (id === "qatar") assert.equal(resolved.ssrDryNight, 0.08);
  }
});
