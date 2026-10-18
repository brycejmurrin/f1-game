/* Apex 26 — ApexTrack: track-geometry hooks of window.__apex.
   Pure move out of apex.js (#1660). Curvature readers stay in apex.js. */
const ApexTrack = (function () {
  "use strict";

  function hooks(G, deps) {
    const { smp, wrapS } = deps;

    return {
// World position and orientation of a track node by fraction (0-1).
// `{ scenery: true }` asks the question a CIRCUIT FILE asks. A scenery frac
// is not a racing frac: transformSceneryApi wraps every node-taking helper
// with TrackSpace.sceneryNode, so `anchor(K(0.45))` in js/circuits/scenery/
// and a bare nodeAt(0.45) here land on different nodes on any circuit
// carrying _sceneryShift — at Montreal that is 337 against 489, 152 nodes
// and 600 m apart.
//
// This is not hypothetical. montreal-foundation.spec.js sampled props within
// 2.2 m of nodeAt(0.45) and called them the casino footbridge's piers; the
// piers are 600 m away, and what it had been measuring for months was the
// floodlight masts, which ran the whole lap every 22 m. Every careful comment
// in that spec about which pier landed on the rougher patch and a 5 cm
// tolerance failing at 6.3 cm was tuning against lamp posts. It only came to
// light when `lamp: "none"` started being honoured and the masts went away.
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
    const ds = M4.wrapDelta(p.s - s, G.track.total);   // both in [0, L), so the while-loop copy this replaced could never fold twice either
    return { s, lat, world: [wx, wz], got: { s: p.s, lat: p.lat, dist: p.dist },
             err: { s: ds, lat: p.lat - lat } };
  },
wallStats() {
    if (!G.track || !G.track.barR) return null;
    // Sides the PIT COMPLEX owns (TrackPit.openBoundary widens them to the garages after the scenery)
    // count as `pitSides`, not as loose: Montreal's lap-long walls read 92.8 % with them in, floor 95 %.
    //
    // `maxB` EXCLUDES THEM TOO: a pit-owned side is not a loose barrier for the
    // widest-limit statistic either. With it in, 44 of the 52 circuits read
    // maxB > 20 solely because of the garage line (monaco 14.7 against 5.9
    // without it, hungaroring 20.1 against 17.0); without it the whole fleet
    // sits at 17.0 or less.
    //
    // The pit extent is not hidden, just named: `maxPitB` reports it so it can
    // still be bounded. null when the track has no pit-owned side at all.
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
// `overRoad` is the number you want; `gap` is the trap it replaces — inside a
// bankZone the tarmac is not the centreline plane (Lesmo 1 lifts the outer
// edge 0.66 m), so terrain correctly tucked UNDER the road reads as proud of
// it. roadY/gap keep the raw-centreline meaning so nothing silently changes.
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
