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
    // THE SHADOW IS PART OF THE BLOB. A product shot puts a soft contact shadow
    // under the lid, and it reaches the same flood fill the helmet does, so the
    // raw box is taller than the helmet and every band lands high. Rows
    // narrower than a quarter of the widest are the shadow's tail and the
    // strap's; trimming to the real shell is what makes a measured band
    // position mean anything.
  }
  // reading order: rows first, then left to right inside a row
  out.sort((a, b) => a.y0 - b.y0);
  const rows = [];
  for (const b of out) {
    const r = rows.find((r) => Math.abs(r[0].y0 - b.y0) < b.h * 0.6);
    if (r) r.push(b); else rows.push([b]);
  }
  for (const r of rows) r.sort((a, b) => a.x0 - b.x0);
  for (const b of rows.flat()) {
    const wid = [];
    for (let y = b.y0; y <= b.y1; y++) {
      let n = 0;
      for (let x = b.x0; x <= b.x1; x++) if (lab[x + y * W] === b.id) n++;
      wid.push(n);
    }
    const cut = Math.max(...wid) * 0.25;
    let a = 0, z = wid.length - 1;
    while (a < z && wid[a] < cut) a++;
    while (z > a && wid[z] < cut) z--;
    b.y0 += a; b.y1 = b.y0 + (z - a); b.h = b.y1 - b.y0 + 1;
  }
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
  /* DIVIDE THE SHOOT'S LIGHTING OUT. The same paint runs from bright on the key
     side to near-black on the far side of one photograph, and no amount of
     careful naming fixes a sample that is genuinely dark. The illumination
     varies SLOWLY across the shell and the paint changes ABRUPTLY, so a heavily
     blurred copy of the value channel is an estimate of the lighting alone;
     dividing by it flattens the shading and leaves the edges standing. */
  const V = grid.map((row) => row.map((c) => Math.max(c[0], c[1], c[2], 1e-3)));
  const blur = V.map((row, r) => row.map((_, sl) => {
    let sum = 0, n = 0;
    for (let dr = -3; dr <= 3; dr++) for (let ds = -5; ds <= 5; ds++) {
      const rr = r + dr;
      if (rr < 0 || rr >= V.length) continue;
      sum += V[rr][(sl + ds + SLICES * 2) % SLICES]; n++;
    }
    return sum / n;
  }));
  let mean = 0, mn = 0;
  for (const row of blur) for (const v of row) { mean += v; mn++; }
  mean /= mn;
  for (let r = 0; r < grid.length; r++) for (let sl = 0; sl < SLICES; sl++) {
    const k = mean / Math.max(0.04, blur[r][sl]);
    grid[r][sl] = grid[r][sl].map((v) => Math.min(1, v * k));
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

/* ── the score ────────────────────────────────────────────────────────────
   The traced map and a DESIGNS entry live on the same (t, az) grid, so they can
   be compared cell for cell without rendering anything. This is the honest
   answer to "which of these is still wrong": not a band position, which this
   source cannot resolve, but how far each design sits from the photograph
   overall, and which ones are worth another pass. Compared in chromaticity plus
   a light value term, the same way colours are named — the photo's own shading
   is normalised out but never perfectly. */
if (flag("score", "")) {
  const rows = [];
  for (const num of Object.keys(maps).map(Number)) {
    const m = maps[num], skin = Helmets.shell(Helmets.designFor(num, null));
    let sum = 0, n = 0;
    for (let r = 0; r <= RINGS; r++) {
      const t = Math.min(1, ringT(r));
      for (let sl = 0; sl < SLICES; sl++) {
        const az = (sl / SLICES) * 360;
        if (Helmets.isVisor(t, az)) continue;          // the aperture is glass in both
        const a = chroma(m.grid[r][sl]), b = chroma(skin(t, az).c);
        sum += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + 0.5 * Math.abs(a[3] - b[3]);
        n++;
      }
    }
    rows.push({ code: m.code, num, d: sum / n });
  }
  rows.sort((a, b) => b.d - a.d);
  console.log("\ndistance from the photograph, worst first:");
  for (const r of rows) console.log(`  ${r.code.padEnd(4)} #${String(r.num).padEnd(3)} ${r.d.toFixed(3)} ${"#".repeat(Math.round(r.d * 40))}`);
}

/* ── fitting the band positions ──────────────────────────────────────────
   Detecting band EDGES off this source does not work, and three estimators
   agreed on that: the mode of a ring flips because a helmet has vertical
   structure and the mode is a vote between the band and whatever crosses it;
   a change-point histogram fires everywhere, including a phantom at the crown
   where the columns converge; demanding a coherent from-colour and to-colour
   kills all but two drivers and gets both of those wrong. At 250 pixels a
   helmet, with the shoot's shading and a registration that can be a ring or
   two out, the edge is simply not resolvable.

   Fitting the positions instead does converge — coordinate descent over each
   zone's t values, bounded so a band cannot walk to the other end of the
   shell, took the mean distance from 0.968 to 0.810 and every one of the 18
   improved. AND THE RESULT LOOKED WORSE. Alonso, Hulkenberg, Lawson and Albon
   all came back washed out into pale bands, because the fit found a bias in
   the metric rather than the truth: dividing the shoot's lighting out (above)
   normalises the max channel, which pulls every bright sample toward white, so
   the score quietly pays for pale paint. The fit is an honest optimiser of a
   dishonest objective, and the fitted table was reverted rather than shipped.

   So --fit stays, because the ranking underneath it is sound and it is how
   Hadjar's base was caught, but treat its output as a HYPOTHESIS to check
   against tools/car/helmet-sheet.mjs --mesh, never as a table to paste. Fixing
   it properly means a photometric normalisation that separates a specular
   highlight from white paint, which a single flat-lit frame per helmet cannot
   give you. Band positions therefore remain hand-set, and this comment is the
   reason rather than an omission. */
if (flag("fit", "")) {
  const STEPS = [0.06, 0.03, 0.015], BOUND = 0.13;
  const T_KEYS = ["t", "t0", "t1"];
  const score = (design, m) => {
    const skin = Helmets.shell(design);
    let sum = 0, n = 0;
    for (let r = 0; r <= RINGS; r++) {
      const t = Math.min(1, ringT(r));
      for (let sl = 0; sl < SLICES; sl++) {
        const az = (sl / SLICES) * 360;
        if (Helmets.isVisor(t, az)) continue;
        const a = chroma(m.grid[r][sl]), b = chroma(skin(t, az).c);
        sum += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + 0.5 * Math.abs(a[3] - b[3]);
        n++;
      }
    }
    return sum / n;
  };
  let gain = 0, count = 0;
  const fitted = {};
  for (const num of Object.keys(maps).map(Number).sort((a, b) => a - b)) {
    const m = maps[num];
    const base = Helmets.designFor(num, null);
    const design = JSON.parse(JSON.stringify(base));
    /* A HELMET IS SYMMETRIC, so the fit must be too. Left the parameters free,
       coordinate descent walks the temple flash on one side to a different
       height from its mirror, because each is judged on its own half of a
       noisy photograph — and the result is a lid that is subtly wrong in a way
       no reference ever is. Mirrored zones (90 with 270, the nose with the
       tail) are tied into one slot and step together. */
    const mirror = (a, b) => a.k === b.k && ((a.az === 90 && b.az === 270) || (a.az === 0 && b.az === 180)) &&
      JSON.stringify({ ...a, az: 0 }) === JSON.stringify({ ...b, az: 0 });
    const twinOf = design.zones.map((z, i) => design.zones.findIndex((o, j) => j > i && mirror(z, o)));
    const slots = [];
    design.zones.forEach((z, zi) => {
      if (twinOf.some((t, i) => t === zi && i < zi)) return;        // the mirror moves with its partner
      T_KEYS.forEach((k) => {
        if (typeof z[k] !== "number") return;
        const zis = twinOf[zi] >= 0 ? [zi, twinOf[zi]] : [zi];
        slots.push({ zi, zis, k, from: z[k] });
      });
    });
    const before = score(design, m);
    let best = before;
    for (const step of STEPS) {
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (const sl of slots) {
          const z = design.zones[sl.zi], was = z[sl.k];
          for (const d of [-step, step]) {
            const v = Math.max(0, Math.min(1, was + d));
            if (Math.abs(v - sl.from) > BOUND) continue;             // no walking off to the other end
            if (sl.k === "t0" && typeof z.t1 === "number" && v >= z.t1 - 0.02) continue;
            if (sl.k === "t1" && typeof z.t0 === "number" && v <= z.t0 + 0.02) continue;
            for (const i of sl.zis) design.zones[i][sl.k] = v;
            const sc = score(design, m);
            if (sc < best - 1e-5) { best = sc; moved = true; break; }
            for (const i of sl.zis) design.zones[i][sl.k] = was;
          }
        }
        if (!moved) break;
      }
    }
    gain += before - best; count++;
    fitted[num] = { name: base.name, before, best, zones: design.zones };
    const moves = slots.filter((sl) => Math.abs(design.zones[sl.zi][sl.k] - sl.from) > 0.004);
    console.log(`${base.name} #${String(num).padEnd(3)} ${before.toFixed(3)} -> ${best.toFixed(3)}  ${moves.length} of ${slots.length} positions moved`);
  }
  console.log(`\nmean improvement ${(gain / count).toFixed(4)} over ${count} designs`);

  /* Re-emit the table with the fitted numbers, so the measurement lands in the
     source verbatim instead of being transcribed by hand eighteen times. The
     helpers are reconstructed where the shape still fits one — a band 0.055
     wide is a keyline, a pair of stripes over the nose and the tail is
     centre(), a pair of anything at 90 and 270 is sides() — because a table
     nobody can read is a table nobody can correct. */
  if (flag("emit", "")) {
    const NAME = new Map(Object.keys(NAMED).map((k) => [NAMED[k].join(","), "C." + k]));
    const col = (c) => NAME.get(c.join(",")) || `[${c.map((v) => v.toFixed(2)).join(", ")}]`;
    const n = (v) => v.toFixed(3).replace(/0+$/, "").replace(/\.$/, ".0");
    const one = (z) => {
      const c = col(z.c);
      switch (z.k) {
        case "cap": return `z.cap(${n(z.t1)}, ${c})`;
        case "band": return Math.abs(z.t1 - z.t0 - 0.055) < 0.006 ? `z.key(${n(z.t0)}, ${c})` : `z.band(${n(z.t0)}, ${n(z.t1)}, ${c})`;
        case "stripe": return `z.stripe(${z.az}, ${z.w}, ${c})`;
        case "wedge": return `z.wedge(${z.az0}, ${z.az1}, ${c})`;
        case "chevron": return `z.chevron(${z.az}, ${z.w}, ${n(z.t0)}, ${n(z.t1)}, ${c})`;
        case "spot": return `z.spot(${z.az}, ${n(z.t)}, ${z.r}, ${c})`;
        case "patch": return `z.patch(${z.az}, ${z.w}, ${n(z.t0)}, ${n(z.t1)}, ${c})`;
        case "flash": return `z.flash(${z.az}, ${z.w0}, ${z.w1}, ${n(z.t0)}, ${n(z.t1)}, ${z.sweep}, ${c})`;
        case "fleck": return `z.fleck(${n(z.t0)}, ${n(z.t1)}, ${z.n}, ${z.m}, ${z.d}, ${z.seed}, ${c})`;
        default: return `/* ${z.k} */`;
      }
    };
    const body = (z) => one(z).replace(/^z\.(\w+)\((\d+)/, "z.$1(a");
    console.log("\n── fitted zones ──");
    for (const num of Object.keys(fitted).map(Number).sort((a, b) => a - b)) {
      const zs = fitted[num].zones.slice(), out = [];
      while (zs.length) {
        const z = zs.shift();
        const twin = (az) => zs.findIndex((o) => o.k === z.k && o.az === az &&
          JSON.stringify({ ...o, az: 0 }) === JSON.stringify({ ...z, az: 0 }));
        if (z.k === "stripe" && z.az === 0) {
          const j = twin(180);
          if (j >= 0) { zs.splice(j, 1); out.push(`...centre(${z.w}, ${col(z.c)})`); continue; }
        }
        if (z.az === 90) {
          const j = twin(270);
          if (j >= 0) { zs.splice(j, 1); out.push(`...z.sides((a) => ${body(z)})`); continue; }
        }
        out.push(one(z));
      }
      console.log(`    ${num}: zones: [\n      ${out.join(", ")}] },`);
    }
  }
}


/* ── one helmet's palette ─────────────────────────────────────────────────
   Four of the grid — Perez, Lindblad, Colapinto, Bottas — are not on the
   side-on line-up sheet at all; it carries Doohan and Tsunoda in their places,
   so those four designs had never been measured against anything. They appear
   on the other reference, but as three-quarter views, and the (t, az)
   projection above assumes a flank.

   It does not matter: the PALETTE is the half of this tool that was ever
   sound, and a palette needs the helmet's pixels, not a mapping onto the
   shell. Segment the crop, name every pixel by chromaticity, report the
   shares. --palette=<file>. */
if (flag("palette", "")) {
  const file = flag("palette", "");
  // the same flood-fill segmentation the sheet uses, and the LARGEST blob:
  // a crop carries the backdrop and two lines of caption, and a plain colour
  // cut counts both — which is how Lindblad first came back "68% white".
  const img = await blobs(resolve(ROOT, file));
  if (!img.list.length) { console.log(`${file}: nothing segmented`); }
  else {
    const b = img.list.reduce((a, c) => (c.n > a.n ? c : a));
    const bins = new Map();
    let n = 0;
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      if (img.lab[x + y * img.W] !== b.id) continue;
      const i = (x + y * img.W) * img.ch;
      const k = nearest([img.data[i] / 255, img.data[i + 1] / 255, img.data[i + 2] / 255]).k;
      bins.set(k, (bins.get(k) || 0) + 1); n++;
    }
    const rows = [...bins.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 6);
    console.log(`${file.replace(/.*cell-/, "").replace(".png", "").padEnd(4)} ${b.w}x${b.h}px  ` +
      rows.map(([k, v]) => `${k} ${(100 * v / n).toFixed(0)}%`).join("  "));
  }
}
