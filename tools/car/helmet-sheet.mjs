#!/usr/bin/env node
// helmet-sheet — a contact sheet of every driver's helmet design.
// @doc Rasterises each js/car/helmets.js design onto a shaded sphere and writes a labelled contact sheet PNG (`--only`, `--view`, `--cell`).
// @skill playwright-probe
//
//   node tools/car/helmet-sheet.mjs                  # all 22, front-3/4
//   node tools/car/helmet-sheet.mjs --view=front,side,rear,top
//   node tools/car/helmet-sheet.mjs --only=44,1,33 --cell=220
//
// No browser and no 3D pipeline: the designs are pure functions of (latitude,
// azimuth), so the honest preview is to march the same painter over a sphere
// and shade it. One second for the whole grid, against ~90 s for a single
// in-game shot on this box's software renderer — which is what makes it
// possible to actually ITERATE on a design rather than admire one render.
//
// It previews the PAINT, not the car: the dome here is a whole sphere at a
// fixed light, where the game shows the top two thirds of one inside a halo,
// lit by the circuit. Judge the design here; judge whether it READS in-game
// (tools/shot/shot.mjs, a chase or cockpit view).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const flag = (name, dflt) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const Helmets = new Function(readFileSync(resolve(ROOT, "js/car/helmets.js"), "utf8") + "; return Helmets;")();
const Teams = new Function(readFileSync(resolve(ROOT, "js/data/teams.js"), "utf8") + "; return Teams;")();

// number -> { code, name, team, teamC } for the label and the blend check
const ROSTER = new Map();
for (const t of Teams.LIST) for (const d of t.drivers) ROSTER.set(d.num, { code: d.code, name: d.name, team: t.short, teamC: t.color });

// Camera azimuths: which way the helmet faces the viewer. 0 puts the nose at
// the centre of the disc, 90 shows the driver's right temple.
const VIEWS = { front: 0, side: 90, rear: 180, left: 270, quarter: 40, top: null };
const views = String(flag("view", "quarter")).split(",").map((v) => v.trim()).filter((v) => v in VIEWS);
const cell = Math.max(80, parseInt(flag("cell", "200"), 10) || 200);
const only = String(flag("only", "")).split(",").map((s) => s.trim()).filter(Boolean).map(Number);
const nums = (only.length ? only : Object.keys(Helmets.DESIGNS).map(Number).sort((a, b) => a - b));

// A directional light over the viewer's left shoulder, plus a little ambient
// so the unlit side keeps its colour instead of going to black.
const LIGHT = (() => { const v = [-0.45, 0.75, 0.5]; const m = Math.hypot(...v); return v.map((x) => x / m); })();
const AMB = 0.45, BG = [0.10, 0.11, 0.13];

/* One helmet, orthographic, `camAz` degrees around it, seen from EL above.
   The shell is js/car/helmets.js's own surface — an ovoid with a chin bar —
   so this previews the shape the car actually carries, not a sphere standing
   in for it. `Helmets.pointAt` gives a point for any (t, azimuth), and the
   profile's height is monotonic, so "is this point inside the shell?" is: find
   the ring at that height, ask the profile how wide it is there, compare. A
   short ray march down that test finds the surface; a second difference of it
   gives the normal.  */
const EL = 16;
const SH = Helmets.SHAPE;
const tab = (arr, t) => {
  const T = SH.T;
  if (t <= T[0]) return arr[0];
  for (let i = 1; i < T.length; i++) if (t <= T[i]) return arr[i - 1] + (arr[i] - arr[i - 1]) * ((t - T[i - 1]) / (T[i] - T[i - 1]));
  return arr[arr.length - 1];
};
// height -> the profile parameter at that height (Y descends, so bisect)
function tAtY(y) {
  let lo = 0, hi = 1;
  if (y >= tab(SH.Y, 0)) return 0;
  if (y <= tab(SH.Y, 1)) return 1;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (tab(SH.Y, m) > y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// >0 inside the shell, in the same units the profile uses. The shell is a
// FLAT CUT at both ends — a helmet stops at the neck — so anything above the
// crown or below the rim is outside, not an extension of the end ring (which
// drew a stalk out of the top of every preview).
function inside(p) {
  const Y = SH.Y;
  if (p[1] > Y[0] || p[1] < Y[Y.length - 1]) return -1;
  const t = tAtY(p[1]);
  const a = Math.atan2(p[0], p[2]);
  const on = Helmets.pointAt(t, a);
  const rOn = Math.hypot(on[0], on[2]), rP = Math.hypot(p[0], p[2]);
  return rOn - rP;
}

function drawHelmet(design, size, camAz) {
  const px = Buffer.alloc(size * size * 3);
  const skin = Helmets.shell(design);
  const R = 0.185;                                   // the box the helmet lives in
  const scale = R / (size * 0.46), cx = size / 2, cy = size * 0.50;
  const az0 = (camAz == null ? 0 : camAz) * Math.PI / 180;
  const el = (camAz == null ? 88 : EL) * Math.PI / 180;
  const ca = Math.cos(az0), sa = Math.sin(az0), ce = Math.cos(el), se = Math.sin(el);
  // camera basis: forward into the screen, right, up — rotated by az then el
  const fwd = [-Math.sin(az0) * ce, -se, -Math.cos(az0) * ce];
  const right = [Math.cos(az0), 0, -Math.sin(az0)];
  const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x - cx) * scale, v = -(y - cy) * scale;
      let p = add(add([0, 0, 0], right, u), up, v);
      p = add(p, fwd, -0.42);                        // start well outside
      let hit = null;
      for (let st = 0; st < 150; st++) {
        p = add(p, fwd, 0.0056);
        if (inside(p) > 0) { hit = p; break; }
      }
      let col = BG, shade = 1;
      if (hit) {
        const e = 0.0015;
        const n = [inside([hit[0] + e, hit[1], hit[2]]) - inside([hit[0] - e, hit[1], hit[2]]),
                   inside([hit[0], hit[1] + e, hit[2]]) - inside([hit[0], hit[1] - e, hit[2]]),
                   inside([hit[0], hit[1], hit[2] + e]) - inside([hit[0], hit[1], hit[2] - e])];
        const m = Math.hypot(...n) || 1;
        const nrm = [-n[0] / m, -n[1] / m, -n[2] / m];
        const t = tAtY(hit[1]);
        const az = (Math.atan2(hit[0], hit[2]) * 180 / Math.PI + 360) % 360;
        const sk = skin(Math.min(1, Math.max(0, t)), az);
        col = sk.c;
        const lam = Math.max(0, nrm[0] * LIGHT[0] + nrm[1] * LIGHT[1] + nrm[2] * LIGHT[2]);
        shade = AMB + (1 - AMB) * lam;
        if (sk.glass) shade = 0.5 + 1.9 * Math.pow(lam, 14);
      }
      const i = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(255 * Math.pow(Math.max(0, Math.min(1, col[c] * shade)), 1 / 2.2));
    }
  }
  return sharp(px, { raw: { width: size, height: size, channels: 3 } });
}

const label = (text, sub, w, h) => Buffer.from(
  `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
     <text x="${w / 2}" y="${h * 0.42}" font-family="DejaVu Sans, sans-serif" font-size="${Math.round(h * 0.42)}"
           font-weight="700" fill="#e8e8ea" text-anchor="middle">${text}</text>
     <text x="${w / 2}" y="${h * 0.88}" font-family="DejaVu Sans, sans-serif" font-size="${Math.round(h * 0.32)}"
           fill="#8b8d94" text-anchor="middle">${sub}</text>
   </svg>`);

const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(nums.length))));
const rows = Math.ceil(nums.length / cols);
const lab = Math.round(cell * 0.20), pad = Math.round(cell * 0.06);
const tileW = cell * views.length + pad * 2, tileH = cell + lab + pad;
const W = cols * tileW, H = rows * tileH;

const composites = [];
for (let i = 0; i < nums.length; i++) {
  const num = nums[i];
  const who = ROSTER.get(num);
  let design = Helmets.designFor(num, who && who.teamC);
  // --plain strips the paint: judging the SHELL through a design's own stripes
  // is how a black centre stripe gets mistaken for the visor aperture.
  if (flag("plain", "")) design = { name: design.name, base: [0.80, 0.80, 0.83], visor: [0.07, 0.07, 0.09], zones: [] };
  const gx = (i % cols) * tileW, gy = Math.floor(i / cols) * tileH;
  for (let v = 0; v < views.length; v++) {
    const img = await drawHelmet(design, cell, VIEWS[views[v]]).png().toBuffer();
    composites.push({ input: img, left: gx + pad + v * cell, top: gy + pad });
  }
  const name = who ? `${who.code} ${num}` : `#${num}`;
  const sub = (who ? who.team : "generated") + (design.shifted ? " · lifted off the car" : "");
  composites.push({ input: label(name, sub, tileW, lab), left: gx, top: gy + pad + cell });
}

const outDir = resolve(ROOT, "scratch", "renders");
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, flag("out", "helmet-sheet.png"));
const png = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 20, g: 21, b: 25 } } })
  .composite(composites).png().toBuffer();
writeFileSync(out, png);
console.log(`${nums.length} helmets × ${views.join("/")} -> ${out} (${(png.length / 1024).toFixed(0)} KB)`);
