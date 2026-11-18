/* Apex 26 — TLXShaders.memCensus: the texture / render-target / buffer byte census for the TLX backend, the
 * three-path answer to GLX.texCensus() (glx.js). Reads JS objects only: no GPU call, no pixel change.
 *
 * Why not three's own figure: r187's Info costs a mipmapped texture at w*h*4/3, ignores MSAA, and records a
 * render target once at first use, so a target the governor or a rotation resized stays at its first size.
 * This walks three's live registry of textures and render targets (renderer._textures._tracked, WeakRefs; stock r187, read
 * defensively) and does the arithmetic on each texture's CURRENT size, type, format, layers, mips, samples.
 *
 * What it cannot see is in `excludes`: read a total as "what the page asked WebGPU for", never as what the
 * GPU process holds. The swapchain is an estimate and is reported beside the total, not inside it. */
"use strict";

(function () {
  const EXCLUDES = ["driver padding and tiling", "browser GPU-process and compositor copies", "pipelines, shader modules, bind groups",
    "staging and readback buffers in flight", "resources dropped but not yet destroyed", "non-TLX backends"];

  /** Bytes of one texel. three type x format as the WebGPU backend stores it (RGB is stored as RGBA). */
  function texelBytes(T, tex) {
    const type = tex.type, fmt = tex.format;
    if (tex.isDepthTexture) return 4;   // depth24plus / depth32float; a stencil plane may add one byte (estimated: not counted)
    if (type === T.UnsignedInt101111Type || type === T.UnsignedInt5999Type || type === T.UnsignedInt248Type) return 4;
    const ch = fmt === T.RedFormat || fmt === T.RedIntegerFormat ? 1 : (fmt === T.RGFormat || fmt === T.RGIntegerFormat ? 2 : 4);
    const per = type === T.FloatType || type === T.UnsignedIntType || type === T.IntType ? 4
      : (type === T.HalfFloatType || type === T.UnsignedShortType || type === T.ShortType ? 2 : 1);
    return ch * per;
  }

  /** Exact bytes of a full mip chain (or of level 0 when mips is 1) for one layer. */
  function chainBytes(w, h, bpt, mips) {
    let total = 0;
    for (let i = 0; i < mips; i++) total += Math.max(1, w >> i) * Math.max(1, h >> i) * bpt;
    return total;
  }

  /** One texture's row, or null when it has no size yet (never uploaded). */
  function row(T, tex, owner) {
    const rt = owner || tex.renderTarget || null;
    let img = tex.image;
    if (Array.isArray(img)) img = img[0];
    const w = (img && img.width) | 0 || (rt && rt.width) | 0, h = (img && img.height) | 0 || (rt && rt.height) | 0;
    if (w <= 0 || h <= 0) return null;
    const layers = tex.isCubeTexture ? 6 : Math.max(1, (tex.isArrayTexture || tex.isDataArrayTexture || tex.isData3DTexture || (rt && rt.depth > 1)) ? ((img && img.depth) | 0 || (rt && rt.depth) | 0) : 1);
    const own = tex.mipmaps && tex.mipmaps.length > 1 ? tex.mipmaps.length : 0;
    const mips = own || (tex.generateMipmaps ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1);
    const bpt = texelBytes(T, tex);
    const samples = rt && rt.samples > 1 ? rt.samples | 0 : 1;
    // An MSAA target is the resolved texture plus a multisampled one at level 0.
    const bytes = chainBytes(w, h, bpt, mips) * layers + (samples > 1 ? w * h * bpt * layers * samples : 0);
    const kind = tex.isDepthTexture ? "rtDepth" : (rt || tex.isRenderTargetTexture ? "renderTarget"
      : (tex.isCubeTexture ? "cube" : (layers > 1 ? "materialArray" : (tex.isDataTexture ? "data" : "content2D"))));
    return { kind, name: tex.name || (rt && rt.texture && rt.texture.name) || "", w, h, layers, mips, samples, bpt, bytes };
  }

  /** The census of a live TLX backend. `t` is GLX.__tlx (tlx.js): { renderer, THREE, ctxLost? }. */
  function memCensus(t, top) {
    const out = { supported: true, backend: "tlx", bytes: 0, count: 0, mb: 0, byKind: {}, biggest: null, targets: [],
      buffers: { attrBytes: 0, indexBytes: 0, uniformBytes: 0, source: "three" }, swapchainEst: null, three: null,
      estimated: ["swapchainEst (one drawing buffer; the browser keeps more)", "rtDepth (4 bytes a texel, stencil not counted)", "buffers (three's own byte counts)"],
      excludes: EXCLUDES };
    const r = t && t.renderer, T = t && t.THREE;
    try { if (t && typeof t.ctxLost === "function" && t.ctxLost()) out.contextLost = true; } catch (_) { /* a probe, never a throw */ }
    const tracked = r && r._textures && r._textures._tracked;
    if (!T || !tracked || typeof tracked.forEach !== "function") {
      return Object.assign(out, { supported: false, bytes: null, count: null, mb: null, error: "three's texture registry is not readable on this build" });
    }
    const seen = new Set(), rows = [];
    const add = (tex, owner) => {
      if (!tex || seen.has(tex)) return;
      seen.add(tex);
      let x = null;
      try { x = row(T, tex, owner); } catch (_) { x = null; }
      if (x) rows.push(x);
    };
    // The registry holds render targets and plain textures alike. A target's colour textures and its depth
    // texture (its own, or the one three made for it) are counted under the target, so its samples apply.
    tracked.forEach((ref) => {
      const o = ref && typeof ref.deref === "function" ? ref.deref() : ref;
      if (!o) return;
      if (!o.isRenderTarget) { add(o, null); return; }
      for (const tex of o.textures || []) add(tex, o);
      let depth = o.depthTexture || null;
      try { if (!depth && (o.depthBuffer || o.stencilBuffer)) depth = (r._textures.get(o) || {}).depthTexture || null; } catch (_) { depth = null; }
      add(depth, o);
    });
    for (const x of rows) {
      out.bytes += x.bytes; out.count++;
      out.byKind[x.kind] = (out.byKind[x.kind] || 0) + x.bytes;
      if (!out.biggest || x.bytes > out.biggest.bytes) out.biggest = x;
    }
    rows.sort((a, b) => b.bytes - a.bytes);
    out.targets = rows.filter((x) => x.kind === "renderTarget" || x.kind === "rtDepth").slice(0, top > 0 ? top : 16);
    const m = r.info && r.info.memory;
    if (m) {
      out.buffers.attrBytes = m.attributesSize | 0; out.buffers.indexBytes = m.indexAttributesSize | 0; out.buffers.uniformBytes = m.uniformBuffersSize | 0;
      out.three = { texturesSize: m.texturesSize | 0, textures: m.textures | 0, renderTargets: m.renderTargets | 0, total: m.total | 0 };
    }
    const bufBytes = out.buffers.attrBytes + out.buffers.indexBytes + out.buffers.uniformBytes;
    out.byKind.buffers = bufBytes; out.bytes += bufBytes;
    out.mb = Math.round(out.bytes / 104857.6) / 10;
    try {
      const c = r.domElement;
      if (c && c.width > 0 && c.height > 0) out.swapchainEst = { w: c.width | 0, h: c.height | 0, bytes: c.width * c.height * 4 };
    } catch (_) { /* no canvas (node harness) */ }
    return out;
  }

  // TEMPORARY install (2026-11-18): tlx.js declares `texCensus: undefined` and is in another open PR's diff, so
  // until its own member calls memCensus this fills the façade slot once the backend is bound (renderer-boot.js
  // fires apex-gfx-live after the descriptor copy). __apex.texCensus() and the phone bridge then read it as is.
  function install(G) {
    if (!G || !G.__tlx || typeof G.texCensus === "function") return false;
    G.texCensus = () => memCensus(G.__tlx);
    return true;
  }
  try {
    window.addEventListener("apex-gfx-live", () => { try { install(window.GLX); } catch (_) { /* a census is never a boot failure */ } });
  } catch (_) { /* no event surface (node harness) */ }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { memCensus, memInstall: install });
})();
