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

test("attack zones: a corner after a long straight on a wide road is where the move is on", () => {
  // Two corners: one fed by ~900 m of straight, one 100 m after the first's exit.
  const t = TL.bake(track(2000, 7, (s) => (s >= 1000 && s < 1060 ? 0.02 : s >= 1200 && s < 1260 ? -0.02 : 0)));
  assert.equal(t.lineCorners.length, 2);
  const [a, b] = t.lineCorners.slice().sort((p, q) => p.s0 - q.s0);
  const qa = TL.attackAt(t, a.s0 - 60).q, qb = TL.attackAt(t, b.s0 - 60).q;
  assert.ok(qa > 0.9, `long straight into a wide corner should be a prime zone: ${qa}`);
  assert.ok(qb < 0.15, `a corner 100 m after the last is not: ${qb}`);
  assert.equal(TL.attackAt(t, a.s0 - 200).q, 0, "outside the zone the baked quality is 0 (the straight rule is the AI's)");
  // toTurnIn counts down to the next turn-in and wraps the lap.
  const d = TL.attackAt(t, a.s0 - 50).toTurnIn;
  assert.ok(Math.abs(d - 50) < 5, `50 m before the turn-in reads ${d}`);
  assert.ok(TL.attackAt(t, b.s1 + 10).toTurnIn > 1500, "past the last corner the next turn-in is round the lap");
});

test("attack zones: a narrow road takes the quality away", () => {
  const wide = TL.bake(track(2000, 7, cornerAt(1000, 60, 0.02)));
  const narrow = TL.bake(track(2000, 4.5, cornerAt(1000, 60, 0.02)));
  const c = wide.lineCorners[0];
  assert.ok(TL.attackAt(narrow, c.s0 - 60).q < 0.3 * TL.attackAt(wide, c.s0 - 60).q, "4.5 m half-width is street width: barely a zone");
});

test("the path's curvature is gentler than the road's through a corner, and the road's on a straight", () => {
  const t = TL.bake(track(2000, 7, cornerAt(1000, 60, 0.02)));
  const c = t.lineCorners[0];
  const road = 0.02, path = TL.pathK(t, c.sApex);
  assert.ok(path > 0 && path < road, `apex path curvature ${path} should be under the road's ${road}`);
  assert.ok(path >= TL.PATH_FLOOR * road - 1e-6, "never below the floor — the AI is not on rails");
  // A wide road buys the whole floor on a slow corner; a narrow one buys less.
  const narrow = TL.bake(track(2000, 4.5, cornerAt(1000, 60, 0.02)));
  assert.ok(TL.pathK(narrow, narrow.lineCorners[0].sApex) >= path, "less width, less line to gain from");
  assert.equal(TL.pathK(t, 200), 0, "a straight is a straight");
  // Sign follows the road's.
  const tr = TL.bake(track(2000, 7, cornerAt(1000, 60, -0.02)));
  assert.ok(TL.pathK(tr, tr.lineCorners[0].sApex) < 0);
});

test("families: the inner line is inside earlier at the turn-in, the outer line runs wider through a long corner", () => {
  // A long R = 60 m left-hander (180 m of arc) on a 7 m half-width.
  const t = TL.bake(track(2400, 7, cornerAt(1000, 180, 1 / 60)));
  assert.ok(t.lineIn && t.lineOut && t.lineIn.length === t.n && t.lineOut.length === t.n, "both families baked");
  const c = t.lineCorners[0];
  const main = (s) => TL.at(t, s).x, inner = (s) => TL.at(t, s, 1).x, outer = (s) => TL.at(t, s, -1).x;
  // + x is the outside of a left turn; the inner family is further INSIDE (more negative) at the turn-in.
  assert.ok(inner(c.s0) < main(c.s0) - 0.5, `inner line at the turn-in ${inner(c.s0).toFixed(2)} vs main ${main(c.s0).toFixed(2)}`);
  // The outer family (no path-length term) sits further OUTSIDE somewhere through the corner.
  let maxGap = -Infinity;
  for (let s = c.s0; s < c.s1; s += 4) maxGap = Math.max(maxGap, outer(s) - main(s));
  assert.ok(maxGap > 0.5, `outer line never wider than main (max gap ${maxGap.toFixed(2)} m)`);
  // The blend is linear in fam and 0 / absent is the racing line.
  assert.ok(Math.abs(TL.at(t, c.sApex, 0.5).x - (main(c.sApex) + inner(c.sApex)) / 2) < 1e-4);
  assert.equal(TL.at(t, c.sApex, 0).x, main(c.sApex));
  // Every family stays on the road.
  for (let i = 0; i < t.n; i++) {
    assert.ok(Math.abs(t.lineIn[i]) <= 7 - TL.MARGIN + 1e-4 && Math.abs(t.lineOut[i]) <= 7 - TL.MARGIN + 1e-4, `family off the road at node ${i}`);
  }
});

test("lineHints: apexShift moves the corner's apex later, apexInside bounds the apex to one side", () => {
  const plain = TL.bake(track(2000, 7, cornerAt(1000, 60, 0.02)));
  const s0 = plain.lineCorners[0];
  // def.turns is a racing-lap fraction; turn 1 sits at the corner's middle.
  const withShift = track(2000, 7, cornerAt(1000, 60, 0.02));
  withShift.def = { id: "syn", turns: [1030 / 2000], lineHints: [{ turn: 1, apexShift: 16 }] };
  TL.bake(withShift);
  const s1 = withShift.lineCorners[0];
  assert.ok(Math.abs((s1.sApex - s0.sApex) - 16) < 2.5, `apex moved ${(s1.sApex - s0.sApex).toFixed(1)} m, expected ~16`);
  assert.ok(Math.abs((s1.s0 - s0.s0) - 16) < 2.5, "the turn-in moves with it (a late apex is a late turn-in)");
  // apexInside −0.6: the apex plateau is held on the OUTSIDE (+x for a left turn) by 60 % of the usable width.
  const wide = track(2000, 7, cornerAt(1000, 60, 0.02));
  wide.def = { id: "syn", turns: [1030 / 2000], lineHints: [{ turn: 1, apexInside: -0.6 }] };
  TL.bake(wide);
  const c = wide.lineCorners[0];
  assert.ok(TL.at(wide, c.sApex).x >= 0.6 * (7 - TL.MARGIN) - 1e-3, `apex not held outside: ${TL.at(wide, c.sApex).x}`);
  assert.ok(TL.at(plain, s0.sApex).x < -4, "without the hint the apex is inside");
  // A hint that names no baked corner is dropped, not applied to the wrong one.
  const far = track(2000, 7, cornerAt(1000, 60, 0.02));
  far.def = { id: "syn", turns: [0.05], lineHints: [{ turn: 1, apexShift: 40 }] };
  TL.bake(far);
  assert.ok(Math.abs(far.lineCorners[0].sApex - s0.sApex) < 1e-6, "a hint 900 m from any corner must not move it");
});

test("attack zones: corners that OVERLAP are fed by no straight at all", () => {
  // `sorted` is ascending by s0, so a negative (c.s0 - prev.s1) means prev's
  // exit window runs past this corner's entry — a chicane. The lap-wrap idiom
  // `straight += L` belongs only to the seam pair at ci === 0; applied here it
  // turned a small overlap into a near-lap-length straight and saturated the
  // grade, so the AI read the exit of a chicane as the best passing place on
  // the circuit. Measured on the real tree before the fix: 233 such pairs
  // across 52 circuits, Monaco 15 of its 22 corners, and Madrid's saturated
  // node count fell 350 -> 67 once it was corrected (2026-09-22).
  //
  // Two corners whose windows overlap: the second turns in while the first is
  // still unwinding, which is what a chicane is.
  const t = TL.bake(track(2000, 7, (s) => (s >= 1000 && s < 1080 ? 0.02 : s >= 1060 && s < 1140 ? -0.02 : 0)));
  const cs = t.lineCorners.slice().sort((p, q) => p.s0 - q.s0);
  assert.ok(cs.length >= 2, `need two corners to overlap, baked ${cs.length}`);
  const [a, b] = cs;
  assert.ok(b.s0 - a.s1 < 0, `this fixture must actually overlap: gap ${(b.s0 - a.s1).toFixed(1)} m`);
  const qb = TL.attackAt(t, b.s0 - 60).q;
  assert.equal(qb, 0,
    `a corner whose entry overlaps the previous corner's exit has no straight feeding it, so its grade must be 0 — got ${qb}`);
  // ...and the seam pair must still wrap: the FIRST corner is preceded by the
  // last corner on the lap, where a negative gap is a legitimate wrap.
  assert.ok(TL.attackAt(t, a.s0 - 60).q > 0,
    "the lap-seam pair still measures its straight across the wrap");
});

test("memo: a rebuild of the same inputs is byte-identical, unshared, and any input change misses", () => {
  // bake() memoises the two most recent input sets (a rebuild of the SAME
  // circuit — the TIME chip, a field-size change — re-baked an identical LUT).
  const OUT = ["line", "lineW", "lineIn", "lineOut", "lineK", "attackQ", "toTurnIn"];
  const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
  const same = (p, q) => OUT.every((f) => bytes(p[f]).equals(bytes(q[f]))) &&
    JSON.stringify(p.lineCorners) === JSON.stringify(q.lineCorners);
  const kA = (s) => (s >= 1000 && s < 1080 ? 0.02 : s >= 1500 && s < 1540 ? -0.03 : 0);
  const kB = cornerAt(400, 90, -0.015);
  const a1 = TL.bake(track(2100, 6.5, kA));
  const b1 = TL.bake(track(2100, 6.5, kB));
  const a2 = TL.bake(track(2100, 6.5, kA));   // a different circuit in between: still a hit
  assert.ok(same(a1, a2), "the rebuild's LUT differs from the first bake");
  assert.ok(!same(a1, b1), "two different circuits baked the same LUT — the memo aliased them");
  for (const f of OUT) assert.notEqual(a1[f], a2[f], `${f} is shared between two tracks`);
  assert.notEqual(a1.lineCorners[0], a2.lineCorners[0], "lineCorners entries are shared between two tracks");
  a1.line.fill(99); a1.lineCorners[0].sApex = -1;
  assert.ok(same(a2, TL.bake(track(2100, 6.5, kA))), "mutating one track's LUT leaked into the memo");
  // ...and it IS a hit: a fresh bake of a new input set relaxes the whole lap
  // (ms); a hit copies seven arrays (µs). Best-of-3 against a 5× margin.
  const kC = cornerAt(700, 70, 0.018);
  let t0 = performance.now(); TL.bake(track(2100, 6.5, kC)); const miss = performance.now() - t0;
  let hitMs = Infinity;
  for (let r = 0; r < 3; r++) { t0 = performance.now(); TL.bake(track(2100, 6.5, kC)); hitMs = Math.min(hitMs, performance.now() - t0); }
  assert.ok(hitMs * 5 < miss, `rebuild ${hitMs.toFixed(2)} ms vs first bake ${miss.toFixed(2)} ms — the memo did not hit`);
  // Every input is in the key: one node of hw, one of curv, a hint.
  const hw1 = track(2100, 6.5, kA); hw1.hw[260] = 6.4;
  assert.ok(!same(a2, TL.bake(hw1)), "a changed hw node hit the memo");
  const k1 = track(2100, 6.5, kA); k1.curv[255] *= 1.01;
  assert.ok(!same(a2, TL.bake(k1)), "a changed curv node hit the memo");
  const h1 = track(2100, 6.5, kA); h1.def = { id: "syn", turns: [1040 / 2100], lineHints: [{ turn: 1, apexShift: 16 }] };
  assert.ok(!same(a2, TL.bake(h1)), "a changed lineHints hit the memo");
});
