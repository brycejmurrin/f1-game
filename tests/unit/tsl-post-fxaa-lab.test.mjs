/* tsl-post-fxaa-lab.test.mjs — ?lab=fxaaSubNN (D-027, phone sharpness arm a): the FXAA sub-pixel blend as a
 * percentage, URL only, default OFF. Runs the shipped tsl-post.js in a VM (three cannot boot here), so this pins
 * the reader and that the graph takes its constant from it; it does not prove a pixel. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/render/three/tsl-post.js"), "utf8");

function reader(location) {
  const ctx = vm.createContext({ URLSearchParams, Math });
  if (location !== undefined) ctx.location = location;
  ctx.window = ctx;
  vm.runInContext(SRC, ctx, { filename: absSrc("js/render/three/tsl-post.js") });
  return ctx.TLXShaders.labFxaaSubpix;
}

test("no lab: the shipped 0.75, whatever else the URL carries", () => {
  for (const search of ["", "?lab=other", "?lab=dpr2,postSubmit", "?fxaaSub50=1", "?lab=fxaaSub", "?lab=fxaaSub500", "?lab=xfxaaSub50"]) {
    assert.equal(reader({ search })(), 0.75, search);
  }
});

test("no location, or one that throws: no lab", () => {
  assert.equal(reader()(), 0.75);
  assert.equal(reader({ get search() { throw new Error("denied"); } })(), 0.75);
});

test("?lab=fxaaSubNN is NN percent, in a comma list too, and never above the shipped blend", () => {
  assert.equal(reader({ search: "?lab=fxaaSub50" })(), 0.5);
  assert.equal(reader({ search: "?lab=dpr2, fxaaSub25" })(), 0.25);
  assert.equal(reader({ search: "?lab=fxaaSub0" })(), 0);
  assert.equal(reader({ search: "?lab=fxaaSub99" })(), 0.75);
  assert.equal(reader({ search: "" })("?lab=fxaaSub40"), 0.4, "an explicit search wins (the test seam)");
});

test("the FXAA graph takes its blend from the reader and from nowhere else", () => {
  assert.equal((/const FXAA_SUBPIX = (\w+)\(\);/.exec(SRC) || [])[1], "labFxaaSubpix");
  assert.equal(SRC.split("FXAA_SUBPIX").length - 1, 2, "one declaration, one use");
});
