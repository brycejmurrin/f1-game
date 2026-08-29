#!/usr/bin/env node
// Turn a team logo bitmap into the vector path data js/car/crest-paths.js ships.
//
// AUTHOR-TIME ONLY. The game never runs this; it consumes the generated file.
//
// Why this exists: the eleven hand-drawn crests in liverytex.js were drawn from
// memory as chained canvas calls, and it showed — Red Bull's two charging bulls
// came out as a pair of pigs, Aston's spread wings as three chevrons. Memory is
// the wrong source. The bitmaps that used to ship in assets/logos carried the
// real silhouettes; they were unusable as ART (traced, filled counters,
// single-luminance, no livery response) but they are perfectly good as a
// SOURCE. So: read the bitmap out of git history, split it into at most three
// colour layers, walk the boundary of each layer's mask, simplify, and emit
// path data in the 0..1 fit box every crest already draws in.
//
// The result is resolution-independent, recolours from the livery like anything
// else in markPalette, and has the counters the bitmaps lost.
//
//   node tools/trace-logo.mjs <teamId ...>        print path data
//   node tools/trace-logo.mjs --write             regenerate js/car/crest-paths.js
//   node tools/trace-logo.mjs --rev <sha> ...     source commit (default: the
//                                                 last one that had the files)
//   node tools/trace-logo.mjs --layers 2 haas     force a layer count
//
// Tunables per team live in SOURCES below — that is the whole authoring
// surface, and it is deliberately small.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decodePNG, encodePNG } from "./assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The last commit that carried assets/logos/*.png. Pinned rather than resolved
// so a regeneration years from now reads the same pixels.
const DEFAULT_REV = "0d040af";

// Per-team trace settings.
//   layers  how many ink colours the mark has (1 = silhouette, 2 = mark + a
//           second colour, 3 = mark + second + backing plate)
//   alpha   minimum alpha to count as ink; the traces have soft edges
//   eps     simplification tolerance in FIT-BOX units. Bigger = fewer points.
//           0.004 keeps a horse's legs; 0.010 is right for a broad wing.
//   minArea drop contours smaller than this fraction of the box — the traces
//           are speckled with stray fragments (audi.png has a whole extra
//           shape floating off to the right).
//   invert  the mark is the LIGHT part of the image, not the dark part
const SOURCES = {
  // roles  which palette colour paints each layer, BACK TO FRONT. The trace's
  //        first layer is always the whole silhouette in the dominant colour and
  //        later layers overpaint detail, so the roles are not in a fixed order:
  //        Ferrari's dominant colour is the yellow SHIELD with the horse on top,
  //        Red Bull's is the red BULLS with the gold disc showing through.
  //        A "plate" layer is dropped on the fin badge, which is what makes bare
  //        mode fall out for free — drop Ferrari's shield and the horse is left
  //        alone, exactly as it should be.
  // base  the cluster nearest this colour becomes layer 0. Layer 0's mask is
  //       the WHOLE silhouette and later layers overpaint detail, so whichever
  //       layer is the plate has to be layer 0 — otherwise dropping it for the
  //       fin badge leaves the union of every shape painted as one blob, which
  //       is exactly what Red Bull's badge became: bulls and disc fused solid.
  //       Without a hint the biggest cluster leads, which is right when the
  //       dominant colour IS the backdrop (Ferrari's shield).
  redbull:     { layers: 2, roles: ["plate", "mark"], base: [0.95, 0.77, 0.21],
                 alpha: 0.45, eps: 0.005, minArea: 0.0016 },
  ferrari:     { layers: 2, roles: ["plate", "mark"], base: [0.94, 0.89, 0.12],
                 alpha: 0.45, eps: 0.004, minArea: 0.0012 },
  cadillac:    { layers: 2, roles: ["mark", "alt"],   alpha: 0.45, eps: 0.004, minArea: 0.0008 },
  // parts  the palette role of each INDEPENDENT ISLAND, left to right, once the
  //        layer has been split by groupLoops. This is what gives a
  //        single-ink mark a second colour: Racing Bulls' source is monochrome
  //        white (all three k-means clusters come back 0.96-0.98), so there is
  //        no second INK to find — but the bull and the two letters are three
  //        loops that share no pixel, so they are three PARTS. Naming the bull
  //        `alt` is what lets LOGO DETAIL paint it, instead of landing on the
  //        shadow outline that is all a single-island mark can offer.
  //        Island order here is [bull, R, B]: the sort is by leftmost x and the
  //        bull spans the full width. Re-run with --parts after any retrace.
  //        The role is "part", NOT "alt": `alt` is a genuinely different INK in
  //        the source (Cadillac's inner detail) and markPalette auto-scores it
  //        to contrast with the mark, so calling the bull `alt` would repaint
  //        every shipped Racing Bulls car by default. `part` means "same ink as
  //        the mark unless the player says otherwise" — unset, it IS the mark
  //        and the crest is pixel-identical to what ships today.
  racingbulls: { layers: 1, roles: ["mark"], parts: ["part", "mark", "mark"],
                 alpha: 0.50, eps: 0.006, minArea: 0.0030 },
  astonmartin: { layers: 1, roles: ["mark"], alpha: 0.45, eps: 0.006, minArea: 0.0020 },
  mclaren:     { layers: 1, roles: ["mark"], alpha: 0.45, eps: 0.006, minArea: 0.0030 },
  williams:    { layers: 1, roles: ["mark"], alpha: 0.45, eps: 0.006, minArea: 0.0030 },
  alpine:      { layers: 1, roles: ["mark"], alpha: 0.45, eps: 0.006, minArea: 0.0030 },
  // NOT traced, and each for a measured reason (node tools/trace-logo.mjs
  // --preview <id> shows all three):
  //   haas      the source fills the H's counters, so it traces to a red disc
  //   audi      the source fills the rings, so it traces to four blobs
  //   mercedes  the source's ring is ragged; a ring and a three-point star are
  //             exact as maths and only approximate as a trace
  // Those three keep their hand-drawn constructions in liverytex.js, which are
  // geometrically correct rather than merely faithful to a bad bitmap.
};

// ── source ─────────────────────────────────────────────────────────────────
function readLogo(id, rev) {
  const buf = execFileSync("git", ["show", `${rev}:assets/logos/${id}.png`],
    { cwd: ROOT, maxBuffer: 1 << 24, encoding: "buffer" });
  return decodePNG(buf);
}

// ── colour clustering ──────────────────────────────────────────────────────
// k-means over the OPAQUE pixels only. The traces are posterised already, so
// this converges in a handful of passes and the clusters land on the real ink
// colours rather than on antialiasing.
function cluster(img, k, alphaMin) {
  const { w, h, rgba } = img;
  const px = [];
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255;
    if (a < alphaMin) continue;
    px.push([rgba[i * 4] / 255, rgba[i * 4 + 1] / 255, rgba[i * 4 + 2] / 255, i]);
  }
  if (!px.length) return { centres: [], assign: new Int8Array(w * h).fill(-1) };
  // Seed on luminance spread so the run is deterministic — no RNG in a tool
  // whose output is committed.
  const lum = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  const sorted = px.slice().sort((a, b) => lum(a) - lum(b));
  const centres = [];
  for (let i = 0; i < k; i++)
    centres.push(sorted[Math.min(sorted.length - 1, Math.floor((i + 0.5) / k * sorted.length))].slice(0, 3));
  for (let pass = 0; pass < 24; pass++) {
    const sum = centres.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centres.length; c++) {
        const d = (p[0] - centres[c][0]) ** 2 + (p[1] - centres[c][1]) ** 2 + (p[2] - centres[c][2]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      sum[best][0] += p[0]; sum[best][1] += p[1]; sum[best][2] += p[2]; sum[best][3]++;
    }
    let moved = 0;
    for (let c = 0; c < centres.length; c++) {
      if (!sum[c][3]) continue;
      const n = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
      moved += Math.abs(n[0] - centres[c][0]) + Math.abs(n[1] - centres[c][1]) + Math.abs(n[2] - centres[c][2]);
      centres[c] = n;
    }
    if (moved < 1e-4) break;
  }
  const assign = new Int8Array(w * h).fill(-1);
  const count = centres.map(() => 0);
  for (const p of px) {
    let best = 0, bd = Infinity;
    for (let c = 0; c < centres.length; c++) {
      const d = (p[0] - centres[c][0]) ** 2 + (p[1] - centres[c][1]) ** 2 + (p[2] - centres[c][2]) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    assign[p[3]] = best;
    count[best]++;
  }
  return { centres, assign, count };
}

// ── contour walking ────────────────────────────────────────────────────────
// Moore-neighbourhood boundary tracing on a binary mask, one closed loop per
// connected component AND per hole. Holes are what the source bitmaps threw
// away — the counters of an H, the middle of a ring — so they are the point.
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

function traceMask(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : mask[y * w + x];
  const loops = [];
  // Outer boundaries: a filled pixel whose left neighbour is empty and which we
  // have not already walked. Inner boundaries (holes) come out of the same walk
  // started from a filled pixel whose RIGHT neighbour is empty inside a region.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      const startsOuter = !at(x - 1, y) && !seen[y * w + x];
      const startsHole = at(x - 1, y) && !at(x, y - 1) && !seen[y * w + x];
      if (!startsOuter && !startsHole) continue;
      const loop = walk(x, y);
      if (loop.length > 7) loops.push(loop);
    }
  }
  return loops;

  function walk(sx, sy) {
    const pts = [];
    let cx = sx, cy = sy, dir = 6;           // came from "up"
    let guard = w * h * 4;
    do {
      seen[cy * w + cx] = 1;
      pts.push([cx, cy]);
      let found = false;
      // Turn back one step and sweep clockwise for the next boundary pixel.
      for (let i = 0; i < 8; i++) {
        const d = (dir + 6 + i) % 8;
        const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
        if (at(nx, ny)) { cx = nx; cy = ny; dir = d; found = true; break; }
      }
      if (!found) break;
    } while ((cx !== sx || cy !== sy) && --guard > 0);
    return pts;
  }
}

// Ramer-Douglas-Peucker on a CLOSED loop.
function simplify(pts, eps) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1, fd = eps;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function areaOf(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

// ── one team ───────────────────────────────────────────────────────────────
export function traceTeam(id, opts) {
  const cfg = { ...(SOURCES[id] || { layers: 1, alpha: 0.45, eps: 0.006, minArea: 0.003 }), ...opts };
  const img = readLogo(id, cfg.rev || DEFAULT_REV);
  const { w, h } = img;
  const { centres, assign, count } = cluster(img, cfg.layers, cfg.alpha);

  // Back to front. `base` names the layer that must lead (see SOURCES); the
  // rest follow by pixel count.
  const rest = centres.map((c, i) => i).sort((a, b) => count[b] - count[a]);
  let order = rest;
  if (cfg.base) {
    const d2 = (i) => (centres[i][0] - cfg.base[0]) ** 2 +
      (centres[i][1] - cfg.base[1]) ** 2 + (centres[i][2] - cfg.base[2]) ** 2;
    const lead = rest.slice().sort((a, b) => d2(a) - d2(b))[0];
    order = [lead, ...rest.filter((i) => i !== lead)];
  }

  // Trim to the ink's own bounding box, then map that box into 0..1 so the mark
  // fills its fit box regardless of the padding the source happened to carry.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) {
    if (assign[i] < 0) continue;
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, s = Math.max(bw, bh);
  const ux = (x) => (x - x0 - (bw - s) / 2) / s;
  const uy = (y) => (y - y0 - (bh - s) / 2) / s;

  const layers = [];
  for (const ci of order) {
    // A layer's mask is ITSELF PLUS EVERYTHING ABOVE IT. Painting only its own
    // pixels leaves the shapes drawn on top of it as holes punched through,
    // which is exactly the destination-out failure the palette rules ban.
    const rank = order.indexOf(ci);
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++)
      if (assign[i] >= 0 && order.indexOf(assign[i]) >= rank) mask[i] = 1;
    const loops = traceMask(mask, w, h)
      .map((L) => simplify(L, cfg.eps * s))
      .map((L) => L.map(([x, y]) => [ux(x), uy(y)]))
      .filter((L) => areaOf(L) >= cfg.minArea);
    if (loops.length) layers.push({ colour: centres[ci], loops, px: count[ci] });
  }
  return { id, w, h, layers, cfg };
}

// ── emit ───────────────────────────────────────────────────────────────────
const f2 = (v) => {
  const s = v.toFixed(3);
  return s.replace(/0+$/, "").replace(/\.$/, "") || "0";
};
// Split a layer's loops into INDEPENDENT ISLANDS. A layer is filled with one
// `ctx.fill("evenodd")`, so loops that overlap are a counter-and-container pair
// — the hole in Ferrari's shield, the eye in a bull — and MUST stay in one fill
// or the knockout is lost and the shape floods solid. Loops whose bounding
// boxes are disjoint never interact under evenodd, so they can be split into
// separate fills and painted separately with pixel-identical output.
//
// That is what makes per-part crest colour possible without re-tracing
// anything: Racing Bulls' R, B and bull are already three disjoint loops, and
// Red Bull's two bulls likewise. Measured on the shipped data, the eight traced
// crests hold 24 independent islands between them.
export function groupLoops(loops, N) {
  // INTERIOR overlap, not bounding-box overlap. A bbox test welds shapes that
  // never touch: Racing Bulls' bull spans the full width, so its box overlaps
  // both letters and the whole mark collapses to one island — measured, that is
  // exactly what a bbox test returns. Rasterise each loop's interior instead
  // and group only loops that actually share pixels.
  const n = N || 200;
  const mask = loops.map((L) => {
    const m = new Uint8Array(n * n);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of L) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const i0 = Math.max(0, Math.floor(x0 * n)), i1 = Math.min(n - 1, Math.ceil(x1 * n));
    const j0 = Math.max(0, Math.floor(y0 * n)), j1 = Math.min(n - 1, Math.ceil(y1 * n));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
      if (inLoops([L], (i + 0.5) / n, (j + 0.5) / n)) m[j * n + i] = 1;
    return m;
  });
  const owner = loops.map((_, i) => i);
  const find = (i) => (owner[i] === i ? i : (owner[i] = find(owner[i])));
  const meets = (a, b) => {
    for (let k = 0; k < a.length; k++) if (a[k] && b[k]) return true;
    return false;
  };
  for (let i = 0; i < loops.length; i++)
    for (let j = i + 1; j < loops.length; j++)
      if (meets(mask[i], mask[j])) owner[find(i)] = find(j);
  const by = new Map();
  for (let i = 0; i < loops.length; i++) {
    const r = find(i);
    if (!by.has(r)) by.set(r, []);
    by.get(r).push(loops[i]);
  }
  // Left to right, so the authored `parts` order in SOURCES is stable and
  // readable: for Racing Bulls that is R, then B, then the bull.
  return [...by.values()].sort((a, b) => {
    const lx = (g) => Math.min(...g.map((L) => Math.min(...L.map(([x]) => x))));
    return lx(a) - lx(b);
  });
}

export function toPathData(loops) {
  return loops.map((L) =>
    "M" + L.map(([x, y]) => f2(x) + " " + f2(y)).join("L") + "Z").join("");
}

// ── preview ────────────────────────────────────────────────────────────────
// Source bitmap on the left, the trace on the right, at the size the mark is
// actually read at. Without this the authoring loop is "write beziers, wait
// four minutes for a browser, discover you drew a pig".
function inLoops(loops, x, y) {
  let cross = 0;
  for (const L of loops) {
    for (let i = 0; i < L.length; i++) {
      const [x0, y0] = L[i], [x1, y1] = L[(i + 1) % L.length];
      if ((y0 > y) !== (y1 > y) && x < x0 + (y - y0) / (y1 - y0) * (x1 - x0)) cross++;
    }
  }
  return cross % 2 === 1;
}

function preview(t, size) {
  const N = size, GAP = 12, W = N * 2 + GAP, H = N;
  const rgba = Buffer.alloc(W * H * 4);
  const img = readLogo(t.id, t.cfg.rev || DEFAULT_REV);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    rgba[o] = 24; rgba[o + 1] = 26; rgba[o + 2] = 32; rgba[o + 3] = 255;
    if (x < N) {                                   // source, nearest-sampled
      const sx = Math.floor(x / N * img.w), sy = Math.floor(y / N * img.h);
      const si = (sy * img.w + sx) * 4, a = img.rgba[si + 3] / 255;
      rgba[o] = Math.round(img.rgba[si] * a + 24 * (1 - a));
      rgba[o + 1] = Math.round(img.rgba[si + 1] * a + 26 * (1 - a));
      rgba[o + 2] = Math.round(img.rgba[si + 2] * a + 32 * (1 - a));
    } else if (x >= N + GAP) {                     // the trace, painted in order
      const u = (x - N - GAP) / N, v = y / N;
      for (const L of t.layers) {
        if (!inLoops(L.loops, u, v)) continue;
        rgba[o] = Math.round(L.colour[0] * 255);
        rgba[o + 1] = Math.round(L.colour[1] * 255);
        rgba[o + 2] = Math.round(L.colour[2] * 255);
      }
    }
  }
  return { W, H, rgba };
}

function main() {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf("--" + n); return i < 0 ? d : args[i + 1]; };
  const write = args.includes("--write");
  const pv = args.includes("--preview");
  const rev = flag("rev", DEFAULT_REV);
  const layers = flag("layers", null);
  const ids = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--rev", "--layers"].includes(args[i - 1])));
  const list = ids.length ? ids : Object.keys(SOURCES);

  const out = {};
  for (const id of list) {
    const t = traceTeam(id, { rev, ...(layers ? { layers: +layers } : {}) });
    // One entry per INDEPENDENT ISLAND, not per layer. `parts` in SOURCES names
    // the palette role of each island in left-to-right order; without it every
    // island inherits its layer's role, which reproduces the old output exactly.
    const layerRole = t.cfg.roles || t.layers.map(() => "mark");
    const groups = [];
    t.layers.forEach((L, li) => {
      for (const g of groupLoops(L.loops)) groups.push({ li, loops: g });
    });
    const authored = t.cfg.parts;
    if (authored && authored.length !== groups.length)
      throw new Error(`${id}: SOURCES.parts has ${authored.length} entries, ` +
        `the trace has ${groups.length} islands — re-run with --parts and re-author`);
    out[id] = { roles: groups.map((g, i) => (authored ? authored[i] : layerRole[g.li] || "mark")),
                d: groups.map((g) => toPathData(g.loops)) };
    if (args.includes("--parts")) {
      console.error(`  ${id}: ${groups.length} island(s)`);
      groups.forEach((g, i) => {
        const xs = g.loops.flat().map(([x]) => x), ys = g.loops.flat().map(([, y]) => y);
        console.error(`    [${i}] layer ${g.li} role ${out[id].roles[i]} ` +
          `loops ${g.loops.length} x ${Math.min(...xs).toFixed(3)}-${Math.max(...xs).toFixed(3)} ` +
          `y ${Math.min(...ys).toFixed(3)}-${Math.max(...ys).toFixed(3)}`);
      });
    }
    if (pv) {
      const { W, H, rgba } = preview(t, +flag("size", 240));
      fs.mkdirSync(path.join(ROOT, "scratch/renders"), { recursive: true });
      fs.writeFileSync(path.join(ROOT, "scratch/renders/trace-" + id + ".png"), encodePNG(W, H, rgba));
    }
    const bytes = out[id].d.reduce((n, d) => n + d.length, 0);
    console.error(`${id}: ${t.layers.length} layer(s), ` +
      t.layers.map((L) => L.loops.length + " loop/" + L.loops.reduce((n, l) => n + l.length, 0) + "pt").join(", ") +
      `, ${bytes} chars, colours ` +
      t.layers.map((L) => L.colour.map((c) => c.toFixed(2)).join("/")).join(" "));
  }
  if (!write) { console.log(JSON.stringify(out, null, 1)); return; }

  const body = Object.entries(out).map(([id, v]) =>
    "  " + id + ": {\n    roles: " + JSON.stringify(v.roles) + ",\n    d: [\n" +
    v.d.map((d) => "      " + JSON.stringify(d)).join(",\n") + "\n    ],\n  },").join("\n");
  const file = `"use strict";
/* Apex 26 — team crest path data. GENERATED by tools/trace-logo.mjs; do not
   hand-edit, regenerate.

   Each entry is { roles, d }: d holds SVG-style path strings BACK TO FRONT, and
   roles[i] names which markPalette colour paints layer i ("mark", "alt" or
   "plate"; a plate layer is dropped on the fin badge). Coordinates are in the
   0..1 fit box every crest draws in (see fit() in js/car/liverytex.js), and only
   M/L/Z are used, so LiveryTex's tracePath needs no curve support.

   These are traced from the bitmaps that used to live in assets/logos, read out
   of commit ${DEFAULT_REV}. The bitmaps were unusable as art — filled counters,
   one luminance, no response to the livery — but they carried the real
   silhouettes, and hand-drawing those from memory produced a pair of pigs where
   Red Bull's charging bulls should be. Which colour each layer is PAINTED is
   markPalette's decision, not this file's: the traced colours are discarded. */
const CrestPaths = Object.freeze({
${body}
});
`;
  fs.writeFileSync(path.join(ROOT, "js/car/crest-paths.js"), file);
  console.error("wrote js/car/crest-paths.js (" + file.length + " chars)");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
