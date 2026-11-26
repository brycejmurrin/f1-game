/* Apex 26 — TLXDebug: the __tlx debug surface carved out of tlx.js (#6821, #6479 row 9). create(S) returns the object
 * tlx.js exposes as api.__tlx. Bodies are verbatim except that every read of a TLX.create closure variable goes
 * through S (a bag of live getters built in tlx.js, plus setters for the two session toggles): S.lit is the current
 * `lit`, never a snapshot (the one eager read is `viz`, which was a creation-time value before the carve too). Loads before tlx.js (DEFERRED.three + DEFERRED_EDGES). */
"use strict";

const TLXDebug = (function () {
  function create(S) {
    return {
      renderer: S.renderer, THREE: S.THREE, TSL: S.TSL,
      get lit() { return S.lit; },
      get shadow() { return S.shadowSys; },
      get sky() { return S.sky; },
      get fx() { return S.fx; },
      get post() { return S.post; },
      postState() {
        if (!S.post) return { on: false, hdr: false, blocks: {}, targets: [0, 0] };
        return S.post.state();
      },
      fxState() {
        return {
          on: !!S.fx,
          shadows: S._fxLast.shadows, marks: S._fxLast.marks,
          skidVerts: S._fxLast.skidVerts, glow: S._fxLast.glow,
          particles: S._fxLast.particles, decals: S._fxLast.decals,
        };
      },
      // Zero last-presented FX counters so a Home-garage present (glow
      // without blob shadows / car decals) cannot satisfy a race probe
      // while Metal is still warming and Singapore has not presented.
      // stopHome / startRace call this; the next race present() rewrites
      // _fxLast from a real frame.
      clearFxState() {
        S._fxLast.shadows = 0; S._fxLast.marks = 0; S._fxLast.skidVerts = 0;
        S._fxLast.glow = 0; S._fxLast.particles = 0; S._fxLast.decals = 0;
        S._fxFrame.shadows = 0; S._fxFrame.marks = 0; S._fxFrame.skidVerts = 0;
        S._fxFrame.glow = 0; S._fxFrame.particles = 0; S._fxFrame.decals = 0;
        if (S.post && typeof S.post.clearLast === "function") S.post.clearLast();
      },
      skyState() {
        return {
          on: !!(S.sky && S.skyMesh && S.skyMesh.visible),
          // `on` is true for the zenith-only software fallback too (no clouds/stars/moon/sun disc): a SwiftShader
          // still was once filed as "TLX phone sky has no clouds". A real GPU reads fallback false.
          fallback: !!(S.skyMesh && S.skyMatFallback && S.skyMatFallback !== S.skyMatFull && S.skyMesh.material === S.skyMatFallback),
          stars: S.sky ? S.sky.uniforms.stars.value : -1,
          cloud: S.sky ? S.sky.uniforms.cloud.value : -1,
          sunDir: S.sky ? S.sky.uniforms.sunDir.value.toArray() : null,
          cache: S.sky && S.sky.cacheState ? S.sky.cacheState() : null,   // E1 cloud-noise cache (tsl-sky.js)
        };
      },
      chunkState() {
        return { on: !!S.chunkedSys, total: S._chunkLast.total, visible: S._chunkLast.visible };
      },
      postSubmit(on) { if (on !== undefined) S._postSubmitOn = !!on; return S._postSubmitOn; },   // the ?lab=postSubmit arm, live, this session only
      roadSplit(on) {   // persists: a reload keeps the A/B arm (apex26.tlxRoadSplit)
        if (on !== undefined) {
          S._roadSplitOn = !!on;
          try { if (S._roadSplitOn) localStorage.removeItem("apex26.tlxRoadSplit"); else localStorage.setItem("apex26.tlxRoadSplit", "0"); } catch (_) { /* no storage: session only */ }
        }
        return S._roadSplitOn;
      },
      // Where the retained CPU bytes actually ARE, per attribute NAME and
      // per geometry kind. Deduped on the underlying ArrayBuffer, because a
      // chunked mesh shares ONE position/normal/colour/mat set across all
      // its chunks and carries only the index per chunk — counting per
      // geometry would multiply that shared set by the chunk count and
      // invent tens of megabytes that do not exist.
      geoCensus() {
        const seen = new Set(), out = { live: 0, dead: 0, byAttr: {}, byKind: {}, zeroMB: 0, totalMB: 0 };
        // Compact as we walk: dead WeakRefs were retained forever (~150-200
        // per circuit build, monotonic across a season).
        for (let ri = S._geoReg.length - 1; ri >= 0; ri--) {
          const ref = S._geoReg[ri];
          const g = ref.deref ? ref.deref() : null;
          if (!g) { out.dead++; S._geoReg.splice(ri, 1); continue; }
          out.live++;
          const kind = g.__tlxKind || "?";
          const k = out.byKind[kind] || (out.byKind[kind] = { n: 0, mb: 0 });
          k.n++;
          const put = (name, a) => {
            if (!a || !a.array) return;
            const b = a.array.buffer;
            if (seen.has(b)) return;
            seen.add(b);
            const mb = a.array.byteLength / 1048576;
            out.byAttr[name] = +(((out.byAttr[name] || 0) + mb)).toFixed(3);
            out.totalMB += mb; k.mb += mb;
            // An attribute that is entirely zero is an allocation the
            // source data never asked for — buildGeometry fills normal /
            // color / mat / trk whether or not the caller supplied them.
            // FULL scan, not a sampled one: a stride would call a
            // mostly-zero array all-zero and overstate the waste.
            let z = a.array.length > 0;
            for (let i = 0; i < a.array.length; i++) { if (a.array[i] !== 0) { z = false; break; } }
            if (z) { out.zeroMB += mb; out.byAttr[name + ":zero"] = +(((out.byAttr[name + ":zero"] || 0) + mb)).toFixed(3); }
          };
          for (const name in g.attributes) put(name, g.attributes[name]);
          put("index", g.index);
        }
        out.totalMB = +out.totalMB.toFixed(2); out.zeroMB = +out.zeroMB.toFixed(2);
        try { const ps = TLXShaders.packStats;
          out.pack = { small: ps.small, wide: ps.wide, zero: ps.zero, savedMB: +ps.savedMB.toFixed(2),
            half: ps.half, wideBy: ps.wideBy, wideMax: ps.wideMax, wideLen: ps.wideLen };
        } catch (_) { out.pack = null; }
        for (const kk in out.byKind) out.byKind[kk].mb = +out.byKind[kk].mb.toFixed(2);
        return out;
      },
      meshState() {
        return { mesh: S._meshMade.mesh, chunked: S._meshMade.chunked, tex: S._meshMade.tex,
                 // createTexture: new GPU textures vs retired ones re-filled in place (_texPool)
                 texMade: S._texStat.made, texReused: S._texStat.reused, texRetired: S._texStat.retired,
                 texDisposed: S._texStat.disposed, texPooled: S._texPoolM.size() };
      },
      // R1: live?, runs held, and lifetime run records / instances / per-record fallbacks.
      coState() {
        let runs = 0, shown = 0;
        for (const pair of S._coRuns.values()) for (const b of pair) if (b) { runs++; if (b.imesh.visible) shown++; }
        return { on: S._coOn && !S.skipBatches(), runs, shown, recs: S._coStat.recs, inst: S._coStat.inst, fall: S._coStat.fall };
      },
      // WHERE DOES THE FRAME GET DARK? The three-WebGPU luma gap has survived
      // five hypotheses (docs/notes/PERF-FINDINGS.md 2t), and every one of
      // them died to a measurement rather than to an argument. This is the
      // measurement: post's INPUT, post's OUTPUT, and what capturePixels
      // actually reads, so a leg can be split by stage instead of guessed at.
      //
      // CAVEAT, and it matters: _readLdr reads bytes, so an HDR target
      // saturates — sceneRT comes back 255/255 on BOTH legs because most of
      // the frame is >= 1.0 in HDR, which means this cannot yet exonerate the
      // lit pass. Splitting lit-pass from post needs a scaled or float read of
      // sceneRT. ldrRT and captureRT are LDR and read truthfully.
      //
      // Call it after a completed present (GLX.awaitSoftPresent) — on the
      // WebGPU backend an unrendered target has no texture and every read
      // throws on `format`.
      lumaDbg() {
        // HALF-FLOAT, NOT BYTES, on the HDR targets. _readLdr clamps into a
        // Uint8ClampedArray, which reported sceneRT as 255/255 on BOTH legs —
        // most of an HDR frame is >= 1.0, so the byte read said nothing and the
        // lit pass could not be told apart from the post chain. Read the raw
        // array instead and decode by the target's own type.
        const half = function (h) {          // IEEE 754 binary16 -> Number
          const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
          if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
          if (e === 31) return f ? NaN : s * Infinity;
          return s * Math.pow(2, e - 15) * (1 + f / 1024);
        };
        const read = function (rt, label) {
          if (!rt) return Promise.resolve({ label, err: "no rt" });
          const w = rt.width, h = rt.height;
          const isHalf = rt.texture && rt.texture.type === S.THREE.HalfFloatType;
          // A packed 11/11/10 scene target (phones, tlx-post scene11) reads back one uint32 per pixel: not decoded here.
          if (rt.texture && rt.texture.type === S.THREE.UnsignedInt101111Type) return Promise.resolve({ label, err: "rg11b10 target: this probe decodes half/byte only (apex26.tlxScene11=0 for a reading)" });
          return S.renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h).then(function (src) {
            // three pads copyTextureToBuffer rows to 256 BYTES (WebGPU rule).
            const bpp = isHalf ? 8 : 4;
            const bpr = 256 * Math.ceil((w * bpp) / 256), stride = bpr / (isHalf ? 2 : 1);
            const tight = src.length < (h - 1) * stride + w * 4;
            let sum = 0, mx = 0, n = 0;
            for (let y = 0; y < h; y++) {
              const row = tight ? y * w * 4 : y * stride;
              for (let x = 0; x < w; x++) {
                const i = row + x * 4;
                const r = isHalf ? half(src[i]) : src[i];
                const g = isHalf ? half(src[i + 1]) : src[i + 1];
                const b = isHalf ? half(src[i + 2]) : src[i + 2];
                const v = (r + g + b) / 3;
                if (!isFinite(v)) continue;
                sum += v; if (v > mx) mx = v; n++;
              }
            }
            return { label, w, h, type: isHalf ? "half" : "byte",
                     mean: +(sum / (n || 1)).toFixed(3), max: +mx.toFixed(3), arr: src.constructor.name };
          }).catch(function (e) { return { label, err: String(e && e.message).slice(0, 80) }; });
        };
        return Promise.all([
          read(S.post && S.post.sceneTarget && S.post.sceneTarget(), "sceneRT (post IN, HDR world)"),
          read(S.post && S.post.ldrTarget && S.post.ldrTarget(), "ldrRT (post OUT)"),
          read(S._captureRT(), "captureRT (what capturePixels reads)"),
        ]);
      },
      envState() {
        let face = 0;
        while (face < 6 && (S.envFacesMask & (1 << face))) face++;
        return {
          on: !!S.envRT, face, size: S.ENV_SIZE, ready: S.envReady, blank: S._envBlank,
          mask: S.envFacesMask, begins: S._envBegins, ends: S._envEnds,
          fail: S._envFailN, failMsg: S._envFailMsg,
          mipFn: S._envMipFn, mipRan: S._envMipRan, mipErr: S._envMipErr, mipWhere: S._envMipWhere,
          cube: S._envCube,
          badProbes: S._envBadProbes, gaveUp: S._envGaveUp,
        };
      },
      envFailStack() { return S._envFailStack; },
      viz: S.vizMode,
      // Which three backend actually came up, and why — the one question a
      // "TLX looks wrong on my phone" report has to answer first, since the
      // WebGPU/WebGL2 choice is now device-dependent (see the pin above).
      ctxLost() { return !!S._deviceLost; },
      swRaceShed(on) { S.setSwRaceShed(on); },
      backendState() {
        return {
          api: (S.renderer.backend && S.renderer.backend.isWebGPUBackend) ? "webgpu" : "webgl2",
          forceWebGL: S.forceWebGL, initSwapGL: S._initSwapGL, pin: S._glPin, autoStayGL: S._autoStayGL, webkitStayGL: S._webkitStayGL, hasGpu: S._hasGpu,
          gpuAdapterOk: S._gpuAdapterOk, gpuCanvasOk: S._gpuCanvasOk,
          // Read back off the LIVE context, not inferred from what we
          // passed: `true` IS the see-through-car defect, and the paths
          // that produce it are indistinguishable from the parameters.
          canvasAlpha: (function () {
            try {
              const g = S.renderer.backend && S.renderer.backend.gl;
              if (g && g.getContextAttributes) return !!g.getContextAttributes().alpha;
            } catch (_) { /* WebGPU backend has no gl; null is the honest answer */ }
            return null;
          })(),
          isMobile: S.isMobile, mobileTier: S.mobileTier, isWebKit: S.isWebKit, liteGpu: S._liteGpu, liteLab: !!S._lite,
          softwareGL: S.softwareGL, softwareRaceShed: S._swRaceShed, softAdapter: S._softAdapter, headless: S._headless,
          forceHw: S._forceHw.on, forceBatches: S._forceBatches,
          // The live verdict, not just the inputs: which way skipBatches()
          // actually went. And gpuErrFrames — DISTINCT presents an error
          // landed in, which is what separates "one bad frame at boot"
          // from "every frame", and the count alone cannot.
          skipBatches: S.skipBatches(), skipBatchesPin: S._skipBatchesPin,
          gpuErrFrames: S._gpuErrFrames,
          envFail: S._envFailN, envFailMsg: S._envFailMsg,
          softBlit: S._softBlit, capPref: S._capPref,
          // Last frame's FX submissions — the positive signal a software
          // probe can read when it cannot read pixels (the DRIVING LINE's
          // lineVerts > 0 means the strip was submitted with its material).
          fx: { shadows: S._fxFrame.shadows, marks: S._fxFrame.marks, skidVerts: S._fxFrame.skidVerts, glow: S._fxFrame.glow,
                particles: S._fxFrame.particles, decals: S._fxFrame.decals, lineVerts: S._fxFrame.lineVerts || 0 },
          line: S._lineDiag(),
          softRead: { gen: S._softBlitGen, lastMs: Math.round(S._softReadLastMs), fails: S._softReadFails,
                      lastErr: S._softReadLastErr, abandoned: S._softReadAbandoned, pending: S._softReadPending },
          // The runtime half: what the device has said since boot. A
          // phone screenshot of the GOV panel carries these, which is the
          // evidence a "see-through car" report has never had.
          gpuErrors: S._gpuErrors, gpuFirstError: S._gpuFirstError,
          gpuRecentErrors: S._gpuRecentErrors.map(e => ({ ...e, lastResize: e.lastResize && { ...e.lastResize } })),
          presents: S._presentN, healed: S._healTried,
          ctxLost: !!S._deviceLost,
          // three refreshes every OBJECT-group uniform per draw (r185
          // NodeManager); tsl-lit's frame block left that group for
          // renderGroup (SHARED_UNIFORMS), so what remains per draw is
          // three's own object block. The draw count is still the CPU
          // lever on a phone; reported so the GOV `tlx` row shows it (`dc N`).
          calls: (S.renderer && S.renderer.info && S.renderer.info.render) ? (S.renderer.info.render.drawCalls | 0) : null,
          arrayNearest: S._arrayNearest,
          hasMaterialMaps: !!(S.lit && S.lit.hasMaterialMaps),
          packLive: !!S.matOwnedAlbedo,
          drawMatMode: S._drawMatMode,
        };
      },
      materialCacheSize() { return S.matCache.size; },
      // #3673 first-race census: the matCache key a built pipeline's material was minted under (null: not a cached lit variant).
      matKeyOf(m) { for (const [k, v] of S.matCache) if (v === m) return k; return null; },
      // What is growing when the GEOMETRY is not? A 4-minute race soak
      // measured the heap climbing 88-138 MB while geoCensus's registry
      // and attribute bytes both stayed flat (docs/PERF-FINDINGS.md 2o),
      // so the leak is in the bookkeeping around the meshes, not in them.
      // Everything here is a COUNT or a size the renderer already tracks —
      // reporting it costs nothing and guessing costs an afternoon.
      memState() {
        const o = { mats: S.matCache.size, pool: S.meshPool.length, draws: S.drawList.n,
                    geoKeys: S.meshByGeo.size, batch: S._poolBatch,
                    dropLater: { now: S._dropLater.length, held: S._dropStat.held, overflow: S._dropStat.overflow },
                    // Hunt 6, lifetime: wrappers minted / pruned (each mint is a three RenderObject: object UBO + bind
                    // group), FX streams (re)built (a vertex buffer each), and headless readbacks (one MAP_READ createBuffer each).
                    churn: { poolNew: S.acquireMesh.n | 0, poolPruned: S.prunePool.n | 0, softReads: S._softBlitGen,
                             streamNew: [S.skidStream, S.lineStream, S.glowStream, ...S.partStreams].reduce((n, s) => n + (s.builds | 0), 0) },
                    // The mirror sweep reports what it FREED, not that it ran:
                    // the first version of this lever never executed and read
                    // as "the fix does nothing" (PERF-FINDINGS 2m).
                    mirror: { sweeps: S._mirrorStat.sweeps, geos: S._mirrorStat.geos,
                              freedMB: S._mirrorStat.freedMB, drains: S._mirrorStat.drains,
                              chunks: S._mirrorStat.chunks, gate: S._mirrorStat.gate,
                              carSh: S._mirrorStat.carSh, repaired: S._mirrorStat.repaired } };   // LP-01: null-mirror repairs
        try {
          const inf = S.renderer && S.renderer.info;
          if (inf) {
            o.progs = inf.memory && typeof inf.memory.programs === "number" ? inf.memory.programs : null;
            if (inf.memory) {
              o.rGeo = inf.memory.geometries; o.rTex = inf.memory.textures;
              // Copy only existing primitive resource telemetry (bytes stay bytes).
              o.resources = {};
              for (const key of ["total", "geometries", "textures", "texturesSize", "programs", "programsSize",
                "attributes", "attributesSize", "indexAttributes", "indexAttributesSize", "storageAttributes", "storageAttributesSize",
                "indirectStorageAttributes", "indirectStorageAttributesSize", "readbackBuffers", "readbackBuffersSize",
                "renderTargets", "uniformBuffers", "uniformBuffersSize"]) {
                if (typeof inf.memory[key] === "number") o.resources[key] = inf.memory[key];
              }
              // Uniform buffers three holds. With the frame block in
              // objectGroup this scaled with draws (one clone per pooled
              // mesh, plus one per lamp array); shared, it is one per
              // program. The structural before/after of tsl-lit's
              // SHARED_UNIFORMS — valid on a software adapter too.
              o.rUbo = inf.memory.uniformBuffers;
              o.rUboKB = inf.memory.uniformBuffersSize != null ? +(inf.memory.uniformBuffersSize / 1024).toFixed(1) : null;
              // Live RenderObjects (three's _objects cache). The per-object
              // arm's buffer count is only comparable PER render object:
              // prunePool drops a wrapper's render object after PRUNE_IDLE_MS idle
              // (dropWrapper), so the raw count follows how long a sample
              // took, not the layout.
              const ro = S.renderer._objects && S.renderer._objects._renderObjects;
              o.rObj = ro && typeof ro.size === "number" ? ro.size : null;
            }
            if (inf.render) { o.calls = inf.render.calls; }
          }
        } catch (_) { /* three's info shape is version-dependent; absent is reported as absent */ }
        // The render group's version must advance once per renderer.render():
        // a frozen number means the shared frame block uploaded once and
        // never again (a stuck sun). presentMs: JS EMA inside the render calls.
        try { const g = S.lit && S.lit.uniforms && S.lit.uniforms.sunDir && S.lit.uniforms.sunDir.groupNode; o.groupVer = g ? g.version : null; } catch (_) { o.groupVer = null; }
        o.sharedUniforms = !!(S.lit && S.lit.sharedUniforms);
        o.matHit = S._matHit; o.matMiss = S._matMiss; o.matEvict = S._matEvict;
        o.matMissKeys = S._matMissLog.slice(-16);
        o.presentMs = +S._presentMs.toFixed(3);
        // The warm timeline: how long the lights held on THIS GPU, by stage;
        // pending/done say whether a census beat is inside it (207 was, all 15).
        o.warm = { where: S._warmWhere, at: S._warmStages.at, scene: S._warmStages.scene, fx: S._warmStages.fx, lateLayouts: S._warmStages.lateLayouts, post: S._warmStages.post, shadow: S._warmStages.shadow, mirror: S._warmStages.mirror,
                   postJobs: S._warmStages.postJobs && { ...S._warmStages.postJobs },
                   draw: S._warmStages.draw, drawn: S._warmStages.drawn, garageScene: S._warmStages.garageScene,   // A-W1: ms (incl. the GPU settle), and { mirror, scene, post, casts }
                   mirrorDeferred: S._warmStages.mirrorDeferred, mirrorLazy: S._warmStages.mirrorLazy, rig: S._warmStages.rig,   // B-F3.1
                   total: S._warmStages.total, attempts: S._warmStages.attempts, failed: S._warmStages.failed,
                   pending: !!S._warmPending, done: S._warmDone, history: S._warmHistory.slice(), pinned: S._pinnedPipes.size };   // A·W50
        o.presents = S._presentN;   // frames presented — a spec samples both flag arms at the same count
        // THIS WAS ALWAYS undefined. `renderer.backend.data` is a
        // WeakMap, which has no `.size`, so the guard never passed and the
        // one counter closest to real device-side retention silently
        // reported nothing — an instrument that measures nothing is worse
        // than none, because its absence reads as "flat". Report what the
        // shape actually offers, and say which shape it was.
        try {
          const b = S.renderer && S.renderer.backend;
          const dm = b && b.data;
          if (dm) {
            o.backendData = (typeof dm.size === "number") ? dm.size : null;
            o.backendDataKind = (typeof dm.size === "number") ? "Map" : (dm instanceof WeakMap ? "WeakMap" : typeof dm);
          }
        } catch (_) { o.backendData = null; }
        // Live geometries by kind: names WHICH producer is growing.
        try {
          const kinds = {};
          let live = 0;
          for (let gi = 0; gi < S._geoReg.length; gi++) {
            const ref = S._geoReg[gi];
            const g = ref && ref.deref();
            if (!g) continue;
            live++;
            const k = g.__tlxKind || "?";
            kinds[k] = (kinds[k] || 0) + 1;
          }
          o.geoLive = live; o.geoKinds = kinds; o.geoRegLen = S._geoReg.length;
        } catch (_) { /* no WeakRef: the census degrades, nothing leaks */ }
        return o;
      },
      async shader(idx = 0) {
        const meshes = S.scene.children.concat(S.poolRoot.children, S.instRoot.children).filter((o) => o.isMesh && o.visible);
        const target = meshes[idx];
        if (!target) return null;
        const out = await S.renderer.debug.getShaderAsync(S.scene, S.camera, target);
        return { vertex: out.vertexShader, fragment: out.fragmentShader };
      },
    };
  }
  return { create };
})();
Object.freeze(TLXDebug);
