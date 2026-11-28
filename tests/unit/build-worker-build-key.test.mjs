// build-worker-build-key.test.mjs — the build worker asks for the pack manifest
// under the PAGE's build key (#7388, hunt #7387 row 4).
//
// assets.js requests `manifest.json?b=<window.__APEX_BUILD>`, which sw.js answers
// stale-first; with no build it asks the bare URL, which sw.js answers network-first.
// The worker had no __APEX_BUILD, so every worker build waited on the network for
// the manifest (capped at 4 s) even for circuits with no models. The client now
// posts the build number with init and the worker adopts it before Assets loads.
//
// Run: node --test tests/unit/build-worker-build-key.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// A worker global running the real build-worker.js; importScripts loads only assets.js.
async function workerManifestUrl(build) {
  const fetched = [];
  const ctx = vm.createContext({ performance, console, URL, setTimeout, clearTimeout, postMessage() {},
    fetch: async (u) => { fetched.push(String(u)); return { ok: false, status: 404 }; } });
  ctx.self = ctx;
  ctx.importScripts = (...files) => {
    for (const f of files) {
      const rel = f.replace(/^https?:\/\/[^/]+\//, "").replace(/\?.*$/, "");
      vm.runInContext(read(rel), ctx, { filename: absSrc(rel) });
    }
  };
  vm.runInContext(read("js/track/build-worker.js"), ctx, { filename: absSrc("js/track/build-worker.js") });
  const init = { type: "init", files: ["http://x/js/render/shared/assets.js?v=1"], base: "http://x/index.html" };
  if (build !== undefined) init.build = build;
  await ctx.onmessage({ data: init });
  await ctx.Assets.modelsReady(500);
  return fetched.find((u) => /manifest\.json/.test(u));
}

test("after init with build n the worker's manifest fetch is manifest.json?b=n", async () => {
  const url = await workerManifestUrl(4211);
  assert.ok(url, "premise: the worker's Assets fetched the manifest");
  assert.equal(new URL(url).pathname + new URL(url).search, "/assets/pack/manifest.json?b=4211");
});

test("with no build (or a junk one) the manifest URL stays bare", async () => {
  for (const build of [undefined, 0, "x", -3, 1.5]) {
    const url = await workerManifestUrl(build);
    assert.ok(url, "premise: the worker's Assets fetched the manifest");
    assert.equal(new URL(url).pathname + new URL(url).search, "/assets/pack/manifest.json", "build " + build);
  }
});

test("the client's init message carries the page's build number", async () => {
  const made = [];
  const ctx = vm.createContext({ Promise, Map, Set, URL, setTimeout, clearTimeout,
    Log: { info() {}, warn() {}, debug() {} }, window: { __APEX_BUILD: 7 }, location: { href: "http://x/index.html" },
    document: { querySelectorAll: () => [], readyState: "complete", addEventListener() {}, getElementById: () => null },
    localStorage: { getItem: (k) => (k === "apex26.buildWorker" ? "1" : null), setItem() {} },
    ApexRoster: { TRACK_VM: ["js/track/core/geom.js"], TRACK_WORKER_EXTRA: [] },
    Worker: class {
      constructor() { this.messages = []; made.push(this); }
      postMessage(m) {
        this.messages.push(m);
        if (m.type === "init") setTimeout(() => this.onmessage && this.onmessage({ data: { type: "ready" } }), 0);
      }
      terminate() {}
    } });
  vm.runInContext(read("js/core/script-loader.js") + "\nthis.ScriptLoader = ScriptLoader;", ctx, { filename: absSrc("js/core/script-loader.js") });
  vm.runInContext(read("js/track/build-client.js") + "\nthis.TrackBuildClient = TrackBuildClient;", ctx, { filename: absSrc("js/track/build-client.js") });
  assert.equal(await ctx.TrackBuildClient.spawn(), true);
  const init = made[0].messages.find((m) => m.type === "init");
  assert.equal(init.build, 7);
  assert.equal(init.base, "http://x/index.html");
});
