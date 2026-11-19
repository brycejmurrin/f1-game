const ApexTrack = (function () {
  "use strict";

  function hooks(G, deps) {
    const { smp, wrapS } = deps;

    return {
nodeAt(frac, opts) {
    if (!G.track) return null;
    if (!Number.isFinite(+frac) || frac === null || frac === "") {
      return { ok: false, error: "bad_argument", message: "nodeAt(frac) needs a finite fraction of the lap (0-1)", fix: "pass e.g. nodeAt(0.45)" };
    }
    const raw = ((Math.round(frac * G.track.n) % G.track.n) + G.track.n) % G.track.n;
    const k = opts && opts.scenery && typeof TrackSpace !== "undefined" && TrackSpace
      ? TrackSpace.sceneryNode(G.track.def, raw, G.track.n)
      : raw;
    return { k, frac: +(k / G.track.n).toFixed(4), x: +G.track.px[k].toFixed(3), y: +G.track.py[k].toFixed(3), z: +G.track.pz[k].toFixed(3), tx: +G.track.tx[k].toFixed(3), tz: +G.track.tz[k].toFixed(3), rx: +G.track.rx[k].toFixed(3), rz: +G.track.rz[k].toFixed(3), hw: +G.track.hw[k].toFixed(3) };
  },
projTest(frac, lateral) {
    if (!G.track) return null;
    const s = wrapS((frac || 0) * G.track.total);
    const lat = lateral || 0;
    Tracks.sample(G.track, s, smp);
    const wx = smp.p[0] + smp.r[0] * lat;
    const wz = smp.p[2] + smp.r[2] * lat;
    const p = Tracks.project(G.track, wx, wz, s);
    const ds = M4.wrapDelta(p.s - s, G.track.total);
    return { s, lat, world: [wx, wz], got: { s: p.s, lat: p.lat, dist: p.dist },
             err: { s: ds, lat: p.lat - lat } };
  },
wallStats() {
    if (!G.track || !G.track.barR) return null;
    const pit = G.track.pit, keep = pit && pit.keep;
    let minB = Infinity, maxB = -Infinity, maxPitB = -Infinity;
    let minOverHw = Infinity, anyNaN = false, tightSides = 0, pitSides = 0;
    for (let k = 0; k < G.track.n; k++) {
      const r = G.track.barR[k], l = G.track.barL[k], own = keep && keep[k] > 0 ? pit.side : 0;
      if (!Number.isFinite(r) || !Number.isFinite(l)) anyNaN = true;
      minB = Math.min(minB, r, l);
      if (own > 0) maxPitB = Math.max(maxPitB, r); else maxB = Math.max(maxB, r);
      if (own < 0) maxPitB = Math.max(maxPitB, l); else maxB = Math.max(maxB, l);
      minOverHw = Math.min(minOverHw, r - G.track.hw[k], l - G.track.hw[k]);
      if (own > 0) pitSides++; else if (r < G.track.hw[k] + 8.99) tightSides++;
      if (own < 0) pitSides++; else if (l < G.track.hw[k] + 8.99) tightSides++;
    }
    return { minB, maxB, maxPitB: Number.isFinite(maxPitB) ? maxPitB : null,
      minOverHw, anyNaN, tightFrac: tightSides / Math.max(1, G.track.n * 2 - pitSides),
      pitSides, street: !!G.track.street, n: G.track.n };
  },
modelDiagnostics() {
    if (!G.track || !G.track.modelDiagnostics) return null;
    return JSON.parse(JSON.stringify(G.track.modelDiagnostics));
  },
geometryDiagnostics() {
    if (!G.track || !G.track.geometryDiagnostics) return null;
    return JSON.parse(JSON.stringify(G.track.geometryDiagnostics));
  },
trackGeometry(keep) {
    if (typeof keep === "boolean") Tracks.setKeepGeometry(keep);
    if (!G.track || !G.track.roadGeo || !G.track.terrainGeo) return null;
    return {
      road: G.track.roadGeo, terrain: G.track.terrainGeo,
      props: G.track.propsGeo, glass: G.track.glassGeo, water: G.track.waterGeo,
    };
  },
maxWallOvershoot() {
    if (!G.track || !G.track.barR) return null;
    let m = 0;
    for (const c of G.cars) {
      if (c.finished) continue;
      const wr = Tracks.wallAt(G.track, c.s, 1), wl = Tracks.wallAt(G.track, c.s, -1);
      m = Math.max(m, c.x - wr, -wl - c.x, 0);
    }
    return m;
  },
groundY(f, lat = 0) {
    if (!G.track) return false;
    const s = ((f % 1) + 1) % 1 * G.track.total;
    Tracks.sample(G.track, s, smp);
    const x = smp.p[0] + smp.r[0] * lat, z = smp.p[2] + smp.r[2] * lat;
    const ty = Tracks.terrainY(G.track, x, z), r3 = (v) => +v.toFixed(3);
    const bank = Tracks.banking ? Tracks.banking(G.track, s, lat) : null;
    const dy = bank && typeof bank.dy === "number" ? bank.dy : 0, surf = smp.p[1] + dy;
    return { x: +x.toFixed(2), z: +z.toFixed(2), roadY: r3(smp.p[1]), bankDy: r3(dy),
      roadSurfaceY: r3(surf), terrainY: ty == null ? null : r3(ty),
      gap: ty == null ? null : r3(ty - smp.p[1]), overRoad: ty == null ? null : r3(ty - surf) };
  },
mapPts() {
    return G.track ? G.track.map.slice() : null;
  },
trackBounds() {
    if (!G.track) return null;
    const px = G.track.px, pz = G.track.pz, n = G.track.n;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      if (px[i] < minX) minX = px[i]; if (px[i] > maxX) maxX = px[i];
      if (pz[i] < minZ) minZ = pz[i]; if (pz[i] > maxZ) maxZ = pz[i];
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    let bestD = Infinity, bestI = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(px[i] - cx, pz[i] - cz);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return {
      minX: +minX.toFixed(1), maxX: +maxX.toFixed(1),
      minZ: +minZ.toFixed(1), maxZ: +maxZ.toFixed(1),
      spanX: +(maxX - minX).toFixed(1), spanZ: +(maxZ - minZ).toFixed(1),
      centerFrac: +(bestI / n).toFixed(4),
    };
  },
    };
  }

  return { hooks };
})();
Object.freeze(ApexTrack);
