/* body-split.test.mjs — the two whole-body colour splits.
 *   liv.bodySplit "lr": left c1 / right c2 (Cadillac).
 *   liv.lower: UPPER/LOWER two-tone — the body below a fixed line along the
 *   sidepods (pod fraction 0.31, z -2.00..+0.70) in `lower`, triangles CUT
 *   along the line (CarShade.lowerZone). It runs only where CarShade is loaded,
 *   as in the game, so those cases build through loadParts({ shade: true }).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const team = M.Teams.LIST.find((t) => t.id === "cadillac");
assert.ok(team, "cadillac team exists");
const parts = M.Parts.getVisualTiers(M.Parts.defaults ? M.Parts.defaults() : {}, team);

function sampleSide(mesh, sign) {
  const paint = M.Car3D.SURFACES.paint;
  for (let i = 0; i < mesh.pos.length / 3; i++) {
    if (mesh.mat[i] !== paint) continue;
    const x = mesh.pos[i * 3], y = mesh.pos[i * 3 + 1];
    if (sign < 0 ? x >= -0.08 : x <= 0.08) continue;
    if (y < 0.25 || y > 0.85) continue;
    return [mesh.col[i * 3], mesh.col[i * 3 + 1], mesh.col[i * 3 + 2]];
  }
  return null;
}

function near(a, b, eps = 0.05) {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;
}

test("cadillac ships bodySplit lr", () => {
  assert.equal(team.livery.bodySplit, "lr");
});

test("bodySplit lr recolours left body to c1 and right body to c2", () => {
  const liv = Object.assign({}, team.livery);
  assert.equal(liv.bodySplit, "lr");
  const mesh = M.Car3D.build(team.color, team.color2, {
    livery: liv, teamId: team.id, num: 11, parts, noWheels: true,
  });
  const left = sampleSide(mesh, -1);
  const right = sampleSide(mesh, 1);
  assert.ok(left, "found a left-side paint vert");
  assert.ok(right, "found a right-side paint vert");
  assert.ok(near(left, team.color), `left ${left} ≈ c1 ${team.color}`);
  assert.ok(near(right, team.color2), `right ${right} ≈ c2 ${team.color2}`);
});

test("absent bodySplit keeps a single body colour", () => {
  const liv = Object.assign({}, team.livery);
  delete liv.bodySplit;
  const mesh = M.Car3D.build(team.color, team.color2, {
    livery: liv, teamId: team.id, num: 11, parts, noWheels: true,
  });
  const left = sampleSide(mesh, -1);
  const right = sampleSide(mesh, 1);
  assert.ok(left && right);
  assert.ok(near(left, right, 0.02), "both sides match without bodySplit");
});

/* ── UPPER/LOWER TWO-TONE (liv.lower) ────────────────────────────────────── */

const S = loadParts({ shade: true });
const mcl = S.Teams.LIST.find((t) => t.id === "mclaren");
const mclParts = S.Parts.getVisualTiers(S.Parts.defaults ? S.Parts.defaults() : {}, mcl);
const PAINT = S.Car3D.SURFACES.paint;
const ALL = ["pos", "nrm", "col", "mat", "idx"];
// A test colour no other surface uses: McLaren's own lower IS its c2, the accent
// band's colour, so "is this vertex lower?" needs a colour of its own.
const LOW = [0.21, 0.83, 0.37];
const C1 = mcl.color.map((v) => Math.min(v, 1));   // as addTri clamps paint
const buildMcl = (lower, opts) => {
  const livery = Object.assign({}, mcl.livery);
  delete livery.lower;
  if (lower !== undefined) livery.lower = lower;
  return S.Car3D.build(mcl.color, mcl.color2, Object.assign({
    livery, teamId: "mclaren", num: 4, parts: mclParts, noWheels: true, measure: true }, opts));
};
// THE LINE, derived here, not read from CarShade: pod fraction 0.31 of the
// pod's own bottom..top, between z -2.00 and +0.70.
const anchors = S.Car3D.bodyAnchors(mclParts, "mclaren", mcl.livery.spineHeight);
const lineY = (z) => { const p = anchors.podAt(z); return p.bottom + 0.31 * (p.top - p.bottom); };
const signed = (y, z) => (z > 0.70 || z < -2.00 ? 1 : y - lineY(z));   // < 0: below the line
const colAt = (m, v) => [m.col[v * 3], m.col[v * 3 + 1], m.col[v * 3 + 2]];
const is = (m, v, c) => m.col[v * 3] === c[0] && m.col[v * 3 + 1] === c[1] && m.col[v * 3 + 2] === c[2];
// The zone covers chassis..livery: it runs just before part("cockpit").
const liveryEnd = (m) => { let n = 0; for (const p of m.parts) { n += p.vertices; if (p.name === "livery") return n; } return n; };
const same = (a, b, keys) => keys.every((k) => a[k].length === b[k].length && a[k].every((v, i) => Object.is(v, b[k][i])));

const builds = {};
for (const smooth of [true, false]) builds[smooth] = { plain: buildMcl(undefined, { smooth }), two: buildMcl(LOW, { smooth }) };

test("McLaren and Haas ship a lower body colour", () => {
  for (const id of ["mclaren", "haas"]) {
    const l = S.Teams.LIST.find((x) => x.id === id).livery.lower;
    assert.ok(Array.isArray(l) && l.length === 3 && l.every((v) => v >= 0 && v <= 1), `${id} livery.lower is an rgb triple`);
  }
  assert.deepEqual(mcl.livery.lower, mcl.color2, "the MCL40's lower is its anthracite c2");
});

for (const smooth of [true, false]) {
  const name = smooth ? "rounded" : "smooth:false";
  test(`lower (${name}): the body below the line takes it, above stays primary — per vertex and inside every triangle`, () => {
    const { two } = builds[smooth], end = liveryEnd(two);
    let low = 0, area = 0;
    for (let v = 0; v < end; v++) {
      const y = two.pos[v * 3 + 1], z = two.pos[v * 3 + 2];
      if (is(two, v, LOW)) {
        low++;
        assert.equal(two.mat[v], PAINT, "only paint takes the lower colour");
        assert.ok(signed(y, z) <= 1e-6 || Math.abs(z - 0.70) < 1e-6, `lower vertex above the line at y ${y.toFixed(4)} z ${z.toFixed(4)}`);
      } else if (is(two, v, C1) && two.mat[v] === PAINT && z < 0.70 - 1e-6) {
        assert.ok(signed(y, z) >= -1e-6, `primary vertex below the line at y ${y.toFixed(4)} z ${z.toFixed(4)}`);
      }
    }
    assert.ok(low > 300, `only ${low} lower vertices: the zone did not run`);
    // Interior samples, 1 mm clear of the line: a long triangle (the monocoque
    // runs z 1.05 -> 0.05) can dip under the BENDING line with all three
    // corners above it, and the vertex check alone would pass that.
    for (let t = 0; t < two.idx.length; t += 3) {
      const q = [two.idx[t], two.idx[t + 1], two.idx[t + 2]];
      if (q.some((v) => v >= end)) continue;
      const isLow = q.every((v) => is(two, v, LOW));
      if (!isLow && !q.every((v) => is(two, v, C1))) continue;
      const p = q.map((v) => [0, 1, 2].map((k) => two.pos[v * 3 + k]));
      if (isLow) {
        const e1 = [0, 1, 2].map((k) => p[1][k] - p[0][k]), e2 = [0, 1, 2].map((k) => p[2][k] - p[0][k]);
        area += Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
      }
      for (let i = 1; i < 8; i++) for (let j = 1; i + j < 8; j++) {
        const a = i / 8, b = j / 8, c = 1 - a - b;
        const y = p[0][1] * c + p[1][1] * a + p[2][1] * b, z = p[0][2] * c + p[1][2] * a + p[2][2] * b, d = signed(y, z);
        assert.ok(isLow ? d < 0.001 : d > -0.001,
          `a ${isLow ? "lower" : "primary"} triangle reaches ${(Math.abs(d) * 1000).toFixed(1)} mm across the line at y ${y.toFixed(3)} z ${z.toFixed(3)}`);
      }
    }
    assert.ok(area > 1, `lower paints ${area.toFixed(2)} m2 — the pods and chassis sides, not a sliver`);
  });

  test(`lower (${name}): recolours and appends only — nothing moves, no other colour changes, no triangle mixes the two`, () => {
    const { plain, two } = builds[smooth], end = liveryEnd(plain), added = (two.pos.length - plain.pos.length) / 3;
    assert.ok(added > 0, "a crossing triangle is cut, so vertices are appended");
    assert.equal(liveryEnd(two), end + added, "the appended vertices close the zone's own range");
    for (let v = 0; v < end; v++) {
      for (let k = 0; k < 3; k++) assert.equal(two.pos[v * 3 + k], plain.pos[v * 3 + k], "a zone vertex moved");
      assert.equal(two.mat[v], plain.mat[v], "a surface changed");
      if (!is(plain, v, C1)) assert.deepEqual(colAt(two, v), colAt(plain, v), `a non-primary colour changed at vertex ${v}`);
      else assert.ok(is(two, v, C1) || is(two, v, LOW), "a primary vertex became neither primary nor lower");
    }
    // Everything built after the zone (cockpit .. rear) is untouched; smooth()
    // re-averages normals over the cut faces, so the rounded build compares positions and paint.
    for (const k of smooth ? ["pos", "col", "mat"] : ["pos", "nrm", "col", "mat"]) {
      const w = k === "mat" ? 1 : 3, a = two[k].slice((end + added) * w), b = plain[k].slice(end * w);
      assert.ok(a.length === b.length && a.every((x, i) => Object.is(x, b[i])), `${k} changed after the zone`);
    }
    for (let t = 0; t < two.idx.length; t += 3) {
      const q = [two.idx[t], two.idx[t + 1], two.idx[t + 2]];
      assert.ok(!(q.some((v) => is(two, v, C1)) && q.some((v) => is(two, v, LOW))), "a triangle blends primary into lower");
    }
  });
}

test("lower: the line sits at pod fraction 0.31 down the sidepod flank", () => {
  const { two } = builds[true], end = liveryEnd(two);
  // The SEAM: lower vertices that share a position with a primary one.
  const key = (v) => [0, 1, 2].map((k) => Math.round(two.pos[v * 3 + k] * 1e7)).join(",");
  const primary = new Set();
  for (let v = 0; v < end; v++) if (is(two, v, C1)) primary.add(key(v));
  let seam = 0, flank = 0;
  for (let v = 0; v < end; v++) {
    if (!is(two, v, LOW) || !primary.has(key(v))) continue;
    const x = two.pos[v * 3], y = two.pos[v * 3 + 1], z = two.pos[v * 3 + 2];
    if (Math.abs(z - 0.70) < 1e-6) continue;   // the vertical edge where the zone stops: the nose stays primary
    seam++;
    assert.ok(Math.abs(y - lineY(z)) < 1e-6, `seam vertex ${((y - lineY(z)) * 1000).toFixed(3)} mm off the line at z ${z.toFixed(3)}`);
    const p = anchors.podAt(z);
    if (z < 0.62 && z > -1.48 && Math.abs(Math.abs(x) - p.x) < 0.001) {
      flank++;
      assert.ok(Math.abs((y - p.bottom) / (p.top - p.bottom) - 0.31) < 1e-6, "the flank seam is at pod fraction 0.31");
    }
  }
  assert.ok(seam > 50 && flank >= 12, `seam ${seam}, on the pod flanks ${flank}: the line was not cut`);
});

test("lower absent is today's car: no lower = lower:null, and the flat build matches one that never heard of CarShade", () => {
  assert.ok(same(builds[true].plain, buildMcl(null), ALL), "lower: null (resolveLivery's shape) changed the build");
  const today = M.Car3D.build(mcl.color, mcl.color2, { livery: mcl.livery, teamId: "mclaren", num: 4,
    parts: M.Parts.getVisualTiers(M.Parts.defaults ? M.Parts.defaults() : {}, mcl), noWheels: true, measure: true });
  assert.ok(same(builds[false].plain, today, ALL), "a flat no-lower build with CarShade loaded differs from the CarShade-free build");
});

test("lower is ignored by the cockpit and silhouette builds, and under bodySplit lr", () => {
  for (const o of [{ cockpit: true }, { silhouette: true }]) {
    assert.ok(same(buildMcl(undefined, o), buildMcl(LOW, o), ALL), `${Object.keys(o)[0]}: lower changed the build`);
  }
  const cad = S.Teams.LIST.find((t) => t.id === "cadillac");
  const cParts = S.Parts.getVisualTiers(S.Parts.defaults ? S.Parts.defaults() : {}, cad);
  const b = (extra) => S.Car3D.build(cad.color, cad.color2, {
    livery: Object.assign({}, cad.livery, extra), teamId: "cadillac", num: 11, parts: cParts, noWheels: true });
  assert.equal(cad.livery.bodySplit, "lr");
  assert.ok(same(b({}), b({ lower: LOW }), ALL), "bodySplit lr must win over lower");
});
