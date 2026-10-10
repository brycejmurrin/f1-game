/* Apex 26 — the page side of the track build Worker (js/track/build-worker.js).
   Ships ON by default when Worker exists and the device reports more than one
   logical core (apex26.buildWorker "1"/"0" still forces on/off). spawn() runs
   on the first build() (an in-session track switch) or when BUILD IN
   BACKGROUND is switched on — never at the title, whose idle prefetch no longer
   warms it (3-F4); build() posts one circuit and resolves the
   worker's answer; replay() turns its recorded uploads into real gfx calls on
   the main thread and rebuilds what could not cross (the surface sampler, the
   def, the gfx handle). Any failure answers null and the caller builds in
   steps instead (loadTrackStepped) — the worker only ever saves time; a replay
   that throws is caught there and falls back the same way.

   THE SAME WORLD AS THE MAIN THREAD (2026-10-04). The worker imports TRACK_VM
   plus its own extras (ApexRoster.TRACK_WORKER_EXTRA: assets.js, so the baked
   pack models are stamped, not their procedural fallbacks); the page posts its
   MY TEAM row (a worker has no localStorage, so custom-team.js could not rebuild
   it there); replay() uploads the pit signs the worker cannot paint; and a
   worker missing any of THIS circuit's models the page holds (compared by id,
   not count — #908) answers null rather than a poorer world. A custom circuit never goes to the worker: its list holds only
   the shipped circuits. */
const TrackBuildClient = (function () {
  "use strict";
  const KEY = "apex26.buildWorker";
  let _w = null, _ready = null, _readyRes = null, _seq = 0;
  const _pending = new Map();
  // How long the page waits on the worker (its init, then one build) before it
  // gives up on it and builds in steps. A build is seconds even under SwiftShader;
  // the cap only exists so a wedged worker cannot hold loadTrackStepped (and, via
  // busy(), every synchronous build) forever.
  const ANSWER_MS = 30000;

  // Explicit "1"/"0" wins; unset → ON when a Worker exists and there is a spare
  // core (MULTITHREADING-PLAN §3: single-core phones can lose on worker parse).
  function defaultOn() {
    if (typeof Worker === "undefined") return false;
    try {
      const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2;
      return cores > 1;
    } catch (_) { return true; }
  }
  function enabled() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "1") return true;
      if (v === "0") return false;
      return defaultOn();
    } catch (_) { return defaultOn(); }
  }
  // BUILD IN BACKGROUND (pause > SETTINGS, with the renderer levers): the same key,
  // raw lane, "1"/"0". It takes effect on the next build: loadTrackStepped reads it.
  function set(on) {
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (_) { /* private mode: the row still reads back what stuck */ }
    if (on) spawn();   // parse the build modules now, not at the next RACE!
    else if (_w) drop("turned off");   // the worker holds a whole TRACK_VM heap (~20 MB) for nothing
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
    // Settle the readiness promise too: a post() already awaiting it (BUILD IN
    // BACKGROUND turned off while the worker was still parsing) would otherwise
    // hang on a promise nothing can resolve any more.
    if (_readyRes) _readyRes(false);
    _w = null; _ready = null; _readyRes = null;
    Log.warn("track", "build worker off: " + why);
  }

  // Idempotent. Resolves true once every build module has loaded in the worker.
  function spawn() {
    if (_ready) return _ready;
    const R = typeof ApexRoster !== "undefined" ? ApexRoster : null;
    const files = R && R.TRACK_VM && R.TRACK_VM.concat(R.TRACK_WORKER_EXTRA || []);
    if (!enabled() || typeof Worker === "undefined" || !files) return null;
    try { _w = new Worker(url("js/track/build-worker.js")); } catch (e) { drop("spawn " + e.message); return null; }
    let ok;
    const worker = _w, ready = _ready = new Promise((res) => { ok = _readyRes = res; });
    const failed = (why) => { if (_w === worker) { ok(false); drop(why); } };
    worker.onmessage = (e) => {
      if (_w !== worker) return;
      const m = e.data || {};
      if (m.type === "ready") { ok(true); return; }
      // importScripts failures are caught by the worker before a build has a
      // seq. Settle readiness too, so the caller can fall back to paced builds.
      if (m.type === "error" && m.seq == null) { failed("init " + m.message); return; }
      const p = _pending.get(m.seq);
      if (!p) return;
      _pending.delete(m.seq);
      // The entry is already out of _pending, so neither drop() nor the answer
      // timer can reach it any more: whatever happens below, THIS handler must
      // settle it (a throw in the model comparison stranded the awaiter, busy()
      // stuck true). null = the caller builds in steps.
      let answer = null;
      try {
        const lack = m.type === "built" ? missingModels(p.def, m.models) : [];
        if (lack.length) Log.warn("track", `build worker: ${m.id} built without ${lack.length} of its baked models the page holds (${lack.join(", ")}) — building in steps instead`);
        else if (m.type === "built") answer = m;
        else Log.warn("track", "build worker failed: " + m.message);
      } catch (err) { Log.warn("track", "build worker: reply unusable (" + (err && err.message) + ") — building in steps instead"); }
      p.resolve(answer);
    };
    worker.onerror = (e) => failed("error " + ((e && e.message) || ""));
    worker.onmessageerror = () => failed("unreadable worker response");
    // `base`: the PAGE's URL. The worker resolves relative fetches (assets.js's
    // "assets/pack/…") against it, not against js/track/build-worker.js.
    try { worker.postMessage({ type: "init", files: pageUrls(files), base: location.href }); }
    catch (e) { failed("init " + e.message); }
    return ready;
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
    // A custom circuit is not in the worker's list (it would only answer
    // "worker track list differs" after a round-trip): build it in steps.
    if (!enabled() || (def && def.custom)) return null;
    const key = [def.id, opts.night, opts.gridSlots, !!opts.chunkRibbons, !!gfx.mobileTier].join("|");
    if (!_last || _last.key !== key) _last = { key, p: post(idx, def, opts, gfx, sceneryFile) };
    const mine = _last;
    _inflight++;
    try { return await mine.p; } finally { _inflight--; if (_last === mine) _last = null; }
  }
  async function post(idx, def, opts, gfx, sceneryFile) {
    if (opts && opts.retainGraph && !_graphNoted) { _graphNoted = true; Log.info("track", "build worker: scenery graph not retained (__apex.trackGraph is null)"); }
    const r = spawn();
    if (!r) return null;
    let initTimer = null, timedOut = false;
    const up = await Promise.race([r, new Promise((res) => {
      if (typeof setTimeout === "function") initTimer = setTimeout(() => { timedOut = true; res(false); }, ANSWER_MS);
    })]);
    if (initTimer != null) clearTimeout(initTimer);
    if (timedOut && _ready === r) drop("worker init gave no answer in " + ANSWER_MS / 1000 + " s");
    if (!up || !_w) return null;
    const seq = ++_seq, worker = _w;
    return new Promise((resolve) => {
      let timer = null;
      if (typeof setTimeout === "function") timer = setTimeout(() => {
        if (!_pending.delete(seq)) return;
        resolve(null);
        if (_w === worker) drop("no answer for " + def.id + " in " + ANSWER_MS / 1000 + " s");
      }, ANSWER_MS);
      _pending.set(seq, { resolve: (m) => { if (timer != null) clearTimeout(timer); resolve(m); }, def });
      worker.postMessage({
        type: "build", seq, idx, id: def.id,
        opts: { night: opts.night, gridSlots: opts.gridSlots, chunkRibbons: !!opts.chunkRibbons, retainGraph: false },
        mobileTier: !!gfx.mobileTier, chunkedTrackCoords: gfx.chunkedTrackCoords,
        scenery: sceneryFile ? url(sceneryFile) : null,
        team: myTeam(),
      });
    });
  }
  // The MY TEAM entry of the PAGE's Teams.LIST (custom-team.js splices the
  // player's saved team in from localStorage), as plain data: the garage row
  // (TrackPit.row) and the bay signs read it. null = the page has none, and
  // the worker's row falls back to Teams.DEFAULT_CUSTOM exactly as the page's.
  function myTeam() {
    try {
      const L = typeof Teams !== "undefined" && Array.isArray(Teams.LIST) ? Teams.LIST : [];
      const custom = (Teams.DEFAULT_CUSTOM && Teams.DEFAULT_CUSTOM.id) || "custom";
      const t = L.find((x) => x && x.id === custom);
      return t ? JSON.parse(JSON.stringify(t)) : null;
    } catch (_) { return null; }
  }
  // This circuit's baked models (the ids its scenery closure names) resident on
  // the page — what a main-thread build would stamp — that the worker's answer
  // (`have`, the ids it held) lacks. Read when the answer lands, not at post: a
  // model the page gained meanwhile is one a stepped build would still stamp.
  function missingModels(def, have) {
    if (typeof Assets === "undefined" || !Assets.modelIds || !Assets.modelSync) return [];
    const S = typeof TrackScenery !== "undefined" ? TrackScenery : null;
    const fn = def && (def.scenery || (S && S[def.id]));
    const got = new Set(Array.isArray(have) ? have : []);
    return Assets.modelIds(fn ? String(fn) : "").filter((id) => Assets.modelSync(id) && !got.has(id));
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
    const { track, recs } = msg, real = new Array(recs.length), fallback = [], budget = budgetMs > 0 ? budgetMs : 8;
    // The worker built with its own keepGeometry=false. Stamp the PAGE's flag
    // (and the road/terrain always-keep rule from tracks.js) onto each geo
    // before upload so createChunkedMesh does not null props.pos under
    // __apex.trackGeometry(true) — montreal-foundation day→night hit that.
    const keepFull = typeof Tracks !== "undefined" && typeof Tracks.keepGeometry === "function" && !!Tracks.keepGeometry();
    const stampKeep = (args) => {
      const geo = args && args[0];
      if (!geo || typeof geo !== "object") return args;
      if (keepFull || geo === track.roadGeo || geo === track.terrainGeo) geo._keepPositions = true;
      if (keepFull) geo._keepFullGeometry = true;
      return args;
    };
    try {
      for (let i = 0; i < recs.length;) {
        const t0 = performance.now();
        do {
          const r = recs[i];
          const args = (r.op === "mesh" || r.op === "chunked") ? stampKeep(r.args) : r.args;
          real[i++] = r.op === "mesh" ? gfx.createMesh(...args)
            : r.op === "chunked" ? gfx.createChunkedMesh(...args) : gfx.createInstancedBatch(...r.args);
        } while (i < recs.length && performance.now() - t0 < budget);
        if (i < recs.length) await new Promise((res) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(res) : setTimeout(res, 0)));
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
        if (h.chunks == null) m[base] = h;
        else {
          m[base] = gfx.createMesh(stampKeep([recs[tok.__rec].args[0]])[0]);
          fallback.push(m[base]);
          // The empty chunk handle is replaced, so the adopted track cannot
          // free it later. Remove it from our ledger before releasing it.
          if (gfx.freeChunkedMesh) { real[tok.__rec] = null; gfx.freeChunkedMesh(h); }
        }
        m[k] = null;
      }
      // The worker built against its own def copy; carry back what the build
      // derived onto it (build-worker.js), as a main-thread build would leave it.
      if (Number.isFinite(msg.sceneryShift)) def._sceneryShift = msg.sceneryShift;
      if (Number.isFinite(msg.startFrac)) def._startFrac = msg.startFrac;
      track.def = def;
      track._gfx = gfx;
      track.surface = TrackSurface.profile(def, track);
      // The bay signs: the worker has no canvas or livery painter, so the build
      // there skipped PitSigns.upload (tracks.js) — paint and upload them here,
      // exactly where the main-thread build does, from the geometry it posted.
      if (typeof PitSigns !== "undefined") PitSigns.upload(gfx, track);
      track.buildProfile.push({ n: "worker", k: "off", ms: +msg.ms.toFixed(2) });
      Log.info("track", "build worker: replayed " + def.id + " (" + recs.length + " uploads; " + Math.round(msg.ms) + " ms off-thread)");
      return track;
    } catch (e) {
      // Own uploads until the entire replay succeeds, including fallback
      // meshes and surface reconstruction after the upload loop.
      for (let i = 0; i < real.length; i++) {
        const h = real[i], r = recs[i];
        if (!h) continue;
        try {
          if (r.op === "batch" || (r.op !== "mesh" && r.op !== "chunked")) { if (gfx.freeInstancedBatch) gfx.freeInstancedBatch(h); }
          else if (r.op === "chunked" && gfx.freeChunkedMesh) gfx.freeChunkedMesh(h);
          else gfx.freeMesh(h);
        } catch (_) { /* the replay's error is the one to surface */ }
      }
      for (const h of fallback) {
        try { if (h) gfx.freeMesh(h); } catch (_) { /* preserve the replay error */ }
      }
      try { if (typeof PitSigns !== "undefined" && PitSigns.free) PitSigns.free(gfx, track); }
      catch (_) { /* preserve the replay error */ }
      throw e;
    }
  }

  // A build is out at the worker: the caller's world is null until it lands, and
  // nothing may fill it with a synchronous build meanwhile (__apex's lazy ensure).
  const busy = () => _inflight > 0;

  return { enabled, set, spawn, build, replay, busy, KEY, defaultOn };
})();
if (typeof window !== "undefined") window.TrackBuildClient = TrackBuildClient;
