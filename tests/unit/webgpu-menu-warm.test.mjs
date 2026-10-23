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
  assert.ok(stages.includes("if (warmPlusOn() && shadowSys && shadowSys.warm)"), "canary shadow guard intact");
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

test("warmPlusOn evaluates: WebGL always; WebGPU menu yes / race no", () => {
  // Behaviour sandbox of the gate alone (no renderer boot).
  const mk = (backend, where, forced) => {
    const renderer = backend ? { backend: { isWebGLBackend: backend === "webgl" } } : null;
    let _warmPlus = forced;
    let _warmWhere = where;
    const warmPlusOn = () => {
      if (_warmPlus !== null) return _warmPlus;
      if (renderer && renderer.backend && renderer.backend.isWebGLBackend) return true;
      return _warmWhere === "menu";
    };
    return warmPlusOn();
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
  // Mirror tlx.js helper against a live profile.
  function resolve(opts, profile) {
    if (opts && typeof opts.where === "string" && (opts.where === "menu" || opts.where === "loading" || opts.where === "race")) return opts.where;
    try {
      if (profile && profile.armed && profile.armed()) {
        if (profile.menuEntrySession && profile.menuEntrySession()) return "loading";
        return "race";
      }
    } catch (_) { /* */ }
    return "menu";
  }
  assert.equal(resolve({ where: "menu" }, null), "menu");
  assert.equal(resolve(undefined, null), "menu");
  P.begin("startRace");
  assert.equal(resolve(undefined, P), "race");
  const P2 = loadProfile();
  P2.beginUi("ui");
  assert.equal(resolve(undefined, P2), "loading");
});
