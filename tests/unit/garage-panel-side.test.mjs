// SETTINGS › APPEARANCE › GARAGE — PANEL SIDE / PANEL WIDTH / PANEL / STAT BARS.
// The CSS docks #cs-inner on either edge; js/garage/setup-camera.js panelCover
// says which way the panel leaves the car its room, and the lens shift moves
// the car into the free half. The RIGHT dock is the shipped default and must
// stay numerically identical, so most of this file pins that.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const ctx = vm.createContext({ PhysicsConsts: { X_OPEN_RATE: 1, X_CLOSE_RATE: 1 } });
vm.runInContext(read("js/garage/setup-camera.js"), ctx);
const { panelCover, presentOpts, glareScale } = vm.runInContext("SetupCamera", ctx);
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const noCam = () => { throw new Error("camTop must only be read on the portrait axis"); };
const CANVAS = rect(0, 0, 1440, 900);

test("a RIGHT dock returns the same unsigned fraction it always did", () => {
  for (const w of [0, 120, 410, 540, 1100, 1440]) {
    const c = panelCover(rect(1440 - w, 0, w, 900), CANVAS, 1440, 900, noCam);
    const old = Math.min(Math.max(w / 1440, 0), 0.85);   // the pre-side clamp(pr.width / cw, 0, 0.85)
    assert.equal(c.x, old, `width ${w}`);
    assert.ok(!Object.is(c.x, -0), "a right dock never goes negative, not even -0");
    assert.equal(c.y, 0);
  }
});

test("a LEFT dock is the exact mirror, so the car lands in the right half", () => {
  for (const w of [120, 410, 540, 1300]) {
    const r = panelCover(rect(1440 - w, 0, w, 900), CANVAS, 1440, 900, noCam);
    const l = panelCover(rect(0, 0, w, 900), CANVAS, 1440, 900, noCam);
    assert.equal(l.x, -r.x, `width ${w}`);
    assert.ok(l.x < 0);
    // GarageScene.recentre targets NDC -panelFrac: the centre of the uncovered
    // span [-1 + 2f, 1] for a left dock, [-1, 1 - 2f] for a right one.
    const f = Math.abs(l.x);
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} vs ${b}`);
    near(-l.x, ((-1 + 2 * f) + 1) / 2);
    near(-r.x, (-1 + (1 - 2 * f)) / 2);
  }
});

test("the side is judged against the canvas's own rect, not x = 0", () => {
  const off = rect(100, 0, 1440, 900);
  assert.ok(panelCover(rect(100, 0, 500, 900), off, 1440, 900, noCam).x < 0);
  assert.ok(panelCover(rect(1040, 0, 500, 900), off, 1440, 900, noCam).x > 0);
});

test("portrait keeps its vertical band and reads the camera panel lazily", () => {
  let reads = 0;
  const c = panelCover(rect(0, 0, 393, 597), rect(0, 0, 393, 852), 393, 852, () => { reads++; return 700; });
  assert.equal(reads, 1);
  assert.equal(c.x, 0);
  assert.equal(c.y, (597 + 700 - 852) / 852);
});

test("the fit takes the magnitude; the lens shift and recentre keep the sign", () => {
  const cam = read("js/garage/setup-camera.js");
  assert.match(cam, /gfx\.aspect \* \(1 - Math\.abs\(panelFrac\)\), 0\.05\)\)/,
    "a signed fraction in (1 - panelFrac) would widen the fit past 1 for a left dock");
  assert.doesNotMatch(cam, /\(1 - panelFrac\)/);
  assert.match(cam, /_spProj\[8\] = panelFrac;/);
  assert.match(cam, /GarageScene\.recentre\(_spProj, _spView, _spVP, panelFrac,/);
  assert.match(read("js/garage/scene.js"), /proj\[8\] \+= \(lo \+ hi\) \/ 2 \+ panelFrac;/,
    "recentre must stay symmetric in the sign (target -panelFrac)");
});

test("a Home photo uses manual distance and aim while the background retains automatic framing", () => {
  const src = read("js/garage/setup-camera.js");
  const start = src.indexOf('  const canvasEl = $("game"), panelEl =');
  const end = src.indexOf('  const context = garageCtx(), sceneTime', start);
  assert.ok(start > 0 && end > start, 'the real camera framing segment must be available');
  const frame = src.slice(start, end);
  for (const aspect of [1440 / 900, 900 / 1440]) {
    const photo = { hidden: false }, game = { clientWidth: 0, clientHeight: 0 };
    let recentre = null, fitCalls = 0;
    const sandbox = { $: id => id === 'photo-studio' ? photo : id === 'game' ? game : null,
      home: { active: true, panel: null, lens: {} }, gfx: { aspect }, setupPreviewSpin: false,
      setupPreviewDist: 4.6, setupPreviewAz: 1, setupPreviewEl: .4, spCe: Math.cos(.4), spSe: Math.sin(.4),
      setupPreviewOrbit: [0, .45, .245], setupPreviewTgt: [0, .45, .245], setupPreviewPan: [.5, 0, -.4],
      arriving: null, _spHull: [], getSetupPreviewMesh() {}, SP_FIT_DIST_MAX: 11, SP_FIT_HALF_W: 3.10, SP_DIST_MIN: 4.6, SP_DIST_MAX: 15,
      clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), _spAim: [], _spProj: [], _spView: [], _spVP: [], _spInvProj: [],
      _spEye: [0, 0, 0], _spUp: [0, 1, 0],
      M4: { perspectiveTo() {}, lookAtTo() {}, mulTo() {}, invertTo() {} },
      GarageExperience: { fitHome() { fitCalls++; return { dist: 11, shiftX: .5, shiftY: 0 }; } },
      GarageScene: { recentre(_p, _v, _vp, _frac, enabled) { recentre = enabled; } } };
    const context = vm.createContext(sandbox);
    const render = () => vm.runInContext('(function () {' + frame + ';return { distance: spDist, aim: _spAim.slice() }; })()', context);
    const manual = render();
    assert.equal(manual.distance, 4.6, `manual zoom at aspect ${aspect}`);
    assert.deepEqual(Array.from(manual.aim), [.5, .45, -.15500000000000003]);
    assert.equal(recentre, false, 'manual aim cannot be shifted by silhouette fitting');
    assert.equal(fitCalls, 0);
    photo.hidden = true;
    assert.ok(render().distance > 4.6, 'the regular Home background still fits the car');
    assert.equal(recentre, true);
  }
});

test("the GARAGE look rules keep the car's floor and stay out of portrait", () => {
  const css = read("css/carsetup.css");
  // PANEL WIDTH scales the cap only — both variants keep the 410 floor and the car reserve.
  for (const reserve of ["320px", "420px"]) {
    assert.ok(css.includes(`clamp(410px, calc(100 * var(--vwz) - ${reserve} / var(--ui-scale)), calc(420px * var(--look-garage-pw, 1)))`),
      `PANEL WIDTH (${reserve} reserve) must keep the floor and the car's reserve`);
  }
  assert.match(css, /:root\[data-look-garage-side="left"\] #carsetup \{ place-items: stretch start; \}/);
  const stack = /@media \(orientation: landscape\) \{\s*:root\[data-look-garage-side="left"\] #carsetup #cs-stack \{([^}]*)\}/.exec(css);
  assert.ok(stack, "the mirrored camera stack is landscape-only: portrait spans the car band");
  assert.match(stack[1], /right: auto;/);
  assert.match(stack[1], /left: calc\(var\(--safe-l\) \+ var\(--cs-sheet-w\) \* var\(--sheet-eff-scale, var\(--ui-scale\)\) \+ var\(--gap\)\)/,
    "mirror the shipped right: expression, effective scale included");
  assert.match(css, /:root\[data-look-garage-glass="solid"\] #carsetup #cs-inner \{ background: var\(--carbon\); \}/);
  assert.match(css, /:root\[data-look-garage-glass="glass"\]:not\(\[data-ui-contrast="high"\]\) #carsetup #cs-inner \{/);
  assert.match(css, /:root\[data-look-garage-stats="hide"\] #carsetup #cs-stats-inner \{ display: none; \}/);
});

test("REAR-WING sits back and slightly above the wing", () => {
  const cam = read("js/garage/setup-camera.js");
  const m = /wingRear:\s*\{[^}]*el:\s*([0-9.]+)[^}]*dist:\s*([0-9.]+)/.exec(cam);
  assert.ok(m, "wingRear must stay a named SP_VIEWS entry");
  assert.ok(Number(m[1]) >= 0.46, `el ${m[1]} still frames too low`);
  assert.ok(Number(m[2]) >= 4.2, `dist ${m[2]} still sits too close`);
});

test("garage present routes through Lighting Tuner multipliers", () => {
  assert.equal(typeof presentOpts, "function");
  assert.equal(typeof glareScale, "function");
  const def = presentOpts({
    exposureMul: 1, bloomMul: 1, threshOff: 0, sunShaftMul: 1, glareStr: 0.12,
  });
  // presentOpts returns a per-frame scratch — capture scalars before the next call.
  const defExposure = def.exposure, defBloom = def.bloom, defThreshold = def.threshold;
  assert.ok(defExposure > 0.92 && defExposure < 1.12,
    `default garage exposure ${defExposure} should sit near 1, not the old 1.28 wash`);
  assert.ok(defBloom > 0.10 && defBloom < 0.32,
    `default garage bloom ${defBloom} should be a studio amount, not the old 0.70`);
  assert.ok(defThreshold >= 0.75,
    `threshold ${defThreshold} must sit above mid-grey so fixtures do not bloom the bay`);
  assert.equal(def.contact, 0);
  assert.ok(def.tune && Number.isFinite(def.tune.sunShaftMul));
  // A closed bay has no sun disc — screen sun-shafts from the roof fill wash
  // liveries after orbit / team switch. Force off even when the race slider is hot.
  assert.equal(def.tune.sunShaftMul, 0,
    `garage sunShaftMul must stay 0 (got ${def.tune.sunShaftMul})`);
  const hot = presentOpts({
    exposureMul: 1.5, bloomMul: 2, threshOff: 0, sunShaftMul: 2.5, glareStr: 0.24,
  });
  assert.ok(Math.abs(hot.exposure - defExposure * 1.5) < 1e-9);
  assert.ok(Math.abs(hot.bloom - defBloom * 2) < 1e-9);
  assert.equal(hot.tune.sunShaftMul, 0,
    "hot race sunShaftMul must not reopen garage shafts");
  assert.equal(glareScale({ glareStr: 0.12 }), 1);
  assert.equal(glareScale({ glareStr: 0 }), 0);
  assert.ok(Math.abs(glareScale({ glareStr: 0.24 }) - 2) < 1e-9);
});

test("INTER and WET tyre chips take their ink from the compound visual.band", () => {
  const sheet = read("js/garage/setup-sheet.js");
  assert.match(sheet, /opt\.wetTread && opt\.visual && opt\.visual\.band/,
    "wet compounds paint the chip from visual.band, not the gold exclusive tag");
  assert.match(sheet, /tg\.style\.color = "rgb\(" \+ r \+ "," \+ g \+ "," \+ b \+ "\)"/);
});

test("the garage frame calls presentOpts and glareScale; the race path still owns LT", () => {
  const cam = read("js/garage/setup-camera.js");
  assert.match(cam, /gfx\.present\(presentOpts\(/);
  assert.match(cam, /glareScale\(/);
  assert.doesNotMatch(cam, /gfx\.present\(SP_PRESENT\)/);
  assert.doesNotMatch(cam, /spMat\.clearcoat = 0\.1/,
    "paint must not be matted to hide a present wash");
  // The bay sky fill is not a sun disc — presentOpts must zero screen shafts
  // (a scale factor left enough energy to wash Ferrari/RBR/AM after orbit).
  assert.match(cam, /_presentTune\.sunShaftMul\s*=\s*0/);
  assert.doesNotMatch(cam, /SP_SHAFT_SCALE/);
  const game = read("js/game.js");
  assert.match(game, /po\.exposure = frame\.exposure \* LT\.exposureMul/);
  assert.match(game, /po\.tune = LT;/);
  assert.doesNotMatch(game, /presentOpts\(/);
});

// bug-hunt 9.11 (a)+(b): the wall "wins" counter was cached by results.length
// alone (stale after switching to another slot with the same count), and
// Career.sponsor() + CareerExperience.garageMetadata() (Career.state() + totals)
// ran on every garage frame in a career.
function garageCtxHarness() {
  const src = read("js/garage/setup-camera.js");
  const start = src.indexOf("const _garageCtx = {");
  const end = src.indexOf("function captureCamera", start);
  assert.ok(start > 0 && end > start, "the real garageCtx segment must be available");
  const calls = { sponsor: 0, meta: 0 };
  const store = { rev: 1 };
  let career = null;
  const sandbox = {
    Career: { inCareer: () => !!career, data: () => career, sponsor() { calls.sponsor++; return { type: "pts" }; } },
    CareerExperience: { garageMetadata() { calls.meta++; return { active: true, wins: 0 }; } },
    Tracks: { SEASON: [{ id: "a" }, { id: "b" }], LIST: [{ id: "a" }] },
    SeasonCal: { track: () => ({ id: "a" }) },
    G: { store, seasonMode: false, trackIdx: 0, raceWeather: "dry", raceTimeOfDay: "day" },
    home: { active: false, moving: false, mode: "garage" },
    setupPreviewSpin: false, ambientClock: { value: 0 }, garageNow: () => 0, reducedMotion: () => false,
  };
  const ctx = vm.createContext(sandbox);
  const garageCtx = vm.runInContext("(function () {" + src.slice(start, end) + ";return garageCtx; })()", ctx);
  return { garageCtx, calls, store, setCareer(c) { career = c; } };
}
const careerWith = (ps) => ({ season: { round: 1, pts: {} }, team: "t", seat: 0, year: 2026, history: [],
  results: ps.map((p, r) => ({ r, p })) });

test("garage wall wins are keyed on the results array, not just its length", () => {
  const h = garageCtxHarness();
  h.setCareer(careerWith([1, 1, 5]));
  assert.equal(h.garageCtx().wins, 2);
  h.setCareer(careerWith([4, 5, 6]));          // another slot, same result count
  assert.equal(h.garageCtx().wins, 0, "a different results array must recount");
});

test("garage frames memoise the career sponsor + achievements on (store.rev, results, history)", () => {
  const h = garageCtxHarness();
  const c = careerWith([1, 2]);
  h.setCareer(c);
  for (let i = 0; i < 30; i++) h.garageCtx();
  assert.deepEqual(h.calls, { sponsor: 1, meta: 1 }, "30 identical frames derive once");
  h.store.rev++;                                // any save write
  h.garageCtx();
  assert.deepEqual(h.calls, { sponsor: 2, meta: 2 }, "a store write refreshes");
  c.results.push({ r: 2, p: 1 });               // a new result
  h.garageCtx();
  assert.equal(h.calls.meta, 3);
  assert.equal(h.garageCtx().wins, 2, "and the tally follows the pushed win");
});
