/* XROpts + ApexXR bootPick — VR settings keys and the non-persisting override. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function makeStorage(seed) {
  const disk = new Map(Object.entries(seed || {}));
  return {
    getItem(k) { return disk.has(k) ? disk.get(k) : null; },
    setItem(k, v) { disk.set(k, String(v)); },
    removeItem(k) { disk.delete(k); },
    _disk: disk,
  };
}

function bootOpts(lsSeed, ssSeed) {
  const ls = makeStorage(lsSeed);
  const ss = makeStorage(ssSeed);
  const ctx = vm.createContext({
    console, Math,
    localStorage: ls,
    sessionStorage: ss,
    navigator: { xr: {}, gpu: {}, userAgent: "Mozilla/5.0" },
    document: undefined,
    location: { reload() {} },
  });
  seedLog(ctx);
  ctx.GameStore = {
    store: {
      raw(k) {
        const key = k.startsWith("apex26.") ? k : "apex26." + k;
        return ls.getItem(key);
      },
      rawSet(k, v) {
        const key = k.startsWith("apex26.") ? k : "apex26." + k;
        ls.setItem(key, v);
        return true;
      },
    },
  };
  vm.runInContext(read("js/xr/xr-plan.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-plan.js" });
  vm.runInContext(read("js/xr/xr-opts.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-opts.js" });
  vm.runInContext(read("js/xr/apex-xr.js").replace(/^const\b/gm, "var"), ctx, { filename: "apex-xr.js" });
  return { ctx, ls, ss };
}

test("XROpts defaults: xr off, xrBackend webgl2", () => {
  const { ctx } = bootOpts({});
  assert.equal(ctx.XROpts.xr(), false);
  assert.equal(ctx.XROpts.xrBackend(), "webgl2");
});

test("XROpts garbage values fall back to defaults", () => {
  const { ctx } = bootOpts({ "apex26.xr": "yes", "apex26.xrBackend": "vulkan" });
  assert.equal(ctx.XROpts.xr(), false);
  assert.equal(ctx.XROpts.xrBackend(), "webgl2");
});

test("XROpts keys use the apex26. prefix", () => {
  const { ctx, ls } = bootOpts({});
  ctx.XROpts.setXr(true);
  ctx.XROpts.setXrBackend("webgpu");
  assert.equal(ls.getItem("apex26.xr"), "1");
  assert.equal(ls.getItem("apex26.xrBackend"), "webgpu");
  assert.equal(ls.getItem("apex26.gfxBackend"), null, "must not write gfxBackend");
});

test("arming VR does not modify apex26.gfxBackend (bootPick override only)", () => {
  const { ctx, ls } = bootOpts({
    "apex26.gfxBackend": "three",
    "apex26.xr": "1",
    "apex26.xrBackend": "webgl2",
    "apex26.xrCaps": "1",
  });
  // Seed caps so sync bootPick sees vr.
  ctx.ApexXR.invalidate();
  const pick = ctx.ApexXR.bootPick();
  assert.equal(pick, "webgl2", "armed + vr caps ⇒ GLX override");
  assert.equal(ls.getItem("apex26.gfxBackend"), "three", "2D pick untouched");
});

test("ApexXR.bootPick is null when VR mode is off", () => {
  const { ctx } = bootOpts({ "apex26.xrCaps": "1", "apex26.xr": "0" });
  assert.equal(ctx.ApexXR.bootPick(), null);
});

test("ApexXR.noteFallback latches sessionStorage and logs", () => {
  const { ctx, ss } = bootOpts({ "apex26.xr": "1", "apex26.xrCaps": "1", "apex26.xrBackend": "webgpu" });
  const entry = ctx.ApexXR.noteFallback("webgpu", "webgl2", "session.enabledFeatures lacked webgpu");
  assert.equal(entry.to, "webgl2");
  assert.equal(ss.getItem("apex26.xrFallback"), "webgl2");
  assert.ok(ctx.ApexXR.fallbacks().some((f) => f.reason.includes("enabledFeatures")));
});

test("ApexXR.plan records webgpu→webgl2 when XRGPUBinding missing", () => {
  const { ctx } = bootOpts({
    "apex26.xr": "1",
    "apex26.xrBackend": "webgpu",
    "apex26.xrCaps": "1",
  });
  // navigator.gpu is set in harness; XRGPUBinding is not.
  const p = ctx.ApexXR.plan(true);
  assert.equal(p.xrMode, "armed");
  assert.equal(p.path, "webgl2");
  assert.ok(p.fallbacks.some((f) => f.reason.includes("XRGPUBinding") || f.reason.includes("xrgpu") || f.from === "webgpu"));
});

test("js/xr/xr-opts.js and apex-xr.js exist for zeroRefModules", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "js/xr/xr-opts.js")));
  assert.ok(fs.existsSync(path.join(ROOT, "js/xr/apex-xr.js")));
  assert.match(read("js/xr/apex-xr.js"), /ApexXR/);
  assert.match(read("js/xr/xr-opts.js"), /XROpts/);
});
