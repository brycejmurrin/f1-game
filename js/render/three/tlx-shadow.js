"use strict";

(function () {
  const _uboCap = new WeakMap();
  let _padOff = null;
  function uboInstCap(renderer, n) {
    if (_padOff === null) {
      try { _padOff = localStorage.getItem("apex26.tlxInstPad") === "0"; } catch (_) { _padOff = false; }
    }
    if (_padOff) return n | 0;
    let cap = _uboCap.get(renderer);
    if (!cap) {
      let lim = 65536;
      try {
        const caps = renderer.backend && renderer.backend.capabilities;
        const l = caps && caps.getUniformBufferLimit ? caps.getUniformBufferLimit() : 0;
        if (l > 0) lim = l;
      } catch (_) {  }
      cap = Math.floor(lim / 64) + 1;
      _uboCap.set(renderer, cap);
    }
    return Math.max(n | 0, cap);
  }

  function sunMapSize(ctx) {
    if (ctx.sunSize > 0) return ctx.sunSize | 0;
    return ctx.isMobile ? 1024 : (ctx.softwareGL ? 512 : 2048);
  }

  function shadowSys(THREE, TSL, ctx) {
    const renderer = ctx.renderer;
    const isMobile = !!ctx.isMobile || !!ctx.mobileTier;
    const softwareGL = !!ctx.softwareGL;

    const SUN_SIZE = sunMapSize(ctx);
    const CAR_SIZE = softwareGL ? 256 : 1024;
    const LAMP_SIZE = softwareGL ? 256 : 512;

    const S = {
      SIZE: SUN_SIZE,
      enabled: false,
      lightVP: new Float32Array(16),
      pcssEnabled: false,
      colorDiscards: 0,
      depthPassOn: false,
      castCullVP: null,
      carEnabled: false, carLightVP: new Float32Array(16),
      carBoxScale: 1,
      carArmed: false,
      carArms: 0,
      lampEnabled: false, lampLightVP: new Float32Array(16),
      lampArmed: false,
      lampIdx: -1,
      lampArms: 0,
      lampStaticBuilds: 0,
      lampCarOnly: 0,
    };

    function makeDepthTarget(size, name, hdrColor, floatDepth) {
      const depthTexture = new THREE.DepthTexture(size, size);
      if (floatDepth) depthTexture.type = THREE.FloatType;
      depthTexture.name = name;
      depthTexture.compareFunction = THREE.LessEqualCompare;
      depthTexture.minFilter = THREE.LinearFilter;
      depthTexture.magFilter = THREE.LinearFilter;
      if (!hdrColor && +(THREE.REVISION || 0) >= 187) {
        return new THREE.RenderTarget(size, size, { depthTexture, count: 0 });
      }
      const opts = { depthTexture };
      if (hdrColor) {
        opts.type = THREE.FloatType;
        opts.format = THREE.RedFormat;
      } else {
        opts.type = THREE.UnsignedByteType;
        opts.format = THREE.RedFormat;
      }
      const rt = new THREE.RenderTarget(size, size, opts);
      rt.texture.name = name + ".color";
      rt.texture.generateMipmaps = false;
      if (renderer.backend && renderer.backend.isWebGPUBackend && _colorDiscardOn()) rt.apexDiscardColor = 1;
      return rt;
    }
    function _colorDiscardOn() {
      try { return localStorage.getItem("apex26.tlxTagDiscard") !== "0"; } catch (_) { return true; }
    }

    const isWebGPU = !!(renderer.backend && renderer.backend.isWebGPUBackend);
    const colorPcss = !isWebGPU && !isMobile && !softwareGL && !!TSL.depth;
    const sunRT = makeDepthTarget(SUN_SIZE, "TLXSunShadow", colorPcss);
    const carRT = isMobile ? null : makeDepthTarget(CAR_SIZE, "TLXCarShadow");
    function seedUnpackCache() {
      try {
        const be = renderer.backend, st = be && be.state, gl = be && be.gl;
        if (!gl || !st || typeof st.pixelStorei !== "function" || !st.parameters) return false;
        const keys = [gl.UNPACK_ROW_LENGTH, gl.UNPACK_IMAGE_HEIGHT, gl.UNPACK_SKIP_PIXELS, gl.UNPACK_SKIP_ROWS, gl.UNPACK_SKIP_IMAGES];
        for (let i = 0; i < keys.length; i++) st.pixelStorei(keys[i], 0);
        return keys.every((k) => st.parameters[k] === 0);
      } catch (_) { return false; }
    }
    let lampStaticOn = true, lampStaticForced = false;
    try {
      const v = localStorage.getItem("apex26.tlxLampStatic");
      if (v === "0" || v === "1") { lampStaticOn = v === "1"; lampStaticForced = true; }
    } catch (_) {  }
    if (isMobile || typeof renderer.copyTextureToTexture !== "function") lampStaticOn = false;
    if (lampStaticOn && !isWebGPU && !seedUnpackCache() && !lampStaticForced) lampStaticOn = false;
    const lampRT = isMobile ? null : makeDepthTarget(LAMP_SIZE, "TLXLampShadow", false, lampStaticOn);
    const lampStaticRT = lampStaticOn ? makeDepthTarget(LAMP_SIZE, "TLXLampStatic", false, true) : null;
    const _lampStaticVP = new Float32Array(16);
    let _lampStaticValid = false, _lampRendered = false;
    S.enabled = !!sunRT;
    S.carEnabled = !!carRT;
    S.lampEnabled = !!lampRT;
    S.depthOnly = !!(sunRT && +(THREE.REVISION || 0) >= 187 && !colorPcss);
    S.sunColorBytes = !sunRT ? 0 : S.depthOnly ? 0 : SUN_SIZE * SUN_SIZE * (colorPcss ? 4 : 1);

    const BLOCKER_SIZE = 512;
    let blockerRT = null, blockerQuad = null;
    if (sunRT && !isMobile && (isWebGPU || colorPcss)) {
      try {
        blockerRT = new THREE.RenderTarget(BLOCKER_SIZE, BLOCKER_SIZE, {
          format: THREE.RedFormat, type: THREE.FloatType,
          depthBuffer: false, generateMipmaps: false,
          minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
        });
        blockerRT.texture.name = "TLXSunBlocker";
        const bmat = new THREE.MeshBasicNodeMaterial();
        bmat.fog = false;
        bmat.lights = false;
        bmat.customProgramCacheKey = () => colorPcss ? "tlx-blocker-gl" : "tlx-blocker";
        const k = Math.max(1, (SUN_SIZE / BLOCKER_SIZE) | 0);
        const srcTex = colorPcss ? sunRT.texture : sunRT.depthTexture;
        bmat.colorNode = TSL.Fn(() => {
          const ip = TSL.ivec2(TSL.screenCoordinate.xy).mul(TSL.int(k)).toVar();
          const tap = (x, y) => {
            const raw = TSL.textureLoad(srcTex, ip.add(TSL.ivec2(x, y)), TSL.int(0));
            return colorPcss ? raw.x : raw;
          };
          let d = tap(0, 0);
          for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) if (x || y) d = TSL.min(d, tap(x, y));
          return TSL.vec4(d, 0.0, 0.0, 1.0);
        })();
        blockerQuad = new THREE.QuadMesh(bmat);
        S.pcssEnabled = true;
      } catch (e) {
        try { Log.warn("gfx", "TLX: PCSS blocker setup failed —", e); } catch (_) {  }
        blockerRT = null; blockerQuad = null;
        S.pcssEnabled = false;
      }
    }

    const shadowCam = new THREE.PerspectiveCamera();
    shadowCam.matrixAutoUpdate = false;
    shadowCam.matrixWorldAutoUpdate = false;
    shadowCam.coordinateSystem = renderer.coordinateSystem;
    shadowCam.matrixWorld.identity();
    shadowCam.matrixWorldInverse.identity();

    const depthMat = new THREE.MeshBasicNodeMaterial();
    depthMat.colorNode = colorPcss ? TSL.vec4(TSL.depth, 0.0, 0.0, 1.0) : TSL.vec3(0.0);
    depthMat.colorWrite = !isWebGPU;
    depthMat.side = THREE.DoubleSide;
    depthMat.fog = false;
    depthMat.lights = false;
    depthMat.customProgramCacheKey = () => "tlx-depth";

    let casterAttr = true;
    try { casterAttr = localStorage.getItem("apex26.tlxCasterAttr") !== "0"; } catch (_) {  }
    const _aiInstance = TSL.Fn((_, builder) => {
      const iM = TSL.mat4(TSL.attribute("iM0", "vec4"), TSL.attribute("iM1", "vec4"),
        TSL.attribute("iM2", "vec4"), TSL.attribute("iM3", "vec4"));
      TSL.positionLocal.assign(iM.mul(TSL.positionLocal).xyz);
      if (builder.hasGeometryAttribute("normal")) TSL.normalLocal.assign(TSL.transformNormal(TSL.normalLocal, iM));
    }, "void");
    let depthMatAI = null;
    function attrDepthMat() {
      if (depthMatAI) return depthMatAI;
      const m = new THREE.MeshBasicNodeMaterial();
      m.colorNode = depthMat.colorNode;
      m.colorWrite = depthMat.colorWrite;
      m.side = depthMat.side;
      m.fog = false;
      m.lights = false;
      m.customProgramCacheKey = () => "ai-tlx-depth";
      const setup = m.setupPosition;
      m.setupPosition = function (builder) { _aiInstance(); return setup.call(this, builder); };
      return (depthMatAI = m);
    }
    function attrCaster(geo, n) {
      const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(Math.max(1, n) * 16), 16, 1);
      ib.setUsage(THREE.StreamDrawUsage);
      for (let c = 0; c < 4; c++) geo.setAttribute("iM" + c, new THREE.InterleavedBufferAttribute(ib, 4, c * 4));
      const m = new THREE.Mesh(geo, attrDepthMat());
      m.instanceMatrix = ib; m.count = n;
      return m;
    }
    function disposeCaster(m) {
      try { if (m.isInstancedMesh) m.dispose(); else m.dispatchEvent({ type: "dispose" }); } catch (_) {  }
    }

    const castScene = new THREE.Scene();
    castScene.matrixWorldAutoUpdate = false;
    const pools = new Map();
    let cur = null, shown = null;
    let pool = [], used = 0;
    let target = null;
    let _passKeepsDepth = false;
    let _passOpen = null;
    let _lastPassOk = false;
    const parkedGeo = new THREE.BufferGeometry();
    let _passRoot = true;
    try { _passRoot = localStorage.getItem("apex26.tlxPoolRoot") !== "0"; } catch (_) {  }
    const _passKids = [];

    function cast(mesh , model ) {
      if (!S.depthPassOn || !mesh || !mesh.geo) return;
      let m = pool[used];
      if (!m) {
        m = new THREE.Mesh(mesh.geo, depthMat);
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        pool[used] = m;
        castScene.add(m);
      }
      m.geometry = mesh.geo;
      m.__lastGeo = mesh.geo;
      if (model) m.matrix.fromArray(model); else m.matrix.identity();
      m.matrixWorld.copy(m.matrix);
      m.visible = true;
      used++;
    }

    const iByBatch = new Map();
    function casterGeo(src) {
      const g = new THREE.BufferGeometry();
      if (src.index) g.setIndex(src.index);
      for (const k in src.attributes) if (k !== "instanceTint" && !/^iM[0-3]$/.test(k)) g.setAttribute(k, src.attributes[k]);
      g.drawRange.start = src.drawRange.start; g.drawRange.count = src.drawRange.count;
      for (let i = 0; i < src.groups.length; i++) g.addGroup(src.groups[i].start, src.groups[i].count, src.groups[i].materialIndex);
      g.userData.casterOf = src;
      return g;
    }
    function freeCasterGeo(m) {
      try { m.geometry.dispose(); } catch (_) {  }
    }
    const iCast = [];
    const sharedInstCap = (n) => (!casterAttr && isMobile) ? (n | 0) : uboInstCap(renderer, n);
    const _castMat = new THREE.Matrix4();
    function castInstanced(batch, count) {
      if (!S.depthPassOn || !batch || !batch.geo) return;
      const culled = count !== undefined;
      const n = culled ? Math.min(count | 0, batch.instances | 0) : (batch.instances | 0);
      if (!(n > 0)) return;
      let m = iByBatch.get(batch);
      if (!m || m.geometry.userData.casterOf !== batch.geo || (!m.isInstancedMesh && m.instanceMatrix.count < (batch.instances | 0))) {
        if (m) { const ix = iCast.indexOf(m); if (ix >= 0) iCast.splice(ix, 1); castScene.remove(m); disposeCaster(m); freeCasterGeo(m); }
        if (casterAttr) {
          m = attrCaster(casterGeo(batch.geo), Math.max(1, batch.instances | 0));
        } else {
          m = new THREE.InstancedMesh(casterGeo(batch.geo), depthMat, sharedInstCap(batch.instances | 0));
          m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        }
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        iByBatch.set(batch, m);
        castScene.add(m);
      }
      const dst = m.instanceMatrix.array;
      batch._shCasterArr = dst;
      const src = culled && batch.packMatrices ? batch.packMatrices : batch.srcMatrices;
      if (src === dst) {  } else if (src && src.length >= n * 16) {
        for (let i = 0, o = 0; i < n; i++, o += 16) {
          for (let k = 0; k < 16; k++) dst[o + k] = src[o + k];
        }
      } else if (batch.imesh && batch.imesh.instanceMatrix) {
        const isrc = batch.imesh.instanceMatrix.array;
        const copyN = (batch.visible === undefined || batch.visible >= n) ? n
          : (batch.visible | 0);
        for (let i = 0, o = 0; i < copyN; i++, o += 16) {
          for (let k = 0; k < 16; k++) dst[o + k] = isrc[o + k];
        }
      } else if (batch.packMatrices) {
        const psrc = batch.packMatrices;
        for (let i = 0; i < n; i++) {
          _castMat.fromArray(psrc, i * 16);
          if (m.isInstancedMesh) m.setMatrixAt(i, _castMat); else _castMat.toArray(dst, i * 16);
        }
      }
      const im = m.instanceMatrix;
      const rg = im.__tlxRange || (im.__tlxRange = { start: 0, count: 0 });
      rg.count = n * 16;
      im.updateRanges.length = 0; im.updateRanges.push(rg);
      im.needsUpdate = true;
      m.count = n;
      m.matrix.identity();
      m.matrixWorld.identity();
      m.visible = true;
      iCast.push(m);
    }

    const dropQ = [];
    function releaseGeometry(geo) {
      if (!geo) return;
      if (ctx.isWarming && ctx.isWarming()) {
        if (dropQ.some((e) => e.geo === geo)) return;
        const meshes = [];
        for (const pl of pools.values()) {
          for (let i = 0; i < pl.pool.length; i++) {
            const m = pl.pool[i];
            if (m.geometry === geo || (m.geometry === parkedGeo && m.__lastGeo === geo)) meshes.push(m);
          }
        }
        dropQ.push({ geo, meshes });
        return;
      }
      for (const pl of pools.values()) {
        for (let i = 0; i < pl.pool.length; i++) {
          const m = pl.pool[i];
          if (m.geometry !== geo && !(m.geometry === parkedGeo && m.__lastGeo === geo)) continue;
          m.visible = false; m.geometry = parkedGeo; m.__lastGeo = null;
          try { m.dispatchEvent({ type: "dispose" }); } catch (_) {  }
        }
      }
    }
    function flushDropped() {
      if (!dropQ.length || (ctx.isWarming && ctx.isWarming())) return;
      const q = dropQ.splice(0);
      for (let i = 0; i < q.length; i++) {
        const e = q[i], meshes = e.meshes;
        if (meshes) for (let k = 0; k < meshes.length; k++) {
          const m = meshes[k];
          if (!m) continue;
          const live = m.geometry !== e.geo && m.geometry !== parkedGeo;
          if (!live) { m.visible = false; m.geometry = parkedGeo; m.__lastGeo = null; }
          try { m.dispatchEvent({ type: "dispose" }); } catch (_) {  }
        }
        releaseGeometry(e.geo);
      }
    }
    function parkCasterForGeo(m, geo) {
      if (!m || !geo) return;
      const live = m.geometry !== geo && m.geometry !== parkedGeo && m.__lastGeo !== geo;
      if (live) {
        try { m.dispatchEvent({ type: "dispose" }); } catch (_) {  }
        return;
      }
      m.visible = false; m.geometry = parkedGeo; m.__lastGeo = null;
      try { m.dispatchEvent({ type: "dispose" }); } catch (_) {  }
    }
    function purgeCastersForGeos(freedGeos) {
      if (!freedGeos || !freedGeos.size) return;
      for (const pl of pools.values()) {
        for (let j = 0; j < pl.pool.length; j++) {
          const m = pl.pool[j];
          if (!m) continue;
          const g = m.geometry, lg = m.__lastGeo;
          if (freedGeos.has(g)) parkCasterForGeo(m, g);
          else if (lg && freedGeos.has(lg)) parkCasterForGeo(m, lg);
        }
      }
      for (let i = 0; i < iCast.length; i++) {
        const m = iCast[i];
        if (!m) continue;
        const g = m.geometry, lg = m.__lastGeo;
        if (freedGeos.has(g)) parkCasterForGeo(m, g);
        else if (lg && freedGeos.has(lg)) parkCasterForGeo(m, lg);
      }
      for (let i = 0; i < castScene.children.length; i++) {
        const m = castScene.children[i];
        if (!m || !m.isMesh) continue;
        const g = m.geometry, lg = m.__lastGeo;
        if (g && freedGeos.has(g)) parkCasterForGeo(m, g);
        else if (lg && freedGeos.has(lg)) parkCasterForGeo(m, lg);
      }
      if (_probePrev) {
        for (const m of _probePrev.meshes) {
          if (!m || !m.isMesh) continue;
          const g = m.geometry;
          if (g && freedGeos.has(g)) disposeCaster(m);
        }
      }
    }
    function flushOwnershipDropped(freedGeos) {
      if (!dropQ.length || !freedGeos || !freedGeos.size) return;
      for (let qi = dropQ.length - 1; qi >= 0; qi--) {
        const e = dropQ[qi];
        if (!freedGeos.has(e.geo)) continue;
        dropQ.splice(qi, 1);
        const meshes = e.meshes;
        if (meshes) for (let k = 0; k < meshes.length; k++) {
          const m = meshes[k];
          if (!m) continue;
          const live = m.geometry !== e.geo && m.geometry !== parkedGeo;
          if (!live) { m.visible = false; m.geometry = parkedGeo; m.__lastGeo = null; }
          try { m.dispatchEvent({ type: "dispose" }); } catch (_) {  }
        }
        for (const pl of pools.values()) {
          for (let j = 0; j < pl.pool.length; j++) {
            const m = pl.pool[j];
            if (m.geometry !== e.geo && !(m.geometry === parkedGeo && m.__lastGeo === e.geo)) continue;
            m.visible = false; m.geometry = parkedGeo; m.__lastGeo = null;
            try { m.dispatchEvent({ type: "dispose" }); } catch (_) {  }
          }
        }
      }
    }

    function freeInstanced(batch) {
      if (batch) batch._shCasterArr = null;
      const m = batch && iByBatch.get(batch);
      if (!m) return;
      iByBatch.delete(batch);
      const ix = iCast.indexOf(m);
      if (ix >= 0) iCast.splice(ix, 1);
      castScene.remove(m);
      disposeCaster(m);
      freeCasterGeo(m);
    }

    const _lvpZ01 = new Float32Array(16);
    function beginPass(rt, lightVP, dst) {
      dst.set(lightVP);
      if (isWebGPU) {
        _lvpZ01.set(lightVP);
        for (let c = 0; c < 4; c++) _lvpZ01[c * 4 + 2] = 0.5 * lightVP[c * 4 + 2] + 0.5 * lightVP[c * 4 + 3];
      }
      shadowCam.projectionMatrix.fromArray(isWebGPU ? _lvpZ01 : lightVP);
      shadowCam.projectionMatrixInverse.copy(shadowCam.projectionMatrix).invert();
      target = rt;
      cur = pools.get(rt);
      if (!cur) { cur = { pool: [], used: 0, prevUsed: 0 }; pools.set(rt, cur); }
      if (shown && shown !== cur) {
        for (let i = 0; i < shown.prevUsed; i++) { shown.pool[i].visible = false; shown.pool[i].geometry = parkedGeo; }
      }
      if (_passOpen) {
        const op = _passOpen.pool;
        for (let i = 0; i < op.length; i++) { op[i].visible = false; op[i].geometry = parkedGeo; }
        _passOpen.prevUsed = 0;
      }
      _passOpen = cur;
      _passKeepsDepth = false;
      pool = cur.pool; used = 0;
      for (let i = 0; i < iCast.length; i++) iCast[i].visible = false;
      iCast.length = 0;
      S.depthPassOn = true;
    }

    let _invColor0 = null;
    function discardColor(rt) {
      const be = renderer.backend, gl = be && be.gl, st = be && be.state;
      if (rt.textures && rt.textures.length === 0) return false;
      if (!gl || typeof gl.invalidateFramebuffer !== "function" || !st || !st.currentBoundFramebuffers) return false;
      const d = be.get(rt), fb = st.currentBoundFramebuffers[gl.DRAW_FRAMEBUFFER];
      if (!fb || !d || !d.framebuffers || Object.values(d.framebuffers).indexOf(fb) < 0) return false;
      gl.invalidateFramebuffer(gl.DRAW_FRAMEBUFFER, _invColor0 || (_invColor0 = [gl.COLOR_ATTACHMENT0]));
      return true;
    }
    function endPass(rt) {
      S.depthPassOn = false;
      if (!target || _passOpen !== cur || (rt !== undefined && rt !== target)) return;
      const wasSun = target === sunRT;
      for (let i = used; i < cur.prevUsed; i++) { pool[i].visible = false; pool[i].geometry = parkedGeo; }
      cur.prevUsed = used; cur.used = used; shown = cur;
      const prev = renderer.getRenderTarget();
      const keepDepth = _passKeepsDepth, autoClear0 = renderer.autoClear;
      _passKeepsDepth = false; _passOpen = null; _lastPassOk = false;
      try {
        renderer.setRenderTarget(target);
        if (keepDepth) renderer.autoClear = false;
        const all = castScene.children;
        if (_passRoot) {
          _passKids.length = 0;
          for (let i = 0; i < used; i++) _passKids.push(pool[i]);
          for (let i = 0; i < iCast.length; i++) _passKids.push(iCast[i]);
          castScene.children = _passKids;
        }
        try { renderer.render(castScene, shadowCam); } finally { castScene.children = all; }
        if (!(wasSun && colorPcss) && discardColor(target)) S.colorDiscards++;
        if (target === lampRT) _lampRendered = true;
        _lastPassOk = true;
      } catch (e) {
        try { Log.warn("gfx", "TLX: shadow pass failed —", e); } catch (_) {  }
        if (target === carRT) S.carEnabled = false;
        else if (target === lampRT || target === lampStaticRT) S.lampEnabled = false;
        else S.enabled = false;
        S.depthPassOn = false;
      } finally { renderer.autoClear = autoClear0; }
      if (wasSun && S.enabled && S.pcssEnabled && blockerQuad) {
        try {
          renderer.setRenderTarget(blockerRT);
          blockerQuad.render(renderer);
        } catch (e) {
          try { Log.warn("gfx", "TLX: PCSS blocker pass failed —", e); } catch (_) {  }
          S.pcssEnabled = false;
        }
      }
      try { renderer.setRenderTarget(prev); } catch (_) {  }
      target = null;
    }

    (function prime() {
      shadowCam.projectionMatrix.identity();
      shadowCam.projectionMatrixInverse.identity();
      const prev = renderer.getRenderTarget();
      const rts = [sunRT, carRT, lampRT];
      for (let i = 0; i < rts.length; i++) {
        if (!rts[i]) continue;
        renderer.setRenderTarget(rts[i]);
        renderer.render(castScene, shadowCam);
      }
      renderer.setRenderTarget(prev);
    })();

    function shadowBegin(lightVP) {
      if (!S.enabled) return;
      S.castCullVP = null;
      beginPass(sunRT, lightVP, S.lightVP);
    }

    function carShadowBegin(lightVP, boxScale) {
      if (!S.carEnabled) return;
      beginPass(carRT, lightVP, S.carLightVP);
      S.castCullVP = S.carLightVP;
      S.carBoxScale = boxScale || 1;
      S.carArmed = true;
      S.carArms++;
    }

    function lampShadowBegin(lightVP, lightIdx) {
      if (!S.lampEnabled) return;
      S.lampIdx = lightIdx | 0;
      beginPass(lampRT, lightVP, S.lampLightVP);
      S.castCullVP = S.lampLightVP;
      S.lampArmed = true;
      S.lampArms++;
    }

    function lampShadowEnd() {
      S.castCullVP = null;
      endPass(lampRT);
    }

    function lampStaticBegin(lightVP) {
      if (!lampStaticRT || !lampStaticOn) return false;
      _lampStaticValid = false;
      beginPass(lampStaticRT, lightVP, _lampStaticVP);
      S.castCullVP = _lampStaticVP;
      return true;
    }
    function lampStaticEnd() {
      S.castCullVP = null;
      endPass(lampStaticRT);
      _lampStaticValid = _lastPassOk;
      if (_lampStaticValid) S.lampStaticBuilds++;
    }
    function lampCarsBegin(lightVP, lightIdx) {
      if (!S.lampEnabled || !lampStaticRT || !lampStaticOn || !_lampStaticValid || !_lampRendered) return false;
      for (let i = 0; i < 16; i++) if (Math.fround(lightVP[i]) !== _lampStaticVP[i]) return false;
      try {
        renderer.copyTextureToTexture(lampStaticRT.depthTexture, lampRT.depthTexture);
      } catch (e) {
        try { Log.warn("gfx", "TLX: lamp static depth copy failed — full lamp passes from now on", e); } catch (_) {  }
        _lampStaticValid = false; lampStaticOn = false;
        return false;
      }
      lampShadowBegin(lightVP, lightIdx);
      _passKeepsDepth = true;
      S.lampCarOnly++;
      return true;
    }

    function carShadowEnd() {
      S.castCullVP = null;
      endPass(carRT);
    }

    function clearArmed() {
      S.carArmed = false;
      S.lampArmed = false;
    }

    try { Log.info("gfx", "TLX shadow init"); } catch (_) {  }
    function carShadowKeep() {
      if (!S.carEnabled || S.carArms <= 0) return false;
      S.carArmed = true;
      return true;
    }
    function lampShadowKeep(lightIdx) {
      if (!S.lampEnabled || S.lampArms <= 0 || !(lightIdx >= 0)) return false;
      S.lampIdx = lightIdx | 0;
      S.lampArmed = true;
      return true;
    }

    function showAllCasters() {
      const shown = [];
      for (const pl of pools.values()) {
        for (const m of pl.pool) if (m.geometry !== parkedGeo && !m.visible) { m.visible = true; shown.push([m, -1]); }
      }
      for (const m of iByBatch.values()) {
        if (!m.visible || !(m.count > 0)) { shown.push([m, m.count]); m.visible = true; if (!(m.count > 0)) m.count = 1; }
      }
      return shown;
    }
    function hideCasters(shown) { for (const [m, count] of shown) { m.visible = false; if (count >= 0) m.count = count; } }

    let _probePrev = null;
    function layoutSig(geo) {
      const a = geo.attributes, out = [];
      for (const k of Object.keys(a).sort()) {
        const v = a[k];
        if (!v) continue;
        const arr = v.isInterleavedBufferAttribute ? v.data.array : v.array;
        out.push(k + ":" + v.itemSize + ":" + (arr && arr.constructor.name) + ":" + !!v.normalized
          + (v.isInterleavedBufferAttribute ? ":i" + v.data.stride + "@" + v.offset : ""));
      }
      if (geo.index) out.push("index:" + geo.index.array.constructor.name);
      return out.join(",");
    }
    function probeGeometry(src) {
      const g = new THREE.BufferGeometry(), ibs = new Map();
      for (const k of Object.keys(src.attributes)) {
        const v = src.attributes[k];
        if (!v) continue;
        if (v.isInterleavedBufferAttribute) {
          let ib = ibs.get(v.data);
          if (!ib) { ib = new THREE.InterleavedBuffer(new v.data.array.constructor(v.data.stride * 3), v.data.stride); ibs.set(v.data, ib); }
          g.setAttribute(k, new THREE.InterleavedBufferAttribute(ib, v.itemSize, v.offset, v.normalized));
        } else {
          g.setAttribute(k, new THREE.BufferAttribute(new v.array.constructor(v.itemSize * 3), v.itemSize, v.normalized));
        }
      }
      if (src.index) g.setIndex(new THREE.BufferAttribute(new src.index.array.constructor([0, 1, 2]), 1));
      return g;
    }
    function probeCasters(sources) {
      const meshes = [], geos = [], seen = new Set();
      if (!sources) return { meshes, geos };
      for (const src of sources) {
        if (!src || !src.attributes || !src.attributes.position || src.attributes.iM0) continue;
        const sig = layoutSig(src);
        if (seen.has(sig)) continue;
        seen.add(sig);
        const g = probeGeometry(src);
        geos.push(g);
        for (const sx of [1, -1]) {
          const m = new THREE.Mesh(g, depthMat);
          m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.frustumCulled = false;
          m.matrix.makeScale(sx, 1, 1); m.matrixWorld.copy(m.matrix);
          meshes.push(m);
        }
      }
      return { meshes, geos };
    }

    return {
      S,
      async warm(sources) {
        const prev = renderer.getRenderTarget();
        const shown = showAllCasters();
        const probes = probeCasters(sources);
        for (const m of probes.meshes) { m.visible = true; castScene.add(m); }
        let compiled = false;
        try {
          if (sunRT) { renderer.setRenderTarget(sunRT); await renderer.compileAsync(castScene, shadowCam); }
          for (const rt of [lampRT, lampStaticRT, carRT]) {
            if (!rt || rt === sunRT) continue;
            renderer.setRenderTarget(rt); await renderer.compileAsync(castScene, shadowCam);
          }
          if (blockerQuad && blockerRT) { renderer.setRenderTarget(blockerRT); await renderer.compileAsync(blockerQuad, blockerQuad.camera); }
          compiled = true;
        } finally {
          for (const m of probes.meshes) { castScene.remove(m); m.visible = false; }
          const retired = compiled ? _probePrev : probes;
          if (retired) {
            for (const m of retired.meshes) disposeCaster(m);
            for (const g of retired.geos) { try { g.dispose(); } catch (_) {  } }
          }
          if (compiled) { _probePrev = probes; S.probeLayouts = probes.geos.length; }
          hideCasters(shown);
          try { renderer.setRenderTarget(prev); } catch (_) {  }
        }
      },
      drawWarm() {
        const prev = renderer.getRenderTarget(), shown = showAllCasters(), seen = new Set();
        let n = 0;
        try {
          for (const rt of [sunRT, carRT, lampRT, lampStaticRT]) {
            if (!rt) continue;
            const hdr = !!(rt.texture && rt.texture.type === THREE.FloatType), fd = !!(rt.depthTexture && rt.depthTexture.type === THREE.FloatType);
            const key = hdr + "|" + fd;
            if (seen.has(key)) continue;
            seen.add(key);
            const tmp = makeDepthTarget(1, "TLXWarmCast", hdr, fd);
            try { renderer.setRenderTarget(tmp); renderer.render(castScene, shadowCam); n++; }
            finally { tmp.dispose(); }
          }
        } finally {
          hideCasters(shown);
          try { renderer.setRenderTarget(prev); } catch (_) {  }
        }
        return n;
      },
      carShadowKeep, lampShadowKeep,
      sunSize: SUN_SIZE,
      carSize: CAR_SIZE,
      lampSize: LAMP_SIZE,
      sunTex: sunRT ? sunRT.depthTexture : null,
      carTex: carRT ? carRT.depthTexture : null,
      lampTex: lampRT ? lampRT.depthTexture : null,
      blockerTex: blockerRT ? blockerRT.texture : null,
      blockerSize: BLOCKER_SIZE,
      shadowBegin,
      castShadow: cast,
      castInstanced,
      freeInstanced,
      releaseGeometry,
      flushDropped,
      flushOwnershipDropped,
      purgeCastersForGeos,
      castShadowChunked: cast,
      shadowEnd: () => endPass(sunRT),
      carShadowEnd,
      lampShadowEnd,
      carShadowBegin,
      lampShadowBegin,
      lampStaticBegin, lampStaticEnd, lampCarsBegin,
      get lampStaticOn() { return !!(lampStaticRT && lampStaticOn); },
      clearArmed,
    };
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { shadowSys, uboInstCap, sunMapSize });
})();
