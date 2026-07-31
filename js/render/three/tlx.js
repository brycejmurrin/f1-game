/* Apex 26 — TLX: the three.js/TSL renderer backend (migration milestone 1).
 *
 * Third backend behind the js/render/gfx.js seam (GLX = WebGL2 default,
 * WGX = frozen hand-written WebGPU, TLX = three.js r184 with WebGPURenderer
 * and automatic WebGL2 fallback). Opt-in via localStorage
 * apex26.gfxBackend = "three"; installed by game.js's descriptor-copy onto
 * the GLX object so every direct GLX.* call site and test monkey-patch keeps
 * working (object identity is the compatibility contract).
 *
 * ARCHITECTURE (see spike/ADOPTION-PLAN.md + the milestone plan):
 * - This file and its tlx-…/tsl-… siblings are classic IIFE scripts like the
 *   rest of the codebase. The ONLY ES-module content is the vendored three
 *   build in vendor/three-0.184.0/, reached through the inline importmap in
 *   index.html by a dynamic import() inside TLX.create() — so GLX users never
 *   fetch a byte of it and a failed import falls back to GLX via Gfx.create's
 *   never-throw null contract.
 * - tsl-*.js files publish FACTORY functions on the TLXShaders global
 *   ((THREE, TSL, ctx) => nodes) and must NEVER touch THREE at script eval —
 *   three does not exist until create() runs.
 *
 * STANDING RULES (learned in the spike, see spike/README.md):
 * - Every shared varying-derived TSL node gets an unconditional Fn-body
 *   .toVar() anchor before any conditional use (TSL emits cached property
 *   chains at FIRST USE; a first use inside If/ElseIf strands the assignments
 *   in that branch and every out-of-branch consumer silently reads garbage).
 * - THREE.ColorManagement.enabled = false and outputColorSpace =
 *   LinearSRGBColorSpace; NO sRGB encode in any pass — the whole game look,
 *   the LightPresets and every pixel baseline are calibrated without one
 *   (js/render/shaders/chunks.js:93-98).
 * - Defaults for every frame.tune / present(opts.tune) knob MUST mirror
 *   LightTune.TUNE_DEFS, same as GLX (js/render/gfx.js contract note).
 *
 * M0 STATUS: contract stub — create() resolves null (GLX fallback) until M1
 * lands the renderer lifecycle. The file exists now so the manifest/index
 * wiring, load-order test and cache-bust land as one reviewed unit.
 */
"use strict";

const TLX = (function () {

  /** create(canvas, opts) -> Promise<backend|null>. Never throws. */
  async function create(canvas, opts) {
    try {
      // M1 will: await import("three/webgpu") + import("three/tsl") via the
      // importmap, construct WebGPURenderer({canvas}) with WebGL2 fallback,
      // await renderer.init(), capture GLX.isMobile/mobileTier BEFORE the
      // descriptor-copy install overwrites them, and return the full
      // ~40-member contract surface.
      return null;
    } catch (_) {
      return null;   // any failure -> GLX fallback (Gfx.create contract)
    }
  }

  return { create };
})();

if (typeof window !== "undefined") window.TLX = TLX;
