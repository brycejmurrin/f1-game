/* car-caster-weld — Car3D.build opts.caster (#7436, CarGeometry.weld posOnly): a car shadow caster (car-draw.js
 * `_casterOnly`) welds on position only, because every depth pass that draws it reads position alone (GLX DEPTH_VS, WGX
 * SHADOW_VERTEX_LAYOUT, TLX __tlxCasterOnly). Over the 11 teams' caster builds (silhouette, as car-draw.js
 * buildPendingTeamMesh makes them):
 *   - the positional triangle digest is unchanged (same triangles, same corner order, same Float32 positions),
 *     minus only zero-area triangles, so the shadow depth is pixel-identical;
 *   - no degenerate triangle survives and every index is in range;
 *   - the vertex count and the GLX/WGX upload bytes fall (census printed);
 *   - a lit build (no silhouette) is refused the caster weld: it keeps the full 10-lane weld.
 * Run: node --test tests/unit/car-caster-weld.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadCar } from "../../tools/car/tri-census.mjs";

const { Car3D, Parts, Teams } = loadCar(undefined, true);
const STRIDE = 28;   // js/render/shared/vertex-pack.js STRIDE (GLX); WGX VERTEX_STRIDE packs the same 28 bytes
const build = (team, extra) => Car3D.build(team.color, team.color2, Object.assign({ livery: { c1: team.color, c2: team.color2 },
  teamId: team.id, num: 16, parts: Parts.getVisualTiers(Parts.getFactorySetup(team), team) }, extra));
const caster = (team, on) => build(team, { silhouette: true, caster: on });
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const bits = (v) => { f32[0] = v; return u32[0]; };
const corner = (o, i) => `${bits(o.pos[i*3])},${bits(o.pos[i*3+1])},${bits(o.pos[i*3+2])}`;
// The ordered position triples of every non-zero-area triangle, hashed: what a depth pass rasterises.
function digest(o) {
  const h = createHash("sha256");
  let tris = 0;
  for (let t = 0; t < o.idx.length; t += 3) {
    const a = corner(o, o.idx[t]), b = corner(o, o.idx[t+1]), c = corner(o, o.idx[t+2]);
    if (a === b || b === c || a === c) continue;
    h.update(a + ";" + b + ";" + c + "|"); tris++;
  }
  return { hash: h.digest("hex"), tris };
}
const bytes = (o) => (o.pos.length / 3) * STRIDE + o.idx.length * ((o.pos.length / 3) > 65535 ? 4 : 2);

test("caster weld keeps every triangle on the same positions and cuts the upload (11 teams)", () => {
  assert.equal(Teams.LIST.length, 11, "the census covers the 11 teams");
  let v0 = 0, v1 = 0, b0 = 0, b1 = 0;
  for (const team of Teams.LIST) {
    const lit = caster(team, false), before = digest(lit), vb = lit.pos.length / 3, bb = bytes(lit);
    const out = caster(team, true), after = digest(out), n = out.pos.length / 3;
    assert.equal(after.hash, before.hash, team.id + ": same triangle set on the same positions");
    assert.equal(out.idx.length / 3, before.tris, team.id + ": only zero-area triangles dropped");
    for (let t = 0; t < out.idx.length; t += 3) {
      const a = out.idx[t], b = out.idx[t+1], c = out.idx[t+2];
      assert.ok(a < n && b < n && c < n && a !== b && b !== c && a !== c, team.id + ": valid triangle " + t / 3);
    }
    assert.equal(out.nrm.length, n * 3); assert.equal(out.col.length, n * 3); assert.equal(out.mat, undefined);
    assert.ok(n < vb, `${team.id}: ${vb} -> ${n} vertices`);
    v0 += vb; v1 += n; b0 += bb; b1 += bytes(out);
  }
  console.log(`caster census, 11 teams: ${v0} -> ${v1} vertices; GLX/WGX upload ${b0} -> ${b1} bytes`);
  assert.ok(v1 < v0 * 0.6, `vertex count falls by > 40 %: ${v0} -> ${v1}`);
});

test("a lit build is refused the caster weld: caster without silhouette keeps every lane", () => {
  const team = Teams.LIST[0], ref = build(team, {}), got = build(team, { caster: true });
  assert.deepEqual(Array.from(got.pos), Array.from(ref.pos)); assert.deepEqual(Array.from(got.idx), Array.from(ref.idx));
  assert.deepEqual(Array.from(got.nrm), Array.from(ref.nrm)); assert.deepEqual(Array.from(got.col), Array.from(ref.col));
  assert.ok(got.mat && got.mat.length === got.pos.length / 3, "the lit build keeps its mat lane");
  assert.ok(got.nrm.some((v) => v !== 0), "real normals");
});
