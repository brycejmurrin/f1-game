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
  const PANEL_CSS = "position:fixed;left:8px;top:8px;z-index:9999;max-width:min(92vw,560px);" +
    "max-height:70vh;overflow:auto;background:rgba(0,0,0,.78);color:#9fe;padding:6px 8px;" +
    "border-radius:6px;font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;" +
    "pointer-events:auto;user-select:text";
  const COPY_BTN_CSS = "float:right;margin:0 0 4px 8px;font:10px/1 inherit;padding:3px 6px;" +
    "background:#123;color:#9fe;border:1px solid #9fe;border-radius:4px;cursor:pointer";

  let el = null;
  let pre = null;
  let timer = 0;
  // Previous loop sample, so the heartbeat line in build() can be a DELTA
  let lastFrames = 0;
  let lastPaintAt = 0;

  function nowMs() { try { return performance.now(); } catch (_) { return Date.now(); } }

  function wanted() {
    try {
      if (/[?&]gfxdebug=1/.test(location.search)) return true;
      return localStorage.getItem("apex26.gfxDebug") === "1";
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
      out.pick = localStorage.getItem("apex26.gfxBackend") || "webgl2 (default)";
      out.threePath = localStorage.getItem("apex26.tlxForceGL");
      out.bound = sessionStorage.getItem("apex26.gfxBound") || "";
      out.tlxFail = localStorage.getItem("apex26.gfxTlxFail") || "";
      out.wgxFail = localStorage.getItem("apex26.gfxWgxFail") || "";
    } catch (_) { /* blocked storage: the live label below still answers */ }
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
      lines.push(`mobile=${b.isMobile} tier=${b.mobileTier} lite=${b.liteGpu}`);
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
  function pushFrameState(lines, glx) {
    const soft = document.getElementById("game-soft");
    if (!soft) {
      lines.push("frame: native swapchain (no 2D readback)");
    } else {
      try {
        const ctx = soft.getContext("2d");
        const img = ctx.getImageData(0, 0, soft.width, soft.height);
        let sum = 0, max = 0, n = 0;
        for (let i = 0; i < img.data.length; i += 4) {
          const l = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
          if (l > max) max = l;
          sum += l; n++;
        }
        // max === 0 is ambiguous: an all-zero blit canvas is EITHER a black
        // frame or no blit yet (the soft path only paints when asked). Reporting
        // "black" for the second case cost this project a round
        lines.push(max === 0
          ? "frame(soft): nothing blitted yet (not the same as black)"
          : `frame(soft) mean=${n ? (sum / n).toFixed(1) : "?"} max=${max.toFixed(0)}`);
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
    } catch (_) { lines.push("loop: unreadable"); }
  }

  function build() {
    const lines = [];
    const p = picks();
    lines.push(`APEX 26 GFX  build ${buildId() || "?"}`);

    const canvas = document.getElementById("game");
    const engine = canvas ? (canvas.getAttribute("data-engine") || "") : "no #game";
    lines.push(`pick=${p.pick}  threePath=${threePathName(p.threePath)}` +
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

  function fallbackCopy(text, done) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch (_) { /* the text is selectable in place; nothing else to offer */ }
  }

  // clipboard.writeText needs a secure context and can reject; the textarea
  // fallback is what makes this usable over plain http on a phone
  function copyReport(btn) {
    const text = pre ? pre.textContent : "";
    const done = () => { btn.textContent = "COPIED"; setTimeout(() => { btn.textContent = "COPY"; }, 1200); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        return;
      }
    } catch (_) { /* fall through */ }
    fallbackCopy(text, done);
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

  return { install, stop, text: build, wanted };
})();

if (typeof window !== "undefined") window.GfxDebug = GfxDebug;
