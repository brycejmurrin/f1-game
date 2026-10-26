// Fit a pinhole camera (eye, yaw, pitch, f, cx, cy) to sheet landmarks. Car space: +z nose, +x car's right, +y up.
const PTS = JSON.parse(process.argv[2]);
const FIX = process.argv[3] ? JSON.parse(process.argv[3]) : null;   // [cx, cy] principal point, held   // [[x,y,z, u,v, w?], ...] u,v in sheet px
const proj = (p, q) => {
  const [ex, ey, ez, yaw, pitch, f] = p, [cx, cy] = FIX || [p[6], p[7]];
  const fw = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
  const rt = [-Math.cos(yaw), 0, Math.sin(yaw)];   // right = fw x up (y up, right-handed)
  const up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
  const d = [q[0] - ex, q[1] - ey, q[2] - ez], z = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
  const x = d[0] * rt[0] + d[1] * rt[1] + d[2] * rt[2], y = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
  return [cx + f * x / z, cy - f * y / z, z];
};
const err = (p) => { if (p[5] <= 600 || p[5] > 12000 || (process.env.BEHIND && p[2] > -1) || p[4] >= 0 || (!FIX && (p[6] < 250 || p[6] > 550 || p[7] < 150 || p[7] > 400))) return 1e12; let e = 0; for (const q of PTS) { const [u, v, z] = proj(p, q); if (z <= 0.1) return 1e12; e += (q[5] ?? 1) * ((u - q[3]) ** 2 + (v - q[4]) ** 2); } return e; };
function nm(f, x0, step, iters = 20000) {
  const n = x0.length; let S = [x0.slice()]; for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += step[i]; S.push(x); }
  let F = S.map(f);
  for (let k = 0; k < iters; k++) {
    const o = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); S = o.map((i) => S[i]); F = o.map((i) => F[i]);
    const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
    const at = (t) => c.map((v, j) => v + t * (S[n][j] - v));
    const xr = at(-1), fr = f(xr);
    if (fr < F[0]) { const xe = at(-2), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
    else { const xc = at(0.5), fc = f(xc); if (fc < F[n]) { S[n] = xc; F[n] = fc; } else { for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = f(S[i]); } } }
  }
  return [S[0], F[0]];
}
let best = null;
for (const ex of (process.env.BEHIND ? [3, 1, -1] : [3, 5, 7])) for (const ey of [2, 3.5]) for (const ez of (process.env.BEHIND ? [-3, -5, -7] : [3, 5, 7])) {
  const yaw = Math.atan2(-ex, -ez + 0), pitch = -Math.atan2(ey, Math.hypot(ex, ez));
  const initial = [ex, ey, ez, yaw, pitch, 900], steps = [1, 1, 1, 0.2, 0.1, 200];
  if (!FIX) { initial.push(380, 250); steps.push(50, 50); }
  const r = nm(err, initial, steps);
  if (!best || r[1] < best[1]) best = r;
}
const [p, e] = best, rms = Math.sqrt(e / PTS.length);
const [ex, ey, ez, yaw, pitch, f] = p;
const fw = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
const out = { eye: [ex, ey, ez].map((v) => +v.toFixed(3)), dir: fw.map((v) => +v.toFixed(4)), f: +f.toFixed(1), cx: +(FIX || [p[6], p[7]])[0].toFixed(1), cy: +(FIX || [p[6], p[7]])[1].toFixed(1), rmsPx: +rms.toFixed(1),
  resid: PTS.map((q) => { const [u, v] = proj(p, q); return [+(u - q[3]).toFixed(1), +(v - q[4]).toFixed(1)]; }) };
// a look-at point on the view ray at the car's centre distance
const t = -(ex * fw[0] + (ey - 0.4) * fw[1] + (ez + 0.2) * fw[2]);
out.look = [ex + t * fw[0], ey + t * fw[1], ez + t * fw[2]].map((v) => +v.toFixed(3));
console.log(JSON.stringify(out));
