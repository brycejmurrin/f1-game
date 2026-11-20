// #5764: a DATA tap on a stalled connection says STILL LOADING… at ScriptLoader's
// slow threshold (the onSlow every lazy bundle uses), and a stall is not retried.
// Fake clock: timers and Date.now are the test's, so nothing waits in real time.
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
const hung = data.find((f) => !manifest.LAZY_DATA_EDGES.some(([, after]) => after === f));

function fakeClock() {
  let now = 0, seq = 0;
  const timers = new Map();
  const setT = (fn, ms) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, ms || 0), fn }); return id; };
  const clearT = (id) => { timers.delete(id); };
  const flush = () => new Promise((r) => setImmediate(r));
  async function advance(ms) {
    const target = now + ms;
    for (;;) {
      await flush();
      let next = null;
      for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = target;
    await flush();
  }
  return { setT, clearT, advance, get now() { return now; } };
}

test("a stalled DATA load fires onSlow at the slow threshold and gives up without retrying", async () => {
  const clock = fakeClock();
  const attempts = new Map();
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
      LAZY_RACE: [], SCENERY_DIR: "", LAZY_DATA: data,
      LAZY_DATA_EDGES: manifest.LAZY_DATA_EDGES,
    },
    window: { __APEX_BUILD: "test", setTimeout: clock.setT, clearTimeout: clock.clearT },
    setTimeout: clock.setT, clearTimeout: clock.clearT,
    Date: { now: () => clock.now },
    els: { datahub: {} },
    Log: { warn() {}, error() {} },
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) {
        if (node.rel === "preload") return;
        const file = node.src.split("?")[0];
        attempts.set(file, (attempts.get(file) || 0) + 1);
        // The hung file fires neither load nor error; every other first-wave file stays pending too.
      } },
    },
  });
  vm.runInContext(loader + "\n" + bundles + "\nglobalThis.__ensureDataHub = LazyBundles.create({ els, loadBackendScripts: ScriptLoader.create().load }).ensureDataHub;", ctx, { filename: absSrc("js/core/lazy-bundles.js") });

  let slow = 0, late = 0, result = "pending";
  ctx.__ensureDataHub({ onSlow: () => { slow++; } }).then((ok) => { result = ok; });
  await clock.advance(9000);
  assert.equal(slow, 0, "no notice before the slow threshold");
  await clock.advance(1500);
  assert.equal(slow, 1, "STILL LOADING fires once at the 10 s slow threshold, not once per file");
  ctx.__ensureDataHub({ onSlow: () => { late++; } });
  assert.equal(late, 1, "a second tap during a stall is told at once");
  await clock.advance(60000);
  assert.equal(result, false, "the stalled load resolves false (DATA says COULD NOT LOAD)");
  assert.equal(attempts.get(hung), 1, "a stall is not retried: no second inject of the hung file");
  assert.equal(slow, 1);
});
