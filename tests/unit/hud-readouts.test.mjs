/* hud-readouts — the race HUD's derived readouts (js/ui/hud-readouts.js) and
 * how js/ui/hud.js paints them: "+1L" gaps, ERS MJ + deploy/harvest, brake
 * bias, the blue flag, the race DELTA vs the best lap this race, the throttled
 * spoken HUD, and gear/tach/speed at frame rate under the 10 Hz gate.
 *
 * Run: node --test tests/unit/hud-readouts.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const src = (p) => read(p).replace(/^const\b/gm, "var");
const SRC = read("js/ui/hud-readouts.js");

function load(extra = {}) {
  const timers = [];
  const ctx = { console, Math, Number, Float32Array, setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {}, ...extra };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudReadouts = HudReadouts;", ctx);
  return { R: ctx.HudReadouts, timers };
}

test("lapsApart / lapGapText: a lap or more is laps", () => {
  const { R } = load();
  assert.equal(R.lapsApart(4999, 5000), 0);
  assert.equal(R.lapsApart(5000, 5000), 1);
  assert.equal(R.lapsApart(10400, 5000), 2);
  assert.equal(R.lapsApart(-6000, 5000), 0);
  assert.equal(R.lapsApart(6000, 0), 0);
  assert.equal(R.lapGapText("▲", "BEA", 1, false), "▲ BEA +1L");
  assert.equal(R.lapGapText("▼", "BEA", 2, true), "▼ +2L");
  // SIGNED (R2-07): a car a lap DOWN spells "-nL", exactly as HudRelative.lapText does.
  assert.equal(R.lapGapText("▼", "BEA", -1, false), "▼ BEA -1L");
  assert.equal(R.lapGapText("▼", "BEA", -3, true), "▼ -3L");
});

test("energy: MJ of the 4 MJ store, deploy/harvest as glyph and words", () => {
  const { R } = load({ PhysicsConsts: { ES_MJ: 4 } });
  assert.equal(R.ersState(true, 0.5, 0.6), "deploy");
  assert.equal(R.ersState(false, 0.51, 0.5), "harvest");
  assert.equal(R.ersState(false, 0.5, 0.5), "idle");
  assert.equal(R.ersState(false, 0.5, NaN), "idle");
  assert.deepEqual({ ...R.energy(0.8, "idle") }, { text: "3.2 MJ", label: "Energy 3.2 megajoules" });
  assert.equal(R.energy(0.5, "deploy").text, "▼ 2.0 MJ");
  assert.equal(R.energy(0.5, "harvest").label, "Energy 2.0 megajoules, harvesting");
});

test("bbText: the set-up sheet's half-percent steps", () => {
  const { R } = load();
  assert.equal(R.bbText(0.56), "BB 56%");
  assert.equal(R.bbText(0.585), "BB 58.5%");
  assert.equal(R.bbText(null, 0.56), "BB 56%");
});

test("spdPlate: one MPH|KPH plate — never KM/H, settings drive the unit", () => {
  const { R } = load();
  assert.equal(R.spdUnits(), "kmh");
  assert.equal(R.spdUnit(), "KPH");
  assert.equal(R.spdUnit("mph"), "MPH");
  assert.deepEqual({ ...R.spdPlate(287.4, "kmh") }, { n: 287, unit: "KPH" });
  assert.deepEqual({ ...R.spdPlate(287.4, "mph") }, { n: 179, unit: "MPH" });
  assert.deepEqual({ ...R.spdPlate(0, "mph") }, { n: 0, unit: "MPH" });
  assert.deepEqual({ ...R.spdPlate(NaN, "kmh") }, { n: 0, unit: "KPH" });
  // Plate spelling is the short form the wheel LCD uses — not settings' "KM/H".
  assert.doesNotMatch(R.spdUnit("kmh"), /KM\/H/);
  assert.doesNotMatch(R.spdPlate(100, "kmh").unit, /KM\/H/);
  // AppearanceOpts.speed wins for the number when present (same rounding).
  const withAO = load({
    AppearanceOpts: {
      units: () => "mph",
      speed: (kph) => Math.round((Number(kph) || 0) / R.KPH_PER_MPH),
    },
  });
  assert.equal(withAO.R.spdUnits(), "mph");
  assert.deepEqual({ ...withAO.R.spdPlate(160.9344) }, { n: 100, unit: "MPH" });
});

test("blueFlag: only a car a lap up, physically just behind, within ~1.2 s", () => {
  const { R } = load();
  const L = 5000;
  const p = { prog: 2000, speed: 60 };
  const lapper = { code: "VER", prog: 2000 + L - 50, speed: 70 };   // 50 m behind on the road, a lap up
  const sameLap = { code: "HAM", prog: 1950, speed: 70 };           // 50 m behind, same lap: a race, not a flag
  const far = { code: "LEC", prog: 2000 + L - 400, speed: 70 };     // a lap up but 400 m back
  assert.equal(R.blueFlag(p, [p, sameLap, far], L, 25), null);
  assert.equal(R.blueFlag(p, [p, sameLap, far, lapper], L, 25), lapper);
  assert.equal(R.blueFlag(p, [p, { ...lapper, retired: true }], L, 25), null);
  assert.equal(R.blueFlag({ ...p, finished: true }, [lapper], L, 25), null);
});

test("lapTrace: adopts a lap only when it became the new best, then interpolates", () => {
  const { R } = load();
  const tr = R.lapTrace(), L = 1000;
  const c = { lap: 0, s: 990, lapTime: 3, best: Infinity, lastLap: 0 };
  tr.sample(c, L);
  // Lap 1: 50 m/s, so t = s / 50.
  c.lap = 1;
  for (let s = 0; s <= 995; s += 5) { c.s = s; c.lapTime = s / 50; tr.sample(c, L); }
  assert.equal(tr.has(), false, "no reference until a lap completes");
  c.lap = 2; c.s = 1; c.lapTime = 0.02; c.best = 20; c.lastLap = 20; tr.sample(c, L);
  assert.equal(tr.has(), true);
  assert.ok(Math.abs(tr.timeAt(500) - 10) < 1e-3);
  assert.ok(Math.abs(tr.timeAt(2.5) - 0.05) < 1e-3, "before the first sample interpolates from the line");
  // Lap 2 is slower (40 m/s) and NOT a best: the reference stays lap 1.
  for (let s = 5; s <= 995; s += 5) { c.s = s; c.lapTime = s / 40; tr.sample(c, L); }
  c.lap = 3; c.s = 1; c.lapTime = 0.02; c.lastLap = 25; tr.sample(c, L);
  assert.ok(Math.abs(tr.timeAt(500) - 10) < 1e-3, "a slower lap never replaces the best");
  // A teleport mid-lap spoils the lap even if it would have been a best.
  c.s = 5; c.lapTime = 0.1; tr.sample(c, L);
  c.s = 600; c.lapTime = 0.2; tr.sample(c, L);
  for (let s = 605; s <= 995; s += 5) { c.s = s; c.lapTime = 0.2 + (s - 600) / 60; tr.sample(c, L); }
  c.lap = 4; c.s = 1; c.lapTime = 0.02; c.best = 7; c.lastLap = 7; tr.sample(c, L);
  assert.ok(Math.abs(tr.timeAt(500) - 10) < 1e-3, "a teleported lap is not a reference");
  tr.reset();
  assert.equal(tr.has(), false);
});

test("speaker: position held 2 s, one line per 2 s, yields to the radio", () => {
  const { R, timers } = load();
  const live = { textContent: "" };
  const sp = R.speaker(live);
  const fmt = (t) => t.toFixed(1);
  const flush = () => { while (timers.length) timers.shift()(); };
  sp.tick(0, { rank: 5, of: 20, best: Infinity }, fmt);            // grid slot: baseline, silent
  sp.tick(100, { rank: 4, of: 20, best: Infinity }, fmt);
  sp.tick(1500, { rank: 3, of: 20, best: Infinity }, fmt);          // still scrapping
  assert.equal(sp.tick(3000, { rank: 3, of: 20, best: Infinity }, fmt), null, "not held 2 s yet");
  assert.equal(sp.tick(3600, { rank: 3, of: 20, best: Infinity }, fmt), "Position 3 of 20");
  flush();
  assert.equal(live.textContent, "Position 3 of 20");
  // The radio writes the region: a new line waits FOREIGN_MS after it.
  sp.tick(4000, { rank: 3, of: 20, best: 90 }, fmt);                // first best: no line
  live.textContent = "ENGINEER: BOX THIS LAP";
  sp.tick(6000, { rank: 3, of: 20, best: 88 }, fmt);
  assert.equal(sp.tick(6100, { rank: 3, of: 20, best: 88 }, fmt), null, "yields to the radio line");
  assert.equal(sp.tick(7600, { rank: 3, of: 20, best: 88 }, fmt), "New best lap, 88.0");
});

test("source: display-only — no Tracks / curvature / racing line, no car writes", () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\bTracks\b|\bcurvature\b|\bkCur\b|racingLine|DrivingLine/);
  assert.doesNotMatch(code, /\b(?:c|o|player)\.(?:speed|energy|prog|s|lap|best)\s*=[^=]/);
});

// ── hud.js wiring, on the mini-dom harness (the hud-feel shape) ──────────────
function boot(opts = {}) {
  const dom = makeDom();
  const rawCreate = dom.document.createElement;
  dom.document.createElement = (tag) => { const el = rawCreate(tag); if (String(tag).toLowerCase() === "canvas") el.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true }); return el; };
  const timers = [];
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, WeakSet, RegExp, Date, parseFloat, parseInt, isFinite, Infinity, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    M4: { clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
    PhysicsConsts: { IDLE_RPM: 5000, MAX_RPM: 15000, ES_MJ: 4 },
    Ghost: { hasGhost: () => false, timeAt: () => null, at: () => null },
    GhostShare: { hasGuest: () => false, timeAt: () => null, at: () => null },
    TrackMaps: { drsZones: () => [], sectorColors: () => ["#ffd700", "#c0c0c0", "#cd9b5a"] },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
    performance: { now: () => 1000 },
    ...(opts.sandbox || {}),
  };
  sb.window = sb;
  vm.runInNewContext(src("js/ui/live-region.js"), sb, { filename: "js/ui/live-region.js" });
  vm.runInNewContext(src("js/ui/hud-readouts.js"), sb, { filename: "js/ui/hud-readouts.js" });
  vm.runInNewContext(src("js/ui/hud.js"), sb, { filename: "js/ui/hud.js" });
  vm.runInNewContext(src("js/race/overtake-mode.js"), sb, { filename: "js/race/overtake-mode.js" });
  const $ = (id) => dom.byId(id);
  const els = {
    pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"), best: $("hud-best"),
    speed: $("hud-speed-n"), energy: $("hud-energy-fill"), ot: $("hud-ot"), aero: $("hud-aero"),
    btnOT: $("btn-ot"), btnAero: $("btn-aero"),
    gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"), hudSectors: $("hud-sectors"),
    flag: $("hud-flag"), minimap: $("minimap"), gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"), tach: $("hud-tach"),
    announceLive: $("announce-live"),
  };
  els.minimap.getContext = () => opts.mm || new Proxy({}, { get: () => () => {}, set: () => true });
  const mk = (o) => ({ team: { id: "t1", color: [1, 0, 0] }, lap: 1, lapTime: 12, best: Infinity, speed: 50, energy: 0.5, gear: 3, rpm: 5000,
    otT: 0, otE: 0, aeroX: 0, s: 10, prog: 10, retired: false, ...o });
  const player = mk({ code: "YOU", rank: 2, brakeBias: 0.565 });
  const rival = mk({ code: "BEA", rank: 1, prog: 10 + 1000 + 300 });
  const G = {
    els, player, cars: [rival, player], ranked: [rival, player], timeTrial: false, state: "race", session: "race",
    lapsTarget: 5, track: { map: [[0, 0], [0.5, 0.5], [1, 1]], total: 1000, def: {} },
    sectorLast: [null, null, null], sectorBests: [Infinity, Infinity, Infinity], fieldSectorBests: [Infinity, Infinity, Infinity],
    aeroZones: [{}], ttRecord: Infinity,
    fmtTime: (t) => (isFinite(t) && t > 0 ? t.toFixed(2) : "-"),
    dashKph: (v) => v * 3.6, vTop: () => 90, otEnabled: () => true, cssCol: () => "#f00",
  };
  const hud = sb.GameHud.create(G);
  const flush = () => { while (timers.length) timers.shift()(); };
  return { dom, $, els, player, rival, G, hud, sb, timers, flush, tick: () => hud.updateHud(true), frame: (ms) => hud.updateHud(false, ms) };
}

test("hud.js: a car a lap up reads +1L, not distance ÷ speed", () => {
  const { els, rival, player, tick } = boot();
  tick();
  assert.equal(els.gapA.textContent, "▲ BEA +1L");
  rival.prog = player.prog + 100; tick();
  assert.match(els.gapA.textContent, /^▲ BEA 2\.00s$/, "back to seconds (2 dp under ~10 s), with no EMA carried from the lap");
});

test("hud.js: gear, tach and speed update every frame; the clock stays at 10 Hz", () => {
  const { els, player, frame, tick } = boot();
  tick();
  player.gear = 4; player.speed = 60; player.lapTime = 13;
  frame(16);
  assert.equal(els.gear.textContent, "4");
  assert.equal(els.speed.textContent, "216");
  assert.equal(els.time.textContent, "12.00", "the lap clock is still on the 10 Hz tick");
});

test("hud.js: SPD unit plate is MPH|KPH (matches wheel LCD), not KM/H", () => {
  const { $, player, frame, sb, dom } = boot();
  // mini-dom auto-creates ids flat under body — mirror the shell tree so
  // paintInstruments can find .hud-unit beside #hud-speed-n.
  const wrap = $("hud-speed"), n = $("hud-speed-n");
  const unit = dom.document.createElement("span");
  unit.className = "hud-unit";
  unit.textContent = "KM/H";   // AppearanceOpts.applyReadability's settings copy
  wrap.appendChild(n);
  wrap.appendChild(unit);
  player.speed = 50; frame(16);
  assert.equal(n.textContent, "180");
  assert.equal(unit.textContent, "KPH", "float plate re-asserted to KPH every frame");
  // MPH setting: spdPlate reads AppearanceOpts live; number + plate flip together.
  sb.AppearanceOpts = {
    units: () => "mph",
    speed: (kph) => Math.round((Number(kph) || 0) / 1.609344),
    hudUsesTeam: () => true,
    menuAccent: () => "brand",
    applyMenuAccent() {},
    applyHudAccent() {},
  };
  assert.deepEqual({ ...sb.HudReadouts.spdPlate(160.9344) }, { n: 100, unit: "MPH" });
  player.speed = 160.9344 / 3.6; frame(16);   // dashKph(v)=v*3.6 → 160.9344
  assert.equal(n.textContent, "100");
  assert.equal(unit.textContent, "MPH");
  assert.doesNotMatch(unit.textContent, /KM\/H/);
});

test("hud.js: ENERGY number + state, BB chip, the energy fill has its own colour", () => {
  const { $, player, tick } = boot();
  tick();
  assert.equal($("hud-energy-n").textContent, "2.0 MJ");
  player.deploying = true; tick();
  assert.equal($("hud-energy-n").textContent, "▼ 2.0 MJ");
  assert.equal($("hud-energy").dataset.ers, "deploy");
  assert.equal($("hud-bb").textContent, "BB 56.5%");
  const css = read("css/hud.css");
  assert.match(css, /#hud-energy-fill \{ background: linear-gradient\(90deg in oklab, var\(--edit-fill\), var\(--edit-ink\)\); \}/);
});

test("hud.js: race DELTA appears once a best lap exists, without a ghost", () => {
  const { $, player, G, frame, tick } = boot();
  G.cars = [player]; G.ranked = [player];
  player.lap = 1;
  for (let s = 0; s <= 995; s += 5) { player.s = s; player.lapTime = s / 50; frame(16); }
  tick();
  // The slot is RESERVED on the opening lap (invisible, data-pending), so the
  // centred tower does not re-centre when the first number arrives.
  assert.equal($("hud-delta").hidden, false, "the DELTA box keeps its place in the tower");
  assert.equal($("hud-delta").dataset.pending, "", "…invisible while nothing compares against it");
  player.lap = 2; player.s = 1; player.lapTime = 0.02; player.best = 20; player.lastLap = 20; frame(16);
  player.s = 500; player.lapTime = 10.5; tick();
  assert.equal($("hud-delta").hidden, false);
  assert.equal($("hud-delta").dataset.pending, undefined, "a number: visible");
  assert.equal($("hud-delta-n").textContent, "+0.500");
  assert.equal($("hud-delta").dataset.ref, "best");
});

test("shell: every .hud-top box has an id the hide rules key on; no nth-child left", () => {
  const shell = read("index.html"), css = read("css/hud.css"), hud = read("js/ui/hud.js");
  for (const id of ["hud-box-pos", "hud-box-lap", "hud-box-time", "hud-box-best", "hud-delta"])
    assert.match(shell, new RegExp(`class="hud-box" id="${id}"`));
  assert.doesNotMatch(css, /\.hud-box:nth-child/);
  assert.match(css, /body\[data-hud-hide~="best"\] #hud-box-best/);
  assert.doesNotMatch(hud, /innerHTML/, "#hud-delta is static markup now");
});

// ── #announce-live has ONE writer (js/ui/live-region.js) ─────────────────────
// Three voices each did "clear, then write 60 ms later" on their own timer, so
// two in one tick landed ~1 ms apart and the first was replaced before any
// reader saw it. One timer and a priority queue: flag > penalty > save > radio > HUD.
function loadRegion() {
  const timers = [];
  let t = 0;
  const live = { textContent: "" };
  let id = 0;
  const ctx = { Math, String, Object, setTimeout: (fn, ms) => { timers.push({ fn, ms, id: ++id }); return id; },
    clearTimeout: (h) => { const i = timers.findIndex((x) => x.id === h); if (i >= 0) timers.splice(i, 1); },
    performance: { now: () => t }, document: { getElementById: (id) => (id === "announce-live" ? live : null) } };
  vm.createContext(ctx);
  vm.runInContext(src("js/ui/live-region.js") + "; this.LiveRegion = LiveRegion;", ctx);
  // Run the next timer; returns the region's text after it.
  const step = () => { const x = timers.shift(); if (x) { t += x.ms; x.fn(); } return live.textContent; };
  return { L: ctx.LiveRegion, live, step, timers, advance: (ms) => { t += ms; } };
}

test("LiveRegion: a flag and a radio call in one tick are BOTH read, the flag first", () => {
  const { L, live, step } = loadRegion();
  assert.equal(L.say("ENGINEER: BOX THIS LAP", "race"), true, "an idle region starts the line at once");
  assert.equal(live.textContent, "", "cleared first, so a repeat is still a change");
  assert.equal(L.say("RACE CONTROL: SAFETY CAR", "flag"), true, "the flag jumps a radio line that is not yet written");
  assert.equal(step(), "RACE CONTROL: SAFETY CAR", "the radio's beat was cancelled; the flag is written after its own");
  assert.deepEqual([...L.state().queued], ["radio:ENGINEER: BOX THIS LAP"], "the radio waits its turn — not lost");
  assert.equal(step(), "", "after the hold, the region clears for the next line");
  assert.equal(step(), "ENGINEER: BOX THIS LAP");
});

test("LiveRegion: a lower-priority line waits out the hold; stale HUD lines are dropped", () => {
  const { L, live, step, advance } = loadRegion();
  L.say("RACE CONTROL: YELLOW FLAG", "flag");
  step();                                            // written
  assert.equal(L.say("Position 3 of 20", "hud"), false, "the HUD waits behind a flag");
  assert.equal(L.say("Position 2 of 20", "hud"), false);
  assert.deepEqual([...L.state().queued], ["hud:Position 2 of 20"], "a newer HUD line supersedes the queued one");
  assert.equal(live.textContent, "RACE CONTROL: YELLOW FLAG", "the flag holds the region");
  step(); step();
  assert.equal(live.textContent, "Position 2 of 20");
  // A penalty arriving while a HUD line HOLDS cuts the hold short: the HUD line was already read.
  assert.equal(L.say("RACE CONTROL: 5 SECOND PENALTY", "penalty-hit"), true);
  step();
  assert.equal(live.textContent, "RACE CONTROL: 5 SECOND PENALTY");
  L.say("Position 1 of 20", "hud");
  advance(6000);                                     // read too late to mean anything
  step();
  assert.equal(L.state().phase, "idle", "a HUD line queued past its shelf life is dropped, not read late");
  assert.equal(live.textContent, "RACE CONTROL: 5 SECOND PENALTY", "the region is left as it was");
  L.say("ENGINEER: PUSH", "race"); L.reset();
  assert.deepEqual(JSON.parse(JSON.stringify(L.state())), { phase: "idle", current: null, queued: [] }, "a new session starts empty");
});

// UI-05 (hunt2): a flag preempting a HUD line mid-beat re-queues that older
// line, and the re-queue used to delete the NEWER HUD line already waiting.
test("LiveRegion: a HUD line pushed back by a flag never supersedes a newer queued one", () => {
  const { L, step } = loadRegion();
  L.say("P5", "hud");                                // written (beat)
  L.say("P4", "hud");                                // newer, queued
  assert.equal(L.say("YELLOW FLAG", "flag"), true, "the flag preempts the beat");
  assert.deepEqual([...L.state().queued], ["hud:P4"], "the newer position waits; the stale P5 is dropped");
  assert.equal(step(), "YELLOW FLAG");
  step();
  assert.equal(step(), "P4", "after the flag the reader hears the current position");
});

// Bug hunt 2 F11: MAX_Q's comment says a burst drops its "least urgent, OLDEST lines", but the
// queue is sorted newest-last within a priority and queue.pop() dropped the NEWEST. For a
// reader that is backwards (the stale-line rule already prefers the current news), so the
// oldest of the lowest priority goes.
test("LiveRegion: a burst past MAX_Q drops the least urgent, OLDEST line (not the newest)", () => {
  const { L } = loadRegion();
  L.say("R0", "radio");                              // written (beat) - owns the region
  for (const t of ["R1", "R2", "R3", "R4", "R5"]) L.say(t, "radio");
  assert.deepEqual([...L.state().queued], ["radio:R2", "radio:R3", "radio:R4", "radio:R5"], "R1, the oldest, was dropped");
  L.say("H1", "hud");                                // lower priority than every queued radio line...
  assert.ok(!L.state().queued.includes("hud:H1"), "...so it is the one dropped, not a radio line");
  assert.deepEqual([...L.state().queued], ["radio:R2", "radio:R3", "radio:R4", "radio:R5"]);
});

test("hud.js: the flag and the radio go through the one writer", () => {
  const hud = read("js/ui/hud.js"), game = read("js/game.js"), ro = read("js/ui/hud-readouts.js");
  const sel = read("js/ui/select-screen.js");   // the SESSION ONLY warning, the fourth voice
  for (const [name, code] of [["hud.js", hud], ["game.js", game], ["hud-readouts.js", ro], ["select-screen.js", sel]]) {
    assert.doesNotMatch(code, /setTimeout\(\(\) => \{ live\.textContent =/, `${name} must not time its own #announce-live write`);
    assert.match(code, /LiveRegion\.say\(/, `${name} speaks through LiveRegion`);
  }
  assert.match(hud, /LiveRegion\.say\(said, "flag"\)/);
  assert.match(game, /LiveRegion\.say\(said, kind\)/);
  assert.match(ro, /LiveRegion\.say\(said, "hud"\)/);
  assert.match(sel, /LiveRegion\.say\(text, "save"\)/);
});

// ── the timing tower and its chips ────────────────────────────────────────────
test("hud.js: POS is session-aware — TT, Q in qualifying, PRAC in practice, rank/field in a race", () => {
  const { els, G, tick } = boot();
  tick();
  assert.equal(els.pos.textContent, "2/2");
  G.session = "quali"; G.cars = [G.player]; tick();
  assert.equal(els.pos.textContent, "Q", "qualifying's field is the player alone: never 1/1");
  G.session = "race"; G.practice = true; G.cars = [G.rival || G.cars[0], G.player]; tick();
  assert.equal(els.pos.textContent, "PRAC", "practice ranks road order with nothing at stake");
  G.practice = false; G.timeTrial = true; tick();
  assert.equal(els.pos.textContent, "TT");
});

test("hud.js: the gap chips carry no sign — the arrow is the direction, as RELATIVE agrees", () => {
  const { els, rival, player, tick } = boot();
  rival.prog = player.prog + 100; tick();
  assert.match(els.gapA.textContent, /^▲ BEA \d+\.\d{1,2}s$/, "no '+' on the ahead chip (RELATIVE reads ahead as '-')");
  rival.prog = player.prog + 1000 + 300; tick();
  assert.equal(els.gapA.textContent, "▲ BEA +1L", "laps keep RELATIVE's own '+1L' (a lap up)");
});

test("hud.js: the same car lapping the player AGAIN is a new blue flag, spoken again", () => {
  const { els, rival, player, G, tick, flush } = boot();
  const live = els.announceLive;
  G.track.total = 1000; player.prog = 2000; player.speed = 60; rival.speed = 70;
  rival.prog = player.prog + 1000 - 20;              // 20 m behind on the road, a lap up
  tick(); flush();
  assert.equal(els.flag.textContent, "BLUE FLAG BEA");
  assert.equal(live.textContent, "RACE CONTROL: BLUE FLAG, LET BEA THROUGH");
  live.textContent = "";
  tick(); flush();
  assert.equal(live.textContent, "", "a steady blue flag is not re-spoken every tick");
  rival.prog = player.prog + 1000 + 200; tick(); flush();   // it is through
  assert.equal(els.flag.hidden, true);
  rival.prog = player.prog + 2000 - 20; tick(); flush();    // a lap later it comes round again
  assert.equal(live.textContent, "RACE CONTROL: BLUE FLAG, LET BEA THROUGH", "the second lapping is called too");
});

test("hud.js: resetRace clears the chips' carried state — team bar, tow, pit window, ghost tint", () => {
  const { els, G, player, rival, hud, tick } = boot();
  G.pits = { windowOf: () => "P12" };
  player.towing = 1; rival.prog = player.prog + 100;
  tick();
  assert.notEqual(els.gapA.style.getPropertyValue("--gap-team"), "");
  assert.equal(els.gapA.dataset.tow, "1");
  assert.equal(els.gapA.dataset.pit, "P12");
  hud.resetRace();
  assert.equal(els.gapA.style.getPropertyValue("--gap-team"), "", "the last race's neighbour bar is gone");
  assert.equal(els.gapA.dataset.tow, undefined);
  assert.equal(els.gapA.dataset.pit, undefined);
  assert.equal(els.gapA.style.color || "", "", "and no time-trial ghost tint survives into a race");
});

// ── round 2 (B6): R2-06 signed deltas, R2-07 lap-down spelling, S4 run-up clock, PERF-2 lane memo ──
test("R2-07: the chip behind a car a lap DOWN says -1L, REL's own spelling for it", () => {
  const { els, rival, player, G, tick } = boot();
  const rel = { Math, Number, Object, Array, Infinity, isFinite };
  vm.runInNewContext(src("js/ui/hud-relative.js") + "; this.HudRelative = HudRelative;", rel, { filename: "js/ui/hud-relative.js" });
  const back = { ...player, code: "BEA", rank: 3, prog: player.prog - 1300, s: 0 };
  G.cars = [rival, player, back]; G.ranked = [rival, player, back];
  tick();
  assert.equal(els.gapA.textContent, "▲ BEA +1L", "a car a lap up (slot 0)");
  assert.equal(els.gapB.textContent, "▼ BEA -1L", "a car a lap down (slot 1)");
  assert.equal(els.gapB.textContent.split(" ").pop(), rel.HudRelative.lapText(-1), "chip and REL agree for a lap down");
  assert.equal(els.gapA.textContent.split(" ").pop(), rel.HudRelative.lapText(1), "and for a lap up");
});

test("R2-06: a delta that ROUNDS to zero never paints -0.000", () => {
  for (const [off, want] of [[0.0003, "+0.000"], [-0.0003, "+0.000"], [0, "+0.000"], [0.0006, "-0.001"], [-0.0006, "+0.001"], [0.5, "-0.500"]]) {
    const { $, player, sb, tick } = boot();
    sb.Ghost.hasGhost = () => true;
    sb.Ghost.timeAt = () => player.lapTime + off;   // ghost AHEAD by `off`: delta = -off
    tick();
    assert.equal($("hud-delta-n").textContent, want, "delta " + (-off));
  }
});

test("R2-06: the TT ghost chip takes its sign from the rounded value too", () => {
  for (const [d, want] of [[-0.0003, "GHOST +0.000s"], [0.0003, "GHOST +0.000s"], [-0.25, "GHOST -0.250s"], [0.25, "GHOST +0.250s"]]) {
    const { els, player, G, sb, tick } = boot();
    G.timeTrial = true; G.cars = [player]; G.ranked = [player];
    sb.Ghost.hasGhost = () => true;
    sb.Ghost.timeAt = () => player.lapTime - d;
    tick();
    assert.equal(els.gapA.textContent, want, "delta " + d);
  }
});

test("S4: before the first line crossing the ghost chip, delta and minimap dot do not run off the run-up clock", () => {
  const arcs = [];
  const mm = new Proxy({}, { get: (_, k) => (...a) => { if (k === "arc") arcs.push(a[2]); }, set: () => true });
  const { $, els, player, G, sb, tick } = boot({ mm });
  G.timeTrial = true; G.cars = [player]; G.ranked = [player];
  sb.Ghost.hasGhost = () => true;
  sb.Ghost.timeAt = () => 0;
  sb.Ghost.at = () => ({ s: 500, x: 0 });
  const ghostDots = () => arcs.filter((r) => r === 3.4).length;
  player.lap = 0; player.lapTime = 5.5; player.lastLap = 0; player.s = 940;   // flying-start run-up
  tick();
  assert.equal(els.gapA.textContent, "", "no GHOST -75.000s while the player sits before the line");
  assert.equal(ghostDots(), 0, "no ghost dot off the run-up clock");
  assert.equal($("hud-delta").dataset.pending, "", "DELTA stays pending");
  player.lap = 1; player.lapTime = 0.4; player.s = 20;
  tick();
  assert.match(els.gapA.textContent, /^GHOST [+-]\d/, "lap 1: the chip is live");
  assert.ok(ghostDots() >= 1, "lap 1: the ghost dot is drawn");
  assert.notEqual($("hud-delta").dataset.pending, "");
});

test("PERF-2: a steady tick does not re-run announceLane's layout reads; a changed key does", () => {
  let cs = 0;
  const { rival, player, hud, sb } = boot({ sandbox: { getComputedStyle: () => { cs++; return { getPropertyValue: () => "" }; } } });
  const nat = () => hud.updateHud(false, 100);   // a natural 10 Hz tick (the forced path always re-clips: jump / probes)
  for (let i = 0; i < 4; i++) nat();   // fit settles, the lane is clipped once
  cs = 0;
  for (let i = 0; i < 10; i++) nat();
  assert.equal(cs, 0, "steady ticks: no getComputedStyle / rect pass from the lane");
  rival.prog = player.prog + 100;       // the gap string changes length: "+1L" -> "2.00s"
  nat();
  assert.equal(cs, 1, "a changed gap string re-clips the lane once");
  cs = 0;
  sb.innerWidth = 900; nat();
  assert.ok(cs >= 1, "a resized viewport re-clips it");
  cs = 0;
  hud.updateHud(true);
  assert.equal(cs, 1, "a forced refresh always re-clips");
});
