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

// ── exact stamp arcs + the fast preview build (2026-10-01) ──────────────────
// The engine build of a spliced loop from its UNQUANTISED control points: the
// 0.25 m save lattice (CustomTracks.sanitize) adds a curvature ripple of its own
// (±2·10⁻⁴ /m, ~7 % of R at 300 m) that is not the stamp's geometry.
function rawBuild(ctx, C, pts) {
  const raw = C.toRaw(C.sanitize(design({ pts })));
  raw.id = "__stamp-test"; raw.path.pts = pts.map((p) => [p[0], p[1]]);
  return ctx.Tracks.buildCenterline(ctx.TrackDef.fromRaw(raw));
}
/** Built radius under a stamp: 1 / peak |curv| over the middle 60 % of the arc a → b. */
function midArcRadius(tr, a, b) {
  const near = (p) => { let best = Infinity, k0 = 0; for (let k = 0; k < tr.n; k++) { const d = Math.hypot(tr.px[k] - p[0], tr.pz[k] - p[1]); if (d < best) { best = d; k0 = k; } } return k0; };
  const k0 = near(a), span = ((near(b) - k0) % tr.n + tr.n) % tr.n;
  let peak = 0;
  for (let s = Math.round(span * 0.2); s <= Math.round(span * 0.8); s++) peak = Math.max(peak, Math.abs(tr.curv[(k0 + s) % tr.n]));
  return 1 / peak;
}

test("stamps: arcs are sampled exactly — 8-25 m chords, compensated at their own step, landing on the end pose", () => {
  const { ST, S } = bootEditor();
  for (const R of [15, 18, 30, 45, 100, 300, 600]) for (const deg of [10, 35, 90, 180, 270]) {
    const A = deg * Math.PI / 180, { Rc, n } = ST.arcFor(R, A), phi = A / n, chord = 2 * Rc * Math.sin(phi / 2);
    assert.ok(chord >= ST.SPACING - 1e-9 || n === 1, `R ${R} ${deg}°: chord ${chord.toFixed(2)} ≥ 8 m`);
    assert.ok(chord <= 25 + 1e-9 || 2 * Rc * Math.sin(A / (2 * (n + 1))) < ST.SPACING, `R ${R} ${deg}°: chord ${chord.toFixed(2)} ≤ 25 m unless one step more breaks the 8 m rule`);
    const f = 1 - 0.25 * (1 - Math.cos(phi));
    assert.ok(Math.abs(Rc * f * f - R) < 1e-6 * R, `R ${R} ${deg}°: two Laplacian passes at φ ${(phi * 180 / Math.PI).toFixed(1)}° land on R`);
    const pose = { x: 10, z: -20, th: 0.7 }, arc = S.arcPts(pose, Rc, A, 0, n), e = arc.pts[n - 1];
    // +sweep is a LEFT turn: heading (sin θ, cos θ) rotates toward +x, centre at pose + Rc (cos θ, −sin θ)
    const cx = pose.x + Rc * Math.cos(pose.th), cz = pose.z - Rc * Math.sin(pose.th);
    for (const p of arc.pts) assert.ok(Math.abs(Math.hypot(p[0] - cx, p[1] - cz) - Rc) < 1e-9 * Rc, "every point on the circle");
    const th1 = pose.th + A;
    assert.ok(Math.hypot(e[0] - (cx - Rc * Math.cos(th1)), e[1] - (cz + Rc * Math.sin(th1))) < 1e-9 * Rc, "the last point is the analytic end");
    assert.ok(Math.abs(arc.end.th - th1) < 1e-12 && arc.end.x === e[0] && arc.end.z === e[1], "end pose = last point, heading + sweep");
  }
});

test("stamps: a CORNER spliced into a 25 m loop BUILDS at the requested radius (±3 %, R 30-300)", () => {
  const { ST, S, C, ctx } = bootEditor();
  const base = S.resample(ellipse(36, 900, 500), 25);
  for (const R of [30, 45, 100, 300]) for (const dir of [1, -1]) {
    const r = ST.splice(base, 40, 46, "corner", { R, deg: 90, dir });
    assert.equal(r.ok, true, r.reason);
    const tr = rawBuild(ctx, C, r.pts);
    const built = midArcRadius(tr, r.pts[r.sel[0] - 1], r.pts[r.sel[1]]);
    assert.ok(Math.abs(built / R - 1) < 0.03, `R ${R} dir ${dir}: built ${built.toFixed(1)} m (was −5 %…−6 % at R 30/45/300 before exact arcs)`);
  }
});

test("splice: ≥ 8 m spacing, ≤ 200 points, index 0 stays the start; a 400-stamp fuzz rarely runs out of points", () => {
  const { ST, S, TR } = bootEditor();
  const rnd = S.rng(11), kinds = Object.keys(ST.KINDS);
  let ok = 0, many = 0;
  const other = {};
  for (let t = 0; t < 400; t++) {
    const base = t % 2 ? ellipse(36 + (t % 40), 700, 450) : TR.generate(t).pts;
    const N = base.length, i0 = Math.floor(rnd() * N), ins = rnd() < 0.5, i1 = ins ? i0 : (i0 + 1 + Math.floor(rnd() * 6)) % N;
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const p = { L: 30 + rnd() * 1400, R: 15 + rnd() * 200, deg: 10 + rnd() * 200, dir: rnd() < 0.5 ? 1 : -1 };
    const r = ST.splice(base, i0, i1, kind, p);
    if (!r.ok) { if (/too many/.test(r.reason)) many++; else other[r.reason] = (other[r.reason] || 0) + 1; continue; }
    ok++;
    assert.ok(r.pts.length <= 200, `t ${t}: ${r.pts.length} points`);
    for (let i = 0; i < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[(i + 1) % r.pts.length];
      assert.ok(Number.isFinite(a[0]) && Number.isFinite(a[1]), `t ${t}: finite`);
      assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) >= ST.SPACING - 1e-9, `t ${t} ${kind}: spacing ${Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(2)} at ${i}`);
    }
    // Index 0 (the start line) moves only when the replaced span wraps past it.
    if (!(i1 < i0)) assert.equal(r.pts[0], base[0], `t ${t}: index 0 is still the start`);
    assert.ok(r.sel[0] > 0 && r.sel[0] <= r.sel[1] && r.sel[1] < r.pts.length, `t ${t}: the selection names the stamp`);
  }
  console.log(`splice fuzz: ${ok}/400 ok, ${many} "too many points" (67 before the 60 m fill + two-sided thinning)`, other);
  assert.ok(many <= 8, `${many}/400 stamps ran out of points (≤ 2 %)`);
});

test("buildCenterline(def, { line: false }) is the default build minus the racing line", () => {
  const { Tracks, V } = bootEditor();
  for (const def of [Tracks.LIST.find((d) => d.id === "monza"), V.previewDef(design())]) {
    const a = Tracks.buildCenterline(def), b = Tracks.buildCenterline(def, { line: false });
    assert.equal(a.n, b.n); assert.equal(a.total, b.total);
    for (const k of ["px", "py", "pz", "tx", "tz", "curv", "hw", "bank"]) assert.deepEqual(Array.from(b[k]), Array.from(a[k]), `${def.id}: ${k}`);
    assert.deepEqual(b.bankP, a.bankP, `${def.id}: banking profile`);
    assert.ok(a.line && a.line.length === a.n, "the default build bakes the racing line");
    assert.equal(b.line, null, "line: false leaves tr.line null");
    assert.equal(b.lineW, undefined);
  }
});
