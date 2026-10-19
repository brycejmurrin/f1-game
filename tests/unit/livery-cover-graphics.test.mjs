/* livery-cover-graphics.test.mjs — cover painters: ordered fade + starfield
 * halftones, feathered cap cut and saddleFlanks rake.
 *
 *   - Mercedes spineLogo "fade" → LiveryGraphics.drawSpineTop "fade"
 *   - Mercedes spineSide "starfield" → LiveryTex.buildAtlas starfield arm
 *   - Ferrari spineLogo "cap" + coverBind "saddleWrap" → drawSpineTop "cap"
 *     (crown) and saddleFlanks (flank rake)
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
const TEX = fs.readFileSync(path.join(ROOT, "js/car/liverytex.js"), "utf8");

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

// The two arms below live inside LiveryTex.buildAtlas's canvas closure, which
// needs a browser to run; these scans stay their only guard (the crown arms
// above run for real and lost their pins, test review 2026-10-19 TK1-04).
test("Mercedes mid-cover starfield is an ordered grid, not a hashed skip", () => {
  assert.doesNotMatch(TEX, /73856093/, "starfield must not hash-skip cells");
  const star = TEX.match(/spineSide === "starfield"[\s\S]*?(?=else if \(spineSide ===)/);
  assert.ok(star, "buildAtlas still has a starfield flank arm");
  assert.match(star[0], /rMax/, "starfield sizes dots from a cell max");
  assert.match(star[0], /cols/, "starfield uses a regular column count");
  assert.match(star[0], /t \* t/, "starfield radius ramps");
  assert.doesNotMatch(star[0], /density = 0\.28/, "hashed 0.28 skip is gone");
});

test("Ferrari saddleFlanks rake is feathered, not a hard fill edge", () => {
  const fn = TEX.match(/function saddleFlanks[\s\S]*?(?=\n  const \{ drawSpineTop)/);
  assert.ok(fn, "saddleFlanks is still in liverytex.js");
  assert.match(fn[0], /lineCap = "round"/, "rake strokes are round-capped");
  assert.match(fn[0], /Sf\.h \* 0\.045/, "outer same-colour stroke anti-aliases the cut");
  assert.match(fn[0], /F\.fx\(0\.64\)/, "crease station stays 0.64");
  assert.match(fn[0], /F\.fx\(0\.38\)/, "rake foot stays 0.38");
  assert.match(fn[0], /ctx\.fill\(\)/, "solid saddle fill is unchanged");
});

test("inspection contour follows changed fill boundaries only inside actual cover atlas regions", () => {
  const outline = vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/car/surface-outline.js"), "utf8") + ";GarageSurfaceOutline");
  const w = 16, h = 16, a = new Uint8ClampedArray(w*h*4), b = new Uint8ClampedArray(w*h*4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y*w+x)*4; a[i+3] = b[i+3] = 255;
    if ((x >= 4 && x <= 10 && y >= 4 && y <= 10) || x >= 14) for (let c = 0; c < 3; c++) b[i+c] = 25;
  }
  // An adaptive ink flip on the cover is not the selected painted fill.
  for (let c = 0; c < 3; c++) b[(3*w+3)*4+c] = 255;
  const pixels = outline.contour(a,b,w,h,[{ x: 2, y: 2, w: 11, h: 11 }],w,h);
  assert.ok(pixels);
  assert.equal(pixels[(4*w+7)*4+3], 255, "real fill edge is a white contour");
  assert.equal(pixels[(7*w+7)*4+3], 0, "surface interior stays transparent");
  assert.equal(pixels[(3*w+3)*4+3], 0, "derived automatic lettering flip is excluded");
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < 2 || x >= 13 || y < 2 || y >= 13)
    assert.equal(pixels[(y*w+x)*4+3], 0, "no whole-atlas or unrelated-surface contamination");
  assert.equal(outline.contour(a,a,w,h,[{x:0,y:0,w,h}],w,h), null, "no changed fill means no claimed outline");
});

test("inspection probes do not mutate the draft, survive scratch canvas reuse, and retire transient textures", () => {
  const w = 16, h = 16, raster = new Uint8ClampedArray(w*h*4), probes = [], freed = [], textures = [], draws = [];
  const canvas = { width:w, height:h, getContext: () => ({ getImageData: () => ({ data: Uint8ClampedArray.from(raster) }) }) };
  const atlas = {
    SIZE:w, SIZE_H:h, REGIONS:{crest:{x:2,y:2,w:11,h:11}}, fillInert: (key, liv) => key === "bandTint2" && liv.spineLogo !== "tricolour",
    buildAtlas(team, colors, number, player, hiRes) {
      probes.push({ colors, player, hiRes }); raster.fill(0);
      for (let y=4;y<=10;y++) for(let x=4;x<=10;x++) { const i=(y*w+x)*4; for(let c=0;c<3;c++) raster[i+c]=Math.round(colors.spineTint[c]*255); raster[i+3]=255; }
      return canvas;   // the mobile path reuses this same source
    },
  };
  const doc = { createElement: () => { const cv = {width:0,height:0}; cv.getContext = () => ({
    getImageData: () => ({data:new Uint8ClampedArray(cv.width*cv.height*4)}), putImageData(image) { cv.pixels=Uint8ClampedArray.from(image.data); },
  }); return cv; } };
  const outline = vm.runInNewContext(fs.readFileSync(path.join(ROOT,"js/car/surface-outline.js"),"utf8")+";GarageSurfaceOutline",{LiveryTex:atlas,document:doc});
  const api = outline.create({ createTexture(cv) { const tex={pixels:cv.pixels};textures.push(tex);return tex; },freeTexture:(t)=>freed.push(t),drawDecal:(...args)=>draws.push(args) });
  const liv=Object.freeze({spineLogo:"stripe",spineTint:Object.freeze([1,0,0])}), before=JSON.stringify(liv), team={id:"test"};
  assert.equal(api.set("spineTint",team,liv,7),true);
  assert.equal(JSON.stringify(liv),before); assert.equal(probes.length,2);
  assert.notEqual(probes[0].colors,liv); assert.equal(probes[0].player,false);assert.equal(probes[0].hiRes,false);
  assert.ok(textures[0].pixels.some((v,i)=>i%4===3&&v>0),"scratch reuse did not erase the before snapshot");
  const mesh={}, model=[]; assert.equal(api.draw(mesh,model),true);assert.equal(draws[0][0],mesh);assert.equal(draws[0][1],model);
  assert.equal(api.set("bandTint2",team,liv,7),false,"inert tint is honestly camera-only");
  assert.deepEqual(freed,[textures[0]]); assert.equal(api.draw(mesh,model),false);
  assert.equal(api.set("cover",team,liv,7),false,"unsegmented body paint does not claim an atlas outline");
  assert.equal(api.set("spineTint",team,liv,7),true);api.clear();api.clear();
  assert.equal(freed.length,2,"each owned texture retires once on switch/end");assert.equal(api.active(),null);
  atlas.buildAtlas=()=>{throw Error("tainted canvas");};
  assert.equal(api.set("spineTint",team,liv,7),false);assert.equal(api.active(),null);
});
