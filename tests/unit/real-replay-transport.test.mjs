// REAL REPLAY transport UI (js/ui/watch-transport.js with the replay): pause, seek, event and chapter
// navigation, follow lock, AUTO handoff, the toolbar and playable-event bounds. Split from
// real-replay-vm.test.mjs (M1-15).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT, line, transportReplay, visibleTransportReplay } from "../helpers/real-replay-fixtures.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

test("HIGHLIGHTS no-driver cuts replace retired subjects only while AUTO owns the picture", () => {
  for (const owner of ["auto", "manual", "locked", "fixed"]) {
    const { replay, G, options, drivers } = transportReplay();
    drivers[0].dnf = true; drivers[0].outT = 10;
    options.script.passes = [];
    options.script.cautions = [{ tFrom: 50, from: 1, level: 3 }];
    options.traces.cars = { 1: line(0, 50, 0, 0, 10), 2: line(0, 50, 0, 0, 100) };
    replay.start({ ...options, reel: true, camera: owner === "fixed" ? "heli" : "auto" });
    assert.equal(replay.status().follow, "AAA");
    replay.tick(13);
    if (owner === "manual") replay.takePicture();
    if (owner === "locked") replay.setLocked(true);
    const frames = [];
    G.snapGameCam = () => frames.push({ code: G.player.code, retired: G.player.retired });
    replay.tick(1);
    assert.equal(replay.status().T, 42);
    assert.equal(replay.status().follow, owner === "auto" ? "BBB" : "AAA", owner);
    assert.deepEqual(frames, [{ code: owner === "auto" ? "BBB" : "AAA", retired: owner !== "auto" }],
      "the cut snaps once, after ownership-safe subject selection");
    replay.tick(13);
    assert.equal(replay.status().follow, owner === "auto" ? "BBB" : "AAA", "subject survives the no-driver segment");
    replay.stop();
  }
});

test("WATCH AUTO handoff updates the actual camera and cockpit HUD immediately, including paused reels", () => {
  for (const reel of [false, true]) for (const paused of [false, true]) for (const outerPaused of [false, true]) {
    const { replay, G, options, ctx } = transportReplay();
    replay.stop();
    const classes = new Set(), writes = [], frames = [];
    let layout;
    const button = { textContent: "", setAttribute() {}, addEventListener() {} };
    ctx.window = ctx;
    ctx.document = { body: { classList: {
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name), remove: (name) => classes.delete(name),
    }, toggleAttribute() {} }, addEventListener() {}, getElementById: () => null };
    ctx.RealRace = { replay: () => replay };
    ctx.HudLayout = { setCam: (id) => { layout = id; } };
    ctx.CamTunerPanel = { refresh() {} };
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/camera/cam-picker.js"), "utf8"), ctx, { filename: absSrc("js/camera/cam-picker.js") });
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8"), ctx, { filename: absSrc("js/camera/mode-switch.js") });
    G.$ = (id) => id === "btn-cam" ? button : null;
    G.store = { set: (...args) => writes.push(args) };
    const modes = ctx.CamModes.CAM_MODES, cockpit = modes.findIndex((m) => m.id === "cockpit");
    G.camMode = cockpit;
    G.setCamMode = ctx.CamModes.create(G).setCamMode;
    replay.start({ ...options, reel, tower: false });
    G.setCamMode(cockpit); replay.takePicture();
    replay.seek(5); replay.setPaused(paused);
    assert.equal(classes.has("cockpit-cam"), true);
    assert.equal(layout, "cockpit");
    const before = replay.status();
    G.paused = outerPaused;
    G.snapGameCam = (paint) => frames.push({ paint, mode: modes[G.camMode].id, layout });
    assert.equal(replay.setAuto(true), true);
    const after = replay.status(), shot = modes[G.camMode].id;
    assert.notEqual(shot, "cockpit", "director takes the picture without waiting for a tick or next reel cut");
    assert.notEqual(shot, "tv", "WATCH uses its own broadcast director, not the live-race TV rig");
    assert.equal(after.broadcast.shot, shot);
    assert.equal(after.broadcast.cuts, before.broadcast.cuts + 1);
    assert.equal(replay.autoOn(), true);
    assert.equal(classes.has("cockpit-cam"), false);
    assert.equal(layout, shot);
    assert.match(button.textContent, /^AUTO · /);
    assert.deepEqual(frames, [{ paint: outerPaused, mode: shot, layout: shot }], "normal frames render playback pause; the outer pause menu needs an explicit paint");
    assert.equal(after.T, before.T);
    assert.equal(after.follow, before.follow);
    assert.equal(after.paused, paused);
    replay.setAuto(true);
    assert.equal(replay.status().broadcast.cuts, after.broadcast.cuts, "repeated AUTO does not cut again");
    assert.equal(frames.length, 1);
    replay.stop();
    assert.equal(G.camMode, cockpit, "exit restores the saved driving camera");
    assert.equal(classes.has("cockpit-cam"), true);
    assert.equal(layout, "cockpit");
    assert.deepEqual(writes, [], "WATCH camera choices never overwrite the saved preference");
  }
});

test("WATCH transport pause holds the replay clock, and seek reposes ended and rewound drivers before snapping", () => {
  const { replay, cars, snaps } = transportReplay();
  replay.setPaused(true); replay.tick(5);
  assert.equal(replay.status().T, 0, "paused playback does not advance");
  replay.seek(20);
  assert.equal(cars[0].prog, 1000);
  assert.equal(cars[1].prog, 450, "a forward seek parks the stopped car at its final recorded position");
  assert.equal(cars[1].retired, true);
  assert.equal(cars[1].rPrevPx, cars[1].px, "ended car also clears the prior interpolation pose");
  assert.equal(snaps.at(-1), 1000, "camera resets after the new subject pose");
  replay.seek(5);
  assert.equal(cars[1].retired, false, "backward seek revives the car at that moment");
  replay.setPaused(false); replay.tick(10);
  assert.equal(cars[1].retired, true, "the rewound car can retire again");
  replay.seek(NaN); assert.equal(replay.status().T, 15, "invalid timeline values cannot corrupt the clock");
  replay.seek(999); assert.equal(replay.status().T, 30, "scrubbing is bounded by loaded positions");
  replay.stop();
});

test("WATCH paused follow refreshes the inset before snapping without advancing playback", () => {
  const { replay, G, cars } = transportReplay();
  replay.tick(0.1);
  replay.setPaused(true);
  const before = replay.status(), pictures = [], frames = [];
  G.setPip = (car) => pictures.push(car);
  G.snapGameCam = () => frames.push(replay.status().broadcast.pip.code);
  assert.equal(before.broadcast.pip.code, "BBB");
  replay.follow("BBB");
  assert.deepEqual(pictures, [null, cars[0]], "the newly followed inset car is replaced immediately");
  assert.deepEqual(frames, ["AAA"], "the camera sees the refreshed inset");
  assert.equal(replay.status().T, before.T);
  assert.equal(replay.status().broadcast.cuts, before.broadcast.cuts);
  assert.equal(replay.status().paused, true);
  replay.follow("AAA");
  assert.equal(replay.status().broadcast.pip.code, "BBB", "a second paused follow also refreshes");
  replay.stop();
});

test("WATCH follow lock survives director holds and event navigation, AUTO releases it, and restart clears playback state", () => {
  const { replay, G } = transportReplay({}, { completeSubject: true });
  replay.setLocked(true);
  replay.tick(25);
  assert.equal(replay.status().follow, "AAA", "the selected driver stays locked beyond the old twenty-second hold");
  assert.equal(replay.status().broadcast.locked, true);
  replay.seek(0); replay.setPaused(true);
  assert.equal(replay.eventStep(1), "BBB PASSES AAA FOR P1");
  assert.equal(replay.status().T, 4, "event navigation gives eight seconds of context");
  assert.equal(replay.status().follow, "AAA", "event navigation preserves a locked subject");
  assert.equal(replay.status().paused, true, "scrubbing does not start paused playback");
  replay.setAuto(true);
  assert.equal(replay.status().broadcast.locked, false);
  assert.equal(replay.autoOn(), true);
  replay.stop();
  assert.equal(G.camMode, 0, "exit restores the player's driving camera");
  assert.equal(replay.status(), null);
});

test("WATCH paused event navigation paints the final subject and event shot in one camera snap", () => {
  const { replay, G, cars } = transportReplay({}, { completeSubject: true });
  const frames = [];
  G.snapGameCam = (paint) => frames.push({ paint, car: G.player.code, prog: G.player.prog,
    camera: G.camMode, T: G.raceT });
  replay.setPaused(true);
  replay.eventStep(1);
  assert.deepEqual(frames, [{ paint: true, car: "BBB", prog: 180, camera: 3, T: 4 }]);
  assert.equal(replay.status().broadcast.shot, "chase");
  assert.equal(replay.status().paused, true);
  for (const car of cars) assert.equal(car.rPrevPx, car.px, "event navigation clears interpolation");
  replay.stop();
});

test("WATCH timeline changes reset commentary at the new clock and pose before snapping", () => {
  const { replay, G, options } = transportReplay({}, { completeSubject: true });
  const order = [];
  G.raceRadio = { resetTimeline: () => order.push(["radio", G.raceT, G.player.prog]) };
  G.snapGameCam = () => order.push(["snap", G.raceT, G.player.prog]);
  for (const T of [15, 2]) {
    order.length = 0; replay.seek(T);
    assert.deepEqual(order, [["radio", T, T * 50], ["snap", T, T * 50]]);
  }
  order.length = 0; replay.eventStep(1);
  assert.deepEqual(order, [["radio", 4, 180], ["snap", 4, 180]], "commentary sees the event's newly selected driver");
  options.reel = true;
  options.script.passes = [{ t: 10, by: 1, over: 2 }, { t: 20, by: 1, over: 2 }];
  replay.start(options);
  order.length = 0; replay.skip();
  assert.deepEqual(order, [["radio", 12, 600], ["snap", 12, 600]], "reel cuts share the commentary reset");
  replay.stop();
});

test("HIGHLIGHTS opens with the event's shot and preserves manual subject and camera across cuts", () => {
  for (const automatic of [false, true]) {
    const { replay, G, options } = transportReplay();
    options.reel = true;
    options.script.passes = [{ t: 10, by: 2, over: 1 }, { t: 50, by: 1, over: 2 }];
    options.traces.cars = { 1: line(0, 50, 0, 0, 100), 2: line(0, 45, 0, 0, 100) };
    const frames = [];
    G.snapGameCam = (paint) => frames.push({ paint, car: G.player.code, camera: G.camMode });
    replay.start(options);
    assert.equal(replay.status().follow, "BBB", "opening follows the first event's driver");
    assert.equal(replay.status().broadcast.shot, "chase", "opening gets the pass shot");
    assert.equal(frames.at(-1).camera, 3, "entry snap includes the event camera");
    G.camMode = 2; // A viewer-picked HELI camera, with the current driver retained.
    replay.takePicture();
    if (automatic) replay.tick(14); else { replay.setPaused(true); replay.skip(); }
    assert.equal(replay.status().T, 42);
    assert.equal(replay.status().follow, "BBB", "manual hold retains the viewer's driver");
    assert.equal(G.camMode, 2, "manual hold retains the viewer's camera");
    assert.equal(replay.status().broadcast.manual, true);
    assert.equal(frames.at(-1).car, "BBB");
    assert.equal(frames.at(-1).camera, 2);
    replay.setAuto(true);
    assert.equal(replay.status().broadcast.manual, false, "AUTO releases the manual hold");
    replay.setPaused(true);
    replay.eventStep(-1);
    replay.eventStep(1);
    assert.equal(replay.status().follow, "AAA", "AUTO can follow events again");
    replay.stop();
  }
});

test("HIGHLIGHTS scrub into a reel gap follows the next item's driver before its event (#2196)", () => {
  const { replay, G, cars, drivers, options } = transportReplay();
  const ccc = { code: "CCC" };
  cars.push(ccc); drivers.push({ code: "CCC", num: 3, pos: 3, name: "Driver C", lapStart: [0] });
  options.seats = new Map([[cars[0], drivers[0]], [cars[1], drivers[1]], [ccc, drivers[2]]]);
  options.reel = true;
  options.script.passes = [{ t: 100, by: 2, over: 1 }, { t: 300, by: 3, over: 2 }];
  options.traces.cars = { 1: line(0, 50, 0, 0, 400), 2: line(0, 50, 0, 0, 400), 3: line(0, 50, 0, 0, 400) };
  replay.start(options);
  assert.equal(replay.status().follow, "BBB");
  const cuts = replay.status().broadcast.cuts;
  replay.seek(250);
  assert.equal(replay.status().reelIdx, 1);
  assert.equal(replay.status().follow, "CCC", "the scrub lands on the next item's driver");
  assert.ok(replay.status().broadcast.cuts > cuts, "the scrub is a cut");
  for (let i = 0; i < 56; i++) replay.tick(1);
  assert.equal(replay.status().T, 306);
  assert.equal(replay.status().follow, "CCC", "CCC's pass at 300 is on camera");
  replay.stop();
});

test("HIGHLIGHTS NEXT onto a reel item lands on it, and the clock never runs back (#2196)", () => {
  const { replay, drivers, options } = transportReplay();
  drivers[0].pits = [2]; drivers[0].pitT = [106];
  options.reel = true;
  options.script.passes = [{ t: 100, by: 2, over: 1 }];
  options.traces.cars = { 1: line(0, 50, 0, 0, 400), 2: line(0, 50, 0, 0, 400) };
  replay.start(options);
  assert.equal(replay.status().T, 92);
  replay.eventStep(1);
  assert.equal(replay.status().T, 98);
  assert.equal(replay.status().reelIdx, 1, "NEXT lands reelIdx on the pit stop");
  assert.equal(replay.status().follow, "AAA");
  let last = replay.status().T;
  for (let i = 0; i < 12; i++) {
    replay.tick(1);
    const T = replay.status().T;
    assert.ok(T > last, "T runs forward: " + last + " -> " + T);
    last = T;
  }
  replay.stop();
});

for (const spoken of [false, true]) for (const next of [{ kind: "pit", t: 11 }, { kind: "pass", t: 16 }, { kind: "pit", t: 23 }]) {
  test(`automatic HIGHLIGHTS stays forward and announces overlapping ${next.kind}@${next.t} once (${spoken ? "commentary" : "captions"})`, () => {
    const { replay, G, drivers, options } = transportReplay({}, { completeSubject: true });
    const messages = [], captions = [];
    let resets = 0, finishes = 0;
    G.announce = (text, _duration, _kind, current) => { messages.push(text); captions.push(current); return true; };
    G.raceRadio = { resetTimeline: () => { resets++; }, commentates: () => spoken,
      replayEvent: (h) => { messages.push(h.text); return true; } };
    G.endRace = () => { finishes++; };
    options.script.passes = [{ t: 10, lap: 1, by: 1, over: 2, pos: 1 }];
    if (next.kind === "pit") { drivers[1].pits = [1]; drivers[1].pitT = [next.t]; }
    else options.script.passes.push({ t: next.t, lap: 1, by: 2, over: 1, pos: 1 });
    replay.start({ ...options, reel: true });
    assert.equal(replay.status().reel, 2);
    resets = 0;
    let previous = replay.status().T;
    for (let i = 0; i < 40 && !replay.status().finished; i++) {
      replay.tick(1);
      const state = replay.status();
      assert.ok(state.T > previous, `automatic clock ${previous} -> ${state.T}`);
      previous = state.T;
      if (state.T === 16) {
        assert.equal(state.reelIdx, 1);
        assert.equal(state.follow, "BBB", "overlapping cut selects the next live subject");
        assert.ok(captions.every((current) => current()), "continuous cuts retain already accepted captions");
      }
    }
    assert.equal(resets, 0, "overlap and touching lead-ins never reset commentary history");
    assert.equal(messages.filter((text) => text.includes("AAA PASSES BBB")).length, 1);
    assert.equal(messages.filter((text) => text.includes(next.kind === "pit" ? "BBB PITS" : "BBB PASSES AAA")).length, 1);
    assert.equal(finishes, 1); assert.equal(replay.status().finished, true);
    replay.tick(1); assert.equal(finishes, 1, "terminal replay settles only once");
    replay.stop();
  });
}

test("manual HIGHLIGHTS skip, chapter and seek retain intentional replay of overlapping lead-ins", () => {
  for (const action of ["skip", "chapter", "seek"]) {
    const { replay, G, drivers, options } = transportReplay({}, { completeSubject: true });
    const messages = []; let resets = 0;
    G.announce = (text) => { messages.push(text); return true; };
    G.raceRadio = { resetTimeline: () => { resets++; } };
    drivers[1].pits = [1]; drivers[1].pitT = [11];
    options.script.passes = [{ t: 10, lap: 1, by: 1, over: 2, pos: 1 }];
    replay.start({ ...options, reel: true });
    for (let i = 0; i < 13; i++) replay.tick(1);
    assert.equal(replay.status().T, 15); resets = 0;
    if (action === "skip") replay.skip();
    else if (action === "chapter") replay.seekEvent(1);
    else replay.seek(3);
    assert.equal(replay.status().T, 3, action + " deliberately restores the full next lead-in");
    assert.equal(resets, 1);
    for (let i = 0; i < 8; i++) replay.tick(1);
    assert.equal(messages.filter((text) => text.includes("AAA PASSES BBB")).length, 2, "explicit replay may announce the event again");
    assert.equal(messages.filter((text) => text.includes("BBB PITS")).length, 2);
    replay.stop();
  }
});

test("overlapping automatic cuts keep active radio while large steps skip exhausted holds into the next forward segment", () => {
  const clips = [];
  const { replay, G, drivers, options } = transportReplay({ Audio: class {
    constructor() { this.paused = true; clips.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  } }, { completeSubject: true });
  options.traces.cars = { 1: line(0, 50, 0, 0, 100), 2: line(0, 45, 0, 0, 100) };
  options.script.passes = [{ t: 10, by: 1, over: 2 }, { t: 16, by: 2, over: 1 }, { t: 50, by: 1, over: 2 }];
  drivers[1].pits = [1, 2]; drivers[1].pitT = [11, 16];
  options.script.radio = [{ t: 14, num: 1, url: "https://example.test/radio.mp3" }];
  G.soundOn = true;
  let resets = 0;
  G.raceRadio = { resetTimeline: () => { resets++; } };
  replay.start({ ...options, reel: true }); resets = 0;
  for (let i = 0; i < 14; i++) replay.tick(1);
  assert.equal(replay.status().T, 16);
  assert.equal(clips.length, 1); assert.equal(clips[0].paused, false, "continuous footage keeps its current radio clip");
  assert.equal(resets, 0);
  replay.tick(10);
  assert.equal(replay.status().T, 42, "exhaust all overlapping holds in one step before the next forward lead-in");
  assert.equal(replay.status().reelIdx, 4);
  assert.equal(clips[0].paused, true, "a genuine forward time jump releases old audio");
  assert.equal(resets, 1);
  replay.tick(20);
  assert.equal(replay.status().finished, true, "a large terminal step finishes without revisiting an old segment");
  replay.stop();
});

test("a short automatic forward cut does not re-fire a radio event inside the new caption window", () => {
  const clips = [], messages = [];
  const { replay, G, options } = transportReplay({ Audio: class {
    constructor() { this.paused = true; clips.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  } }, { completeSubject: true });
  options.script.passes = [{ t: 10, by: 1, over: 2 }, { t: 25, by: 2, over: 1 }];
  options.script.radio = [{ t: 15, num: 1, url: "https://example.test/near-cut.mp3" }];
  G.soundOn = true; G.announce = (text) => { messages.push(text); return true; };
  replay.start({ ...options, reel: true });
  for (let i = 0; i < 13; i++) replay.tick(1);
  assert.equal(clips.length, 1); assert.equal(clips[0].paused, false);
  replay.tick(1);
  assert.equal(replay.status().T, 17); assert.equal(clips[0].paused, true);
  replay.tick(1);
  assert.equal(clips.length, 1, "the recent radio event was already consumed before the forward cut");
  assert.equal(messages.filter((text) => text.includes("RADIO")).length, 1);
  replay.stop();
});

test("WATCH paused seek repaints the timing tower and race clock without advancing the director", () => {
  const element = () => ({ children: [], dataset: {}, style: {}, textContent: "", classList: { add() {}, remove() {}, toggle() {} },
    appendChild(n) { this.children.push(n); return n; }, setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; } });
  const tower = element(), document = { body: element(), createElement: element, getElementById: (id) => id === "bc-tower" ? tower : null };
  const { replay, G, drivers } = transportReplay({ document });
  drivers[0].laps = [10, 10];
  replay.tick(0.1);
  assert.match(tower.children[0].textContent, /^LAP 1\/2/);
  replay.setPaused(true);
  const cuts = replay.status().broadcast.cuts;
  replay.seek(15);
  assert.match(tower.children[0].textContent, /^LAP 2\/2/);
  assert.equal(G.raceT, 15);
  assert.equal(replay.status().broadcast.cuts, cuts);
  assert.equal(replay.status().paused, true);
  replay.stop();
});

test("WATCH manual and automatic reel cuts release radio and reset timeline presentation before snapping", () => {
  for (const automatic of [false, true]) for (const locked of [false, true]) {
    const clips = [];
    const { replay, G, cars, options } = transportReplay({ Audio: class {
      constructor() { this.paused = true; clips.push(this); }
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
    } });
    options.reel = true;
    options.script.passes = [{ t: 10, by: 1, over: 2 }, { t: 50, by: 2, over: 1 }];
    options.script.radio = [{ t: 11, num: 1, url: "https://example.test/radio.mp3" }];
    options.traces.cars = { 1: line(0, 50, 0, 0, 100), 2: line(0, 45, 0, 0, 100) };
    G.soundOn = true;
    const snaps = [], pip = [], hud = [];
    G.snapGameCam = (paint) => snaps.push({ paint, prog: G.player.prog, clock: G.raceT });
    G.setPip = (c) => pip.push(c);
    G.refreshHud = () => hud.push(G.raceT);
    replay.start(options);
    replay.setLocked(locked);
    replay.tick(9); // Opening lead-in starts at T=2: the first radio fires at 11.
    assert.equal(clips[0].paused, false);
    snaps.length = pip.length = hud.length = 0;
    if (automatic) replay.tick(5); else { replay.setPaused(true); replay.skip(); }
    assert.equal(replay.status().T, 42);
    assert.equal(clips[0].paused, true, "the previous segment's audio cannot cross a reel cut");
    assert.equal(G.raceT, 42, "HUD clock changes on the same cut");
    assert.equal(replay.status().follow, locked ? "AAA" : "BBB", "a cut respects a locked subject");
    assert.equal(snaps.at(-1).paint, false, "the cut snaps without forcing headless playback to render");
    assert.equal(snaps.at(-1).prog, locked ? 2100 : 1890);
    assert.equal(snaps.at(-1).clock, 42);
    assert.equal(hud.at(-1), 42);
    assert.ok(pip.includes(null), "the cut drops old broadcast/PiP history");
    for (const car of cars) assert.equal(car.rPrevPx, car.px, "interpolation starts at the new pose");
    assert.equal(replay.status().paused, !automatic, "a paused skip remains paused");
    replay.stop();
  }
});

test("WATCH toolbar exposes working pointer controls, honest event labels and photo ownership, then tears down", () => {
  function element(tag) {
    const listeners = {}, attrs = {};
    let disabled = false, disabledWrites = 0;
    return { tagName: tag.toUpperCase(), dataset: {}, children: [], style: {}, hidden: false,
      get disabled() { return disabled; }, set disabled(v) { disabled = !!v; disabledWrites++; },
      get disabledWrites() { return disabledWrites; },
      classList: { add() {}, remove() {} },
      appendChild(n) { this.children.push(n); n.parentNode = this; return n; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((n) => n !== this); },
      setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k]; },
      addEventListener(k, fn) { listeners[k] = fn; }, dispatch(k) { if (listeners[k]) listeners[k](); } };
  }
  const body = element("body"), doc = { body, createElement: element };
  const ctx = vm.createContext({ document: doc, CamModes: { CAM_MODES: [{ id: "chase", label: "CHASE" }, { id: "heli", label: "AERIAL" }, { id: "tv", label: "TV" }] }, RealReplay: { LEAD_S: 8 } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/watch-transport.js"), "utf8"), ctx, { filename: absSrc("js/ui/watch-transport.js") });
  const W = vm.runInContext("WatchTransport", ctx), calls = [];
  const state = { T: 0, duration: 100, paused: false, speed: 1, follow: "AAA", broadcast: { auto: true, locked: false, manual: false } };
  const api = { describe: () => ({ name: "Test GP", drivers: [{ code: "AAA", name: "Alpha" }, { code: "BBB", name: "Beta" }], events: [{ t: 20, lap: 2, kind: "pass", text: "AAA PASSES BBB" }], speeds: [0.5, 1, 2] }),
    status: () => state, setPaused: (v) => { state.paused = v; }, setSpeed: (v) => { state.speed = v; },
    follow: (v) => { state.follow = v; return v; }, setLocked: (v) => { state.broadcast.locked = v; },
    setAuto: () => { state.broadcast.auto = true; state.broadcast.locked = false; },
    seek: (v) => { state.T = v; }, eventStep: (v) => calls.push(["event", v]) };
  const G = { camMode: 0, setCamMode: (i, opts) => { G.camMode = i; calls.push(["camera", opts.persist]); }, snapGameCam: () => calls.push(["snap"]), openWatchPhoto: () => calls.push(["photo", state.paused]) };
  const ui = W.create(G, api); ui.start();
  const find = (key, parent = body) => parent.dataset.wt === key ? parent : parent.children.map((n) => find(key, n)).find(Boolean);
  assert.equal(find("play").getAttribute("aria-label"), "Pause replay");
  assert.equal(find("play").textContent, "❚❚", "pause uses the same visible bars as the main game button");
  assert.equal(find("camera").value, "tv", "the dropdown reflects active replay AUTO ownership");
  assert.equal(find("prev").disabled, true); assert.equal(find("next").disabled, false);
  const buttonWrites = () => find("prev").disabledWrites + find("next").disabledWrites;
  const startWrites = buttonWrites();
  for (let i = 0; i < 30; i++) ui.tick(0.1);
  assert.equal(buttonWrites(), startWrites, "stable event bounds do not wake disabled-attribute observers");
  assert.match(find("event").textContent, /^NEXT · L2/, "an upcoming moment is explicitly marked NEXT");
  find("play").dispatch("click"); assert.equal(state.paused, true);
  assert.equal(find("play").getAttribute("aria-label"), "Play replay");
  assert.equal(find("play").textContent, "\u25b6\ufe0e", "play explicitly requests text presentation");
  find("play").dispatch("click");
  assert.equal(find("play").textContent, "❚❚", "resuming restores the visible pause glyph");
  find("speed").value = "2"; find("speed").dispatch("change"); assert.equal(state.speed, 2);
  find("driver").value = "BBB"; find("driver").dispatch("change");
  assert.equal(state.follow, "BBB"); assert.equal(state.broadcast.locked, true);
  find("camera").value = "heli"; find("camera").dispatch("change");
  assert.deepEqual(calls.slice(-2), [["camera", false], ["snap"]], "changing view is temporary and resets framing");
  assert.equal(find("camera").value, "heli");
  const cameraCalls = calls.length;
  find("camera").value = "tv"; find("camera").dispatch("change");
  assert.equal(state.broadcast.locked, false, "TV releases the viewer lock and enables the replay director");
  assert.equal(find("auto").getAttribute("aria-pressed"), "true");
  assert.equal(find("camera").value, "tv");
  assert.equal(G.camMode, 1, "the inactive live-race TV rig never replaces the current replay shot");
  assert.equal(calls.length, cameraCalls, "selecting TV does not write or snap a live-race camera");
  find("seek").value = "30"; find("seek").dispatch("input"); find("seek").dispatch("change");
  assert.equal(state.T, 30); assert.equal(find("seek").getAttribute("aria-valuetext"), "0:30 of 1:40");
  assert.equal(find("next").disabled, true);
  assert.equal(find("prev").disabled, false, "forward seek enables previous event");
  const endWrites = buttonWrites();
  for (let i = 0; i < 30; i++) ui.tick(0.1);
  assert.equal(buttonWrites(), endWrites, "stable final bounds do not rewrite disabled");
  state.T = 0; ui.paint();
  assert.equal(find("prev").disabled, true); assert.equal(find("next").disabled, false);
  find("prev").disabled = false; ui.paint();
  assert.equal(find("prev").disabled, true, "actual DOM state is repaired, not hidden behind a stale cache");
  state.T = 30; ui.paint();
  assert.equal(find("event").textContent, "RACE IN PROGRESS", "running out of highlights does not finish the race");
  state.T = state.duration; ui.paint();
  assert.equal(find("event").textContent, "RACE IN PROGRESS", "a truncated trace endpoint is not an official flag");
  state.finished = true; ui.paint();
  assert.equal(find("event").textContent, "CHEQUERED FLAG");
  find("prev").dispatch("click"); assert.deepEqual(calls.at(-1), ["event", -1]);
  find("auto").dispatch("click"); assert.equal(state.broadcast.locked, false);
  find("photo").dispatch("click"); assert.deepEqual(calls.at(-1), ["photo", false], "photo owner receives the original playing state");
  ui.stop(); assert.equal(body.children.length, 0, "session exit removes the controls");
});

// THE TIMELINE IS NOT A TICKER. paint() runs every 0.1 s and rewrote the range's
// aria-valuetext every time, so a screen reader parked on it re-read the clock
// each second of playback; the PLAY button said aria-pressed=paused ("Play
// replay, pressed") and painted red while paused. Write on change, hold the
// spoken value while the focused timeline plays, and no pressed state on PLAY.
test("WATCH transport: no aria-pressed on PLAY, and a focused, playing timeline is not re-announced", () => {
  function element(tag) {
    const attrs = {}, listeners = {};
    let writes = 0;
    return { tagName: tag.toUpperCase(), dataset: {}, children: [], style: {}, hidden: false,
      classList: { add() {}, remove() {} },
      appendChild(n) { this.children.push(n); n.parentNode = this; return n; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((n) => n !== this); },
      setAttribute(k, v) { attrs[k] = v; writes++; }, getAttribute(k) { return k in attrs ? attrs[k] : null },
      get writes() { return writes; },
      addEventListener(k, fn) { listeners[k] = fn; }, dispatch(k) { if (listeners[k]) listeners[k](); } };
  }
  const body = element("body"), doc = { body, createElement: element, activeElement: null };
  const ctx = vm.createContext({ document: doc, RealReplay: { LEAD_S: 8 } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/watch-transport.js"), "utf8"), ctx, { filename: absSrc("js/ui/watch-transport.js") });
  const W = vm.runInContext("WatchTransport", ctx);
  const state = { T: 10, duration: 100, paused: true, speed: 1, follow: "AAA", broadcast: { auto: true, locked: false, manual: false } };
  const api = { describe: () => ({ name: "GP", drivers: [{ code: "AAA", name: "Alpha" }], events: [], speeds: [1] }), status: () => state,
    setPaused: (v) => { state.paused = v; }, setSpeed() {}, follow() {}, setLocked() {}, setAuto() {}, seek: (v) => { state.T = v; }, eventStep() {} };
  const ui = W.create({ camMode: 0 }, api); ui.start();
  const find = (key, parent = body) => parent.dataset.wt === key ? parent : parent.children.map((n) => find(key, n)).find(Boolean);
  const play = find("play"), seek = find("seek");
  assert.equal(play.getAttribute("aria-pressed"), null, "PLAY is an action whose label says what it does, not a toggle");
  assert.equal(play.getAttribute("aria-label"), "Play replay");
  const w0 = play.writes;
  ui.paint(); ui.paint();
  assert.equal(play.writes, w0, "an unchanged label is not rewritten every paint");
  play.dispatch("click");
  assert.equal(play.getAttribute("aria-label"), "Pause replay");
  doc.activeElement = seek;                     // a reader sits on the timeline while it plays
  const spoken = seek.getAttribute("aria-valuetext");
  state.T = 11; ui.paint(); state.T = 12; ui.paint();
  assert.equal(seek.getAttribute("aria-valuetext"), spoken, "the focused, playing timeline is not re-announced every second");
  play.dispatch("click");                       // paused: the value is live again
  assert.equal(seek.getAttribute("aria-valuetext"), "0:12 of 1:40");
  doc.activeElement = null; play.dispatch("click"); state.T = 13; ui.paint();
  assert.equal(seek.getAttribute("aria-valuetext"), "0:13 of 1:40", "focus elsewhere: it follows the clock");
  ui.stop();
});

test("WATCH playable events exclude unavailable footage and NEXT cannot stick at the trace endpoint", () => {
  const { replay, options, find } = visibleTransportReplay();
  options.script.passes = [{ t: 12, by: 1, over: 2 }, { t: 29, by: 1, over: 2 }, { t: 60, by: 1, over: 2 }];
  replay.start(options); replay.setPaused(true);
  assert.deepEqual(Array.from(replay.describe().events, (e) => e.t), [12, 29]);
  assert.equal(find("markers").children.length, 2);
  assert.ok(replay.eventStep(1)); assert.equal(replay.status().T, 4);
  assert.ok(replay.eventStep(1)); assert.equal(replay.status().T, 21);
  assert.equal(find("next").disabled, true);
  assert.equal(replay.eventStep(1), null); assert.equal(replay.status().T, 21);
  replay.seek(30); assert.ok(replay.eventStep(-1)); assert.equal(replay.status().T, 21);
  assert.ok(replay.eventStep(-1)); assert.equal(replay.status().T, 4);
  assert.equal(replay.status().paused, true);
  replay.stop();
});

test("HIGHLIGHTS chapter jumps retain overlapping event identity instead of replaying the earlier cut", () => {
  const { replay, options, find, drivers } = visibleTransportReplay();
  options.traces.cars = { 1: line(0, 50, 0, -10, 200), 2: line(-20, 50, 0, -10, 200) };
  options.script.passes = [{ t: 100, lap: 1, by: 1, over: 2 }];
  Object.assign(drivers[1], { pits: [1], pitT: [102], stints: [{ from: 1, c: "M" }, { from: 2, c: "S" }] });
  replay.start({ ...options, reel: true }); replay.setPaused(true);
  const chapter = find("chapter"); chapter.value = "1"; chapter.dispatch("change");
  assert.equal(replay.status().T, 94);
  assert.equal(replay.status().reelIdx, 1, "the selected pit, not the earlier overlapping pass, owns the cut");
  assert.equal(replay.status().follow, "BBB");
  assert.equal(replay.status().paused, true);
  replay.setPaused(false); replay.tick(11.1);
  assert.ok(replay.status().T > 105, "the selected chapter does not rewind into itself after the earlier hold");
  assert.equal(replay.status().reelIdx, 1);
  const before = replay.status();
  for (const invalid of [-1, 2, 0.5, "1"]) assert.equal(replay.seekEvent(invalid), null);
  assert.deepEqual(replay.status(), before, "invalid chapter requests leave the replay untouched");
  replay.stop();
});

test("HIGHLIGHTS playable bounds preserve pre-grid footage, clamp cuts and finish at the loaded endpoint", () => {
  const { replay, options, G } = transportReplay();
  options.traces.cars = { 1: line(0, 50, 0, -10, 30), 2: line(0, 45, 0, -10, 30) };
  options.script.passes = [{ t: -12, by: 1, over: 2 }, { t: -8, by: 2, over: 1 }, { t: 29, by: 1, over: 2 }, { t: 60, by: 1, over: 2 }];
  replay.start({ ...options, reel: true });
  assert.equal(replay.status().reel, 2, "filter unavailable events before nearby-event suppression");
  assert.equal(replay.status().T, -10, "retain available pre-grid footage, but do not invent the lead-in");
  replay.seek(-999); assert.equal(replay.status().T, -10);
  assert.equal(replay.eventStep(-1), null, "clipped lead-in cannot repeatedly seek to itself");
  G.camMode = 2; replay.setLocked(true); replay.setPaused(true); replay.skip();
  assert.equal(replay.status().T, 21); assert.equal(G.camMode, 2);
  assert.equal(replay.status().follow, "BBB", "cut keeps the explicitly locked subject");
  replay.setPaused(false); replay.tick(9.1);
  assert.equal(replay.status().finished, true, "final hold cannot run beyond all footage");
  replay.stop(); assert.equal(G.camMode, 0, "saved driving camera is restored");
});

test("HIGHLIGHTS with no playable events falls back to the available full replay", () => {
  const { replay, options, cars } = transportReplay();
  options.script.passes = [{ t: 60, by: 1, over: 2 }];
  replay.start({ ...options, reel: true, startLap: 2 });
  assert.equal(replay.status().reel, 0); assert.equal(replay.status().T, 10);
  replay.tick(1);
  assert.equal(replay.status().finished, false, "empty reel does not immediately finish");
  assert.equal(cars[0].retired, false);
  replay.tick(26); assert.equal(replay.status().finished, true);
  replay.stop();
});

test("WATCH unavailable driver selection stays honest and never locks the previous subject", () => {
  const { replay, find, G } = visibleTransportReplay();
  replay.setPaused(true); replay.seek(20);
  const pick = find("driver"), unavailable = pick.children.find((o) => o.value === "BBB");
  assert.equal(unavailable.disabled, true, "ended trace is unavailable at the current clock");
  assert.match(unavailable.textContent, /unavailable/i);
  const before = replay.status().broadcast, camera = G.camMode;
  pick.value = "BBB"; pick.dispatch("change"); // Also protect a change queued before the car retired.
  assert.equal(replay.status().follow, "AAA"); assert.equal(pick.value, "AAA");
  assert.equal(replay.status().broadcast.locked, false);
  assert.equal(replay.status().broadcast.cuts, before.cuts); assert.equal(G.camMode, camera);
  replay.seek(5);
  assert.equal(unavailable.disabled, false, "rewind restores the choice");
  assert.doesNotMatch(unavailable.textContent, /unavailable/i);
  pick.value = "BBB"; pick.dispatch("change");
  assert.equal(replay.status().follow, "BBB"); assert.equal(replay.status().broadcast.locked, true);
  assert.equal(replay.status().paused, true);
  replay.stop();
});

test("HIGHLIGHTS rejects missing and ended subject footage before nearby pass suppression", () => {
  const { replay, options } = transportReplay();
  options.script.passes = [{ t: 12, by: 2, over: 1 }, { t: 13, by: 1, over: 2 }];
  for (const subject of [undefined, line(0, 45, 0, 0, 10), line(0, 45, 0, 15, 30)]) {
    if (subject) options.traces.cars[2] = subject;
    else delete options.traces.cars[2];
    replay.start({ ...options, reel: true });
    assert.deepEqual(Array.from(replay.describe().events, (e) => e.num), [1]);
    assert.equal(replay.status().follow, "AAA");
  }
  options.traces.cars[2] = line(0, 45, 0, 0, 30);
  replay.start({ ...options, reel: true });
  assert.deepEqual(Array.from(replay.describe().events, (e) => e.num), [2]);
  assert.equal(replay.status().follow, "BBB", "restored subject footage restores the first pass");
  replay.stop();
});

// Actual CamModes / RealReplay / Broadcast / XrBoot; only DOM and XR callback
// production are stubbed. These assert camera ownership, not headset rendering.
function cameraOwnersFixture() {
  // Reserve the XR dependency before this helper eagerly starts a replay.
  // Bind it to the actual module below, before any tested lifecycle. A late
  // lexical addition can retain an unresolved lookup in reused Node VM code.
  const f = transportReplay({ XrBoot: { comfort: () => false } });
  f.replay.stop();
  const { ctx, G, replay, options } = f;
  const stored = new Map(), writes = [];
  let presenting = false, bindings;
  ctx.window = ctx;
  ctx.addEventListener = ctx.removeEventListener = () => {};
  ctx.document = { addEventListener() {}, getElementById: () => null,
    body: { classList: { toggle() {}, contains: () => false, remove() {} }, toggleAttribute() {} } };
  ctx.requestAnimationFrame = () => 1; ctx.cancelAnimationFrame = () => {};
  ctx.CamTunerPanel = { refresh() {} };
  ctx.RealRace = { replay: () => replay };
  ctx.XrSession = { bind: (b) => { bindings = b; }, on() {}, isPresenting: () => presenting };
  G.$ = () => null;
  G.store = { set(k, v) { stored.set(k, v); writes.push([k, v]); } };
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/camera/cam-picker.js"), "utf8"), ctx, { filename: absSrc("js/camera/cam-picker.js") });
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8"), ctx, { filename: absSrc("js/camera/mode-switch.js") });
  G.setCamMode = ctx.CamModes.create(G).setCamMode;
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/xr/xr-boot.js"), "utf8") + "\n;globalThis.boot = XrBoot;", ctx, { filename: absSrc("js/xr/xr-boot.js") });
  ctx.XrBoot = ctx.boot;
  const modes = ctx.CamModes.CAM_MODES, index = (id) => modes.findIndex((m) => m.id === id);
  ctx.boot.bind({ gfx: { attachXrSession() {}, xrCapable: () => true },
    getCamMode: () => G.camMode, setCamMode: G.setCamMode, windowTick() {}, tickBody() {} });
  G.setCamMode(index("far"));
  return { ...f, stored, writes, index, current: () => modes[G.camMode].id,
    watch: (camera = "heli") => replay.start({ ...options, camera, tower: false }),
    enter() { presenting = true; bindings.onStart(); },
    leave() { presenting = false; bindings.onEnd(); },
  };
}

for (const entry of ["watch-first", "vr-first"]) {
  for (const exit of ["watch-first", "vr-first"]) {
    test(`WATCH/XR camera owners restore FAR with ${entry} entry and ${exit} exit`, () => {
      const h = cameraOwnersFixture();
      if (entry === "watch-first") { h.watch(); h.enter(); }
      else { h.enter(); h.watch(); }
      assert.equal(h.current(), "cockpit", "XR priority wins in either entry order");
      if (exit === "watch-first") {
        h.replay.stop();
        assert.equal(h.current(), "cockpit", "ending WATCH cannot replace a live XR owner");
        h.leave();
      } else {
        h.leave();
        assert.equal(h.current(), "heli", "remaining WATCH owner resumes its shot");
        h.replay.stop();
      }
      assert.equal(h.current(), "far", "no ended owner's temporary camera is restored");
      assert.equal(h.stored.get("camMode"), h.index("far"));
      assert.deepEqual(h.writes, [["camMode", h.index("far")]], "temporary owners never persist their shots");
      h.G.setCamMode(h.index("chase"));
      assert.equal(h.current(), "chase", "ordinary manual controls still work after release");
      assert.equal(h.stored.get("camMode"), h.index("chase"));
    });
  }
}

test("WATCH AUTO and highlight cuts retain XR cockpit, then resume the WATCH owner", () => {
  const h = cameraOwnersFixture();
  h.watch(); h.enter();
  assert.equal(vm.runInContext("XrBoot.comfort()", h.ctx), true, "actual XR binding is presenting");
  h.replay.setAuto(true);
  const before = h.replay.status().broadcast.cuts;
  h.replay.tick(20);
  assert.equal(h.current(), "cockpit");
  assert.equal(h.replay.status().broadcast.cuts, before, "director does not cut underneath XR");
  assert.equal(h.replay.autoOn(), true, JSON.stringify(h.replay.status()));
  h.leave();
  assert.equal(h.current(), "heli");
  h.replay.tick(1);
  assert.equal(h.replay.status().broadcast.manual, false, "XR handoff is not mistaken for a manual cut");
  assert.equal(h.replay.autoOn(), true);
  h.replay.stop();
  assert.equal(h.current(), "far");
});

test("WATCH restart under XR replaces only its own token and preserves manual WATCH controls", () => {
  const h = cameraOwnersFixture();
  h.watch(); h.enter();
  h.watch("side");
  assert.equal(h.current(), "cockpit");
  h.leave();
  assert.equal(h.current(), "side");
  h.G.setCamMode(h.index("hood")); h.replay.takePicture();
  assert.equal(h.current(), "hood");
  assert.equal(h.stored.get("camMode"), h.index("far"), "manual WATCH shot is still temporary");
  h.replay.stop();
  assert.equal(h.current(), "far");
  h.enter(); h.leave();
  assert.equal(h.current(), "far", "re-entry does not retain the previous XR token");
});
