"use strict";

const Gfx = (function () {
  const BACKEND_KEY = "apex26.gfxBackend";

  function createInitOwner(canvas) {
    let active = true, claimed = false;
    const canvasLease = new Proxy(canvas, {
      get(target, key) {
        if (key === "__element") return target;
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
  function _ownedOrDiscard(owner, backend) {
    if (!owner) return;
    try { owner.check(); } catch (e) {
      try { const f = backend && (backend.dispose || backend.destroy); if (typeof f === "function") f.call(backend); } catch (_) {  }
      throw e;
    }
  }
  async function create(canvas, opts) {
    try {
      const owner = opts && opts.initOwner;
      if (owner) { owner.check(); canvas = owner.canvas; }
      let pref = opts && opts.backend;
      if (pref == null) try { pref = localStorage.getItem(BACKEND_KEY); } catch (_) {}
      if (pref == null) pref = "three";

      if (pref === "three") {
        if (typeof TLX === "undefined" || !TLX || typeof TLX.create !== "function") {
          Log.info("gfx", "Gfx.bind fallback webgl2");
          return null;
        }
        const backend = await TLX.create(canvas, opts || {});
        _ownedOrDiscard(owner, backend);
        if (backend) { Log.info("gfx", "Gfx.bind backend=three"); return backend; }
        Log.info("gfx", "Gfx.bind fallback webgl2");
        return null;
      }

      if (typeof navigator === "undefined" || !navigator.gpu) return null;

      if (pref === "webgl2") {
        Log.info("gfx", "Gfx.bind backend=webgl2");
        return null;
      }

      if (typeof WGX === "undefined" || !WGX || typeof WGX.create !== "function") return null;

      const backend = await WGX.create(canvas, opts || {});
      _ownedOrDiscard(owner, backend);
      if (backend) { Log.info("gfx", "Gfx.bind backend=webgpu"); return backend; }
      Log.info("gfx", "Gfx.bind fallback webgl2");
      return null;
    } catch (e) {
      Log.info("gfx", "Gfx.bind fallback webgl2 (" + ((e && e.message) || e) + ")");
      return null;
    }
  }

  return { create, createInitOwner };
})();

if (typeof window !== "undefined") window.Gfx = Gfx;
