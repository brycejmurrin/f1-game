// Car mesh BUDGET (B·H13, 2026-10-20): Bryce, "with all of our new body shapes
// … they are rising way more vertices and are affecting perf". Pins, for every
// picker body plus the team cars, the triangles and vertices of the meshes the
// race draws (tools/car/tri-census.mjs prints the full table):
//   - player body ≤ 16.5k tris, a field rival's ≤ 14k, the far shared rival ≤ 6.5k
//   - CarGeometry.weld ran: ≤ 1.35 vertices per triangle (unwelded corners are ~2.6)
//   - welding is lossless: same triangles, and every welded corner equals the
//     unwelded corner it replaced (position, normal, colour, surface)
// A new body that needs more must say why here, not drift past a perf hunt.
//
// Run: node --test tests/unit/car-mesh-budget.test.mjs   (npm run test:tooling-fast; ~5 s, no browser)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCar, censusBody, farBody } from "../../tools/car/tri-census.mjs";

const M = loadCar(undefined, true);
const { Car3D, Parts, Teams } = M;
const BUDGET = Object.freeze({ player: 16500, field: 14000, far: 6500, vertsPerTri: 1.35 });

test("every body stays inside the per-car triangle budget, welded", () => {
  const rows = [["ferrari", null], ["redbull", null], ...Car3D.BODY_STYLE_IDS.map((id) => ["ferrari", id])];
  for (const [team, id] of rows) {
    const r = censusBody(M, team, id), label = id || team;
    assert.ok(r.player.tris <= BUDGET.player, `${label}: player body ${r.player.tris} tris > ${BUDGET.player}`);
    assert.ok(r.field.tris <= BUDGET.field, `${label}: field body ${r.field.tris} tris > ${BUDGET.field}`);
    for (const tier of ["player", "field"])
      assert.ok(r[tier].verts <= r[tier].tris * BUDGET.vertsPerTri, `${label}: ${tier} ${r[tier].verts} verts for ${r[tier].tris} tris — unwelded?`);
  }
  const far = farBody(M);
  assert.ok(far.tris <= BUDGET.far, `far shared rival ${far.tris} tris > ${BUDGET.far}`);
});

test("the weld is lossless: same triangles, same corners", () => {
  const team = Teams.LIST.find((t) => t.id === "ferrari");
  const parts = Parts.getVisualTiers(Parts.getFactorySetup(team), team);
  for (const bodyStyle of [undefined, "auralis", "caldra"]) {
    const opts = { livery: { c1: team.color, c2: team.color2, bodyStyle }, teamId: team.id, num: 16, parts };
    const a = Car3D.build(team.color, team.color2, Object.assign({ noWeld: true }, opts));
    const b = Car3D.build(team.color, team.color2, opts);
    assert.equal(b.idx.length, a.idx.length, `${bodyStyle}: triangle count`);
    const f = (v) => Math.fround(v);
    for (let t = 0; t < a.idx.length; t++) {
      const i = a.idx[t], j = b.idx[t];
      for (let k = 0; k < 3; k++) {
        assert.equal(f(b.pos[j * 3 + k]), f(a.pos[i * 3 + k]));
        assert.equal(f(b.nrm[j * 3 + k]), f(a.nrm[i * 3 + k]));
        assert.equal(f(b.col[j * 3 + k]), f(a.col[i * 3 + k]));
      }
      assert.equal(b.mat[j], a.mat[i]);
    }
  }
});
