/* Apex 26 — the page side of the track build Worker (js/track/build-worker.js).
   PROTOTYPE behind apex26.buildWorker = "1", default OFF: spawn() is called
   when RACE SETTINGS opens so the worker's own parse of the build modules is
   done before RACE!; build() posts one circuit and resolves the worker's
   answer; replay() turns its recorded uploads into real gfx calls on the
   main thread and rebuilds what could not cross (the surface sampler, the
   def, the gfx handle). Any failure answers null and the caller builds in
   steps instead (loadTrackStepped) — the worker only ever saves time. */
const TrackBuildClient = (function () {
  "use strict";
  const KEY = "apex26.buildWorker";
  let _w = null, _ready = null, _seq = 0;
  const _pending = new Map();

  function enabled() {
    try { return localStorage.getItem(KEY) === "1"; } catch (_) { return false; }
  }
  // BUILD IN BACKGROUND (pause > SETTINGS, with the renderer levers): the same key,
  // raw lane, "1"/"0". It takes effect on the next build: loadTrackStepped reads it.
  function set(on) {
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (_) { /* private mode: the row still reads back what stuck */ }
    if (on) spawn();   // parse the build modules now, not at the next RACE!
  }
  function initUI() {
    if (typeof SettingRow === "undefined" || !document.getElementById("pm-buildworker")) return;
    SettingRow.wire("pm-buildworker", { values: SettingRow.labels(["off", "on"]), read: () => (enabled() ? "on" : "off"), write: (v) => set(v === "on") });
  }
  // DOMContentLoaded, not "now": this file is a deferred tag that runs BEFORE
  // js/ui/setting-row.js, while readyState already reads "interactive".
  if (typeof document !== "undefined") {
    if (document.readyState === "complete") initUI();
    else document.addEventListener("DOMContentLoaded", initUI, { once: true });
  }
  const url = (f) => new URL(f + "?v=" + (window.__APEX_BUILD || 0), location.href).href;
  // Every build module is a page <script>: import it by the page's OWN src (its
  // deploy-time content hash), so the worker's fetch is a cache hit, not a
  // second download under a ?v= key nothing seeded.
  function pageUrls(files) {
    const own = new Map();
    for (const el of document.querySelectorAll("script[src]")) {
      const u = new URL(el.src, location.href);
      own.set(u.pathname.replace(/^.*?\/(js\/)/, "$1"), u.href);
    }
    return files.map((f) => own.get(f) || url(f));
  }

  function drop(why) {
    for (const p of _pending.values()) p.resolve(null);
    _pending.clear();
    try { if (_w) _w.terminate(); } catch (_) { /* already gone */ }
    _w = null; _ready = null;
    Log.warn("track", "build worker off: " + why);
  }

  // Idempotent. Resolves true once every build module has loaded in the worker.
  function spawn() {
    if (_ready) return _ready;
    const files = typeof ApexRoster !== "undefined" && ApexRoster.TRACK_VM;
    if (!enabled() || typeof Worker === "undefined" || !files) return null;
    try { _w = new Worker(url("js/track/build-worker.js")); } catch (e) { drop("spawn " + e.message); return null; }
    let ok;
    _ready = new Promise((res) => { ok = res; });
    _w.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "ready") { ok(true); return; }
      const p = _pending.get(m.seq);
      if (!p) return;
      _pending.delete(m.seq);
      if (m.type === "built") p.resolve(m);
      else { Log.warn("track", "build worker failed: " + m.message); p.resolve(null); }
    };
    _w.onerror = (e) => { ok(false); drop("error " + ((e && e.message) || "")); };
    _w.postMessage({ type: "init", files: pageUrls(files) });
    return _ready;
  }

  // One circuit, built off the main thread. Resolves the worker's message
  // ({track, recs, ms}) or null (off or failed). The scenery graph cannot cross
  // (its nodes carry methods), so a build that asked to retain it for the agent
  // surface (__apex.trackGraph) arrives without one — said once, since every
  // probe and the gpu-census A/B run with that surface on.
  // One worker, one build at a time: the menu's idle build and RACE!'s build of
  // the same world share one request instead of queueing a second behind it.
  let _graphNoted = false, _inflight = 0, _last = null;
  async function build(idx, def, opts, gfx, sceneryFile) {
    if (!enabled()) return null;
    const key = [def.id, opts.night, opts.gridSlots, !!opts.chunkRibbons, !!gfx.mobileTier].join("|");
    if (!_last || _last.key !== key) _last = { key, p: post(idx, def, opts, gfx, sceneryFile) };
    const mine = _last;
    _inflight++;
    try { return await mine.p; } finally { _inflight--; if (_last === mine) _last = null; }
  }
  async function post(idx, def, opts, gfx, sceneryFile) {
    if (opts && opts.retainGraph && !_graphNoted) { _graphNoted = true; Log.info("track", "build worker: scenery graph not retained (__apex.trackGraph is null)"); }
    const r = spawn();
    if (!r || !(await r) || !_w) return null;
    const seq = ++_seq;
    return new Promise((resolve) => {
      _pending.set(seq, { resolve });
      _w.postMessage({
        type: "build", seq, idx, id: def.id,
        opts: { night: opts.night, gridSlots: opts.gridSlots, chunkRibbons: !!opts.chunkRibbons, retainGraph: false },
        mobileTier: !!gfx.mobileTier, chunkedTrackCoords: gfx.chunkedTrackCoords,
        scenery: sceneryFile ? url(sceneryFile) : null,
      });
    });
  }

  // The worker's track, made real: every recorded upload runs against `gfx` in
  // the order the build issued it (~budgetMs of them per animation frame — all at
  // once was a 2.7 s task under SwiftShader), and each token in track.meshes
  // becomes its handle. A message is replayed once: the first caller takes it. A ribbon the backend did not chunk is re-seated exactly as
  // tracks.js buildRibbon does it (chunks:null = a small plain mesh; chunks:[]
  // = a failed upload, retried unchunked).
  async function replay(msg, def, gfx, budgetMs) {
    if (msg.taken) return null;
    msg.taken = true;
    const { track, recs } = msg, real = new Array(recs.length), budget = budgetMs > 0 ? budgetMs : 8;
    try {
      for (let i = 0; i < recs.length;) {
        const t0 = performance.now();
        do {
          const r = recs[i];
          real[i++] = r.op === "mesh" ? gfx.createMesh(...r.args)
            : r.op === "chunked" ? gfx.createChunkedMesh(...r.args) : gfx.createInstancedBatch(...r.args);
        } while (i < recs.length && performance.now() - t0 < budget);
        if (i < recs.length) await new Promise((res) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(res) : setTimeout(res, 0)));
      }
    } catch (e) {
      // An upload that throws part-way: the handles already made have no owner
      // yet (track.meshes still holds tokens), so release them here.
      for (let i = 0; i < real.length; i++) {
        const h = real[i], r = recs[i];
        if (!h) continue;
        try {
          if (r.op === "batch" || (r.op !== "mesh" && r.op !== "chunked")) { if (gfx.freeInstancedBatch) gfx.freeInstancedBatch(h); }
          else if (r.op === "chunked" && gfx.freeChunkedMesh) gfx.freeChunkedMesh(h);
          else gfx.freeMesh(h);
        } catch (_) { /* the replay's error is the one to surface */ }
      }
      throw e;
    }
    const swap = (v) => {
      if (Array.isArray(v)) return v.map(swap);
      if (!v || typeof v !== "object" || typeof v.__rec !== "number") return v;
      const h = real[v.__rec];
      if (h && typeof h === "object") for (const k in v) if (k !== "__rec" && k !== "chunks") h[k] = v[k];
      return h;
    };
    const m = track.meshes;
    for (const k of Object.keys(m)) {
      const tok = m[k];
      m[k] = swap(tok);
      if (!k.endsWith("Chunked") || !m[k] || !tok || typeof tok.__rec !== "number") continue;
      const h = m[k], base = k.slice(0, -"Chunked".length);
      if (h.chunks && h.chunks.length) continue;
      m[base] = h.chunks == null ? h : gfx.createMesh(recs[tok.__rec].args[0]);
      m[k] = null;
    }
    // The worker built against its own def copy; carry back what the build
    // derived onto it (build-worker.js), as a main-thread build would leave it.
    if (Number.isFinite(msg.sceneryShift)) def._sceneryShift = msg.sceneryShift;
    if (Number.isFinite(msg.startFrac)) def._startFrac = msg.startFrac;
    track.def = def;
    track._gfx = gfx;
    track.surface = TrackSurface.profile(def, track);
    track.buildProfile.push({ n: "worker", k: "off", ms: +msg.ms.toFixed(2) });
    Log.info("track", "build worker: replayed " + def.id + " (" + recs.length + " uploads; " + Math.round(msg.ms) + " ms off-thread)");
    return track;
  }

  // A build is out at the worker: the caller's world is null until it lands, and
  // nothing may fill it with a synchronous build meanwhile (__apex's lazy ensure).
  const busy = () => _inflight > 0;

  return { enabled, set, spawn, build, replay, busy, KEY };
})();
if (typeof window !== "undefined") window.TrackBuildClient = TrackBuildClient;
