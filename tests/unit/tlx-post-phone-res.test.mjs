/* Phone post clarity and target layout. Execute the actual sizing/layout code,
 * including fixed physical allocations and scale changes; no GPU claim. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/render/three/tlx-post.js"), "utf8");

test("tlx-post declares a phone post working size distinct from the scene", () => {
  assert.ok(SRC.includes("const phonePost = !!ctx.isMobile"),
    "phonePost must key off ctx.isMobile");
  assert.ok(SRC.includes("let pW = 1, pH = 1"),
    "pW/pH hold the post working size");
  assert.ok(SRC.includes("postTargets: [pW, pH]"),
    "state() exposes postTargets for probes");
  assert.ok(SRC.includes("phonePost,"),
    "state() exposes the phonePost flag");
});

const SCALE_M = SRC.match(/const PHONE_POST_SCALE = ([\d.]+);/);
const PHONE_POST_SCALE = SCALE_M ? Number(SCALE_M[1]) : NaN;

test("phone post runs at the full scene resolution (pre-#3479 clarity)", () => {
  // #3479 cut it to 0.5 and #3670 to 0.625; Bryce reported the image as low-res
  // on his iPhone. The governor's renderScale step is the frame-cost lever.
  assert.equal(PHONE_POST_SCALE, 1, "PHONE_POST_SCALE must stay at the full scene size");
});

function layoutFixture(phonePost, fixed = false, orientCover = false) {
  const placed = {};
  const phys = !!(fixed || orientCover);
  const context = vm.createContext({ phonePost, fixed, orientCover, phys,
    place(rt, w, h, pw, ph) { placed[rt] = { logical: [w, h], physical: phys ? [pw, ph] : [w, h] }; },
    ctx: { wantSpatialUpscale: () => true }, P: { sgsr: true },
    sceneRT: "scene", ldrRT: "ldr", aaRT: "aa", ssaoRT: "ao", ssaoBlurRT: "aoBlur",
    godrayRT: "gr", godrayBlurRT: "grBlur", BLOOM_DIV: 2,
    bloomLv: Array.from({ length: 4 }, (_, i) => ({ rt: "bloom" + i })),
  });
  const helpers = SRC.slice(SRC.indexOf("    const halfOf ="), SRC.indexOf("    // the TSL pass set"));
  const resize = SRC.slice(SRC.indexOf("    function resize(w, h, pw, ph)"), SRC.indexOf("    function syncAaRT()"));
  const aa = SRC.slice(SRC.indexOf("    function syncAaRT()"), SRC.indexOf("      } else if (aaRT)") ) + "\n      }\n    }";
  assert.ok(helpers.includes("function layoutBloom"));
  assert.ok(resize.includes("layoutHalf()"));
  assert.ok(aa.includes("place(aaRT"));
  vm.runInContext("let W=1,H=1,PW=0,PH=0,pW=1,pH=1,aoW=1,aoH=1,grW=1,grH=1,nLv=0;\n" + helpers + resize + aa, context);
  return (w, h, pw = w, ph = h) => { context.resize(w, h, pw, ph); return structuredClone(placed); };
}

test("phone composite keeps full scene detail, like desktop", () => {
  const phone = layoutFixture(true)(800, 400);
  assert.deepEqual(phone.scene.logical, [800, 400]);
  assert.deepEqual(phone.ldr.logical, [800, 400]);
  assert.deepEqual(phone.aa.logical, [800, 400]);
  for (const key of ["ao", "gr", "bloom0"]) assert.deepEqual(phone[key].logical, [400, 200]);
  const desktop = layoutFixture(false)(800, 400);
  assert.deepEqual(desktop.ldr.logical, [800, 400]);
  assert.deepEqual(desktop.ao.logical, [400, 200]);
});

test("fixed phone allocations contain the logical post viewports after shrink and restore", () => {
  const resize = layoutFixture(true, true);
  resize(800, 400, 800, 400);
  const smaller = resize(400, 200, 800, 400);
  assert.deepEqual(smaller.ldr, { logical: [400, 200], physical: [800, 400] });
  assert.deepEqual(smaller.aa, smaller.ldr);
  for (const key of ["ao", "gr", "bloom0"]) {
    assert.deepEqual(smaller[key], { logical: [200, 100], physical: [400, 200] });
  }
  assert.deepEqual(resize(800, 400, 800, 400).ldr, { logical: [800, 400], physical: [800, 400] });
});

test("odd and minimum phone dimensions remain valid through a scale change", () => {
  const resize = layoutFixture(true);
  assert.deepEqual(resize(633, 293).ldr.logical, [633, 293]);
  assert.deepEqual(resize(633, 293).ao.logical, [316, 146]);
  const tiny = resize(1, 1);
  for (const key of ["scene", "ldr", "aa", "ao", "gr"]) assert.deepEqual(tiny[key].logical, [1, 1]);
});

test("composite and FXAA draw at post size, scene stays at W×H", () => {
  assert.ok(SRC.includes("vset(P.composite, pW, pH)"),
    "composite fills the phone post-sized LDR");
  assert.ok(SRC.includes("vset(P.fxaa, pW, pH)"),
    "FXAA reads the phone post-sized LDR");
  assert.ok(SRC.includes("place(sceneRT, W, H, PW, PH)"),
    "scene target stays at full render size");
  // SSR still samples the full-res scene — texel quantum must stay 1/W.
  assert.ok(SRC.includes("C.reflTexel.value.set(1 / W, 1 / H)"),
    "SSR texel stays scene-sized on phones");
});

test("#3311 phone orient cover: equal-pixel transpose keeps square physical", () => {
  // Behaviour only (no assert.ok(SRC.includes) — those are assertPins).
  const resize = layoutFixture(true, false, true);
  const land = resize(422, 195);
  assert.deepEqual(land.scene, { logical: [422, 195], physical: [422, 422] });
  assert.deepEqual(land.ldr.physical, [422, 422]);
  const port = resize(195, 422);
  assert.deepEqual(port.scene, { logical: [195, 422], physical: [422, 422] },
    "transpose must not grow past the cover already allocated");
  assert.deepEqual(port.ldr.logical, [195, 422]);
});
