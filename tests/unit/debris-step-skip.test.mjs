// Source contract for DebrisWorld's two-tier idle: skip world.step when every
// live body is asleep AND no car is inside FURN_WAKE_M, but keep JS despawn
// bookkeeping (and zero panel force) so marbleGrip / PANEL_IDLE_DESPAWN_S stay
// honest. A sleep-only WASM gate without those hoists is the trap the comments
// in step() record — this file fails the moment either helper or the skip
// path is deleted.
//
// Run: node --test tests/unit/debris-step-skip.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/game/debrisworld.js"), "utf8");

function extractFn(src, name) {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name}() not found in js/game/debrisworld.js — was it renamed?`);
  let depth = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error(`unbalanced braces reading ${name}()`);
}

test("asleep-skip helpers exist and share the despawn path with the WASM tick", () => {
  for (const name of ["_ageAndCullPool", "_carNearLiveDebris", "_needSolve", "_anyAwake", "_playerSample"]) {
    assert.match(SRC, new RegExp(`function ${name}\\(`), `${name} missing`);
  }
  const age = extractFn(SRC, "_ageAndCullPool");
  assert.match(age, /isSleeping\(\)/);
  assert.match(age, /restT/);
  assert.match(age, /setEnabled\(false\)/);
  const wake = extractFn(SRC, "_carNearLiveDebris");
  assert.match(wake, /FURN_WAKE_M/, "wake radius must stay the furniture constant");
  assert.match(wake, /_marbles/, "marbleGrip reads sleeping live marbles — they must wake the solve");
  const need = extractFn(SRC, "_needSolve");
  assert.match(need, /_anyAwake/);
  assert.match(need, /_carNearLiveDebris/);
  assert.match(need, /_carNearFurn/);
  assert.match(need, /_dynCars/);
});

test("step() skips world.step on the asleep path and zeros panel force first", () => {
  const step = extractFn(SRC, "step");
  const skipAt = step.indexOf("if (!_needSolve");
  const wasmAt = step.indexOf("world.step(_events)");
  assert.ok(skipAt >= 0, "tier-2 skip must gate on !_needSolve");
  assert.ok(wasmAt > skipAt, "world.step(_events) must stay on the needSolve path, after the skip return");
  const skipBody = step.slice(skipAt, step.indexOf("_tick++"));
  assert.match(skipBody, /_stepSkips\+\+/);
  assert.match(skipBody, /_ageAndCullPool/);
  assert.match(skipBody, /\.force = 0/);
  assert.match(skipBody, /updatePanels/);
  assert.doesNotMatch(skipBody, /world\.step/);
  assert.doesNotMatch(skipBody, /setNextKinematic/);
});

test("status() reports stepSkips; reset() zeroes it", () => {
  assert.match(extractFn(SRC, "status"), /stepSkips:\s*_stepSkips/);
  assert.match(extractFn(SRC, "reset"), /_stepSkips = 0/);
});

test("Rapier is not imported inside the boot burst; prime() starts it if a race comes first", () => {
  // create() used to call setEnabled(true) synchronously, which import()ed
  // 2.2 MB of Rapier + compiled its WASM while the shaders, the asset pack and
  // the first track were all in flight. The side-world is not needed before a
  // race is primed, so the load waits for an idle slice; prime() kicks it at
  // once if the player is faster, and step() builds the world lazily.
  const create = extractFn(SRC, "create");
  assert.doesNotMatch(create, /setEnabled\(true\)/, "create() must not start the Rapier load synchronously");
  assert.match(create, /requestIdleCallback\(kick, \{ timeout: \d+ \}\)/, "the boot kick waits for an idle slice");
  assert.match(create, /else setTimeout\(kick, \d+\)/, "Safari has no requestIdleCallback — a timer fallback is required");
  assert.match(extractFn(SRC, "prime"), /if \(_enabled && _loadState === 0\) _load\(\);/,
    "prime() must start the load when a race arrives before the deferred kick");
  assert.match(extractFn(SRC, "step"), /if \(!world\) buildWorld\(track, cars\);/,
    "step() builds lazily, so a load that lands after prime still gets a world");
});
