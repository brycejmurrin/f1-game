/* Apex 26 — WGX post-processing subsystem (split out of js/render/webgpu/wgx.js).
 * Owns post pipeline construction (_buildPost / _ensureSpatial). Scene targets +
 * present() stay in wgx.js for this peel (soft-present / begin coupling); a
 * follow-up can move ensureTargets + present() here to fully mirror
 * js/render/glx/post.js. Must load before js/render/webgpu/wgx.js.
 */
"use strict";

const WGXPost = (function () {

  function init(core) {
    function _buildPost() {
      if (!core.Post) return;
      try {
        core.pointSampler = core.device.createSampler({ addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
        // Bloom mips are core.POST_HDR_FORMAT textures (ensureTargets) — the
        // pipelines MUST match. These were core.SCENE_FORMAT for months and no run
        // ever caught it, because the mismatch only exists when the core.device
        // grants rg11b10ufloat-renderable (POST_HDR != SCENE) AND the perf
        // tier lets bloom run — first hit by the real-pixel capture rig
        // (2026-08-17, both lineages independently): "Attachment state of
        // [RenderPipeline] is not compatible", one invalid submit per frame,
        // black screen. Godray/blur already used core.POST_HDR_FORMAT.
        core.pBloomDown = core.fsPipe(core.Post.BLOOM_DOWN, core.POST_HDR_FORMAT, null);
        core.pBloomUp   = core.fsPipe(core.Post.BLOOM_UP,   core.POST_HDR_FORMAT, core.ADD_BLEND);   // additive accumulate
        // SSAO samples a DEPTH texture — "auto" layout infers a *filtering*
        // sampler slot, which WebGPU rejects for depth. Build an explicit layout
        // with a non-filtering sampler (core.pointSampler is nearest = non-filtering).
        {
          const ssaoG0 = core.device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "non-filtering" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
          ] });
          const ssaoMod = core.device.createShaderModule({ code: core.Post.SSAO });
          core.pSSAO = core.device.createRenderPipeline({
            layout: core.device.createPipelineLayout({ bindGroupLayouts: [ssaoG0] }),
            vertex: { module: ssaoMod, entryPoint: "vs_main" },
            fragment: { module: ssaoMod, entryPoint: "fs_main", targets: [{ format: core.SSAO_FORMAT }] },
            primitive: { topology: "triangle-list" },
          });
        }
        // SSR — reads scene colour + depth (depth via a NON-filtering sampler);
        // explicit layout like SSAO. Output rgba16float reflection buffer.
        {
          const ssrG0 = core.device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
            { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "non-filtering" } },
            { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
          ] });
          const ssrMod = core.device.createShaderModule({ code: core.Post.SSR });
          core.pSSR = core.device.createRenderPipeline({
            layout: core.device.createPipelineLayout({ bindGroupLayouts: [ssrG0] }),
            vertex: { module: ssrMod, entryPoint: "vs_main" },
            fragment: { module: ssrMod, entryPoint: "fs_main", targets: [{ format: core.SCENE_FORMAT }] },
            primitive: { topology: "triangle-list" },
          });
        }
        {
          const grG0 = core.device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "non-filtering" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
            { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
            { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
            { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
            { binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
          ] });
          const grMod = core.device.createShaderModule({ code: core.Post.GODRAY });
          core.pGodray = core.device.createRenderPipeline({
            layout: core.device.createPipelineLayout({ bindGroupLayouts: [grG0] }),
            vertex: { module: grMod, entryPoint: "vs_main" },
            fragment: { module: grMod, entryPoint: "fs_main", targets: [{ format: core.POST_HDR_FORMAT }] },
            primitive: { topology: "triangle-list" },
          });
        }
        // BLUR uses an EXPLICIT layout with dynamic offsets: queue.writeBuffer is
        // queue-timeline while draw is encoder-timeline, so H then V (and
        // times>1) into one UBO region before submit would leave every pass
        // seeing only the LAST write (WebGPU Fundamentals uniforms lesson).
        // A 256 B-strided ring + setBindGroup(..., [offset]) gives each pass
        // its own slot. SSAO (2) + god-ray times=2 (4) need 6 slots/frame.
        const BLUR_STRIDE = 256;
        const BLUR_SLOTS = 16;
        let blurBGL = null;
        if (core.Post.BLUR) {
          blurBGL = core.device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT,
              buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: core.Post.BLUR_UNIFORM_BYTES } },
          ] });
          const blurPL = core.device.createPipelineLayout({ bindGroupLayouts: [blurBGL] });
          const blurPipe = (fmt) => {
            const mod = core.device.createShaderModule({ code: core.Post.BLUR });
            return core.device.createRenderPipeline({
              layout: blurPL,
              vertex: { module: mod, entryPoint: "vs_main" },
              fragment: { module: mod, entryPoint: "fs_main", targets: [{ format: fmt }] },
              primitive: { topology: "triangle-list" },
            });
          };
          core.pBlur = blurPipe(core.SSAO_FORMAT);
          core.pBlurHDR = blurPipe(core.POST_HDR_FORMAT);
          core._blurBGL = blurBGL;
          core._blurStride = BLUR_STRIDE;
          core._blurSlots = BLUR_SLOTS;
        }
        core.pComposite = core.fsPipe(core.Post.COMPOSITE, core.LDR_FORMAT,    null);
        core.pFXAA      = core.fsPipe(core.Post.FXAA,       core.presentFormat, null);
        // Hardware swapchain is often bgra8unorm; aaTex is always rgba8 LDR.
        // FXAA writing the SGSR intermediate needs a matching LDR pipeline.
        core.pFXAALdr   = (core.presentFormat !== core.LDR_FORMAT)
          ? core.fsPipe(core.Post.FXAA, core.LDR_FORMAT, null) : core.pFXAA;
        core.ssaoUBO      = core.device.createBuffer({ size: core.Post.SSAO_UNIFORM_BYTES,      usage: core.UCD });
        core.blurUBO      = core.device.createBuffer({ size: BLUR_STRIDE * BLUR_SLOTS,       usage: core.UCD });
        core.godrayUBO    = core.device.createBuffer({ size: core.Post.GODRAY_UNIFORM_BYTES,    usage: core.UCD });
        core.compositeUBO = core.device.createBuffer({ size: core.Post.COMPOSITE_UNIFORM_BYTES, usage: core.UCD });
        core.fxaaUBO      = core.device.createBuffer({ size: core.Post.FXAA_UNIFORM_BYTES,      usage: core.UCD });
        core.ssrUBO       = core.device.createBuffer({ size: core.Post.SSR_UNIFORM_BYTES,       usage: core.UCD });
      } catch (_) { core.pComposite = null; }   // disable post; ensureTargets stays inert
    }

    function _ensureSpatial() {
      if (core._sgsrTried || core.WGX_MINIMAL || !core.Post) return !!(core.pSGSR && core.sgsrUBO);
      core._sgsrTried = true;
      // SGSR1 best-effort: a failed module must NOT kill the post chain.
      // Prefer native textureGather unless a player pins the 4-tap A/B.
      try {
        let forceTap = false;
        try { forceTap = localStorage.getItem("apex26.spatialUpscaleGather") === "0"; } catch (_) { /* blocked */ }
        core.pSGSR = null; core._sgsrGather = false;
        if (!forceTap && core.Post.SGSR_GATHER) {
          try {
            core.pSGSR = core.fsPipe(core.Post.SGSR_GATHER, core.presentFormat, null);
            core._sgsrGather = true;
          } catch (_) { core.pSGSR = null; core._sgsrGather = false; }
        }
        if (!core.pSGSR && core.Post.SGSR) {
          core.pSGSR = core.fsPipe(core.Post.SGSR, core.presentFormat, null);
          core._sgsrGather = false;
        }
        if (core.pSGSR) core.sgsrUBO = core.device.createBuffer({ size: core.Post.SGSR_UNIFORM_BYTES, usage: core.UCD });
      } catch (_) { core.pSGSR = null; core.sgsrUBO = null; core._sgsrGather = false; }
      return !!(core.pSGSR && core.sgsrUBO);
    }

    return {
      buildPost: _buildPost,
      ensureSpatial: _ensureSpatial,
    };
  }

  return { init };
})();
Object.freeze(WGXPost);
