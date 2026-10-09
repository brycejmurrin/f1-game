/* lazy-bundles.test.mjs — LazyBundles / ScriptLoader failure paths (bug-hunt batch 2).
   A vm harness with a scripted loader: `script(file, attempt)` decides, per
   injected <script>, whether it loads ("ok") or errors ("error"), and may
   define the globals the real file would. The happy paths are pinned by
   data-lazy-loader / race-session-lazy / lazy-audio-yield; this file is the
   FAILURE side: swallowed rejections, partial bundles, retries, hooks that throw. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const loader = read("js/core/script-loader.js");
const bundles = read("js/core/lazy-bundles.js");

export function boot(o = {}) {
  const attempts = new Map(), warns = [], errors = [], timers = [];
  const hooks = { audio: 0, race: 0, wire: 0, ...(o.hooks || {}) };
  const ctx = vm.createContext({
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [], LAZY_RACE: [], SCENERY_DIR: "js/circuits/scenery",
      LAZY_DATA: [], LAZY_DATA_EDGES: [], LAZY_NET: [], LAZY_NET_EDGES: [], LAZY_AUDIO: [], LAZY_AUDIO_EDGES: [],
      LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [], ...(o.roster || {}),
    },
    window: { __APEX_BUILD: "t" },
    els: {},
    navigator: { userAgent: "apex-game-vm" },
    Log: { warn: (_a, m) => warns.push(String(m)), info() {}, debug() {}, error: (_a, m) => errors.push(String(m)) },
    queueMicrotask: (fn) => queueMicrotask(fn),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    __hooks: hooks,
    ...(o.globals || {}),
    document: {
      createElement() { return { dataset: {}, remove() {} }; },
      head: { appendChild(node) {
        const file = node.src.split("?")[0];
        const n = (attempts.get(file) || 0) + 1;
        attempts.set(file, n);
        queueMicrotask(() => {
          const r = o.script ? o.script(file, n, ctx, node) : "ok";
          if (r === "hang") return;
          if (r === "error") node.onerror(); else node.onload();
        });
      } },
    },
  });
  vm.runInContext(loader + "\n" + bundles + `
    globalThis.__lb = LazyBundles.create({
      els, loadBackendScripts: ScriptLoader.create().load,
      getContext: () => ({ trackIdx: 0, soundOn: false }),
      applyLightTuneIfReady() {}, bindAgent() {},
      createNetwork() { if (__hooks.createNetwork) return __hooks.createNetwork(); return { wire() { __hooks.wire++; } }; },
      onAudioReady() { __hooks.audio++; if (__hooks.onAudioReady) __hooks.onAudioReady(); },
      onRaceSessionReady() { __hooks.race++; if (__hooks.onRaceSessionReady) __hooks.onRaceSessionReady(); },
    });`, ctx);
  return { ctx, lb: ctx.__lb, attempts, warns, errors, timers, hooks };
}

/** Run `fn` while counting unhandled rejections (the crash overlay's trigger). */
export async function withRejections(fn) {
  const seen = [];
  const onRej = (e) => seen.push(String(e && e.message || e));
  process.on("unhandledRejection", onRej);
  try { await fn(); await new Promise((r) => setTimeout(r, 25)); } finally { process.off("unhandledRejection", onRej); }
  return seen;
}

const LIST_A = () => ({ LIST: [{ id: "a" }], circuitPayloadResident: () => false, hydrate: () => true });

// 2.3 — the idle scenery prefetch at boot has no caller to catch the rejection
// ensureCircuit throws by design; index.html turns it into the crash overlay.
test("raceAssets: a failing saved-circuit payload warns instead of rejecting unhandled", async () => {
  const h = boot({ globals: { Tracks: LIST_A() }, script: (file) => (/circuits\/a\.js$/.test(file) ? "error" : "ok") });
  const seen = await withRejections(async () => {
    h.lb.raceAssets();
    for (const t of h.timers.splice(0)) t.fn();   // the idle callbacks (lighting presets, race session, audio prefetch)
  });
  assert.deepEqual(seen, [], "no unhandled rejection reaches the overlay");
  assert.ok(h.warns.some((m) => /prefetch/i.test(m)), "the idle failure is logged: " + JSON.stringify(h.warns));
});
