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
  // Fleet COPY-ALL dawn|dry signature: godrayAniso/godrayBase/lampFlicker/
  // roadRough/ssrDryNight at extremes across ~50 tracks. Not this job's wet
  // pin retune — leave until a dawn|dry authenticity stamp lands.
  "abudhabi|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "albert_park|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "bahrain|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "baku|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "buenos_aires|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "catalunya|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "cota|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "estoril|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "hockenheim|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "hungaroring|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "imola|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "indianapolis|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "interlagos|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "istanbul|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "jacarepagua|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "jeddah|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "kyalami|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "madrid|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "magny_cours|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "mexico|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "miami|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "monaco|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "montreal|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "monza|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "mugello|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "nurburgring|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "paul_ricard|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "portimao|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "qatar|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "redbull|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "sepang|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "shanghai|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "silverstone|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "singapore|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "sochi|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "spa|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "suzuka|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "vegas|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "watkins_glen|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "zandvoort|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "fuji|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "jerez|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "korea|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "okayama|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "anderstorp|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "brands_hatch|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "buddh|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "dijon|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "donington|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "mont_tremblant|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "mosport|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
  "zolder|dawn|dry": "fleet dawn|dry COPY-ALL extremes (godray/roadRough/ssrDryNight)",
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
