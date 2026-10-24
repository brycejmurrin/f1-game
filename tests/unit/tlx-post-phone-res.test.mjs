/* tlx-post-phone-res.test.mjs — phones run the look-post chain at half the
 * scene resolution (BrowserStack iPhone 15 2026-10-22: GPU/fill-bound while
 * JS was only a few ms). Desktop keeps post size === scene size.
 *
 * Behaviour pins via a tiny layout extract (includes / deepEqual, not source regex).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

test("phone post size is half the scene; desktop post size equals the scene", () => {
  // Mirror resize()'s post-size rule without spinning up three.js.
  const halfOf = (v) => Math.max(1, Math.floor(v / 2));
  function postSize(w, h, isMobile) {
    const phonePost = !!isMobile;
    const pW = phonePost ? halfOf(Math.max(1, w | 0)) : Math.max(1, w | 0);
    const pH = phonePost ? halfOf(Math.max(1, h | 0)) : Math.max(1, h | 0);
    const aoW = halfOf(pW), aoH = halfOf(pH);
    return { pW, pH, aoW, aoH };
  }
  assert.deepEqual(postSize(800, 400, false), { pW: 800, pH: 400, aoW: 400, aoH: 200 },
    "desktop: LDR at scene size, AO at half scene");
  assert.deepEqual(postSize(800, 400, true), { pW: 400, pH: 200, aoW: 200, aoH: 100 },
    "phone: LDR at half scene, AO at quarter scene");
  // Source must apply the same halfOf(w) rule when phonePost is set.
  assert.ok(SRC.includes("const nPostW = phonePost ? halfOf(Math.max(1, w | 0))"),
    "resize() must halve width on phones");
  assert.ok(SRC.includes("place(ldrRT, pW, pH,"),
    "LDR target is placed at the post working size");
  assert.ok(SRC.includes("aoW = halfOf(pW)"),
    "SSAO/godray base off post size (quarter on phones)");
  assert.ok(SRC.includes("Math.floor(pW / BLOOM_DIV)"),
    "bloom L0 bases off post size");
});

test("composite and FXAA draw at post size, scene stays at W×H", () => {
  assert.ok(SRC.includes("vset(P.composite, pW, pH)"),
    "composite fills the phone-reduced LDR");
  assert.ok(SRC.includes("vset(P.fxaa, pW, pH)"),
    "FXAA reads the phone-reduced LDR");
  assert.ok(SRC.includes("place(sceneRT, W, H, PW, PH)"),
    "scene target stays at full render size");
  // SSR still samples the full-res scene — texel quantum must stay 1/W.
  assert.ok(SRC.includes("C.reflTexel.value.set(1 / W, 1 / H)"),
    "SSR texel stays scene-sized on phones");
});
