/* Apex 26 — the track build in a Worker. Ships ON by default when the page
   reports a spare core (apex26.buildWorker "1"/"0" forces on/off); see
   TrackBuildClient.enabled and MULTITHREADING-PLAN-2026-09-16.md.

   A classic worker, not a module: it importScripts the SAME files the page
   runs (ApexRoster.TRACK_VM, the tools/manifest.cjs TRACK_VM list the Node VM
   builds with), so the build is the unchanged Tracks.build. Its gfx is a
   RECORDER: each createMesh / createChunkedMesh / createInstancedBatch stores
   its arguments and returns a token, and the page replays the tokens against
   the real backend (TrackBuildClient.replay) — immutable TLX packing and bins are prepared here when requested;
   THREE containers and GPU ownership stay on the main thread. Everything the page cannot receive is
   stripped before the post: the gfx handle, the surface sampler (rebuilt by
   the page from the def) and the lazy node grid.

   It also imports TRACK_WORKER_EXTRA (assets.js): the build waits for THIS
   circuit's baked models as the page's does (Assets.modelsReady(ms, src), the
   ids its scenery closure names, 4 s cap — never the whole pack, #915), and
   reports WHICH of those ids it holds so the page can refuse a poorer world
   by id (#908: a count let 30 unrelated models stand in for the circuit's 6).
   The page's MY TEAM row arrives with each build and replaces the default. */
"use strict";
self.window = self;
let _loaded = false;
const _scenery = new Set();
const IMPORT_RETRY_MS = [400, 1200];
function importScriptUrl(u, bust) {
  if (!bust) return u;
  return u + (u.indexOf("?") >= 0 ? "&" : "?") + "retry=" + bust;
}
// Chromium follows the HTML steps: importScripts fetches one URL, runs it,
// then fetches the next (https://html.spec.whatwg.org/multipage/workers.html#dom-workerglobalscope-importscripts).
// A parallel fetch of the same URLs fills the HTTP cache the following
// importScripts reads. Measured in headless Chromium, 40 files delayed 40 ms
// each: 1678 ms one-at-a-time, 1670 ms in one importScripts(...) call, 322 ms
// when fetch ran first, and the server saw one hit per file (the import was a
// cache hit, not a second download). One URL has nothing to overlap.
async function warmScriptCache(list) {
  if (list.length < 2 || typeof fetch !== "function") return 0;
  const t0 = performance.now();
  await Promise.all(list.map(async (u) => {
    const res = await fetch(u, { credentials: "same-origin" });
    if (!res || !res.ok) {
      const err = new Error("HTTP " + (res && res.status));
      err.name = "NetworkError";
      throw err;
    }
    if (typeof res.arrayBuffer === "function") await res.arrayBuffer();
  }));
  return performance.now() - t0;
}
async function importScriptsRetry(urls) {
  const list = Array.isArray(urls) ? urls : [urls];
  let warmMs = 0;
  try { warmMs = await warmScriptCache(list); }
  catch (_) { /* a failed warm leaves the per-URL retry below to cache-bust */ }
  const nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : 0);
  const tImport = nowMs();
  // importScripts evaluates in order. Retry only the failed URL: replaying a
  // successful prefix redeclares its top-level consts in this worker global.
  for (const u of list) for (let attempt = 0; ; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, IMPORT_RETRY_MS[attempt - 1]));
    try { importScripts(importScriptUrl(u, attempt)); break; }
    catch (e) {
      // Evaluation may already have changed the global. Only a failed fetch is
      // safe to retry in place; syntax/runtime failures use the page fallback.
      if (!e || e.name !== "NetworkError" || attempt >= IMPORT_RETRY_MS.length) throw e;
    }
  }
  return { warmMs, importMs: nowMs() - tImport, files: list.length };
}

// Relative URLs resolve against the PAGE (init's `base`), not this script:
// assets.js fetches "assets/pack/…", which from js/track/ would 404.
function pageRelativeFetch(base) {
  const f = self.fetch;
  if (!base || typeof f !== "function") return;
  self.fetch = (u, o) => f.call(self, typeof u === "string" ? new URL(u, base).href : u, o);
}

// The page's MY TEAM entry in place of this worker's default (or none).
function adoptTeam(team) {
  if (!team || typeof Teams === "undefined" || !Array.isArray(Teams.LIST)) return;
  const i = Teams.LIST.findIndex((t) => t && t.id === team.id);
  if (i >= 0) Teams.LIST.splice(i, 1, team); else Teams.LIST.push(team);
}

// The scenery closure's source text: the model ids it names are this
// circuit's set (Assets.modelIds), exactly as js/core/lazy-bundles.js derives it.
function scenerySrc(def) {
  const fn = def.scenery || (self.TrackScenery && self.TrackScenery[def.id]);
  return fn ? String(fn) : "";
}
// Which of this circuit's model ids are resident here — what the build stamped.
const residentModels = (src) => (typeof Assets === "undefined" || !Assets.modelIds ? []
  : Assets.modelIds(src).filter((id) => Assets.modelSync(id)));

// Every ArrayBuffer under `root`, once each: transferred, not copied.
function transferables(root) {
  const out = new Set(), seen = new Set(), stack = [root];
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== "object" || seen.has(o)) continue;
    seen.add(o);
    if (ArrayBuffer.isView(o)) { if (o.buffer instanceof ArrayBuffer) out.add(o.buffer); continue; }
    if (o instanceof ArrayBuffer) { out.add(o); continue; }
    for (const k in o) stack.push(o[k]);
  }
  return [...out];
}

// Road and terrain are built as plain JS arrays (js/track/core/mesh.js); only
// ArrayBuffers transfer, so the page used to deserialize ~1M doubles element
// by element in one task when the answer landed (spa/monza/vegas ~28 ms here,
// ~85-90 ms on a phone; perf hunt 2 T7). Re-typed here, off the main thread:
// Float64Array holds the same doubles and Uint32Array the same indices, so
// every upload and every reader (terrainY, debris trimesh, __apex) sees the
// same numbers; a main-thread build still hands them plain arrays, so readers
// take both. A channel holding anything but a number (or a non-u32 index) is
// left as it is.
const isU32 = (v) => v >= 0 && v <= 4294967295 && v === Math.floor(v);
function typedRibbon(geo) {
  if (!geo) return;
  for (const k of ["pos", "nrm", "col", "uv", "mat", "trk", "idx"]) {
    const a = geo[k];
    if (!Array.isArray(a)) continue;
    let ok = true;
    if (k === "idx") { for (let i = 0; i < a.length && ok; i++) ok = isU32(a[i]); }
    else { for (let i = 0; i < a.length && ok; i++) ok = typeof a[i] === "number"; }
    if (ok) geo[k] = k === "idx" ? Uint32Array.from(a) : Float64Array.from(a);
  }
}
// Every mesh the reply carries, not only the road and terrain. A props or pit
// channel left as a plain array is structured-cloned element by element on the
// page when the answer lands (monza still had ~610 KB of those; vegas ~500 KB).
function typePostedChannels(track, recs) {
  const geos = track ? [track.roadGeo, track.terrainGeo, track.propsGeo, track.pitSigns, track.pitSignal] : [];
  for (const r of recs || []) if (r && r.args) geos.push(r.args[0]);
  for (const g of geos) typedRibbon(g);
}

// Only opted-in callers require a page permit. Cancellation while model
// readiness is pending avoids Tracks.build; its synchronous body cannot be
// interrupted by later messages. Independent callers have no latest-wins rule.
const _jobs = new Map();
async function build(m, job) {
  const recs = [];
  const rec = (op) => (...args) => {
    const n = recs.length;
    recs.push({ op, args });
    // A chunked upload answers "chunked": the build branches on .chunks, and the
    // page re-seats a mesh its backend did not chunk (TrackBuildClient.replay).
    return op === "chunked" ? { __rec: n, chunks: [n] } : { __rec: n };
  };
  const gfx = {
    createMesh: rec("mesh"), createChunkedMesh: rec("chunked"), createInstancedBatch: rec("inst"),
    mobileTier: !!m.mobileTier, chunkedTrackCoords: m.chunkedTrackCoords,
  };
  if (m.scenery && !_scenery.has(m.scenery)) { await importScriptsRetry(m.scenery); _scenery.add(m.scenery); }
  const def = Tracks.LIST[m.idx];
  if (!def || def.id !== m.id) throw new Error("worker track list differs at " + m.idx + " (" + (def && def.id) + " != " + m.id + ")");
  adoptTeam(m.team);
  const src = scenerySrc(def);
  if (typeof Assets !== "undefined" && Assets.modelsReady) await Assets.modelsReady(0, src);
  if (job.cancelled) return;
  if (m.checkLive) {
    const permitted = new Promise((resolve) => { job.permit = resolve; });
    self.postMessage({ type: "buildReady", seq: m.seq });
    if (!(await permitted) || job.cancelled) return;
  }
  adoptTeam(m.team); // readiness waits may have let another job change MY TEAM
  const t0 = performance.now();
  const track = Tracks.build(def, Object.assign({}, m.opts, { gfx, retainRibbonCpu: true }));
  const ms = performance.now() - t0;
  track._gfx = null; track.surface = null; track._nodeGrid = null; track.graph = null; track.def = null;
  // track._terrGrid (tracks.js terrainGrid) rides along: flat typed arrays, so
  // it transfers for free, and its geo still IS track.terrainGeo after the clone
  // (structured clone keeps shared references) — the page's first terrainY
  // (flyby groundAt, lamp bake) no longer rebuilds it in a 10-60 ms long task.
  typePostedChannels(track, recs);
  const prepareStart = performance.now();
  const S = self.TLXShaders, config = m.prepare;
  // Bound additional typed payload across this reply, retaining raw inputs for
  // a safe old-client/config-change fallback. No extra worker or record clones.
  let preparationBytes = 0;
  if (S && S.validPrepareConfig(config)) {
    // Spend the bounded extra storage on the largest CPU operation first:
    // terrain can precede props in replay order and otherwise crowd it out.
    const candidates = recs.filter(r => r.op === "chunked").map(r => ({ r,
      estimate: r.args[0].pos.length / 3 * 60 + r.args[0].idx.length * 64 }));
    candidates.sort((a, b) => b.estimate - a.estimate);
    for (const { r, estimate } of candidates) {
      if (estimate > 64 * 1048576 - preparationBytes) continue;
      r.prepared = S.prepareChunks(r.args[0], r.args[1], config);
      r.prepared.workerPacking = true;
      preparationBytes += estimate;
    }
  }
  const prepareMs = performance.now() - prepareStart;
  // def._sceneryShift is written onto the WORKER's def copy by buildCenterline
  // (tracks.js); the main-thread def never sees it, so every later reader there
  // (scenery reloads, frac-keyed tables, agent hooks) read 0. Send it back,
  // with _startFrac (same story, tracks.js).
  const msg = { type: "built", id: m.id, seq: m.seq, track, recs, ms, prepareMs, preparationBytes, sceneryShift: def._sceneryShift, startFrac: def._startFrac, models: residentModels(src) };
  const transfers = transferables(msg);
  msg.cpuMs = performance.now() - t0;
  self.postMessage(msg, transfers);
}

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.type === "init") {
      if (!_loaded) {
        pageRelativeFetch(m.base);
        const timing = await importScriptsRetry(m.files);
        _loaded = true;   // no model prefetch: each build fetches its own circuit's set
        self.postMessage({ type: "ready", warmMs: timing.warmMs, importMs: timing.importMs, files: timing.files });
        return;
      }
      self.postMessage({ type: "ready" });
    } else if (m.type === "buildPermit") {
      const job = _jobs.get(m.seq);
      if (job) {
        if (!m.live) job.cancelled = true;
        if (job.permit) job.permit(!!m.live);
      }
    } else if (m.type === "build") {
      const job = { cancelled: false, permit: null };
      _jobs.set(m.seq, job);
      try { await build(m, job); } finally { _jobs.delete(m.seq); }
    } else if (m.type === "preview") {
      // Race-select hero: centreline-only, no meshes / GPU. The page adopts the
      // typed arrays into Tracks.previewCL so TrackMaps.compute stays off the
      // open's long task (D·DP5 / iPhone 15 hitch).
      const def = Tracks.LIST[m.idx];
      if (!def || def.id !== m.id) throw new Error("worker track list differs at " + m.idx + " (" + (def && def.id) + " != " + m.id + ")");
      if (def._metaOnly || !(def.path && def.path.pts && def.path.pts.length)) {
        self.postMessage({ type: "preview", seq: m.seq, id: m.id, track: null });
        return;
      }
      const tr = Tracks.buildCenterline(def, { line: false });
      const track = {
        total: tr.total, n: tr.n, map: tr.map, street: !!tr.street, line: null,
        px: tr.px, py: tr.py, pz: tr.pz, tx: tr.tx, ty: tr.ty, tz: tr.tz,
        rx: tr.rx, ry: tr.ry, rz: tr.rz, hw: tr.hw, bank: tr.bank, curv: tr.curv,
        bankP: tr.bankP, meshes: {},
      };
      const msg = { type: "preview", seq: m.seq, id: def.id, track };
      // Transfer detaches the typed arrays — drop the worker-side preview cache
      // so a later preview of the same id rebuilds instead of returning neutered buffers.
      if (Tracks.forgetPreviewCenterline) Tracks.forgetPreviewCenterline(def.id);
      self.postMessage(msg, transferables(msg));
    }
  } catch (err) {
    self.postMessage({ type: "error", seq: m.seq, message: String((err && err.message) || err) });
  }
};
