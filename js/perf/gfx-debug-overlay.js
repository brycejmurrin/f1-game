const GfxDebug = (() => {
  "use strict";

  const ID = "gfx-debug";
  const PAINT_MS = 500;
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
  let lastFrames = 0;
  let lastPaintAt = 0;

  function nowMs() { try { return performance.now(); } catch (_) { return Date.now(); } }

  function wanted() {
    try {
      if (typeof DevFlags !== "undefined") return !!DevFlags.get("gfxdebug");
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

  function picks() {
    const out = {};
    try {
      out.pick = localStorage.getItem("apex26.gfxBackend") || "three (default)";
      out.threePath = localStorage.getItem("apex26.tlxForceGL");
      out.bound = sessionStorage.getItem("apex26.gfxBound") || "";
      out.tlxFail = localStorage.getItem("apex26.gfxTlxFail") || "";
      out.wgxFail = localStorage.getItem("apex26.gfxWgxFail") || "";
    } catch (_) {  }
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
    } catch (_) {  }
    try {
      const sky = tlx.skyState();
      lines.push(`sky on=${sky.on} stars=${sky.stars} cloud=${sky.cloud}`);
    } catch (_) {  }
    try {
      const chunks = tlx.chunkState();
      lines.push(`chunks ${chunks.visible}/${chunks.total} on=${chunks.on}`);
    } catch (_) {  }
    try {
      const post = tlx.postState();
      lines.push(`post on=${post.on} hdr=${post.hdr} rt=${(post.targets || []).join("x")}`);
    } catch (_) {  }
  }

  function pushMem(lines, glx) {
    let heap = "n/a";
    try {
      const m = performance.memory;
      if (m && typeof m.usedJSHeapSize === "number") heap = (m.usedJSHeapSize / 1048576).toFixed(1) + "MB";
    } catch (_) {  }
    let geo = "?", tex = "?", rObj = "?";
    try {
      const ms = glx.__tlx && glx.__tlx.memState && glx.__tlx.memState();
      if (ms) { geo = num(ms.rGeo); tex = num(ms.rTex); rObj = num(ms.rObj); }
    } catch (_) {  }
    let tier = "?", strikes = "?";
    try {
      const rs = (typeof window !== "undefined" && window.__apex && window.__apex.renderScale)
        ? window.__apex.renderScale() : null;
      if (rs) { tier = num(rs.tier); strikes = num(rs.crashStrikes); }
    } catch (_) {  }
    try {
      if (strikes === "?" && typeof PerfGov !== "undefined" && PerfGov.strikes) strikes = num(PerfGov.strikes());
    } catch (_) {  }
    lines.push(`mem heap=${heap} rObj=${rObj} geo=${geo} tex=${tex} tier=${tier} crashStrikes=${strikes}`);
  }

  function sampleSoftLuma(soft, ctx2d) {
    const w = soft.width | 0, h = soft.height | 0;
    if (w <= 0 || h <= 0) throw new Error("empty soft canvas");
    const tw = Math.min(SAMPLE_MAX, w), th = Math.min(SAMPLE_MAX, h);
    let img;
    if (tw === w && th === h) {
      img = ctx2d.getImageData(0, 0, w, h);
    } else {
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
    let blit = false;
    try { blit = typeof glx.softPresent === "function" && !!glx.softPresent(); } catch (_) {  }
    const soft = document.getElementById("game-soft") || (blit ? document.getElementById("game") : null);
    if (!soft) {
      lines.push("frame: native swapchain (no 2D readback)");
    } else {
      try {
        const ctx = soft.getContext("2d");
        if (!ctx) throw new Error("no 2D context");
        if (soft.id === "game") lines.push("frame: soft-present onto #game (CPU readback + putImageData every frame)");
        const s = sampleSoftLuma(soft, ctx);
        lines.push(s.max === 0
          ? "frame(soft): nothing blitted yet (not the same as black)"
          : `frame(soft) mean=${s.mean.toFixed(1)} max=${s.max.toFixed(0)}`);
      } catch (_) { lines.push("frame(soft) unreadable"); }
    }
    if (glx.softPresentState) {
      try { lines.push("softPresent=" + JSON.stringify(glx.softPresentState()).slice(0, 160)); }
      catch (_) {  }
    }
  }

  function loopStatus(h, dFrames, dtMs) {
    if (h.stopped) return "STOPPED at the fault cap";
    if (h.frames === 0) return "NO FRAME COMPLETED YET";
    if (dtMs && dFrames === 0) return `NO FRAME in the last ${dtMs}ms`;
    return `+${dFrames} frames/${dtMs}ms`;
  }

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
      } catch (_) {  }
    }
    return lines.join("\n");
  }

  function tick() {
    if (!pre) return;
    try { pre.textContent = build(); }
    catch (e) { pre.textContent = "gfx-debug failed: " + (e && e.message); }
  }

  function copyReport(btn) {
    const text = pre ? pre.textContent : "";
    const done = () => { btn.textContent = "COPIED"; setTimeout(() => { btn.textContent = "COPY"; }, 1200); };
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
    try { Log.info("gfx", "[gfx-debug] overlay on"); } catch (_) {  }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = 0;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null;
    pre = null;
  }

  if (typeof document !== "undefined" && wanted()) {
    if (document.body) setTimeout(install, 0);
    else document.addEventListener("DOMContentLoaded", () => setTimeout(install, 0), { once: true });
  }

  return { text: build };
})();

if (typeof window !== "undefined") window.GfxDebug = GfxDebug;
