/* Apex 26 — ApexLifecycle: __apex.lifecycle(), the page/render lifecycle hook (#2572).
   Resize, hidden/visible, bfcache and context loss were screenshot-only
   scenarios: nothing counted the events or said whether the backing store
   followed the viewport, and headless Chrome cannot hide a tab. This reads
   the state and drives the transitions from a script. */
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
    let simHidden = null;   // null = the real document.hidden
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
    } catch (_) { /* no window (harness): counters stay 0 */ }

    const gfx = () => { try { return getGfx(); } catch (_) { return null; } };
    const api = () => { const g = gfx(); try { const s = g && g.backendState && g.backendState(); return (s && s.api) || null; } catch (_) { return null; } };

    // Shadow document.hidden / visibilityState on the document instance so
    // every listener (platform-session pause, GLX loss deferral, audio) reads
    // the simulated value, then fire the real event. false/null restores.
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
      // A plain Event carrying `persisted`: every listener reads only that field.
      const mk = (type) => Object.assign(new Event(type), { persisted: true });
      window.dispatchEvent(mk("pagehide"));
      window.dispatchEvent(mk("pageshow"));
    }

    // WEBGL_lose_context on the BOUND context only: getContext("webgl2") on a
    // canvas that holds a WebGPU context returns null, and an unconfigured
    // canvas is never touched (it would bind WebGL2, __apex.diag's trap).
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
      try { lost = g && typeof g.ctxLost === "function" ? !!g.ctxLost() : null; } catch (_) { /* backend mid-swap */ }
      return {
        visibility: document.visibilityState, hidden: document.hidden, simulatedHidden: simHidden === true,
        focused: typeof document.hasFocus === "function" ? document.hasFocus() : null,
        state: G.state, paused: !!G.paused,
        viewport: [vw, vh], orientation: vw >= vh ? "landscape" : "portrait", dpr: devicePixelRatio,
        backing: [bw, bh], renderScale: g && g.getRenderScale ? g.getRenderScale() : null,
        aspectErr: aspectErr == null ? null : +aspectErr.toFixed(4),
        // backing store follows the viewport (gfx.resize is rAF-batched: false
        // for one frame after a resize is expected, after two it is a bug)
        sized: aspectErr == null ? null : aspectErr < 0.02,
        api: api(), contextLost: lost,
        events: Object.assign({}, events), last: last.slice(),
      };
    }

    // lifecycle()                       read
    // lifecycle({hidden:true|false})    simulate a tab hide / show
    // lifecycle({bfcache:true})         pagehide + pageshow(persisted)
    // lifecycle({resize:true})          gfx.resize() now (not on the next rAF)
    // lifecycle({loseContext:true})     WEBGL_lose_context.loseContext() — the
    //                                   backend's loss handler RELOADS the page
    // lifecycle({restoreContext:true})  restoreContext()
    // lifecycle({reset:true})           zero the event counters
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

  let _one = null;   // listeners install once, at the first call
  const api = (G, getGfx, o) => (_one || (_one = create(G, getGfx)))(o);

  // create stays module-local — apex.js only calls ApexLifecycle.api.
  return { api };
})();
Object.freeze(ApexLifecycle);
