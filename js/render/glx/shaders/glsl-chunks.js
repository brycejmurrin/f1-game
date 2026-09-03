/* Apex 26 — GLXChunks: shared GLSL leaves for the WebGL2 shader sources. The GLSL-side sibling of spike/backends/webgpu/wgsl-chunks.js (WGSLChunks) — the maintainabili… */
"use strict";

const GLXChunks = (function () {
  // ── hash: sky-family value-hash leaves (mirror WGSLChunks.hash) ──
  const hash = `float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float hash2(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.5);
  return fract(p.x * p.y);
}`;

  const vnoise = `float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i), b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0)), d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; }   // 5→4 octaves
  return s;
}`;

  const surfaceNoise = `float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`;

  const ignoise = `float ignoise(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}`;

  const tonemap = `// ACES fitted filmic tone-map (Krzysztof Narkowicz's approximation — the
vec3 acesTonemap(vec3 x) {
  float a = uAcesA, b = uAcesB, c = uAcesC, d = uAcesD, e = uAcesE;
  // SIGN GUARD, not defensive padding. The curve is a rational function, and for
  // x < -b/a BOTH the numerator x(ax+b) and the denominator x(cx+d)+e are
  // positive, so it RISES back out of the negatives: at the shipped coefficients
  // x=-0.05 maps to 10/255, x=-0.1517 to 128/255 and x<=-0.2417 clips to pure
  // WHITE. Negative x is reachable — the SHARPEN unsharp mask (post.js) is an
  // unclamped overshoot, and nothing else floors the signal before this call
  // (applyHdrGrade's max(c,0) sits behind uHdrGradeOn, which is 0 at every
  // shipped default). Dark tarmac beside a sunlit kerb went white at SHARPEN
  // 0.131, night tarmac beside neon at 0.098, on a 0..6 slider. Clamping in the
  // curve rather than at the call site keeps it true for every future consumer.
  // NOT a single-source fix: TLX and WGX carry their own hand-ported copies of
  // this function, so they were patched alongside it and must be kept in step.
  x = max(x, vec3(0.0));
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}`;

  return { hash, vnoise, surfaceNoise, ignoise, tonemap };
})();

if (typeof window !== "undefined") window.GLXChunks = GLXChunks;
