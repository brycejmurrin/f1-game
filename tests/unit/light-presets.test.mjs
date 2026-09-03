/* light-presets.test.mjs — the shipped lighting values must name real knobs.
 *
 * js/lighting/presets.js is 255 profiles carrying 1,921 individual knob
 * settings, keyed "trackId|timeOfDay|weather", and it IS the look everyone sees
 * on the deployed build. Each key inside a profile is a `TUNE_DEFS` id.
 *
 * NOTHING CONNECTS THE TWO FILES. The presets are a baked export from the
 * in-game LIGHTING TUNER's COPY VALUES button — a data blob pasted in — and the
 * resolution in js/lighting/profiles.js reads `typeof L[d.id] === "number"`,
 * iterating TUNE_DEFS and looking each id up in the profile. A knob renamed in
 * lighting.js therefore does not throw and does not warn: the lookup simply
 * misses, the value falls back to the default, and every shipped profile that
 * set it silently stops applying. On a per-track basis, at night, in the rain —
 * conditions nobody checks after an unrelated rename.
 *
 * This is the same shape as the stale golden baseline found in the 2026-08 pass
 * (A18 in docs/ARCHITECTURE-REVIEW.md): a committed ARTIFACT that encodes the
 * state of another file, where the two can diverge without anything being
 * syntactically wrong. Those are exactly the ones worth a guard, because the
 * failure mode is silence rather than an error.
 *
 * Green when written — all 1,921 settings resolve. The point is that it stays
 * that way through the next rename.
 *
 * Run: node --test tests/unit/light-presets.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** Every `id:` in TUNE_DEFS. Read from source rather than evaluated: lighting-knobs.js
 *  reaches for browser globals at load, and the id list is a flat literal. */
function tuneIds() {
  return new Set([...read("js/lighting/knobs.js").matchAll(/id:\s*"(\w+)"/g)].map((m) => m[1]));
}

/** The presets file assigns `window.LightPresets`; run it against a stub window. */
function presets() {
  const ctx = vm.createContext({ window: {}, Math, JSON, Object, Array });
  vm.runInContext(read("js/lighting/presets.js"), ctx, { filename: "js/lighting/presets.js" });
  const P = vm.runInContext("window.LightPresets", ctx);
  assert.ok(P && typeof P === "object", "light-presets.js did not assign window.LightPresets");
  return P;
}

test("every shipped preset knob is a real TUNE_DEFS id", () => {
  const ids = tuneIds();
  assert.ok(ids.size > 100, `only found ${ids.size} TUNE_DEFS ids — the scan broke, not the file`);

  const P = presets();
  const orphans = new Map();          // unknown id -> profiles that set it
  let settings = 0;
  for (const key of Object.keys(P)) {
    for (const id of Object.keys(P[key])) {
      settings++;
      if (ids.has(id)) continue;
      if (!orphans.has(id)) orphans.set(id, []);
      orphans.get(id).push(key);
    }
  }
  assert.ok(settings > 500, `only ${settings} knob settings found — the scan broke`);

  const bad = [...orphans.entries()]
    .map(([id, keys]) => `${id} (set by ${keys.length} profile(s), e.g. "${keys[0]}")`)
    .sort();
  assert.deepEqual(bad, [],
    "a shipped lighting preset names a knob that no longer exists in TUNE_DEFS. It will not throw — " +
    "the resolution in js/lighting/profiles.js just misses the lookup and falls back to the default, " +
    "so the shipped look for those conditions quietly stops applying. Rename it here too, or drop it.");
});

test("the global baseline profile, if present, is a plain knob map", () => {
  // "*" is the optional global baseline and resolves BELOW every per-condition
  // profile. A nested object here (a track key pasted one level too deep, which
  // is the natural COPY VALUES slip) would be read as a knob whose value is not
  // a number, and js/lighting/profiles.js's `typeof === "number"` test would skip
  // it — silently, and for every condition at once.
  const P = presets();
  if (!P["*"]) return;
  const wrong = Object.entries(P["*"]).filter(([, v]) => typeof v !== "number").map(([k]) => k);
  assert.deepEqual(wrong, [],
    'the "*" baseline holds a non-numeric value — a profile pasted one level too deep is skipped in silence');
});
