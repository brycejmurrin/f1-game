import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

// Each fixture is a setup a player can actually select in the sandbox.
const setups = {
  chassis: {view: "challenge", answer: "axle"},
  suspension: {view: "braking", geometry: "high", answer: "same"},
  deployment: {charge: 4},
  hybrid: {start: 4, brake: 350, clip: 250, deploy: 275},
  "brake-blend": {retained: 25, response: "fill"},
  "tyre-heat": {elapsed: 90, sliding: 70, load: 90},
  "racing-line": {apex: 55, straight: 500},
  rain: {line: "textured", tyre: "inter"},
  "pit-duel": {traffic: 0},
  stint: {finish: "hard", stopLap: 25, savingLaps: 4},
  buttons: {deadPx: "6"},
};
function cursor(x, y) {
  assert.ok(Number.isFinite(x) && Number.isFinite(y));
  return `<circle cx="${x}" cy="${y}"/>`;
}

for (const [id, setup] of Object.entries(setups)) {
  test(`Learn challenge starts open and accepts a reachable ${id} setup`, () => {
    const path = new URL("../../learn/" + id + "/lab.js", import.meta.url);
    let lesson;
    vm.runInNewContext(readFileSync(path, "utf8"), {LearnSandbox: {cursor, mount(value) { lesson = value; }}}, {filename: fileURLToPath(path)});
    const initial = Object.fromEntries(lesson.controls.map(control => [control.id, control.value]));
    for (const [key, value] of Object.entries(setup)) {
      const control = lesson.controls.find(item => item.id === key);
      assert.ok(control, key);
      if (control.options) assert.ok(control.options.some(option => option[0] === value), key);
      else {
        assert.ok(value >= control.min && value <= control.max, key);
        const steps = (value - control.min) / control.step;
        assert.ok(Math.abs(steps - Math.round(steps)) < 1e-8, key);
      }
    }
    const baseline = lesson.evaluate(initial);
    const solved = lesson.evaluate({...initial, ...setup});
    assert.equal(baseline.success, false);
    assert.equal(solved.success, true, solved.feedback);
    assert.notDeepEqual(solved.metrics, baseline.metrics);
    assert.ok(solved.explanation && solved.feedback && solved.svg);

    const replayState = id === "chassis" ? {...initial, view: "wake"} : initial;
    const input = lesson.replay.input?.(replayState);
    if (input) {
      const {min, max} = lesson.controls.find(control => control.id === input);
      assert.notEqual(lesson.evaluate({...replayState, [input]: min}).svg,
        lesson.evaluate({...replayState, [input]: max}).svg, "the replay drives the lesson's existing slider");
    } else {
      const {replay} = lesson.evaluate(replayState);
      const first = replay(0).svg;
      const sample = replay(.35).svg;
      assert.ok(first && sample && first !== sample, "playback changes the diagram across the run");
    }
    if (id === "chassis") {
      assert.equal(lesson.evaluate({...initial, view: "inspect", wheelbase: 3200, body: 850, answer: "pass"}).success, false);
      const edge = lesson.evaluate({...initial, view: "edge", answer: "pass"});
      assert.equal(edge.success, true);
      assert.deepEqual(Array.from(edge.metrics.slice(0, 2), row => row[1]), ["3,400 mm", "950 mm"]);
    }
    if (id === "suspension") {
      for (const rod of ["push", "pull"]) {
        for (const damping of ["low", "high"]) {
          for (let bump = 0; bump <= 30; bump++) {
            const {replay} = lesson.evaluate({...initial, rod, damping, bump});
            for (let i = 0; i <= 100; i++) {
              const {svg} = replay(i / 100);
              assert.equal(svg.indexOf("NaN"), -1);
              const piston = Number(svg.match(/<rect x="([0-9.]+)" y="[0-9.]+" width="6" height="8"/)?.[1]);
              assert.ok(piston >= 391 && piston + 6 <= 439, "the piston stays inside its cylinder");
            }
          }
        }
      }
    }
    if (id === "hybrid") {
      const {replay} = lesson.evaluate({...initial, start: 2, deploy: 350});
      assert.equal(replay(7 / 60).readout, "7.0 s · Deploy · 0.00 MJ · Store empty");
      const recovery = lesson.evaluate({...initial, budget: "6", deploy: 100, brake: 350, clip: 350});
      const values = Object.fromEntries(recovery.metrics);
      assert.ok(Number.parseFloat(values["Harvested this lap"]) < 6);
      assert.equal(values["Recharge blocked by allowance"], "0.00 MJ");
      assert.ok(Number.parseFloat(values["Recharge blocked by full store"]) > 0);
      assert.equal(recovery.replay(1).readout.split(" · ")[0], "60.0 s");
      assert.equal(values["Deployment time traded for super clipping"], "7 s · 0.70 MJ requested deployment");
    }
    if (id === "deployment") {
      const {replay, svg} = lesson.evaluate({...initial, curve: "overtake", gap: .95, charge: 4});
      assert.equal(replay(1).readout.split(" · ")[2], "100 kW delivered");
      const [chartX, chartY] = svg.match(/points="([^"]+)" fill="none" stroke="#65b7ff"/)[1].split(" ").at(-1).split(",").map(Number);
      const [, cursorX, cursorY] = replay(1).svg.match(/cx="([^"]+)" cy="([^"]+)"/).map(Number);
      assert.equal(chartX, cursorX);
      assert.ok(Math.abs(chartY - cursorY) < .0051);
    }
    if (id === "rain") {
      const slick = lesson.evaluate({...initial, line: "puddle", tyre: "slick"}).replay(.5);
      const wet = lesson.evaluate({...initial, line: "puddle", tyre: "wet"}).replay(.5);
      assert.notEqual(slick.readout, wet.readout);
      const entryShortfall = lesson.evaluate({...initial, line: "textured", tyre: "wet", water: 7, film: .1});
      assert.equal(entryShortfall.success, false);
      assert.ok(Number.parseFloat(entryShortfall.replay(0).readout.split(" · ")[2]) < 10);
      assert.notEqual(entryShortfall.replay(0).svg, entryShortfall.replay(.5).svg);
    }
    if (id === "pit-duel") {
      assert.equal(lesson.replay.steps, 2);
      assert.equal(lesson.evaluate({...initial, stop: 19}).success, false);
      assert.equal(lesson.evaluate({...initial, mode: "execution", stop: 19}).success, true);
      assert.equal(lesson.evaluate({...initial, ...setup, mode: "execution", stop: 19}).success, false);
    }
    if (id === "stint") {
      assert.equal(lesson.replay.first + lesson.replay.steps, 50);
      const {replay} = lesson.evaluate({...initial, fuel: 64.5});
      assert.equal(replay(1).readout, "Lap 50 · Incomplete · 0.00 kg fuel · 0.50 kg shortfall · no completed pace");
    }
  });
}

function replayFixture() {
  const dom = makeDom();
  const frames = new Map();
  let token = 0;
  const context = vm.createContext({
    document: dom.document,
    LearnAppearance: {mount(fn) { fn(false); }},
    ResizeObserver: class { observe() {} },
    addEventListener() {},
    requestAnimationFrame(fn) { frames.set(++token, fn); return token; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  context.window = context;
  return {
    ...dom, frames,
    load(...paths) {
      for (const path of paths) {
        const url = new URL("../../" + path, import.meta.url);
        vm.runInContext(readFileSync(url, "utf8"), context, {filename: fileURLToPath(url)});
      }
    },
    step(now) {
      const [id, draw] = frames.entries().next().value;
      frames.delete(id);
      draw(now);
    },
  };
}

function telemetryReplay() {
  const fixture = replayFixture();
  fixture.byId("chart").getContext = () => null;
  const time = fixture.document.createElement("input");
  time.setAttribute("name", "axis");
  time.value = "time";
  const distance = fixture.document.createElement("input");
  distance.setAttribute("name", "axis");
  distance.value = "distance";
  fixture.body.append(time, distance);
  for (const lane of ["a", "b"]) {
    const ghost = fixture.document.createElement("div");
    ghost.setAttribute("data-ghost", lane);
    fixture.body.appendChild(ghost);
  }
  fixture.load("js/core/mat4.js", "js/data/telemetry-model.js",
    "learn/telemetry/model.js", "learn/replay.js", "learn/telemetry/lab.js");
  return {...fixture, time};
}

test("VSC Next marker visits the reference restart after the lead has passed", () => {
  const {byId, dispatch, load} = replayFixture();
  byId("fixture").value = "default";
  load("learn/vsc/model.js", "learn/vsc/lab.js");
  const duration = byId("vsc-duration");
  const timeline = byId("timeline");
  duration.value = "23";
  dispatch(duration, {type: "input"});
  timeline.value = "22";
  dispatch(timeline, {type: "input"});
  assert.equal(byId("track-clock").textContent.split(" · ")[0], "Passed marker");
  assert.equal(byId("reference-clock").textContent.split(" · ")[0], "VSC");
  byId("next").click();
  assert.equal(Number(timeline.value), 23);
  assert.equal(byId("reference-clock").textContent.split(" · ")[0], "Green");

  duration.value = "33";
  dispatch(duration, {type: "input"});
  timeline.value = "32";
  dispatch(timeline, {type: "input"});
  assert.equal(byId("reference-clock").textContent.split(" · ")[0], "Passed marker");
  byId("next").click();
  assert.equal(Number(timeline.value), 32, "no restart marker after both cars have passed");
});

test("Telemetry time replay keeps 1× speed through slow frames and stops when hidden", () => {
  const {byId, document, frames, step} = telemetryReplay();
  const play = byId("trace-replay").querySelector("button");
  play.click();
  for (const now of [0, 200, 400, 600, 800, 1000]) step(now);
  assert.equal(byId("cursor").textContent, "1.000 s");
  assert.equal(play.textContent, "Pause time replay");
  document.hidden = true;
  document.dispatchEvent({type: "visibilitychange"});
  assert.equal(frames.size, 0);
  assert.equal(play.textContent, "Play time replay");
  assert.equal(byId("cursor").textContent, "1.000 s");
});

test("Telemetry axis switching uses the other trace past the reference's last sample", () => {
  const {byId, dispatch, time} = telemetryReplay();
  byId("extend").click();
  const reference = byId("reference");
  reference.value = "1";
  dispatch(reference, {type: "change"});
  assert.equal(byId("cursor").textContent, "95.0 m");
  assert.equal(byId("time-a").textContent, "1.875");
  assert.equal(byId("time-b").textContent, "—");
  dispatch(time, {type: "change"});
  assert.equal(byId("cursor").textContent, "1.875 s");
  assert.equal(time.checked, true);
  assert.equal(reference.value, "1", "the selected comparison reference stays in place");
});

// #6459 row 8: the Aero Lab drill writes G.flow / G.session to start a Monza
// GP race; restore() (run when the drill's race ends or cannot start) must put
// them back, the flow through G's setter so Career and SeasonCal re-engage.
function element() {
  return {
    hidden: false, width: 0, height: 0,
    setAttribute() {}, append() {}, addEventListener() {}, remove() { this.removed = true; },
    getContext: () => null,
  };
}

function loadLearnDoor() {
  const path = new URL("../../js/ui/learn-door.js", import.meta.url);
  const levels = [];
  const context = {
    document: { createElement: element, body: { append() {} } },
    window: { matchMedia: () => ({ matches: false }) },
    DrivingLine: { STRIDE: 8 },
    Tracks: { LIST: [{ id: "bahrain" }, { id: "monza" }] },
    Wind: { level: () => levels.at(-1) ?? "calm", setLevel: v => levels.push(v) },
    UiExperience: { leavePracticePick() {} },
    Float32Array,
  };
  const registry = new URL("../../js/learn-drills/registry.js", import.meta.url);
  vm.runInNewContext(readFileSync(registry, "utf8") + "\nthis.DrillRegistry = DrillRegistry;", context,
    { filename: fileURLToPath(registry) });
  const aero = new URL("../../js/learn-drills/aero.js", import.meta.url);
  vm.runInNewContext(readFileSync(aero, "utf8") + "\nthis.AeroDrill = AeroDrill;", context, { filename: fileURLToPath(aero) });
  vm.runInNewContext(readFileSync(path, "utf8") + "\nthis.LearnDoor = LearnDoor;", context,
    { filename: fileURLToPath(path) });
  context.LearnDoor.defineDrills();   // the lazy definer LearnDoor.open() runs
  return context;
}

function makeG() {
  const engaged = [];
  let flow = "career", goal = "none";
  const G = {
    state: "menu", netPlay: { active: () => false },
    get flow() { return flow; }, set flow(v) { flow = v; engaged.push(v); },
    session: "quali", trackIdx: 0, raceWeather: "wet", raceChangeable: true, raceGrid: "real",
    duel: true, raceDirtyAir: "modern",
    coach: { practiceGoal: () => goal, setPracticeGoal: v => { goal = v; } },
    startRace() { this.started = { flow, session: this.session, trackIdx: this.trackIdx }; },
  };
  return { G, engaged };
}

test("Aero Lab drill restore() puts flow and session back", () => {
  const { DrillRegistry } = loadLearnDoor();
  const { G, engaged } = makeG();
  let dirtyAir = G.raceDirtyAir;
  const drills = DrillRegistry.create(G, { setDirtyAir: level => { dirtyAir = level; }, reopenLesson() {} });
  drills.launch("aero");
  const drill = drills.active();

  assert.deepEqual(G.started, { flow: "gp", session: "race", trackIdx: 1 }, "the drill races a Monza GP");
  assert.ok(drill, "the drill is activated");

  drills.end("quit");
  assert.equal(G.flow, "career");
  assert.equal(G.session, "quali");
  assert.equal(engaged.at(-1), "career", "flow is restored through the setter (Career/SeasonCal re-engage)");
  assert.equal(G.trackIdx, 0);
  assert.equal(G.raceWeather, "wet");
  assert.equal(G.duel, true);
  assert.equal(dirtyAir, "modern");
});

function loadButtons(storage) {
  const path = new URL("../../learn/buttons/lab.js", import.meta.url);
  let lesson;
  const ctx = {LearnSandbox: {cursor, mount(value) { lesson = value; }}};
  if (storage) ctx.localStorage = {getItem: key => storage[key] ?? null};
  vm.runInNewContext(readFileSync(path, "utf8"), ctx, {filename: fileURLToPath(path)});
  return lesson;
}

test("Button Trainer's pedal curve is the game's PedalTravel.level, dead zone included", () => {
  const ctx = {performance: {now: () => 0}, requestAnimationFrame() {}};
  const pedalPath = new URL("../../js/input/pedal-travel.js", import.meta.url);
  vm.runInNewContext(readFileSync(pedalPath, "utf8") + ";this.PT = PedalTravel;", ctx, {filename: fileURLToPath(pedalPath)});
  const {level} = loadButtons().model;
  for (const curve of ["linear", "fine", "quick", "smooth"]) for (const deadPx of [0, 6, 12, 20]) {
    for (const [start, end, travel] of [[100, 20, 74], [100, 10, 50], [80, 40, 120]]) {
      const game = {press: "instant", travel, start, end, ...(curve === "linear" ? {} : {slideCurve: curve}), ...(deadPx ? {deadPx} : {})};
      for (let px = 0; px <= travel + deadPx + 30; px += 3) {
        assert.ok(Math.abs(level({start, end, travel, curve, deadPx}, px) - ctx.PT.level(game, px)) < 1e-12,
          `${curve} ${start}->${end} over ${travel} px, dead ${deadPx}, at ${px} px`);
      }
    }
  }
});

test("Button Trainer's arrow challenge is reachable and its saved-BRAKE preset reads the game's store", () => {
  const lesson = loadButtons({"apex26.touchButtonProfiles": JSON.stringify({v: 1, buttons: {brake: {start: 100, end: 20, travel: 74, slideCurve: "quick", direction: "down", deadPx: 6}}})});
  const initial = Object.fromEntries(lesson.controls.map(control => [control.id, control.value]));
  const arrows = {...initial, scenario: "arrows"};
  assert.equal(lesson.evaluate(arrows).success, false, "the shipped STANDARD arrows turn too much at 200 km/h");
  const tuned = lesson.evaluate({...arrows, speedSteer: 2, adaptive: 5, rate: 8});
  assert.equal(tuned.success, true, tuned.feedback);
  const [name, saved] = lesson.presets[0];
  assert.equal(name, "Your saved BRAKE");
  assert.equal(JSON.stringify(saved), JSON.stringify({scenario: "pedals", start: 100, end: 20, travel: 74, curve: "quick", deadPx: "6"}));
  assert.equal(lesson.evaluate({...initial, ...saved}).success, true);
  assert.equal(loadButtons().presets[0][0] === "Your saved BRAKE", false, "no store, no personal preset");
});

// LESSON COVERAGE (#6559 step 3, #7039). Every curriculum lesson has a registered LEARN drill, or a row here. PENDING is
// SHRINK-ONLY: it was seeded with the 13 lessons #6559 §2 plans a drill for, and each drill PR deletes its lesson's row
// (the test fails while a drilled lesson keeps one). TRAINERS are lessons that are already a hands-on trainer outside
// DrillRegistry (the Button Trainer lab, the Vegas thumb trainer and its on-track drill, js/learn-drills/thumb-drill.js).
const PENDING = Object.freeze([
  "suspension", "hybrid", "telemetry",
  "rain", "vsc", "pit-duel", "stint",
]);
const PENDING_SEED = 13;
const TRAINERS = Object.freeze(["buttons", "thumbs", "thumbs-drive"]);

/** The curriculum ids and the lessons with a registered drill: registry.js, aero.js, learn-door.js's definer and every
 *  other js/learn-drills/<id>.js (one DrillRegistry.define per file, #6559 §1a) in one context. */
function coverage() {
  const context = loadLearnDoor();
  const dir = new URL("../../js/learn-drills/", import.meta.url);
  for (const f of readdirSync(dir).filter(f => f.endsWith(".js") && f !== "registry.js" && f !== "aero.js").sort()) {
    vm.runInNewContext(readFileSync(new URL(f, dir), "utf8"), context, { filename: fileURLToPath(new URL(f, dir)) });
  }
  const drilled = new Set(vm.runInNewContext("DrillRegistry.ids().map(id => DrillRegistry.get(id).lesson)", context));
  return { ids: [...context.LearnDoor.lessonIds()], drilled };
}

test("lesson coverage: every curriculum lesson has a registered drill, a PENDING row or a TRAINERS row", () => {
  const { ids, drilled } = coverage();
  assert.ok(ids.length >= 14 && ids.includes("aero"), "LearnDoor.lessonIds() reads the curriculum");
  assert.ok(drilled.has("aero"), "the Aero Lab drill is registered");
  const missing = ids.filter(id => !drilled.has(id) && !PENDING.includes(id) && !TRAINERS.includes(id));
  assert.deepEqual(missing, [], "a lesson with no drill: register one, or (a new lesson only) add a PENDING row");
  const stale = PENDING.filter(id => drilled.has(id));
  assert.deepEqual(stale, [], "a drilled lesson keeps its PENDING row: delete it in the drill's PR");
  assert.deepEqual(PENDING.filter(id => !ids.includes(id)), [], "a PENDING row names a lesson that is gone");
  assert.deepEqual(TRAINERS.filter(id => !ids.includes(id) || drilled.has(id)), [], "a TRAINERS row is gone or now drilled");
  assert.ok(PENDING.length <= PENDING_SEED, "PENDING only shrinks: a new lesson ships with its drill");
  assert.equal(new Set(PENDING).size, PENDING.length);
});

test("lesson coverage fails on an undrilled lesson with no row (positive control)", () => {
  const { ids, drilled } = coverage();
  const pending = PENDING.filter(id => id !== "stint");
  const missing = ids.filter(id => !drilled.has(id) && !pending.includes(id) && !TRAINERS.includes(id));
  assert.deepEqual(missing, ["stint"]);
});
