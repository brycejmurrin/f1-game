/* Apex 26 — car mesh/decal/cockpit-instrument geometry builders for js/game.js: the shared decal-quad meshes (logo/sponsor UVs into the LiveryTex atlas), the effe… */
const CarMesh = (function () {
  "use strict";

let _gfx = null;            // renderer handle, set once by init()
function init(gfx) { Log.info("game", "CarMesh.init"); _gfx = gfx; }

const _carDecalMeshes = {};
const _carDecalOrder = [];
const CAR_DECAL_CACHE_MAX = 24;
// FIFO-with-cap, not LRU: a hit below does not move its key in _carDecalOrder,
// so eviction always drops the oldest-inserted key even if it is still in use.
// Left as-is: both are plain objects/arrays (no Map), so true LRU needs an
// indexOf+splice reorder on every hit; a race uses only a handful of distinct
// (level, fin, drs, anchor) keys, far under the 24-entry cap, so eviction —
// and the FIFO/LRU distinction — is never reached in practice.
function carDecalData(aLvl, parts, legacyBody, teamId, finShape, spineHeight) {
  const R = LiveryTex.REGIONS, S = LiveryTex.SIZE, SH = LiveryTex.SIZE_H || S;
  const out = { pos: [], nrm: [], uv: [], idx: [] };
  // Imported GLBs are static and do not consume the procedural parts recipe.
  // Resolve their overlays against the default body once, regardless of setup.
  // teamId threads the per-team chassis style into the anchors so decals stay
  // glued to a styled (longer/slimmer/drooped) nose and inlet.
  const anchorParts = legacyBody ? null : parts;
  // spineHeight lifts the engine-cover crown the spine crest sits on (cf/cr
  // below read coverAt().top), so the decal takes the same anchors as the mesh.
  const anchors = Car3D.bodyAnchors ? Car3D.bodyAnchors(anchorParts, legacyBody ? null : teamId, spineHeight) : null;
  // Map a canvas-pixel region → UV rect (v flipped: createTexture uploads FLIP_Y).
  const uvOf = (r) => ({ uL: r.x / S, uR: (r.x + r.w) / S, vT: 1 - r.y / SH, vB: 1 - (r.y + r.h) / SH });
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
  const cf = anchors ? anchors.coverAt(-0.62) : { x: 0.27, bottom: 0.20, top: 0.81 };
  const cr = anchors ? anchors.coverAt(-1.28) : { x: 0.20, bottom: 0.23, top: 0.69 };
  if (Car3D.coverProfile) {
    // The crown is ROUNDED (Car3D.coverProfile: a flat centre ±0.32x, two facets
    // down to the shoulder at ±0.72x), so the crest is a strip of five quads
    // draped over it, shoulder to shoulder — the same ±0.72x span the flat quad
    // covered, so the mark keeps its size; only its edges now bend down with
    // the skin instead of floating over it. u is by chord (x), which keeps the
    // centre of the mark undistorted, and is pre-flipped exactly as quad() does.
    const pf = Car3D.coverProfile(cf), pr = Car3D.coverProfile(cr);
    const across = (p) => {   // left → right: -shoulder, -facet, -crown, crown, facet, shoulder
      const r = p.pts.slice(1);   // shoulder, facet, crown (right side, outer → inner)
      return r.map(([x, y]) => [-x, y]).concat(r.slice().reverse());
    };
    // Car3D.COVER_STACK.decal, not a literal: the crown carries the heat shield
    // and the spine vent under this wrap, and at a literal 0.008 the shield's
    // top face (top+0.017) swallows 300 mm of the tail strip while the vent's
    // ties the plane exactly. car3d owns the order; this reads it.
    const PROUD = (Car3D.COVER_STACK && Car3D.COVER_STACK.decal) || 0.022;
    // Drape one region over the crown between two stations, shoulder to shoulder.
    const drape = (region, zF, zR, pF, pR) => {
      const uv = uvOf(region), L = across(pF), Rr = across(pR), W = pF.pts[1][0] * 2;
      for (let i = 0; i < L.length - 1; i++) {
        const [xa, ya] = L[i], [xb, yb] = L[i + 1], [xc, yc] = Rr[i], [xd, yd] = Rr[i + 1];
        // outward normal of this facet (right-handed: +x when the surface drops to the right)
        const dx = xb - xa, dy = yb - ya, nl = Math.hypot(dx, dy) || 1, nx = -dy / nl, ny = dx / nl;
        const fa = (xa + W / 2) / W, fb = (xb + W / 2) / W;
        const uu = (f) => uv.uR + (uv.uL - uv.uR) * f;
        quadUv([[xa + nx * PROUD, ya + ny * PROUD, zF], [xb + nx * PROUD, yb + ny * PROUD, zF],
                [xd + nx * PROUD, yd + ny * PROUD, zR], [xc + nx * PROUD, yc + ny * PROUD, zR]],
               [nx, ny, 0.06], [[uu(fa), uv.vB], [uu(fb), uv.vB], [uu(fb), uv.vT], [uu(fa), uv.vT]]);
      }
    };
    drape(R.crest, -0.62, -1.28, pf, pr);
    // The TAIL strip: the same drape over the cover behind the crest, so the
    // SPINE TOP band designs run on to the wing (REGIONS.tail; bare unless a
    // band design is picked).
    if (R.tail) {
      // Starts on the crest strip's rear edge (-1.28): a shared edge, so a
      // saddle or a stripe runs seamlessly from crown to tail.
      const tf = anchors ? anchors.coverAt(-1.28) : { x: 0.20, bottom: 0.23, top: 0.69 };
      const tr = anchors ? anchors.coverAt(-1.92) : { x: 0.14, bottom: 0.25, top: 0.60 };
      drape(R.tail, -1.28, -1.92, Car3D.coverProfile(tf), Car3D.coverProfile(tr));
    }
  } else {
    quad([[-cf.x*0.72, cf.top+0.008, -0.62], [cf.x*0.72, cf.top+0.008, -0.62],
          [cr.x*0.72, cr.top+0.008, -1.28], [-cr.x*0.72, cr.top+0.008, -1.28]], [0, 1, 0.06], R.crest);
  }
  // SPINE SIDE: the WHOLE engine-cover flank, both sides — from just behind
  // the airbox (z -0.66) to the wing (-1.90), and from under the shoulder
  // crease (v 0.96) down to the sidepod line (v 0.06). At each station the
  // flank is the straight line from (x, bottom) up to the SHOULDER
  // (Car3D.coverProfile: 0.72x, top - d; the rounded crown sits above it).
  // The whole side is one canvas so a design can run the length of the cover
  // (the RB22's Red Bull, the W17's bars, the SF-26's white) — the price is
  // that a canvas pixel is ~1.4× longer along the car than down the flank
  // (1.24 m over 304 px vs ~0.47 m over 160 px); LiveryTex.FLANK_SQUASH
  // compensates for the marks. Corners follow the endplate-number order below
  // so the text reads on both sides under the reflected model matrix. Always
  // mapped: an unpicked spineSide is an unpainted region, like the fin panel.
  if (R.spineSide) {
    // Car3D.COVER_STACK.flankDecal — the pinstripe and the service hatches are
    // bodywork UNDER this wrap, and at a literal 0.010 the pinstripe is
    // coplanar with it (0.9 mm) and the hatches stand 9 mm proud of it.
    const sZ = [-0.66, -1.90], V_TOP = 0.96, V_BOT = 0.06;
    const PROUD = (Car3D.COVER_STACK && Car3D.COVER_STACK.flankDecal) || 0.014;
    const flank = (z) => {
      const c = anchors ? anchors.coverAt(z) : (z > -1 ? { x: 0.27, bottom: 0.20, top: 0.81 } : { x: 0.20, bottom: 0.23, top: 0.69 });
      const p = Car3D.coverProfile ? Car3D.coverProfile(c) : { x: c.x, bottom: c.bottom, shoulder: c.top };
      const h = p.shoulder - p.bottom, nl = Math.hypot(h, 0.28 * p.x), nx = h / nl, ny = 0.28 * p.x / nl;
      const at = (v) => [p.x * (1 - 0.28 * v) + nx * PROUD, p.bottom + h * v + ny * PROUD];
      return { b: at(V_BOT), t: at(V_TOP), nx, ny };
    };
    const a = flank(sZ[0]), b = flank(sZ[1]);
    quad([[a.b[0], a.b[1], sZ[0]], [b.b[0], b.b[1], sZ[1]], [b.t[0], b.t[1], sZ[1]], [a.t[0], a.t[1], sZ[0]]],
         [a.nx, a.ny, 0], R.spineSide);
    // Under the det −1 model matrix the +x quad above renders as the car's
    // RIGHT flank (canvas-left at the rear) and this −x quad as its LEFT
    // (canvas-left at the front) — LiveryTex.FLANKS authors each in that
    // side's outside view. A stale atlas without this region mirrors the first.
    quad([[-b.b[0], b.b[1], sZ[1]], [-a.b[0], a.b[1], sZ[0]], [-a.t[0], a.t[1], sZ[0]], [-b.t[0], b.t[1], sZ[1]]],
         [-a.nx, a.ny, 0], R.spineSideL || R.spineSide);
  }
  // The fin's blade height is a recipe knob, so the decal has to be placed on
  // the SAME outline the mesh used. sharkFinPanel/sharkFinBadge default to a
  // scale of 1 when this is absent, which is what every legacy caller gets.
  const finS = (parts && parts._visual && parts._visual.aero && parts._visual.aero.fin) || 1;
  // The livery's FIN SHAPE picks the outline the decal is stretched over — the
  // same FIN_SHAPES entry build() cut the blade from — and "none" is no blade,
  // so no panel and no badge either: a graphic hanging in the air behind the
  // airbox is exactly what this branch exists to prevent.
  const fShape = finShape || "standard";
  // The blade's ROOT, from the same Car3D function build() cuts it with: a
  // decal placed off the FROZEN base while the mesh roots itself into the
  // engine cover lets a raised crown (every shipped team ships spineHeight
  // "dorsal") swallow most of the panel and all of the badge.
  // A cover taller than the regulation fin top leaves no blade at all; painting
  // a graphic onto one is worse than leaving the region unmapped, so `clear`
  // gates it the same way finShape "none" does.
  const fRoot = Car3D.sharkFinRoot ? Car3D.sharkFinRoot(anchors, finS, fShape) : null;
  const finVisible = fShape !== "none" && (!fRoot || fRoot.clear > 0.03);
  if (finVisible) {
    const fp = Car3D.sharkFinPanel ? Car3D.sharkFinPanel(null, null, finS, fShape, fRoot)
      : [{ x: 0.023, y: 0.655, z: -0.82 }, { x: 0.023, y: 0.655, z: -1.56 },
         { x: 0.023, y: 0.945, z: -1.56 }, { x: 0.023, y: 0.945, z: -0.82 }];
    const FIN_N = 0.78, FIN_NY = 0.62;      // normalised: 0.78² + 0.62² ≈ 1
    const face = (c, region) => {
      const v = (i, s) => [s * c[i].x, c[i].y, c[i].z];
      quad([v(0, 1), v(1, 1), v(2, 1), v(3, 1)], [FIN_N, FIN_NY, 0], region);
      quad([v(1, -1), v(0, -1), v(3, -1), v(2, -1)], [-FIN_N, FIN_NY, 0], region);
    };
    face(fp, R.fin);
    if (Car3D.sharkFinBadge && R.finBadge) face(Car3D.sharkFinBadge(null, finS, fShape, fRoot), R.finBadge);
  }
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
  // Rear-wing endplate number boards → the driver number plus the team lockup
  // (classic F1 — identity reads on the nose AND the rear-wing endplates). The board height/pos
  // TRACKS the wing: Car3D.numberBoard(aLvl) is the SAME function the car mesh
  // uses to place the physical board, so the digit lands on it at every downforce
  // level (mesh is cached per aLvl — see getCarDecalMesh).
  // Defensive: fall back to a fixed board if a stale car3d.js bundle lacks
  // numberBoard (never white-screen the race over a decal position).
  // Rear-wing UPPER FLAP → the sponsor band. Car3D.wingBand is the SAME solver
  // that POSES the flap, not the recipe that designs it: the design chord is
  // 19.5 degrees off where drawAeroFlaps actually hangs the element, so a band
  // drawn from it floats ~90 mm over a parked car's wing. The
  // whole placement — rest attitude, skin, proud offset, surface normal — lives
  // in car3d beside the pose solve, for the reason frontPlate does.
  if (Car3D.wingBand) {
    const lvl = aLvl == null ? 2 : aLvl;
    const B = Car3D.wingBand(lvl, Car3D.aeroStyleOf ? Car3D.aeroStyleOf(parts) : null);
    if (B) {
      // One quad per spanwise segment, u by x — the same treatment podDecal and
      // the cover drape give a curved surface, and for the same reason: a single
      // quad across a swept wing bridges the sweep instead of following it.
      const u = uvOf(R.wing), S = B.stations;
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1];
        const uu = (x) => u.uR + (u.uL - u.uR) * ((x + B.half) / (B.half * 2));
        quadUv([[a.x, a.front.y, a.front.z], [b.x, b.front.y, b.front.z],
                [b.x, b.rear.y, b.rear.z], [a.x, a.rear.y, a.rear.z]],
               a.nrm, [[uu(a.x), u.vB], [uu(b.x), u.vB], [uu(b.x), u.vT], [uu(a.x), u.vT]]);
      }
    }
  }
  // FRONT-WING ENDPLATE → a partner mark on the outer face of each plate.
  // Car3D.frontPlate is the SAME function that places the plate, because the
  // plate's height, its outboard kick, its thickness and even its taper all
  // move with the aero level and the `plate` pick: a decal drawn from literals
  // lands in clear air on three of the four profiles. The corners follow the
  // taper (the top of the plate is narrower than the bottom) and sit inside
  // the plate's edges, so the mark never overhangs into space.
  if (Car3D.frontPlate) {
    const fp = Car3D.frontPlate(aLvl == null ? 2 : aLvl,
                               parts && parts._visual && parts._visual.aero);
    const at = (u) => ({
      z: fp.front.z + (fp.rear.z - fp.front.z) * u,
      x: fp.front.x + (fp.rear.x - fp.front.x) * u,
      y: fp.front.y + (fp.rear.y - fp.front.y) * u,
      h: fp.front.h + (fp.rear.h - fp.front.h) * u,
      t: fp.front.t + (fp.rear.t - fp.front.t) * u,
    });
    // u along the chord (0 = front station), f up the plate (0 = bottom). The
    // mark takes the middle band, not the whole plate: a real endplate carries
    // a partner logo with plate showing around it, and the plate is only
    // 0.16-0.30 m tall at its front station.
    const corner = (u, f) => {
      const st = at(u), frac = 0.30 + 0.44 * f;
      // st.x is the plate's CENTRELINE; the outer face is half a thickness
      // outboard of it, narrowing with the taper toward the top.
      return { x: st.x + (fp.w / 2) * (1 + (st.t - 1) * frac) + 0.004,
               y: st.y - st.h / 2 + st.h * frac, z: st.z };
    };
    const BL = corner(0.20, 0), BR = corner(0.80, 0), TR = corner(0.80, 1), TL = corner(0.20, 1);
    // Same corner order as the rear endplate boards above: from OUTSIDE, the
    // front of the car reads left, and the -x side takes the mirrored order.
    quad([[BL.x, BL.y, BL.z], [BR.x, BR.y, BR.z], [TR.x, TR.y, TR.z], [TL.x, TL.y, TL.z]], [1, 0, 0], R.fwEnd);
    quad([[-BR.x, BR.y, BR.z], [-BL.x, BL.y, BL.z], [-TL.x, TL.y, TL.z], [-TR.x, TR.y, TR.z]], [-1, 0, 0], R.fwEnd);
  }
  const nb = (Car3D.numberBoard ? Car3D.numberBoard(aLvl == null ? 2 : aLvl) : { cy: 0.62, h: 0.20 });
  const ex = 0.539, eyB = nb.cy - nb.h * 0.5 + 0.01, eyT = nb.cy + nb.h * 0.5 - 0.01, ezF = -2.30, ezR = -2.52;
  quad([[ex, eyB, ezF], [ex, eyB, ezR], [ex, eyT, ezR], [ex, eyT, ezF]], [1, 0, 0], R.num);
  quad([[-ex, eyB, ezR], [-ex, eyB, ezF], [-ex, eyT, ezF], [-ex, eyT, ezR]], [-1, 0, 0], R.num);
  return out;
}
function getCarDecalMesh(aLvl, parts, legacyBody, teamId, finShape, spineHeight) {
  if (typeof LiveryTex === "undefined" || !_gfx.createTexMesh) return null;
  const anchorParts = legacyBody ? null : parts;
  // spineHeight reaches the cache key through anchors.key (the lift is in it).
  const anchors = Car3D.bodyAnchors ? Car3D.bodyAnchors(anchorParts, legacyBody ? null : teamId, spineHeight) : { key: "legacy" };
  const level = aLvl == null ? 2 : Number(aLvl);
  // anchors.key covers the engine-cover fields and the team, NOT the aero
  // recipe — so a fin-height change alone would hit a cached decal mesh built
  // for the old blade and paint the graphic off the fin. It joins the key.
  const finK = (parts && parts._visual && parts._visual.aero && parts._visual.aero.fin) || 1;
  // `drs` joins it for the same reason: carDecalData drops upperTrailY by 75 mm
  // for `lvl >= 4 || drs`, so a DRS package and a non-DRS one at the same level
  // place the rear-wing sponsor band on different quads. No SHIPPED catalog pair
  // shares a (level, fin) and differs in drs — `fin` disambiguates the two DRS
  // options by accident today — so this is latent, and a one-field aero edit is
  // all it takes to start painting the band 75 mm off the flap.
  // …and `drs` alone is not enough now that the band is placed on the flap's
  // SOLVED pose: rearSweep and rearTaper move that pose too, and `plate`
  // moves the front endplate the decal is drawn on (frontPlateGeom). They
  // join the key or a style change paints the previous wing.
  const aSt = Car3D.aeroStyleOf ? Car3D.aeroStyleOf(parts) : null;
  const drsK = aSt ? [aSt.drs ? 1 : 0, aSt.rearSweep, aSt.rearTaper, aSt.plate].map((v) => +v || 0).join(",")
                   : ((parts && parts._visual && parts._visual.aero && parts._visual.aero.drs) ? 1 : 0);
  // finShape is livery, not parts, so anchors.key cannot carry it: it joins here.
  const shapeK = finShape || "standard";
  const k = level + "|" + (legacyBody ? "imported|" : "") + finK + "|" + drsK + "|" + shapeK + "|" + anchors.key;
  if (!_carDecalMeshes[k]) {
    _carDecalMeshes[k] = _gfx.createTexMesh(carDecalData(level, parts, legacyBody, teamId, shapeK, spineHeight));
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
    const R = LiveryTex.REGIONS, S = LiveryTex.SIZE, SH = LiveryTex.SIZE_H || S;
    const u = { uL: R.num.x / S, uR: (R.num.x + R.num.w) / S, vT: 1 - R.num.y / SH, vB: 1 - (R.num.y + R.num.h) / SH };
    const anchors = anchorsForKey;
    const nr = anchors ? anchors.noseAt(1.72) : { top: 0.45, topSide: 0.16 };
    const nf = anchors ? anchors.noseAt(2.10) : { top: 0.43, topSide: 0.14 };
    // FRONT FIRST — the same corner order the race quad uses (carDecalData's
    // R.num block), because the uvs below are the same too. Reversing the z
    // order while leaving u alone flips v ALONE, and a v-only flip is a
    // REFLECTION, not a half turn: the number and the crest lockup rendered
    // mirror-imaged from the cockpit. The atlas is authored front-at-the-bottom
    // (LiveryTex, drawSpineTop) and both quads have to honour that.
    const c = [[-nf.topSide*0.84, nf.top+0.020, 2.10], [nf.topSide*0.84, nf.top+0.020, 2.10],
               [nr.topSide*0.84, nr.top+0.020, 1.72], [-nr.topSide*0.84, nr.top+0.020, 1.72]];
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

// THE COMPOUND'S STRIPE on the sidewall, from the tyre record the car runs
// on (js/physics/tyre-model.js AI_CLASS colour): one flat ring per colour,
// cached by its rgb, laid on each wheel's outer face like the brake ring —
// outside the brake ring's band, so the two never overlap.
const _compoundRings = new Map();
function getCompoundRing(col) {
  const key = col[0].toFixed(2) + "," + col[1].toFixed(2) + "," + col[2].toFixed(2);
  let m = _compoundRings.get(key);
  if (m) return m;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const SEG = 20, R0 = 0.24, R1 = 0.315;
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const base = out.pos.length / 3;
    out.pos.push(0, R0 * c0, R0 * s0,  0, R1 * c0, R1 * s0,
                 0, R1 * c1, R1 * s1,  0, R0 * c1, R0 * s1);
    for (let v = 0; v < 4; v++) { out.nrm.push(1, 0, 0); out.col.push(col[0], col[1], col[2]); }
    out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3,
                 base, base + 2, base + 1, base, base + 3, base + 2);
  }
  m = _gfx.createMesh(out);
  _compoundRings.set(key, m);
  return m;
}

// THE STOP'S CREW: a jack at each end of the car — cradle, team-colour beam,
// castors, upright handle — a wheel gun with its hose at each wheel, and the
// six people who work them (four gunmen + two jack operators). One mesh per
// team colour in the car's own frame (+z the nose, wheels at x +/-0.79 /
// z 1.7 and -1.6), drawn only while the car is held in its box (car-draw
// drawPitCrew). Built from GaragePrims' blocks; a VM without them draws
// nothing. CREW_PEOPLE is the body-block count the browser spec pins so a
// kit-only regression cannot silently ship again.
// FIFO-capped like getAeroFlap: the key is the team colour, and a livery
// editor or custom team mints a new colour per edit, so an uncapped map kept
// every one's GPU buffers for the page's life. Map order IS insertion order.
const _crewMeshes = new Map();
const CREW_CACHE_MAX = 32;   // one per team colour on the grid, with room for custom liveries
const CREW_PEOPLE = 6;       // four gunmen + front and rear jack ops
function getCrewMesh(col) {
  const key = col[0].toFixed(2) + "," + col[1].toFixed(2) + "," + col[2].toFixed(2);
  let m = _crewMeshes.get(key);
  if (m) return m;
  const P = typeof GaragePrims !== "undefined" ? GaragePrims : null;
  if (!P) return null;
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  const steel = [0.62, 0.63, 0.66], dark = [0.16, 0.17, 0.19], rubber = [0.07, 0.07, 0.08];
  const suit = [0.92, 0.93, 0.95], skin = [0.78, 0.62, 0.50], helm = [col[0] * 0.55, col[1] * 0.55, col[2] * 0.55];
  const mid = (P.MAT && P.MAT.METAL != null) ? P.MAT.METAL : 4;
  // A jack: `z0` is where its cradle meets the car, `dir` the way its beam
  // runs away from it (+1 ahead of the nose, -1 behind the gearbox).
  const jack = (z0, dir) => {
    P.block(out, 0, 0.11, z0, 0.36, 0.05, 0.07, steel, mid);                   // the cradle under the car
    P.block(out, 0, 0.14, z0 + dir * 0.62, 0.06, 0.04, 0.55, col, mid);         // the beam, in the team's colour
    for (const x of [-0.30, 0.30]) P.block(out, x, 0.07, z0 + dir * 1.10, 0.03, 0.07, 0.07, rubber, mid);   // castors
    P.block(out, 0, 0.13, z0 + dir * 1.10, 0.33, 0.03, 0.03, steel, mid);       // the axle between them
    P.block(out, 0, 0.55, z0 + dir * 1.22, 0.025, 0.40, 0.025, col, mid);       // the upright handle…
    P.block(out, 0, 0.95, z0 + dir * 1.22, 0.22, 0.025, 0.025, dark, mid);      // …and its grip
  };
  jack(2.6, 1);
  jack(-2.4, -1);
  // A wheel gun laid on the ground beside each wheel, its hose running out
  // toward the garage side of the box (+x).
  for (const [x, z] of [[1.35, 1.7], [-1.35, 1.7], [1.35, -1.6], [-1.35, -1.6]]) {
    P.block(out, x, 0.06, z, 0.07, 0.06, 0.16, dark, mid);                     // the gun
    P.block(out, x + 0.55, 0.02, z + 0.05, 0.50, 0.02, 0.02, rubber, mid);     // its hose
  }
  // THE PEOPLE. Block figures in race suits — four at the guns, one on each
  // jack handle — so a stop reads as a crew, not an empty bay with tools.
  // Built as solids (never billboards) so a chase/side camera that wanders
  // past the car still sees bodies from every angle.
  const person = (x, z, faceZ) => {
    P.block(out, x, 0.42, z, 0.11, 0.22, 0.09, suit, mid);                     // torso
    P.block(out, x, 0.78, z, 0.09, 0.09, 0.09, helm, mid);                      // helmet
    P.block(out, x, 0.70, z + faceZ * 0.06, 0.07, 0.05, 0.04, skin, mid);      // visor / face
    P.block(out, x - 0.06, 0.12, z, 0.05, 0.12, 0.05, dark, mid);              // left leg
    P.block(out, x + 0.06, 0.12, z, 0.05, 0.12, 0.05, dark, mid);              // right leg
    P.block(out, x - 0.18, 0.48, z, 0.05, 0.05, 0.14, suit, mid);              // left arm
    P.block(out, x + 0.18, 0.48, z, 0.05, 0.05, 0.14, suit, mid);              // right arm
  };
  for (const [x, z] of [[1.55, 1.7], [-1.55, 1.7], [1.55, -1.6], [-1.55, -1.6]]) {
    person(x, z, z > 0 ? -1 : 1);                                              // facing the wheel
  }
  person(0.55, 3.55, -1);                                                      // front jack op
  person(-0.55, -3.35, 1);                                                     // rear jack op
  m = _gfx.createMesh(out);
  m._crewPeople = CREW_PEOPLE;
  m._crewVerts = out.pos.length / 3;
  _crewMeshes.set(key, m);
  if (_crewMeshes.size > CREW_CACHE_MAX) {
    const old = _crewMeshes.keys().next().value;
    const om = _crewMeshes.get(old);
    _crewMeshes.delete(old);
    if (om && _gfx.freeMesh) _gfx.freeMesh(om);
  }
  return m;
}

// Shared body for a flat billboard quad in the local XY plane (normal -Z,
// half-extents w/h), wound both ways so it reads from either side — the
// shape rainLight/exhaustFlame/boostFlame/ersLight/endplateLight all share,
// differing only in size and colour.
function _flatQuadData(w, h, col) {
  const out = { pos: [], nrm: [], col: [], idx: [] };
  out.pos.push(-w, -h, 0,  w, -h, 0,  w, h, 0,  -w, h, 0);
  for (let i = 0; i < 4; i++) { out.nrm.push(0, 0, -1); out.col.push(col[0], col[1], col[2]); }
  out.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);   // both windings — reads from either side
  return out;
}
// getRainLight / getEndplateLight stay PRIVATE — only drawRearLights reaches
// them, the same way getAeroLamp / getAeroBar sit behind drawWheelExtras.
let rainLightMesh = null;
function getRainLight() {
  if (rainLightMesh) return rainLightMesh;
  rainLightMesh = _gfx.createMesh(_flatQuadData(0.055, 0.07, [2.4, 0.10, 0.08]));
  return rainLightMesh;
}
const _exhaustMeshes = {};
function getExhaustFlame(color) {
  const R = Array.isArray(color) ? color : [2.6, 1.05, 0.25];
  const key = R.join(",");
  if (_exhaustMeshes[key]) return _exhaustMeshes[key];
  return (_exhaustMeshes[key] = _gfx.createMesh(_flatQuadData(0.035, 0.030, R)));
}
let boostMesh = null;
function getBoostFlame() {
  if (boostMesh) return boostMesh;
  boostMesh = _gfx.createMesh(_flatQuadData(0.070, 0.055, [0.65, 1.7, 3.0]));
  return boostMesh;
}
let ersMesh = null;
function getErsLight() {
  if (ersMesh) return ersMesh;
  ersMesh = _gfx.createMesh(_flatQuadData(0.075, 0.014, [0.25, 2.2, 2.0]));
  return ersMesh;
}

const _flapMeshes = {};
const _flapOrder = [];
const FLAP_CACHE_MAX = 128;
// FIFO-with-cap, not LRU (same tradeoff as _carDecalMeshes above): a hit on
// `key` below does not reorder _flapOrder, and this key build runs per flap
// per car per frame, so an indexOf+splice reorder on every hit is not free
// here. Distinct flap signatures per race stay well under 128, so eviction
// order is moot at realistic cardinality.
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
// A bar from (x0,y0) to (x1,y1) in the wheel plane, w across and d deep (z):
// the one shape _rigBox cannot lie along — round rims and angled spokes. The
// faces wind like _rigBox's (a rotation of it), so culling treats them alike.
function _rigBar(out, x0, y0, x1, y1, z, w, d, col) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  const nx = -uy * w / 2, ny = ux * w / 2, za = z - d / 2, zb = z + d / 2;
  const P = [[x0 - nx, y0 - ny], [x1 - nx, y1 - ny], [x1 + nx, y1 + ny], [x0 + nx, y0 + ny]];
  const v = (i, zz) => [P[i][0], P[i][1], zz];
  const F = [
    [v(0, zb), v(1, zb), v(2, zb), v(3, zb), [0, 0, 1]],
    [v(1, za), v(0, za), v(3, za), v(2, za), [0, 0, -1]],
    [v(3, zb), v(2, zb), v(2, za), v(3, za), [-uy, ux, 0]],
    [v(0, za), v(1, za), v(1, zb), v(0, zb), [uy, -ux, 0]],
    [v(1, zb), v(1, za), v(2, za), v(2, zb), [ux, uy, 0]],
    [v(0, za), v(0, zb), v(3, zb), v(3, za), [-ux, -uy, 0]],
  ];
  for (const f of F) {
    const b = out.pos.length / 3, n = f[4];
    for (let i = 0; i < 4; i++) { const q = f[i]; out.pos.push(q[0], q[1], q[2]); out.nrm.push(n[0], n[1], n[2]); out.col.push(col[0], col[1], col[2]); }
    out.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
}
// A rim arc of radius r from angle a0 to a1 (radians, 0 = 3 o'clock, CCW), in
// n straight segments each stretched past its ends so the joins leave no gap.
function _rigArc(out, r, a0, a1, n, w, d, col) {
  const ext = w * 0.18;
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n;
    const x0 = r * Math.cos(t0), y0 = r * Math.sin(t0), x1 = r * Math.cos(t1), y1 = r * Math.sin(t1);
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, ex = (x1 - x0) / L * ext, ey = (y1 - y0) / L * ext;
    _rigBar(out, x0 - ex, y0 - ey, x1 + ex, y1 + ey, 0, w, d, col);
  }
}
// Convex, bevel-cornered fascia / glove panels. Unlike boxes, their silhouette
// stays rounded when the wheel rolls. Front is -z, toward the driver.
function _rigPlate(out, pts, z, depth, col) {
  let area = 0;
  for (let i=0;i<pts.length;i++) { const a=pts[i], b=pts[(i+1)%pts.length]; area += a[0]*b[1]-b[0]*a[1]; }
  if (area < 0) pts = pts.slice().reverse();
  const front = z - depth / 2, back = z + depth / 2;
  const cx = pts.reduce((n, p) => n + p[0], 0) / pts.length;
  const cy = pts.reduce((n, p) => n + p[1], 0) / pts.length;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    _rigQuad(out, [a[0], a[1], front], [b[0], b[1], front], [b[0], b[1], back], [a[0], a[1], back], [dy/L, -dx/L, 0], col);
    for (const [zz, normal, order] of [[front, -1, [b, a]], [back, 1, [a, b]]]) {
      const base = out.pos.length / 3;
      for (const q of [[cx, cy], ...order]) { out.pos.push(q[0], q[1], zz); out.nrm.push(0, 0, normal); out.col.push(...col); }
      out.idx.push(base, base + 1, base + 2);
    }
  }
}
function _rigRounded(out, x, y, z, w, h, d, r, col) {
  const a=w/2, b=h/2, c=Math.min(r,a,b), pts=[];
  for (const [cx,cy,start] of [[a-c,b-c,0],[-a+c,b-c,Math.PI/2],[-a+c,-b+c,Math.PI],[a-c,-b+c,Math.PI*1.5]])
    for(let i=0;i<=4;i++) {const t=start+i*Math.PI/8; pts.push([x+cx+c*Math.cos(t),y+cy+c*Math.sin(t)]);}
  _rigPlate(out,pts,z,d,col);
}
// Smooth closed forms for fabric wrapped around a grip, with shared normals.
function _rigEllipsoid(out, x, y, z, rx, ry, rz, col, angle=0) {
  const N=12, M=6, base=out.pos.length/3, c=Math.cos(angle), s=Math.sin(angle);
  const vertex=(px,py,pz)=>{
    const n=[px/(rx*rx),py/(ry*ry),pz/(rz*rz)], L=Math.hypot(...n);
    out.pos.push(x+c*px-s*py,y+s*px+c*py,z+pz);
    out.nrm.push((c*n[0]-s*n[1])/L,(s*n[0]+c*n[1])/L,n[2]/L); out.col.push(...col);
  };
  vertex(0,-ry,0);
  for(let i=1;i<M;i++)for(let j=0;j<N;j++) {
    const a=i/M*Math.PI, t=j/N*Math.PI*2;
    vertex(rx*Math.sin(a)*Math.cos(t),-ry*Math.cos(a),rz*Math.sin(a)*Math.sin(t));
  }
  vertex(0,ry,0); const top=base+1+(M-1)*N;
  for(let j=0;j<N;j++) {
    const k=(j+1)%N; out.idx.push(base,base+1+j,base+1+k,top,top-N+k,top-N+j);
    for(let i=0;i<M-2;i++) {const a=base+1+i*N+j,b=base+1+i*N+k;out.idx.push(a,a+N,b+N,a,b+N,b);}
  }
}
// A circular button / rotary / quick-release boss, with real depth rather
// than a square painted block. The face is slightly proud of its bezel.
function _rigButton(out, x, y, z, r, col, rotary = false) {
  _rigRing(out, x, y, z + 0.002, r * 1.16, 12, r * 0.24, 0.007, [0.12, 0.13, 0.15]);
  _rigDisc(out, x, y, z - 0.003, r, 12, col);
  if (rotary) {
    _rigBar(out, x-r*0.48, y-r*0.35, x+r*0.48, y+r*0.35, z-0.005, r*0.32, 0.003, [0.035, 0.04, 0.05]);
    _rigBar(out, x, y+r*0.62, x, y+r*0.90, z-0.005, r*0.12, 0.003, [0.85, 0.86, 0.80]);
  }
}
// Swept elliptical tube in the wheel plane: continuous silicone grips and
// leather rims. Shared radial normals avoid a chain of visible square joints.
function _rigGrip(out, path, radius, depth, col) {
  const N = 8, start = out.pos.length / 3;
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i-1)], b = path[Math.min(path.length-1, i+1)];
    const L = Math.hypot(b[0]-a[0], b[1]-a[1]), nx = -(b[1]-a[1])/L, ny = (b[0]-a[0])/L;
    for (let j = 0; j < N; j++) {
      const t = j/N*Math.PI*2, c = Math.cos(t), sn = Math.sin(t);
      out.pos.push(path[i][0]+nx*radius*c, path[i][1]+ny*radius*c, depth*sn);
      const len = Math.hypot(c/radius, sn/depth);
      out.nrm.push(nx*c/radius/len, ny*c/radius/len, sn/depth/len); out.col.push(...col);
    }
  }
  for (let i = 0; i < path.length-1; i++) for (let j = 0; j < N; j++) {
    const a = start+i*N+j, b = start+i*N+(j+1)%N, c = b+N, d = a+N;
    out.idx.push(a,b,c,a,c,d);
  }
  // Caps bury in the fascia or the glove, but close the ends for all angles.
  for (const i of [0, path.length-1]) for (let j = 1; j < N-1; j++) {
    const a = start+i*N, b = a+j, c = b+1;
    out.idx.push(...(i === 0 ? [a,c,b] : [a,b,c]));
  }
}
// Modern wheels are open-bottom control yokes, not rectangular hoops.
// References: Mercedes cockpit photograph / McLaren wheel history (see
// docs/notes/COCKPIT-MODEL-REFERENCES.md). Telemetry still uses the same LCD plane.
function _wheelScreen(out, c2) {
  const CARB = [0.09, 0.095, 0.105], DARK = [0.022, 0.028, 0.036];
  _rigPlate(out, [[-0.090,-0.090],[0.090,-0.090],[0.112,-0.065],[0.116,0.068],
    [0.101,0.095],[-0.101,0.095],[-0.116,0.068],[-0.112,-0.065]], 0.014, 0.042, CARB);
  _rigRounded(out, 0, 0.024, -0.016, 0.125, 0.080, 0.020, 0.008, [0.06,0.067,0.075]);
  _rigBox(out, 0, 0.024, -0.028, 0.112, 0.068, 0.006, DARK);
  // Original aligned LCD cells: cyan speed, orange gear, green battery charge.
  _rigBox(out, 0.048, 0.024, -0.0295, 0.012, 0.050, 0.003, [0.03,0.04,0.045]);
  _rigRounded(out, -0.034, 0.022, -0.0292, 0.052, 0.040, 0.003, 0.002, [0.10,0.11,0.13]);
  _rigRounded(out, -0.034, 0.022, -0.0296, 0.047, 0.035, 0.003, 0.001, [0.010,0.016,0.026]);
  _rigRounded(out, 0.014, 0.022, -0.0292, 0.034, 0.044, 0.003, 0.002, [0.032,0.028,0.027]);
  _rigRounded(out, 0.014, 0.022, -0.0296, 0.029, 0.039, 0.003, 0.001, [0.014,0.018,0.024]);
  const BTN = [[0.83,0.12,0.09],[0.16,0.43,0.85],[0.12,0.65,0.30],[0.88,0.70,0.12]];
  for (const side of [-1,1]) {
    for (let i = 0; i < 3; i++) _rigButton(out, side*0.096, 0.055-i*0.037, -0.027, 0.008, BTN[(i+(side>0?1:0))%4]);
    _rigButton(out, side*0.132, 0.079, -0.023, 0.010, BTN[side<0?2:0]);
    _rigButton(out, side*0.126, 0.045, -0.025, 0.008, BTN[side<0?1:3]);
  }
  // Three lower multifunction rotaries, with index marks and raised selectors.
  for (const [x,col] of [[-0.064,BTN[3]],[0,BTN[1]],[0.064,BTN[2]]])
    _rigButton(out, x, -0.063, -0.026, 0.017, col, true);
  for (const x of [-0.064,0,0.064]) for (let i=0;i<8;i++) {
    const a=i/8*Math.PI*2, c=Math.cos(a), sn=Math.sin(a);
    _rigBar(out,x+c*0.021,-0.063+sn*0.021,x+c*0.024,-0.063+sn*0.024,-0.030,0.0014,0.001,[0.54,0.55,0.51]);
  }
  // Fasteners, separate from controls; no fake HDR glow on physical buttons.
  for (const x of [-0.104,0.104]) for (const y of [-0.072,0.084])
    _rigDisc(out, x, y, -0.009, 0.003, 8, [0.40,0.42,0.44]);
  _rigRounded(out, -0.082, 0.024, -0.0290, 0.024, 0.024, 0.003, 0.004, [0.10,0.11,0.13]);
  _rigBox(out, -0.082, 0.024, -0.0294, 0.019, 0.019, 0.003, [0.06,0.05,0.08]);
}
function _wheelPaddles(out, wide) {
  for (const s of [-1,1]) {
    _rigRounded(out, s*0.140, 0.006, 0.052, wide?0.075:0.060, 0.105, 0.012, 0.018, [0.13,0.14,0.16]);
    _rigRounded(out, s*0.078, -0.082, 0.047, 0.077, 0.022, 0.010, 0.007, [0.17,0.18,0.20]); // clutch paddles
  }
}
// Curved backs, individual finger pads, an inboard thumb and tapered cuffs.
// All styles use the same nine-and-three grip points and rotate with the wheel.
function _wheelHands(out, acc, c1) {
  const GLOVE=[0.15,0.16,0.175], SEAM=[0.18,0.20,0.22];
  for (const side of [-1,1]) {
    _rigEllipsoid(out,side*0.181,-0.006,-0.007,0.028,0.057,0.027,GLOVE);
    for(let i=0;i<4;i++) _rigEllipsoid(out,side*0.164,0.039-i*0.025,0.017,0.018,0.012,0.019,GLOVE);
    _rigEllipsoid(out,side*0.144,0.029,-0.021,0.013,0.026,0.018,GLOVE,-side*0.58);
    _rigEllipsoid(out,side*0.189,-0.115,-0.003,0.025,0.068,0.025,GLOVE,-side*0.08);
    _rigGrip(out,[[side*0.166,-0.064],[side*0.177,-0.068],[side*0.192,-0.068],[side*0.209,-0.063]],0.004,0.026,c1 ? c1.map(v=>v*0.35) : SEAM);
    // Small embroidery and a shaped knuckle seam, rather than a rigid badge.
    _rigBar(out,side*0.176,0.016,side*0.185,0.005,-0.034,0.002,0.001,SEAM);
    _rigBar(out,side*0.185,0.005,side*0.193,0.016,-0.032,0.002,0.001,SEAM);
  }
}
const COCKPIT_WHEELS = ["f1", "gt", "butterfly", "yoke", "endurance", "retro", "round"];
function _wheelRimF1(out, CARB, RUB, GRIP, acc, style) {
  for (const s of [-1,1]) {
    _rigGrip(out, [[s*0.151,0.103],[s*0.169,0.084],[s*0.179,0.038],[s*0.176,-0.022],[s*0.155,-0.099]], 0.022, 0.029, RUB);
    _rigBar(out, s*0.093, 0.080, s*0.151, 0.090, 0.010, 0.042, 0.039, CARB);
  }
  if (style === "gt") {
    // A continuous flat-bottom rim around the modern display and hand grips.
    _rigGrip(out, [[-0.155,-0.099],[-0.12,-0.123],[0,-0.128],[0.12,-0.123],[0.155,-0.099]],0.015,0.024,RUB);
    _rigGrip(out, [[-0.151,0.103],[-0.11,0.124],[0,0.132],[0.11,0.124],[0.151,0.103]],0.014,0.022,RUB);
    _rigRounded(out,0,0.132,-0.007,0.012,0.024,0.038,0.004,acc||GRIP);
  } else if (style === "butterfly") {
    // Angular wings and a tapered lower housing leave the top of the rim open.
    for (const side of [-1,1]) {
      _rigPlate(out,[[side*0.090,-0.091],[side*0.160,-0.080],[side*0.162,0.094],[side*0.120,0.133],[side*0.090,0.100]],0.020,0.022,CARB);
      _rigBar(out,side*0.108,-0.080,side*0.148,-0.063,-0.006,0.009,0.008,acc||GRIP);
    }
  }
  if (style === "yoke") {
    _rigGrip(out,[[-0.155,-0.099],[-0.115,-0.131],[0,-0.141],[0.115,-0.131],[0.155,-0.099]],0.014,0.022,RUB);
    for (const side of [-1,1]) _rigPlate(out,[[side*0.095,-0.072],[side*0.151,-0.093],[side*0.158,-0.117],[side*0.110,-0.127]],0.016,0.016,CARB);
  } else if (style === "endurance") {
    _rigGrip(out,[[-0.155,-0.099],[-0.118,-0.127],[-0.060,-0.141],[0,-0.144],[0.060,-0.141],[0.118,-0.127],[0.155,-0.099]],0.013,0.022,RUB);
    _rigGrip(out,[[-0.151,0.103],[-0.130,0.127],[-0.080,0.135],[0,0.135],[0.080,0.135],[0.130,0.127],[0.151,0.103]],0.012,0.022,RUB);
    for (const side of [-1,1]) _rigBar(out,side*0.080,-0.085,side*0.118,-0.117,0.012,0.024,0.018,CARB);
    _rigRounded(out,0,0.135,-0.004,0.016,0.020,0.033,0.004,acc||GRIP);
  }
  _wheelPaddles(out, true);
}
// 2000s butterfly: compact monochrome LCD, sparse controls, mechanical paddles.
function _wheelRimRetro(out, CARB, RUB, GRIP, acc) {
  const BTN = [[0.85,0.13,0.10],[0.16,0.4,0.85],[0.82,0.68,0.12],[0.55,0.58,0.61]];
  _rigPlate(out, [[-0.085,-0.089],[0.085,-0.089],[0.102,-0.045],[0.127,0.055],
    [0.111,0.082],[-0.111,0.082],[-0.127,0.055],[-0.102,-0.045]], 0.012, 0.038, CARB);
  for (const s of [-1,1]) {
    _rigGrip(out, [[s*0.135,-0.091],[s*0.166,-0.045],[s*0.178,0.020],[s*0.165,0.081],[s*0.135,0.099]], 0.023, 0.027, RUB);
    for(let i=0;i<3;i++) _rigButton(out, s*0.079, 0.025-i*0.030, -0.015, 0.008, BTN[(i+(s>0?1:0))%4]);
    _rigButton(out, s*0.120, 0.064, -0.014, 0.009, BTN[s<0?2:0]);
    _rigButton(out, s*0.043, -0.058, -0.012, 0.015, BTN[2], true);
  }
  _rigRounded(out, 0, 0.042, -0.010, 0.084, 0.034, 0.006, 0.004, [0.02,0.02,0.025]);
  _rigBox(out, 0, 0.042, -0.014, 0.070, 0.024, 0.003, [0.16,0.22,0.12]);
  // An era-correct small monochrome display: no simulated telemetry on it.
  for(const x of [-0.020,0,0.020]) _rigBar(out,x,0.036,x+0.008,0.048,-0.017,0.003,0.001,[0.055,0.075,0.045]);
  for(let i=0;i<7;i++) _rigDisc(out, -0.042+i*0.014, 0.071, -0.016, 0.0035, 8, [0.12,0.15,0.10]);
  _wheelPaddles(out, false);
}
function _wheelRimRound(out, GRIP, acc) {
  const R=0.165, MET=[0.46,0.48,0.50], LEATHER=[0.14,0.095,0.065];
  const path=Array.from({length:41},(_,i)=>[R*Math.cos(i/40*Math.PI*2),R*Math.sin(i/40*Math.PI*2)]);
  _rigGrip(out,path,0.016,0.019,LEATHER);
  for(const s of [-1,1]) _rigPlate(out, [[s*0.025,-0.020],[s*0.146,-0.026],[s*0.151,0.007],[s*0.027,0.018]],0.018,0.009,MET);
  _rigPlate(out,[[-0.020,-0.026],[0.020,-0.026],[0.015,-0.151],[-0.015,-0.151]],0.018,0.009,MET);
  _rigButton(out,0,0,0.004,0.032,[0.18,0.20,0.22]); // compact mechanical boss; no road-car horn
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2;_rigDisc(out,Math.cos(a)*0.022,Math.sin(a)*0.022,-0.006,0.003,8,[0.63,0.65,0.67]);}
  _rigRounded(out,0,R,-0.002,0.013,0.026,0.042,0.004,acc||[0.55,0.52,0.42]);
}
// Keyed like _cockpitDecalMesh: the chosen wheel and the player's livery colours
// join the key, so a garage livery edit (resolveLivery is store.rev-invalidated
// upstream) or a WHEEL change frees and rebuilds it. liv may be null — the
// wheel then falls back to the neutral carbon look.
let cockpitWheelMesh = null, _cockpitWheelKey = "";
const _wheelTint = (c, k) => c ? [c[0] * k, c[1] * k, c[2] * k] : null;
function getCockpitWheel(liv, style) {
  const st = COCKPIT_WHEELS.includes(style) ? style : COCKPIT_WHEELS[0];
  // Livery colours are display-range; against the near-black rig they glare,
  // so team colour lands at ~45% (grips/straps) and ~55% (the 12-o'clock
  // stripe, which is SUPPOSED to pop).
  const c1 = _wheelTint(liv && liv.c1, 0.45);
  const acc = _wheelTint(liv && (liv.accent || liv.c2), 0.55);
  const c2 = _wheelTint(liv && liv.c2, 0.40);
  const kc = (c) => c ? c.map((v) => v.toFixed(2)).join(",") : "-";
  const wantKey = st + "|" + kc(c1) + "|" + kc(acc) + "|" + kc(c2);
  if (cockpitWheelMesh && _cockpitWheelKey !== wantKey) {
    if (_gfx.freeMesh) _gfx.freeMesh(cockpitWheelMesh);
    cockpitWheelMesh = null;
  }
  if (cockpitWheelMesh) return cockpitWheelMesh;
  _cockpitWheelKey = wantKey;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const CARB = [0.09, 0.095, 0.105], RUB = [0.11, 0.115, 0.12];
  const GRIP = c1 || RUB;
  if (st === "round") _wheelRimRound(out, GRIP, acc);
  else if (st === "retro") _wheelRimRetro(out, CARB, RUB, GRIP, acc);
  else {
    _wheelRimF1(out, CARB, RUB, GRIP, acc, st);
    _wheelScreen(out, c2);
  }
  // Physical fascia fasteners, paddle pivots and stitched glove cuffs on all wheels.
  for (const side of [-1,1]) {
    const bx=side*(st === "round" ? 0.075 : 0.084), by=st === "round" ? -0.002 : -0.092;
    _rigDisc(out,bx,by,-0.019,0.0035,8,[0.42,0.44,0.46]);
    _rigBar(out,bx-0.0018,by,bx+0.0018,by,-0.020,0.0008,0.001,[0.025,0.03,0.035]);
    if (st !== "round") {
      _rigDisc(out,side*0.130,0.026,0.043,0.004,8,[0.36,0.38,0.40]);
      for (let i=0;i<4;i++) _rigBar(out,side*0.146,-0.022+i*0.013,side*0.161,-0.018+i*0.013,0.044,0.0015,0.001,[0.22,0.23,0.25]);
    }
  }
  _wheelHands(out, acc, c1);
  cockpitWheelMesh = _gfx.createMesh(out);
  return cockpitWheelMesh;
}
// The COLUMN AND BULKHEAD a wheel clips onto, for VISOR — the cockpit with the
// wheel taken off (js/camera/vantage.js) — and for the NONE cockpit interior. Without them the view looked down
// onto a bare deck with the halo pillar hanging in the air. Wheel-local like
// getCockpitWheel and drawn at the same _rigT, never rolled: the quick-release
// boss sits where the wheel's hub was, the column runs forward (+z, away from
// the driver) into a carbon front bulkhead that closes the front of the opening
// wall to wall (0.76 local = x ±0.30 world, the tub's inner walls are at ±0.315).
// Neutral carbon, so it needs no livery key.
let cockpitDashMesh = null;
function getCockpitDash() {
  if (cockpitDashMesh) return cockpitDashMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const CARB = [0.04, 0.04, 0.05], DARK = [0.015, 0.015, 0.02], MET = [0.30, 0.30, 0.33];
  _rigTube(out, [[0,-0.012,0.025],[0,-0.012,0.32]], 0.028, CARB);        // steering column into the bulkhead
  _rigRing(out, 0, 0, 0.020, 0.037, 16, 0.012, 0.034, MET);             // quick-release boss where the hub clips on
  _rigDisc(out, 0, 0, 0.001, 0.027, 12, DARK);            // its spline socket, facing the driver
  _rigPlate(out, [[-0.28,-0.25],[0.28,-0.25],[0.34,-0.15],[0.37,0.04],[0.34,0.07],[-0.34,0.07],[-0.37,0.04],[-0.34,-0.15]], 0.32, 0.035, CARB);          // front bulkhead, down to the coaming (world y 0.43..0.69)
  _rigTube(out, [[-0.34,0.064,0.305],[-0.17,0.072,0.305],[0,0.075,0.305],[0.17,0.072,0.305],[0.34,0.064,0.305]], 0.009, [0.10,0.10,0.12]); // its top lip
  for (let i=0;i<6;i++) {
    const a=i/6*Math.PI*2;
    _rigDisc(out,Math.cos(a)*0.032,Math.sin(a)*0.032,-0.001,0.003,8,[0.50,0.52,0.54]);
  }
  for (const side of [-1,1]) for (let i=0;i<4;i++)
    _rigRounded(out,side*(0.22+i*0.026),-0.080,0.298,0.012,0.078,0.008,0.003,DARK);
  cockpitDashMesh = _gfx.createMesh(out);
  return cockpitDashMesh;
}
// --- COCKPIT INTERIORS (js/camera/cockpit-opts.js INTERIOR) ------------------
// The bodywork an interior adds around its seat, CAR-LOCAL (the frame the body
// is drawn in: y up from the road, z forward, x across) and never rolled with
// the wheel (CockpitOpts INTERIOR). TEAM: padding in the team's colours. CLASSIC:
// a 1960s cockpit — a padded leather scuttle, a painted dash with round gauges,
// a wraparound aeroscreen. The eye is CockpitOpts.layout(); everything here
// sits >= 0.40 m ahead of it (the cockpit near plane is 0.30).
// A quad wound so it faces n (the _rigBox convention: (b-a)x(c-a) . n > 0).
function _rigQuad(out, a, b, c, d, n, col) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const q = ((uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2]) >= 0 ? [a, b, c, d] : [a, d, c, b];
  const i0 = out.pos.length / 3;
  for (const v of q) { out.pos.push(v[0], v[1], v[2]); out.nrm.push(n[0], n[1], n[2]); out.col.push(col[0], col[1], col[2]); }
  out.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
}
// A square beam w thick from p0 to p1, in any direction: pillars and rails.
function _rigBeam(out, p0, p1, w, col) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(d[0], d[1], d[2]) || 1;
  const u = [d[0] / L, d[1] / L, d[2] / L], ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cr = (x, y) => [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const nz = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const a = nz(cr(u, ref)), b = cr(u, a), h = w / 2;
  const P = (p, sa, sb) => [p[0] + (a[0] * sa + b[0] * sb) * h, p[1] + (a[1] * sa + b[1] * sb) * h, p[2] + (a[2] * sa + b[2] * sb) * h];
  const ng = (v) => [-v[0], -v[1], -v[2]];
  _rigQuad(out, P(p0, 1, -1), P(p1, 1, -1), P(p1, 1, 1), P(p0, 1, 1), a, col);          // the four sides
  _rigQuad(out, P(p0, -1, -1), P(p1, -1, -1), P(p1, -1, 1), P(p0, -1, 1), ng(a), col);
  _rigQuad(out, P(p0, -1, 1), P(p1, -1, 1), P(p1, 1, 1), P(p0, 1, 1), b, col);
  _rigQuad(out, P(p0, -1, -1), P(p1, -1, -1), P(p1, 1, -1), P(p0, 1, -1), ng(b), col);
  _rigQuad(out, P(p0, -1, -1), P(p0, 1, -1), P(p0, 1, 1), P(p0, -1, 1), ng(u), col);
  _rigQuad(out, P(p1, -1, -1), P(p1, 1, -1), P(p1, 1, 1), P(p1, -1, 1), u, col);
}
// Rounded removable padding: circular sections follow the tub instead of
// exposing the corners of a rectangular beam at the driver's eye.
function _rigTube(out, path, r, col) {
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=v=>{const L=Math.hypot(...v);return v.map(x=>x/L);}, start=out.pos.length/3, dirs=[];
  for(let i=0;i<path.length;i++) {
    const p=path[i], lo=path[Math.max(0,i-1)], hi=path[Math.min(path.length-1,i+1)];
    const d=unit(hi.map((x,k)=>x-lo[k])), a=unit(cross(d,Math.abs(d[1])<0.9?[0,1,0]:[1,0,0])), b=cross(d,a); dirs.push(d);
    for(let j=0;j<8;j++) {
      const t=j/8*Math.PI*2, n=a.map((x,k)=>x*Math.cos(t)+b[k]*Math.sin(t));
      out.pos.push(...p.map((x,k)=>x+r*n[k])); out.nrm.push(...n); out.col.push(...col);
    }
  }
  for(let i=0;i<path.length-1;i++) for(let j=0;j<8;j++) {
    const a=start+i*8+j,b=start+i*8+(j+1)%8;out.idx.push(a,b,b+8,a,b+8,a+8);
  }
  for(const i of [0,path.length-1]) {
    const c=out.pos.length/3;out.pos.push(...path[i]);out.nrm.push(...dirs[i].map(x=>i===0?-x:x));out.col.push(...col);
    for(let j=0;j<8;j++) {const a=start+i*8+j,b=start+i*8+(j+1)%8;out.idx.push(c,i===0?b:a,i===0?a:b);}
  }
}
// A flat disc facing the driver (-z) at z = cz: gauge faces.
function _rigDisc(out, cx, cy, cz, r, n, col) {
  const i0 = out.pos.length / 3;
  out.pos.push(cx, cy, cz); out.nrm.push(0, 0, -1); out.col.push(col[0], col[1], col[2]);
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2;
    out.pos.push(cx + r * Math.cos(t), cy + r * Math.sin(t), cz); out.nrm.push(0, 0, -1); out.col.push(col[0], col[1], col[2]);
  }
  // CCW about +z is clockwise seen from the driver (-z), so wind it backwards.
  for (let i = 0; i < n; i++) out.idx.push(i0, i0 + 1 + (i + 1) % n, i0 + 1 + i);
}
// A ring (bezel) about (cx, cy) in the plane z = cz.
function _rigRing(out, cx, cy, cz, r, n, w, d, col) {
  const ext = w * 0.18;
  for (let i = 0; i < n; i++) {
    const t0 = i / n * Math.PI * 2, t1 = (i + 1) / n * Math.PI * 2;
    const x0 = r * Math.cos(t0), y0 = r * Math.sin(t0), x1 = r * Math.cos(t1), y1 = r * Math.sin(t1);
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, ex = (x1 - x0) / L * ext, ey = (y1 - y0) / L * ext;
    _rigBar(out, cx + x0 - ex, cy + y0 - ey, cx + x1 + ex, cy + y1 + ey, cz, w, d, col);
  }
}
// A round gauge: bezel, face and a needle at `turn` (0..1 of its sweep).
function _rigGauge(out, cx, cy, cz, r, turn, face, bezel) {
  _rigRing(out, cx, cy, cz, r, 20, r * 0.16, 0.008, bezel);
  _rigDisc(out, cx, cy, cz + 0.002, r * 0.94, 20, face);
  for (let i=0;i<=10;i++) {
    const t = Math.PI*(1.25-1.5*i/10), c = Math.cos(t), s = Math.sin(t);
    _rigBar(out,cx+c*r*0.70,cy+s*r*0.70,cx+c*r*0.86,cy+s*r*0.86,cz-0.001,r*0.035,0.001,[0.11,0.12,0.13]);
  }
  const a = Math.PI * (1.25 - 1.5 * turn);
  _rigBar(out, cx, cy, cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, cz - 0.002, r * 0.08, 0.002, [1.4, 0.22, 0.08]);
}
// Lofted panels with outward normals and closed ends, rather than box walls.
function _rigLiner(out, rings, col) {
  const face=(a,b,c,d)=>{
    const u=b.map((v,i)=>v-a[i]), v=c.map((q,i)=>q-a[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]], L=Math.hypot(...n);
    _rigQuad(out,a,b,c,d,n.map(q=>q/L),col);
  };
  for(let i=0;i<rings.length-1;i++) for(let j=0;j<rings[i].length;j++) {
    const k=(j+1)%rings[i].length; face(rings[i][j],rings[i+1][j],rings[i+1][k],rings[i][k]);
  }
  for(const end of [0,rings.length-1]) {
    const q=end===0 ? rings[end].slice().reverse() : rings[end];
    for(let j=1;j<q.length-1;j++) {
      const before=out.idx.length; face(q[0],q[j],q[j+1],q[0]); out.idx.length=before+3;
    }
  }
}
// A closed lower tub shared by EVERY trim and body choice. Extending behind
// the eye keeps the near plane from cutting an opening into the road below.
function _cockpitLowerTub(out, kind, accent) {
  const carbon=[0.065,0.070,0.080], edge=[0.16,0.17,0.19], metal=[0.32,0.34,0.36];
  const pad=kind === "classic" ? [0.14,0.085,0.05] : kind === "suede" ? [0.14,0.13,0.12] : [0.09,0.095,0.105];
  _rigBox(out,0,0.245,0.20,0.66,0.040,1.80,carbon); // continuous opaque floor
  _rigBox(out,0,0.450,1.08,0.66,0.450,0.040,carbon); // closed footwell end
  for (const side of [-1,1]) {
    const rings=[[-0.70,0.326,0.690],[0.22,0.313,0.677],[1.10,0.300,0.655]].map(([z,x,y])=>{
      const ring=[[side*0.230,0.265,z],[side*0.255,0.245,z],[side*x,y,z],[side*(x-0.016),y-0.008,z],
        [side*(x-0.027),y-0.035,z],[side*(x-0.037),y-0.115,z],[side*0.244,0.410,z]];
      return side>0 ? ring : ring.reverse();
    });
    _rigLiner(out,rings,pad);
    _rigBeam(out,[side*0.246,0.365,-0.20],[side*0.238,0.365,0.81],0.006,edge);
    for (const z of [0.10,0.34,0.58,0.80])
      _rigBeam(out,[side*0.244,0.375,z],[side*0.289,0.631,z],0.005,edge);
    _rigRounded(out,side*0.212,0.440,0.17,0.045,0.055,0.055,0.007,metal);
    _rigRounded(out,side*0.212,0.440,0.137,0.028,0.033,0.008,0.004,accent);
    _rigBeam(out,[side*0.16,0.275,-0.15],[side*0.16,0.275,0.90],0.012,edge);
    for (const y of [0.37,0.61]) {
      _rigDisc(out,side*0.270,y,1.052,0.007,8,metal);
      _rigBar(out,side*0.267,y,side*0.273,y,1.051,0.0015,0.001,[0.025,0.03,0.035]);
    }
  }
  _rigRounded(out,0,0.345,-0.025,0.44,0.085,0.37,0.018,pad); // seat base
  _rigBeam(out,[-0.20,0.382,0.10],[0.20,0.382,0.10],0.004,edge);
  _rigBox(out,0,0.320,0.76,0.34,0.050,0.16,carbon); // raised pedal heel rest
  for (const x of [-0.10,0,0.10]) _rigBeam(out,[x,0.349,0.69],[x,0.349,0.83],0.006,edge);
}
// Modern tub trim: rounded removable pads, a carbon scuttle, moulded seam
// lines and recessed fasteners. TEAM adds accents to the same shaped trim.
function _teamCabin(out, pad, stitch) {
  const CARB = [0.08,0.085,0.095];
  for (const side of [-1,1]) {
    _rigTube(out,[[side*0.298,0.719,-0.16],[side*0.296,0.716,-0.04],[side*0.291,0.708,0.10],
      [side*0.281,0.694,0.24],[side*0.262,0.682,0.36],[side*0.231,0.687,0.42]],0.024,pad);
    _rigBeam(out,[side*0.288,0.730,-0.04],[side*0.274,0.698,0.31],0.003,stitch);
    _rigRounded(out,side*0.281,0.704,0.21,0.035,0.044,0.07,0.008,CARB);
    _rigDisc(out, side*0.281, 0.713, 0.172, 0.009, 12, [0.26,0.28,0.30]);
    _rigDisc(out, side*0.281, 0.713, 0.171, 0.004, 8, [0.035,0.04,0.045]);
  }
  _rigTube(out,[[-0.231,0.687,0.42],[-0.15,0.704,0.44],[0,0.709,0.45],[0.15,0.704,0.44],[0.231,0.687,0.42]],0.024,CARB);
  _rigRounded(out,0,0.721,0.400,0.44,0.012,0.008,0.005,pad);
  _rigBar(out,-0.18,0.728,0.18,0.728,0.394,0.002,0.002,stitch);
}
function _classicCabin(out, paint) {
  const LEATHER = [0.13, 0.075, 0.045], CHROME = [0.62, 0.62, 0.65], FACE = [0.55, 0.53, 0.48];
  // Padded scuttle round the front of the opening. It starts just ahead of the
  // eye (z -0.20): run back past it, the rails filled the lower corners.
  const rim = [[-0.30, 0.69, -0.05], [-0.30, 0.69, 0.25], [-0.18, 0.71, 0.40], [0.18, 0.71, 0.40], [0.30, 0.69, 0.25], [0.30, 0.69, -0.05]];
  _rigTube(out,rim,0.020,LEATHER);
  _rigRounded(out, 0, 0.745, 0.47, 0.50, 0.13, 0.03, 0.038, paint);        // painted dash panel
  _rigGauge(out, 0, 0.75, 0.453, 0.045, 0.62, FACE, CHROME);     // rev counter, centre
  _rigGauge(out, -0.15, 0.745, 0.453, 0.028, 0.35, FACE, CHROME); // oil / water
  _rigGauge(out, 0.15, 0.745, 0.453, 0.028, 0.45, FACE, CHROME);
  const scr = _classicScreen();
  for (const [a, b] of scr.frame) _rigBeam(out, a, b, 0.012, CHROME);   // aeroscreen frame
}
// The wraparound aeroscreen: a centre panel and two swept side panels, top edge
// below the eye (0.90) so the chrome never cuts the horizon.
function _classicScreen() {
  const cb = [[-0.14, 0.81, 0.50], [0.14, 0.81, 0.50]], ct = [[-0.13, 0.87, 0.45], [0.13, 0.87, 0.45]];
  const sb = (s) => [s * 0.26, 0.80, 0.40], st = (s) => [s * 0.24, 0.86, 0.36];
  const panels = [[cb[0], cb[1], ct[1], ct[0]], [cb[1], sb(1), st(1), ct[1]], [sb(-1), cb[0], ct[0], st(-1)]];
  const frame = [[ct[0], ct[1]], [ct[1], st(1)], [ct[0], st(-1)], [sb(1), st(1)], [sb(-1), st(-1)]];
  return { panels, frame };
}
let _cabinMesh = null, _cabinKey = "";
function getCockpitCabin(kind, liv) {
  const tint = (c, k, d) => c ? [c[0] * k, c[1] * k, c[2] * k] : d;
  const col = tint(liv && liv.c1, 0.55, [0.25, 0.05, 0.05]), acc = tint(liv && (liv.accent || liv.c2), 0.6, [0.6, 0.6, 0.62]);
  const key = kind + "|" + col.concat(acc).map((v) => v.toFixed(2)).join(",");
  if (_cabinMesh && _cabinKey !== key) { if (_gfx.freeMesh) _gfx.freeMesh(_cabinMesh); _cabinMesh = null; }
  if (_cabinMesh) return _cabinMesh;
  _cabinKey = key;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  _cockpitLowerTub(out, kind, acc);
  if (kind === "classic") _classicCabin(out, col);
  else _teamCabin(out, kind === "team" ? col : kind === "suede" ? [0.12,0.115,0.11] : [0.095,0.10,0.11], kind === "team" ? acc : [0.18,0.19,0.20]);
  if (kind === "suede" || kind === "ribbed") {
    const pad = kind === "suede" ? [0.18,0.17,0.16] : [0.055,0.060,0.065];
    for (const side of [-1,1]) {
      for (let i=0;i<7;i++) {
        const z=0.02+i*0.045, y=0.724-i*0.0033;
        _rigBeam(out,[side*0.278,y,z],[side*0.304,y-0.008,z],kind === "ribbed" ? 0.007 : 0.002,pad);
      }
      _rigBeam(out,[side*0.300,0.733,-0.02],[side*0.281,0.702,0.32],0.002,kind === "suede" ? acc : [0.22,0.23,0.24]);
    }
  }
  _cabinMesh = _gfx.createMesh(out);
  return _cabinMesh;
}
// CLASSIC's aeroscreen glass, drawn with an alpha material (car-draw.js _glassOpts).
const _glassMeshes = {};
function getCockpitGlass(kind) {
  if (_glassMeshes[kind]) return _glassMeshes[kind];
  const out = { pos: [], nrm: [], col: [], idx: [] }, G = [0.55, 0.62, 0.70], back = [0, 0.55, -0.83];
  for (const q of _classicScreen().panels) _rigQuad(out, q[0], q[1], q[2], q[3], back, G);
  _glassMeshes[kind] = _gfx.createMesh(out);
  return _glassMeshes[kind];
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
  const COLS = [[0.2,1.3,0.35],[1.2,0.82,0.12],[0.35,0.55,1.5]];
  const count = Math.round(Math.max(0, Math.min(8, lit)) / 8 * 15);
  for (let i = 0; i < 15; i++) {
    const col = lit === 9 ? [0.35,0.55,1.5] : i < count ? COLS[Math.floor(i/5)] : [0.055,0.06,0.065];
    _rigDisc(out, -0.070 + i*0.010, 0.082, -0.030, 0.0034, 8, col);
  }
  _ledMeshes[lit] = _gfx.createMesh(out);
  return _ledMeshes[lit];
}
// 7-seg digit table, shared by the gear and speed LCD readouts.
const _SEG7 = [
  [1,1,1,1,1,1,0],[0,1,1,0,0,0,0],[1,1,0,1,1,0,1],[1,1,1,1,0,0,1],[0,1,1,0,0,1,1],
  [1,0,1,1,0,1,1],[1,0,1,1,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1],
];
// The 7 segment boxes (top, upper-right, lower-right, bottom, lower-left,
// upper-left, middle) as [cy, cx, halfW, halfH], scaled off one digit's h/w/t/q.
function _seg7Layout(h, w, t, q) {
  return [ [h/2, 0, w, t], [q, w/2, t, h/2], [-q, w/2, t, h/2],
           [-h/2, 0, w, t], [-q, -w/2, t, h/2], [q, -w/2, t, h/2], [0, 0, w, t] ];
}
// 7-seg GEAR digit, wheel-local on the LCD centre (cached per gear).
const _gearMeshes = {};
function getGearDigit(g) {
  if (_gearMeshes[g]) return _gearMeshes[g];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const GRN = [1.3, 0.65, 0.12];   // original orange gear, with gentler bloom
  const h = 0.026, w = h * 0.55, t = h * 0.16, q = h / 4, cy = 0.022, cz = -0.0335;
  const L = _seg7Layout(h, w, t, q);
  const seg = _SEG7[g % 10];
  for (let i = 0; i < 7; i++) if (seg[i])
    _rigBox(out, 0.014 + L[i][1], cy + L[i][0], cz, L[i][2], L[i][3], 0.006, GRN);
  _gearMeshes[g] = _gfx.createMesh(out);
  return _gearMeshes[g];
}
const _spdMeshes = {};
function getSpeedDigit(d) {
  if (_spdMeshes[d]) return _spdMeshes[d];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const CYN = [0.20, 1.2, 1.2];
  const h = 0.017, w = h * 0.55, t = h * 0.16, q = h / 4;
  const L = _seg7Layout(h, w, t, q);
  const seg = _SEG7[d % 10];
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
// The pre-race grid strobe, in one place: game.js draws from it and
// __apex.carEffects() reports from it, so the hook cannot drift from the draw.
// ~5 Hz is the 2026 "MGU-K recharging" fast flash — the pattern a stationary car
// holding full charge shows, which is the blinking on every real grid.
function gridStrobe(countT) { return ((countT * 5.0) % 1) < 0.5; }
// REAR LIGHTS, 2026 spec. The car carries three of them, not one: the oval Rear
// Impact Structure light in the centre of the crash structure, and — new for
// 2026 — a red light on each rear wing endplate that MIRRORS the RIS flash
// pattern. That is why a modern car reads as three flashing points from behind
// rather than a single dot, and why they share one emissive here.
//
// Endplate anchor: Car3D.endplate(aLvl) puts the plates at x +-0.50 with their
// rear face at z -2.69 at EVERY aero level; only the vertical extent moves
// (y 0.475..0.755 at level 0, 0.525..1.105 at level 4). y 0.62 is inside the
// plate at all five, so this needs no per-car aero lookup. z -2.705 clears the
// face by the same 15 mm the RIS light uses against its own housing.
let _epLightMesh = null;
function getEndplateLight() {
  if (_epLightMesh) return _epLightMesh;
  _epLightMesh = _gfx.createMesh(_flatQuadData(0.026, 0.034, [2.4, 0.10, 0.08]));
  return _epLightMesh;
}
// Its own scratch and its own opts bag ON PURPOSE. game.js's _ringWorld /
// _rainLightOpts are shared singletons walked by the brake ring, the ERS strip
// and the flame inside one loop iteration; a helper that wrote a field on one of
// them would leak it into every later draw that frame.
const _rlW = new Float32Array(16);
const _RL_FX = { emissive: 1, roughness: 0.9, specular: 0, noAlphaWrite: true };
function drawRearLights(mat, emissive) {
  _RL_FX.emissive = emissive;
  const W = _rlW;
  // RIS light: 0.50 up, 2.615 back — 15 mm behind the baked LED face (z -2.60),
  // because coplanar quads z-fight.
  W.set(mat);
  W[12] += W[4] * 0.50 - W[8] * 2.615;
  W[13] += W[5] * 0.50 - W[9] * 2.615;
  W[14] += W[6] * 0.50 - W[10] * 2.615;
  _gfx.draw(getRainLight(), W, _RL_FX);
  for (const s of [-1, 1]) {
    W.set(mat);
    W[12] += W[0] * (s * 0.50) + W[4] * 0.62 - W[8] * 2.705;
    W[13] += W[1] * (s * 0.50) + W[5] * 0.62 - W[9] * 2.705;
    W[14] += W[2] * (s * 0.50) + W[6] * 0.62 - W[10] * 2.705;
    _gfx.draw(getEndplateLight(), W, _RL_FX);
  }
}
// TAIL-LIGHT EMIT 0: the red spill a tail-light casts on the road, painted
// instead of lit by a point light — a flat decal behind the car, drawn through
// the decal path every backend already has (createTexMesh + createTexture +
// drawDecal: lit colour + tex * glow, alpha-blended, depth-write off). No light
// slot, so the lamps keep it (frame-lights.js appendCarTailLights). Built once;
// null forever if the backend or the page cannot make it (no canvas in a node
// VM, a backend without decals) — the lens itself still draws either way.
let _tgMesh = null, _tgTex = null, _tgTried = false;
const _tgW = new Float32Array(16);
const _TG_OPTS = { glow: 1.6 };   // one constant: glow is part of the decal program key
function _tailGlowRes() {
  if (_tgTried) return _tgMesh && _tgTex;
  _tgTried = true;
  try {
    if (!_gfx.createTexMesh || !_gfx.createTexture || !_gfx.drawDecal || typeof document === "undefined") return false;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,34,22,0.38)");
    gr.addColorStop(0.4, "rgba(255,26,18,0.15)");
    gr.addColorStop(1, "rgba(255,20,14,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    _tgTex = _gfx.createTexture(cv);
    // Unit quad in the ground plane (x across, z along), facing up.
    _tgMesh = _gfx.createTexMesh({
      pos: [-1, 0, -1,  1, 0, -1,  1, 0, 1,  -1, 0, 1],
      nrm: [0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0],
      uv: [0, 0,  1, 0,  1, 1,  0, 1],
      idx: [0, 2, 1, 0, 3, 2],
    });
  } catch (e) {
    try { Log.warn("gfx", "tail glow decal unavailable —", e); } catch (_) {}
    _tgMesh = _tgTex = null;
  }
  return _tgMesh && _tgTex;
}
// groundMat: the car's road-aligned basis (game.js _groundMat — the blob shadow's).
// amt: TAIL-LIGHT GLOW x brake flare; it scales the pool's SIZE, since the
// decal's brightness is fixed per program.
// track / s (optional): the car's circuit and arc position. The decal reaches
// ~4 m behind the car, where the road is no longer on the car's ground plane —
// a flat quad clipped into dips and floated over crests. With them, the quad is
// pitched to the centreline's rise between the car and the decal centre.
const _tgS0 = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _tgS1 = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
function drawTailGlow(groundMat, amt, track, s) {
  if (!(amt > 0) || !_tailGlowRes()) return;
  const W = _tgW, k = Math.min(1.8, Math.sqrt(amt));
  const hw = 1.25 * k, hl = 2.6 * k;   // half-width / half-length, metres
  const dc = 2.4 + hl * 0.55;          // decal centre, metres behind the car
  // Road rise at the decal centre off the car's ground plane (world Y), clamped.
  let rise = 0;
  if (track && s != null && typeof Tracks !== "undefined" && Tracks.sample) {
    Tracks.sample(track, s, _tgS0); Tracks.sample(track, s - dc, _tgS1);
    rise = Math.max(-1.5, Math.min(1.5, (_tgS1.p[1] - _tgS0.p[1]) + groundMat[9] * dc));
  }
  // Centred where a point light's pool lands (2.4 m back, aimed down-rear):
  // ~1.5 m past the rear wing, 8 cm up so the road cannot
  // z-fight it. The front half tucks under the car's own rear.
  for (let i = 0; i < 3; i++) {
    const up = i === 1 ? 1 : 0;
    W[i] = groundMat[i] * hw; W[4 + i] = groundMat[4 + i];
    W[8 + i] = groundMat[8 + i] * hl - up * (rise / dc) * hl;
    W[12 + i] = groundMat[12 + i] + groundMat[4 + i] * 0.08 - groundMat[8 + i] * dc + up * rise;
  }
  W[3] = W[7] = W[11] = 0; W[15] = 1;
  _gfx.drawDecal(_tgMesh, W, _tgTex, _TG_OPTS);
}
// 2026 amber mirror lamps: a car under 20 km/h or stopped lights amber on both
// mirror housings (The Race, 2026 rear-lights explainer). A SIDE-facing quad in
// the yz plane — the rear lights face -z and would read edge-on here.
let _mirrorLightMesh = null;
function getMirrorLight() {
  if (_mirrorLightMesh) return _mirrorLightMesh;
  const A = [2.3, 1.25, 0.12], out = { pos: [], nrm: [], col: [], idx: [] };
  const h = 0.018, d = 0.030;
  out.pos.push(0, -h, -d,  0, -h, d,  0, h, d,  0, h, -d);
  for (let i = 0; i < 4; i++) { out.nrm.push(1, 0, 0); out.col.push(A[0], A[1], A[2]); }
  out.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);   // both windings — reads from either side
  _mirrorLightMesh = _gfx.createMesh(out);
  return _mirrorLightMesh;
}
// `anchors` is Car3D.mirrorLightAnchors(teamId, scale): one {x,y,z} per side.
function drawMirrorLights(mat, anchors) {
  _RL_FX.emissive = 1;
  const W = _rlW;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    W.set(mat);
    W[12] += W[0] * a.x + W[4] * a.y + W[8] * a.z;
    W[13] += W[1] * a.x + W[5] * a.y + W[9] * a.z;
    W[14] += W[2] * a.x + W[6] * a.y + W[10] * a.z;
    _gfx.draw(getMirrorLight(), W, _RL_FX);
  }
}
// The 2026 rear-light ERS code (The Race): ONE short flash, repeating, while the
// MGU-K deploys at full power; a RAPID flash when the battery is full and the K
// is being clipped. The rule's third state — two flashes for "neither deploying
// nor harvesting" — is deliberately absent: it is the ordinary state for most of
// a lap, and game.js records that an always-on ERS strobe was tried and
// reverted for exactly that. Returns 1 lit / 0 dark while a code applies, or -1
// when none does and the weather / night gate decides as before. Pure, so the
// unit test can walk it through a second of each state.
function ersLightCode(c, t) {
  if (!c) return -1;
  if (c.deploying) return ((t * 1.25) % 1) < 0.18 ? 1 : 0;
  const full = (c.energy || 0) >= 0.985;
  if (full && (c.axEstSm || 0) < -2.5) return ((t * 8) % 1) < 0.5 ? 1 : 0;
  return -1;
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

  return { init, carDecalData, getCarDecalMesh, getCockpitDecalMesh, getBrakeRing, getCompoundRing, getCrewMesh, CREW_PEOPLE, getExhaustFlame, getBoostFlame, getErsLight, getAeroFlap, getCockpitWheel, getCockpitDash, getCockpitCabin, getCockpitGlass, COCKPIT_WHEELS, getLedStrip, getGearDigit, getSpeedDigit, getErsBar, getOtLamp, drawWheelExtras, drawRearLights, drawTailGlow, drawMirrorLights, ersLightCode, gridStrobe };
})();
Object.freeze(CarMesh);
