import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

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
  vm.runInContext(source, ctx, { filename: file });
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
  // because it still pins WHICH space the field is read in.
  assert.equal(miami.startFrac, 0);
  assert.ok(Math.abs(TrackSpace.toRacingFrac(miami, miami.elevations[0].s) - 0.8925) < 1e-12);
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

test("game keeps the sole prebuilt ribbon usable across envCull and tier changes", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(source, /chunkRibbons:\s*PerfGov\.tier\(\) < 3/);
  assert.match(source, /track\.meshes\.terrain \|\| track\.meshes\.terrainChunked/);
  assert.match(source, /track\.meshes\.road \|\| track\.meshes\.roadChunked/);
  assert.match(source, /_wantRoadChunk = gfx\.chunkedTrackCoords !== false/);
  assert.match(source, /if \(allow && geo && gfx\.createChunkedMesh\)/);
  assert.match(source, /"roadChunked", track\.meshes\.road, gfx\.chunkedTrackCoords !== false/);
  const tlx = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");
  assert.match(tlx, /chunkedTrackCoords:\s*false/);
});

test("per-chunk lamps: every half shares ONE gate, and it is autoShed", () => {
  // A feature the player can switch on must not be held off by three different
  // answers. Before this was pinned:
  //   js/lighting/knobs.js  help text : "Available at every GRAPHICS preset"
  //   js/lighting/tuner-panel.js     why-off   : PerfGov.autoTier()  (governor only)
  //   js/game.js           the gate  : PerfGov.tier()      (preset TOO)
  // and the third one wins, so PER-CHUNK ROAD did nothing on GRAPHICS: LOW
  // while the tuner reported no problem.
  //
  // It was also DEAD CODE, which is why it went unnoticed:
  //   (A && tier() < 1) || (tier() < 3)  ===  tier() < 3
  // tier() < 1 implies tier() < 3, so the lamp clause could never change the
  // outcome.
  //
  // THEN autoTier() LEAKED THE PRESET BACK IN BY ANOTHER ROUTE, which is what
  // this test is now pinning. autoTier() reads _perfTier, and the degrade
  // branch writes `_perfTier = max(_perfTier, _floorTier()) + 1` — _floorTier()
  // folds in the GRAPHICS preset — while the restore branch walks back down
  // only as far as _floorTier(). On MEDIUM (_userTier 2, every phone's default)
  // the governor's FIRST shed pinned autoTier() at >= 2 for the whole session,
  // so these lamps went off and never came back however completely the device
  // recovered — reported as "chunk lights isn't working even with the slider",
  // against a tuner note promising it "returns on its own when frames recover".
  // autoShed() is the governor's measured shed alone (js/perf/governor.js), and
  // autoTier() deliberately stays behind for the tier-4 post consumers, which
  // must still be able to reach 4 on a low preset.
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

  const road = src.match(/const _wantRoadChunk = [^;]+;/);
  assert.ok(road, "_wantRoadChunk still exists");
  assert.match(road[0], /!_perChunkOff && PerfGov\.autoShed\(\) < 1/,
    "the road lamp clause must gate on autoShed() — tier() makes it dead code, " +
    "and autoTier() pins it off for the session after one shed on any preset " +
    "below GRAPHICS: HIGH");

  // NOT the first `frame.perChunkLights = ...` — line ~6783 resets it to 0 with
  // the rest of the frame fields, and matching that read as a missing gate.
  const scenery = src.match(/frame\.perChunkLights = \(![^;]*hasPerChunkLights[^;]+;/);
  assert.ok(scenery, "the GATED frame.perChunkLights assignment still exists");
  assert.match(scenery[0], /PerfGov\.autoShed\(\) >= 1/,
    "the scenery half must stay on the same accessor as the road half so the " +
    "two cannot disagree");

  // And the knob's own explanation has to describe the gate that actually runs.
  const tuner = fs.readFileSync(path.join(ROOT, "js/lighting/tuner-panel.js"), "utf8");
  assert.match(tuner, /PerfGov\.autoShed\s*\)\s*\?\s*PerfGov\.autoShed\(\)/,
    "tuner.js's held-off note must read the same accessor as the gate");
  const apex = fs.readFileSync(path.join(ROOT, "js/agent/apex.js"), "utf8");
  assert.match(apex, /PerfGov\.autoShed\(\) >= 1\) return "tier"/,
    "__apex.perChunkHeld() must name the same gate the render path runs");

  // The tier-4 post stack keeps autoTier(): the degrade branch stops at an
  // EFFECTIVE tier of 4, so a shed COUNT saturates at 4 - _userTier and would
  // make bloom / SSAO / god rays unsheddable on exactly the low presets that
  // need them shed. Both accessors exist for that reason; neither replaces the
  // other.
  assert.match(src, /po\.ssao = PerfGov\.autoTier\(\) >= 4/,
    "the look post stack must stay on autoTier(), which can still reach 4");
});

test("the display-reset latch clears from EITHER chunk slider, as the tuner promises", () => {
  // js/lighting/tuner-panel.js gateNote() shows "held after a display reset — set to 0
  // and back on to retry" for BOTH chunk knobs (its isChunk covers
  // roadChunkLamps). The clear in js/game.js was keyed on perChunkLights only,
  // so a player who read that note on PER-CHUNK ROAD and did exactly what it
  // said cleared nothing: the instruction silently only worked on the other
  // control. Whatever the note offers, the edit path has to honour.
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  // Not [^)]* — the condition contains !(+LT[id] > 0), so a no-paren class
  // stops at the first inner ")". Bounded any-char instead.
  const clear = game.match(/if \([\s\S]{0,220}?perChunkLights[\s\S]{0,220}?_perChunkOff\) \{/);
  assert.ok(clear, "the _perChunkOff rising-edge clear still exists");
  assert.match(clear[0], /roadChunkLamps/,
    "the latch clear must accept a rising edge on roadChunkLamps too — the " +
    "tuner tells the player that slider can retry it");

  const tuner = fs.readFileSync(path.join(ROOT, "js/lighting/tuner-panel.js"), "utf8");
  const isChunk = tuner.match(/const isChunk = [^;]+;/);
  assert.ok(isChunk, "tuner.js still classifies the chunk knobs");
  // If the note ever stops covering roadChunkLamps this test is the reminder to
  // narrow the clear again rather than leave the two out of step.
  assert.match(isChunk[0], /roadChunkLamps/,
    "if the note no longer offers the retry on PER-CHUNK ROAD, narrow the clear to match");
});
