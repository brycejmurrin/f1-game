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
// Is this decal sheet for the ROUNDED car? The same switch Car3D.build reads
// (CarShade.on(teamId)); an imported body never is.
const decalRound = (legacyBody, teamId) => !legacyBody && typeof CarShade !== "undefined" && CarShade.on(teamId);
// A colour's "r,g,b" key at 0.01 (the toFixed(2) every colour-keyed cache here
// uses), memoised per ARRAY and re-derived the moment its numbers move: the
// key build ran per wheel and per flap, per car, per frame. A new array (a
// livery edit) simply misses and builds the same string the old code did.
const _colKeys = new WeakMap();
function colKey3(c) {
  let e = typeof c === "object" ? _colKeys.get(c) : null;
  if (e && e.r === c[0] && e.g === c[1] && e.b === c[2]) return e.k;
  const k = c[0].toFixed(2) + "," + c[1].toFixed(2) + "," + c[2].toFixed(2);
  if (typeof c !== "object") return k;
  if (!e) { e = {}; _colKeys.set(c, e); }
  e.r = c[0]; e.g = c[1]; e.b = c[2]; e.k = k;
  return k;
}
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
  // `round`: the rounded car (CarShade on for this team, as Car3D.build decides
  // it) carries the coke-bottle cover and the downwash ramp in its anchors.
  const round = decalRound(legacyBody, teamId);
  const anchors = Car3D.bodyAnchors ? Car3D.bodyAnchors(anchorParts, legacyBody ? null : teamId, spineHeight, round) : null;
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
  const quadN = (c, ns, uvs) => {   // quadUv with a normal per corner: a strip that bends shades as one
    const i = out.pos.length / 3;
    for (let k = 0; k < 4; k++) {
      out.pos.push(c[k][0], c[k][1], c[k][2]);
      out.nrm.push(ns[k][0], ns[k][1], ns[k][2]);
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
    // The rounded car's flank runs from its pinched FOOT (coverProfile pts[0],
    // the coke-bottle xb) to the shoulder (pts[1]); the flat car's is 0.28x lean.
    const foot = (p) => (round && p.pts ? p.pts[0][0] : p.x);
    const flank = (z) => {
      const c = anchors ? anchors.coverAt(z) : (z > -1 ? { x: 0.27, bottom: 0.20, top: 0.81 } : { x: 0.20, bottom: 0.23, top: 0.69 });
      const p = Car3D.coverProfile ? Car3D.coverProfile(c) : { x: c.x, bottom: c.bottom, shoulder: c.top };
      const lean = round && p.pts ? p.pts[0][0] - p.pts[1][0] : 0.28 * p.x;
      const h = p.shoulder - p.bottom, nl = Math.hypot(h, lean), nx = h / nl, ny = lean / nl;
      const at = (v) => [(round && p.pts ? foot(p) - lean * v : p.x * (1 - 0.28 * v)) + nx * PROUD, p.bottom + h * v + ny * PROUD];
      return { b: at(V_BOT), t: at(V_TOP), nx, ny };
    };
    if (round && typeof CarShade !== "undefined" && CarShade.COVER_Z) {
      // ROUNDED: the coke pinch curves the foot between stations, and one
      // straight quad edge from -0.66 to -1.90 is a chord across that curve:
      // measured, up to 40 mm off the skin at the waist (coke 1.38) against
      // 14 mm at its ends, so the band floats free. So the band is a strip of
      // sub-quads at the rings the cover is lofted at (CarShade.COVER_Z), u by
      // z and a normal per corner, which keeps it its PROUD off the skin.
      const zs = [sZ[0]].concat(CarShade.COVER_Z.filter((z) => z < sZ[0] && z > sZ[1]), [sZ[1]]);
      const F = zs.map(flank), f = (z) => (sZ[0] - z) / (sZ[0] - sZ[1]);   // 0 at the front, 1 at the rear
      const uR = uvOf(R.spineSide), uL = uvOf(R.spineSideL || R.spineSide);
      const uRight = (z) => uR.uR + (uR.uL - uR.uR) * f(z), uLeft = (z) => uL.uL + (uL.uR - uL.uL) * f(z);
      for (let i = 0; i < zs.length - 1; i++) {
        const a = F[i], b = F[i + 1], za = zs[i], zb = zs[i + 1];
        // Same corner order and u pre-flip as the flat quads below: +x front at uR, -x front at uL.
        quadN([[a.b[0], a.b[1], za], [b.b[0], b.b[1], zb], [b.t[0], b.t[1], zb], [a.t[0], a.t[1], za]],
              [[a.nx, a.ny, 0], [b.nx, b.ny, 0], [b.nx, b.ny, 0], [a.nx, a.ny, 0]],
              [[uRight(za), uR.vB], [uRight(zb), uR.vB], [uRight(zb), uR.vT], [uRight(za), uR.vT]]);
        quadN([[-b.b[0], b.b[1], zb], [-a.b[0], a.b[1], za], [-a.t[0], a.t[1], za], [-b.t[0], b.t[1], zb]],
              [[-b.nx, b.ny, 0], [-a.nx, a.ny, 0], [-a.nx, a.ny, 0], [-b.nx, b.ny, 0]],
              [[uLeft(zb), uL.vB], [uLeft(za), uL.vB], [uLeft(za), uL.vT], [uLeft(zb), uL.vT]]);
      }
    } else {
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
// The decal key, memoised per PARTS object (teamDecalState hands the same one
// back until rev / ruleset move; bodyAnchors already keys on that identity):
// aeroStyleOf builds a whole recipe and the key is ~6 concats + a map/join,
// per drawn car per frame. Every other input is compared, so a new livery
// (finShape / spineHeight), a GLB swap (legacyBody) or the CarShade switch
// (round) rebuilds through the string path below — still the backing store.
const _decalKeyMemo = new WeakMap(), _decalNoParts = {};
function getCarDecalMesh(aLvl, parts, legacyBody, teamId, finShape, spineHeight) {
  if (typeof LiveryTex === "undefined" || !_gfx.createTexMesh) return null;
  const round = decalRound(legacyBody, teamId);
  const pk = parts == null ? _decalNoParts : typeof parts === "object" ? parts : null;
  const m = pk && _decalKeyMemo.get(pk);
  let k;
  if (m && m.aLvl === aLvl && m.legacy === legacyBody && m.team === teamId && m.fin === finShape
    && m.spine === spineHeight && m.round === round) k = m.k;
  else {
    k = decalKeyOf(aLvl, parts, legacyBody, teamId, finShape, spineHeight, round);
    if (pk) _decalKeyMemo.set(pk, { aLvl, legacy: legacyBody, team: teamId, fin: finShape, spine: spineHeight, round, k });
  }
  if (!_carDecalMeshes[k]) {
    _carDecalMeshes[k] = _gfx.createTexMesh(carDecalData(aLvl == null ? 2 : Number(aLvl), parts, legacyBody, teamId, finShape || "standard", spineHeight));
    _carDecalOrder.push(k);
    while (_carDecalOrder.length > CAR_DECAL_CACHE_MAX) {
      const old = _carDecalOrder.shift(), mesh = _carDecalMeshes[old];
      if (mesh && _gfx.freeMesh) _gfx.freeMesh(mesh);
      delete _carDecalMeshes[old];
    }
  }
  return _carDecalMeshes[k];
}
function decalKeyOf(aLvl, parts, legacyBody, teamId, finShape, spineHeight, round) {
  const anchorParts = legacyBody ? null : parts;
  // spineHeight reaches the cache key through anchors.key (the lift is in it),
  // and so does the rounded car ("|r": its flank is draped at the loft's rings).
  const anchors = Car3D.bodyAnchors ? Car3D.bodyAnchors(anchorParts, legacyBody ? null : teamId, spineHeight, round) : { key: "legacy" };
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
  return level + "|" + (legacyBody ? "imported|" : "") + finK + "|" + drsK + "|" + shapeK + "|" + anchors.key;
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

// WHEEL SPIN BLUR (2026-10-01). The rim is a rotation matrix: at 80 m/s it
// turns ~3.7 rad per frame at 60 fps, past pi, so the spokes alias — they
// stall, strobe or run backwards, the one thing a real wheel never does on
// camera. Above ~0.6 rad/frame drawPlayerWheels lays this translucent disc
// over the rim face (the brake ring's queue, alpha by spin rate): a radial
// gradient from the dark hub to the lit lip, the time-average of spokes over
// gaps, which is what a motion-blurred rim looks like. One shared mesh; the
// rotating rim still draws under it, so the blend reads as blur, not a cap.
let spinDiscMesh = null;
function getSpinDisc() {
  if (spinDiscMesh) return spinDiscMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const SEG = 24, R0 = 0.075, R1 = 0.228;        // hub cap .. rim lip (rimR = 0.34 * 0.68)
  const C0 = [0.26, 0.27, 0.30], C1 = [0.56, 0.57, 0.60];
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const base = out.pos.length / 3;
    out.pos.push(0, R0 * c0, R0 * s0,  0, R1 * c0, R1 * s0,
                 0, R1 * c1, R1 * s1,  0, R0 * c1, R0 * s1);
    for (let v = 0; v < 4; v++) {
      const C = (v === 1 || v === 2) ? C1 : C0;
      out.nrm.push(1, 0, 0); out.col.push(C[0], C[1], C[2]);
    }
    out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3,
                 base, base + 2, base + 1, base, base + 3, base + 2);
  }
  spinDiscMesh = _gfx.createMesh(out);
  return spinDiscMesh;
}

// THE COMPOUND'S STRIPE on the sidewall, from the tyre record the car runs
// on (js/physics/tyre-model.js AI_CLASS colour): one flat ring per colour,
// cached by its rgb, laid on each wheel's outer face like the brake ring —
// outside the brake ring's band, so the two never overlap.
const _compoundRings = new Map();
function getCompoundRing(col) {
  const key = colKey3(col);   // per wheel per car per frame: the memoised key
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
  const key = colKey3(col);
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
  rainLightMesh = _gfx.createMesh(_flatQuadData(0.068, 0.082, [1.75, 0.18, 0.12]));
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
// The full key per (flap record, colour, finish), memoised on the RECORD (the
// solved records are shared and immutable, and each carries its cacheKey):
// a hit allocates nothing. Bounded per record so a livery editor's colour
// sweep cannot grow it without limit; a clear only costs a rebuilt string.
const _flapKeyMemo = new WeakMap(), FLAP_DEF_COL = Object.freeze([0.9, 0.9, 0.1]);
// One element's key: its solve (cacheKey carries level + recipe), colour, finish.
// Finish is part of the key: the same element/level/colour renders a different
// MATERIAL under a satin/chrome livery, so two finishes must not share a mesh.
function _flapKey(g, aLvl, style, c, finish) {
  const ck = colKey3(c), fin = finish || "";
  if (!g.cacheKey) {
    return g.id + aLvl + "|" + (style ? [
      style.frontSweep, style.frontTaper, style.frontRise,
      style.rearSweep, style.rearTaper, style.drs || 0].map((v) => +v || 0).join(",") : "d") + "|" + ck + "|" + fin;
  }
  let byCol = _flapKeyMemo.get(g);
  if (!byCol || byCol.size > 64) { byCol = new Map(); _flapKeyMemo.set(g, byCol); }
  let byFin = byCol.get(ck);
  if (!byFin) { byFin = new Map(); byCol.set(ck, byFin); }
  let key = byFin.get(fin);
  if (key === undefined) { key = g.cacheKey + "|" + ck + "|" + fin; byFin.set(fin, key); }
  return key;
}
function _flapPut(cache, order, max, key, data) {
  const mesh = cache[key] = _gfx.createMesh(data);
  order.push(key);
  if (order.length > max) {
    const old = order.shift();
    // freeMesh, not deleteMesh: no backend has ever had a deleteMesh (GLX, TLX and
    // WGX all expose freeMesh — see the contract in js/render/gfx.js), so the old
    // `&& _gfx.deleteMesh` guard silently skipped the free and every evicted flap
    // leaked its GL buffers for the life of the page. Same call the two frees
    // above this function already make.
    if (cache[old] && _gfx.freeMesh) _gfx.freeMesh(cache[old]);
    delete cache[old];
  }
  return mesh;
}
function getAeroFlap(aLvl, col, idx, style, el, finish) {
  const c = col || FLAP_DEF_COL;
  // aLvl is passed through RAW — catalog options use fractional levels and the
  // wing geometry depends on the exact value, so it must not be truncated here
  // either (it is part of the cache key for the same reason).
  const g = el || Car3D.aeroFlaps(aLvl, style)[idx | 0];
  if (!g) return null;
  const key = _flapKey(g, aLvl, style, c, finish);
  return _flapMeshes[key] || _flapPut(_flapMeshes, _flapOrder, FLAP_CACHE_MAX, key, Car3D.buildFlapGeom(g, c, finish));
}
// THE WHOLE FLAP SET AS ONE STATIC MESH at a REST pose — closed (zAngle, Z-mode)
// or `open` (xAngle, X-mode); `only` "front"/"rear" as drawAeroFlaps. Each element
// posed exactly as drawAeroFlaps' matrix poses it (about local X by the angle,
// then hung at its own pivot — tools/car/parts-sweep.mjs appendFlaps) and baked
// into one buffer: one draw with the same options, the same surfaces. It is what
// a rival past FieldLod.flapsM() and the mirror / PiP draw (they drew NO flaps:
// a rear wing stripped to its main plane) and any car whose wings are at rest.
const _flapSets = {}, _flapSetOrder = [], _flapSetMemo = new Map();   // base key -> [mesh per (open, only) slot]
const FLAP_SET_MAX = 64;   // ~11 teams x 2 poses a race (+ the cockpit's front-only)
function getAeroFlapSet(aLvl, col, style, finish, open, only) {
  const c = col || FLAP_DEF_COL, flaps = Car3D.aeroFlaps(aLvl, style);
  if (!flaps.length) return null;
  // The full key is a string concat per call (per drawn car per frame): a (record, pose) memo keyed on the
  // already-memoised base key turns a hit into two Map/array reads. Cleared whole on an eviction.
  const bk = _flapKey(flaps[0], aLvl, style, c, finish), slot = !only ? (open ? 1 : 0) : only === "front" ? (open ? 3 : 2) : only === "rear" ? (open ? 5 : 4) : -1;
  let memo = slot >= 0 ? _flapSetMemo.get(bk) : undefined;
  if (memo && memo[slot]) return memo[slot];
  const key = bk + (open ? "|X|" : "|Z|") + (only || "");
  const remember = (m) => { if (slot >= 0) { if (!memo) _flapSetMemo.set(bk, memo = []); memo[slot] = m; } return m; };
  if (_flapSets[key]) return remember(_flapSets[key]);
  const nOrder = _flapSetOrder.length;
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  for (const fg of flaps) {
    if (only && fg.wing !== only) continue;
    const g = Car3D.buildFlapGeom(fg, c, finish), ang = open ? fg.xAngle : fg.zAngle;
    const ca = Math.cos(ang), sa = Math.sin(ang), base = out.pos.length / 3;
    for (let i = 0; i < g.pos.length; i += 3) {
      const y = g.pos[i + 1], z = g.pos[i + 2], ny = g.nrm[i + 1], nz = g.nrm[i + 2];
      out.pos.push(g.pos[i], y * ca - z * sa + fg.y, y * sa + z * ca + fg.z);
      out.nrm.push(g.nrm[i], ny * ca - nz * sa, ny * sa + nz * ca);
    }
    for (const v of g.col) out.col.push(v);
    for (const m of g.mat) out.mat.push(m);
    for (const k of g.idx) out.idx.push(base + k);
  }
  const made = _flapPut(_flapSets, _flapSetOrder, FLAP_SET_MAX, key, out);
  if (_flapSetOrder.length === nOrder) { _flapSetMemo.clear(); memo = undefined; }   // an eviction freed a mesh the memo may still point at
  return remember(made);
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
// Physical cockpit materials avoid the generic world/ground texture on instruments.
function _rigMark(out,start,surface) {
  if(!out.mat)out.mat=[];
  while(out.mat.length<out.pos.length/3)out.mat.push(26);
  for(let i=start;i<out.mat.length;i++)out.mat[i]=surface;
}
function _rigMaterials(out) { _rigMark(out,out.pos.length/3,26); return out; }
function _rigPlate(out, pts, z, depth, col) {
  const start=out.pos.length/3;
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
  _rigMark(out,start,Math.max(...col)<.15 && col[2]>col[0]+.005?21:26);
}
function _rigRounded(out, x, y, z, w, h, d, r, col, surface) {
  const start=out.pos.length/3;
  const a=w/2, b=h/2, c=Math.min(r,a,b), pts=[];
  for (const [cx,cy,start] of [[a-c,b-c,0],[-a+c,b-c,Math.PI/2],[-a+c,-b+c,Math.PI],[a-c,-b+c,Math.PI*1.5]])
    for(let i=0;i<=4;i++) {const t=start+i*Math.PI/8; pts.push([x+cx+c*Math.cos(t),y+cy+c*Math.sin(t)]);}
  _rigPlate(out,pts,z,d,col);
  if(surface!=null)_rigMark(out,start,surface);
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
  _rigMark(out,base,22);
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
  const raw=path;
  path=[];
  for(let i=0;i<raw.length-1;i++) for(let j=0;j<3;j++) {
    const t=j/3,a=raw[Math.max(0,i-1)],b=raw[i],c=raw[i+1],d=raw[Math.min(raw.length-1,i+2)];
    path.push(b.map((v,k)=>.5*(2*v+(-a[k]+c[k])*t+(2*a[k]-5*v+4*c[k]-d[k])*t*t+(-a[k]+3*v-3*c[k]+d[k])*t*t*t)));
  }
  path.push(raw[raw.length-1]);
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
  _rigMark(out,start,22);
}
// Modern wheels are open-bottom control yokes, not rectangular hoops.
// References: Mercedes cockpit photograph / McLaren wheel history (see
// docs/notes/COCKPIT-MODEL-REFERENCES.md). Telemetry still uses the same LCD plane.
// Tiny geometry-native legends; no texture upload or per-frame text allocation.
const _RIG_FONT = {
  A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',
  G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',
  M:'101111111101101',N:'101111111111101',O:'010101101101010',P:'110101110100100',Q:'010101101111011',R:'110101110101101',
  S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111',
  '0':'111101101101111','1':'010110010010111','2':'110001010100111','3':'110001010001110','4':'101101111001001',
  '5':'111100110001110','6':'011100111101111','7':'111001010010010','8':'111101111101111','9':'111101111001110',
};
function _rigLabel(out,text,x,y,z,size,col) {
  const start=out.pos.length/3;
  const left=x-(text.length*4-1)*size/2;
  for(let k=0;k<text.length;k++) {
    const glyph=_RIG_FONT[text[k]]; if(!glyph)continue;
    for(let i=0;i<15;i++) if(glyph[i]==='1') {
      const cx=left+(k*4+i%3+0.5)*size, cy=y+(2-Math.floor(i/3))*size;
      _rigQuad(out,[cx-size*.43,cy-size*.43,z],[cx-size*.43,cy+size*.43,z],[cx+size*.43,cy+size*.43,z],[cx+size*.43,cy-size*.43,z],[0,0,-1],col);
    }
  }
  _rigMark(out,start,26);
}
function _wheelScreen(out, c2, style) {
  const CARB = [0.09, 0.095, 0.105], DARK = [0.022, 0.028, 0.036];
  const outlines={
    f1:[[-.090,-.092],[.090,-.092],[.114,-.055],[.112,.065],[.092,.098],[-.092,.098],[-.112,.065],[-.114,-.055]],
    gt:[[-.084,-.102],[.084,-.102],[.107,-.057],[.105,.065],[.076,.085],[-.076,.085],[-.105,.065],[-.107,-.057]],
    butterfly:[[-.057,-.104],[.057,-.104],[.121,-.036],[.111,.068],[.085,.092],[-.085,.092],[-.111,.068],[-.121,-.036]],
    yoke:[[-.082,-.108],[.082,-.108],[.112,-.060],[.101,.055],[.067,.071],[-.067,.071],[-.101,.055],[-.112,-.060]],
    endurance:[[-.101,-.112],[.101,-.112],[.119,-.065],[.116,.063],[.090,.096],[-.090,.096],[-.116,.063],[-.119,-.065]],
  };
  _rigPlate(out,outlines[style]||outlines.f1,0.014,0.042,CARB);
  _rigRounded(out, 0, 0.024, -0.016, 0.125, 0.080, 0.020, 0.008, [0.06,0.067,0.075]);
  _rigBox(out, 0, 0.024, -0.028, 0.112, 0.068, 0.006, DARK);
  // Preserve aligned cyan speed, orange gear and green battery cells.
  _rigBox(out, 0.048, 0.024, -0.0295, 0.012, 0.050, 0.003, [0.03,0.04,0.045]);
  _rigRounded(out, -0.034, 0.022, -0.0292, 0.052, 0.040, 0.003, 0.002, [0.06,0.067,0.075]);
  _rigRounded(out, -0.034, 0.022, -0.0296, 0.047, 0.035, 0.003, 0.001, [0.010,0.016,0.026]);
  _rigRounded(out, 0.014, 0.022, -0.0292, 0.034, 0.044, 0.003, 0.002, [0.032,0.028,0.027]);
  _rigRounded(out, 0.014, 0.022, -0.0296, 0.029, 0.039, 0.003, 0.001, [0.014,0.018,0.024]);
  const LEG=[0.64,0.70,0.74];
  _rigLabel(out,'SPD',-.034,.052,-.033,.0015,LEG);
  _rigLabel(out,'G',.014,.052,-.033,.0015,LEG);
  _rigLabel(out,'ERS',.048,.052,-.033,.0011,LEG);
  for(const x of [-.004,.035]) _rigBox(out,x,.023,-.032,.0008,.054,.001,[.08,.11,.14]);
  _rigLabel(out,'OT',-.082,.003,-.033,.0012,LEG);
  _rigLabel(out,'AERO',.082,-.014,-.033,.0011,LEG);
  const BTN = [[0.83,0.12,0.09],[0.16,0.43,0.85],[0.12,0.65,0.30],[0.88,0.70,0.12]];
  for (const side of [-1,1]) {
    for (let i = 0; i < 3; i++) _rigButton(out, side*(style === "endurance" ? 0.102 : style === "gt" ? 0.094 : 0.096), 0.055-i*0.037, -0.027, 0.008, BTN[(i+(side>0?1:0))%4]);
    _rigButton(out, side*0.132, 0.079, -0.023, 0.010, BTN[side<0?2:0]);
    _rigButton(out, side*0.126, 0.045, -0.025, 0.008, BTN[side<0?1:3]);
  }
  const rotaries=style==='gt'?[[-.045,BTN[3]],[.045,BTN[1]]]:style==='butterfly'?[[0,BTN[1]]]:style==='yoke'?[[-.060,BTN[3]],[.060,BTN[2]]]:style==='endurance'?[[-.075,BTN[3]],[-.025,BTN[1]],[.025,BTN[2]],[.075,BTN[0]]]:[[-.064,BTN[3]],[0,BTN[1]],[.064,BTN[2]]];
  for(const [x,col] of rotaries) {
    const r=style==='butterfly'?.023:style==='endurance'?.013:.016;
    const y=style==='endurance'?-.073:-.063;
    _rigButton(out,x,y,-.026,r,col,true);
    for(let i=0;i<8;i++) {
      const a=i/8*Math.PI*2, c=Math.cos(a), sn=Math.sin(a);
      _rigLabel(out,String(i+1),x+c*(r+.007),y+sn*(r+.007),-.031,.00075,LEG);
    }
  }
  for(const [word,x,y] of [['N',-.132,.107],['P',.132,.107],['BB',-.064,-.102],['MODE',0,-.102],['DIFF',.064,-.102]])
    _rigLabel(out,word,x,y,-.027,.0013,LEG);
  if(style==='butterfly') for(const side of [-1,1]) _rigButton(out,side*.064,-.058,-.027,.009,BTN[side<0?3:2]);
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
  const GLOVE=[0.14,0.155,0.175], SEAM=[0.34,0.36,0.38];
  for (const side of [-1,1]) {
    _rigEllipsoid(out,side*.184,-.011,-.013,.023,.046,.024,GLOVE,-side*.12);
    for(let i=0;i<4;i++) _rigEllipsoid(out,side*.169,.030-i*.021,.010,.014,.011,.020,GLOVE,-side*.25);
    _rigEllipsoid(out,side*.154,.015,-.024,.011,.022,.014,GLOVE,-side*.68);
    _rigEllipsoid(out,side*.188,-.077,-.003,.021,.035,.021,GLOVE,-side*.06);
    _rigEllipsoid(out,side*.192,-.126,.005,.024,.039,.024,GLOVE,-side*.08);
    for(const y of [-.098,-.104]) _rigGrip(out,[[side*.171,y],[side*.182,y-.003],[side*.193,y-.003],[side*.211,y]],.0012,.026,SEAM);
    for(let i=0;i<3;i++) _rigBar(out,side*.181,.017-i*.013,side*.197,.011-i*.013,-.035,.0008,.001,SEAM);
    _rigBar(out,side*.176,-.043,side*.184,-.080,-.025,.001,.001,SEAM);
  }
}
const COCKPIT_WHEELS = ["f1", "gt", "butterfly", "yoke", "endurance", "retro", "round"];
function _wheelRimF1(out, CARB, RUB, GRIP, acc, style) {
  for (const s of [-1,1]) {
    _rigGrip(out, [[s*0.151,style === "yoke" ? 0.062 : 0.103],[s*0.169,0.054],[s*0.179,0.020],[s*0.176,-0.031],[s*0.155,-0.099]], 0.022, 0.029, RUB);
    _rigBar(out, s*0.093, style === "yoke" ? 0.045 : 0.080, s*0.151, style === "yoke" ? 0.053 : 0.090, 0.010, 0.042, 0.039, CARB);
  }
  if (style === "gt") {
    // A continuous flat-bottom rim around the modern display and hand grips.
    _rigGrip(out, [[-0.155,-0.099],[-0.12,-0.123],[0,-0.128],[0.12,-0.123],[0.155,-0.099]],0.015,0.024,RUB);
    _rigGrip(out, [[-0.151,0.103],[-0.11,0.124],[0,0.132],[0.11,0.124],[0.151,0.103]],0.014,0.022,RUB);
    _rigRounded(out,0,0.132,-0.007,0.012,0.024,0.038,0.004,acc||GRIP);
  } else if (style === "butterfly") {
    // Angular wings and a tapered lower housing leave the top of the rim open.
    for (const side of [-1,1]) {
      _rigPlate(out,[[side*0.090,-0.091],[side*0.160,-0.080],[side*0.162,0.094],[side*0.140,0.140],[side*0.090,0.100]],0.020,0.022,CARB);
      _rigBar(out,side*0.108,-0.080,side*0.148,-0.063,-0.006,0.009,0.008,acc||GRIP);
    }
  }
  if (style === "yoke") {
    _rigGrip(out,[[-0.155,-0.099],[-0.115,-0.131],[0,-0.141],[0.115,-0.131],[0.155,-0.099]],0.014,0.022,RUB);
    for (const side of [-1,1]) _rigPlate(out,[[side*0.095,-0.072],[side*0.151,-0.093],[side*0.158,-0.117],[side*0.110,-0.127]],0.016,0.016,CARB);
  } else if (style === "endurance") {
    _rigGrip(out,[[-0.155,-0.099],[-0.118,-0.127],[-0.060,-0.141],[0,-0.144],[0.060,-0.141],[0.118,-0.127],[0.155,-0.099]],0.013,0.022,RUB);
    _rigGrip(out,[[-0.151,0.103],[-0.130,0.127],[-0.080,0.135],[0,0.135],[0.080,0.135],[0.130,0.127],[0.151,0.103]],0.012,0.022,RUB);
    for (const side of [-1,1]) _rigBar(out,side*0.080,-0.085,side*0.118,-0.117,0.012,0.024,0.018,CARB,21);
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
  _rigLabel(out,'SPD',-.019,.066,-.018,.0011,[.58,.64,.48]);
  _rigLabel(out,'G',.025,.066,-.018,.0011,[.58,.64,.48]);
  for(const [word,x] of [['OT',-.041],['AX',.041]]) {
    _rigRounded(out,x,.035,-.0155,.011,.011,.002,.002,[.025,.03,.04]);
    _rigLabel(out,word,x,.020,-.018,.001,[.58,.64,.48]);
  }
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
  for(const side of [-1,1]) for(const x of [.065,.095,.125]) _rigDisc(out,side*x,-.005,.011,.006,12,[.045,.05,.055]);
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2;_rigDisc(out,(R-.007)*Math.cos(a),(R-.007)*Math.sin(a),-.015,.0008,6,[.35,.25,.17]);}
  _rigRounded(out,0,R,-0.002,0.013,0.026,0.042,0.004,acc||[0.55,0.52,0.42]);
}
// Keyed like _cockpitDecalMesh: the chosen wheel and the player's livery colours
// join the key, so a garage livery edit (resolveLivery is store.rev-invalidated
// upstream) or a WHEEL change frees and rebuilds it. liv may be null — the
// wheel then falls back to the neutral carbon look.
// The resolved livery is one object per store rev (resolveLivery memo) and its
// colours are never written in place, so the SAME object + style is the same
// key: return before the tints, the toFixed map/joins and the concat (every
// frame on the default camera). A draft or an edit is a new object and takes
// the string path, which still owns the free-and-rebuild.
let cockpitWheelMesh = null, _cockpitWheelKey = "", _wheelLiv, _wheelStyle;
const _wheelTint = (c, k) => c ? [c[0] * k, c[1] * k, c[2] * k] : null;
function getCockpitWheel(liv, style) {
  if (cockpitWheelMesh && liv === _wheelLiv && style === _wheelStyle) return cockpitWheelMesh;
  _wheelLiv = liv; _wheelStyle = style;
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
    _wheelScreen(out, c2, st);
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
  cockpitWheelMesh = _gfx.createMesh(_rigMaterials(out));
  return cockpitWheelMesh;
}
// STEERING LOCK. The wheel used to roll a fixed 0.80 rad (±46 deg) at full
// steer, behind a second λ6 damp stacked on the already-damped steerVis: a
// hairpin turned the wheel a quarter of what a real one does, a beat late.
// Progressive now: the centre keeps the shipped 0.80 rad slope (small
// corrections read exactly as before) and a cubic term takes full lock to
// 1.5 rad (~86 deg — a 2026 car's ±90 deg lock), behind a λ12 visual damp
// that still settles rather than flicks. The sign is the shipped one.
const WHEEL_ROLL_LIN = 0.80, WHEEL_ROLL_CUBE = 0.70, WHEEL_ROLL_LAMBDA = 12;
function cockpitWheelRoll(steer) {
  const v = Math.max(-1, Math.min(1, steer || 0));
  return -(WHEEL_ROLL_LIN * v + WHEEL_ROLL_CUBE * v * v * v);
}
// FOREARMS. The gloves end at their cuffs, so on their own they floated —
// worst at full lock, where the outside hand hangs at twelve o'clock with
// nothing running back to the driver. A sleeve in the SUIT colour now runs
// from inside each cuff (wheel-local: it rolls with the wheel) to an elbow
// fixed in CAR space beside the seat (it does not): one cached unit tube,
// stretched between the two per frame. The elbow rides the seat (CockpitOpts
// layout wheelY/wheelZ), low and only 8 cm behind the hub, so the sleeve
// DROPS out of the bottom of the frame the way an onboard shows forearms
// rising to the grips. That is forced by the 0.30 m near plane, not taste: the
// eye is only 0.46 m behind the wheel, and an elbow set back where a real one
// is pulled the sleeve through the near plane IN FRAME at full lock (the
// outside hand at twelve o'clock), worst from the HELMET eye under braking.
// Here every stretch of sleeve nearer than 0.33 m is already >= 42 deg under
// the eye line (the widest stock FOV shows 40.5) — tests/unit/cockpit-wheels.
const ARM_WRIST = [0.1895, -0.140, 0.004];   // wheel-local, inside the glove cuff (_wheelHands)
const ARM_ELBOW = [0.215, -0.30, -0.08];     // car-local x; y and z relative to the wheel hub
const ARM_R = 0.016, ARM_TAPER = 1.6;        // sleeve radius at the wrist (m); elbow / wrist
// The exterior driver's SUIT (car3d part "driver": c2 x 0.62 + 0.05), with the
// cockpit's pale-accent rule (car3d _ckAcc) first: a white suit dims to a grey
// so a pale accent never fills the bottom of the view.
function suitColour(liv) {
  let c = liv && liv.c2 ? liv.c2 : [0.30, 0.30, 0.33];
  const mn = Math.min(c[0], c[1], c[2]);
  if (mn >= 0.45) c = [c[0] * 0.42 / mn, c[1] * 0.42 / mn, c[2] * 0.42 / mn];
  return [c[0] * 0.62 + 0.05, c[1] * 0.62 + 0.05, c[2] * 0.62 + 0.05];
}
let _armMesh = null, _armKey = "";
const _armC2 = [NaN, NaN, NaN];   // the c2 the cached sleeve was built from: a per-frame check that allocates nothing
// Unit sleeve: +z from the wrist (z 0, radius 1) to the elbow (z 1, ARM_TAPER),
// a little fuller at the forearm's belly. Radial normals, so the per-frame
// stretch (radius on x/y, length on z) leaves them pointing the right way.
function getForearm(liv) {
  const c2 = liv && liv.c2;
  if (_armMesh && c2 && c2[0] === _armC2[0] && c2[1] === _armC2[1] && c2[2] === _armC2[2]) return _armMesh;
  _armC2[0] = c2 ? c2[0] : NaN; _armC2[1] = c2 ? c2[1] : NaN; _armC2[2] = c2 ? c2[2] : NaN;
  const col = suitColour(liv), key = col.map((v) => v.toFixed(2)).join(",");
  if (_armMesh && _armKey !== key) { if (_gfx.freeMesh) _gfx.freeMesh(_armMesh); _armMesh = null; }
  if (_armMesh) return _armMesh;
  _armKey = key;
  const out = { pos: [], nrm: [], col: [], idx: [] }, N = 10, T = [0, 0.3, 0.65, 1];
  for (const t of T) {
    const r = 1 + (ARM_TAPER - 1) * t + 0.12 * Math.sin(Math.PI * t);
    for (let j = 0; j < N; j++) {
      const a = j / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      out.pos.push(c * r, s * r, t); out.nrm.push(c, s, 0); out.col.push(col[0], col[1], col[2]);
    }
  }
  for (let i = 0; i < T.length - 1; i++) for (let j = 0; j < N; j++) {
    const a = i * N + j, b = i * N + (j + 1) % N;
    out.idx.push(a, b, b + N, a, b + N, a + N);
  }
  // Flat caps with their own normals (the elbow end is below the frame, the
  // wrist end inside the cuff, but a closed tube never shows a hole).
  for (const end of [0, T.length - 1]) {
    const c0 = out.pos.length / 3, z = T[end], nz = end ? 1 : -1;
    out.pos.push(0, 0, z); out.nrm.push(0, 0, nz); out.col.push(col[0], col[1], col[2]);
    for (let j = 0; j < N; j++) {
      const p = (end * N + j) * 3;
      out.pos.push(out.pos[p], out.pos[p + 1], z); out.nrm.push(0, 0, nz); out.col.push(col[0], col[1], col[2]);
    }
    for (let k = 0; k < N; k++) {
      const a = c0 + 1 + k, b = c0 + 1 + (k + 1) % N;
      out.idx.push(...(end ? [c0, a, b] : [c0, b, a]));
    }
  }
  _rigMark(out, 0, 22);   // suit fabric: the gloves' matte surface, not the generic panel
  _armMesh = _gfx.createMesh(out);
  return _armMesh;
}
// A point through a column-major 4x4 (no M4: the node tests load this file alone).
function _xf(m, x, y, z, out) {
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
}
// Wrist (through the rolled wheel matrix) and elbow (through the car body
// matrix) for one side, both in the space the two matrices map into.
function forearmEnds(rig, base, lay, side, wrist, elbow) {
  _xf(rig, side * ARM_WRIST[0], ARM_WRIST[1], ARM_WRIST[2], wrist);
  _xf(base, side * ARM_ELBOW[0], lay.wheelY + ARM_ELBOW[1], lay.wheelZ + ARM_ELBOW[2], elbow);
}
const _armW = [0, 0, 0], _armE = [0, 0, 0], _armM = new Float32Array(16);
// The unit sleeve stretched from wrist to elbow: a right-handed basis whose x/y
// span the cross-section (ARM_R) and whose z IS the wrist-to-elbow vector.
function forearmMatrix(wrist, elbow, up, out) {
  const dx = elbow[0] - wrist[0], dy = elbow[1] - wrist[1], dz = elbow[2] - wrist[2];
  const L = Math.hypot(dx, dy, dz) || 1, ux = dx / L, uy = dy / L, uz = dz / L;
  let ax = uy * up[2] - uz * up[1], ay = uz * up[0] - ux * up[2], az = ux * up[1] - uy * up[0];
  const al = Math.hypot(ax, ay, az);
  if (al < 1e-6) { ax = 1; ay = 0; az = 0; } else { ax /= al; ay /= al; az /= al; }
  const bx = uy * az - uz * ay, by = uz * ax - ux * az, bz = ux * ay - uy * ax;   // u x a
  out[0] = ax * ARM_R; out[1] = ay * ARM_R; out[2] = az * ARM_R; out[3] = 0;
  out[4] = bx * ARM_R; out[5] = by * ARM_R; out[6] = bz * ARM_R; out[7] = 0;
  out[8] = dx; out[9] = dy; out[10] = dz; out[11] = 0;
  out[12] = wrist[0]; out[13] = wrist[1]; out[14] = wrist[2]; out[15] = 1;
  return out;
}
// Both sleeves, two draws a frame. rig = the rolled wheel matrix (car-draw
// _rigB), base = the car body matrix, lay = CockpitOpts.layout() of the seat.
const _armUp = [0, 1, 0];
function drawForearms(rig, base, lay, liv, opt) {
  const mesh = getForearm(liv);
  _armUp[0] = base[4]; _armUp[1] = base[5]; _armUp[2] = base[6];
  for (let side = -1; side <= 1; side += 2) {
    forearmEnds(rig, base, lay, side, _armW, _armE);
    _gfx.draw(mesh, forearmMatrix(_armW, _armE, _armUp, _armM), opt);
  }
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
  _rigDisc(out, 0, 0, 0.001, 0.027, 12, DARK);
  _rigRing(out,0,0,-.001,.022,12,.003,.002,[.16,.17,.19]);
  _rigButton(out,0,0,-.002,.010,[.25,.26,.28]);            // its spline socket, facing the driver
  _rigPlate(out, [[-0.28,-0.25],[0.28,-0.25],[0.34,-0.15],[0.37,0.04],[0.34,0.07],[-0.34,0.07],[-0.37,0.04],[-0.34,-0.15]], 0.32, 0.035, CARB);          // front bulkhead, down to the coaming (world y 0.43..0.69)
  _rigTube(out, [[-0.34,0.064,0.305],[-0.17,0.072,0.305],[0,0.075,0.305],[0.17,0.072,0.305],[0.34,0.064,0.305]], 0.009, [0.10,0.10,0.12]); // its top lip
  for (let i=0;i<6;i++) {
    const a=i/6*Math.PI*2;
    _rigDisc(out,Math.cos(a)*0.032,Math.sin(a)*0.032,-0.001,0.003,8,[0.50,0.52,0.54]);
  }
  for (const side of [-1,1]) for (let i=0;i<4;i++)
    _rigRounded(out,side*(0.22+i*0.026),-0.080,0.298,0.012,0.078,0.008,0.003,DARK);
  cockpitDashMesh = _gfx.createMesh(_rigMaterials(out));
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
function _rigTube(out, path, r, col, surface=22) {
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
  _rigMark(out,start,surface);
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
// Fixed labeled faces; the needles are drawn from actual telemetry separately.
function _rigGauge(out, cx, cy, cz, r, max, label, face, bezel) {
  const start=out.pos.length/3;
  _rigRing(out, cx, cy, cz, r, 20, r * 0.16, 0.008, bezel);
  _rigMark(out,start,23);
  _rigDisc(out, cx, cy, cz + 0.002, r * 0.94, 20, face);
  for (let i=0;i<=10;i++) {
    const t = Math.PI*(1.25-1.5*i/10), c = Math.cos(t), s = Math.sin(t);
    _rigBar(out,cx+c*r*0.70,cy+s*r*0.70,cx+c*r*0.86,cy+s*r*0.86,cz-0.001,r*0.035,0.001,[0.11,0.12,0.13]);
  }
  for(let i=0;i<=4;i++) {const a=Math.PI*(1.25-1.5*i/4);_rigLabel(out,String(max*i/4),cx+Math.cos(a)*r*.61,cy+Math.sin(a)*r*.61,cz-.002,r*.032,[.13,.14,.15]);}
  _rigLabel(out,label,cx,cy-r*.35,cz-.002,r*.040,[.13,.14,.15]);
}
// Lofted panels with outward normals and closed ends, rather than box walls.
function _rigLiner(out, rings, col) {
  const start=out.pos.length/3;
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
  _rigMark(out,start,22);
}
// A closed lower tub shared by EVERY trim and body choice. Extending behind
// the eye keeps the near plane from cutting an opening into the road below.
function _cockpitLowerTub(out, kind, accent) {
  const carbon=[0.065,0.070,0.080], edge=[0.16,0.17,0.19], metal=[0.32,0.34,0.36];
  const pad=kind === "classic" ? [0.14,0.085,0.05] : kind === "suede" ? [0.14,0.13,0.12] : [0.09,0.095,0.105];
  const start=out.pos.length/3;
  _rigBox(out,0,0.245,-0.725,0.66,0.040,3.65,carbon); // continuous opaque floor
  _rigBox(out,0,0.450,1.08,0.66,0.450,0.040,carbon); // closed footwell end
  _rigMark(out,start,21);
  for (const side of [-1,1]) {
    const rings=[[-2.55,.326,.690],[-.82,.322,.690],[-.20,.313,.681],[.20,.297,.672],[.48,.280,.665],[1.10,.300,.655]].map(([z,x,y])=>{
      const ring=[[side*.230,.265,z],[side*.255,.245,z],[side*x,y,z],[side*(x-.014),y-.012,z],
        [side*(x-.025),y-.045,z],[side*(x-.045),y-.110,z],[side*(x-.061),.450,z],[side*.244,.410,z]];
      return side>0 ? ring : ring.reverse();
    });
    _rigLiner(out,rings,pad);
    _rigBeam(out,[side*0.246,0.365,-0.20],[side*0.238,0.365,0.81],0.006,edge);
    for (const z of [0.16,0.52,0.84])
      _rigBeam(out,[side*0.244,0.375,z],[side*0.289,0.631,z],0.0025,edge);
    _rigRounded(out,side*0.212,0.440,0.17,0.045,0.055,0.055,0.007,metal);
    _rigRounded(out,side*0.212,0.440,0.137,0.028,0.033,0.008,0.004,accent);
    _rigBeam(out,[side*0.16,0.275,-0.15],[side*0.16,0.275,0.90],0.012,edge);
    for (const y of [0.37,0.61]) {
      _rigDisc(out,side*0.270,y,1.052,0.007,8,metal);
      _rigBar(out,side*0.267,y,side*0.273,y,1.051,0.0015,0.001,[0.025,0.03,0.035]);
    }
  }
  _rigRounded(out,0,0.56,-0.79,0.66,0.63,0.10,0.025,carbon,21); // sealed rear bulkhead
  _rigRounded(out,0,0.79,-0.72,0.48,0.20,0.09,0.04,pad,22); // rear headrest
  _rigRounded(out,0,0.345,-0.025,0.44,0.085,0.37,0.018,pad,22); // seat base
  _rigBeam(out,[-0.20,0.382,0.10],[0.20,0.382,0.10],0.004,edge);
  _rigBox(out,0,0.320,0.76,0.34,0.050,0.16,carbon); // raised pedal heel rest
  for (const x of [-0.10,0,0.10]) _rigBeam(out,[x,0.349,0.69],[x,0.349,0.83],0.006,edge);
}
// Modern tub trim: rounded removable pads, a carbon scuttle, moulded seam
// lines and recessed fasteners. TEAM adds accents to the same shaped trim.
function _teamCabin(out, pad, stitch, kind) {
  const CARB = [0.08,0.085,0.095];
  for (const side of [-1,1]) {
    const stations=[[-.80,.300,.727],[-.55,.297,.725],[-.16,.289,.714],[.10,.278,.704],[.28,.258,.691],[.42,.231,.687]];
    const rings=stations.map(([z,x,y])=>[[side*(x+.012),y+.022,z],[side*(x-.012),y+.015,z],
      [side*(x-.021),y-.006,z],[side*(x-.012),y-.039,z],[side*(x+.016),y-.047,z],[side*(x+.025),y-.018,z]]);
    if(side<0) for(const q of rings)q.reverse();
    _rigLiner(out,rings,pad);
    _rigTube(out,stations.map(([z,x,y])=>[side*(x-.016),y-.007,z]),.0015,stitch);
    _rigRounded(out,side*.273,.696,.23,.026,.035,.04,.006,CARB);
    _rigDisc(out,side*.273,.696,.207,.004,8,[.30,.32,.34]);
    if(kind==='team') _rigTube(out,stations.slice(0,4).map(([z,x,y])=>[side*x,y+.023,z]),.003,stitch);
  }
  _rigTube(out,[[-.302,.739,-.80],[-.20,.754,-.82],[0,.765,-.82],[.20,.754,-.82],[.302,.739,-.80]],.024,pad);
  _rigTube(out,[[-.231,.687,.42],[-.15,.704,.44],[0,.709,.45],[.15,.704,.44],[.231,.687,.42]],.018,CARB,21);
  _rigRounded(out,0,.714,.400,.44,.010,.008,.004,CARB,21);
}
function _classicCabin(out, paint) {
  const LEATHER = [0.10, 0.065, 0.043], CHROME = [0.37, 0.39, 0.41], FACE = [0.55, 0.53, 0.48];
  // Leather coaming follows the entire opening, including behind the driver.
  const rim = [[0,0.75,-0.82],[-0.30,0.72,-0.80],[-0.30,0.69,-0.05],[-0.30,0.69,0.25],[-0.18,0.71,0.40],
    [0.18,0.71,0.40],[0.30,0.69,0.25],[0.30,0.69,-0.05],[0.30,0.72,-0.80],[0,0.75,-0.82]];
  _rigTube(out,rim,0.020,LEATHER);
  _rigRounded(out, 0, 0.745, 0.47, 0.50, 0.13, 0.03, 0.038, paint);        // painted dash panel
  _rigGauge(out, 0, 0.75, 0.443, 0.045, 16, "RPM X1000", FACE, CHROME);
  _rigGauge(out, -0.15, 0.745, 0.443, 0.028, 400, "KPH", FACE, CHROME);
  _rigGauge(out, 0.15, 0.745, 0.443, 0.028, 100, "ERS", FACE, CHROME);
  const scr = _classicScreen();
  for (const [a, b] of scr.frame) _rigBeam(out, a, b, 0.004, CHROME);   // aeroscreen frame
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
let _cabinMesh = null, _cabinKey = "", _cabinKind, _cabinLiv;   // same identity early-out as getCockpitWheel
function getCockpitCabin(kind, liv) {
  if (_cabinMesh && kind === _cabinKind && liv === _cabinLiv) return _cabinMesh;
  _cabinKind = kind; _cabinLiv = liv;
  const tint = (c, k, d) => c ? [c[0] * k, c[1] * k, c[2] * k] : d;
  const col = tint(liv && liv.c1, 0.55, [0.25, 0.05, 0.05]), acc = tint(liv && (liv.accent || liv.c2), 0.6, [0.6, 0.6, 0.62]);
  const key = kind + "|" + col.concat(acc).map((v) => v.toFixed(2)).join(",");
  if (_cabinMesh && _cabinKey !== key) { if (_gfx.freeMesh) _gfx.freeMesh(_cabinMesh); _cabinMesh = null; }
  if (_cabinMesh) return _cabinMesh;
  _cabinKey = key;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  _cockpitLowerTub(out, kind, acc);
  if (kind === "classic") _classicCabin(out, col);
  else _teamCabin(out, kind === "team" ? col.map(v=>v*.32+.045) : kind === "suede" ? [0.18,0.165,0.15] : [0.095,0.10,0.11], kind === "team" ? col : [0.18,0.19,0.20], kind);
  for(const side of [-1,1]) {
    if(kind==='ribbed') for(let i=0;i<8;i++) {
      const z=-.12+i*.055, x=.282-Math.max(0,z)*.10, y=.708-Math.max(0,z)*.04;
      _rigRounded(out,side*x,y-.040,z,.028,.065,.037,.012,[.12,.13,.145],22);
    }
    if(kind==='suede') {
      for(let i=0;i<6;i++) _rigTube(out,[[side*.281,.706,-.14+i*.07],[side*.276,.677,-.14+i*.07]],.0008,[.31,.29,.26]);
      _rigRounded(out,side*.265,.575,.18,.019,.130,.24,.009,[.15,.135,.12],22);
    }
    for(const z of [-.32,.06,.39]) _rigDisc(out,side*.282,.638,z,.0035,8,[.24,.26,.29]);
  }

  _cabinMesh = _gfx.createMesh(_rigMaterials(out));
  return _cabinMesh;
}
// One shared physical needle, transformed per instrument without allocating
// meshes as RPM, speed or energy change. Speed scale is always KPH, as labeled.
let _classicNeedle=null;
const _gaugeT=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]), _gaugeM=new Float32Array(16);
function drawClassicTelemetry(mat,c,kph,opt) {
  if(!_classicNeedle) {
    const out={pos:[],nrm:[],col:[],idx:[]};
    _rigBar(out,-.15,0,.80,0,0,.065,.025,[.92,.20,.08]);
    _rigDisc(out,0,0,-.018,.10,12,[.09,.095,.10]);
    _classicNeedle=_gfx.createMesh(_rigMaterials(out));
  }

  for(let i=0;i<3;i++) {
    const value=i===0?c.rpm/16000:i===1?kph/400:c.energy;
    const r=i===0?.045:.028, a=Math.PI*(1.25-1.5*Math.max(0,Math.min(1,Number.isFinite(value)?value:0)));
    const ca=Math.cos(a)*r,sa=Math.sin(a)*r;
    _gaugeT[0]=ca;_gaugeT[1]=sa;_gaugeT[4]=-sa;_gaugeT[5]=ca;_gaugeT[10]=r;
    _gaugeT[12]=i===0?0:i===1?-.15:.15;_gaugeT[13]=i===0?.75:.745;_gaugeT[14]=.438;
    M4.mulTo(_gaugeM,mat,_gaugeT);_gfx.draw(_classicNeedle,_gaugeM,opt);
  }
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
// THE SHIFT LIGHTS ARE THE BIGGEST THING ON THE WHEEL. At 3.4 mm the fifteen
// lenses were specks at the wheel's 0.46 m; a real 2026 row runs right across
// the top of the display at about a centimetre a lens. Each row sits inside its
// own fascia's top edge (the _wheelScreen outlines): GT's top is lower, and the
// YOKE's sits so close over its LCD that its row is a hair smaller and narrower.
// `half` is the centre-to-centre half-span; 15 lenses at 2r + 1 mm each.
const LED_ROWS = { std: { y: 0.082, half: 0.077, r: 0.005 }, gt: { y: 0.076, half: 0.077, r: 0.005 },
  yoke: { y: 0.0625, half: 0.070, r: 0.0045 } };
// `lit` 0-8 lights that many LEDs left-to-right. 9 is SHIFT NOW: the whole
// row blue, the cue a driver actually upshifts on (8 lit and 8 lit-plus-past-
// it looked identical). The strip never goes DARK at the limiter — the caller
// (car-draw.js) alternates 8 and 9, steady 9 under reduced motion.
// `style` picks the row (LED_ROWS); anything else — the 2000s wheel scales the
// standard row onto its own LCD — gets the standard one.
function getLedStrip(lit, style) {
  const rowId = LED_ROWS[style] ? style : "std", key = rowId + lit;
  if (_ledMeshes[key]) return _ledMeshes[key];
  const out = { pos: [], nrm: [], col: [], idx: [] }, row = LED_ROWS[rowId];
  const COLS = [[0.2,1.3,0.35],[1.2,0.82,0.12],[0.35,0.55,1.5]];
  const count = Math.round(Math.max(0, Math.min(8, lit)) / 8 * 15);
  for (let i = 0; i < 15; i++) {
    const col = lit === 9 ? [0.35,0.55,1.5] : i < count ? COLS[Math.floor(i/5)] : [0.055,0.06,0.065];
    _rigDisc(out, -row.half + i * row.half / 7, row.y, -0.030, row.r, 8, col);
  }
  _ledMeshes[key] = _gfx.createMesh(out);
  return _ledMeshes[key];
}
// MIRROR GLASS FALLBACK: the cockpit housings' glass is near-black because the
// HUD mirror pass is the reflection. While that pass is not drawing (MIRROR
// AUTO on a software GPU, OFF, collapsed) car-draw.js lays this over each
// glass: a smoked sky gradient, pale at the top to grey-blue at the bottom.
// `quads` is Car3D.cockpitMirrorGlass(scale); cached on that (frozen) array.
const _mirrorFbMeshes = new Map();
function getMirrorFallback(quads) {
  let m = _mirrorFbMeshes.get(quads);
  if (m) return m;
  const out = { pos: [], nrm: [], col: [], idx: [] }, TOP = [0.62, 0.72, 0.84], MID = [0.40, 0.48, 0.58], BOT = [0.20, 0.23, 0.27];
  const mixV = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);   // per-axis mix of two corners
  for (const [a, b, c, d] of quads) {
    for (const [t0, t1, c0, c1] of [[0, 0.55, BOT, MID], [0.55, 1, MID, TOP]]) {
      // Two bands, colour per row; drawn doubleSided, so the winding is moot.
      const i0 = out.pos.length / 3;
      for (const [v, col] of [[mixV(a, d, t0), c0], [mixV(b, c, t0), c0], [mixV(b, c, t1), c1], [mixV(a, d, t1), c1]]) {
        out.pos.push(v[0], v[1], v[2]); out.nrm.push(0, 0, -1); out.col.push(col[0], col[1], col[2]);
      }
      out.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    }
  }
  m = _gfx.createMesh(out);
  _mirrorFbMeshes.set(quads, m);
  return m;
}
// LIVE MIRROR GLASS (gfx.drawMirrorGlass): the same lens quads as a TEXTURED
// mesh (createTexMesh's pos/nrm/uv) that the backend maps this frame's HUD
// rear view onto. The target holds the RAW rear-camera image — the HUD
// composite flips it — so the glass's flip is baked into U, per side s (-1 the
// left glass, x < 0; +1 the right): outboard u = 0.5 - 0.5s, inboard u =
// 0.5 + 0.1s — left 1.0 -> 0.4, right 0.0 -> 0.6, each glass its own side of
// the image and a tenth past the centre line. V runs MIRROR_GLASS_V, v = 0 the
// image bottom: the lens is 0.191 x 0.051 m (3.75:1) and the target 7:2
// (css/hud.css #hud-mirror), so 0.6 of its width over 0.56 of its height keeps
// texels square. Cached per quads like getMirrorFallback; null when the backend
// has no createTexMesh (the caller then lays the fallback).
const MIRROR_GLASS_V = [0.22, 0.78];
const _mirrorGlassMeshes = new Map();
function getMirrorGlass(quads) {
  if (_mirrorGlassMeshes.has(quads)) return _mirrorGlassMeshes.get(quads);
  let m = null;
  if (_gfx.createTexMesh) {
    const out = { pos: [], nrm: [], uv: [], idx: [] }, v0 = MIRROR_GLASS_V[0], v1 = MIRROR_GLASS_V[1];
    for (const [a, b, c, d] of quads) {
      const s = b[0] < 0 ? -1 : 1, uo = 0.5 - 0.5 * s, ui = 0.5 + 0.1 * s, i0 = out.pos.length / 3;
      for (const [p, u, v] of [[a, ui, v0], [b, uo, v0], [c, uo, v1], [d, ui, v1]]) {
        out.pos.push(p[0], p[1], p[2]); out.nrm.push(0, 0, -1); out.uv.push(u, v);
      }
      out.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    }
    m = _gfx.createTexMesh(out);
  }
  _mirrorGlassMeshes.set(quads, m);
  return m;
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
  const h = 0.030, w = h * 0.55, t = h * 0.16, q = h / 4, cy = 0.022, cz = -0.0335;
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
  _rigBox(out, 0, 0.023, 0, 0.008, 0.046, 0.004, [0.25, 1.25, 0.5]);  // anchored at y=0
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
// Compact monochrome telemetry for the 2000s wheel, using cached digits.
const _RETRO_FX={emissive:1,roughness:.9,specular:0,noAlphaWrite:true,alpha:1};
const _retroDigits={}, _retroT=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]), _retroM=new Float32Array(16);
function drawRetroTelemetry(mat,c,kph,t) {
  const speed=Math.max(0,Math.min(999,typeof AppearanceOpts!=='undefined'?AppearanceOpts.speed(kph):Math.round(kph)));
  const values=[...String(speed).padStart(3,'0'),String(Math.max(0,Math.min(9,c.gear||1)))];
  for(let i=0;i<4;i++) {
    const n=+values[i];
    if(!_retroDigits[n]) {
      const out={pos:[],nrm:[],col:[],idx:[]},L=_seg7Layout(.011,.006,.0013,.00275);
      for(let j=0;j<7;j++)if(_SEG7[n][j])_rigBox(out,L[j][1],L[j][0],0,L[j][2],L[j][3],.001,[.58,.82,.40]);
      _retroDigits[n]=_gfx.createMesh(out);
    }
    _retroT[0]=_retroT[5]=_retroT[10]=1;
    _retroT[12]=i===3?.025:-.029+i*.010;_retroT[13]=.042;_retroT[14]=-.018;
    M4.mulTo(_retroM,mat,_retroT);_gfx.draw(_retroDigits[n],_retroM,_AX_FX);
  }
  const en=Math.max(0,Math.min(1,c.energy||0));
  _retroT[0]=.32;_retroT[5]=.28*en;_retroT[10]=1;
  _retroT[12]=.034;_retroT[13]=.029;_retroT[14]=-.018;
  if(en>.01){M4.mulTo(_retroM,mat,_retroT);_RETRO_FX.alpha=c.deploying?.75+.25*Math.sin(t*22):1;_gfx.draw(getErsBar(),_retroM,_RETRO_FX);}
  _retroT[0]=_retroT[5]=_retroT[10]=.60;
  _retroT[12]=0;_retroT[13]=.023;_retroT[14]=0;
  M4.mulTo(_retroM,mat,_retroT);
  const rpm=Math.max(0,Math.min(1,((c.rpm||PhysicsConsts.IDLE_RPM)-PhysicsConsts.IDLE_RPM)/(PhysicsConsts.MAX_RPM-PhysicsConsts.IDLE_RPM)));
  _gfx.draw(getLedStrip(rpm>.965?(t*14%1<.5?9:0):Math.round(rpm*8)),_retroM,_AX_FX);
  _retroT[0]=_retroT[5]=_retroT[10]=.50;
  _retroT[12]=0;_retroT[13]=.023;_retroT[14]=0;
  M4.mulTo(_retroM,mat,_retroT);drawWheelExtras(_retroM,c,t);
  if(c.otT>0 || c.otArmed) {
    _RETRO_FX.alpha=c.otT>0?.7+.3*Math.sin(t*18):1;
    _gfx.draw(getOtLamp(c.otT>0),_retroM,_RETRO_FX);
  }
}
const _wheelStatus = {}, _wheelStatusIx = [];   // ix: (mph, 0..4, 0..4) -> mesh, no key string per frame
function getWheelStatus(mph,throttle,brake) {
  const ix = (throttle | 0) === throttle && (brake | 0) === brake && throttle >= 0 && throttle <= 4 && brake >= 0 && brake <= 4
    ? (mph ? 25 : 0) + throttle * 5 + brake : -1;
  if (ix >= 0 && _wheelStatusIx[ix]) return _wheelStatusIx[ix];
  const key=(mph?1:0)+'|'+throttle+'|'+brake;
  if(_wheelStatus[key])return ix >= 0 ? (_wheelStatusIx[ix] = _wheelStatus[key]) : _wheelStatus[key];
  const out={pos:[],nrm:[],col:[],idx:[]};
  _rigLabel(out,mph?'MPH':'KPH',-.034,.001,-.037,.0013,[.35,.75,.78]);
  for(const [x,n,col,label] of [[-.036,throttle,[.16,.85,.35],'T'],[.005,brake,[.95,.18,.12],'B']]) {
    _rigLabel(out,label,x-.017,-.016,-.034,.0012,[.48,.55,.59]);
    _rigBox(out,x,-.016,-.034,.026,.003,.002,[.04,.055,.06]);
    if(n>0)_rigBox(out,x-.013+.013*n/4,-.016,-.036,.026*n/4,.003,.001,col);
  }
  _wheelStatus[key]=_gfx.createMesh(out);
  if (ix >= 0) _wheelStatusIx[ix] = _wheelStatus[key];
  return _wheelStatus[key];
}
const _AX_PULSE = { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true, alpha: 1 };   // pooled: a fresh literal defeated TLX's matKeyFor memo
function drawWheelExtras(mat, c, t) {
  const mph=typeof AppearanceOpts!=='undefined' && AppearanceOpts.units()==='mph';
  _gfx.draw(getWheelStatus(mph,Math.round(Math.max(0,Math.min(1,c.throttleDemand||0))*4),Math.round(Math.max(0,Math.min(1,c.brakeDemand||0))*4)),mat,_AX_FX);
  const ax = Math.max(0, Math.min(1, c.aeroX || 0));
  const open = ax > 0.05;
  _gfx.draw(getAeroLamp(open ? 2 : c.xArmed ? 1 : 0), mat, _AX_FX);
  if (ax <= 0.02) return;
  _axT[12] = 0.067; _axT[13] = 0.004; _axT[14] = -0.0315;
  M4.mulTo(_axM, mat, _axT);
  _gfx.draw(getAeroBar(false), _axM, _AX_FX);
  _axM[0] *= ax; _axM[1] *= ax; _axM[2] *= ax;
  if (ax < 0.999) _AX_PULSE.alpha = 0.65 + 0.35 * Math.sin(t * 20);
  _gfx.draw(getAeroBar(true), _axM, ax < 0.999 ? _AX_PULSE : _AX_FX);
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
  _epLightMesh = _gfx.createMesh(_flatQuadData(0.030, 0.038, [1.75, 0.18, 0.12]));
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
// STRAIGHT-MODE telltale: an emissive trailing-edge strip on the top rear
// flap (and the top front flap). Same draw path as the rain light — existing
// emissive opts, not a new SURFACES id — so it only appears while X-mode is
// open and never steals the FIA rain-light reservation on the baked mesh.
let _aeroEdgeMesh = null;
function getAeroEdgeStrip() {
  if (_aeroEdgeMesh) return _aeroEdgeMesh;
  _aeroEdgeMesh = _gfx.createMesh(_flatQuadData(0.44, 0.011, [1.35, 1.55, 1.95]));
  return _aeroEdgeMesh;
}
const _aeW = new Float32Array(16);
const _AE_FX = { emissive: 1, roughness: 0.9, specular: 0, noAlphaWrite: true };
// Memoised for half a second: it was a localStorage read per X-mode car per frame (~1,300/s at
// 22 cars on a straight). The debug latch (apex.aeroEdge(), or the console) still takes
// effect within the window, with no hook between this file and whoever flips it.
let _aeOn = false, _aeAt = -1e9;
function aeroEdgeOn() {
  const now = Date.now();
  if (now - _aeAt >= 0 && now - _aeAt < 500) return _aeOn;
  _aeAt = now;
  try { _aeOn = localStorage.getItem("apex26.aeroEdge") === "1"; } catch (e) { _aeOn = false; }
  return _aeOn;
}
function drawAeroEdge(modelMat, aLvl, style, blend) {
  if (!(blend > 0.45) || !_gfx || !aeroEdgeOn()) return;   // blend first: a Z-mode car (most of a lap) never reaches the latch
  const flaps = Car3D.aeroFlaps(aLvl, style);
  const pick = (wing) => { let last = null; for (const e of flaps) if (e.wing === wing) last = e; return last; };
  const drawOne = (fg, half) => {
    if (!fg) return;
    const ang = fg.zAngle + (fg.xAngle - fg.zAngle) * blend;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const teY = fg.te[1] - fg.y, teZ = fg.te[0] - fg.z;
    const y = teY * ca - teZ * sa + fg.y;
    const z = teY * sa + teZ * ca + fg.z;
    const W = _aeW;
    W.set(modelMat);
    for (let k = 0; k < 3; k++) {
      const uu = modelMat[4 + k], ff = modelMat[8 + k];
      W[4 + k] = uu * ca + ff * sa;
      W[8 + k] = -uu * sa + ff * ca;
      W[12 + k] += modelMat[4 + k] * y + modelMat[8 + k] * z;
    }
    if (half !== 1) { W[0] *= half; W[1] *= half; W[2] *= half; }
    _AE_FX.emissive = 0.55 + 0.45 * Math.min(1, (blend - 0.45) / 0.55);
    _gfx.draw(getAeroEdgeStrip(), W, _AE_FX);
  };
  drawOne(pick("rear"), 1);
  drawOne(pick("front"), 0.72);
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

  return { init, getMirrorFallback, getMirrorGlass, MIRROR_GLASS_V, carDecalData, getCarDecalMesh, getCockpitDecalMesh, getBrakeRing, getSpinDisc, getCompoundRing, getCrewMesh, CREW_PEOPLE, getExhaustFlame, getBoostFlame, getErsLight, getAeroFlap, getAeroFlapSet, getCockpitWheel, getCockpitDash, getCockpitCabin, getCockpitGlass, COCKPIT_WHEELS, getLedStrip, LED_ROWS, getGearDigit, getSpeedDigit, getErsBar, getOtLamp, drawWheelExtras, drawRetroTelemetry, drawClassicTelemetry, drawRearLights, drawAeroEdge, drawTailGlow, drawMirrorLights, ersLightCode, gridStrobe,
    cockpitWheelRoll, WHEEL_ROLL_LAMBDA, getForearm, suitColour, forearmEnds, forearmMatrix, drawForearms, ARM_R, ARM_TAPER };
})();
Object.freeze(CarMesh);
