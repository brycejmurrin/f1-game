/* Apex 26 — LightBudget: the ONE source for point-light slot counts. No
   backend restates them: the lit-shader slot
   count (GLX MAX_LIGHTS / WGX MAX_LIGHTS / TLX default), the phone cap, the
   TLX lite cap (WebGL2 fragment-uniform floor, tsl-lit.js), the per-chunk cap
   (LampChunks) and the tail-light reserve. The bound backend publishes its
   LIVE slot count through setSlots() (gfx.maxLights() reads the same value),
   and js/lighting/frame-lights.js culls against slots() so the tail-lights it
   appends LAST always land inside the shader's array — TLX-lite ran 16 slots
   while the cull budgeted 48, so no tail-light ever rendered there. */
"use strict";

const LightBudget = (function () {
  const MAX = 48;          // lit-shader uLight[] / SBO rows on GLX, WGX and desktop TLX
  const MOBILE = 24;       // phone per-fragment budget. 22 flashes the mirror on a 12 m street.
  const LITE = 16;         // TLX _liteGpu: vec3[48] x4 overruns the 224-row WebGL2 floor
  const CHUNK = 24;        // per-chunk lamp cap (LampChunks): each chunk binds its own set
  const MIRROR = 8;        // rear-view inset (mirror-pass): nearest lamps, then tail-lights
  const TAIL_RESERVE = 5;  // at most five car tail-lights are appended per frame
  let _slots = MAX;        // the bound backend's live slot count
  // EXTREME `lightsHi` (desktop TLX on WebGPU) lives in GfxHi (js/render/shared/gfx-hi.js, lazy): its HI_MAX
  // loop and HI_CHUNK cells. Without GfxHi the six numbers above are the whole budget.
  const _H = () => typeof GfxHi !== "undefined";

  // Called once by the backend that wins the canvas (GLX.init / WGX.create /
  // TLX.create). Never above MAX unless the caller compiled the HI loop (TLX,
  // through tlxSlots): the CPU scratch buffers are sized to what it compiled.
  function setSlots(n) {
    const v = n | 0;
    _slots = v > 0 ? Math.min(v, v > MAX && _H() && GfxHi.tlxSlots(1) === v ? v : MAX) : MAX;
    return _slots;
  }
  function slots() { return _slots; }
  // The slot count TLX compiles its lit loop with (GfxHi.tlxSlots), else MAX.
  function tlxSlots(webgpu) { return webgpu && _H() ? GfxHi.tlxSlots(webgpu) : MAX; }
  // Did the bound backend compile the HI loop? A boot-time fact: a shed never recompiles.
  function hiBuilt() { return _slots > MAX; }
  // The per-cell cap the TLX lamp grid is BAKED at (boot-time: a shed never re-bakes).
  function bakeChunk() { return hiBuilt() ? GfxHi.HI_CHUNK : CHUNK; }

  // Most slots (`per` uniform rows each) whose block, `atMax` rows at MAX, fits
  // the device's `lim`; MAX when it fits or reads 0, never under LITE (#5990).
  function fitSlots(lim, atMax, per) {
    lim |= 0;
    return lim <= 0 || lim >= atMax ? MAX : Math.max(LITE, Math.min(MAX, Math.floor((lim - atMax) / per) + MAX));
  }

  return { MAX, MOBILE, LITE, CHUNK, MIRROR, TAIL_RESERVE, setSlots, slots, fitSlots, tlxSlots, hiBuilt, bakeChunk };
})();
Object.freeze(LightBudget);
