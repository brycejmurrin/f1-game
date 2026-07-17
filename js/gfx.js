/*
 * Apex 26 — Gfx: the renderer backend seam (WebGPU migration, Phase 0).
 *
 * WebGL2 (GLX) is the default renderer. game.js uses this selection seam only
 * when `apex26.gfxBackend=webgpu` explicitly opts into WebGPU; `Gfx.create()`
 * then feature-detects WebGPU and returns a WGX backend implementing the
 * interface below. On absence or ANY failure it returns `null`, and THE CALLER
 * falls back to GLX. This module deliberately does NOT reference GLX — keeping
 * the fallback decision in game.js avoids coupling the two backends here.
 *
 * NO build step, no ES modules: "use strict" IIFE assigning one global `Gfx`.
 * Load order in index.html:
 *     wgsl-chunks.js -> wgx.js -> gfx.js -> ... -> game.js
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
 * Frame protocol (per rendered frame, in this order):
 *   shadowBegin(lightVP) -> castShadow(mesh,model) / castShadowChunked(mesh,model)
 *     -> shadowEnd()
 *   [optional env probe, up to one cube face per frame]:
 *     envFaceBegin(face, eye, frame) -> (redraw world) -> envFaceEnd(face)
 *     envProbeReady()->bool ; envProbeReset()
 *   begin(frame)              clear + bind scene target; upload frame uniforms.
 *   drawSky(sky)
 *   draw(mesh, model, opts) / drawChunked(mesh, model, opts)
 *   drawShadow(model, w, l) / drawMark(model, w, l) / drawSkidBatch(verts,n,dirty)
 *   drawGlow(lights, str) / drawDecal(mesh, model, tex, opts)
 *   present(opts)            resolve MSAA + run post chain + blit to screen.
 *
 * `frame` object consumed by begin() (all optional unless noted; see GLX.begin):
 *   viewProj:Float32Array(16)      REQUIRED  view-projection matrix
 *   eye:vec3                        REQUIRED  camera world position
 *   sunDir:vec3, sunColor:vec3      REQUIRED  directional sun
 *   fogColor:vec3                   REQUIRED  also the frame clear colour
 *   ambientSky:vec3, ambientGround:vec3      hemisphere ambient
 *   invViewProj:Float32Array(16)   sky ray reconstruction
 *   invProj / proj / sunViewDir / upViewDir  view-space helpers (post)
 *   skyZenith:vec3, skyHorizon:vec3          sky/atmosphere colours
 *   fogDensity, fogHeight, groundMist, lampFog, wetness, time, cloud,
 *   moonK (clear-night moon factor for the MOON SHADOWS floor)  scalars
 *   cullDist:number                far cull distance
 *   noEnv:bool                     disable env-cube sheen (menu preview)
 *   tune:object                    live LIGHTING TUNER knobs (LT.*); defaults in
 *                                  the backend MUST mirror LightTune.TUNE_DEFS
 *   lights:Float32Array            flat stride-15 point lights, pre-culled <=32:
 *     [x,y,z, r,g,b, rad, dirX,dirY,dirZ, cosInner,cosOuter, bleed, volW, glareW]
 *
 * `sky` object consumed by drawSky() (see GLX.drawSky):
 *   invViewProj, zenith:vec3, horizon:vec3, sunDir:vec3, sunColor:vec3,
 *   stars:bool, cloud, time, moon, cityGlow:vec3, starBright, cloudSpeed
 *
 * `opts` object consumed by draw()/drawChunked() (see GLX.draw/GLX.drawChunked):
 *   emissive, alpha, roughness, metalness, specular, detail, clearcoat,
 *   carPaint, sparkle : material scalars ; noAlphaWrite:bool ; doubleSided:bool
 *
 * `opts` object consumed by present() (see GLX.present):
 *   exposure, bloom, ssao, contact, threshold, tune, ...
 * ─────────────────────────────────────────────────────────────────────────────
 */
"use strict";

const Gfx = (function () {
  const BACKEND_KEY = "apex26.gfxBackend";   // "webgl2" opts out of WebGPU

  /**
   * create(canvas, opts) -> Promise<backend | null>
   *
   * Resolves to a ready WebGPU backend (implementing the interface above) when
   * WebGPU is present, permitted, and initialises cleanly. Resolves to `null`
   * on: no navigator.gpu, user opt-out (localStorage apex26.gfxBackend=webgl2),
   * WGX not loaded, or ANY init failure. On null the CALLER must fall back to
   * GLX, e.g.:
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
      if (typeof navigator === "undefined" || !navigator.gpu) return null;

      // User / test opt-out: force the WebGL2 path.
      let optOut = false;
      try { optOut = localStorage.getItem(BACKEND_KEY) === "webgl2"; } catch (_) {}
      if (optOut) return null;

      // WGX must be loaded (script order). If not, fall back silently.
      if (typeof WGX === "undefined" || !WGX || typeof WGX.create !== "function") return null;

      const backend = await WGX.create(canvas, opts || {});
      return backend || null;   // WGX.create returns null on any failure
    } catch (_) {
      return null;              // any surprise -> WebGL2 fallback
    }
  }

  return { create };
})();

// No-build global export.
if (typeof window !== "undefined") window.Gfx = Gfx;
