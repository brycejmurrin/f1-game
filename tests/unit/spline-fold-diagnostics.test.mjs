/* spline-fold-diagnostics.test.mjs — TE-1 (round-2 hunt): uniform Catmull-Rom on
 * irregular control spacing overshoots at hairpins (korea's node radius was 2.2 m against
 * an 8 m half-width) and the road surface folds. Pins:
 *   - TrackSpline.surfaceFolds / the "centreline" geometryDiagnostics row;
 *   - buildRoad's fold clamp now covers the RUNNING surface (korea has no inverted
 *     rail in columns 2..11 — roadGeoChecks' criterion);
 *   - opt-in def.splineAlpha: unset/0/null is today's uniform path bit-for-bit
 *     (crc never runs), 0.5 is centripetal (tighter hairpin radius, same lap ±1 %).
 *
 * Run: node --test tests/unit/spline-fold-diagnostics.test.mjs   (~15 s)
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/lib/track-build-vm.cjs");

let ctx, T, S, hairpin;
before(() => {
  ctx = buildContext({ assets: false });
  T = ctx.Tracks;
  S = vm.runInContext("TrackSpline", ctx.sandbox);
  hairpin = syntheticHairpin();
});

// DATA-INDEPENDENT fixture (korea's real hairpin is being re-authored): a 8 m half-width
// lap whose control points go 260 m, 260 m, then ~13 m apart round a hairpin — the
// spacing that makes uniform Catmull-Rom overshoot. Monza's def carries the rest.
function syntheticHairpin() {
  const hw = 8, pts = [];
  const P = (x, z) => pts.push([x, 0, z, hw, 0]);
  P(0, 0); P(0, 260); P(0, 520);
  P(4, 600); P(14, 612); P(26, 606); P(34, 590);
  P(40, 520); P(40, 260); P(40, 0); P(40, -260); P(0, -260);
  const monza = T.LIST.find((t) => t.id === "monza");
  return Object.assign({}, monza, { id: "synthetic-hairpin", points: pts, path: null, sceneryStartFrac: null,
    startFrac: 0, hwZones: null, elevations: null, bridges: null, turns: null, sectors: null, pit: null });
}

const digest = (tr) => {
  const h = crypto.createHash("sha1");
  for (const k of ["px", "py", "pz", "tx", "ty", "tz", "rx", "ry", "rz", "hw"])
    h.update(Buffer.from(tr[k].buffer, tr[k].byteOffset, tr[k].byteLength));
  return h.digest("hex");
};
const centre = (def) => T.buildCenterline(def, { line: false });

// A synthetic ring of n nodes, radius R, half-width hw: the exact fold/radius case.
function ring(R, hw, n = 90) {
  const t = { n, px: new Float32Array(n), pz: new Float32Array(n), rx: new Float32Array(n), rz: new Float32Array(n), hw: new Float32Array(n).fill(hw) };
  for (let k = 0; k < n; k++) {
    const a = k / n * 2 * Math.PI;
    t.px[k] = R * Math.cos(a); t.pz[k] = R * Math.sin(a);
    // heading (-sin, cos); right = heading x up -> (cos, sin)  (outward for a left-hand loop)
    t.rx[k] = -Math.cos(a); t.rz[k] = -Math.sin(a);
  }
  return t;
}

test("surfaceFolds: a wide ring has the right radius and no fold; a kink tighter than hw folds", () => {
  const ok = S.surfaceFolds(ring(30, 6));
  assert.ok(Math.abs(ok.minNodeRadius - 30) < 0.5, `radius ${ok.minNodeRadius}`);
  assert.equal(ok.foldCount, 0);
  const bad = S.surfaceFolds(ring(5, 6));
  assert.ok(bad.minNodeRadius < 6, `radius ${bad.minNodeRadius}`);
  assert.ok(bad.foldCount > 0 && bad.foldNodes.length > 0, "R < hw must fold");
});

test("the build reports a centreline row; the hairpin shows in it", () => {
  const tr = T.build(hairpin, {});
  const row = tr.geometryDiagnostics.find((g) => g.name === "centreline");
  assert.ok(row && row.ok === true, "centreline row, always ok");
  assert.ok(row.minNodeRadius < 8 && row.foldCount > 0, `min radius ${row.minNodeRadius}, folds ${row.foldCount}`);
  assert.ok(tr.geometryDiagnostics.every((g) => g.ok), "no mesh rejected");

  // The MESH is clean: no rail in columns 2..11 steps backwards along the node tangent.
  const P = tr.roadGeo.pos._data || tr.roadGeo.pos, V = 14, n = tr.n;
  let bad = 0;
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    for (let v = 2; v <= 11; v++) {
      const i0 = (k * V + v) * 3, i1 = (k1 * V + v) * 3;
      if ((P[i1] - P[i0]) * tr.tx[k] + (P[i1 + 2] - P[i0 + 2]) * tr.tz[k] <= 0) { bad++; break; }
    }
  }
  assert.equal(bad, 0, "inverted running-surface quads");
});

test("splineAlpha unset / 0 / null / invalid is the uniform path, bit-for-bit", () => {
  const monza = T.LIST.find((t) => t.id === "monza");
  const base = digest(centre(monza));
  for (const a of [0, null, undefined, -1, NaN])
    assert.equal(digest(centre(Object.assign({}, monza, { splineAlpha: a }))), base, `splineAlpha ${a}`);
});

test("crc: passes through the control points, equals uniform Catmull-Rom on equal chords", () => {
  const a = [0, 0, 0], b = [10, 1, 0], c = [20, 2, 5], d = [30, 3, 5], o = [0, 0, 0];
  S.crc(a, b, c, d, 0, 0.5, o); assert.deepEqual(o.map((v) => +v.toFixed(9)), b);
  S.crc(a, b, c, d, 1, 0.5, o); assert.deepEqual(o.map((v) => +v.toFixed(9)), c);
  // equal chord lengths: centripetal == uniform
  const pt = (i) => [10 * Math.cos(i * 0.5), i * 0.3, 10 * Math.sin(i * 0.5)];   // equal chords
  const e = pt(0), f = pt(1), g2 = pt(2), h = pt(3);
  for (const t of [0.25, 0.5, 0.8]) {
    S.crc(e, f, g2, h, t, 0.5, o);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(o[i] - S.cr(e[i], f[i], g2[i], h[i], t)) < 1e-9, `t=${t} axis ${i}`);
  }
});

test("splineAlpha 0.5 on the hairpin: larger radius, fewer folds, same lap within 3 %", () => {
  const u = centre(hairpin), c = centre(Object.assign({}, hairpin, { splineAlpha: 0.5 }));
  const ru = S.surfaceFolds(u), rc = S.surfaceFolds(c);
  assert.notEqual(digest(u), digest(c), "alpha changes the path");
  assert.ok(rc.minNodeRadius > ru.minNodeRadius * 1.2, `radius ${ru.minNodeRadius} -> ${rc.minNodeRadius}`);
  assert.ok(Math.abs(c.total / u.total - 1) < 0.03, `lap ${u.total} -> ${c.total}`);
  assert.ok(rc.foldCount < ru.foldCount, `folds ${ru.foldCount} -> ${rc.foldCount}`);
});
