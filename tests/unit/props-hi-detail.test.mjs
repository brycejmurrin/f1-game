// EXTREME props detail (`propsHi`, TrackModels.propsHi): the hi shapes in
// js/track/scenery/{structures,city,pits,models}.js build only when the built
// track carries track._detailFeatures.propsHi.
//   * detail 0 (no flag): the props and glass buffers hash-identical to the
//     pinned pre-feature bytes for monza and monaco (HIGH, every phone),
//   * detail 2: finite vertices, no NEW degenerate triangles, the triangle
//     totals pinned (tests/data/props-hi-detail.json; a change re-pins with
//     a reason, never a widened band),
//   * physics: the driving limits (barL/barR) and posts are identical at both
//     levels — the hi geometry is visual only.
// Pure Node: the real track build in the VM harness, the flag set on the track
// the way the scenery build config carries it (track._detailFeatures).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const PIN = JSON.parse(readFileSync(path.join(ROOT, "tests", "data", "props-hi-detail.json"), "utf8"));
const { buildContext } = require("../../tools/lib/track-build-vm.cjs");

const env = buildContext();
const orig = env.sandbox.TrackBuildProps;
let FEAT = null;
env.sandbox.TrackBuildProps = Object.assign({}, orig, {
  buildSteps: function* (track, o) { if (FEAT) track._detailFeatures = FEAT; return yield* orig.buildSteps(track, o); },
  build: (track, o) => { if (FEAT) track._detailFeatures = FEAT; return orig.build(track, o); },
});

const hashGeo = (g) => {
  if (!g) return "none";
  const h = createHash("sha256");
  for (const k of ["pos", "nrm", "col", "mat", "idx"]) {
    const a = g[k];
    if (!a) continue;
    h.update(k + ":" + a.length + ":");
    h.update(Buffer.from(Float64Array.from(a).buffer));
  }
  return h.digest("hex").slice(0, 16);
};

function scan(g) {
  const p = g.pos, idx = g.idx;
  let nonFinite = 0, degenerate = 0;
  for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) nonFinite++;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (!(Math.hypot(cx, cy, cz) > 1e-10)) degenerate++;
  }
  return { nonFinite, degenerate };
}

function build(id, hi) {
  FEAT = hi ? { propsHi: true } : null;
  const def = env.Tracks.LIST.find((d) => d.id === id);
  const from = env.mark();
  const track = env.Tracks.build(def, { night: false });
  const g = track.propsGeo;
  const r = {
    tris: g.idx.length / 3, props: hashGeo(g), glass: hashGeo(track.glassGeo), ...scan(g),
    limits: hashGeo({ pos: Array.from(track.barL).concat(Array.from(track.barR)) }),
    posts: JSON.stringify(track.posts || []),
  };
  env.trim(from);
  env.release(track);
  FEAT = null;
  return r;
}

for (const id of Object.keys(PIN.circuits)) {
  const pin = PIN.circuits[id];
  const d0 = build(id, false), d2 = build(id, true);
  test(`${id}: detail 0 builds the pinned pre-feature bytes`, () => {
    assert.equal(d0.props, pin.d0.props, "props buffer moved at detail 0");
    assert.equal(d0.glass, pin.d0.glass, "glass buffer moved at detail 0");
    assert.equal(d0.tris, pin.d0.tris);
  });
  test(`${id}: detail 2 geometry is finite, adds no degenerate triangle, totals pinned`, () => {
    assert.equal(d2.nonFinite, 0, "non-finite vertex components at detail 2");
    assert.ok(d2.degenerate <= d0.degenerate, `degenerate tris ${d0.degenerate} -> ${d2.degenerate}`);
    assert.equal(d2.tris, pin.d2.tris, `detail 2 props tris ${d2.tris} != pinned ${pin.d2.tris} (re-pin with a reason)`);
    assert.ok(d2.tris > d0.tris, "propsHi built nothing");
  });
  test(`${id}: driving limits and posts identical at both levels`, () => {
    assert.equal(d2.limits, d0.limits, "barL/barR moved with propsHi");
    assert.equal(d2.posts, d0.posts, "posts moved with propsHi");
  });
}

test("propsHi reads only track._detailFeatures.propsHi", () => {
  const M = env.sandbox.TrackModels;
  assert.equal(M.propsHi(null), false);
  assert.equal(M.propsHi({}), false);
  assert.equal(M.propsHi({ _detailFeatures: { propsHi: false } }), false);
  assert.equal(M.propsHi({ _detailFeatures: { propsHi: true } }), true);
});
