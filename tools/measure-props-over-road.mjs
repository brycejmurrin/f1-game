// Measure PROP geometry sitting on/above the racing line for ONE track.
// Usage: TRACK=redbull PORT=3471 node tools/measure-props-over-road.mjs [--shots]
// Starts its own http.server on PORT, launches the preinstalled Chromium,
// captures the props mesh, and reports (as JSON) the worst prop-over-road
// intrusions with lap-fractions + world coords. With --shots it also writes
// driver-eye + orbit screenshots per hotspot to artifacts/tmp/pov-<track>-*.png.
//
// This is the shared harness for the props-over-road fix pass. It mirrors the
// geometry used by tests/props-over-road.spec.js so a number here matches CI.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const TRACK = process.env.TRACK;
const PORT = +(process.env.PORT || 3499);
const SHOTS = process.argv.includes("--shots");
if (!TRACK) { console.error("set TRACK=<id>"); process.exit(2); }

const CHROME = process.env.CHROME ||
  "/Users/bmurrin/Library/Caches/ms-playwright/chromium-1179/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "artifacts", "tmp");
if (SHOTS) mkdirSync(OUT, { recursive: true });

const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const CEIL = 5.0, TOL = 0.15;
let out = { track: TRACK, max: 0, top: [], err: null };
try {
  const b = await chromium.launch({ executablePath: CHROME, args: ["--use-angle=swiftshader"] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForFunction(() => window.__apex?.race, null, { timeout: 30000 });
  await p.evaluate(() => {
    window.__caps = [];
    const grab = (g) => { try { window.__caps.push({ pos: g && g.pos ? Array.from(g.pos) : null, idx: g && g.idx ? Array.from(g.idx) : null, n: g && g.pos ? g.pos.length / 3 : 0 }); } catch (e) {} };
    for (const fn of ["createChunkedMesh", "createMesh"]) { const o = GLX[fn]; if (!o) continue; GLX[fn] = function (g) { grab(g); return o.apply(this, arguments); }; }
  });
  await p.evaluate((t) => __apex.race(t, "day", "dry"), TRACK);
  await p.waitForFunction(() => __apex.info().track != null, null, { timeout: 30000 });
  await p.waitForTimeout(1200);
  out = await p.evaluate(({ CEIL, TOL, TRACK }) => {
    const M = 1200, px = new Float64Array(M), pz = new Float64Array(M), py = new Float64Array(M), rx = new Float64Array(M), rz = new Float64Array(M), hw = new Float64Array(M);
    for (let i = 0; i < M; i++) { const nd = __apex.nodeAt(i / M); px[i] = nd.x; pz[i] = nd.z; py[i] = nd.y; rx[i] = nd.rx; rz[i] = nd.rz; }
    const near = (x, z) => { let bd = 1e9, bk = 0; for (let k = 0; k < M; k++) { const dx = x - px[k], dz = z - pz[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; bk = k; } } return bk; };
    const sized = window.__caps.map((c, i) => ({ i, len: c.n })).filter((c) => c.len > 1000);
    for (const c of sized) { const p = window.__caps[c.i].pos; let mx = 0; const st = 3 * Math.max(1, Math.floor(p.length / 3 / 2500)); for (let v = 0; v < p.length; v += st) { const k = near(p[v], p[v + 2]); const lat = Math.abs((p[v] - px[k]) * rx[k] + (p[v + 2] - pz[k]) * rz[k]); if (lat < 25) mx = Math.max(mx, lat); } c.maxLat = mx; }
    const road = sized.filter((c) => c.maxLat >= 6 && c.maxLat <= 13).sort((a, b) => b.len - a.len)[0];
    if (!road) return { track: TRACK, max: 0, top: [], err: "no road mesh" };
    const rp = window.__caps[road.i].pos; for (let v = 0; v < rp.length; v += 3) { const k = near(rp[v], rp[v + 2]); const lat = Math.abs((rp[v] - px[k]) * rx[k] + (rp[v + 2] - pz[k]) * rz[k]); if (lat < 13 && lat > hw[k]) hw[k] = lat; } for (let k = 0; k < M; k++) if (hw[k] < 3) hw[k] = 6;
    const tps = []; for (let i = 0; i < M; i++) for (const s of [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9]) tps.push({ x: px[i] + rx[i] * s * hw[i], z: pz[i] + rz[i] * s * hw[i], y: py[i], frac: i / M });
    const pit = (X, Z, ax, az, bx, bz, cx, cz) => { const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = X - ax, v2z = Z - az; const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z; const dn = d00 * d11 - d01 * d01; if (Math.abs(dn) < 1e-9) return null; const u = (d11 * d20 - d01 * d21) / dn, vv = (d00 * d21 - d01 * d20) / dn; return (u >= -0.02 && vv >= -0.02 && u + vv <= 1.02) ? { u, vv } : null; };
    const terr = sized.filter((c) => c.i !== road.i && c.maxLat > 14).sort((a, b) => a.len - b.len)[0];
    const skip = new Set([road.i]); if (terr) skip.add(terr.i);
    const hits = [];
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
          const yf = ay + bc.u * (cy - ay) + bc.vv * (by - ay); const over = yf - tp.y;
          if (over > TOL && over < CEIL) hits.push({ frac: +tp.frac.toFixed(3), over: +over.toFixed(2), cx: +((ax + bx + cx) / 3).toFixed(1), cz: +((az + bz + cz) / 3).toFixed(1), triY: +((ay + by + cy) / 3).toFixed(2) });
        }
      }
    }
    hits.sort((a, b) => b.over - a.over);
    const seen = new Set(), top = []; for (const h of hits) { const key = h.frac; if (seen.has(key)) continue; seen.add(key); top.push(h); if (top.length >= 12) break; }
    return { track: TRACK, max: top.length ? top[0].over : 0, top, err: null };
  }, { CEIL, TOL, TRACK });

  if (SHOTS && out.top && out.top.length) {
    const fracs = [...new Set(out.top.slice(0, 4).map((h) => h.frac))];
    for (const f of fracs) {
      await p.evaluate((ff) => __apex.eyeAt(ff, 0, 2.2), f);
      await p.waitForTimeout(300);
      await p.screenshot({ path: path.join(OUT, `pov-${TRACK}-${String(f).replace(".", "p")}-eye.png`) });
      await p.evaluate((ff) => __apex.orbit(ff, 90, 8, 45), f);
      await p.waitForTimeout(300);
      await p.screenshot({ path: path.join(OUT, `pov-${TRACK}-${String(f).replace(".", "p")}-orbit.png`) });
    }
  }
  await b.close();
} catch (e) { out.err = String(e && e.message || e); }
finally { try { srv.kill("SIGKILL"); } catch (_) {} }
console.log(JSON.stringify(out));
