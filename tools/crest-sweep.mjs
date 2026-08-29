#!/usr/bin/env node
// Measure every team crest without a browser.
//
// The crests are canvas-2D path code, and the failure modes that matter are all
// geometric: a limb thinner than a pixel at the smallest size the atlas is ever
// downscaled to, a counter that closes up under one mip level, a mark that fills
// a quarter of its box, a colour smuggled in from outside the palette. None of
// those need a real rasteriser to find — they need the numbers.
//
// So this loads the REAL js/car/liverytex.js in a vm with a recording 2D
// context: every path is flattened to points, every fill/stroke/fillText is
// kept with the style and lineWidth that were live at the time. A small
// scanline rasteriser (nonzero AND evenodd — the crests use both) turns that
// into coverage at any resolution. sharp+SVG would have meant re-deriving clip,
// evenodd and text metrics; a rasteriser you wrote is one you can trust.
//
//   node tools/crest-sweep.mjs                 all teams, both sizes
//   node tools/crest-sweep.mjs haas audi       just these
//   node tools/crest-sweep.mjs --json          machine-readable
//
// tests/unit/crest-marks.test.mjs imports loadCrests() from here and turns the
// same measurements into assertions.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Byte-identical to liverytex's css(), so a palette colour can be matched
// against a recorded fillStyle string.
export const cssOf = (c) => !c ? null : "rgb(" +
  c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(",") + ")";
const SEG = 16;   // curve flattening; 16 is well under the error a mip hides

// ── the recording context ──────────────────────────────────────────────────
// Records what was drawn, not how it looked. `ops` entries are
// { kind:"fill"|"stroke"|"text", pts:[[ [x,y], ... ], ...], rule, lw, style,
//   font, clip } in CANVAS pixels.
class RecCtx {
  constructor() {
    this.ops = [];
    // Image draws are recorded SEPARATELY from `ops`. They carry no path, and
    // the op loop in replay() walks `op.pts` on every entry — a shapeless op in
    // that list would throw, and its undefined style would pollute the colour
    // census. drawLogoImage is the only caller and it needs exactly one fact:
    // which shadow colour was live for each pass.
    this.imageOps = [];
    this.sub = [];
    this.cur = null;
    this.st = { lw: 1, fill: "#000", stroke: "#000", font: "10px sans-serif",
                align: "start", base: "alphabetic", clip: null, shadow: null, blur: 0 };
    this.stack = [];
  }
  set lineWidth(v) { this.st.lw = v; }        get lineWidth() { return this.st.lw; }
  set fillStyle(v) { this.st.fill = v; }      get fillStyle() { return this.st.fill; }
  set strokeStyle(v) { this.st.stroke = v; }  get strokeStyle() { return this.st.stroke; }
  set font(v) { this.st.font = v; }           get font() { return this.st.font; }
  set textAlign(v) { this.st.align = v; }     get textAlign() { return this.st.align; }
  set textBaseline(v) { this.st.base = v; }   get textBaseline() { return this.st.base; }
  set shadowColor(v) { this.st.shadow = v; }  get shadowColor() { return this.st.shadow; }
  set shadowBlur(v) { this.st.blur = v; }     get shadowBlur() { return this.st.blur; }
  set lineCap(_) {} set lineJoin(_) {} set miterLimit(_) {}
  set globalAlpha(_) {} set globalCompositeOperation(v) { this.compositeUsed = v; }
  set imageSmoothingEnabled(_) {}

  save() { this.stack.push({ ...this.st }); }
  restore() { if (this.stack.length) this.st = this.stack.pop(); }

  beginPath() { this.sub = []; this.cur = null; }
  moveTo(x, y) { this.cur = [[x, y]]; this.sub.push(this.cur); }
  lineTo(x, y) { if (!this.cur) this.moveTo(x, y); else this.cur.push([x, y]); }
  closePath() { if (this.cur && this.cur.length) this.cur.push(this.cur[0].slice()); }
  quadraticCurveTo(cx, cy, x, y) {
    if (!this.cur) this.moveTo(cx, cy);
    const [x0, y0] = this.cur[this.cur.length - 1];
    for (let i = 1; i <= SEG; i++) {
      const t = i / SEG, u = 1 - t;
      this.cur.push([u * u * x0 + 2 * u * t * cx + t * t * x,
                     u * u * y0 + 2 * u * t * cy + t * t * y]);
    }
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    if (!this.cur) this.moveTo(c1x, c1y);
    const [x0, y0] = this.cur[this.cur.length - 1];
    for (let i = 1; i <= SEG; i++) {
      const t = i / SEG, u = 1 - t;
      this.cur.push([u*u*u*x0 + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*x,
                     u*u*u*y0 + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*y]);
    }
  }
  arc(cx, cy, r, a0, a1, ccw) {
    const n = SEG * 2;
    let span = a1 - a0;
    // A FULL turn must stay a full turn. Normalising 0..2PI with ccw=true by
    // subtracting 2PI while positive lands on span 0 — every ring collapsed to
    // a point and Mercedes measured as a solid disc at 0.72 coverage.
    if (Math.abs(span) >= Math.PI * 2 - 1e-9) span = ccw ? -Math.PI * 2 : Math.PI * 2;
    else if (ccw) { while (span > 0) span -= Math.PI * 2; }
    else { while (span < 0) span += Math.PI * 2; }
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + span * (i / n);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    // A bare arc after beginPath starts its own subpath, exactly as canvas does
    // when there is no current point.
    if (!this.cur || this.cur.length === 0) { this.cur = pts; this.sub.push(this.cur); }
    else for (const p of pts) this.cur.push(p);
  }
  ellipse(cx, cy, rx, ry, rot, a0, a1) {
    const n = SEG * 2, pts = [], c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      pts.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    this.cur = pts; this.sub.push(this.cur);
  }
  rect(x, y, w, h) {
    this.cur = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
    this.sub.push(this.cur);
  }
  _snap() { return this.sub.map((p) => p.map((q) => q.slice())); }
  fill(rule) {
    this.ops.push({ kind: "fill", pts: this._snap(), rule: rule || "nonzero",
                    style: this.st.fill, clip: this.st.clip, shadow: this.st.shadow });
  }
  stroke() {
    this.ops.push({ kind: "stroke", pts: this._snap(), lw: this.st.lw,
                    style: this.st.stroke, clip: this.st.clip, shadow: this.st.shadow });
  }
  clip(rule) { this.st.clip = { pts: this._snap(), rule: rule || "nonzero" }; }
  fillRect(x, y, w, h) {
    this.ops.push({ kind: "fill", pts: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]],
                    rule: "nonzero", style: this.st.fill, clip: this.st.clip, shadow: this.st.shadow });
  }
  strokeRect(x, y, w, h) {
    this.ops.push({ kind: "stroke", pts: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]],
                    lw: this.st.lw, style: this.st.stroke, clip: this.st.clip, shadow: this.st.shadow });
  }
  measureText(t) { return { width: this._size() * 0.6 * String(t).length }; }
  _size() { const m = /(\d+(?:\.\d+)?)px/.exec(this.st.font); return m ? +m[1] : 10; }
  fillText(t, x, y, maxW) {
    const size = this._size();
    let w = Math.min(this.measureText(t).width, maxW != null ? maxW : Infinity);
    const h = size * 0.72;
    let x0 = x;
    if (this.st.align === "center") x0 = x - w / 2;
    else if (this.st.align === "right" || this.st.align === "end") x0 = x - w;
    let y0 = y - h;                                       // alphabetic
    if (this.st.base === "middle") y0 = y - h / 2;
    else if (this.st.base === "top" || this.st.base === "hanging") y0 = y;
    this.ops.push({ kind: "text", text: String(t), size,
                    pts: [[[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h], [x0, y0]]],
                    rule: "nonzero", style: this.st.fill, clip: this.st.clip,
                    font: this.st.font, shadow: this.st.shadow });
  }
  strokeText() {}
  drawImage() { this.imageUsed = true; this.imageOps.push({ shadow: this.st.shadow }); }
  createLinearGradient() { const g = { addColorStop() {} }; return g; }
  createRadialGradient() { const g = { addColorStop() {} }; return g; }
  clearRect() {}
  getImageData() { return { data: new Uint8ClampedArray(4) }; }
  putImageData() {}
  translate() {} scale() {} rotate() {} setTransform() {} transform() {}
}

// ── geometry ───────────────────────────────────────────────────────────────
function winding(sub, px, py) {
  let n = 0, cross = 0;
  for (const ring of sub) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
      if (y0 <= py) { if (y1 > py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0) n++; }
      else if (y1 <= py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0) n--;
      if ((y0 > py) !== (y1 > py) && px < x0 + (py - y0) / (y1 - y0) * (x1 - x0)) cross++;
    }
    // implicit close
    const a = ring[ring.length - 1], b = ring[0];
    if (a[0] !== b[0] || a[1] !== b[1]) {
      const [x0, y0] = a, [x1, y1] = b;
      if (y0 <= py) { if (y1 > py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0) n++; }
      else if (y1 <= py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0) n--;
      if ((y0 > py) !== (y1 > py) && px < x0 + (py - y0) / (y1 - y0) * (x1 - x0)) cross++;
    }
  }
  return { nonzero: n !== 0, evenodd: cross % 2 === 1 };
}
function nearPolyline(sub, px, py, half) {
  const h2 = half * half;
  for (const ring of sub) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
      const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy;
      let t = L ? ((px - x0) * dx + (py - y0) * dy) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - (x0 + t * dx), ey = py - (y0 + t * dy);
      if (ex * ex + ey * ey <= h2) return true;
    }
  }
  return false;
}
function inked(ops, px, py) {
  for (const op of ops) {
    if (op.clip) {
      const w = winding(op.clip.pts, px, py);
      if (!(op.clip.rule === "evenodd" ? w.evenodd : w.nonzero)) continue;
    }
    if (op.kind === "stroke") { if (nearPolyline(op.pts, px, py, op.lw / 2)) return true; }
    else {
      const w = winding(op.pts, px, py);
      if (op.rule === "evenodd" ? w.evenodd : w.nonzero) return true;
    }
  }
  return false;
}

// ── loading the real module ────────────────────────────────────────────────
function read(f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); }

export function loadCrests() {
  const sandbox = {
    console, Math, Object, Array, String, Number, JSON, Map, Set, isNaN, parseInt, parseFloat,
    document: { querySelector: () => null, createElement: () => ({ getContext: () => new RecCtx(), width: 0, height: 0 }) },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ["js/log.js", "js/car/teams.js", "js/car/liveries.js",
                   "js/car/crest-paths.js", "js/car/liverytex.js"])
    vm.runInContext(read(f), sandbox, { filename: f });
  // Every one of these files is `const X = (function(){...})()` at script level,
  // which is a LEXICAL binding — it never becomes a property of the vm's global
  // object, so sandbox.Teams is undefined however the file looks. Evaluate the
  // bare name in the same context instead, the way cockpit-pale-sweep does.
  const grab = (n) => vm.runInContext(n, sandbox);
  return { LiveryTex: grab("LiveryTex"), Teams: grab("Teams"), Liveries: grab("Liveries"), RecCtx };
}

// Replay one crest and measure it. `R` is an atlas region rect.
export function replay(LT, teamId, R, palette, bare) {
  const ctx = new RecCtx();
  LT.drawCrest(ctx, teamId, R, { palette, bare });
  const s = Math.min(R.w, R.h) * (1 - LT.CREST_MARGIN * 2);
  const ox = R.x + (R.w - s) / 2, oy = R.y + (R.h - s) / 2;
  const u = (x) => (x - ox) / s, v = (y) => (y - oy) / s;

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let minLw = Infinity;
  const colours = new Set(), fonts = [];
  for (const op of ctx.ops) {
    if (op.kind === "stroke") minLw = Math.min(minLw, op.lw / s);
    // drawCrest replays the whole crest up to four times when a halo fires, so
    // dedupe: the geometry is identical, only the list would double-count.
    if (op.kind === "text") {
      const rel = op.size / s;
      if (!fonts.some((f) => f.text === op.text && Math.abs(f.rel - rel) < 1e-9))
        fonts.push({ text: op.text, rel });
    }
    colours.add(op.style);
    const pad = op.kind === "stroke" ? op.lw / 2 : 0;
    for (const ring of op.pts) for (const [px, py] of ring) {
      x0 = Math.min(x0, u(px - pad)); x1 = Math.max(x1, u(px + pad));
      y0 = Math.min(y0, v(py - pad)); y1 = Math.max(y1, v(py + pad));
    }
  }
  return {
    teamId, bare: !!bare, ops: ctx.ops, composite: ctx.compositeUsed || null,
    bbox: { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 },
    minStroke: minLw === Infinity ? null : minLw, colours: [...colours], fonts,
    // Sample the fit box on a px-by-px grid — the box, not the region, so the
    // number is comparable across sizes and independent of the margin.
    // `skipStyle` drops one colour: pass the plate's and you measure the MARK,
    // which is the number an upper bound should be set against. A backing
    // shield is not ink, and counting it put Racing Bulls at 0.65 while a
    // genuinely filled-in mark sits at 0.9 — no bound separates those two.
    coverageAt(px, skipStyle) {
      const use = skipStyle ? ctx.ops.filter((o) => o.style !== skipStyle) : ctx.ops;
      const n = Math.max(8, Math.round(px * (1 - LT.CREST_MARGIN * 2)));
      let hit = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
        if (inked(use, ox + (i + 0.5) / n * s, oy + (j + 0.5) / n * s)) hit++;
      return hit / (n * n);
    },
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const want = args.filter((a) => !a.startsWith("--"));
  const { LiveryTex: LT, Teams, Liveries } = loadCrests();
  const ids = (want.length ? want : Teams.LIST.map((t) => t.id));
  const rows = [];
  for (const id of ids) {
    const team = Teams.LIST.find((t) => t.id === id);
    const liv = team ? Liveries.forTeam(team)[0] : null;
    for (const [name, R, bare] of [["cover", LT.REGIONS.crest, false],
                                   ["badge", LT.REGIONS.finBadge, true]]) {
      const field = bare ? (liv && liv.c2) : (liv && liv.c1);
      const P = LT.markPalette(id, liv, field, bare);
      const m = replay(LT, id, R, P, bare);
      rows.push({
        id, at: name, bbox: [+m.bbox.x0.toFixed(3), +m.bbox.y0.toFixed(3),
                             +m.bbox.x1.toFixed(3), +m.bbox.y1.toFixed(3)],
        span: [+m.bbox.w.toFixed(3), +m.bbox.h.toFixed(3)],
        minStroke: m.minStroke == null ? null : +m.minStroke.toFixed(4),
        text: m.fonts.map((f) => f.text + "@" + f.rel.toFixed(3)),
        colours: m.colours.length,
        cov430: +m.coverageAt(430).toFixed(3),
        cov40: +m.coverageAt(40).toFixed(3),
        mark430: +m.coverageAt(430, cssOf(P.plate)).toFixed(3),
      });
    }
  }
  if (asJson) { console.log(JSON.stringify(rows, null, 2)); return; }
  const F = (v, w) => String(v).padEnd(w);
  console.log(F("team", 13) + F("at", 7) + F("span w,h", 16) + F("minStroke", 11) +
              F("cols", 6) + F("cov430", 9) + F("cov40", 9) + F("mark430", 10) + "text");
  for (const r of rows) {
    const flags = [];
    if (r.span[0] < 0.88 && r.span[1] < 0.88) flags.push("SMALL");
    if (r.minStroke != null && r.minStroke < LT.STROKE_MIN - 1e-6) flags.push("THIN");
    if (r.bbox[0] < -0.02 || r.bbox[1] < -0.02 || r.bbox[2] > 1.02 || r.bbox[3] > 1.02) flags.push("BLEED");
    if (r.cov40 > 0 && Math.abs(r.cov40 - r.cov430) / Math.max(r.cov430, 1e-6) > 0.35) flags.push("MIP");
    if (r.mark430 > 0.62) flags.push("BLOB");
    if (r.cov430 < 0.10) flags.push("FAINT");
    console.log(F(r.id, 13) + F(r.at, 7) + F(r.span.join(","), 16) +
                F(r.minStroke == null ? "-" : r.minStroke, 11) + F(r.colours, 6) +
                F(r.cov430, 9) + F(r.cov40, 9) + F(r.mark430, 10) + (r.text.join(" ") || "-") +
                (flags.length ? "   << " + flags.join(" ") : ""));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
