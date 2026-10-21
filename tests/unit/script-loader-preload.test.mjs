/* script-loader-preload.test.mjs — lazy bundles fetch every dependency wave
 * at once and still evaluate in edge order (js/core/script-loader.js), and the
 * renderer boot preloads its likely backend before game.js asks for it
 * (js/render/renderer-boot.js guessBackend / preloadLikelyBackend).
 *
 * B·H8 load hunt (2026-10-20): a file was fetched only after its predecessors
 * EVALUATED, so cold GLX boot paid three serial network waves (4255 -> 4957 ms,
 * 4x CPU, Fast 4G), all of them starting only once game.js had evaluated.
 *
 * Run: node --test tests/unit/script-loader-preload.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { absSrc } from "../helpers/abs-src.mjs";

const loader = readFileSync(new URL("../../js/core/script-loader.js", import.meta.url), "utf8");
const boot = readFileSync(new URL("../../js/render/renderer-boot.js", import.meta.url), "utf8");

function rig({ lazyV = null, integrity = null, blocked = false } = {}) {
  const head = [];
  const json = (id, map) => map && { tagName: "SCRIPT", type: "application/json", textContent: JSON.stringify(map), id };
  const byId = { "apex-lazy-v": json("apex-lazy-v", lazyV), "apex-lazy-integrity": json("apex-lazy-integrity", integrity) };
  const ctx = vm.createContext({
    ApexRoster: { DEFERRED_EDGES: [] },
    window: { __APEX_BUILD: "b7" },
    Log: { warn() {} },
    UpdateCheck: { prepareLazyLoad: async () => true, blocksLazyLoad: () => blocked },
    document: {
      getElementById: (id) => byId[id] || null,
      querySelector: (sel) => head.find((el) => el.rel === "preload" && sel.includes('href="' + el.href + '"')) || null,
      createElement: (tag) => ({ tag, dataset: {}, remove() {} }),
      head: { appendChild(el) { head.push(el); } },
    },
  });
  vm.runInContext(loader + "\nthis.ScriptLoader = ScriptLoader;", ctx);
  const flush = () => new Promise((r) => setImmediate(r));
  const scripts = () => head.filter((el) => el.tag === "script");
  const links = () => head.filter((el) => el.tag === "link");
  return { ctx, head, flush, scripts, links };
}

test("a chain a -> b -> c: b and c are fetched at load(), injected only after their predecessor loads", async () => {
  const r = rig();
  const p = r.ctx.ScriptLoader.create().load(["a.js", "b.js", "c.js"], [["a.js", "b.js"], ["b.js", "c.js"]]);
  await r.flush();
  assert.deepEqual(r.links().map((l) => [l.rel, l.as, l.href, l.crossOrigin]),
    [["preload", "script", "b.js?v=b7", "anonymous"], ["preload", "script", "c.js?v=b7", "anonymous"]],
    "the gated waves are preloaded under the inject's own URL and CORS mode");
  assert.deepEqual(r.scripts().map((s) => s.src), ["a.js?v=b7"], "evaluation order is unchanged: only a is injected");
  r.scripts()[0].onload(); await r.flush();
  assert.deepEqual(r.scripts().map((s) => s.src), ["a.js?v=b7", "b.js?v=b7"]);
  r.scripts()[1].onload(); await r.flush();
  r.scripts()[2].onload();
  assert.equal(await p, true);
  assert.equal(r.links().length, 2, "no second hint for a file already preloaded");
});

test("files with no waiting predecessor get no hint (they are injected at once)", async () => {
  const r = rig();
  const p = r.ctx.ScriptLoader.create().load(["x.js", "y.js"], []);
  await r.flush();
  assert.equal(r.links().length, 0);
  for (const s of r.scripts()) s.onload();
  assert.equal(await p, true);
});

test("deployed shell: the hint carries the content-hash URL and the inject's SRI; a file inject() refuses is not fetched", async () => {
  const sri = "sha256-" + "A".repeat(43) + "=";
  const r = rig({ lazyV: { "b.js": "0123456789ab", "c.js": "ba9876543210" }, integrity: { "a.js": sri, "b.js": sri } });
  r.ctx.ScriptLoader.create().load(["a.js", "b.js", "c.js"], [["a.js", "b.js"], ["a.js", "c.js"]]);
  await r.flush();
  assert.deepEqual(r.links().map((l) => [l.href, l.integrity]), [["b.js?v=0123456789ab", sri]],
    "c.js has no SRI in a deployed map: inject() refuses it, so the hint does too");
  assert.equal(r.scripts()[0].integrity, sri);
});

test("a newer build controlling the tab: nothing is preloaded", async () => {
  const r = rig({ blocked: true });
  r.ctx.ScriptLoader.create().load(["a.js", "b.js"], [["a.js", "b.js"]]);
  await r.flush();
  assert.equal(r.links().length, 0);
});

function bootRig({ local = {}, session = {}, gpu = false, throws = false } = {}) {
  const store = (m) => ({ getItem: (k) => { if (throws) throw new Error("blocked"); return k in m ? m[k] : null; }, setItem() {}, removeItem() {} });
  const preloaded = [];
  const ctx = vm.createContext({
    localStorage: store(local), sessionStorage: store(session),
    navigator: gpu ? { gpu: {} } : {},
    ApexRoster: { DEFERRED: { webgl2: ["glx.js"], three: ["tlx.js"], webgpu: ["wgx.js"] } },
    ScriptLoader: { preload: (files) => { preloaded.push(...files); return files.length; } },
  });
  vm.runInContext(boot + "\nthis.RendererBoot = RendererBoot;", ctx, { filename: absSrc("js/render/renderer-boot.js") });
  return { guess: ctx.RendererBoot.guessBackend(), preloaded };
}

test("renderer boot preloads the backend start() will most likely pick", () => {
  const cases = [
    [{}, "the unset default without WebGPU is GLX", "webgl2", ["glx.js"]],
    [{ gpu: true }, "the unset default with navigator.gpu is TLX", "three", ["tlx.js"]],
    [{ local: { "apex26.gfxBackend": "three" } }, "an explicit THREE pick is TLX even without navigator.gpu", "three", ["tlx.js"]],
    [{ local: { "apex26.gfxBackend": "webgl2" }, gpu: true }, "an explicit WebGL2 pick", "webgl2", ["glx.js"]],
    [{ local: { "apex26.gfxBackend": "webgpu" }, gpu: true }, "WGX with WebGPU", "webgpu", ["wgx.js"]],
    [{ local: { "apex26.gfxBackend": "webgpu" } }, "WGX without WebGPU boots GLX", "webgl2", ["glx.js"]],
    [{ local: { "apex26.gfxBackend": "three", "apex26.gfxBackendProbe": "three" }, gpu: true }, "an armed canary boots GLX", "webgl2", ["glx.js"]],
    [{ session: { "apex26.gfxClaimFail": "1" }, gpu: true }, "a claim-fail skip boots GLX", "webgl2", ["glx.js"]],
    [{ local: { "apex26.gfxBootBound": "webgl2" }, gpu: true }, "navigator.gpu but the last boot bound GLX (null adapter): GLX", "webgl2", ["glx.js"]],
    [{ local: { "apex26.gfxBootBound": "three" } }, "the last boot bound TLX", "three", ["tlx.js"]],
    [{ local: { "apex26.gfxBackend": "three", "apex26.gfxBootBound": "webgl2" }, gpu: true }, "an explicit THREE pick whose create() refused last boot: GLX", "webgl2", ["glx.js"]],
    [{ local: { "apex26.gfxBackend": "webgpu", "apex26.gfxBootBound": "three" }, gpu: true }, "a NEW pick ignores a bound backend it did not ask for", "webgpu", ["wgx.js"]],
    [{ local: { "apex26.gfxBackend": "webgl2", "apex26.gfxBootBound": "three" }, gpu: true }, "an explicit WebGL2 pick", "webgl2", ["glx.js"]],
    [{ throws: true, gpu: true }, "blocked storage: no guess, no fetch", "", []],
  ];
  for (const [opts, why, guess, files] of cases) {
    const r = bootRig(opts);
    assert.equal(r.guess, guess, why);
    assert.deepEqual(r.preloaded, files, why + " (preloaded at eval)");
  }
});

test("a TLX guess modulepreloads the whole three vendor island at eval, three.core included", () => {
  // three.webgpu imports three.core statically and modulepreload fetches no dependencies, so a hint list without
  // core found it only after webgpu had downloaded and parsed. And start() runs after every deferred script and the
  // adapter probe: hinting from there reached the network seconds late.
  const run = (gpu) => {
    const links = [];
    const ctx = vm.createContext({
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      navigator: gpu ? { gpu: {} } : {},
      ApexRoster: { DEFERRED: { webgl2: ["glx.js"], three: ["tlx.js"], webgpu: ["wgx.js"] } },
      ScriptLoader: { preload: (files) => files.length },
      document: { querySelector: () => null, createElement: () => ({}), head: { appendChild: (el) => links.push(el) } },
    });
    vm.runInContext(boot + "\nthis.RendererBoot = RendererBoot;", ctx, { filename: absSrc("js/render/renderer-boot.js") });
    return links.filter((l) => l.rel === "modulepreload").map((l) => l.href);
  };
  assert.deepEqual(run(true), ["vendor/three-0.186.1/three.webgpu.min.js", "vendor/three-0.186.1/three.core.min.js", "vendor/three-0.186.1/three.tsl.min.js"]);
  assert.deepEqual(run(false), [], "a GLX guess fetches no three vendor bytes");
});
