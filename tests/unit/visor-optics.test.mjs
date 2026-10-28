// visor-optics.test.mjs — the HELMET shield's eye-port and its lighting→visor mapping (js/fx/visor-optics.js),
// driven in a VM with DOM/canvas stubs. Visual-only module: these pin the GEOMETRY (a clear centre and a wide
// port on every aspect), the LIGHT MAPPING (additive terms proportional to the light in the scene, zero in the
// dark; sun and lamp glints projected through the camera so they slide with heading) and the GATES (helmet cam
// only, reflections OFF paints nothing, the port image is rebuilt only when size or tint change). A browser
// capture is the sign-off. Run: node --test tests/unit/visor-optics.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function ctx2d(calls) {
  const grad = { addColorStop() {} };
  return {
    globalAlpha: 1, globalCompositeOperation: "source-over", fillStyle: "", strokeStyle: "", lineWidth: 1,
    clearRect: () => { calls.clear++; }, fillRect() {}, fill() {}, stroke: () => { calls.stroke++; },
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, arc: () => { calls.arc++; },
    moveTo() {}, lineTo() {}, closePath() {},
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {},
  };
}

function load({ helmet = true, visor = "clear", reflections = "light", refraction = "off", beams = 1, color = "neutral", intensity = "light", apex = null, win = { innerWidth: 844, innerHeight: 390 }, picker = undefined, search = "" } = {}) {
  const calls = { clear: 0, stroke: 0, arc: 0, bendMaps: 0, inserted: null, props: {}, attrs: {} };
  const live = { visor };
  const game = { parentNode: { insertBefore: (n) => { calls.inserted = n; } }, nextSibling: null };
  const body = {
    hasAttribute: (k) => k === "data-helmet-cam" && helmet,
    setAttribute: (k, v) => { calls.attrs[k] = v; },
    removeAttribute: (k) => { delete calls.attrs[k]; },
    style: { setProperty: (k, v) => { calls.props[k] = v; }, removeProperty: (k) => { delete calls.props[k]; } },
    appendChild() {},
  };
  const document = {
    body,
    getElementById: (id) => (id === "game" ? game : null),
    createElement: () => ({ width: 0, height: 0, hidden: false, setAttribute() {}, getContext: () => ctx2d(calls), toDataURL: () => { calls.bendMaps++; return "data:,"; } }),
    createElementNS: () => ({ setAttribute() {}, appendChild() {}, style: {}, querySelectorAll: () => [] }),
  };
  class Path2D { constructor(d) { this.d = d; } }
  const listeners = [];
  const lens = { amber: "#503d20", neutral: "rgb(12, 12, 20)", ice: " #233b50 " }[color] || "";   // what css/helmet-visor.css resolves --visor-lens to
  const ctx = vm.createContext({
    Math, Float32Array, Uint8Array, Uint8ClampedArray, Object, Path2D, performance: { now: () => 0 },
    getComputedStyle: () => ({ getPropertyValue: (k) => (k === "--visor-lens" ? lens : "") }),
    document, window: { ...win, __apex: apex, location: { search } }, URLSearchParams, Date,
    CockpitOpts: { visor: () => live.visor, visorReflections: () => reflections, visorRefraction: () => refraction, visorBeams: () => beams, visorColor: () => color, visorIntensity: () => intensity, onWheel: (fn) => listeners.push(fn) },
    GfxQuality: { current: () => "high" },
    ...(picker ? { RendererPicker: picker } : {}),
  });
  seedLog(ctx);
  const V = vm.runInContext(read("js/fx/visor-optics.js") + ";VisorOptics", ctx, { filename: absSrc("js/fx/visor-optics.js") });
  return { V, calls, listeners, live, ctx, win: ctx.window };
}

const DAY = { eye: [0, 1, 0], tgt: [0, 1, -10], fov: 62, sunDir: [0.3, 0.7, -0.65], sunColor: [1.1, 1.0, 0.9], exposure: 1, ambientSky: [0.5, 0.6, 0.8], lights: null, tailStart: 0, floodEmit: 0 };
const NIGHT = { ...DAY, sunDir: [0, -0.4, 0.9], sunColor: [0.02, 0.02, 0.03], ambientSky: [0.01, 0.01, 0.02] };
// One stride-15 lamp at (x, z), 10 m up, aimed down: [x,y,z, r,g,b, rad, dir, cosInner, cosOuter, bleed, vol, glare].
// The colour is the fixture's energy (track-lights.js ePhys sizes a flood in the thousands).
const lamp = (x, z, rgb = [12000, 11500, 10000]) => [x, 10, z, ...rgb, 40, 0, -1, 0, 0.9, 0.5, 0.1, 0, 1];

test("visor public surface drops the unused _reset test hook", () => {
  const { V } = load();
  assert.equal(V._reset, undefined, "VisorOptics._reset had zero callers — removed from the export");
  assert.equal(typeof V.sceneFromG, "function");
  assert.equal(typeof V.stats, "function");
});

test("visor port: a wide aperture with a clear centre on the phone, the desktop and a tall phone", () => {
  const { V } = load();
  for (const [w, h] of [[844, 390], [1920, 1080], [390, 844], [1280, 720]]) {
    const b = V.portBox(w, h);
    assert.ok(b.pw / b.ph >= 1.6, `${w}x${h}: the port is wide (${(b.pw / b.ph).toFixed(2)})`);
    assert.ok(b.pw >= w * 0.9, `${w}x${h}: the port spans the width`);
    assert.ok(b.x0 >= 0 && b.x1 <= w && b.y0 >= 0 && b.y1 <= h, `${w}x${h}: inside the viewport`);
    // The HUD's centre strip — the LCD, the timing row, the track ahead — stays inside the port: on a landscape
    // screen nearly the full height, on a tall phone a wide slot across the middle (a helmet, not a tall oval).
    if (w >= h) assert.ok(b.y0 < h * 0.2 && b.y1 > h * 0.78, `${w}x${h}: the centre column is clear (${b.y0.toFixed(0)}..${b.y1.toFixed(0)} of ${h})`);
    else assert.ok(b.y0 < h * 0.4 && b.y1 > h * 0.6, `${w}x${h}: a slot across the middle (${b.y0.toFixed(0)}..${b.y1.toFixed(0)} of ${h})`);
    const d = V.portPath(w, h);
    const legs = d.replace(/[-\d., ]+/g, "").split("");   // the command letters only: M, then the brow + corners + straight edges, then Z
    assert.deepEqual(legs, ["M", "C", "C", "L", "C", "L", "C", "L", "C", "Z"], "a brow, four rounded corners and three straight edges, closed");
    // The brow is near-straight: its two corner points sit within 8 % of the port height of each other and the apex.
    const nums = d.match(/-?[\d.]+/g).map(Number);
    assert.ok(Math.abs(nums[1] - nums[7]) < 1 && (nums[1] - nums[3]) < b.ph * 0.08, "the brow is a shallow arch, not a dome");
    assert.ok(V.portPath(w, h, 8) !== d, "an inset changes the outline");
  }
  const img = V.portImage(844, 390, { tint: [80, 61, 32], tintAlpha: 0.18 });
  assert.ok(img.startsWith('url("data:image/svg+xml,') && img.includes("fill-opacity='0.18'"), "the tint is baked into the port image");
  assert.ok(!V.portImage(844, 390).includes("rgb(80,61,32)"), "no tint for the clear visor");
});

test("visor mapping: nothing is added in the dark, and every term scales with the reflections level", () => {
  const { V } = load();
  const dark = V.lightMap(NIGHT, 844, 390, { level: 1 });
  assert.equal(dark.sun, null); assert.equal(dark.rim, null); assert.equal(dark.glints.length, 0);
  assert.ok(dark.haze < 0.01 && dark.fringe === 0, "no haze, no fringe without light");
  const day = V.lightMap(DAY, 844, 390, { level: 1, fringe: 1 });
  assert.ok(day.sun && day.sun.k > 0.1, "the sun glints by day");
  assert.ok(day.sun.y < 0 && day.sun.y >= -0.08 * 390, "a high sun glows from the top edge of the shield");
  assert.equal(day.ghost, null, "no ghost for a sun outside the frame");
  const far = V.lightMap({ ...DAY, sunDir: [0, 0.99, -0.14] }, 844, 390, { level: 1 });
  assert.equal(far.sun, null, "a sun 45°+ past the frame no longer reaches the inner shield");
  assert.ok(day.rim && day.rim.k > 0.01, "the rim catches the sun");
  assert.ok(day.haze > 0.02 && day.fringe > 0.05, "sky haze and a chromatic fringe exist by day");
  const strong = V.lightMap(DAY, 844, 390, { level: 1.5, fringe: 1 });
  assert.ok(strong.sun.k > day.sun.k && strong.rim.k > day.rim.k && strong.fringe > day.fringe, "STRONG adds more light");
  const off = V.lightMap(DAY, 844, 390, { level: 0 });
  assert.equal(off.sun, null); assert.equal(off.glints.length, 0);
  assert.ok(V.lightMap(DAY, 844, 390, { level: 1, fringe: 0 }).fringe === 0, "refraction OFF: no fringe");
});

test("visor mapping: the sun's glint sits where the sun is and slides across as the heading turns", () => {
  const { V } = load();
  const ahead = V.lightMap({ ...DAY, sunDir: [0, 0.5, -0.87] }, 844, 390, { level: 1 });
  assert.ok(Math.abs(ahead.sun.x - 422) < 1, "sun dead ahead: glint on the centre line");
  assert.ok(ahead.sun.y < 195, "a sun above the horizon glints above the centre");
  const right = V.lightMap({ ...DAY, sunDir: [0.5, 0.3, -0.81] }, 844, 390, { level: 1 });
  assert.ok(right.sun.x > 500, "sun to the right of the nose: glint to the right");
  assert.ok(right.ghost.x < 344, "its ghost mirrors through the centre");
  assert.ok(right.rim.dx > 0.5, "the rim sheen leans to the sun's side");
  // Turn the car to face the sun: the same world sun now projects to the centre.
  const turned = V.lightMap({ ...DAY, tgt: [5, 1, -7.1], sunDir: [0.5, 0.5, -0.71] }, 844, 390, { level: 1 });
  assert.ok(Math.abs(turned.sun.x - 422) < 20, `facing the sun recentres the glint (${turned.sun.x.toFixed(0)})`);
  const behind = V.lightMap({ ...DAY, sunDir: [0, 0.5, 0.87] }, 844, 390, { level: 1 });
  assert.equal(behind.sun, null, "a sun behind the eye has no glint…");
  assert.equal(behind.rim, null, "…and the helmet shell shades the rim from it (A·W46: it used to peak there)");
  const set = V.lightMap({ ...DAY, sunDir: [0, -0.2, -0.98] }, 844, 390, { level: 1 });
  assert.equal(set.sun, null); assert.equal(set.rim, null);
  // God rays only for a sun in the frame, anchored on its glint; none for the high sun that only glows at the rim.
  assert.ok(ahead.rays && ahead.rays.x === ahead.sun.x && ahead.rays.k > 0.05, "a sun in the frame streaks across the shield");
  assert.equal(V.lightMap(DAY, 844, 390, { level: 1 }).rays, null, "a sun past the frame edge has no rays");
});

test("visor sun-behind (A·W46): no glare from a sun behind the eye; lamps glint against the daylight they compete with", () => {
  const { V } = load();
  // sunFacing: the sun direction's forward component → how much of it reaches the shield.
  assert.equal(V.sunFacing(-1), 0, "sun straight behind: nothing");
  assert.equal(V.sunFacing(-0.5), 0, "~120° off the nose: nothing");
  assert.equal(V.sunFacing(0.2), 1); assert.equal(V.sunFacing(1), 1, "ahead and just past level: full");
  assert.ok(V.sunFacing(0) > 0.6 && V.sunFacing(0) < 0.8, "level with the eye: most of it (it rakes the shield)");
  for (let z = -1; z < 1; z += 0.05) assert.ok(V.sunFacing(z + 0.05) >= V.sunFacing(z), "monotonic in the forward component");
  // A low dusk sun (COTA's start straight at dusk, measured): behind → no rim, no glint; ahead → the shipped glint.
  const DUSK = { ...DAY, sunDir: [0, 0.094, -0.996], sunColor: [1.068, 0.618, 0.202], exposure: 1.03, ambientSky: [0.209, 0.246, 0.3] };
  for (const lv of [0.6, 1, 1.6]) {
    const behind = V.lightMap({ ...DUSK, sunDir: [0, 0.094, 0.996] }, 844, 390, { level: lv });
    assert.equal(behind.sun, null); assert.equal(behind.rays, null); assert.equal(behind.rim, null, `level ${lv}: no rim sheen from a sun behind`);
  }
  const ahead = V.lightMap(DUSK, 844, 390, { level: 1 });
  assert.ok(ahead.sun && ahead.sun.k > 1 && ahead.rays, "a low sun ahead still blinds: glint and rays kept");
  // lampAdapt: night keeps every lamp glint; a dusk sky dims them to about a third; brighter keeps falling.
  assert.equal(V.lampAdapt(0), 1); assert.equal(V.lampAdapt(0.14), 1, "night (moon key + sky ≈ 0.14) is untouched");
  assert.ok(V.lampAdapt(0.95) > 0.25 && V.lampAdapt(0.95) < 0.35, `dusk ≈ 0.3 (${V.lampAdapt(0.95).toFixed(2)})`);
  assert.ok(V.lampAdapt(1.5) < V.lampAdapt(0.95), "more daylight, fainter glints");
  // The same pit-lane lamps ahead: full glints at night, few and faint at dusk.
  const lamps = [...lamp(-3, -20, [400, 300, 200]), ...lamp(3, -25, [400, 300, 200]), ...lamp(0, -35, [400, 300, 200])];
  const night = V.lightMap({ ...NIGHT, lights: lamps }, 844, 390, { level: 1 });
  const dusk = V.lightMap({ ...DUSK, sunDir: [0, 0.094, 0.996], lights: lamps }, 844, 390, { level: 1 });
  assert.equal(night.glints.length, 3, "night: every lamp glints");
  const sum = (m) => m.glints.reduce((a, g) => a + g.k, 0);
  assert.ok(sum(dusk) < sum(night) * 0.4, `dusk: the lamps no longer flood the shield (${sum(dusk).toFixed(2)} vs ${sum(night).toFixed(2)})`);
});

test("visor mapping: a bright flood leaves a beam along its aim; BLOOM AMOUNT and LENS GLARE scale the halos", () => {
  const { V } = load();
  const L = new Float32Array(lamp(0, -40));                       // aimed straight down, 10 m up
  const m = V.lightMap({ ...NIGHT, lights: L }, 844, 390, { level: 1 });
  assert.ok(m.glints[0].beam && m.glints[0].beam.dy > 0.9, "the beam points down the screen, the way the fixture aims");
  const big = V.lightMap({ ...NIGHT, lights: L }, 844, 390, { level: 1, bloom: 2.5 });
  assert.ok(big.glints[0].r > m.glints[0].r, "more bloom: wider halos");
  const soft = new Float32Array(lamp(0, -40, [3000, 3000, 3000]));   // under the clamp, so the knob shows
  const glare = V.lightMap({ ...NIGHT, lights: soft }, 844, 390, { level: 1, glare: 0.3 });
  assert.ok(glare.glints[0].k > V.lightMap({ ...NIGHT, lights: soft }, 844, 390, { level: 1 }).glints[0].k, "more lens glare: brighter cores");
  assert.ok(m.glints[0].star && m.glints[0].star.len > m.glints[0].r * 2, "the brightest flood gets a star flare wider than its halo");
  const many = V.lightMap({ ...NIGHT, lights: new Float32Array(Array.from({ length: 6 }, (_, i) => lamp(i * 3 - 8, -40)).flat()) }, 844, 390, { level: 1 });
  assert.equal(many.glints.filter((g) => g.star).length, 3, "stars on the three brightest only");
  const dim = V.lightMap({ ...NIGHT, lights: new Float32Array(lamp(0, -40, [150, 150, 150])) }, 844, 390, { level: 1 });
  assert.ok(dim.glints.length === 0 || !dim.glints[0].beam, "a weak glint carries no beam");
});

test("visor beams: VISOR BEAMS scales the lamp beams, the sun's rays and the star flares, and OFF keeps the glints alone", () => {
  const { V } = load();
  const L = new Float32Array(lamp(0, -40));
  const med = V.lightMap({ ...NIGHT, lights: L }, 844, 390, { level: 1, beams: V.BEAMS.medium });
  const strong = V.lightMap({ ...NIGHT, lights: L }, 844, 390, { level: 1, beams: V.BEAMS.strong });
  const light = V.lightMap({ ...NIGHT, lights: L }, 844, 390, { level: 1, beams: V.BEAMS.light });
  const off = V.lightMap({ ...NIGHT, lights: L }, 844, 390, { level: 1, beams: V.BEAMS.off });
  assert.ok(strong.glints[0].beam.len > med.glints[0].beam.len && med.glints[0].beam.len > light.glints[0].beam.len, "STRONG > MEDIUM > LIGHT beam length");
  assert.ok(strong.glints[0].beam.k > med.glints[0].beam.k && strong.glints[0].star.k > med.glints[0].star.k, "STRONG: brighter beams and star flares");
  assert.equal(off.glints.length, med.glints.length, "OFF keeps every glint…");
  assert.equal(off.glints[0].beam, null); assert.equal(off.glints[0].star, null);
  assert.ok(Math.abs(off.glints[0].k - med.glints[0].k) < 1e-9 && off.glints[0].r === med.glints[0].r, "…at the same brightness and size: beams never touch the glints");
  const sunIn = { ...DAY, sunDir: [0, 0.5, -0.87] };
  assert.ok(V.lightMap(sunIn, 844, 390, { level: 1, beams: V.BEAMS.strong }).rays.len > V.lightMap(sunIn, 844, 390, { level: 1, beams: V.BEAMS.medium }).rays.len, "STRONG: longer god rays");
  assert.equal(V.lightMap(sunIn, 844, 390, { level: 1, beams: 0 }).rays, null, "OFF: no god rays, the sun's glint stays");
  assert.ok(V.lightMap(sunIn, 844, 390, { level: 1, beams: 0 }).sun.k > 0.1);
  assert.ok(V.lightMap(sunIn, 844, 390, { level: 1, beams: NaN }).rays, "a non-numeric level falls back to MEDIUM");
  // The tick reads the cockpit slider (a 0..2 factor): 0 still paints the glints (the layer is not the reflections
  // gate); a level word from an old URL or a stub maps through BEAMS; a slider drag never rebuilds the port image.
  const apex = { visorScene: () => ({ ...NIGHT, lights: L }) };
  const noBeams = load({ apex, beams: 0 });
  noBeams.V.tick(1 / 60, true, 0, false);
  assert.ok(noBeams.V.stats().paints === 1 && noBeams.V.stats().glints >= 1, "VISOR BEAMS 0 %: the glints still paint");
  const word = load({ apex, beams: "off" });
  word.V.tick(1 / 60, true, 0, false);
  assert.ok(word.V.stats().paints === 1 && word.V.stats().glints >= 1, "a level word still reads");
  const { V: live, calls, listeners } = load({ apex, beams: 2 });
  live.tick(1 / 60, true, 0, false);
  const port = calls.props["--visor-port"];
  for (const fn of listeners) fn("visorBeams", 1.5);
  live.tick(1 / 60, true, 0, false);
  assert.equal(calls.props["--visor-port"], port, "a beams change does not rebuild the port image…");
  assert.equal(live.stats().paints, 2, "…but repaints the light at once");
});

test("visor mapping: lamps glint where they project, the brightest first, capped and with tail-lights in their colour", () => {
  const { V } = load();
  const L = new Float32Array([...lamp(-6, -40), ...lamp(6, -40), ...lamp(0, 30), ...lamp(0, -120, [400, 400, 400]), ...lamp(0, -25, [9000, 600, 600])]);
  const m = V.lightMap({ ...NIGHT, lights: L }, 844, 390, { level: 1 });
  assert.ok(m.glints.length >= 3 && m.glints.length <= V.MAX_GLINTS, `glints: ${m.glints.length}`);
  assert.ok(m.glints.every((g) => g.x > -130 && g.x < 974), "every glint is on or just off the frame");
  const left = m.glints.find((g) => g.x < 400), rightG = m.glints.find((g) => g.x > 444);
  assert.ok(left && rightG, "the pair of lamps sits either side of the nose");
  for (let i = 1; i < m.glints.length; i++) assert.ok(m.glints[i - 1].k >= m.glints[i].k, "brightest first");
  const red = m.glints.find((g) => g.rgb[0] === 255 && g.rgb[1] < 40);
  assert.ok(red, "a tail-light glints red");
  assert.ok(!m.glints.some((g) => g.y > 390), "a lamp behind the eye never glints (nothing projects below the frame)");
  assert.ok(m.glints[0].k > 0.3 && m.glints[0].k <= 1.2, `a flood 40 m out is a clear glint (${m.glints[0].k.toFixed(2)})`);
  const dim = V.lightMap({ ...NIGHT, lights: new Float32Array(lamp(0, -120, [400, 400, 400])) }, 844, 390, { level: 1 });
  assert.equal(dim.glints.length, 0, "a weak fixture 120 m out adds nothing");
  // The nearer lamp smears wider; a far dim one is dropped or a pinprick.
  assert.ok(red.r >= m.glints[m.glints.length - 1].r, "near lamps smear wider than far ones");
  const many = new Float32Array(Array.from({ length: 20 }, (_, i) => lamp(i - 10, -30 - i * 4)).flat());
  assert.equal(V.lightMap({ ...NIGHT, lights: many }, 844, 390, { level: 1 }).glints.length, V.MAX_GLINTS, "capped");
});

test("visor tick: helmet cam only, the port image per size and tint, reflections OFF paints nothing", () => {
  const apex = { visorScene: () => DAY };
  const { V, calls } = load({ apex });
  V.tick(1 / 60, true, 0, false);
  assert.ok(calls.inserted && calls.inserted.id === "fx-visor", "the canvas is built beside #game");
  assert.ok(calls.attrs["data-visor-port"] === "1" && String(calls.props["--visor-port"]).startsWith('url("data:image/svg+xml,'), "the port image lands on body");
  assert.equal(calls.inserted.hidden, false, "the light layer shows");
  assert.ok(V.stats().paints >= 1 && V.stats().sun > 0, "the first tick paints (a resize paints at once)");
  const portBefore = calls.props["--visor-port"];
  for (let i = 0; i < 30; i++) V.tick(1 / 60, true, 0, false);
  assert.equal(calls.props["--visor-port"], portBefore, "the port image is not rebuilt per frame");
  assert.ok(V.stats().paints < 12, `~15 Hz, not 60 (${V.stats().paints} paints in 31 frames)`);
  V.tick(0, true, 0, false);
  const p = V.stats().paints;
  V.tick(0, true, 0, false);
  assert.equal(V.stats().paints, p, "paused keeps the last paint");

  const off = load({ apex, reflections: "off" });
  off.V.tick(1 / 60, true, 0, false);
  assert.ok(off.calls.attrs["data-visor-port"] === "1", "the eye-port stands with reflections OFF…");
  assert.equal(off.V.stats().paints, 0, "…and nothing is painted");
  const none = load({ apex, visor: "off" });
  none.V.tick(1 / 60, true, 0, false);
  assert.equal(none.V.stats().paints, 0, "visor OFF: no light layer");
  assert.equal(none.calls.attrs["data-visor-port"], undefined, "visor OFF: no eye-port frame (Bryce: OFF kept the oval)");
  assert.equal(none.calls.props["--visor-port"], undefined, "…and no port image");
  const chase = load({ apex, helmet: false });
  chase.V.tick(1 / 60, true, 0, false);
  assert.equal(chase.calls.attrs["data-visor-port"], undefined, "not a helmet cam: no port, no paint");
  assert.equal(chase.V.stats().paints, 0);
  const smoke = load({ apex, visor: "smoke", color: "amber", intensity: "strong" });
  smoke.V.tick(1 / 60, true, 0, false);
  assert.ok(String(smoke.calls.props["--visor-port"]).includes("rgb(80,61,32)"), "TINTED amber bakes the lens colour into the port");
  assert.ok(smoke.V.stats().sun > V.stats().sun, "a tinted lens reflects harder");
});

test("visor tick: switching HELMET VISOR to OFF mid-race takes the oval eye-port down (and CLEAR brings it back)", () => {
  const apex = { visorScene: () => DAY };
  const { V, calls, listeners, live } = load({ apex, visor: "clear" });
  V.tick(1 / 60, true, 0, false);
  assert.equal(calls.attrs["data-visor-port"], "1", "CLEAR: the eye-port stands");
  live.visor = "off";
  for (const fn of listeners) fn("visor", "off");
  V.tick(1 / 60, true, 0, false);
  assert.equal(calls.attrs["data-visor-port"], undefined, "OFF: the stale port attribute is cleared");
  assert.equal(calls.props["--visor-port"], undefined, "OFF: the port image is cleared");
  live.visor = "clear";
  for (const fn of listeners) fn("visor", "clear");
  V.tick(1 / 60, true, 0, false);
  assert.equal(calls.attrs["data-visor-port"], "1", "back to CLEAR: rebuilt");
  // css/hud.css's static frame (the no-JS / first-frame fallback) is keyed off the same choice.
  assert.match(read("css/hud.css"), /body\[data-helmet-cam\]:not\(\[data-helmet-visor="off"\]\) #hud::before \{/, "the static oval frame skips visor OFF");
});

test("visor tick: falls back to camState + lightState without visorScene, and reads nothing without __apex", () => {
  const apex = { camState: () => ({ eye: DAY.eye, tgt: DAY.tgt, fov: 62 }), lightState: () => ({ skySunDir: DAY.sunDir, sunColor: DAY.sunColor, exposure: 1, ambientSky: DAY.ambientSky, floodEmit: 0 }) };
  const { V } = load({ apex });
  V.tick(1 / 60, true, 0, false);
  assert.ok(V.stats().sun > 0 && V.stats().glints === 0, "the fallback has the sun but no lamp positions");
  const bare = load({ apex: null });
  bare.V.tick(1 / 60, true, 0, false);
  assert.equal(bare.V.stats().paints, 0, "no agent API: the port stands, the light layer waits");
  assert.ok(bare.calls.attrs["data-visor-port"] === "1");
});

test("visor tick: a bad knob or a throwing canvas never reaches the render loop", () => {
  const apex = { visorScene: () => DAY, lightTune: () => ({ bloomMul: "nope", glareStr: null }) };
  const { V } = load({ apex });
  V.tick(1 / 60, true, 0, false);
  assert.ok(V.stats().paints === 1 && V.stats().errors === 0, "a non-numeric knob falls back to the shipped default");
  const boom = load({ apex: { visorScene: () => ({ ...DAY, sunColor: [NaN, NaN, NaN] }) } });
  assert.doesNotThrow(() => boom.V.tick(1 / 60, true, 0, false), "a NaN scene paints nothing and throws nothing");
});

test("visor tint: the lens colour is the resolved --visor-lens token (css/tokens.css), the table only as a fallback", () => {
  assert.deepEqual([...load({ color: "amber" }).V.tintRGB("amber")], [80, 61, 32], "#rrggbb");
  assert.deepEqual([...load({ color: "neutral" }).V.tintRGB("neutral")], [12, 12, 20], "rgb()");
  assert.deepEqual([...load({ color: "ice" }).V.tintRGB("ice")], [35, 59, 80], "whitespace around the token");
  assert.deepEqual([...load({ color: "rose" }).V.tintRGB("rose")], [76, 45, 60], "an unresolved token falls back to the table");
});

test("visor clear (audit4 R1): Droplets.clear() at race exit takes the light layer down with the water", () => {
  // render() stops ticking Droplets (and so VisorOptics) in menu/results, so the last paint stayed over Home.
  const { V, calls, ctx } = load({ apex: { visorScene: () => DAY } });
  V.tick(1 / 60, true, 0, false);
  assert.equal(V.stats().shown, true, "racing in helmet cam: the layer shows");
  const D = vm.runInContext(read("js/fx/droplets.js") + ";Droplets", ctx, { filename: absSrc("js/fx/droplets.js") });
  D.clear();
  assert.equal(V.stats().shown, false, "Droplets.clear() hides the visor layer");
  assert.equal(calls.inserted.hidden, true, "…and its canvas");
});

test("visor size (audit4 R2): turning the visor ON mid-helmet sizes the new canvas before its first paint", () => {
  const { V, calls, listeners, live } = load({ apex: { visorScene: () => DAY }, visor: "off" });
  V.tick(1 / 60, true, 0, false);                     // visor OFF: _size records the viewport, no canvas yet
  live.visor = "clear";
  for (const fn of listeners) fn("visor", "clear");
  V.tick(1 / 60, true, 0, false);
  assert.ok(calls.inserted, "the canvas is built");
  assert.equal(calls.inserted.width, 844, "the first paint lands on a viewport-sized store, not 300x150");
  assert.ok(V.stats().paints >= 1, "and it paints at once");
});

test("visor refraction: the rim bend map and its three filters are built once per size when refraction is on", () => {
  const apex = { visorScene: () => DAY };
  const { V } = load({ apex, refraction: "medium" });
  V.tick(1 / 60, true, 0, false);
  assert.equal(V.stats().bend, "medium", "the displacement map is built for the port");
  const { V: off } = load({ apex, refraction: "off" });
  off.tick(1 / 60, true, 0, false);
  assert.equal(off.stats().bend, "", "refraction OFF builds no map");
});

test("visor refraction builds and resizes with reflections OFF in a fresh helmet session", () => {
  const { V, calls, win } = load({ reflections: "off", refraction: "medium" });
  V.tick(1 / 60, true, 0, false);
  assert.equal(V.stats().bend, "medium", "the world filter exists without reflection painting");
  assert.equal(calls.bendMaps, 1);
  assert.equal(calls.inserted, null, "no reflection canvas is needed");
  assert.equal(V.stats().paints, 0);
  V.tick(1 / 60, true, 0, false);
  assert.equal(calls.bendMaps, 1, "unchanged viewport reuses the map");
  win.innerWidth = 390; win.innerHeight = 844;
  V.tick(0, true, 0, false);
  assert.equal(calls.bendMaps, 2, "paused resize rebuilds the map for the new aperture");
  assert.equal(V.stats().paints, 0, "reflections stay off after resize");
});

test("visor blend (#3657): plus-lighter on WebGPU only; WebGL2, GLX and an unknown backend composite as plain over", () => {
  const apex = { visorScene: () => DAY };
  const arm = (picker, search) => { const r = load({ apex, picker, search }); r.V.tick(1 / 60, true, 0, false); return r; };
  const gpu = arm({ liveThreeApi: () => "webgpu", liveBackend: () => "three" });
  assert.equal(gpu.calls.attrs["data-visor-blend"], "add", "TLX on WebGPU keeps the additive blend");
  assert.equal(gpu.V.stats().blend, "add");
  assert.equal(arm({ liveThreeApi: () => null, liveBackend: () => "webgpu" }).calls.attrs["data-visor-blend"], "add", "WGX is WebGPU too");
  assert.equal(arm({ liveThreeApi: () => "webgl2", liveBackend: () => "three" }).calls.attrs["data-visor-blend"], "over", "TLX on WebGL2: over");
  assert.equal(arm({ liveThreeApi: () => null, liveBackend: () => "webgl2" }).calls.attrs["data-visor-blend"], "over", "GLX: over");
  assert.equal(arm(undefined).calls.attrs["data-visor-blend"], "over", "no picker loaded: over");
  assert.equal(arm({ liveThreeApi: () => { throw new Error("mid-boot"); } }).calls.attrs["data-visor-blend"], "over", "a throwing picker: over");
  assert.equal(arm({ liveThreeApi: () => "webgl2" }, "?visorblend=add").calls.attrs["data-visor-blend"], "add", "?visorblend=add forces the old arm on WebGL2");
  assert.equal(arm({ liveThreeApi: () => "webgpu" }, "?apex=1&visorblend=over").calls.attrs["data-visor-blend"], "over", "?visorblend=over forces it on WebGPU");
  assert.equal(arm({ liveThreeApi: () => "webgl2" }, "?visorblend=bogus").calls.attrs["data-visor-blend"], "over", "an unknown value is ignored");
  const off = load({ apex, visor: "off", picker: { liveThreeApi: () => "webgl2" } });
  off.V.tick(1 / 60, true, 0, false);
  assert.equal(off.calls.attrs["data-visor-blend"], undefined, "visor OFF never touches the blend");
  for (const [api, param, want] of [["webgpu", null, "add"], ["webgl2", null, "over"], [null, null, "over"], ["webgl2", "add", "add"]]) {
    assert.equal(gpu.V.blendMode(api, param), want, `blendMode(${api}, ${param})`);
  }
  const css = read("css/helmet-visor.css");
  assert.match(css, /body\[data-visor-blend="over"\] #fx-visor \{ mix-blend-mode: normal; \}/, "the stylesheet drops the blend on the over arm");
});
