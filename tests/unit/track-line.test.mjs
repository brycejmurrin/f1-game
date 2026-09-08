/* track-line.test.mjs — TrackLine.bake on synthetic tracks: the geometry the AI
 * drives is outside-inside-outside, stays on the road, and has no opinion on a
 * straight. The live-circuit check (an AI's entry/apex/exit lateral positions on
 * monza) is in tests/unit/ai-racecraft-vm.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../../", import.meta.url);
const ctx = { console };
vm.createContext(ctx);
for (const f of ["js/core/log.js", "js/core/mat4.js", "js/track/core/line.js"])
  vm.runInContext(readFileSync(new URL(f, root), "utf8").replace(/^const /mg, "var "), ctx, { filename: f });
const TL = ctx.TrackLine;

// A synthetic track: n nodes, `hw` half-width, curvature from a function of s.
function track(total, hwv, kOf) {
  const n = Math.round(total / 4), ds = total / n;
  const curv = new Float32Array(n), hw = new Float32Array(n);
  for (let i = 0; i < n; i++) { curv[i] = kOf(i * ds, total); hw[i] = hwv; }
  return { n, total, curv, hw };
}
const cornerAt = (s0, len, k) => (s) => (s >= s0 && s < s0 + len ? k : 0);

test("a straight has no line: weight 0 everywhere, offset 0", () => {
  const t = TL.bake(track(2000, 7, () => 0));
  assert.equal(t.lineCorners.length, 0);
  assert.ok([...t.lineW].every((v) => v === 0));
  assert.ok([...t.line].every((v) => v === 0));
});

test("one left-hander: turn-in outside, apex inside, exit outside, all inside the road", () => {
  // +k is a LEFT turn; the inside is -x. 60 m of k = 0.02 (R = 50 m) in a 2 km lap.
  const t = TL.bake(track(2000, 7, cornerAt(1000, 60, 0.02)));
  assert.equal(t.lineCorners.length, 1);
  const c = t.lineCorners[0];
  assert.ok(Math.abs(c.sApex - 1030) < 6, `apex at ${c.sApex}, expected ~1030`);
  assert.equal(c.inside, -1);
  const at = (s) => TL.at(t, s);
  assert.ok(at(c.sApex).x < -4.5, `apex not on the inside edge: ${at(c.sApex).x}`);
  assert.ok(at(c.s0).x > 3.5, `turn-in not on the outside: ${at(c.s0).x}`);
  assert.ok(at(c.s1).x > 3.5, `exit not on the outside: ${at(c.s1).x}`);
  assert.ok(c.sApex - c.s0 >= 25 && c.sApex - c.s0 <= 110, `turn-in distance ${c.sApex - c.s0}`);
  assert.ok(c.s1 - c.sApex > c.sApex - c.s0, "the exit is released later than the turn-in");
  // Weight: 1 in the window, 0 far away, eased between.
  assert.equal(at(c.sApex).w, 1);
  assert.equal(at(200).w, 0);
  assert.ok(at(c.s0 - 20).w > 0 && at(c.s0 - 20).w < 1, "the weight eases in before the turn-in");
  // On the road at every node, and never a teleport between neighbours (a
  // tight corner's turn-in legitimately crosses ~10 m of road in ~30 m; the
  // car's own lateral rate bounds what it can follow).
  for (let i = 0; i < t.n; i++) {
    assert.ok(Math.abs(t.line[i]) <= 7 - TL.MARGIN + 1e-4, `off the road at node ${i}: ${t.line[i]}`);
    const d = Math.abs(t.line[i] - t.line[(i + 1) % t.n]);
    assert.ok(d < 2.5, `a ${d.toFixed(2)} m step between nodes ${i} and ${i + 1}`);
  }
});

test("a tight corner turns in later than a fast one", () => {
  const tight = TL.bake(track(2000, 7, cornerAt(1000, 40, 0.05))).lineCorners[0];   // R = 20 m
  const fast = TL.bake(track(2000, 7, cornerAt(1000, 120, 0.009))).lineCorners[0]; // R = 111 m
  assert.ok(tight.sApex - tight.s0 < fast.sApex - fast.s0, "a larger radius needs the longer approach");
});

test("a chicane is straight-lined through its middle", () => {
  const t = TL.bake(track(2000, 7, (s) => (s >= 1000 && s < 1030 ? 0.03 : s >= 1040 && s < 1070 ? -0.03 : 0)));
  assert.equal(t.lineCorners.length, 2);
  const [a, b] = t.lineCorners;
  const mid = (a.sApex + b.sApex) / 2;
  assert.ok(Math.abs(TL.at(t, mid).x) < 1.5, `not through the middle: ${TL.at(t, mid).x}`);
  assert.ok(TL.at(t, a.sApex).x < -2, "first apex still inside (left)");
  assert.ok(TL.at(t, b.sApex).x > 2, "second apex still inside (right)");
});

test("a run shorter than the minimum, or below K_ON, is not a corner", () => {
  assert.equal(TL.bake(track(2000, 7, cornerAt(1000, 8, 0.02))).lineCorners.length, 0);
  assert.equal(TL.bake(track(2000, 7, cornerAt(1000, 60, TL.K_ON * 0.9))).lineCorners.length, 0);
});

test("a corner across the lap seam is one corner and the line closes", () => {
  const t = TL.bake(track(2000, 7, (s) => (s >= 1970 || s < 30 ? 0.02 : 0)));
  assert.equal(t.lineCorners.length, 1);
  assert.ok(Math.abs(t.line[0] - t.line[t.n - 1]) < 0.6, "the line must be continuous across s = 0");
});
