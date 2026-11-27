/* drill-registry.test.mjs — LEARN's drill host (js/learn-drills/registry.js, #6920 U4.1 / #6959).
 * The Aero Lab drill launched through the host writes the same session, in the same order, as the old
 * LearnDoor.launchAeroDrill, and end("quit") restores every field it wrote with MenuQuitTail.keepFlow last.
 *
 * Run: node --test tests/unit/drill-registry.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

function element() {
  return { hidden: false, width: 0, height: 0, setAttribute() {}, append() {}, remove() { this.removed = true; }, getContext: () => null };
}

/** registry.js then learn-door.js in one context (the LAZY_LEARN bundle), with a write log. */
function load({ tracks = [{ id: "bahrain" }, { id: "monza" }] } = {}) {
  const log = [];
  let wind = "calm";
  const ctx = {
    document: { createElement: element, body: { append() {} } },
    window: { matchMedia: () => ({ matches: false }) },
    DrivingLine: { STRIDE: 8 },
    Tracks: { LIST: tracks },
    Wind: { level: () => wind, setLevel: (v) => { wind = v; log.push(["wind", v]); } },
    UiExperience: { leavePracticePick: () => log.push(["leavePracticePick"]) },
    MenuQuitTail: { keepFlow: (f, s) => log.push(["keepFlow", f, s]) },
    Float32Array,
  };
  vm.createContext(ctx);
  for (const rel of ["js/learn-drills/registry.js", "js/learn-drills/aero.js", "js/ui/learn-door.js"]) {
    vm.runInContext(readFileSync(absSrc(rel), "utf8"), ctx, { filename: absSrc(rel) });
  }
  vm.runInContext("this.DrillRegistry = DrillRegistry; this.LearnDoor = LearnDoor;", ctx);
  return { ctx, log };
}

/** A stub G whose every write lands in the log (the flow through its setter, as in game.js). */
function makeG(log, over = {}) {
  let goal = "none";
  const data = {
    state: "menu", netPlay: { active: () => false },
    flow: "career", session: "quali", trackIdx: 0, raceWeather: "wet", raceChangeable: true, raceGrid: "real",
    duel: true, raceDirtyAir: "modern",
    startRace: () => log.push(["startRace"]),
    coach: { practiceGoal: () => goal, setPracticeGoal: (v) => { goal = v; log.push(["goal", v]); return true; } },
    ...over,
  };
  return new Proxy(data, { set(t, k, v) { t[k] = v; log.push([k, v]); return true; } });
}

function host(ctx, G) {
  return ctx.DrillRegistry.create(G, { retry: () => false, setDirtyAir: (v) => { G.raceDirtyAir = v; } });
}

test("define/get/ids/forLesson: the Aero drill is defined lazily and once", () => {
  const { ctx } = load();
  assert.deepEqual([...ctx.DrillRegistry.ids()], [], "nothing is defined at eval: LAZY_LEARN has no load edges");
  ctx.LearnDoor.defineDrills();
  ctx.LearnDoor.defineDrills();
  assert.deepEqual(Array.from(ctx.DrillRegistry.ids(), String), ["aero"]);
  const aero = ctx.DrillRegistry.get("aero");
  assert.equal(aero.lesson, "aero");
  assert.ok(Object.isFrozen(aero) && Object.isFrozen(aero.setup));
  assert.deepEqual(Array.from(ctx.DrillRegistry.forLesson("aero"), (d) => d.id), ["aero"]);
  assert.equal(ctx.DrillRegistry.get("nope"), null);
  assert.throws(() => ctx.DrillRegistry.define({ id: "x", begin() {}, setup: { flow: "gp" } }), /bad descriptor/);
});

test("launch(aero) writes the drill's session in order, then end(quit) restores all ten fields, keepFlow last", () => {
  const { ctx, log } = load();
  ctx.LearnDoor.defineDrills();
  const G = makeG(log);
  const drills = host(ctx, G);
  assert.equal(drills.active(), null);
  assert.equal(drills.launch("aero"), true);
  assert.deepEqual(log, [
    ["leavePracticePick"], ["flow", "gp"], ["session", "race"], ["trackIdx", 1], ["raceWeather", "dry"],
    ["raceChangeable", false], ["raceGrid", "tier"], ["duel", false], ["raceDirtyAir", "classic"], ["wind", "real"], ["startRace"],
  ]);
  const drill = drills.active();
  assert.equal(drill.staging, false);
  assert.equal(drills.active(), drill, "active() is a stable reference (read every frame)");
  assert.equal(drills.guide(), drill.guide);
  assert.equal(typeof drills.guide().draw, "function");
  assert.deepEqual({ ...drills.state() }, { id: "aero", staging: false });

  log.length = 0;
  assert.equal(drills.end("quit"), true);
  assert.deepEqual(log, [
    ["flow", "career"], ["session", "quali"], ["trackIdx", 0], ["raceWeather", "wet"], ["raceChangeable", true],
    ["raceGrid", "real"], ["duel", true], ["raceDirtyAir", "modern"], ["wind", "calm"], ["goal", "none"], ["keepFlow", "career", "quali"],
  ]);
  assert.equal(drills.active(), null);
  assert.equal(drills.guide(), null);
  assert.equal(drills.end("quit"), false, "a second end is a no-op");
});

test("the host refuses: not on the menu, netplay, a drill already active, no Monza, an unknown id", () => {
  for (const [why, over, opts] of [
    ["not menu", { state: "race" }, {}],
    ["netplay", { netPlay: { active: () => true } }, {}],
    ["no monza", {}, { tracks: [{ id: "bahrain" }] }],
  ]) {
    const { ctx, log } = load(opts);
    ctx.LearnDoor.defineDrills();
    const drills = host(ctx, makeG(log, over));
    assert.equal(drills.launch("aero"), false, why);
    assert.deepEqual(log, [], why + ": nothing written");
    assert.equal(drills.active(), null, why);
  }
  const { ctx, log } = load();
  ctx.LearnDoor.defineDrills();
  const drills = host(ctx, makeG(log));
  assert.equal(drills.launch("missing"), false);
  assert.equal(drills.launch("aero"), true);
  log.length = 0;
  assert.equal(drills.launch("aero"), false, "a drill is already active");
  assert.deepEqual(log, []);
});

test("begin() hands the drill the six-member DrillPort, clears staging and hides the guide", () => {
  const { ctx, log } = load();
  const G = makeG(log, { goRolling: () => "rolled", announce: (m) => m, store: { tag: "store" } });
  let seen;
  ctx.DrillRegistry.define({ id: "probe", lesson: "x", setup: { flow: "gp", session: "race", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "real" },
    begin: (g, port) => { seen = { g, port }; return true; } });
  const drills = ctx.DrillRegistry.create(G, { retry: () => "retried", setDirtyAir() {} });
  assert.equal(drills.begin(), false, "no drill: begin() is false");
  drills.launch("probe");
  drills.active().staging = true;
  assert.equal(drills.begin(), true);
  assert.equal(drills.active().staging, false);
  assert.equal(seen.g, G);
  assert.deepEqual(Object.keys(seen.port).sort(), ["announce", "goRolling", "physState", "retry", "startRace", "store"]);
  assert.equal(seen.port.goRolling(), "rolled");
  assert.equal(seen.port.retry(), "retried");
  assert.equal(seen.port.announce("hi"), "hi");
  assert.equal(seen.port.store.tag, "store");
  assert.equal(seen.port.physState(), null, "LAZY_AGENT absent: no __apex");
  assert.equal(drills.guide(), null, "a drill without a guide");
});

// THE ARC NEVER REACHES THE DRIVER (AGENTS.md §Physics; #6559 rule 1e.2). The Aero drill still lives in
// js/learn-drills/aero.js since U4.1b. TrackLine.at (begin() placement) and the render-only guide's DrivingLine reads
// (STRIDE geometry; prepare/speedAt place the braking cue, bankOffset lifts a ribbon, invalidateUpload follows a draw)
// stay allowed in aero.js only: the guide draws and writes nothing to a car.
test("js/learn-drills/ reads no curvature and no racing line", () => {
  const dir = absSrc("js/learn-drills");
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  assert.equal(files.indexOf("registry.js") >= 0, true, "the host is under the grep");
  const GUIDE = "STRIDE|prepare|speedAt|bankOffset|invalidateUpload";
  const forbidden = (f) => [/curvature/i, /racingLine/i, new RegExp(`DrivingLine\\s*\\.\\s*(?!(?:${f === "aero.js" ? GUIDE : "STRIDE"})\\b)\\w+`)];
  const offenders = [];
  for (const f of files) {
    const code = readFileSync(`${dir}/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const re of forbidden(f)) if (re.test(code)) offenders.push(`${f} ${re}`);
  }
  assert.deepEqual(offenders, []);
});
