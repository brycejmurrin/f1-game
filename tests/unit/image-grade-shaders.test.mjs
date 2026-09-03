import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const P = (await import("node:module")).createRequire(import.meta.url)("../../tools/manifest.cjs").PATHS;
const GLSL = readFileSync(new URL(`../../${P.GLX_SHADERS_POST}`, import.meta.url), "utf8");
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

// NARROWED 2026-09-03. A test here asserted the WGSL grade mirrored the GLSL
// one function for function — the same masks, guards and composite order — and
// it was catching a real class of parity drift. WGX left the shipped tree in
// the spike-out, so there is no second implementation to compare against and
// the GLSL contract below now stands alone. This is a LOST guarantee, not a
// tidied test: if WGX is re-attached (spike/backends/README.md), restore this
// test with it, or the two grades will drift silently the way they did before
// it existed.

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
