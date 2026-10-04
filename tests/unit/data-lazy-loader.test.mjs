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
