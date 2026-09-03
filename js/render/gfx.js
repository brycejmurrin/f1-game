/*
 * Apex 26 — Gfx: the renderer backend seam.
 *
 * THREE backends stand behind this seam:
 *   GLX  (WebGL2)          the DEFAULT — everyone gets it, no opt-in.
 *   TLX  (three.js/TSL)    opt-in via localStorage apex26.gfxBackend="three".
 *   WGX  (WebGPU)          opt-in via apex26.gfxBackend="webgpu". Ships the
 *                          GLX draw-API surface (gpuTimer, texture arrays,
 *                          lamp shadows, instancing, particles, MSAA 4×).
 *                          pcss() returns true (Poisson-8 + blocker search).
 *                          GLX stays the default.
 *
 * TLX and WGX are DEFERRED backends: they have NO <script> tags. game.js
 * injects their files at boot (manifest DEFERRED via js/roster.js) only when
 * the matching opt-in is set, then calls `Gfx.create()`, which returns a ready
 * TLX or WGX backend implementing the interface below — or `null` on absence
 * or ANY failure, and THE CALLER falls back to GLX. This module deliberately
 * does NOT reference GLX — keeping the fallback decision in game.js avoids
 * coupling the backends here.
 *
 * NO build step, no ES modules: "use strict" IIFE assigning one global `Gfx`.
 * `Gfx` is inert until game.js calls it; nothing here runs at load time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BACKEND INTERFACE CONTRACT (the "seam")
 * ─────────────────────────────────────────────────────────────────────────────
 * Both the backend object returned by GLX and the backend returned by
 * WGX.create() expose the SAME renderer surface. game.js talks to the selected
 * renderer through these methods. This is transcribed from the real GLX object.
 *
 * Lifecycle / capability:
 *   init(canvas) -> bool       acquire context/programs (GLX: sync). WGX is
 *                              already initialised by Gfx.create(); its init() is
 *                              a no-op returning true.
 *   resize()                   re-read canvas size * DPR (capped 1.5 mobile / 2)
 *                              * renderScale; (re)allocate targets on change.
 *   setRenderScale(s)->bool    clamp 0.5..1; re-resize; true if it changed.
 *   getRenderScale()->number
 *   width / height / aspect    getters (backing-store pixels).
 *   hdrMode()->bool            scene buffer is float (HDR) vs 8-bit.
 *   msaa()->int                active MSAA sample count (1 = off).
 *   pcss()->bool               PCSS-lite soft shadows active.
 *   isMobile / mobileTier      booleans (memory-safe caps on phones).
 *
 * Resources (return opaque mesh/texture handles; free with the matching free*):
 *   createMesh({pos,nrm,col,idx,mat?})           interleaved lit mesh.
 *   createTexMesh({pos,nrm,uv,idx})              textured mesh (decals).
 *   createChunkedMesh(data, cellSize)            frustum-cullable prop mesh.
 *   createTexture(src)                           2D texture from a canvas/image.
 *   freeMesh(mesh) / freeChunkedMesh(mesh) / freeTexture(tex)
 *
 * FEATURE-DETECTED members — callers probe `typeof gfx.x === "function"` and
 * a backend that lacks one exports it as `undefined` (see the WGX/TLX parity
 * tables), so the feature degrades instead of crashing:
 *   createInstancedBatch(data, matrices, colors, opts)   instanced prop batch
 *     (TrackGraph.batches() consumer); cullInstances(batch, planes) narrows
 *     batch.visible to the frustum; drawInstanced(batch, opts);
 *     castShadowInstanced(batch, count); freeInstancedBatch(batch).
 *     GLX + WGX + TLX implement the family. Software-WebGPU TLX no-ops the
 *     draws (Dawn encoder poison from InstancedMesh); real GPUs keep them.
 *   createTextureArray(size, images, layers)     TEXTURE_2D_ARRAY whose layer
 *     index IS the MAT id; setMaterialMaps(maps|null) adopts/clears the baked
 *     arrays. assets.js supported() detects the pair (GLX + WGX + TLX).
 *   drawParticles(data, floatCount, additive)    transient FX vertex batch —
 *     js/fx/particles.js feature-detects it (GLX + WGX + TLX).
 *
 * Frame protocol (per rendered frame, in this order):
 *   shadowBegin(lightVP) -> castShadow(mesh,model) / castShadowChunked(mesh,model)
 *     / castShadowInstanced(batch,count) -> shadowEnd()
 *   carShadowBegin(lightVP) -> ... -> carShadowEnd()      dynamic car map
 *   lampShadowBegin(lightVP, lightIdx) -> ... -> lampShadowEnd()   flood map
 *   carShadowKeep()           "the car pass did not run this frame, and its map
 *     is still good." A CADENCE skip, not a stop. Every backend clears its armed
 *     flag in present(), which is right when the pass STOPS for real (knob off,
 *     tier shed, menu, key faded) and wrong when game.js merely halves it at low
 *     speed — from inside a renderer the two are indistinguishable, so the
 *     producer says which. A genuine stop still disarms by making no call.
 *     ORDERING: keep() must precede begin(frame). TLX latches the armed flags at
 *     begin(); GLX re-reads them per draw. Calling it after begin() is a silent
 *     no-op on one backend and works on another.
 *     It declines (returns false) until that pass has rasterised at least once:
 *     GLX and WGX do not prime these depth targets, so an unwritten map reads
 *     fully SHADOWED under a LEQUAL compare and an early arm paints black.
 *     TLX does prime, and keeps the same guard for parity.
 *     There is deliberately NO lampShadowKeep — see the note at the lamp pass in
 *     js/game.js: that snap test compares a SLOT into a per-frame re-sorted
 *     array, and the lamp map rasterises cars.
 *   carShadowState()/lampShadowState() -> {enabled, arms, armed[, idx]}
 *     `arms` is a lifetime rasterisation count and stays true straight through a
 *     strobe; `armed` is the frame-live flag the lit pass actually reads. Assert
 *     on `armed`, or a strobe is invisible to the test.
 *   [optional env probe, up to one cube face per frame]:
 *     envFaceBegin(face, eye, frame) -> (redraw world) -> envFaceEnd(face)
 *     envProbeReady()->bool ; envProbeReset()
 *   begin(frame)              clear + bind scene target; upload frame uniforms.
 *   draw(mesh, model, opts) / drawChunked(mesh, model, opts)
 *   drawSky(sky)              OPAQUE FIRST, THEN SKY — not the other way round.
 *     The sky is a full-screen quad with depth WRITE off under LEQUAL, so
 *     drawing it after the opaque world is result-invariant and lets early-Z
 *     reject every sky fragment the world already covers. game.js states the
 *     order at both call sites ("opaque -> sky -> glow" for the camera, and the
 *     same order for each 64^2 env-probe face, where the sky was measured
 *     filling every pixel the world then overwrote). A backend that schedules
 *     its sky before the opaque list — e.g. via a framework's "background"
 *     slot — shades the whole screen for nothing and is a parity BUG, not a
 *     free choice.
 *   drawShadow(model, w, l) / drawMark(model, w, l) / drawSkidBatch(verts,n,dirty)
 *   drawGlow(lights, str) / drawDecal(mesh, model, tex, opts)
 *     Glow is additive with depthMask off, so it must follow the sky.
 *   present(opts)            resolve MSAA + run post chain + blit to screen.
 *
 * `frame` object consumed by begin() (all optional unless noted; see GLX.begin):
 *   viewProj:Float32Array(16)      REQUIRED  view-projection matrix
 *   eye:vec3                        REQUIRED  camera world position
 *   sunDir:vec3, sunColor:vec3      REQUIRED  directional sun
 *   fogColor:vec3                   REQUIRED  also the frame clear colour
 *   ambientSky:vec3, ambientGround:vec3      hemisphere ambient
 *   invViewProj:Float32Array(16)   sky ray reconstruction
 *   view:Float32Array(16)         explicit view matrix (garage off-axis: WGX/TLX
 *                                  must not decompose invProj·viewProj)
 *   invProj / proj / sunViewDir / upViewDir  view-space helpers (post)
 *   skyZenith:vec3, skyHorizon:vec3          sky/atmosphere colours
 *   fogDensity, fogHeight, groundMist, lampFog, wetness, time, cloud,
 *   cloudSpeed (cloud-scroll rate, default 1),
 *   moonK (clear-night moon factor, 0-1), moonGate (moonK floored by the
 *   MOON SHADOWS knob's own above-0.5 weather override — what the shadow
 *   floor actually reads)                                       scalars
 *   shadowCtr:vec3                 shadow-box snap anchor (look-biased);
 *                                  shader fade uses eye XZ + this Y
 *                                  (defaults to eye)
 *   cullDist:number                far cull distance
 *   noEnv:bool                     disable env-cube sheen (menu preview)
 *   tune:object                    live LIGHTING TUNER knobs (LT.*); defaults in
 *                                  the backend MUST mirror LightTune.TUNE_DEFS
 *   lights:Float32Array            flat stride-15 point lights, pre-culled <=48:
 *     [x,y,z, r,g,b, rad, dirX,dirY,dirZ, cosInner,cosOuter, bleed, volW, glareW]
 *   allLights:Float32Array         FULL baked track-lamp set (same stride) for
 *                                  per-chunk lamp binding; null by day
 *   perChunkLights:number          0..1 per-chunk lamp amount (0 = off); also
 *                                  the track-lamp intensity scale in that mode
 *   tailStart, tailCount:number    car tail-light range appended to `lights`
 *                                  after the static cull (outside allLights)
 *
 * `sky` object consumed by drawSky() (see GLX.drawSky):
 *   invViewProj, zenith:vec3, horizon:vec3, sunDir:vec3, sunColor:vec3,
 *   stars:bool, cloud, time, moon, cityGlow:vec3, starBright, cloudSpeed
 *
 * `opts` object consumed by draw()/drawChunked() (see GLX.draw/GLX.drawChunked):
 *   emissive, alpha, roughness, metalness, specular, detail, clearcoat,
 *   carPaint, sparkle : material scalars ; noAlphaWrite:bool ; doubleSided:bool
 *   depthBias:[factor,units]  polygon-offset depth nudge for DECAL geometry
 *                             laid on the road (start line) — resolution-safe
 *                             unlike a Y lift
 *
 * `opts` object consumed by present() (see GLX.present):
 *   exposure, bloom, ssao, contact, threshold, tune, ...
 * ─────────────────────────────────────────────────────────────────────────────
 */
"use strict";

const Gfx = (function () {
  const BACKEND_KEY = "apex26.gfxBackend";   // "webgl2" opts out | "webgpu" = WGX | "three" = TLX

  /**
   * create(canvas, opts) -> Promise<backend | null>
   *
   * Resolves to a ready opt-in backend (implementing the interface above):
   * TLX when apex26.gfxBackend="three", else WGX when WebGPU is present,
   * permitted, and initialises cleanly. Resolves to `null` on: no opt-in
   * backend available, no navigator.gpu, user opt-out (apex26.gfxBackend=
   * "webgl2"), backend not loaded, or ANY init failure. On null the CALLER
   * must fall back to GLX, e.g.:
   *
   *     let gfx = await Gfx.create(canvas);
   *     if (!gfx) { if (!GLX.init(canvas)) { showNoGl(); return; } gfx = GLX; }
   *     // ...every later GLX.method() becomes gfx.method()
   *
   * Never throws (failures resolve to null), so it is safe on every browser and
   * cannot break the existing WebGL2 game.
   */
  async function create(canvas, opts) {
    try {
      let pref = null;
      try { pref = localStorage.getItem(BACKEND_KEY); } catch (_) {}

      // "three" -> TLX (three.js/TSL backend; WebGPU with automatic WebGL2
      // fallback inside three, so no navigator.gpu requirement here).
      if (pref === "three") {
        if (typeof TLX === "undefined" || !TLX || typeof TLX.create !== "function") {
          Log.info("gfx", "Gfx.bind fallback webgl2");
          return null;
        }
        const backend = await TLX.create(canvas, opts || {});
        if (backend) { Log.info("gfx", "Gfx.bind backend=three"); return backend; }
        Log.info("gfx", "Gfx.bind fallback webgl2");
        return null;   // TLX.create returns null on any failure
      }

      // Anything else follows the original WebGPU/WGX rules verbatim:
      if (typeof navigator === "undefined" || !navigator.gpu) return null;

      // User / test opt-out: force the WebGL2 path.
      if (pref === "webgl2") {
        Log.info("gfx", "Gfx.bind backend=webgl2");
        return null;
      }

      // WGX must be loaded (script order). If not, fall back silently.
      if (typeof WGX === "undefined" || !WGX || typeof WGX.create !== "function") return null;

      const backend = await WGX.create(canvas, opts || {});
      if (backend) { Log.info("gfx", "Gfx.bind backend=webgpu"); return backend; }
      Log.info("gfx", "Gfx.bind fallback webgl2");
      return null;   // WGX.create returns null on any failure
    } catch (_) {
      Log.info("gfx", "Gfx.bind fallback webgl2");
      return null;              // any surprise -> WebGL2 fallback
    }
  }

  return { create };
})();

// No-build global export.
if (typeof window !== "undefined") window.Gfx = Gfx;
