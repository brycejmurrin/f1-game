// track-insight — js/editor/insight.js (TrackInsight) over the REAL engine
// (tests/helpers/editor-vm.mjs): the speed profile IS the lap estimate's
// (bit for bit, against a copy of the pre-extraction estLap); the TURNS bands
// read a rounded rectangle as four ≈ 90° corners in one direction, with control
// spans that never straddle the start line; REPLACE with the fitted arc
// re-stamps every seed-7 turn green; each FIA Grade 1 rule fires on a design
// crafted to break it and only ever as an AMBER, fia-coded, fix-less issue
// that TrackFixes refuses; TRACK OF THE DAY is one seed per UTC day; START FROM
// traces Monza / Spa / Monaco into a 60–120 point lattice loop that builds to
// within 3 % of the real lap; a short sharp hill on the start straight reads
// as a crest (the car goes light) and a deep dip as a compression. The fleet
// calibration (≤ 60 fia-* circuit-codes on the 52 circuits, ≤ 15 per code, a
// dip on ≤ 3, none RED) is in track-validate-fleet.test.mjs.
//
// Run: node --test tests/unit/track-insight.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { bootEditor, design, ellipse, read, plain } from "../helpers/editor-vm.mjs";

const B = bootEditor();
vm.runInContext(read("js/editor/fixes.js").replace(/^const\b/gm, "var"), B.ctx, { filename: "js/editor/fixes.js" });
const { V, S, ST, TR, Tracks } = B, I = B.ctx.TrackInsight, F = B.ctx.TrackFixes;
const q = (v) => Math.round(v * 4) / 4;
const def = (id) => Tracks.LIST.find((d) => d.id === id);

/** A rounded rectangle (w-long bottom straight first), on the 0.25 m lattice (track-validate-fleet's). */
function rrect(w, h, R, step) {
  const pts = [], arc = (cx, cz, a0) => { for (let a = a0; a > a0 - Math.PI / 2 + 1e-9; a -= step / R) pts.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]); };
  for (let x = 0; x < w; x += step) pts.push([x, 0]);
  arc(w, -R, Math.PI / 2);
  for (let z = -R; z > -R - h; z -= step) pts.push([w + R, z]);
  arc(w, -R - h, 0);
  for (let x = w; x > 0; x -= step) pts.push([x, -2 * R - h]);
  arc(0, -R - h, -Math.PI / 2);
  for (let z = -R - h; z < -R; z += step) pts.push([-R, z]);
  arc(0, -R, Math.PI);
  return pts.map((p) => [q(p[0]), q(p[1])]);
}
// 3.55 km: 900 m straights, R 120 m corners, the start mid-way down the bottom straight.
const BOX = S.rotate(rrect(900, 500, 120, 20), 22);
const fias = (v) => v.issues.filter((i) => /^fia-/.test(i.code));
const codes = (v) => v.issues.map((i) => i.code + ":" + i.level).join(" ");

/** The lap estimate exactly as validate.js wrote it before speedProfile was extracted. */
function estLapBefore(tr) {
  const n = tr.n, ds = tr.total / n, v = new Float64Array(n);
  for (let k = 0; k < n; k++) { const c = Math.abs(tr.curv[k]); v[k] = c > 1e-6 ? Math.min(92, Math.sqrt(32 / c)) : 92; }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 2 * n; i++) { const k = i % n, j = (k + 1) % n; v[j] = Math.min(v[j], Math.sqrt(v[k] * v[k] + 2 * 11 * ds)); }
    for (let i = 2 * n; i > 0; i--) { const k = i % n, j = (k - 1 + n) % n; v[j] = Math.min(v[j], Math.sqrt(v[k] * v[k] + 2 * 38 * ds)); }
  }
  let t = 0; for (let k = 0; k < n; k++) t += ds / Math.max(8, v[k]);
  return { t, v };
}

test("speedProfile is estLap's own profile, bit for bit (a design + three shipped circuits)", () => {
  const trs = [V.check(design({ pts: BOX })).tr].concat(["monza", "monaco", "spa"].map((id) => Tracks.buildCenterline(def(id), { line: false })));
  for (const tr of trs) {
    const was = estLapBefore(tr), v = I.speedProfile(tr);
    assert.equal(v.length, tr.n);
    assert.ok(v.every((x, k) => Object.is(x, was.v[k])), "the same Float64 speeds at every node");
    assert.ok(Object.is(V.estLap(tr), was.t), "estLap unchanged: " + V.estLap(tr) + " vs " + was.t);
    assert.ok(Math.max(...v) <= 92 && Math.min(...v) > 0);
  }
});

test("TURNS: a rounded rectangle reads four ≈ 90° turns one way, R ≈ 120 m, spans clear of the start line", () => {
  const v = V.check(design({ pts: BOX }));
  const cs = I.corners(v.tr, BOX);
  assert.equal(cs.length, 4, JSON.stringify(plain(cs.map((c) => [c.n, Math.round(c.angDeg)]))));
  // The loop's sense: the summed built curvature (+k = LEFT), and the mirror image reads the other way.
  let sum = 0; for (let k = 0; k < v.tr.n; k++) sum += v.tr.curv[k];
  const dir = Math.sign(sum);
  for (const c of cs) {
    assert.ok(Math.abs(Math.abs(c.angDeg) - 90) <= 12, "T" + c.n + " turns " + c.angDeg.toFixed(1) + "°");
    assert.ok(Math.abs(c.R - 120) <= 0.12 * 120, "T" + c.n + " R " + c.R.toFixed(1) + " m");
    assert.equal(c.dir, dir, "T" + c.n + " turns the loop's way");
    assert.ok(c.i0 < c.i1 && c.i0 >= 0 && c.i1 < BOX.length, "T" + c.n + " span " + c.i0 + "→" + c.i1 + " runs forward, point 0 outside");
    assert.ok(c.vApex > 0 && c.vApex < 92 && c.lenM > 0);
    assert.ok(["corner", "hairpin"].includes(c.fit.kind) && c.fit.dir === c.dir);
  }
  const mirror = BOX.map((p) => [-p[0], p[1]]);
  const cm = I.corners(V.check(design({ pts: mirror })).tr, mirror);
  assert.equal(cm.length, 4);
  for (const c of cm) assert.equal(c.dir, -dir, "the mirrored loop turns the other way");
  // A turn over the start line: the span is cut at point 0, never across it.
  const over = S.rotate(rrect(900, 500, 120, 20), 48);   // the start just past the first corner's entry
  const co = I.corners(V.check(design({ pts: over })).tr, over);
  for (const c of co) assert.ok(c.i1 === 0 || c.i0 < c.i1, "T" + c.n + " span " + c.i0 + "→" + c.i1 + " keeps point 0 out");
});

test("REPLACE with the fitted arc re-stamps every seed-7 turn green", () => {
  const r = TR.generateValid(7, (pts) => V.check(design({ pts })).ok, 12);
  const d = design({ pts: r.pts }), v = V.check(d);
  assert.equal(v.ok, true);
  const cs = I.corners(v.tr, d.pts, null, v.turns);
  assert.ok(cs.length >= 3, cs.length + " turns");
  for (const c of cs) {
    const sp = ST.splice(d.pts, c.i0, c.i1, c.fit.kind, c.fit);
    assert.ok(sp.ok, "T" + c.n + ": " + sp.reason);
    const after = V.check(design({ pts: sp.pts.map((p) => [q(p[0]), q(p[1])]) }));
    assert.equal(after.red, 0, "T" + c.n + " " + JSON.stringify(plain(c.fit)) + " → " + codes(after));
  }
});

test("FIA Grade 1: each rule fires on a design built to break it — AMBER, fia-coded, one line, no fix", () => {
  const cases = [
    ["fia-straight", design({ pts: S.rotate(rrect(2100, 400, 120, 30), 35) })],          // a 2.1 km straight
    ["fia-t1", design({ pts: S.rotate(rrect(900, 500, 120, 20), 39) })],                 // the line 120 m before T1
    ["fia-width", design({ pts: BOX, baseHW: 5.5 })],                                     // 11 m of road
    ["fia-bank", design({ pts: BOX, bankZones: [{ frac: 0.2, angleDeg: 8, widthM: 200 }] })],
    ["fia-passing", design({ pts: ellipse(40) })],                                        // never a heavy stop
    ["fia-grade", design({ pts: BOX, elevations: [{ s: 0.13, halfM: 400, rise: 30 }] })],  // a hill at the end of the start straight
  ];
  const clean = V.check(design({ pts: BOX }));
  assert.deepEqual(plain(fias(clean).map((i) => i.code)), [], "the plain box breaks no FIA rule: " + codes(clean));
  for (const [code, d] of cases) {
    const v = V.check(d);
    assert.ok(v.issues.some((i) => i.code === code), code + " fires: " + codes(v));
    for (const i of fias(v)) {
      assert.equal(i.level, "amber", i.code + " is advice, never a gate");
      assert.ok(Number.isFinite(i.s), i.code + " has a place on the lap");
      assert.equal(typeof i.msg, "string"); assert.ok(i.msg.length > 0 && !/\n/.test(i.msg), "one line: " + i.msg);
      assert.equal(i.fix, undefined, i.code + " carries no fix tag");
      assert.equal(F.canFix(i), false, "FIX / FIX ALL leave " + i.code + " alone");
    }
    assert.equal(v.red, v.issues.filter((i) => i.level === "red" && !/^fia-/.test(i.code)).length, "no fia-* ever counts as red");
  }
  assert.ok(V.check(cases[0][1]).stats.passZones >= 1, "the long straight is a passing zone");
  assert.equal(V.check(cases[4][1]).stats.passZones, 0);
});

test("crests and dips: a 30 m-half, 1.5 m hill on the start straight lifts the car; a 3 m dip compresses it — AMBER, one per stretch, at the spot", () => {
  const L = V.check(design({ pts: BOX })).tr.total, at = 200 / L;   // 200 m after the line: flat out
  const bump = (rise, n = 1) => design({ pts: BOX, elevations: Array.from({ length: n }, () => ({ s: at, halfM: 30, rise })) });
  const check = (v, code) => {
    const hits = v.issues.filter((i) => i.code === code);
    for (const i of hits) {
      assert.equal(i.level, "amber", code + " is advice, never a gate");
      assert.ok(Number.isFinite(i.s), code + " has a place on the lap");
      assert.equal(i.fix, undefined); assert.equal(F.canFix(i), false, "FIX ALL leaves " + code + " alone");
    }
    return hits;
  };
  const crest = V.check(bump(1.5));
  assert.equal(crest.red, 0, codes(crest));
  const c = check(crest, "fia-crest");
  assert.equal(c.length, 1, "one crest, one row: " + codes(crest));
  assert.ok(Math.abs(c[0].s - at * L) <= 12, "at the hill's top: " + c[0].s + " vs " + at * L);
  assert.match(c[0].msg, /^Crest at \d+\.\d km: the car goes light \(\d+\.\d g\) at \d+ km\/h$/);
  assert.equal(check(crest, "fia-sag").length, 0, "a hill is no dip");
  // One grade-capped dip (|rise| ≤ halfM / 19.6, under 8 %) peaks at ~1.6 g over
  // the 40 m window — under the 2.5 g limit; two stacked on one spot (a 3 m
  // hole, each bump inside the cap) compress the car past it.
  assert.equal(check(V.check(bump(-1.5)), "fia-sag").length, 0, "a single capped −1.5 m dip stays under 2.5 g");
  const dip = V.check(bump(-1.5, 2));
  const d = check(dip, "fia-sag");
  assert.equal(d.length, 1, "one dip, one row: " + codes(dip));
  assert.ok(Math.abs(d[0].s - at * L) <= 12, "at the dip's bottom: " + d[0].s);
  assert.match(d[0].msg, /^Dip at \d+\.\d km: \d+\.\d g compression at \d+ km\/h$/);
  assert.equal(dip.red, 0, codes(dip));
  // verticalG on its own: the same answer, and nothing on the flat box.
  assert.deepEqual(plain(I.verticalG(V.check(design({ pts: BOX })).tr)), []);
  assert.deepEqual(plain(I.verticalG(crest.tr).map((x) => x.code)), ["fia-crest"]);
});

test("passing zones: a long flat-out run into a heavy stop, seen across the line, one per braking point", () => {
  const monza = Tracks.buildCenterline(def("monza"), { line: false });
  const z = I.passingZones(monza);
  assert.ok(z.length >= 2, "Monza has somewhere to pass: " + z.length);
  for (const p of z) assert.ok(p.lenM >= I.THRESH.passRunM && p.drop >= I.THRESH.passDrop);
  assert.equal(new Set(z.map((p) => p.s1)).size, z.length, "deduped by braking point");
  // Rotating the start line never changes the count (the scan wraps).
  const d = design({ pts: BOX });
  const n0 = V.check(d).stats.passZones;
  for (const k of [0, 30, 60, 100]) assert.equal(V.check(design({ pts: S.rotate(BOX, k) })).stats.passZones, n0, "rotated " + k);
});

test("TRACK OF THE DAY: one seed per UTC day, a different one the next", () => {
  const a = I.totdSeed("2026-10-02");
  assert.equal(a, I.totdSeed(new Date("2026-10-02T00:00:01Z")));
  assert.equal(a, I.totdSeed(new Date("2026-10-02T23:59:59Z")));
  assert.equal(a, B.ctx.Hash32.fnv1a("apex26-totd|2026-10-02"));
  const week = [];
  for (let d = 1; d <= 7; d++) week.push(I.totdSeed("2026-10-0" + d));
  assert.equal(new Set(week).size, 7, "seven days, seven circuits");
  assert.ok(week.every((s) => Number.isInteger(s) && s >= 0 && s < 4294967296));
  assert.equal(I.dayKey(new Date("2026-12-31T23:00:00Z")), "2026-12-31");
});

test("START FROM: Monza, Spa and Monaco trace into 60–120 lattice points that build within 3 % of the real lap", () => {
  for (const id of ["monza", "spa", "monaco", "suzuka"]) {
    const d0 = def(id), tr0 = Tracks.buildCenterline(d0, { line: false });
    const f = I.fromCircuit(d0);
    assert.ok(f.pts.length >= 60 && f.pts.length <= 120, id + ": " + f.pts.length + " points");
    assert.ok(f.pts.every((p) => Number.isInteger(p[0] * 4) && Number.isInteger(p[1] * 4)), id + ": lattice");
    for (let i = 0; i < f.pts.length; i++) {
      const a = f.pts[i], b = f.pts[(i + 1) % f.pts.length];
      assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) >= 8, id + ": points " + i + "/" + (i + 1) + " ≥ 8 m apart");
    }
    const n0 = [tr0.px[0] - f.centre[0], tr0.pz[0] - f.centre[1]];
    assert.ok(Math.hypot(f.pts[0][0] - n0[0], f.pts[0][1] - n0[1]) <= 10, id + ": node 0 is the real start line");
    assert.ok(f.baseHW >= 5 && f.baseHW <= 8);
    const v = V.check(design({ pts: f.pts, baseHW: f.baseHW }));
    assert.ok(v.tr && Math.abs(v.tr.total / tr0.total - 1) <= 0.03, id + ": built " + Math.round(v.tr && v.tr.total) + " m vs " + Math.round(tr0.total) + " m");
    const reds = v.issues.filter((i) => i.level === "red").map((i) => i.code);
    // Suzuka crosses itself (the remix has no bridge yet); Monaco's harbour is
    // too tight for a custom pit opening. FIX handles both; the rest trace clean.
    const allowed = { suzuka: ["crossing", "clearance"], monaco: ["clearance"] }[id] || [];
    assert.ok(reds.every((c) => allowed.includes(c)), id + ": " + codes(v));
    if (id === "suzuka") assert.ok(reds.includes("crossing"), "Suzuka's figure-8 crossing reads RED until bridged");
    // Spa's Bus Stop is a real chicane: START FROM must keep it, not RDP it
    // into a tarmac fold (the 3D-resampled centreline did after the elevation
    // rework — Structural guards on #878).
    if (id === "spa") assert.equal(v.issues.some((i) => i.code === "fold"), false, id + " fold: " + codes(v));
  }
});
