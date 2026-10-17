/* TLX fixed render targets (#2655, apex26.tlxFixedTargets): the viewport helper
 * (js/render/three/tsl-viewport.js) and the canary that keeps raw screen-uv use
 * out of the shaders. VM + source scan, no browser, ~0.1 s.
 *
 * The canary is the point: three's screenUV is screenCoordinate / the BOUND
 * TARGET size, so under a sub-viewport any reader that takes it as 0..1 over the
 * image is wrong. Every such reader goes through VP.uv(view) and every
 * sampled intermediate through VP.tex(node); a new raw use fails here. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("canary: screenUV appears only as the import and the identity fallback", () => {
  const dir = path.join(ROOT, "js/render/three");
  const hits = {};
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const n = (strip(read("js/render/three/" + f)).match(/\bscreenUV\b/g) || []).length;
    if (n) hits[f] = n;
  }
  // tsl-post.js: the TSL destructure + the `uv: () => screenUV` fallback.
  // tsl-sky.js: the destructure, the `: screenUV` fallback of imageUV, and the cloud-cache
  // fill — it draws into its OWN full S x S target, never a sub-viewport.
  // tsl-viewport.js: the destructure + the disabled return.
  assert.deepEqual(hits, { "tsl-post.js": 2, "tsl-sky.js": 3, "tsl-viewport.js": 2 });
});

test("canary: every texture node in tsl-post is a VP.tex wrapper or on the explicit list", () => {
  const src = strip(read("js/render/three/tsl-post.js"));
  const raw = [...src.matchAll(/(?<!VP\.tex\()\btexture\(([^)]*)\)/g)].map((m) => m[1]);
  // Full-image textures that are not render-target layouts: the lens-dirt map, the
  // mirror target (its own rect-relative read), the godray slot's "off" texture
  // object, the shadow compare taps (godray march) and the import/destructure.
  const allowed = new Set(["ctx.dirtTex || ctx.blackTex", "ctx.blackTex", "SHD.sunTex, flipUV(sc.xy",
    "SHD.lampTex, flipUV(lqs.xy", "ctx.sceneTex"].map((x) => x));
  const stray = raw.filter((a) => !allowed.has(a));
  assert.deepEqual(stray, [], "unwrapped texture(): " + stray.join(" | "));
  for (const name of ["sceneT", "tagT", "depthT", "bloomTexN", "ssaoTexN", "godrayTexN", "fxaaTex", "sgsrTex", "blitTex"]) {
    assert.match(src, new RegExp("const " + name + " = VP\\.tex\\(texture\\("), name + " wrapped");
  }
});

test("canary: tlx.js hands every chain the same viewport mapper and the physical size", () => {
  const tlx = strip(read("js/render/three/tlx.js"));
  assert.match(tlx, /fixedTargets, vp: vport/);
  assert.match(tlx, /sky = TLXShaders\.sky\(THREE, TSL, \{[^}]*vp: vport, sceneView/);
  assert.equal((tlx.match(/post\.resize\([^)]*\)/g) || []).every((c) => /presentW, presentH/.test(c)), true);
  // Off by default: the key must be an explicit "1".
  assert.match(tlx, /apex26\.tlxFixedTargets"\) === "1"/);
});

// ---- the helper itself, over a recording fake of the TSL surface -------------
function fakeTSL() {
  const node = (op, ...a) => new Proxy({ op, a }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === "symbol") return undefined;
      return (...args) => node(String(k), t, ...args);
    },
  });
  return {
    uniform: (v) => ({ value: v, isUniform: true }),
    vec2: (x) => node("vec2", x),
    min: (a, b) => node("min", a, b),
    screenUV: { isScreenUV: true },
    screenCoordinate: node("screenCoordinate"),
  };
}
class V2 { constructor(x, y) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }

function load(enabled) {
  const ctx = { window: {}, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("js/render/three/tsl-viewport.js"), ctx);
  const TSL = fakeTSL();
  return { VP: ctx.TLXShaders.viewport({ Vector2: V2 }, TSL, { enabled }), TSL };
}

test("disabled: the helper is the identity — the flag-off graph is the shipped one", () => {
  const { VP, TSL } = load(false);
  const n = { sample() {}, value: null };
  assert.equal(VP.tex(n), n, "tex() returns the node itself");
  assert.equal(VP.uv(VP.view()), TSL.screenUV, "uv() returns screenUV itself");
  assert.equal(VP.wrapperCount(), 0);
});

test("enabled: wrappers follow the bound texture's logical rect", () => {
  const { VP } = load(true);
  const calls = [];
  const node = { value: null, sample(uv) { calls.push(uv); return "tap"; } };
  const w = VP.tex(node);
  const rtA = { id: "A" }, rtB = { id: "B" }, blank = { id: "blank" };
  VP.layout(rtA, 672, 378, 960, 540);          // scale 0.7 of 960x540
  VP.layout(rtB, 480, 270, 480, 270);          // a target at full logical size
  w.value = rtA;
  assert.equal(node.value, rtA, "value setter writes through");
  assert.equal(w.value, rtA, "value getter reads through");
  VP.sync();
  assert.deepEqual([w.ratio.value.x, w.ratio.value.y], [672 / 960, 378 / 540]);
  assert.deepEqual([w.maxUV.value.x, w.maxUV.value.y], [(672 - 0.5) / 960, (378 - 0.5) / 540]);
  w.value = rtB; VP.sync();
  assert.deepEqual([w.ratio.value.x, w.ratio.value.y], [1, 1], "rebinding re-reads the layout");
  w.value = blank; VP.sync();
  assert.deepEqual([w.ratio.value.x, w.ratio.value.y], [1, 1], "an unregistered 1x1 fallback maps 1:1");
  assert.equal(w.sample({ k: 1 }), "tap");
  assert.equal(calls.length, 1, "sample() forwards one tap");
  // a resolution step is a layout() call, not an allocation
  VP.layout(rtA, 480, 270, 960, 540); w.value = rtA; VP.sync();
  assert.deepEqual([w.ratio.value.x, w.ratio.value.y], [0.5, 0.5]);
});

test("enabled: uv(view) is bound to the view's size uniform", () => {
  const { VP } = load(true);
  const v = VP.view();
  v.set(672, 378);
  assert.deepEqual([v.size.value.x, v.size.value.y], [672, 378]);
  const u = VP.uv(v);
  assert.equal(u.op, "div", "screenCoordinate.xy / size");
  assert.equal(u.a[1], v.size);
});
