// track-editor-geometry — js/editor/shape.js, stamps.js, randomise.js and
// validate.js over the real engine (tests/helpers/editor-vm.mjs): the Dubins
// planner lands on its goal for every word, stamps splice into a loop and the
// BUILT road carries the requested radius and turn direction, the randomiser is
// deterministic and produces valid circuits, and the validator's rules read the
// engine's own centreline.
//
// Run: node --test tests/unit/track-editor-geometry.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { bootEditor, ellipse, design } from "../helpers/editor-vm.mjs";

test("Dubins: every closed-form word integrates to its goal pose; the planner always finds a path", () => {
  const { S } = bootEditor();
  const rnd = S.rng(3);
  let words = 0, bad = 0, none = 0;
  for (let k = 0; k < 300; k++) {
    const q0 = { x: 0, z: 0, th: (rnd() - 0.5) * 6.2 }, q1 = { x: (rnd() - 0.5) * 240, z: (rnd() - 0.5) * 240, th: (rnd() - 0.5) * 6.2 };
    const psi = Math.atan2(q1.z, q1.x), r = 15;
    for (const w of S.dubinsWords(Math.hypot(q1.x, q1.z) / r, S.mod2pi((Math.PI / 2 - q0.th) - psi), S.mod2pi((Math.PI / 2 - q1.th) - psi))) {
      words++;
      const s = S.dubinsSample(q0, w, r, 2);
      if (Math.hypot(s.end.x - q1.x, s.end.z - q1.z) > 0.5 || Math.abs(S.wrapAngle(s.end.th - q1.th)) > 0.02) bad++;
    }
    const d = S.dubins(q0, q1, r, 4);
    if (!d) none++;
    else {
      // Every sampled chord respects the turning radius (no arc tighter than r).
      for (let i = 1; i + 1 < d.pts.length; i++) assert.ok(S.menger(d.pts[i - 1], d.pts[i], d.pts[i + 1]) > r * 0.9, "chord radius ≥ 0.9 r");
    }
  }
  assert.ok(words > 1000, "all six words were exercised");
  assert.equal(bad, 0, "a word's closed form disagrees with its own integration");
  assert.equal(none, 0, "the planner must always return a path (Dubins is complete)");
  // Symmetry: reversing both poses gives the same length.
  const a = S.dubins({ x: 0, z: 0, th: 0.3 }, { x: 80, z: 40, th: 1.9 }, 15, 2), b = S.dubins({ x: 80, z: 40, th: 1.9 + Math.PI }, { x: 0, z: 0, th: 0.3 + Math.PI }, 15, 2);
  assert.ok(Math.abs(a.len - b.len) < 0.5, `symmetric lengths ${a.len} vs ${b.len}`);
});

test("polyline tools: RDP, resample, Catmull, Menger, rotate, project, hull", () => {
  const { S } = bootEditor();
  const noisy = []; for (let i = 0; i <= 100; i++) noisy.push([i * 10, Math.sin(i) * 0.4]);
  assert.ok(S.rdp(noisy, 1).length <= 3, "a 1000 m line with 0.4 m noise is three points at ε 1 m");
  const sq = [[0, 0], [1000, 0], [1000, 600], [0, 600]];
  const rs = S.resample(sq, 50, true);
  assert.equal(rs.length, 64);
  for (let i = 0; i < rs.length; i++) { const p = rs[i], q = rs[(i + 1) % rs.length]; assert.ok(Math.abs(Math.hypot(q[0] - p[0], q[1] - p[1]) - 50) < 2.5, "uniform 50 m spacing"); }
  assert.equal(S.catmull(sq, 8).length, 32);
  assert.ok(Math.abs(S.menger([0, 0], [10, 10], [20, 0]) - 10) < 1e-9, "circumradius of a right angle on a 20 m chord");
  assert.equal(S.menger([0, 0], [1, 0], [2, 0]), Infinity);
  assert.deepEqual(S.rotate([[1], [2], [3], [4]], 2), [[3], [4], [1], [2]]);
  const pr = S.project(sq, 500, -10);
  assert.equal(pr.i, 0); assert.ok(Math.abs(pr.s - 500) < 1e-9 && Math.abs(pr.d - 10) < 1e-9);
  assert.equal(S.convexHull([[0, 0], [5, 5], [10, 0], [5, 2], [5, 10]]).length, 3, "the two interior points are dropped");
  assert.equal(S.crossings([0, 100, 100, 0], [0, 100, 0, 100], 4, 0).length, 1, "a bow-tie crosses once");
  assert.equal(S.crossings([0, 100, 100, 0], [0, 0, 100, 100], 4, 0).length, 0, "a square does not");
});

test("stamps: a +90° CORNER builds as a LEFT turn of (about) the requested radius; −90° turns right", () => {
  const { ST, V } = bootEditor();
  for (const dir of [1, -1]) {
    const r = ST.splice(ellipse(), 5, 8, "corner", { R: 40, deg: 90, dir });
    assert.equal(r.ok, true, r.reason);
    assert.deepEqual(r.pts[0], ellipse()[0], "index 0 (the start line) is kept");
    for (let i = 0; i < r.pts.length; i++) { const p = r.pts[i], q = r.pts[(i + 1) % r.pts.length]; assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) >= ST.SPACING - 1e-9, "≥ 8 m spacing"); }
    const v = V.check(design({ pts: r.pts }));
    assert.ok(v.tr, "the engine builds it");
    // Read the BUILT curvature under the stamp's own middle control point (the
    // Dubins rejoin behind it may be tighter; that is not what is under test).
    const mid = r.pts[Math.round((r.sel[0] + r.sel[1]) / 2)];
    let kNode = 0, best = Infinity;
    for (let k = 0; k < v.tr.n; k++) { const d = Math.hypot(v.tr.px[k] - mid[0], v.tr.pz[k] - mid[1]); if (d < best) { best = d; kNode = k; } }
    const kHere = v.tr.curv[kNode];
    assert.ok(dir > 0 ? kHere > 0 : kHere < 0, `+k is LEFT: dir ${dir} gave curvature ${kHere} under the stamp`);
    const builtR = 1 / Math.abs(kHere);
    assert.ok(Math.abs(builtR - 40) / 40 < 0.15, `built radius ${builtR.toFixed(1)} within 15 % of 40 (Laplacian pre-compensation)`);
  }
});

test("stamps: insert, wrap past the start line, every kind, and a refusal that names its reason", () => {
  const { ST } = bootEditor();
  const base = ellipse();
  const ins = ST.splice(base, 10, 10, "straight", { L: 300 });
  assert.equal(ins.ok, true, ins.reason);
  assert.ok(ins.pts.length > base.length, "an insert adds road");
  const wrap = ST.splice(base, 34, 2, "hairpin", { R: 18, dir: -1 });
  assert.equal(wrap.ok, true, wrap.reason);
  for (const kind of Object.keys(ST.KINDS)) {
    const s = ST.sample(kind, {}, { x: 0, z: 0, th: 0 });
    assert.ok(s && s.pts.length >= 1, kind);
    assert.ok(Number.isFinite(s.end.th));
  }
  assert.equal(ST.clampParams("corner", { R: 1, deg: 999, dir: -3 }).R, ST.R_MIN, "R clamps to the hairpin floor");
  assert.equal(ST.clampParams("corner", { R: 1, deg: 999, dir: -3 }).deg, 270);
  assert.equal(ST.clampParams("nope", {}), null);
  assert.ok(ST.compensate(40, 6.8) > 40 && ST.compensate(40, 6.8) < 41, "pre-compensation grows the sampled radius slightly");
  // A span that would leave fewer than four points of loop is refused, with the reason.
  const tiny = ellipse(8, 60, 40);
  const no = ST.splice(tiny, 1, 6, "corner", {});
  assert.equal(no.ok, false); assert.match(no.reason, /no room/);
});

test("seedFromSegments: a straights-and-turns list becomes a closed ~25 m-spaced loop", () => {
  const { ST, S } = bootEditor();
  const segs = [{ t: 0, l: 900 }, { t: 90, l: 120 }, { t: 0, l: 500 }, { t: 90, l: 120 }, { t: 0, l: 900 }, { t: 90, l: 120 }, { t: 0, l: 500 }, { t: 90, l: 120 }];
  const pts = ST.seedFromSegments(segs, 7);
  assert.ok(pts && pts.length > 60, "a loop of controls");
  const L = S.polyLen(pts, true);
  assert.ok(L > 2800 && L < 3600, `about the authored 3.28 km (${L.toFixed(0)}; the integrator's scale is undone)`);
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; assert.ok(Math.abs(Math.hypot(q[0] - p[0], q[1] - p[1]) - 25) < 3); }
});

test("randomise: deterministic per seed, scaled to its target, start on the longest straight, and valid after retries", () => {
  const { TR, V, S } = bootEditor();
  const a = TR.generate(7), b = TR.generate(7), c = TR.generate(8);
  assert.deepEqual(a.pts, b.pts, "same seed, same loop");
  assert.notDeepEqual(a.pts, c.pts);
  assert.ok(a.pts.length >= 60 && a.pts.length <= 200);
  assert.ok(Math.abs(S.polyLen(a.pts) - a.targetL) / a.targetL < 0.03, `length ${S.polyLen(a.pts).toFixed(0)} ≈ target ${a.targetL}`);
  assert.ok(S.signedArea(a.pts) > 0, "clockwise lap (a right-turning loop has a POSITIVE signedArea in this frame; built Σk < 0 in tests/unit/track-randomise.test.mjs)");
  let green = 0, builds = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = TR.generateValid(seed, (pts) => { builds++; return V.check(design({ pts, seed })).red === 0; }, 12);
    if (g.ok) green++;
    else { const v = V.check(design({ pts: g.pts, seed })); console.log(`seed ${seed} still red after 12 tries: ${v.issues.filter((i) => i.level === "red").map((i) => i.code + ": " + i.msg).join("; ")}`); }
  }
  console.log(`randomise: ${green}/30 seeds green, ${builds} builds`);
  assert.ok(green >= 28, `${green}/30 seeds reach a valid loop within 12 retries`);
});

test("validate: the rules read the engine's centreline (length, radius, start straight, grade, crossing, clearance)", () => {
  const { V, S, C } = bootEditor();
  const ok = V.check(design());
  assert.ok(ok.tr && ok.stats.lengthM > 3900 && ok.stats.lengthM < 4300, "an 800×500 ellipse is ~4.1 km");
  assert.ok(ok.stats.minR > 280 && ok.stats.minR < 340, `min radius ${ok.stats.minR} ≈ b²/a = 312`);
  assert.ok(ok.stats.startBackM >= 150 && ok.stats.startFwdM >= 70, "the start sits on the long side");
  assert.ok(ok.turns.length >= 2, "turns baked from curvature peaks");
  assert.ok(ok.stats.estLapS > 40 && ok.stats.estLapS < 120, `estimated lap ${ok.stats.estLapS} s (a 4.1 km oval flat out at 92 m/s is 45 s)`);
  assert.equal(ok.red, 0, JSON.stringify(ok.issues));
  // Too few points → red, no build.
  const few = V.check(design({ pts: ellipse(5) }));
  assert.ok(!few.tr && few.issues.some((i) => i.code === "points" && i.level === "red"));
  // A tiny loop: short and tight.
  const tiny = V.check(design({ pts: ellipse(24, 150, 90) }));
  assert.ok(tiny.issues.some((i) => i.code === "length" && i.level === "red"));
  // A figure-eight crosses at grade; a bridge over the crossing clears it.
  const eight = []; for (let i = 0; i < 48; i++) { const t = (i / 48) * Math.PI * 2; eight.push([Math.round(900 * Math.sin(t) * 4) / 4, Math.round(450 * Math.sin(2 * t) * 4) / 4]); }
  const x = V.check(design({ pts: eight }));
  assert.ok(x.issues.some((i) => i.code === "crossing" && i.level === "red"), "crossing at grade is red: " + JSON.stringify(x.issues.map((i) => i.code)));
  const cross = x.issues.find((i) => i.code === "crossing");
  const bridged = V.check(design({ pts: eight, bridges: [{ s: cross.s / x.stats.lengthM, halfM: 160, rise: 8 }] }));
  assert.ok(!bridged.issues.some((i) => i.code === "crossing"), "bridged: " + JSON.stringify(bridged.issues.map((i) => i.code + ":" + i.level)));
  assert.ok(bridged.issues.some((i) => i.code === "bridge" && i.level === "info"));
  // A steep bump reds the grade; the sanitiser's cap keeps a stored one legal.
  const steep = V.check(design({ elevations: [{ s: 0.5, halfM: 60, rise: 8 }] }));
  assert.ok(steep.issues.some((i) => i.code === "grade" && i.level === "red") || C.sanitize(design({ elevations: [{ s: 0.5, halfM: 60, rise: 8 }] })).elevations[0].rise < 8,
    "an 8 m rise over 120 m is either flagged or clamped to the 8 % cap");
  // The start-straight rule. ellipse() starts at t = 0, the TIGHT end (x = a):
  // on 900×350 that is R ≈ 136 m, k ≈ 0.0073 > PIT_K, so it reads as a corner;
  // a quarter-turn later (index 9) is the flattest point of the lap.
  const tightEnd = V.check(design({ pts: ellipse(36, 900, 350) }));
  assert.ok(tightEnd.issues.some((i) => i.code === "start"), "a start on the tight end of the ellipse is flagged: " + JSON.stringify(tightEnd.issues.map((i) => i.code)));
  const longSide = V.check(design({ pts: S.rotate(ellipse(36, 900, 350), 9) }));
  assert.ok(!longSide.issues.some((i) => i.code === "start" && i.level === "red"), "…and the long side is not: " + JSON.stringify(longSide.issues.map((i) => i.code + ":" + i.level)));
});
