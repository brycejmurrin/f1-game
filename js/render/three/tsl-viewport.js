/* Apex 26 — TLXShaders.viewport: the ONE place TLX maps a screen position to a
 * texture position when a render target is drawn into a SUB-VIEWPORT of a
 * fixed, larger allocation (#2655, flag apex26.tlxFixedTargets).
 *
 * WHY: a governor resolution step used to reallocate every post target (11 per
 * step, tlx-post state().rtResizes). With fixed targets the allocation stays
 * at the present size and the chain draws into the top-left (logical) w x h of
 * it. Three's `screenUV` is screenCoordinate / the BOUND TARGET size, so every
 * reader that treats it as 0..1 over the image breaks, and every bilinear tap
 * at the logical edge would blend in stale pixels past it.
 *
 * CONVENTION (verified against three's WebGL and WebGPU backends, rt.viewport
 * is top-left origin): a viewport (0, 0, lw, lh) puts the logical image at the
 * top-left of the target on BOTH backends, so screenCoordinate.xy spans
 * [0,lw] x [0,lh] and a texture uv is simply pixel / physical size.
 *   - view(): the OUTPUT's logical size (uniform).
 *   - uv(view): screenCoordinate / logical size — the 0..1 image uv that
 *     `screenUV` was before (identity: returns screenUV itself when disabled).
 *   - tex(node): wraps a TextureNode so `.sample(uv)` takes a 0..1 LOGICAL
 *     uv: uv * (logical / physical) of whatever texture is bound, clamped to the
 *     centre of the last logical texel (what ClampToEdge did at the real edge).
 *     `.value` reads and writes the bound texture. Disabled: returns the node.
 *   - layout(texture, lw, lh, pw, ph) records a texture's logical rect;
 *     sync() pushes the bound textures' rects into the wrappers' uniforms.
 *
 * The disabled helper returns the original nodes, so the flag-off shader graph
 * is the one that shipped. NEVER touches THREE/TSL at script eval. */
"use strict";

(function () {
  function viewport(THREE, TSL, opts) {
    const enabled = !!(opts && opts.enabled);
    const { uniform, vec2, min, screenUV, screenCoordinate } = TSL;
    const layouts = new WeakMap();   // texture -> { lw, lh, pw, ph }
    const wrappers = [];
    const views = [];

    /** An output-size slot: a pass sets the logical size of the target it draws. */
    function view() {
      const size = uniform(new THREE.Vector2(1, 1));
      const v = {
        size,
        set(w, h) { size.value.set(w, h); },
      };
      views.push(v);
      return v;
    }

    /** The 0..1 image uv of the fragment over the output's logical size (top-left origin). */
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
        set value(t) { node.value = t; },
      };
      wrappers.push(w);
      return w;
    }

    function layout(t, lw, lh, pw, ph) {
      if (!t) return;
      const L = layouts.get(t);
      if (L) { L.lw = lw; L.lh = lh; L.pw = pw; L.ph = ph; } else layouts.set(t, { lw, lh, pw, ph });
    }
    function layoutOf(t) { return (t && layouts.get(t)) || null; }

    /** Push every wrapper's bound-texture rect into its uniforms (once per frame). */
    function sync() {
      for (let i = 0; i < wrappers.length; i++) {
        const w = wrappers[i];
        const L = layouts.get(w.node.value);
        if (L) {
          w.ratio.value.set(L.lw / L.pw, L.lh / L.ph);
          w.maxUV.value.set((L.lw - 0.5) / L.pw, (L.lh - 0.5) / L.ph);
        } else {
          w.ratio.value.set(1, 1);
          w.maxUV.value.set(1, 1);
        }
      }
    }

    return { enabled, view, uv, tex, layout, layoutOf, sync, wrapperCount: () => wrappers.length };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { viewport });
})();
