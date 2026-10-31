import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

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
function vmFile(ctx, file, code) {
  return vm.runInContext(code, ctx, { filename: absSrc(file) });
}

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
    setTimeout, clearTimeout,
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) {
        if (node.rel === "preload") return;   // ScriptLoader.preload: a fetch hint, not an inject
        const file = node.src.split("?")[0];
        attempts.set(file, (attempts.get(file) || 0) + 1);
        queueMicrotask(() => {
          if (file === failedFile && attempts.get(file) <= 3) {
            node.onerror(); return;
          }
          for (const [before, after] of manifest.LAZY_DATA_EDGES) {
            if (after !== file) continue;
            assert.ok(vmFile(ctx, before, `typeof ${names[data.indexOf(before)]} !== 'undefined'`),
              `${file} must see its evaluated predecessor ${before}`);
          }
          const name = names[data.indexOf(file)];
          if (name === "DataHub") {
            assert.ok(vmFile(ctx, "js/data/schedule.js", "typeof DataSchedule !== 'undefined'"),
              "hub must see a fully evaluated schedule predecessor");
            vmFile(ctx, file, "const DataHub = { init() { globalThis.__initialized(); } };");
          } else vmFile(ctx, file, `const ${name} = {};`);
          node.onload();
        });
      } },
    },
    __initialized: () => { initialized++; },
  });
  vm.runInContext(loader + "\n" + bundles + "\nglobalThis.__ensureDataHub = LazyBundles.create({ els, loadBackendScripts: ScriptLoader.create().load }).ensureDataHub;", ctx, { filename: absSrc("js/core/lazy-bundles.js") });
  assert.equal(await ctx.__ensureDataHub(), false, "three in-call attempts exhaust before DATA opens");
  assert.equal(attempts.has("js/data/hub.js"), false, "a failed sibling cannot poison hub's lexical binding");
  assert.equal(await ctx.__ensureDataHub(), true);
  assert.equal(initialized, 1);
  assert.equal(attempts.get(failedFile), 4, "fourth inject succeeds after automatic retries");
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
      head: { appendChild(node) { if (node.rel === "preload") return; appended++; assert.match(node.src, /\?v=100$/, "the booted build, always"); queueMicrotask(() => node.onload()); } },
    },
  });
  vm.runInContext(loader + "\nglobalThis.__load = ScriptLoader.create().load;", ctx, { filename: absSrc("js/core/script-loader.js") });
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
        if (node.rel === "preload") return;   // ScriptLoader.preload: a fetch hint, not an inject
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
  vm.runInContext(loader + "\n" + bundles + "\nglobalThis.__lb = LazyBundles.create({ els, loadBackendScripts: ScriptLoader.create().load, getContext: () => ({ trackIdx: 0 }), applyLightTuneIfReady: () => globalThis.__applied() });", ctx, { filename: absSrc("js/core/lazy-bundles.js") });
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

// The garage's Blender tables (js/garage/garage-data.js) ride LAZY_RACE but load alone,
// strict: the lighting presets never pull them, a dropped request is asked again, and
// once resident nothing more is fetched (a second <script> would redeclare the const).
test("ensureGarageData: loads garage-data.js alone, retries a dropped request, never twice once resident", async () => {
  const attempts = [], idle = [];
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [], LAZY_RACE: manifest.LAZY_RACE, SCENERY_DIR: "", LAZY_DATA: [] },
    window: { __APEX_BUILD: "test" },
    els: {},
    Log: { warn() {}, info() {} },
    Tracks: { LIST: [{ id: "t0", scenery() {} }], circuitPayloadResident: () => true },
    Assets: { modelsReady: async () => {} },
    requestIdleCallback: (fn, o) => { idle.push({ fn, timeout: o && o.timeout }); },
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) {
        if (node.rel === "preload") return;
        const file = node.src.split("?")[0];
        attempts.push(file);
        const n = attempts.filter((f) => f === file).length;
        queueMicrotask(() => {
          if (file === "js/garage/garage-data.js" && n === 1) { node.onerror(); return; }
          if (file === "js/garage/garage-data.js") vm.runInContext("var GarageData = { RIGS: {}, CLIPS: {} };", ctx);
          else ctx.window.LightPresets = {};
          node.onload();
        });
      } },
    },
  });
  vm.runInContext(loader + "\n" + bundles + "\nglobalThis.__lb = LazyBundles.create({ els, loadBackendScripts: ScriptLoader.create().load, getContext: () => ({ trackIdx: 0 }), applyLightTuneIfReady() {} });", ctx, { filename: absSrc("js/core/lazy-bundles.js") });
  const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  ctx.__lb.raceAssets();
  await flush();
  assert.deepEqual(idle.map((i) => i.timeout), [8000, 9000, 12000, 6000], "an idle prefetch of its own");
  assert.equal(await ctx.__lb.ensureLightPresets(), true);
  assert.deepEqual(attempts, ["js/lighting/presets.js"], "the presets never pull the garage tables");
  assert.equal(await ctx.__lb.ensureGarageData(), false, "the first request is dropped");
  assert.equal(await ctx.__lb.ensureGarageData(), true, "and asked for again");
  assert.equal(await ctx.__lb.ensureGarageData(), true);
  assert.deepEqual(attempts.filter((f) => f === "js/garage/garage-data.js").length, 2, "resident: nothing more to fetch");
});

test("ensureDataHub: one transient script failure retries with cache-bust and then opens", async () => {
  const urls = [];
  let tabUtilsLoads = 0;
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: [], SCENERY_DIR: "", LAZY_DATA: data,
      LAZY_DATA_EDGES: manifest.LAZY_DATA_EDGES,
    },
    window: { __APEX_BUILD: "test" },
    els: { datahub: {} },
    Log: { warn() {} },
    setTimeout, clearTimeout,
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) {
        if (node.rel === "preload") return;
        urls.push(node.src);
        const file = node.src.split("?")[0];
        queueMicrotask(() => {
          if (file === "js/data/tab-utils.js") {
            tabUtilsLoads++;
            if (tabUtilsLoads === 1) { node.onerror(); return; }
          }
          for (const [before, after] of manifest.LAZY_DATA_EDGES) {
            if (after !== file) continue;
            assert.ok(vmFile(ctx, before, `typeof ${names[data.indexOf(before)]} !== 'undefined'`),
              `${file} must see its evaluated predecessor ${before}`);
          }
          const name = names[data.indexOf(file)];
          if (name === "DataHub") vmFile(ctx, file, "const DataHub = { init() {}, open() {} };");
          else vmFile(ctx, file, `const ${name} = {};`);
          node.onload();
        });
      } },
    },
  });
  vm.runInContext(loader + "\n" + bundles + "\nglobalThis.__ensureDataHub = LazyBundles.create({ els, loadBackendScripts: ScriptLoader.create().load }).ensureDataHub;", ctx, { filename: absSrc("js/core/lazy-bundles.js") });
  const t0 = Date.now();
  assert.equal(await ctx.__ensureDataHub(), true);
  assert.ok(Date.now() - t0 >= 350, "waits ~400 ms before the second attempt");
  assert.equal(tabUtilsLoads, 2);
  assert.ok(urls.some((u) => /tab-utils\.js\?.*retry=1/.test(u)), "retry uses a fresh URL key");
  assert.ok(urls.filter((u) => u.includes("tab-utils.js")).every((u, i, all) => i === 0 || /retry=/.test(u)), "first tab-utils URL is uncached");
});

test("ensureDataHub: three failed load rounds log the final warning and stay closed", async () => {
  const logged = [];
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: [], SCENERY_DIR: "", LAZY_DATA: data,
      LAZY_DATA_EDGES: manifest.LAZY_DATA_EDGES,
    },
    window: { __APEX_BUILD: "test" },
    els: { datahub: {} },
    Log: { warn(_ns, m) { logged.push(m); } },
    setTimeout, clearTimeout,
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) {
        if (node.rel === "preload") return;
        const file = node.src.split("?")[0];
        queueMicrotask(() => {
          if (file === "js/data/tab-utils.js") { node.onerror(); return; }
          for (const [before, after] of manifest.LAZY_DATA_EDGES) {
            if (after !== file) continue;
            assert.ok(vmFile(ctx, before, `typeof ${names[data.indexOf(before)]} !== 'undefined'`),
              `${file} must see its evaluated predecessor ${before}`);
          }
          const name = names[data.indexOf(file)];
          if (name === "DataHub") vmFile(ctx, file, "const DataHub = { init() {}, open() {} };");
          else vmFile(ctx, file, `const ${name} = {};`);
          node.onload();
        });
      } },
    },
  });
  vm.runInContext(loader + "\n" + bundles + "\nglobalThis.__ensureDataHub = LazyBundles.create({ els, loadBackendScripts: ScriptLoader.create().load }).ensureDataHub;", ctx, { filename: absSrc("js/core/lazy-bundles.js") });
  assert.equal(await ctx.__ensureDataHub(), false);
  assert.ok(logged.some((m) => /DATA stays closed/.test(m)));
});


for (const destination of ["title", "help", "race", "new-title-visit"]) test(`delayed title DATA preserves its origin across ${destination}`, async () => {
  const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
  const g = await createGame({ track: "monza", carMeshes: false });
  const doc = g.sandbox.document, head = doc.head, append = head.appendChild;
  const evaluate = s => vm.runInContext(s, g.ctx, { filename: "vm-snippet:data-navigation" }), tick = () => new Promise(r => setImmediate(r));
  const held = [];
  try {
    g.G.quitToMenu();
    const hub = readFileSync(new URL("../../js/data/hub.js", import.meta.url), "utf8");
    const selector = vm.runInNewContext(hub.match(/const BLOCKING_SEL = \(([\s\S]*?)\);/)[1], {}, { filename: "vm-snippet:data-hub-blocking-selector" });
    const blockers = selector.split(",").map(s => doc.getElementById(s.slice(1)));
    for (const el of blockers) el.hidden = true;
    const query = doc.querySelectorAll;
    doc.querySelectorAll = function(s) { return s === selector ? blockers : query.call(this, s); };
    doc.getElementById("datahub").hidden = true;
    head.appendChild = function(el) {
      if (el.tagName === "SCRIPT" && /js\/data\//.test(el.src)) { held.push(el); return el; }
      return append.call(this, el);
    };
    doc.getElementById("mb-data").onclick();
    for (let n = 0; n < 10; n++) await tick();
    assert.ok(held.length > 0, "actual lazy data scripts are pending");
    if (destination === "help") doc.getElementById("howtoplay").hidden = false;
    if (destination === "race" || destination === "new-title-visit") await g.G.startRace();
    if (destination === "new-title-visit") g.G.quitToMenu();
    head.appendChild = append;
    for (const el of held) append.call(head, el);
    for (let n = 0; n < 60; n++) await tick();
    assert.equal(evaluate('typeof DataHub !== "undefined" && DataHub.isOpen()'), destination === "title");
    assert.equal(doc.getElementById("datahub").hidden, destination !== "title");
    if (destination === "race") assert.equal(g.G.state, "count");
  } finally { head.appendChild = append; g.close(); }
});
