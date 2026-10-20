// Round 4 size sheet (B·D1c): identical-framing renders of each body, so before/after and
// new/shipped differ only by the car. Ortho side/front/top + the phone 3/4 perspective.
// node design-preview/bodies/size-sheet.mjs <outDir> <ids,...>   (HEAD_REF=<ref> renders that commit)
// Writes <id>-<view>.rgb (raw W*H*3) + .mask (W*H) + sizes.json; combine with size-sheet-compose.mjs.
import fs from "node:fs"; import { execSync } from "node:child_process";
if (process.env.HEAD_REF) { const rf = fs.readFileSync; fs.readFileSync = function (f, ...r) { const m = String(f).match(/\/(js\/.*\.js)$/);
  if (m && r[0] === "utf8") { try { return execSync(`git show ${process.env.HEAD_REF}:${m[1]}`, { encoding: "utf8", maxBuffer: 1 << 26 }); } catch { } } return rf.call(fs, f, ...r); }; }
const { loadParts } = await import("../../tools/car/parts-sweep.mjs");
const [outDir, idsS] = process.argv.slice(2);
const { Car3D, Parts, Teams } = loadParts(process.env.ROUND ? { shade: true } : undefined);
const t = Teams.LIST.find((x) => x.id === (process.env.TEAM || "mclaren"));
const T = Parts.getVisualTiers(Parts.getFactorySetup(t), t);
export const VIEWS = {   // [W, H, kind, ...]: ortho = u axis, v axis, u0, v0, px/m (u flips for side so the nose points right)
  side:  [844, 200, "ortho", 2, 1, -3.0, -0.05, 134, -1],
  front: [420, 240, "ortho", 0, 1, -1.05, -0.05, 200, 1],
  top:   [844, 300, "ortho", 2, 0, -3.0, -1.12, 134, -1],
  q34:   [844, 390, "persp", [4.22, 1.92, 4.83], [0, 0.30, 0.45], 25],   // garage hero angle: az 0.72 el 0.24, d 6.6
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
function render(d, view) {
  const [W, H, kind, ...a] = VIEWS[view], L = nrm([0.4, 0.8, 0.45]);
  let proj, eyeDir;
  if (kind === "ortho") { const [ua, va, u0, v0, s, flip] = a; const da = 3 - ua - va;
    proj = (p) => [flip > 0 ? (p[ua] - u0) * s : W - (p[ua] - u0) * s, H - (p[va] - v0) * s, (view === "top" ? -p[1] : view === "front" ? -p[2] : -p[0])];
    eyeDir = (n) => [view === "side" ? 1 : 0, view === "top" ? 1 : 0, view === "front" ? 1 : 0];
    void da; }
  else { const [eye, look, fov] = a, f = 1 / Math.tan((fov * Math.PI / 180) / 2), fw = nrm(sub(look, eye)), rt = nrm(crs(fw, [0, 1, 0])), up = crs(rt, fw);
    proj = (p) => { const q = sub(p, eye), z = dot(q, fw); return [W / 2 + (dot(q, rt) / z) * f * H / 2, H / 2 - (dot(q, up) / z) * f * H / 2, z]; };
    eyeDir = (w0) => nrm(sub(eye, w0)); }
  const zb = new Float32Array(W * H).fill(Infinity), img = Buffer.alloc(W * H * 3), mask = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) { img[i * 3] = 232; img[i * 3 + 1] = 234; img[i * 3 + 2] = 236; }
  const P = d.pos, C = d.col, I = d.idx;
  for (let t3 = 0; t3 < I.length; t3 += 3) {
    const k = [I[t3], I[t3 + 1], I[t3 + 2]], w = k.map((q) => [P[q * 3], P[q * 3 + 1], P[q * 3 + 2]]), v = w.map(proj);
    if (kind === "persp" && v.some((q) => q[2] < 0.05)) continue;
    let n = nrm(crs(sub(w[1], w[0]), sub(w[2], w[0]))); if (dot(n, eyeDir(w[0])) < 0) n = n.map((x) => -x);
    const sh = 0.42 + 0.58 * Math.max(0, dot(n, L)), col = [0, 1, 2].map((c) => Math.min(255, 255 * sh * (C[k[0] * 3 + c] + C[k[1] * 3 + c] + C[k[2] * 3 + c]) / 3));
    const x0 = Math.max(0, Math.floor(Math.min(v[0][0], v[1][0], v[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(v[0][0], v[1][0], v[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(v[0][1], v[1][1], v[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(v[0][1], v[1][1], v[2][1])));
    const den = (v[1][1] - v[2][1]) * (v[0][0] - v[2][0]) + (v[2][0] - v[1][0]) * (v[0][1] - v[2][1]); if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const A = ((v[1][1] - v[2][1]) * (px - v[2][0]) + (v[2][0] - v[1][0]) * (py - v[2][1])) / den;
      const B = ((v[2][1] - v[0][1]) * (px - v[2][0]) + (v[0][0] - v[2][0]) * (py - v[2][1])) / den, Cc = 1 - A - B;
      if (A < 0 || B < 0 || Cc < 0) continue;
      const z = kind === "persp" ? 1 / (A / v[0][2] + B / v[1][2] + Cc / v[2][2]) : A * v[0][2] + B * v[1][2] + Cc * v[2][2], o = y * W + x;
      mask[o] = 1;
      if (z < zb[o]) { zb[o] = z; img[o * 3] = col[0]; img[o * 3 + 1] = col[1]; img[o * 3 + 2] = col[2]; }
    }
  }
  return { W, H, img, mask };
}
fs.mkdirSync(outDir, { recursive: true });
for (const id of idsS.split(",")) {
  const d = Car3D.buildComplete(t.color, t.color2, { livery: { c1: t.color, c2: t.color2, bodyStyle: id === "team" ? undefined : id }, teamId: t.id, num: 4, parts: T });
  for (const v of Object.keys(VIEWS)) { const r = render(d, v);
    fs.writeFileSync(`${outDir}/${id}-${v}.rgb`, r.img); fs.writeFileSync(`${outDir}/${id}-${v}.mask`, r.mask); }
}
fs.writeFileSync(`${outDir}/views.json`, JSON.stringify(Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, [v[0], v[1]]]))));
