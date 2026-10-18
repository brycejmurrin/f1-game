/* Apex 26 — LightTuneEdit: the lighting-tuner write path (latch clear + store).
   Moved out of game.js. The per-chunk and env-probe latches stay in game.js;
   this function clears them on the rising edge the tuner panel documents. */
const LightTuneEdit = (function () {
  "use strict";

  function set(id, v, ctx) {
    const { LT, ltStore, gfx } = ctx;
    // A deliberate re-enable of PER-CHUNK LAMPS clears the crash latch. It is set
    // on a real context loss (js/render/glx/glx.js) and persisted so a reboot into the
    // same config cannot crash-loop — but nothing else cleared it, so one transient
    // display reset disabled the feature forever and the slider silently did
    // nothing. Here at the EDIT (not in the render loop, which only runs the
    // per-chunk path at night) a RISING EDGE from 0 to a positive value is the
    // player choosing to switch it back on — informed, one gesture at a time — so
    // it is the honest reset. The tier gate still protects a governed device.
    // EITHER chunk knob, because js/lighting/tuner-panel.js gateNote() shows the "set to 0
    // and back on to retry" note on BOTH (its isChunk covers roadChunkLamps too).
    // Keyed on perChunkLights alone, a player who read that note on PER-CHUNK
    // ROAD and did exactly what it said cleared nothing, and the slider stayed
    // silently dead — the instruction only worked on the OTHER control.
    if ((id === "perChunkLights" || id === "roadChunkLamps") && +v > 0 && !(+LT[id] > 0) && ctx.perChunkOff) {
      ctx.perChunkOff = false;
      try { localStorage.removeItem("apex26.perChunkOff"); } catch (_) { /* no storage: the in-memory clear stands for this session */ }
    }
    // Same reset, same gesture, for the env-probe latch. All three backends write
    // apex26.envProbeOff on a VISIBLE context/device loss, and until this line the
    // only thing that cleared it was RESET RENDERER — which also throws away the
    // player's renderer pick. One transient glitch therefore removed live car
    // reflections on every future boot, on every backend, with no indication and
    // no proportionate way back. ENV REFLECTION 0 -> >0 is that way back.
    if (id === "carEnvCube" && +v > 0 && !(+LT[id] > 0) && ctx.envProbeOff) {
      ctx.envProbeOff = false;
      try { localStorage.removeItem("apex26.envProbeOff"); } catch (_) { /* same: the in-memory clear stands */ }
    }
    const r = ltStore.set(id, v);
    try { if (gfx && gfx.invalidateSoftPresent) gfx.invalidateSoftPresent(); } catch (_) { /* pre-boot */ }
    return r;
  }

  return { set };
})();
Object.freeze(LightTuneEdit);
