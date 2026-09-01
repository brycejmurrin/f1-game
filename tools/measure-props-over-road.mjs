// Measure PROP geometry sitting on/above the racing line for ONE track.
// @doc Prop geometry on/above the racing line for ONE track; JSON report, `--shots` writes PNGs to `artifacts/tmp/`.
// @skill scenery-dress
// Usage: TRACK=redbull PORT=3471 node tools/measure-props-over-road.mjs [--shots]
// Starts an in-process static server via harness.mjs and launches Chromium
// through the same path every other tool uses (CHROME / PW_CHROMIUM / ladder).
import { launchChromium, shutdown, startStaticServer } from "./harness.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafePathToken } from "./output-paths.mjs";

const TRACK = process.env.TRACK;
const PORT = process.env.PORT ? +process.env.PORT : 0;
const SHOTS = process.argv.includes("--shots");
if (!TRACK) { console.error("set TRACK=<id>"); process.exit(2); }
const safeTrack = assertSafePathToken(TRACK, "track id");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "artifacts", "tmp");
if (SHOTS) mkdirSync(OUT, { recursive: true });

const srv = await startStaticServer(ROOT, PORT ? { port: PORT } : {});

const CEIL = 5.0, TOL = 0.15;
let out = { track: TRACK, max: 0, top: [], err: null };
try {
  const b = await launchChromium({ args: ["--use-angle=swiftshader"] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  await p.goto(srv.url);
  await p.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: 30000 });
  await p.evaluate(() => {
    window.__caps = [];
    const grab = (g) => { try { window.__caps.push({ pos: g && g.pos ? Array.from(g.pos) : null, idx: g && g.idx ? Array.from(g.idx) : null, col: g && g.col ? Array.from(g.col) : null, n: g && g.pos ? g.pos.length / 3 : 0, blocks: g && g.__blocks ? g.__blocks.map((b) => ({ base: b.base, count: b.count, id: b.id })).filter((b) => b.id) : null }); } catch (e) {} };
    for (const fn of ["createChunkedMesh", "createMesh"]) { const o = GLX[fn]; if (!o) continue; GLX[fn] = function (g) { grab(g); return o.apply(this, arguments); }; }
  });
  await p.evaluate((t) => __apex.race(t, "day", "dry"), TRACK);
  await p.waitForFunction(() => __apex.info().track != null, null, { polling: 100, timeout: 30000 });
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
    const pit = (X, Z, ax, az, bx, bz, cx, cz) => { const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = X - ax, v2z = Z - az; const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z; const dn = d00 * d11 - d01 * d01; if (Math.abs(dn) < 0.01) return null; /* same 5×5 cm projected-area guard as props-over-road.spec.js — 1e-9 lets near-vertical faces of long stands report a box-top height at any distance */ const u = (d11 * d20 - d01 * d21) / dn, vv = (d00 * d21 - d01 * d20) / dn; return (u >= -0.02 && vv >= -0.02 && u + vv <= 1.02) ? { u, vv } : null; };
    const terr = sized.filter((c) => c.i !== road.i && c.maxLat > 14).sort((a, b) => a.len - b.len)[0];
    const skip = new Set([road.i]); if (terr) skip.add(terr.i);
    // WHICH EMITTER PUT IT THERE. js/track/models.js records one __blocks entry
    // per staged copy (modelGroup / overheadSpan / water) carrying the emitter's
    // own id, so a vertex index maps straight back to the thing that emitted it.
    // Without this the report could say "4.79 m over the racing line" and not
    // what to edit, and every attempt to work it out from prop bounding boxes
    // asked the wrong question: the test is whether a TRIANGLE covers a track
    // point, and a large triangle's centroid can sit 24 m from the point it
    // covers. Geometry appended straight into `out` by a raw emitter has no
    // block, and is reported as "(raw)" rather than guessed at.
    const owner = (cap, vi) => {
      const bl = cap.blocks; if (!bl || !bl.length) return "(raw)";
      for (let i = 0; i < bl.length; i++) {
        if (vi >= bl[i].base && vi < bl[i].base + bl[i].count) return bl[i].id;
      }
      return "(raw)";
    };
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
          if (over > TOL && over < CEIL) hits.push({ frac: +tp.frac.toFixed(3), over: +over.toFixed(2), cx: +((ax + bx + cx) / 3).toFixed(1), cz: +((az + bz + cz) / 3).toFixed(1), triY: +((ay + by + cy) / 3).toFixed(2), by: owner(cap, idx[t]), col: cap.col ? [cap.col[a], cap.col[a + 1], cap.col[a + 2]].map((v) => +v.toFixed(2)) : null, edges: [Math.hypot(ax - bx, az - bz), Math.hypot(bx - cx, bz - cz), Math.hypot(cx - ax, cz - az)].map((v) => +v.toFixed(2)) });
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
      await p.screenshot({ path: path.join(OUT, `pov-${safeTrack}-${String(f).replace(".", "p")}-eye.png`) });
      await p.evaluate((ff) => __apex.orbit(ff, 90, 8, 45), f);
      await p.waitForTimeout(300);
      await p.screenshot({ path: path.join(OUT, `pov-${safeTrack}-${String(f).replace(".", "p")}-orbit.png`) });
    }
  }
  await b.close();
} catch (e) { out.err = String(e && e.message || e); }
finally { await shutdown(); }
console.log(JSON.stringify(out));
