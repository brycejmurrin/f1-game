/* Apex 26 — car mesh/decal/cockpit-instrument geometry builders for js/game.js: the shared decal-quad meshes (logo/sponsor UVs into the LiveryTex atlas), the effe… */
const CarMesh = (function () {
  "use strict";

let _gfx = null;            // renderer handle, set once by init()
function init(gfx) { Log.info("game", "CarMesh.init"); _gfx = gfx; CockpitRig.init(gfx); }

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
// The body the anchors follow: a livery's bodyStyle swaps the chassis, not the team (Car3D.bodyStyleKey).
const anchorKey = (teamId, bodyStyle) => (Car3D.bodyStyleKey ? Car3D.bodyStyleKey(teamId, bodyStyle) : teamId);
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
function carDecalData(aLvl, parts, legacyBody, teamId, finShape, spineHeight, bodyStyle) {
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
  const anchors = Car3D.bodyAnchors ? Car3D.bodyAnchors(anchorParts, legacyBody ? null : anchorKey(teamId, bodyStyle), spineHeight, round) : null;
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
      (anchors.podStops || anchors.podStations).map((p) => p.z) : [0.22, -0.62];
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
      if (anchors && anchors.podSculpt) {
        const cuts = [yBottom, ...[0.22, 0.65].filter(f => f > yBottom && f < yTop), yTop];
        const point = (z, f, side) => { const p = anchors.podFlank(z, f); return [side * (p[0] + 0.004), p[1], z]; };
        const vAt = f => u.vB + (u.vT - u.vB) * (f - yBottom) / (yTop - yBottom);
        for (let k = 0; k < cuts.length - 1; k++) {
          const lo = cuts[k], hi = cuts[k + 1];
          const p = point(aZ, lo, 1), q = point(aZ, hi, 1), dx = q[0] - p[0], dy = q[1] - p[1], n = Math.hypot(dx, dy);
          quadUv([p, point(bZ, lo, 1), point(bZ, hi, 1), q], [dy / n, -dx / n, 0],
            [[rU(ta),vAt(lo)], [rU(tb),vAt(lo)], [rU(tb),vAt(hi)], [rU(ta),vAt(hi)]]);
          quadUv([point(bZ, lo, -1), point(aZ, lo, -1), point(aZ, hi, -1), point(bZ, hi, -1)], [-dy / n, -dx / n, 0],
            [[lU(tb),vAt(lo)], [lU(ta),vAt(lo)], [lU(ta),vAt(hi)], [lU(tb),vAt(hi)]]);
        }
        continue;
      }
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
      const uv = uvOf(region), W = pF.pts[1][0] * 2;
      const stops = anchors?.coverStops ? [zF, ...anchors.coverStops.filter(z => z < zF && z > zR), zR] : [zF, zR];
      for (let s = 0; s < stops.length - 1; s++) {
      const za = stops[s], zb = stops[s + 1];
      const L = across(s ? Car3D.coverProfile(anchors.coverAt(za)) : pF);
      const Rr = across(s === stops.length - 2 ? pR : Car3D.coverProfile(anchors.coverAt(zb)));
      const vv = z => uv.vB + (uv.vT - uv.vB) * (zF - z) / (zF - zR);
      for (let i = 0; i < L.length - 1; i++) {
        const [xa, ya] = L[i], [xb, yb] = L[i + 1], [xc, yc] = Rr[i], [xd, yd] = Rr[i + 1];
        // outward normal of this facet (right-handed: +x when the surface drops to the right)
        const dx = xb - xa, dy = yb - ya, nl = Math.hypot(dx, dy) || 1, nx = -dy / nl, ny = dx / nl;
        // Normalize each complete-body ring by its own shoulder width: shared
        // edges agree and a bulged mid-ring stays inside the atlas region.
        const wl = anchors?.coverStops ? Math.abs(L[0][0]) * 2 : W;
        const wr = anchors?.coverStops ? Math.abs(Rr[0][0]) * 2 : W;
        const fa = (xa + wl / 2) / wl, fb = (xb + wl / 2) / wl;
        const fc = anchors?.coverStops ? (xc + wr / 2) / wr : fa;
        const fd = anchors?.coverStops ? (xd + wr / 2) / wr : fb;
        const uu = (f) => uv.uR + (uv.uL - uv.uR) * f;
        quadUv([[xa + nx * PROUD, ya + ny * PROUD, za], [xb + nx * PROUD, yb + ny * PROUD, za],
                [xd + nx * PROUD, yd + ny * PROUD, zb], [xc + nx * PROUD, yc + ny * PROUD, zb]],
               [nx, ny, 0.06], [[uu(fa), vv(za)], [uu(fb), vv(za)], [uu(fd), vv(zb)], [uu(fc), vv(zb)]]);
      }
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
    const profiled = round || !!anchors?.coverStops;
    const foot = (p) => (profiled && p.pts ? p.pts[0][0] : p.x);
    const flank = (z) => {
      const c = anchors ? anchors.coverAt(z) : (z > -1 ? { x: 0.27, bottom: 0.20, top: 0.81 } : { x: 0.20, bottom: 0.23, top: 0.69 });
      const p = Car3D.coverProfile ? Car3D.coverProfile(c) : { x: c.x, bottom: c.bottom, shoulder: c.top };
      const lean = profiled && p.pts ? p.pts[0][0] - p.pts[1][0] : 0.28 * p.x;
      const h = p.shoulder - p.bottom, nl = Math.hypot(h, lean), nx = h / nl, ny = lean / nl;
      const at = (v) => [(profiled && p.pts ? foot(p) - lean * v : p.x * (1 - 0.28 * v)) + nx * PROUD, p.bottom + h * v + ny * PROUD];
      return { b: at(V_BOT), t: at(V_TOP), nx, ny };
    };
    if (anchors?.coverStops || (round && typeof CarShade !== "undefined" && CarShade.COVER_Z)) {
      // ROUNDED: the coke pinch curves the foot between stations, and one
      // straight quad edge from -0.66 to -1.90 is a chord across that curve:
      // measured, up to 40 mm off the skin at the waist (coke 1.38) against
      // 14 mm at its ends, so the band floats free. So the band is a strip of
      // sub-quads at the rings the cover is lofted at (CarShade.COVER_Z), u by
      // z and a normal per corner, which keeps it its PROUD off the skin.
      const table = anchors?.coverStops || CarShade.COVER_Z;
      const zs = [sZ[0]].concat(table.filter((z) => z < sZ[0] && z > sZ[1]), [sZ[1]]);
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
  const noseLabel = (region, zF, zR, width, proud, nz) => {
    const u = uvOf(region), zs = [zF, ...anchors.noseStops.filter(z => z < zF && z > zR), zR];
    const v = z => u.vB + (u.vT - u.vB) * (zF - z) / (zF - zR);
    for (let i = 0; i < zs.length - 1; i++) {
      const a = anchors.noseAt(zs[i]), b = anchors.noseAt(zs[i + 1]);
      quadUv([[-a.topSide*width,a.top+proud,a.z],[a.topSide*width,a.top+proud,a.z],
        [b.topSide*width,b.top+proud,b.z],[-b.topSide*width,b.top+proud,b.z]], [0,1,nz],
        [[u.uR,v(a.z)],[u.uL,v(a.z)],[u.uL,v(b.z)],[u.uR,v(b.z)]]);
    }
  };
  const nR = anchors ? anchors.noseAt(1.72) : { top: 0.45, topSide: 0.16 };
  const nF = anchors ? anchors.noseAt(2.10) : { top: 0.43, topSide: 0.14 };
  if (anchors?.noseStops) noseLabel(R.num,2.10,1.72,0.84,0.020,0.05);
  else quad([[-nF.topSide*0.84, nF.top+0.020, 2.10], [nF.topSide*0.84, nF.top+0.020, 2.10],
        [nR.topSide*0.84, nR.top+0.020, 1.72], [-nR.topSide*0.84, nR.top+0.020, 1.72]], [0, 1, 0.05], R.num);
  const nsR = anchors ? anchors.noseAt(1.16) : { top: 0.54, topSide: 0.15 };
  const nsF = anchors ? anchors.noseAt(1.66) : { top: 0.48, topSide: 0.14 };
  if (anchors?.noseStops) noseLabel(R.titleB,1.66,1.16,0.82,0.014,0.10);
  else quad([[-nsF.topSide*0.82, nsF.top+0.014, 1.66], [nsF.topSide*0.82, nsF.top+0.014, 1.66],
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
  // aeroStyleOf: the board itself is placed with the aero recipe (rearSweep /
  // fin move the endplate), so the digit must be too (#3111 F15).
  const nb = (Car3D.numberBoard ? Car3D.numberBoard(aLvl == null ? 2 : aLvl, Car3D.aeroStyleOf ? Car3D.aeroStyleOf(parts) : undefined) : { cy: 0.62, h: 0.20 });
  const ex = 0.539, eyB = nb.cy - nb.h * 0.5 + 0.01, eyT = nb.cy + nb.h * 0.5 - 0.01, ezF = -2.30, ezR = -2.52;
  if (!anchors?.podSculpt) {
  quad([[ex, eyB, ezF], [ex, eyB, ezR], [ex, eyT, ezR], [ex, eyT, ezF]], [1, 0, 0], R.num);
  quad([[-ex, eyB, ezR], [-ex, eyB, ezF], [-ex, eyT, ezF], [-ex, eyT, ezR]], [-1, 0, 0], R.num);
  }
  if (typeof LiveryStations !== "undefined" && !legacyBody) LiveryStations.emit(quadUv, uvOf, R, anchors, stationCtx(parts, teamId, bodyStyle, round));
  return out;
}
// What LiveryStations needs beyond the anchors: the nose tip, the monocoque and the halo hoop.
function stationCtx(parts, teamId, bodyStyle, round) {
  const style = Car3D.teamStyleOf ? Car3D.teamStyleOf(anchorKey(teamId, bodyStyle)) : null;
  const nose = Car3D.styledNoseStations ? Car3D.styledNoseStations(style) : null;
  const cockpit = parts && parts._visual && parts._visual.cockpit || {};
  return { noseTipZ: nose && nose[0] ? nose[0].z : null, monocoque: Car3D.CHASSIS && Car3D.CHASSIS.monocoque,
           halo: LiveryStations.haloOf(cockpit, round) };
}
// The decal key, memoised per PARTS object (teamDecalState hands the same one
// back until rev / ruleset move; bodyAnchors already keys on that identity):
// aeroStyleOf builds a whole recipe and the key is ~6 concats + a map/join,
// per drawn car per frame. Every other input is compared, so a new livery
// (finShape / spineHeight), a GLB swap (legacyBody) or the CarShade switch
// (round) rebuilds through the string path below — still the backing store.
const _decalKeyMemo = new WeakMap(), _decalNoParts = {};
function getCarDecalMesh(aLvl, parts, legacyBody, teamId, finShape, spineHeight, bodyStyle) {
  if (typeof LiveryTex === "undefined" || !_gfx.createTexMesh) return null;
  const round = decalRound(legacyBody, teamId);
  const pk = parts == null ? _decalNoParts : typeof parts === "object" ? parts : null;
  const m = pk && _decalKeyMemo.get(pk);
  let k;
  if (m && m.aLvl === aLvl && m.legacy === legacyBody && m.team === teamId && m.fin === finShape
    && m.spine === spineHeight && m.round === round && m.body === bodyStyle) k = m.k;
  else {
    k = decalKeyOf(aLvl, parts, legacyBody, teamId, finShape, spineHeight, round, bodyStyle);
    if (pk) _decalKeyMemo.set(pk, { aLvl, legacy: legacyBody, team: teamId, fin: finShape, spine: spineHeight, round, body: bodyStyle, k });
  }
  if (!_carDecalMeshes[k]) {
    _carDecalMeshes[k] = _gfx.createTexMesh(carDecalData(aLvl == null ? 2 : Number(aLvl), parts, legacyBody, teamId, finShape || "standard", spineHeight, bodyStyle));
    _carDecalOrder.push(k);
    while (_carDecalOrder.length > CAR_DECAL_CACHE_MAX) {
      const old = _carDecalOrder.shift(), mesh = _carDecalMeshes[old];
      if (mesh && _gfx.freeMesh) _gfx.freeMesh(mesh);
      delete _carDecalMeshes[old];
    }
  }
  return _carDecalMeshes[k];
}
function decalKeyOf(aLvl, parts, legacyBody, teamId, finShape, spineHeight, round, bodyStyle) {
  const anchorParts = legacyBody ? null : parts;
  // spineHeight reaches the cache key through anchors.key (the lift is in it),
  // and so does the rounded car ("|r": its flank is draped at the loft's rings).
  const anchors = Car3D.bodyAnchors ? Car3D.bodyAnchors(anchorParts, legacyBody ? null : anchorKey(teamId, bodyStyle), spineHeight, round) : { key: "legacy" };
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
  // Concept curvature and flap gaps also move the decal surface. Key the full
  // normalized recipe, once per parts object through _decalKeyMemo above.
  const drsK = aSt ? JSON.stringify(aSt)
                   : ((parts && parts._visual && parts._visual.aero && parts._visual.aero.drs) ? 1 : 0);
  // finShape is livery, not parts, so anchors.key cannot carry it: it joins here.
  const shapeK = finShape || "standard";
  // The halo strip follows the cockpit's hoop style and fairing (LiveryStations.haloOf).
  const ck = parts && parts._visual && parts._visual.cockpit, haloK = ck ? (ck.halo || 0) + "." + (ck.haloBlade || 0) : "0.0";
  return level + "|" + haloK + "|" + (legacyBody ? "imported|" : "") + finK + "|" + drsK + "|" + shapeK + "|" + anchors.key;
}
let _cockpitDecalMesh = null, _cockpitDecalKey = "";
function getCockpitDecalMesh(parts, teamId, bodyStyle) {
  if (typeof LiveryTex === "undefined" || !_gfx.createTexMesh) return null;
  const sk = anchorKey(teamId, bodyStyle);
  const anchorsForKey = Car3D.bodyAnchors ? Car3D.bodyAnchors(parts, sk) : null;
  const wantKey = (sk || "") + "|" + (anchorsForKey ? anchorsForKey.key : "legacy");
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
function _flapKey(g, aLvl, style, c, finish, surface) {
  const ck = colKey3(c), carbon = surface === "carbon";
  if (!g.cacheKey) {
    return g.id + aLvl + "|" + (style ? [
      style.frontSweep, style.frontTaper, style.frontRise,
      style.rearSweep, style.rearTaper, style.drs || 0].map((v) => +v || 0).join(",") : "d") + "|" + ck + "|" + (finish || "") + "|" + (carbon ? "carbon" : "paint");
  }
  let byCol = _flapKeyMemo.get(g);
  if (!byCol || byCol.size > 64) { byCol = new Map(); _flapKeyMemo.set(g, byCol); }
  let byFin = byCol.get(ck);
  if (!byFin) { byFin = new Map(); byCol.set(ck, byFin); }
  // Keyed on the finish, then the surface as a slot: a hit builds no string (the `finish|surface` concat ran
  // before the lookup, twice per drawn car per frame — perf hunt 9).
  const f = finish || "";
  let pair = byFin.get(f);
  if (!pair) { pair = [undefined, undefined]; byFin.set(f, pair); }
  const i = carbon ? 1 : 0;
  return pair[i] || (pair[i] = g.cacheKey + "|" + ck + "|" + f + "|" + (carbon ? "carbon" : "paint"));
}
// THE GARAGE FREES THE PAINT JOBS IT LEFT BEHIND. The caps are sized for a race
// grid, where every set is drawn every frame. The garage livery editor mints a
// new wing colour or finish per edit, so up to 64 sets + 128 elements of dead
// paint stayed resident until FIFO pushed them out, and on TLX each kept a
// hidden coalesced run (render object + instance buffer, walked by the
// instanced-run pass every frame): edit 60 paid for 59 paint jobs nobody could
// see (M1, docs/notes/MEM-M1-2026-10-18.md). A draw stamps its mesh's last use;
// releaseIdleFlaps(ms), called by the garage on each livery/parts edit
// (setup-camera.js spMeshBust), frees every flap mesh not drawn for `ms`. The
// race path never calls it, so a rival off screen keeps its set. No clock (a
// node VM): nothing is idle.
const _flapNow = () => (typeof performance !== "undefined" && performance.now ? performance.now() : 0);
function _flapUse(m) { if (m) m.__flapT = _flapNow(); return m; }
function _flapLast(cache, order, t) {
  for (let i = 0; i < order.length; i++) { const m = cache[order[i]]; if (m && m.__flapT > t) t = m.__flapT; }
  return t;
}
function _flapEvictIdle(cache, order, idleMs, now) {
  let w = 0, n = 0;
  for (let i = 0; i < order.length; i++) {
    const k = order[i], m = cache[k];
    if (m && now - (m.__flapT || 0) > idleMs) {
      if (_gfx.freeMesh) _gfx.freeMesh(m);
      delete cache[k];
      n++;
      continue;
    }
    order[w++] = k;
  }
  order.length = w;
  return n;
}
// How many flap meshes the caches hold (__apex/specs: garage-livery-churn.spec.js bounds them).
function flapState() { return { sets: _flapSetOrder.length, elements: _flapOrder.length }; }
// IDLE IS MEASURED FROM THE NEWEST FLAP DRAW, NOT THE WALL CLOCK. A frame longer than `ms` (SwiftShader
// draws the garage at ~3 s a frame; a phone stalled on a rebuild) left the set drawn on the LAST frame
// "idle", so an edit freed the live wings and their coalesced run, three's last holder of the instanced
// lit program, and the next frame relinked it: a 2.7 s frame on a part pick (garage-perf-2026-10-20.md).
function releaseIdleFlaps(idleMs) {
  if (!_flapNow() || !_gfx) return 0;
  const now = _flapLast(_flapSets, _flapSetOrder, _flapLast(_flapMeshes, _flapOrder, 0));
  const n = _flapEvictIdle(_flapMeshes, _flapOrder, idleMs, now);
  const sets = _flapEvictIdle(_flapSets, _flapSetOrder, idleMs, now);
  if (sets) _flapSetMemo.clear();   // it may still point at a freed set
  return n + sets;
}
function _flapPut(cache, order, max, key, data) {
  const mesh = cache[key] = _flapUse(_gfx.createMesh(data));
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
function getAeroFlap(aLvl, col, idx, style, el, finish, surface) {
  const c = col || FLAP_DEF_COL;
  // aLvl is passed through RAW — catalog options use fractional levels and the
  // wing geometry depends on the exact value, so it must not be truncated here
  // either (it is part of the cache key for the same reason).
  const g = el || Car3D.aeroFlaps(aLvl, style)[idx | 0];
  if (!g) return null;
  const key = _flapKey(g, aLvl, style, c, finish, surface);
  return _flapUse(_flapMeshes[key]) || _flapPut(_flapMeshes, _flapOrder, FLAP_CACHE_MAX, key, Car3D.buildFlapGeom(g, c, finish, surface));
}
// THE WHOLE FLAP SET AS ONE STATIC MESH at a REST pose — closed (zAngle, Z-mode)
// or `open` (xAngle, X-mode); `only` "front"/"rear" as drawAeroFlaps. Each element
// posed exactly as drawAeroFlaps' matrix poses it (about local X by the angle,
// then hung at its own pivot — tools/car/parts-sweep.mjs appendFlaps) and baked
// into one buffer: one draw with the same options, the same surfaces. It is what
// a rival past FieldLod.flapsM() and the mirror / PiP draw (they drew NO flaps:
// a rear wing stripped to its main plane) and any car whose wings are at rest.
const _flapSets = {}, _flapSetOrder = [], _flapSetMemo = new Map();   // base key -> rear-paint key -> [mesh per (open, only) slot]
const FLAP_SET_MAX = 64;   // ~11 teams x 2 poses a race (+ the cockpit's front-only)
// `rearCol` paints the element flagged paint "rearWing" (the flown drs plane,
// always last in the set); its own memoised key picks the memo row, no concat.
function getAeroFlapSet(aLvl, col, style, finish, open, only, surface, rearCol) {
  const c = col || FLAP_DEF_COL, flaps = Car3D.aeroFlaps(aLvl, style);
  if (!flaps.length) return null;
  const pr = rearCol && flaps[flaps.length - 1].paint ? flaps[flaps.length - 1] : null;
  const rk = pr ? _flapKey(pr, aLvl, style, rearCol, finish, surface) : "";
  // The full key is a string concat per call (per drawn car per frame): a (record, pose) memo keyed on the
  // already-memoised base key turns a hit into two Map/array reads. Cleared whole on an eviction.
  const bk = _flapKey(flaps[0], aLvl, style, c, finish, surface), slot = !only ? (open ? 1 : 0) : only === "front" ? (open ? 3 : 2) : only === "rear" ? (open ? 5 : 4) : -1;
  let row = slot >= 0 ? _flapSetMemo.get(bk) : undefined, memo = row && row.get(rk);
  if (memo && memo[slot]) return _flapUse(memo[slot]);
  const key = bk + (rk && "|R|" + rk) + (open ? "|X|" : "|Z|") + (only || "");
  const remember = (m) => {
    if (slot >= 0) {
      if (!row) _flapSetMemo.set(bk, row = new Map());
      if (!memo) row.set(rk, memo = []);
      memo[slot] = m;
    }
    return m;
  };
  if (_flapSets[key]) return remember(_flapUse(_flapSets[key]));
  const nOrder = _flapSetOrder.length;
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
  for (const fg of flaps) {
    if (only && fg.wing !== only) continue;
    const g = Car3D.buildFlapGeom(fg, fg === pr ? rearCol : c, finish, surface), ang = open ? fg.xAngle : fg.zAngle;
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
  if (_flapSetOrder.length === nOrder) { _flapSetMemo.clear(); row = memo = undefined; }   // an eviction freed a mesh the memo may still point at
  return remember(made);
}

// Cockpit wheel, dash, cabin, glass and shift lights live in js/car/cockpit-rig.js.
// CarMesh re-exports those keys. Digit, lamp and wheel-status meshes call CockpitRig.box / .label.

// MIRROR GLASS FALLBACK: the cockpit housings' glass is near-black because the
// HUD mirror pass is the reflection. While that pass is not drawing (MIRROR
// AUTO on a software GPU, OFF, collapsed) car-draw.js lays this over each
// glass: a smoked sky gradient. Day bands are a pale grey-blue; night bands
// track a dim night sky/road (≈0.01–0.04) so the lens does not read as a day
// env card. Cached per (quads, night).
const _mirrorFbMeshes = new Map();
// Day sky tint (legacy) and night env tint — night TOP stays under ~1.5× a
// typical night road luma (~0.05) once the matte emissive opts are applied.
const _FB_DAY = { TOP: [0.62, 0.72, 0.84], MID: [0.40, 0.48, 0.58], BOT: [0.20, 0.23, 0.27] };
const _FB_NIGHT = { TOP: [0.045, 0.050, 0.070], MID: [0.028, 0.032, 0.042], BOT: [0.014, 0.016, 0.022] };
function getMirrorFallback(quads, night) {
  const key = night ? 1 : 0;
  let slot = _mirrorFbMeshes.get(quads);
  if (slot && slot[key]) return slot[key];
  if (!slot) { slot = [null, null]; _mirrorFbMeshes.set(quads, slot); }
  const band = night ? _FB_NIGHT : _FB_DAY;
  const out = { pos: [], nrm: [], col: [], idx: [] }, TOP = band.TOP, MID = band.MID, BOT = band.BOT;
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
  const m = _gfx.createMesh(out);
  slot[key] = m;
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
    CockpitRig.box(out, 0.014 + L[i][1], cy + L[i][0], cz, L[i][2], L[i][3], 0.006, GRN);
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
    CockpitRig.box(out, L[i][1], L[i][0], 0, L[i][2], L[i][3], 0.006, CYN);
  _spdMeshes[d] = _gfx.createMesh(out);
  return _spdMeshes[d];
}
let _ersBarMesh = null;
function getErsBar() {
  if (_ersBarMesh) return _ersBarMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  CockpitRig.box(out, 0, 0.023, 0, 0.008, 0.046, 0.004, [0.25, 1.25, 0.5]);  // anchored at y=0
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
  CockpitRig.box(out, 0.082, 0.024, -0.031, 0.019, 0.019, 0.003, COL);
  _aeroLamps[state] = _gfx.createMesh(out);
  return _aeroLamps[state];
}
let _aeroBarBg = null, _aeroBarFill = null;
function getAeroBar(fill) {
  if (fill ? _aeroBarFill : _aeroBarBg) return fill ? _aeroBarFill : _aeroBarBg;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const W = 0.030;
  CockpitRig.box(out, W / 2, 0, 0, W, 0.005, 0.003, fill ? [0.30, 1.75, 2.20] : [0.05, 0.06, 0.08]);
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
// Same pair as car-draw.js / game.js motionReduced: OS prefers-reduced-motion OR
// SETTINGS › ACCESSIBILITY MOTION: REDUCED (html[data-motion]=reduce).
const _retroRmq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
function _retroMotionReduced() {
  return !!(_retroRmq && _retroRmq.matches)
    || (typeof document !== "undefined" && !!document.documentElement && document.documentElement.dataset.motion === "reduce");
}
function drawRetroTelemetry(mat,c,kph,t) {
  // Same integer as #hud-speed-n / modern LCD (HudReadouts.spdDigits).
  const speed=(typeof HudReadouts!=='undefined'&&HudReadouts.spdDigits)?HudReadouts.spdDigits(kph):Math.max(0,Math.min(999,typeof AppearanceOpts!=='undefined'?AppearanceOpts.speed(kph):Math.round(kph)));
  const values=[...String(speed).padStart(3,'0'),String(Math.max(0,Math.min(9,c.gear||1)))];
  for(let i=0;i<4;i++) {
    const n=+values[i];
    if(!_retroDigits[n]) {
      const out={pos:[],nrm:[],col:[],idx:[]},L=_seg7Layout(.011,.006,.0013,.00275);
      for(let j=0;j<7;j++)if(_SEG7[n][j])CockpitRig.box(out,L[j][1],L[j][0],0,L[j][2],L[j][3],.001,[.58,.82,.40]);
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
  // #3297: never flash lit 0 (fully dark). Match modern: 9 <-> 8, steady 9 when reduced.
  _gfx.draw(CockpitRig.getLedStrip(rpm>.965?(_retroMotionReduced()||t*14%1<.5?9:8):Math.round(rpm*8)),_retroM,_AX_FX);
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
  CockpitRig.label(out,mph?'MPH':'KPH',-.034,.001,-.037,.0013,[.35,.75,.78]);
  for(const [x,n,col,label] of [[-.036,throttle,[.16,.85,.35],'T'],[.005,brake,[.95,.18,.12],'B']]) {
    CockpitRig.label(out,label,x-.017,-.016,-.034,.0012,[.48,.55,.59]);
    CockpitRig.box(out,x,-.016,-.034,.026,.003,.002,[.04,.055,.06]);
    if(n>0)CockpitRig.box(out,x-.013+.013*n/4,-.016,-.036,.026*n/4,.003,.001,col);
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
// ONE mesh, ONE draw per car: the three quads used to be three draws of two
// meshes through a per-light matrix, three render objects per lit car. Their
// car-local offsets are constants, so they are baked into the vertices
// (mat * (v + o) == (mat * T(o)) * v, identical up to float32 rounding of the
// baked position). Order inside the mesh is the old draw order: RIS, left, right.
const REAR_LIGHTS = Object.freeze({
  ris: Object.freeze([0, 0.50, -2.615]),        // 0.50 up, 2.615 back: 15 mm behind the baked LED face (z -2.60) — coplanar quads z-fight
  endplate: Object.freeze([0.50, 0.62, -2.705]), // x +-0.50, see the endplate anchor note above
});
// Append quad `q` (a {pos,nrm,col,idx} mesh body) to `out`, translated by (ox, oy, oz).
function _appendAt(out, q, ox, oy, oz) {
  const base = out.pos.length / 3;
  for (let i = 0; i < q.pos.length; i += 3) out.pos.push(q.pos[i] + ox, q.pos[i + 1] + oy, q.pos[i + 2] + oz);
  for (let i = 0; i < q.nrm.length; i++) out.nrm.push(q.nrm[i]);
  for (let i = 0; i < q.col.length; i++) out.col.push(q.col[i]);
  for (let i = 0; i < q.idx.length; i++) out.idx.push(q.idx[i] + base);
  return out;
}
let _rearLightSet = null;
function getRearLightSet() {
  if (_rearLightSet) return _rearLightSet;
  const out = { pos: [], nrm: [], col: [], idx: [] }, R = REAR_LIGHTS.ris, E = REAR_LIGHTS.endplate;
  _appendAt(out, _flatQuadData(0.068, 0.082, [1.75, 0.18, 0.12]), R[0], R[1], R[2]);   // the RIS light
  const ep = _flatQuadData(0.030, 0.038, [1.75, 0.18, 0.12]);
  _appendAt(out, ep, -E[0], E[1], E[2]);
  _appendAt(out, ep, E[0], E[1], E[2]);
  _rearLightSet = _gfx.createMesh(out);
  // Pinned against TLX's idle prune (#3677): on a dry day the 2026 ERS light code is the player's only rear-light
  // draw, so every BOOST press after a straight rebuilt its pipeline on WebGPU.
  if (typeof _gfx.pinMesh === "function") _gfx.pinMesh(_rearLightSet);
  return _rearLightSet;
}
// Its own opts bag ON PURPOSE. game.js's _ringWorld / _rainLightOpts are shared
// singletons walked by the brake ring, the ERS strip and the flame inside one
// loop iteration; a helper that wrote a field on one of them would leak it into
// every later draw that frame. The backends copy the matrix at draw time, so
// `mat` goes straight through.
const _RL_FX = { emissive: 1, roughness: 0.9, specular: 0, noAlphaWrite: true };
function drawRearLights(mat, emissive) {
  _RL_FX.emissive = emissive;
  _gfx.draw(getRearLightSet(), mat, _RL_FX);
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
// One constant: glow is part of the decal program key. `batch` lets a backend that
// run-instances decals (TLX: gfx.decalRuns) draw the queued field as ONE object.
const _TG_OPTS = { glow: 1.6, batch: true };
// THE QUEUE (perf hunt 2 F3): on a decalRuns backend the matrices wait here and
// flushTailGlows() draws them back to back after the car loop, a contiguous run
// TLX instances (~19 render objects a night frame -> 1). Same matrices, same
// submission order; decals write no depth. GLX / WGX draw at once, as before.
const _tgQ = [];
let _tgN = 0;
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
  if (_gfx.decalRuns !== true) { _gfx.drawDecal(_tgMesh, W, _tgTex, _TG_OPTS); return; }
  (_tgQ[_tgN] || (_tgQ[_tgN] = new Float32Array(16))).set(W);
  _tgN++;
}
// After the car loop (game.js render): the queued tail glows, in queue order.
function flushTailGlows() {
  for (let i = 0; i < _tgN; i++) _gfx.drawDecal(_tgMesh, _tgQ[i], _tgTex, _TG_OPTS);
  _tgN = 0;
}
// 2026 amber mirror lamps: a car under 20 km/h or stopped lights amber on both
// mirror housings (The Race, 2026 rear-lights explainer). A SIDE-facing quad in
// the yz plane — the rear lights face -z and would read edge-on here.
// One quad per side, baked at the anchors into one mesh per anchors RESULT:
// Car3D.mirrorLightAnchors hands back a frozen array cached per (team, scale),
// so its identity is the key (one draw per car, was two).
const _mirrorLightSets = new WeakMap();
function getMirrorLightSet(anchors) {
  let m = _mirrorLightSets.get(anchors);
  if (m) return m;
  const A = [2.3, 1.25, 0.12], q = { pos: [], nrm: [], col: [], idx: [] };
  const h = 0.018, d = 0.030;
  q.pos.push(0, -h, -d,  0, -h, d,  0, h, d,  0, h, -d);
  for (let i = 0; i < 4; i++) { q.nrm.push(1, 0, 0); q.col.push(A[0], A[1], A[2]); }
  q.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);   // both windings — reads from either side
  const out = { pos: [], nrm: [], col: [], idx: [] };
  for (let i = 0; i < anchors.length; i++) _appendAt(out, q, anchors[i].x, anchors[i].y, anchors[i].z);
  m = _gfx.createMesh(out);
  _mirrorLightSets.set(anchors, m);
  return m;
}
// `anchors` is Car3D.mirrorLightAnchors(teamId, scale): one {x,y,z} per side.
function drawMirrorLights(mat, anchors) {
  _RL_FX.emissive = 1;
  _gfx.draw(getMirrorLightSet(anchors), mat, _RL_FX);
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
  CockpitRig.box(out, -0.082, 0.024, -0.031, 0.019, 0.019, 0.003, active ? [1.6, 0.5, 2.2] : [1.2, 1.2, 1.3]);
  const m = _gfx.createMesh(out);
  if (active) _otActiveMesh = m; else _otArmedMesh = m;
  return m;
}

  // MIRROR_GLASS_V stays module-local (only getMirrorGlass reads it).
  return { init, releaseIdleFlaps, flapState, getMirrorFallback, getMirrorGlass, carDecalData, getCarDecalMesh, getCockpitDecalMesh, getBrakeRing, getSpinDisc, getCompoundRing, getCrewMesh, CREW_PEOPLE, getExhaustFlame, getBoostFlame, getErsLight, getAeroFlap, getAeroFlapSet, getCockpitWheel: CockpitRig.getCockpitWheel, cockpitWheelOpts: CockpitRig.cockpitWheelOpts, wheelFinish: CockpitRig.wheelFinish, WHEEL_FINISHES: CockpitRig.WHEEL_FINISHES, WHEEL_DEFAULT: CockpitRig.WHEEL_DEFAULT, wheelFinishPass: CockpitRig.wheelFinishPass, getCockpitDash: CockpitRig.getCockpitDash, getCockpitCabin: CockpitRig.getCockpitCabin, getCockpitGlass: CockpitRig.getCockpitGlass, COCKPIT_WHEELS: CockpitRig.COCKPIT_WHEELS, getLedStrip: CockpitRig.getLedStrip, LED_ROWS: CockpitRig.LED_ROWS, getGearDigit, getSpeedDigit, getErsBar, getOtLamp, getWheelStatus, getAeroLamp, getAeroBar, drawWheelExtras, drawRetroTelemetry, drawClassicTelemetry: CockpitRig.drawClassicTelemetry, drawRearLights, REAR_LIGHTS, drawAeroEdge, drawTailGlow, flushTailGlows, drawMirrorLights, ersLightCode, gridStrobe,
    cockpitWheelRoll: CockpitRig.cockpitWheelRoll, WHEEL_ROLL_LAMBDA: CockpitRig.WHEEL_ROLL_LAMBDA, getForearm: CockpitRig.getForearm, suitColour: CockpitRig.suitColour, forearmEnds: CockpitRig.forearmEnds, forearmMatrix: CockpitRig.forearmMatrix, drawForearms: CockpitRig.drawForearms, ARM_R: CockpitRig.ARM_R, ARM_TAPER: CockpitRig.ARM_TAPER };
})();
Object.freeze(CarMesh);
