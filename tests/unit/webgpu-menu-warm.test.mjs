/* webgpu-menu-warm.test.mjs — D·W21b / #3279: WebGPU menu warm enables
 * warmPlus (post+shadow), idle-chunks those stages + cockpit, and records
 * where (menu|loading|race) on _warmHistory and RaceEntryProfile.
 *
 * Behaviour + source indexOf pins only (no regex source pins — #1682 ceiling).
 * Run: node --test tests/unit/webgpu-menu-warm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const TLX = read("js/render/three/tlx.js");
const CHUNKED = read("js/render/three/tlx-chunked.js");
const PROFILE = read("js/perf/race-entry-profile.js");

function loadProfile(env = {}) {
  const sandbox = { console, performance: { now: () => env.now ?? 1000 }, ...env };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(PROFILE.replace(/^const\b/m, "var"), sandbox, { filename: absSrc("js/perf/race-entry-profile.js") });
  return sandbox.RaceEntryProfile;
}

function loadIdleYield() {
  // Eval only the idleYield helper — full tlx-chunked.js needs THREE/Frustum.
  const a = CHUNKED.indexOf("function idleYield(timeoutMs)");
  const b = CHUNKED.indexOf("\n  // The cull helpers", a);
  assert.ok(a > 0 && b > a, "idleYield still in tlx-chunked.js");
  const sandbox = { setTimeout, requestIdleCallback: undefined, Promise };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(CHUNKED.slice(a, b) + "\nthis.idleYield = idleYield;", sandbox,
    { filename: absSrc("js/render/three/tlx-chunked.js") });
  return sandbox.idleYield;
}

test("TLXShaders.idleYield resolves (setTimeout fallback when rIC missing)", async () => {
  const idleYield = loadIdleYield();
  assert.equal(typeof idleYield, "function");
  assert.ok(CHUNKED.includes("idleYield,") || CHUNKED.includes("{ chunked, idleYield"), "idleYield exported on TLXShaders");
  const t0 = Date.now();
  await idleYield(10);
  assert.ok(Date.now() - t0 < 500, "idleYield should settle quickly under Node");
});

test("RaceEntryProfile.noteWarm records where; requestWarm still calls bare gfx.warm()", () => {
  const P = loadProfile();
  P.begin("startRace");
  P.noteWarm({ where: "menu", total: 12, post: 4, shadow: 2 });
  assert.equal(P.warmHistory().length, 1);
  assert.equal(P.warmHistory()[0].where, "menu");
  assert.equal(P.snapshot().warmHistory[0].where, "menu");
  assert.ok(P.snapshot().marks.some((m) => m.n === "warm:where:menu"));

  // flyby-intro pins requestWarm → gfx.warm() with no args; where is TLX-side.
  let warmCalls = 0;
  P.requestWarm({ warm() { warmCalls++; } }, false);
  assert.equal(warmCalls, 1);
  P.requestWarm({ warm() { warmCalls++; } }, true);
  assert.equal(warmCalls, 1, "alreadyWarmed skips gfx.warm");
  assert.equal(P.menuEntrySession(), false);
  const P2 = loadProfile();
  P2.beginUi("uiStart");
  assert.equal(P2.menuEntrySession(), true);
});

test("warmPlusOn is on for WebGPU only when where===menu (source behaviour)", () => {
  // Extract the warmPlusOn body by evaluating the closed-over helpers against stubs.
  const start = TLX.indexOf("function _resolveWarmWhere(opts)");
  const end = TLX.indexOf("const drawWarmOn = () =>", start);
  assert.ok(start > 0 && end > start, "warmPlusOn block still in tlx.js");
  const block = TLX.slice(start, end);
  // Pin shape via indexOf (canary still needs the same warmPlusOn / post gate text).
  assert.ok(block.includes('return _warmWhere === "menu"'), "WebGPU auto warmPlus only on menu");
  assert.ok(block.includes("isWebGLBackend"), "WebGL2 backend still forces warmPlus on");
  assert.ok(block.includes("warmIdleChunks"), "menu idle-chunk gate present");

  const stages = TLX.slice(TLX.indexOf("async function runProgramWarmStages"), TLX.indexOf("function startProgramWarm"));
  assert.ok(stages.includes("warmIdleChunks()") && stages.includes("_idleYield(48)"), "post/shadow idle yield");
  assert.ok(stages.includes("casterWarmOn()") && stages.includes("shadowSys.warm(casterSources())"), "A·W14 caster warm + probe layouts");
  assert.ok(stages.includes("post.warm && (warmPlusOn() || performance.now() - _warmAt < 3000)"), "canary post gate intact");

  const histAt = TLX.indexOf("const _warmRec = { where:");
  assert.ok(histAt > 0, "_warmHistory records where via _warmRec");
  const hist = TLX.slice(histAt, histAt + 700);
  assert.ok(hist.includes("_warmHistory.push(_warmRec)"), "pushes the where-tagged rec");
  assert.ok(hist.includes("RaceEntryProfile.noteWarm"), "forwards to RaceEntryProfile");

  const rig = TLX.slice(TLX.indexOf("function startRigWarm"), TLX.indexOf("const ENV_PROBE_TRIES"));
  assert.ok(rig.includes("warmIdleChunks()") && rig.includes("_idleYield(32)"), "cockpit pairs idle-chunked on menu");

  const warmApiAt = TLX.indexOf("warm(opts) {");
  assert.ok(warmApiAt > 0, "warm(opts) API present");
  const warmApi = TLX.slice(warmApiAt, warmApiAt + 200);
  assert.ok(warmApi.includes("_resolveWarmWhere(opts)"), "warm(opts) stamps where");
});

/** Lift the REAL warm-gate block out of tlx.js — from `let _warmPlus = null;`
 *  through the end of `const warmPlusOn = () => {...};` — and evaluate it with
 *  the free names it closes over (renderer, localStorage, RaceEntryProfile)
 *  injected. A local copy of the gate would test the copy, not the gate. */
const WARM_BLOCK = (() => {
  const a = TLX.indexOf("let _warmPlus = null;");
  const w = TLX.indexOf("const warmPlusOn = () => {", a);
  const b = TLX.indexOf("\n      };", w);
  assert.ok(a > 0 && w > a && b > w, "the _warmPlus / _resolveWarmWhere / warmPlusOn block moved — update this test");
  const block = TLX.slice(a, b + "\n      };".length);
  assert.ok(block.includes("function _resolveWarmWhere(opts)"), "_resolveWarmWhere is inside the lifted block");
  return block;
})();

function liftWarm({ backend = null, stored = null, profile } = {}) {
  const renderer = backend ? { backend: { isWebGLBackend: backend === "webgl" } } : null;
  const localStorage = { getItem: (k) => (k === "apex26.tlxWarmPlus" ? stored : null) };
  // eslint-disable-next-line no-new-func
  return new Function("renderer", "localStorage", "RaceEntryProfile",
    `"use strict";${WARM_BLOCK}\nreturn { warmPlusOn, _resolveWarmWhere, setWhere: (w) => { _warmWhere = w; } };`,
  )(renderer, localStorage, profile);
}

test("warmPlusOn evaluates: WebGL always; WebGPU menu yes / race no", () => {
  // The real gate, evaluated (no renderer boot). `forced` is the stored
  // apex26.tlxWarmPlus override: true -> "1", false -> "0", null -> unset.
  const mk = (backend, where, forced) => {
    const stored = forced === true ? "1" : forced === false ? "0" : null;
    const g = liftWarm({ backend, stored });
    g.setWhere(where);
    return g.warmPlusOn();
  };
  assert.equal(mk("webgl", "race", null), true);
  assert.equal(mk("webgl", "menu", null), true);
  assert.equal(mk("webgpu", "menu", null), true);
  assert.equal(mk("webgpu", "race", null), false);
  assert.equal(mk("webgpu", "loading", null), false);
  assert.equal(mk("webgpu", "race", true), true);    // apex26.tlxWarmPlus=1
  assert.equal(mk("webgpu", "menu", false), false);  // forced off
});

test("_resolveWarmWhere: explicit opts, RaceEntryProfile armed, else menu", () => {
  const P = loadProfile();
  // The real tlx.js helper, against a live profile.
  const resolve = (opts, profile) => liftWarm({ profile: profile || undefined })._resolveWarmWhere(opts);
  assert.equal(resolve({ where: "menu" }, null), "menu");
  assert.equal(resolve({ where: "race" }, null), "race");
  assert.equal(resolve({ where: "bogus" }, null), "menu");
  assert.equal(resolve(undefined, null), "menu");
  P.begin("startRace");
  assert.equal(resolve(undefined, P), "race");
  const P2 = loadProfile();
  P2.beginUi("ui");
  assert.equal(resolve(undefined, P2), "loading");
});
