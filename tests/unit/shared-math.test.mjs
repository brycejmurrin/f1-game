/* shared-math.test.mjs — the shared scalar helpers, and the ratchet that keeps
 * them shared.
 *
 * clamp was hand-copied into 15 files, lerp into 8, and the shortest-way arc
 * wrap into 7 (docs/ARCHITECTURE-REVIEW.md §8). One of the clamps had already
 * diverged (js/track/scenery/structures.js used `Math.max(lo, Math.min(hi, v))`
 * where everyone else used a comparison ladder — output-identical on the finite,
 * lo < hi arguments it was actually given, but nothing said so). The wrap is the
 * one the review flags as dangerous: a copy that folds the wrong way sends a car
 * backwards down the whole lap, once per lap.
 *
 * They now live on M4 (js/core/mat4.js, the second <script> tag) and every consumer
 * ALIASES them — `const clamp = M4.clamp;` — so hot paths keep the exact call
 * shape their private copy had. Two things are asserted here:
 *
 *   1. SEMANTICS. The behaviours the 30 migrated call sites relied on, including
 *      the two edges that made the divergent copy different, so a future
 *      "simplify" to Math.max/Math.min is a decision rather than a slip.
 *   2. THE RATCHET. No js/ file may declare its own clamp/lerp/wrap again. The
 *      alias form is the sanctioned spelling; a fresh private copy is the exact
 *      regression this wave exists to undo, and it is invisible to every other
 *      guard in the tree.
 *
 * Run: node --test tests/unit/shared-math.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// mat4.js declares `const M4` at script top level, which lands in the context's
// global LEXICAL scope rather than on the global object — read it back by name.
const ctx = vm.createContext({});
vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
const M4 = vm.runInContext("M4", ctx);
const V3 = vm.runInContext("V3", ctx);

// ---------------------------------------------------------------------------
// 1. semantics

test("clamp pins to the range and passes interior values through untouched", () => {
  assert.equal(M4.clamp(5, 0, 10), 5);
  assert.equal(M4.clamp(-1, 0, 10), 0);
  assert.equal(M4.clamp(11, 0, 10), 10);
  assert.equal(M4.clamp(0, 0, 10), 0);
  assert.equal(M4.clamp(10, 0, 10), 10);
  // Negative and fractional ranges — the LIGHTING/CAMERA tuners clamp both.
  assert.equal(M4.clamp(-3, -1, 1), -1);
  assert.equal(M4.clamp(0.55, 0.05, 1), 0.55);
});

test("clamp keeps the two edges that made the Math.max/Math.min copy different", () => {
  // (a) NaN survives rather than becoming a bound. Both forms agree here, but
  // the assertion is what stops a "clamp should return lo for garbage" edit.
  assert.ok(Number.isNaN(M4.clamp(NaN, 0, 1)));
  // (b) INVERTED range, above it: the comparison ladder falls through to hi,
  // `Math.max(lo, Math.min(hi, v))` pins to lo. No call site passes an inverted
  // range; this pins which of the two answers is ours. (Below the range the two
  // forms agree — both give lo — which is why the divergence went unnoticed.)
  assert.equal(M4.clamp(15, 10, 0), 0);
  assert.equal(M4.clamp(5, 10, 0), 10);
  // (c) a non-number is NOT coerced — `<`/`>` compare it, Math.min/max would
  // convert it to a number. The ladder therefore returns the argument as given.
  assert.equal(M4.clamp("5", 0, 10), "5");
});

test("lerp is exact at both ends and extrapolates past them", () => {
  assert.equal(M4.lerp(2, 6, 0), 2);
  assert.equal(M4.lerp(2, 6, 1), 6);      // a + (b - a) * 1 — exact, not a * 0 + b
  assert.equal(M4.lerp(2, 6, 0.5), 4);
  assert.equal(M4.lerp(2, 6, 2), 10);     // render interpolation relies on this
  assert.equal(M4.lerp(2, 6, -1), -2);
});

test("wrapDelta takes the short way round a circular axis", () => {
  const L = 1000;
  assert.equal(M4.wrapDelta(10, L), 10);
  assert.equal(M4.wrapDelta(-10, L), -10);
  // Just past the line: +10 m of progress read as -990 m without the fold.
  assert.equal(M4.wrapDelta(-990, L), 10);
  assert.equal(M4.wrapDelta(990, L), -10);
  // The half-period boundary is inclusive on the positive side (`d > half`),
  // which is what every hand-written copy did.
  assert.equal(M4.wrapDelta(500, L), 500);
  assert.equal(M4.wrapDelta(-500, L), -500);
  assert.equal(M4.wrapDelta(501, L), -499);
});

test("wrapDelta over 2π folds a heading the short way", () => {
  const TAU = Math.PI * 2;
  assert.ok(Math.abs(M4.wrapDelta(-TAU + 0.2, TAU) - 0.2) < 1e-12);
  assert.ok(Math.abs(M4.wrapDelta(TAU - 0.2, TAU) + 0.2) < 1e-12);
  assert.equal(M4.wrapDelta(0, TAU), 0);
});

test("wrapDelta is exactly what the migrated sites hand-wrote", () => {
  // The single-fold ladder, reproduced. Every migrated site differenced two
  // values already on the circle, so |d| < period — the range swept here.
  const ladder = (d, p) => { const h = p / 2; if (d > h) return d - p; if (d < -h) return d + p; return d; };
  for (const period of [1, 2 * Math.PI, 5793, 7004.3]) {
    for (let i = -999; i <= 999; i++) {
      const d = (i / 1000) * period;
      assert.equal(M4.wrapDelta(d, period), ladder(d, period), `period ${period} d ${d}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. the ratchet

function jsFiles() {
  const out = [];
  (function walk(dir) {
    for (const name of readdirSync(join(ROOT, dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (name.endsWith(".js")) out.push(rel);
    }
  })("js");
  return out;
}

// A private definition, in every spelling the tree used before this wave:
// `const clamp = (v, lo, hi) => …`, `function clamp(v, lo, hi) …`, `let lerp = …`.
// The sanctioned alias (`const clamp = M4.clamp;`) has no parameter list, so it
// cannot match. `clamp01`/`lerpLoc`/`lerpWrapped` are DIFFERENT functions with
// different signatures and are deliberately out of scope — \b ends the name.
const PRIVATE_DEF = /(?:^|\s)(?:const|let|var)\s+(clamp|lerp)\b\s*=\s*(?:function\s*)?\(|(?:^|\s)function\s+(clamp|lerp)\s*\(/;

// js/core/mat4.js is the home. js/render/three/ is the vendored-three TSL island,
// where `clamp` is a NODE-graph function imported from three, not this scalar.
const EXEMPT = (rel) => rel === "js/core/mat4.js" || rel.startsWith("js/render/three/");

test("no js/ file re-declares a private clamp or lerp", () => {
  const bad = [];
  for (const rel of jsFiles()) {
    if (EXEMPT(rel)) continue;
    const lines = readFileSync(join(ROOT, rel), "utf8").split("\n");
    lines.forEach((ln, i) => {
      if (ln.trimStart().startsWith("//") || ln.trimStart().startsWith("*")) return;
      if (PRIVATE_DEF.test(ln)) bad.push(`${rel}:${i + 1}  ${ln.trim()}`);
    });
  }
  assert.deepEqual(bad, [],
    "a private clamp/lerp came back. Alias the shared one instead — " +
    "`const clamp = M4.clamp;` (js/core/mat4.js) — which costs nothing at the call " +
    "site because it is the same function object");
});

test("the ratchet's regex actually fires on the shapes it is meant to catch", () => {
  // Anti-vacuity: a guard that matches nothing is prose. These are the exact
  // spellings the migrated files carried.
  for (const shape of [
    "const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);",
    "  const lerp = (a, b, t) => a + (b - a) * t;",
    "  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }",
    "let lerp = function (a, b, t) { return a; };",
  ]) assert.ok(PRIVATE_DEF.test(shape), `should have matched: ${shape}`);
  // …and stays off the sanctioned alias and the differently-shaped neighbours.
  for (const shape of [
    "const clamp = M4.clamp;                     // shared scalar helper (js/core/mat4.js)",
    "const clamp = M4.clamp, lerp = M4.lerp;",
    "  const clamp01 = (v) => Math.max(0, Math.min(1, v));",
    "  function lerpWrapped(a, b, u, period) {",
    "      const f = clamp(v / vMax, 0, 1);",
  ]) assert.ok(!PRIVATE_DEF.test(shape), `should NOT have matched: ${shape}`);
});

test("the shared helpers are actually consumed — the migration is not decorative", () => {
  const users = jsFiles().filter((rel) =>
    rel !== "js/core/mat4.js" && /\bM4\.(clamp|lerp|wrapDelta)\b/.test(readFileSync(join(ROOT, rel), "utf8")));
  assert.ok(users.length >= 18,
    `only ${users.length} files bind a shared scalar helper — the aliases were removed, ` +
    "not the duplication: " + users.join(", "));
});

// ---------------------------------------------------------------------------
// 3. THE MATRIX HALF
//
// WHY THIS ARRIVED LATE. The three scalars above had a sharp test from the day
// they were extracted; the six matrix functions in the same file had NONE. A
// mutation sweep on 2026-09-20 put it plainly: `mulTo`, `perspectiveTo`,
// `lookAtTo`, `orthoTo` and `invertTo` were named by ZERO test files anywhere
// in the repo — not "weakly covered", unreferenced. A sign flip in
// perspectiveTo's depth row is invisible to every existing suite, and the only
// thing that would ever have reported it is a person looking at the screen.
//
// These are PROPERTY tests, not pinned matrices. A pinned 16-float expectation
// is a second implementation with the same bugs; an inverse that round-trips,
// an identity that is neutral and a projection that puts the near plane where
// it belongs are claims about what the maths MEANS, and they fail on the
// mutations a transcription error actually produces.
const near16 = (got, want, eps, msg) => {
  for (let i = 0; i < 16; i++) {
    assert.ok(Math.abs(got[i] - want[i]) <= eps,
      `${msg}: element ${i} was ${got[i]}, expected ~${want[i]}`);
  }
};

test("mulTo is associative-with-identity and composes in the documented order", () => {
  const I = M4.ident(), out = M4.ident();
  const a = Float32Array.from([2,0,0,0, 0,3,0,0, 0,0,4,0, 5,6,7,1]);
  near16(M4.mulTo(out, a, I), a, 1e-6, "a x I must be a");
  near16(M4.mulTo(M4.ident(), I, a), a, 1e-6, "I x a must be a");
  // Column-major, so mulTo(out, a, b) applies b FIRST: scaling then translating
  // is not translating then scaling, and swapping the arguments must show it.
  const t = Float32Array.from([1,0,0,0, 0,1,0,0, 0,0,1,0, 1,0,0,1]);
  const scaleThenMove = M4.mulTo(M4.ident(), a, t);
  const moveThenScale = M4.mulTo(M4.ident(), t, a);
  assert.notDeepEqual(Array.from(scaleThenMove), Array.from(moveThenScale),
    "argument order must matter — if it does not, one operand is being ignored");
  assert.equal(scaleThenMove[12], 7, "a x translate(1,0,0) moves by the SCALED x: 5 + 2*1");
});

test("invertTo round-trips a non-trivial transform, and is safe on a singular one", () => {
  const m = M4.ident();
  M4.lookAtTo(m, [12, 4, -3], [0, 1, 0], [0, 1, 0]);
  const inv = M4.invertTo(M4.ident(), m);
  near16(M4.mulTo(M4.ident(), m, inv), M4.ident(), 1e-4, "m x m^-1 must be identity");
  // A zero matrix has no inverse. The function returns identity rather than
  // NaNs on purpose — a frame drawn from the wrong camera beats a frame drawn
  // from no camera, and NaNs propagate into every vertex downstream.
  near16(M4.invertTo(M4.ident(), new Float32Array(16)), M4.ident(), 0,
    "a singular matrix must fall back to identity, never NaN");
});

test("perspectiveTo puts the near plane at -1 and the far plane at +1", () => {
  // The depth row is the half that a sign flip silently ruins: the picture
  // still draws, and only the ordering is wrong. Project a point sitting ON
  // each plane (OpenGL convention: the camera looks down -z) and divide by w.
  const p = M4.perspectiveTo(M4.ident(), Math.PI / 3, 16 / 9, 0.5, 100);
  const depthOf = (z) => {
    const cz = p[10] * z + p[14], cw = p[11] * z;
    return cz / cw;
  };
  assert.ok(Math.abs(depthOf(-0.5) - -1) < 1e-4, `near plane mapped to ${depthOf(-0.5)}, want -1`);
  assert.ok(Math.abs(depthOf(-100) - 1) < 1e-4, `far plane mapped to ${depthOf(-100)}, want +1`);
  assert.equal(p[11], -1, "the w row must carry -z for a perspective divide to happen at all");
  assert.ok(p[0] < p[5], "a 16:9 aspect must squeeze x relative to y");
});

test("orthoTo maps the box corners onto the unit cube", () => {
  const o = M4.orthoTo(M4.ident(), -2, 2, -1, 1, 0.5, 10);
  const apply = (v) => [
    o[0] * v[0] + o[12], o[5] * v[1] + o[13], o[10] * v[2] + o[14],
  ];
  const lo = apply([-2, -1, -0.5]), hi = apply([2, 1, -10]);
  for (const [i, want] of [[0, -1], [1, -1], [2, -1]]) {
    assert.ok(Math.abs(lo[i] - want) < 1e-6, `min corner axis ${i} -> ${lo[i]}, want ${want}`);
  }
  for (const [i, want] of [[0, 1], [1, 1], [2, 1]]) {
    assert.ok(Math.abs(hi[i] - want) < 1e-6, `max corner axis ${i} -> ${hi[i]}, want ${want}`);
  }
});

test("lookAtTo builds an orthonormal basis that puts the eye at the origin", () => {
  const eye = [10, 5, 10], target = [0, 0, 0];
  const v = M4.lookAtTo(M4.ident(), eye, target, [0, 1, 0]);
  // The eye maps to the origin — that is what a view matrix IS.
  const at = (p) => [
    v[0]*p[0] + v[4]*p[1] + v[8]*p[2]  + v[12],
    v[1]*p[0] + v[5]*p[1] + v[9]*p[2]  + v[13],
    v[2]*p[0] + v[6]*p[1] + v[10]*p[2] + v[14],
  ];
  for (const c of at(eye)) assert.ok(Math.abs(c) < 1e-4, `eye did not map to the origin: ${at(eye)}`);
  // ...and the target sits straight down -z, because the camera looks that way.
  const t = at(target);
  assert.ok(Math.abs(t[0]) < 1e-4 && Math.abs(t[1]) < 1e-4,
    `target must be centred in view, got ${t}`);
  assert.ok(t[2] < 0, `target must be in FRONT of the camera (-z), got ${t[2]}`);
  // Orthonormal: each basis row is unit length. A lost normalise shows here.
  for (const row of [[v[0], v[4], v[8]], [v[1], v[5], v[9]], [v[2], v[6], v[10]]]) {
    assert.ok(Math.abs(Math.hypot(...row) - 1) < 1e-4, `basis row is not unit length: ${row}`);
  }
});

test("V3.norm returns a unit vector and refuses to divide by zero", () => {
  const u = V3.norm([3, 0, 4]);
  assert.ok(Math.abs(Math.hypot(...u) - 1) < 1e-9, `not unit: ${u}`);
  // Array.from: the vector is built inside the vm realm, so its prototype is
  // not ours and strict deepEqual rejects it as "not reference-equal".
  assert.deepEqual(Array.from(u, (n) => +n.toFixed(4)), [0.6, 0, 0.8]);
  // The `|| 1` guard: a zero vector comes back zero rather than NaN.
  assert.deepEqual(Array.from(V3.norm([0, 0, 0])), [0, 0, 0],
    "a zero vector must not produce NaN");
});
