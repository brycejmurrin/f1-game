/* TLX post P2 / audit #6 — fixed per-pair materials so present() does not
 * ping-pong shared .tex.value (WebGL2 re-uploads UBOs on each swap).
 * Source canaries only (~0.05 s); live pixel A/B is the gfx probe. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("tsl-post exposes fixed H/V blur and per-mip bloom materials with unique keys", () => {
  const src = read("js/render/three/tsl-post.js");
  assert.match(src, /const blurAOH = makeBlur\("tlx-post-blur-ao-h"\)/);
  assert.match(src, /const blurAOV = makeBlur\("tlx-post-blur-ao-v"\)/);
  assert.match(src, /const blurGRH = makeBlur\("tlx-post-blur-gr-h"\)/);
  assert.match(src, /const blurGRV = makeBlur\("tlx-post-blur-gr-v"\)/);
  assert.match(src, /makeDown\("tlx-post-down-" \+ \(di \+ 1\)\)/);
  assert.match(src, /makeUp\(true, "tlx-post-up-add-" \+ \(ui \+ 2\)\)/);
  assert.match(src, /makeUp\(false, "tlx-post-up-final"\)/);
  assert.match(src, /blurAOH, blurAOV, blurGRH, blurGRV/);
  assert.match(src, /downFixed/);
  assert.match(src, /upAddFixed, upFinalFixed/);
  // Shared swap materials remain for apex26.tlxPostFixedMats=0.
  assert.match(src, /const blurAO = makeBlur\("tlx-post-blur-ao"\)/);
  assert.match(src, /const blurGR = makeBlur\("tlx-post-blur-godray"\)/);
});

test("tlx-post present uses fixed mats by default and keeps a swap fallback", () => {
  const src = read("js/render/three/tlx-post.js");
  assert.match(src, /apex26\.tlxPostFixedMats/);
  assert.match(src, /let _fixedMats = true/);
  assert.match(src, /function bindFixedAO\(\)/);
  assert.match(src, /function bindFixedGR\(\)/);
  assert.match(src, /function bindFixedBloom\(\)/);
  // Fixed path: dir only, no .tex.value on the shared blurAO in the hot arm.
  const ao = src.slice(src.indexOf("runPass(P.ssao.mat, ssaoRT)"), src.indexOf("// 0b) Volumetric"));
  assert.match(ao, /_fixedMats && P\.blurAOH/);
  assert.match(ao, /runPass\(P\.blurAOH\.mat, ssaoBlurRT\)/);
  assert.match(ao, /runPass\(P\.blurAOV\.mat, ssaoRT\)/);
  assert.match(ao, /P\.blurAO\.tex\.value = ssaoRT\.texture/,
    "fallback arm must still swap when fixed mats are off");
  const bloom = src.slice(src.indexOf("runPass(P.bright.mat, bloomLv[0].rt)"), src.indexOf("// 3) composite"));
  assert.match(bloom, /P\.downFixed\[i - 1\]/);
  assert.match(bloom, /P\.upFinalFixed/);
  assert.match(bloom, /P\.upAddFixed\[i - 2\]/);
});

// Evaluate the actual shader's arithmetic for fixtures; this is a numeric
// contract check, not evidence of TSL compilation or GPU image quality.
function sharpenFixture(center, neighbors, limited) {
  class Node {
    constructor(value) { this.value = Array.isArray(value) ? value.slice() : [value]; }
    op(other, fn) { const b = other instanceof Node ? other.value : [other]; return new Node(this.value.map((v, i) => fn(v, b[b.length === 1 ? 0 : i]))); }
    add(b) { return this.op(b, (a, x) => a + x); }
    sub(b) { return this.op(b, (a, x) => a - x); }
    mul(b) { return this.op(b, (a, x) => a * x); }
    assign(b) { this.value = b.value.slice(); }
    greaterThan(b) { return this.value[0] > b; }
  }
  const c = new Node(center), vUV = new Node([0, 0]);
  const context = vm.createContext({ c, vUV,
    C: { sharpen: new Node(1), sharpenLimit: new Node(limited ? 1 : 0), reflTexel: { x: 1, y: 1 } },
    vec2: (x, y) => new Node([x, y]),
    caScene: (uv) => new Node(neighbors[uv.value[0] < 0 ? 0 : uv.value[0] > 0 ? 1 : uv.value[1] < 0 ? 2 : 3]),
    min: (a, b) => a.op(b, Math.min), max: (a, b) => a.op(b, Math.max),
    clamp: (a, lo, hi) => a.op(lo, Math.max).op(hi, Math.min),
    If: (condition, then) => { if (condition) then(); return { Else(otherwise) { if (!condition) otherwise(); } }; },
  });
  const source = read("js/render/three/tsl-post.js");
  const start = source.indexOf("        If(C.sharpen.greaterThan");
  const end = source.indexOf("        const aoV", start);
  vm.runInContext(source.slice(start, end), context);
  return c.value;
}

test("halo-limited sharpen is opt-in and bounds bright and dark edge extrema", () => {
  const white = [1, 1, 1], black = [0, 0, 0];
  assert.deepEqual(sharpenFixture(white, [black, black, black, black], true), white);
  assert.deepEqual(sharpenFixture(black, [white, white, white, white], true), black);
  assert.deepEqual(sharpenFixture(white, [black, black, black, black], false), [1.9, 1.9, 1.9]);
  assert.deepEqual(sharpenFixture(black, [white, white, white, white], false), [-0.9, -0.9, -0.9]);
  const mid = [0.5, 0.5, 0.5], ramp = [[0.4,0.4,0.4],[0.6,0.6,0.6],[0.5,0.5,0.5],[0.5,0.5,0.5]];
  assert.deepEqual(sharpenFixture(mid, ramp, true), mid);
  assert.match(read("js/render/three/tsl-post.js"), /sharpenLimit: uniform\(0\)/);
  assert.match(read("js/render/three/tlx-post.js"), /apex26\.tlxSharpenLimit.*=== "1" \? 1 : 0/);
});

test("fixed phone FXAA maps the destination through HIGH → MED → LOW → HIGH", () => {
  // Execute the live resolve branch, upscale gate and viewport mapper. Draws
  // and numeric TSL vectors are mocked; this does not validate GPU pixels.
  const post = read("js/render/three/tlx-post.js");
  const tlx = read("js/render/three/tlx.js");
  const viewport = read("js/render/three/tsl-viewport.js");
  function section(src, start, end) {
    const a = src.indexOf(start), b = src.indexOf(end, a);
    assert.ok(a >= 0 && b > a, `missing source section ${start}`);
    return src.slice(a, b);
  }
  const resolve = section(post, "        vset(P.composite, pW, pH);", "      _last.ssao")
    .replace(/\n      }\s*$/, ""); // close of present()'s non-viz branch
  const gate = section(tlx, "      function wantSpatialUpscale()", "      function getPresentSize(");
  const sizing = section(post, "    const halfOf =", "    function layoutHalf()");
  const uv = section(viewport, "    function uv(v)", "    function tex(node)");
  const vector = () => ({ values: [], set(...values) { this.values = values; } });
  const pass = (name) => ({ mat: name, tex: {}, V: vector(),
    U: { texel: { value: vector() }, viewport: { value: vector() }, plain: {} } });
  // Exercise both direct hardware presentation and the present-sized soft RT.
  for (const soft of [false, true]) {
    const draws = [], P = { composite: pass("composite"), fxaa: pass("fxaa"), sgsr: pass("sgsr") };
    P.fxaa.bendTex = {};
    const presentW = 1266, presentH = 585;
    const dest = soft ? { width: presentW, height: presentH } : null;
    const aaRT = { texture: {} }, ldrRT = { texture: {} };
    const context = vm.createContext({ P, presentW, presentH, phonePost: true,
      phys: true, _scissorWarm: false, compileJobs: null, _mirTex: null, fixed: true, fixedActive: () => true, spatialUpscale: false,
      dest, aaRT, ldrRT, _last: {}, _lastPresentRT: null, _mirComposites: 0, _warmFlipUp: false,
      AA: null, taaLive: () => false,   // traa off: the FXAA / SGSR branches below are today's
      presentSize: () => [presentW, presentH], mirrorPass() {}, fxaaMirror: () => false, bindWater(field) { P.fxaa.waterField = field; }, bindLens(field) { P.fxaa.bendTex.field = field; },
      cinemaPost: (rt) => rt, F: {}, o: { visorLens: { bend: { x: .03, y: .05 }, light: {} } },   // the desktop-tier CINEMA hook: off below EXTREME (tsl-gi.js)
      vset(p, w, h) { p.V.set(w, h); },
      runPass(mat, target) { draws.push({ mat, target, view: P[mat].V.values.slice() }); },
      enabled: true, screenCoordinate: { xy: [presentW / 2, presentH / 2] },
      vec2: (xy) => ({ div: (size) => xy.map((v, i) => v / size[i]) }),
    });
    vm.runInContext(gate + sizing + uv, context);
    context.ctx = { wantSpatialUpscale: context.wantSpatialUpscale, userSpatialUpscale: () => false };
    for (const [W, H, scale, lazyLens] of [[1266, 585, 1, false], [950, 439, .75, true], [633, 293, .5, true], [1266, 585, 1, true]]) {
      Object.assign(context, { W, H, renderScale: scale });
      vm.runInContext("pW = postSize(W); pH = postSize(H);", context);
      let lensReads = 0;
      // Exercise both the established frame payload and the lazy game accessor.
      if (lazyLens) context.o.readVisorLens = () => { lensReads++; return context.o.visorLens; };
      draws.length = 0;
      context.o.visorFolded = false;
      vm.runInContext("{\n" + resolve + "\n}", context);
      const { pW, pH } = context;
      assert.equal(context.o.visorFolded, !soft && scale === 1 ? 2 : false);
      assert.equal(lensReads, lazyLens ? 1 : 0, "every final resolve can receive wet refraction");
      assert.equal(P.fxaa.bendTex.field, context.o.visorFolded ? context.o.visorLens : null);
      assert.deepEqual(draws[0].view, [pW, pH], "composite keeps its reduced target");
      assert.deepEqual(P.fxaa.U.texel.value.values, [1 / pW, 1 / pH], "FXAA texels follow its input");
      const final = draws.at(-1);
      assert.equal(final.target, dest);
      assert.deepEqual(final.view, [presentW, presentH], "final output view covers its destination");
      assert.deepEqual(context.uv({ size: final.view }), [.5, .5], "canvas center reads image center");
      if (scale === 1) {
        assert.deepEqual(draws.map((d) => d.mat), ["composite", "fxaa"]);
      } else {
        assert.deepEqual(draws.map((d) => d.mat), ["composite", "fxaa", "sgsr"]);
        assert.equal(draws[1].target, aaRT);
        assert.deepEqual(draws[1].view, [pW, pH], "intermediate FXAA view resets after HIGH");
        assert.deepEqual(P.sgsr.U.viewport.value.values, [1 / pW, 1 / pH, pW, pH]);
      }
    }
  }
});

test("presentSize() and getPresentSize(out) answer in scratch: no fresh pair a present (#5057)", () => {
  // Node VM census 2026-11-11: 64 B -> 0 a call, up to once a present on a fixed phone target.
  const post = read("js/render/three/tlx-post.js"), tlx = read("js/render/three/tlx.js");
  const a = post.indexOf("    const _psOut"), fn = post.indexOf("    function presentSize(", a);
  assert.ok(a >= 0 && fn > a, "tlx-post keeps its present-size scratch beside presentSize()");
  const ps = post.slice(a, post.indexOf("\n    }\n", fn) + 6);
  const gps = tlx.split("\n").find((l) => l.includes("function getPresentSize("));
  const context = vm.createContext({ PW: 844, PH: 390, presentW: 1688, presentH: 780, W: 999, H: 499 });
  vm.runInContext(gps + "\nvar ctx = { getPresentSize };\n" + ps, context, { filename: absSrc("js/render/three/tlx-post.js") });
  const presentSize = vm.runInContext("presentSize", context), getPresentSize = vm.runInContext("getPresentSize", context);
  const first = presentSize();
  assert.deepEqual(Array.from(first), [1688, 780]);
  assert.equal(presentSize(), first, "the same scratch pair every call");
  const out = { width: 0, height: 0 };
  assert.equal(getPresentSize(out), out, "getPresentSize fills the caller's object");
  assert.deepEqual(out, { width: 1688, height: 780 });
  const fresh = getPresentSize();
  assert.deepEqual({ ...fresh }, { width: 1688, height: 780 }, "with no target it still answers (apex-lifecycle, other callers)");
  assert.notEqual(getPresentSize(), fresh);
  vm.runInContext("presentW = 0; presentH = 0;", context);
  assert.deepEqual(Array.from(presentSize()), [999, 499], "no present size: the render size");
});


test("wet texture uploads follow field revisions and reuse the same GPU allocation", () => {
  const source = read("js/render/three/tlx-post.js"), start = source.indexOf("    let waterTexture = null"), end = source.indexOf("    function bindLens", start);
  let allocations = 0, uploads = 0;
  class DataTexture {
    constructor(data, width, height) { allocations++; this.image = { data, width, height }; }
    set needsUpdate(on) { if (on) uploads++; }
  }
  const water = { value: { set(x, y) { this.x = x; this.y = y; } } };
  const ctx = { THREE: { DataTexture, LinearFilter: 1 }, ownTexture: x => x, P: { fxaa: { waterTex: {}, water } } };
  vm.runInNewContext(source.slice(start, end) + ";this.bind = bindWater", ctx, { filename: absSrc("js/render/three/tlx-post.js") });
  const field = { data: new Uint8Array(128 * 128 * 4), size: 128, revision: 1, x: 0.01, y: 0.02 };
  ctx.bind(null); assert.equal(allocations, 0, "dry scenes allocate no wet texture");
  ctx.bind(field); assert.deepEqual([allocations, uploads, water.value.x], [1, 1, 0.01]);
  ctx.bind(field); assert.equal(uploads, 1, "unchanged or paused fields do not upload again");
  field.revision++; ctx.bind(field); assert.deepEqual([allocations, uploads], [1, 2]);
  ctx.bind(null); assert.deepEqual([water.value.x, water.value.y], [0, 0], "dry/disabled presentation takes the shader's zero-sample path");
  ctx.bind(field); assert.deepEqual([allocations, uploads], [1, 2], "re-entry reuses the unchanged texture");
});
