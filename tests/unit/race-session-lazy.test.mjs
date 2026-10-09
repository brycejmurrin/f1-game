/* race-session-lazy.test.mjs — LAZY_RACE_SESSION stub + ensureRaceSession. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import vm from "vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const src = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

test("manifest keeps session-stub on FULL and pit-lane in LAZY_RACE_SESSION", () => {
  const m = require("../../tools/manifest.cjs");
  assert.ok(m.FULL.includes("js/race/session-stub.js"));
  assert.ok(!m.FULL.includes("js/race/pit-lane.js"));
  assert.ok(m.LAZY_RACE_SESSION.includes("js/race/pit-lane.js"));
  assert.ok(m.LAZY_RACE_SESSION.includes("js/race/race-radio.js"));
  assert.ok(m.FULL.includes("js/race/driving-coach.js"), "coach stays FULL for UiExperience");
});

test("session stub installs PitLane/Reliability and create() is inert", () => {
  const sb = {
    console,
    Log: { info() {}, warn() {}, debug() {} },
  };
  vm.runInNewContext(src("js/race/session-stub.js"), sb, { filename: "js/race/session-stub.js" });
  assert.equal(sb.PitLane._stub, true);
  assert.ok(sb.Reliability.isLevel("off"));
  assert.equal(sb.Reliability.isLevel("nope"), false);
  const pits = sb.PitLane.create({});
  assert.equal(pits.inLane({}), false);
  assert.equal(pits.laneUniform(), null);
  // RaceSettings.buildRaceSettings / wireRaceSettings (menu, before ensure).
  assert.equal(pits.pinnedStops(), null);
  assert.equal(typeof pits.setPinnedStops, "function");
  assert.equal(pits.lossS(), 0);
  const radio = sb.RaceRadio.create({});
  assert.equal(radio.callsResult(), false);
  assert.equal(radio.chat(), "normal");
  assert.equal(radio.comm(), "tv");
  assert.equal(sb.Damage.blank().hits, 0);
});

test("RaceSettings paintPlan surface does not throw on the PitLane stub", () => {
  // Mirrors js/race/race-settings.js paintPlan + rs-plan wire reads.
  const sb = { console, Log: { info() {}, warn() {}, debug() {} } };
  vm.runInNewContext(src("js/race/session-stub.js"), sb, { filename: "js/race/session-stub.js" });
  const pits = sb.PitLane.create({});
  assert.doesNotThrow(() => {
    const pin = pits.pinnedStops();
    pits.setPinnedStops(pin == null ? null : 1);
    const plan = pits.zoneOf() ? pits.planFor(0.5, true, 10) : null;
    void plan;
    void pits.lossS();
  });
});

test("ensureRaceSession reinjects real PitLane and calls onRaceSessionReady", async () => {
  const loader = src("js/core/script-loader.js");
  const bundles = src("js/core/lazy-bundles.js");
  const loaded = [];
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: [], LAZY_RACE_SESSION: ["js/race/pit-lane.js"], LAZY_RACE_SESSION_EDGES: [],
      LAZY_AUDIO: [], LAZY_AUDIO_EDGES: [],
      SCENERY_DIR: "", LAZY_SCENERY: [], LAZY_DATA: [], LAZY_DATA_EDGES: [],
      LAZY_NET: [], LAZY_NET_EDGES: [],
    },
    window: { __APEX_BUILD: "test" },
    PitLane: { _stub: true, create: () => ({ _stub: true }) },
    Tracks: { LIST: [], circuitPayloadResident: () => true, hydrate: () => true },
    Log: { warn() {}, info() {} },
    els: {},
    __ready: 0,
    queueMicrotask: (fn) => queueMicrotask(fn),
    requestIdleCallback() { return 1; },
    setTimeout() {},
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) {
        loaded.push(node.src);
        // Simulate reinjection: drop stub flag.
        ctx.PitLane = { _stub: false, create: () => ({ real: true }) };
        queueMicrotask(() => node.onload());
      } },
    },
  });
  vm.runInContext(loader + "\n" + bundles + `
    const lb = LazyBundles.create({
      els, loadBackendScripts: ScriptLoader.create().load,
      getContext: () => ({}),
      applyLightTuneIfReady() {},
      bindAgent() {}, createNetwork() { return { wire() {} }; },
      onAudioReady() {},
      onRaceSessionReady() { __ready++; },
    });
    globalThis.__ensure = lb.ensureRaceSession;
  `, ctx);
  const ok = await ctx.__ensure();
  assert.equal(ok, true);
  assert.equal(ctx.__ready, 1);
  assert.equal(ctx.PitLane._stub, false);
  assert.ok(loaded.some((u) => String(u).includes("pit-lane.js")));
});
