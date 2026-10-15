// Self-contained: Playwright serializes this function into the page. Keep the
// exact scanner reusable in Node regressions instead of copying its predicates.
export function scanTerrainOverRoad(knownCrossover) {
  const caps = window.__apex.trackGeometry();
  if (!caps) return { err: "no meshes" };
  const trackNodeCount = window.__apex.info().n;
  const M = 1200;
  const px = new Float64Array(M), pz = new Float64Array(M), py = new Float64Array(M), rx = new Float64Array(M), rz = new Float64Array(M), hw = new Float64Array(M);
  for (let i = 0; i < M; i++) { const n = __apex.nodeAt(i / M); px[i] = n.x; pz[i] = n.z; py[i] = n.y; rx[i] = n.rx; rz[i] = n.rz; }
  const near = (x, z) => { let bd = 1e9, bk = 0; for (let k = 0; k < M; k++) { const dx = x - px[k], dz = z - pz[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; bk = k; } } return bk; };
  const sized = ["road", "terrain"].map((i) => ({ i, len: caps[i]?.pos?.length / 3 || 0 })).filter((c) => c.len > 1000);
  if (!sized.length) return { err: "no meshes" };
  for (const c of sized) { const p = caps[c.i].pos; let mx = 0; const st = 3 * Math.max(1, Math.floor(p.length / 3 / 2500)); for (let v = 0; v < p.length; v += st) { const k = near(p[v], p[v + 2]); const lat = Math.abs((p[v] - px[k]) * rx[k] + (p[v + 2] - pz[k]) * rz[k]); if (lat < 25) mx = Math.max(mx, lat); } c.maxLat = mx; }
  const road = sized.find((c) => c.i === "road");
  if (!road) return { err: "no road mesh" };
  const rp = caps.road.pos; for (let v = 0; v < rp.length; v += 3) { const k = near(rp[v], rp[v + 2]); const lat = Math.abs((rp[v] - px[k]) * rx[k] + (rp[v + 2] - pz[k]) * rz[k]); if (lat < 13 && lat > hw[k]) hw[k] = lat; } for (let k = 0; k < M; k++) if (hw[k] < 3) hw[k] = 6;
  const def = Tracks.LIST.find((entry) => entry.id === __apex.info().track);
  const bankTrack = Tracks.buildCenterline(def);
  const tps = [];
  const LADDER = [-0.6, -0.3, 0, 0.3, 0.6];
  for (let i = 0; i < M; i++) {
    for (let si = 0; si < LADDER.length; si++) {
      const lat = LADDER[si] * hw[i];
      const bank = Tracks.banking(bankTrack, i / M * bankTrack.total, lat);
      tps.push({
        x: px[i] + rx[i] * lat,
        z: pz[i] + rz[i] * lat,
        y: py[i] + (bank?.dy || 0),
        frac: i / M,
        i, si,                     // for the neighbor guard in scan()
      });
    }
  }
  const pit = (X, Z, ax, az, bx, bz, cx, cz) => { const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = X - ax, v2z = Z - az; const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z; const dn = d00 * d11 - d01 * d01; if (Math.abs(dn) < 1e-9) return null; const u = (d11 * d20 - d01 * d21) / dn, vv = (d00 * d21 - d01 * d20) / dn; return (u >= -0.02 && vv >= -0.02 && u + vv <= 1.02) ? { u, vv } : null; };
  const scan = (name) => {
    const cap = caps[name];
    if (!cap.pos || !cap.idx) return { max: 0, fr: [], worst: null };
    const pos = cap.pos, idx = cap.idx, byF = {};
    let mx = 0, worst = null;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
      const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
      const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
      const centerX = (ax + bx + cx) / 3;
      const centerZ = (az + bz + cz) / 3;
      const sourceFrac = near(centerX, centerZ) / M;
      const firstVertex = Math.min(idx[t], idx[t + 1], idx[t + 2]);
      const meshSourceFrac = name === "road" && firstVertex < trackNodeCount * 14
        ? Math.floor(firstVertex / 14) / trackNodeCount
        : sourceFrac;
      const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx);
      const mnz = Math.min(az, bz, cz), mxz = Math.max(az, bz, cz);
      for (const tp of tps) {
        if (tp.x < mnx - 0.5 || tp.x > mxx + 0.5 ||
            tp.z < mnz - 0.5 || tp.z > mxz + 0.5) continue;
        const bc = pit(tp.x, tp.z, ax, az, bx, bz, cx, cz);
        if (!bc) continue;
        const yf = ay + bc.u * (cy - ay) + bc.vv * (by - ay);
        const ov0 = yf - tp.y;
        if (ov0 > 0.1) {
          // A TRIANGLE IS OVER THE LINE, NOT OVER ONE ALIASED POINT. On a
          // climbing tight corner the inside edge arc-compresses: at
          // nurburgring's Schumacher-S, 9.7 m of arc is 1.74 m of XZ on the
          // inside while the road climbs 0.358 m (measured, 2026-08-07).
          // So a sample generated ~10 m EARLIER on the climb lands inside a
          // triangle's XZ footprint, and the triangle's surface sits ~0.36 m
          // above that sample's modelled height — a smooth helix read as a
          // step. That exact shape produced this test's only road offender
          // ("nurburgring ROAD 0.37m over"), on the test's FIRST completed
          // run. The guard: the overshoot must hold against the local RUN
          // of the reference line (same ladder rung, i±3 = ±12 m), not one
          // sample. A genuinely floating slab is over all of them; an
          // arc-aliased neighbor is cleared by the sample at its own frac.
          let ov = ov0;
          for (let d = -3; d <= 3 && ov > 0.1; d++) {
            if (!d) continue;
            const nb = tps[((tp.i + d + M) % M) * LADDER.length + tp.si];
            if (nb) ov = Math.min(ov, yf - nb.y);
          }
          if (ov <= 0.1) continue;
          const fracDistance = Math.abs(meshSourceFrac - tp.frac);
          if (knownCrossover && name === "road" &&
              Math.min(fracDistance, 1 - fracDistance) > 0.08) continue;
          const f = Math.round(tp.frac * 200) / 2;
          byF[f] = Math.max(byF[f] || 0, ov);
          if (ov > mx) {
            mx = ov;
            worst = {
              f, ov: +ov.toFixed(2),
              sourceFrac: +sourceFrac.toFixed(4),
              meshSourceFrac: +meshSourceFrac.toFixed(4),
              center: [
                +centerX.toFixed(2),
                +((ay + by + cy) / 3).toFixed(2),
                +centerZ.toFixed(2),
              ],
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
      fr: Object.entries(byF).map(([f, o]) => ({ f: +f, o: +o.toFixed(2) }))
        .sort((a, b) => b.o - a.o).slice(0, 5),
      worst,
    };
  };
  return { road: scan("road"), terr: scan("terrain") };
}
