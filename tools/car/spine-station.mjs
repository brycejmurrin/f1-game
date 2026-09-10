#!/usr/bin/env node
// Where does a spine design LAND, and does anything cover it?
// @doc Measures + rasterises where every spine design lands on the cover flank, and the crown's own mark — offline, no browser.
// @skill garage-parts-livery
//
// The placement question ("the flank logo sits a little low") used to cost a
// garage browser run: ~50 s to boot, ~35 s a shot, so seven designs was five
// minutes of SwiftShader for seven frames in which the mark is forty pixels
// wide. Almost all of that was spent rendering a pit garage in order to look at
// a decal.
//
// The atlas is canvas-2D code and the placement of a mark within its region is
// pure geometry, so it needs no rasteriser at all — only the one crest-sweep
// already wrote. This replays the REAL buildAtlas into that recording context,
// samples the flank region twice (with the design and with spineSide "none"),
// and reports the bbox of every pixel the design CHANGED. That is the design's
// own footprint, whatever painted it, with no per-design knowledge here.
//
// v is the axis the complaint is about: 0 is the shoulder crease, 1 the sidepod
// line. u runs 0 at the front of the flank (behind the airbox) to 1 at the rear.
// Both are the region's own frame, which is what liverytex.js authors in.
//
// The CROWN's own graphic on the flank is measured on the same terms, as the
// `(crown)` row: `wrap` hangs a bull (or, for a crest with no single traced
// animal, that team's badge) across the band, and it can sink behind the
// sidepod exactly as a side design can — the RB22's bull lost a third of its
// HEAD that way and nothing in the flank tooling could see it.
//
//   node tools/car/spine-station.mjs                      # every design, default team
//   node tools/car/spine-station.mjs --team=redbull       # under that team's crown
//   node tools/car/spine-station.mjs --team=all --logo=wrap --occlude   # the survey
//   node tools/car/spine-station.mjs --logo=wrap          # ...and a chosen crown
//   node tools/car/spine-station.mjs --png=artifacts/spine  # + a PNG per design
//   node tools/car/spine-station.mjs --json
//
// WHAT THIS CANNOT SEE, and when to shoot the garage instead: the flank is a
// curved band on a 3D car with a rear tyre beside it. A station this calls high
// and clear can still be half-eaten by the tyre from a side camera — measured
// on Red Bull, whose `wrap` pushes the mark aft into exactly that. Occlusion,
// foreshortening and lighting are the browser's to answer:
//   node tools/shot/garage-angles.mjs --team redbull --spine-side logo --views side --zoom 8 --pan 5,0
// Teams whose crest is a LOADED IMAGE draw through drawImage, which records no
// geometry — those fall back to the traced crest here, same box, different art.
// LETTERING RENDERS AS ITS METRIC BOX, not as glyphs: the recording context
// keeps fillText's rectangle. That is exact for placement (the box is the ink's
// true extent) and says NOTHING about legibility — cover-legibility.test.mjs
// and the garage own that.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { paintStackAt } from "./crest-sweep.mjs";
import { loadAtlas } from "./livery-contrast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GRID = 128;          // samples across the region's LONG axis
const CHANGED = 0.02;      // per-channel delta that counts as "the design painted here"

// An op's bounding box, computed once. The winding test walks every point of
// every subpath; skipping an op whose box misses the sample is the difference
// between a second and a minute over a 128-square grid.
function bbox(op) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of op.pts || []) for (const [x, y] of ring) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pad = (op.kind === "stroke" ? (op.lw || 1) : 0) / 2 + 1;
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

/** Ops that can touch the rect, in paint order, each with its box. */
function opsOver(ops, R) {
  const out = [];
  for (const op of ops) {
    const b = bbox(op);
    if (b[2] < R.x || b[0] > R.x + R.w || b[3] < R.y || b[1] > R.y + R.h) continue;
    out.push({ op, b });
  }
  return out;
}

const at = (cand, px, py, bg) =>
  paintStackAt(cand.filter((c) => px >= c.b[0] && px <= c.b[2] && py >= c.b[1] && py <= c.b[3])
    .map((c) => c.op), px, py, bg).rgb;

/**
 * Sample a region on a grid; returns { w, h, rgb: Float64Array }.
 * `bg` is the COVER PAINT, not white: buildAtlas leaves the cover bare and the
 * mesh supplies its colour, so an unpainted atlas pixel is the cover. Rendered
 * on white, every design reads as high-contrast art on a panel that does not
 * exist — which is the flattery the skill file warns an atlas crop gives.
 */
function sampleRegion(ops, R, grid, bg) {
  const w = Math.max(2, Math.round(grid * Math.min(1, R.w / Math.max(R.w, R.h))) || grid);
  const h = Math.max(2, Math.round(w * R.h / R.w));
  const cand = opsOver(ops, R);
  const rgb = new Float64Array(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = at(cand, R.x + R.w * (i + 0.5) / w, R.y + R.h * (j + 0.5) / h, bg);
    const k = (j * w + i) * 3;
    rgb[k] = c[0]; rgb[k + 1] = c[1]; rgb[k + 2] = c[2];
  }
  return { w, h, rgb };
}

/**
 * The station one design occupies, as the box of everything it CHANGED against
 * the same livery wearing spineSide "none".
 * `frontLeft` is flankFrame's: on the RIGHT flank canvas-left is the REAR.
 */
export function station(base, design, frontLeft, hiddenAt) {
  const { w, h } = base;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, n = 0, dark = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 3;
    const d = Math.abs(base.rgb[k] - design.rgb[k]) + Math.abs(base.rgb[k + 1] - design.rgb[k + 1])
            + Math.abs(base.rgb[k + 2] - design.rgb[k + 2]);
    if (d < CHANGED) continue;
    n++;
    const cx = (i + 0.5) / w, v = (j + 0.5) / h;
    const u = frontLeft ? cx : 1 - cx;
    if (u < u0) u0 = u; if (u > u1) u1 = u;
    if (v < v0) v0 = v; if (v > v1) v1 = v;
    // Over the design's OWN INK, not its bounding box: a wordmark's box spans
    // the flank while its letters are a strip, and the tyre covers a station,
    // not a rectangle.
    if (hiddenAt && hiddenAt(u, v)) dark++;
  }
  if (!n) return null;
  return {
    px: n, share: +(n / (w * h)).toFixed(3),
    u0: +u0.toFixed(3), u1: +u1.toFixed(3),
    v0: +v0.toFixed(3), v1: +v1.toFixed(3), vMid: +((v0 + v1) / 2).toFixed(3),
    ...(hiddenAt ? { hidden: +(dark / n).toFixed(3) } : {}),
  };
}

/** Region sample → PNG, upscaled nearest so a 300 px band is readable. */
export async function writePng(s, file, scale) {
  const buf = Buffer.alloc(s.w * s.h * 3);
  for (let i = 0; i < s.w * s.h * 3; i++) buf[i] = Math.round(Math.max(0, Math.min(1, s.rgb[i])) * 255);
  await sharp(buf, { raw: { width: s.w, height: s.h, channels: 3 } })
    .resize(s.w * scale, s.h * scale, { kernel: "nearest" })
    .png().toFile(file);
}

// The crown's flank graphic, sampled with NO side design, so everything in the
// region belongs to the crown — and then the SUN dropped, as the one thing the
// crown paints there that is a field rather than a mark. Translucency is what
// separates them and it is the painter's own distinction, not a guess: the wrap
// lays its disc at alpha 0.97 (cssA) and every mark, traced bull or yielded
// badge, is opaque css(). Filtering on the fill RULE instead looked tidier and
// silently measured nothing for the two teams whose crest paints nonzero.
const alphaOf = (s) => { const m = /rgba\([^)]*,\s*([\d.]+)\)/.exec(s || ""); return m ? +m[1] : 1; };
const markOps = (ops) => ops.filter((o) => alphaOf(o.style) >= 1);

export function sweep(A, { team, logo, sides, grid = GRID, hiddenAt = null, fields = null, livery = null }) {
  const t = A.Teams.LIST.find((x) => x.id === team);
  if (!t) throw new Error(`no team "${team}" (have ${A.Teams.LIST.map((x) => x.id).join(",")})`);
  // `livery` names a catalog paint job to sweep instead of the team default;
  // `fields` are extra livery fields (a garage-angles design) painted on top —
  // the flat art then matches the lit frame the tool shot, tint rows included.
  const list = A.Liveries.forTeam(t);
  const liv = Object.assign({}, (livery && list.find((l) => l.id === livery)) || list[0], fields || {});
  const spineLogo = logo || liv.spineLogo;
  const R = A.LT.REGIONS.spineSide;
  const cover = liv.cover || liv.c1 || [0.1, 0.1, 0.12];
  const opsOf = (spineSide) => A.paint(t.id, Object.assign({}, liv, { spineLogo, spineSide }));
  const of = (spineSide) => sampleRegion(opsOf(spineSide), R, grid, cover);
  const base = of("none");
  // Against BARE COVER, not against `base`: the crown's own mark is IN base, so
  // diffing it against base would report an empty footprint.
  const bare = sampleRegion([], R, grid, cover);
  const crown = station(bare, sampleRegion(markOps(opsOf("none")), R, grid, cover), false, hiddenAt);
  return {
    team: t.id, spineLogo, cover, region: { w: R.w, h: R.h }, crown,
    // FLANK is the region's car-space map: v 0 is the crease at s 0.21 m down
    // the skin, v 1 the sidepod line at sTop + sLen.
    crease: A.LT.FLANK.sTop, sidepod: +(A.LT.FLANK.sTop + A.LT.FLANK.sLen).toFixed(3),
    base,
    rows: sides.map((spineSide) => {
      const s = of(spineSide);
      return { spineSide, sample: s, ...(station(base, s, false, hiddenAt) || { px: 0 }) };
    }),
  };
}

const row = (name, r, om) => {
  if (!r || !r.px) return `  ${name.padEnd(10)}  (paints nothing on this crown)`;
  const note = [r.v0 <= 0.02 ? "crease" : "", r.v1 >= 0.98 ? "sidepod" : "",
    r.vMid > 0.6 ? "low" : "", r.hidden >= 0.5 ? "MOSTLY HIDDEN" : ""].filter(Boolean).join("+") || "clear";
  return `  ${name.padEnd(10)} ${r.u0.toFixed(2)}  ${r.u1.toFixed(2)}   `
    + `${r.v0.toFixed(2)}  ${r.v1.toFixed(2)}  ${r.vMid.toFixed(2)}  ${r.share.toFixed(2)}`
    + (om ? `  ${(r.hidden * 100).toFixed(0).padStart(5)}%` : "") + `   ${note}`;
};

async function main() {
  const arg = (k, d) => { const h = process.argv.find((a) => a.startsWith(`--${k}=`)); return h ? h.slice(k.length + 3) : d; };
  const A = loadAtlas();
  const pick = arg("team", "mclaren");
  // The SURVEY: one crown across the grid. The occlusion map is per team (the
  // parts a team runs move the body), so it is rebuilt per team, not hoisted.
  const teams = pick === "all" ? A.Teams.LIST.map((t) => t.id) : [pick];
  const sides = (arg("side", "") || A.LT.SPINE_SIDE_IDS.filter((s) => s !== "none").join(",")).split(",");
  const dir = arg("png", null);
  for (const team of teams) {
    // --occlude answers the OTHER half in the same run: flank-occlusion projects
    // the real body and wheels through the garage SIDE camera, so a design that
    // lands well and is covered anyway reports as covered instead of clean.
    let hiddenAt = null, om = null;
    if (process.argv.includes("--occlude")) {
      const [{ loadParts }, occl] = await Promise.all([import("./parts-sweep.mjs"), import("./flank-occlusion.mjs")]);
      om = occl.occlusionMap(loadParts(), { team, grid: 96 });
      hiddenAt = (u, v) => om.cell[Math.min(om.rows - 1, (v * om.rows) | 0) * om.cols
                                   + Math.min(om.cols - 1, (u * om.cols) | 0)] === 1;
    }
    const out = sweep(A, { team, logo: arg("logo", null), sides, grid: +arg("grid", GRID), hiddenAt });
    if (dir) {
      const d = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
      fs.mkdirSync(d, { recursive: true });
      const scale = +arg("scale", 3);
      await writePng(out.base, path.join(d, `${team}-${out.spineLogo}-none.png`), scale);
      for (const r of out.rows) await writePng(r.sample, path.join(d, `${team}-${out.spineLogo}-${r.spineSide}.png`), scale);
    }
    for (const r of out.rows) delete r.sample;
    delete out.base;
    if (process.argv.includes("--json")) { console.log(JSON.stringify(out, null, 1)); continue; }
    console.log(`${out.team} crown=${out.spineLogo}  flank region ${out.region.w}x${out.region.h} px`);
    console.log(`  v 0 = shoulder crease (s ${out.crease} m), 1 = sidepod line (s ${out.sidepod} m)`);
    console.log("  u 0 = front of the flank, 1 = rear. crease/sidepod = the ink crosses that");
    console.log("  boundary — what a full-flank BAND is for, and what a MARK must not do.");
    console.log(`  design      u0    u1     v0    v1   vMid  share${om ? "  hidden" : ""}  note`);
    // The crown's own graphic first: every SIDE row is placed against it.
    console.log(row("(crown)", out.crown, om));
    for (const r of out.rows) console.log(row(r.spineSide, r, om));
    if (om) console.log("  hidden = the share of the design's OWN INK behind the car from the garage SIDE camera");
    if (dir) console.log(`  PNGs -> ${dir}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
