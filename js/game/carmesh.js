/* Apex 26 — car mesh/decal/cockpit-instrument geometry builders for js/game.js:
   the shared decal-quad meshes (logo/sponsor UVs into the LiveryTex atlas),
   the effect quads (brake-glow ring, rain light, exhaust/boost flames, ERS
   strip) and the first-person cockpit rig instruments (wheel, LED strip,
   gear/speed digits, ERS/pedal bars, OT lamp). Pure geometry + per-mesh
   memo caches; the only dependency is the renderer handle, injected once at
   boot via CarMesh.init(gfx) (gfx = GLX or the WebGPU backend). State-
   coupled car drawing (liveries, teamMesh, drawCockpitRig) stays in game.js.
   Must load BEFORE js/game.js (see index.html). */
const CarMesh = (function () {
  "use strict";

let _gfx = null;            // renderer handle, set once by init()
function init(gfx) { _gfx = gfx; }

// ---------- Car decals (team logo + sponsor textures on the bodywork) ----------
// ONE shared decal-quad mesh (fixed panel UVs into the LiveryTex atlas layout);
// the per-team atlas TEXTURE carries the actual logos/sponsors, so the geometry
// is team-independent. Drawn over the painted body each frame (gfx.drawDecal).
const _carDecalMeshes = {};
const _carDecalOrder = [];
const CAR_DECAL_CACHE_MAX = 24;
function carDecalData(aLvl, parts, legacyBody, teamId) {
  const R = LiveryTex.REGIONS, S = LiveryTex.SIZE;
  const out = { pos: [], nrm: [], uv: [], idx: [] };
  // Imported GLBs are static and do not consume the procedural parts recipe.
  // Resolve their overlays against the default body once, regardless of setup.
  // teamId threads the per-team chassis style into the anchors so decals stay
  // glued to a styled (longer/slimmer/drooped) nose and inlet.
  const anchorParts = legacyBody ? null : parts;
  const anchors = Car3D.bodyAnchors ? Car3D.bodyAnchors(anchorParts, legacyBody ? null : teamId) : null;
  // Map a canvas-pixel region → UV rect (v flipped: createTexture uploads FLIP_Y).
  const uvOf = (r) => ({ uL: r.x / S, uR: (r.x + r.w) / S, vT: 1 - r.y / S, vB: 1 - (r.y + r.h) / S });
  // corners in [BL, BR, TR, TL] order (upright as seen from outside) → the region.
  // NOTE: the in-race car model matrix is a REFLECTION (det −1: tmpU = tmpR×tmpF,
  // so [r,u,f] is left-handed — the symmetric body hides it, asymmetric decal text
  // does not). U is pre-flipped here (uR↔uL) so the reflection un-mirrors the text
  // back to readable. The setup-preview car is drawn with a matching x-reflection.
  const quad = (c, n, region) => {
    const u = uvOf(region), i = out.pos.length / 3;
    const uvs = [[u.uR, u.vB], [u.uL, u.vB], [u.uL, u.vT], [u.uR, u.vT]];
    for (let k = 0; k < 4; k++) { out.pos.push(c[k][0], c[k][1], c[k][2]); out.nrm.push(n[0], n[1], n[2]); out.uv.push(uvs[k][0], uvs[k][1]); }
    out.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const quadUv = (c, n, uvs) => {
    const i = out.pos.length / 3;
    for (let k = 0; k < 4; k++) {
      out.pos.push(c[k][0], c[k][1], c[k][2]);
      out.nrm.push(n[0], n[1], n[2]);
      out.uv.push(uvs[k][0], uvs[k][1]);
    }
    out.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  // Sidepod flanks → primary sponsor. Right side reads front→back; left mirrors so
  // the wordmark is upright on both flanks. zF=front(+Z), zR=rear(−Z).
  const zF = 0.46, zR = -0.34;
  const pY = (p, f) => p.bottom + (p.top - p.bottom) * f;
  const podAt = (z) => anchors ? anchors.podAt(z) :
    { x: 0.707, bottom: 0.12 + 0.025 * (z - zR) / (zF - zR),
      top: 0.41 + 0.07 * (z - zR) / (zF - zR) };
  const podStops = (front, rear) => {
    const internal = anchors && anchors.podStations ?
      anchors.podStations.map((p) => p.z) : [0.22, -0.62];
    return [front, ...internal.filter((z) => z < front && z > rear), rear]
      .sort((a, b) => b - a);
  };
  const podDecal = (region, yBottom, yTop, proud) => {
    const u = uvOf(region), stops = podStops(zF, zR);
    for (let i = 0; i < stops.length - 1; i++) {
      const aZ = stops[i], bZ = stops[i + 1], a = podAt(aZ), b = podAt(bZ);
      const ta = (zF - aZ) / (zF - zR), tb = (zF - bZ) / (zF - zR);
      const rU = (t) => u.uR + (u.uL - u.uR) * t;
      const lU = (t) => u.uL + (u.uR - u.uL) * t;
      quadUv([[a.x+proud, pY(a,yBottom), aZ], [b.x+proud, pY(b,yBottom), bZ],
              [b.x+proud, pY(b,yTop), bZ], [a.x+proud, pY(a,yTop), aZ]], [1, 0, 0],
             [[rU(ta),u.vB], [rU(tb),u.vB], [rU(tb),u.vT], [rU(ta),u.vT]]);
      quadUv([[-b.x-proud, pY(b,yBottom), bZ], [-a.x-proud, pY(a,yBottom), aZ],
              [-a.x-proud, pY(a,yTop), aZ], [-b.x-proud, pY(b,yTop), bZ]], [-1, 0, 0],
             [[lU(tb),u.vB], [lU(ta),u.vB], [lU(ta),u.vT], [lU(tb),u.vT]]);
    }
  };
  podDecal(R.titleA, 0.24, 0.84, 0.018);
  // Engine-cover top → team crest + tail livery graphic (reads from the chase
  // cam; top = toward the tail).
  const cf = anchors ? anchors.coverAt(-0.62) : { x: 0.27, top: 0.81 };
  const cr = anchors ? anchors.coverAt(-1.28) : { x: 0.20, top: 0.69 };
  quad([[-cf.x*0.72, cf.top+0.008, -0.62], [cf.x*0.72, cf.top+0.008, -0.62],
        [cr.x*0.72, cr.top+0.008, -1.28], [-cr.x*0.72, cr.top+0.008, -1.28]], [0, 1, 0.06], R.crest);
  // Shark-fin flanks → the SAME tail graphic (the big vertical rear canvas — the
  // "tail wrap" à la a real F1 shark fin). Fin is ~0.03 wide on x=0; sit the decal
  // just proud of each face. Front→back reading, mirrored per side.
  const fX = 0.023, fyB = 0.655, fyT = 0.945, fzF = -0.82, fzR = -1.56;
  quad([[fX, fyB, fzF], [fX, fyB, fzR], [fX, fyT, fzR], [fX, fyT, fzF]], [1, 0, 0], R.fin);
  quad([[-fX, fyB, fzR], [-fX, fyB, fzF], [-fX, fyT, fzF], [-fX, fyT, fzR]], [-1, 0, 0], R.fin);
  // Nose-top plate → big driver NUMBER (top of the digit toward the nose tip).
  // The nose block is IDENTICAL in the chase and cockpit builds, so this reads
  // upright from chase, hood AND cockpit cameras (all look forward over the nose).
  const nR = anchors ? anchors.noseAt(1.72) : { top: 0.45, topSide: 0.16 };
  const nF = anchors ? anchors.noseAt(2.10) : { top: 0.43, topSide: 0.14 };
  quad([[-nR.topSide*0.84, nR.top+0.020, 1.72], [nR.topSide*0.84, nR.top+0.020, 1.72],
        [nF.topSide*0.84, nF.top+0.020, 2.10], [-nF.topSide*0.84, nF.top+0.020, 2.10]], [0, 1, 0.05], R.num);
  // Nose-rear deck (behind the number) → secondary sponsor. The nose crown SLOPES
  // UP toward the bulkhead, so the decal quad follows that slope (rear corners
  // higher than front) — a flat horizontal quad floated/tilted off the surface
  // and read "detached". Corner heights track the crown so it lies painted-on.
  const nsR = anchors ? anchors.noseAt(1.16) : { top: 0.54, topSide: 0.15 };
  const nsF = anchors ? anchors.noseAt(1.66) : { top: 0.48, topSide: 0.14 };
  quad([[-nsR.topSide*0.82, nsR.top+0.014, 1.16], [nsR.topSide*0.82, nsR.top+0.014, 1.16],
        [nsF.topSide*0.82, nsF.top+0.014, 1.66], [-nsF.topSide*0.82, nsF.top+0.014, 1.66]], [0, 1, 0.10], R.titleB);
  // Sidepod lower flank → long sponsor strip.
  podDecal(R.strip, 0.08, 0.30, 0.020);
  // Rear-wing endplate number boards → the driver number again (classic F1 — the
  // number reads on the nose AND the rear-wing endplates). The board height/pos
  // TRACKS the wing: Car3D.numberBoard(aLvl) is the SAME function the car mesh
  // uses to place the physical board, so the digit lands on it at every downforce
  // level (mesh is cached per aLvl — see getCarDecalMesh).
  // Defensive: fall back to the old fixed board if a stale car3d.js bundle lacks
  // numberBoard (never white-screen the race over a decal position).
  // Rear-wing UPPER FLAP → the sponsor band. REGIONS.wing was drawn into every
  // atlas and mapped onto nothing at all, so a whole sponsor wordmark was dead
  // pixels. The flap is a sloped surface, so the quad slopes with it: Car3D
  // builds it from (z -2.38, upperTrailY - 0.075) to (z -2.64, upperTrailY),
  // where upperTrailY drops by 0.075 for max-DF and DRS packages alike — read the
  // aero recipe rather than assuming, or the band floats above the wing.
  if (Car3D.endplate) {
    const lvl = aLvl == null ? 2 : aLvl;
    const aeroV = parts && parts._visual && parts._visual.aero;
    const drs = aeroV && aeroV.drs ? 1 : 0;
    const crownY = Car3D.endplate(lvl).rear.top - 0.018;
    const upperTrailY = crownY - (lvl >= 4 || drs ? 0.075 : 0);
    const flapY = (z) => upperTrailY - 0.075 * (z + 2.64) / 0.26 + 0.0235;
    const wzF = -2.42, wzR = -2.60, wX = 0.44;
    quad([[-wX, flapY(wzF), wzF], [wX, flapY(wzF), wzF],
          [wX, flapY(wzR), wzR], [-wX, flapY(wzR), wzR]], [0, 1, 0.28], R.wing);
  }
  const nb = (Car3D.numberBoard ? Car3D.numberBoard(aLvl == null ? 2 : aLvl) : { cy: 0.62, h: 0.20 });
  const ex = 0.539, eyB = nb.cy - nb.h * 0.5 + 0.01, eyT = nb.cy + nb.h * 0.5 - 0.01, ezF = -2.30, ezR = -2.52;
  quad([[ex, eyB, ezF], [ex, eyB, ezR], [ex, eyT, ezR], [ex, eyT, ezF]], [1, 0, 0], R.num);
  quad([[-ex, eyB, ezR], [-ex, eyB, ezF], [-ex, eyT, ezF], [-ex, eyT, ezR]], [-1, 0, 0], R.num);
  return out;
}
function getCarDecalMesh(aLvl, parts, legacyBody, teamId) {
  if (typeof LiveryTex === "undefined" || !_gfx.createTexMesh) return null;
  const anchorParts = legacyBody ? null : parts;
  const anchors = Car3D.bodyAnchors ? Car3D.bodyAnchors(anchorParts, legacyBody ? null : teamId) : { key: "legacy" };
  const level = aLvl == null ? 2 : Number(aLvl);
  // anchors.key already folds in the team style, so styled and default noses
  // cache as distinct decal meshes.
  const k = level + "|" + (legacyBody ? "imported|" : "") + anchors.key;
  if (!_carDecalMeshes[k]) {
    _carDecalMeshes[k] = _gfx.createTexMesh(carDecalData(level, parts, legacyBody, teamId));
    _carDecalOrder.push(k);
    while (_carDecalOrder.length > CAR_DECAL_CACHE_MAX) {
      const old = _carDecalOrder.shift(), mesh = _carDecalMeshes[old];
      if (mesh && _gfx.freeMesh) _gfx.freeMesh(mesh);
      delete _carDecalMeshes[old];
    }
  }
  return _carDecalMeshes[k];
}
// Cockpit view draws only the FORWARD decals (the nose number), since the
// engine-cover / sidepod / hood decals sit behind or beside the driver and the
// ckpt body omits those surfaces. The nose is identical in both builds, so the
// number lands exactly on the nose plate ahead of the driver.
let _cockpitDecalMesh = null, _cockpitDecalKey = "";
function getCockpitDecalMesh(parts, teamId) {
  if (typeof LiveryTex === "undefined" || !_gfx.createTexMesh) return null;
  // Player-only, so a single-slot cache suffices — but keyed by team + anchors
  // now that the nose profile is per-team (switching teams re-anchors the number).
  const anchorsForKey = Car3D.bodyAnchors ? Car3D.bodyAnchors(parts, teamId) : null;
  const wantKey = (teamId || "") + "|" + (anchorsForKey ? anchorsForKey.key : "legacy");
  if (_cockpitDecalMesh && _cockpitDecalKey !== wantKey) {
    if (_gfx.freeMesh) _gfx.freeMesh(_cockpitDecalMesh);
    _cockpitDecalMesh = null;
  }
  if (!_cockpitDecalMesh) {
    _cockpitDecalKey = wantKey;
    const R = LiveryTex.REGIONS, S = LiveryTex.SIZE;
    const u = { uL: R.num.x / S, uR: (R.num.x + R.num.w) / S, vT: 1 - R.num.y / S, vB: 1 - (R.num.y + R.num.h) / S };
    // The ckpt hood is now a LOW cowl that stops behind the nose deck, so the
    // nose number is visible out ahead of the driver — use the same nose-plate
    // placement as the chase build (nose geometry is identical in both builds).
    const anchors = anchorsForKey;
    const nr = anchors ? anchors.noseAt(1.72) : { top: 0.45, topSide: 0.16 };
    const nf = anchors ? anchors.noseAt(2.10) : { top: 0.43, topSide: 0.14 };
    const c = [[-nr.topSide*0.84, nr.top+0.020, 1.72], [nr.topSide*0.84, nr.top+0.020, 1.72],
               [nf.topSide*0.84, nf.top+0.020, 2.10], [-nf.topSide*0.84, nf.top+0.020, 2.10]];
    // U pre-flipped to compensate the det −1 car model matrix (see quad() above).
    const uvs = [[u.uR, u.vB], [u.uL, u.vB], [u.uL, u.vT], [u.uR, u.vT]];
    const d = { pos: [], nrm: [], uv: [], idx: [] };
    for (let k = 0; k < 4; k++) { d.pos.push(c[k][0], c[k][1], c[k][2]); d.nrm.push(0, 1, 0.05); d.uv.push(uvs[k][0], uvs[k][1]); }
    d.idx.push(0, 1, 2, 0, 2, 3);
    _cockpitDecalMesh = _gfx.createTexMesh(d);
  }
  return _cockpitDecalMesh;
}

// Brake-glow ring: a flat emissive annulus (axle-aligned, both windings so it
// reads from either side) drawn just proud of each wheel face while the discs
// are hot — the classic F1 glowing-brake cue. Shared by all four wheels.
let brakeRingMesh = null;
function getBrakeRing() {
  if (brakeRingMesh) return brakeRingMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const SEG = 18, R0 = 0.045, R1 = 0.160, HOT = [1.6, 0.50, 0.12];
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const base = out.pos.length / 3;
    out.pos.push(0, R0 * c0, R0 * s0,  0, R1 * c0, R1 * s0,
                 0, R1 * c1, R1 * s1,  0, R0 * c1, R0 * s1);
    for (let v = 0; v < 4; v++) { out.nrm.push(1, 0, 0); out.col.push(HOT[0], HOT[1], HOT[2]); }
    out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3,
                 base, base + 2, base + 1, base, base + 3, base + 2);
  }
  brakeRingMesh = _gfx.createMesh(out);
  return brakeRingMesh;
}

// Rain-light strobe overlay: a small rear-facing HDR-red quad drawn over the
// baked LED panel while the road is wet, blinking like the real FIA ~4 Hz
// strobe. Shared by all cars (one draw per car per frame during the on-phase).
let rainLightMesh = null;
function getRainLight() {
  if (rainLightMesh) return rainLightMesh;
  const R = [2.4, 0.10, 0.08], out = { pos: [], nrm: [], col: [], idx: [] };
  const w = 0.055, h = 0.07;
  out.pos.push(-w, -h, 0,  w, -h, 0,  w, h, 0,  -w, h, 0);
  for (let i = 0; i < 4; i++) { out.nrm.push(0, 0, -1); out.col.push(R[0], R[1], R[2]); }
  out.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);   // both windings — reads from either side
  rainLightMesh = _gfx.createMesh(out);
  return rainLightMesh;
}
// Exhaust flame: a tiny HDR quad behind the tailpipe, flickering while the
// player is on throttle after dark — an arcade heat-glow cue.
// Flame tint comes from the resolved Parts fuel recipe; this module only owns
// the generic effect geometry and caches meshes by colour.
const _exhaustMeshes = {};
function getExhaustFlame(color) {
  const R = Array.isArray(color) ? color : [2.6, 1.05, 0.25];
  const key = R.join(",");
  if (_exhaustMeshes[key]) return _exhaustMeshes[key];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const w = 0.035, h = 0.030;
  out.pos.push(-w, -h, 0,  w, -h, 0,  w, h, 0,  -w, h, 0);
  for (let i = 0; i < 4; i++) { out.nrm.push(0, 0, -1); out.col.push(R[0], R[1], R[2]); }
  out.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);   // both windings — reads from either side
  return (_exhaustMeshes[key] = _gfx.createMesh(out));
}
// Boost flame: a larger blue-white plasma quad behind the tailpipe while ERS
// boost is deploying — visible at every time of day.
let boostMesh = null;
function getBoostFlame() {
  if (boostMesh) return boostMesh;
  const R = [0.65, 1.7, 3.0], out = { pos: [], nrm: [], col: [], idx: [] };
  const w = 0.070, h = 0.055;
  out.pos.push(-w, -h, 0,  w, -h, 0,  w, h, 0,  -w, h, 0);
  for (let i = 0; i < 4; i++) { out.nrm.push(0, 0, -1); out.col.push(R[0], R[1], R[2]); }
  out.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);   // both windings — reads from either side
  boostMesh = _gfx.createMesh(out);
  return boostMesh;
}
// ERS indicator: a thin cyan strip on the rear crash structure above the rain
// light — dim when boost is ARMED, bright strobing while DEPLOYING (the field
// reads your energy state the way real ERS boards do).
let ersMesh = null;
function getErsLight() {
  if (ersMesh) return ersMesh;
  const R = [0.25, 2.2, 2.0], out = { pos: [], nrm: [], col: [], idx: [] };
  const w = 0.075, h = 0.014;
  out.pos.push(-w, -h, 0,  w, -h, 0,  w, h, 0,  -w, h, 0);
  for (let i = 0; i < 4; i++) { out.nrm.push(0, 0, -1); out.col.push(R[0], R[1], R[2]); }
  out.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);   // both windings — reads from either side
  ersMesh = _gfx.createMesh(out);
  return ersMesh;
}

// ── First-person cockpit rig (COCKPIT cam viewmodel) ─────────────────────────
// The car body is hidden in cockpit view and has no modelled interior, so the
// driver's-eye view draws the real car body (minus the helmet + halo) plus a steering
// wheel drawn separately so it can roll with the smoothed steering input.
// Everything is metres in car-local coords (+z nose, +y up; driver eye sits
// at roughly (0, 0.98, -0.05) — see the cockpit camVantage).
function _rigBox(out, cx, cy, cz, sx, sy, sz, col) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const F = [
    [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]],
    [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1]],
    [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0]],
    [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0]],
    [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0]],
    [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0]],
  ];
  for (const f of F) {
    const b = out.pos.length / 3, n = f[4];
    for (let i = 0; i < 4; i++) { const v = f[i]; out.pos.push(v[0], v[1], v[2]); out.nrm.push(n[0], n[1], n[2]); out.col.push(col[0], col[1], col[2]); }
    out.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
}
let cockpitWheelMesh = null;
function getCockpitWheel() {
  if (cockpitWheelMesh) return cockpitWheelMesh;
  // A real modern F1 wheel carrying ALL the telemetry (that's where it lives on
  // the real car): shift-light LED row across the top, central LCD with the
  // gear/speed/pedal/energy readouts drawn live over it, button clusters,
  // rotary knobs, shift paddles. Built centred on the hub (origin), wheel
  // plane in XY facing the driver (-z side); rolled about Z by the draw call.
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const CARB = [0.04, 0.04, 0.05], RUB = [0.085, 0.085, 0.095], KNOB = [0.75, 0.72, 0.15];
  _rigBox(out, -0.165, 0.0, 0, 0.05, 0.20, 0.062, RUB);        // hand grips
  _rigBox(out,  0.165, 0.0, 0, 0.05, 0.20, 0.062, RUB);
  _rigBox(out, -0.118, 0.112, 0, 0.06, 0.045, 0.05, CARB);     // upper corners
  _rigBox(out,  0.118, 0.112, 0, 0.06, 0.045, 0.05, CARB);
  _rigBox(out, 0, 0.128, 0, 0.18, 0.038, 0.05, CARB);          // top bar
  _rigBox(out, -0.122, -0.118, 0, 0.055, 0.045, 0.05, CARB);   // lower corners
  _rigBox(out,  0.122, -0.118, 0, 0.055, 0.045, 0.05, CARB);
  _rigBox(out, 0, -0.138, 0, 0.17, 0.038, 0.05, CARB);         // bottom bar
  _rigBox(out, 0, 0.0, 0.014, 0.215, 0.16, 0.042, CARB);       // fascia plate
  _rigBox(out, 0, 0.024, -0.016, 0.125, 0.080, 0.02, [0.025, 0.025, 0.035]);  // display bezel
  _rigBox(out, 0, 0.024, -0.028, 0.112, 0.068, 0.006, [0.012, 0.018, 0.028]); // LCD
  _rigBox(out, 0.048, 0.024, -0.0295, 0.012, 0.050, 0.003, [0.03, 0.035, 0.04]); // energy slot (vertical, centred)
  // Aligned display cells on one line: speed (navy) | gear (DARK RED box)
  _rigBox(out, -0.034, 0.022, -0.0292, 0.052, 0.040, 0.003, [0.10, 0.11, 0.13]); // speed cell frame
  _rigBox(out, -0.034, 0.022, -0.0296, 0.047, 0.035, 0.003, [0.010, 0.016, 0.026]); // speed cell face
  _rigBox(out, 0.014, 0.022, -0.0292, 0.034, 0.044, 0.003, [0.38, 0.07, 0.06]);  // gear cell frame (red)
  _rigBox(out, 0.014, 0.022, -0.0296, 0.029, 0.039, 0.003, [0.16, 0.025, 0.03]); // gear cell face (dark red)
  // Button clusters flanking the screen (bright HDR; glow slightly at night).
  const BTN = [[1.5, 0.15, 0.10], [0.15, 0.5, 1.5], [0.15, 1.3, 0.35], [1.35, 1.1, 0.12]];
  let bi = 0;
  for (const bx of [-0.096, 0.096]) for (const by of [0.045, 0.008])
    _rigBox(out, bx, by, -0.026, 0.02, 0.02, 0.012, BTN[bi++]);
  _rigBox(out, -0.05, -0.058, -0.026, 0.028, 0.028, 0.014, KNOB);  // rotary knobs
  _rigBox(out,  0.05, -0.058, -0.026, 0.028, 0.028, 0.014, KNOB);
  _rigBox(out, -0.082, 0.024, -0.0290, 0.024, 0.024, 0.003, [0.10, 0.11, 0.13]); // OT lamp bezel
  _rigBox(out, -0.082, 0.024, -0.0294, 0.019, 0.019, 0.003, [0.06, 0.05, 0.08]);  // OT lamp (off)
  // Shift paddles: wide blades poking out past the rim behind the wheel.
  const PADL = [0.11, 0.11, 0.125];
  _rigBox(out, -0.150, -0.01, 0.052, 0.085, 0.135, 0.015, PADL);
  _rigBox(out,  0.150, -0.01, 0.052, 0.085, 0.135, 0.015, PADL);
  cockpitWheelMesh = _gfx.createMesh(out);
  return cockpitWheelMesh;
}
// Shift-light LED strip across the top of the wheel fascia — LIVE, keyed to
// RPM like the real wheel: greens, ambers, reds, then the blue "shift now"
// pair. One cached mesh per lit-count (9 tiny meshes, wheel-local coords).
const _ledMeshes = {};
function getLedStrip(lit) {
  if (_ledMeshes[lit]) return _ledMeshes[lit];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const COLS = [[0.2,1.8,0.4],[0.2,1.8,0.4],[0.2,1.8,0.4],[1.8,0.9,0.15],[1.8,0.9,0.15],[1.9,0.2,0.15],[1.9,0.2,0.15],[0.9,0.4,2.2]];
  for (let i = 0; i < 8; i++) {
    const col = i < lit ? COLS[i] : [0.05, 0.05, 0.06];
    _rigBox(out, -0.070 + i * 0.020, 0.082, -0.026, 0.013, 0.013, 0.010, col);
  }
  _ledMeshes[lit] = _gfx.createMesh(out);
  return _ledMeshes[lit];
}
// 7-seg GEAR digit, wheel-local on the LCD centre (cached per gear).
const _gearMeshes = {};
function getGearDigit(g) {
  if (_gearMeshes[g]) return _gearMeshes[g];
  const SEG7 = [
    [1,1,1,1,1,1,0],[0,1,1,0,0,0,0],[1,1,0,1,1,0,1],[1,1,1,1,0,0,1],[0,1,1,0,0,1,1],
    [1,0,1,1,0,1,1],[1,0,1,1,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1],
  ];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const GRN = [2.2, 0.85, 0.12];   // orange, like the real gear readout
  const h = 0.026, w = h * 0.55, t = h * 0.16, q = h / 4, cy = 0.022, cz = -0.0335;
  const L = [ [h/2, 0, w, t], [q, w/2, t, h/2], [-q, w/2, t, h/2],
              [-h/2, 0, w, t], [-q, -w/2, t, h/2], [q, -w/2, t, h/2], [0, 0, w, t] ];
  const seg = SEG7[g % 10];
  for (let i = 0; i < 7; i++) if (seg[i])
    _rigBox(out, 0.014 + L[i][1], cy + L[i][0], cz, L[i][2], L[i][3], 0.006, GRN);
  _gearMeshes[g] = _gfx.createMesh(out);
  return _gearMeshes[g];
}
// Small 7-seg digits for the LCD speed readout (cached 0-9, origin-centred —
// positioned per frame with a translate composed onto the wheel matrix).
const _spdMeshes = {};
function getSpeedDigit(d) {
  if (_spdMeshes[d]) return _spdMeshes[d];
  const SEG7 = [
    [1,1,1,1,1,1,0],[0,1,1,0,0,0,0],[1,1,0,1,1,0,1],[1,1,1,1,0,0,1],[0,1,1,0,0,1,1],
    [1,0,1,1,0,1,1],[1,0,1,1,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1],
  ];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const CYN = [0.3, 1.6, 2.0];
  const h = 0.017, w = h * 0.55, t = h * 0.18, q = h / 4;
  const L = [ [h/2, 0, w, t], [q, w/2, t, h/2], [-q, w/2, t, h/2],
              [-h/2, 0, w, t], [-q, -w/2, t, h/2], [q, -w/2, t, h/2], [0, 0, w, t] ];
  const seg = SEG7[d % 10];
  for (let i = 0; i < 7; i++) if (seg[i])
    _rigBox(out, L[i][1], L[i][0], 0, L[i][2], L[i][3], 0.006, CYN);
  _spdMeshes[d] = _gfx.createMesh(out);
  return _spdMeshes[d];
}
// Live ERS fill (anchored LEFT for matrix X-scale) + pedal bars (anchored
// BOTTOM for matrix Y-scale).
let _ersBarMesh = null;
function getErsBar() {
  if (_ersBarMesh) return _ersBarMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  _rigBox(out, 0, 0.023, 0, 0.008, 0.046, 0.004, [0.25, 1.9, 0.5]);  // anchored at y=0
  _ersBarMesh = _gfx.createMesh(out);
  return _ersBarMesh;
}
let _otArmedMesh = null, _otActiveMesh = null;
function getOtLamp(active) {
  if (active ? _otActiveMesh : _otArmedMesh) return active ? _otActiveMesh : _otArmedMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  _rigBox(out, -0.082, 0.024, -0.031, 0.019, 0.019, 0.003, active ? [1.6, 0.5, 2.2] : [1.2, 1.2, 1.3]);
  const m = _gfx.createMesh(out);
  if (active) _otActiveMesh = m; else _otArmedMesh = m;
  return m;
}
let _thrBarMesh = null, _brkBarMesh = null;
function getPedalBar(brake) {
  if (brake ? _brkBarMesh : _thrBarMesh) return brake ? _brkBarMesh : _thrBarMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  _rigBox(out, 0, 0.026, 0, 0.009, 0.052, 0.006, brake ? [1.9, 0.2, 0.15] : [0.2, 1.8, 0.4]);
  const m = _gfx.createMesh(out);
  if (brake) _brkBarMesh = m; else _thrBarMesh = m;
  return m;
}

  return { init, carDecalData, getCarDecalMesh, getCockpitDecalMesh, getBrakeRing, getRainLight, getExhaustFlame, getBoostFlame, getErsLight, getCockpitWheel, getLedStrip, getGearDigit, getSpeedDigit, getErsBar, getOtLamp, getPedalBar };
})();
