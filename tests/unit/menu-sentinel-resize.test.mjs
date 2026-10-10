/* menu-sentinel-resize.test.mjs — loadTrack must not arm the crash sentinel on
 * a menu/flyby build, and a window-resize burst must call gfx.resize once per
 * frame. menuKey is circuit/time/weather/grid, never a pane rect (resize cannot
 * rebuild the track through scheduleFlybyTrack's identity).
 *
 * Run: node --test tests/unit/menu-sentinel-resize.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gameSource, symbolSource } from "../helpers/game-source.mjs";

const SRC = gameSource();   // game.js + the modules carved from it (tests/helpers/game-source.mjs)

function fnBody(src, name) {
  const m = src.match(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`));
  assert.ok(m, `${name}() moved`);
  let depth = 1;
  const start = m.index + m[0].length;
  let i = start;
  for (; i < src.length && depth; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
  }
  return src.slice(start, i - 1);
}

// LAZY_CIRCUIT: loadTrack refuses a meta-only stub (no path). Sandbox defs
// need a minimal path payload so the sentinel arm/disarm path is reached.
const PATH_STUB = { pts: [[0, 0, 0]] };

function loadTrackAt(state) {
  const arms = [];
  const _menuGate = { track: { old: true }, ready: "stale", warm: 2 };
  const Tracks = { LIST: [{ id: "monza", path: PATH_STUB }] };
  const PerfGov = { sentinelArm(on) { arms.push(!!on); } };
  function raceArmedSentinel() { return state === "race" || state === "count"; }
  let built = 0;
  const _loadTrackBody = () => { built++; };
  const load = eval("(function(idx){" + fnBody(SRC, "loadTrack") + "})");
  load(0);
  return { arms, built, _menuGate };
}

test("menu and flyby loadTrack do not arm the race-start sentinel", () => {
  for (const state of ["menu", "results", "qualifying"]) {
    const { arms, built, _menuGate } = loadTrackAt(state);
    assert.equal(built, 1, `${state} still builds`);
    assert.deepEqual(arms, [false], `${state} only disarms if a leftover flag existed`);
    assert.equal(_menuGate.track, null);
    assert.equal(_menuGate.ready, "");
    assert.equal(_menuGate.warm, 0);
  }
});

test("a rebuild already in race or count still arms across loadTrack", () => {
  for (const state of ["race", "count"]) {
    const { arms, built } = loadTrackAt(state);
    assert.equal(built, 1);
    assert.equal(arms[0], true, `${state} arms before the build`);
    assert.ok(!arms.includes(false), `${state} must not disarm the live race flag`);
  }
});

test("loadTrackStepped matches loadTrack: menu skip, race/count arm", async () => {
  async function stepped(state) {
    const arms = [];
    let track = null;
    let builtTrackId = "spa", builtTrackNight = false, builtGridSlots = 22;
    const Tracks = { LIST: [{ id: "monza", path: PATH_STUB }], buildPaced: async () => ({ id: "monza", meshes: {} }) };
    const PerfGov = { sentinelArm(on) { arms.push(!!on); } };
    function raceArmedSentinel() { return state === "race" || state === "count"; }
    function sessionDarkFor() { return false; }
    function fieldSize() { return 22; }
    function trackBuildOpts() { return {}; }
    function dropTrackWorld() {}
    function freeTrackMeshes() {}
    const sceneryResident = () => false;
    // loadTrackStepped awaits ensureCircuit before build (LAZY_CIRCUIT gate).
    const ensureCircuit = async () => {};
    let adopted = 0;
    const _loadTrackBody = () => { adopted++; };
    const load = eval("(async function(idx, live){" + fnBody(SRC, "loadTrackStepped") + "})");
    const ok = await load(0, () => true);
    return { arms, ok, adopted };
  }
  const menu = await stepped("menu");
  assert.equal(menu.ok, true);
  assert.equal(menu.adopted, 1);
  assert.deepEqual(menu.arms, [false]);
  const race = await stepped("count");
  assert.equal(race.ok, true);
  assert.equal(race.arms[0], true);
  assert.ok(!race.arms.includes(false));
});

test("startRaceBody still arms the sentinel after the world exists", () => {
  const body = symbolSource("async function startRaceBody()");
  assert.match(body, /PerfGov\.sentinelArm\(true\)/, "race-start arming stays in startRaceBody");
  assert.doesNotMatch(body, /if\s*\(\s*raceArmedSentinel\s*\(\s*\)\s*\)\s*PerfGov\.sentinelArm\(true\)/,
    "startRaceBody must not inherit the menu/flyby gate");
});

test("a resize burst schedules one gfx.resize per animation frame", () => {
  const frames = [];
  let resizes = 0, rafId = 0;
  const gfx = { resize() { resizes++; } };
  const requestAnimationFrame = (fn) => { frames.push(fn); return ++rafId; };
  const setTimeout = () => { throw new Error("resize coalesce must use rAF when it exists"); };
  function scheduleGfxResize() {}
  const schedule = eval("(function(){" + fnBody(SRC, "scheduleGfxResize") + "})");
  schedule(); schedule(); schedule();
  assert.equal(frames.length, 1, "one rAF for the burst");
  assert.equal(resizes, 0, "the listener itself must not resize");
  frames[0]();
  assert.equal(resizes, 1);
  schedule();
  assert.equal(frames.length, 2, "the next frame may schedule again");
  frames[1]();
  assert.equal(resizes, 2);
});

test("menuKey has no pane rect, so a resize cannot rebuild through the flyby gate", () => {
  const keySrc = symbolSource("const menuKey = ");
  assert.match(keySrc, /idx,\s*raceTimeOfDay,\s*raceWeather,\s*fieldSize\(\)/);
  assert.doesNotMatch(keySrc, /innerWidth|innerHeight|pane|rect|getBoundingClientRect|viewKey/);
  const fly = symbolSource("function scheduleFlybyTrack(settle)");
  assert.match(fly, /const key = menuKey\(want\)/);
  assert.match(fly, /_menuGate\.ready === key/);
  assert.match(SRC, /addEventListener\("resize",\s*scheduleGfxResize\)/);
  const boot = SRC.slice(SRC.indexOf("function scheduleGfxResize()"), SRC.indexOf("window.addEventListener(\"resize\""));
  assert.match(boot, /scheduleGfxResize/, "boot binds the coalesced listener, not a raw gfx.resize");
});
