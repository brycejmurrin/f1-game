/* renderer-boot-island-preload.test.mjs — the ~735 KB three.js vendor island
 * must not modulepreload at high priority before start() knows the pick
 * (#3515 / PERF-KNOWN-WINS item 12). Eval-time guess may still prefetch the
 * TLX roster; the island waits until start() commits to THREE.
 *
 * Run: node --test tests/unit/renderer-boot-island-preload.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { absSrc } from "../helpers/abs-src.mjs";

const bootSrc = readFileSync(new URL("../../js/render/renderer-boot.js", import.meta.url), "utf8");
const settle = () => new Promise((r) => setImmediate(r));

const ISLAND = [
  "vendor/three-0.187.0/three.webgpu.min.js",
  "vendor/three-0.187.0/three.core.min.js",
  "vendor/three-0.187.0/three.tsl.min.js",
];

function evalBoot(opts = {}) {
  const {
    local = { "apex26.gfxBackend": "three" },
    session = {},
    gpu = false,
  } = opts;
  const links = [];
  const rosterPreloads = [];
  const timers = [];
  const store = (m) => ({
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  });
  const localMap = { ...local };
  const sessionMap = { ...session };
  const ctx = vm.createContext({
    localStorage: store(localMap),
    sessionStorage: store(sessionMap),
    navigator: gpu ? { gpu: { requestAdapter: async () => ({}) } } : {},
    ApexRoster: { DEFERRED: { three: ["tlx.js"], webgpu: ["wgx.js"], webgl2: ["glx.js"] } },
    ScriptLoader: {
      preload: (files, o) => {
        rosterPreloads.push({ files: [...files], opts: o || null });
        return files.length;
      },
    },
    document: {
      querySelector: () => null,
      createElement: () => ({}),
      head: { appendChild: (el) => links.push(el) },
    },
    // Sync idle path: no requestIdleCallback, setTimeout(kick, 0) runs kick later via fire(0).
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
    console, Promise,
  });
  ctx.window = ctx;
  vm.runInContext(bootSrc + "\nthis.RendererBoot = RendererBoot;", ctx, {
    filename: absSrc("js/render/renderer-boot.js"),
  });
  const fire = (ms) => {
    for (const t of timers) if (t.live && t.ms === ms) { t.live = false; t.fn(); }
  };
  const islandLinks = () => links
    .filter((l) => l.rel === "modulepreload")
    .map((l) => ({ href: l.href, fetchPriority: l.fetchPriority }));
  return { ctx, links, rosterPreloads, islandLinks, fire, timers, localMap };
}

function startHarness(evalOpts = {}) {
  const h = evalBoot(evalOpts);
  const calls = [];
  const warns = [];
  // Re-bind start deps into the same VM that already ran eval-time preloadLikelyBackend.
  Object.assign(h.ctx, {
    ApexXR: { bootPick: () => null, detect: async () => {} },
    location: { reload() { throw new Error("no reload expected"); } },
    Event: class { constructor(type) { this.type = type; } },
    GLX: { init: () => { calls.push("GLX.init"); return true; } },
    RendererPicker: { showUnavailable() { calls.push("unavailable"); } },
    Gfx: { create: async () => ({ api: "three" }) },
    Log: { warn: (_ns, ...m) => warns.push(m.join(" ")), info() {} },
    dispatchEvent: () => true,
  });
  const rb = h.ctx.RendererBoot.create({
    $: () => null, els: {}, canvas: { getContext: () => ({}) }, ensureDataHub() {},
    loadBackendScripts: async (files) => { calls.push(...files); },
  });
  return { ...h, rb, calls, warns };
}

test("eval-time sure THREE guess does not high-priority modulepreload the vendor island (#3515)", () => {
  const cases = [
    [{ local: { "apex26.gfxBackend": "three" } }, "explicit THREE pick"],
    [{ local: { "apex26.gfxBootBound": "three" }, gpu: true }, "last boot bound TLX"],
    [{ gpu: true }, "unset navigator.gpu hunch (also skips TLX roster)"],
    [{}, "unset GLX default"],
  ];
  for (const [opts, why] of cases) {
    const h = evalBoot(opts);
    // Flush any setTimeout(kick, 0) the removed path would have armed.
    h.fire(0);
    const high = h.islandLinks().filter((l) => l.fetchPriority !== "low");
    assert.deepEqual(high, [], why + ": no high-priority island before pick");
    assert.deepEqual(h.islandLinks(), [], why + ": no island modulepreload at eval at all");
  }
  // Explicit THREE still prefetches the TLX roster at default priority.
  const sure = evalBoot({ local: { "apex26.gfxBackend": "three" } });
  assert.deepEqual(sure.rosterPreloads.map((c) => c.files), [["tlx.js"]],
    "sure THREE still preloads the TLX roster at eval");
  assert.equal(!!(sure.rosterPreloads[0].opts && sure.rosterPreloads[0].opts.low), false);
});

test("start() with a THREE pick still loads TLX scripts and then idle-preloads the island", async () => {
  const h = startHarness({ local: { "apex26.gfxBackend": "three" } });
  assert.deepEqual(h.islandLinks(), [], "premise: eval left the island cold");
  const started = h.rb.start();
  await settle();
  // start() schedules preloadThreeVendor via setTimeout(kick, 0) before/alongside the fetch.
  h.fire(0);
  const r = await started;
  assert.equal(r.bound, true);
  assert.ok(h.calls.includes("tlx.js"), "the THREE pick still fetches TLX scripts");
  const island = h.islandLinks();
  assert.deepEqual(island.map((l) => l.href).sort(), [...ISLAND].sort(),
    "after the pick, the full vendor island is modulepreloaded");
  assert.ok(island.every((l) => l.fetchPriority !== "low"),
    "resolved-pick island keeps default (high) priority");
});
