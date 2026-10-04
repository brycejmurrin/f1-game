/* Apex 26 — the track build in a Worker. PROTOTYPE: apex26.buildWorker = "1",
   default OFF, until a real-hardware A/B (gpu-census, docs/notes/
   MULTITHREADING-PLAN-2026-09-16.md §7) says it pays on a phone.

   A classic worker, not a module: it importScripts the SAME files the page
   runs (ApexRoster.TRACK_VM, the tools/manifest.cjs TRACK_VM list the Node VM
   builds with), so the build is the unchanged Tracks.build. Its gfx is a
   RECORDER: each createMesh / createChunkedMesh / createInstancedBatch stores
   its arguments and returns a token, and the page replays the tokens against
   the real backend (TrackBuildClient.replay) — packing and upload stay on the
   main thread, where the GPU context is. Everything the page cannot receive is
   stripped before the post: the gfx handle, the surface sampler (rebuilt by
   the page from the def) and the lazy node grid. */
"use strict";
self.window = self;
let _loaded = false;
const _scenery = new Set();

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

function build(m) {
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
  const t0 = performance.now();
  const track = Tracks.build(def, Object.assign({}, m.opts, { gfx }));
  const ms = performance.now() - t0;
  track._gfx = null; track.surface = null; track._nodeGrid = null; track.graph = null; track.def = null;
  // def._sceneryShift is written onto the WORKER's def copy by buildCenterline
  // (tracks.js); the main-thread def never sees it, so every later reader there
  // (scenery reloads, frac-keyed tables, agent hooks) read 0. Send it back,
  // with _startFrac (same story, tracks.js).
  const msg = { type: "built", id: m.id, seq: m.seq, track, recs, ms, sceneryShift: def._sceneryShift, startFrac: def._startFrac };
  self.postMessage(msg, transferables(msg));
}

self.onmessage = (e) => {
  const m = e.data || {};
  try {
    if (m.type === "init") {
      if (!_loaded) { importScripts(...m.files); _loaded = true; }
      self.postMessage({ type: "ready" });
    } else if (m.type === "build") {
      build(m);
    }
  } catch (err) {
    self.postMessage({ type: "error", seq: m.seq, message: String((err && err.message) || err) });
  }
};
