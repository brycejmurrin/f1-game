/* shading-leaf-parity.test.mjs — the LEAF shading maths agree across the three shader languages, with no GPU.
 *
 * The same leaf exists as three hand-ported copies: GLSL (js/render/glx/shaders), WGSL (js/render/webgpu) and
 * TSL (js/render/three). Other tests pin that grade numbers and surface ids agree; none evaluated the maths, and
 * the ACES sign guard had to be patched into each copy separately. Here each copy's SHIPPED source text is
 * turned into a JS function and evaluated on one fixed input table against a plain-JS reference:
 *   GLSL / WGSL  the function text, transpiled (types stripped, built-ins bound). Honest only because every leaf
 *                here is scalar or strictly component-wise, so a vec3 is evaluated one channel at a time.
 *   TSL          the builder source, run against a numeric node shim (a node is a JS number).
 * Leaves: ACES tone-map, D_GGX, V_SmithGGX, F_Schlick, the bloom soft knee. FXAA is compared by its constants.
 *
 * NOT covered, and no pass here says anything about it: fog, the lamp loop and the sun-spec knee (inline in
 * main(), not leaves); shadow PCF, FXAA and anything else that samples a texture; derivatives; the ORDER a leaf
 * is called in (a copy that feeds it a stale normal passes); f32 rounding and a driver's pow/exp (this is f64,
 * tolerance 1e-9 relative); and whether any backend boots. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (rel) => fs.readFileSync(new URL("../../" + rel, import.meta.url), "utf8");
const GLSL = { chunks: read("js/render/glx/shaders/glsl-chunks.js"), lit: read("js/render/glx/shaders/glsl-lit.js"), post: read("js/render/glx/shaders/glsl-post.js") };
const WGSL = { chunks: read("js/render/webgpu/wgsl-chunks.js"), post: read("js/render/webgpu/wgsl-post.js") };
const TSL = { lit: read("js/render/three/tsl-lit.js"), post: read("js/render/three/tsl-post.js") };
const tslFile = (src) => ({ filename: absSrc(src === TSL.lit ? "js/render/three/tsl-lit.js" : "js/render/three/tsl-post.js") });

// ---- the reference: plain JS, written from the maths, not from any copy ----
const ACES = { a: 2.51, b: 0.03, c: 2.43, d: 0.59, e: 0.14 };   // the shipped coefficients (knobs / wgx.js)
const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const REF = {
  aces(x0, k = ACES) { const x = Math.max(x0, 0); return clamp((x * (k.a * x + k.b)) / (x * (k.c * x + k.d) + k.e), 0, 1); },
  dGgx(NoH, a) { const a2 = a * a, d = NoH * NoH * (a2 - 1) + 1; return a2 / Math.max(Math.PI * d * d, 1e-6); },
  vSmith(NoV, NoL, a) { const a2 = a * a; return 0.5 / Math.max(NoL * Math.sqrt(NoV * NoV * (1 - a2) + a2) + NoV * Math.sqrt(NoL * NoL * (1 - a2) + a2), 1e-5); },
  schlick(VoH, f0, f90) { const v = 1 - VoH; return f0 + (f90 - f0) * v * v * v * v * v; },
  knee(l, th) { const kn = th * 0.5 + 1e-4, s = clamp(l - th + kn, 0, 2 * kn); return Math.max(s * s / (4 * kn), l - th) / Math.max(l, 1e-4); },
};

// ---- the input table (fixed; negatives and the guard's own edge cases included on purpose) ----
const ACES_IN = [-1, -0.2417, -0.1517, -0.05, -1e-4, 0, 1e-4, 0.01, 0.18, 0.5, 1, 2.5, 8, 64];
const UNIT = [0, 0.001, 0.05, 0.25, 0.5, 0.75, 0.95, 1];
const ROUGH = [0.02, 0.089, 0.3, 0.55, 1];   // alpha (roughness squared at the call sites)

// ---- GLSL / WGSL: function text -> JS ----
const strip = (s) => s.replace(/\/\/[^\n]*/g, "");
/** `name` function from a GLSL or WGSL source: { params: [names], body }. */
function shaderFn(src, name) {
  const m = new RegExp("(?:fn\\s+|\\b(?:float|vec3)\\s+)" + name + "\\s*\\(([^)]*)\\)[^{]*\\{").exec(src);
  assert.ok(m, name + ": function not found");
  const end = src.indexOf("\n}", m.index);
  const params = m[1].split(",").map((p) => p.trim()).map((p) => (/^(\w+)\s*:/.exec(p) || /(\w+)$/.exec(p))[1]);
  return { params, body: strip(src.slice(m.index + m[0].length, end)) };
}
/** Statements of a scalar / component-wise leaf as JS. Refuses anything it would have to guess at. */
function toJs(body) {
  const js = body
    .replace(/vec3(?:<f32>)?\s*\(/g, "(")                                  // a splat or a cast: one channel at a time
    .replace(/(^|[;{\n])\s*(?:float|vec3|let|var)\s+(?=\w+\s*=)/g, "$1 let ");   // declarations
  const bad = /\b(?:texture\w*|dot|cross|length|normalize|dFdx|dpdx|if|for|while)\b|\.[xyzwrgba]{1,4}\b|\*\w+|&/.exec(js);
  assert.equal(bad, null, "not a scalar / component-wise leaf: " + (bad && bad[0]));
  return js;
}
const BUILTINS = "const { max, min, sqrt, pow, abs, exp } = Math; const clamp = (x, lo, hi) => min(max(x, lo), hi); const PI = 3.14159265359;";
function compile(params, body, scope = {}) {
  const names = Object.keys(scope);
  return new Function(...names, ...params, BUILTINS + toJs(body))
    .bind(null, ...names.map((n) => scope[n]));
}
const glslAces = (src = GLSL.chunks) => { const f = shaderFn(src, "acesTonemap"); return compile(f.params, f.body, { uAcesA: ACES.a, uAcesB: ACES.b, uAcesC: ACES.c, uAcesD: ACES.d, uAcesE: ACES.e }); };
const wgslAces = () => { const f = shaderFn(WGSL.chunks, "acesTonemap"); const g = compile(f.params, f.body); return (x) => g(x, ACES.a, ACES.b, ACES.c, ACES.d, ACES.e); };
const leaf = (src, name) => { const f = shaderFn(src, name); return compile(f.params, f.body); };

// ---- TSL: builder source against a numeric shim ----
class N {
  constructor(v) { this.v = v; }
  mul(o) { return new N(this.v * val(o)); } add(o) { return new N(this.v + val(o)); }
  sub(o) { return new N(this.v - val(o)); } div(o) { return new N(this.v / val(o)); }
  oneMinus() { return new N(1 - this.v); } toVar() { return this; } assign(o) { this.v = val(o); return this; }
}
const val = (o) => (o instanceof N ? o.v : o);
const fn1 = (f) => (...a) => new N(f(...a.map(val)));
const SHIM = {
  max: fn1(Math.max), min: fn1(Math.min), sqrt: fn1(Math.sqrt), clamp: fn1(clamp), float: fn1((x) => x), vec3: fn1((x) => x),
  Fn: (f) => { const g = (...a) => f(a.map((x) => (x instanceof N ? x : new N(x)))); g.setLayout = () => g; return g; },
  PI: 3.14159265359,
};
/** Source from `head` up to (not including) `tail`, evaluated with the shim; returns the names asked for. */
function tsl(src, head, tail, names, extra = {}) {
  const at = src.indexOf(head), cut = src.indexOf(tail, at), to = cut + tail.length;
  assert.ok(at >= 0 && cut > at, "TSL slice moved: " + head);
  const ctx = vm.createContext({ ...SHIM, ...extra });
  return vm.runInContext("(() => {" + src.slice(at, to) + "\nreturn { " + names.join(", ") + " }; })()", ctx, tslFile(src));
}
const tslAces = () => {
  const C = { acesA: new N(ACES.a), acesB: new N(ACES.b), acesC: new N(ACES.c), acesD: new N(ACES.d), acesE: new N(ACES.e) };
  const { acesTonemap } = tsl(TSL.post, "const acesTonemap = (x0) => {", ".add(C.acesE)), 0.0, 1.0);\n    };", ["acesTonemap"], { C });
  return (x) => val(acesTonemap(new N(x)));
};
const tslBrdf = () => tsl(TSL.lit, "const D_GGX = Fn(", "{ name: \"a\", type: \"float\" }, { name: \"viewRoot\", type: \"float\" }] });", ["D_GGX", "smithViewRoot", "V_SmithGGX"]);

// ---- comparison ----
const close = (got, want) => Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want));
function agree(label, table, ref, copies) {
  for (const [lang, f] of Object.entries(copies)) {
    for (const args of table) {
      const got = f(...args), want = ref(...args);
      assert.ok(close(got, want), `${label} · ${lang} · (${args.join(", ")}): got ${got}, reference ${want}`);
    }
  }
}
const grid = (...axes) => axes.reduce((rows, ax) => rows.flatMap((r) => ax.map((v) => [...r, v])), [[]]);

test("ACES tone-map: GLSL, WGSL and TSL agree with the reference, negatives included", () => {
  agree("aces", ACES_IN.map((x) => [x]), (x) => REF.aces(x), { glsl: glslAces(), wgsl: wgslAces(), tsl: tslAces() });
});

test("the harness catches the defect it exists for: a copy without the sign guard fails on a negative input", () => {
  const unguarded = glslAces(GLSL.chunks.replace("x = max(x, vec3(0.0));", ""));
  const wrong = ACES_IN.filter((x) => !close(unguarded(x), REF.aces(x)));
  assert.deepEqual(wrong, [-1, -0.2417, -0.1517, -0.05], "every input below -b/a rises back out of black");
  assert.equal(unguarded(-0.2417) >= 0.999, true, "and -0.2417 is pure white, as the GLSL comment records");
});

test("D_GGX: three copies agree", () => {
  const T = tslBrdf();
  agree("D_GGX", grid(UNIT, ROUGH), REF.dGgx, { glsl: leaf(GLSL.lit, "D_GGX"), wgsl: leaf(WGSL.chunks, "D_GGX"), tsl: (h, a) => val(T.D_GGX(h, a)) });
});

test("V_SmithGGX: three copies agree (TSL takes its view root from smithViewRoot, as its callers do)", () => {
  const T = tslBrdf();
  agree("V_SmithGGX", grid(UNIT, UNIT, ROUGH), REF.vSmith, {
    glsl: leaf(GLSL.lit, "V_SmithGGX"), wgsl: leaf(WGSL.chunks, "V_SmithGGX"),
    tsl: (v, l, a) => val(T.V_SmithGGX(v, l, a, T.smithViewRoot(new N(v), new N(a)))),
  });
});

test("F_Schlick: three copies agree, one channel at a time", () => {
  const { F_Schlick } = tsl(TSL.lit, "const F_Schlick = Fn(", "{ name: \"f0\", type: \"vec3\" }, { name: \"f90\", type: \"float\" }] });", ["F_Schlick"]);
  agree("F_Schlick", grid(UNIT, [0.02, 0.04, 0.56, 1], [0, 0.45, 1]), REF.schlick, {
    glsl: leaf(GLSL.lit, "F_Schlick"), wgsl: leaf(WGSL.chunks, "F_Schlick"), tsl: (v, f0, f90) => val(F_Schlick(v, f0, f90)),
  });
});

test("bloom soft knee: three copies agree", () => {
  const cut = (src, head, tail) => { const at = src.indexOf(head), to = src.indexOf(tail, at); assert.ok(at >= 0 && to > at, "knee slice moved: " + head); return strip(src.slice(at, to)); };
  const glsl = compile(["l", "uThreshold"], cut(GLSL.post, "float knee = uThreshold * 0.5", "outColor = vec4(c * k, 1.0);") + "return k;");
  const wBody = cut(WGSL.post, "let knee = U.threshold * 0.5", "return vec4<f32>(c * (").replace(/U\.threshold/g, "U_threshold");
  const wRet = /return vec4<f32>\(c \* \((max\(soft, lum - U\.threshold\) \/ max\(lum, 1e-4\))\), 1\.0\);/.exec(WGSL.post);
  assert.ok(wRet, "WGSL knee return moved");
  const wgsl = compile(["lum", "U_threshold"], wBody + "return " + wRet[1].replace(/U\.threshold/g, "U_threshold") + ";");
  const tslKnee = (l, th) => val(vm.runInContext("(() => {" + TSL.post.slice(TSL.post.indexOf("const knee = brightU.threshold"), TSL.post.indexOf("return vec4(c.mul(k), 1.0);")) + "\nreturn k; })()",
    vm.createContext({ ...SHIM, l: new N(l), brightU: { threshold: new N(th) } }), tslFile(TSL.post)));
  agree("knee", grid([0, 1e-5, 0.2, 0.5, 0.74, 0.75, 0.76, 1, 1.5, 4, 40], [0.05, 0.75, 1, 3]), REF.knee, { glsl, wgsl, tsl: tslKnee });
});

test("FXAA constants: the three copies carry the same numbers (the pass samples a texture: not evaluated)", () => {
  const nums = (s) => s.match(/\d+\.\d+/g).map(Number);
  const g = /const float FXAA_SUBPIX = ([\d.]+);[\s\S]*?float\[8\]\(([^)]*)\)/.exec(GLSL.post);
  const w = /const FXAA_SUBPIX\s*(?::\s*f32)?\s*=\s*([\d.]+);/.exec(WGSL.post), wStep = /FXAA_STEP[^=]*=\s*array<f32,\s*8>\(([^)]*)\)/.exec(WGSL.post);
  const t = /const FXAA_STEP = \[([^\]]*)\];/.exec(TSL.post), tSub = /function labFxaaSubpix[\s\S]*?\n {4}return ([\d.]+);\n {2}\}/.exec(TSL.post);
  assert.ok(g && w && wStep && t && tSub, "an FXAA constant moved");
  assert.deepEqual([+w[1], +tSub[1]], [+g[1], +g[1]], "sub-pixel blend (TSL: the no-lab value)");
  assert.deepEqual(nums(wStep[1]), nums(g[2]));
  assert.deepEqual(nums(t[1]), nums(g[2]));
  const edge = (s) => { const m = /range\s*(?:<|\.greaterThanEqual\()\s*max\((?:float\()?([\d.]+)\)?,\s*lMax\s*(?:\*|\.mul\()\s*([\d.]+)/.exec(s); assert.ok(m, "FXAA edge early-out moved"); return [+m[1], +m[2]]; };
  assert.deepEqual(edge(WGSL.post), edge(GLSL.post));
  assert.deepEqual(edge(TSL.post), edge(GLSL.post));
});
