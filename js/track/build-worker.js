/* Apex 26 — the track build in a Worker. Ships ON by default when the page
   reports a spare core (apex26.buildWorker "1"/"0" forces on/off); see
   TrackBuildClient.enabled and MULTITHREADING-PLAN-2026-09-16.md.

   A classic worker, not a module: it importScripts the SAME files the page
   runs (ApexRoster.TRACK_VM, the tools/manifest.cjs TRACK_VM list the Node VM
   builds with), so the build is the unchanged Tracks.build. Its gfx is a
   RECORDER: each createMesh / createChunkedMesh / createInstancedBatch stores
   its arguments and returns a token, and the page replays the tokens against
   the real backend (TrackBuildClient.replay) — packing and upload stay on the
   main thread, where the GPU context is. Everything the page cannot receive is
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

async function build(m) {
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
  if (m.scenery && !_scenery.has(m.scenery)) { importScripts(m.scenery); _scenery.add(m.scenery); }
  const def = Tracks.LIST[m.idx];
  if (!def || def.id !== m.id) throw new Error("worker track list differs at " + m.idx + " (" + (def && def.id) + " != " + m.id + ")");
  adoptTeam(m.team);
  const src = scenerySrc(def);
  if (typeof Assets !== "undefined" && Assets.modelsReady) await Assets.modelsReady(0, src);
  const t0 = performance.now();
  const track = Tracks.build(def, Object.assign({}, m.opts, { gfx }));
  const ms = performance.now() - t0;
  track._gfx = null; track.surface = null; track._nodeGrid = null; track.graph = null; track.def = null;
  // def._sceneryShift is written onto the WORKER's def copy by buildCenterline
  // (tracks.js); the main-thread def never sees it, so every later reader there
  // (scenery reloads, frac-keyed tables, agent hooks) read 0. Send it back,
  // with _startFrac (same story, tracks.js).
  const msg = { type: "built", id: m.id, seq: m.seq, track, recs, ms, sceneryShift: def._sceneryShift, startFrac: def._startFrac, models: residentModels(src) };
  self.postMessage(msg, transferables(msg));
}

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.type === "init") {
      if (!_loaded) {
        pageRelativeFetch(m.base);
        importScripts(...m.files);
        _loaded = true;   // no model prefetch: each build fetches its own circuit's set
      }
      self.postMessage({ type: "ready" });
    } else if (m.type === "build") {
      await build(m);
    }
  } catch (err) {
    self.postMessage({ type: "error", seq: m.seq, message: String((err && err.message) || err) });
  }
};
