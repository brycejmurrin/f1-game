/* liv-swatch-box-cache.test.mjs — #6754 row 5: fitLivSwatches measures a card shape once per
 * (viewport gen, UI SIZE, DPR); a second call with the same key does no CssZoom/clientWidth read,
 * a resize or UI SIZE change measures again, and the painted box is the same as the old per-call measure.
 * Run: node --test tests/unit/liv-swatch-box-cache.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(ROOT, "js/garage/setup-sheet.js"), "utf8");
const grab = (re) => { const m = src.match(re); assert.ok(m, "setup-sheet.js defines " + re); return m[0]; };

function rig() {
  const code = [
    grab(/const livBox = [^\n]+/), grab(/function livSwatchPx[\s\S]*?\n\}/),
    grab(/const near = [^\n]+/), grab(/const holdLivBox = [^\n]+/),
    grab(/let livBoxGen = -1;/), grab(/let livBoxKey = [^\n]+/), grab(/const livUiKey = [^\n]+/),
    grab(/function fitLivSwatches[\s\S]*?\n\}/),
    "globalThis.__t = { fit: fitLivSwatches, box: () => livBox };",
  ].join("\n");
  let reads = 0, viewGen = 0, ui = "1";
  const mkSw = (shape) => {
    const sw = {
      closest: (sel) => (sel === ".cs-liv-factory" ? (shape === "small" ? {} : null) : { dataset: { csLivery: "a" } }),
      prepend() {},
    };
    Object.defineProperty(sw, "clientWidth", { get() { reads++; return shape === "small" ? 40 : 150; } });
    Object.defineProperty(sw, "clientHeight", { get() { reads++; return shape === "small" ? 25 : 70; } });
    return sw;
  };
  const container = { querySelectorAll: () => [mkSw("big"), mkSw("small")] };
  const ctx = {
    LiveryTex: { swatchCanvas: () => ({}) }, getLiveries: () => [{ id: "a" }], livBuild: {},
    CssZoom: { of: () => { reads++; return 1; } },
    document: { documentElement: { style: { getPropertyValue: () => ui } } },
    globalThis: null,
  };
  ctx.globalThis = ctx; ctx.window = ctx; ctx.devicePixelRatio = 2;
  Object.defineProperty(ctx, "csViewGen", { get: () => viewGen });
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: absSrc("js/garage/setup-sheet.js") });
  return { fit: (t) => ctx.__t.fit(container, t || { id: "t" }), box: () => ctx.__t.box(), reads: () => reads, resize: () => { viewGen++; }, setUi: (v) => { ui = v; } };
}

test("fitLivSwatches measures each card shape once per viewport/UI SIZE key", () => {
  const r = rig();
  r.fit();
  const first = r.reads();
  assert.ok(first > 0, "the first build measures");
  assert.deepEqual([...r.box().big], [150, 70], "big box = clientWidth x zoom");
  assert.deepEqual([...r.box().small], [40, 25]);
  r.fit(); r.fit();
  assert.equal(r.reads(), first, "same key: no second measure");
  r.resize(); r.fit();
  assert.ok(r.reads() > first, "a resize measures again");
  const afterResize = r.reads();
  r.setUi("0.7"); r.fit();
  assert.ok(r.reads() > afterResize, "a UI SIZE change measures again");
});
