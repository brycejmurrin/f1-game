"use strict";
// @doc Pure over-road triangle scan shared by tests/specs/terrain-over-road.spec.js (runs in the page) and its unit test.
//
// scanOverRoad(cap, ctx) reports how far mesh triangles stand above the racing line.
//   cap  { pos, idx }                          one built mesh (road or terrain)
//   ctx  { name, tps, px, pz, M, ladder, trackNodeCount, knownCrossover }
//          tps     reference samples { x, z, y, frac, i, si } (i = lap index, si = ladder rung),
//                  laid out tps[i * ladder + si]
//          px, pz  the M lap-node positions (nearest-node lookup for the source frac)
// The function is SELF-CONTAINED on purpose: the spec ships it into the page with
// `addInitScript`, which serialises it with toString(), so nothing here may close over
// module scope.
function scanOverRoad(cap, ctx) {
  var name = ctx.name, tps = ctx.tps, px = ctx.px, pz = ctx.pz, M = ctx.M, ladder = ctx.ladder;
  var trackNodeCount = ctx.trackNodeCount, knownCrossover = ctx.knownCrossover;
  if (!cap.pos || !cap.idx) return { max: 0, fr: [], worst: null };

  var near = function (x, z) {
    var bd = 1e9, bk = 0;
    for (var k = 0; k < M; k++) { var dx = x - px[k], dz = z - pz[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; bk = k; } }
    return bk;
  };
  // Barycentric point-in-triangle, with the footprint slack the scan has always had.
  var pit = function (X, Z, ax, az, bx, bz, cx, cz) {
    var v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = X - ax, v2z = Z - az;
    var d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z;
    var d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
    var dn = d00 * d11 - d01 * d01; if (Math.abs(dn) < 1e-9) return null;
    var u = (d11 * d20 - d01 * d21) / dn, vv = (d00 * d21 - d01 * d20) / dn;
    return (u >= -0.02 && vv >= -0.02 && u + vv <= 1.02) ? { u: u, vv: vv } : null;
  };

  var pos = cap.pos, idx = cap.idx, byF = {};
  var mx = 0, worst = null;
  for (var t = 0; t < idx.length; t += 3) {
    var a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    var ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    var bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
    var cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
    if (Math.max(ay, by, cy) < -0.5) continue;
    var centerX = (ax + bx + cx) / 3, centerZ = (az + bz + cz) / 3;
    var sourceFrac = near(centerX, centerZ) / M;
    var firstVertex = Math.min(idx[t], idx[t + 1], idx[t + 2]);
    var meshSourceFrac = name === "road" && firstVertex < trackNodeCount * 14
      ? Math.floor(firstVertex / 14) / trackNodeCount
      : sourceFrac;
    var mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx);
    var mnz = Math.min(az, bz, cz), mxz = Math.max(az, bz, cz);
    for (var q = 0; q < tps.length; q++) {
      var tp = tps[q];
      if (tp.x < mnx - 0.5 || tp.x > mxx + 0.5 || tp.z < mnz - 0.5 || tp.z > mxz + 0.5) continue;
      var bc = pit(tp.x, tp.z, ax, az, bx, bz, cx, cz);
      if (!bc) continue;
      var yf = ay + bc.u * (cy - ay) + bc.vv * (by - ay);
      var ov0 = yf - tp.y;
      if (ov0 > 0.1) {
        // A TRIANGLE IS OVER THE LINE, NOT OVER ONE ALIASED POINT. On a climbing tight
        // corner the inside edge arc-compresses (nurburgring's Schumacher-S: 9.7 m of arc
        // is 1.74 m of XZ on the inside while the road climbs 0.358 m, measured
        // 2026-08-07), so a sample generated ~10 m EARLIER on the climb lands inside a
        // triangle's footprint and the triangle sits ~0.36 m above that sample's modelled
        // height: a smooth helix read as a step. The guard: the overshoot must hold against
        // the local run of the reference line (same rung, i±3 = ±12 m).
        //
        // Only a neighbour whose own position lies INSIDE this triangle's footprint can
        // clear it, and it clears it by this triangle's height AT THAT NEIGHBOUR (#1942).
        // Comparing against the height at the original sample's xz let a neighbour 12 m
        // away on a 5 % grade (outside the triangle) erase a real 0.5 m intrusion.
        var ov = ov0;
        for (var d = -3; d <= 3 && ov > 0.1; d++) {
          if (!d) continue;
          var nb = tps[((tp.i + d + M) % M) * ladder + tp.si];
          if (!nb) continue;
          var nbc = pit(nb.x, nb.z, ax, az, bx, bz, cx, cz);
          if (!nbc) continue;
          ov = Math.min(ov, ay + nbc.u * (cy - ay) + nbc.vv * (by - ay) - nb.y);
        }
        if (ov <= 0.1) continue;
        var fracDistance = Math.abs(meshSourceFrac - tp.frac);
        // Another deck of a figure-8 / flyover shares this XZ: skipped by mesh provenance
        // (per triangle), never by how large the intrusion is (#1944).
        if (knownCrossover && name === "road" && Math.min(fracDistance, 1 - fracDistance) > 0.08) continue;
        var f = Math.round(tp.frac * 200) / 2;
        byF[f] = Math.max(byF[f] || 0, ov);
        if (ov > mx) {
          mx = ov;
          worst = {
            f: f, ov: +ov.toFixed(2),
            sourceFrac: +sourceFrac.toFixed(4),
            meshSourceFrac: +meshSourceFrac.toFixed(4),
            center: [+centerX.toFixed(2), +((ay + by + cy) / 3).toFixed(2), +centerZ.toFixed(2)],
            sample: [+tp.x.toFixed(2), +tp.y.toFixed(2), +tp.z.toFixed(2)],
            vertices: [
              [+ax.toFixed(2), +ay.toFixed(2), +az.toFixed(2)],
              [+bx.toFixed(2), +by.toFixed(2), +bz.toFixed(2)],
              [+cx.toFixed(2), +cy.toFixed(2), +cz.toFixed(2)],
            ],
          };
        }
      }
    }
  }
  return {
    max: +mx.toFixed(2),
    fr: Object.entries(byF).map(function (e) { return { f: +e[0], o: +e[1].toFixed(2) }; })
      .sort(function (p, r) { return r.o - p.o; }).slice(0, 5),
    worst: worst,
  };
}

// The spec's pass/fail rule for the road mesh. Deck provenance is applied per triangle
// inside scanOverRoad; the verdict is the same threshold for every circuit (#1944).
function roadFails(max, tol) { return max > tol; }

module.exports = { scanOverRoad, roadFails };
