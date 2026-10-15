/* Focused scenery detector regressions through the actual survey facade and
 * the scanner serialized by Playwright. Fault injection changes terrain reads
 * only; no browser, renderer or shipped circuit geometry is modified. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { scanTerrainOverRoad } from "../helpers/terrain-over-road-scan.js";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const truthy = (v, m) => assert.ok(v, m);
const gt = (a, b) => assert.ok(a > b, `${a} > ${b}`);
const contains = (c, v) => assert.ok(c.includes(v), `${c} contains ${v}`);
const closeTo = (r, e, d) => assert.ok(Math.abs(e - r) < Math.pow(10, -d) / 2);
let g;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });
async function load(id) {
  await g.race(id);
  g.apex.go();
  g.apex.jump(0.05, 60, 0);
}

// Inject only terrain reads into the actual survey facade. Source geometry and
// circuit data stay unchanged; the witnesses make each missing-strip case exact.
async function surveyWithVoid(lo, hi) {
  await load("monza");
  const T = g.sandbox.Tracks, track = g.G.track;
  const p = { p: [], r: [], t: [] };
  T.sample(track, 0, p);
  const mag = Math.hypot(p.r[0], p.r[2]), rx = p.r[0] / mag, rz = p.r[2] / mag;
  g.sandbox.Tracks = { ...T, terrainY(_track, x, z) {
    const dx = x - p.p[0], dz = z - p.p[2];
    const lat = dx * rx + dz * rz, along = -dx * rz + dz * rx;
    return Math.abs(along) < 2 && lat >= lo && lat <= hi ? null : p.p[1];
  } };
  try { return g.apex.survey({ profile: true, limit: 200 }); }
  finally { g.sandbox.Tracks = T; }
}

test("survey bounds missing strips beyond either requested scan edge", async () => {
  for (const [lo, hi, side] of [[20, 100, 1], [-100, -20, -1]]) {
    const s = await surveyWithVoid(lo, hi);
    const hole = s.terrainHoles.find((h) => h.frac === 0 && h.scanBoundary);
    truthy(hole, JSON.stringify(s.terrainHoles));
    gt(side * hole.boundedAtLatM, s.reachM);
    assert.equal(s.summary.clean, false);
  }
});

test("survey preserves intentional outer boundaries and the under-road carve", async () => {
  for (const [lo, hi] of [[40, Infinity], [-Infinity, -40], [-8, 8]]) {
    const s = await surveyWithVoid(lo, hi);
    assert.equal(s.terrainHoles.filter((h) => h.frac === 0).length, 0);
  }
});

test("survey states its sampling resolution and narrow-gap limitation", async () => {
  const s = await surveyWithVoid(22, 24);
  assert.equal(s.terrainHoles.filter((h) => h.frac === 0).length, 0);
  assert.equal(s.sampling.exhaustive, false);
  assert.equal(s.sampling.lateralSpacingM, 10);
  closeTo(s.sampling.stationSpacingM, g.G.track.total / s.sampledAt, 0);
  contains(s.sampling.note, "between samples");
});

test("survey uses the banked surface on both raised and lowered road edges", async () => {
  await load("zandvoort");
  const T = g.sandbox.Tracks, track = g.G.track, stations = 200;
  const p = { p: [], r: [], t: [] };
  let at = null;
  for (let i = 0; i < stations; i++) {
    const s = i / stations * track.total;
    T.sample(track, s, p);
    const bank = T.banking(track, s, 5);
    if (p.hw >= 5 && bank && Math.abs(bank.dy) > 0.5) {
      at = { i, s, x: p.p[0], y: p.p[1], z: p.p[2], rx: p.r[0], rz: p.r[2], sign: Math.sign(bank.dy) };
      break;
    }
  }
  truthy(at, "actual Zandvoort banking must provide a raised/lowered edge");
  const mag = Math.hypot(at.rx, at.rz), rx = at.rx / mag, rz = at.rz / mag;
  const raised = at.sign * 5, lowered = -raised;
  g.sandbox.Tracks = { ...T, terrainY(_track, x, z) {
    const dx = x - at.x, dz = z - at.z, lat = dx * rx + dz * rz;
    if (Math.abs(-dx * rz + dz * rx) > 0.01) return null;
    if (Math.abs(lat - raised) < 0.01) return at.y + T.banking(track, at.s, raised).dy - 0.05;
    if (Math.abs(lat - lowered) < 0.01) return at.y;
    return null;
  } };
  try {
    const s = g.apex.survey({ stations, lats: 5, reachM: 10, limit: 200 });
    const hits = s.terrainOverRoad.filter((h) => Math.abs(h.frac - at.i / stations) < 0.001);
    assert.equal(hits.some((h) => h.latM === raised), false, "terrain below raised tarmac is safe");
    truthy(hits.some((h) => h.latM === lowered && h.aboveRoadM > 0.5), "terrain above lowered tarmac must be detected");
  } finally { g.sandbox.Tracks = T; }
});

test("the exact over-road scanner is invariant under world-height translation", () => {
  const scan = (shift, intrusion) => {
    const triangle = (y) => ({ pos: Array.from({ length: 1002 }, (_, i) =>
      [[-6, y, -1], [6, y, -1], [0, y, 1]][i % 3]).flat(), idx: [0, 1, 2] });
    const caps = { road: triangle(shift), terrain: triangle(shift + intrusion) };
    const apex = { trackGeometry: () => caps, info: () => ({ n: 1444, track: "probe" }),
      nodeAt: () => ({ x: 0, y: shift, z: 0, rx: 1, rz: 0 }) };
    return vm.runInNewContext(`(${scanTerrainOverRoad.toString()})(false)`, {
      window: { __apex: apex }, __apex: apex,
      Tracks: { LIST: [{ id: "probe" }], buildCenterline: () => ({ total: 1000 }), banking: () => null },
    });
  };
  for (const shift of [0, -10, 100]) {
    assert.equal(scan(shift, 1).terr.max, 1, `1 m intrusion at world Y ${shift}`);
    assert.equal(scan(shift, -1).terr.max, 0, `terrain below road at world Y ${shift}`);
  }
});

