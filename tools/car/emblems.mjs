#!/usr/bin/env node
// Build the eleven ORIGINAL team emblems that js/car/crest-paths.js ships.
// @doc Author-time: builds the ORIGINAL team emblems in `js/car/crest-paths.js` from geometric primitives (no traced logos).
// @skill garage-parts-livery
//
// AUTHOR-TIME ONLY. The game never runs this; it reads the generated file.
//
// WHY THESE ARE CONSTRUCTED AND NOT TRACED. Apex 26 is an unofficial fan game.
// The crests used to be silhouettes traced from the real team logos (the
// prancing horse, the charging bulls, the speedmark, the three-pointed star,
// the four rings ...), and a traced trademark is still the trademark. Every
// emblem below is an ORIGINAL design that only EVOKES its team — its colours and
// a theme — out of circles, polygons and tapered strokes, so the whole authoring
// surface is the forty-odd lines of numbers in EMBLEMS and nothing is read from
// an image. Do not reintroduce a traced or redrawn real mark here: a new emblem
// is a new design, reviewed as one (render it with --png and look at it).
//
// The output contract is the one LiveryTex.crestTraced already reads, so no
// painter changed when the art did:
//   { roles, d }  d holds SVG-style path strings BACK TO FRONT, each filled
//                 separately with the evenodd rule (so a loop inside a loop is a
//                 counter); roles[i] names the markPalette colour of layer i:
//                 "mark" the dominant shape, "part" a same-ink island the LOGO
//                 DETAIL row can recolour, "alt" a second colour, "plate" a
//                 backing the mark sits on.
//   Coordinates are in the 0..1 fit box (fit() in js/car/liverytex.js) and only
//   M/L/Z are emitted, so tracePath needs no curve support.
// Two structural rules the livery code leans on, kept here on purpose:
//   - Red Bull is exactly TWO "mark" layers, mirror images, with the sun as the
//     authored CREST_DISC behind them. The `wrap` design hangs layer 1 down each
//     engine-cover flank (LiveryTex.bullPath), front = its low-x end, and the
//     crown carries that layer's TOP edge — so its high point sits at the front.
//     No other team may be exactly two "mark" layers, or it grows a flank horn.
//   - Ferrari keeps a "plate" layer (the badge keeps its backing on the fin),
//     and at least one team has a "part" island (the LOGO DETAIL row's slot).
//
//   node tools/car/emblems.mjs                print a per-layer summary
//   node tools/car/emblems.mjs --write        regenerate js/car/crest-paths.js
//   node tools/car/emblems.mjs --check        exit 1 if the file has drifted
//   node tools/car/emblems.mjs --png=artifacts/emblems   contact sheet + one PNG per team
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "js/car/crest-paths.js");
const TAU = Math.PI * 2;

// ── primitives: every shape is a list of closed loops of [x, y] ─────────────
const lerp = (a, b, t) => a + (b - a) * t;
function circle(cx, cy, r, n = 64, ry = r) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]); }
  return out;
}
function regular(cx, cy, R, n, rot = 0) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; out.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
  return out;
}
function star(cx, cy, Ro, Ri, n, rot = -Math.PI / 2) {
  const out = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU, r = i % 2 ? Ri : Ro;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
function roundRect(x, y, w, h, r, seg = 10) {
  const out = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * (Math.PI / 2); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return out;
}
function bezier(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
              u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
// A stroke of varying half-width along a centreline: the outline of a horn, a
// spiral arm, a blade. halfW(t) for t 0..1 along the line. `roundStart` caps
// the start with a half-disc instead of a square cut.
function taper(line, halfW, roundStart) {
  const L = [], Rt = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    const w = halfW(i / (line.length - 1));
    L.push([line[i][0] + nx * w, line[i][1] + ny * w]);
    Rt.push([line[i][0] - nx * w, line[i][1] - ny * w]);
  }
  const out = L.concat(Rt.reverse());
  if (roundStart) {
    // From the start's right edge round the BACK of the line to its left edge.
    const [cx, cy] = line[0], w = halfW(0);
    const a0 = Math.atan2(out[out.length - 1][1] - cy, out[out.length - 1][0] - cx);
    const back = Math.atan2(line[0][1] - line[1][1], line[0][0] - line[1][0]);
    const turn = Math.sign(Math.sin(back - a0)) || 1;   // the way that passes `back`
    for (let i = 1; i < 12; i++) { const a = a0 + turn * (i / 12) * Math.PI; out.push([cx + Math.cos(a) * w, cy + Math.sin(a) * w]); }
  }
  return out;
}
// Shrink a CONVEX polygon by d on every edge — the gap between two facets.
function inset(poly, d) {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % n]; area += x0 * y1 - x1 * y0; }
  const s = area > 0 ? 1 : -1;   // which side is inside
  const lines = [];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = (-(y1 - y0) / len) * s, ny = ((x1 - x0) / len) * s;   // inward normal
    lines.push([[x0 + nx * d, y0 + ny * d], [x1 + nx * d, y1 + ny * d]]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const [a, b] = lines[(i + n - 1) % n], [c, e] = lines[i];
    const d1 = [b[0] - a[0], b[1] - a[1]], d2 = [e[0] - c[0], e[1] - c[1]];
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    const t = ((c[0] - a[0]) * d2[1] - (c[1] - a[1]) * d2[0]) / den;
    out.push([a[0] + d1[0] * t, a[1] + d1[1] * t]);
  }
  return out;
}
const map = (loops, f) => loops.map((loop) => loop.map(([x, y]) => f(x, y)));
const mirrorX = (loops, cx) => map(loops, (x, y) => [2 * cx - x, y]).map((l) => l.reverse());

// ── the emblems ─────────────────────────────────────────────────────────────
// Each returns { roles, layers } where layers[i] is a list of loops. Loops in
// one layer must not overlap except as a deliberate counter (evenodd).
const EMBLEMS = {
  // SILVER ARROW — an arrow in flight: a notched dart on a shaft (mark) with two
  // speed streaks trailing it (part). Not a star, not a ring.
  mercedes: () => {
    const arrow = [[0.98, 0.5], [0.6, 0.23], [0.66, 0.455], [0.3, 0.455], [0.3, 0.545], [0.66, 0.545], [0.6, 0.77]];
    const streak = (y, x0, x1) => [[x0 + 0.03, y - 0.035], [x1 + 0.03, y - 0.035], [x1, y + 0.035], [x0, y + 0.035]];
    return { roles: ["part", "mark"],
             layers: [[streak(0.34, 0.02, 0.44), streak(0.66, 0.08, 0.44)], [arrow]] };
  },

  // HORSESHOE — the stable (the Scuderia) without the horse: a black shoe on a
  // yellow tile. The tile is the `plate`, so the fin badge keeps it.
  ferrari: () => {
    const plate = roundRect(0.04, 0.04, 0.92, 0.92, 0.17);
    const cx = 0.5, cy = 0.53, ox = 0.3, oy = 0.31, ix = 0.17, iy = 0.18;
    const a0 = (-90 + 38) * Math.PI / 180, a1 = (270 - 38) * Math.PI / 180, n = 48;
    const outer = [], inner = [];
    for (let i = 0; i <= n; i++) {
      const a = lerp(a0, a1, i / n);
      outer.push([cx + Math.cos(a) * ox, cy + Math.sin(a) * oy]);
      inner.push([cx + Math.cos(a) * ix, cy + Math.sin(a) * iy]);
    }
    const shoe = outer.concat(inner.reverse());
    // Six nail holes on the shoe's mid-line, three a side.
    const holes = [];
    for (const deg of [-12, 30, 72, 108, 150, 192]) {
      const a = deg * Math.PI / 180;
      holes.push(circle(cx + Math.cos(a) * (ox + ix) / 2, cy + Math.sin(a) * (oy + iy) / 2, 0.024, 16));
    }
    return { roles: ["plate", "mark"], layers: [[plate], [shoe, ...holes]] };
  },

  // VORTEX — the wingtip vortex an aero team lives by: two tapered spiral arms
  // around a hub. Three layers, so it never reads as Red Bull's two-layer pair.
  mclaren: () => {
    const arm = (rot) => {
      const line = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, a = rot + t * Math.PI * 1.05, r = lerp(0.1, 0.47, t);
        line.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
      }
      return taper(line, (t) => lerp(0.095, 0.012, t));
    };
    return { roles: ["mark", "mark", "mark"],
             layers: [[arm(0)], [arm(Math.PI)], [circle(0.5, 0.5, 0.115, 40)]] };
  },

  // SUN AND HORNS — the sun disc (CREST_DISC, authored in liverytex) with a
  // pair of horns growing out of its sides and sweeping up: the ancient
  // sun-between-the-horns glyph (a Taurus sign), a bull's head reduced to two
  // strokes and a circle, not a bull. Exactly two mirror-image "mark" layers,
  // and layer 1 is the LEFT horn on purpose: its low-x end is the TIP, which
  // `wrap` lays at the front of each flank, so the horn charges forward and its
  // tip — the path's high point — rides over the shoulder onto the crown, where
  // the two flanks' tips meet on the spine. The tip is cut square rather than
  // pointed so that crossing stays wide enough to see. The root starts RADIAL
  // to the disc and 0.17 from its centre, so the whole root cap sits inside the
  // sun's edge and the horn grows out of it with no seam showing.
  redbull: () => {
    const D = { cx: 0.494, cy: 0.498 }, a = (190 * Math.PI) / 180, dir = [Math.cos(a), Math.sin(a)];
    const root = [D.cx + dir[0] * 0.17, D.cy + dir[1] * 0.17];
    const line = bezier(root, [root[0] + dir[0] * 0.15, root[1] + dir[1] * 0.15], [0.04, 0.43], [0.045, 0.165], 40);
    const horn = taper(line, (t) => lerp(0.074, 0.024, Math.pow(t, 0.8)), true);
    return { roles: ["mark", "mark"], layers: [mirrorX([horn], D.cx), [horn]] };
  },

  // TWIN PEAKS — two summits, the high one snow-capped (the cap is an island,
  // separated from the rock by a zig-zag gap).
  alpine: () => {
    const A = [0.36, 0.16], L = [0, 0.82], S = [0.56, 0.52], P = [0.74, 0.34], Rr = [1, 0.82];
    const onLeft = (y) => [lerp(A[0], L[0], (y - A[1]) / (L[1] - A[1])), y];
    const onRight = (y) => [lerp(A[0], S[0], (y - A[1]) / (S[1] - A[1])), y];
    const zig = (dy) => [onRight(0.4 + dy), [0.42, 0.47 + dy], [0.355, 0.4 + dy], [0.29, 0.47 + dy], onLeft(0.42 + dy)];
    const cap = [A].concat(zig(0));
    const rock = [L].concat(zig(0.065).reverse(), [S, P, Rr]);
    return { roles: ["mark"], layers: [[cap, rock]] };
  },

  // HORNED BOLT — a lightning bolt (mark) under a crescent of horns (part).
  racingbulls: () => {
    // A crescent: the band between two arcs of the same radius, one raised.
    const r = 0.47, c1 = [0.5, 0.17], c2 = [0.5, 0.03];
    const yi = (c1[1] + c2[1]) / 2, dx = Math.sqrt(r * r - ((c1[1] - c2[1]) / 2) ** 2);
    const aL = Math.atan2(yi - c1[1], -dx), aR = Math.atan2(yi - c1[1], dx);
    const bL = Math.atan2(yi - c2[1], -dx), bR = Math.atan2(yi - c2[1], dx);
    // Both arcs run through the BOTTOM (angle +pi/2): the lower circle's left
    // to right with the angle falling, then the raised circle's back again.
    const crescent = [];
    for (let i = 0; i <= 40; i++) { const a = lerp(aL + TAU, aR, i / 40); crescent.push([c1[0] + Math.cos(a) * r, c1[1] + Math.sin(a) * r]); }
    for (let i = 0; i <= 40; i++) { const a = lerp(bR, bL, i / 40); crescent.push([c2[0] + Math.cos(a) * r, c2[1] + Math.sin(a) * r]); }
    const bolt = [[0.47, 0.22], [0.69, 0.22], [0.56, 0.5], [0.69, 0.5], [0.38, 0.99], [0.46, 0.63], [0.33, 0.63]];
    return { roles: ["part", "mark"], layers: [[crescent], [bolt]] };
  },

  // ANVIL IN A GEAR — the machine shop: a gear ring (alt) round an anvil (mark).
  haas: () => {
    const teeth = 10, Ro = 0.49, Rr = 0.41, Rh = 0.33, gear = [];
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * TAU - Math.PI / 2, p = TAU / teeth;
      for (const [f, r] of [[-0.3, Rr], [-0.17, Ro], [0.17, Ro], [0.3, Rr]]) gear.push([0.5 + Math.cos(a + f * p) * r, 0.5 + Math.sin(a + f * p) * r]);
    }
    const anvil = [[0, 0.12], [0.3, 0], [1, 0], [1, 0.2], [0.84, 0.26], [0.72, 0.4], [0.72, 0.5], [0.92, 0.6],
                   [0.92, 0.7], [0.14, 0.7], [0.14, 0.6], [0.34, 0.5], [0.34, 0.4], [0.24, 0.27]];
    const s = 0.5, ox = 0.25, oy = 0.335;
    return { roles: ["alt", "mark"],
             layers: [[gear, circle(0.5, 0.5, Rh, 48)], map([anvil], (x, y) => [ox + x * s, oy + y * s])] };
  },

  // CHEQUERED DIAMOND — a 4x4 chequer turned 45 degrees inside a diamond frame.
  williams: () => {
    const rot = (x, y) => [0.5 + (x - y) / Math.SQRT2, 0.5 + (x + y) / Math.SQRT2];   // square (-h..h) -> diamond
    const frame = (h) => [rot(-h, -h), rot(h, -h), rot(h, h), rot(-h, h)];
    const loops = [frame(0.49 / Math.SQRT2), frame(0.405 / Math.SQRT2)];
    const h = 0.355 / Math.SQRT2, c = (2 * h) / 4;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      if ((i + j) % 2) continue;
      const x0 = -h + i * c, y0 = -h + j * c;
      loops.push([rot(x0, y0), rot(x0 + c, y0), rot(x0 + c, y0 + c), rot(x0, y0 + c)]);
    }
    return { roles: ["mark"], layers: [loops] };
  },

  // CUBE — an isometric block, three faces split by a gap; the top face is the
  // `part` the LOGO DETAIL row can recolour.
  audi: () => {
    const R = 0.49, C = [0.5, 0.5], v = (deg) => [C[0] + Math.cos(deg * Math.PI / 180) * R, C[1] + Math.sin(deg * Math.PI / 180) * R];
    const top = [v(-90), v(-30), C, v(210)], left = [v(210), C, v(90), v(150)], right = [C, v(-30), v(30), v(90)];
    const g = 0.022;
    return { roles: ["mark", "part"], layers: [[inset(left, g), inset(right, g)], [inset(top, g)]] };
  },

  // CUT GEM — an emerald, side on: three crown facets over three pavilion facets.
  astonmartin: () => {
    const TL = [0.21, 0.18], TR = [0.79, 0.18], GL = [0.01, 0.41], G1 = [0.33, 0.41], G2 = [0.67, 0.41], GR = [0.99, 0.41], K = [0.5, 0.95];
    const g = 0.021;
    const facets = [[GL, TL, G1], [TL, TR, G2, G1], [TR, GR, G2], [GL, G1, K], [G1, G2, K], [G2, GR, K]].map((f) => inset(f, g));
    return { roles: ["mark"], layers: [facets] };
  },

  // STAR PLATE — a five-point star (alt) in a long hexagonal frame (mark).
  cadillac: () => {
    const outer = [[0.01, 0.5], [0.22, 0.22], [0.78, 0.22], [0.99, 0.5], [0.78, 0.78], [0.22, 0.78]];
    return { roles: ["mark", "alt"],
             layers: [[outer, inset(outer, 0.075)], [star(0.5, 0.515, 0.175, 0.074, 5)]] };
  },
};
// The roster order the old file used, so a diff of the data reads team by team.
const ORDER = ["racingbulls", "redbull", "ferrari", "cadillac", "astonmartin", "mclaren", "williams", "alpine", "mercedes", "haas", "audi"];

const num = (v) => {
  const s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
};
const loopStr = (loop) => "M" + loop.map(([x, y], i) => (i ? "L" : "") + num(x) + " " + num(y)).join("") + "Z";

// Scale an emblem about the box centre so its LONG axis spans FILL of the fit
// box, centred — crest-marks.test.mjs asks every mark to fill >= 0.88 of its
// dominant axis and to stay inside the box. Red Bull is exempt: its horns are
// placed around the authored CREST_DISC, which this file cannot move.
const FILL = 0.97;
const FIXED = new Set(["redbull"]);
function normalise(layers) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const loops of layers) for (const loop of loops) for (const [x, y] of loop) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const k = FILL / Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return layers.map((loops) => map(loops, (x, y) => [0.5 + (x - cx) * k, 0.5 + (y - cy) * k]));
}

export function build() {
  const out = {};
  for (const id of ORDER) {
    const e = EMBLEMS[id]();
    const layers = FIXED.has(id) ? e.layers : normalise(e.layers);
    out[id] = { roles: e.roles, d: layers.map((loops) => loops.map(loopStr).join("")) };
  }
  return out;
}

export function fileText(data) {
  const body = Object.entries(data).map(([id, v]) =>
    "  " + id + ": {\n    roles: " + JSON.stringify(v.roles) + ",\n    d: [\n" +
    v.d.map((d) => "      " + JSON.stringify(d)).join(",\n") + "\n    ],\n  },").join("\n");
  return `"use strict";
/* Apex 26 — team crest path data. GENERATED by tools/car/emblems.mjs; do not
   hand-edit, regenerate (node tools/car/emblems.mjs --write).

   ORIGINAL EMBLEMS. Apex 26 is an unofficial fan game, so no team wears its
   real logo: each emblem here is an original geometric design that evokes its
   team (colours and a theme) and copies no real mark. The designs, and why each
   looks the way it does, live in tools/car/emblems.mjs.

   Each entry is { roles, d }: d holds SVG-style path strings BACK TO FRONT, each
   filled with the evenodd rule, and roles[i] names which markPalette colour
   paints layer i ("mark", "alt", "part" or "plate"; a plate layer is dropped on
   the fin badge unless the mark keeps its backing). Red Bull's sun is not here:
   LiveryTex draws it as the circle it is (CREST_DISC). Coordinates are in the
   0..1 fit box every crest draws in (see fit() in js/car/liverytex.js), and
   only M/L/Z are used, so LiveryTex's tracePath needs no curve support. */
const CrestPaths = Object.freeze({
${body}
});
`;
}

// ── preview: the REAL drawCrest, rasterised offline ─────────────────────────
async function writePngs(dir) {
  const { default: sharp } = await import("sharp");
  const { loadCrests, paintStackAt } = await import("./crest-sweep.mjs");
  const { LiveryTex: LT, Teams, Liveries, RecCtx } = loadCrests();
  const S = 220, PAD = 10;
  const tiles = [];
  for (const id of ORDER) {
    const team = Teams.LIST.find((t) => t.id === id);
    const liv = Liveries.forTeam(team)[0];
    const fields = [[liv.cover || liv.c1], [[0.93, 0.93, 0.94]], [[0.07, 0.07, 0.09]]];
    const row = [];
    for (const field of fields) {
      const R = { x: 0, y: 0, w: S, h: S };
      const ctx = new RecCtx();
      LT.drawCrest(ctx, id, R, { liv, field, bare: false });
      const buf = Buffer.alloc(S * S * 3);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const c = paintStackAt(ctx.ops, x + 0.5, y + 0.5, field[0]).rgb;
        for (let k = 0; k < 3; k++) buf[(y * S + x) * 3 + k] = Math.round(Math.max(0, Math.min(1, c[k])) * 255);
      }
      row.push(buf);
    }
    const W = S * row.length + PAD * (row.length - 1);
    const strip = Buffer.alloc(W * S * 3, 40);
    row.forEach((b, i) => { for (let y = 0; y < S; y++) b.copy(strip, (y * W + i * (S + PAD)) * 3, y * S * 3, (y + 1) * S * 3); });
    await sharp(strip, { raw: { width: W, height: S, channels: 3 } }).png().toFile(path.join(dir, id + ".png"));
    tiles.push({ id, strip, W });
  }
  const W = tiles[0].W, H = tiles.length * (S + PAD);
  const sheet = Buffer.alloc(W * H * 3, 40);
  tiles.forEach((t, i) => t.strip.copy(sheet, i * (S + PAD) * W * 3));
  await sharp(sheet, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(dir, "emblems.png"));
  console.error("wrote " + path.relative(ROOT, dir) + "/emblems.png (each team on its cover, light, dark) + one PNG per team");
}

async function main() {
  const args = process.argv.slice(2);
  const data = build();
  const text = fileText(data);
  if (args.includes("--check")) {
    const ok = fs.readFileSync(OUT, "utf8") === text;
    console.log(ok ? "crest-paths.js is current" : "crest-paths.js has drifted from tools/car/emblems.mjs — run --write");
    process.exit(ok ? 0 : 1);
  }
  if (args.includes("--write")) { fs.writeFileSync(OUT, text); console.error("wrote js/car/crest-paths.js (" + text.length + " chars)"); }
  const png = args.find((a) => a.startsWith("--png="));
  if (png) {
    const dir = path.resolve(ROOT, png.slice(6));
    fs.mkdirSync(dir, { recursive: true });
    await writePngs(dir);
  }
  if (!args.includes("--write") && !png) {
    for (const [id, v] of Object.entries(data)) {
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (const d of v.d) for (const m of d.matchAll(/(-?[0-9.]+) (-?[0-9.]+)/g)) {
        x0 = Math.min(x0, +m[1]); x1 = Math.max(x1, +m[1]); y0 = Math.min(y0, +m[2]); y1 = Math.max(y1, +m[2]);
      }
      console.log(id.padEnd(12) + v.roles.join(",").padEnd(22) + `x ${num(x0)}..${num(x1)}  y ${num(y0)}..${num(y1)}  ` +
                  v.d.map((d) => (d.match(/[ML]/g) || []).length).join("+") + " pts");
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
