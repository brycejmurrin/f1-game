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
  const hit = S.segIntersect(0, 0, 100, 0, 10, -10, 20, 10);
  assert.ok(hit && Math.abs(hit[0] - 15) < 1e-9 && Math.abs(hit[1]) < 1e-9, "asymmetric cross lands on AB");
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

test("stamps: arc chords survive the 0.25 m save lattice — every chord of a snapped arc stays >= 8 m (bug-hunt H7)", () => {
  const { ST, S } = bootEditor();
  const q = (v) => Math.round(v * 4) / 4;
  let worst = Infinity, cases = 0;
  for (const R of [15, 16, 18, 20, 22, 25, 30, 45, 60, 100, 300]) for (let deg = 10; deg <= 270; deg += 10) for (const th of [0, 0.7, 2.1]) {
    const A = deg * Math.PI / 180, { Rc, n } = ST.arcFor(R, A);
    if (n < 2) continue;   // a one-step arc is one chord: nothing to keep apart (the validator sees it against its neighbours)
    const pose = { x: q(10.13), z: q(-20.37), th }, pts = S.arcPts(pose, Rc, A, 0, n).pts.map((p) => [q(p[0]), q(p[1])]);
    const all = [[pose.x, pose.z]].concat(pts);
    for (let i = 1; i < all.length; i++) worst = Math.min(worst, Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]));
    cases++;
  }
  assert.ok(cases > 300, "the sweep ran");
  assert.ok(worst >= ST.SPACING, `shortest snapped chord ${worst.toFixed(3)} m < 8 m: validate.js reds \"Two points closer than 8 m\" right after a legal stamp`);
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

test("clearance: a return straight inside the pit opening is not a green save", () => {
  const { V } = bootEditor();
  const n = 800, ds = 4, hw = 7, half = n / 2;
  const px = new Float64Array(n), pz = new Float64Array(n), py = new Float64Array(n);
  const curv = new Float64Array(n), hwA = new Float64Array(n);
  for (let i = 0; i < half; i++) { px[i] = i * ds; pz[i] = 0; hwA[i] = hw; }
  for (let i = 0; i < half; i++) { px[half + i] = (half - 1 - i) * ds; pz[half + i] = 22; hwA[half + i] = hw; }
  const tr = { n, total: n * ds, px, pz, py, curv, hw: hwA };
  const d = { pts: [[0, 0], [1, 0]], pit: { mode: "full", side: 1 } };
  const j = V.judge(tr, d, d);
  assert.ok(j.issues.some((i) => i.level === "red" && i.code === "clearance"));
});

// ── SPIRAL: clothoid entry / exit on the curved stamps (TrackStamps.spiralSweep) ──
// https://en.wikipedia.org/wiki/Euler_spiral — curvature linear in arc length.
const CURVED = { corner: { R: 60, deg: 90 }, hairpin: { R: 18 }, chicane: { R: 40, deg: 35 }, sbend: { R: 60, deg: 45 } };
/** The pieces each kind turns, in order (radians, signed for dir +1). */
const PIECES = { corner: (p) => [p.deg], hairpin: () => [180], chicane: (p) => [p.deg, -2 * p.deg, p.deg], sbend: (p) => [p.deg, -p.deg] };
/** A spiral of length Ls into radius Rc, integrated here by Simpson (not the
 *  module's midpoint walk): the classic shift p and tangent offset k. */
function shiftOf(Rc, Ls) {
  const N = 2000, f = (s) => s * s / (2 * Rc * Ls);
  let x = 0, y = 0;
  for (let i = 0; i <= N; i++) { const s = Ls * i / N, w = i === 0 || i === N ? 1 : i % 2 ? 4 : 2; x += w * Math.cos(f(s)); y += w * Math.sin(f(s)); }
  x *= Ls / N / 3; y *= Ls / N / 3;
  const th = Ls / (2 * Rc);
  return { p: y - Rc * (1 - Math.cos(th)), k: x - Rc * Math.sin(th) };
}

test("SPIRAL: every curved stamp turns exactly its angle for Ls 0–80; its exit line moves by the Euler spiral's own shift (a chicane's not at all)", () => {
  const { ST } = bootEditor();
  const DEG = Math.PI / 180, pose = { x: 12.5, z: -40.25, th: 0.7 };
  for (const [kind, base] of Object.entries(CURVED)) for (const R of kind === "hairpin" ? [15, 18, 25] : [base.R, 30, 120, 300].filter((r) => r <= ST.KINDS[kind].max.R)) for (const Ls of [0, 20, 40, 80]) for (const dir of [1, -1]) {
    const P = Object.assign({}, base, { R, dir, Ls }), what = `${kind} R ${R} Ls ${Ls} dir ${dir}`;
    const st = ST.sample(kind, P, pose), plain = ST.sample(kind, Object.assign({}, P, { Ls: 0 }), pose);
    const pieces = PIECES[kind](P).map((d) => d * DEG);
    const net = pieces.reduce((a, b) => a + b, 0) * dir;
    assert.ok(Math.abs(st.end.th - pose.th - net) < 1e-9, `${what}: heading change ${(st.end.th - pose.th) / DEG}° = ${net / DEG}°`);
    let shift = 0;
    for (const A of pieces) {
      const sp = ST.spiralSweep(R, Ls, Math.abs(A));
      assert.ok(Math.abs(2 * sp.sweep + sp.arc - Math.abs(A)) < 1e-12, `${what}: two spirals + the arc turn the piece's ${Math.abs(A) / DEG}°`);
      assert.ok(sp.Ls === 0 || (sp.Ls >= 17 && sp.Ls <= 2 * ST.LS_MAX), `${what}: Ls' ${sp.Ls}`);
      if (sp.Ls > 0) { const { p, k } = shiftOf(sp.Rc, sp.Ls), a = Math.abs(A); shift += p * (1 - Math.cos(a)) + k * Math.sin(a); }
    }
    // A chicane's pieces cancel (+A, −2A, +A); a hairpin's 180° is 2p; a corner's p(1 − cos A) + k sin A; an S-bend twice that.
    if (kind === "chicane") shift = 0;
    const off = (st.end.x - plain.end.x) * Math.cos(plain.end.th) - (st.end.z - plain.end.z) * Math.sin(plain.end.th);
    assert.ok(Math.abs(Math.abs(off) - shift) < 0.5, `${what}: the end sits ${off.toFixed(3)} m off the Ls = 0 stamp's exit line, the spiral shift is ${shift.toFixed(3)} m`);
    if (Ls === 0) assert.deepEqual(st.pts, plain.pts);
  }
});

test("SPIRAL: Ls 0 (or omitted) is the pre-spiral stamp byte for byte; a spiralled stamp keeps 8 m spacing and splices", () => {
  const { ST, S, TR } = bootEditor();
  // fnv1a over every pre-spiral sample (shape.js + stamps.js), pinned; re-pinned 8d93271b when arcFor took the lattice margin (SPACING + 0.5, bug-hunt H7) — the plain arcs changed, Ls stayed inert.
  const digest = (extra) => {
    let h = 0x811c9dc5;
    const feed = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } };
    for (const kind of ["corner", "hairpin", "chicane", "sbend"]) for (const R of [15, 18, 25, 30, 45, 60, 100, 300, 600]) for (const deg of [10, 35, 60, 90, 120, 180, 270]) for (const dir of [1, -1]) {
      const st = ST.sample(kind, Object.assign({ R, deg, dir }, extra), { x: 12.5, z: -40.25, th: 0.7 });
      feed(JSON.stringify([st.pts, st.end]));
    }
    return (h >>> 0).toString(16);
  };
  assert.equal(digest({}), "8d93271b", "Ls omitted: the pre-spiral output");
  assert.equal(digest({ Ls: 0 }), "8d93271b", "Ls 0: the same");
  assert.notEqual(digest({ Ls: 40 }), "8d93271b");
  assert.equal(ST.clampParams("corner", { Ls: 999 }).Ls, 80); assert.equal(ST.clampParams("hairpin", { Ls: -5 }).Ls, 0);
  assert.equal("Ls" in ST.clampParams("straight", {}), false, "a straight has no spiral");
  for (const kind of Object.keys(CURVED)) for (let R = 15; R <= 300; R += 7) for (const deg of [10, 45, 90, 180, 270]) for (const Ls of [5, 10, 25, 50, 80]) {
    // Where the plain stamp already clears the spacing rule (a 10° arc at R 15 is 2.6 m long: it does not).
    const minChord = (st) => { let prev = [0, 0], m = Infinity; for (const p of st.pts) { m = Math.min(m, Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; } return m; };
    if (minChord(ST.sample(kind, { R, deg, dir: 1 }, { x: 0, z: 0, th: 0 })) < ST.SPACING) continue;
    assert.ok(minChord(ST.sample(kind, { R, deg, Ls, dir: 1 }, { x: 0, z: 0, th: 0 })) >= ST.SPACING, `${kind} R ${R} ${deg}° Ls ${Ls}: spacing`);
  }
  const rnd = S.rng(5), kinds = Object.keys(CURVED);
  let ok = 0;
  for (let t = 0; t < 120; t++) {
    const base = TR.generate(t).pts, N = base.length, i0 = Math.floor(rnd() * N), i1 = (i0 + Math.floor(rnd() * 5)) % N;
    const r = ST.splice(base, i0, i1, kinds[t % 4], { R: 15 + rnd() * 200, deg: 10 + rnd() * 200, dir: rnd() < 0.5 ? 1 : -1, Ls: 20 + rnd() * 60 });
    if (!r.ok) continue;
    ok++;
    assert.ok(r.pts.length <= 200);
    for (let i = 0; i < r.pts.length; i++) { const a = r.pts[i], b = r.pts[(i + 1) % r.pts.length]; assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) >= ST.SPACING - 1e-9, `t ${t}: spacing at ${i}`); }
  }
  assert.ok(ok >= 100, ok + "/120 spiralled splices");
});

test("SPIRAL: a spiralled CORNER builds at its radius (±5 %, R 30–300) and the curvature steps at its ends drop ≥ 30 %", () => {
  const { ST, C, ctx } = bootEditor();
  // Three identical 120° corners and three straights: a loop that closes by
  // symmetry, so no Dubins rejoin sits beside the corner under test.
  const loop = (R, Ls) => {
    let cur = { x: 0, z: 0, th: 0 };
    const pts = [[0, 0]], marks = [];
    for (let q = 0; q < 3; q++) {
      const st = ST.sample("straight", { L: R > 200 ? 500 : 700 }, cur); pts.push(...st.pts); cur = st.end;
      const c = ST.sample("corner", { R, deg: 120, dir: -1, Ls }, cur); marks.push([pts.length - 1, pts.length - 1 + c.pts.length]); pts.push(...c.pts); cur = c.end;
    }
    pts.pop();                                            // the last corner ends on point 0
    return { pts, marks };
  };
  const measure = (R, Ls) => {
    const { pts, marks } = loop(R, Ls), tr = rawBuild(ctx, C, pts);
    const near = (p) => { let best = Infinity, k0 = 0; for (let k = 0; k < tr.n; k++) { const d = Math.hypot(tr.px[k] - p[0], tr.pz[k] - p[1]); if (d < best) { best = d; k0 = k; } } return k0; };
    let err = 0, dk = 0;
    for (const [i0, i1] of marks) {
      const a = near(pts[i0]), span = ((near(pts[i1 % pts.length]) - a) % tr.n + tr.n) % tr.n;
      let peak = 0;
      for (let s = 0; s <= span; s++) peak = Math.max(peak, Math.abs(tr.curv[(a + s) % tr.n]));
      err = Math.max(err, Math.abs(1 / peak / R - 1));
      // node-to-node curvature steps over the corner and 60 m either side of it
      for (let s = -15; s <= span + 15; s++) { const k = (a + s + tr.n) % tr.n; dk = Math.max(dk, Math.abs(tr.curv[(k + 1) % tr.n] - tr.curv[k])); }
    }
    return { err, dk };
  };
  const rows = [];
  for (const R of [30, 60, 120, 300]) {
    const flat = measure(R, 0), sp = measure(R, 80), cut = 1 - sp.dk / flat.dk;
    rows.push(`R ${R}: apex ${(sp.err * 100).toFixed(1)} % off (Ls 0: ${(flat.err * 100).toFixed(1)} %), max |Δk| ${flat.dk.toExponential(2)} → ${sp.dk.toExponential(2)} (−${(cut * 100).toFixed(0)} %)`);
    assert.ok(sp.err < 0.05, rows[rows.length - 1]);
    assert.ok(cut >= 0.3, rows[rows.length - 1]);
  }
  console.log("SPIRAL 80 m on a 120° corner:\n  " + rows.join("\n  "));
});

test("validate: 201 control points read 'Too many points', not the ±10 km 'bounds' refusal (bug-hunt H10)", () => {
  const { V } = bootEditor();
  const v = V.check(design({ pts: ellipse(201) }));
  const codes = v.issues.map((i) => i.code + ":" + i.level);
  assert.ok(v.issues.some((i) => i.code === "points" && i.level === "red" && /^Too many points/.test(i.msg)), "the cap is named: " + codes);
  assert.ok(!v.issues.some((i) => i.code === "bounds"), "…and the loop is not blamed on the map bounds: " + codes);
  assert.equal(v.ok, false);
  assert.ok(V.check(design({ pts: [[0, 0], [20000, 0], [0, 20000], [-9000, 0], [0, -9000], [900, 900], [-900, 900], [900, -900]] })).issues.some((i) => i.code === "bounds"), "a real off-map point still says bounds");
});
