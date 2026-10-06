/* livery-cover-graphics.test.mjs — crown fade is a clean ordered halftone, and
 * the cap rear cut is feathered (no hard fillRect stair-step).
 *
 * Painters under test live in js/car/livery-graphics.js:
 *   - Mercedes shipped spineLogo "fade" → drawSpineTop "fade"
 *   - Ferrari shipped spineLogo "cap" + coverBind "saddleWrap" → drawSpineTop
 *     "cap" (crown white); flank rake is saddleFlanks in liverytex.js (out of
 *     OWNED scope for this lane).
 *
 * The fade used to hash-skip cells at fixed radius, which read as a noisy
 * "broken text" dot-matrix at garage close-up. Cap used a hard rear cut that
 * stair-stepped under cover UVs.
 *
 * Run: node --test tests/unit/livery-cover-graphics.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/car/livery-graphics.js"), "utf8");

function loadGraphics() {
  const sb = { console, Math, Object, Array, String, Number, JSON, isNaN, isFinite };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(SRC, sb, { filename: "js/car/livery-graphics.js" });
  return vm.runInContext("LiveryGraphics", sb);
}

function cssA(c, a) {
  if (!c) return `rgba(0,0,0,${a})`;
  const [r, g, b] = c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

function makeRecorder() {
  const arcs = [];
  const rects = [];
  let fillStyle = "#000";
  let gradients = 0;
  const ctx = {
    arcs, rects,
    get gradientCount() { return gradients; },
    save() {}, restore() {},
    beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {},
    stroke() {},
    clip() {},
    translate() {}, rotate() {}, scale() {},
    set lineWidth(_) {},
    set strokeStyle(_) {},
    set fillStyle(v) { fillStyle = v; },
    get fillStyle() { return fillStyle; },
    fill() {},
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, style: fillStyle }); },
    arc(cx, cy, r) { arcs.push({ cx, cy, r }); },
    createLinearGradient() {
      gradients++;
      return { addColorStop() {} };
    },
  };
  return ctx;
}

function painters() {
  const LG = loadGraphics();
  return LG.create({
    cssA,
    clipToRegion() {},
    drawNumber() {},
    drawWordmark() {},
    CROWN_SQUASH: 0.55,
    coverBindOf: (liv) => liv.coverBind || "independent",
    saddleFill: (liv, acc) => liv.saddleTint || acc,
    ridgeFill: (_liv, acc) => acc,
    pickOn: (cands) => cands[0],
    INK_LIGHT: [0.95, 0.95, 0.96],
    INK_DARK: [0.06, 0.06, 0.08],
    SUN_FLOOR: 2.0,
    TAIL_STYLE_IDS: ["diag", "sweep", "streak", "stars", "check", "chevron"],
  });
}

function paintFade(W, H) {
  const { drawSpineTop } = painters();
  const ctx = makeRecorder();
  const R = { x: 10, y: 20, w: W, h: H };
  drawSpineTop(ctx, "fade", R, [0.76, 0.78, 0.82], [0.0, 0.82, 0.78],
    [0.06, 0.06, 0.08], "PETRONAS", "63", null, null, {}, false);
  return { ctx, R, arcs: ctx.arcs };
}

test("fade is an ordered halftone: regular grid, radius ramps, no hash clumps", () => {
  // Pin the regression: hash-skip at fixed radius must stay gone.
  assert.doesNotMatch(SRC, /73856093/, "fade must not hash-skip cells");
  assert.match(SRC, /id === "fade"[\s\S]*?rMax/, "fade sizes dots from a cell max");

  for (const W of [1024, 2048]) {
    const H = Math.round(W * 1.9);
    const { arcs, R } = paintFade(W, H);
    assert.ok(arcs.length > 40, `${W}: expected a field of dots, got ${arcs.length}`);

    // Every drawn radius in a row is identical; rows grow toward the airbox
    // (higher y — canvas bottom).
    const byRow = new Map();
    for (const a of arcs) {
      const key = a.cy.toFixed(4);
      if (!byRow.has(key)) byRow.set(key, []);
      byRow.get(key).push(a);
    }
    const rows = [...byRow.entries()]
      .map(([cy, list]) => ({ cy: +cy, list, r: list[0].r }))
      .sort((a, b) => a.cy - b.cy);
    assert.ok(rows.length >= 8, `${W}: too few rows (${rows.length})`);

    for (const row of rows) {
      for (const a of row.list) {
        assert.ok(Math.abs(a.r - row.r) < 1e-9, `${W}: mixed radii in one row`);
      }
      // Regular x spacing: constant step between sorted centres.
      const xs = row.list.map((a) => a.cx).sort((a, b) => a - b);
      assert.equal(xs.length, row.list.length);
      if (xs.length >= 3) {
        const step = xs[1] - xs[0];
        assert.ok(step > 0, `${W}: zero x step`);
        for (let i = 2; i < xs.length; i++) {
          assert.ok(Math.abs((xs[i] - xs[i - 1]) - step) < 1e-6,
            `${W}: irregular x grid at row y=${row.cy}`);
        }
      }
    }

    // Radius ramps: later rows (airbox) are strictly larger than earlier
    // (rear) once both are past the sub-pixel skip.
    const mid = rows[Math.floor(rows.length * 0.35)];
    const late = rows[Math.floor(rows.length * 0.85)];
    assert.ok(late.r > mid.r * 1.3, `${W}: radius must ramp toward airbox (mid ${mid.r}, late ${late.r})`);

    // Crisp at atlas sizes: max radius clears a full pixel; cell step ≥ 4 px.
    const rMax = Math.max(...arcs.map((a) => a.r));
    assert.ok(rMax >= 1.5, `${W}: dots too small to read (rMax ${rMax})`);
    const xs0 = rows[rows.length - 1].list.map((a) => a.cx).sort((a, b) => a - b);
    assert.ok(xs0[1] - xs0[0] >= 4, `${W}: grid step too fine (${xs0[1] - xs0[0]})`);

    // All centres sit inside the crest region.
    for (const a of arcs) {
      assert.ok(a.cx >= R.x && a.cx <= R.x + R.w, `${W}: cx out of region`);
      assert.ok(a.cy >= R.y && a.cy <= R.y + R.h, `${W}: cy out of region`);
    }
  }
});

test("cap rear cut uses a feathered gradient, not a hard fillRect edge", () => {
  assert.match(SRC, /id === "cap"[\s\S]*?createLinearGradient/,
    "cap softens its rear cut with a linear gradient");
  assert.match(SRC, /id === "cap"[\s\S]*?feather/,
    "cap names the feather width");

  const { drawSpineTop } = painters();
  const ctx = makeRecorder();
  const R = { x: 0, y: 0, w: 400, h: 800 };
  drawSpineTop(ctx, "cap", R, [0.863, 0, 0], [0.95, 0.95, 0.96],
    [0.06, 0.06, 0.08], "CAVALLO", "16", null, null,
    { coverBind: "saddleWrap", saddleTint: [0.95, 0.95, 0.96] }, false);

  assert.ok(ctx.gradientCount >= 1, "saddleWrap cap must build a cut gradient");
  assert.ok(ctx.rects.length >= 2, "cap still paints a solid body plus feather band");
  // Feather band starts at the authored cut (0.38 H), solid body below it.
  const cutY = R.y + R.h * 0.38;
  const band = ctx.rects.find((r) => Math.abs(r.y - cutY) < 1e-6 && r.h < R.h * 0.1);
  assert.ok(band, "feather band sits on the cut line");
  assert.ok(band.h >= 2, "feather has measurable height");
});

test("painters: Mercedes fade and Ferrari cap are the owned crown arms", () => {
  // Source pins so a rename cannot silently orphan the close-up defects.
  assert.match(SRC, /else if \(id === "fade"\)/);
  assert.match(SRC, /else if \(id === "cap"\)/);
  assert.match(SRC, /Ordered halftone|ordered halftone|rMax/);
});

test("Mercedes mid-cover blotches are flank starfield in liverytex, not a second fade", () => {
  // Crown fade is ordered. The remaining "broken text" clusters on the silver
  // cover flanks (mercedes-cover close-up, below the airbox) are spineSide
  // "starfield" inside LiveryTex.buildAtlas — same hash-skip recipe the fade
  // used. #1059 owns liverytex.js; this lane does not edit it.
  assert.doesNotMatch(SRC, /73856093/, "owned fade must stay hash-free");
  const tex = fs.readFileSync(path.join(ROOT, "js/car/liverytex.js"), "utf8");
  const star = tex.match(/spineSide === "starfield"[\s\S]*?(?=else if \(spineSide ===)/);
  assert.ok(star, "buildAtlas still has a starfield flank arm");
  assert.match(star[0], /73856093/, "starfield is still the hashed density skip");
  assert.match(star[0], /19349663/);
  assert.match(star[0], /density = 0\.28/);
});
