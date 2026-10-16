import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const loader = readFileSync(new URL("../../js/core/script-loader.js", import.meta.url), "utf8");
const bundles = readFileSync(new URL("../../js/core/lazy-bundles.js", import.meta.url), "utf8");
const manifest = createRequire(import.meta.url)("../../tools/manifest.cjs");
const data = manifest.LAZY_DATA;
const names = data.map((file) => {
  const source = readFileSync(new URL("../../" + file, import.meta.url), "utf8");
  const name = source.match(/^const\s+(\w+)\s*=/m)?.[1];
  assert.ok(name, `${file} must have a declared global for the retry fixture`);
  return name;
});

for (const failedFile of ["js/data/schedule.js", "js/data/api-transport.js", "js/data/telemetry-player.js"]) {
test(`a failed ${failedFile} never evaluates hub; retry reuses evaluated siblings`, async () => {
  const attempts = new Map();
  let initialized = 0;
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: [], SCENERY_DIR: "", LAZY_DATA: data,
      LAZY_DATA_EDGES: manifest.LAZY_DATA_EDGES,
    },
    window: { __APEX_BUILD: "test" },
    els: { datahub: {} },
    Log: { warn() {} },
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) {
        const file = node.src.split("?")[0];
        attempts.set(file, (attempts.get(file) || 0) + 1);
        queueMicrotask(() => {
          if (file === failedFile && attempts.get(file) === 1) {
            node.onerror(); return;
          }
          for (const [before, after] of manifest.LAZY_DATA_EDGES) {
            if (after !== file) continue;
            assert.ok(vm.runInContext(`typeof ${names[data.indexOf(before)]} !== 'undefined'`, ctx),
              `${file} must see its evaluated predecessor ${before}`);
          }
          const name = names[data.indexOf(file)];
          if (name === "DataHub") {
            assert.ok(vm.runInContext("typeof DataSchedule !== 'undefined'", ctx),
              "hub must see a fully evaluated schedule predecessor");
            vm.runInContext("const DataHub = { init() { globalThis.__initialized(); } };", ctx);
          } else vm.runInContext(`const ${name} = {};`, ctx);
          node.onload();
        });
      } },
    },
    __initialized: () => { initialized++; },
  });
  vm.runInContext(loader + "\n" + bundles + "\nglobalThis.__ensureDataHub = LazyBundles.create({ els, loadBackendScripts: ScriptLoader.create().load }).ensureDataHub;", ctx);
  assert.equal(await ctx.__ensureDataHub(), false);
  assert.equal(attempts.has("js/data/hub.js"), false, "a failed sibling cannot poison hub's lexical binding");
  assert.equal(await ctx.__ensureDataHub(), true);
  assert.equal(initialized, 1);
  assert.equal(attempts.get(failedFile), 2);
  assert.equal(attempts.get("js/data/hub.js"), 1);
  for (const sibling of data.filter((f) => f !== failedFile && f !== "js/data/hub.js")) {
    assert.equal(attempts.get(sibling), 1, `${sibling} must not be redeclared on retry`);
  }
});
}

// L8-d: NEVER MIX BUILDS. A lazy file is requested as ?v=<booted build>; once a
// newer deploy's worker controls the tab it has swept that generation, and
// Pages (query-blind) would answer with the NEW file for the OLD code. The
// loader refuses (a missing global is every caller's fallback) and UpdateCheck
// shows UPDATE READY instead.
test("the script loader injects nothing while UpdateCheck reports a newer active build", async () => {
  let appended = 0, blocked = true;
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] },
    window: { __APEX_BUILD: 100 },
    Log: { warn() {} },
    UpdateCheck: { blocksLazyLoad: () => blocked },
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) { appended++; assert.match(node.src, /\?v=100$/, "the booted build, always"); queueMicrotask(() => node.onload()); } },
    },
  });
  vm.runInContext(loader + "\nglobalThis.__load = ScriptLoader.create().load;", ctx);
  assert.equal(await ctx.__load(["js/net/lobby.js"], []), false, "refused, resolved — never hung");
  assert.equal(appended, 0, "no <script> for the old build's URL");
  blocked = false;
  assert.equal(await ctx.__load(["js/net/lobby.js"], []), true);
  assert.equal(appended, 1);
});

// 14-F2: the LAZY_RACE lighting presets were fetched ONCE at idle and the answer
// ignored, so one dropped request meant default lighting for every race of the
// session. A failure is now forgotten: the next race start (ensureCircuit, which
// startRace reaches through ensureScenery) asks again; before any failure the
// race start fetches nothing extra, so the title path is unchanged.
test("a failed lighting-presets fetch is retried at the next race start, then not again", async () => {
  const attempts = [];
  let applied = 0;
  const idle = [];
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [], LAZY_RACE: ["js/lighting/presets.js"], SCENERY_DIR: "", LAZY_DATA: [] },
    window: { __APEX_BUILD: "test" },
    els: {},
    Log: { warn() {}, info() {} },
    Tracks: { LIST: [{ id: "t0", scenery() {} }], circuitPayloadResident: () => true },
    Assets: { modelsReady: async () => {} },
    requestIdleCallback: (fn) => { idle.push(fn); },
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) {
        attempts.push(node.src.split("?")[0]);
        const n = attempts.length;
        queueMicrotask(() => {
          if (n === 1) { node.onerror(); return; }   // the first request is dropped
          ctx.window.LightPresets = {};
          node.onload();
        });
      } },
    },
  });
  vm.runInContext(loader + "\n" + bundles + "\nglobalThis.__lb = LazyBundles.create({ els, loadBackendScripts: ScriptLoader.create().load, getContext: () => ({ trackIdx: 0 }), applyLightTuneIfReady: () => globalThis.__applied() });", ctx);
  ctx.__applied = () => { applied++; };
  const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  ctx.__lb.raceAssets();
  await flush();
  await ctx.__lb.ensureCircuit(0);
  await flush();
  assert.equal(attempts.length, 0, "no failure yet: a race start must not pull the presets onto the title path");
  idle[0]();                                   // the 2.5 s idle prefetch: dropped
  await flush();
  assert.deepEqual(attempts, ["js/lighting/presets.js"]);
  assert.equal(ctx.window.LightPresets, undefined);
  assert.equal(applied, 0);
  await ctx.__lb.ensureCircuit(0);             // the next race start
  await flush();
  assert.equal(attempts.length, 2, "the failed fetch is asked for again");
  assert.ok(ctx.window.LightPresets, "presets resident");
  assert.equal(applied, 1, "lighting re-walked once the presets landed");
  await ctx.__lb.ensureCircuit(0);
  await flush();
  assert.equal(attempts.length, 2, "resident: nothing more to fetch");
});
