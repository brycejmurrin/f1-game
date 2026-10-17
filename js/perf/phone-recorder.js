/* Apex 26 — PhoneRecorder: a phone-only soak recorder (issue #1633).

   SETTINGS > DISPLAY > METRICS > PHONE TEST: RECORD / STOP, SHARE, COPY and the
   six-line how-to. Nothing runs until RECORD is tapped. On start it captures
   the device FACTS once (UA, DPR, navigator.gpu, backend path/pin, the WebGL2
   extensions the perf plan asks about, the rAF cadence the page really gets),
   then samples every SAMPLE_MS and every WINDOW_FRAMES rendered frames:
   frame p50/p95/p99, render scale, governor tier, renderer retained counts,
   minutes since start, circuit / weather / preset. SHARE hands one JSON file to
   the share sheet (iOS Safari), else a download link; COPY is the clipboard
   fallback. Plan: docs/notes/PERF-RESEARCH-2026-10-17.md §4 steps A, A2, B.

   READ-ONLY ON THE GOVERNOR: PerfGov.frameStats()/tier()/userTier()/autoShed()
   are read, never written. The GPU-disjoint timer is NOT touched (a synchronous
   round trip on phones). The only per-frame cost while recording is one rAF
   callback that bumps a counter. A recording is mirrored to apex26.phoneRec
   after each sample so an iOS tab kill mid-soak does not lose it. */
const PhoneRecorder = (function () {
  "use strict";

  const KEY = "apex26.phoneRec";
  const SCHEMA = "apex26.phone-soak/1";
  const SAMPLE_MS = 120000;
  const WINDOW_FRAMES = 2048;
  const CADENCE_FRAMES = 120;
  const QUICK_MS = 30000;
  const MAX_SAMPLES = 600;
  const MAX_EVENTS = 50;
  const MAX_SAVE_CHARS = 600000;

  const HOWTO = [
    "1. Low Power Mode OFF, brightness fixed, note charging and case.",
    "2. Start a race: ONE fixed circuit, WET weather, FULL grid, CHASE camera.",
    "3. Pause > SETTINGS > DISPLAY > METRICS > RECORD. Resume and race 15 min.",
    "4. Pause again, tap STOP, then SHARE (Files / AirDrop / Messages) or COPY.",
    "5. Optional repeats: GRAPHICS MEDIUM, and SGSR on. Same circuit each time.",
    "6. Send every file back; it holds device facts plus a sample every 2 min.",
  ];
  // Renderer A/B (three short runs, one per path). Shown as a second block.
  const HOWTO_AB = [
    "A/B: three 5-min runs, same circuit and settings, one per renderer path:",
    "default, then SETTINGS > GRAPHICS > THREE PATH: WEBGPU, then the WEBGL2 pick.",
    "At each start grid take a screenshot (power + volume up) before RECORD.",
    "Each file records its renderer path in every sample. Quick facts: QUICK 30s.",
  ];

  const r2 = (n) => (n != null && Number.isFinite(+n) ? Math.round(+n * 100) / 100 : null);
  const g = () => (typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : {}));
  // The game's modules are top-level `const`s: lexical globals, NOT window properties, so
  // window.PerfGov is undefined on a real page. Read them by name through typeof, over window.
  function scope() {
    const w = {};
    if (typeof PerfGov !== "undefined") w.PerfGov = PerfGov;
    if (typeof PerfSpans !== "undefined") w.PerfSpans = PerfSpans;
    if (typeof GLX !== "undefined") w.GLX = GLX;
    if (typeof GfxQuality !== "undefined") w.GfxQuality = GfxQuality;
    if (typeof RendererPicker !== "undefined") w.RendererPicker = RendererPicker;
    if (typeof GameStore !== "undefined") w.GameStore = GameStore;
    return w;
  }
  function safe(fn, dflt) { try { const v = fn(); return v === undefined ? dflt : v; } catch (_) { return dflt; } }

  // Numeric leaves of a small object (depth <= 2), flattened as "a" / "a.b".
  // memState() is version-dependent, so the recorder copies numbers, not names.
  function numericLeaves(o, out, prefix, depth) {
    out = out || {}; prefix = prefix || ""; depth = depth | 0;
    if (!o || typeof o !== "object") return out;
    let n = Object.keys(out).length;
    for (const k of Object.keys(o)) {
      if (n >= 80) break;
      const v = o[k];
      if (typeof v === "number" && Number.isFinite(v)) { out[prefix + k] = r2(v); n++; }
      else if (typeof v === "boolean") { out[prefix + k] = v; n++; }
      else if (v && typeof v === "object" && !Array.isArray(v) && depth < 1) numericLeaves(v, out, prefix + k + ".", depth + 1);
    }
    return out;
  }

  function median(a) {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y);
    return s[s.length >> 1];
  }

  // ---- live readers (every one guarded: the recorder must never throw) -----
  function probeGl() {
    const out = { ok: false };
    if (typeof document === "undefined") return out;
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const gl = c.getContext("webgl2");
      if (!gl) return out;
      out.ok = true;
      for (const e of ["EXT_color_buffer_float", "EXT_color_buffer_half_float", "WEBGL_multi_draw",
        "EXT_disjoint_timer_query_webgl2", "OES_texture_float_linear", "WEBGL_compressed_texture_astc"]) {
        out[e] = !!gl.getExtension(e);   // presence only; no query is ever issued
      }
      out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      out.maxFragUniformVectors = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) out.renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();   // hand the slot back: iOS caps live contexts
    } catch (_) { /* leave what was learned */ }
    return out;
  }

  function liveFacts() {
    const w = g(); const L = scope(); const nav = w.navigator || {};
    const f = {
      ua: nav.userAgent || "", platform: nav.platform || "",
      dpr: w.devicePixelRatio || 1,
      screen: safe(() => [w.screen.width, w.screen.height], null),
      inner: safe(() => [w.innerWidth, w.innerHeight], null),
      standalone: safe(() => !!(nav.standalone || (w.matchMedia && w.matchMedia("(display-mode: standalone)").matches)), false),
      hwConcurrency: nav.hardwareConcurrency || null, deviceMemory: nav.deviceMemory || null,
      webgpu: !!nav.gpu, webgpuF16: null,
      build: safe(() => document.querySelector('meta[name="apex-build"]').content, null),
      backend: safe(() => (L.RendererPicker && L.RendererPicker.liveBackend && L.RendererPicker.liveBackend()) || "", ""),
      backendState: safe(() => {
        const GLX = L.GLX;
        const t = GLX && GLX.__tlx && GLX.__tlx.backendState ? GLX.__tlx.backendState()
          : (GLX && GLX.backendState && GLX.backendState());
        return t ? numericLeaves(t) : null;
      }, null),
      backendPick: safe(() => {
        const GLX = L.GLX; const t = GLX && GLX.__tlx && GLX.__tlx.backendState && GLX.__tlx.backendState();
        if (!t) return null;
        const o = {};
        for (const k of ["api", "path", "pin", "forceWebGL", "softBlit", "packLive"]) if (t[k] !== undefined) o[k] = typeof t[k] === "object" ? String(t[k]) : t[k];
        return o;
      }, null),
      gl: probeGl(),
      lowPowerHint: null,   // not exposed to pages: the cadence below is the only tell (30 Hz = LPM)
    };
    if (nav.gpu && nav.gpu.requestAdapter) {
      try {
        Promise.resolve(nav.gpu.requestAdapter()).then((a) => { f.webgpuF16 = !!(a && a.features && a.features.has("shader-f16")); }, () => { f.webgpuF16 = false; });
      } catch (_) { /* no adapter */ }
    }
    return f;
  }

  function liveSample() {
    const w = g(); const L = scope(); const PG = L.PerfGov; const apex = w.__apex;
    const fs = safe(() => PG.frameStats(), null) || {};
    const o = {
      frame: { frames: fs.frames | 0, p50: r2(fs.p50), p95: r2(fs.p95), p99: r2(fs.p99), max: r2(fs.maxMs),
        droppedSimS: r2(fs.droppedSimS) },
      fpsEMA: r2(safe(() => 1000 / PG.fpsEMA(), null)),
      floorMs: r2(safe(() => PG.floorMs(), null)),
      renderScale: r2(safe(() => L.GLX.getRenderScale(), null)),
      tier: safe(() => PG.tier(), null), userTier: safe(() => PG.userTier(), null),
      autoShed: safe(() => PG.autoShed(), null), autoRes: safe(() => PG.autoRes(), null),
      scaleFutile: safe(() => PG.scaleFutile(), null), tierFutile: safe(() => PG.tierFutile(), null),
      mem: safe(() => { const m = L.GLX && L.GLX.__tlx && L.GLX.__tlx.memState && L.GLX.__tlx.memState(); return m ? numericLeaves(m) : null; }, null),
      heapMB: safe(() => r2(w.performance.memory.usedJSHeapSize / 1048576), null),
      circuit: safe(() => apex.info().track, null) || null,
      weather: safe(() => apex.weather(), null) || null,
      preset: safe(() => L.GfxQuality.current(), null),
      cam: safe(() => apex.camera().mode, null),
      path: safe(() => { const t = L.GLX.__tlx && L.GLX.__tlx.backendState ? L.GLX.__tlx.backendState() : L.GLX.backendState();
        return { pick: (L.RendererPicker && L.RendererPicker.liveBackend && L.RendererPicker.liveBackend()) || "",
          api: t && t.api || null, path: t && t.path || null, pin: t && t.pin != null ? String(t.pin) : null }; }, null),
      // Per-subsystem JS ms/frame over the span ring's last ~8.5 s (PerfSpans is ON only while recording).
      spans: safe(() => { const st = L.PerfSpans.stats(); const o = {};
        for (const k of Object.keys(st)) o[k] = { p50: st[k].p50, p95: st[k].p95 }; return o; }, null),
      visibility: safe(() => document.visibilityState, null),
    };
    return o;
  }

  function liveEnv() {
    const w = g(); const L = scope();
    const env = {
      now: () => (w.performance && w.performance.now ? w.performance.now() : Date.now()),
      wall: () => Date.now(),
      facts: liveFacts, sample: liveSample,
      spans: (on) => safe(() => { const S = L.PerfSpans; if (!S) return null; if (on) { env._spansWas = S.isOn(); S.on(true); } else if (!env._spansWas) S.on(false); }, null),
      save: (txt) => safe(() => { if (L.GameStore && L.GameStore.store) return L.GameStore.store.rawSet(KEY, txt); w.localStorage.setItem(KEY, txt); }, null),
      load: () => safe(() => (L.GameStore && L.GameStore.store ? L.GameStore.store.raw(KEY) : w.localStorage.getItem(KEY)), null),
    };
    return env;
  }

  // ---- the recorder: a state machine driven by frame(nowMs) ----------------
  function create(env) {
    env = env || liveEnv();
    let on = false; let rec = null; let quick = false;
    let t0 = 0; let lastSampleAt = 0; let framesSince = 0; let totalFrames = 0;
    let lastFrameAt = 0; let deltas = [];

    function event(kind, extra) {
      if (!rec || rec.events.length >= MAX_EVENTS) return;
      rec.events.push(Object.assign({ min: r2((env.now() - t0) / 60000), kind }, extra || {}));
    }
    function sample(trigger) {
      if (!on) return null;
      const s = Object.assign({ n: rec.samples.length, trigger, min: r2((env.now() - t0) / 60000), frames: totalFrames }, env.sample());
      if (rec.samples.length < MAX_SAMPLES) rec.samples.push(s); else rec.truncated = true;
      lastSampleAt = env.now(); framesSince = 0;
      persist();
      return s;
    }
    function persist() {
      const txt = serialize();
      if (txt.length <= MAX_SAVE_CHARS) env.save(txt);
    }
    function start(opts) {
      if (on) return false;
      quick = !!(opts && opts.quick);
      if (env.spans) env.spans(true);
      on = true; t0 = env.now(); lastSampleAt = t0; framesSince = 0; totalFrames = 0; lastFrameAt = 0; deltas = [];
      rec = { schema: SCHEMA, startedAt: new Date(env.wall()).toISOString(), endedAt: null,
        facts: env.facts(), cadence: null, samples: [], events: [], truncated: false,
        mode: quick ? "quick" : "soak", plan: { sampleMs: SAMPLE_MS, windowFrames: WINDOW_FRAMES, quickMs: QUICK_MS } };
      sample("start");
      return true;
    }
    function stop() {
      if (!on) return false;
      sample("stop");
      rec.endedAt = new Date(env.wall()).toISOString();
      rec.durationMin = r2((env.now() - t0) / 60000);
      on = false; if (env.spans) env.spans(false); persist();
      return true;
    }
    // One call per rendered rAF frame while recording.
    function frame(nowMs) {
      if (!on) return;
      const now = nowMs == null ? env.now() : nowMs;
      totalFrames++; framesSince++;
      if (lastFrameAt && !rec.cadence) {
        deltas.push(now - lastFrameAt);
        if (deltas.length >= CADENCE_FRAMES) {
          const m = median(deltas);
          rec.cadence = { frames: deltas.length, medianMs: r2(m), hz: m > 0 ? r2(1000 / m) : null,
            maxMs: r2(Math.max.apply(null, deltas)) };
          deltas = [];
        }
      }
      lastFrameAt = now;
      if (quick) { if (now - t0 >= QUICK_MS) stop(); return; }
      if (framesSince >= WINDOW_FRAMES) sample("window");
      else if (now - lastSampleAt >= SAMPLE_MS) sample("timer");
    }
    function serialize() {
      if (!rec) return "";
      return JSON.stringify(rec);
    }
    function adopt(txt) {   // a previous recording read back from storage
      const o = safe(() => JSON.parse(txt), null);
      if (!o || o.schema !== SCHEMA || on) return false;
      rec = o; return true;
    }
    return {
      start, stop, frame, event, sample, serialize, adopt,
      isOn: () => on, record: () => rec,
      elapsedMs: () => (on ? env.now() - t0 : 0),
      count: () => (rec ? rec.samples.length : 0),
    };
  }

  // ---- SHARE / COPY --------------------------------------------------------
  function fileName(rec) {
    const stamp = String((rec && rec.startedAt) || "").replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
    return "apex26-soak-" + (stamp || "run") + ".json";
  }
  function download(text, name, d) {
    const doc = (d && d.doc) || (typeof document !== "undefined" ? document : null);
    const URLc = (d && d.URL) || (typeof URL !== "undefined" ? URL : null);
    if (!doc || !URLc || typeof Blob === "undefined") return { how: "none" };
    const url = URLc.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = doc.createElement("a");
    a.href = url; a.download = name; a.textContent = "DOWNLOAD " + name;
    a.style.display = "none";
    (doc.body || doc.documentElement).appendChild(a);
    safe(() => a.click(), null);
    safe(() => a.remove(), null);
    return { how: "download", url, name };
  }
  // Resolves to {how: share|download|cancelled|none, url?, name?}. The file is
  // built synchronously inside the tap, which iOS requires for navigator.share.
  function share(text, name, d) {
    d = d || {};
    const nav = d.nav || (typeof navigator !== "undefined" ? navigator : null);
    try {
      if (nav && typeof nav.share === "function" && typeof File === "function") {
        const f = new File([text], name, { type: "application/json" });
        if (!nav.canShare || nav.canShare({ files: [f] })) {
          return Promise.resolve(nav.share({ files: [f], title: name })).then(
            () => ({ how: "share", name }),
            (e) => (e && e.name === "AbortError" ? { how: "cancelled", name } : download(text, name, d)));
        }
      }
    } catch (_) { /* fall through to a download */ }
    return Promise.resolve(download(text, name, d));
  }
  function copy(text, d) {
    d = d || {};
    const nav = d.nav || (typeof navigator !== "undefined" ? navigator : null);
    const viaTextarea = () => {
      const doc = d.doc || (typeof document !== "undefined" ? document : null);
      if (!doc) return false;
      const ta = doc.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      doc.body.appendChild(ta); ta.select();
      const ok = safe(() => doc.execCommand("copy"), false);
      ta.remove();
      return !!ok;
    };
    if (nav && nav.clipboard && nav.clipboard.writeText) {
      return Promise.resolve(nav.clipboard.writeText(text)).then(() => true, () => viaTextarea());
    }
    return Promise.resolve(viaTextarea());
  }

  // ---- panel + REC badge ---------------------------------------------------
  let _rec = null; let _raf = 0; let _badge = null; let _ui = null; let _lastBadgeSec = -1;

  function recorder() { return _rec || (_rec = create()); }
  function loop(t) {
    _raf = 0;
    const r = recorder();
    if (!r.isOn()) return;
    r.frame(t);
    paintBadge();
    _raf = requestAnimationFrame(loop);
  }
  function kick() { if (!_raf && typeof requestAnimationFrame === "function") _raf = requestAnimationFrame(loop); }

  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function paintBadge() {
    if (typeof document === "undefined") return;
    const r = recorder();
    if (!r.isOn()) { if (_badge) _badge.hidden = true; return; }
    const sec = Math.floor(r.elapsedMs() / 1000);
    if (sec === _lastBadgeSec) return;
    _lastBadgeSec = sec;
    if (!_badge) {
      _badge = document.createElement("div");
      _badge.id = "phone-rec-badge";
      _badge.setAttribute("aria-hidden", "true");
      document.body.appendChild(_badge);
    }
    _badge.hidden = false;
    _badge.textContent = "● REC " + fmt(r.elapsedMs()) + " · " + r.count();
    paintUI();
  }

  function setStatus(msg) { if (_ui && _ui.status) _ui.status.textContent = msg; }
  function paintUI() {
    if (!_ui) return;
    const r = recorder();
    const have = r.isOn() || !!r.record();
    _ui.rec.textContent = r.isOn() ? "STOP" : "RECORD";
    _ui.quick.disabled = r.isOn();
    _ui.rec.setAttribute("aria-pressed", r.isOn() ? "true" : "false");
    _ui.share.disabled = !have; _ui.copy.disabled = !have;
    if (!_ui.status.dataset.msg) {
      _ui.status.textContent = r.isOn() ? "recording · " + fmt(r.elapsedMs()) + " · " + r.count() + " samples"
        : (have ? "saved run: " + r.count() + " samples" : "idle — nothing runs until you tap RECORD");
    }
  }
  function flash(msg) {
    setStatus(msg); _ui.status.dataset.msg = "1";
    setTimeout(() => { if (_ui) { delete _ui.status.dataset.msg; paintUI(); } }, 4000);
  }

  function onRecord(quick) {
    const r = recorder();
    if (r.isOn()) { r.stop(); flash("stopped · " + r.count() + " samples · tap SHARE"); }
    else {
      safe(() => { if (typeof GameMetrics !== "undefined" && GameMetrics.ensureTelemetry) GameMetrics.ensureTelemetry(); }, null);
      r.start({ quick: quick === true }); kick();
      flash(quick === true ? "quick facts: stay on this screen 30 s" : "recording — resume and race 15 min");
    }
    paintBadge(); paintUI();
  }
  function current() { const r = recorder(); return { text: r.serialize(), name: fileName(r.record()) }; }
  function onShare() {
    const r = recorder(); if (r.isOn()) r.stop();
    const c = current(); if (!c.text) return;
    share(c.text, c.name).then((res) => {
      if (res.how === "download") showLink(res);
      flash(res.how === "share" ? "shared" : res.how === "cancelled" ? "share cancelled" : res.how === "download" ? "saved: tap the link below" : "cannot share here: use COPY");
    });
    paintUI();
  }
  function showLink(res) {
    if (!_ui) return;
    _ui.link.innerHTML = "";
    const a = document.createElement("a");
    a.href = res.url; a.download = res.name; a.textContent = "DOWNLOAD " + res.name;
    _ui.link.appendChild(a);
  }
  function onCopy() {
    const c = current(); if (!c.text) return;
    copy(c.text).then((ok) => flash(ok ? "copied " + Math.round(c.text.length / 1024) + " KB" : "copy blocked: use SHARE"));
  }

  function mount() {
    if (typeof document === "undefined") return false;
    if (document.getElementById("pm-phonerec")) return true;
    const host = document.querySelector("#pm-metrics-details .pm-metrics-sub-body");
    if (!host) return false;
    const box = document.createElement("div");
    box.id = "pm-phonerec"; box.setAttribute("role", "group"); box.setAttribute("aria-label", "Phone test recorder");
    const h = document.createElement("p"); h.className = "adv-help"; h.style.fontWeight = "700"; h.textContent = "PHONE TEST";
    const how = document.createElement("ol"); how.className = "adv-help";
    HOWTO.forEach((l) => { const li = document.createElement("li"); li.textContent = l.replace(/^\d\. /, ""); how.appendChild(li); });
    const ab = document.createElement("ol"); ab.className = "adv-help";
    HOWTO_AB.forEach((l) => { const li = document.createElement("li"); li.textContent = l; ab.appendChild(li); });
    const row = document.createElement("div"); row.style.margin = "0";
    const mk = (id, label, fn) => {
      const b = document.createElement("button");
      b.type = "button"; b.id = id; b.textContent = label;
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
      row.appendChild(b); return b;
    };
    _ui = { rec: mk("pm-phonerec-rec", "RECORD", onRecord), quick: mk("pm-phonerec-quick", "QUICK 30s", () => onRecord(true)), share: mk("pm-phonerec-share", "SHARE", onShare), copy: mk("pm-phonerec-copy", "COPY", onCopy) };
    _ui.status = document.createElement("p"); _ui.status.className = "adv-help"; _ui.status.setAttribute("role", "status");
    _ui.link = document.createElement("p"); _ui.link.className = "adv-help";
    [h, how, ab, row, _ui.status, _ui.link].forEach((n) => box.appendChild(n));
    host.appendChild(box);
    // A run that survived a tab kill is shareable without recording again.
    const r = recorder();
    if (!r.record()) { const txt = liveEnv().load(); if (txt) r.adopt(txt); }
    paintUI();
    return true;
  }

  function init() {
    if (typeof document === "undefined" || typeof setTimeout !== "function") return;
    [400, 1200, 2500, 5000].forEach((ms) => setTimeout(mount, ms));
    if (document.addEventListener) document.addEventListener("visibilitychange", () => {
      const r = recorder(); if (r.isOn()) r.event("visibility", { state: document.visibilityState });
    });
    try { Log.info("game", "PhoneRecorder.init"); } catch (_) { /* Log not loaded */ }
  }
  init();

  return {
    KEY, SCHEMA, QUICK_MS, HOWTO_AB, SAMPLE_MS, WINDOW_FRAMES, CADENCE_FRAMES, MAX_SAMPLES, HOWTO,
    create, liveEnv, numericLeaves, fileName, share, copy, download, mount,
    start: () => { const ok = recorder().start(); kick(); paintBadge(); paintUI(); return ok; },
    stop: () => { const ok = recorder().stop(); paintBadge(); paintUI(); return ok; },
    isOn: () => recorder().isOn(), json: () => recorder().serialize(),
  };
})();
