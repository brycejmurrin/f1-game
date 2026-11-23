/* mesh-detail-perf.test.mjs — MeshDetail on a 150k-triangle output: the cost the EXTREME tier pays per build.
 *
 * A 2.4k-triangle uv sphere (one uv seam, two materials) subdivided 3 Loop levels is 153.6k triangles; the same
 * output then gets crease-angle normals, a bevel of its uv seams, and a QEM simplify to 10 %. Timings are
 * printed (node:test diagnostics) and guarded by CPU-time CEILINGS sized for a busy shared box (measured at load 47 on
 * 4 cores: subdivide ~0.1 s, normals ~0.12 s, bevel ~0.55 s, simplify ~2 s; ceilings 3 / 3 / 4 / 10 s), not by the typical
 * time: the ceilings catch an accidental O(n²), they are not the budget. Correctness of each op is pinned in
 * mesh-detail.test.mjs; this file also checks the big outputs stay clean.
 *
 * Run: node --test tests/unit/mesh-detail-perf.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MD = new Function(readFileSync(join(ROOT, "js/render/shared/mesh-detail.js"), "utf8") + "; return MeshDetail;")();

function uvSphere(nu, nv) {
  const pos = [], uv = [], idx = [], mat = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const th = Math.PI * j / nv, ph = 2 * Math.PI * (i % nu) / nu;
    const r = j === 0 || j === nv ? 0 : Math.sin(th);   // exact poles: sin(π) is 1.2e-16, not 0
    pos.push(r * Math.cos(ph), j === nv ? -1 : Math.cos(th), r * Math.sin(ph));
    uv.push(i / nu, j / nv);
    mat.push(j * 2 < nv ? 20 : 21);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
    if (j > 0) idx.push(a, b, c);
    if (j < nv - 1) idx.push(a, c, d);
  }
  return MD.mesh(pos, idx, { uv: { data: uv, size: 2 }, mat: { data: Float32Array.from(mat), size: 1, id: true } });
}

// CPU time of this process (user + system), not wall time: on a box shared by many workers the wall clock
// measures the queue (AGENTS.md rule 7). Both are printed; only CPU time is held to the ceiling.
function timed(t, name, ceilingMs, fn) {
  fn();   // warm the JIT once; the second run is the measurement
  const s = performance.now(), c0 = process.cpuUsage();
  const r = fn();
  const c = process.cpuUsage(c0), cpu = (c.user + c.system) / 1000, wall = performance.now() - s;
  t.diagnostic(`${name}: ${cpu.toFixed(0)} ms cpu (${wall.toFixed(0)} ms wall) → ${r.indices.length / 3} tris`);
  assert.ok(cpu < ceilingMs, `${name} took ${cpu.toFixed(0)} ms cpu (ceiling ${ceilingMs})`);
  return r;
}

test("150k-triangle subdivide / normals / bevel / simplify stay well inside their ceilings", (t) => {
  const base = uvSphere(40, 31);
  assert.equal(MD.stats(base).tris, 2400);
  assert.ok(MD.stats(base).watertight, "the seam welds on position: a closed sphere");
  const s = timed(t, "subdivide loop ×3", 3000, () => MD.subdivide(base, { levels: 3 }));
  assert.equal(s.indices.length / 3, 153600);
  timed(t, "subdivide butterfly ×3", 3000, () => MD.subdivide(base, { levels: 3, scheme: "butterfly" }));
  const n = timed(t, "normals (40°)", 3000, () => MD.normals(s, { creaseAngle: 40 }));
  // the uv seams as creases: the meridian (darts where it meets nothing) plus each pole's 40-edge star, where
  // the pole's 41 coincident uv copies meet: a many-crease corner fan
  const b = timed(t, "bevel uv seam", 4000, () => MD.bevel(s, { creases: MD.creaseEdges(s, 180), width: 0.004, segments: 2 }));
  const q = timed(t, "simplify → 15k", 10000, () => MD.simplify(s, { targetTris: 15360 }));
  const sn = MD.stats(n), sb = MD.stats(b), sq = MD.stats(q);
  assert.ok(sn.watertight && sn.degenerate === 0);
  assert.equal(b.bevelled, MD.creaseEdges(s, 180).count, "every uv seam edge bevelled (closed fans everywhere)");
  assert.ok(sb.watertight && sb.degenerate === 0, JSON.stringify(sb));
  assert.ok(Math.abs(sq.tris - 15360) <= 768 && sq.watertight, "simplify " + sq.tris);
});
