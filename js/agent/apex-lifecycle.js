const ApexLifecycle = (function () {
  "use strict";

  const COUNTED = ["resize", "visibilitychange", "pageshow", "pagehide", "persistedShow", "contextlost", "contextrestored"];

  function create(G, getGfx) {
    const events = {};
    for (const k of COUNTED) events[k] = 0;
    const last = [];
    const note = (type, extra) => {
      events[type] = (events[type] | 0) + 1;
      last.push(Object.assign({ type, t: Math.round(performance.now()) }, extra || {}));
      if (last.length > 20) last.shift();
    };
    let simHidden = null;
    const canvas = () => document.getElementById("game");
    try {
      window.addEventListener("resize", () => note("resize", { vw: innerWidth, vh: innerHeight }));
      document.addEventListener("visibilitychange", () => note("visibilitychange", { hidden: document.hidden }));
      window.addEventListener("pageshow", (e) => { note("pageshow", { persisted: !!e.persisted }); if (e.persisted) note("persistedShow"); });
      window.addEventListener("pagehide", (e) => note("pagehide", { persisted: !!e.persisted }));
      const cv = canvas();
      if (cv) {
        cv.addEventListener("webglcontextlost", () => note("contextlost"));
        cv.addEventListener("webglcontextrestored", () => note("contextrestored"));
      }
    } catch (_) {  }

    const gfx = () => { try { return getGfx(); } catch (_) { return null; } };
    const api = () => { const g = gfx(); try { const s = g && g.backendState && g.backendState(); return (s && s.api) || null; } catch (_) { return null; } };

    function setHidden(h) {
      if (h) {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        simHidden = true;
      } else {
        delete document.hidden; delete document.visibilityState;
        simHidden = null;
      }
      document.dispatchEvent(new Event("visibilitychange"));
    }

    function bfcache() {
      const mk = (type) => Object.assign(new Event(type), { persisted: true });
      window.dispatchEvent(mk("pagehide"));
      window.dispatchEvent(mk("pageshow"));
    }

    function glExt() {
      if (api() !== "webgl2") return { error: "bound backend is not WebGL2 (api " + api() + ")" };
      const gl = canvas() && canvas().getContext("webgl2");
      const ext = gl && gl.getExtension("WEBGL_lose_context");
      return ext ? { ext } : { error: "WEBGL_lose_context unavailable" };
    }

    function read() {
      const g = gfx();
      const vw = innerWidth, vh = innerHeight;
      const bw = g ? g.width | 0 : 0, bh = g ? g.height | 0 : 0;
      const aspectErr = bw && bh && vw && vh ? Math.abs(bw / bh - vw / vh) / (vw / vh) : null;
      let lost = null;
      try { lost = g && typeof g.ctxLost === "function" ? !!g.ctxLost() : null; } catch (_) {  }
      return {
        visibility: document.visibilityState, hidden: document.hidden, simulatedHidden: simHidden === true,
        focused: typeof document.hasFocus === "function" ? document.hasFocus() : null,
        state: G.state, paused: !!G.paused,
        viewport: [vw, vh], orientation: vw >= vh ? "landscape" : "portrait", dpr: devicePixelRatio,
        backing: [bw, bh], renderScale: g && g.getRenderScale ? g.getRenderScale() : null,
        aspectErr: aspectErr == null ? null : +aspectErr.toFixed(4),
        sized: aspectErr == null ? null : aspectErr < 0.02,
        api: api(), contextLost: lost,
        events: Object.assign({}, events), last: last.slice(),
      };
    }

    function lifecycle(o) {
      const opts = o || {};
      const out = {};
      if (opts.reset) { for (const k of Object.keys(events)) events[k] = 0; last.length = 0; }
      if (opts.hidden !== undefined) setHidden(!!opts.hidden);
      if (opts.bfcache) bfcache();
      if (opts.resize) { const g = gfx(); out.resized = !!(g && g.resize); if (out.resized) g.resize(); }
      if (opts.loseContext || opts.restoreContext) {
        const r = glExt();
        if (r.error) out.error = r.error;
        else if (opts.loseContext) { r.ext.loseContext(); out.lost = true; }
        else { r.ext.restoreContext(); out.restored = true; }
      }
      return Object.assign(read(), out);
    }

    return lifecycle;
  }

  let _one = null;
  function effectiveRes(gfx, canvas) {
    const css = canvas ? [canvas.clientWidth | 0, canvas.clientHeight | 0] : [0, 0];
    const dpr = (typeof window !== "undefined" && +window.devicePixelRatio) || 1;
    let ps = null;
    try { ps = gfx && typeof gfx.getPresentSize === "function" ? gfx.getPresentSize() : null; } catch (_) { ps = null; }
    const present = ps ? [ps.width | 0, ps.height | 0] : [0, 0];
    const buffer = [(gfx && gfx.width) | 0, (gfx && gfx.height) | 0];
    const ratio = (a, b) => (a > 0 && b > 0 ? +(a / b).toFixed(3) : null);
    return { css, dpr, dprCap: ratio(present[0], css[0]), present, buffer, pxPerCss: ratio(buffer[0], css[0]), ofDevice: ratio(buffer[0], css[0] * dpr) };
  }

  const api = (G, getGfx, o) => (_one || (_one = create(G, getGfx)))(o);

  return { api, effectiveRes };
})();
Object.freeze(ApexLifecycle);
