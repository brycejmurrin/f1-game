// Silhouette masks (side z-y, top z-x, front x-y) of Car3D builds; XOR % between bodies.
// Usage: node scratch/body-designs/sil.mjs [extraStylesJson] [--png]
import fs from "node:fs";
import { loadParts } from "../../tools/car/parts-sweep.mjs";
const M = loadParts();
const { Car3D, Parts, Teams } = M;
const extra = process.argv[2] && process.argv[2] !== "-" ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : {};
// Inject prototypes into BODY_STYLES (frozen) via a fresh object is impossible; instead the caller edits car3d.js.
const team = Teams.LIST.find((t) => t.id === "mclaren");
const tiers = Parts.getVisualTiers(Parts.getFactorySetup(team), team);
const R = +(process.env.R || 200); // px per metre (40 ~ the car at 844x390 garage framing)
const AZ = 0.64, EL = 0.19;
const VIEWS = { hero: ['h', 'h', -3.2, 3.2, -1.2, 1.9], side: [2, 1, -3.0, 3.0, 0, 1.3], top: [2, 0, -3.0, 3.0, -1.1, 1.1], front: [0, 1, -1.1, 1.1, 0, 1.3] };
function mask(d, v) {
  const [a, b, a0, a1, b0, b1] = VIEWS[v]; const W = Math.round((a1 - a0) * R), H = Math.round((b1 - b0) * R);
  const m = new Uint8Array(W * H); const P = d.pos, I = d.idx;
  for (let t = 0; t < I.length; t += 3) {
    const pts = [0, 1, 2].map((k) => { const i = I[t + k] * 3; let u, w;
      if (a === 'h') { const x = P[i], y = P[i + 1], z = P[i + 2]; const xr = x * Math.cos(AZ) + z * Math.sin(AZ), zr = -x * Math.sin(AZ) + z * Math.cos(AZ);
        u = xr; w = y * Math.cos(EL) - zr * Math.sin(EL); } else { u = P[i + a]; w = P[i + b]; }
      return [(u - a0) * R, (w - b0) * R]; });
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
    const [p0, p1, p2] = pts; const den = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l0 = ((p1[1] - p2[1]) * (px - p2[0]) + (p2[0] - p1[0]) * (py - p2[1])) / den;
      const l1 = ((p2[1] - p0[1]) * (px - p2[0]) + (p0[0] - p2[0]) * (py - p2[1])) / den;
      if (l0 >= -1e-6 && l1 >= -1e-6 && 1 - l0 - l1 >= -1e-6) m[y * W + x] = 1;
    }
  }
  return { m, W, H };
}
export function masks(id) {
  const d = Car3D.buildComplete(team.color, team.color2, { livery: { c1: team.color, c2: team.color2, bodyStyle: id }, teamId: team.id, num: 4, parts: tiers });
  return Object.fromEntries(Object.keys(VIEWS).map((v) => [v, mask(d, v)]));
}
function diff(A, B) { let x = 0, u = 0; for (let i = 0; i < A.m.length; i++) { const a = A.m[i], b = B.m[i]; if (a !== b) x++; if (a || b) u++; } return 100 * x / u; }
const ids = [undefined, ...Car3D.BODY_STYLE_IDS];
const ms = Object.fromEntries(ids.map((id) => [id || "team", masks(id)]));
const names = Object.keys(ms);
const news = (process.env.NEW || "").split(",").filter(Boolean);
const rows = news.length ? news : names;
for (const v of Object.keys(VIEWS)) {
  console.log(`\n== ${v} XOR% (row vs col)`);
  console.log("".padEnd(10) + names.map((n) => n.slice(0, 7).padStart(8)).join(""));
  for (const r of rows) console.log(r.padEnd(10) + names.map((c) => (r === c ? "-" : diff(ms[r][v], ms[c][v]).toFixed(1)).padStart(8)).join(""));
}
const OLD = ["team", "needle", "brick", "anteater", "arched", "wedge", "barge"];
if (news.length) { console.log("\n== nearest existing (min XOR%) R=" + R);
  for (const r of rows) console.log(r.padEnd(10) + Object.keys(VIEWS).map((v) => { let best = [1e9, ""]; for (const c of OLD) { const d = diff(ms[r][v], ms[c][v]); if (d < best[0]) best = [d, c]; } return `${v} ${best[0].toFixed(1)} (${best[1]})`; }).join("  |  ")); }
if (process.argv.includes("--pgm")) for (const n of names) for (const v of Object.keys(VIEWS)) {
  const { m, W, H } = ms[n][v]; const out = Buffer.alloc(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[(H - 1 - y) * W + x] = m[y * W + x] ? 0 : 255;
  fs.writeFileSync(`scratch/body-designs/${n}-${v}.pgm`, Buffer.concat([Buffer.from(`P5 ${W} ${H} 255\n`), out]));
}
