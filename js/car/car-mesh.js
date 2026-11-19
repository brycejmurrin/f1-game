const CarMesh = (function () {
  "use strict";

let _gfx = null;
function init(gfx) { Log.info("game", "CarMesh.init"); _gfx = gfx; CockpitRig.init(gfx); }

const _carDecalMeshes = {};
const _carDecalOrder = [];
const CAR_DECAL_CACHE_MAX = 24;
const decalRound = (legacyBody, teamId) => !legacyBody && typeof CarShade !== "undefined" && CarShade.on(teamId);
const anchorKey = (teamId, bodyStyle) => (Car3D.bodyStyleKey ? Car3D.bodyStyleKey(teamId, bodyStyle) : teamId);
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
  const anchorParts = legacyBody ? null : parts;
  const round = decalRound(legacyBody, teamId);
  const anchors = Car3D.bodyAnchors ? Car3D.bodyAnchors(anchorParts, legacyBody ? null : anchorKey(teamId, bodyStyle), spineHeight, round) : null;
  const uvOf = (r) => ({ uL: r.x / S, uR: (r.x + r.w) / S, vT: 1 - r.y / SH, vB: 1 - (r.y + r.h) / SH });
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
  const quadN = (c, ns, uvs) => {
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
  podDecal(R.titleA, 0.32, 0.80, 0.018);
  const cf = anchors ? anchors.coverAt(-0.62) : { x: 0.27, bottom: 0.20, top: 0.81 };
  const cr = anchors ? anchors.coverAt(-1.28) : { x: 0.20, bottom: 0.23, top: 0.69 };
  if (Car3D.coverProfile) {
    const pf = Car3D.coverProfile(cf), pr = Car3D.coverProfile(cr);
    const across = (p) => {
      const r = p.pts.slice(1);
      return r.map(([x, y]) => [-x, y]).concat(r.slice().reverse());
    };
    const PROUD = (Car3D.COVER_STACK && Car3D.COVER_STACK.decal) || 0.022;
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
        const dx = xb - xa, dy = yb - ya, nl = Math.hypot(dx, dy) || 1, nx = -dy / nl, ny = dx / nl;
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
    if (R.tail) {
      const tf = anchors ? anchors.coverAt(-1.28) : { x: 0.20, bottom: 0.23, top: 0.69 };
      const tr = anchors ? anchors.coverAt(-1.92) : { x: 0.14, bottom: 0.25, top: 0.60 };
      drape(R.tail, -1.28, -1.92, Car3D.coverProfile(tf), Car3D.coverProfile(tr));
    }
  } else {
    quad([[-cf.x*0.72, cf.top+0.008, -0.62], [cf.x*0.72, cf.top+0.008, -0.62],
          [cr.x*0.72, cr.top+0.008, -1.28], [-cr.x*0.72, cr.top+0.008, -1.28]], [0, 1, 0.06], R.crest);
  }
  if (R.spineSide) {
    const sZ = [-0.66, -1.90], V_TOP = 0.96, V_BOT = 0.06;
    const PROUD = (Car3D.COVER_STACK && Car3D.COVER_STACK.flankDecal) || 0.014;
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
      const table = anchors?.coverStops || CarShade.COVER_Z;
      const zs = [sZ[0]].concat(table.filter((z) => z < sZ[0] && z > sZ[1]), [sZ[1]]);
      const F = zs.map(flank), f = (z) => (sZ[0] - z) / (sZ[0] - sZ[1]);
      const uR = uvOf(R.spineSide), uL = uvOf(R.spineSideL || R.spineSide);
      const uRight = (z) => uR.uR + (uR.uL - uR.uR) * f(z), uLeft = (z) => uL.uL + (uL.uR - uL.uL) * f(z);
      for (let i = 0; i < zs.length - 1; i++) {
        const a = F[i], b = F[i + 1], za = zs[i], zb = zs[i + 1];
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
      quad([[-b.b[0], b.b[1], sZ[1]], [-a.b[0], a.b[1], sZ[0]], [-a.t[0], a.t[1], sZ[0]], [-b.t[0], b.t[1], sZ[1]]],
           [-a.nx, a.ny, 0], R.spineSideL || R.spineSide);
    }
  }
  const finS = (parts && parts._visual && parts._visual.aero && parts._visual.aero.fin) || 1;
  const fShape = finShape || "standard";
  const fRoot = Car3D.sharkFinRoot ? Car3D.sharkFinRoot(anchors, finS, fShape) : null;
  const finVisible = fShape !== "none" && (!fRoot || fRoot.clear > 0.03);
  if (finVisible) {
    const fp = Car3D.sharkFinPanel ? Car3D.sharkFinPanel(null, null, finS, fShape, fRoot)
      : [{ x: 0.023, y: 0.655, z: -0.82 }, { x: 0.023, y: 0.655, z: -1.56 },
         { x: 0.023, y: 0.945, z: -1.56 }, { x: 0.023, y: 0.945, z: -0.82 }];
    const FIN_N = 0.78, FIN_NY = 0.62;
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
  podDecal(R.strip, 0.08, 0.30, 0.020);
  if (Car3D.wingBand) {
    const lvl = aLvl == null ? 2 : aLvl;
    const B = Car3D.wingBand(lvl, Car3D.aeroStyleOf ? Car3D.aeroStyleOf(parts) : null);
    if (B) {
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
    const corner = (u, f) => {
      const st = at(u), frac = 0.30 + 0.44 * f;
      return { x: st.x + (fp.w / 2) * (1 + (st.t - 1) * frac) + 0.004,
               y: st.y - st.h / 2 + st.h * frac, z: st.z };
    };
    const BL = corner(0.20, 0), BR = corner(0.80, 0), TR = corner(0.80, 1), TL = corner(0.20, 1);
    quad([[BL.x, BL.y, BL.z], [BR.x, BR.y, BR.z], [TR.x, TR.y, TR.z], [TL.x, TL.y, TL.z]], [1, 0, 0], R.fwEnd);
    quad([[-BR.x, BR.y, BR.z], [-BL.x, BL.y, BL.z], [-TL.x, TL.y, TL.z], [-TR.x, TR.y, TR.z]], [-1, 0, 0], R.fwEnd);
  }
  const nb = (Car3D.numberBoard ? Car3D.numberBoard(aLvl == null ? 2 : aLvl, Car3D.aeroStyleOf ? Car3D.aeroStyleOf(parts) : undefined) : { cy: 0.62, h: 0.20 });
  const ex = 0.539, eyB = nb.cy - nb.h * 0.5 + 0.01, eyT = nb.cy + nb.h * 0.5 - 0.01, ezF = -2.30, ezR = -2.52;
  if (!anchors?.podSculpt) {
  quad([[ex, eyB, ezF], [ex, eyB, ezR], [ex, eyT, ezR], [ex, eyT, ezF]], [1, 0, 0], R.num);
  quad([[-ex, eyB, ezR], [-ex, eyB, ezF], [-ex, eyT, ezF], [-ex, eyT, ezR]], [-1, 0, 0], R.num);
  }
  if (typeof LiveryStations !== "undefined" && !legacyBody) LiveryStations.emit(quadUv, uvOf, R, anchors, stationCtx(parts, teamId, bodyStyle, round));
  return out;
}
function stationCtx(parts, teamId, bodyStyle, round) {
  const style = Car3D.teamStyleOf ? Car3D.teamStyleOf(anchorKey(teamId, bodyStyle)) : null;
  const nose = Car3D.styledNoseStations ? Car3D.styledNoseStations(style) : null;
  const cockpit = parts && parts._visual && parts._visual.cockpit || {};
  return { noseTipZ: nose && nose[0] ? nose[0].z : null, monocoque: Car3D.CHASSIS && Car3D.CHASSIS.monocoque,
           halo: LiveryStations.haloOf(cockpit, round) };
}
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
  const anchors = Car3D.bodyAnchors ? Car3D.bodyAnchors(anchorParts, legacyBody ? null : anchorKey(teamId, bodyStyle), spineHeight, round) : { key: "legacy" };
  const level = aLvl == null ? 2 : Number(aLvl);
  const finK = (parts && parts._visual && parts._visual.aero && parts._visual.aero.fin) || 1;
  const aSt = Car3D.aeroStyleOf ? Car3D.aeroStyleOf(parts) : null;
  const drsK = aSt ? JSON.stringify(aSt)
                   : ((parts && parts._visual && parts._visual.aero && parts._visual.aero.drs) ? 1 : 0);
  const shapeK = finShape || "standard";
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
    const c = [[-nf.topSide*0.84, nf.top+0.020, 2.10], [nf.topSide*0.84, nf.top+0.020, 2.10],
               [nr.topSide*0.84, nr.top+0.020, 1.72], [-nr.topSide*0.84, nr.top+0.020, 1.72]];
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

let spinDiscMesh = null;
function getSpinDisc() {
  if (spinDiscMesh) return spinDiscMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const SEG = 24, R0 = 0.075, R1 = 0.228;
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

const _compoundRings = new Map();
  function getCompoundRing(col) {
    const key = colKey3(col);
    let m = _compoundRings.get(key);
    if (m) return m;
    const out = { pos: [], nrm: [], col: [], idx: [] };
    const SEG = 20, R0 = 0.24, R1 = 0.315, GAP0 = 0, GAP1 = 1;
    for (let i = 0; i < SEG; i++) {
      if (i === GAP0 || i === GAP1) continue;
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

const _crewMeshes = new Map();
const CREW_CACHE_MAX = 32;
const CREW_PEOPLE = 6;
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
  const jack = (z0, dir) => {
    P.block(out, 0, 0.11, z0, 0.36, 0.05, 0.07, steel, mid);
    P.block(out, 0, 0.14, z0 + dir * 0.62, 0.06, 0.04, 0.55, col, mid);
    for (const x of [-0.30, 0.30]) P.block(out, x, 0.07, z0 + dir * 1.10, 0.03, 0.07, 0.07, rubber, mid);
    P.block(out, 0, 0.13, z0 + dir * 1.10, 0.33, 0.03, 0.03, steel, mid);
    P.block(out, 0, 0.55, z0 + dir * 1.22, 0.025, 0.40, 0.025, col, mid);
    P.block(out, 0, 0.95, z0 + dir * 1.22, 0.22, 0.025, 0.025, dark, mid);
  };
  jack(2.6, 1);
  jack(-2.4, -1);
  for (const [x, z] of [[1.35, 1.7], [-1.35, 1.7], [1.35, -1.6], [-1.35, -1.6]]) {
    P.block(out, x, 0.06, z, 0.07, 0.06, 0.16, dark, mid);
    P.block(out, x + 0.55, 0.02, z + 0.05, 0.50, 0.02, 0.02, rubber, mid);
  }
  const person = (x, z, faceZ) => {
    P.block(out, x, 0.42, z, 0.11, 0.22, 0.09, suit, mid);
    P.block(out, x, 0.78, z, 0.09, 0.09, 0.09, helm, mid);
    P.block(out, x, 0.70, z + faceZ * 0.06, 0.07, 0.05, 0.04, skin, mid);
    P.block(out, x - 0.06, 0.12, z, 0.05, 0.12, 0.05, dark, mid);
    P.block(out, x + 0.06, 0.12, z, 0.05, 0.12, 0.05, dark, mid);
    P.block(out, x - 0.18, 0.48, z, 0.05, 0.05, 0.14, suit, mid);
    P.block(out, x + 0.18, 0.48, z, 0.05, 0.05, 0.14, suit, mid);
  };
  for (const [x, z] of [[1.55, 1.7], [-1.55, 1.7], [1.55, -1.6], [-1.55, -1.6]]) {
    person(x, z, z > 0 ? -1 : 1);
  }
  person(0.55, 3.55, -1);
  person(-0.55, -3.35, 1);
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

function _flatQuadData(w, h, col) {
  const out = { pos: [], nrm: [], col: [], idx: [] };
  out.pos.push(-w, -h, 0,  w, -h, 0,  w, h, 0,  -w, h, 0);
  for (let i = 0; i < 4; i++) { out.nrm.push(0, 0, -1); out.col.push(col[0], col[1], col[2]); }
  out.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);
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
const _flapKeyMemo = new WeakMap(), FLAP_DEF_COL = Object.freeze([0.9, 0.9, 0.1]);
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
  const f = finish || "";
  let pair = byFin.get(f);
  if (!pair) { pair = [undefined, undefined]; byFin.set(f, pair); }
  const i = carbon ? 1 : 0;
  return pair[i] || (pair[i] = g.cacheKey + "|" + ck + "|" + f + "|" + (carbon ? "carbon" : "paint"));
}
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
function flapState() { return { sets: _flapSetOrder.length, elements: _flapOrder.length }; }
function releaseIdleFlaps(idleMs) {
  if (!_flapNow() || !_gfx) return 0;
  const now = _flapLast(_flapSets, _flapSetOrder, _flapLast(_flapMeshes, _flapOrder, 0));
  const n = _flapEvictIdle(_flapMeshes, _flapOrder, idleMs, now);
  const sets = _flapEvictIdle(_flapSets, _flapSetOrder, idleMs, now);
  if (sets) _flapSetMemo.clear();
  return n + sets;
}
function _flapPut(cache, order, max, key, data) {
  const mesh = cache[key] = _flapUse(_gfx.createMesh(data));
  order.push(key);
  if (order.length > max) {
    const old = order.shift();
    if (cache[old] && _gfx.freeMesh) _gfx.freeMesh(cache[old]);
    delete cache[old];
  }
  return mesh;
}
function getAeroFlap(aLvl, col, idx, style, el, finish, surface) {
  const c = col || FLAP_DEF_COL;
  const g = el || Car3D.aeroFlaps(aLvl, style)[idx | 0];
  if (!g) return null;
  const key = _flapKey(g, aLvl, style, c, finish, surface);
  return _flapUse(_flapMeshes[key]) || _flapPut(_flapMeshes, _flapOrder, FLAP_CACHE_MAX, key, Car3D.buildFlapGeom(g, c, finish, surface));
}
const _flapSets = {}, _flapSetOrder = [], _flapSetMemo = new Map();
const FLAP_SET_MAX = 64;
function getAeroFlapSet(aLvl, col, style, finish, open, only, surface, rearCol) {
  const c = col || FLAP_DEF_COL, flaps = Car3D.aeroFlaps(aLvl, style);
  if (!flaps.length) return null;
  const pr = rearCol && flaps[flaps.length - 1].paint ? flaps[flaps.length - 1] : null;
  const rk = pr ? _flapKey(pr, aLvl, style, rearCol, finish, surface) : "";
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
  if (_flapSetOrder.length === nOrder) { _flapSetMemo.clear(); row = memo = undefined; }
  return remember(made);
}


const _mirrorFbMeshes = new Map();
const _FB_DAY = { TOP: [0.62, 0.72, 0.84], MID: [0.40, 0.48, 0.58], BOT: [0.20, 0.23, 0.27] };
const _FB_NIGHT = { TOP: [0.045, 0.050, 0.070], MID: [0.028, 0.032, 0.042], BOT: [0.014, 0.016, 0.022] };
function getMirrorFallback(quads, night) {
  const key = night ? 1 : 0;
  let slot = _mirrorFbMeshes.get(quads);
  if (slot && slot[key]) return slot[key];
  if (!slot) { slot = [null, null]; _mirrorFbMeshes.set(quads, slot); }
  const band = night ? _FB_NIGHT : _FB_DAY;
  const out = { pos: [], nrm: [], col: [], idx: [] }, TOP = band.TOP, MID = band.MID, BOT = band.BOT;
  const mixV = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  for (const [a, b, c, d] of quads) {
    for (const [t0, t1, c0, c1] of [[0, 0.55, BOT, MID], [0.55, 1, MID, TOP]]) {
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
const _SEG7 = [
  [1,1,1,1,1,1,0],[0,1,1,0,0,0,0],[1,1,0,1,1,0,1],[1,1,1,1,0,0,1],[0,1,1,0,0,1,1],
  [1,0,1,1,0,1,1],[1,0,1,1,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1],
];
function _seg7Layout(h, w, t, q) {
  return [ [h/2, 0, w, t], [q, w/2, t, h/2], [-q, w/2, t, h/2],
           [-h/2, 0, w, t], [-q, -w/2, t, h/2], [q, -w/2, t, h/2], [0, 0, w, t] ];
}
const _gearMeshes = {};
function getGearDigit(g) {
  if (_gearMeshes[g]) return _gearMeshes[g];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const GRN = [1.3, 0.65, 0.12];
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
  CockpitRig.box(out, 0, 0.023, 0, 0.008, 0.046, 0.004, [0.25, 1.25, 0.5]);
  _ersBarMesh = _gfx.createMesh(out);
  return _ersBarMesh;
}
const _aeroLamps = {};
function getAeroLamp(state) {
  if (_aeroLamps[state]) return _aeroLamps[state];
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const COL = state === 2 ? [0.30, 1.75, 2.20]
            : state === 1 ? [1.70, 1.05, 0.20]
            : [0.10, 0.10, 0.13];
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
const _axT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const _axM = new Float32Array(16);
const _AX_FX = { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true };
const _RETRO_FX={emissive:1,roughness:.9,specular:0,noAlphaWrite:true,alpha:1};
const _retroDigits={}, _retroT=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]), _retroM=new Float32Array(16);
const _retroRmq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
function _retroMotionReduced() {
  return !!(_retroRmq && _retroRmq.matches)
    || (typeof document !== "undefined" && !!document.documentElement && document.documentElement.dataset.motion === "reduce");
}
function _retroDigit(n) {
  if(!_retroDigits[n]) {
    const out={pos:[],nrm:[],col:[],idx:[]},L=_seg7Layout(.011,.006,.0013,.00275);
    for(let j=0;j<7;j++)if(_SEG7[n][j])CockpitRig.box(out,L[j][1],L[j][0],0,L[j][2],L[j][3],.001,[.58,.82,.40]);
    _retroDigits[n]=_gfx.createMesh(out);
  }
  return _retroDigits[n];
}
function primeRetroDigits(m) { for (let n = 0; n <= 9; n++) for (let k = 0; k < 4; k++) _gfx.draw(_retroDigit(n), m, _AX_FX); }
function drawRetroTelemetry(mat,c,kph,t) {
  const speed=(typeof HudReadouts!=='undefined'&&HudReadouts.spdDigits)?HudReadouts.spdDigits(kph):Math.max(0,Math.min(999,typeof AppearanceOpts!=='undefined'?AppearanceOpts.speed(kph):Math.round(kph)));
  const values=[...String(speed).padStart(3,'0'),String(Math.max(0,Math.min(9,c.gear||1)))];
  for(let i=0;i<4;i++) {
    const n=+values[i];
    _retroT[0]=_retroT[5]=_retroT[10]=1;
    _retroT[12]=i===3?.025:-.029+i*.010;_retroT[13]=.042;_retroT[14]=-.018;
    M4.mulTo(_retroM,mat,_retroT);_gfx.draw(_retroDigit(n),_retroM,_AX_FX);
  }
  const en=Math.max(0,Math.min(1,c.energy||0));
  _retroT[0]=.32;_retroT[5]=.28*en;_retroT[10]=1;
  _retroT[12]=.034;_retroT[13]=.029;_retroT[14]=-.018;
  if(en>.01){M4.mulTo(_retroM,mat,_retroT);_RETRO_FX.alpha=c.deploying?.75+.25*Math.sin(t*22):1;_gfx.draw(getErsBar(),_retroM,_RETRO_FX);}
  _retroT[0]=_retroT[5]=_retroT[10]=.60;
  _retroT[12]=0;_retroT[13]=.023;_retroT[14]=0;
  M4.mulTo(_retroM,mat,_retroT);
  const rpm=Math.max(0,Math.min(1,((c.rpm||PhysicsConsts.IDLE_RPM)-PhysicsConsts.IDLE_RPM)/(PhysicsConsts.MAX_RPM-PhysicsConsts.IDLE_RPM)));
  _gfx.draw(CockpitRig.getLedStrip(rpm>.965?(_retroMotionReduced()||t*14%1<.5?9:8):Math.round(rpm*8)),_retroM,_AX_FX);
  _retroT[0]=_retroT[5]=_retroT[10]=.50;
  _retroT[12]=0;_retroT[13]=.023;_retroT[14]=0;
  M4.mulTo(_retroM,mat,_retroT);drawWheelExtras(_retroM,c,t);
  if(c.otT>0 || c.otArmed) {
    _RETRO_FX.alpha=c.otT>0?.7+.3*Math.sin(t*18):1;
    _gfx.draw(getOtLamp(c.otT>0),_retroM,_RETRO_FX);
  }
}
const _wheelStatus = {}, _wheelStatusIx = [];
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
const _AX_PULSE = { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true, alpha: 1 };
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
function primeWheelExtras(m) {
  const mph = typeof AppearanceOpts !== "undefined" && AppearanceOpts.units() === "mph";
  for (let th = 0; th <= 4; th++) for (let br = 0; br <= 4; br++) _gfx.draw(getWheelStatus(mph, th, br), m, _AX_FX);
  for (let s = 0; s <= 2; s++) _gfx.draw(getAeroLamp(s), m, _AX_FX);
  _gfx.draw(getAeroBar(false), m, _AX_FX); _gfx.draw(getAeroBar(true), m, _AX_FX);
  _AX_PULSE.alpha = 0.65; _gfx.draw(getAeroBar(true), m, _AX_PULSE);
}
function gridStrobe(countT) { return ((countT * 5.0) % 1) < 0.5; }
const REAR_LIGHTS = Object.freeze({
  ris: Object.freeze([0, 0.50, -2.615]),
  endplate: Object.freeze([0.50, 0.62, -2.705]),
});
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
  _appendAt(out, _flatQuadData(0.068, 0.082, [1.75, 0.18, 0.12]), R[0], R[1], R[2]);
  const ep = _flatQuadData(0.030, 0.038, [1.75, 0.18, 0.12]);
  _appendAt(out, ep, -E[0], E[1], E[2]);
  _appendAt(out, ep, E[0], E[1], E[2]);
  _rearLightSet = _gfx.createMesh(out);
  if (typeof _gfx.pinMesh === "function") _gfx.pinMesh(_rearLightSet);
  return _rearLightSet;
}
const _RL_FX = { emissive: 1, roughness: 0.9, specular: 0, noAlphaWrite: true };
function drawRearLights(mat, emissive) {
  _RL_FX.emissive = emissive;
  _gfx.draw(getRearLightSet(), mat, _RL_FX);
}
let _aeroEdgeMesh = null;
function getAeroEdgeStrip() {
  if (_aeroEdgeMesh) return _aeroEdgeMesh;
  _aeroEdgeMesh = _gfx.createMesh(_flatQuadData(0.44, 0.011, [1.35, 1.55, 1.95]));
  return _aeroEdgeMesh;
}
const _aeW = new Float32Array(16);
const _AE_FX = { emissive: 1, roughness: 0.9, specular: 0, noAlphaWrite: true };
let _aeOn = false, _aeAt = -1e9;
function aeroEdgeOn() {
  const now = Date.now();
  if (now - _aeAt >= 0 && now - _aeAt < 500) return _aeOn;
  _aeAt = now;
  try { _aeOn = localStorage.getItem("apex26.aeroEdge") === "1"; } catch (e) { _aeOn = false; }
  return _aeOn;
}
function drawAeroEdge(modelMat, aLvl, style, blend) {
  if (!(blend > 0.45) || !_gfx || !aeroEdgeOn()) return;
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
let _tgMesh = null, _tgTex = null, _tgTried = false;
const _tgW = new Float32Array(16);
const _TG_OPTS = { glow: 1.6, batch: true };
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
const _tgS0 = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
const _tgS1 = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
function drawTailGlow(groundMat, amt, track, s) {
  if (!(amt > 0) || !_tailGlowRes()) return;
  const W = _tgW, k = Math.min(1.8, Math.sqrt(amt));
  const hw = 1.25 * k, hl = 2.6 * k;
  const dc = 2.4 + hl * 0.55;
  let rise = 0;
  if (track && s != null && typeof Tracks !== "undefined" && Tracks.sample) {
    Tracks.sample(track, s, _tgS0); Tracks.sample(track, s - dc, _tgS1);
    rise = Math.max(-1.5, Math.min(1.5, (_tgS1.p[1] - _tgS0.p[1]) + groundMat[9] * dc));
  }
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
function flushTailGlows() {
  for (let i = 0; i < _tgN; i++) _gfx.drawDecal(_tgMesh, _tgQ[i], _tgTex, _TG_OPTS);
  _tgN = 0;
}
const _mirrorLightSets = new WeakMap();
function getMirrorLightSet(anchors) {
  let m = _mirrorLightSets.get(anchors);
  if (m) return m;
  const A = [2.3, 1.25, 0.12], q = { pos: [], nrm: [], col: [], idx: [] };
  const h = 0.018, d = 0.030;
  q.pos.push(0, -h, -d,  0, -h, d,  0, h, d,  0, h, -d);
  for (let i = 0; i < 4; i++) { q.nrm.push(1, 0, 0); q.col.push(A[0], A[1], A[2]); }
  q.idx.push(0, 2, 1, 0, 3, 2,  0, 1, 2, 0, 2, 3);
  const out = { pos: [], nrm: [], col: [], idx: [] };
  for (let i = 0; i < anchors.length; i++) _appendAt(out, q, anchors[i].x, anchors[i].y, anchors[i].z);
  m = _gfx.createMesh(out);
  _mirrorLightSets.set(anchors, m);
  return m;
}
function drawMirrorLights(mat, anchors) {
  _RL_FX.emissive = 1;
  _gfx.draw(getMirrorLightSet(anchors), mat, _RL_FX);
}
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

  return { init, releaseIdleFlaps, flapState, getMirrorFallback, getMirrorGlass, carDecalData, getCarDecalMesh, getCockpitDecalMesh, getBrakeRing, getSpinDisc, getCompoundRing, getCrewMesh, CREW_PEOPLE, getExhaustFlame, getBoostFlame, getErsLight, getAeroFlap, getAeroFlapSet, getCockpitWheel: CockpitRig.getCockpitWheel, cockpitWheelOpts: CockpitRig.cockpitWheelOpts, wheelFinish: CockpitRig.wheelFinish, WHEEL_FINISHES: CockpitRig.WHEEL_FINISHES, WHEEL_DEFAULT: CockpitRig.WHEEL_DEFAULT, wheelFinishPass: CockpitRig.wheelFinishPass, getCockpitDash: CockpitRig.getCockpitDash, getCockpitCabin: CockpitRig.getCockpitCabin, getCockpitGlass: CockpitRig.getCockpitGlass, COCKPIT_WHEELS: CockpitRig.COCKPIT_WHEELS, getLedStrip: CockpitRig.getLedStrip, LED_ROWS: CockpitRig.LED_ROWS, getGearDigit, getSpeedDigit, getErsBar, getOtLamp, getWheelStatus, getAeroLamp, getAeroBar, drawWheelExtras, primeWheelExtras, drawRetroTelemetry, primeRetroDigits, drawClassicTelemetry: CockpitRig.drawClassicTelemetry, drawRearLights, REAR_LIGHTS, drawAeroEdge, drawTailGlow, flushTailGlows, drawMirrorLights, ersLightCode, gridStrobe,
    cockpitWheelRoll: CockpitRig.cockpitWheelRoll, WHEEL_ROLL_LAMBDA: CockpitRig.WHEEL_ROLL_LAMBDA, getForearm: CockpitRig.getForearm, suitColour: CockpitRig.suitColour, forearmEnds: CockpitRig.forearmEnds, forearmMatrix: CockpitRig.forearmMatrix, drawForearms: CockpitRig.drawForearms, ARM_R: CockpitRig.ARM_R, ARM_TAPER: CockpitRig.ARM_TAPER };
})();
Object.freeze(CarMesh);
