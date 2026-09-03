// A tuner knob consumed ONLY inside buildTrackLights() must carry `rebuild:true`,
// or its slider does nothing until the track is reloaded.
//
// THE INVARIANT. js/game/track-lights.js builds the static lamp/floodlight geometry
// in buildTrackLights() and caches it on track._lights. That cache is only
// rebuilt when something nulls it: js/game/light-store.js set() does so via
// liveEffects(rebuilt=…), and `rebuilt` is true exactly when a moved knob has
// d.rebuild. So a knob whose value is baked into the lamp geometry — read only
// inside buildTrackLights — needs rebuild:true, or set() leaves the stale
// _lights in place and the edit is invisible until a track load happens to
// rebuild for another reason. That is the same failure shape as the
// APPLY_RACE_IDS bug (see lighting-reapply.test.mjs), one layer down: there the
// missing invalidation was applyRaceSettings, here it is the light rebuild.
//
// A knob read in a PER-FRAME light function (setFrameLights, appendCarTailLights,
// lampCap) is live immediately regardless of rebuild, because those run every
// frame off the live LT object — so this only fires for knobs whose reads are
// ALL inside the build path. As of writing, the five build-only knobs
// (poolEnergy, lampRadiusMul, bleedMul, beamCone, lampGapFill) all carry
// rebuild:true; this keeps the sixth from shipping without it.
//
// Run: node --test tests/unit/lighting-rebuild.test.mjs  (npm run test:tooling-fast)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

function tuneDefs() {
  const sb = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array };
  sb.window = sb; vm.createContext(sb);
  seedLog(sb);
  for (const f of ["js/game/lighting-knobs.js", "js/game/track-lights.js", "js/game/frame-lights.js", "js/game/lighting.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), sb);
  return sb.LightTune.TUNE_DEFS;
}

// Brace-match a top-level `function <name>(` body out of a source string.
function extractFn(src, name) {
  const a = src.indexOf(`function ${name}(`);
  if (a < 0) return null;
  let i = src.indexOf("{", a), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { if (--depth === 0) return src.slice(a, i + 1); }
  }
  return null;
}

// The build path is js/game/track-lights.js and the per-frame path
// js/game/frame-lights.js (the registry is lighting-knobs.js); extractFn walks
// the three as one source so the split cannot hide a function from it.
const LIGHTING = ["js/game/lighting-knobs.js", "js/game/track-lights.js", "js/game/frame-lights.js"].map(read).join("\n");
// The build path: buildTrackLights and its helper floodColor (called only from
// the build). The per-frame path: functions render() calls each frame.
const BUILD_FNS = ["buildTrackLights", "floodColor", "applyLampDensity", "lampDensityFactor", "lampStrideNodes", "lampStrideM"];
const FRAME_FNS = ["setFrameLights", "appendCarTailLights", "lampCap", "capRadius2"];

test("the light functions this test models still exist", () => {
  for (const n of [...BUILD_FNS, ...FRAME_FNS])
    assert.ok(extractFn(LIGHTING, n), `function ${n} not found in js/game/track-lights.js / frame-lights.js — the build/frame split this test relies on has changed`);
});

test("floodColor is not called from a per-frame path", () => {
  // The premise for counting floodColor as build-only. If a per-frame caller
  // appears, a knob read there is live every frame and this test's model is wrong.
  const callers = [];
  for (const n of FRAME_FNS) {
    const body = extractFn(LIGHTING, n) || "";
    if (/\bfloodColor\s*\(/.test(body)) callers.push(n);
  }
  assert.deepEqual(callers, [],
    `floodColor is now called from ${callers.join(", ")} — re-check which knobs count as build-only`);
});

test("every build-only knob carries rebuild:true", () => {
  const defs = tuneDefs();
  const buildSrc = BUILD_FNS.map((n) => extractFn(LIGHTING, n) || "").join("\n");
  const frameSrc = FRAME_FNS.map((n) => extractFn(LIGHTING, n) || "").join("\n");

  const offenders = [];
  for (const d of defs) {
    // A read of this knob's live value: LT.<id>. No /g — RegExp.test with /g is
    // stateful and would skip matches across the reused object.
    const re = () => new RegExp(`\\bLT\\.${d.id}\\b`);
    const inBuild = re().test(buildSrc);
    const inFrame = re().test(frameSrc);
    if (inBuild && !inFrame && !d.rebuild)
      offenders.push(`${d.id} (group ${d.group}) — read in buildTrackLights, no per-frame read, missing rebuild:true`);
  }
  assert.deepEqual(offenders, [],
    "these knobs are baked into the lamp geometry by buildTrackLights but never invalidate it, so\n" +
    "dragging their slider does NOTHING until the track reloads. Add `rebuild: true` to their\n" +
    "TUNE_DEFS entry in js/game/lighting-knobs.js:\n  " + offenders.join("\n  "));
});

test("LAMPS tuner group merges the old FLOODLIGHTS + LAMP BEHAVIOUR tabs", () => {
  const defs = tuneDefs();
  const lamp = defs.filter((d) => d.group === "LAMPS");
  assert.ok(lamp.length >= 20, `expected unified LAMPS tab, got ${lamp.length}`);
  assert.equal(defs.filter((d) => d.group === "FLOODLIGHTS").length, 0);
  assert.equal(defs.filter((d) => d.group === "LAMP BEHAVIOUR").length, 0);
  assert.ok(lamp.some((d) => d.id === "lampLevel" && d.section === "POOLS"));
  assert.ok(lamp.some((d) => d.id === "lampCull" && d.section === "BEHAVIOUR"));
  assert.ok(lamp.some((d) => d.id === "lampDensity" && d.rebuild), "LAMP DENSITY must rebuild lights");
  assert.equal(defs.find((d) => d.id === "floodDay").label, "DAYTIME LAMPS");
});
