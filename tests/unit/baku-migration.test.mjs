import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = createRequire(import.meta.url)("../../tools/manifest.cjs");

function loadBaku() {
  const makeMesh = (geo) => ({
    verts: geo?.pos ? geo.pos.length / 3 : 0,
    idxCount: geo?.idx ? geo.idx.length : 0,
  });
  const sandbox = {
    Math, Array, Float32Array, Float64Array, Uint16Array, Uint32Array, Object, JSON, Map, Set,
    isNaN, isFinite, parseInt, parseFloat,
    GLX: { createMesh: makeMesh, createChunkedMesh: makeMesh },
    console: {
      log() {}, warn() {}, error() {}, info() {}, debug() {}, trace() {},
      assert() {}, group() {}, groupEnd() {}, table() {}, dir() {}, count() {},
      time() {}, timeEnd() {},
    },
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const run = (file) => {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^const\b/gm, "var");
    vm.runInContext(source, context, { filename: file });
  };
  // TRACK_VM from tools/manifest.cjs, with "@circuits" narrowed to Baku only.
  for (const entry of MANIFEST.TRACK_VM) {
    // "@circuits" narrowed to Baku — and its split-out scenery closure, without
    // which the circuit builds bare and every landmark assertion below fails.
    if (entry === "@circuits") { run(MANIFEST.circuitPath("baku")); run(MANIFEST.sceneryPath("baku")); }
    else run(entry);
  }
  return {
    raw: context.TrackDefs.find((definition) => definition.id === "baku"),
    def: context.Tracks.LIST.find((definition) => definition.id === "baku"),
    Tracks: context.Tracks,
  };
}

test("Baku owns its coordinate space and protected scenery sectors", () => {
  const { raw, def } = loadBaku();
  assert.equal(def.sceneryCoordinates, "racing");
  assert.deepEqual(
    Array.from(def.dressingExclusions, (rule) => ({
      kinds: Array.from(rule.kinds || [rule.kind]),
      s0: rule.s0,
      s1: rule.s1,
      side: rule.side,
    })),
    [
      // Curated zones only (eb0b6b3 narrowed the old full-lap city exclusion):
      // Old City / castle section, then the open Caspian side of Neftchilar Ave.
      { kinds: ["city", "foliage", "lighting"], s0: 0.36, s1: 0.56, side: undefined },
      { kinds: ["city", "foliage", "lighting"], s0: 0.58, s1: 0.97, side: -1 },
    ],
  );
  assert.deepEqual(
    Array.from(raw.elevations, ({ s, halfM, rise }) => ({ s, halfM, rise })),
    [{ s: 0.46, halfM: 500, rise: 14 }],
  );
});

test("Baku builds finite grounded landmarks, water, and full street boundaries", () => {
  const { def, Tracks } = loadBaku();
  for (const night of [false, true]) {
    const track = Tracks.build(def, { night });
    assert.ok(track.geometryDiagnostics.every((entry) => entry.ok));

    const requiredFailures = [
      ...track.modelDiagnostics.suppressed,
      ...track.modelDiagnostics.invalid,
      ...track.modelDiagnostics.unsafe,
    ].filter((entry) => entry.required);
    assert.deepEqual(requiredFailures, []);

    const emitted = new Set(track.modelDiagnostics.emitted.map((entry) => entry.id));
    assert.ok(emitted.has("baku-flame-towers"));
    assert.ok(emitted.has("baku-maiden-tower"));
    assert.ok(emitted.has("baku-maiden-forecourt"));
    assert.ok([...emitted].some((id) => id.startsWith("baku-caspian-")));

    const tightFraction = (barriers) => {
      let tight = 0;
      for (let i = 0; i < track.n; i++)
        if (barriers[i] <= track.hw[i] + 5.5) tight++;
      return tight / track.n;
    };
    assert.ok(tightFraction(track.barL) > 0.97);
    assert.ok(tightFraction(track.barR) > 0.97);

    let crest = -Infinity, crestFrac = 0;
    for (let i = 0; i < track.n; i++) {
      if (track.py[i] > crest) {
        crest = track.py[i];
        crestFrac = i / track.n;
      }
    }
    assert.ok(crest >= 13.5);
    assert.ok(crestFrac >= 0.44 && crestFrac <= 0.48);

    // The seafront must stay FLAT — the 14 m castle rise at s=0.46 must not
    // bleed into it. It cannot be asserted as "range < 0.05", though: every
    // circuit carries a deterministic micro-undulation unless it sets
    // `undulate: false` (js/track/tracks.js), three long swells of combined
    // amplitude amp = min(0.42, 0.14 + relief * 0.0028). No circuit opts out, so
    // a "flat" run is flat to ±amp, not to zero — Baku's relief gives amp ≈ 0.18
    // and a peak-to-peak of ≈ 0.36. The old bound was written against a
    // pre-undulation world and could never pass.
    //
    // So assert the two things that actually distinguish undulation from a
    // leaking ramp:
    //   1. no NET TREND across the run — the undulation is zero-mean over a
    //      span this long, a ramp is not. This is the real check.
    //   2. the range stays inside the undulation's own envelope, derived from
    //      the formula rather than hardcoded. `relief` here is measured AFTER
    //      undulation, so the bound is marginally generous — still far tighter
    //      than any real elevation feature.
    const seafront = [];
    for (let i = Math.ceil(track.n * 0.58); i < Math.floor(track.n * 0.99); i++)
      seafront.push(track.py[i]);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const third = Math.floor(seafront.length / 3);
    const trend = Math.abs(mean(seafront.slice(0, third)) - mean(seafront.slice(-third)));
    assert.ok(trend < 0.05, `seafront trends ${trend.toFixed(3)} m across its length`);

    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < track.n; i++) {
      if (track.py[i] < lo) lo = track.py[i];
      if (track.py[i] > hi) hi = track.py[i];
    }
    const envelope = 2 * Math.min(0.42, 0.14 + (hi - lo) * 0.0028);
    const range = Math.max(...seafront) - Math.min(...seafront);
    assert.ok(range <= envelope,
      `seafront range ${range.toFixed(3)} m exceeds the undulation envelope ${envelope.toFixed(3)} m`);
  }
});
