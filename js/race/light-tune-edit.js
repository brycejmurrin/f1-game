const LightTuneEdit = (function () {
  "use strict";

  function set(id, v, ctx) {
    const { LT, ltStore, gfx } = ctx;
    if ((id === "perChunkLights" || id === "roadChunkLamps") && +v > 0 && !(+LT[id] > 0) && ctx.perChunkOff) {
      ctx.perChunkOff = false;
      try { localStorage.removeItem("apex26.perChunkOff"); } catch (_) {  }
    }
    if (id === "carEnvCube" && +v > 0 && !(+LT[id] > 0) && ctx.envProbeOff) {
      ctx.envProbeOff = false;
      try { localStorage.removeItem("apex26.envProbeOff"); } catch (_) {  }
    }
    const r = ltStore.set(id, v);
    try { if (gfx && gfx.invalidateSoftPresent) gfx.invalidateSoftPresent(); } catch (_) {  }
    return r;
  }

  return { set };
})();
Object.freeze(LightTuneEdit);
