import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");
const Tracks = buildContext();
const cr = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t
  + (2 * a - 5 * b + 4 * c - d) * t * t
  + (-a + 3 * b - 3 * c + d) * t * t * t);

test("the final centerline node interpolates the actual dense closing chord", () => {
  for (const id of ["monza", "suzuka", "singapore", "mont_tremblant"]) {
    const def = Tracks.LIST.find((d) => d.id === id);
    assert.ok(def, `${id} is a shipped circuit`);
    const track = Tracks.buildCenterline(def);
    const points = def.points, n = track.n, N = points.length;
    const last = [0, 1, 2].map((axis) => cr(
      points[N - 2][axis], points[N - 1][axis], points[0][axis], points[1][axis], 15 / 16));
    const start = points[0];
    const gap = Math.hypot(...last.map((v, i) => start[i] - v));
    const target = (n - 1) * track.total / n;
    const f = (target - (track.total - gap)) / gap;
    assert.ok(f > 0 && f < 1, `${id} final target lies in closing chord; f=${f}`);
    const expected = last.map((v, i) => v + (start[i] - v) * f);
    // Y may receive authored bridge/elevation and the seeded undulation after
    // the resample; X/Z still identify the closing segment exactly.
    for (const [axis, actual] of [[0, track.px[n - 1]], [2, track.pz[n - 1]]]) {
      // The output arrays are float32; 1 mm is generous for kilometre-scale coordinates.
      assert.ok(Math.abs(actual - expected[axis]) < 0.001,
        `${id} axis ${axis}: closing-chord ${expected[axis]}, sampled ${actual}`);
    }
    const seamDot = Math.max(-1, Math.min(1,
      track.tx[0] * track.tx[n - 1] + track.ty[0] * track.ty[n - 1] + track.tz[0] * track.tz[n - 1]));
    assert.ok(Math.acos(seamDot) < Math.PI / 90, `${id} closing tangent turns <2 degrees per node`);
    assert.ok(Number.isFinite(track.curv[0]) && Number.isFinite(track.curv[n - 1]));
  }
});

test("a full track build requires an upload-capable renderer", () => {
  const def = Tracks.LIST.find((d) => d.id === "monza");
  assert.throws(() => Tracks.build(def, { gfx: {} }), /requires gfx\.createMesh/,
    "a partial track would have neither barriers nor opened pit boundary");
  assert.ok(Tracks.buildCenterline(def).n > 0,
    "centerline-only callers retain the explicit CPU-only entry point");
});
