/* Apex 26 — LightBudget: the ONE source for point-light slot counts. Every
   number that used to be restated per backend lives here: the lit-shader slot
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
  const MOBILE = 24;       // phone per-fragment budget (frame-lights lampCap)
  const LITE = 16;         // TLX _liteGpu: vec3[48] x4 overruns the 224-row WebGL2 floor
  const CHUNK = 24;        // per-chunk lamp cap (LampChunks): each chunk binds its own set
  const TAIL_RESERVE = 5;  // at most five car tail-lights are appended per frame
  let _slots = MAX;        // the bound backend's live slot count

  // Called once by the backend that wins the canvas (GLX.init / WGX.create /
  // TLX.create). Never above MAX: the CPU scratch buffers are sized to it.
  function setSlots(n) {
    const v = n | 0;
    _slots = v > 0 ? Math.min(v, MAX) : MAX;
    return _slots;
  }
  function slots() { return _slots; }

  return { MAX, MOBILE, LITE, CHUNK, TAIL_RESERVE, setSlots, slots };
})();
Object.freeze(LightBudget);
