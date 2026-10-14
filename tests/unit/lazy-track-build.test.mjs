/* lazy-track-build.test.mjs — LAZY_TRACK_BUILD is not eager; ensureScenery loads it before build. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { symbolSource } from "../helpers/game-source.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const M = require(join(ROOT, "tools/manifest.cjs"));
const src = (f) => readFileSync(join(ROOT, f), "utf8");

const TRACK_BUILD = [
  "js/track/scenery/models.js",
  "js/track/scenery/themes.js",
  "js/track/scenery/landmark-kit.js",
  "js/track/scenery/circuit-kit.js",
  "js/track/core/hidden-faces.js",
  "js/track/scenery/nature.js",
  "js/track/scenery/structures.js",
  "js/track/scenery/city.js",
  "js/track/scenery/identity.js",
  "js/track/scenery/pits.js",
  "js/track/scenery/venue.js",
  "js/track/scenery/build-props.js",
];

test("manifest pins LAZY_TRACK_BUILD off FULL and on TRACK_VM", () => {
  assert.deepEqual(M.LAZY_TRACK_BUILD, TRACK_BUILD);
  for (const f of TRACK_BUILD) {
    assert.ok(!M.FULL.includes(f), `${f} must not be eager`);
    assert.ok(M.TRACK_VM.includes(f), `${f} must remain in TRACK_VM`);
  }
  assert.ok(Array.isArray(M.LAZY_TRACK_BUILD_EDGES));
  assert.ok(M.LAZY_TRACK_BUILD_EDGES.length >= 1);
});

test("ensureScenery awaits ensureTrackBuild before returning", () => {
  const body = src("js/core/lazy-bundles.js");
  assert.match(body, /function ensureTrackBuild\(/);
  const ensure = body.slice(body.indexOf("async function ensureScenery"), body.indexOf("// LAZY_DATA"));
  assert.match(ensure, /ensureTrackBuild\(/);
  assert.match(ensure, /await buildP/);
});

test("loadTrackStepped and lazyTrackEnsure gate on the track-build toolkit", () => {
  // game.js via symbolSource — source-pin-hygiene forbids raw reads under tests/.
  assert.match(symbolSource("async function loadTrackStepped(idx, live)"), /ensureTrackBuild\(/);
  const apex = src("js/agent/apex.js");
  const lazy = apex.slice(apex.indexOf("function lazyTrackEnsure"), apex.indexOf("return o;\n}\n\n// Clear the starting-lights"));
  assert.match(lazy, /TrackBuildProps/);
  assert.match(lazy, /toolkitReady/);
});

test("ensureTrackBuild injects LAZY_TRACK_BUILD and marks TrackBuildProps resident", async () => {
  const loader = src("js/core/script-loader.js");
  const bundles = src("js/core/lazy-bundles.js");
  const loaded = [];
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: [], LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [],
      LAZY_TRACK_BUILD: ["js/track/scenery/build-props.js"], LAZY_TRACK_BUILD_EDGES: [],
      LAZY_AUDIO: [], LAZY_AUDIO_EDGES: [],
      // Empty scenery roster — this file must not name CIRCUITS_DIR (load-order guard).
      SCENERY_DIR: "", LAZY_SCENERY: [], LAZY_DATA: [], LAZY_DATA_EDGES: [],
      LAZY_NET: [], LAZY_NET_EDGES: [],
    },
    window: { __APEX_BUILD: "test" },
    TrackBuildProps: undefined,
    TrackModels: undefined,
    TrackHiddenFaces: undefined,
    Tracks: {
      LIST: [{ id: "monza", custom: true, scenery: () => {} }],
      circuitPayloadResident: () => true,
      hydrate: () => true,
    },
    TrackScenery: { monza: () => {} },
    Assets: { modelsReady: () => Promise.resolve() },
    Log: { warn() {}, info() {} },
    els: {},
    queueMicrotask: (fn) => queueMicrotask(fn),
    requestIdleCallback() { return 1; },
    setTimeout() {},
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) {
        loaded.push(node.src);
        ctx.TrackBuildProps = { build() {} };
        ctx.TrackModels = { create() {} };
        ctx.TrackHiddenFaces = { strip() {} };
        queueMicrotask(() => node.onload());
      } },
    },
  });
  vm.runInContext(loader + "\n" + bundles + `
    const lb = LazyBundles.create({
      els, loadBackendScripts: ScriptLoader.create().load,
      getContext: () => ({ trackIdx: 0 }),
      applyLightTuneIfReady() {},
      bindAgent() {}, createNetwork() { return { wire() {} }; },
      onAudioReady() {},
    });
    globalThis.__ensureBuild = lb.ensureTrackBuild;
    globalThis.__resident = lb.trackBuildResident;
    globalThis.__ensureScenery = lb.ensureScenery;
  `, ctx);
  assert.equal(ctx.__resident(), false);
  assert.equal(await ctx.__ensureBuild(), true);
  assert.equal(ctx.__resident(), true);
  assert.ok(loaded.some((u) => String(u).includes("build-props.js")));
  assert.equal(await ctx.__ensureScenery(0), true);
});
