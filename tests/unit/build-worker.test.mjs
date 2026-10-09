// The track build Worker (js/track/build-worker.js + js/track/build-client.js),
// behind apex26.buildWorker (default ON when multi-core). Its promise is the stepped build's:
// NOTHING changes. The worker runs the unchanged Tracks.build against a
// recording gfx, its message crosses a structured clone (what postMessage
// does), and TrackBuildClient.replay issues the recorded uploads against the
// real backend — which must then have received exactly what a synchronous
// build() hands it, in the same order, and leave the same physics arrays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");
const MANIFEST = require("../../tools/manifest.cjs");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

const Tracks = buildContext(null, { quiet: true, instancing: true });
const main = Tracks._vmContext;
// The replay paces itself on requestAnimationFrame, else setTimeout, and times slices: give the sandbox what a page has.
main.setTimeout = setTimeout; main.performance = performance;

// The worker: its own context, importScripts reading the repo, postMessage kept.
function spawnWorker() {
  const posted = [];
  const ctx = vm.createContext({ performance, console, URL, postMessage: (m) => posted.push(structuredClone(m)) });
  ctx.self = ctx;
  ctx.importScripts = (...files) => {
    for (const f of files) {
      const rel = f.replace(/^https?:\/\/[^/]+\//, "").replace(/\?.*$/, "");
      vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), ctx, { filename: rel });
    }
  };
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/track/build-worker.js"), "utf8"), ctx);
  // onmessage is async (a build awaits the model pack): send() returns it.
  return { send: (m) => ctx.onmessage({ data: m }), posted };
}
const vmFiles = MANIFEST.TRACK_VM.flatMap((e) => (e === "@circuits" ? MANIFEST.CIRCUITS.map((id) => MANIFEST.circuitPath(id)) : [e]));

// A gfx that records every upload, hashing its buffers, and frees a chunked
// upload's source channels the way glx/chunked.js and wgx-chunked.js do.
function recorder() {
  const log = [];
  const h = (a) => createHash("sha1").update(a && a.length ? Buffer.from(Float64Array.from(a).buffer) : Buffer.alloc(0)).digest("hex").slice(0, 16);
  const geo = (kind, g, extra) => {
    log.push([kind, g && g.pos ? g.pos.length : 0, h(g && g.pos), h(g && g.nrm), h(g && g.col), h(g && g.idx), h(g && g.mat), extra || ""].join(" "));
    return { kind };
  };
  return {
    log,
    gfx: {
      createMesh: (g) => geo("mesh", g),
      createChunkedMesh: (g, cell) => {
        const r = geo("chunked", g, "cell=" + cell);
        if (!g._keepPositions) { g.pos = null; g.idx = null; }
        return { kind: "chunked", chunks: [1] };
      },
      createInstancedBatch: (g, m, c) => geo("inst", g, h(m) + "/" + h(c)),
    },
  };
}
const PHYS = ["px", "py", "pz", "hw", "barL", "barR", "lineX", "lineK"];
const physics = (t) => PHYS.filter((k) => t[k]).map((k) => k + ":" + createHash("sha1").update(Buffer.from(Float64Array.from(t[k]).buffer)).digest("hex").slice(0, 16));

vm.runInContext(fs.readFileSync(path.join(ROOT, "js/track/build-client.js"), "utf8").replace(/^const\b/gm, "var"), main);
const worker = spawnWorker();
worker.send({ type: "init", files: vmFiles.map((f) => "http://x/" + f + "?v=1") });

test("the worker loads the page's build modules and answers ready", () => {
  assert.deepEqual(worker.posted.map((m) => m.type), ["ready"]);
});

for (const id of ["monza", "vegas"]) {
  test(`${id}: worker build + replay uploads exactly what build() uploads`, async () => {
    const def = Tracks.LIST.find((d) => d.id === id);
    const a = recorder();
    const tA = Tracks.build(def, { gfx: a.gfx, chunkRibbons: true, retainGraph: false });

    worker.posted.length = 0;
    const wIdx = MANIFEST.CIRCUITS.indexOf(id);
    await worker.send({ type: "build", seq: 1, idx: wIdx, id, opts: { chunkRibbons: true, retainGraph: false }, scenery: "http://x/" + MANIFEST.sceneryPath(id) + "?v=1" });
    const msg = worker.posted[0];
    assert.equal(msg.type, "built", msg.message);
    assert.ok(msg.recs.length > 5 && msg.ms > 0);

    const b = recorder();
    const tB = await main.TrackBuildClient.replay(msg, def, b.gfx);
    assert.deepEqual(b.log, a.log, "every upload, in order, byte-identical");
    assert.deepEqual(physics(tB), physics(tA), "the physics arrays match");
    assert.equal(tB.total, tA.total);
    assert.equal(tB.def, def, "the page's own def is re-attached");
    assert.deepEqual(Object.keys(tB.meshes).sort(), Object.keys(tA.meshes).sort());
    for (const [k, v] of Object.entries(tB.meshes)) {
      const flat = Array.isArray(v) ? v : [v];
      assert.ok(flat.every((x) => !x || x.__rec === undefined), k + " holds a real handle, not a token");
    }
    for (let s = 0; s < tA.total; s += tA.total / 37) {
      assert.equal(tB.surface.heightAt ? tB.surface.heightAt(s, 0) : 0, tA.surface.heightAt ? tA.surface.heightAt(s, 0) : 0, "surface sampler rebuilt at s=" + s);
    }
  });
}

test("replay stamps _keepPositions when the page asked for trackGeometry", async () => {
  const def = Tracks.LIST.find((d) => d.id === "monza");
  worker.posted.length = 0;
  await worker.send({ type: "build", seq: 91, idx: MANIFEST.CIRCUITS.indexOf("monza"), id: "monza", opts: { chunkRibbons: true, retainGraph: false } });
  const msg = worker.posted[0];
  assert.equal(msg.type, "built", msg.message);
  // Foundation specs call __apex.trackGeometry(true) before race; the worker's
  // own Tracks copy never sees that flag — replay must stamp it.
  assert.equal(typeof main.Tracks.keepGeometry, "function");
  assert.equal(main.Tracks.setKeepGeometry(true), true);
  const b = recorder();
  const tB = await main.TrackBuildClient.replay(msg, def, b.gfx);
  assert.ok(tB.propsGeo && tB.propsGeo.pos && tB.propsGeo.pos.length > 0,
    "props.pos survives createChunkedMesh when keepGeometry is on");
  assert.equal(tB.propsGeo._keepFullGeometry, true);
  main.Tracks.setKeepGeometry(false);
});

test("a ribbon the backend did not chunk is re-seated as tracks.js does it", async () => {
  const def = Tracks.LIST.find((d) => d.id === "monza");
  worker.posted.length = 0;
  await worker.send({ type: "build", seq: 2, idx: MANIFEST.CIRCUITS.indexOf("monza"), id: "monza", opts: { chunkRibbons: true, retainGraph: false } });
  const msg = worker.posted[0];
  const ribbons = Object.keys(msg.track.meshes).filter((k) => k.endsWith("Chunked") && msg.track.meshes[k]);
  assert.ok(ribbons.length > 0, "the worker chunked at least one ribbon");
  const small = recorder();
  small.gfx.createChunkedMesh = (g) => ({ kind: "small", chunks: null });   // under a chunk: a plain mesh
  const t = await main.TrackBuildClient.replay(msg, def, small.gfx);
  for (const k of ribbons) {
    assert.equal(t.meshes[k], null, k + " cleared");
    assert.equal(t.meshes[k.slice(0, -7)].kind, "small", k.slice(0, -7) + " holds the plain mesh");
  }
  assert.equal(await main.TrackBuildClient.replay(msg, def, small.gfx), null, "a message is replayed once");
});

test("a worker error answers an error message, never a throw", async () => {
  worker.posted.length = 0;
  await worker.send({ type: "build", seq: 3, idx: 0, id: "not-a-circuit", opts: {} });
  assert.equal(worker.posted[0].type, "error");
  assert.equal(worker.posted[0].seq, 3);
});

test("BUILD IN BACKGROUND's write flips exactly what enabled() (and loadTrackStepped) reads", () => {
  const mem = new Map();
  main.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  main.Worker = main.Worker || class {};
  main.navigator = { hardwareConcurrency: 4 };
  const C = main.TrackBuildClient;
  assert.equal(C.enabled(), true, "unset reads ON when Worker + multi-core");
  main.navigator = { hardwareConcurrency: 1 };
  assert.equal(C.enabled(), false, "unset reads OFF on a single logical core");
  main.navigator = { hardwareConcurrency: 4 };
  C.set(false); assert.equal(mem.get("apex26.buildWorker"), "0"); assert.equal(C.enabled(), false);
  mem.set("apex26.buildWorker", "1"); assert.equal(C.enabled(), true, "\"1\" is on");
  mem.set("apex26.buildWorker", "0"); assert.equal(C.enabled(), false);
  delete main.localStorage;
});

// Turning BUILD IN BACKGROUND off left the worker (a whole TRACK_VM heap, ~20 MB)
// alive for the session: only a spawn or worker error terminated it.
test("turning BUILD IN BACKGROUND off terminates the worker; on spawns a fresh one", async () => {
  const mem = new Map([["apex26.buildWorker", "1"]]);
  const made = [];
  const ctx = vm.createContext({ Promise, Map, URL, setTimeout, console,
    Log: { info() {}, warn() {}, debug() {} }, window: { __APEX_BUILD: 1 }, location: { href: "http://x/index.html" },
    document: { querySelectorAll: () => [], readyState: "loading", addEventListener() {} },
    localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) },
    ApexRoster: { TRACK_VM: ["js/track/core/geom.js"], TRACK_WORKER_EXTRA: [] },
    Worker: class { constructor() { this.terminated = 0; this.posted = []; made.push(this); }
      postMessage(m) { this.posted.push(m.type); } terminate() { this.terminated++; } } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/track/build-client.js"), "utf8"), ctx, { filename: "build-client.js" });
  const C = vm.runInContext("TrackBuildClient", ctx);
  C.set(true);
  assert.equal(made.length, 1, "on: the worker spawns and parses the build modules now");
  assert.deepEqual(made[0].posted, ["init"]);
  C.set(false);
  assert.equal(made[0].terminated, 1, "off: the worker is terminated, not kept for the session");
  C.set(false);
  assert.equal(made[0].terminated, 1, "a second off is a no-op");
  C.set(true);
  assert.equal(made.length, 2, "on again spawns a fresh worker");
  assert.equal(made[1].terminated, 0);
});

test("a replay whose upload throws frees the handles it had already made", async () => {
  const def = Tracks.LIST.find((d) => d.id === "monza");
  worker.posted.length = 0;
  await worker.send({ type: "build", seq: 3, idx: MANIFEST.CIRCUITS.indexOf("monza"), id: "monza", opts: { chunkRibbons: true, retainGraph: false } });
  const msg = worker.posted[0];
  const made = [], freed = [];
  let n = 0;
  const make = (kind) => { const h = { kind, chunks: kind === "chunked" ? [1] : undefined }; made.push(h); return h; };
  const gfx = {
    createMesh: () => { if (++n === 3) throw new RangeError("Array buffer allocation failed"); return make("mesh"); },
    createChunkedMesh: () => make("chunked"),
    createInstancedBatch: () => make("inst"),
    freeMesh: (h) => freed.push(h), freeChunkedMesh: (h) => freed.push(h), freeInstancedBatch: (h) => freed.push(h),
  };
  await assert.rejects(main.TrackBuildClient.replay(msg, def, gfx), /allocation/);
  assert.ok(made.length >= 2, "uploads landed before the throw");
  assert.deepEqual(made.filter((h) => !freed.includes(h)), [], "every handle the failed replay made was freed");
});

// ── THE SAME WORLD, WITH WHAT A PAGE HAS (2026-10-04) ──────────────────────
// Everything above runs both sides WITHOUT the baked model pack, PitSigns or a
// player's MY TEAM — so it could not see that the worker built a different
// world: no baked models (assets.js was not in its list), no bay signs
// (replay never uploaded them) and the default MY TEAM bay (the page's row
// lives in localStorage). Here the PAGE context has all three, the worker is
// driven through TrackBuildClient.build (a bridged Worker, structured clones
// both ways), and the replayed world must equal a synchronous build's.
const diskFetch = (needAbsolute) => async (u) => {
  const s = String(u);
  // A real worker resolves "assets/pack/…" against js/track/build-worker.js:
  // refuse relative URLs there, so the page-base shim is what makes it work.
  if (needAbsolute && !/^https?:\/\//.test(s)) return { ok: false, status: 404 };
  const rel = s.replace(/^https?:\/\/[^/]+\//, "").replace(/\?.*$/, "");
  let b;
  try { b = fs.readFileSync(path.join(ROOT, rel)); } catch (_) { return { ok: false, status: 404 }; }
  return { ok: true, json: async () => JSON.parse(b.toString("utf8")), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
const tick = () => new Promise((r) => setTimeout(r, 0));
function pageWithWorker({ workerPack = true, workerRefuses = () => false } = {}) {
  const T = buildContext(null, { quiet: true, instancing: true });
  const page = T._vmContext;
  Object.assign(page, { setTimeout, clearTimeout, performance, URL, fetch: diskFetch(false),
    location: { href: "http://x/index.html" }, document: { querySelectorAll: () => [], readyState: "complete" },
    localStorage: { getItem: (k) => (k === "apex26.buildWorker" ? "1" : null), setItem() {} },
    ApexRoster: { TRACK_VM: vmFiles, TRACK_WORKER_EXTRA: MANIFEST.TRACK_WORKER_EXTRA } });
  for (const f of ["js/render/shared/assets.js", "js/track/build-client.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), page, { filename: f });
  const posts = [], workerFetched = [], workers = [];
  page.Worker = class {
    constructor() {
      const me = this;
      const wctx = vm.createContext({ performance, console, URL, setTimeout, clearTimeout,
        fetch: workerPack ? async (u) => { workerFetched.push(String(u)); return workerRefuses(String(u)) ? { ok: false, status: 404 } : diskFetch(true)(u); }
          : async () => ({ ok: false, status: 404 }),
        postMessage: (m) => { const d = structuredClone(m); setTimeout(() => me.onmessage && me.onmessage({ data: d }), 0); } });
      wctx.self = wctx;
      wctx.importScripts = (...files) => {
        for (const f of files) {
          const rel = f.replace(/^https?:\/\/[^/]+\//, "").replace(/\?.*$/, "");
          vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), wctx, { filename: rel });
        }
      };
      vm.runInContext(fs.readFileSync(path.join(ROOT, "js/track/build-worker.js"), "utf8"), wctx);
      this.wctx = wctx;
      workers.push(this);
    }
    postMessage(m) { posts.push(m.type); const d = structuredClone(m); setTimeout(() => this.wctx.onmessage({ data: d }), 0); }
    terminate() {}
  };
  // The player's saved team, spliced in the way custom-team.js does it.
  const mine = Object.assign(JSON.parse(JSON.stringify(page.Teams.DEFAULT_CUSTOM)),
    { name: "ZEPHYR RACING", short: "ZEP", color: [0.9, 0.1, 0.5] });
  page.Teams.LIST.push(mine);
  // Bay signs: the real painter needs a canvas, so record what it was handed.
  page.PitSigns = {
    upload(G, t) {
      if (!t.pitSigns) return false;
      t.meshes.pitSigns = G.createMesh({ pos: t.pitSigns.pos, nrm: t.pitSigns.nrm, idx: t.pitSigns.idx });
      t.meshes.pitSignTex = "atlas:" + t.pit.row.boxes.map((b) => b.name).join("|");
      return true;
    },
    free() {},
  };
  return { T, page, posts, workerFetched, workers };
}
// The baked-model ids a circuit's scenery closure names (its per-circuit set).
const circuitIds = (page, id) => page.Assets.modelIds(String(page.TrackScenery[id]));

test("worker world == main-thread world WITH baked models, pit signs and MY TEAM", async () => {
  const { T, page } = pageWithWorker();
  const id = "monza", def = T.LIST.find((d) => d.id === id);
  const resident = await page.Assets.loadModels();
  assert.ok(resident > 20, `premise: the page holds the baked pack (${resident} models)`);
  const a = recorder();
  const tA = T.build(def, { gfx: a.gfx, chunkRibbons: true, retainGraph: false });
  assert.match(String(tA.meshes.pitSignTex), /ZEPHYR RACING/, "premise: the page's own build carries MY TEAM's bay");

  const b = recorder();
  const msg = await page.TrackBuildClient.build(MANIFEST.CIRCUITS.indexOf(id), def,
    { chunkRibbons: true, retainGraph: false }, b.gfx, MANIFEST.sceneryPath(id));
  assert.ok(msg, "the worker answered a world");
  assert.deepEqual([...msg.models].sort(), [...circuitIds(page, id)].sort(), "the worker holds every model this circuit names, by id");
  const tB = await page.TrackBuildClient.replay(msg, def, b.gfx);
  assert.deepEqual(b.log, a.log, "every upload — baked models and the bay-sign mesh included — in order, byte-identical");
  assert.equal(tB.meshes.pitSignTex, tA.meshes.pitSignTex, "the bay signs carry the page's MY TEAM row");
  assert.deepEqual(physics(tB), physics(tA), "the physics arrays match");

  // And the pack is what made the difference: an asset-less build differs.
  const bare = buildContext(null, { quiet: true, instancing: true });
  const c = recorder();
  bare.build(bare.LIST.find((d) => d.id === id), { gfx: c.gfx, chunkRibbons: true, retainGraph: false });
  assert.notDeepEqual(c.log, a.log, "premise: the baked models change the uploads");
});

test("the worker's reply carries no terrain lookup cache (bug-hunt 6.7)", async () => {
  const { T, page } = pageWithWorker();
  const id = "monza", def = T.LIST.find((d) => d.id === id);
  await page.Assets.loadModels();
  const msg = await page.TrackBuildClient.build(MANIFEST.CIRCUITS.indexOf(id), def, { chunkRibbons: true, retainGraph: false }, recorder().gfx, MANIFEST.sceneryPath(id));
  assert.ok(msg, "the worker answered a world");
  // terrainGrid() (tracks.js) rebuilds this on first use: the cell lists were structured-cloned for nothing.
  assert.ok(!msg.track._terrGrid, "no _terrGrid in the post");
  console.log("props.list size on " + id + ": " + (msg.track.props && msg.track.props.list ? msg.track.props.list.length : "n/a"));
});

test("a worker holding fewer models than the page answers null (build in steps)", async () => {
  const { T, page } = pageWithWorker({ workerPack: false });
  await page.Assets.loadModels();
  const def = T.LIST.find((d) => d.id === "vegas");
  const msg = await page.TrackBuildClient.build(MANIFEST.CIRCUITS.indexOf("vegas"), def, { chunkRibbons: true }, recorder().gfx, MANIFEST.sceneryPath("vegas"));
  assert.equal(msg, null, "a poorer world is refused, not adopted");
});

// #908 + #915: the worker fetches only THIS circuit's models (never the whole
// pack), and the page compares the answer BY ID: a worker that hit its cap
// holding many models — but not the circuit's — must not pass on a count.
test("the worker fetches only the circuit's own models, none at init", async () => {
  const { T, page, workerFetched } = pageWithWorker();
  const id = "monza", def = T.LIST.find((d) => d.id === id);
  await page.Assets.modelsReady(0, String(page.TrackScenery[id]));
  const want = circuitIds(page, id);
  assert.ok(want.length > 0 && want.length < page.Assets.models().length, `premise: ${id} names a strict subset of the pack (${want.length})`);
  assert.equal(await page.TrackBuildClient.spawn(), true);
  assert.deepEqual(workerFetched.filter((u) => /\.ax26|models\//.test(u)), [], "init prefetches no model");
  const msg = await page.TrackBuildClient.build(MANIFEST.CIRCUITS.indexOf(id), def, { chunkRibbons: true, retainGraph: false }, recorder().gfx, MANIFEST.sceneryPath(id));
  assert.ok(msg, "the worker answered a world");
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/pack/manifest.json"), "utf8"));
  const files = new Set(want.map((m) => man.models[m].file));
  const modelFetches = workerFetched.filter((u) => Object.values(man.models).some((r) => u.endsWith("/" + r.file)));
  assert.ok(modelFetches.length > 0, "premise: the worker fetched its models");
  for (const u of modelFetches) assert.ok([...files].some((f) => u.endsWith("/" + f)), "fetched only this circuit's model: " + u);
  assert.deepEqual([...msg.models].sort(), [...want].sort());
});

test("a worker missing one of the circuit's model ids answers null, whatever its count", async () => {
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/pack/manifest.json"), "utf8"));
  const id = "monza";
  let want = null;
  const { T, page, workers } = pageWithWorker({ workerRefuses: (u) => want && u.endsWith("/" + man.models[want[0]].file) });
  const def = T.LIST.find((d) => d.id === id);
  await page.Assets.modelsReady(0, String(page.TrackScenery[id]));
  want = circuitIds(page, id);
  assert.ok(want.every((m) => page.Assets.modelSync(m)), "premise: the page holds all of the circuit's models");
  // The worker stopped at its cap with a pile of OTHER circuits' models: more
  // than the page's count, so the old count check (#908) would have passed it.
  assert.equal(await page.TrackBuildClient.spawn(), true);
  const W = workers[0].wctx.Assets, others = Object.keys(man.models).filter((m) => !want.includes(m));
  await Promise.all(others.map((m) => W.model(m)));
  const have = W.models().filter((m) => W.modelSync(m)).length;
  assert.ok(have >= want.length, `premise: the worker's count (${have}) is not below the circuit's (${want.length})`);
  const msg = await page.TrackBuildClient.build(MANIFEST.CIRCUITS.indexOf(id), def, { chunkRibbons: true }, recorder().gfx, MANIFEST.sceneryPath(id));
  assert.equal(msg, null, "the missing id is refused; the page builds in steps");
});

test("a custom circuit never goes to the worker", async () => {
  const { page, posts } = pageWithWorker();
  const msg = await page.TrackBuildClient.build(60, { id: "my-loop", custom: true }, {}, recorder().gfx, null);
  assert.equal(msg, null);
  assert.deepEqual(posts, [], "no init, no build: the round-trip is skipped");
  await tick();
});

function smallClient(extra = {}) {
  const ctx = vm.createContext({ URL, performance, setTimeout, clearTimeout,
    location: { href: "https://apex.test/index.html" },
    document: { readyState: "complete", querySelectorAll: () => [] },
    localStorage: { getItem: () => "1" }, ApexRoster: { TRACK_VM: ["missing.js"] },
    Log: { info() {}, warn() {} }, TrackSurface: { profile: () => ({}) }, ...extra });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/track/build-client.js"), "utf8"), ctx);
  return ctx.TrackBuildClient;
}

test("caught worker import failure settles the build, drops the worker and allows a retry", async () => {
  const workers = [];
  class Bridge {
    constructor() {
      workers.push(this);
      const me = this, failImport = workers.length === 1;
      this.ctx = vm.createContext({
        importScripts() { if (failImport) throw new Error("import unavailable"); },
        postMessage(data) { queueMicrotask(() => me.onmessage({ data })); },
      });
      this.ctx.self = this.ctx;
      vm.runInContext(fs.readFileSync(path.join(ROOT, "js/track/build-worker.js"), "utf8"), this.ctx);
    }
    postMessage(data) { void this.ctx.onmessage({ data }); }
    terminate() { this.terminated = true; }
  }
  const c = smallClient({ Worker: Bridge });
  const build = c.build(0, { id: "monza" }, {}, {}, null);
  assert.equal(c.busy(), true);
  // Let the actual worker's caught, unsequenced error reach the page. Checking
  // settlement before awaiting keeps this regression from hanging the suite.
  let settled = false;
  build.then(() => { settled = true; });
  await tick();
  assert.equal(settled, true, "initialization error must release the main-thread fallback");
  assert.equal(await build, null);
  assert.equal(c.busy(), false);
  assert.equal(workers[0].terminated, true);
  assert.equal(await c.spawn(), true, "a later request can initialize a fresh worker");
  workers[0].onerror({ message: "late old error" });
  assert.equal(workers[1].terminated, undefined, "an obsolete worker cannot drop its replacement");
});

test("synchronous init post failure and unreadable replies also settle readiness", async () => {
  for (const failure of ["post", "decode"]) {
    let worker;
    const c = smallClient({ Worker: class {
      constructor() { worker = this; }
      postMessage() {
        if (failure === "post") throw new Error("post refused");
        queueMicrotask(() => this.onmessageerror());
      }
      terminate() { this.terminated = true; }
    } });
    assert.equal(await c.build(0, { id: "monza" }, {}, {}, null), null);
    assert.equal(c.busy(), false);
    assert.equal(worker.terminated, true);
  }
});

// A settle probe: "pending" when `p` has not settled after a few ticks (never hangs the suite).
const settleOf = async (p) => { let out = "pending"; p.then((v) => { out = v; }); for (let i = 0; i < 5; i++) await tick(); return out; };

test("turning BUILD IN BACKGROUND off while the worker boots settles the awaiting build (bug-hunt 6.3)", async () => {
  let worker;
  const c = smallClient({ Worker: class { constructor() { worker = this; } postMessage() { /* boots slowly: never answers */ } terminate() { this.terminated = true; } } });
  const build = c.build(0, { id: "monza" }, {}, {}, null);
  await tick();
  assert.equal(c.busy(), true);
  c.set(false);
  assert.equal(await settleOf(build), null, "the build resolves null so loadTrackStepped builds in steps");
  assert.equal(c.busy(), false);
  assert.equal(worker.terminated, true);
});

test("a worker that never answers a build is dropped after the watchdog (bug-hunt 6.4)", async () => {
  const timers = [];
  let worker;
  const c = smallClient({
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
    Worker: class {
      constructor() { worker = this; }
      postMessage(m) { if (m.type === "init") queueMicrotask(() => this.onmessage({ data: { type: "ready" } })); /* a build is never answered */ }
      terminate() { this.terminated = true; }
    } });
  const build = c.build(0, { id: "monza" }, {}, {}, null);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const dog = timers.filter((t) => t.live && t.ms >= 10000 && t.ms <= 60000);
  assert.equal(dog.length, 1, "one watchdog timer of 10-60 s is armed: " + JSON.stringify(timers.map((t) => t.ms)));
  dog[0].fn();
  assert.equal(await settleOf(build), null);
  assert.equal(c.busy(), false);
  assert.equal(worker.terminated, true);
});

test("a throw while reading the worker's reply settles the build instead of stranding it (bug-hunt 6.4)", async () => {
  let thrown = null;
  const c = smallClient({
    Assets: { modelIds() { throw new Error("scenery source unreadable"); }, modelSync() { return true; } },
    Worker: class {
      postMessage(m) {
        const reply = m.type === "init" ? { type: "ready" } : { type: "built", seq: m.seq, id: m.id, models: [] };
        queueMicrotask(() => { try { this.onmessage({ data: reply }); } catch (e) { thrown = e; } });
      }
      terminate() {}
    } });
  const build = c.build(0, { id: "monza" }, {}, {}, null);
  assert.equal(await settleOf(build), null);
  assert.equal(thrown, null, "the reply handler does not throw");
  assert.equal(c.busy(), false);
});

for (const failure of ["fallback", "surface", null]) {
  test(`replay owns fallback resources through reconstruction (${failure || "success"})`, async () => {
    const made = [], freed = [];
    const c = smallClient({ TrackSurface: { profile() {
      if (failure === "surface") throw new Error("surface allocation");
      return {};
    } } });
    const make = (kind) => { const h = { kind, chunks: kind === "chunked" ? [] : undefined }; made.push(h); return h; };
    let meshes = 0;
    const gfx = {
      createMesh() { if (++meshes === 2 && failure === "fallback") throw new Error("fallback allocation"); return make("mesh"); },
      createChunkedMesh: () => make("chunked"),
      freeMesh: (h) => freed.push(h), freeChunkedMesh: (h) => freed.push(h),
    };
    const msg = { track: { meshes: { props: { __rec: 0 }, roadChunked: { __rec: 1, chunks: [1] } }, buildProfile: [] },
      recs: [{ op: "mesh", args: [{}] }, { op: "chunked", args: [{}] }], ms: 1 };
    if (failure) {
      await assert.rejects(c.replay(msg, { id: "monza" }, gfx), new RegExp(failure + " allocation"));
      assert.deepEqual(new Set(freed), new Set(made), "all earlier and replacement handles are freed");
      assert.equal(freed.length, made.length, "each handle is freed exactly once");
    } else {
      const t = await c.replay(msg, { id: "monza" }, gfx);
      assert.deepEqual(freed, [made[1]], "only the replaced empty chunk is released on success");
      assert.equal(t.meshes.road, made[2]);
      assert.equal(t.meshes.props, made[0]);
      assert.equal(t.meshes.roadChunked, null);
    }
  });
}
