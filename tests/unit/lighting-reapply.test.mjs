// A tuner knob consumed ONLY inside applyRaceSettings() must be in
// APPLY_RACE_IDS, or its slider does nothing.
//
// THE BUG THIS EXISTS FOR. js/lighting/profiles.js keeps APPLY_RACE_IDS: the
// knobs whose effect is baked into frame.*/frameSky.* by applyRaceSettings()
// rather than read per-frame in render(). set() re-runs applyRaceSettings when
// one of those moves, which is the only reason such a knob is live at all.
//
// Five knobs were missing from that set — nightAmbLift, cityGlowWarm,
// weatherSunMute, overcastFogMul, fogWxMul. Their value stored, the panel thumb
// moved, and the scene never changed, until a TIME/WEATHER chip or a track load
// happened to re-run applyRaceSettings for some other reason. That is a slider
// that is dead until you touch a DIFFERENT slider, and it is exactly what the
// "some of the lighting tuners don't work" reports were.
//
// Nothing caught it: the knobs are wired, their uniforms upload, the panel
// renders them, and the values round-trip. Every static check passed because
// the WIRING was never the problem — the INVALIDATION was. A browser sweep
// driving __apex.lightTune() cannot see it either, because that goes through
// the same set() that fails to reapply.
//
// So this guards the rule directly, from source: if every read of a knob lives
// in a file that only runs during applyRaceSettings, it must be registered.
//
// Run: node --test tests/unit/lighting-reapply.test.mjs  (npm run test:tooling-fast)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

// js/lighting/atmosphere.js exists to hold applyRaceSettings and its helpers — its
// module header says so — so a read there runs only when that function runs.
// _nightAmbientBand lives in game.js but has no other caller (asserted below),
// which is what made nightAmbLift the least obvious of the five.
const APPLY_ONLY_FILES = ["js/lighting/atmosphere.js"];

function tuneDefs() {
  const sandbox = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  seedLog(sandbox);
  for (const f of ["js/lighting/knobs.js", "js/lighting/track-lights.js", "js/lighting/frame-lights.js", "js/lighting/lighting.js"])
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), sandbox);
  return sandbox.LightTune.TUNE_DEFS;
}

function applyRaceIds() {
  const src = read("js/lighting/profiles.js");
  const m = src.match(/APPLY_RACE_IDS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(m, "could not find APPLY_RACE_IDS in js/lighting/profiles.js");
  return new Set([...m[1].matchAll(/"([A-Za-z0-9_]+)"/g)].map((x) => x[1]));
}

// Strip the TUNE_DEFS array so a knob's own declaration is not counted as a read.
function knobsBody() {
  const s = read("js/lighting/knobs.js");
  const a = s.indexOf("const TUNE_DEFS = [");
  let i = s.indexOf("[", a), depth = 0, end = -1;
  for (; i < s.length; i++) {
    if (s[i] === "[") depth++;
    else if (s[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  return s.slice(0, a) + s.slice(end);
}

test("_nightAmbientBand is only reached from applyRaceSettings", () => {
  // The premise behind treating game.js's _nightAmbientBand as apply-only. If a
  // per-frame caller ever appears, knobs read there stop needing registration
  // and this test's model is wrong — so assert the premise rather than assume it.
  const callers = [];
  for (const f of ["js/game.js", "js/lighting/atmosphere.js"]) {
    for (const line of read(f).split("\n")) {
      if (/_nightAmbientBand\s*\(/.test(line) && !/function _nightAmbientBand/.test(line)) callers.push(f);
    }
  }
  assert.deepEqual([...new Set(callers)].sort(), ["js/game.js", "js/lighting/atmosphere.js"],
    "_nightAmbientBand gained a caller outside atmosphere.js/game.js — re-check APPLY_RACE_IDS");
});

test("every apply-only knob is registered in APPLY_RACE_IDS", () => {
  const defs = tuneDefs();
  const registered = applyRaceIds();
  const sources = new Map([
    ["js/lighting/knobs.js", knobsBody()],
    ["js/lighting/track-lights.js", read("js/lighting/track-lights.js")],
    ["js/lighting/frame-lights.js", read("js/lighting/frame-lights.js")],
    ["js/game.js", read("js/game.js")],
    ["js/lighting/atmosphere.js", read("js/lighting/atmosphere.js")],
    ["js/fx/particles.js", read("js/fx/particles.js")],
    ["js/render/glx.js", read("js/render/glx.js")],
    ["js/render/glx/post.js", read("js/render/glx/post.js")],
    ["js/render/glx/shadow.js", read("js/render/glx/shadow.js")],
  ]);

  // Brace-match the real _nightAmbientBand body once.
  const gsrc = sources.get("js/game.js");
  const nbStart = gsrc.indexOf("function _nightAmbientBand");
  assert.ok(nbStart >= 0, "function _nightAmbientBand not found in js/game.js");
  let bi = gsrc.indexOf("{", nbStart), bdepth = 0, bend = -1;
  for (; bi < gsrc.length; bi++) {
    if (gsrc[bi] === "{") bdepth++;
    else if (gsrc[bi] === "}") { bdepth--; if (bdepth === 0) { bend = bi; break; } }
  }
  const nightBand = gsrc.slice(nbStart, bend + 1);

  const missing = [];
  for (const d of defs) {
    if (registered.has(d.id)) continue;
    // A qualified read only: `<obj>.<id>`. A bare-word scan collides with
    // ordinary identifiers (`toe`, `shoulder`, `grain` all name other things).
    // NO /g flag: RegExp.test() with /g is stateful (it advances lastIndex), so
    // reusing one across the file loop below silently skips matches.
    const re = new RegExp(`[A-Za-z_$][A-Za-z0-9_$]*\\.${d.id}\\b`);
    const where = [];
    for (const [file, src] of sources) if (re.test(src)) where.push(file);
    if (!where.length) continue;                       // read elsewhere; not our business
    const applyOnly = where.every((f) => APPLY_ONLY_FILES.includes(f));
    // game.js counts as apply-only for a knob whose ONLY game.js read is inside
    // _nightAmbientBand — the case nightAmbLift was. Search the EXTRACTED
    // function body: a regex spanning from the declaration matches most of
    // game.js and wrongly indicts every per-frame knob (grMul, aoStr, ...).
    const nightBandOnly = where.length === 1 && where[0] === "js/game.js" &&
      new RegExp(`[A-Za-z_$][A-Za-z0-9_$]*\\.${d.id}\\b`).test(nightBand);
    if (applyOnly || nightBandOnly) missing.push(`${d.id} (read only in ${where.join(", ")})`);
  }

  assert.deepEqual(missing, [],
    "these knobs are consumed only where applyRaceSettings runs, so dragging their slider does\n" +
    "NOTHING until something else re-runs it. Add them to APPLY_RACE_IDS in js/lighting/profiles.js:\n  " +
    missing.join("\n  "));
});
