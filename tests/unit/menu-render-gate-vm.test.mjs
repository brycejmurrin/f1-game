/* menu-render-gate-vm.test.mjs — what js/game.js's render() gate DOES under a
 * menu, a loading card, the results and the garage preview, and how the menu
 * flyby is scheduled. Replaces the source pins of gfx-backend-canary's "the
 * flyby plays on the pre-race loading screen only" group (#1682 step 3).
 *
 * Two harnesses, both the product's own code:
 *   1. the REAL game (tools/lib/game-vm.cjs): boot, race, results, menu, with
 *      the GLX stub's draw() counted and #game's visibility read;
 *   2. a STATE-LEVEL VM of render()'s gate: the production prefix of
 *      `function render(dt)` up to its `if (!track) return;`, run over a plain
 *      state object, so each ordering (visibility gate → results freeze →
 *      garage preview → no-track return) is asserted by which exit a state
 *      reaches, not by where a line sits in the file.
 * The race-settings half (open / TIME OF DAY / RACE! through raceIntro) lives in
 * race-settings-vm.test.mjs, the tile's settle in select-screen-fixes.test.mjs.
 *
 * Mutation evidence (hand-applied to js/game.js; each turns the named test red):
 *   - `scheduleFlybyTrack();` at boot                       → "the title builds no world"
 *   - `settle ? 400 : 120` → `settle ? 120 : 120`           → "settle"
 *   - drop `|| ((loadingScreen.phase() === "build" …)`      → "a build or busy card"
 *   - drop endRace's `Particles.rainShow(false);`           → "endRace hides the rain"
 *   - drop the results freeze / its `!resultsCam.live()`     → "results keep the last frame"
 *   - `loadingScreen.stop();` after the overlay sweep       → "clearMenuScreens disarms"
 *   - `builtWorldFits` → `() => false`                      → "a repeat build is free"
 *   - drop `!(track && _menuGate.warm > 0) &&`              → "owed warm frames draw hidden"
 *   - drop `&& !warmQueuedHere`                             → "owed warm frames draw hidden"
 *   - move `if (!track) return;` above the gate             → "no-track: hidden"
 *   - move the results freeze below the garage preview      → "results freeze precedes the preview"
 *   - drop `!loadingScreen.active() ||` / `MenuTeardown.cover` → "the flyby shows on the loading screen only"
 *
 * Run: node --test tests/unit/menu-render-gate-vm.test.mjs   (~20 s)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { gameSource } from "../helpers/game-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const PLANES = () => Array.from({ length: 6 }, () => [0, 0, 0, 1]);
/** Count G.gfx.draw calls per pumped frame and read #game's visibility. */
function framer(g) {
  g.ctx.GLX.makeFrustumPlanes = PLANES;   // render() wants six planes; the stub's [] has none
  const canvas = g.sandbox.document.getElementById("game");
  let draws = 0;
  const gfx = g.G.gfx, draw = gfx.draw;
  gfx.draw = function () { draws++; return draw.apply(this, arguments); };
  let now = g.sandbox.performance.now();
  return () => { draws = 0; now += 16.7; g.pumpFrame(now); return { vis: canvas.style.visibility, draws }; };
}
const newTimers = (g, fn) => {
  const before = new Set(g._timers.snapshot().map((r) => r.id));
  const t0 = g.sandbox.performance.now();
  fn();
  return g._timers.snapshot().filter((r) => !before.has(r.id)).map((r) => Math.round(r.at - t0));
};

// ── 1. the real game ─────────────────────────────────────────────────────────

test("the title builds no world: its frame hides #game and draws nothing; the flyby timer settles 400 ms, else 120 ms", async () => {
  const g = await createGame({ track: null });
  try {
    const G = g.G, T = g.ctx.Tracks;
    const builds = [];
    for (const k of ["build", "buildPaced"]) {
      const f = T[k];
      T[k] = function (def) { builds.push(k + ":" + def.id); return f.apply(this, arguments); };
    }
    const frame = framer(g);
    for (let i = 0; i < 20; i++) { g.flushTimers(); frame(); await new Promise((r) => setImmediate(r)); }
    assert.equal(G.state, "menu");
    assert.deepEqual(builds, [], "nothing at the title asks for a world");
    assert.equal(G.track, null);
    assert.deepEqual(frame(), { vis: "hidden", draws: 0 }, "an undrawn title canvas is hidden, not a black or stale frame");

    g.sandbox.document.getElementById("select").hidden = false;
    G.trackIdx = T.LIST.findIndex((d) => d.id === "spa");
    assert.deepEqual(newTimers(g, () => G.scheduleFlybyTrack(true)), [400], "a settled tile pre-builds after 400 ms");
    assert.deepEqual(newTimers(g, () => G.scheduleFlybyTrack()), [120], "RACE SETTINGS and its chips after 120 ms");
  } finally { g.close(); }
});

test("a build or busy card hides #game even mid-race, and the race frame comes back after it", async () => {
  const g = await createGame({ track: "monza" });
  try {
    g.apex.headless(false);
    const frame = framer(g);
    g.step(20);
    const race = frame();
    assert.equal(race.vis, "", "a race frame is shown");
    assert.ok(race.draws > 0, "and drawn");
    const LS = g.G.loadingScreen, phase = LS.phase;
    for (const p of ["build", "busy"]) {
      LS.phase = () => p;
      try { assert.deepEqual(frame(), { vis: "hidden", draws: 0 }, `a ${p} card shows no circuit behind it`); }
      finally { LS.phase = phase; }
    }
    assert.equal(frame().vis, "", "the card down, the race shows again");
  } finally { g.close(); }
});

test("endRace hides the rain overlay; the results keep the last frame unless the results camera is live", async () => {
  const g = await createGame({ track: "monza", wx: "rain" });
  try {
    const G = g.G;
    g.apex.headless(false);
    const frame = framer(g);
    // Particles is frozen: rebind the global to a copy whose rainShow records.
    const P = vm.runInContext("Particles", g.ctx), rain = [];
    g.ctx.Particles = Object.assign({}, P, { rainShow: (on) => { rain.push(on); return P.rainShow(on); } });
    g.step(20);
    G.gfx.isMobile = true;                          // ResultsCam stands down on a phone: no chequered/orbit
    rain.length = 0;
    G.endRace();
    g.ctx.Particles = P;
    assert.equal(G.state, "results");
    assert.ok(rain.length > 0 && rain[rain.length - 1] === false, `endRace hides the rain overlay (${rain})`);
    assert.deepEqual(frame(), { vis: "", draws: 0 }, "results: the last race frame stays up, nothing is redrawn");
    G.setupPreviewOn = true;
    try { assert.equal(frame().draws, 0, "a garage-preview flag does not start drawing over the results"); }
    finally { G.setupPreviewOn = false; }

    G.gfx.isMobile = false;
    await g.race("monza");
    g.apex.headless(false);
    g.step(20);
    G.endRace();
    const live = frame();
    assert.equal(live.vis, "");
    assert.ok(live.draws > 0, "a live results camera (chequered / orbit / highlights) keeps drawing");
  } finally { g.close(); }
});

test("clearMenuScreens disarms the loading screen before the sweep hides it; a repeat build of the same world is free", async () => {
  const g = await createGame({ track: null });
  try {
    const G = g.G, LS = G.loadingScreen, overlay = g.sandbox.document.getElementById("overlay");
    assert.equal(overlay.hidden, false, "precondition: the menu overlay is up");
    const stops = [], stop = LS.stop;
    LS.stop = function () { stops.push(overlay.hidden); return stop.apply(this, arguments); };
    await g.race("monza");
    LS.stop = stop;
    assert.equal(overlay.hidden, true, "the race start swept the menus");
    assert.ok(stops.length > 0, "the loading screen was stopped");
    assert.equal(stops[0], false, "before the overlay sweep, so its pending timer cannot fire into the race");

    const T = g.ctx.Tracks;
    let builds = 0;
    const b = T.build, bp = T.buildPaced;
    T.build = function () { builds++; return b.apply(this, arguments); };
    T.buildPaced = function () { builds++; return bp.apply(this, arguments); };
    const world = G.track;
    G.loadTrack(G.trackIdx);
    assert.equal(builds, 0, "the same circuit, session light and grid: loadTrack reuses the built world");
    assert.equal(G.track, world);
  } finally { g.close(); }
});

// ── 2. the state-level VM of render()'s gate ─────────────────────────────────

const GATE_SRC = (() => {
  const src = gameSource();
  const start = src.indexOf("function render(dt) {");
  const tail = "  if (!track) return;";
  const end = src.indexOf(tail, start);
  assert.ok(start >= 0 && end > start, "render() and its no-track return are present");
  return src.slice(start, end) + '  if (!track) { exit = "no-track"; return; }\n  exit = "world";\n}';
})();

/** Run render()'s gate once over `s`; returns the exit it reached and what it touched. */
function gate(s = {}) {
  const c = {
    exit: "early", previews: 0, stops: 0,
    headlessMode: false, raceRestarting: false, state: "menu", setupPreviewOn: false, track: null,
    _studio: null, _softEl: null, _carWarm: { busy: false },
    _menuGate: { warm: 0, garageWarm: 0, garageReady: false },
    canvas: { style: { visibility: "" } },
    document: { getElementById: () => null },
    els: { overlay: { hidden: true, dataset: {} } },
    gfx: { warming: () => false, warmQueued: () => false, softPresent: () => false, resize() {} },
    gfxContextLost: () => false,
    mirrorPass: { cancelPreparation() {} },
    loadingScreen: { lowerWaitPlate() {}, stop() { c.stops++; }, phase: () => s.phase || "", active: () => !!s.active },
    menuWorld: () => !!s.menuWorld,
    MenuTeardown: { quitRenderHold: () => false, cover: () => !!s.cover },
    PerfGov: { softwareRaster: () => false },
    uiExperience: { renderHome: () => false, trackActive: () => false },
    resultsCam: { live: () => !!s.live },
    renderSetupPreview: () => { c.previews++; return !!s.previewOk; },
    studioShown() {}, setupCam: { endGarageRes() {} }, Log: { info() {} },
  };
  for (const k of ["state", "track", "setupPreviewOn", "_studio"]) if (k in s) c[k] = s[k];
  if (s.warm) c._menuGate.warm = s.warm;
  if (s.warmQueued) c.gfx.warmQueued = () => true;
  vm.createContext(c);
  vm.runInContext(GATE_SRC + "\nglobalThis.render = render;", c, { filename: absSrc("js/game.js") });
  c.render(1 / 60);
  return { exit: c.exit, vis: c.canvas.style.visibility, previews: c.previews, warm: c._menuGate.warm };
}
const WORLD = { def: { id: "spa" } };

test("gate: no-track menu frames are hidden before the no-track return", () => {
  assert.deepEqual(gate({ state: "menu" }), { exit: "early", vis: "hidden", previews: 0, warm: 0 });
  assert.equal(gate({ state: "race" }).exit, "no-track", "a race with no world reaches the no-track return, shown");
  assert.equal(gate({ state: "race" }).vis, "");
});

test("gate: the flyby shows on the loading screen only — a menu world is hidden under the picker, the sheets and the teardown cover", () => {
  const fly = gate({ state: "menu", track: WORLD, menuWorld: true, active: true });
  assert.deepEqual([fly.exit, fly.vis], ["world", ""], "the loading screen's cinematic draws the warmed world");
  for (const [why, s] of [
    ["no loading screen (picker / race settings)", { active: false }],
    ["the world is not the menu's", { active: true, menuWorld: false }],
    ["the teardown cover is up", { active: true, cover: true }],
    ["a build card", { active: true, phase: "build" }],
    ["a busy card", { active: true, phase: "busy" }],
  ]) {
    const r = gate(Object.assign({ state: "menu", track: WORLD, menuWorld: true }, s));
    assert.deepEqual([r.exit, r.vis], ["early", "hidden"], why);
  }
});

test("gate: owed warm frames draw hidden, one per frame; a queued rig warm draws hidden without spending one", () => {
  const owed = gate({ state: "menu", track: WORLD, warm: 2 });
  assert.deepEqual([owed.exit, owed.vis, owed.warm], ["world", "hidden", 1], "a warm frame is drawn, under a hidden canvas");
  const queued = gate({ state: "menu", track: WORLD, menuWorld: true, warmQueued: true });
  assert.deepEqual([queued.exit, queued.vis, queued.warm], ["world", "hidden", 0], "a queued warm of the menu world gets its present");
  assert.equal(gate({ state: "menu", track: WORLD, warmQueued: true }).exit, "early", "but not one queued for some other world");
  assert.equal(gate({ state: "menu", track: WORLD }).exit, "early", "nothing owed: nothing drawn");
});

test("gate: the results freeze precedes the garage preview; a live results camera passes both", () => {
  const frozen = gate({ state: "results", track: WORLD, setupPreviewOn: true, previewOk: true });
  assert.deepEqual([frozen.exit, frozen.previews], ["early", 0], "results: neither the garage nor the world redraws");
  assert.equal(gate({ state: "results", track: WORLD }).exit, "early");
  assert.equal(gate({ state: "results", track: WORLD, live: true }).exit, "world", "ResultsCam.live() keeps the chequered/orbit/highlights drawing");
  assert.equal(gate({ state: "menu", track: WORLD, setupPreviewOn: true, previewOk: true }).previews, 1, "outside results the garage preview draws");
});

test("gate: the visibility pass runs before the garage preview returns — a studio card keeps #game hidden", () => {
  const card = gate({ state: "menu", track: WORLD, setupPreviewOn: true, previewOk: true, _studio: { cardUp: true } });
  assert.deepEqual([card.exit, card.vis, card.previews], ["early", "hidden", 1], "the preview draws under the card, hidden");
  const open = gate({ state: "menu", track: WORLD, setupPreviewOn: true, previewOk: false, _studio: { cardUp: false } });
  assert.equal(open.vis, "", "no card, no warm: the garage canvas is shown even on a frame the preview did not finish");
});
