// TLX's mesh-pool prune must keep a PINNED geometry's wrappers (#3677, A·W45).
//
// WHY THIS EXISTS. prunePool drops every pooled wrapper unseen for
// PRUNE_IDLE_MS (20 s), and dropWrapper's "dispose" event lets three release
// the wrapper's RenderObject; when that was a pipeline's last holder, three
// DESTROYS the pipeline and its program (Pipelines._releasePipeline /
// _releaseProgram). The cockpit ERS bar, armed OT lamp and ERS strip draw only
// while ERS deploys, so at a normal straight-to-straight BOOST cadence every
// press found its wrappers pruned and rebuilt their pipelines mid-race:
// ers-deploy-census --presses --gap 25 counted pipes=10 on a press 25 s after
// the last deploy. Bryce, iPhone, three.js WebGPU: "every press, a hitch".
//
// gfx.pinMesh(handle) marks such a geometry; this lifts the real prunePool out
// of js/render/three/tlx.js and asserts the pinned wrapper survives the prune
// while an unpinned idle one is still dropped (the prune's memory job).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");

/** Lift PRUNE_* and prunePool with the four closure names it reads. */
function liftPrune() {
  const start = SRC.indexOf("const PRUNE_EVERY_MS");
  assert.notEqual(start, -1, "PRUNE_EVERY_MS moved — update this test, do not delete it");
  const end = SRC.indexOf("\n      }\n", SRC.indexOf("function prunePool(now)", start));
  assert.notEqual(end, -1, "prunePool not found after PRUNE_EVERY_MS");
  const body = SRC.slice(start, end + 8);
  // eslint-disable-next-line no-new-func
  return new Function("meshPool", "meshByGeo", "dropWrapper",
    `"use strict"; let _pruneLast = -1e9; ${body}; return { prunePool, PRUNE_IDLE_MS };`);
}

function pool() {
  const meshPool = [], meshByGeo = new Map(), dropped = [];
  const add = (geo, mat, seen) => {
    const m = { geometry: geo, material: mat, __tlxSeen: seen };
    let byMat = meshByGeo.get(geo);
    if (!byMat) meshByGeo.set(geo, byMat = new Map());
    let list = byMat.get(mat);
    if (!list) byMat.set(mat, list = []);
    list.push(m); meshPool.push(m);
    return m;
  };
  const { prunePool, PRUNE_IDLE_MS } = liftPrune()(meshPool, meshByGeo, (m) => dropped.push(m));
  return { meshPool, meshByGeo, dropped, add, prunePool, PRUNE_IDLE_MS };
}

test("an idle wrapper of a pinned geometry survives the prune; an unpinned idle one does not", () => {
  const P = pool();
  const now = 100000, idle = now - P.PRUNE_IDLE_MS - 1;
  const ersBar = { __tlxPin: true }, track = {}, live = {};
  const keep = P.add(ersBar, "rigFxA", idle);
  const gone = P.add(track, "road", idle);
  const fresh = P.add(live, "body", now - 10);
  P.prunePool(now);
  assert.deepEqual(P.dropped, [gone], "only the unpinned idle wrapper is dropped");
  assert.deepEqual(P.meshPool, [keep, fresh], "the pinned and the fresh wrapper stay pooled");
  assert.ok(P.meshByGeo.get(ersBar).get("rigFxA").includes(keep), "the pinned wrapper is still found by acquireMesh's (geo, mat) lookup");
  assert.equal(P.meshByGeo.has(track), false, "the dropped geometry's map entry goes with it");
});

test("a pinned wrapper survives every prune, not just the first", () => {
  const P = pool();
  const ersStrip = { __tlxPin: true };
  const keep = P.add(ersStrip, "ersLight", 0);
  for (let t = 1; t <= 6; t++) P.prunePool(t * 30000);   // three minutes of BOOST off
  assert.deepEqual(P.dropped, []);
  assert.deepEqual(P.meshPool, [keep]);
});

test("TLX exports pinMesh and car-draw pins the deploy-only draws through the feature-detected hook", () => {
  const tlx = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.ok(/pinMesh\(m\) \{[^}]*__tlxPin = true/.test(tlx), "tlx.js pinMesh sets the geometry's __tlxPin");
  const cd = fs.readFileSync(path.join(ROOT, "js/car/car-draw.js"), "utf8");
  for (const g of ["getErsBar()", "getOtLamp(true)", "CarMesh.getErsLight()"])
    assert.ok(cd.includes(`pin(${g})`), `car-draw pins ${g}`);
});
