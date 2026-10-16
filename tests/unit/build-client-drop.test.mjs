/* build-client-drop.test.mjs — TrackBuildClient must never leave a build waiting on a
 * worker that is gone or wedged.
 *
 * drop() never settled the spawn() readiness promise, so BUILD IN BACKGROUND turned
 * off while the worker was still parsing left post() awaiting it forever:
 * loadTrackStepped never completed and busy() (the in-flight count) blocked every
 * synchronous build. A worker that came up but never answered did the same.
 * Run: node --test tests/unit/build-client-drop.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(new URL("../../js/track/build-client.js", import.meta.url), "utf8");

function page(globals = {}) {
  const workers = [], timers = [], warns = [];
  const store = new Map([["apex26.buildWorker", "1"]]);
  class FakeWorker {
    constructor() { this.posts = []; this.terminated = false; workers.push(this); }
    postMessage(m) { this.posts.push(m); }
    terminate() { this.terminated = true; }
  }
  const ctx = vm.createContext({
    console, URL, Promise,
    Worker: FakeWorker,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    location: { href: "https://example.test/index.html" },
    document: { readyState: "complete", getElementById: () => null, querySelectorAll: () => [] },
    ApexRoster: { TRACK_VM: ["fixture-track-a.js"], TRACK_WORKER_EXTRA: [] },
    Log: { warn: (_ns, m) => warns.push(m), info() {} },
    // Manual clock: the 30 s answer cap is fired by the test, not waited for.
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
    ...globals,
  });
  ctx.window = ctx;
  vm.runInContext(src, ctx, { filename: "js/track/build-client.js" });
  const fire = () => { for (const t of timers) if (t.live) { t.live = false; t.fn(); } };
  return { client: ctx.TrackBuildClient, workers, warns, fire };
}

const def = { id: "monza" }, opts = { night: false, gridSlots: 20 }, gfx = {};
const settle = () => new Promise((r) => setImmediate(r));

test("turning BUILD IN BACKGROUND off while the worker is still loading settles the build with null", async () => {
  const { client, workers } = page();
  client.spawn();
  assert.equal(workers.length, 1);
  const built = client.build(0, def, opts, gfx, null);   // awaiting the worker's "ready"
  await settle();
  assert.equal(client.busy(), true, "a build is out at the worker");
  client.set(false);
  assert.equal(await built, null, "no worker: the caller builds in steps");
  assert.equal(client.busy(), false, "nothing blocks a synchronous build any more");
  assert.equal(workers[0].terminated, true);
});

test("a worker that is up but never answers is dropped after the answer cap", async () => {
  const { client, workers, fire, warns } = page();
  client.spawn();
  workers[0].onmessage({ data: { type: "ready" } });
  const built = client.build(0, def, opts, gfx, null);
  await settle();
  assert.equal(workers[0].posts.at(-1).type, "build", "the build was posted");
  assert.equal(client.busy(), true);
  fire();
  assert.equal(await built, null);
  assert.equal(client.busy(), false);
  assert.equal(workers[0].terminated, true);
  assert.ok(warns.some((m) => /no answer/.test(m)));
});

test("a worker that never reports ready is dropped after the same cap", async () => {
  const { client, workers, fire } = page();
  const built = client.build(0, def, opts, gfx, null);
  await settle();
  fire();
  assert.equal(await built, null);
  assert.equal(client.busy(), false);
  assert.equal(workers[0].terminated, true);
});

test("a prompt answer is unaffected and clears its timer", async () => {
  const { client, workers, fire } = page();
  client.spawn();
  workers[0].onmessage({ data: { type: "ready" } });
  const built = client.build(0, def, opts, gfx, null);
  await settle();
  const seq = workers[0].posts.at(-1).seq;
  workers[0].onmessage({ data: { type: "built", seq, id: "monza", models: [] } });
  const m = await built;
  assert.equal(m.type, "built");
  fire();   // the answered build's timer is cleared: firing the clock changes nothing
  assert.equal(workers[0].terminated, false);
});

test("a reply whose model comparison throws still settles the build with null and clears busy()", async () => {
  // missingModels runs AFTER the entry left _pending, so neither drop() nor the answer
  // timer can reach it: the handler itself has to settle it.
  const { client, workers, warns, fire } = page({
    Assets: { modelIds() { throw new Error("model table unreadable"); }, modelSync: () => true },
  });
  client.spawn();
  workers[0].onmessage({ data: { type: "ready" } });
  const built = client.build(0, def, opts, gfx, null);
  await settle();
  const seq = workers[0].posts.at(-1).seq;
  workers[0].onmessage({ data: { type: "built", seq, id: "monza", models: [] } });
  assert.equal(await built, null, "the caller builds in steps");
  assert.equal(client.busy(), false);
  assert.ok(warns.some((m) => /model table unreadable/.test(m)), "logged, not swallowed");
  assert.equal(workers[0].terminated, false, "one bad reply does not cost the worker");
  fire();   // the answer timer was cleared by the settle: nothing left to drop
  assert.equal(workers[0].terminated, false);
});

// ---- R3-ASYNC-2 / R3-PHONE-8 (hunt3 train) --------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(path.join(ROOT, "js/track/build-client.js"), "utf8");

function client({ answer = "never", lazyV = null } = {}) {
  const mem = new Map([["apex26.buildWorker", "1"]]);
  const made = [], idles = [];
  const ctx = vm.createContext({ Promise, Map, Set, URL, setTimeout, clearTimeout,
    Log: { info() {}, warn() {}, debug() {} }, window: { __APEX_BUILD: 7 }, location: { href: "http://x/index.html" },
    document: { querySelectorAll: () => [], readyState: "loading", addEventListener() {},
      getElementById: (id) => (id === "apex-lazy-v" && lazyV ? { textContent: JSON.stringify(lazyV) } : null) },
    localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) },
    requestIdleCallback: (fn) => { idles.push(fn); return idles.length; },
    ApexRoster: { TRACK_VM: ["js/track/core/geom.js"], TRACK_WORKER_EXTRA: [] },
    Worker: class {
      constructor(u) { this.url = u; this.posted = []; this.messages = []; this.terminated = 0; made.push(this); }
      postMessage(m) {
        this.posted.push(m.type); this.messages.push(m);
        if (answer !== "ok") return;
        const reply = m.type === "init" ? { type: "ready" } : { type: "error", seq: m.seq, message: "stub" };
        setTimeout(() => this.onmessage && this.onmessage({ data: reply }), 0);
      }
      terminate() { this.terminated++; }
    } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/script-loader.js"), "utf8") + "\nthis.ScriptLoader = ScriptLoader;", ctx, { filename: "script-loader.js" });
  vm.runInContext(SRC + "\nthis.TrackBuildClient = TrackBuildClient;", ctx, { filename: "build-client.js" });
  return { C: ctx.TrackBuildClient, made, idles, mem };
}
const DEF = { id: "monza" }, OPTS = { night: false, gridSlots: 20 }, GFX = { mobileTier: false };
const within = (p, ms) => Promise.race([p.then((v) => ({ v })), new Promise((r) => setTimeout(() => r("PENDING"), ms))]);


test("idleWarm spawns nothing for a player; the first posted build does", async () => {
  const { C, made, idles } = client({ answer: "ok" });
  assert.equal(C.idleWarm(false), null, "nothing to report yet");
  assert.equal(C.idleWarm(), null, "a bare call is safe and inert");
  assert.equal(idles.length, 0, "no idle spawn queued");
  assert.equal(made.length, 0, "no worker at the title");
  assert.equal(await C.build(0, DEF, OPTS, GFX, null), null, "the stub answers an error: null, build in steps");
  assert.equal(made.length, 1, "spawned by the posted build");
  assert.deepEqual(made[0].posted, ["init", "build"]);
});

test("idleWarm still warms the worker for the agent surface", async () => {
  const { C, made, idles } = client({ answer: "ok" });
  C.idleWarm(true);
  assert.equal(idles.length, 1);
  idles[0]();
  assert.equal(made.length, 1);
  assert.equal(await C.spawn(), true, "ready before any build is posted");
});

test("the worker and its scenery import use the deploy's content-hash key (R3-PHONE-8)", async () => {
  const lazyV = { "js/track/build-worker.js": "0123456789ab", "js/circuits/scenery/monza.js": "ba9876543210" };
  const { C, made } = client({ answer: "ok", lazyV });
  await C.build(0, DEF, OPTS, GFX, "js/circuits/scenery/monza.js");
  assert.equal(made[0].url, "http://x/js/track/build-worker.js?v=0123456789ab");
  assert.equal(made[0].messages[1].scenery, "http://x/js/circuits/scenery/monza.js?v=ba9876543210");
  const bare = client({ answer: "ok" });
  bare.C.spawn();
  assert.equal(bare.made[0].url, "http://x/js/track/build-worker.js?v=7", "no map (dev shell): the build, as before");
});

test("page diagnostic settings bypass worker requests and defaults remain eligible", async () => {
  let diagnostic = true;
  const { client, workers } = page({ Tracks: { diagnosticBuild: () => diagnostic } });
  assert.equal(await client.build(0, def, opts, gfx, null), null);
  assert.equal(workers.length, 0);
  diagnostic = false;
  const pending = client.build(0, def, opts, gfx, null);
  await settle(); assert.equal(workers.length, 1);
  client.set(false); assert.equal(await pending, null);
});

 test("Tracks reports compact-off and unchunked diagnostic modes", () => {
  let unchunked = null;
  const ctx = vm.createContext({ TrackGeom: {}, TrackSpline: {}, TrackMesh: {},
    TrackDef: {}, M4: {}, localStorage: { getItem: () => unchunked } });
  vm.runInContext(readFileSync(new URL("../../js/track/tracks.js", import.meta.url), "utf8"), ctx);
  const tracks = vm.runInContext("Tracks", ctx);
  assert.equal(tracks.diagnosticBuild(), false);
  tracks.setCompactProps(false); assert.equal(tracks.diagnosticBuild(), true);
  tracks.setCompactProps(true); unchunked = "1"; assert.equal(tracks.diagnosticBuild(), true);
  unchunked = null; assert.equal(tracks.diagnosticBuild(), false);
});

test("replay cancellation between upload slices frees uploads and returns null without uploading the rest", async () => {
  let tick = 0, resume, live = true, uploads = 0;
  const freed = [];
  const { client } = page({ performance: { now: () => ++tick * 10 },
    requestAnimationFrame: r => { resume = r; } });
  const recs = [0, 1, 2].map(() => ({ op: "mesh", args: [{}] }));
  const msg = { recs, track: { meshes: {}, buildProfile: [] }, ms: 0 };
  const gfx = { createMesh() { return ++uploads; }, freeMesh(h) { freed.push(h); } };
  const result = client.replay(msg, def, gfx, 1, () => live);
  assert.equal(uploads, 1); live = false; resume();
  assert.equal(await result, null); assert.equal(uploads, 1);
  assert.deepEqual(freed, [1]);
  assert.equal(await client.replay(msg, def, gfx, 1, () => true), null, "taken replay cannot upload twice");
});

test("replay upload failures still reject instead of masquerading as cancellation", async () => {
  const { client } = page({ performance: { now: () => 0 } });
  const msg = { recs: [{ op: "mesh", args: [{}] }], track: { meshes: {}, buildProfile: [] } };
  await assert.rejects(client.replay(msg, def, { createMesh() { throw new Error("upload refused"); } }, 8, () => true), /upload refused/);
});
