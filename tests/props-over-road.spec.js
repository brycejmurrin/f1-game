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

const TRACKS = [
  "abudhabi", "albert_park", "bahrain", "baku", "cota", "hungaroring", "imola",
  "interlagos", "jeddah", "madrid", "mexico", "miami", "monaco", "montreal",
  "monza", "qatar", "redbull", "shanghai", "silverstone", "singapore", "spa",
  "suzuka", "vegas", "zandvoort",
];

// Vertical band that counts as an intrusion. Below TOL is ground-level dressing
// (kerbs, tyre-wall bases) that legitimately hugs the edge; above CEIL is
// clearance for overhead gantries / bridges / high stadium roofs that a car
// passes safely beneath.
const TOL = 0.20;
const CEIL = 5.0;

// Baseline of circuits with a KNOWN prop-over-road reading at the time this
// audit was added, each capped at the metres seen so the test still fails if the
// intrusion GROWS or a NEW circuit regresses. Two kinds live here:
//   - design-intent pass-throughs the track legitimately runs through at car
//     height (mexico = Foro Sol stadium; miami, jeddah = stadium/structure runs);
//   - not-yet-fixed debt from the 2026-07-02 scenery passes (the rest).
// The guard fix in buildProps (guarded crowd risers) already cleared bahrain,
// cota, madrid and shrank abudhabi/hungaroring/monaco. Drive each `frac` with
// __apex.eyeAt/orbit to triage, fix the source, then lower/remove its cap here.
// A track NOT in this map must read <= TOL — that's what keeps new bugs failing.
const BASELINE = {
  abudhabi: 3.9, baku: 1.3, hungaroring: 2.9, jeddah: 3.9, mexico: 4.8,
  miami: 4.7, monaco: 1.3, redbull: 3.8, zandvoort: 2.1, albert_park: 0.7,
};
const ALLOW = new Set(); // fully-exempt circuits (none — everything is capped)

test("no prop geometry on/above the racing line (all circuits)", async ({ page }) => {
  test.setTimeout(600000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15000 });
  await page.evaluate(() => {
    window.__caps = [];
    const grab = (geo) => { try { window.__caps.push({ pos: geo && geo.pos ? Array.from(geo.pos) : null, idx: geo && geo.idx ? Array.from(geo.idx) : null, n: geo && geo.pos ? geo.pos.length / 3 : 0 }); } catch (e) {} };
    for (const fn of ["createChunkedMesh", "createMesh"]) {
      const orig = GLX[fn]; if (!orig) continue;
      GLX[fn] = function (geo) { grab(geo); return orig.apply(this, arguments); };
    }
  });

  const offenders = [];
  for (const trk of TRACKS) {
    await page.evaluate(() => { window.__caps = []; });
    await page.evaluate((t) => __apex.race(t, "day", "dry"), trk);
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(({ CEIL, TOL }) => {
      const M = 1200;
      const px = new Float64Array(M), pz = new Float64Array(M), py = new Float64Array(M),
            rx = new Float64Array(M), rz = new Float64Array(M), hw = new Float64Array(M);
      for (let i = 0; i < M; i++) { const nd = __apex.nodeAt(i / M); px[i] = nd.x; pz[i] = nd.z; py[i] = nd.y; rx[i] = nd.rx; rz[i] = nd.rz; }
      const near = (x, z) => { let bd = 1e9, bk = 0; for (let k = 0; k < M; k++) { const dx = x - px[k], dz = z - pz[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; bk = k; } } return bk; };
      const sized = window.__caps.map((c, i) => ({ i, len: c.n })).filter((c) => c.len > 1000);
      for (const c of sized) { const p = window.__caps[c.i].pos; let mx = 0; const st = 3 * Math.max(1, Math.floor(p.length / 3 / 2500)); for (let v = 0; v < p.length; v += st) { const k = near(p[v], p[v + 2]); const lat = Math.abs((p[v] - px[k]) * rx[k] + (p[v + 2] - pz[k]) * rz[k]); if (lat < 25) mx = Math.max(mx, lat); } c.maxLat = mx; }
      const road = sized.filter((c) => c.maxLat >= 6 && c.maxLat <= 13).sort((a, b) => b.len - a.len)[0];
      if (!road) return { err: "no road mesh" };
      const rp = window.__caps[road.i].pos;
      for (let v = 0; v < rp.length; v += 3) { const k = near(rp[v], rp[v + 2]); const lat = Math.abs((rp[v] - px[k]) * rx[k] + (rp[v + 2] - pz[k]) * rz[k]); if (lat < 13 && lat > hw[k]) hw[k] = lat; }
      for (let k = 0; k < M; k++) if (hw[k] < 3) hw[k] = 6;
      const tps = []; for (let i = 0; i < M; i++) for (const s of [-0.75, -0.4, 0, 0.4, 0.75]) tps.push({ x: px[i] + rx[i] * s * hw[i], z: pz[i] + rz[i] * s * hw[i], y: py[i], frac: i / M });
      const pit = (X, Z, ax, az, bx, bz, cx, cz) => { const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = X - ax, v2z = Z - az; const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z; const dn = d00 * d11 - d01 * d01; if (Math.abs(dn) < 1e-9) return null; const u = (d11 * d20 - d01 * d21) / dn, vv = (d00 * d21 - d01 * d20) / dn; return (u >= -0.02 && vv >= -0.02 && u + vv <= 1.02) ? { u, vv } : null; };
      const terr = sized.filter((c) => c.i !== road.i && c.maxLat > 14).sort((a, b) => a.len - b.len)[0];
      const skip = new Set([road.i]); if (terr) skip.add(terr.i);
      const merged = {}; let max = 0;
      for (let i = 0; i < window.__caps.length; i++) {
        if (skip.has(i)) continue; const cap = window.__caps[i]; if (!cap.idx || cap.n < 30) continue;
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
            if (over > TOL && over < CEIL) { const f = Math.round(tp.frac * 200) / 2; merged[f] = Math.max(merged[f] || 0, +over.toFixed(2)); if (over > max) max = over; }
          }
        }
      }
      const top = Object.entries(merged).map(([f, o]) => ({ f: +f, o })).sort((a, b) => b.o - a.o).slice(0, 6);
      return { max: +max.toFixed(2), top };
    }, { CEIL, TOL });
    console.log(`props-over-road ${trk}: max=${r.max ?? "?"}${r.err ? " ERR:" + r.err : ""}${r.top && r.top.length ? " @" + JSON.stringify(r.top) : ""}`);
    if (r.err) { offenders.push(`${trk}: ${r.err}`); continue; }
    const cap = ALLOW.has(trk) ? Infinity : (BASELINE[trk] ?? TOL);
    if (r.max > cap) offenders.push(`${trk} PROP ${r.max}m over road (cap ${cap}) @${JSON.stringify(r.top)}`);
  }
  expect(offenders, `circuits with props on/above the racing line:\n${offenders.join("\n")}`).toEqual([]);
});
