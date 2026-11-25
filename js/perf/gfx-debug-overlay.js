/* Apex 26 — GfxDebug: ON-SCREEN GFX DIAGNOSTIC (?gfxdebug=1 / apex26.gfxDebug="1").
   The renderer's own verdict rendered as DOM, for the player who sees a wrong
   frame on hardware no agent here can run and has no console to read back:
   GLX.gpuErrors(), GLX.__tlx.backendState() and __apex.info() made readable
   and COPYABLE without devtools. It arms from the URL so a report is one link
   away, and costs everyone else one query-string test. */
const GfxDebug = (() => {
  "use strict";

  const ID = "gfx-debug";
  const PAINT_MS = 500;
  // Soft-frame luma used to call getImageData(0,0,w,h) on the full blit canvas.
  // On a GPU-less soft present that copies the whole backing store every 500 ms:
  // a 4K RGBA buffer is ~35 MB and the alloc+scan measured ~46 ms here; phone
  // landscape 2× DPR (~11 MB) ~12 ms. Downscale into a reused SAMPLE_MAX² canvas
  // so the diagnostic stays pasteable without becoming the stall it diagnoses.
  const SAMPLE_MAX = 64;
  const PANEL_CSS = "position:fixed;left:8px;top:8px;z-index:9999;max-width:min(92vw,560px);" +
    "max-height:70vh;overflow:auto;background:rgba(0,0,0,.78);color:#9fe;padding:6px 8px;" +
    "border-radius:6px;font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;" +
    "pointer-events:auto;user-select:text";
  const COPY_BTN_CSS = "float:right;margin:0 0 4px 8px;font:10px/1 inherit;padding:3px 6px;" +
    "background:#123;color:#9fe;border:1px solid #9fe;border-radius:4px;cursor:pointer";

  let el = null;
  let pre = null;
  let timer = 0;
  let sampleCanvas = null;
  let sampleCtx = null;
  // Previous loop sample, so the heartbeat line in build() can be a DELTA
  let lastFrames = 0;
  let lastPaintAt = 0;

  function nowMs() { try { return performance.now(); } catch (_) { return Date.now(); } }

  function wanted() {
    try {
      if (typeof DevFlags !== "undefined") return !!DevFlags.get("gfxdebug");
      // Same read without the registry (a page or test that skips dev-flags.js).
      return /[?&]gfxdebug=1/.test(location.search) ||
        localStorage.getItem("apex26.gfxDebug") === "1";
    } catch (_) { return false; }
  }

  function num(v) { return typeof v === "number" && isFinite(v) ? v : "?"; }

  function threePathName(flag) {
    if (flag === "1") return "WEBGL2";
    if (flag === "0") return "WEBGPU";
    return "AUTO";
  }

  // A backend that refused leaves its reason in storage, not on GLX — "which
  // renderer am I actually looking at" has to survive a fallback, so read the
  // pick, the live label and the refusal together
  function picks() {
    const out = {};
    try {
      out.pick = localStorage.getItem("apex26.gfxBackend") || "three (default)";
      out.threePath = localStorage.getItem("apex26.tlxForceGL");
      out.bound = sessionStorage.getItem("apex26.gfxBound") || "";
      out.tlxFail = localStorage.getItem("apex26.gfxTlxFail") || "";
      out.wgxFail = localStorage.getItem("apex26.gfxWgxFail") || "";
    } catch (_) { /* blocked storage: the live label below still answers */ }
    try {
      out.live = typeof RendererPicker !== "undefined" && RendererPicker.liveBackend
        ? RendererPicker.liveBackend() : (out.bound || "");
    } catch (_) { out.live = out.bound || ""; }
    return out;
  }

  function buildId() {
    try {
      const meta = document.querySelector('meta[name="apex-build"]');
      return (meta && meta.getAttribute("content")) || "";
    } catch (_) { return ""; }
  }

  function pushThreeState(lines, tlx) {
    try {
      const b = tlx.backendState();
      lines.push(`three api=${b.api} pin=${b.pin} soft=${b.softwareGL ? "GL" : "-"}` +
        (b.softAdapter ? "/adapter" : "") + (b.softBlit ? "/blit" : "") +
        (b.forceHw ? " FORCE-HW" : "") + (b.forceBatches ? " FORCE-BATCH" : ""));
      lines.push(`mobile=${b.isMobile} tier=${b.mobileTier} lite=${b.liteGpu}` + (b.liteLab ? " LAB:tlxLite" : ""));
      if (b.envFail) lines.push(`ENV FACES FAILED: ${b.envFail}  ${b.envFailMsg || ""}`);
    } catch (e) { lines.push("backendState threw: " + (e && e.message)); }
    try {
      const env = tlx.envState();
      lines.push(`env ready=${env.ready} blank=${env.blank} face=${env.face}/6`);
    } catch (_) { /* pre-probe */ }
    try {
      const sky = tlx.skyState();
      lines.push(`sky on=${sky.on} stars=${sky.stars} cloud=${sky.cloud}`);
    } catch (_) { /* sky not built yet */ }
    try {
      const chunks = tlx.chunkState();
      lines.push(`chunks ${chunks.visible}/${chunks.total} on=${chunks.on}`);
    } catch (_) { /* no chunked system on this track */ }
    try {
      const post = tlx.postState();
      lines.push(`post on=${post.on} hdr=${post.hdr} rt=${(post.targets || []).join("x")}`);
    } catch (_) { /* post not built */ }
  }

  // Brightness of what is actually on screen. On a WebGPU-claimed canvas a 2D
  // getImageData is impossible, so read the soft blit when there is one and say
  // so plainly when there is not — a missing number beats a made-up one
  // I-5 (#1648): one pasteable line. Heap is Chrome-only (performance.memory);
  // geometries / textures / render objects come from the TLX memState the
  // renderer already keeps. A backend without that hook prints "?".
  function pushMem(lines, glx) {
    let heap = "n/a";
    try {
      const m = performance.memory;
      if (m && typeof m.usedJSHeapSize === "number") heap = (m.usedJSHeapSize / 1048576).toFixed(1) + "MB";
    } catch (_) { /* performance.memory is Chromium-only */ }
    let geo = "?", tex = "?", rObj = "?";
    try {
      const ms = glx.__tlx && glx.__tlx.memState && glx.__tlx.memState();
      if (ms) { geo = num(ms.rGeo); tex = num(ms.rTex); rObj = num(ms.rObj); }
    } catch (_) { /* memState threw: the rest of the line still pastes */ }
    let tier = "?", strikes = "?";
    try {
      const rs = (typeof window !== "undefined" && window.__apex && window.__apex.renderScale)
        ? window.__apex.renderScale() : null;
      if (rs) { tier = num(rs.tier); strikes = num(rs.crashStrikes); }
    } catch (_) { /* pre-boot */ }
    try {
      if (strikes === "?" && typeof PerfGov !== "undefined" && PerfGov.strikes) strikes = num(PerfGov.strikes());
    } catch (_) { /* governor not loaded */ }
    lines.push(`mem heap=${heap} rObj=${rObj} geo=${geo} tex=${tex} tier=${tier} crashStrikes=${strikes}`);
    pushDetail(lines);
  }

  // The desktop detail level and the governor's upper ladder (docs/GOVERNOR-RATIONALE.md §gov-42); absent pre-boot.
  function pushDetail(lines) {
    try {
      if (typeof GfxQuality === "undefined" || !GfxQuality.detail) return;
      const max = GfxQuality.SHED_ORDER ? GfxQuality.SHED_ORDER.length : 0;
      const g = typeof PerfGov !== "undefined" && PerfGov.gpuMs ? PerfGov.gpuMs() : -1;
      lines.push(`detail=${GfxQuality.detail()} shed=${GfxQuality.shed()}/${max} cinema=${GfxQuality.cinema() ? 1 : 0} gpuMs=${g > 0 ? g.toFixed(2) : "n/a"}`);
    } catch (_) { /* quality module not up: the rest of the paste stands */ }
  }

  // TIERS (docs/notes/TIER-CENSUS-TEST-2026-11-20.md): per GfxQuality.FEATURES name, `on` = feature(name) now and
  // `ran` = what the renderer itself reports it built or ran (true / false), or null with `why` where this path has
  // no signal. A feature whose build threw falls back to today's path silently; on true + ran false is that case.
  // tools/gfx/gpu-game-check.mjs stores tiers() beside gpuErrors; tools/gfx/census-verdict.mjs gates on it.
  const NO = (why) => ({ ran: null, why });
  const YES = (v) => ({ ran: !!v });
  // Pure: q is GfxQuality's surface (detail, shed, cinema, feature, FEATURES, SHED_ORDER), probe is tiersProbe().
  function tiersRecord(q, probe) {
    const rec = { detail: 0, shed: 0, cinema: false, shedOrder: [], features: {} };
    if (!q || !q.FEATURES) return rec;
    rec.detail = q.detail() | 0; rec.shed = q.shed() | 0; rec.cinema = !!q.cinema();
    rec.shedOrder = Array.from(q.SHED_ORDER || []);
    const none = (probe && probe._none) || "no signal on this path";
    for (const name of Object.keys(q.FEATURES)) {
      const p = (probe && probe[name]) || NO(none);
      const row = { need: q.FEATURES[name], on: !!q.feature(name), ran: p.ran === true ? true : p.ran === false ? false : null };
      if (row.ran === null) row.why = p.why || none;
      rec.features[name] = row;
    }
    return rec;
  }
  // Read-only, every read guarded: a throw is a null `ran` naming the throw, never a false.
  function tiersProbe(glx, q) {
    const p = {}, tlx = glx && glx.__tlx;
    const T = (f) => { try { return f(); } catch (e) { return NO("read threw: " + String((e && e.message) || e).slice(0, 80)); } };
    const cine = (() => { try { return !!(q && q.cinema()); } catch (_) { return false; } })();
    for (const n of ["garageHi", "crewHi"]) p[n] = NO("garage only");
    // The track extras build in the worker (or a VM) from TrackDetail.page(); the page keeps no record of a build.
    for (const n of ["crowd3d", "treesHi", "kerbProfile", "farTerrain", "density", "propsHi"]) p[n] = NO("built with the track; no page-side record");
    p.liveryHi = T(() => { const v = LiveryTex.liveryHiUsed(); return v == null ? NO("no AI livery atlas built yet") : YES(v); });
    p.packHd = T(() => { const s = Assets.state(); return s.uploaded ? YES(s.tier === "hd") : NO("material pack not uploaded"); });
    const car = T(() => CarDraw.instance().carDetailUsed);
    p.meshHi = !car || car.ran === null ? (car || NO("no car built yet")) : YES(car.player >= 1);
    p.heroCar = !car || car.ran === null ? (car || NO("no car built yet")) : YES(car.hero);
    if (!tlx) { p._none = "not the three.js renderer (TLX)"; return p; }
    const post = T(() => tlx.postState()), hi = post && post.hi, r = (hi && hi.ran) || {}, bl = (post && post.blocks) || {};
    const aa = (post && post.aa) || {};
    const ext = (base, why, v) => (!base ? NO(why) : YES(!!hi && v));
    p.ssaoHi = ext(bl.ssao, "no AO pass in the last frame", r.aoHi >= 1);
    p.gtao = ext(bl.ssao, "no AO pass in the last frame", r.aoHi === 2);
    p.raysHi = ext(bl.shafts, "no god-ray pass in the last frame", r.rays === 1);
    p.ssrHi = ext(bl.ssr, "no SSR in the last frame (dry road, no reflection)", !!r.ssrHi);
    p.ssgi = ext(true, "", !!r.gi);
    p.dof = ext(cine, "CINEMA only (replay / photo / garage)", !!r.dof);
    p.motionBlur = ext(cine, "CINEMA only (replay / photo / garage)", !!r.mblur);
    p.traa = YES(aa.traa && aa.taa);
    p.hdrOut = T(() => (matchMedia("(dynamic-range: high)").matches ? YES(aa.hdrPeak > 1) : NO("the display is not HDR")));
    const ceil = T(() => glx.maxRenderScale());
    p.superSample = typeof ceil !== "number" ? (ceil || NO("no maxRenderScale")) :
      (ceil <= 1.001 && (typeof devicePixelRatio === "number" ? devicePixelRatio : 1) > 1.25 ? NO("DPR above 1.25 without RESOLUTION MAX: no supersample headroom") : YES(ceil > 1.001));
    p.ss2x = !cine ? NO("CINEMA only (replay / photo / garage)") : YES(typeof ceil === "number" && ceil > 1.5);
    p.mirrorHi = T(() => YES(Array.isArray(glx.mirrorMax) && glx.mirrorMax[0] > 1024));
    const sx = T(() => (glx.shadowX ? glx.shadowX.state() : null));
    if (sx && sx.ran === null) { p.csm = sx; p.lampShadows = sx; } else {
      p.csm = YES(sx && sx.csm.on && sx.csm.builds.reduce((a, b) => a + (+b || 0), 0) > 0);
      p.lampShadows = YES(sx && sx.lampX.on && sx.lampX.slots.some((s) => s.builds > 0));
    }
    p.lightsHi = T(() => YES(LightBudget.hiBuilt()));
    p.skyAtmo = T(() => YES(tlx.sky && tlx.sky.atmo === true));
    p.matDetail = T(() => YES(tlx.lit && tlx.lit.detail && tlx.lit.detail.matDetail));
    p.envAll = T(() => YES(tlx.lit && tlx.lit.detail && tlx.lit.detail.envAll));
    p.carSurf = T(() => YES(tlx.lit && tlx.lit.carSurf));
    return p;
  }
  function tiers() {
    if (typeof GfxQuality === "undefined") return null;
    return tiersRecord(GfxQuality, tiersProbe(typeof GLX !== "undefined" ? GLX : null, GfxQuality));
  }

  function sampleSoftLuma(soft, ctx2d) {
    const w = soft.width | 0, h = soft.height | 0;
    if (w <= 0 || h <= 0) throw new Error("empty soft canvas");
    const tw = Math.min(SAMPLE_MAX, w), th = Math.min(SAMPLE_MAX, h);
    let img;
    if (tw === w && th === h) {
      img = ctx2d.getImageData(0, 0, w, h);
    } else {
      // Scale the whole frame into SAMPLE_MAX² so a dusk sky is not mistaken for
      // an unpainted corner (the old top-left 64×64 trap), without copying w×h.
      if (!sampleCanvas) {
        sampleCanvas = document.createElement("canvas");
        sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
      }
      if (!sampleCtx) throw new Error("no sample 2d");
      if (sampleCanvas.width !== tw) sampleCanvas.width = tw;
      if (sampleCanvas.height !== th) sampleCanvas.height = th;
      sampleCtx.drawImage(soft, 0, 0, tw, th);
      img = sampleCtx.getImageData(0, 0, tw, th);
    }
    let sum = 0, max = 0, n = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      const l = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
      if (l > max) max = l;
      sum += l; n++;
    }
    return { mean: n ? sum / n : 0, max, n, tw, th };
  }

  function pushFrameState(lines, glx) {
    // The BACKEND says whether it soft-presents, not the DOM: WGX blits onto
    // #game itself (its GPU canvas is offscreen), so "no #game-soft" read as
    // "native swapchain" on a WGX leg paying a readback every frame (hunt 4 I6).
    let blit = false;
    try { blit = typeof glx.softPresent === "function" && !!glx.softPresent(); } catch (_) { /* no hook */ }
    const soft = document.getElementById("game-soft") || (blit ? document.getElementById("game") : null);
    if (!soft) {
      lines.push("frame: native swapchain (no 2D readback)");
    } else {
      try {
        // Only a canvas the backend already made 2D: getContext("2d") on a
        // WebGL/WebGPU canvas returns null rather than stealing it.
        const ctx = soft.getContext("2d");
        if (!ctx) throw new Error("no 2D context");
        if (soft.id === "game") lines.push("frame: soft-present onto #game (CPU readback + putImageData every frame)");
        const s = sampleSoftLuma(soft, ctx);
        // max === 0 is ambiguous: an all-zero blit canvas is EITHER a black
        // frame or no blit yet (the soft path only paints when asked). Reporting
        // "black" for the second case cost this project a round
        lines.push(s.max === 0
          ? "frame(soft): nothing blitted yet (not the same as black)"
          : `frame(soft) mean=${s.mean.toFixed(1)} max=${s.max.toFixed(0)}`);
      } catch (_) { lines.push("frame(soft) unreadable"); }
    }
    if (glx.softPresentState) {
      try { lines.push("softPresent=" + JSON.stringify(glx.softPresentState()).slice(0, 160)); }
      catch (_) { /* backend without the hook */ }
    }
  }

  function loopStatus(h, dFrames, dtMs) {
    if (h.stopped) return "STOPPED at the fault cap";
    if (h.frames === 0) return "NO FRAME COMPLETED YET";
    if (dtMs && dFrames === 0) return `NO FRAME in the last ${dtMs}ms`;
    return `+${dFrames} frames/${dtMs}ms`;
  }

  // THE ONE LINE THAT IS TRUE WHEN THE LOOP IS DEAD. Everything else here reads
  // a value the frame loop wrote (the fps below included), so it freezes at its
  // last healthy reading; this overlay runs on setInterval and outlives the
  // loop. The heartbeat is RELATIVE — frames completed since the last paint —
  // not a millisecond threshold: "staleMs > 1000" reads a healthy headless page
  // (measured 6993 ms) and a struggling phone as dead, while a count that does
  // not move between two paints is a stall at any frame rate
  function pushLoopState(lines) {
    if (typeof LoopHealth === "undefined" || !LoopHealth.state) return;
    try {
      const h = LoopHealth.state();
      const t = nowMs();
      const dFrames = h.frames - lastFrames;
      const dtMs = lastPaintAt ? Math.round(t - lastPaintAt) : 0;
      lastFrames = h.frames;
      lastPaintAt = t;
      lines.push(`loop: ${loopStatus(h, dFrames, dtMs)}` +
        `  total=${h.frames} staleMs=${h.staleMs == null ? "-" : h.staleMs}` +
        `  faults=${h.faults}/${h.totalCap} run=${h.run}/${h.cap}` +
        (h.lastFault ? `\n      lastFault: ${h.lastFault}` : ""));
      // Slow frames do not throw. The stall watchdog already counted them;
      // a paste that only shows faults reads a 1 fps WebGPU present as healthy.
      if (h.stall) {
        const s = h.stall;
        lines.push(`stall: watch=${s.watching ? "on" : "off"} slow=${num(s.slowRun)} worst=${num(s.worstMs)}ms` +
          ` act=${s.act || "-"} sheds=${num(s.sheds)} reloads=${num(s.reloads)}`);
      }
    } catch (_) { lines.push("loop: unreadable"); }
  }

  function build() {
    const lines = [];
    const p = picks();
    lines.push(`APEX 26 GFX  build ${buildId() || "?"}`);

    const canvas = document.getElementById("game");
    const engine = canvas ? (canvas.getAttribute("data-engine") || "") : "no #game";
    lines.push(`pick=${p.pick}  live=${p.live || "unknown"}  threePath=${threePathName(p.threePath)}` +
      (p.bound ? `  bound=${p.bound}` : ""));
    lines.push(`engine=${engine || "(unstamped)"}`);
    if (p.tlxFail) lines.push(`TLX REFUSED: ${p.tlxFail}`);
    if (p.wgxFail) lines.push(`WGX REFUSED: ${p.wgxFail}`);

    const glx = typeof GLX !== "undefined" ? GLX : null;
    if (!glx) { lines.push("GLX absent — no backend bound"); return lines.join("\n"); }

    // GPU validation errors. Zero here is the single most useful fact a report
    // can carry: it separates "the frame is wrong" from "the frame was never
    // legally submitted", and those have nothing in common as bugs
    if (glx.gpuErrors) {
      const n = glx.gpuErrors();
      lines.push(`gpuErrors=${num(n)}`);
      if (n > 0 && glx.gpuFirstError) {
        const first = String(glx.gpuFirstError() || "").replace(/\s+/g, " ").slice(0, 300);
        lines.push(`  first: ${first}`);
      }
    } else {
      lines.push("gpuErrors=(backend has no error hook)");
    }

    if (glx.__tlx) pushThreeState(lines, glx.__tlx);
    else if (typeof glx.hdrMode === "function") {
      // GLX/WGX had no post line: a dark frame could not say whether the HDR post chain (and its
      // tonemap) ran. hdr=false is the direct 8-bit path: no bloom, no tonemap.
      try { lines.push(`post hdr=${!!glx.hdrMode()} msaa=${typeof glx.msaa === "function" ? num(glx.msaa()) : "?"}`); }
      catch (e) { lines.push("post state threw: " + (e && e.message)); }
    }
    pushMem(lines, glx);
    pushFrameState(lines, glx);
    pushLoopState(lines);

    if (typeof window !== "undefined" && window.__apex && window.__apex.info) {
      try {
        const info = window.__apex.info();
        lines.push(`track=${info.track || "-"} fps=${num(Math.round(info.fps || 0))}`);
      } catch (_) { /* pre-race */ }
    }
    return lines.join("\n");
  }

  function tick() {
    if (!pre) return;
    try { pre.textContent = build(); }
    catch (e) { pre.textContent = "gfx-debug failed: " + (e && e.message); }
  }

  // ApexClipboard: clipboard.writeText + textarea fallback (plain http / phone).
  function copyReport(btn) {
    const text = pre ? pre.textContent : "";
    const done = () => { btn.textContent = "COPIED"; setTimeout(() => { btn.textContent = "COPY"; }, 1200); };
    // Always flash COPIED after an attempt — the overlay text stays selectable
    // if both paths fail (previous fallbackCopy called done() even on a soft miss).
    ApexClipboard.write(text).then(done, done);
  }

  function install() {
    if (el || !document.body) return;
    el = document.createElement("div");
    el.id = ID;
    el.style.cssText = PANEL_CSS;
    const btn = document.createElement("button");
    btn.textContent = "COPY";
    btn.style.cssText = COPY_BTN_CSS;
    btn.addEventListener("click", () => copyReport(btn));
    pre = document.createElement("div");
    el.appendChild(btn);
    el.appendChild(pre);
    document.body.appendChild(el);
    tick();
    timer = setInterval(tick, PAINT_MS);
    try { Log.info("gfx", "[gfx-debug] overlay on"); } catch (_) { /* Log may not be up */ }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = 0;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null;
    pre = null;
  }

  if (typeof document !== "undefined" && wanted()) {
    // Always install on a later turn of the loop: the script tag sits BEFORE
    // game.js has picked a backend and the first tick reads GLX, so a
    // synchronous install would paint one frame of "GLX absent" and could
    // out-order the very thing it is meant to report
    if (document.body) setTimeout(install, 0);
    else document.addEventListener("DOMContentLoaded", () => setTimeout(install, 0), { once: true });
  }

  // install / stop / wanted stay module-local (auto-install on load); text() is the test/probe seam;
  // tiers() the census's structured record (tiersRecord / tiersProbe: its pure halves, for the node tests).
  return { text: build, tiers, tiersRecord, tiersProbe };
})();

if (typeof window !== "undefined") window.GfxDebug = GfxDebug;
