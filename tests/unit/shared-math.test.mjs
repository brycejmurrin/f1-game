/* shared-math.test.mjs — the shared scalar helpers, and the ratchet that keeps
 * them shared.
 *
 * clamp was hand-copied into 15 files, lerp into 8, and the shortest-way arc
 * wrap into 7 (docs/ARCHITECTURE-REVIEW.md §8). One of the clamps had already
 * diverged (js/track/scenery-structures.js used `Math.max(lo, Math.min(hi, v))`
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
