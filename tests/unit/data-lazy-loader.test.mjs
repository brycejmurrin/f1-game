import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const game = readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");
const block = game.slice(game.indexOf("const BACKEND_FILES ="), game.indexOf("// LAZY_NET ("));
const data = ["api", "telemetry", "export", "schedule", "standings", "results", "live", "hub"]
  .map((x) => `js/data/${x}.js`);
const names = ["F1API", "DataTelemetry", "DataExport", "DataSchedule", "DataStandings", "DataResults", "DataLive", "DataHub"];

test("a failed data predecessor never evaluates hub; retry reuses evaluated siblings", async () => {
  const attempts = new Map();
  let initialized = 0;
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: [], SCENERY_DIR: "", LAZY_DATA: data,
      LAZY_DATA_EDGES: data.slice(0, -1).map((p) => [p, data.at(-1)]),
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
          if (file === "js/data/schedule.js" && attempts.get(file) === 1) {
            node.onerror(); return;
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
  vm.runInContext(block + ";globalThis.__ensureDataHub=ensureDataHub", ctx);
  assert.equal(await ctx.__ensureDataHub(), false);
  assert.equal(attempts.has("js/data/hub.js"), false, "a failed sibling cannot poison hub's lexical binding");
  assert.equal(await ctx.__ensureDataHub(), true);
  assert.equal(initialized, 1);
  assert.equal(attempts.get("js/data/schedule.js"), 2);
  assert.equal(attempts.get("js/data/hub.js"), 1);
  for (const sibling of data.filter((f) => f !== "js/data/schedule.js" && f !== "js/data/hub.js")) {
    assert.equal(attempts.get(sibling), 1, `${sibling} must not be redeclared on retry`);
  }
});
