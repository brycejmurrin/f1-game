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
    const SHADOW_SIZE = WGX_LITE ? 1024 : 2048;
    const CAR_SHADOW_SIZE = 1024;
    const CAR_SHADOW_ALLOC = WGX_LITE ? 1 : CAR_SHADOW_SIZE;
    const LAMP_SHADOW_SIZE = WGX_LITE ? 1 : 512;
    const SHADOW_SLOTS = core.SHADOW_SLOTS;
    const SHADOW_MODEL_STRIDE = 256;
    const SHADOW_MODEL_F32_STRIDE = SHADOW_MODEL_STRIDE >> 2;
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
      shadowTex = core.device.createTexture({
        size: [SHADOW_SIZE, SHADOW_SIZE], format: DEPTH_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      shadowView = shadowTex.createView();
      shadowSampler = core.device.createSampler({ compare: "less", magFilter: "linear", minFilter: "linear" });

      carShadowTex = core.device.createTexture({
        size: [CAR_SHADOW_ALLOC, CAR_SHADOW_ALLOC], format: DEPTH_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      carShadowView = carShadowTex.createView();
      try {
        blockerTex = core.device.createTexture({
          size: [512, 512], format: "r32float",
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
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
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
          fragment: { module: blockerModule, entryPoint: "fs_main", targets: [{ format: "r32float" }] },
          primitive: { topology: "triangle-list" },
        });
        blockerBG = core.device.createBindGroup({
          layout: blockerG0Layout,
          entries: [
            { binding: 0, resource: shadowView },
            { binding: 1, resource: { buffer: blockerUBO } },
          ]
        });
      } catch (_) { blockerPipeline = null; blockerBG = null;  }
    }

    function _shadowModelSrc(model) {
      return model && model.length === 16 ? model : (model && model.length > 16 && model.subarray ? model.subarray(0, 16) : IDENT);
    }
    function _writeShadowModel(slot, model) {
      shadowModelRing.set(_shadowModelSrc(model), slot * SHADOW_MODEL_F32_STRIDE);
    }
    function _flushShadowModelUBO() {
      if (!shadowModelUBO || _shadowSlot <= _shadowFlushed) return;
      core.device.queue.writeBuffer(shadowModelUBO,
        _shadowFlushed * SHADOW_MODEL_STRIDE, shadowModelRing,
        _shadowFlushed * SHADOW_MODEL_F32_STRIDE,
        (_shadowSlot - _shadowFlushed) * SHADOW_MODEL_F32_STRIDE);
      _shadowFlushed = _shadowSlot;
      if (_shadowOverflow) Log.warn("gfx", "WGX shadow caster ring overflow: " + _shadowOverflow + " draw(s) skipped");
    }
    let _smPass = null, _smSlot = -1;
    function _shadowEncoderBegin() {
      if (_pendingShadowEnc) {
        try { core.device.queue.submit([_pendingShadowEnc.finish()]); } catch (_) {  }
        _pendingShadowEnc = null;
        if (_shadowSlot > SHADOW_SLOTS - 512) { _shadowSlot = 0; _shadowFlushed = 0; _shadowOverflow = 0; }
      }
      shadowEncoder = core.device.createCommandEncoder();
      _smPass = null;
    }
    function _frameSubmitList(mainEnc) {
      const sh = _pendingShadowEnc;
      _pendingShadowEnc = null;
      _shadowSlot = 0; _shadowFlushed = 0; _shadowOverflow = 0;
      return sh ? [sh.finish(), mainEnc.finish()] : [mainEnc.finish()];
    }
    function _shadowSetModel(model) {
      const src = _shadowModelSrc(model);
      if (_smPass === shadowPass && _smSlot >= 0) {
        const o = _smSlot * SHADOW_MODEL_F32_STRIDE;
        let same = true;
        for (let i = 0; i < 16; i++) if (shadowModelRing[o + i] !== src[i]) { same = false; break; }
        if (same) return _smSlot;
      }
      if (_shadowSlot >= SHADOW_SLOTS) { _shadowOverflow++; return -1; }
      const slot = _shadowSlot++;
      shadowModelRing.set(src, slot * SHADOW_MODEL_F32_STRIDE);
      _shadowDynOff[0] = slot * SHADOW_MODEL_STRIDE;
      shadowPass.setBindGroup(1, shadowModelBindGroup, _shadowDynOff);
      _smPass = shadowPass; _smSlot = slot;
      return slot;
    }
    function shadowBegin(lightVP) {
      if (core.lost || !shadowView) return;
      _shadowLightVP = (lightVP && lightVP.length >= 16) ? lightVP : IDENT;
      core.mul4(shadowLVPData, Z01, _shadowLightVP);
      core.device.queue.writeBuffer(shadowUBO, 0, shadowLVPData);
      _shadowEncoderBegin();
      shadowPass = shadowEncoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: shadowView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      shadowPass.setPipeline(shadowPipeline);
      shadowPass.setBindGroup(0, shadowG0BindGroup);
      if (lightVP) { Frustum.extractPlanes(lightVP, core.fcPlanes); core.fcPlanesIsFrame = false; }
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
      if (mesh.chunks) {
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
    function castShadowChunked(mesh, model, reach) {
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
      const cull = !!_shadowLightVP;
      const rr = reach && reach[3] > 0 ? reach[3] * reach[3] : -1;
      const run = _srRun;
      for (let i = 0; i < mesh.chunks.length; i++) {
        const ch = mesh.chunks[i];
        if ((cull && !Frustum.aabbInFrustum(core.fcPlanes, ch.min, ch.max))
            || (rr >= 0 && Frustum.aabbDist2(ch.min, ch.max, reach[0], reach[1], reach[2]) > rr)) { _srFlush(); continue; }
        const vbuf = ch.vbuf || mesh.vbuf;
        const ibuf = ch.ibuf || mesh.ibuf || null;
        const attrBG = ch.attrBG || mesh.attrBG;
        const chFirst = ibuf ? core.chunkFirstIndex(ch) : (ch.first | 0);
        const contig = run.active && (ibuf ? run.firstIndex : (run.first | 0)) + run.count === chFirst;
        if (run.active && run.vbuf === vbuf && run.ibuf === ibuf && run.attrBG === attrBG && contig) {
          run.count += ch.count;
        } else {
          _srFlush();
          run.active = true;
          run.vbuf = vbuf; run.ibuf = ibuf; run.attrBG = attrBG;
          run.count = ch.count;
          run.first = ch.first | 0;
          run.firstIndex = core.chunkFirstIndex(ch);
          run.indexFormat = ch.indexFormat || mesh.indexFormat;
        }
      }
      _srFlush();
      run.vbuf = run.ibuf = run.attrBG = run.indexFormat = null;
    }
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

      _pendingShadowEnc = shadowEncoder;
      shadowEncoder = null;
      _shadowRendered = true;
    }

    function carShadowBegin(lightVP, boxScale) {
      if (core.lost || !carShadowView || IS_MOBILE || WGX_LITE) return;
      _carArms++;
      _carBoxScale = boxScale || 1;
      _shadowLightVP = null;
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
      _pendingShadowEnc = shadowEncoder;
      shadowEncoder = null;
      _carShadowArmed = true;
    }

    function lampShadowBegin(lightVP, lightIdx) {
      if (core.lost || !lampShadowView || MOBILE_TIER || WGX_LITE) return;
      _lampArms++;
      _lampIdx = lightIdx | 0;
      const raw = (lightVP && lightVP.length >= 16) ? lightVP : IDENT;
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
      _pendingShadowEnc = shadowEncoder;
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
          batch._shKeyN = -1;
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
        try { core.device.queue.submit([_pendingShadowEnc.finish()]); } catch (_) {  }
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
