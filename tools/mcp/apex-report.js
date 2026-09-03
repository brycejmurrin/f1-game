"use strict";
/**
 * @doc Browser paste, not a node tool: one diagnostic JSON bundle from a live page (diag, GL identity, log ring, errors).
 * @skill mcp-probe
 * apex-report — one-paste diagnostic bundle from a LIVE Apex 26 page.
 *
 * Paste into a DevTools console (or load it, see tools/README.md) and it
 * collects everything a renderer bug report needs and downloads it as one JSON
 * file. Written for the transparent-cars class of defect, so it leads with the
 * canvas-alpha evidence, but the bundle is general: diag(), GL identity, the
 * warn/error ring buffer, collected errors, storage, and a frame sample.
 *
 * TWO non-obvious things this exists to get right:
 *
 * 1. A canvas readback from a console command measures the CLEAR, not the
 *    frame. The drawing buffer is cleared after compositing unless
 *    preserveDrawingBuffer, which this game does not set, so by the time a
 *    typed command runs the frame is gone. Useful for a canvas-CONFIG question
 *    (an alpha canvas clears to 0, an opaque one to 255) and useless for "what
 *    did the game actually paint". So we do both, labelled: clearAlpha for the
 *    config, frameAlpha for the content.
 * 2. To see the content we have to read inside the same task as the game's
 *    render, which means borrowing requestAnimationFrame for a few frames and
 *    putting it back. Sampling after EVERY callback and keeping the WORST frame
 *    avoids having to know which rAF is the renderer's.
 *
 * Node parses this file (tests/unit/tools-runnable.test.mjs), so: no top-level
 * await, no top-level return.
 */
(function () {
  const REPORT_VERSION = 1;
  const CANVAS_SEL = "canvas#game";
  // Diagnostic preferences only. Never enumerate the apex26.* namespace: it
  // also contains OAuth refresh tokens and user-supplied TURN credentials.
  // An allowlist keeps a newly-added credential out of reports by default.
  const STORAGE_KEYS = [
    "apex26.gfxBackend", "apex26.gfxBackendProbe", "apex26.gfxHigh",
    "apex26.gfxTlxFail", "apex26.gfxWgxFail", "apex26.gfxWgxLevel",
    "apex26.gfxWgxLite", "apex26.gfxWgxOk", "apex26.envProbeOff",
    "apex26.perChunkOff", "apex26.forceMobileTier", "apex26.tlxAutoGL",
    "apex26.tlxForceGL", "apex26.tlxViz",
  ];

  const safe = function (fn, fallback) {
    try {
      const v = fn();
      return v === undefined ? (fallback === undefined ? null : fallback) : v;
    } catch (e) { return { error: String((e && e.message) || e) }; }
  };

  const pad = function (n) { return String(n).length < 2 ? "0" + n : String(n); };
  const stamp = function () {
    const d = new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  };

  const topN = function (hist, n) {
    return Object.keys(hist).map(function (k) { return [Number(k), hist[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, n);
  };

  // Alpha as the COMPOSITOR would see it. Downscaled with smoothing OFF so the
  // bytes are original alpha values, not blends of neighbours — the question is
  // whether a discrete tag (0.35 -> 89) reached the canvas, and averaging would
  // smear it into something unrecognisable.
  const alphaStats = function (cv, maxW) {
    if (!cv || !cv.width || !cv.height) return null;
    const W = Math.max(1, Math.min(maxW, cv.width));
    const H = Math.max(1, Math.round((cv.height * W) / cv.width));
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);   // fully transparent to start: opacity can only come from the canvas
    g.drawImage(cv, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    let min = 255, below = 0;
    // Is there a PICTURE here, or did we catch the clear? On an opaque canvas
    // both read alpha 255, so alpha alone cannot tell them apart — and a
    // "frame" sample that is really the clear would be a lie the reader has no
    // way to spot. Luminance spread answers it: a cleared buffer is flat.
    let lMin = 255, lMax = 0, lSum = 0, n = 0;
    const hist = Object.create(null);
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < min) min = a;
      if (a < 255) below++;
      hist[a] = (hist[a] || 0) + 1;
      const l = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      if (l < lMin) lMin = l;
      if (l > lMax) lMax = l;
      lSum += l; n++;
    }
    return { w: W, h: H, minAlpha: min, pxBelow255: below, total: W * H,
             topAlphas: topN(hist, 5),
             lumaMin: Math.round(lMin), lumaMax: Math.round(lMax),
             lumaMean: Math.round(lSum / Math.max(1, n)),
             hasPicture: (lMax - lMin) > 12, _c: c };
  };

  // Observation only: getContext hands back the context the canvas already has
  // and silently discards the attributes, so this cannot change what it reads.
  // null means the canvas is not WebGL2 — the WebGPU backend bound it.
  const canvasContext = function () {
    const cv = document.querySelector(CANVAS_SEL);
    if (!cv) return { canvas: false };
    let gl = null;
    try { gl = cv.getContext("webgl2"); } catch (e) { gl = null; }
    if (!gl) return { canvas: true, webgl2: false,
                      note: "not a WebGL2 canvas — WebGPU backend, or the context was lost" };
    const a = gl.getContextAttributes() || {};
    return { canvas: true, webgl2: true, alpha: a.alpha, antialias: a.antialias,
             depth: a.depth, stencil: a.stencil,
             preserveDrawingBuffer: a.preserveDrawingBuffer,
             contextLost: safe(function () { return gl.isContextLost(); }, null) };
  };

  const sampleFrames = function (frames, maxW, timeoutMs) {
    return new Promise(function (resolve) {
      const orig = window.requestAnimationFrame;
      const out = { requested: frames, seen: 0, withPicture: 0, worst: null,
                    worstPng: null, frames: [] };
      if (typeof orig !== "function") { out.error = "no requestAnimationFrame"; resolve(out); return; }
      let left = frames, done = false;
      const finish = function () {
        if (done) return;
        done = true;
        window.requestAnimationFrame = orig;
        resolve(out);
      };
      window.requestAnimationFrame = function (cb) {
        return orig.call(window, function (t) {
          let r;
          try { r = cb(t); } finally {
            if (!done) {
              const s = safe(function () {
                return alphaStats(document.querySelector(CANVAS_SEL), maxW);
              }, null);
              if (s && typeof s.minAlpha === "number") {
                const shot = s._c; delete s._c;
                out.seen++;
                if (s.hasPicture) out.withPicture++;
                out.frames.push({ minAlpha: s.minAlpha, pxBelow255: s.pxBelow255,
                                  hasPicture: s.hasPicture });
                // Prefer a frame that HAS a picture: a flat clear scores a
                // perfect minAlpha and would otherwise win "worst" every time
                // and hide the frame we actually came to look at.
                const better = !out.worst ||
                  (s.hasPicture && !out.worst.hasPicture) ||
                  (s.hasPicture === out.worst.hasPicture && s.minAlpha < out.worst.minAlpha);
                if (better) {
                  out.worst = s;
                  out.worstPng = safe(function () { return shot.toDataURL("image/png"); }, null);
                }
              }
              if (--left <= 0) finish();
            }
          }
          return r;
        });
      };
      // A menu or a backgrounded tab may never call rAF again — never hang.
      setTimeout(finish, timeoutMs);
    });
  };

  const storage = function () {
    const out = {};
    try {
      STORAGE_KEYS.forEach(function (k) {
        const v = localStorage.getItem(k);
        if (v !== null) out[k] = v;
      });
    } catch (e) { return { error: String((e && e.message) || e) }; }
    return out;
  };

  const verdict = function (rep) {
    const out = [];
    const cc = rep.canvasContext || {};
    if (cc.webgl2 === true && cc.alpha === true)
      out.push("DEFECT: the canvas is alpha-composited, so the SSR car-paint tag (0.35) " +
               "in the alpha channel becomes real transparency — this is the see-through-cars bug");
    if (cc.webgl2 === true && cc.alpha === false)
      out.push("OK: the canvas is opaque, so nothing written to alpha can become opacity");
    if (cc.webgl2 === false)
      out.push("NOTE: WebGPU-backed canvas — alpha mode is not readable from script; " +
               "use frameAlpha below and the build number");
    const fa = rep.frameAlpha || {};
    const w = fa.worst;
    if (w && w.minAlpha < 250)
      out.push("frame alpha dips to " + w.minAlpha + " on " + w.pxBelow255 +
               " px: a translucent pixel reached the canvas");
    if (fa.seen > 0 && fa.withPicture === 0)
      out.push("INCONCLUSIVE frameAlpha: " + fa.seen + " frame(s) sampled but none held a " +
               "picture — the reads landed on the post-composite clear, so treat " +
               "canvasContext.alpha as the reliable signal here");
    if (rep.postDeaths > 0)
      out.push(rep.postDeaths + " logged post-chain failure(s) — the path that repaints " +
               "direct-to-canvas with the lit materials still carrying the tag");
    if (rep.state && rep.state !== "race")
      out.push("state is '" + rep.state + "', not 'race' — no cars on screen, so run this " +
               "again WHILE the transparent cars are visible");
    return out;
  };

  const download = function (name, text) {
    try {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { URL.revokeObjectURL(url); a.remove(); } catch (e) { /* already gone */ }
      }, 10000);
      return true;
    } catch (e) { return String((e && e.message) || e); }
  };

  function run(opts) {
    const o = opts || {};
    const frames = o.frames === undefined ? 12 : o.frames;
    const maxW = o.maxW === undefined ? 256 : o.maxW;
    const wantShot = o.shot !== false;
    const wantDownload = o.download !== false;
    const api = window.__apex || null;

    const rep = {
      reportVersion: REPORT_VERSION,
      when: new Date().toISOString(),
      // Query and fragment may contain a report-server capability, an OAuth
      // callback code, or an invite. Origin + pathname is enough to identify the
      // deployment without copying any of those into a long-lived artifact.
      href: safe(function () { return location.origin + location.pathname; }, null),
      agent: {
        ua: navigator.userAgent,
        platform: safe(function () { return navigator.platform; }, null),
        dpr: window.devicePixelRatio,
        viewport: [window.innerWidth, window.innerHeight],
        screen: safe(function () { return [screen.width, screen.height]; }, null),
        visualViewport: safe(function () {
          return window.visualViewport ? [window.visualViewport.width, window.visualViewport.height] : null;
        }, null),
        cores: safe(function () { return navigator.hardwareConcurrency; }, null),
        touchPoints: safe(function () { return navigator.maxTouchPoints; }, null),
        memoryMB: safe(function () {
          return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
        }, null),
      },
      apexPresent: !!api,
      canvasContext: canvasContext(),
      storage: storage(),
    };

    if (api) {
      rep.diag = safe(function () { return api.diag(); }, null);
      rep.build = safe(function () { return rep.diag && rep.diag.build; }, null);
      rep.backend = safe(function () { return rep.diag && rep.diag.env && rep.diag.env.backend; }, null);
      rep.state = safe(function () { return api.info().state; }, null);
      rep.logs = safe(function () { return api.logs({ level: "warn" }).slice(-(o.logs || 300)); }, []);
      rep.postDeaths = safe(function () {
        return api.logs({ level: "warn" }).filter(function (r) {
          return /present failed|post/i.test(r.msg || "");
        }).length;
      }, 0);
    } else {
      rep.note = "window.__apex is absent — is this an Apex 26 page, and did it finish booting?";
      rep.postDeaths = 0;
    }
    rep.errors = safe(function () { return (window.__apexErrors || []).slice(-40); }, []);
    // Cheap and it settles "is the tab I am looking at the build I think shipped".
    const versionP = fetch("version.json", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .catch(function (e) { return { error: String((e && e.message) || e) }; });

    return Promise.all([versionP, sampleFrames(frames, maxW, 4000)]).then(function (res) {
      rep.servedVersion = res[0];
      const fa = res[1];
      rep.clearAlpha = safe(function () {
        const s = alphaStats(document.querySelector(CANVAS_SEL), maxW);
        if (s) delete s._c;
        return s;
      }, null);
      if (fa.worst) delete fa.worst._c;
      rep.frameAlpha = { requested: fa.requested, seen: fa.seen, withPicture: fa.withPicture,
                         worst: fa.worst, perFrame: fa.frames, error: fa.error || null };
      rep.worstFramePng = wantShot ? fa.worstPng : null;
      rep.verdict = verdict(rep);

      const text = JSON.stringify(rep, null, 1);
      const file = "apex-report-" + (rep.build || "nobuild") + "-" +
                   (rep.backend || "nobackend") + "-" + stamp() + ".json";
      window.__apexReport = rep;   // for a copy/paste when neither path below fits

      // Prefer handing the bundle to a collector over making the DEVICE hold a
      // file: on a phone a download is the worst part of this. A relative URL
      // resolves under the page's own directory, so it finds
      // tools/mcp/report-server.mjs when the tree is served locally and 404s
      // harmlessly on the deployed site, where the download is the answer.
      // Cross-origin is deliberately not attempted: an https page cannot POST
      // to a plain-http laptop anyway (mixed content), so a `post` that is not
      // same-origin only produces a confusing console error.
      const target = o.post === undefined ? "apex-report" : o.post;
      const finish = function (posted) {
        let downloaded = false;
        if (!posted && wantDownload) downloaded = download(file, text);
        const summary = { file: file, bytes: text.length, posted: posted || false,
                          downloaded: downloaded, verdict: rep.verdict,
                          hint: "full object on window.__apexReport; re-run: apexReport()" };
        try { console.log("apex-report", summary, rep); } catch (e) { /* no console */ }
        return summary;
      };
      if (!target) return finish(false);
      return fetch(target + "?file=" + encodeURIComponent(file), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      }).then(function (r) {
        if (!r || !r.ok) return finish(false);
        return r.json().then(function (j) {
          return finish((j && j.saved) || true);
        }, function () { return finish(true); });
      }, function () { return finish(false); });   // no collector listening: download
    });
  }

  window.apexReport = run;
  // Pasting it runs it — that is the point of the paste.
  return run();
}());
