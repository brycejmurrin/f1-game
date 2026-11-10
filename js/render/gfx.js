/*
 * Apex 26 — Gfx: the renderer backend seam.
 *
 * GLX (WebGL2: explicit pick and fallback), TLX (three.js/TSL: DEFAULT) and WGX
 * (WebGPU: opt-in) stand behind it. Gfx.create() returns a ready TLX or WGX
 * backend, or null on absence or ANY failure, and THE CALLER (game.js) falls
 * back to GLX. The backend interface contract — lifecycle, resources, the frame
 * protocol and the TUNE_DEFS mirror rule — lives in docs/GFX-CONTRACT.md.
 */
"use strict";

const Gfx = (function () {
  const BACKEND_KEY = "apex26.gfxBackend";   // "webgl2" opts out | "webgpu" = WGX | "three" = TLX

  /**
   * create(canvas, opts) -> Promise<backend | null>
   *
   * Resolves to a ready deferred backend (implementing the interface above):
   * TLX when apex26.gfxBackend is unset or "three", else WGX when WebGPU is present,
   * permitted, and initialises cleanly. Resolves to `null` on: no opt-in
   * backend available, no navigator.gpu, user opt-out (apex26.gfxBackend=
   * "webgl2"), backend not loaded, or ANY init failure. On null the CALLER
   * must fall back to GLX, e.g.:
   *
   *     let gfx = await Gfx.create(canvas);
   *     if (!gfx) { if (!GLX.init(canvas)) { showNoGl(); return; } gfx = GLX; }
   *     // ...every later GLX.method() becomes gfx.method()
   *
   * Never throws (failures resolve to null), so it is safe on every browser and
   * cannot break the existing WebGL2 game.
   */
  // One alternate-init generation owns access to the canvas. Revocation is
  // synchronous even when a browser adapter/init promise cannot be cancelled.
  function createInitOwner(canvas) {
    let active = true, claimed = false;
    const canvasLease = new Proxy(canvas, {
      get(target, key) {
        if (key === "__element") return target;   // ResizeObserver rejects a Proxy: CanvasCssSize observes the real element
        if (key === "getContext") return function (...args) {
          if (!active) return null;
          const context = target.getContext(...args);
          if (context) claimed = true;
          return context;
        };
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(target, key, value) { if (!active) return true; return Reflect.set(target, key, value, target); },
    });
    return { canvas: canvasLease, get active() { return active; }, get claimed() { return claimed; },
      abort() { active = false; }, check() { if (!active) throw new Error("Renderer initialization cancelled"); } };
  }
  // A backend that resolved after its init owner was revoked (boot timeout) is never handed back:
  // free what it holds (best effort: a backend that exposes dispose/destroy) and let the check throw.
  function _ownedOrDiscard(owner, backend) {
    if (!owner) return;
    try { owner.check(); } catch (e) {
      try { const f = backend && (backend.dispose || backend.destroy); if (typeof f === "function") f.call(backend); } catch (_) { /* best effort */ }
      throw e;
    }
  }
  async function create(canvas, opts) {
    try {
      const owner = opts && opts.initOwner;
      if (owner) { owner.check(); canvas = owner.canvas; }
      // RendererBoot has already resolved ephemeral overrides (notably XR).
      // Direct callers may omit the option and keep the saved 2D preference.
      let pref = opts && opts.backend;
      if (pref == null) try { pref = localStorage.getItem(BACKEND_KEY); } catch (_) {}
      if (pref == null) pref = "three";

      // unset / "three" -> TLX (three.js/TSL backend; WebGPU with automatic
      // WebGL2 fallback inside three, so no navigator.gpu requirement here).
      if (pref === "three") {
        if (typeof TLX === "undefined" || !TLX || typeof TLX.create !== "function") {
          Log.info("gfx", "Gfx.bind fallback webgl2");
          return null;
        }
        const backend = await TLX.create(canvas, opts || {});
        _ownedOrDiscard(owner, backend);
        if (backend) { Log.info("gfx", "Gfx.bind backend=three"); return backend; }
        Log.info("gfx", "Gfx.bind fallback webgl2");
        return null;   // TLX.create returns null on any failure
      }

      // Anything else follows the original WebGPU/WGX rules verbatim:
      if (typeof navigator === "undefined" || !navigator.gpu) return null;

      // User / test opt-out: force the WebGL2 path.
      if (pref === "webgl2") {
        Log.info("gfx", "Gfx.bind backend=webgl2");
        return null;
      }

      // WGX must be loaded (script order). If not, fall back silently.
      if (typeof WGX === "undefined" || !WGX || typeof WGX.create !== "function") return null;

      const backend = await WGX.create(canvas, opts || {});
      _ownedOrDiscard(owner, backend);
      if (backend) { Log.info("gfx", "Gfx.bind backend=webgpu"); return backend; }
      Log.info("gfx", "Gfx.bind fallback webgl2");
      return null;   // WGX.create returns null on any failure
    } catch (e) {
      Log.info("gfx", "Gfx.bind fallback webgl2 (" + ((e && e.message) || e) + ")");   // the reason, for triage
      return null;              // any surprise -> WebGL2 fallback
    }
  }

  return { create, createInitOwner };
})();

// No-build global export.
if (typeof window !== "undefined") window.Gfx = Gfx;
