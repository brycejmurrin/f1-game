/* lazy-dev-panels.test.mjs — #4978 slice 1: flag-gated dev panels off the boot shell.
 *
 * gfx-debug-overlay.js is LAZY_DEV (injected by LazyBundles.bootAgentSurface only
 * when DevFlags says gfxdebug), three-inspector.js rides LAZY_AGENT (only apex.js
 * boots it), and js/overlay/render.js is overlay.html's alone (OVERLAY_PAGE).
 *
 * Run: node --test tests/unit/lazy-dev-panels.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = new URL("../../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), "utf8");
const M = createRequire(import.meta.url)("../../tools/manifest.cjs");
const tagged = new Set([...read("index.html").matchAll(/<script[^>]*src="([^"?]+)/g)].map((m) => m[1]));

test("the three moved files are off the boot shell and on their rosters", () => {
  for (const f of ["js/perf/gfx-debug-overlay.js", "js/perf/three-inspector.js", "js/overlay/render.js"]) {
    assert.ok(!M.FULL.includes(f), `${f} must not be FULL`);
    assert.ok(!tagged.has(f), `${f} must not have an index.html tag`);
  }
  assert.deepEqual(M.LAZY_DEV, ["js/perf/gfx-debug-overlay.js"]);
  assert.deepEqual(M.OVERLAY_PAGE, ["js/overlay/render.js"]);
  const agent = M.LAZY_AGENT;
  assert.ok(agent.indexOf("js/perf/three-inspector.js") >= 0
    && agent.indexOf("js/perf/three-inspector.js") < agent.indexOf("js/agent/apex.js"),
  "three-inspector loads before apex.js (ApexApi.create boots it)");
  assert.match(read("overlay.html"), /src="js\/overlay\/render\.js/, "overlay.html keeps its painter tag");
});

function boot({ gfxdebug, host = "example.com", fail = false }) {
  const calls = [];
  const ctx = vm.createContext({
    console, Promise, setTimeout, clearTimeout, queueMicrotask, URLSearchParams,
    ApexRoster: { LAZY_AGENT: [], LAZY_EDGES: [], LAZY_RACE: [], LAZY_DEV: M.LAZY_DEV },
    DevFlags: { get: (k) => k === "gfxdebug" && gfxdebug },
    localStorage: { getItem() { return null; } },
    navigator: { userAgent: "vm" },
    location: { search: "", hostname: host },
    Log: { warn() {}, info() {}, error() {}, debug() {} },
  });
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  vm.runInContext(read("js/core/lazy-bundles.js").replace(/^const LazyBundles\b/m, "var LazyBundles"), ctx, { filename: absSrc("js/core/lazy-bundles.js") });
  const lb = ctx.LazyBundles.create({
    els: {},
    loadBackendScripts: (files) => { calls.push(files.slice()); return fail ? Promise.reject(new Error("404")) : Promise.resolve(true); },
    bindAgent() {},
  });
  return { lb, calls };
}

test("bootAgentSurface injects LAZY_DEV only when gfxdebug is on, and never awaits it", async () => {
  const off = boot({ gfxdebug: false });
  await off.lb.bootAgentSurface();
  assert.deepEqual(off.calls, [], "a player page with no flag fetches nothing");

  const on = boot({ gfxdebug: true });
  await on.lb.bootAgentSurface();
  assert.deepEqual(on.calls, [M.LAZY_DEV], "gfxdebug injects the dev group alone (no agent surface on Pages)");
});

test("a failed LAZY_DEV inject never rejects the boot tail", async () => {
  const bad = boot({ gfxdebug: true, fail: true });
  await bad.lb.bootAgentSurface();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(bad.calls, [M.LAZY_DEV]);
});
