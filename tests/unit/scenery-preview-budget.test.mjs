// Live scenery's output budget must also bound the road-clearance work. These
// are valid authored loops built by the real engine, within the editor's 7 km
// maximum. Golden complete-scene/hash-call digests were captured before the
// early clearance guards; no timing or browser responsiveness assertion.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { bootEditor, ellipse, design, read } from "../helpers/editor-vm.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

function planMeasured(radius, trees) {
  const b = bootEditor();
  vm.runInContext(read("js/editor/scenery-preview.js").replace(/^const\b/gm, "var"), b.ctx, { filename: absSrc("js/editor/scenery-preview.js") });
  const authored = b.C.sanitize(design({ pts: ellipse(72, radius, radius), theme: "parkland", look: { trees } }));
  const verdict = b.V.check(authored);
  assert.equal(verdict.ok, true, JSON.stringify(verdict.issues));
  assert.ok(verdict.tr.total < 7000, "layout remains within the supported lap limit");
  const input = JSON.stringify(authored);
  const originalMath = b.ctx.Math, originalHash = b.ctx.Hash32, sequence = createHash("sha256");
  let hypotCalls = 0, hashCalls = 0;
  b.ctx.Math = Object.assign(Object.create(originalMath), {
    hypot: (...args) => { hypotCalls++; return originalMath.hypot(...args); },
  });
  b.ctx.Hash32 = Object.assign({}, originalHash, {
    unit: (...args) => { hashCalls++; sequence.update(JSON.stringify(args) + "\n"); return originalHash.unit(...args); },
  });
  let scene;
  try { scene = b.ctx.DesignerSceneryPreview.plan(authored, verdict.tr); }
  finally { b.ctx.Math = originalMath; b.ctx.Hash32 = originalHash; }
  assert.equal(JSON.stringify(authored), input, "planning does not mutate the authored design");
  return { scene, length: verdict.tr.total, samples: verdict.tr.n, limit: b.ctx.DesignerSceneryPreview.LIMIT,
    hypotCalls, hashCalls, sequence: sequence.digest("hex"), output: createHash("sha256").update(JSON.stringify(scene)).digest("hex") };
}

test("a valid 6.27 km MANY layout stops clearance scans once all 1800 footprints are fixed", () => {
  const r = planMeasured(1000, "many");
  assert.ok(r.length > 6200 && r.length < 6300);
  assert.equal(r.samples, 1568);
  assert.equal(r.scene.items.length, 1776);
  assert.equal(r.scene.ground.length, 24, "terrain footprints retain their shared budget and emission order");
  assert.equal(r.scene.items.length + r.scene.ground.length, r.limit);
  // Before the fix this same real planner did 1,805,787 distance calculations.
  // The cap guard leaves 930,808; this bound also catches redundant pit boxes.
  assert.ok(r.hypotCalls <= 931000, `clearance continued after the cap: ${r.hypotCalls}`);
  assert.equal(r.output, "fff3e76c9d6d63b6e389309b8b493e7145ee9a9f818097b07be7657512e12d74");
  assert.equal(r.hashCalls, 7017);
  assert.equal(r.sequence, "1d7fbeb3c79473a26be9a4f7828561f28307f2def412ddb9fa75fe13f8acfd7c", "all seeded hash calls retain their order even after output fills");
});

test("FEW foliage on the same valid long layout retains the complete under-budget output", () => {
  const r = planMeasured(1000, "few");
  assert.equal(r.scene.items.length, 213);
  assert.equal(r.scene.ground.length, 24);
  assert.ok(r.scene.items.length + r.scene.ground.length < r.limit);
  assert.equal(r.hypotCalls, 113359, "an unsaturated recipe keeps its clearance work");
  assert.equal(r.output, "ec56f27fc05ff14bb1a36ec1a9dbd4cbe09e6bebaf93af3c11fd0803d5db48a2");
  assert.equal(r.hashCalls, 545);
  assert.equal(r.sequence, "19b3323f84443a8eeb31f80060e9c08f751a70dce8e16a1fb8e22e60397ba4ce");
});

test("an under-budget 3.14 km MANY layout retains all scene bytes and seeded calls", () => {
  const r = planMeasured(500, "many");
  assert.ok(r.length > 3100 && r.length < 3200);
  assert.equal(r.scene.items.length, 1709);
  assert.equal(r.scene.ground.length, 24);
  assert.ok(r.scene.items.length + r.scene.ground.length < r.limit);
  assert.equal(r.hypotCalls, 448738);
  assert.equal(r.output, "81ccc27dcbf8cc474da154163392d1e03538d7da80691e7c2609df46bdabb80e");
  assert.equal(r.hashCalls, 3537);
  assert.equal(r.sequence, "84b5275e6d1b3be836d19dcccde76f37fc1822f06fdc03f06226b6456b62c6d2");
});
