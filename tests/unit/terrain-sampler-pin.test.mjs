// terrain-sampler-pin.test.mjs — characterization of the TWO terrain-height samplers (#6484 item 4a).
//
// The engine answers "terrain height at (x, z)" twice, over the same track.terrainGeo:
//   A  terrainYAt      js/track/scenery/build-props.js (the scenery api member): a 6 m CSR grid, triangles
//                      whose XZ bbox exceeds 30 m skipped (they fall back to groundYAt), a FIXED barycentric
//                      slack of 0.01 (so 30 cm on a 30 m triangle);
//   B  Tracks.terrainY js/track/tracks.js: an 8 m terrainGrid holding every triangle, a slack of TRI_EPS
//                      (1 cm) metres scaled by each vertex altitude, a brute-force pass when there is no grid.
// build-props.js chains them (`terrainYAt ?? Tracks.terrainY`) and three circuit scenery files call B
// directly. The gardener verifier REFUTED a naive swap: they differ at triangle edges and on huge
// triangles. This file is step (a), the pin: it samples both on one grid for three circuits, explains
// every disagreement, and writes the record to tests/data/terrain-sampler-pin.json. Step (b), choosing a
// canonical sampler, was Bryce's: his D5 (b) made Tracks.terrainY the one sampler (#7132), so terrainYAt is
// now Tracks.terrainY and every circuit records 0 disagreements. A non-zero count again means a second
// sampler crept back in.
//
// What is asserted is the EXPLANATION, not the counts: every point where A and B disagree has a named
// cause (B's answer came from a triangle A skips as huge, or one sampler's slack accepted a point the
// other's refused just outside a triangle edge), and away from those the two agree exactly. The counts
// are the record; a drift from it is a diagnostic. Re-record after a terrain change on these circuits:
//   APEX_TERRAIN_PIN_WRITE=1 node --test tests/unit/terrain-sampler-pin.test.mjs
//
// Run: node --test tests/unit/terrain-sampler-pin.test.mjs   (~4 s: three VM builds, no browser)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = path.join(ROOT, "tests/data/terrain-sampler-pin.json");
const { buildContext } = require("../../tools/lib/track-build-vm.cjs");

// zandvoort is one of the three data callers of Tracks.terrainY (its scenery closure); monaco has cliffs
// and a small, dense terrain; suzuka has the widest terrain and the most huge triangles of the three.
const CIRCUITS = ["zandvoort", "monaco", "suzuka"];
// An off-cell step and origin so samples land on cell borders, triangle edges and interiors alike.
const STEP = 5.3, OX = 0.37, OZ = 0.61;
// The constants of the two samplers, read from their source (tested here, not imported: neither exports them).
const A_CELL = 6, A_HUGE = 30, A_SLACK = 0.01, B_EPS = 0.01;
const SAME = 1e-9;   // equal heights: both compute the same barycentric form

const C = buildContext({ assets: false });

// Build a circuit and capture the scenery api's terrainYAt: a wrapper around the circuit's own scenery
// closure is the only seam, since terrainYAt lives inside buildSteps.
function build(id) {
  const reg = C.sandbox.TrackScenery, orig = reg[id];
  assert.equal(typeof orig, "function", `${id}: no scenery closure resident`);
  let terrainYAt = null;
  reg[id] = function (api) { terrainYAt = api.terrainYAt; return orig.apply(this, arguments); };
  let track;
  try { track = C.Tracks.build(C.Tracks.LIST.find((d) => d && d.id === id)); } finally { reg[id] = orig; }
  assert.equal(typeof terrainYAt, "function", `${id}: scenery never ran`);
  return { track, terrainYAt };
}

// One triangle against (x, z): its barycentrics, the signed distance to its nearest edge (m, < 0
// outside), the verdict of each sampler's own inside test, and the height both would return.
function tri(pos, idx, t, x, z) {
  const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
  const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2], cx = pos[c], cz = pos[c + 2];
  const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = x - ax, v2z = z - az;
  const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z;
  const d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z, den = d00 * d11 - d01 * d01;
  const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx), mnz = Math.min(az, bz, cz), mxz = Math.max(az, bz, cz);
  const huge = mxx - mnx > A_HUGE || mxz - mnz > A_HUGE;
  if (Math.abs(den) < 1e-9) return { t, huge, degenerate: true, inA: false, inB: false };
  const u = (d11 * d20 - d01 * d21) / den, v = (d00 * d21 - d01 * d20) / den, w = 1 - u - v;
  const tA = Math.sqrt(den), e2 = Math.sqrt((v0x - v1x) ** 2 + (v0z - v1z) ** 2);
  // u scales with the altitude over edge a-b (length sqrt(d11)), v over a-c (sqrt(d00)), w over b-c.
  const edge = Math.min(u * tA / Math.sqrt(d11), v * tA / Math.sqrt(d00), w * tA / e2);
  const inA = !(u < -A_SLACK || v < -A_SLACK || u + v > 1 + A_SLACK);
  const inB = !(u * tA < -B_EPS * Math.sqrt(d11) || v * tA < -B_EPS * Math.sqrt(d00) || w * tA < -B_EPS * e2);
  // A's grid lists a non-huge triangle in every 6 m cell its bbox touches; B lists every triangle (cell list).
  const cellA = !huge && Math.floor(x / A_CELL) >= Math.floor(mnx / A_CELL) && Math.floor(x / A_CELL) <= Math.floor(mxx / A_CELL)
    && Math.floor(z / A_CELL) >= Math.floor(mnz / A_CELL) && Math.floor(z / A_CELL) <= Math.floor(mxz / A_CELL);
  const y = pos[a + 1] + u * (pos[c + 1] - pos[a + 1]) + v * (pos[b + 1] - pos[a + 1]);
  return { t, huge, inA: inA && cellA, inB, edge, y, span: Math.max(mxx - mnx, mxz - mnz) };
}

const best = (rows, key) => rows.reduce((m, r) => (r[key] && (m === null || r.y > m.y) ? r : m), null);

// Why A and B disagree at (x, z), from the triangles B's grid lists for that cell (a superset of A's).
function explain(track, x, z, a, b) {
  const g = track.terrainGeo, G = track._terrGrid;
  const i = Math.min(G.nx - 1, Math.max(0, Math.floor((x - G.mnx) / G.cell)));
  const j = Math.min(G.nz - 1, Math.max(0, Math.floor((z - G.mnz) / G.cell)));
  const k = j * G.nx + i, rows = [];
  for (let n = G.start[k]; n < G.start[k + 1]; n++) rows.push(tri(g.pos, g.idx, G.list[n], x, z));
  const wA = best(rows, "inA"), wB = best(rows, "inB");
  // The reconstruction must reproduce both real answers, or the explanation below explains nothing.
  const same = (p, q) => (p === null ? q === null : q !== null && Math.abs(p - q) <= SAME);
  if (!same(wA ? wA.y : null, a) || !same(wB ? wB.y : null, b)) return { cause: "unexplained", why: "reconstruction" };
  if (wB && wB.huge) return { cause: "hugeTri", outsideM: Math.max(0, -wB.edge), span: wB.span };
  // Otherwise one sampler's winner is a triangle the other's inside test refused at its edge.
  const w = wA && !(wB && Math.abs(wA.y - wB.y) <= SAME && wA.t === wB.t) && !wA.inB ? wA : wB && !wB.inA ? wB : null;
  if (w && w.edge < 0) return { cause: w === wA ? "slackA" : "slackB", outsideM: -w.edge, span: w.span };
  return { cause: "unexplained", why: "no edge" };
}

function measure(id) {
  const { track, terrainYAt } = build(id);
  const g = track.terrainGeo;
  let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
  for (let i = 0; i < g.pos.length; i += 3) {
    mnx = Math.min(mnx, g.pos[i]); mxx = Math.max(mxx, g.pos[i]);
    mnz = Math.min(mnz, g.pos[i + 2]); mxz = Math.max(mxz, g.pos[i + 2]);
  }
  let hugeTris = 0;
  for (let t = 0; t < g.idx.length; t += 3) if (tri(g.pos, g.idx, t, 0, 0).huge) hugeTris++;
  const r = {
    tris: g.idx.length / 3, hugeTris, samples: 0, bothNull: 0, agree: 0,
    aNullBNum: 0, aNumBNull: 0, bothNumDiffer: 0, maxAbsDy: 0,
    causes: { hugeTri: 0, slackA: 0, slackB: 0, unexplained: 0 },
    maxOutsideM: { hugeTri: 0, slackA: 0, slackB: 0 }, maxDyBy: { hugeTri: 0, slackA: 0, slackB: 0 },
    worst: [], unexplained: [],
  };
  for (let x = mnx + OX; x <= mxx; x += STEP) for (let z = mnz + OZ; z <= mxz; z += STEP) {
    r.samples++;
    const a = terrainYAt(x, z), b = C.Tracks.terrainY(track, x, z);
    if (a === null && b === null) { r.bothNull++; continue; }
    if (a !== null && b !== null && Math.abs(a - b) <= SAME) { r.agree++; continue; }
    const dy = a !== null && b !== null ? Math.abs(a - b) : null;
    if (a === null) r.aNullBNum++; else if (b === null) r.aNumBNull++; else r.bothNumDiffer++;
    const e = explain(track, x, z, a, b);
    r.causes[e.cause]++;
    const at = { x: +x.toFixed(2), z: +z.toFixed(2), a: a === null ? null : +a.toFixed(3), b: b === null ? null : +b.toFixed(3) };
    if (e.cause === "unexplained") { r.unexplained.push({ ...at, why: e.why }); continue; }
    r.maxOutsideM[e.cause] = Math.max(r.maxOutsideM[e.cause], e.outsideM);
    if (dy !== null) {
      r.maxAbsDy = Math.max(r.maxAbsDy, dy);
      r.maxDyBy[e.cause] = Math.max(r.maxDyBy[e.cause], dy);
      r.worst.push({ ...at, dy: +dy.toFixed(3), cause: e.cause, triSpanM: +e.span.toFixed(1) });
    }
  }
  r.worst = r.worst.sort((p, q) => q.dy - p.dy).slice(0, 5);
  r.maxAbsDy = +r.maxAbsDy.toFixed(3);
  for (const k of Object.keys(r.maxOutsideM)) {
    r.maxOutsideM[k] = +r.maxOutsideM[k].toFixed(3);
    r.maxDyBy[k] = +r.maxDyBy[k].toFixed(3);
  }
  r.unexplained = r.unexplained.slice(0, 10);
  return r;
}

const results = {};
for (const id of CIRCUITS) {
  test(`${id}: every point where terrainYAt and Tracks.terrainY disagree has a named cause`, (t) => {
    const r = results[id] = measure(id);
    assert.ok(r.agree > 0 && r.samples > 1000, `${id}: the grid sampled no terrain (${r.samples} samples)`);
    // #7132: one canonical sampler, so the scenery api's terrainYAt and Tracks.terrainY never disagree.
    assert.equal(r.aNullBNum + r.aNumBNull + r.bothNumDiffer, 0,
      `${id}: terrainYAt and Tracks.terrainY disagree at ${r.aNullBNum + r.aNumBNull + r.bothNumDiffer} points; worst ${JSON.stringify(r.worst)}`);
    assert.ok(r.causes.unexplained === 0,
      `${id}: ${r.causes.unexplained} disagreements have no cause; first: ${JSON.stringify(r.unexplained)}`);
    // A slack-only disagreement sits just outside a triangle edge: within A's 0.01 barycentric slack of a
    // triangle at most 30 m across (30 cm), or within B's 1 cm. Further out is a third sampler difference.
    assert.ok(r.maxOutsideM.slackA <= A_SLACK * A_HUGE * 1.5 + 1e-6, `${id}: slackA reaches ${r.maxOutsideM.slackA} m outside an edge`);
    assert.ok(r.maxOutsideM.slackB <= B_EPS + 1e-6, `${id}: slackB reaches ${r.maxOutsideM.slackB} m outside an edge`);
    t.diagnostic(`${id}: ${r.samples} samples, ${r.agree} agree, ${r.aNullBNum} A-null, ${r.aNumBNull} B-null, `
      + `${r.bothNumDiffer} differ (max |dy| ${r.maxAbsDy} m); causes ${JSON.stringify(r.causes)}`);
  });
}

test("the recorded comparison matches this measurement (re-record with APEX_TERRAIN_PIN_WRITE=1, never in CI)", (t) => {
  const record = {
    "//": "Written by tests/unit/terrain-sampler-pin.test.mjs (#6484 item 4a). A = build-props.js terrainYAt, "
      + "B = Tracks.terrainY. hugeTri: B's answer came from a triangle over 30 m across that A skips; slackA / "
      + "slackB: that sampler accepted a point just outside a triangle edge the other refused. maxOutsideM: how far "
      + "outside that edge. Not a pin: re-record with APEX_TERRAIN_PIN_WRITE=1.",
    grid: { step: STEP, ox: OX, oz: OZ, sameM: SAME },
    circuits: results,
  };
  if (process.env.APEX_TERRAIN_PIN_WRITE === "1") {
    assert.ok(!process.env.CI, "APEX_TERRAIN_PIN_WRITE=1 re-records the golden from its own measurement; refused when CI is set");
    fs.writeFileSync(DATA, JSON.stringify(record, null, 2) + "\n");
    t.diagnostic(`wrote ${path.relative(ROOT, DATA)}`);
    return;
  }
  const prev = JSON.parse(fs.readFileSync(DATA, "utf8"));
  // The record must describe this file's own comparison (same circuits, same grid), or it records nothing.
  assert.ok(CIRCUITS.every((id) => prev.circuits && prev.circuits[id]), `${path.relative(ROOT, DATA)} lacks a circuit of ${CIRCUITS}`);
  assert.ok(prev.grid && prev.grid.step === STEP && prev.grid.ox === OX && prev.grid.oz === OZ,
    `${path.relative(ROOT, DATA)} was recorded on another grid; re-record`);
  const keys = ["samples", "agree", "aNullBNum", "aNumBNull", "bothNumDiffer", "maxAbsDy"];
  const drift = [];
  for (const id of CIRCUITS) {
    const was = prev.circuits && prev.circuits[id], now = results[id];
    assert.ok(now, `${id}: no measurement this run (the per-circuit test did not run)`);
    const moved = was ? keys.filter((k) => was[k] !== now[k]).map((k) => `${k} ${was[k]} -> ${now[k]}`) : ["not recorded"];
    if (moved.length) drift.push(`${id} drifted from the record: ${moved.join(", ")}`);
  }
  assert.deepEqual(drift, [], "the recorded comparison moved; if intended, re-record with APEX_TERRAIN_PIN_WRITE=1:\n  " + drift.join("\n  "));
});
