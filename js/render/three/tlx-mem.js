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
    if (tex.isDepthTexture) return fmt === T.DepthFormat && type === T.UnsignedShortType ? 2 : 4;   // stencil storage is estimated
    if (type === T.UnsignedInt101111Type || type === T.UnsignedInt5999Type || type === T.UnsignedInt248Type) return 4;
    const ch = fmt === T.RedFormat || fmt === T.RedIntegerFormat ? 1 : (fmt === T.RGFormat || fmt === T.RGIntegerFormat ? 2 : 4);
    const per = type === T.FloatType || type === T.UnsignedIntType || type === T.IntType ? 4
      : (type === T.HalfFloatType || type === T.UnsignedShortType || type === T.ShortType ? 2 : 1);
    return ch * per;
  }

  /** A volume shrinks on all three axes. Arrays and cubemaps retain their layers at every mip. */
  function chainBytes(w, h, layers, bpt, mips, volume) {
    let total = 0;
    for (let i = 0; i < mips; i++) {
      total += w * h * layers * bpt;
      w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
      if (volume) layers = Math.max(1, layers >> 1);
    }
    return total;
  }

  /** One texture's row, or null when it has no size yet (never uploaded). */
  function row(T, tex, owner, backend) {
    const rt = owner || tex.renderTarget || null;
    let img = tex.image;
    if (Array.isArray(img)) img = img[0];
    if (img && img.image) img = img.image;
    // TLX drops canvas sources to a 1×1 stand-in after upload and closes
    // owned bitmaps on retirement. Neither action shrinks the pooled GPU texture.
    const w = tex.__tlxPoolW || ((img && img.width) | 0) || ((rt && rt.width) | 0);
    const h = tex.__tlxPoolH || ((img && img.height) | 0) || ((rt && rt.height) | 0);
    if (w <= 0 || h <= 0) return null;
    const volume = !!(tex.is3DTexture || tex.isData3DTexture);
    const layers = tex.isCubeTexture ? 6 : Math.max(1, (tex.isArrayTexture || tex.isDataArrayTexture || volume || (rt && rt.depth > 1)) ? ((img && img.depth) | 0 || (rt && rt.depth) | 0) : 1);
    const own = tex.mipmaps?.length || 0;
    // r187's non-target CubeTexture.mipmaps starts after its six base faces.
    let mips = own ? own + (tex.isCubeTexture && !rt ? 1 : 0) : (tex.generateMipmaps ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1);
    const bpt = texelBytes(T, tex);
    let samples = rt && rt.samples > 1 ? rt.samples : 1;
    let primarySamples = 1, extraSampleLayers = samples > 1 ? layers * samples : 0;
    if ((rt || tex.isDepthTexture) && backend?.isWebGPUBackend && backend.has(tex)) {
      const data = backend.get(tex);
      // envFace toggles generateMipmaps around a face render. The allocation keeps its mip levels.
      if (data.texture?.mipLevelCount) mips = data.texture.mipLevelCount;
      if (data.texture?.sampleCount) {
        // GPUTexture metadata: ordinary depth is multisampled directly. Colour has a resolve texture,
        // and layered targets can have one extra multisampled attachment per layer.
        primarySamples = samples = data.texture.sampleCount;
        extraSampleLayers = 0;
        for (const extra of data.msaaTextures || (data.msaaTexture ? [data.msaaTexture] : [])) {
          samples = Math.max(samples, extra.sampleCount);
          extraSampleLayers += extra.sampleCount * extra.depthOrArrayLayers;
        }
      }
    }
    // WebGLFallback's separate MSAA depth renderbuffer uses DEPTH_COMPONENT24 or DEPTH32F even
    // when its resolved depth texture is DEPTH_COMPONENT16. WebGPU uses the texture format for both.
    const extraBpt = backend?.isWebGLBackend && tex.isDepthTexture ? 4 : bpt;
    const bytes = chainBytes(w, h, layers, bpt, mips, volume) * primarySamples + w * h * extraBpt * extraSampleLayers;
    const kind = tex.isDepthTexture ? "rtDepth" : (rt || tex.isRenderTargetTexture ? "renderTarget"
      : (tex.isCubeTexture ? "cube" : volume ? "volume" : (layers > 1 ? "materialArray" : (tex.isDataTexture ? "data" : "content2D"))));
    return { kind, name: tex.name || (rt && rt.texture && rt.texture.name) || "", w, h, layers, mips, samples, bpt, bytes };
  }

  /** The census of a live TLX backend. `t` is GLX.__tlx (tlx.js): { renderer, THREE, ctxLost? }. */
  function memCensus(t, top) {
    const out = { supported: true, backend: "tlx", bytes: 0, count: 0, mb: 0, byKind: {}, biggest: null, targets: [],
      buffers: { attrBytes: 0, indexBytes: 0, uniformBytes: 0, source: "three" }, swapchainEst: null, three: null,
      estimated: ["swapchainEst (one drawing buffer; the browser keeps more)", "rtDepth (16-bit or estimated 32-bit depth, extra stencil storage not counted)", "buffers (three's own byte counts)", "WebGL multisample renderbuffers (requested sample count)"],
      excludes: EXCLUDES };
    const r = t && t.renderer, T = t && t.THREE;
    try { if (t && typeof t.ctxLost === "function" && t.ctxLost()) return Object.assign(out, { contextLost: true }); } catch (_) { /* a probe, never a throw */ }
    const tracked = r && r._textures && r._textures._tracked;
    if (!T || !tracked || typeof tracked.forEach !== "function") {
      return Object.assign(out, { supported: false, bytes: null, count: null, mb: null, error: "three's texture registry is not readable on this build" });
    }
    const seen = new Set(), rows = [];
    const add = (tex, owner) => {
      if (!tex || seen.has(tex)) return;
      seen.add(tex);
      let x = null;
      try { x = row(T, tex, owner, r.backend); } catch (_) { x = null; }
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
      out.buffers.attrBytes = m.attributesSize ?? 0; out.buffers.indexBytes = m.indexAttributesSize ?? 0; out.buffers.uniformBytes = m.uniformBuffersSize ?? 0;
      out.three = { texturesSize: m.texturesSize ?? 0, textures: m.textures ?? 0, renderTargets: m.renderTargets ?? 0, total: m.total ?? 0 };
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

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { memCensus });
})();
