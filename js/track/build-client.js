const TrackBuildClient = (function () {
  "use strict";
  const KEY = "apex26.buildWorker";
  let _w = null, _ready = null, _readyRes = null, _seq = 0;
  const _pending = new Map();
  const ANSWER_MS = 30000;

  function isLive(live) { try { return !live || !!live(); } catch (_) { return false; } }
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
  function set(on) {
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (_) {  }
    if (on) spawn();
    else if (_w) drop("turned off");
  }
  let _labs = null;
  function labOn(name) {
    if (_labs === null) {
      _labs = [];
      try { const v = new URLSearchParams(location.search).get("lab"); if (v) _labs = v.split(",").map((s) => s.trim()).filter(Boolean); }
      catch (_) {  }
    }
    return _labs.indexOf(name) >= 0;
  }
  let _cold = null;
  function cold(on) {
    if (on !== undefined) { _cold = !!on; if (_cold && enabled()) idleWarm(true); }
    if (_cold === null) _cold = labOn("coldBuild");
    return _cold && enabled();
  }
  const use = (inSession) => !!inSession || cold();
  function initUI() {
    if (typeof SettingRow === "undefined" || !document.getElementById("pm-buildworker")) return;
    SettingRow.wire("pm-buildworker", { values: SettingRow.labels(["off", "on"]), read: () => (enabled() ? "on" : "off"), write: (v) => set(v === "on") });
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "complete") initUI();
    else document.addEventListener("DOMContentLoaded", () => {
      if (typeof SettingsNav !== "undefined" && SettingsNav.lazy) SettingsNav.lazy(initUI); else initUI();
    }, { once: true });
  }
  const url = (f) => new URL(typeof ScriptLoader !== "undefined" && ScriptLoader.url ? ScriptLoader.url(f)
    : f + "?v=" + (window.__APEX_BUILD || 0), location.href).href;
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
    try { if (_w) _w.terminate(); } catch (_) {  }
    if (_readyRes) _readyRes(false);
    _w = null; _ready = null; _readyRes = null;
    Log.warn("track", "build worker off: " + why);
  }

  function idleWarm(agentSurface) {
    if (!enabled()) return null;
    if (!agentSurface && !cold()) return _ready;
    const kick = () => { try { spawn(); } catch (_) {  } };
    if (typeof requestIdleCallback === "function") requestIdleCallback(kick, { timeout: 3000 });
    else setTimeout(kick, 500);
    return _ready;
  }

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
      if (m.type === "error" && m.seq == null) { failed("init " + m.message); return; }
      const p = _pending.get(m.seq);
      if (!p) {
        if (m.type === "buildReady") try { worker.postMessage({ type: "buildPermit", seq: m.seq, live: false }); } catch (_) {  }
        return;
      }
      if (m.type === "buildReady") {
        const live = isLive(p.live);
        try { worker.postMessage({ type: "buildPermit", seq: m.seq, live }); }
        catch (err) { failed("permit send " + err.message); return; }
        if (!live) { _pending.delete(m.seq); p.resolve(null); }
        else p.running = true;
        return;
      }
      _pending.delete(m.seq);
      let answer = null;
      try {
        if (m.type === "preview") {
          answer = m;
        } else {
          const lack = m.type === "built" ? missingModels(p.def, m.models) : [];
          if (lack.length) Log.warn("track", `build worker: ${m.id} built without ${lack.length} of its baked models the page holds (${lack.join(", ")}) — building in steps instead`);
          else if (m.type === "built" && (isLive(p.live))) answer = m;
          else Log.warn("track", "build worker failed: " + m.message);
        }
      } catch (err) { Log.warn("track", "build worker: reply unusable (" + (err && err.message) + ") — building in steps instead"); }
      p.resolve(answer);
    };
    worker.onerror = (e) => failed("error " + ((e && e.message) || ""));
    worker.onmessageerror = () => failed("unreadable worker response");
    const hrefs = pageUrls(files);
    try { if (typeof ScriptLoader !== "undefined" && ScriptLoader.warm) ScriptLoader.warm(hrefs); }
    catch (_) {  }
    try { worker.postMessage({ type: "init", files: hrefs, base: location.href }); }
    catch (e) { failed("init " + e.message); }
    return ready;
  }

  let _graphNoted = false, _inflight = 0, _last = null;
  async function build(idx, def, opts, gfx, sceneryFile, live) {
    let wedged = false;
    for (const [seq, p] of _pending) if (p.live && !isLive(p.live)) {
      _pending.delete(seq); p.resolve(null); wedged = wedged || !!p.running;
      try { if (_w) _w.postMessage({ type: "buildPermit", seq, live: false }); } catch (_) {  }
    }
    if (wedged && cold() && _pending.size === 0 && _w) drop("superseded mid-build");
    if (!isLive(live)) return null;
    if (!enabled() || (def && def.custom)) return null;
    try { if (localStorage.getItem("apex26.modelInst") === "0") return null; } catch (_) {  }
    if (typeof Tracks !== "undefined" && Tracks.diagnosticBuild && Tracks.diagnosticBuild()) { _last = null; return null; }
    const prepare = gfx.trackPrepareConfig ? gfx.trackPrepareConfig() : null;
    const key = [JSON.stringify(prepare), def.id, opts.night, opts.gridSlots, !!opts.chunkRibbons, !!gfx.mobileTier].join("|");
    if (!_last || _last.key !== key || _last.live !== live) _last = { key, live, p: post(idx, def, opts, gfx, sceneryFile, live) };
    const mine = _last;
    _inflight++;
    try { return await mine.p; } finally { _inflight--; if (_last === mine) _last = null; }
  }
  async function post(idx, def, opts, gfx, sceneryFile, live) {
    if (!isLive(live)) return null;
    if (opts && opts.retainGraph && !_graphNoted) { _graphNoted = true; Log.info("track", "build worker: scenery graph not retained (__apex.trackGraph is null)"); }
    const r = spawn();
    if (!r) return null;
    let initTimer = null, timedOut = false;
    const up = await Promise.race([r, new Promise((res) => {
      if (typeof setTimeout === "function") initTimer = setTimeout(() => { timedOut = true; res(false); }, ANSWER_MS);
    })]);
    if (initTimer != null) clearTimeout(initTimer);
    if (timedOut && _ready === r) drop("worker init gave no answer in " + ANSWER_MS / 1000 + " s");
    if (!up || !_w || _ready !== r || !isLive(live)) return null;
    const seq = ++_seq, worker = _w;
    return new Promise((resolve) => {
      let timer = null;
      if (typeof setTimeout === "function") timer = setTimeout(() => {
        if (!_pending.delete(seq)) return;
        resolve(null);
        if (_w === worker) drop("no answer for " + def.id + " in " + ANSWER_MS / 1000 + " s");
      }, ANSWER_MS);
      _pending.set(seq, { resolve: (m) => { if (timer != null) clearTimeout(timer); resolve(m); }, def, live });
      try { worker.postMessage({
        type: "build", seq, idx, id: def.id, checkLive: !!live,
        opts: { night: opts.night, gridSlots: opts.gridSlots, chunkRibbons: !!opts.chunkRibbons, retainGraph: false,
          retainGeometry: !!(opts.retainGraph || (typeof Tracks !== "undefined" && Tracks.keepGeometry && Tracks.keepGeometry())) },
        mobileTier: !!gfx.mobileTier, chunkedTrackCoords: gfx.chunkedTrackCoords,
        prepare: gfx.trackPrepareConfig ? gfx.trackPrepareConfig() : null,
        scenery: sceneryFile ? url(sceneryFile) : null,
        team: myTeam(),
      }); } catch (e) {
        if (_w === worker) drop("build send " + ((e && e.message) || "failed"));
      }
    });
  }
  function myTeam() {
    try {
      const L = typeof Teams !== "undefined" && Array.isArray(Teams.LIST) ? Teams.LIST : [];
      const custom = (Teams.DEFAULT_CUSTOM && Teams.DEFAULT_CUSTOM.id) || "custom";
      const t = L.find((x) => x && x.id === custom);
      return t ? JSON.parse(JSON.stringify(t)) : null;
    } catch (_) { return null; }
  }
  function missingModels(def, have) {
    if (typeof Assets === "undefined" || !Assets.modelIds || !Assets.modelSync) return [];
    const S = typeof TrackScenery !== "undefined" ? TrackScenery : null;
    const fn = def && (def.scenery || (S && S[def.id]));
    const got = new Set(Array.isArray(have) ? have : []);
    return Assets.modelIds(typeof TrackDef !== "undefined" ? TrackDef.scenerySource(def, S) : fn ? String(fn) : "").filter((id) => Assets.modelSync(id) && !got.has(id));
  }

  async function replay(msg, def, gfx, budgetMs, live) {
    if (msg.taken) return null;
    msg.taken = true;
    const { track, recs } = msg, real = new Array(recs.length), fallback = [], budget = budgetMs > 0 ? budgetMs : 8;
    const keepFull = typeof Tracks !== "undefined" && typeof Tracks.keepGeometry === "function" && !!Tracks.keepGeometry();
    const stampKeep = (args) => {
      const geo = args && args[0];
      if (!geo || typeof geo !== "object") return args;
      if (keepFull || geo === track.roadGeo || geo === track.terrainGeo) geo._keepPositions = true;
      if (keepFull) geo._keepFullGeometry = true;
      return args;
    };
    const canceled = {};
    let replayCpu = 0, mainPrepare = 0;
    const frame = () => new Promise(res => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(res) : setTimeout(res, 0)));
    const prepare = async (r, args) => {
      const S = typeof window !== "undefined" && window.TLXShaders;
      if (r.op !== "chunked" || !S || !gfx.trackPrepareConfig) return;
      for (;;) {
        const config = gfx.trackPrepareConfig();
        if (!S.validPrepareConfig(config)) return;
        checkLive();
        let payload = r.prepared;
        if (!payload || payload.version !== 1 || !S.samePrepareConfig(payload.config, config) || payload.cellSize !== ChunkBins.cellSize(args[1])) {
          const steps = S.prepareChunksSteps(args[0], args[1], config);
          for (;;) {
            checkLive();
            const start = performance.now();
            let next, stepsInSlice = 0;
            do { next = steps.next(); stepsInSlice++; } while (!next.done && stepsInSlice < 64 && performance.now() - start < budget);
            mainPrepare += performance.now() - start;
            if (next.done) { payload = next.value; break; }
            await frame();
          }
        }
        checkLive();
        r.prepared = null;
        if (!S.samePrepareConfig(config, gfx.trackPrepareConfig())) continue;
        args[0]._tlxPrepared = payload;
        return;
      }
    };
    const checkLive = () => { if (!isLive(live)) throw canceled; };
    try {
      checkLive();
      for (let i = 0; i < recs.length;) {
        checkLive();
        const t0 = performance.now();
        do {
          const r = recs[i];
          const args = (r.op === "mesh" || r.op === "chunked") ? stampKeep(r.args) : r.args;
          await prepare(r, args);
          checkLive();
          const opStart = performance.now();
          real[i++] = r.op === "mesh" ? gfx.createMesh(...args)
            : r.op === "chunked" ? gfx.createChunkedMesh(...args) : gfx.createInstancedBatch(...r.args);
          replayCpu += performance.now() - opStart;
        } while (i < recs.length && performance.now() - t0 < budget);
        if (i < recs.length) await new Promise((res) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(res) : setTimeout(res, 0)));
      }
      checkLive();
      const finishStart = performance.now();
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
          if (gfx.freeChunkedMesh) { real[tok.__rec] = null; gfx.freeChunkedMesh(h); if (gfx.flushChunkedOwnership) gfx.flushChunkedOwnership(); }
        }
        m[k] = null;
      }
      if (Number.isFinite(msg.sceneryShift)) def._sceneryShift = msg.sceneryShift;
      if (Number.isFinite(msg.startFrac)) def._startFrac = msg.startFrac;
      track.def = def;
      track._gfx = gfx;
      track.surface = TrackSurface.profile(def, track);
      if (typeof PitSigns !== "undefined") PitSigns.upload(gfx, track);
      if (typeof Tracks !== "undefined" && Tracks.dropRibbonCpuIfReady) Tracks.dropRibbonCpuIfReady(track);
      replayCpu += performance.now() - finishStart;
      track.buildProfile = (track.buildProfile || []).map(r => Object.assign({}, r, { thread: "worker", additive: false }));
      track.buildProfile.push(
        { n: "worker", k: "off", thread: "worker", additive: true, ms: +(msg.cpuMs == null ? (msg.ms || 0) : Math.max(0, msg.cpuMs - (msg.prepareMs || 0))).toFixed(2) },
        { n: "worker prepare", k: "prepare", thread: "worker", additive: true, ms: +(msg.prepareMs || 0).toFixed(2) },
        { n: "replay prepare", k: "prepare", thread: "main", additive: true, ms: +mainPrepare.toFixed(2) },
        { n: "replay finalize", k: "up", thread: "main", additive: true, ms: +replayCpu.toFixed(2) });
      Log.info("track", "build worker: replayed " + def.id + " (" + recs.length + " uploads; " + Math.round(msg.cpuMs == null ? msg.ms : msg.cpuMs) + " ms off-thread)");
      checkLive();
      return track;
    } catch (e) {
      for (const r of recs) { r.prepared = null; if (r.args && r.args[0]) delete r.args[0]._tlxPrepared; }
      for (let i = 0; i < real.length; i++) {
        const h = real[i], r = recs[i];
        if (!h) continue;
        try {
          if (r.op === "batch" || (r.op !== "mesh" && r.op !== "chunked")) { if (gfx.freeInstancedBatch) gfx.freeInstancedBatch(h); }
          else if (r.op === "chunked" && gfx.freeChunkedMesh) { gfx.freeChunkedMesh(h); if (gfx.flushChunkedOwnership) gfx.flushChunkedOwnership(); }
          else gfx.freeMesh(h);
        } catch (_) {  }
      }
      for (const h of fallback) {
        try { if (h) gfx.freeMesh(h); } catch (_) {  }
      }
      try { if (typeof PitSigns !== "undefined" && PitSigns.free) PitSigns.free(gfx, track); }
      catch (_) {  }
      if (e === canceled) return null;
      throw e;
    }
  }

  const busy = () => _inflight > 0;

  async function previewMap(def) {
    if (!def || !def.id || def.custom) return false;
    if (def._metaOnly || !(def.path && def.path.pts && def.path.pts.length)) return false;
    if (!enabled() || typeof Worker === "undefined") return false;
    if (typeof Tracks === "undefined" || !Tracks.LIST || !Tracks.adoptPreviewCenterline) return false;
    const idx = Tracks.LIST.indexOf(def);
    if (idx < 0) return false;
    const r = spawn();
    if (!r) return false;
    let initTimer = null, timedOut = false;
    const up = await Promise.race([r, new Promise((res) => {
      if (typeof setTimeout === "function") initTimer = setTimeout(() => { timedOut = true; res(false); }, ANSWER_MS);
    })]);
    if (initTimer != null) clearTimeout(initTimer);
    if (timedOut && _ready === r) drop("worker init gave no answer in " + ANSWER_MS / 1000 + " s");
    if (!up || !_w || _ready !== r) return false;
    const seq = ++_seq, worker = _w;
    const msg = await new Promise((resolve) => {
      let timer = null;
      if (typeof setTimeout === "function") timer = setTimeout(() => {
        if (!_pending.delete(seq)) return;
        resolve(null);
      }, Math.min(ANSWER_MS, 8000));
      _pending.set(seq, { resolve: (m) => { if (timer != null) clearTimeout(timer); resolve(m); }, def, live: null });
      try { worker.postMessage({ type: "preview", seq, idx, id: def.id }); }
      catch (e) {
        _pending.delete(seq);
        if (timer != null) clearTimeout(timer);
        if (_w === worker) drop("preview send " + ((e && e.message) || "failed"));
        resolve(null);
      }
    });
    if (!msg || msg.type !== "preview" || !msg.track) return false;
    if (Number.isFinite(msg.sceneryShift)) def._sceneryShift = msg.sceneryShift;
    return !!Tracks.adoptPreviewCenterline(def, msg.track);
  }

  return { enabled, set, spawn, idleWarm, build, previewMap, replay, busy, cold, use };
})();
if (typeof window !== "undefined") window.TrackBuildClient = TrackBuildClient;
