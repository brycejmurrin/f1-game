import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REQUIRE = (await import("node:module")).createRequire(import.meta.url);
const MANIFEST = REQUIRE("../../tools/manifest.cjs");
const { buildContext } = REQUIRE("../../tools/lib/track-build-vm.cjs");
const P = MANIFEST.PATHS;

// Read one js/ file into a fresh sandbox, converting top-level `const` to `var`
// so the global lands as a sandbox property (same trick as verify-track.cjs).
// js/core/mat4.js goes in FIRST every time: it is the second <script> tag in the real
// shell and the home of the shared scalar helpers (M4.clamp/lerp/wrapDelta), so
// a file loaded without it is not the file the browser evaluates.
function runInto(ctx, file) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^const\b/gm, "var");
  vm.runInContext(source, ctx, { filename: absSrc(file) });
}
function loadGlobal(file, name) {
  const sandbox = { console, Math, Array, Object, Number, Float32Array, Float64Array, Uint32Array, ArrayBuffer, Map, Set };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  runInto(ctx, "js/core/log.js");
  runInto(ctx, "js/core/mat4.js");
  runInto(ctx, file);
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

test("a def's POINT and RANGE scenery are read in the SAME coordinate space", () => {
  // The bug this pins: sceneryFrac()/sceneryNode() consulted
  // def.sceneryCoordinates while BOTH scenery call sites of range() passed a
  // hard-coded "source". On a def declaring "racing" AND reverse:true the two
  // therefore disagreed, and only that pair of flags exposed it — which is why
  // it survived: exactly two circuits declare it, kyalami and paul_ricard.
  // Measured on kyalami (startFrac 0.01): its Crowthorne gravel is a POINT at
  // racing 0.078 and the tyre wall written to back it is a RANGE at
  // 0.060-0.098, which landed at 0.912-0.950 — most of a lap away and on the
  // other side. guardrail/fence/tyreWall feed recordBarrier, so barL/barR
  // moved with them; this was a collision defect, not just a visual one.
  const TrackSpace = loadGlobal(P.TRACK_SPACE, "TrackSpace");
  const DEFS = [
    { startFrac: 0.01, reverse: true, sceneryCoordinates: "racing" },   // kyalami
    { startFrac: 0.03, reverse: true, sceneryCoordinates: "racing" },   // paul_ricard
    { startFrac: 0.28, reverse: true, sceneryCoordinates: "source" },   // monaco
    { startFrac: 0.0125, sceneryCoordinates: "racing" },                // a forward def
    { startFrac: 0.25, reverse: true },                                 // the legacy default
    { startFrac: 0.4 },                                                 // ...and forward
  ];
  for (const def of DEFS) {
    for (const [s0, s1] of [[0.06, 0.098], [0.10, 0.18], [0.42, 0.52]]) {
      const r = TrackSpace.sceneryRange(def, s0, s1);
      const ends = [TrackSpace.sceneryFrac(def, s0), TrackSpace.sceneryFrac(def, s1)].sort();
      // A range's two ends must land exactly where the same two numbers would
      // land as points. Sorted, because a reversed remap legitimately swaps
      // them so [s0,s1] stays a short forward arc rather than wrapping.
      assert.deepEqual([r.s0, r.s1].sort(), ends,
        `range and point disagree for ${JSON.stringify(def)} on ${s0}-${s1}`);
    }
  }
  // ANTI-VACUITY: the agreement above must not be "both are the identity".
  // A source-space def has to actually MOVE its ranges, or this test would
  // pass just as well against a range() that had stopped mapping anything.
  // NOT 0.10-0.18 on monaco: a reversed remap sends s to phi-s and then swaps
  // the ends back, so any pair summing to phi (0.28 here) maps to ITSELF. The
  // first draft of this check used exactly that pair and failed — correctly.
  const moved = TrackSpace.sceneryRange(DEFS[2], 0.42, 0.52);
  assert.ok(Math.abs(moved.s0 - 0.42) > 0.01 && Math.abs(moved.s1 - 0.52) > 0.01,
    `a source-space def must still remap its ranges — got ${JSON.stringify(moved)}`);
  // And the two spaces must remain distinguishable at all.
  assert.equal(TrackSpace.scenerySpace(DEFS[0]), "racing");
  assert.equal(TrackSpace.scenerySpace(DEFS[2]), "source");
  assert.equal(TrackSpace.scenerySpace(DEFS[4]), "source", "legacy: reversed defaults to source");
  assert.equal(TrackSpace.scenerySpace(DEFS[5]), "racing", "legacy: forward defaults to racing");
});

test("full-lap ranges preserve coverage in every coordinate frame", () => {
  const S = loadGlobal(P.TRACK_SPACE, "TrackSpace");
  for (const reverse of [false, true]) for (const sceneryLapMirror of [false, true]) {
    for (const sceneryCoordinates of ["source", "racing"]) {
      const def = { startFrac: 0.25, reverse, sceneryLapMirror, sceneryCoordinates, _sceneryShift: 0.37 };
      for (const [s0, s1] of [[0, 1], [0.2, 1.2], [1, 0], [-0.5, 1.5]]) {
        for (const space of ["source", "racing"]) {
          assert.deepEqual({ ...S.range(def, s0, s1, space) }, { s0: 0, s1: 1 });
        }
        assert.deepEqual({ ...S.sceneryRange(def, s0, s1) }, { s0: 0, s1: 1 },
          "the scenery-origin shift must not collapse a preserved full lap");
      }
      // Equal endpoints still mean a point; a short seam-crossing range still
      // has its authored span, with reversal/mirroring only changing the ends.
      for (const space of ["source", "racing"]) {
        const point = S.range(def, 0.2, 0.2, space);
        assert.equal(point.s0, point.s1);
        const short = S.range(def, 0.9, 0.1, space);
        assert.ok(Math.abs(S.wrap01(short.s1 - short.s0) - 0.2) < 1e-12);
      }
    }
  }
});

test("Miami declares explicit racing scenery and source-mapped Turnpike elevation", () => {
  const TrackSpace = loadGlobal(P.TRACK_SPACE, "TrackSpace");
  const [miami] = loadGlobal(MANIFEST.circuitPath("miami"), "TrackDefs");
  assert.equal(miami.id, "miami");
  assert.equal(miami.sceneryCoordinates, "racing");
  assert.equal(miami.flatTerrain, true);
  assert.equal(miami.terrainOuter, 90);
  // Elevations are SOURCE-space and fmap'd through startFrac. This expected
  // 0.66 while miami's startFrac was 0.2325 (0.8925 - 0.2325); the start line
  // has since been corrected onto the real one at 0.0, so the map is now the
  // identity and the source fraction stands unchanged. The assertion is kept
  // because it still pins WHICH space the field is read in. 0.8925 -> 0.8605
  // when the bogus sceneryStartFrac 0.2325 went (DEFECT-LEDGER "miami"): the
  // shift's undulation phase had carried the crest, so the source fraction was
  // re-swept to keep the road where it was (peak ~0.858, within 0.065 m).
  assert.equal(miami.startFrac, 0);
  assert.ok(Math.abs(TrackSpace.toRacingFrac(miami, miami.elevations[0].s) - 0.8605) < 1e-12);
  assert.ok(Math.abs(TrackSpace.toRacingFrac(miami, miami.elevations[1].s) - 0.662) < 1e-12);
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

test("Monaco keeps generic city masses off the hairpin cliff in day and night builds", () => {
  const env = buildContext();
  const originalCity = env.sandbox.SceneryCity;
  const calls = [];
  env.sandbox.SceneryCity = { ...originalCity, create(ctx) {
    const kit = originalCity.create(ctx);
    const neonTower = kit.neonTower;
    return { ...kit, neonTower(k, side, ...args) {
      calls.push({ frac: k / ctx.n, side });
      return neonTower(k, side, ...args);
    } };
  } };
  const def = env.Tracks.LIST.find((entry) => entry.id === "monaco");
  for (const night of [false, true]) {
    calls.length = 0;
    const from = env.mark();
    const track = env.Tracks.build(def, { night });
    assert.equal(calls.filter(({ frac, side }) =>
      side === -1 && frac >= 0.368 && frac <= 0.430).length, 0,
    "the downhill cliff must not receive a generic city block");
    assert.ok(calls.length > 0, "city dressing remains on the rest of the lap");
    for (const id of ["monaco-fairmont-main", "monaco-mirabeau-apartments"])
      assert.ok(track.modelDiagnostics.emitted.some((entry) => entry.id === id),
        `${id} must remain present`);
    env.trim(from);
    env.release(track);
  }
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
  const acc = TrackModels.scratch(4);
  acc.pos.push(0, 0, 0); acc.nrm.push(0, 1, 0); acc.col.push(1, 1, 1);
  acc.idx.push(0); acc.mat.push(0);
  const sealed = TrackModels.sealGeometry(acc);
  assert.ok(sealed.pos instanceof Float64Array);
  assert.ok(sealed.idx instanceof Uint32Array);
  assert.equal(TrackModels.validateGeometry(sealed).ok, true);
  const bad = TrackModels.validateGeometry({
    pos: [0, NaN, 0], nrm: [0, 1, 0], col: [1, 1, 1], idx: [4],
  });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /non-finite|index/);
});

test("TrackModels staged appends preserve channels and index bases through accumulator growth", () => {
  const Models = loadGlobal(P.TRACK_MODELS, "TrackModels");
  const channels = ["pos", "nrm", "col", "mat", "idx"];
  const outputs = [
    { pos: [], nrm: [], col: [], mat: [], idx: [] },
    Models.scratch(1), Models.scratch(32),
  ];
  // Values that f32 would round; the accumulator must stay f64 until sealing.
  const precise = 1 + 2 ** -40;
  const stages = [
    { pos: [-0, precise, -precise], nrm: [0, 1, 0], col: [precise, 0, -0], mat: [15.125], idx: [0] },
    { pos: [2, 3, 4, 5, 6, 7, 8, 9, 10], nrm: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      col: [0.1, 0.2, 0.3, 2.5, 3.4, 1, 1, 1, 1], mat: [0, 3, 16], idx: [2, 0, 1, 0, 2, 1] },
  ];
  for (const out of outputs) {
    const api = Models.create({ out });
    for (let i = 0; i < stages.length; i++) {
      const data = stages[i];
      assert.equal(api.modelGroup(`stage-${i}`, { center: [0, 0, 0], size: [100, 100, 100] }, (stage) => {
        for (const channel of channels) stage[channel].push(...data[channel]);
      }), true);
    }
    assert.deepEqual(Array.from(out.idx.seal ? out.idx.seal() : out.idx), [0, 3, 1, 2, 1, 3, 2]);
    assert.deepEqual(plain(out.__blocks.map(({ base, count, id }) => ({ base, count, id }))), [
      { base: 0, count: 1, id: "stage-0" }, { base: 1, count: 3, id: "stage-1" },
    ]);
  }
  const plainOut = outputs[0];
  for (const out of outputs.slice(1)) {
    for (const channel of channels) {
      assert.deepEqual(Array.from(out[channel].seal()), plainOut[channel], `${channel} before seal`);
    }
    assert.ok(Object.is(out.pos.seal()[0], -0), "signed zero survives the native copy");
    assert.equal(out.pos.seal()[1], precise, "positions were not narrowed to f32");
    const sealed = Models.sealGeometry(out);
    for (const channel of channels) {
      const expected = channel === "col" ? Array.from(new Float32Array(plainOut.col)) : plainOut[channel];
      assert.deepEqual(Array.from(sealed[channel]), expected, `${channel} after seal`);
    }
    assert.equal(Models.validateGeometry(sealed).ok, true);
  }
});

test("envCull build owns one ribbon representation and retains collision geometry", () => {
  const env = buildContext();
  const def = env.Tracks.LIST.find((entry) => entry.id === "monza");
  const build = (mode, chunkedTrackCoords = true) => {
    const gfx = {
      chunkedTrackCoords,
      createMesh: (geo) => ({ kind: "plain", count: geo.idx.length }),
      createChunkedMesh: (geo) => {
        const result = mode === "chunked"
          ? { kind: "chunked", chunks: [{}], count: geo.idx.length }
          : mode === "small"
            ? { kind: "small", chunks: null, count: geo.idx.length }
            : { kind: "failed", chunks: [], count: 0 };
        // Mirror the production renderer contract: disposable sources go away
        // during chunking, so this test proves the ribbon flag was set in time.
        if (!geo._keepPositions) { geo.pos = null; geo.idx = null; }
        return result;
      },
    };
    return env.Tracks.build(def, { gfx, chunkRibbons: true });
  };
  const assertOne = (track, key) => {
    const plain = track.meshes[key], chunked = track.meshes[key + "Chunked"];
    assert.equal(Number(!!plain) + Number(!!chunked), 1, `${key} must have one GPU representation`);
    assert.ok(track[key + "Geo"].pos && track[key + "Geo"].idx, `${key} collision/probe arrays must survive`);
    assert.equal(track[key + "Geo"]._keepPositions, true, `${key} must arm retention before chunking`);
  };

  const chunked = build("chunked");
  for (const key of ["road", "terrain"]) {
    assertOne(chunked, key);
    assert.equal(chunked.meshes[key], null);
    assert.equal(chunked.meshes[key + "Chunked"].kind, "chunked");
  }
  const small = build("small");
  for (const key of ["road", "terrain"]) {
    assertOne(small, key);
    assert.equal(small.meshes[key].kind, "small", "small chunk results are already plain fallbacks");
    assert.equal(small.meshes[key + "Chunked"], null);
  }
  const failed = build("failed");
  for (const key of ["road", "terrain"]) {
    assertOne(failed, key);
    assert.equal(failed.meshes[key].kind, "plain", "failed chunk uploads rebuild a plain fallback");
    assert.equal(failed.meshes[key + "Chunked"], null);
  }
  const limited = build("chunked", false);
  assertOne(limited, "road");
  assert.equal(limited.meshes.road.kind, "plain", "a backend without chunked track coordinates keeps marked road plain");
  assert.equal(limited.meshes.roadChunked, null);
  assertOne(limited, "terrain");
  assert.equal(limited.meshes.terrain, null);
  assert.equal(limited.meshes.terrainChunked.kind, "chunked");
});

test("a buried thin prop (kerb flash, paint decal) sets no driving limit — no invisible walls at the kerb", () => {
  // place() sinks every box 0.8 m, so one shorter than THIN_PROP_H is at or
  // under the ground; its blockAt used to stop cars 0.4-2 m past the road edge
  // on 12 circuits (albert_park's kerb flashes held the limit at hw + 0.53 m).
  const src = fs.readFileSync(path.join(ROOT, "js/track/scenery/build-props.js"), "utf8");
  assert.match(src, /if \(sz\[1\] >= THIN_PROP_H\) blockAt\(k, side, dist - sz\[0\] \/ 2, sz\[2\] \/ 2\);/);
  const env = buildContext();
  const def = env.Tracks.LIST.find((entry) => entry.id === "albert_park");
  const track = env.Tracks.build(def, { night: false });
  let minOver = Infinity;
  for (let k = 0; k < track.n; k++) minOver = Math.min(minOver, track.barL[k] - track.hw[k], track.barR[k] - track.hw[k]);
  assert.ok(minOver > 1.0, `a driving limit sits ${minOver.toFixed(2)} m past the road edge`);
});
