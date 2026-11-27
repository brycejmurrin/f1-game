// terrain-over-road-fleet.test.mjs — node twin of tests/specs/terrain-over-road.spec.js (#7087, #6557 P4a).
//
// Runs the spec's own scan (tools/lib/over-road-scan.cjs) on a VM build's terrainGeo and roadGeo for
// every circuit at TOL 0.18, with the spec's sample ladder, half-width rule and planted-face negative
// control, so the geometry audit blocks on every geometry diff instead of waiting for a browser run.
// The browser/VM divergence of the same scan is recorded, not gated: docs/notes/TERRAIN-OVER-ROAD-FLEET.md.
//
// Run: node --test tests/unit/terrain-over-road-fleet.test.mjs   (APEX_CIRCUITS=<ids> narrows it)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));
const { scanOverRoad, roadFails } = require(path.join(ROOT, "tools", "lib", "over-road-scan.cjs"));
const { scope } = require(path.join(ROOT, "tools", "lib", "circuit-scope.cjs"));
const { crossoverIds } = await import(path.join(ROOT, "tests", "helpers", "circuit-crossovers.js"));

const TOL = 0.18;
const M = 1200;
const LADDER = [-0.6, -0.3, 0, 0.3, 0.6];
const CROSSOVER = new Set(crossoverIds());

/** The spec's in-page body, on a VM-built track. Returns { road, terr, control } or { err }. */
function audit(Tracks, def, t) {
  const caps = { road: t.roadGeo, terrain: t.terrainGeo };
  const r3 = (v) => +v.toFixed(3);   // __apex.nodeAt rounds to 3 dp
  const px = new Float64Array(M), pz = new Float64Array(M), py = new Float64Array(M),
        rx = new Float64Array(M), rz = new Float64Array(M), hw = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    const k = Math.round(i / M * t.n) % t.n;
    px[i] = r3(t.px[k]); pz[i] = r3(t.pz[k]); py[i] = r3(t.py[k]); rx[i] = r3(t.rx[k]); rz[i] = r3(t.rz[k]);
  }
  const near = (x, z) => { let bd = 1e9, bk = 0; for (let k = 0; k < M; k++) { const dx = x - px[k], dz = z - pz[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; bk = k; } } return bk; };
  const rp = caps.road && caps.road.pos;
  if (!rp || rp.length / 3 <= 1000) return { err: "no road mesh" };
  if (!caps.terrain || !caps.terrain.pos || caps.terrain.pos.length / 3 <= 1000) return { err: "no terrain mesh" };
  // Half-width from the road mesh, as the spec does (its ladder is the spec's, not track.hw).
  for (let v = 0; v < rp.length; v += 3) {
    const k = near(rp[v], rp[v + 2]);
    const lat = Math.abs((rp[v] - px[k]) * rx[k] + (rp[v + 2] - pz[k]) * rz[k]);
    if (lat < 13 && lat > hw[k]) hw[k] = lat;
  }
  for (let k = 0; k < M; k++) if (hw[k] < 3) hw[k] = 6;
  const bankTrack = Tracks.buildCenterline(def);
  const tps = [];
  for (let i = 0; i < M; i++) for (let si = 0; si < LADDER.length; si++) {
    const lat = LADDER[si] * hw[i];
    const bank = Tracks.banking(bankTrack, i / M * bankTrack.total, lat);
    tps.push({ x: px[i] + rx[i] * lat, z: pz[i] + rz[i] * lat, y: py[i] + (bank?.dy || 0), frac: i / M, i, si });
  }
  const knownCrossover = CROSSOVER.has(def.id);
  const base = { tps, px, pz, M, ladder: LADDER.length, trackNodeCount: t.n };
  const scan = (name) => scanOverRoad(caps[name], { ...base, name, knownCrossover });
  // Negative control, as the spec: a 9-node strip 1 m over the line, highest part of the lap.
  const L = LADDER.length;
  let m0 = 0; for (let i = 0; i < M - 9; i++) if (tps[i * L + 2].y > tps[m0 * L + 2].y) m0 = i;
  const pp = [], ii = [];
  for (let i = m0; i < m0 + 9; i++) for (const si of [0, L - 1]) { const p = tps[i * L + si]; pp.push(p.x, p.y + 1, p.z); }
  for (let q = 0; q < 8; q++) { const v = q * 2; ii.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  const control = tps[m0 * L + 2].y + 1 < -0.5 ? null
    : scanOverRoad({ pos: pp, idx: ii }, { ...base, name: "terrain", knownCrossover: false }).max;
  return { road: scan("road"), terr: scan("terrain"), control };
}

const fleet = (() => {
  let out = null;
  return () => {
    if (out) return out;
    out = new Map();
    const ctx = buildContext(), T = ctx.Tracks;
    assert.equal(T.setKeepGeometry(true), true, "the build must keep its geometry for this audit");
    for (const def of T.LIST.filter((d) => scope([d.id]).length)) {
      const t = T.build(def);
      out.set(def.id, audit(T, def, t));   // only the verdict outlives the circuit
      ctx.trim(0);
    }
    return out;
  };
})();

test("no terrain or road face over the racing line, on any circuit (TOL 0.18)", () => {
  const offenders = [];
  for (const [id, r] of fleet()) {
    // TERRAIN_OVER_ROAD_TABLE=1 prints every reading, for docs/notes/TERRAIN-OVER-ROAD-FLEET.md.
    if (process.env.TERRAIN_OVER_ROAD_TABLE) console.log(`over-road ${id}: road=${r.road?.max} terr=${r.terr?.max} control=${r.control}`);
    if (r.err) { offenders.push(`${id}: ${r.err}`); continue; }
    if (r.control !== null && !(r.control > 0.9)) offenders.push(`${id}: planted face read ${r.control}, scan is blind`);
    if (r.terr.max > TOL) offenders.push(`${id} TERRAIN ${r.terr.max} m @${JSON.stringify(r.terr.fr)} worst=${JSON.stringify(r.terr.worst)}`);
    if (roadFails(r.road.max, TOL)) offenders.push(`${id} ROAD ${r.road.max} m @${JSON.stringify(r.road.fr)} worst=${JSON.stringify(r.road.worst)}`);
  }
  assert.deepEqual(offenders, [], `circuits with geometry over the racing line:\n  ${offenders.join("\n  ")}`);
});

test("the fleet measured every scoped circuit (anti-vacuity)", () => {
  const ids = [...fleet().keys()];
  assert.ok(ids.length > 0, "at least one circuit was audited");
  for (const [id, r] of fleet()) assert.ok(!r.err && r.terr && r.road, `${id} produced a reading`);
});
