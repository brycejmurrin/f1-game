// Desktop DETAIL levels in the track build (js/track/scenery/detail.js, docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md).
//
//  * Detail 0 is today's world: a build at detail 2 with every flag OFF is byte-identical to the default build
//    (every geometry channel hashed), so each extra is gated by its own flag and nothing else moved.
//  * Detail 2 (EXTREME) never touches what physics reads: track.roadGeo (the debris trimesh), terrainGeo
//    (Tracks.terrainY), the kerb flags, the barrier rails and floorY hash the same as at detail 0.
//  * Detail 2 builds finite geometry; its triangle totals are pinned in tests/data/track-detail-tris.json with the
//    props-tri ratchet's band (grow > 0.5 % fails, under 99 % is stale). Re-measure:
//      node tests/unit/track-detail.test.mjs --write
//  * Detail 2 adds no zero-area triangle; its drawn road (with the profiled kerbs) is what a later re-chunk draws
//    (track.roadDrawGeo), crowd3d seats figures, treesHi stamps the pack's LOD0 trees, and Monaco's street panels
//    wear the W-beam face (propsHi). The TLX crowd vertex stage: tests/unit/tlx-crowd-anim.test.mjs.
//  * The pieces in isolation: normalize(), the crowd figure's triangle budget, the kerb profile's peak, and the
//    far-terrain ring's seam (on floorY within D0 and at the rim, never below it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const DATA = path.join(ROOT, "tests/data/track-detail-tris.json");
const IDS = ["monza", "monaco"];

const hash = (g) => {
  if (!g) return "none";
  const h = createHash("sha1");
  for (const k of ["pos", "nrm", "col", "mat", "uv", "trk", "idx"]) {
    const a = g[k];
    if (!a) continue;
    h.update(k);
    h.update(Buffer.from(new Float64Array(Array.from(a)).buffer));
  }
  return h.digest("hex");
};
const cap = (m) => (m && m.__cap) || null;
const tris = (g) => (g && g.idx ? g.idx.length / 3 : 0);
function channels(tr) {
  const m = tr.meshes;
  return {
    road: hash(tr.roadGeo), roadDrawn: hash(cap(m.road) || cap(m.roadChunked)), terrain: hash(tr.terrainGeo),
    props: hash(tr.propsGeo), floor: hash(cap(m.floor)), glass: hash(cap(m.glass)), water: hash(cap(m.water)),
    kerbL: hash({ idx: tr.kerbL }), kerbR: hash({ idx: tr.kerbR }), barL: hash({ idx: tr.barL }), barR: hash({ idx: tr.barR }),
    floorY: tr.surface.floorY,
  };
}
function totals(tr) {
  const m = tr.meshes;
  return { road: tris(cap(m.road) || cap(m.roadChunked)), props: tris(tr.propsGeo), glass: tris(cap(m.glass)), floor: tris(cap(m.floor)) };
}
const finite = (g) => { for (let i = 0; i < g.pos.length; i++) if (!Number.isFinite(g.pos[i])) return false; return true; };
// Zero-area triangles (cross product under 1e-10 m^2): detail 2 may not add any.
const degenerate = (g) => {
  if (!g || !g.idx) return 0;
  const p = g.pos, I = g.idx;
  let n = 0;
  for (let t = 0; t + 2 < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-10) n++;
  }
  return n;
};
// The drawn road as the harness captures it (pos / nrm / idx).
const drawnOf = (tr) => cap(tr.meshes.road) || cap(tr.meshes.roadChunked);
const degs = (tr) => ({ props: degenerate(tr.propsGeo), road: degenerate(drawnOf(tr)), floor: degenerate(cap(tr.meshes.floor)) });
const modelKinds = (tr) => new Set(((tr.graph && tr.graph.nodes) || []).map((nd) => String(nd.model).split("|")[0]));
const lod0 = (tr) => Object.entries(tr.modelInstances || {}).filter(([k]) => /_lod0$/.test(k)).reduce((o, [k, v]) => (o[k] = v.n, o), {});

let _env = null;
const env = () => (_env || (_env = require(path.join(ROOT, "tools/lib/track-build-vm.cjs")).buildContext({ compact: true })));
const build = (id, extra) => env().Tracks.build(env().Tracks.LIST.find((d) => d.id === id), Object.assign({ night: false }, extra));
const ALL_OFF = { crowd3d: false, treesHi: false, kerbProfile: false, farTerrain: false, density: false, propsHi: false };

function measure() {
  const out = {};
  for (const id of IDS) {
    const d0 = build(id);
    const c0 = channels(d0), t0 = totals(d0);
    const off = channels(build(id, { detail: 2, detailFeatures: ALL_OFF }));
    const d2 = build(id, { detail: 2 });
    out[id] = { c0, off, c2: channels(d2), t0, t2: totals(d2),
      finite: [d2.roadGeo, d2.propsGeo, cap(d2.meshes.floor), drawnOf(d2)].every((g) => g && finite(g)),
      deg0: degs(d0), deg2: degs(d2), kinds0: modelKinds(d0), kinds2: modelKinds(d2), lod0_0: lod0(d0), lod0_2: lod0(d2),
      drawGeo0: d0.roadDrawGeo, drawGeo2: d2.roadDrawGeo && hash({ pos: d2.roadDrawGeo.pos, nrm: d2.roadDrawGeo.nrm, idx: d2.roadDrawGeo.idx }), chunked2: d2.meshes.roadChunked };
  }
  return out;
}

if (process.argv.includes("--write")) {
  const m = measure(), pins = {};
  for (const id of IDS) pins[id] = { detail0: m[id].t0, detail2: m[id].t2 };
  writeFileSync(DATA, JSON.stringify({ _doc: "Triangle totals per circuit at detail 0 and 2 (EXTREME): drawn road, props, glass, floor. tests/unit/track-detail.test.mjs.", circuits: pins }, null, 2) + "\n");
  process.stdout.write("wrote " + DATA + "\n");
} else {
  const m = measure();
  const pins = JSON.parse(readFileSync(DATA, "utf8")).circuits;
  for (const id of IDS) {
    test(`${id}: detail 2 with every flag off builds today's world byte for byte`, () => {
      assert.deepEqual(m[id].off, m[id].c0);
    });
    test(`${id}: detail 2 leaves every physics channel (road collider, terrain, kerb flags, rails, floorY) alone`, () => {
      const { c0, c2 } = m[id];
      for (const k of ["road", "terrain", "kerbL", "kerbR", "barL", "barR", "floorY"]) assert.equal(c2[k], c0[k], k);
      assert.notEqual(c2.props, c0.props, "the EXTREME props differ");
      assert.notEqual(c2.roadDrawn, c0.roadDrawn, "the drawn road carries the profiled kerbs");
    });
    test(`${id}: detail 2 is finite and its triangle totals match the pins`, () => {
      assert.ok(m[id].finite);
      for (const lv of ["detail0", "detail2"]) {
        const got = lv === "detail0" ? m[id].t0 : m[id].t2, want = pins[id][lv];
        for (const k of Object.keys(want)) {
          assert.ok(got[k] <= want[k] * 1.005, `${id} ${lv} ${k} grew: ${got[k]} > ${want[k]} +0.5 % (re-measure with --write, say why)`);
          assert.ok(got[k] >= want[k] * 0.99, `${id} ${lv} ${k} stale: ${got[k]} < 99 % of ${want[k]} (re-measure with --write)`);
        }
      }
      assert.ok(m[id].t2.road > m[id].t0.road);
    });
    test(`${id}: detail 2 adds no degenerate triangle (props, drawn road, floor)`, () => {
      for (const k of ["props", "road", "floor"]) assert.ok(m[id].deg2[k] <= m[id].deg0[k], `${k}: ${m[id].deg2[k]} > ${m[id].deg0[k]}`);
    });
    test(`${id}: a later re-chunk draws the profiled kerbs (roadDrawGeo), the collider keeps the flat road`, () => {
      assert.equal(m[id].drawGeo0, undefined, "detail 0 carries no second road");
      if (m[id].chunked2 === undefined) assert.equal(m[id].drawGeo2, m[id].c2.roadDrawn, "the unchunked drawn road is what game.js re-chunks");
      assert.notEqual(m[id].drawGeo2, m[id].c2.road);
    });
    test(`${id}: crowd3d seats figures; treesHi stamps baked LOD0 trees 1:1, none at detail 0`, () => {
      assert.ok(m[id].kinds2.has("crowd-fig") && !m[id].kinds0.has("crowd-fig"));
      assert.deepEqual(m[id].lod0_0, {});
      assert.ok(Object.keys(m[id].lod0_2).length > 0, JSON.stringify(m[id].lod0_2));
    });
  }
  test("monaco: propsHi gives the street barriers the W-beam face (street-barrier-hi), none at detail 0", () => {
    assert.ok(m.monaco.kinds2.has("street-barrier-hi") && !m.monaco.kinds0.has("street-barrier-hi"));
    assert.ok(m.monaco.t2.props > m.monaco.t0.props);
    assert.ok(m.monaco.lod0_2.palm_lod0 > 0, "monaco's palms near the road are the baked palm");
  });
}

// ---- the pieces, in a bare VM ---------------------------------------------------------------------------------
function bare() {
  const sb = { Math, Number, Array, Object, Float32Array, Float64Array, Uint8Array, String, Infinity, Log: { info() {}, warn() {} } };
  vm.createContext(sb);
  vm.runInContext(readFileSync(path.join(ROOT, "js/track/scenery/detail.js"), "utf8") + "\nthis.TrackDetail = TrackDetail;", sb);
  return sb.TrackDetail;
}

test("normalize: level 0 ignores every flag; level 2 without flags turns them all on; GfxQuality absent is 0", () => {
  const TD = bare();
  assert.equal(TD.normalize(0, { crowd3d: true }).features.crowd3d, false);
  assert.equal(TD.normalize(2).features.farTerrain, true);
  assert.equal(TD.normalize(2, { treesHi: true }).features.density, false);
  assert.equal(TD.resolve({}, {}).level, 0);
  assert.equal(TD.resolve({}, { trackDetail: { detail: 2, detailFeatures: { kerbProfile: true } } }).features.kerbProfile, true);
  assert.deepEqual([...TD.NAMES].sort(), ["crowd3d", "density", "farTerrain", "kerbProfile", "propsHi", "treesHi"]);
});

test("crowd figure: 60-120 triangles in every pose, inside the crowd-body envelope", () => {
  const TD = bare();
  for (let pose = 0; pose < TD.POSES; pose++) {
    let t = 0, maxY = -Infinity, minY = Infinity, maxX = 0, maxZ = 0;
    const box = (c, sz) => { t += 12; maxY = Math.max(maxY, c[1] + sz[1] / 2); minY = Math.min(minY, c[1] - sz[1] / 2);
      maxX = Math.max(maxX, Math.abs(c[0]) + sz[0] / 2); maxZ = Math.max(maxZ, Math.abs(c[2]) + sz[2] / 2); };
    const rec = { mat() {}, box, cyl: (c, r, h, col, seg) => { t += seg * 3; maxY = Math.max(maxY, c[1] + h); } };
    TD.crowdFigure(rec, 0, pose, pose, 1, false, "@node");
    assert.ok(t >= 60 && t <= 120, `pose ${pose}: ${t} triangles`);
    assert.ok(minY >= -0.5 && maxY <= 0.52 && maxX <= 0.4 && maxZ <= 0.3, `pose ${pose} envelope`);
  }
});

function straight(n, hw) {
  const T = { n, total: n * 4, hw: Array(n).fill(hw), px: [], py: Array(n).fill(0), pz: [],
    rx: Array(n).fill(1), ry: Array(n).fill(0), rz: Array(n).fill(0), tx: Array(n).fill(0), ty: Array(n).fill(0), tz: Array(n).fill(1) };
  for (let k = 0; k < n; k++) { T.px.push(0); T.pz.push(k * 4); }
  return T;
}

test("kerb profile: 4 rails, crowned, never above the flat ribbon's height; rumble gets a sawtooth", () => {
  const TD = bare();
  for (const style of [undefined, "sausage", "rumble"]) {
    const T = straight(12, 6), out = { pos: [], nrm: [], col: [], mat: [], trk: [], idx: [] };
    const KH0 = style === "sausage" ? 0.09 : style === "rumble" ? 0.07 : 0.06;
    TD.kerbRibbon(T, 2, 8, 1, out, { KW: 0.9, KH0, style, ka: [1, 0, 0], kb: [1, 1, 1], ds: 4, STRIPE_M: 1.6,
      upOf: () => [0, 1, 0], bankOffsetAt: () => 0, MAT: { FLAT: 9 } });
    let peak = -Infinity;
    for (let i = 1; i < out.pos.length; i += 3) peak = Math.max(peak, out.pos[i]);
    assert.ok(peak <= 0.03 + KH0 + 1e-9, `${style}: peak ${peak}`);
    assert.equal(out.pos.length / 3 % 4, 0);
    assert.ok(out.idx.length > 0 && out.idx.every((v) => v < out.pos.length / 3));
    // the crown sits above the road-edge lip
    assert.ok(out.pos[4 + 3] > out.pos[1], `${style}: crowned`);
  }
});

test("far terrain: on floorY within D0 of the road and at the rim, hills beyond, null on a street circuit", () => {
  const TD = bare();
  const T = straight(100, 6);
  T.def = { id: "fixture" };
  T.surface = { outerW: 120, floorY: -1 };
  const floor = { pos: [-3000, -1, -3000, 3000, -1, -3000, 3000, -1, 3400, -3000, -1, 3400], col: [0.3, 0.3, 0.2], mat: [4] };
  const g = TD.farTerrain(T, floor, []);
  assert.ok(g && g.idx.length > 0);
  let top = -Infinity;
  for (let i = 0; i < g.pos.length; i += 3) {
    const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
    assert.ok(y >= -1 - 1e-9, "never below floorY");
    const d = Math.hypot(x, Math.max(0, z - 392, -z));   // every 2nd node: the last sampled one is z = 392
    if (d <= 120 + TD.FAR.D0_EXTRA) assert.equal(y, -1, `near the road at ${x},${z}`);
    if (Math.abs(x) === 3000 || z === -3000 || z === 3400) assert.equal(y, -1, "rim");
    top = Math.max(top, y);
  }
  assert.ok(top > 10, "hills rise beyond the ramp");
  // anything placed out there keeps flat ground under it
  const occupied = TD.farTerrain(T, floor, [{ xz: [2000, 1500] }]);
  let near = -Infinity;
  for (let i = 0; i < occupied.pos.length; i += 3)
    if (Math.abs(occupied.pos[i] - 2000) < 60 && Math.abs(occupied.pos[i + 2] - 1500) < 60) near = Math.max(near, occupied.pos[i + 1]);
  assert.equal(near, -1);
  T.def.street = true;
  assert.equal(TD.farTerrain(T, floor, []), null);
});
