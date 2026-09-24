/* Apex 26 — WGX shadow subsystem (split out of js/render/webgpu/wgx.js).
 * Owns the static sun shadow map, the per-frame dynamic CAR map, the nearest-
 * floodlight spot map, the PCSS blocker downsample, and the depth-only cast
 * API (shadowBegin/castShadow/shadowEnd + car/lamp + castShadowInstanced).
 * castShadowChunked stays here for this peel (GLX keeps it on GLXChunked; a
 * follow-up can move it with wgx-chunked.js). Mirror of js/render/glx/shadow.js.
 * Must load before js/render/webgpu/wgx.js (wgx.js calls WGXShadow.init).
 */
"use strict";

const WGXShadow = (function () {

  function init(core) {
    const DEPTH_FORMAT = core.DEPTH_FORMAT;
    const IDENT = core.IDENT;
    const Z01 = core.Z01;
    const SHADOW_VERTEX_LAYOUT = core.SHADOW_VERTEX_LAYOUT;
    const SHADOW_INSTANCE_LAYOUT = core.SHADOW_INSTANCE_LAYOUT;
    const WGX_LITE = core.WGX_LITE;
    const IS_MOBILE = core.IS_MOBILE;
    const MOBILE_TIER = core.MOBILE_TIER;
    // Keyed on the DEVICE (WGX_LITE), not the memory tier — same rule as
    // js/render/glx/shadow.js (see the SHADOW_SIZE comment formerly in wgx.js).
    const SHADOW_SIZE = WGX_LITE ? 1024 : 2048;
    const CAR_SHADOW_SIZE = 1024;
    const CAR_SHADOW_ALLOC = WGX_LITE ? 1 : CAR_SHADOW_SIZE;
    const LAMP_SHADOW_SIZE = WGX_LITE ? 1 : 512;
    const SHADOW_SLOTS = core.SHADOW_SLOTS;
    const SHADOW_MODEL_STRIDE = 256;
    const SHADOW_MODEL_F32_STRIDE = SHADOW_MODEL_STRIDE >> 2;
    // Pooled identity model for castShadowInstanced when the batch has no
    // per-instance matrices to pack (was module-local in wgx.js).
    const _shadowIdent = new Float32Array(16);

    let shadowTex = null, shadowView = null, shadowSampler = null;
    let shadowUBO, shadowModelUBO, shadowG0Layout, shadowG1Layout, shadowModule,
        shadowPipeline, shadowG0BindGroup, shadowModelBindGroup;
    let _shadowRendered = false, _shadowLightVP = null;
    const shadowLVPData = new Float32Array(16);
    const shadowModelRing = new Float32Array(SHADOW_SLOTS * SHADOW_MODEL_F32_STRIDE);
    const _shadowDynOff = [0];
    let shadowEncoder = null, shadowPass = null, _shadowSlot = 0, _shadowOverflow = 0;
    let _pendingShadowEnc = null, _shadowFlushed = 0;
    let carShadowTex = null, carShadowView = null, carShadowUBO = null, carShadowG0BindGroup = null;
    let _carShadowArmed = false, _carArms = 0, _carBoxScale = 1;
    const carShadowLVPData = new Float32Array(16);
    let lampShadowTex = null, lampShadowView = null, lampShadowUBO = null, lampShadowG0BindGroup = null;
    let _lampShadowArmed = false, _lampArms = 0, _lampIdx = -1;
    const lampShadowLVPData = new Float32Array(16);
    let blockerTex = null, blockerView = null, blockerSampler = null;
    let blockerUBO = null, blockerBG = null, blockerPipeline = null, blockerG0Layout = null;


    function setup() {
      // Sun shadow map: a depth texture rendered from the sun's POV, sampled by
      // the LIT shader through a comparison sampler (PCF). Fixed size, created
      // once so frameBindGroup can bind its view at init.
      shadowTex = core.device.createTexture({
        size: [SHADOW_SIZE, SHADOW_SIZE], format: DEPTH_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      shadowView = shadowTex.createView();
      shadowSampler = core.device.createSampler({ compare: "less", magFilter: "linear", minFilter: "linear" });

      // Dynamic CAR shadow map (GLX parity): car meshes only, re-rendered every
      // frame — movers can't live in the snap-cached static map above. Always
      // created so binding 8 is a valid depth texture, but at CAR_SHADOW_ALLOC —
      // 1×1 on a phone, where GLX creates no car map at all and the pass below
      // is gated off (see the CAR_SHADOW_ALLOC comment).
      carShadowTex = core.device.createTexture({
        size: [CAR_SHADOW_ALLOC, CAR_SHADOW_ALLOC], format: DEPTH_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      carShadowView = carShadowTex.createView();
      // Blocker map (PCSS-lite downsampled sun shadow map). Isolated: Safari
      // may refuse r16float as a color target; LIT still needs a float view
      // at binding 7, so a 1×1 placeholder keeps the frame group valid.
      try {
        blockerTex = core.device.createTexture({
          size: [512, 512], format: "r16float",
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        blockerView = blockerTex.createView();
      } catch (_) {
        blockerTex = core.device.createTexture({
          size: [1, 1], format: core.SCENE_FORMAT,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        blockerView = blockerTex.createView();
      }
      blockerSampler = core.device.createSampler({
        magFilter: "nearest",
        minFilter: "nearest",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      shadowUBO = core.device.createBuffer({ size: WGSLChunks.SHADOW_LVP_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      shadowModelUBO = core.device.createBuffer({ size: SHADOW_SLOTS * SHADOW_MODEL_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      shadowG0Layout = core.device.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
      });
      shadowG1Layout = core.device.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: WGSLChunks.SHADOW_MODEL_BYTES } }],
      });
      shadowModule = core.device.createShaderModule({ code: WGSLChunks.SHADOW });
      shadowPipeline = core.device.createRenderPipeline({
        layout: core.device.createPipelineLayout({ bindGroupLayouts: [shadowG0Layout, shadowG1Layout] }),
        vertex: { module: shadowModule, entryPoint: "vs_main", buffers: [SHADOW_VERTEX_LAYOUT, SHADOW_INSTANCE_LAYOUT] },
        // No fragment stage — depth-only. Slope-scaled bias fights shadow acne.
        // GLX renders the shadow depth with CULLING OFF ("render back faces to avoid
        // peter-panning" — js/render/glx/shadow.js, the CULL_FACE disable), so match that with cullMode:"none" — winding is
        // then moot and both faces cast, exactly like GLX.
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "less",
          depthBias: 2, depthBiasSlopeScale: 3, depthBiasClamp: 0 },
      });
      shadowG0BindGroup = core.device.createBindGroup({
        layout: shadowG0Layout, entries: [{ binding: 0, resource: { buffer: shadowUBO } }],
      });
      shadowModelBindGroup = core.device.createBindGroup({
        layout: shadowG1Layout,
        entries: [{ binding: 0, resource: { buffer: shadowModelUBO, offset: 0, size: WGSLChunks.SHADOW_MODEL_BYTES } }],
      });
      // Car shadow pass shares the depth pipeline + model ring; only the
      // lightVP uniform differs, via its own group-0 bind group.
      carShadowUBO = core.device.createBuffer({ size: WGSLChunks.SHADOW_LVP_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      carShadowG0BindGroup = core.device.createBindGroup({
        layout: shadowG0Layout, entries: [{ binding: 0, resource: { buffer: carShadowUBO } }],
      });
      lampShadowTex = core.device.createTexture({
        size: [LAMP_SHADOW_SIZE, LAMP_SHADOW_SIZE], format: DEPTH_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      lampShadowView = lampShadowTex.createView();
      lampShadowUBO = core.device.createBuffer({ size: WGSLChunks.SHADOW_LVP_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      lampShadowG0BindGroup = core.device.createBindGroup({
        layout: shadowG0Layout, entries: [{ binding: 0, resource: { buffer: lampShadowUBO } }],
      });
      blockerUBO = core.device.createBuffer({
        size: 16, // size of BlockerU
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      // srcTexel uniform data (1/SHADOW_SIZE, 1/SHADOW_SIZE, 0, 0)
      const blockerUBOData = new Float32Array([1.0 / SHADOW_SIZE, 1.0 / SHADOW_SIZE, 0.0, 0.0]);
      core.device.queue.writeBuffer(blockerUBO, 0, blockerUBOData);

      try {
        blockerG0Layout = core.device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
          ]
        });
        const blockerModule = core.device.createShaderModule({ code: WGSLChunks.BLOCKER });
        blockerPipeline = core.device.createRenderPipeline({
          layout: core.device.createPipelineLayout({ bindGroupLayouts: [blockerG0Layout] }),
          vertex: { module: blockerModule, entryPoint: "vs_main" },
          fragment: { module: blockerModule, entryPoint: "fs_main", targets: [{ format: "r16float" }] },
          primitive: { topology: "triangle-list" },
        });
        blockerBG = core.device.createBindGroup({
          layout: blockerG0Layout,
          entries: [
            { binding: 0, resource: shadowView },
            { binding: 1, resource: { buffer: blockerUBO } },
          ]
        });
      } catch (_) { blockerPipeline = null; blockerBG = null; /* PCSS downsample optional; LIT still binds the placeholder */ }
    }

    function _writeShadowModel(slot, model) {
      const src = model && model.length === 16 ? model : (model && model.length > 16 && model.subarray ? model.subarray(0, 16) : IDENT);
      shadowModelRing.set(src, slot * SHADOW_MODEL_F32_STRIDE);
    }
    // One writeBuffer for every slot filled this pass — call before
    // shadowPass.end(). writeBuffer is queue-ordered before submit, so
    // draws recorded earlier still see the data (same rule as _flushDrawUBO).
    function _flushShadowModelUBO() {
      if (!shadowModelUBO || _shadowSlot <= _shadowFlushed) return;
      // Region flush: only this pass's new slots — earlier passes' slots are
      // already uploaded and must not be rewritten (their draws are recorded,
      // and writeBuffer is queue-ordered, so a rewrite would clobber them).
      core.device.queue.writeBuffer(shadowModelUBO,
        _shadowFlushed * SHADOW_MODEL_STRIDE, shadowModelRing,
        _shadowFlushed * SHADOW_MODEL_F32_STRIDE,
        (_shadowSlot - _shadowFlushed) * SHADOW_MODEL_F32_STRIDE);
      _shadowFlushed = _shadowSlot;
      if (_shadowOverflow) Log.warn("gfx", "WGX shadow caster ring overflow: " + _shadowOverflow + " draw(s) skipped");
    }
    // One encoder for all of a frame's shadow passes; a Begin resumes the
    // pending encoder. Spill guard: if the frame submit never ran (a capture
    // path bailed) the ring would keep growing — submit and reset instead.
    // EVERY shadow pass gets its own SUBMIT, not just the ring-overflow one.
    //
    // The sun, car and lamp passes all reach castShadowInstanced through one
    // caller (game.js _castPropBatchesShadow, "shared by the snap-cached sun
    // pass and the per-frame lamp pass"), which culls the props to whichever
    // light is active and packs the survivors into batch.shadowInstBuf. That
    // buffer is per BATCH, not per light. While the three passes shared one
    // deferred encoder, all of their queue.writeBuffer calls landed before the
    // single frame submit, so every pass read whatever the LAST one packed —
    // the sun's shadow map was rasterised from the lamp's culled instance set,
    // and a sun draw of n instances read a buffer holding the lamp's m.
    //
    // Submitting at each Begin puts a submit between one pass's writes and the
    // next pass's, which is the whole ordering guarantee this needs. Giving
    // each light its own buffer would work too and cost memory per batch per
    // light; this costs up to three submits a frame instead of one.
    //
    // The model ring is unaffected: slots keep counting across Begins and are
    // reset only by the frame submit (or the overflow path below), so a
    // submitted pass's slots are never rewritten by a later one.
    function _shadowEncoderBegin() {
      if (_pendingShadowEnc) {
        try { core.device.queue.submit([_pendingShadowEnc.finish()]); } catch (_) { /* core.device error surfaces later */ }
        _pendingShadowEnc = null;
        if (_shadowSlot > SHADOW_SLOTS - 512) { _shadowSlot = 0; _shadowFlushed = 0; _shadowOverflow = 0; }
      }
      shadowEncoder = core.device.createCommandEncoder();
    }
    // The frame submit: shadow encoder (when any pass recorded) rides in front
    // of the main encoder, then the ring resets for the next frame.
    function _frameSubmitList(mainEnc) {
      const sh = _pendingShadowEnc;
      _pendingShadowEnc = null;
      _shadowSlot = 0; _shadowFlushed = 0; _shadowOverflow = 0;
      return sh ? [sh.finish(), mainEnc.finish()] : [mainEnc.finish()];
    }
    function _shadowSetModel(model) {
      if (_shadowSlot >= SHADOW_SLOTS) { _shadowOverflow++; return -1; }
      const slot = _shadowSlot++;
      _writeShadowModel(slot, model);
      _shadowDynOff[0] = slot * SHADOW_MODEL_STRIDE;
      shadowPass.setBindGroup(1, shadowModelBindGroup, _shadowDynOff);
      return slot;
    }
    function shadowBegin(lightVP) {
      if (core.lost || !shadowView) return;
      _shadowLightVP = (lightVP && lightVP.length >= 16) ? lightVP : IDENT;  // raw — CPU chunk cull
      core.mul4(shadowLVPData, Z01, _shadowLightVP);   // Z01-remapped — depth store + LIT lookup
      core.device.queue.writeBuffer(shadowUBO, 0, shadowLVPData);
      _shadowEncoderBegin();
      shadowPass = shadowEncoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: shadowView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      shadowPass.setPipeline(shadowPipeline);
      shadowPass.setBindGroup(0, shadowG0BindGroup);
      if (lightVP) { Frustum.extractPlanes(lightVP, core.fcPlanes); core.fcPlanesIsFrame = false; }   // light frustum for chunk cull
    }
    function castShadow(mesh, model) {
      if (!shadowPass || !mesh || !mesh.vbuf) return;
      if (_shadowSetModel(model) < 0) return;
      core.setVB1(shadowPass, core.identInstanceBuf);
      if (mesh.pieces) {
        for (let i = 0; i < mesh.pieces.length; i++) {
          const p = mesh.pieces[i];
          core.setVB0(shadowPass, p.vbuf);
          core.drawGeom(shadowPass, p);
        }
        return;
      }
      if (mesh.chunks) {   // a chunked mesh cast without cull — draw every chunk
        for (let i = 0; i < mesh.chunks.length; i++) {
          const ch = mesh.chunks[i];
          core.setVB0(shadowPass, ch.vbuf || mesh.vbuf);
          core.drawGeom(shadowPass, ch);
        }
        return;
      }
      core.setVB0(shadowPass, mesh.vbuf);
      core.drawGeom(shadowPass, mesh);
    }
    function castShadowChunked(mesh, model) {
      if (!shadowPass || !mesh || !mesh.vbuf) return;
      if (_shadowSetModel(model) < 0) return;
      core.setVB1(shadowPass, core.identInstanceBuf);
      if (!mesh.chunks) {
        if (mesh.pieces) {
          for (let i = 0; i < mesh.pieces.length; i++) {
            const p = mesh.pieces[i];
            core.setVB0(shadowPass, p.vbuf);
            core.drawGeom(shadowPass, p);
          }
          return;
        }
        core.setVB0(shadowPass, mesh.vbuf);
        core.drawGeom(shadowPass, mesh);
        return;
      }
      const cull = !!_shadowLightVP;   // planes were extracted into core.fcPlanes in shadowBegin
      // Same pooling as drawChunked's _mrRun/_mrFlush below: this ran the
      // identical per-call closure + per-state-change run object, once per
      // shadow-casting mesh per shadow pass per frame.
      const run = _srRun;
      for (let i = 0; i < mesh.chunks.length; i++) {
        const ch = mesh.chunks[i];
        if (cull && !Frustum.aabbInFrustum(core.fcPlanes, ch.min, ch.max)) { _srFlush(); continue; }
        const vbuf = ch.vbuf || mesh.vbuf;
        const ibuf = ch.ibuf || mesh.ibuf || null;
        const attrBG = ch.attrBG || mesh.attrBG;
        // Contiguity as in drawChunked. No vertex_index gate is needed here:
        // the shadow VS declares no @builtin(vertex_index) at all, so which
        // vertices share a draw cannot reach its output.
        const chFirst = ibuf ? core.chunkFirstIndex(ch) : (ch.first | 0);
        const contig = run.active && (ibuf ? run.firstIndex : (run.first | 0)) + run.count === chFirst;
        if (run.active && run.vbuf === vbuf && run.ibuf === ibuf && run.attrBG === attrBG && contig) {
          run.count += ch.count;
        } else {
          _srFlush();
          run.active = true;
          run.vbuf = vbuf; run.ibuf = ibuf; run.attrBG = attrBG;
          run.count = ch.count;
          run.first = ch.first | 0;          // see the note in drawChunked
          run.firstIndex = core.chunkFirstIndex(ch);
          run.indexFormat = ch.indexFormat || mesh.indexFormat;
        }
      }
      _srFlush();
      // Release the GPU-object refs — the bag survives between calls.
      run.vbuf = run.ibuf = run.attrBG = run.indexFormat = null;
    }
    // Pooled merge-run state for castShadowChunked (see _mrRun for the doctrine).
    const _srRun = {
      active: false, vbuf: null, ibuf: null, attrBG: null,
      count: 0, first: 0, firstIndex: 0, indexFormat: null,
    };
    function _srFlush() {
      if (!_srRun.active) return;
      core.setVB0(shadowPass, _srRun.vbuf);
      core.drawGeom(shadowPass, _srRun);
      _srRun.active = false;
    }
    function shadowEnd() {
      if (!shadowPass) return;
      _flushShadowModelUBO();
      shadowPass.end(); shadowPass = null;

      // Run blocker map min-reduction pass (WebGL2 parity uBlockerMap)
      if (blockerPipeline && blockerBG && blockerView) {
        const blockerPass = shadowEncoder.beginRenderPass({
          colorAttachments: [{
            view: blockerView,
            loadOp: "clear",
            clearValue: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
            storeOp: "store"
          }]
        });
        blockerPass.setPipeline(blockerPipeline);
        blockerPass.setBindGroup(0, blockerBG);
        blockerPass.draw(3, 1, 0, 0);
        blockerPass.end();
      }

      _pendingShadowEnc = shadowEncoder;   // rides the frame submit
      shadowEncoder = null;
      _shadowRendered = true;
    }

    // Shares the depth pipeline and the dynamic-offset model ring with the
    // static pass (safe: the ring is REGIONED per pass — slots keep counting
    // across Begins and reset only at the frame submit, so this Begin never
    // rewrites slots an earlier recorded pass still references).
    // PHONES keep blob-only shadows, matching GLX — which gates on IS_MOBILE, the
    // core.device, not MOBILE_TIER: GRAPHICS: HIGH buys quality, not a per-frame extra
    // depth pass on a phone GPU. The map itself is 1×1 there, so this gate is also
    // what keeps the pass from rasterising cars into a 1-pixel target.
    function carShadowBegin(lightVP, boxScale) {
      if (core.lost || !carShadowView || IS_MOBILE || WGX_LITE) return;
      _carArms++;   // lifetime arm count, mirroring GLX SHD.carArms (debug only)
      _carBoxScale = boxScale || 1;
      _shadowLightVP = null;   // castShadowChunked must NOT frustum-cull with stale static planes
      core.mul4(carShadowLVPData, Z01, (lightVP && lightVP.length >= 16) ? lightVP : IDENT);
      core.device.queue.writeBuffer(carShadowUBO, 0, carShadowLVPData);
      _shadowEncoderBegin();
      shadowPass = shadowEncoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: carShadowView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      shadowPass.setPipeline(shadowPipeline);
      shadowPass.setBindGroup(0, carShadowG0BindGroup);
    }
    function carShadowEnd() {
      if (!shadowPass) return;
      _flushShadowModelUBO();
      shadowPass.end(); shadowPass = null;
      _pendingShadowEnc = shadowEncoder;   // rides the frame submit
      shadowEncoder = null;
      _carShadowArmed = true;
    }

    function lampShadowBegin(lightVP, lightIdx) {
      if (core.lost || !lampShadowView || MOBILE_TIER || WGX_LITE) return;
      _lampArms++;
      _lampIdx = lightIdx | 0;
      const raw = (lightVP && lightVP.length >= 16) ? lightVP : IDENT;
      // Point chunk cull at the lamp frustum (GLX S.castCullVP = lampLightVP).
      // Nulling this (to avoid stale sun planes) skipped the cull entirely and
      // rasterised every chunk into the 512² map.
      _shadowLightVP = raw;
      core.mul4(lampShadowLVPData, Z01, raw);
      core.device.queue.writeBuffer(lampShadowUBO, 0, lampShadowLVPData);
      if (lightVP) { Frustum.extractPlanes(raw, core.fcPlanes); core.fcPlanesIsFrame = false; }
      _shadowEncoderBegin();
      shadowPass = shadowEncoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: lampShadowView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      shadowPass.setPipeline(shadowPipeline);
      shadowPass.setBindGroup(0, lampShadowG0BindGroup);
    }
    function lampShadowEnd() {
      if (!shadowPass) return;
      _flushShadowModelUBO();
      shadowPass.end(); shadowPass = null;
      _pendingShadowEnc = shadowEncoder;   // rides the frame submit
      shadowEncoder = null;
      _lampShadowArmed = true;
    }

    function _shadowPackFor(batch) {
      if (!batch._instPacked || !batch.instBuf || batch.instBuf === core.identInstanceBuf) return null;
      if (!batch._shadowPacked) batch._shadowPacked = new Float32Array(batch._instPacked.length);
      if (!batch.shadowInstBuf) {
        batch.shadowInstBuf = core.device.createBuffer({
          size: batch._shadowPacked.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
      return batch._shadowPacked;
    }

    function castShadowInstanced(batch, count) {
      if (!shadowPass || !batch || !batch.vbuf) return;
      const n = count === undefined ? batch.instances : Math.min(count | 0, batch.instances);
      if (n <= 0) return;
      // The shadow pass reads the batch's OWN instance buffer (see
      // _shadowPackFor): a light-culled pack when the caller culled with
      // upload:false, otherwise the full set in source order packed here.
      // instBuf, the camera pack and its cull cache are never touched —
      // writing instBuf here was the frame-order bug this replaces.
      let vb = null;
      if (count !== undefined && batch.shadowInstBuf && batch._shadowN === n) {
        vb = batch.shadowInstBuf;
      } else if (batch.srcMatrices) {
        const dst = _shadowPackFor(batch);
        if (dst) {
          const src = batch.srcMatrices, sc = batch.srcColors;
          for (let i = 0; i < n; i++) {
            const so = i * 16, dOff = i * 20;
            for (let k = 0; k < 16; k++) dst[dOff + k] = src[so + k];
            if (sc) {
              dst[dOff + 16] = sc[i * 3]; dst[dOff + 17] = sc[i * 3 + 1]; dst[dOff + 18] = sc[i * 3 + 2];
            } else {
              dst[dOff + 16] = dst[dOff + 17] = dst[dOff + 18] = 1;
            }
          }
          core.device.queue.writeBuffer(batch.shadowInstBuf, 0, dst, 0, n * 20);
          batch._shadowN = n;
          vb = batch.shadowInstBuf;
        }
      }
      if (_shadowSetModel(_shadowIdent) < 0) return;
      core.setVB0(shadowPass, batch.vbuf);
      core.setVB1(shadowPass, vb || batch.instBuf || core.identInstanceBuf);
      core.drawGeom(shadowPass, batch, n);
    }

    function carShadowKeep() {
      if (!carShadowView || WGX_LITE || _carArms <= 0) return false;
      _carShadowArmed = true;
      return true;
    }
    function lampShadowKeep(lightIdx) {
      if (!lampShadowView || WGX_LITE || _lampArms <= 0 || !(lightIdx >= 0)) return false;
      _lampIdx = lightIdx | 0;
      _lampShadowArmed = true;
      return true;
    }

    setup();

    return {
      SIZE: SHADOW_SIZE,
      get shadowView() { return shadowView; },
      get shadowSampler() { return shadowSampler; },
      get carShadowView() { return carShadowView; },
      get lampShadowView() { return lampShadowView; },
      get blockerView() { return blockerView; },
      get blockerSampler() { return blockerSampler; },
      get shadowLVPData() { return shadowLVPData; },
      get carShadowLVPData() { return carShadowLVPData; },
      get lampShadowLVPData() { return lampShadowLVPData; },
      get shadowModule() { return shadowModule; },
      get shadowPass() { return shadowPass; },
      get SHADOW_SIZE() { return SHADOW_SIZE; },
      get SHADOW_SLOTS() { return SHADOW_SLOTS; },
      get SHADOW_MODEL_STRIDE() { return SHADOW_MODEL_STRIDE; },
      get rendered() { return _shadowRendered; },
      set rendered(v) { _shadowRendered = !!v; },
      get lightVP() { return _shadowLightVP; },
      get carArmed() { return _carShadowArmed; },
      set carArmed(v) { _carShadowArmed = !!v; },
      get carArms() { return _carArms; },
      get carBoxScale() { return _carBoxScale; },
      get lampArmed() { return _lampShadowArmed; },
      set lampArmed(v) { _lampShadowArmed = !!v; },
      get lampArms() { return _lampArms; },
      get lampIdx() { return _lampIdx; },
      set lampIdx(v) { _lampIdx = v; },
      get pendingEnc() { return _pendingShadowEnc; },
      set pendingEnc(v) { _pendingShadowEnc = v; },
      get slot() { return _shadowSlot; },
      set slot(v) { _shadowSlot = v; },
      get flushed() { return _shadowFlushed; },
      set flushed(v) { _shadowFlushed = v; },
      get overflow() { return _shadowOverflow; },
      set overflow(v) { _shadowOverflow = v; },
      frameSubmitList: _frameSubmitList,
      flushPending() {
        if (!_pendingShadowEnc) return;
        try { core.device.queue.submit([_pendingShadowEnc.finish()]); } catch (_) { /* device error surfaces later */ }
        _pendingShadowEnc = null;
        if (_shadowSlot > SHADOW_SLOTS - 512) { _shadowSlot = 0; _shadowFlushed = 0; _shadowOverflow = 0; }
      },
      shadowBegin, castShadow, castShadowChunked, shadowEnd,
      carShadowBegin, carShadowEnd, lampShadowBegin, lampShadowEnd,
      castShadowInstanced, _shadowPackFor, carShadowKeep, lampShadowKeep,
      carShadowState: () => ({ enabled: !!carShadowView && !WGX_LITE, arms: _carArms, armed: _carShadowArmed }),
      lampShadowState: () => ({ enabled: !!lampShadowView && !WGX_LITE, arms: _lampArms, idx: _lampIdx, armed: _lampShadowArmed }),
    };
  }

  return { init };
})();
Object.freeze(WGXShadow);
