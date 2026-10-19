// tools/car/car-fit-audit.mjs: each fit check on synthetic box fixtures with a
// known answer, the --base comparison, and one shipped-car fixture (the
// Fenced Halo brow that floats over the cockpit). Node only, ~5 s.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIT, analyse, loadCar, buildCar } from "../../tools/car/lib/fit-geom.mjs";
import { gaps, penetration, zfight, openEdges } from "../../tools/car/lib/fit-checks.mjs";
import { auditMesh, compareRuns } from "../../tools/car/car-fit-audit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// A mesh of named sections, each a list of axis-aligned boxes [x0,y0,z0,x1,y1,z1]
// (flat-shaded: 24 unshared vertices, outward CCW winding) or open quads.
function mesh(sections) {
  const m = { pos: [], nrm: [], col: [], mat: [], idx: [], parts: [] };
  const quad = (a, b, c, d, col) => {
    const base = m.pos.length / 3;
    for (const p of [a, b, c, d]) { m.pos.push(...p); m.col.push(...col); m.mat.push(20); m.nrm.push(0, 0, 0); }
    m.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const [name, items] of sections) {
    const from = m.pos.length / 3;
    for (const it of items) {
      const col = it.col || [0.5, 0.5, 0.5];
      if (it.quad) { quad(...it.quad, col); continue; }
      const [x0, y0, z0, x1, y1, z1] = it.box;
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col);   // +z
      quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col);   // -z
      quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col);   // +x
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col);   // -x
      quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col);   // +y
      quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col);   // -y
    }
    m.parts.push({ name, vertices: m.pos.length / 3 - from, from, to: m.pos.length / 3 });
  }
  return m;
}
const BODY = { box: [-0.3, 0, -1, 0.3, 0.3, 1] };

test("FIT thresholds are the documented ones (widening one is a tolerance change)", () => {
  assert.deepEqual({ ...FIT }, { WELD_MM: 0.05, ATTACH_MM: 3, GAP_MM: 3, GAP_SEARCH_MM: 250, TYRE_PEN_MM: 3,
    PEN_MM: 20, PEN_SEARCH_MM: 60, ZFIGHT_MM: 0.25, ZFIGHT_COS: 0.999, ZFIGHT_AREA_M2: 1e-4, OPEN_MM: 50 });
});

test("a closed box welds into one closed piece; an open quad is open", () => {
  const A = analyse(mesh([["chassis", [BODY]], ["livery", [{ quad: [[0, 0.5, 0], [0.1, 0.5, 0], [0.1, 0.6, 0], [0, 0.6, 0]] }]]]));
  assert.equal(A.pieces.length, 2);
  assert.ok(A.pieces[0].closed && A.pieces[0].boundary === 0);
  assert.equal(A.pieces[1].boundary, 4);
});

test("GAP: a touching part joins the car; one 10 mm off floats and fails", () => {
  const touch = analyse(mesh([["chassis", [BODY]], ["sharkFin", [{ box: [-0.01, 0.3, 0, 0.01, 0.5, 0.2] }]]]));
  assert.deepEqual(gaps(touch).rows, []);
  assert.deepEqual(gaps(touch).joints.map((j) => j.pair), ["chassis|sharkFin"]);
  const off = analyse(mesh([["chassis", [BODY]], ["sharkFin", [{ box: [-0.01, 0.31, 0, 0.01, 0.5, 0.2] }]]]));
  const [r] = gaps(off).rows;
  assert.equal(r.check, "GAP"); assert.equal(r.a, "sharkFin"); assert.equal(r.b, "chassis");
  assert.ok(Math.abs(r.value - 10) < 0.2, `gap ${r.value}`); assert.equal(r.fail, true);
  const near = analyse(mesh([["chassis", [BODY]], ["sharkFin", [{ box: [-0.01, 0.302, 0, 0.01, 0.5, 0.2] }]]]));
  assert.deepEqual(gaps(near).rows, [], "a 2 mm seam is a joint (ATTACH_MM 3)");
});

test("PENETRATION: 30 mm into a closed box fails, a 10 mm embed is a join", () => {
  const deep = analyse(mesh([["chassis", [BODY]], ["halo", [{ box: [-0.05, 0.27, 0, 0.05, 0.5, 0.1] }]]]));
  const r = penetration(deep).find((x) => x.a === "halo" && x.b === "chassis");
  assert.ok(r && Math.abs(r.value - 30) < 0.2 && r.fail, JSON.stringify(r));
  const shallow = analyse(mesh([["chassis", [BODY]], ["halo", [{ box: [-0.05, 0.29, 0, 0.05, 0.5, 0.1] }]]]));
  const s = penetration(shallow).find((x) => x.a === "halo");
  assert.ok(s && !s.fail && Math.abs(s.value - 10) < 0.2, JSON.stringify(s));
});

test("ZFIGHT: a coplanar plate of another colour fights; the same colour cannot show", () => {
  const plate = (col) => ({ quad: [[-0.1, 0.3001, -0.1], [-0.1, 0.3001, 0.1], [0.1, 0.3001, 0.1], [0.1, 0.3001, -0.1]], col });
  const red = analyse(mesh([["chassis", [BODY]], ["livery", [plate([0.9, 0.1, 0.1])]]]));
  const z = zfight(red);
  assert.equal(z.length, 1); assert.deepEqual([z[0].a, z[0].b], ["chassis", "livery"]);
  assert.ok(z[0].fail && z[0].value > 300, `area ${z[0].value} cm2`);   // the 20x20 cm plate, sampled
  assert.deepEqual(zfight(analyse(mesh([["chassis", [BODY]], ["livery", [plate([0.5, 0.5, 0.5])]]]))), []);
});

test("OPEN: a visible free quad edge warns; a rim butting the body is sealed", () => {
  const free = analyse(mesh([["chassis", [BODY]], ["livery", [{ quad: [[0.5, 0.5, 0], [0.5, 0.5, 0.2], [0.7, 0.5, 0.2], [0.7, 0.5, 0]] }]]]));
  const [o] = openEdges(free).filter((x) => x.a === "livery");
  assert.ok(o && o.warn && o.fail && Math.abs(o.value - 800) < 1, JSON.stringify(o));
  const flush = analyse(mesh([["chassis", [BODY]], ["livery", [{ quad: [[-0.1, 0.3005, -0.1], [-0.1, 0.3005, 0.1], [0.1, 0.3005, 0.1], [0.1, 0.3005, -0.1]] }]]]));
  assert.deepEqual(openEdges(flush).filter((x) => x.a === "livery"), []);
});

test("compareRuns: NEW, WORSE and PRE-EXISTING; a branch-only style is charged against the base factory car", () => {
  const row = (check, a, b, value, count = 1) => ({ check, a, b, value, unit: "mm", fail: true, n: 1, nFail: 1, count });
  const base = { cars: [{ team: "haas", style: "factory", rows: [row("GAP", "halo", "chassis", 10), row("PENETRATION", "wheels", "chassis", 30, 10)] }] };
  const head = { cars: [
    { team: "haas", style: "factory", rows: [row("GAP", "halo", "chassis", 11), row("PENETRATION", "wheels", "chassis", 30, 40), row("ZFIGHT", "livery", "chassis", 5)] },
    { team: "haas", style: "aero/preview_x", rows: [row("GAP", "halo", "chassis", 10), row("GAP", "frontWing", "chassis", 40)] },
  ] };
  const out = compareRuns(head, base);
  assert.deepEqual(out.cars[0].rows.map((r) => r.status), ["PRE-EXISTING", "WORSE", "NEW"]);
  assert.deepEqual(out.cars[1].rows.map((r) => r.status), ["PRE-EXISTING", "NEW"]);
  // a fresh row within NOISE of its limit is listed but does not gate (seam jitter)
  const jitter = compareRuns({ cars: [{ team: "haas", style: "factory", rows: [row("GAP", "mirrors", "chassis", 3.6), row("PENETRATION", "brakeDucts", "tyre LF", 4.5)] }] }, base);
  assert.deepEqual(jitter.cars[0].rows.map((r) => r.status), ["NEAR-LIMIT", "NEW"]);
});

test("shipped fixture: the Fenced Halo brow floats over the cockpit (a NEW GAP vs the factory car)", () => {
  const M = loadCar(ROOT);
  const factory = auditMesh(buildCar(M, "mclaren"), ["GAP"]);
  const fenced = auditMesh(buildCar(M, "mclaren", { cockpit: "style_cockpit_fenced" }), ["GAP"]);
  const out = compareRuns({ cars: [{ team: "mclaren", style: "cockpit/style_cockpit_fenced", rows: fenced.rows }] },
                          { cars: [{ team: "mclaren", style: "factory", rows: factory.rows }] });
  const brow = out.cars[0].rows.find((r) => r.check === "GAP" && r.a === "halo");
  assert.ok(brow && brow.status === "NEW" && brow.value > 20, JSON.stringify(brow));
  // and every factory row carries a section pair the report can name
  for (const r of factory.rows) assert.ok(r.a && r.b && Number.isFinite(r.value), JSON.stringify(r));
});
