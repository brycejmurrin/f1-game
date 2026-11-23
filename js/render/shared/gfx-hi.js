/* Apex 26 — GfxHi: the desktop EXTREME / CINEMA render and perf extras (GfxQuality.detail() >= 2). LAZY_GFX_HI
 * (tools/manifest.cjs): RendererBoot.start fetches it beside the backend only on that tier, so a phone and ULTRA
 * and below never load it; every eager seam that reads it keeps the ULTRA path while it is absent.
 *
 * What lives here (each eager seam is a `typeof GfxHi` guard or a gate that only an EXTREME boot opens):
 *   lightsHi  the 128-slot lit loop and the 48-lamp cells (LightBudget.setSlots / tlxSlots / bakeChunk,
 *             FrameLights lampCap / tierShed / frame.chunkLampCap)
 *   hiKey     LampChunks' attenuation rank for a table baked above its CAP
 *   hd        Assets' 512 px material tier (packHd)
 *   shadow    ShadowPass's casters for the TLX far cascades (csm) and extra floodlight maps (lampShadows)
 * The governor's upper ladder stays in js/perf/governor.js: it sheds ULTRA's extras too. */
const GfxHi = (function () {
  "use strict";

  // ── lightsHi (GfxQuality.feature; docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md): desktop TLX on WebGPU only.
  // LightBudget's six numbers stay the budget everywhere else. A backend goes past MAX only when TLX compiled
  // its lit loop at HI_MAX (LightBudget.tlxSlots), so GLX, WGX, phones and HIGH never see these.
  const HI_MAX = 128;      // global lit-loop slots: 4 vec4 arrays x 128 = 8 KB of a WebGPU uniform buffer
  const HI_CHUNK = 48;     // per-cell lamp list on the TLX lamp grid (a texture: no uniform floor)
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
  function tlxSlots(webgpu) { return webgpu && hiBoot() ? HI_MAX : LightBudget.MAX; }
  // The frame-set ceiling now: the HI slots while they are compiled and lightsHi is live, else MAX.
  function frameMax() { return LightBudget.hiBuilt() && hiOn() ? LightBudget.slots() : LightBudget.MAX; }
  // The live per-cell cap: HI_CHUNK at full HI, CHUNK when shed, a slide between for `hiFrac` 0..1.
  function chunkFor(hiFrac) {
    if (!LightBudget.hiBuilt()) return 0;   // 0 = "no override": the shader keeps its compiled cap, as today
    const f = hiFrac > 0 ? Math.min(1, hiFrac) : 0;
    return LightBudget.CHUNK + Math.round((HI_CHUNK - LightBudget.CHUNK) * f);
  }
  // FrameLights (only while LightBudget.hiBuilt()): the slots above MAX this frame may use, through the
  // governor's SLID limit (tierShed, whose tier-0 target is frameMax()), so a shed eases 128 -> 48 instead of popping.
  function hiExtra(tierShed) {
    return Math.max(0, tierShed(typeof PerfGov === "undefined" ? frameMax() : LightBudget.slots()) - LightBudget.MAX);
  }
  // FrameLights' per-cell cap for the TLX lamp grid (frame.chunkLampCap): follows the same slide as the
  // frame set, 48 at the full HI limit down to 24 at MAX and below. lim() ticks the slide and returns it.
  function chunkCap(lim) {
    const span = LightBudget.slots() - LightBudget.MAX;
    if (typeof PerfGov === "undefined") return chunkFor(hiOn() ? 1 : 0);
    const l = lim();
    return chunkFor(span > 0 ? (l - LightBudget.MAX) / span : 0);
  }

  // ── LampChunks: THE HI ORDER (only for a table baked above CAP: lightsHi). Today's bake keeps the NEAREST lamps.
  // With 48 slots a cell also holds lamps near the edge of their reach, and a big floodlight 30 m off
  // outshines a small kerb lamp 10 m off, so the HI bake ranks by the lit shader's own geometric
  // attenuation at the box's nearest point instead: win^2 / (max(d, NEAR)^2 + 1), win = 1 - (d/rad)^4
  // (tsl-lit.js lamp loop, LAMP NEAR CLAMP def 4 m). The key is its reciprocal, so "smaller is better"
  // and the heap is shared. Colour is not in it: the bake runs once per track, often before the
  // lamps have warmed up, so the lanes it reads are the four the cache key snapshots (x, y, z, radius).
  const NEAR2 = 16;
  function hiKey(d2, rad) {
    const q = d2 / (rad * rad), win = 1 - q * q;
    if (!(win > 0)) return Infinity;
    return ((d2 > NEAR2 ? d2 : NEAR2) + 1) / (win * win);
  }

  // ── Assets: packHd (EXTREME, desktop TLX): materials.hd (512 px), fetched only then, never precached.
  function hd(gfx) {
    if (!gfx || gfx.backend !== "three" || gfx.isMobile || gfx.mobileTier) return false;
    try { return typeof GfxQuality !== "undefined" && !!GfxQuality.feature("packHd"); } catch (_) { return false; }
  }

  // ── ShadowPass: the EXTREME extras (TLX gfx.shadowX, null on every other path). The backend plans the far sun
  // cascades and the extra floodlight maps (tlx-shadow.js csmPlanner / lampXDriver); this side only casts into them.
  // Far cascades take terrain, road and the chunked props; only the mid one (i 0) the instanced batches. Their car
  // layer and the extra lamps read the pooled caster field through fld (tlx-shadow.js fieldCars; castR(j, null) = the
  // silhouette, castR(j, far) = the shared low-poly rival body). p: ShadowPass's pooled state and casters
  // (mats / cars / ok / teams / ctr / reach are its live arrays; n() its caster count).
  function shadow(G, deps, p) {
    const LT = LightTune.LT, I = p.I;
    const fld = { n: 0, eye: null, player: null, mats: p.mats, cars: p.cars, ok: p.ok, pm: p.pm, castP: p.castP,
      castR(j, far) { const b = far !== null && deps.sharedRivalBody && deps.sharedRivalBody(far); G.gfx.castShadow(b || deps.teamMesh(p.teams[j], p.cars[j], true), p.mats[j]); } };
    const csmIn = { sd: null, ctr: p.ctr, box: 80, far: 0, propTop: null, frameNo: 0, sunRebuilt: false, read: false,
      live: false, carsOk: false, f: fld,
      cast(i) {
        p.rib(G.track.terrainGeo, "terrainChunked", G.track.meshes.terrain);
        p.rib(G.track.roadGeo, "roadChunked", G.track.meshes.road, G.gfx.chunkedTrackCoords !== false);
        G.gfx.castShadowChunked(G.track.meshes.props, I);
        if (i === 0) p.pb();
      } };
    // Each extra lamp map holds what the one-lamp map holds: the cars within reach + the props.
    const lxIn = { L: null, nRec: 0, tailFrom: 0, lum: null, eye: null, primary: -1, frameNo: 0, live: false, f: fld,
      castProps(reach) {
        for (let j = 0; j < 4; j++) p.reach[j] = reach[j];
        G.gfx.castShadowChunked(G.track.meshes.props, I, p.reach);
        p.pb(p.reach);
      } };
    function fldNow() { fld.n = p.n(); fld.eye = G.camEye; fld.player = G.player; }
    return {
      // loadTrack: the cascades and extra lamp maps hold the previous track too
      reset() { const x = G.gfx && G.gfx.shadowX; if (x && typeof x.reset === "function") x.reset(); },
      // sunPass, after the static sun map: built = this frame rebuilt it, read = the sun / moon map is read at all
      csm(sd, box, far, built, read, frameNo, livePlayer) {
        const x = G.gfx.shadowX;
        if (!x || x.csmOn !== true) return;
        csmIn.sd = sd; csmIn.box = box; csmIn.far = far; csmIn.propTop = G.track.propTop;
        csmIn.frameNo = frameNo; csmIn.sunRebuilt = built; csmIn.read = read;
        // the far car layer: the car map's gates (closed = no casters, so the layer refreshes empty)
        csmIn.carsOk = !!(LT.carShadow && !(LT.shadowStr <= 0) && PerfGov.tier() < 3 && G.player && G.state !== "menu");
        csmIn.live = csmIn.carsOk && livePlayer; fldNow();
        x.csmPass(csmIn);
      },
      // lampPass, after the one-lamp map
      lamp(L, nRec, tailFrom, lum, primary, frameNo, livePlayer) {
        const x = G.gfx.shadowX;
        if (!x || x.lampOn !== true) return;
        lxIn.L = L; lxIn.nRec = nRec; lxIn.tailFrom = tailFrom; lxIn.lum = lum; lxIn.eye = G.camEye;
        lxIn.primary = primary; lxIn.frameNo = frameNo; lxIn.live = livePlayer; fldNow();
        x.lampPass(lxIn);
      },
    };
  }

  return { HI_MAX, HI_CHUNK, hiBoot, hiOn, tlxSlots, frameMax, chunkFor, hiExtra, chunkCap, hiKey, hd, shadow,
    _hiReset() { _hiT = -1e9; } };
})();
if (typeof window !== "undefined") window.GfxHi = GfxHi;
