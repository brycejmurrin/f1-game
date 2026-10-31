/* tlx-lite-lab.test.mjs — B8 lab tier (Bryce 2026-10-30, "B8 opt-in"): ?lab=tlxLite gives three's
 * WebGL2 leg on a phone a lighter tier (DPR cap, sun map, post opts). OFF by default; a no-op on
 * WebGPU and on a desktop. three cannot boot in the node VM, so this runs the real tlx.js /
 * tlx-shadow.js under a stubbed `location`, then executes create()'s own lite lines (lifted
 * verbatim) against a stub renderer and a GRAPHICS-MEDIUM-shaped present opts. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TLX_SRC = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");
const SH_SRC = fs.readFileSync(path.join(ROOT, "js/render/three/tlx-shadow.js"), "utf8");

// The exact create()/present() lines that consume the lab, lifted so the test runs the shipped text.
function line(src, head) {
  const at = src.indexOf(head);
  assert.notEqual(at, -1, "tlx.js line moved or missing: " + head);
  return src.slice(at, src.indexOf("\n", at));
}
const LITE_LINE = line(TLX_SRC, "const _lite = liteTier(");
const DPR_LINE = line(TLX_SRC, "let DPR_CAP = ");
const PRESENT_LINE = line(TLX_SRC, "if (_lite) liteOpts(opts);");

function boot(search) {
  const ctx = vm.createContext({
    location: { search }, URLSearchParams, WeakSet, WeakMap, Math, Object, Number, String,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  ctx.window = ctx;
  vm.runInContext(TLX_SRC, ctx, { filename: absSrc("js/render/three/tlx.js") });
  vm.runInContext(SH_SRC, ctx, { filename: absSrc("js/render/three/tlx-shadow.js") });
  return ctx;
}

// Today's GRAPHICS MEDIUM present opts (game.js: applyLookShed, roadReflection, bloomLevels/grLite).
const medium = () => ({ bloom: 0.6, ssao: 0.8, godray: 0.5, contact: 0.4, lampVol: 0.3, flareMul: 1,
  bloomLevels: 3, grLite: true, reflect: 0.4, ssrQuality: 1, carReflect: undefined, exposure: 1 });
const highOpts = () => ({ ...medium(), bloomLevels: 0, grLite: false, ssrQuality: 0 });

function compute(search, { webgpu = false, mobileTier = true, phoneHw = true, opts = medium() } = {}) {
  const ctx = boot(search);
  ctx.renderer = { backend: webgpu ? { isWebGPUBackend: true } : { isWebGLBackend: true } };
  ctx.mobileTier = mobileTier; ctx._phoneHw = phoneHw; ctx.opts = opts;
  ctx.liteTier = ctx.TLX.liteTier; ctx.liteOpts = ctx.TLX.liteOpts;
  vm.runInContext(LITE_LINE + "\n" + DPR_LINE + "\n" + PRESENT_LINE +
    "\nglobalThis.__out = { lite: !!_lite, dpr: DPR_CAP, sun: TLXShaders.sunMapSize({ isMobile: mobileTier || _phoneHw," +
    " mobileTier, softwareGL: false, sunSize: _lite ? _lite.sunSize : 0 }), opts };", ctx,
    { filename: absSrc("tests/unit/tlx-lite-lab.test.mjs") });
  return JSON.parse(JSON.stringify(ctx.__out));
}

const TODAY_PHONE = { lite: false, dpr: 1.5, sun: 1024, opts: JSON.parse(JSON.stringify(medium())) };

test("?lab=tlxLite on three's WebGL2 leg of a phone: the LITE values", () => {
  const out = compute("?lab=tlxLite");
  assert.equal(out.lite, true);
  assert.equal(out.dpr, 1.25, "DPR cap one step under the phone's 1.5");
  assert.equal(out.sun, 512, "sun map 512 (phone 1024)");
  assert.deepEqual(out.opts, { bloom: 0.6, ssao: 0, godray: 0, contact: 0, lampVol: 0, flareMul: 0,
    bloomLevels: 2, grLite: true, reflect: 0.4, ssrQuality: 2, carReflect: 0, exposure: 1 });
});

test("lite opts pick LOW's two bloom octaves from a HIGH frame (bloomLevels 0 = all) and are idempotent", () => {
  const out = compute("?x=1&lab=foo, tlxLite", { opts: highOpts() });
  assert.equal(out.opts.bloomLevels, 2);
  assert.equal(out.opts.grLite, true);
  assert.equal(out.opts.ssrQuality, 2);
  const ctx = boot("?lab=tlxLite");
  const o = medium();
  ctx.TLX.liteOpts(o); const once = JSON.stringify(o);
  ctx.TLX.liteOpts(o);
  assert.equal(JSON.stringify(o), once);
  assert.equal(ctx.TLX.liteOpts(undefined), undefined, "a missing opts is left alone");
});

test("without the lab every value is today's, exactly", () => {
  for (const search of ["", "?lab=", "?lab=other", "?lab=tlxlite", "?tlxLite=1"]) {
    assert.deepEqual(compute(search), TODAY_PHONE, search || "(no query)");
  }
});

test("the lab is a no-op on three's WebGPU backend and on a desktop", () => {
  assert.deepEqual(compute("?lab=tlxLite", { webgpu: true }), TODAY_PHONE, "WebGPU phone");
  const desk = compute("?lab=tlxLite", { mobileTier: false, phoneHw: false });
  assert.deepEqual(desk, { lite: false, dpr: 2, sun: 2048, opts: JSON.parse(JSON.stringify(medium())) }, "desktop");
  // A real handset on GRAPHICS: HIGH (mobileTier off) is still a phone.
  assert.equal(compute("?lab=tlxLite", { mobileTier: false, phoneHw: true }).lite, true);
});

test("a location that throws reads as no labs", () => {
  const ctx = vm.createContext({ URLSearchParams, WeakSet, WeakMap, Math, Object });
  Object.defineProperty(ctx, "location", { get() { throw new Error("blocked"); } });
  ctx.window = ctx;
  vm.runInContext(TLX_SRC, ctx, { filename: absSrc("js/render/three/tlx.js") });
  assert.equal(ctx.TLX.liteTier(true, true), null);
});

test("present() applies the lite opts before the program warm reads them", () => {
  const p = TLX_SRC.indexOf("        present(opts) {");
  const at = TLX_SRC.indexOf(PRESENT_LINE, p);
  const warm = TLX_SRC.indexOf("startProgramWarm(opts)", p);
  assert.ok(p > 0 && at > p && warm > at, "liteOpts runs inside present(), ahead of startProgramWarm");
});

test("sunMapSize keeps the pre-B8 rule exactly: only isMobile picks 1024 (a forced mobile tier on a desktop does not)", () => {
  const ctx = vm.createContext({ window: {}, console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/render/three/tlx-shadow.js"), "utf8"), ctx, { filename: absSrc("js/render/three/tlx-shadow.js") });
  const size = (o) => vm.runInContext("window.TLXShaders.sunMapSize", ctx)(o);
  assert.deepEqual([size({ isMobile: true }), size({ mobileTier: true }), size({ mobileTier: true, softwareGL: true }), size({}), size({ softwareGL: true }), size({ isMobile: true, sunSize: 512 })],
    [1024, 2048, 512, 2048, 512, 512]);
});
