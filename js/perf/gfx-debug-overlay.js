/* Apex 26 — ON-SCREEN GFX DIAGNOSTIC (?gfxdebug=1 / apex26.gfxDebug="1")
   The renderer's own verdict, rendered as DOM, for the case this project kept
   losing to: a player sees a wrong frame on hardware no agent here can run, and
   has no console to read back. Everything below already exists as a JS hook —
   GLX.gpuErrors(), GLX.__tlx.backendState(), __apex.info(). The overlay only
   makes it readable and COPYABLE without devtools. It arms from the URL, so a
   report is one link away, and it stays off (and costs one query-string test)
   for everybody else. */
"use strict";
const GfxDebug = (() => {
  const ID = "gfx-debug";
  let el = null, pre = null, timer = 0;
  // Previous loop sample, so the heartbeat below can be a DELTA (see build()).
  let _lastFrames = 0, _lastPaint = 0;
  function nowMs() { try { return performance.now(); } catch (_) { return Date.now(); } }

  function wanted() {
    try {
      if (/[?&]gfxdebug=1/.test(location.search)) return true;
      return localStorage.getItem("apex26.gfxDebug") === "1";
    } catch (_) { return false; }
  }

  function num(v) { return typeof v === "number" && isFinite(v) ? v : "?"; }

  // A backend that refused leaves its reason in storage, not on GLX — the
  // question "which renderer am I actually looking at" has to survive a
  // fallback, so read the pick, the live label, and the refusal together.
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

  function build() {
    const L = [];
    const p = picks();
    let build = "";
    try {
      const m = document.querySelector('meta[name="apex-build"]');
      build = (m && m.getAttribute("content")) || "";
    } catch (_) { /* no meta in a bare harness page */ }
    L.push("APEX 26 GFX  build " + (build || "?"));

    const canvas = document.getElementById("game");
    const engine = canvas ? (canvas.getAttribute("data-engine") || "") : "no #game";
    L.push("pick=" + p.pick +
      "  threePath=" + (p.threePath === "1" ? "WEBGL2" : p.threePath === "0" ? "WEBGPU" : "AUTO") +
      (p.bound ? "  bound=" + p.bound : ""));
    L.push("engine=" + (engine || "(unstamped)"));
    if (p.tlxFail) L.push("TLX REFUSED: " + p.tlxFail);
    if (p.wgxFail) L.push("WGX REFUSED: " + p.wgxFail);

    const G = typeof GLX !== "undefined" ? GLX : null;
    if (!G) { L.push("GLX absent — no backend bound"); return L.join("\n"); }

    // GPU validation errors. Zero here is the single most useful fact a report
    // can carry: it separates "the frame is wrong" from "the frame was never
    // legally submitted", and those have nothing in common as bugs.
    if (G.gpuErrors) {
      const n = G.gpuErrors();
      L.push("gpuErrors=" + num(n));
      if (n > 0 && G.gpuFirstError) {
        const first = String(G.gpuFirstError() || "").replace(/\s+/g, " ").slice(0, 300);
        L.push("  first: " + first);
      }
    } else {
      L.push("gpuErrors=(backend has no error hook)");
    }

    const t = G.__tlx;
    if (t) {
      try {
        const b = t.backendState();
        L.push("three api=" + b.api + " pin=" + b.pin + " soft=" + (b.softwareGL ? "GL" : "-") +
          (b.softAdapter ? "/adapter" : "") + (b.softBlit ? "/blit" : "") +
          (b.forceHw ? " FORCE-HW" : "") + (b.forceBatches ? " FORCE-BATCH" : ""));
        L.push("mobile=" + b.isMobile + " tier=" + b.mobileTier + " lite=" + b.liteGpu);
        if (b.envFail) L.push("ENV FACES FAILED: " + b.envFail + "  " + (b.envFailMsg || ""));
      } catch (e) { L.push("backendState threw: " + (e && e.message)); }
      try {
        const e2 = t.envState();
        L.push("env ready=" + e2.ready + " blank=" + e2.blank + " face=" + e2.face + "/" + 6);
      } catch (_) { /* pre-probe */ }
      try {
        const s = t.skyState();
        L.push("sky on=" + s.on + " stars=" + s.stars + " cloud=" + s.cloud);
      } catch (_) { /* sky not built yet */ }
      try {
        const c = t.chunkState();
        L.push("chunks " + c.visible + "/" + c.total + " on=" + c.on);
      } catch (_) { /* no chunked system on this track */ }
      try {
        const ps = t.postState();
        L.push("post on=" + ps.on + " hdr=" + ps.hdr + " rt=" + (ps.targets || []).join("x"));
      } catch (_) { /* post not built */ }
    }

    // Brightness of what is actually on screen. On a WebGPU-claimed canvas a 2D
    // getImageData is impossible, so read the soft blit when there is one and
    // say so plainly when there is not — a missing number beats a made-up one.
    const soft = document.getElementById("game-soft");
    if (soft) {
      try {
        const ctx = soft.getContext("2d");
        const id = ctx.getImageData(0, 0, soft.width, soft.height);
        let sum = 0, max = 0, n = 0;
        for (let i = 0; i < id.data.length; i += 4) {
          const l = (id.data[i] + id.data[i + 1] + id.data[i + 2]) / 3;
          if (l > max) max = l;
          sum += l; n++;
        }
        // max === 0 is ambiguous and the ambiguity matters: an all-zero blit
        // canvas means EITHER a black frame or no blit yet (the soft path only
        // paints when something asks it to). Reporting "black" for the second
        // case is exactly the mistake that cost this project a round.
        L.push(max === 0
          ? "frame(soft): nothing blitted yet (not the same as black)"
          : "frame(soft) mean=" + (n ? (sum / n).toFixed(1) : "?") + " max=" + max.toFixed(0));
      } catch (_) { L.push("frame(soft) unreadable"); }
    } else {
      L.push("frame: native swapchain (no 2D readback)");
    }
    if (G.softPresentState) {
      try { L.push("softPresent=" + JSON.stringify(G.softPresentState()).slice(0, 160)); }
      catch (_) { /* backend without the hook */ }
    }

    // THE ONE LINE THAT IS TRUE WHEN THE LOOP IS DEAD. Everything above reads a
    // value the frame loop wrote, so all of it freezes at its last healthy
    // reading and keeps reporting it — including the fps below, which comes
    // from PerfGov and is written only inside the loop. This overlay runs on
    // setInterval, so it outlives the loop; staleMs is the difference between
    // "painting 60 fps" and "painting the memory of 60 fps".
    if (typeof LoopHealth !== "undefined" && LoopHealth.state) {
      try {
        const h = LoopHealth.state();
        // RELATIVE, not a millisecond threshold: how many frames completed
        // between this paint and the last one. "staleMs > 1000 means stalled"
        // reads a healthy headless page (measured: 6993 ms) and a struggling
        // phone as dead; a count that does not move between two paints is a
        // stall at any frame rate, on any hardware.
        const t = nowMs(), dF = h.frames - _lastFrames, dT = _lastPaint ? Math.round(t - _lastPaint) : 0;
        _lastFrames = h.frames; _lastPaint = t;
        L.push("loop: " + (h.stopped ? "STOPPED at the fault cap"
          : h.frames === 0 ? "NO FRAME COMPLETED YET"
            : dT && dF === 0 ? "NO FRAME in the last " + dT + "ms"
              : "+" + dF + " frames/" + dT + "ms") +
          "  total=" + h.frames + " staleMs=" + (h.staleMs == null ? "-" : h.staleMs) +
          " faults=" + h.faults + "/" + h.totalCap + " run=" + h.run + "/" + h.cap +
          (h.lastFault ? "\n      lastFault: " + h.lastFault : ""));
      } catch (_) { L.push("loop: unreadable"); }
    }

    if (typeof window !== "undefined" && window.__apex && window.__apex.info) {
      try {
        const i = window.__apex.info();
        L.push("track=" + (i.track || "-") + " fps=" + num(Math.round(i.fps || 0)));
      } catch (_) { /* pre-race */ }
    }
    return L.join("\n");
  }

  function tick() {
    if (!pre) return;
    try { pre.textContent = build(); }
    catch (e) { pre.textContent = "gfx-debug failed: " + (e && e.message); }
  }

  function install() {
    if (el || !document.body) return;
    el = document.createElement("div");
    el.id = ID;
    el.style.cssText = "position:fixed;left:8px;top:8px;z-index:9999;max-width:min(92vw,560px);" +
      "max-height:70vh;overflow:auto;background:rgba(0,0,0,.78);color:#9fe;padding:6px 8px;" +
      "border-radius:6px;font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;" +
      "pointer-events:auto;user-select:text";
    const btn = document.createElement("button");
    btn.textContent = "COPY";
    btn.style.cssText = "float:right;margin:0 0 4px 8px;font:10px/1 inherit;padding:3px 6px;" +
      "background:#123;color:#9fe;border:1px solid #9fe;border-radius:4px;cursor:pointer";
    btn.addEventListener("click", () => {
      const text = pre ? pre.textContent : "";
      // clipboard.writeText needs a secure context and can reject; the textarea
      // fallback is what makes this usable over plain http on a phone.
      const done = () => { btn.textContent = "COPIED"; setTimeout(() => { btn.textContent = "COPY"; }, 1200); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
          return;
        }
      } catch (_) { /* fall through */ }
      fallbackCopy(text, done);
    });
    pre = document.createElement("div");
    el.appendChild(btn);
    el.appendChild(pre);
    document.body.appendChild(el);
    tick();
    timer = setInterval(tick, 500);
    try { Log.info("gfx", "[gfx-debug] overlay on"); } catch (_) { /* Log may not be up */ }
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

  function stop() {
    if (timer) clearInterval(timer);
    timer = 0;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null; pre = null;
  }

  if (typeof document !== "undefined" && wanted()) {
    // Always install on a later turn of the loop. The script tag sits with the
    // rest of js/game/, i.e. BEFORE game.js has picked a backend, and the first
    // tick reads GLX — a synchronous install would render one frame of "GLX
    // absent" and could out-order the very thing it is meant to report.
    if (document.body) setTimeout(install, 0);
    else document.addEventListener("DOMContentLoaded", () => setTimeout(install, 0), { once: true });
  }

  return { install, stop, text: build, wanted };
})();

if (typeof window !== "undefined") window.GfxDebug = GfxDebug;
