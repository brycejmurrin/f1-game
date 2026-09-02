// @ts-check
// Regression audit: no PROP geometry should sit on / above / intersecting the
// racing surface. The engine's on-track rejection guard (buildProps `onRoadHit`)
// is footprint-based and is bypassed entirely for some emitters (crowd risers/
// spectators use RAW.addBox for speed), so a prop anchored just off-track but
// OVERHANGING the tarmac — a roof/canopy slab, a jumbotron face, a tilted panel,
// a crowd box — can pass the guard yet still intrude into the racing space.
//
// Method (mirrors terrain-over-road.spec.js): capture every mesh via createMesh/
// createChunkedMesh, recover the road corridor + half-width from the road mesh,
// then point-in-triangle test each PROP triangle against asphalt sample points
// across the whole lap. A triangle whose footprint covers tarmac AND whose
// surface sits between TOL and CEIL metres above the racing line is an offender.
// Purely geometric — no rendering, so it runs under SwiftShader in CI.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";
import { auditTracks } from "../helpers/track-helpers.js";

// Every circuit (derived from tools/manifest.cjs), or TRACK=<id> for one.
const TRACKS = auditTracks();

// Vertical band that counts as an intrusion. Below TOL is ground-level dressing
// (kerbs, tyre-wall bases) that legitimately hugs the edge; above CEIL is
// clearance for overhead gantries / bridges / high stadium roofs that a car
// passes safely beneath.
const TOL = 0.20;
const CEIL = 5.0;

// Baseline of circuits with a KNOWN prop-over-road reading at the time this
// audit was added, each capped at the metres seen so the test still fails if the
// intrusion GROWS or a NEW circuit regresses. A track NOT in this map must read
// <= TOL — that's what keeps new bugs failing.
//
// After the systemic guard fixes (neonTower + building() now use the full
// footprint Minkowski test, not a single inner-face point) plus per-circuit
// scenery passes, most of the original 15-circuit "max=0" set still hugs the
// 0.20 m TOL. Do not treat that list as current: COTA and Indianapolis have
// since measured over TOL (see docs/ARCHITECTURE-REVIEW.md §7). Miami is a
// verified design-intent overhead (beach-club parasol canopy ~7.5 m up, car
// passes safely under). Mexico's Foro Sol stands are segmented around the
// route. Other residuals are edge-proximity readings from props hugging the
// runoff — safe to drive but tracked so they cannot grow.
// Cap = measured max + small margin. A track NOT in this map must read <= TOL.
const BASELINE = {
  // Shared TrackSurface grounding raises these previously floating props onto
  // their actual terrain. Keep the resulting overlaps visible until the
  // circuit-specific migration pass removes or repositions them.
  miami: 4.2, miami_note: "beach-club parasol canopy ~7.5m overhead — car clears",
  // street circuits: ~1.1–1.3 m readings are the edge BARRIER wall/furniture at the
  // road edge (the track boundary the car stays inside), now sitting on the real
  // terrain ribbon added for these tracks — verified via driver-eye as the wall,
  // not a lane obstruction. Migrated Vegas and Hungaroring are clean.
  monaco: 1.4, singapore: 1.3, baku: 1.3, jeddah: 0.7,
  albert_park: 0.7,
};
const ALLOW = new Set(); // fully-exempt circuits (none — everything is capped)

test("no prop geometry on/above the racing line (all circuits)", async ({ page }) => {
  // One test walks every circuit, so the budget scales with the roster AND
  // with how much geometry each circuit carries. 600 s was already marginal on
  // a 4-core box (observed 616 s) — this is the guard that catches props over
  // the racing line, so it has to survive a scenery-density pass rather than
  // fail as a timeout and be mistaken for a geometry regression.
  test.setTimeout(1500000);
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => __apex.trackGeometry(true));

  const offenders = [];
  for (const trk of TRACKS) {
    await page.evaluate((t) => __apex.race(t, "day", "dry"), trk);
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(({ CEIL, TOL }) => {
      const caps = window.__apex.trackGeometry();
      if (!caps) return { err: "no meshes" };
      const M = 1200;
      const px = new Float64Array(M), pz = new Float64Array(M), py = new Float64Array(M),
            rx = new Float64Array(M), rz = new Float64Array(M), hw = new Float64Array(M);
      for (let i = 0; i < M; i++) { const nd = __apex.nodeAt(i / M); px[i] = nd.x; pz[i] = nd.z; py[i] = nd.y; rx[i] = nd.rx; rz[i] = nd.rz; }
      const near = (x, z) => { let bd = 1e9, bk = 0; for (let k = 0; k < M; k++) { const dx = x - px[k], dz = z - pz[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; bk = k; } } return bk; };
      const sized = ["road", "terrain"].map((i) => ({ i, len: caps[i]?.pos?.length / 3 || 0 })).filter((c) => c.len > 1000);
      for (const c of sized) { const p = caps[c.i].pos; let mx = 0; const st = 3 * Math.max(1, Math.floor(p.length / 3 / 2500)); for (let v = 0; v < p.length; v += st) { const k = near(p[v], p[v + 2]); const lat = Math.abs((p[v] - px[k]) * rx[k] + (p[v + 2] - pz[k]) * rz[k]); if (lat < 25) mx = Math.max(mx, lat); } c.maxLat = mx; }
      const road = sized.find((c) => c.i === "road");
      if (!road) return { err: "no road mesh" };
      const rp = caps.road.pos;
      for (let v = 0; v < rp.length; v += 3) { const k = near(rp[v], rp[v + 2]); const lat = Math.abs((rp[v] - px[k]) * rx[k] + (rp[v + 2] - pz[k]) * rz[k]); if (lat < 13 && lat > hw[k]) hw[k] = lat; }
      for (let k = 0; k < M; k++) if (hw[k] < 3) hw[k] = 6;
      const tps = []; for (let i = 0; i < M; i++) for (const s of [-0.75, -0.4, 0, 0.4, 0.75]) tps.push({ x: px[i] + rx[i] * s * hw[i], z: pz[i] + rz[i] * s * hw[i], y: py[i], frac: i / M });
      const pit = (X, Z, ax, az, bx, bz, cx, cz) => { const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = X - ax, v2z = Z - az; const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z; const dn = d00 * d11 - d01 * d01; if (Math.abs(dn) < 0.01) return null; /* dn = 4*area^2 of the XZ projection: near-vertical faces of long diagonal boxes project to slivers that pass a 1e-9 guard and report u=v=0 "inside" with the box-top height at ANY distance (measured: two 15m-clear grandstands read as 4.65m over road); 0.01 = 5x5cm projected area */ const u = (d11 * d20 - d01 * d21) / dn, vv = (d00 * d21 - d01 * d20) / dn; return (u >= -0.02 && vv >= -0.02 && u + vv <= 1.02) ? { u, vv } : null; };
      const merged = {}; let max = 0, worst = null;
      for (const name of ["props", "glass"]) {
        const cap = caps[name]; if (!cap || !cap.pos || !cap.idx || cap.pos.length / 3 < 30) continue;
        const pos = cap.pos, idx = cap.idx;
        for (let t = 0; t < idx.length; t += 3) {
          const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
          const ax = pos[a], ay = pos[a + 1], az = pos[a + 2], bx = pos[b], by = pos[b + 1], bz = pos[b + 2], cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
          if (Math.min(ay, by, cy) > CEIL + 30) continue;
          const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx), mnz = Math.min(az, bz, cz), mxz = Math.max(az, bz, cz);
          for (const tp of tps) {
            if (tp.x < mnx - 0.3 || tp.x > mxx + 0.3 || tp.z < mnz - 0.3 || tp.z > mxz + 0.3) continue;
            const bc = pit(tp.x, tp.z, ax, az, bx, bz, cx, cz); if (!bc) continue;
            const yf = ay + bc.u * (cy - ay) + bc.vv * (by - ay);
            const over = yf - tp.y;
            if (over > TOL && over < CEIL) {
              const f = Math.round(tp.frac * 200) / 2;
              merged[f] = Math.max(merged[f] || 0, +over.toFixed(2));
              if (over > max) {
                max = over;
                const centerX = (ax + bx + cx) / 3;
                const centerZ = (az + bz + cz) / 3;
                const centerK = near(centerX, centerZ);
                worst = {
                  name, f, over: +over.toFixed(2),
                  sourceFrac: +(centerK / M).toFixed(4),
                  lateral: +((centerX - px[centerK]) * rx[centerK] +
                    (centerZ - pz[centerK]) * rz[centerK]).toFixed(2),
                  color: cap.col?.slice(idx[t] * 3, idx[t] * 3 + 3).map((v) => +v.toFixed(2)),
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
      }
      const top = Object.entries(merged).map(([f, o]) => ({ f: +f, o })).sort((a, b) => b.o - a.o).slice(0, 6);
      return { max: +max.toFixed(2), top, worst };
    }, { CEIL, TOL });
    console.log(`props-over-road ${trk}: max=${r.max ?? "?"}${r.err ? " ERR:" + r.err : ""}${r.top && r.top.length ? " @" + JSON.stringify(r.top) : ""}`);
    if (r.err) { offenders.push(`${trk}: ${r.err}`); continue; }
    if (trk === "shanghai")
      expect(r.max, "Shanghai track-owned props remain at the shared clean tolerance").toBeLessThanOrEqual(TOL);
    const cap = ALLOW.has(trk) ? Infinity : (BASELINE[trk] ?? TOL);
    if (r.max > cap) offenders.push(
      `${trk} PROP ${r.max}m over road (cap ${cap}) @${JSON.stringify(r.top)} worst=${JSON.stringify(r.worst)}`
    );
  }
  expect(offenders, `circuits with props on/above the racing line:\n${offenders.join("\n")}`).toEqual([]);
});
