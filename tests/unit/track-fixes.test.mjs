// track-fixes — js/editor/fixes.js (TrackFixes) over the REAL engine
// (tests/helpers/editor-vm.mjs): for each remedy a design that TrackValidate
// judges RED for that code, the one-click fix, and the re-check — the code is
// gone (or down to amber), the result is a NEW design on the 0.25 m lattice,
// point 0 is still the start (except the start remedy, which moves it), and a
// zone placed away from the edit stays on the same metre of road. apply never
// throws on garbage; fixAll clears the geometry test's tiny loop and figure-8
// within its three rounds and leaves an already-green RANDOMISE loop alone.
//
// Run: node --test tests/unit/track-fixes.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { bootEditor, ellipse, design, read, plain } from "../helpers/editor-vm.mjs";

const B = bootEditor();
vm.runInContext(read("js/editor/fixes.js").replace(/^const\b/gm, "var"), B.ctx, { filename: "js/editor/fixes.js" });
const { V, S, TR } = B, F = B.ctx.TrackFixes;
const q = (v) => Math.round(v * 4) / 4;
// The VM's arrays are another realm's: compare results as plain JSON.
const apply = (...a) => { const r = F.apply(...a); return r && plain(r); };

const reds = (v, code) => v.issues.filter((i) => i.code === code && i.level === "red");
const codes = (v) => v.issues.map((i) => i.code + ":" + i.level).join(" ");
/** The world point at arc fraction f of the closed control polygon. */
function at(pts, f) {
  const N = pts.length, c = [0];
  for (let i = 0; i < N; i++) { const a = pts[i], b = pts[(i + 1) % N]; c.push(c[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const x = (((f % 1) + 1) % 1) * c[N];
  let i = 0;
  while (i < N - 1 && c[i + 1] < x) i++;
  const a = pts[i], b = pts[(i + 1) % N], t = (x - c[i]) / ((c[i + 1] - c[i]) || 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const onLattice = (pts) => pts.every((p) => Number.isInteger(p[0] * 4) && Number.isInteger(p[1] * 4));
/** One remedy, with the invariants every result keeps. */
function fix(d, code, opts = {}) {
  const v = V.check(d);
  const issue = reds(v, code)[0];
  assert.ok(issue, `the design is RED for ${code}: ${codes(v)}`);
  assert.ok(issue.fix && F.canFix(issue), `${code} carries a fix tag`);
  const before = JSON.stringify(d);
  const r = apply(d, issue, v);
  assert.ok(r && r.design && typeof r.msg === "string" && r.msg.length > 0, `${code}: a remedy`);
  assert.equal(JSON.stringify(d), before, `${code}: the input design is not mutated`);
  assert.notEqual(r.design, d);
  assert.ok(onLattice(r.design.pts), `${code}: the result is on the 0.25 m lattice`);
  if (!opts.movesStart) assert.deepEqual(r.design.pts[0], plain(d.pts[0]), `${code}: point 0 stays the start`);
  const after = V.check(r.design);
  assert.equal(reds(after, code).length, 0, `${code} is gone or amber after the fix: ${codes(after)}`);
  return { v, r, after };
}

// ── crafted designs ─────────────────────────────────────────────────────────
// A stadium (1.3 km straights, 200 m ends) whose index 0 sits mid-corner.
function stadium() {
  const pts = [], h = 650, R = 200;
  for (let x = -h; x < h; x += 40) pts.push([x, -R]);
  for (let a = 0; a < Math.PI; a += Math.PI / 16) pts.push([h + R * Math.sin(a), -R * Math.cos(a)]);
  for (let x = h; x > -h; x -= 40) pts.push([x, R]);
  for (let a = 0; a < Math.PI; a += Math.PI / 16) pts.push([-h - R * Math.sin(a), R * Math.cos(a)]);
  return S.rotate(pts.map((p) => [q(p[0]), q(p[1])]), 41);
}
// A zig-zag of 8 m-spaced points spliced into the ellipse a quarter-lap in.
function zig(amp, sp, n) {
  const base = ellipse(36, 800, 500), k = 9, p = base[k], z = [];
  for (let m = -n; m <= n; m++) z.push([q(p[0] - m * sp), q(p[1] + (m % 2 ? amp : -amp))]);
  return base.slice(0, k).concat(z, base.slice(k + 1));
}
// A narrow spike out of the ellipse's top (a hairpin narrower than the road).
function spike(depth, w) {
  const base = ellipse(36, 800, 500), k = 9, p = base[k];
  return base.slice(0, k).concat([[q(p[0] + w), q(p[1])], [q(p[0]), q(p[1] + depth)], [q(p[0] - w), q(p[1])]], base.slice(k + 1));
}
// A 2 km × 600 m ellipse pinched at its waist until the two sides run 16 m apart.
function pinch(gap) {
  return ellipse(100, 1000, 300).map(([x, z]) => { const w = Math.exp(-(x * x) / (2 * 260 * 260)); return [q(x), q(Math.sign(z) * (Math.abs(z) - (300 - gap / 2) * w * Math.abs(z) / 300))]; });
}
function eight() {
  const e = [];
  for (let i = 0; i < 48; i++) { const t = (i / 48) * Math.PI * 2; e.push([q(900 * Math.sin(t)), q(450 * Math.sin(2 * t))]); }
  return e;
}
const zones = (extra) => Object.assign({ elevations: [{ s: 0.62, halfM: 200, rise: 4 }], hwZones: [{ s0: 0.55, s1: 0.6, hw: 6, ease: 0.025 }], bankZones: [{ frac: 0.66, angleDeg: 8, widthM: 120 }] }, extra);
/** Zones away from the edit keep their place on the road (within `tol` m). */
function zonesStay(d0, d1, tol, label) {
  assert.ok(dist(at(d0.pts, d0.elevations[0].s), at(d1.pts, d1.elevations[0].s)) <= tol, `${label}: the elevation stays put`);
  assert.ok(dist(at(d0.pts, d0.hwZones[0].s0), at(d1.pts, d1.hwZones[0].s0)) <= tol, `${label}: the width zone's start stays put`);
  assert.ok(dist(at(d0.pts, d0.hwZones[0].s1), at(d1.pts, d1.hwZones[0].s1)) <= tol, `${label}: the width zone's end stays put`);
  assert.ok(dist(at(d0.pts, d0.bankZones[0].frac), at(d1.pts, d1.bankZones[0].frac)) <= tol, `${label}: the banking stays put`);
}

test("canFix: every remedied code the validator raises carries a fix tag; nothing else does", () => {
  for (const c of F.ORDER) assert.equal(F.canFix({ code: c, level: "red", fix: c }), true, c);
  for (const bad of [null, undefined, 0, "start", {}, { code: "start" }, { code: "grade", fix: "grade" }, { code: "width", fix: true }, { code: "toString", fix: 1 }]) assert.equal(F.canFix(bad), false, JSON.stringify(bad));
  const seen = new Set();
  for (const d of [design({ pts: ellipse(24, 150, 90) }), design({ pts: eight() }), design({ pts: zig(60, 8, 2) }), design({ pts: spike(200, 4) }), design({ pts: pinch(16) }), design({ pts: ellipse(240, 800, 500) }), design({ pts: stadium() })]) {
    for (const it of V.check(d).issues) {
      if (F.ORDER.includes(it.code) && !(it.code === "points" && /at least/.test(it.msg))) { assert.ok(it.fix, `${it.code}:${it.level} is tagged`); seen.add(it.code); }
      if (it.code === "clearance") assert.ok(Number.isFinite(it.s2), "clearance carries s2");
    }
  }
  for (const c of ["start", "length", "points", "kink", "radius", "fold", "crossing", "clearance"]) assert.ok(seen.has(c), `the fixtures raise ${c}`);
});

test("start: moves the line to the longest straight; the zones stay on the same road", () => {
  const d = design(zones({ pts: stadium() }));
  const { r } = fix(d, "start", { movesStart: true });
  assert.match(r.msg, /start/i);
  // A rotation of the same loop: every point survives, index 0 moved.
  assert.equal(r.design.pts.length, d.pts.length);
  const j = r.design.pts.length - d.pts.findIndex((p) => p[0] === r.design.pts[0][0] && p[1] === r.design.pts[0][1]);
  assert.deepEqual(plain(S.rotate(r.design.pts, j)), plain(d.pts), "the same points, rotated");
  zonesStay(d, r.design, 1e-6, "start");
  // Already on the longest straight: nothing to do.
  const again = V.check(r.design);
  assert.equal(apply(r.design, { code: "start", level: "amber", fix: "start", s: 0 }, again), null, "a second START is a no-op");
});

test("length: a short lap scales to 4 km and a long one to 6.5 km on the BUILT road; zones keep fractions", () => {
  for (const [pts, want] of [[ellipse(24, 150, 90), 4000], [ellipse(36, 1600, 1000), 6500]]) {
    const d = design(zones({ pts }));
    const { r, after } = fix(d, "length", { movesStart: true });
    assert.ok(Math.abs(after.stats.lengthM - want) <= want * 0.01, `built ${after.stats.lengthM} m ≈ ${want} m`);
    assert.equal(r.design.pts.length, d.pts.length);
    // Point 0 is the same control point, scaled about the centroid.
    const c0 = S.centroid(d.pts), c1 = S.centroid(r.design.pts);
    const h0 = Math.atan2(d.pts[0][1] - c0[1], d.pts[0][0] - c0[0]), h1 = Math.atan2(r.design.pts[0][1] - c1[1], r.design.pts[0][0] - c1[0]);
    assert.ok(Math.abs(h0 - h1) < 1e-3, "point 0 is the old start, scaled");
    assert.deepEqual(r.design.elevations, d.elevations, "zone fractions stand under a uniform scale");
    assert.deepEqual(r.design.hwZones, d.hwZones);
  }
  // A lap already in range: no remedy.
  assert.equal(apply(design(), { code: "length", level: "red", fix: "length" }, V.check(design())), null);
});

test("bounds: a loop off the map is centred (and scaled to fit) with its start kept", () => {
  const d = design(zones({ pts: ellipse(36, 800, 500).map((p) => [p[0] + 9600, p[1]]) }));
  const v = V.check(d);
  assert.ok(reds(v, "bounds").length, codes(v));
  const r = apply(d, reds(v, "bounds")[0], v);
  assert.ok(r, "a remedy");
  assert.ok(r.design.pts.every((p) => Math.abs(p[0]) <= 9500 && Math.abs(p[1]) <= 9500));
  assert.deepEqual(r.design.pts[0], [d.pts[0][0] - 9600, d.pts[0][1]], "the same start, translated");
  assert.equal(V.check(r.design).red, 0, codes(V.check(r.design)));
  // A loop wider than the map is also scaled into ±9.5 km.
  const huge = design({ pts: ellipse(36, 12000, 3000) });
  const rh = apply(huge, { code: "bounds", level: "red", fix: "bounds" }, null);
  assert.ok(rh && rh.design.pts.every((p) => Math.abs(p[0]) <= 9500 && Math.abs(p[1]) <= 9500) && /scaled/.test(rh.msg));
});

test("spacing / points: merges points under 8 m, thins to ≤ 180 with RDP, never drops point 0", () => {
  const base = ellipse(36, 800, 500);
  const crowded = design(zones({ pts: base.slice(0, 11).concat([[base[10][0] + 3, base[10][1] + 3]], base.slice(11)) }));
  const s = fix(crowded, "spacing");
  assert.equal(s.r.design.pts.length, 36);
  zonesStay(crowded, s.r.design, 0.5, "spacing");
  const dense = design(zones({ pts: ellipse(240, 800, 500) }));
  const v = V.check(dense);
  const it = reds(v, "points")[0];
  assert.ok(it && F.canFix(it), codes(v));
  const r = apply(dense, it, v);
  assert.ok(r && r.design.pts.length <= 180 && r.design.pts.length >= 8, `thinned to ${r && r.design.pts.length}`);
  assert.deepEqual(r.design.pts[0], dense.pts[0]);
  assert.ok(!V.check(r.design).issues.some((i) => i.code === "points" || i.code === "spacing"));
  zonesStay(dense, r.design, 2, "points");
  // Too FEW points: nothing to thin.
  assert.equal(apply(design({ pts: ellipse(6) }), { code: "points", level: "red", fix: "points" }, null), null);
});

test("heights[] follows the control points through every remedy that rebuilds them (bug-hunt 6.1)", () => {
  // heights[i] = i, so a point's height names the control point it belongs to.
  const key = (p) => p[0] + "," + p[1];
  const heightOfPt = (d) => new Map(d.pts.map((p, i) => [key(p), d.heights[i]]));
  const base = ellipse(36, 800, 500);
  const crowded = design(zones({ pts: base.slice(0, 11).concat([[base[10][0] + 3, base[10][1] + 3]], base.slice(11)) }));
  crowded.heights = crowded.pts.map((_, i) => i);
  const { r } = fix(crowded, "spacing");
  assert.equal(r.design.pts.length, 36);
  assert.equal(r.design.heights.length, r.design.pts.length, "spacing merge: one height per point");
  const was = heightOfPt(crowded);
  r.design.pts.forEach((p, i) => assert.equal(r.design.heights[i], was.get(key(p)), "a surviving point keeps its own height"));
  // RDP thinning (the POINTS remedy) keeps the survivors' heights too.
  const dense = design(zones({ pts: ellipse(240, 800, 500) }));
  dense.heights = dense.pts.map((_, i) => i);
  const rt = apply(dense, reds(V.check(dense), "points")[0], V.check(dense));
  assert.ok(rt && rt.design.heights.length === rt.design.pts.length, "points thinning: one height per point");
  const wasD = heightOfPt(dense);
  rt.design.pts.forEach((p, i) => assert.equal(rt.design.heights[i], wasD.get(key(p))));
  // START rotates heights by the index it rotates pts by.
  const st = design(zones({ pts: stadium() }));
  st.heights = st.pts.map((_, i) => i);
  const rs = fix(st, "start", { movesStart: true }).r;
  assert.equal(rs.design.heights.length, rs.design.pts.length);
  const wasS = heightOfPt(st);
  rs.design.pts.forEach((p, i) => assert.equal(rs.design.heights[i], wasS.get(key(p)), "start: heights rotate with the points"));
  assert.notEqual(rs.design.heights[0], 0, "the line moved, so index 0 is a different point");
});

test("kink / radius / fold: relaxes the points under the issue; point 0 and far zones stay put", () => {
  for (const [code, pts] of [["radius", zig(60, 8, 2)], ["kink", spike(200, 4)], ["fold", zig(12, 9, 3)]]) {
    const d = design(zones({ pts }));
    const { r } = fix(d, code);
    assert.match(r.msg, /Smoothed/);
    zonesStay(d, r.design, 0.5, code);
  }
});

test("crossing: a bridge in sanitize's shape over the far road; refused when the span would lift both", () => {
  const d = design(zones({ pts: eight() }));
  const { v, r, after } = fix(d, "crossing");
  const b = r.design.bridges[r.design.bridges.length - 1];
  assert.deepEqual(Object.keys(b).sort(), ["halfM", "rise", "s"]);
  assert.equal(b.halfM, 160); assert.equal(b.rise, 8);
  assert.ok(b.s > 0 && b.s < 1);
  assert.deepEqual(r.design.pts, plain(d.pts), "the loop itself is untouched");
  assert.ok(after.issues.some((i) => i.code === "bridge" && i.level === "info"), codes(after));
  assert.ok(!after.issues.some((i) => i.code === "bridge" && i.level === "red"));
  const sane = B.C.sanitize(r.design);
  assert.deepEqual(sane.bridges[sane.bridges.length - 1].halfM, 160, "sanitize keeps the bridge");
  const x = reds(v, "crossing")[0];
  // The other road inside the span: no bridge can lift only one of them.
  assert.equal(apply(d, Object.assign({}, x, { s2: x.s + 100 }), v), null);
  // An existing deck already there: not a second one.
  assert.equal(apply(r.design, x, V.check(r.design)), null);
  // The bridges cap.
  const full = Object.assign({}, d, { bridges: Array.from({ length: 24 }, (_, i) => ({ s: 0.2 + i * 0.001, halfM: 20, rise: 1 })) });
  assert.equal(apply(full, x, v), null);
  // No s2 on the issue: the crossing scan finds the other road.
  const r2 = apply(d, { code: "crossing", level: "red", fix: "bridge", s: x.s }, v);
  assert.ok(r2 && r2.design.bridges.length === 1);
});

test("clearance: pushes the two close sections apart; point 0 and far zones stay put", () => {
  const d = design({ pts: pinch(16), elevations: [{ s: 0.5, halfM: 200, rise: 4 }], hwZones: [{ s0: 0.45, s1: 0.55, hw: 6, ease: 0.025 }], bankZones: [{ frac: 0.05, angleDeg: 8, widthM: 120 }] });
  const { r } = fix(d, "clearance");
  assert.match(r.msg, /apart/);
  zonesStay(d, r.design, 0.5, "clearance");
});

test("apply never throws: null, garbage designs, unknown codes, missing fields", () => {
  const good = design();
  const designs = [null, undefined, 0, "x", [], {}, { pts: "x" }, { pts: [1, 2, 3] }, { pts: [[0, 0], [NaN, 1], [2, 2]] }, { pts: [[0, 0]] }, good];
  const issues = [null, undefined, 1, "start", {}, { code: "nope" }, { code: "__proto__" }, { code: "constructor" }];
  for (const c of F.ORDER) issues.push({ code: c }, { code: c, s: NaN, s2: "a" }, { code: c, level: "red", fix: c, s: 1e9, s2: -1e9 });
  for (const d of designs) for (const it of issues) for (const built of [undefined, null, {}, { tr: {} }, { total: -1 }]) {
    let r;
    assert.doesNotThrow(() => { r = apply(d, it, built); }, `${JSON.stringify(d)} / ${JSON.stringify(it)}`);
    assert.ok(r === null || (r.design && Array.isArray(r.design.pts) && typeof r.msg === "string"));
  }
  assert.doesNotThrow(() => F.fixAll(null, V.check));
  assert.doesNotThrow(() => F.fixAll({ pts: "x" }));
});

test("fixAll: the tiny loop and the figure-8 end with no RED within three rounds", () => {
  for (const [label, d] of [["tiny", design({ pts: ellipse(24, 150, 90) })], ["eight", design({ pts: eight() })]]) {
    assert.ok(V.check(d).red > 0);
    const before = JSON.stringify(d);
    const r = F.fixAll(d, V.check);
    assert.equal(JSON.stringify(d), before, `${label}: input untouched`);
    const v = V.check(r.design);
    assert.equal(v.red, 0, `${label}: ${codes(v)} after ${r.applied.join(", ")}`);
    assert.ok(r.applied.length > 0 && r.applied.every((c) => F.ORDER.includes(c)));
    assert.ok(onLattice(r.design.pts));
  }
});

test("fixAll: a green RANDOMISE loop is a no-op", () => {
  const g = TR.generate(1), d = design({ pts: g.pts, seed: 1 });
  assert.equal(V.check(d).red, 0);
  const r = F.fixAll(d, V.check);
  assert.equal(r.design, d, "the same design");
  assert.deepEqual(plain(r.applied), []);
});
