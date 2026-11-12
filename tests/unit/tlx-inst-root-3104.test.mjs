/* #3104 F3 — the instanced registry hangs off a root whose children are only this pass's visible members.
 * No browser, no GPU: three r187's REAL WebGPURenderer({ forceWebGL }) over the no-op WebGL2 context
 * (tests/helpers/fake-webgl2.mjs) renders the REAL F3 block (_instAdd / _instRemove / _instShow) and the REAL
 * _showInstanced / _hideUndrawnInstanced, driven the way present() / mirrorEnd() drive them, against the old
 * scene.add parenting (the _instRootOn = false arm). Same draws, same draw order (onBeforeRender sequence), fewer
 * objects walked. A unit test of a backend is not evidence it runs: the PR's selected browser legs are. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";
import { fnSource } from "../helpers/fn-source.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TLX = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");

installThreeGlobals();
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.webgpu.min.js")).href);

const decl = TLX.slice(TLX.indexOf("      let _instStamp = 0;"), TLX.indexOf("      // A-H1 (perf hunt 4)", TLX.indexOf("      let _instStamp = 0;")));
const show = fnSource(TLX, "function _showInstanced(rec, order) {");
const hide = fnSource(TLX, "function _hideUndrawnInstanced() {");

// Objects three's projectObject touches: each child of a visible node (it returns at an invisible one).
const walked = (o) => { let n = 1; if (o.visible) for (const c of o.children) n += walked(c); return n; };

function rig(THREE, scene, flag) {
  const src = flag === "0" ? decl.replace("const _instRootOn = true;", "const _instRootOn = false;") : decl;
  assert.notEqual(flag === "0" ? src : null, decl, "the before-arm switch moved — check this test");
  return new Function("THREE", "scene", "localStorage", `"use strict";
    ${src}
    ${show}
    ${hide}
    const unlitMat = null;
    return { add(im) { im.visible = false; _instAdd(im); _instRegistry.push(im); },
      remove(im) { const k = _instRegistry.indexOf(im); if (k >= 0) _instRegistry.splice(k, 1); _instRemove(im); },
      pass(recs) { _instStamp++; for (let i = 0; i < recs.length; i++) _showInstanced(recs[i], recs[i].order); _hideUndrawnInstanced(); },
      root: typeof instRoot !== "undefined" ? instRoot : null };`)(THREE, scene, { getItem: () => null });
}

test("F3: hidden instanced batches are not walked; the draws and their order are unchanged", async (t) => {
  assert.match(decl, /const instRoot = new THREE\.Object3D\(\)/, "the F3 block moved — check this test, not the code");
  const fg = makeFakeGL();
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 0, 5); cam.updateMatrixWorld();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
  const mats = [new THREE.MeshBasicNodeMaterial(), new THREE.MeshBasicNodeMaterial({ transparent: true })];

  function build(flag) {
    const scene = new THREE.Scene(); scene.matrixWorldAutoUpdate = false;
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(g, mats[0]); m.frustumCulled = false; m.visible = false; scene.add(m); }   // pool root / sky stand-ins
    const R = rig(THREE, scene, flag), order = [];
    const ims = Array.from({ length: 40 }, (_, i) => {
      const im = new THREE.InstancedMesh(g, mats[0], 4);
      im.matrixAutoUpdate = false; im.frustumCulled = false; im.name = "b" + i;
      im.onBeforeRender = () => order.push(im.name);
      R.add(im); return im;
    });
    const raw = () => { fg.reset(); order.length = 0; renderer.render(scene, cam); return { draws: fg.counts.drawArrays || 0, order: order.slice() }; };
    return { scene, R, ims, raw };
  }
  const on = build(null), off = build("0");
  assert.ok(on.R.root && on.R.root.parent === on.scene, "the root sits in the scene");
  assert.equal(on.scene.children.length, 4, "no instanced member sits in the scene itself");
  assert.equal(off.scene.children.length, 43, "the before arm (scene.add): members in the scene");

  // Passes: main (6 shown, mixed renderOrder and materials), mirror (2), env face (none), main again.
  const passes = [[3, 7, 9, 21, 30, 39], [7, 30], [], [0, 1, 2, 3, 39]];
  for (const shown of passes) {
    const run = (S) => {
      S.R.pass(shown.map((k, j) => ({ instanced: { instances: 4, imesh: S.ims[k] }, mat: mats[k % 2], order: (shown.length - j) * 3 })));
      return S.raw();
    };
    const a = run(on), b = run(off);
    assert.equal(a.draws, b.draws, `pass ${shown}: same draw count`);
    assert.deepEqual(a.order, b.order, `pass ${shown}: same draw order`);
    assert.equal(a.order.length, shown.length);
    assert.equal(walked(on.scene), 1 + 4 + shown.length, `pass ${shown}: only the shown members are walked`);
    assert.equal(walked(off.scene), 1 + 43, "before: every member is walked");
  }
  // Freed while listed and while hidden: leaves the root either way, never re-walked.
  on.R.pass([{ instanced: { instances: 4, imesh: on.ims[5] }, mat: mats[0], order: 0 }]);
  on.R.remove(on.ims[5]); on.R.remove(on.ims[6]);
  assert.equal(on.ims[5].parent, null); assert.equal(on.ims[6].parent, null);
  assert.ok(!on.R.root.children.includes(on.ims[5]));
  on.R.pass([]);
  assert.equal(walked(on.scene), 1 + 4);
});

test("F3: every registry member is parented through _instAdd and every visibility settle ends in _instShow()", () => {
  assert.equal((TLX.match(/_instRegistry\.push\(/g) || []).length, (TLX.match(/_instAdd\((\w+|imesh)\);? ?_instRegistry\.push\(|_instAdd\(\w+\);\n\s+_instRegistry\.push\(/g) || []).length,
    "each push into the registry follows an _instAdd");
  assert.doesNotMatch(TLX, /scene\.add\((im|imesh|m)\); _instRegistry|scene\.add\((im|imesh)\);\n\s+_instRegistry/, "no member goes straight into the scene");
  assert.match(fnSource(TLX, "function _hideUndrawnInstanced() {"), /_instShow\(\);/);
  assert.match(fnSource(TLX, "function _mirWarmSwap() {"), /_instShow\(\);/);
  assert.match(fnSource(TLX, "function _mirWarmUnswap() {"), /_instShow\(\);/);
});
