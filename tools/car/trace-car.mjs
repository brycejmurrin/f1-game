#!/usr/bin/env node
// @doc Trace the ISOLATED car into SVG: carview beauty + empty-stage plate -> exact matte -> contours + interior edges.
//   node tools/car/trace-car.mjs [--az=180] [--el=16] [--dist=9] [--team=ferrari] [--out=file.json]
//     [--viewport=900x1200] [--look=0] [--looky=0] [--box=300x420] [--png] [--simplify=1.4]
//     [--bands=4]  luminance steps posterised inside the matte, so the drawing can be shaded, not just cut out
//     [--edge=42]  Sobel cut for interior lines: lower draws more panel detail, higher only the hard creases
//     [--mindetail=10]  drop interior loops shorter than this many vertices (dither crumbs)
// @skill garage-parts-livery
//
// WHY THIS EXISTS. Every earlier attempt traced a GARAGE PHOTO and tried to
// separate car from floor by brightness or saturation. That cannot work: an F1
// car's front wing, rear wing and diffuser are matte black, the garage floor
// and pit box are dark grey, and no threshold splits them. A cut high enough to
// keep the wings swallowed the pit wall; a cut low enough to lose the garage
// lost the wings. Hole filling could not rescue it either — from behind you see
// UNDER the rear wing to the floor beyond, so the diffuser bay is not an
// enclosed hole. Each fix traded one missing part for another.
//
// THE MATTE IS A DIFFERENCE, NOT A THRESHOLD. tools/carview.html renders the
// car alone on a plain backdrop with no floor at all, and ?hidecar=1 renders
// the identical camera and lighting with the car omitted. Subtract the two:
// every pixel the car touched differs, every pixel it did not is identical.
// Black bodywork against a dark backdrop still differs from that backdrop, so
// nothing drops out, and there is no floor in either frame to exclude. The
// matte is exact by construction rather than by tuning.
//
// EDGES COME FROM THE BEAUTY PASS, INSIDE THE MATTE. The silhouette alone reads
// as a cut-out; what makes a drawing read is the interior line — wing elements,
// the floor edge, the pod shoulder. A Sobel gradient over the lit frame, masked
// to the matte, gives those without any risk of picking up the backdrop.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, startStaticServer } from "../lib/harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${k}=`));
  return hit === undefined ? d : hit.slice(k.length + 3);
};
const flag = (k) => process.argv.slice(2).includes(`--${k}`);
const [VW, VH] = String(arg("viewport", "900x1200")).split("x").map(Number);
const [BW, BH] = String(arg("box", "300x420")).split("x").map(Number);
const OUT = path.resolve(ROOT, arg("out", "artifacts/car-trace/trace.json"));
const SIMPLIFY = Number(arg("simplify", "1.4"));

// ------------------------------------------------------------------ capture
async function capture() {
  const server = await startStaticServer(ROOT);
  const browser = await launchChromium();
  try {
    const page = await browser.newPage({ viewport: { width: VW, height: VH } });
    const q = new URLSearchParams({
      team: arg("team", "ferrari"), az: arg("az", "180"), el: arg("el", "16"),
      dist: arg("dist", "9"), look: arg("look", "0"), looky: arg("looky", "0"),
      rig: arg("rig", "3point"), tod: arg("tod", "day"), exp: arg("exp", "1"),
      hud: "0", refl: arg("refl", "0.15"),
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e.message)));
    await page.goto(`${server.url}tools/carview.html?${q}`, { waitUntil: "load" });
    await page.waitForFunction(() => typeof window.CARVIEW !== "undefined", null, { polling: 100 })
      .catch(() => { throw new Error("carview never defined CARVIEW: " + (errs.join(" | ") || "no page error")); });
    await page.waitForFunction(() => window.CARVIEW && window.CARVIEW.ready, null, { polling: 100 });
    const shoot = async (hideCar) => {
      await page.evaluate((h) => window.CARVIEW.set({ hideCar: h }), hideCar);
      // Let the loop turn over several times: the soft overlay blits one frame
      // behind, and the env probe re-bakes when the scene changes.
      await page.waitForFunction((n) => window.CARVIEW.frame > n,
        await page.evaluate(() => window.CARVIEW.frame + 6), { polling: 100 });
      return page.evaluate(() => {
        const c = document.getElementById("game-soft") || document.getElementById("view");
        const o = document.createElement("canvas");
        o.width = c.width; o.height = c.height;
        o.getContext("2d").drawImage(c, 0, 0);
        return { w: o.width, h: o.height, data: [...o.getContext("2d").getImageData(0, 0, o.width, o.height).data] };
      });
    };
    return { car: await shoot(false), plate: await shoot(true) };
  } finally {
    await browser.close();
    await server.close();
  }
}

// -------------------------------------------------------------------- matte
/** Every pixel the car touched, as a 0/1 mask. The threshold is a NOISE floor
 *  (SwiftShader dithers), not a segmentation cut — the signal it separates is
 *  "this pixel changed" against "it did not", which is 0 or large. */
function matte(car, plate, cut = 10) {
  const n = car.w * car.h, m = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const d = Math.abs(car.data[j] - plate.data[j])
            + Math.abs(car.data[j+1] - plate.data[j+1])
            + Math.abs(car.data[j+2] - plate.data[j+2]);
    if (d > cut) m[i] = 1;
  }
  return m;
}
/** Drop specks the renderer's dither left outside the car, and close pinholes
 *  inside it — both are one-pixel noise, so one open/close pass settles it. */
function despeckle(m, w, h) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y*w + x]);
  const pass = (src, keep) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += at(x+dx, y+dy);
      out[y*w + x] = keep(src[y*w + x], n);
    }
    return out;
  };
  m = pass(m, (v, n) => (v && n >= 3 ? 1 : 0));        // open: lone specks go
  const src = m;
  m = pass(m, (v, n) => (v || n >= 6 ? 1 : 0));        // close: pinholes fill
  void src;
  return m;
}

// ------------------------------------------------------------------ contour
/** Moore border following over the mask: every closed outline, outer and inner,
 *  so a hole in the bodywork (the halo's gap, the wing slots) stays a hole. */
function contours(m, w, h) {
  const seen = new Uint8Array(m.length);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y*w + x]);
  const DIR = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!at(x, y) || seen[y*w + x] || at(x, y-1)) continue;
    const loop = [];
    let cx = x, cy = y, dir = 6, guard = 0;
    do {
      loop.push([cx, cy]);
      seen[cy*w + cx] = 1;
      let found = false;
      for (let k = 0; k < 8; k++) {
        const d = (dir + 5 + k) % 8, [dx, dy] = DIR[d];
        if (at(cx + dx, cy + dy)) { cx += dx; cy += dy; dir = d; found = true; break; }
      }
      if (!found) break;
    } while ((cx !== x || cy !== y) && ++guard < 4 * m.length);
    if (loop.length > 24) out.push(loop);
  }
  return out;
}
/** Ramer-Douglas-Peucker. A traced border is one vertex per pixel; the curve
 *  fitter downstream needs a POLYGON, and feeding it pixel steps makes every
 *  vertex read as a corner. */
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a] = pts, b = pts[pts.length - 1];
  let far = 0, fi = 0;
  const dx = b[0]-a[0], dy = b[1]-a[1], len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0]-a[0])*dy - (pts[i][1]-a[1])*dx) / len;
    if (d > far) { far = d; fi = i; }
  }
  if (far <= eps) return [a, b];
  return rdp(pts.slice(0, fi + 1), eps).slice(0, -1).concat(rdp(pts.slice(fi), eps));
}

// -------------------------------------------------------------------- edges
/** Sobel over the lit frame's luminance, kept only where the matte says car.
 *  Interior panel lines, with no way to pick up the backdrop. */
function edges(car, m, w, h, cut = Number(arg("edge", "42"))) {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    lum[i] = 0.299*car.data[j] + 0.587*car.data[j+1] + 0.114*car.data[j+2];
  }
  const e = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y*w + x;
    if (!m[i]) continue;
    const L = (dx, dy) => lum[(y+dy)*w + (x+dx)];
    const gx = -L(-1,-1) - 2*L(-1,0) - L(-1,1) + L(1,-1) + 2*L(1,0) + L(1,1);
    const gy = -L(-1,-1) - 2*L(0,-1) - L(1,-1) + L(-1,1) + 2*L(0,1) + L(1,1);
    if (Math.hypot(gx, gy) > cut) e[i] = 1;
  }
  return e;
}

// -------------------------------------------------------------------- bands
/** The lit frame posterised into n luminance steps INSIDE the matte, each step
 *  a set of closed loops. This is what lets the drawing be SHADED rather than a
 *  cut-out: the flank drawing in tools/gen/title-art.mjs lights its faces from
 *  their normals and paints four tone bands; a trace has no normals, but the
 *  renderer already lit the car, so its luminance carries the same information.
 *  Bands are cumulative (band k = at least this bright) so stacking them at
 *  equal opacity ramps the tone without seams between neighbouring steps. */
function bands(car, m, w, h, n) {
  const lum = new Float32Array(w * h);
  let lo = 255, hi = 0;
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    lum[i] = 0.299*car.data[j] + 0.587*car.data[j+1] + 0.114*car.data[j+2];
    if (m[i]) { if (lum[i] < lo) lo = lum[i]; if (lum[i] > hi) hi = lum[i]; }
  }
  // Steps sit on the car's OWN range, not 0..255: a dark livery would otherwise
  // land in one band and shade flat.
  const out = [];
  for (let k = 1; k < n; k++) {
    const cut = lo + (hi - lo) * (k / n);
    let mk = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mk[i] = m[i] && lum[i] >= cut ? 1 : 0;
    mk = despeckle(mk, w, h);
    out.push(contours(mk, w, h).filter((c) => c.length > 40).map((c) => rdp(c, SIMPLIFY * 1.3)));
  }
  return out;
}

// --------------------------------------------------------------------- main
const { car, plate } = await capture();
const w = car.w, h = car.h;
let m = despeckle(matte(car, plate), w, h);
const lit = Array.from(m).reduce((a, b) => a + b, 0);
if (!lit) {
  console.error("trace-car: the two frames are identical — the car never drew.\n"
    + "  Check tools/carview.html loads (its own probe: CARVIEW.ready) before blaming the matte.");
  process.exit(1);
}
// The car's own bounding box, mapped into the requested box. Nothing else is in
// frame, so this needs no guard about which blob is the subject.
let x0 = w, x1 = 0, y0 = h, y1 = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y*w + x]) {
  if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
}
const s = Math.min(BW / (x1 - x0 + 1), BH / (y1 - y0 + 1));
const map = ([x, y]) => [
  Math.round((x - x0) * s + (BW - (x1 - x0 + 1) * s) / 2),
  Math.round((y - y0) * s + (BH - (y1 - y0 + 1) * s) / 2),
];
const outline = contours(m, w, h).map((c) => rdp(c, SIMPLIFY).map(map));
const NB = Number(arg("bands", "4"));
const tone = bands(car, m, w, h, NB).map((step) => step.map((c) => c.map(map)));
const detail = contours(edges(car, m, w, h), w, h).map((c) => rdp(c, SIMPLIFY).map(map));
const json = {
  generator: "tools/car/trace-car.mjs",
  camera: { az: +arg("az", "180"), el: +arg("el", "16"), dist: +arg("dist", "9") },
  box: [BW, BH], source: [w, h], coverage: +(lit / (w * h)).toFixed(4),
  outline: outline.filter((c) => c.length > 6),
  tone,
  detail: detail.filter((c) => c.length > Number(arg("mindetail", "10"))),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(json));
console.log(`trace-car: ${json.outline.length} outline loops, ${json.detail.length} detail loops, `
  + `${NB - 1} tone bands, `
  + `${(json.coverage * 100).toFixed(1)}% of frame -> ${path.relative(ROOT, OUT)}`);

if (flag("png")) {
  const svg = path.join(path.dirname(OUT), "trace.svg");
  const d = (cs) => cs.map((c) => "M" + c.map((p) => p.join(" ")).join(" L") + " Z").join(" ");
  fs.writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BW} ${BH}">`
    + `<rect width="${BW}" height="${BH}" fill="#111"/>`
    + `<path d="${d(json.outline)}" fill="#666" fill-rule="evenodd"/>`
    + json.tone.map((step) => `<path d="${d(step)}" fill="#fff" fill-opacity="0.22" fill-rule="evenodd"/>`).join("")
    + `<path d="${d(json.detail)}" fill="none" stroke="#e33" stroke-width="0.7"/></svg>`);
  console.log(`trace-car: preview -> ${path.relative(ROOT, svg)}`);
}
