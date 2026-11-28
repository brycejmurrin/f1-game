/* lazy-bundles-strict-dedupe.test.mjs — #7241: the agent surface / CLAUDE LINK door and the Settings-hot audio
 * serial path load strict (no double inject); bindAgent runs once across a failed-then-retried agent load.
 * Run: node --test tests/unit/lazy-bundles-strict-dedupe.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import vm from "vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const BRIDGE = "js/agent/bridge-link.js";

/** onload policy per file: "ok" lands on a later task, "hold" never fires until released, "fail" errors. */
function boot({ agent = [BRIDGE, "js/agent/apex.js"], audio = [], hot = false, bindAgent, ensureNet, mode = () => "ok" } = {}) {
  const inserts = [];
  const held = [];
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: agent, LAZY_AGENT_EDGES: [], LAZY_EDGES: [],
      LAZY_RACE: [], LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [],
      LAZY_AUDIO: audio, LAZY_AUDIO_EDGES: [],
      SCENERY_DIR: "", LAZY_SCENERY: [], LAZY_DATA: [], LAZY_DATA_EDGES: [],
      LAZY_NET: [], LAZY_NET_EDGES: [], LAZY_SAVES_DATA: [], LAZY_REAL_RACE: [],
    },
    window: { __APEX_BUILD: "test", setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t) },
    navigator: { userAgent: "Mozilla/5.0 Chrome/128", userActivation: { hasBeenActive: false } },
    Log: { warn() {}, info() {}, error() {} },
    els: {},
    scheduler: { yield: () => Promise.resolve() },
    setTimeout, queueMicrotask,
    document: {
      createElement() { return { dataset: {}, remove() {}, src: "" }; },
      head: {
        appendChild(node) {
          const f = node.src.replace(/\?.*$/, "").replace(/^.*?(js\/)/, "$1");
          inserts.push(f);
          if (f === BRIDGE) ctx.BridgeLink = { open: () => true };
          const m = mode(f, inserts.filter((x) => x === f).length);
          if (m === "hold") held.push(() => node.onload());
          else if (m === "fail") queueMicrotask(() => node.onerror && node.onerror(new Error("x")));
          else setTimeout(() => node.onload(), 0);
        },
      },
    },
    __deps: { bindAgent, ensureNet },
    __hot: hot,
  });
  vm.runInContext(`${src("js/core/script-loader.js")}\n${src("js/core/lazy-bundles.js")}
    globalThis.LB = LazyBundles.create({
      els, loadBackendScripts: ScriptLoader.create().load,
      getContext: () => ({ store: { get: () => 0.5 }, soundOn: true, camMode: 0, settingsHot: __hot }),
      applyLightTuneIfReady() {}, bindAgent: __deps.bindAgent || (() => {}),
      createNetwork() { return { wire() {} }; }, onAudioReady() {},
    });`, ctx, { filename: path.join(ROOT, "js/core/lazy-bundles.js") });
  return { ctx, inserts, held };
}

test("openBridgeLink during an in-flight loadAgentSurface injects bridge-link.js once", async () => {
  const { ctx, inserts, held } = boot({ mode: (f) => (f === BRIDGE ? "hold" : "ok") });
  const surface = ctx.LB.loadAgentSurface();
  await new Promise((r) => setTimeout(r, 20));
  const door = ctx.LB.openBridgeLink();
  await new Promise((r) => setTimeout(r, 20));
  held.splice(0).forEach((fn) => fn());
  await Promise.all([surface, door]);
  assert.equal(inserts.filter((f) => f === BRIDGE).length, 1, "bridge-link.js inserted once: " + inserts.join(","));
});

test("a retried agent load runs bindAgent once", async () => {
  let binds = 0, c2;
  // Fail the first pass through the agent file set, succeed on the retry.
  let first = true;
  c2 = boot({
    bindAgent() { binds++; c2.window.__apex = {}; },
    mode: (f) => (f === "js/agent/apex.js" && first ? (first = false, "fail") : "ok"),
  }).ctx;
  await c2.LB.loadAgentSurface();
  await c2.LB.loadAgentSurface();
  assert.equal(binds, 1, "bindAgent ran once across the failed pass and its retry");
});

test("bindAgent that no-ops (ApexApi absent) does not latch: the next ask binds", async () => {
  let binds = 0, c;
  const t = boot({ bindAgent() { binds++; if (binds > 1) c.window.__apex = {}; } });
  c = t.ctx;
  await c.LB.loadAgentSurface();   // pass 1: no __apex built; the bind is retried below
  await c.LB.loadAgentSurface();
  await c.LB.loadAgentSurface();
  assert.equal(binds, 2, "bound on the second pass, then latched");
});

test("serial audio path passes strict (retry never re-injects an evaluated file)", () => {
  const s = src("js/core/lazy-bundles.js");
  const serial = s.slice(s.indexOf("async function loadAudioSerial"), s.indexOf("async function loadBackendScripts"));
  const calls = serial.match(/loadScripts\([^;]*\);/g) || [];
  assert.equal(calls.length, 2, "two loadScripts calls in the serial path");
  // #7415: both share one opts object (one generation scope per run); strictness is pinned by lazy-serial-scope.
  for (const c of calls) assert.ok(/, o\);$/.test(c), c);
});
