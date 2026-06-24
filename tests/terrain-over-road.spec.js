// @ts-check
// Regression audit: no terrain or road-mesh triangle should render ABOVE the
// racing surface. This catches the "green wedge / elevation-mound over the road"
// class of bug (e.g. Miami T6, where the s≈0.42 Hard Rock rise bulged terrain
// over a flat part of the track that passes near it). Method: capture each
// circuit's meshes, then point-in-triangle test every face against asphalt
// sample points across the whole lap — purely geometric, no rendering.
import { test, expect } from "@playwright/test";

const TRACKS = [
  "abudhabi", "albert_park", "bahrain", "baku", "cota", "hungaroring", "imola",
  "interlagos", "jeddah", "madrid", "mexico", "miami", "monaco", "montreal",
  "monza", "qatar", "redbull", "shanghai", "silverstone", "singapore", "spa",
  "suzuka", "vegas", "zandvoort",
];

// A face poking this far above the asphalt counts as a defect. Small tolerance
// absorbs banking/elevation interpolation noise and z-fight-scale slivers.
const TOL = 0.18;

test("no terrain/road faces over the racing line (all circuits)", async ({ page }) => {
  test.setTimeout(600000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15000 });
  await page.evaluate(() => {
    window.__caps = [];
    const orig = GLX.createMesh;
    GLX.createMesh = function (geo) {
      try { window.__caps.push({ pos: geo.pos ? Array.from(geo.pos) : null, idx: geo.idx ? Array.from(geo.idx) : null }); } catch (e) {}
      return orig.apply(this, arguments);
    };
  });

  const offenders = [];
  for (const trk of TRACKS) {
    await page.evaluate(() => { window.__caps = []; });
    await page.evaluate((t) => __apex.race(t, "day", "dry"), trk);
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const M = 1200;
      const px = new Float64Array(M), pz = new Float64Array(M), py = new Float64Array(M), rx = new Float64Array(M), rz = new Float64Array(M), hw = new Float64Array(M);
      for (let i = 0; i < M; i++) { const n = __apex.nodeAt(i / M); px[i] = n.x; pz[i] = n.z; py[i] = n.y; rx[i] = n.rx; rz[i] = n.rz; }
      const near = (x, z) => { let bd = 1e9, bk = 0; for (let k = 0; k < M; k++) { const dx = x - px[k], dz = z - pz[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; bk = k; } } return bk; };
      const sized = window.__caps.map((c, i) => ({ i, len: c.pos ? c.pos.length / 3 : 0 })).filter((c) => c.len > 1000);
      if (!sized.length) return { err: "no meshes" };
      for (const c of sized) { const p = window.__caps[c.i].pos; let mx = 0; const st = 3 * Math.max(1, Math.floor(p.length / 3 / 2500)); for (let v = 0; v < p.length; v += st) { const k = near(p[v], p[v + 2]); const lat = Math.abs((p[v] - px[k]) * rx[k] + (p[v + 2] - pz[k]) * rz[k]); if (lat < 25) mx = Math.max(mx, lat); } c.maxLat = mx; }
      const road = sized.filter((c) => c.maxLat >= 6 && c.maxLat <= 13).sort((a, b) => b.len - a.len)[0];
      if (!road) return { err: "no road mesh" };
      const rp = window.__caps[road.i].pos; for (let v = 0; v < rp.length; v += 3) { const k = near(rp[v], rp[v + 2]); const lat = Math.abs((rp[v] - px[k]) * rx[k] + (rp[v + 2] - pz[k]) * rz[k]); if (lat < 13 && lat > hw[k]) hw[k] = lat; } for (let k = 0; k < M; k++) if (hw[k] < 3) hw[k] = 6;
      const tps = []; for (let i = 0; i < M; i++) for (const s of [-0.6, -0.3, 0, 0.3, 0.6]) tps.push({ x: px[i] + rx[i] * s * hw[i], z: pz[i] + rz[i] * s * hw[i], y: py[i], frac: i / M });
      const pit = (X, Z, ax, az, bx, bz, cx, cz) => { const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = X - ax, v2z = Z - az; const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z; const dn = d00 * d11 - d01 * d01; if (Math.abs(dn) < 1e-9) return null; const u = (d11 * d20 - d01 * d21) / dn, vv = (d00 * d21 - d01 * d20) / dn; return (u >= -0.02 && vv >= -0.02 && u + vv <= 1.02) ? { u, vv } : null; };
      const scan = (ci) => { const cap = window.__caps[ci]; if (!cap.pos || !cap.idx) return { max: 0, fr: [] }; const pos = cap.pos, idx = cap.idx; const byF = {}; let mx = 0; for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3; const ax = pos[a], ay = pos[a + 1], az = pos[a + 2], bx = pos[b], by = pos[b + 1], bz = pos[b + 2], cx = pos[c], cy = pos[c + 1], cz = pos[c + 2]; if (Math.max(ay, by, cy) < -0.5) continue; const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx), mnz = Math.min(az, bz, cz), mxz = Math.max(az, bz, cz); for (const tp of tps) { if (tp.x < mnx - 0.5 || tp.x > mxx + 0.5 || tp.z < mnz - 0.5 || tp.z > mxz + 0.5) continue; const bc = pit(tp.x, tp.z, ax, az, bx, bz, cx, cz); if (!bc) continue; const yf = ay + bc.u * (cy - ay) + bc.vv * (by - ay); const ov = yf - tp.y; if (ov > 0.1) { const f = Math.round(tp.frac * 200) / 2; byF[f] = Math.max(byF[f] || 0, ov); mx = Math.max(mx, ov); } } } return { max: +mx.toFixed(2), fr: Object.entries(byF).map(([f, o]) => ({ f: +f, o: +o.toFixed(2) })).sort((a, b) => b.o - a.o).slice(0, 5) }; };
      const terr = sized.filter((c) => c.i !== road.i && c.maxLat > 14).sort((a, b) => a.len - b.len)[0];
      return { road: scan(road.i), terr: terr ? scan(terr.i) : { max: 0, fr: [] } };
    });
    console.log(`over-road ${trk}: road=${r.road?.max ?? "?"} terr=${r.terr?.max ?? "?"}${r.err ? " ERR:" + r.err : ""}`);
    if (r.err) { offenders.push(`${trk}: ${r.err}`); continue; }
    // Terrain over the racing line is always a bug (the green-wedge / mound class).
    if (r.terr.max > TOL) offenders.push(`${trk} TERRAIN ${r.terr.max}m over road @${JSON.stringify(r.terr.fr)}`);
    // Road mesh: small overs are the verge-shoulder chord bug; large overs
    // (>1.5 m) are intentional track crossovers (Suzuka figure-8, Madrid,
    // Zandvoort), where the road legitimately bridges over a lower part.
    if (r.road.max > TOL && r.road.max < 1.5) offenders.push(`${trk} ROAD ${r.road.max}m over road @${JSON.stringify(r.road.fr)}`);
  }
  expect(offenders, `circuits with geometry over the racing line:\n${offenders.join("\n")}`).toEqual([]);
});
