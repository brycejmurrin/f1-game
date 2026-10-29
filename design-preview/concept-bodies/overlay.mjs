// Our car's silhouette and part edges drawn over the concept sheet through the camera solved from it
// (solve-cam.mjs). node design-preview/concept-bodies/overlay.mjs <body> front|rear <out.png> [team]
// Sections are coloured so the mismatch reads per part: chassis/nose cyan, sidepods magenta, engineCover yellow.
import sharp from "sharp";
const { build } = await import("./fit-probe.mjs");
const [id, view, out, team] = process.argv.slice(2);
const CAM = {
  front: { eye: [4.38, 1.84, 7.36], dir: [-0.5402, -0.1912, -0.8195], f: 1473.1, c: [385, 270], box: [10, 80, 760, 400] },
  rear: { eye: [1.223, 0.745, -7.779], dir: [-0.1925, -0.0448, 0.9803], f: 826.4, c: [610, 420], box: [455, 335, 310, 170] },
}[view];
const OFF = { rift: [0, 0], keel: [766, 0], delta: [0, 435], serpent: [766, 435] }[id] || [0, 0];
const d = build(id, team || "mercedes"), P = d.pos, I = d.idx;
const n = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); }, cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const fw = n(CAM.dir), rt = n(cr(fw, [0, 1, 0])), up = cr(rt, fw);
const [bx, by, bw, bh] = CAM.box, S = view === "rear" ? 4 : 2, W = bw * S, H = bh * S;
const proj = (k) => { const q = [P[k * 3] - CAM.eye[0], P[k * 3 + 1] - CAM.eye[1], P[k * 3 + 2] - CAM.eye[2]];
  const z = q[0] * fw[0] + q[1] * fw[1] + q[2] * fw[2];
  return [((CAM.c[0] + CAM.f * (q[0] * rt[0] + q[1] * rt[1] + q[2] * rt[2]) / z) - bx) * S, ((CAM.c[1] - CAM.f * (q[0] * up[0] + q[1] * up[1] + q[2] * up[2]) / z) - by) * S, z]; };
const sec = new Int16Array(P.length / 3).fill(-1); d.parts.forEach((p, i) => { for (let v = p.from; v < p.to; v++) sec[v] = i; });
const names = d.parts.map((p) => p.name);
const COL = { chassis: [0, 230, 255], hood: [0, 230, 255], sidepods: [255, 0, 200], engineCover: [255, 220, 0], wheels: [120, 120, 120] };
const zb = new Float32Array(W * H).fill(Infinity), ib = new Int16Array(W * H).fill(-1);
for (let t = 0; t < I.length; t += 3) {
  const k = [I[t], I[t + 1], I[t + 2]], v = k.map(proj); if (v.some((q) => q[2] < 0.1)) continue;
  const x0 = Math.max(0, Math.floor(Math.min(v[0][0], v[1][0], v[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(v[0][0], v[1][0], v[2][0])));
  const y0 = Math.max(0, Math.floor(Math.min(v[0][1], v[1][1], v[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(v[0][1], v[1][1], v[2][1])));
  const den = (v[1][1] - v[2][1]) * (v[0][0] - v[2][0]) + (v[2][0] - v[1][0]) * (v[0][1] - v[2][1]); if (Math.abs(den) < 1e-9) continue;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const a = ((v[1][1] - v[2][1]) * (x + .5 - v[2][0]) + (v[2][0] - v[1][0]) * (y + .5 - v[2][1])) / den, b = ((v[2][1] - v[0][1]) * (x + .5 - v[2][0]) + (v[0][0] - v[2][0]) * (y + .5 - v[2][1])) / den, c = 1 - a - b;
    if (a < 0 || b < 0 || c < 0) continue; const z = 1 / (a / v[0][2] + b / v[1][2] + c / v[2][2]), o = y * W + x;
    if (z < zb[o]) { zb[o] = z; ib[o] = sec[k[0]]; }
  }
}
const base = await sharp("scratch/d1d-ref.png").extract({ left: bx + OFF[0], top: by + OFF[1], width: Math.min(bw, 1536 - bx - OFF[0]), height: bh }).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  const o = y * W + x, s = ib[o], edge = [ib[o - 1], ib[o + 1], ib[o - W], ib[o + W]].some((q) => q !== s);
  if (!edge) continue; const c = (s >= 0 ? COL[names[s]] : null) || (s < 0 ? [255, 40, 40] : null); if (!c) continue;
  const outline = [ib[o - 1], ib[o + 1], ib[o - W], ib[o + W]].some((q) => q < 0) || s < 0;
  const col = outline ? [255, 40, 40] : c; base[o * 3] = col[0]; base[o * 3 + 1] = col[1]; base[o * 3 + 2] = col[2];
}
await sharp(base, { raw: { width: W, height: H, channels: 3 } }).png().toFile(out);
console.log(out);
