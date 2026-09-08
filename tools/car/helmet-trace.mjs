#!/usr/bin/env node
// helmet-trace — read a driver's real paint off a reference photograph.
// @doc Projects the js/car/helmets.js shell into a side-on reference photo and samples the real colour at every (t, az) of the mesh, writing a colour map plus a side-by-side verification sheet.
// @skill playwright-probe
//
//   node tools/car/helmet-trace.mjs --sheet=scratch/refs/f1-2025-helmets.webp
//   node tools/car/helmet-trace.mjs --sheet=... --check=NOR,LEC,HAM
//
// The designs were hand-written from looking at photographs, which is the same
// method that produced four wrong SHELLS before the shell was traced instead.
// This does for the paint what tools traced for the profile: the shell's own
// geometry is projected into the photo with the same orthographic camera the
// picture was taken with, and the colour under each (t, az) of the mesh grid is
// read straight out of the pixels. No judgement about "roughly a band here".
//
// Only the flank is honest — at the nose and the tail the surface turns away
// and one pixel covers many degrees — so samples are kept only where the
// surface faces the camera, and the far side is filled by mirroring, which is
// what a helmet painter does anyway.
import sharp from "sharp";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const flag = (n, d) => { const h = process.argv.slice(2).find((a) => a.startsWith("--" + n + "=")); return h ? h.slice(n.length + 3) : d; };
const Helmets = new Function(readFileSync(resolve(ROOT, "js/car/helmets.js"), "utf8") + "; return Helmets;")();
const SH = Helmets.SHAPE, RINGS = Helmets.RINGS, SLICES = Helmets.SLICES, ringT = Helmets.ringT;

/* The official 2025 line-up sheet, left to right and top to bottom, with the
   way each helmet FACES. Read off the picture; a wrong entry shows up
   immediately in the verification sheet as a design painted back to front. */
const GRID = [
  ["NOR", 1, "L"], ["PIA", 81, "L"], ["LEC", 16, "L"], ["HAM", 44, "L"], ["VER", 33, "R"],
  ["LAW", 40, "L"], ["RUS", 63, "L"], ["ANT", 12, "L"], ["ALO", 14, "L"], ["STR", 18, "L"],
  ["GAS", 10, "L"], ["DOO", null, "R"], ["OCO", 31, "R"], ["BEA", 87, "R"], ["TSU", null, "R"],
  ["HAD", 6, "L"], ["SAI", 55, "L"], ["ALB", 23, "R"], ["HUL", 27, "L"], ["BOR", 5, "L"],
];

// ── segment the sheet into one blob per helmet ───────────────────────────────
async function blobs(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const corner = (x, y) => { const i = (x + y * W) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  const cs = [corner(1, 1), corner(W - 2, 1), corner(1, H - 2), corner(W - 2, H - 2)];
  const BGC = [0, 1, 2].map((c) => cs.reduce((a, k) => a + k[c], 0) / 4);
  const TOL = Number(flag("tol", 46));
  const isBg = (i) => Math.abs(data[i * ch] - BGC[0]) + Math.abs(data[i * ch + 1] - BGC[1]) + Math.abs(data[i * ch + 2] - BGC[2]) < TOL;
  const bg = new Uint8Array(W * H), st = [];
  for (let x = 0; x < W; x++) st.push(x, x + (H - 1) * W);
  for (let y = 0; y < H; y++) st.push(y * W, W - 1 + y * W);
  while (st.length) {
    const i = st.pop();
    if (bg[i] || !isBg(i)) continue;
    bg[i] = 1;
    const x = i % W, y = (i / W) | 0;
    if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1);
    if (y > 0) st.push(i - W); if (y < H - 1) st.push(i + W);
  }
  const lab = new Int32Array(W * H).fill(-1), out = [];
  for (let s = 0; s < W * H; s++) {
    if (bg[s] || lab[s] >= 0) continue;
    let n = 0, x0 = W, x1 = 0, y0 = H, y1 = 0; const q = [s]; lab[s] = s;
    while (q.length) {
      const i = q.pop(); n++; const x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1])
        if (j >= 0 && !bg[j] && lab[j] < 0) { lab[j] = s; q.push(j); }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (n > 4000 && w > 90 && h > 90 && w / h > 0.9 && w / h < 1.7) out.push({ id: s, n, x0, y0, x1, y1, w, h });
  }
  // reading order: rows first, then left to right inside a row
  out.sort((a, b) => a.y0 - b.y0);
  const rows = [];
  for (const b of out) {
    const r = rows.find((r) => Math.abs(r[0].y0 - b.y0) < b.h * 0.6);
    if (r) r.push(b); else rows.push([b]);
  }
  for (const r of rows) r.sort((a, b) => a.x0 - b.x0);
  return { list: rows.flat(), data, W, H, ch, lab };
}

/* Project a shell point with the same orthographic camera the photo was taken
   with: the flank, level with the helmet. `right` and `up` are the screen axes,
   `fwd` points into the picture. */
const CAM_AZ = Math.PI / 2, EL = Number(flag("el", 4)) * Math.PI / 180;
const ce = Math.cos(EL), se = Math.sin(EL);
const fwd = [-Math.sin(CAM_AZ) * ce, -se, -Math.cos(CAM_AZ) * ce];
const right = [Math.cos(CAM_AZ), 0, -Math.sin(CAM_AZ)];
const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function normalAt(t, a) {
  const du = 0.004, da = 0.05;
  const p = Helmets.pointAt(t, a), pu = Helmets.pointAt(Math.min(1, t + du), a), pd = Helmets.pointAt(Math.max(0, t - du), a);
  const pr = Helmets.pointAt(t, a + da), pl = Helmets.pointAt(t, a - da);
  const tu = [pu[0] - pd[0], pu[1] - pd[1], pu[2] - pd[2]], ta = [pr[0] - pl[0], pr[1] - pl[1], pr[2] - pl[2]];
  const n = [ta[1] * tu[2] - ta[2] * tu[1], ta[2] * tu[0] - ta[0] * tu[2], ta[0] * tu[1] - ta[1] * tu[0]];
  const m = Math.hypot(...n) || 1;
  return [n[0] / m, n[1] / m, n[2] / m];
}
// the shell's own projected extent, so the photo's bounding box can be matched to it
const EXT = (() => {
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (let r = 0; r <= 240; r++) for (let s = 0; s < 240; s++) {
    const p = Helmets.pointAt(r / 240, (s / 240) * Math.PI * 2);
    const u = dot(p, right), v = dot(p, up);
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  return { u0, u1, v0, v1 };
})();

/* THE MODE OF THE CELL, not the pixel under the point. A helmet in a
   photograph is covered in sponsor lettering, a manufacturer's logo and a hard
   specular highlight, and a single sample lands on one of them often enough to
   speckle the whole map with white. Quantising the neighbourhood into coarse
   bins and taking the most populated one throws all three away: white letters
   on red are a minority of a cell that is mostly red. */
function mode(img, box, px, py, rad) {
  const { data, W, H, ch, lab } = img;
  const bins = new Map();
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    if (dx * dx + dy * dy > rad * rad) continue;
    const x = px + dx, y = py + dy;
    if (x < 0 || y < 0 || x >= W || y >= H || lab[x + y * W] !== box.id) continue;
    const i = (x + y * W) * ch, r = data[i], g = data[i + 1], b = data[i + 2];
    const k = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    let e = bins.get(k);
    if (!e) bins.set(k, e = { n: 0, r: 0, g: 0, b: 0 });
    e.n++; e.r += r; e.g += g; e.b += b;
  }
  let best = null;
  for (const e of bins.values()) if (!best || e.n > best.n) best = e;
  return best && best.n >= 3 ? [best.r / best.n / 255, best.g / best.n / 255, best.b / best.n / 255] : null;
}

function sample(img, box, flip) {
  const { data, W, ch, lab } = img;
  const grid = [];
  for (let r = 0; r <= RINGS; r++) {
    const t = Math.min(1, ringT(r)), row = [];
    for (let sl = 0; sl < SLICES; sl++) {
      const a = (sl / SLICES) * Math.PI * 2;
      const p = Helmets.pointAt(t, a), n = normalAt(t, a);
      const face = -dot(n, fwd);                       // 1 straight at the camera, 0 edge-on
      if (face < 0.55) { row.push(null); continue; }   // grazing: mostly shadow, and one pixel covers many degrees
      let u = (dot(p, right) - EXT.u0) / (EXT.u1 - EXT.u0);
      const v = 1 - (dot(p, up) - EXT.v0) / (EXT.v1 - EXT.v0);
      if (flip) u = 1 - u;
      const px = Math.round(box.x0 + u * (box.w - 1)), py = Math.round(box.y0 + v * (box.h - 1));
      row.push(mode(img, box, px, py, Math.max(2, Math.round(Math.min(box.w / SLICES, box.h / RINGS) * 0.7))));
    }
    grid.push(row);
  }
  // mirror the far side onto the near one, then close any hole with its nearest
  // neighbour round the ring — the nose and the tail are never sampled honestly
  for (let r = 0; r <= RINGS; r++) {
    const row = grid[r];
    for (let sl = 0; sl < SLICES; sl++) {
      if (row[sl]) continue;
      const m = (SLICES - sl) % SLICES;
      if (row[m]) { row[sl] = row[m]; continue; }
      for (let d = 1; d < SLICES; d++) {
        const a = row[(sl + d) % SLICES], b = row[(sl - d + SLICES) % SLICES];
        if (a || b) { row[sl] = a || b; break; }
      }
    }
    if (!row.some(Boolean)) for (let sl = 0; sl < SLICES; sl++) row[sl] = [0.5, 0.5, 0.5];
  }
  return grid;
}

const img = await blobs(resolve(ROOT, flag("sheet", "scratch/refs/f1-2025-helmets.webp")));
if (img.list.length !== GRID.length) console.warn(`! found ${img.list.length} helmets, GRID names ${GRID.length} — check --tol`);
const maps = {};
for (let i = 0; i < Math.min(img.list.length, GRID.length); i++) {
  const [code, num, face] = GRID[i];
  if (num == null) continue;                            // on the sheet, not on our grid
  maps[num] = { code, grid: sample(img, img.list[i], face === "R") };
}
const outDir = resolve(ROOT, "scratch/refs");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "helmet-maps.json"), JSON.stringify(maps));
console.log(`traced ${Object.keys(maps).length} helmets -> scratch/refs/helmet-maps.json  (${RINGS + 1} rings x ${SLICES} slices)`);

/* ── the report ───────────────────────────────────────────────────────────
   A per-cell map read off a 250-pixel photograph is too noisy to paint from
   directly — it carries the shoot's highlights and the shadow under the lid.
   What IS robust is the mode over a whole ring, and the palette over the whole
   shell: a tenth of a helmet is a lot of pixels. So the tool's product is a
   measurement of each design — what colour the crown is, where it changes, and
   which accents are actually on it — for the DESIGNS table to be written from. */
const NAMED = Helmets.COLORS;
/* NAME A COLOUR BY ITS CHROMATICITY, not its RGB. A photographed helmet is
   shaded, so the same red paint runs from 0.9 down to 0.25 across one shot;
   matched on raw RGB the lit half comes back "red" and the shaded half comes
   back as whatever mid-grey is nearest in the palette — which is how every
   driver's report came back 12% "purple". Dividing out the value first leaves
   the hue, which is what the paint actually is; value is then compared with a
   light weight so white and black still separate from grey. */
const chroma = (c) => { const v = Math.max(c[0], c[1], c[2], 1e-3); return [c[0] / v, c[1] / v, c[2] / v, v]; };
const nearest = (c) => {
  const a = chroma(c);
  let best = null;
  for (const k in NAMED) {
    const b = chroma(NAMED[k]);
    const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + 0.55 * Math.abs(a[3] - b[3]);
    if (!best || d < best.d) best = { k, d };
  }
  return best;
};
const modeOf = (list) => {
  const bins = new Map();
  for (const c of list) {
    if (!c) continue;
    const k = ((c[0] * 255) >> 5) * 64 + ((c[1] * 255) >> 5) * 8 + ((c[2] * 255) >> 5);
    let e = bins.get(k);
    if (!e) bins.set(k, e = { n: 0, c: [0, 0, 0] });
    e.n++; e.c[0] += c[0]; e.c[1] += c[1]; e.c[2] += c[2];
  }
  return [...bins.values()].sort((a, b) => b.n - a.n).map((e) => ({ n: e.n, c: e.c.map((v) => v / e.n) }));
};
if (flag("report", "")) {
  for (const num of Object.keys(maps).map(Number).sort((a, b) => a - b)) {
    const m = maps[num];
    const all = modeOf(m.grid.flat());
    const total = all.reduce((a, e) => a + e.n, 0);
    console.log(`\n${m.code} #${num}`);
    console.log("  palette: " + all.slice(0, 5).map((e) => `${nearest(e.c).k}(${(100 * e.n / total).toFixed(0)}%)`).join("  "));
    let prev = "";
    const rows = [];
    for (let r = 0; r <= RINGS; r++) {
      const t = Math.min(1, ringT(r));
      if (t < 0.03 || t > 0.97) continue;
      const k = nearest(modeOf(m.grid[r])[0].c).k;
      if (k !== prev) { rows.push(`${t.toFixed(2)}:${k}`); prev = k; }
    }
    console.log("  down the shell: " + rows.join("  "));
  }
}
