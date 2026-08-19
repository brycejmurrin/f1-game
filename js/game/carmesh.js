/* Apex 26 — car mesh/decal/cockpit-instrument geometry builders for js/game.js: the shared decal-quad meshes (logo/sponsor UVs into the LiveryTex atlas), the effe… */
const CarMesh = (function () {
  "use strict";

let _gfx = null;            // renderer handle, set once by init()
function init(gfx) { Log.info("game", "CarMesh.init"); _gfx = gfx; }

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
  podDecal(R.titleA, 0.32, 0.80, 0.018);   // sits wholly on the PANEL board
  const cf = anchors ? anchors.coverAt(-0.62) : { x: 0.27, top: 0.81 };
  const cr = anchors ? anchors.coverAt(-1.28) : { x: 0.20, top: 0.69 };
  quad([[-cf.x*0.72, cf.top+0.008, -0.62], [cf.x*0.72, cf.top+0.008, -0.62],
        [cr.x*0.72, cr.top+0.008, -1.28], [-cr.x*0.72, cr.top+0.008, -1.28]], [0, 1, 0.06], R.crest);
  const fp = Car3D.sharkFinPanel ? Car3D.sharkFinPanel()
    : [{ x: 0.023, y: 0.655, z: -0.82 }, { x: 0.023, y: 0.655, z: -1.56 },
       { x: 0.023, y: 0.945, z: -1.56 }, { x: 0.023, y: 0.945, z: -0.82 }];
  const FIN_N = 0.78, FIN_NY = 0.62;      // normalised: 0.78² + 0.62² ≈ 1
  const face = (c, region) => {
    const v = (i, s) => [s * c[i].x, c[i].y, c[i].z];
    quad([v(0, 1), v(1, 1), v(2, 1), v(3, 1)], [FIN_N, FIN_NY, 0], region);
    quad([v(1, -1), v(0, -1), v(3, -1), v(2, -1)], [-FIN_N, FIN_NY, 0], region);
  };
  face(fp, R.fin);
  if (Car3D.sharkFinBadge && R.finBadge) face(Car3D.sharkFinBadge(), R.finBadge);
  const nR = anchors ? anchors.noseAt(1.72) : { top: 0.45, topSide: 0.16 };
  const nF = anchors ? anchors.noseAt(2.10) : { top: 0.43, topSide: 0.14 };
  quad([[-nF.topSide*0.84, nF.top+0.020, 2.10], [nF.topSide*0.84, nF.top+0.020, 2.10],
        [nR.topSide*0.84, nR.top+0.020, 1.72], [-nR.topSide*0.84, nR.top+0.020, 1.72]], [0, 1, 0.05], R.num);
  const nsR = anchors ? anchors.noseAt(1.16) : { top: 0.54, topSide: 0.15 };
  const nsF = anchors ? anchors.noseAt(1.66) : { top: 0.48, topSide: 0.14 };
  quad([[-nsF.topSide*0.82, nsF.top+0.014, 1.66], [nsF.topSide*0.82, nsF.top+0.014, 1.66],
        [nsR.topSide*0.82, nsR.top+0.014, 1.16], [-nsR.topSide*0.82, nsR.top+0.014, 1.16]], [0, 1, 0.10], R.titleB);
  // Sidepod lower flank → long sponsor strip.
  podDecal(R.strip, 0.08, 0.30, 0.020);   // sits wholly on the c2 accent band
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
let _cockpitDecalMesh = null, _cockpitDecalKey = "";
function getCockpitDecalMesh(parts, teamId) {
  if (typeof LiveryTex === "undefined" || !_gfx.createTexMesh) return null;
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

const _flapMeshes = {};
const _flapOrder = [];
const FLAP_CACHE_MAX = 128;
function getAeroFlap(aLvl, col, idx, style, el, finish) {
  const c = col || [0.9, 0.9, 0.1];
  // aLvl is passed through RAW — catalog options use fractional levels and the
  // wing geometry depends on the exact value, so it must not be truncated here
  // either (it is part of the cache key for the same reason).
  const g = el || Car3D.aeroFlaps(aLvl, style)[idx | 0];
  if (!g) return null;
  const sig = g.cacheKey || (g.id + aLvl + "|" + (style ? [
    style.frontSweep, style.frontTaper, style.frontRise,
    style.rearSweep, style.rearTaper, style.drs || 0].map((v) => +v || 0).join(",") : "d"));
  // Colour, spelled out rather than mapped+joined — same 0.01 resolution, no
  // array and no closure. The whole key build runs per flap per car per frame.
  // Finish is part of the key: the same element/level/colour renders a different
  // MATERIAL under a satin/chrome livery, so two finishes must not share a mesh.
  const key = sig + "|" + c[0].toFixed(2) + "," + c[1].toFixed(2) + "," + c[2].toFixed(2) + "|" + (finish || "");
  if (_flapMeshes[key]) return _flapMeshes[key];
  const mesh = _gfx.createMesh(Car3D.buildFlapGeom(g, c, finish));
  _flapMeshes[key] = mesh;
  _flapOrder.push(key);
  if (_flapOrder.length > FLAP_CACHE_MAX) {
    const old = _flapOrder.shift();
    // freeMesh, not deleteMesh: no backend has ever had a deleteMesh (GLX, TLX and
    // WGX all expose freeMesh — see the contract in js/render/gfx.js), so the old
    // `&& _gfx.deleteMesh` guard silently skipped the free and every evicted flap
    // leaked its GL buffers for the life of the page. Same call the two frees
    // above this function already make.
    if (_flapMeshes[old] && _gfx.freeMesh) _gfx.freeMesh(_flapMeshes[old]);
    delete _flapMeshes[old];
  }
  return mesh;
}

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
const _ledMeshes = {};
// `lit` 0-8 lights that many LEDs left-to-right. 9 is the SHIFT FLASH: a real
// wheel does not just fill the strip and stop — at the shift point the whole
// row strobes blue, which is the cue a driver actually upshifts on, and it is
// the one state the fill-only ramp could never express (8 lit and 8 lit-plus-
// past-it looked identical). The caller alternates 9 and 0 to strobe it.
function getLedStrip(lit) {
  if (_ledMeshes[lit]) return _ledMeshes[lit];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const COLS = [[0.2,1.8,0.4],[0.2,1.8,0.4],[0.2,1.8,0.4],[1.8,0.9,0.15],[1.8,0.9,0.15],[1.9,0.2,0.15],[1.9,0.2,0.15],[0.9,0.4,2.2]];
  for (let i = 0; i < 8; i++) {
    const col = lit === 9 ? [0.85, 0.45, 2.4] : i < lit ? COLS[i] : [0.05, 0.05, 0.06];
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
let _ersBarMesh = null;
function getErsBar() {
  if (_ersBarMesh) return _ersBarMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  _rigBox(out, 0, 0.023, 0, 0.008, 0.046, 0.004, [0.25, 1.9, 0.5]);  // anchored at y=0
  _ersBarMesh = _gfx.createMesh(out);
  return _ersBarMesh;
}
const _aeroLamps = {};
function getAeroLamp(state) {                       // 0 unavailable, 1 armed, 2 open
  if (_aeroLamps[state]) return _aeroLamps[state];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const COL = state === 2 ? [0.30, 1.75, 2.20]      // X-MODE: the cyan the HUD chip uses
            : state === 1 ? [1.70, 1.05, 0.20]      // armed: amber, "press it"
            : [0.10, 0.10, 0.13];                   // dark: no zone here, or nothing to do
  _rigBox(out, 0.082, 0.024, -0.031, 0.019, 0.019, 0.003, COL);
  _aeroLamps[state] = _gfx.createMesh(out);
  return _aeroLamps[state];
}
let _aeroBarBg = null, _aeroBarFill = null;
function getAeroBar(fill) {
  if (fill ? _aeroBarFill : _aeroBarBg) return fill ? _aeroBarFill : _aeroBarBg;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const W = 0.030;
  _rigBox(out, W / 2, 0, 0, W, 0.005, 0.003, fill ? [0.30, 1.75, 2.20] : [0.05, 0.06, 0.08]);
  const m = _gfx.createMesh(out);
  if (fill) _aeroBarFill = m; else _aeroBarBg = m;
  return m;
}
// The per-frame wheel extras — anything that needs live car state and would
// otherwise cost the caller a draw call per part. Kept here rather than in
// game.js because that file sits AT its module-size ratchet (AGENTS.md), and
// because the geometry it draws is defined three functions up.
const _axT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _axM = new Float32Array(16);
const _AX_FX = { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true };
function drawWheelExtras(mat, c, t) {
  const ax = Math.max(0, Math.min(1, c.aeroX || 0));
  const open = ax > 0.05;
  _gfx.draw(getAeroLamp(open ? 2 : c.xArmed ? 1 : 0), mat, _AX_FX);
  if (ax <= 0.02) return;
  _axT[12] = 0.067; _axT[13] = 0.004; _axT[14] = -0.0315;
  M4.mulTo(_axM, mat, _axT);
  _gfx.draw(getAeroBar(false), _axM, _AX_FX);
  _axM[0] *= ax; _axM[1] *= ax; _axM[2] *= ax;
  _gfx.draw(getAeroBar(true), _axM, ax < 0.999
    ? { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true, alpha: 0.65 + 0.35 * Math.sin(t * 20) }
    : _AX_FX);
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

  return { init, carDecalData, getCarDecalMesh, getCockpitDecalMesh, getBrakeRing, getRainLight, getExhaustFlame, getBoostFlame, getErsLight, getAeroFlap, getCockpitWheel, getLedStrip, getGearDigit, getSpeedDigit, getErsBar, getOtLamp, drawWheelExtras };
})();
