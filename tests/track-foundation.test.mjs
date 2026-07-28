import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = (await import("node:module")).createRequire(import.meta.url)("../tools/manifest.cjs");
const P = MANIFEST.PATHS;

function loadGlobal(file, name) {
  const sandbox = { console, Math, Array, Object, Number, Float32Array, Map, Set };
  sandbox.window = sandbox;
  const source = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^const\b/gm, "var");
  vm.runInContext(source, vm.createContext(sandbox), { filename: file });
  return sandbox[name];
}

test("TrackSpace converts source and racing fractions reversibly", () => {
  const TrackSpace = loadGlobal(P.TRACK_SPACE, "TrackSpace");
  for (const def of [{ startFrac: 0.25 }, { startFrac: 0.25, reverse: true }]) {
    for (const source of [0, 0.1, 0.25, 0.75, 1.2, -0.1]) {
      const racing = TrackSpace.toRacingFrac(def, source);
      assert.ok(racing >= 0 && racing < 1);
      assert.ok(Math.abs(TrackSpace.toSourceFrac(def, racing) - TrackSpace.wrap01(source)) < 1e-12);
    }
  }
  assert.equal(TrackSpace.toRacingFrac({ startFrac: 0.25 }, 0.25), 0);
  assert.equal(TrackSpace.toRacingFrac({ startFrac: 0.25, reverse: true }, 0), 0.25);
});

test("TrackSpace converts nodes, samples source data, and preserves legacy scenery", () => {
  const TrackSpace = loadGlobal(P.TRACK_SPACE, "TrackSpace");
  const def = { startFrac: 0.25, reverse: true };
  assert.equal(TrackSpace.sourceNodeToRacing(def, 25, 100), 0);
  assert.equal(TrackSpace.racingNodeToSource(def, 0, 100), 25);
  const rotated = Array.from({ length: 385 }, (_, i) =>
    TrackSpace.racingNodeToSource({ startFrac: 0.635 }, i, 385));
  assert.equal(new Set(rotated).size, 385, "node rotation must remain a permutation");
  const offset = Math.round(0.635 * 100) % 100;
  for (let i = 0; i < 100; i++)
    assert.equal(TrackSpace.racingNodeToSource({ startFrac: 0.635 }, i, 100), (i + offset) % 100);
  assert.equal(TrackSpace.sampleSource(def, 0.1, (f) => f), TrackSpace.toSourceFrac(def, 0.1));
  assert.ok(Math.abs(TrackSpace.sceneryFrac({ startFrac: 0.25 }, 0.4) - 0.4) < 1e-12);
  assert.ok(Math.abs(TrackSpace.sceneryFrac({ startFrac: 0.25, sceneryCoordinates: "source" }, 0.4) - 0.15) < 1e-12);
  assert.ok(Math.abs(TrackSpace.sceneryFrac({ startFrac: 0.25, sceneryCoordinates: "racing" }, 0.4) - 0.4) < 1e-12);
});

test("Miami declares explicit racing scenery and source-mapped Turnpike elevation", () => {
  const TrackSpace = loadGlobal(P.TRACK_SPACE, "TrackSpace");
  const [miami] = loadGlobal(MANIFEST.circuitPath("miami"), "TrackDefs");
  assert.equal(miami.id, "miami");
  assert.equal(miami.sceneryCoordinates, "racing");
  assert.equal(miami.flatTerrain, true);
  assert.equal(miami.terrainOuter, 90);
  assert.ok(Math.abs(TrackSpace.toRacingFrac(miami, miami.elevations[0].s) - 0.66) < 1e-12);
  // Curated hero zones only (eb0b6b3 narrowed the old full-lap exclusion):
  // Hard Rock bowl horizon, marina, and beach club.
  const cityFoliage = Array.from(miami.dressingExclusions) // host-realm copy for deepEqual
    .filter((rule) => rule.kinds && rule.kinds.includes("city") && rule.kinds.includes("foliage"))
    .map(({ s0, s1, side }) => ({ s0, s1, side }));
  assert.deepEqual(cityFoliage, [
    { s0: 0.94, s1: 0.08, side: undefined },
    { s0: 0.26, s1: 0.38, side: 1 },
    { s0: 0.60, s1: 0.72, side: undefined },
  ]);
  assert.ok(!miami.dressingExclusions.some((rule) => rule.s0 === 0 && rule.s1 === 1),
    "full-lap dressing exclusions must stay gone (scenery-density regression)");
});

test("TrackSurface creates monotonic rails and one terrain/grounding height contract", () => {
  const TrackSurface = loadGlobal(P.TRACK_SURFACE, "TrackSurface");
  const track = {
    n: 3, total: 12,
    py: new Float32Array([10, 5, 8]),
    hw: new Float32Array([6, 6, 6]),
    def: { terrainOuter: 9, palette: {} },
  };
  const p = TrackSurface.profile(track.def, track);
  assert.equal(p.outerW, 9);
  assert.ok(p.rails.length >= 3);
  assert.ok(p.rails.every((v, i, a) => i === 0 || v > a[i - 1]));
  assert.equal(p.rails.at(-1), 9);
  for (const dist of [0, 2.2, 5, 9, 20]) {
    assert.equal(p.heightAt(0, dist), TrackSurface.heightAt(p, 0, dist));
    assert.ok(Number.isFinite(p.heightAt(0, dist)));
  }
  assert.equal(p.heightAt(0, 20), p.floorY);
});

test("TrackModels groups are atomic and invalid or unsafe models are diagnosed", () => {
  const TrackModels = loadGlobal(P.TRACK_MODELS, "TrackModels");
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const water = { pos: [], nrm: [], col: [], idx: [] };
  const api = TrackModels.create({
    out, water,
    preflight: (bounds) => bounds.id !== "blocked",
    emitBox: (buf, c, size) => {
      const base = buf.pos.length / 3;
      buf.pos.push(...c);
      buf.nrm.push(0, 1, 0);
      buf.col.push(1, 1, 1);
      buf.idx.push(base);
      return size;
    },
    frameAt: () => ({ c: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1], hw: 6 }),
    groundHeight: (_k, d) => d * 0.1,
  });

  assert.equal(api.modelGroup("blocked", { id: "blocked", center: [0, 0, 0], size: [1, 1, 1] },
    (stage) => api.box(stage, [0, 0, 0], [1, 1, 1])), false);
  assert.equal(out.pos.length, 0);
  assert.equal(api.modelGroup("bad", { center: [0, 0, 0], size: [1, NaN, 1] },
    (stage) => api.box(stage, [0, 0, 0], [1, 1, 1])), false);
  assert.equal(api.modelGroup("ok", { center: [0, 0, 0], size: [1, 1, 1] },
    (stage) => api.box(stage, [0, 0, 0], [1, 1, 1])), true);
  assert.equal(out.pos.length, 3);
  assert.equal(api.overheadSpan({ id: "low", frac: 0, clearance: 3.5, required: true }), false);
  assert.equal(api.overheadSpan({ id: "safe", frac: 0, clearance: 5.5, thickness: 1, depth: 2 }), true);
  assert.equal(api.waterSurface({ id: "lake", center: [10, -1, 3], size: [4, 0.2, 6] }), true);
  assert.equal(water.pos.length, 3);
  assert.ok(api.diagnostics.suppressed.some((d) => d.id === "blocked"));
  assert.ok(api.diagnostics.invalid.some((d) => d.id === "bad"));
  assert.ok(api.diagnostics.unsafe.some((d) => d.id === "low"));
});

function budgetFixture() {
  const TrackModels = loadGlobal(P.TRACK_MODELS, "TrackModels");
  const out = {
    pos: [9, 9, 9],
    nrm: [0, 1, 0],
    col: [0.5, 0.5, 0.5],
    idx: [0],
  };
  const api = TrackModels.create({
    out,
    emitBox(stage, center) {
      const base = stage.pos.length / 3;
      stage.pos.push(...center);
      stage.nrm.push(0, 1, 0);
      stage.col.push(1, 1, 1);
      stage.idx.push(base);
    },
  });
  const emitTwo = (stage) => {
    api.box(stage, [0, 0, 0], [1, 1, 1]);
    api.box(stage, [1, 0, 0], [1, 1, 1]);
  };
  return { api, out, emitTwo };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("TrackModels atomically rejects staged geometry above its vertex budget", () => {
  const { api, out, emitTwo } = budgetFixture();
  const before = JSON.parse(JSON.stringify(out));
  const ok = api.modelGroup("too-large", {
    center: [0, 0, 0], size: [2, 1, 1],
  }, emitTwo, { required: true, maxVertices: 1, kind: "facility" });

  assert.equal(ok, false);
  assert.deepEqual(out, before);
  assert.deepEqual(plain(api.diagnostics.invalid), [{
    id: "too-large",
    required: true,
    reason: "vertex budget exceeded",
    vertices: 2,
    maximum: 1,
    kind: "facility",
  }]);
  assert.equal(api.diagnostics.emitted.length, 0);
});

test("TrackModels preserves unbudgeted groups and accepts exact vertex budgets", () => {
  for (const entry of [
    { id: "unbudgeted", options: undefined, kind: "model" },
    { id: "boundary", options: { maxVertices: 2, kind: "hero" }, kind: "hero" },
  ]) {
    const { api, out, emitTwo } = budgetFixture();
    assert.equal(api.modelGroup(entry.id, {
      center: [0, 0, 0], size: [2, 1, 1],
    }, emitTwo, entry.options), true);
    assert.equal(out.pos.length, 9);
    assert.deepEqual(plain(api.diagnostics.emitted), [{
      id: entry.id,
      required: false,
      vertices: 2,
      kind: entry.kind,
    }]);
    assert.equal(api.diagnostics.invalid.length, 0);
  }
});

test("TrackModels rejects invalid configured vertex budgets without committing", () => {
  for (const maximum of [NaN, Infinity, -1, "2"]) {
    const { api, out, emitTwo } = budgetFixture();
    const before = JSON.parse(JSON.stringify(out));
    assert.equal(api.modelGroup("invalid-budget", {
      center: [0, 0, 0], size: [2, 1, 1],
    }, emitTwo, { maxVertices: maximum }), false);
    assert.deepEqual(out, before);
    assert.equal(api.diagnostics.invalid.length, 1);
    assert.equal(api.diagnostics.invalid[0].reason, "invalid vertex budget");
    assert.equal(api.diagnostics.emitted.length, 0);
  }
});

test("TrackModels ground helpers sample terrain instead of one endpoint", () => {
  const TrackModels = loadGlobal(P.TRACK_MODELS, "TrackModels");
  const emitted = [];
  const api = TrackModels.create({
    out: { pos: [], nrm: [], col: [], idx: [] },
    water: { pos: [], nrm: [], col: [], idx: [] },
    emitBox: (_buf, c, size) => emitted.push({ c, size }),
    frameAt: (frac) => ({ c: [frac * 100, 0, 0], r: [1, 0, 0], u: [0, 1, 0], t: [0, 0, 1], hw: 5 }),
    groundHeight: (k, d) => k + d,
  });
  assert.equal(api.groundPatch({ id: "patch", k: 2, side: 1, gap: 3, size: [6, 0.2, 8], samples: 3 }), true);
  assert.equal(api.groundedSegments({ id: "segments", points: [{ k: 0, dist: 2 }, { k: 3, dist: 4 }] }), true);
  assert.ok(emitted.length >= 3);
  assert.ok(emitted.every((e) => Number.isFinite(e.c[1])));
});

test("TrackModels validates complete finite mesh buffers", () => {
  const TrackModels = loadGlobal(P.TRACK_MODELS, "TrackModels");
  assert.equal(TrackModels.validateGeometry({
    pos: [0, 0, 0], nrm: [0, 1, 0], col: [1, 1, 1], idx: [0],
  }).ok, true);
  const bad = TrackModels.validateGeometry({
    pos: [0, NaN, 0], nrm: [0, 1, 0], col: [1, 1, 1], idx: [4],
  });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /non-finite|index/);
});
