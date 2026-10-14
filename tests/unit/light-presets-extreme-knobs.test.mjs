/* light-presets-extreme-knobs.test.mjs — flag per-track pins that park ≥3
 * knobs at their TUNE_DEFS range extremes (within 2 % of min or max).
 *
 * Extremes are a smell: a COPY-ALL paste or a "crank the slider" pass that
 * fights the shared *|tod|wx stamps. Intentional ones stay on ALLOWLIST with
 * a reason. Shared stamps ("*" / "*|…") are out of scope — they are the
 * baseline the per-track layer overrides.
 *
 * Run: node --test tests/unit/light-presets-extreme-knobs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** Fraction of [min, max] that counts as "at the extreme". */
const EXTREME_FRAC = 0.02;
/** A profile fails when this many knobs sit at an extreme. */
const EXTREME_COUNT = 3;

/**
 * Per-track keys allowed to keep ≥3 extreme knobs, with a reason.
 * Prefer deleting pins over growing this list (Lighting R4 #3).
 */
const ALLOWLIST = {
  // dawn|dry COPY-ALL extremes (godrayAniso/godrayBase/lampFlicker/roadRough/
  // ssrDryNight) moved onto *|dawn|dry in Lighting R4 #5a — drop the 52
  // per-track allowlist rows; shared stamps are out of scope.
  // Monaco night: R4 #3 dropped sunTemp/ssrWetMul/whites/toe; remaining
  // extremes are intentional city-chunk / car-paint pins.
  "monaco|night|wet": "after R4 #3 wet-pin trim: blacks/carEnvCube/carReflect/perChunkLights/roadChunkLamps still intentional",
  "monaco|night|dry": "Monaco harbour chunk lamps (perChunkLights/roadChunkLamps) + lampFlicker/surfDetail",
  "nurburgring|dusk|dry": "dusk dry COPY-ALL bleed/bounce/godray extremes — not wet-pin scope",
  "anderstorp|dusk|dry": "dusk dry COPY-ALL bleed/bounce/godray extremes — not wet-pin scope",
};

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

function atExtreme(def, value) {
  if (!def || typeof value !== "number") return null;
  const span = def.max - def.min;
  if (!(span > 0)) return null;
  const tol = EXTREME_FRAC * span;
  if (Math.abs(value - def.min) <= tol) return "min";
  if (Math.abs(value - def.max) <= tol) return "max";
  return null;
}

function extremePins(P, byId) {
  const out = [];
  for (const [key, map] of Object.entries(P)) {
    if (key === "*" || key.startsWith("*|")) continue; // shared stamps — not per-track
    const hits = [];
    for (const [id, value] of Object.entries(map)) {
      const side = atExtreme(byId[id], value);
      if (side) hits.push(`${id}=${value}@${side}`);
    }
    if (hits.length >= EXTREME_COUNT) out.push({ key, hits });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

test("per-track pins with >=3 knobs at range extremes are allowlisted", () => {
  const byId = Object.fromEntries(tuneDefs().map((d) => [d.id, d]));
  const P = presets();
  const fails = extremePins(P, byId);
  const unlisted = [];
  const stale = [];
  for (const f of fails) {
    if (!ALLOWLIST[f.key]) unlisted.push(`${f.key}: ${f.hits.join(", ")}`);
  }
  for (const key of Object.keys(ALLOWLIST)) {
    if (!fails.some((f) => f.key === key)) stale.push(key);
  }
  assert.deepEqual(unlisted, [],
    "a per-track lighting pin parks ≥3 knobs at range extremes without an ALLOWLIST reason — " +
    "pull them toward the shared *|tod|wx stamp (prefer deleting), or add a reason");
  assert.deepEqual(stale, [],
    "ALLOWLIST names a profile that no longer has ≥3 extreme knobs — drop the stale entry");
});
