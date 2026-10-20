// Offline close-up of a Car3D build (z-buffer, flat Lambert on the vertex colours), so a join can be
// framed exactly: node design-preview/bodies/fit-render.mjs <body> <eye x,y,z> <look x,y,z> <out.ppm> [fovDeg]
// HEAD_REF=<git ref> renders that commit's js/ (the "before" frame); ROUND=1 the rounded build.
import fs from "node:fs"; import { execSync } from "node:child_process";
if (process.env.HEAD_REF) { const rf = fs.readFileSync; fs.readFileSync = function (f, ...r) { const m = String(f).match(/\/(js\/.*\.js)$/);
  if (m && r[0] === "utf8") { try { return execSync(`git show ${process.env.HEAD_REF}:${m[1]}`, { encoding: "utf8", maxBuffer: 1 << 26 }); } catch { } } return rf.call(fs, f, ...r); }; }
const { loadParts } = await import("../../tools/car/parts-sweep.mjs");
const [id, eyeS, lookS, outP, fovS] = process.argv.slice(2);
const { Car3D, Parts, Teams } = loadParts(process.env.ROUND ? { shade: true } : undefined);
const t = Teams.LIST.find((x) => x.id === (process.env.TEAM || "mclaren"));
const T = Parts.getVisualTiers(Parts.getFactorySetup(t), t);
const d = Car3D.buildComplete(t.color, t.color2, { livery: { c1: t.color, c2: t.color2, bodyStyle: id === "team" ? undefined : id }, teamId: t.id, num: 4, parts: T });
const W = 844, H = 390, eye = eyeS.split(",").map(Number), look = lookS.split(",").map(Number), f = 1 / Math.tan((+(fovS || 32) * Math.PI / 180) / 2);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
const fw = nrm(sub(look, eye)), rt = nrm(crs(fw, [0, 1, 0])), up = crs(rt, fw), L = nrm([0.4, 0.8, 0.45]);
const zb = new Float32Array(W * H).fill(Infinity), img = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) { const g = 40 + 30 * (i / W / H); img[i * 3] = g; img[i * 3 + 1] = g + 4; img[i * 3 + 2] = g + 10; }
const P = d.pos, C = d.col, I = d.idx;
const proj = (k) => { const p = sub([P[k * 3], P[k * 3 + 1], P[k * 3 + 2]], eye); const z = dot(p, fw);
  return [W / 2 + (dot(p, rt) / z) * f * H / 2, H / 2 - (dot(p, up) / z) * f * H / 2, z]; };
for (let t3 = 0; t3 < I.length; t3 += 3) {
  const k = [I[t3], I[t3 + 1], I[t3 + 2]], v = k.map(proj); if (v.some((q) => q[2] < 0.05)) continue;
  const w = k.map((q) => [P[q * 3], P[q * 3 + 1], P[q * 3 + 2]]); let n = nrm(crs(sub(w[1], w[0]), sub(w[2], w[0])));
  if (dot(n, sub(w[0], eye)) > 0) n = n.map((x) => -x);   // two-sided
  const sh = 0.38 + 0.62 * Math.max(0, dot(n, L)), col = [0, 1, 2].map((c) => Math.min(255, 255 * sh * (C[k[0] * 3 + c] + C[k[1] * 3 + c] + C[k[2] * 3 + c]) / 3));
  const x0 = Math.max(0, Math.floor(Math.min(v[0][0], v[1][0], v[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(v[0][0], v[1][0], v[2][0])));
  const y0 = Math.max(0, Math.floor(Math.min(v[0][1], v[1][1], v[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(v[0][1], v[1][1], v[2][1])));
  const den = (v[1][1] - v[2][1]) * (v[0][0] - v[2][0]) + (v[2][0] - v[1][0]) * (v[0][1] - v[2][1]); if (Math.abs(den) < 1e-9) continue;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const a = ((v[1][1] - v[2][1]) * (px - v[2][0]) + (v[2][0] - v[1][0]) * (py - v[2][1])) / den;
    const b = ((v[2][1] - v[0][1]) * (px - v[2][0]) + (v[0][0] - v[2][0]) * (py - v[2][1])) / den, c = 1 - a - b;
    if (a < 0 || b < 0 || c < 0) continue;
    const z = 1 / (a / v[0][2] + b / v[1][2] + c / v[2][2]), o = y * W + x;
    if (z < zb[o]) { zb[o] = z; img[o * 3] = col[0]; img[o * 3 + 1] = col[1]; img[o * 3 + 2] = col[2]; }
  }
}
fs.writeFileSync(outP, Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), img]));
