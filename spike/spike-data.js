/* Apex 26 — graphics-library spike: data seam.
 *
 * Loads BEFORE the js/track engine scripts (see three-spike.html) and stubs the
 * GLX global the same way tools/verify-track.cjs does, so Tracks.build() hands
 * back the raw {pos,nrm,col,idx,mat} geometry buffers instead of GPU handles.
 * Nothing under js/ is modified — this file is the only bridge between the real
 * game pipeline and the spike renderer.
 *
 * SpikeData.build(trackId) -> {
 *   track,                       // full Tracks.build output (raw geo in track.meshes.*)
 *   geos: {name: rawBuf, ...},   // the raw buffers keyed by mesh name
 *   car,                         // Car3D.build() raw buffer
 *   carGrid: [{x,y,z,heading}],  // 22 grid slots behind the start line
 *   start: {pos, fwd},           // start-line camera anchor
 * }
 * SpikeData.frameLights(out, eye, fwd) -> flat stride-15 light array culled to
 *   32 nearest lamps (the REAL per-frame cull incl. flicker), or null.
 */
"use strict";

/* GLX stub — must exist before js/track/*.js and js/game/lighting.js evaluate.
 * Mirrors tools/verify-track.cjs buildContext(): createMesh passes the raw
 * buffer through; createChunkedMesh keeps the buffer too (the spike does no
 * chunking — one BufferGeometry per track mesh). */
window.GLX = {
  isMobile: false,
  mobileTier: false,
  createMesh: function (buf) { return { raw: buf, chunked: false }; },
  createChunkedMesh: function (buf, cellSize) { return { raw: buf, chunked: true, cellSize: cellSize }; },
};

const SpikeData = (function () {

  // LT ships empty — game.js normally resolves profiles into it. The TUNE_DEFS
  // defaults ARE the shipped tuning, so fill from them (same as a fresh profile).
  function fillLT() {
    const { TUNE_DEFS, LT } = LightTune;
    for (const d of TUNE_DEFS) if (!(d.id in LT)) LT[d.id] = d.def;
    LT.lampWarmup = 0;   // steady state: skip the strike-to-full warmup ramp
  }

  const _frame = {};     // scratch frame for setFrameLights
  let _track = null;

  function build(trackId) {
    fillLT();
    const def = Tracks.LIST.find((d) => d.id === trackId) || Tracks.LIST[0];
    const track = Tracks.build(def, { night: true });
    track._lights = LightTune.buildTrackLights(track);   // bake per-track lamp records
    _track = track;

    const geos = {};
    for (const name of Object.keys(track.meshes)) {
      const m = track.meshes[name];
      if (m && m.raw && m.raw.pos && m.raw.pos.length) geos[name] = m.raw;
    }

    const car = Car3D.build([0.75, 0.06, 0.10], [0.95, 0.93, 0.90], {});

    // 2×11 grid behind the start line (car noses point along the tangent, +Z model axis)
    const n = track.n, ds = track.total / n;
    const carGrid = [];
    for (let i = 0; i < 22; i++) {
      const row = Math.floor(i / 2), lane = (i % 2 === 0 ? 1 : -1);
      const sBack = 14 + row * 9;                    // metres behind the line
      const k = (n - Math.max(1, Math.round(sBack / ds))) % n;
      const off = lane * track.hw[k] * 0.42;
      carGrid.push({
        x: track.px[k] + track.rx[k] * off,
        y: track.py[k] + 0.02,
        z: track.pz[k] + track.rz[k] * off,
        heading: Math.atan2(track.tx[k], track.tz[k]),
      });
    }

    return {
      track, geos, car, carGrid,
      start: { pos: [track.px[0], track.py[0], track.pz[0]],
               fwd: [track.tx[0], track.ty[0], track.tz[0]] },
    };
  }

  /* Per-frame lamp cull around the eye — the REAL game path (nearest-32 heap,
   * ahead bias, per-lamp flicker). Returns the flat stride-15 array or null. */
  function frameLights(eye, fwd) {
    if (!_track) return null;
    LightTune.setFrameLights(_frame, _track, [], eye, 1, fwd || [0, 0, 0], false);
    return _frame.lights || null;
  }

  return { build, frameLights };
})();
window.SpikeData = SpikeData;
