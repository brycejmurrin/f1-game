"use strict";

(function () {
  function viewport(THREE, TSL, opts) {
    const enabled = !!(opts && opts.enabled);
    const { uniform, vec2, min, screenUV, screenCoordinate } = TSL;
    const layouts = new WeakMap();
    const wrappers = [];

    function view() {
      const size = uniform(new THREE.Vector2(1, 1));
      const v = {
        size,
        set(w, h) { size.value.set(w, h); },
      };
      return v;
    }

    function uv(v) {
      if (!enabled || !v) return screenUV;
      return vec2(screenCoordinate.xy).div(v.size);
    }

    function tex(node) {
      if (!enabled) return node;
      const ratio = uniform(new THREE.Vector2(1, 1));
      const maxUV = uniform(new THREE.Vector2(1, 1));
      const w = {
        node, ratio, maxUV,
        sample(luv) { return node.sample(min(vec2(luv).mul(ratio), maxUV)); },
        get value() { return node.value; },
        set value(t) { node.value = t; syncWrapper(w); },
      };
      wrappers.push(w);
      syncWrapper(w);
      return w;
    }

    function layout(t, lw, lh, pw, ph) {
      if (!t) return;
      const L = layouts.get(t);
      if (L) { L.lw = lw; L.lh = lh; L.pw = pw; L.ph = ph; } else layouts.set(t, { lw, lh, pw, ph });
    }
    function layoutOf(t) { return (t && layouts.get(t)) || null; }

    function syncWrapper(w) {
      const L = layouts.get(w.node.value);
      if (L) {
        w.ratio.value.set(L.lw / L.pw, L.lh / L.ph);
        w.maxUV.value.set((L.lw - 0.5) / L.pw, (L.lh - 0.5) / L.ph);
      } else {
        w.ratio.value.set(1, 1);
        w.maxUV.value.set(1, 1);
      }
    }

    function sync() {
      for (let i = 0; i < wrappers.length; i++) syncWrapper(wrappers[i]);
    }

    function scope() {
      const owned = new Set();
      let disposed = false;
      return {
        enabled, view, uv, layout, layoutOf, sync,
        tex(node) {
          if (disposed) throw new Error("Viewport scope is disposed");
          const w = tex(node);
          if (enabled) owned.add(w);
          return w;
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          let n = 0;
          for (let i = 0; i < wrappers.length; i++) {
            if (!owned.has(wrappers[i])) wrappers[n++] = wrappers[i];
          }
          wrappers.length = n;
          owned.clear();
        },
      };
    }

    return { enabled, view, uv, tex, layout, layoutOf, sync, scope, wrapperCount: () => wrappers.length };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { viewport });
})();
