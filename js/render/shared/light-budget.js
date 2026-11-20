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
  // EXTREME `lightsHi` (GfxQuality.feature; docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md): desktop TLX
  // on WebGPU only. The six numbers above stay the budget everywhere else. A backend goes past MAX only
  // when TLX compiled its lit loop at HI_MAX (tlxSlots), so GLX, WGX, phones and HIGH never see these.
  const HI_MAX = 128;      // global lit-loop slots: 4 vec4 arrays x 128 = 8 KB of a WebGPU uniform buffer
  const HI_CHUNK = 48;     // per-cell lamp list on the TLX lamp grid (a texture: no uniform floor)
  let _slots = MAX;        // the bound backend's live slot count

  // Called once by the backend that wins the canvas (GLX.init / WGX.create /
  // TLX.create). Never above MAX unless the caller compiled the HI loop (TLX,
  // through tlxSlots): the CPU scratch buffers are sized to what it compiled.
  function setSlots(n) {
    const v = n | 0;
    _slots = v > 0 ? Math.min(v, v === HI_MAX && hiBoot() ? HI_MAX : MAX) : MAX;
    return _slots;
  }
  function slots() { return _slots; }

  // lightsHi on? Asked through GfxQuality (call time, guarded) and cached for HI_POLL_MS: the governor
  // can shed it at runtime (GfxQuality.setShed), and the per-frame callers must not pay a localStorage
  // read each. Anything that throws answers false, which is today's budget.
  const HI_POLL_MS = 250;
  let _hi = false, _hiT = -1e9;
  function _now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
  function hiBoot() {
    try { return typeof GfxQuality !== "undefined" && GfxQuality.feature("lightsHi") === true; } catch (_) { return false; }
  }
  function hiOn() {
    const t = _now();
    if (t - _hiT >= HI_POLL_MS || t < _hiT) { _hi = hiBoot(); _hiT = t; }
    return _hi;
  }
  // The slot count TLX compiles its lit loop with. webgpu = three's WebGPU backend: a 128-entry uniform
  // array sits far inside its uniform-buffer limits. Three's WebGL2 path keeps MAX (its fragment-uniform
  // floor is what broke iOS at 48; tsl-lit.js header).
  function tlxSlots(webgpu) { return webgpu && hiBoot() ? HI_MAX : MAX; }
  // Did the bound backend compile the HI loop? A boot-time fact: a shed never recompiles.
  function hiBuilt() { return _slots > MAX; }
  // The frame-set ceiling now: the HI slots while they are compiled and lightsHi is live, else MAX.
  function frameMax() { return hiBuilt() && hiOn() ? _slots : MAX; }
  // The per-cell cap the TLX lamp grid is BAKED at. Boot-time, so a shed never re-bakes: the shader
  // trims the live list instead (frame.chunkLampCap, frame-lights.js).
  function bakeChunk() { return hiBuilt() ? HI_CHUNK : CHUNK; }
  // The live per-cell cap: HI_CHUNK at full HI, CHUNK when shed, a slide between for `hiFrac` 0..1.
  function chunkFor(hiFrac) {
    if (!hiBuilt()) return 0;   // 0 = "no override": the shader keeps its compiled cap, as today
    const f = hiFrac > 0 ? Math.min(1, hiFrac) : 0;
    return CHUNK + Math.round((HI_CHUNK - CHUNK) * f);
  }

  return { MAX, MOBILE, LITE, CHUNK, MIRROR, TAIL_RESERVE, HI_MAX, HI_CHUNK,
    setSlots, slots, hiOn, hiBoot, tlxSlots, hiBuilt, frameMax, bakeChunk, chunkFor,
    _hiReset() { _hiT = -1e9; } };
})();
Object.freeze(LightBudget);
