/* career-lazy.test.mjs — LAZY_CAREER (#6955): ai-dev / regulations / experience load behind ensureCareerBody,
   and the regulations are re-applied when the bundle lands (engage() may have run before it). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import vm from "vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const m = require("../../tools/manifest.cjs");
const FILES = ["js/career/regulations.js", "js/career/ai-dev.js", "js/career/experience.js"];

test("manifest: LAZY_CAREER is the three career bodies and none is in FULL", () => {
  assert.deepEqual(m.LAZY_CAREER, FILES);
  assert.deepEqual(FILES.filter((f) => m.FULL.includes(f)), [], "none of them stays in FULL");
  assert.deepEqual(["js/career/career.js"].filter((f) => !m.FULL.includes(f)), [], "career.js stays FULL");
});

function makeBundle(career, loadImpl) {
  const ctx = vm.createContext({ ApexRoster: { ...m, LAZY_CAREER: FILES, LAZY_CAREER_EDGES: [] }, window: {},
    Log: { warn() {}, error() {}, info() {} }, Career: career, requestIdleCallback() { return 1; }, setTimeout() {} });
  vm.runInContext(readFileSync(path.join(ROOT, "js/core/lazy-bundles.js"), "utf8"), ctx, { filename: absSrc("js/core/lazy-bundles.js") });
  const create = vm.runInContext("LazyBundles.create", ctx);
  return { ctx, bundle: create({ els: {}, getContext: () => ({}), loadBackendScripts: (p, e, o) => loadImpl(ctx, p, e, o) }) };
}

test("ensureCareerBody re-applies the regulations (and persists) once the bundle lands", async () => {
  const calls = [];
  const career = { inCareer: () => true, applyRegs: () => { calls.push("apply"); return true; }, save: () => calls.push("save") };
  const { ctx, bundle } = makeBundle(career, async (c, paths, _e, opts) => {
    c.Regulations = {}; c.CareerAiDev = {}; c.CareerExperience = {};
    for (const f of paths) { assert.equal(opts.ready(f), true); opts.loaded.add(f); }
    return true;
  });
  assert.equal(ctx.Regulations, undefined, "absent before the bundle");
  assert.equal(await bundle.ensureCareerBody(), true);
  assert.deepEqual(calls, ["apply", "save"]);
  assert.equal(await bundle.ensureCareerBody(), true);
  assert.deepEqual(calls, ["apply", "save"], "memoised: no second load, no second apply");
});

test("ensureCareerBody does not apply outside a career, and retries after a failed load", async () => {
  const calls = [];
  let attempts = 0;
  const career = { inCareer: () => false, applyRegs: () => { calls.push("apply"); return true; }, save: () => calls.push("save") };
  const { ctx, bundle } = makeBundle(career, async (c, paths, _e, opts) => {
    if (++attempts === 1) return false;
    c.Regulations = {}; c.CareerAiDev = {}; c.CareerExperience = {};
    for (const f of paths) opts.loaded.add(f);
    return true;
  });
  assert.equal(await bundle.ensureCareerBody(), false);
  assert.equal(await bundle.ensureCareerBody(), true);
  assert.equal(attempts, 2);
  assert.deepEqual(calls, [], "a non-career flow gets no legality");
  assert.ok(ctx.Regulations);
});

test("already-resident modules (eager shell / game-vm) fetch and re-apply nothing", async () => {
  const career = { inCareer: () => true, applyRegs() { throw new Error("no re-apply"); } };
  const { ctx, bundle } = makeBundle(career, () => { throw new Error("no fetch"); });
  ctx.Regulations = {}; ctx.CareerAiDev = {}; ctx.CareerExperience = {};
  assert.equal(await bundle.ensureCareerBody(), true);
});
