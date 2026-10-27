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
    window: { __APEX_BUILD: "b7", setTimeout, clearTimeout },
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

test("warm reads each final URL into the HTTP cache and does not re-key it", async () => {
  const r = rig();
  const fetched = [];
  r.ctx.fetch = async (href, opts) => {
    fetched.push([href, opts && opts.credentials]);
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(2) };
  };
  const n = await r.ctx.ScriptLoader.warm(["http://x/js/a.js?v=abc", "http://x/js/b.js?v=def"]);
  assert.equal(n, 2);
  assert.deepEqual(fetched, [
    ["http://x/js/a.js?v=abc", "same-origin"],
    ["http://x/js/b.js?v=def", "same-origin"],
  ]);
});

test("warm counts a failed fetch as unread and still settles", async () => {
  const r = rig();
  r.ctx.fetch = async (href) => href.includes("bad") ? { ok: false, status: 503 } : { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  assert.equal(await r.ctx.ScriptLoader.warm(["http://x/ok.js", "http://x/bad.js"]), 1);
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
  const preloadCalls = [];
  const ctx = vm.createContext({
    localStorage: store(local), sessionStorage: store(session),
    navigator: gpu ? { gpu: {} } : {},
    ApexRoster: { DEFERRED: { webgl2: ["glx.js"], three: ["tlx.js"], webgpu: ["wgx.js"] } },
    ScriptLoader: { preload: (files, o) => { preloaded.push(...files); preloadCalls.push({ files: [...files], opts: o }); low = !!(o && o.low); return files.length; } },
  });
  let low = null;
  vm.runInContext(boot + "\nthis.RendererBoot = RendererBoot;", ctx, { filename: absSrc("js/render/renderer-boot.js") });
  return { guess: ctx.RendererBoot.guessBackend(), preloaded, low, preloadCalls };
}

test("renderer boot preloads the backend start() will most likely pick", () => {
  const cases = [
    [{}, "the unset default without WebGPU is GLX", "webgl2", ["glx.js"]],
    [{ gpu: true }, "the unset default with navigator.gpu is a hunch only until the adapter probe", "three", []],
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

test("a guess read off navigator.gpu alone is a hunch: no eval-time TLX roster prefetch (#3536 / SwiftShader GLX fallback)", () => {
  const cases = [
    [{ gpu: true }, null, "first boot, unset pick, navigator.gpu: start() may still land GLX after the probe"],
    [{ local: { "apex26.gfxBackend": "webgpu", "apex26.gfxBootBound": "three" }, gpu: true }, true, "the boot after a switch to WEBGPU"],
    [{}, false, "no navigator.gpu: the unset default is GLX for certain"],
    [{ local: { "apex26.gfxBootBound": "three" }, gpu: true }, false, "the last boot bound this pick"],
    [{ local: { "apex26.gfxBackend": "three" } }, false, "an explicit THREE pick always fetches TLX"],
    [{ local: { "apex26.gfxBackend": "webgl2" }, gpu: true }, false, "an explicit WebGL2 pick"],
    [{ local: { "apex26.gfxBackendProbe": "three" }, gpu: true }, false, "an armed canary boots GLX"],
  ];
  for (const [opts, low, why] of cases) {
    const r = bootRig(opts);
    if (low === null) assert.equal(r.preloaded.length, 0, why);
    else assert.equal(r.low, low, why);
  }
  const sl = rig();
  assert.equal(sl.ctx.ScriptLoader.preload(["a.js"], { low: true }), 1);
  assert.equal(sl.links()[0].fetchPriority, "low", "the loader carries the hint onto the link");
  sl.ctx.ScriptLoader.preload(["b.js"]);
  assert.equal(sl.links()[1].fetchPriority, undefined, "a sure preload keeps the default priority");
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
    return links.filter((l) => l.rel === "modulepreload").map((l) => l.href + (l.fetchPriority ? "#" + l.fetchPriority : ""));
  };
  assert.deepEqual(run(true), [],
    "an unset navigator.gpu hunch does not modulepreload three before the adapter probe (#3536)");
  assert.deepEqual(run(false), [], "a GLX guess fetches no three vendor bytes");
});

test("a speculative ScriptLoader.preload can mark fetchPriority low; an unmarked one keeps the default (#3549)", () => {
  const r = rig();
  assert.equal(r.ctx.ScriptLoader.preload(["spec.js"], { low: true }), 1);
  assert.equal(r.ctx.ScriptLoader.preload(["plain.js"]), 1);
  assert.deepEqual(r.links().map((l) => [l.href, l.fetchPriority]),
    [["spec.js?v=b7", "low"], ["plain.js?v=b7", undefined]],
    "fetchPriority low is set only when the caller passes opts.low");
});

test("load reports onSettled after each successful file (#3587 boot progress)", async () => {
  const r = rig();
  const settled = [];
  const p = r.ctx.ScriptLoader.create().load(["a.js", "b.js"], [["a.js", "b.js"]], {
    onSettled: (src) => settled.push(src),
  });
  await r.flush();
  r.scripts()[0].onload(); await r.flush();
  assert.deepEqual(settled, ["a.js"]);
  r.scripts()[1].onload();
  assert.equal(await p, true);
  assert.deepEqual(settled, ["a.js", "b.js"]);
});

test("the resolved-pick load path does NOT deprioritise its gated preloads (#3549)", async () => {
  const r = rig();
  const p = r.ctx.ScriptLoader.create().load(["a.js", "b.js"], [["a.js", "b.js"]]);
  await r.flush();
  assert.equal(r.links().length, 1, "premise: the gated wave is preloaded");
  assert.equal(r.links()[0].fetchPriority, undefined,
    "load() is the resolved pick: its hint keeps the browser's default priority");
  r.scripts()[0].onload(); await r.flush();
  r.scripts()[1].onload();
  assert.equal(await p, true);
});

test("eval-time hunch guesses skip the TLX roster; sure guesses preload at default priority (#3549 / #3536)", () => {
  const hunch = bootRig({ gpu: true });
  assert.equal(hunch.preloadCalls.find((c) => c.files.includes("tlx.js")), undefined,
    "a navigator.gpu hunch must not prefetch TLX before the adapter probe");
  const sure = bootRig({ local: { "apex26.gfxBackend": "three" } });
  const sureTlx = sure.preloadCalls.find((c) => c.files.includes("tlx.js"));
  assert.ok(sureTlx, "an explicit THREE pick preloads TLX at eval");
  assert.equal(!!(sureTlx.opts && sureTlx.opts.low), false);
  const blocked = bootRig({ throws: true, gpu: true });
  assert.equal(blocked.preloadCalls.length, 0, "blocked storage: no guess, no fetch");
});

test("a transient script onerror retries with cache-bust, then succeeds without a fourth inject", async () => {
  const urls = [];
  let loads = 0;
  const r = rig();
  const docHead = r.ctx.document.head;
  const orig = docHead.appendChild.bind(docHead);
  docHead.appendChild = (el) => {
    orig(el);
    if (el.tag !== "script") return;
    urls.push(el.src);
    queueMicrotask(() => {
      loads++;
      if (loads === 1) el.onerror();
      else el.onload();
    });
  };
  const t0 = Date.now();
  const p = r.ctx.ScriptLoader.create().load(["a.js"], []);
  await r.flush();
  assert.equal(await p, true);
  assert.ok(Date.now() - t0 >= 350, "waits before the second inject");
  assert.equal(loads, 2);
  assert.ok(urls[1].includes("retry=1"), "the retry uses a fresh URL key");
});

test("three transient failures on one file settle the load as failed", async () => {
  const r = rig();
  const docHead = r.ctx.document.head;
  const orig = docHead.appendChild.bind(docHead);
  let loads = 0;
  docHead.appendChild = (el) => {
    orig(el);
    if (el.tag !== "script") return;
    queueMicrotask(() => { loads++; el.onerror(); });
  };
  const t0 = Date.now();
  const p = r.ctx.ScriptLoader.create().load(["a.js"], [], { strict: true });
  await r.flush();
  assert.equal(await p, false);
  assert.equal(loads, 3);
  assert.ok(Date.now() - t0 >= 1500, "both backoff delays ran");
});
