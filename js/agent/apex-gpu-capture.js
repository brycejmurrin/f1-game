/* Apex 26 — ApexGpuCapture (#2964): dev-only __apex.gpuCapture toggle that
   injects vendored Spector.js (captureCanvas) or webgl-lint into the page for
   GLX / TLX WebGL debugging. Off by default; scripts load only when enabled
   (zero cost when off). Same-origin vendor/ paths so CSP script-src 'self'
   allows them. Returns a JSON capture summary or lint findings. */
const ApexGpuCapture = (function () {
  "use strict";

  const KEY = "apex26.gpuCapture";
  const SPECTOR_SRC = "vendor/gpu-capture/spector.bundle.js";
  const LINT_SRC = "vendor/gpu-capture/webgl-lint.js";

  let mode = null;          // null | "spector" | "webgl-lint"
  let spector = null;
  let lastSummary = null;
  let lintFindings = [];
  let loadPromise = null;
  let scriptErrHook = null;

  function say(msg) {
    try { Log.info("apex", "[gpuCapture] " + msg); } catch (_) { /* Log may not be up */ }
  }

  function store(v) {
    try {
      if (!v) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, v);
    } catch (_) { /* private mode */ }
  }

  // Off by default everywhere. Explicit ?gpuCapture=spector|lint|1 or a stored
  // apex26.gpuCapture value turns it on; ?gpuCapture=0 clears.
  function wanted() {
    try {
      const m = /[?&]gpuCapture=([a-z0-9_-]+)/i.exec(location.search);
      if (m) {
        const v = m[1].toLowerCase();
        if (v === "0" || v === "off" || v === "false") { store(null); return null; }
        if (v === "1" || v === "on" || v === "spector") { store("spector"); return "spector"; }
        if (v === "lint" || v === "webgl-lint") { store("webgl-lint"); return "webgl-lint"; }
      }
      const s = localStorage.getItem(KEY);
      if (s === "spector" || s === "webgl-lint") return s;
    } catch (_) { /* no location/storage */ }
    return null;
  }

  function status() {
    return {
      on: !!mode,
      mode: mode,
      supported: true,
      loading: !!loadPromise,
      lastSummary: lastSummary,
      findings: lintFindings.slice(),
      spector: !!spector,
      sources: { spector: SPECTOR_SRC, webglLint: LINT_SRC },
    };
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (typeof document === "undefined") return reject(new Error("no document"));
      const existing = document.querySelector('script[data-apex-gpu-capture="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === "1") return resolve();
        existing.addEventListener("load", function () { resolve(); });
        existing.addEventListener("error", function () { reject(new Error("failed to load " + src)); });
        return;
      }
      const s = document.createElement("script");
      s.src = src + (/\?/.test(src) ? "" : "?v=dev");
      s.async = true;
      s.dataset.apexGpuCapture = src;
      s.onload = function () { s.dataset.loaded = "1"; resolve(); };
      s.onerror = function () { reject(new Error("failed to load " + src)); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function gameCanvas() {
    try {
      return document.getElementById("game")
        || document.querySelector("canvas#game")
        || document.querySelector("canvas");
    } catch (_) { return null; }
  }

  function attachLintCollector() {
    if (scriptErrHook) return;
    scriptErrHook = function (ev) {
      const msg = (ev && (ev.message || (ev.error && ev.error.message))) || String(ev);
      if (/webgl|GMAN|lint/i.test(msg)) {
        lintFindings.push({ t: Date.now(), message: msg });
        if (lintFindings.length > 64) lintFindings.shift();
      }
    };
    try { window.addEventListener("error", scriptErrHook); } catch (_) { /* harness */ }
  }

  function detachLintCollector() {
    if (!scriptErrHook) return;
    try { window.removeEventListener("error", scriptErrHook); } catch (_) { /* harness */ }
    scriptErrHook = null;
  }

  function disable() {
    mode = null;
    spector = null;
    lastSummary = null;
    loadPromise = null;
    store(null);
    detachLintCollector();
    say("off");
    return status();
  }

  async function enable(next) {
    const want = next === "webgl-lint" || next === "lint" ? "webgl-lint" : "spector";
    if (mode === want && (want !== "spector" || spector)) return status();
    store(want);
    mode = want;
    const src = want === "webgl-lint" ? LINT_SRC : SPECTOR_SRC;
    loadPromise = loadScript(src).then(function () {
      if (want === "spector") {
        // Bracket read: SPECTOR is injected by the vendored bundle, not a
        // manifest global (same pattern as jsQR / Spotify SDK).
        const ns = (typeof window !== "undefined" && window["SPECTOR"]) || null;
        if (!ns || typeof ns.Spector !== "function") {
          throw new Error("SPECTOR global missing after script load");
        }
        spector = new ns.Spector();
        try { if (typeof spector.spyCanvases === "function") spector.spyCanvases(); } catch (_) { /* optional */ }
        say("spector on");
      } else {
        attachLintCollector();
        say("webgl-lint on");
      }
    }).catch(function (e) {
      mode = null;
      spector = null;
      say("enable failed: " + ((e && e.message) || e));
      throw e;
    }).finally(function () { loadPromise = null; });
    await loadPromise;
    return status();
  }

  function summarizeCapture(cap) {
    if (!cap || typeof cap !== "object") return { ok: false, reason: "empty_capture" };
    const cmds = Array.isArray(cap.commands) ? cap.commands : [];
    const canvas = cap.canvas || null;
    return {
      ok: true,
      mode: "spector",
      commandCount: cmds.length,
      canvas: canvas ? {
        width: canvas.width || null,
        height: canvas.height || null,
        id: canvas.id || null,
      } : null,
      // Keep the payload small for __apex / MCP: names only, no thumbnails.
      commandNames: cmds.slice(0, 64).map(function (c) {
        return (c && (c.name || c.text || c.command)) || "?";
      }),
      markers: Array.isArray(cap.markers) ? cap.markers.length : 0,
      frameEndTime: cap.frameEndTime != null ? cap.frameEndTime : null,
    };
  }

  function captureOnce() {
    if (mode !== "spector" || !spector) {
      return Promise.resolve({ ok: false, reason: "spector_off", status: status() });
    }
    const canvas = gameCanvas();
    if (!canvas) return Promise.resolve({ ok: false, reason: "no_canvas", status: status() });
    return new Promise(function (resolve) {
      let settled = false;
      const done = function (summary) {
        if (settled) return;
        settled = true;
        lastSummary = summary;
        resolve(summary);
      };
      try {
        if (spector.onCapture && typeof spector.onCapture.add === "function") {
          spector.onCapture.add(function (cap) { done(summarizeCapture(cap)); });
        }
        if (spector.onError && typeof spector.onError.add === "function") {
          spector.onError.add(function (err) {
            done({ ok: false, reason: "spector_error", message: String(err && err.message || err) });
          });
        }
        // quickCapture=true skips thumbnails — fine for JSON summary / SwiftShader.
        if (typeof spector.captureCanvas === "function") {
          spector.captureCanvas(canvas, true);
        } else if (typeof spector.captureNextFrame === "function") {
          spector.captureNextFrame(canvas, true);
        } else {
          done({ ok: false, reason: "no_capture_api" });
          return;
        }
      } catch (e) {
        done({ ok: false, reason: "capture_threw", message: (e && e.message) || String(e) });
        return;
      }
      setTimeout(function () {
        done({ ok: false, reason: "capture_timeout", status: status() });
      }, 8000);
    });
  }

  function lintReport() {
    const findings = lintFindings.slice();
    let redundant = null;
    try {
      const canvas = gameCanvas();
      const gl = canvas && (canvas.getContext("webgl2") || canvas.getContext("webgl"));
      const ext = gl && gl.getExtension && gl.getExtension("GMAN_debug_helper");
      if (ext && typeof ext.getAndResetRedundantCallInfo === "function") {
        redundant = ext.getAndResetRedundantCallInfo();
      }
    } catch (_) { /* context may be lost or TLX-owned */ }
    return {
      ok: true,
      mode: "webgl-lint",
      on: mode === "webgl-lint",
      findings: findings,
      findingCount: findings.length,
      redundant: redundant,
    };
  }

  /**
   * __apex.gpuCapture(arg)
   *   undefined           → status
   *   false / "off"       → disable
   *   true / "spector"    → enable Spector
   *   "webgl-lint"/"lint" → enable webgl-lint
   *   "capture"           → Spector capture summary JSON
   *   "findings"          → webgl-lint findings JSON
   *   { mode, capture? }  → enable then optionally capture/findings
   */
  function api(arg) {
    if (arg === undefined) return status();
    if (arg === false || arg === null || arg === "off") return disable();
    if (arg === "capture") return captureOnce();
    if (arg === "findings") return lintReport();
    if (arg === true || arg === "on" || arg === "spector") {
      return enable("spector");
    }
    if (arg === "lint" || arg === "webgl-lint") return enable("webgl-lint");
    if (arg && typeof arg === "object") {
      const m = arg.mode || (arg.spector ? "spector" : (arg.lint ? "webgl-lint" : null));
      if (arg.off) return disable();
      if (!m && arg.capture) return captureOnce();
      if (!m && arg.findings) return lintReport();
      if (!m) return status();
      return enable(m).then(function (st) {
        if (arg.capture) return captureOnce();
        if (arg.findings) return lintReport();
        return st;
      });
    }
    return status();
  }

  function boot() {
    const w = wanted();
    if (w) {
      enable(w).catch(function () { /* never block boot */ });
    }
  }

  function hooks() {
    return { gpuCapture: function (a) { return api(a); } };
  }

  return { api, boot, wanted, status, hooks, disable, enable };
})();

if (typeof window !== "undefined") {
  window.ApexGpuCapture = ApexGpuCapture;
  try { ApexGpuCapture.boot(); } catch (_) { /* never block */ }
}
