/* A·W50 (2026-10-24): THE MENU WARM'S PIPELINES MUST SURVIVE TO RACE ENTRY. three r186 destroys a render pipeline and
 * its programs when the last RenderObject using it is deleted (Pipelines.delete -> _releasePipeline at usedTimes 0).
 * TLX's prunePool drops every pooled wrapper not drawn for 20 s (dropWrapper dispatches "dispose", which deletes its
 * RenderObject), so the world pipelines the menu warm built while the garage was on screen were destroyed, and race
 * entry rebuilt them synchronously: lavapipe census, Monza after a full menu warm, 13 of 14 race-entry pipelines
 * byte-identical to ones the menu had built; iPhone 14 Pro WebGPU ~1.2 s each, mirrorPrepare 4.7 s after 30 s of menu
 * idle (docs/notes/MIRROR-WARM-2026-10-24.md). tlx.js pinPipelines takes one extra use per pipeline at each warm's end
 * and before each prune. No browser, no GPU: three r186's REAL WebGPURenderer({ forceWebGL }) over the no-op WebGL2
 * context and the REAL pinPipelines source. A unit test is not evidence it runs on a phone: the follow-up is
 * gpu-census.yml (macos) and the Device Farm cold-entry run. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeFakeGL, installThreeGlobals } from "../helpers/fake-webgl2.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TLX = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");

installThreeGlobals();
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.webgpu.min.js")).href);

const tslice = (from, to) => {
  const a = TLX.indexOf(from), b = TLX.indexOf(to, a);
  assert.ok(a > 0 && b > a, `tlx.js block "${from.trim()}" moved — check this test, not the code`);
  return TLX.slice(a, b);
};
const PIN_SRC = tslice("      const PIPE_PIN_CAP = ", "      const PRUNE_EVERY_MS = ");
const makePin = (renderer) => new Function("renderer", `"use strict";
  ${PIN_SRC}
  return { pinPipelines, pinned: () => _pinnedPipes.size, cap: PIPE_PIN_CAP };`)(renderer);

async function rig(t) {
  const fg = makeFakeGL(320, 180);
  const renderer = new THREE.WebGPURenderer({ canvas: fg.canvas, context: fg.gl, forceWebGL: true, antialias: false });
  await renderer.init();
  t.after(() => renderer.dispose());
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, 5); camera.updateMatrixWorld();
  renderer.render(scene, camera);   // three's own first-render programs, so the counts below isolate the mesh's
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicNodeMaterial({ color: 0x336699 });
  // One "frame" of a pooled wrapper over (geo, mat): what tlx.js's pool hands three for a world mesh.
  const frame = () => {
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.updateMatrixWorld(); scene.add(m);
    const before = fg.counts.linkProgram || 0;
    renderer.render(scene, camera);
    return { mesh: m, links: (fg.counts.linkProgram || 0) - before };
  };
  // prunePool's drop after 20 s idle (tlx.js dropWrapper): detach, then "dispose" so three deletes the RenderObject.
  const drop = (m) => { scene.remove(m); m.dispatchEvent({ type: "dispose" }); };
  return { fg, renderer, scene, camera, frame, drop, caches: () => renderer._pipelines.caches };
}

test("control (before the fix): dropping the last wrapper destroys its pipeline, and the next draw links it again", async (t) => {
  const h = await rig(t);
  const a = h.frame();
  assert.ok(a.links > 0, "the first draw links the mesh's program");
  const n = h.caches().size;
  h.drop(a.mesh);
  assert.equal(h.caches().size, n - 1, "three r186 released the pipeline at usedTimes 0 (Pipelines.delete -> _releasePipeline)");
  assert.ok(h.frame().links > 0, "race entry's draw of the same (geometry, material) builds it again: the iPhone's ~1.2 s per pipeline");
});

test("pinned (the fix): the warm's pipelines survive a prune drop, and race entry's draw builds nothing", async (t) => {
  const h = await rig(t);
  const pin = makePin(h.renderer);
  const a = h.frame();
  assert.ok(a.links > 0);
  const n = h.caches().size;
  assert.ok(pin.pinPipelines() >= 1, "every render pipeline in three's cache is pinned");
  h.drop(a.mesh);
  assert.equal(h.caches().size, n, "the pipeline stays cached after its last RenderObject is gone");
  assert.equal(h.frame().links, 0, "a new wrapper over the same pair reuses the cached pipeline: 0 links at race entry");
  assert.equal(pin.pinPipelines(), pin.pinned(), "a second pin takes no second use (idempotent per pipeline)");
});

test("armed before the first frame: a pipeline a RenderObject switches away from mid-warm is kept too", async (t) => {
  // The sweep alone left 3 of 4 race-entry rebuilds: three frees the old pipeline the moment a RenderObject switches
  // (Pipelines.getForRender, usedTimes 0), before any sweep runs. The armed _getRenderPipeline pins at creation.
  const run = async (armed) => {
    const h = await rig(t);
    const pin = makePin(h.renderer);
    if (armed) pin.pinPipelines();   // tlx.js prunePool arms it at the first present
    const a = h.frame();
    const flip = (side) => {
      a.mesh.material.side = side; a.mesh.material.needsUpdate = true;
      const before = h.fg.counts.linkProgram || 0;
      h.renderer.render(h.scene, h.camera);
      return (h.fg.counts.linkProgram || 0) - before;
    };
    flip(THREE.DoubleSide);   // the same wrapper drawn with another state: a second pipeline
    return flip(THREE.FrontSide);   // and back: the first one again
  };
  assert.ok(await run(false) > 0, "control: switching back rebuilds the pipeline three freed at the switch");
  assert.equal(await run(true), 0, "armed: the first pipeline was pinned at creation and is reused");
});

test("pinPipelines: render pipelines only, capped, and a no-op without a pipeline cache", () => {
  const pipe = () => ({ usedTimes: 1, vertexProgram: { usedTimes: 1 }, fragmentProgram: { usedTimes: 1 } });
  const caches = new Map();
  const compute = { usedTimes: 1, computeProgram: { usedTimes: 1 } };
  caches.set("c", compute);
  for (let i = 0; i < 600; i++) caches.set("r" + i, pipe());
  const fake = { _pipelines: { caches } };
  const pin = makePin(fake);
  assert.equal(pin.pinPipelines(), pin.cap, "the set stops at PIPE_PIN_CAP");
  assert.ok(pin.cap <= 512, "bounded: a phone keeps at most a few hundred pipelines alive");
  assert.equal(compute.usedTimes, 1, "a compute pipeline is never pinned");
  const first = caches.get("r0");
  assert.deepEqual([first.usedTimes, first.vertexProgram.usedTimes, first.fragmentProgram.usedTimes], [2, 2, 2],
    "one extra use on the pipeline and both programs, so neither _releasePipeline nor _releaseProgram reaches 0");
  assert.equal(makePin({}).pinPipelines(), 0, "no pipeline cache (another three shape): a no-op, never a throw");
});

test("tlx.js wiring: prunePool arms the pin at the first present and sweeps before it drops a wrapper", () => {
  // Behaviour above; this pins only the order inside prunePool (indexOf, not regex source pins: assert-match-ratchet).
  const prune = tslice("      function prunePool(now) {", "      // A WRAPPER WE DROP MUST SAY SO TO THREE.");
  const arm = prune.indexOf("if (pin && !_pinArmed) pin();"), cadence = prune.indexOf("PRUNE_EVERY_MS) return;");
  const sweep = prune.indexOf("if (pin) pin();", cadence), drop = prune.indexOf("dropWrapper(m);");
  assert.ok(arm > 0 && arm < cadence, "armed before the 5 s cadence gate, so the first present wraps three's pipeline factory");
  assert.ok(sweep > cadence && sweep < drop, "each sweep pins what was built since, before any wrapper is dropped");
});
