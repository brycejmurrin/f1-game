import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const P = (await import("node:module")).createRequire(import.meta.url)("../../tools/manifest.cjs").PATHS;
const GLSL = readFileSync(new URL(`../../${P.GLX_SHADERS_POST}`, import.meta.url), "utf8");
const WGSL = readFileSync(new URL(`../../${P.WGSL_POST}`, import.meta.url), "utf8");
const LUMA = [0.2126, 0.7152, 0.0722];
const luma = (c) => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function zoneWeights(y) {
  const z = Math.log2(Math.max(y, 1e-6) / 0.18);
  return [
    1 - smooth(-4, -0.75, z),
    smooth(-4, -1.5, z) * (1 - smooth(-1, 0.75, z)),
    smooth(-2.5, -0.5, z) * (1 - smooth(0.5, 2.5, z)),
    smooth(0, 1.5, z) * (1 - smooth(3, 5, z)),
    smooth(2.5, 5, z),
  ];
}

function applyToeShoulder(c, toe, shoulder) {
  const positive = c.map((v) => Math.max(v, 0));
  const oldY = Math.max(luma(positive), 1e-6);
  const pivot = 0.18;
  const exponent = oldY < pivot
    ? 2 ** clamp(toe, -1, 1)
    : 2 ** clamp(-shoulder, -1, 1);
  const newY = pivot * (oldY / pivot) ** exponent;
  const scale = newY / Math.max(oldY, 1e-6);
  return positive.map((v) => v * scale);
}

function hdrGrade(c, p = {}) {
  const lift = p.lift ?? [0, 0, 0];
  const gamma = p.gamma ?? [1, 1, 1];
  const gain = p.gain ?? [1, 1, 1];
  let out = c.map((v, i) => {
    const safeGain = Math.max(gain[i], 1e-3);
    const invGamma = 1 / Math.max(gamma[i], 1e-3);
    return lift[i] + (safeGain - lift[i]) * Math.max(v, 0) ** invGamma;
  });

  const weights = zoneWeights(Math.max(luma(out.map((v) => Math.max(v, 0))), 1e-6));
  const tones = p.tones ?? [0, 0, 0, 0, 0];
  const stops = clamp(weights.reduce((sum, w, i) => sum + w * tones[i], 0), -4, 4);
  out = out.map((v) => v * 2 ** stops);
  out = applyToeShoulder(out, p.toe ?? 0, p.shoulder ?? 0);
  return out.map((v) => Math.max(v, 0));
}

test("tonal masks target ordered luminance ranges", () => {
  const dark = zoneWeights(0.01);
  const mid = zoneWeights(0.18);
  const bright = zoneWeights(4);
  assert.ok(dark[0] > dark[4]);
  assert.ok(mid[2] > mid[0] && mid[2] > mid[4]);
  assert.ok(bright[4] > bright[0]);
});

test("GLSL exposes the exact safe packed HDR grade contract", () => {
  assert.match(GLSL, /uniform vec4 uTone0/);
  assert.match(GLSL, /uniform vec4 uTone1/);
  for (const name of ["uLift", "uGamma", "uGain"])
    assert.match(GLSL, new RegExp(`uniform vec3 ${name}`));
  assert.match(GLSL, /applyHdrGrade/);
  assert.match(GLSL, /float z = log2\(max\(y, 1e-6\) \/ 0\.18\)/);
  assert.match(GLSL, /w0\.x = 1\.0 - smoothstep\(-4\.0, -0\.75, z\)/);
  assert.match(GLSL, /w0\.y = smoothstep\(-4\.0, -1\.5, z\) \* \(1\.0 - smoothstep\(-1\.0, 0\.75, z\)\)/);
  assert.match(GLSL, /w0\.z = smoothstep\(-2\.5, -0\.5, z\) \* \(1\.0 - smoothstep\(0\.5, 2\.5, z\)\)/);
  assert.match(GLSL, /w0\.w = smoothstep\(0\.0, 1\.5, z\) \* \(1\.0 - smoothstep\(3\.0, 5\.0, z\)\)/);
  assert.match(GLSL, /wWhite = smoothstep\(2\.5, 5\.0, z\)/);
  assert.match(GLSL, /vec3 gain = max\(uGain, vec3\(1e-3\)\)/);
  assert.match(GLSL, /vec3 invGamma = 1\.0 \/ max\(uGamma, vec3\(1e-3\)\)/);
  assert.match(GLSL, /pow\(max\(c, vec3\(0\.0\)\), invGamma\)/);
  assert.match(GLSL, /exp2\(clamp\(stops, -4\.0, 4\.0\)\)/);
  assert.match(GLSL, /dot\(c, vec3\(0\.2126, 0\.7152, 0\.0722\)\)/);
  assert.match(GLSL, /exp2\(clamp\(toe, -1\.0, 1\.0\)\)/);
  assert.match(GLSL, /exp2\(clamp\(-shoulder, -1\.0, 1\.0\)\)/);
  assert.match(GLSL, /newY \/ max\(oldY, 1e-6\)/);
  assert.match(GLSL, /return max\(c, vec3\(0\.0\)\)/);
});

test("WGSL mirrors exact HDR masks, safety guards, and composite order", () => {
  assert.match(WGSL, /fn gradeZoneWeights\(/);
  assert.match(WGSL, /fn applyToeShoulder\(/);
  assert.match(WGSL, /fn applyHdrGrade\(/);
  assert.match(WGSL, /let z = log2\(max\(y, 1e-6\) \/ 0\.18\)/);
  assert.match(WGSL, /1\.0 - smoothstep\(-4\.0, -0\.75, z\)/);
  assert.match(WGSL, /smoothstep\(-4\.0, -1\.5, z\) \* \(1\.0 - smoothstep\(-1\.0, 0\.75, z\)\)/);
  assert.match(WGSL, /smoothstep\(-2\.5, -0\.5, z\) \* \(1\.0 - smoothstep\(0\.5, 2\.5, z\)\)/);
  assert.match(WGSL, /smoothstep\(0\.0, 1\.5, z\) \* \(1\.0 - smoothstep\(3\.0, 5\.0, z\)\)/);
  assert.match(WGSL, /smoothstep\(2\.5, 5\.0, z\)/);
  assert.match(WGSL, /max\(U\.gain\.xyz, vec3<f32>\(1e-3\)\)/);
  assert.match(WGSL, /1\.0 \/ max\(U\.gamma\.xyz, vec3<f32>\(1e-3\)\)/);
  assert.match(WGSL, /pow\(max\(c_in, vec3<f32>\(0\.0\)\)/);
  assert.match(WGSL, /exp2\(clamp\(stops, -4\.0, 4\.0\)\)/);
  assert.match(WGSL, /dot\(c, vec3<f32>\(0\.2126, 0\.7152, 0\.0722\)\)/);
  assert.match(WGSL, /exp2\(clamp\(toe, -1\.0, 1\.0\)\)/);
  assert.match(WGSL, /exp2\(clamp\(-shoulder, -1\.0, 1\.0\)\)/);
  assert.match(WGSL, /newY \/ max\(oldY, 1e-6\)/);
  assert.match(WGSL, /return max\(c, vec3<f32>\(0\.0\)\)/);
  assert.match(
    WGSL,
    /c = c \+ bloomSample[\s\S]*?c = applyHdrGrade\(c\);[\s\S]*?c = acesTonemap\(/,
    "HDR grade must run after bloom composition and before ACES",
  );
});

test("neutral HDR grade preserves representative linear samples", () => {
  const samples = [
    [0, 0, 0],
    [0.005, 0.01, 0.02],
    [0.18, 0.18, 0.18],
    [1, 2, 4],
    [16, 8, 2],
  ];
  for (const sample of samples) {
    const actual = hdrGrade(sample);
    actual.forEach((v, i) => assert.ok(Math.abs(v - sample[i]) <= 1e-6));
  }
});

test("every control min/max combination stays finite", () => {
  const bounds = [
    [-1, 1], [-1, 1], [-1, 1], [-1, 1], [-1, 1], // tonal zones
    [-1, 1], [-1, 1],                               // toe, shoulder
    [-0.15, 0.15], [-0.15, 0.15], [-0.15, 0.15],   // lift
    [0.5, 2], [0.5, 2], [0.5, 2],                  // gamma
    [0.5, 1.5], [0.5, 1.5], [0.5, 1.5],           // gain
  ];
  const samples = [[0, 0, 0], [0.01, 0.18, 1], [2, 8, 32]];
  for (let mask = 0; mask < 2 ** bounds.length; mask++) {
    const values = bounds.map((pair, i) => pair[(mask >> i) & 1]);
    const p = {
      tones: values.slice(0, 5),
      toe: values[5],
      shoulder: values[6],
      lift: values.slice(7, 10),
      gamma: values.slice(10, 13),
      gain: values.slice(13, 16),
    };
    for (const sample of samples)
      assert.ok(hdrGrade(sample, p).every(Number.isFinite), `non-finite at mask ${mask}`);
  }
});

test("lift and gain primarily affect their matching channel", () => {
  const sample = [0.25, 0.25, 0.25];
  const neutral = hdrGrade(sample);
  for (const field of ["lift", "gain"]) {
    for (let channel = 0; channel < 3; channel++) {
      const values = field === "lift" ? [0, 0, 0] : [1, 1, 1];
      values[channel] += 0.1;
      const changed = hdrGrade(sample, { [field]: values });
      const delta = changed.map((v, i) => Math.abs(v - neutral[i]));
      assert.ok(delta[channel] > delta[(channel + 1) % 3] + delta[(channel + 2) % 3]);
    }
  }
});

// ── L4-d (2026-10-04): bloom threshold in EXPOSED units; the mirror / PiP inset
// takes the frame's colour grade + dither. ─────────────────────────────────────
const ROOT_URL = new URL("../../", import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT_URL), "utf8");
const TSL_POST = src("js/render/three/tsl-post.js");
const CHUNKS = src(P.WGSL_CHUNKS);

// BRIGHT_FS's quadratic soft knee, verbatim (half-width = threshold / 2).
function brightK(l, t) {
  const knee = t * 0.5 + 1e-4;
  let soft = clamp(l - t + knee, 0, 2 * knee);
  soft = soft * soft / (4 * knee);
  return Math.max(soft, l - t) / Math.max(l, 1e-4);
}

test("the bright pass tests EXPOSED luminance on all three backends, output scene-referred", () => {
  const bright = /const BRIGHT_FS = `([\s\S]*?)`;/.exec(GLSL)[1];
  assert.match(bright, /uniform float uExposure;/);
  assert.match(bright, /float l = max\(max\(c\.r, c\.g\), c\.b\) \* uExposure;/, "GLX: luminance x exposure");
  assert.match(bright, /outColor = vec4\(c \* k, 1\.0\);/, "the output stays scene-referred (the composite exposes bloom)");
  const down = /const BLOOM_DOWN = `([\s\S]*?)`;/.exec(WGSL)[1];
  assert.match(down, /exposure\s*: f32,/, "WGX BloomDownU carries the exposure");
  assert.match(down, /let lum = max\(max\(c\.r, c\.g\), c\.b\) \* U\.exposure;/);
  assert.match(WGSL, /BLOOM_DOWN_UNIFORM_BYTES: 32,/, "BloomDownU grew to 32 B (vec2 + 6 f32, 16-aligned)");
  assert.match(TSL_POST, /const l = max\(max\(c\.r, c\.g\), c\.b\)\.mul\(brightU\.exposure\)\.toVar\(\);/, "TLX");
  assert.match(src("js/render/three/tlx-post.js"), /P\.bright\.U\.exposure\.value = o\.exposure/, "TLX uploads it");
  assert.match(src("js/render/glx/post.js"), /gl\.uniform1f\(brightU\.uExposure, opts && opts\.exposure !== undefined \? opts\.exposure : 1\.0\);/);
  assert.match(src("js/render/webgpu/wgx.js"), /s\[4\] = o\.exposure != null \? o\.exposure : 1\.0;/, "WGX uploads it");
});

test("exposed-units threshold keeps the shipped bloom at default knobs, and EXPOSURE now moves it", () => {
  // game.js passes threshold x the time-of-day exposure; at exposureMul 1 the
  // composite exposure IS that value, and the knee is scale-invariant:
  // k(l*E; T*E) == k(l; T) for every l — the shipped look, unchanged.
  for (const E of [0.86, 0.9, 1.0, 1.08]) {
    for (const T of [0.78, 0.82, 0.97]) {
      for (const l of [0, 0.2, 0.5, 0.7, 0.8, 0.9, 1.0, 1.5, 4, 40]) {
        assert.ok(Math.abs(brightK(l * E, T * E) - brightK(l, T)) < 2e-4, `E ${E} T ${T} l ${l}`);
      }
    }
  }
  // EXPOSURE x1.25 (exposureMul) now blooms more of the frame it brightens.
  assert.ok(brightK(0.7 * 1.25, 0.82) > brightK(0.7, 0.82));
  const game = src("js/game.js");
  assert.match(game, /po\.threshold = clamp\(_thresh \+ LT\.threshOff, 0\.4, 1\.2\) \* frame\.exposure;/,
    "game.js scales the per-TOD threshold by the TOD exposure (not by the EXPOSURE knob)");
  assert.match(src("js/garage/setup-camera.js"), /const threshold = \(t < 0\.4 \? 0\.4 : t > 1\.2 \? 1\.2 : t\) \* SP_EXPOSURE;/,
    "the garage present keeps its bloom in exposed units, matching the race clamp");
});

test("the mirror / PiP inset takes the composite's colour grade and dither on all three backends", () => {
  // GLX: one COLOUR_GRADE / DITHER_LSB string in both programs.
  const comp = /const COMPOSITE_FS = `([\s\S]*?)`;\n/.exec(GLSL)[1];
  const mir = /const MIRROR_FS = `([\s\S]*?)`;/.exec(GLSL)[1];
  for (const s of [comp, mir]) {
    assert.match(s, /\$\{COLOUR_GRADE\}/);
    assert.match(s, /\$\{DITHER_LSB\}/);
  }
  assert.match(comp, /c = colourGrade\(c\);/);
  assert.match(comp, /c = ditherLSB\(c\);/);
  assert.match(mir, /if \(uHdr > 0\.5\) c = ditherLSB\(colourGrade\(acesTonemap\(c \* uExposure \/ uWhitePoint\)\)\);/,
    "graded only on the HDR path (post off = the frame is ungraded too)");
  const post = src("js/render/glx/post.js");
  for (const u of ["uGradeShadow", "uGradeHi", "uGradeStr", "uContrast", "uVibrance", "uSaturation", "uTint", "uBlackLift", "uGrainTime"])
    assert.ok(new RegExp(`mirU = locs\\(mirProg, \\[[^\\]]*"${u}"`).test(post), `GLX mirror locates ${u}`);
  // WGX: the shared leaves, gated by BlitU.params.w (the plain tonemap blit stays ungraded).
  assert.match(CHUNKS, /fn colourGradeP\(/);
  assert.match(CHUNKS, /fn ditherLSB\(/);
  assert.match(WGSL, /\$\{colourGradeLeaf\}/, "the WGX composite uses the same leaf");
  assert.match(WGSL, /c = ditherLSB\(c, in\.pos\.xy, U\.fx\.z\);/);
  assert.match(CHUNKS, /return vec4<f32>\(select\(c, graded, B\.params\.w > 0\.5\), 1\.0\);/);
  const wgx = src("js/render/webgpu/wgx.js");
  assert.match(wgx, /_mirrorComposite\(exposure, _postReady \? o\.tune : _TONE_STANDIN, _postReady \? o : null\);/);
  assert.match(wgx, /_mirData\[3\] = 1; _mirData\[10\] = frameTime;/);
  // TLX: the composite's grade/dither builders on the mirror's tone-mapped colour.
  const tmir = TSL_POST.slice(TSL_POST.indexOf("const mirror = {"));
  assert.match(tmir, /colourGradeT\(t\);\s*ditherT\(t, vec2\(screenCoordinate\.xy\)\);/);
  assert.match(TSL_POST, /colourGradeT\(c\);/, "the composite calls the same builder");
});
