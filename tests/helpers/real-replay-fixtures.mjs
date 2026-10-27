// Shared fixtures for the real-replay VM tests (tests/unit/real-replay-*.test.mjs, split from
// real-replay-vm.test.mjs by concern, M1-15): the Baku fixture, the trace builder and the hand-built
// transport / audio replays.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { absSrc } from "./abs-src.mjs";
import { evalRealRace } from "./eval-real-race.mjs";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/openf1-baku-2026-race.json"), "utf8"));

export const TOTAL_REAL = 6003;   // the real Baku lap, metres

export const host = (v) => JSON.parse(JSON.stringify(v));   // VM objects into this realm for deepEqual

export function scriptIn(g) {
  // The tab's builder in the game's own realm (Teams and Tracks are the game's).
  evalRealRace(g.ctx);
  const D = vm.runInContext("DataRealRace", g.ctx);
  const Teams = vm.runInContext("Teams", g.ctx), Tracks = vm.runInContext("Tracks", g.ctx);
  const findTeam = (name) => Teams.LIST.find((t) => t.name === name) || null;
  return { D, script: D.build(FIXTURE, findTeam, Tracks.LIST) };
}
/** A synthetic track-frame trace: prog = p0 + v·t from t0 to t1 at 2 Hz (x constant). */

export function line(p0, v, x, t0, t1) {
  const t = [], prog = [], xs = [];
  for (let tt = t0; tt <= t1 + 1e-9; tt += 0.5) { t.push(tt); prog.push(tt < 0 ? p0 : p0 + v * tt); xs.push(x); }
  return { t, prog, x: xs };
}

export function transportReplay(extra = {}, { completeSubject = false } = {}) {
  const ctx = vm.createContext({ M4: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
    Log: { info() {}, warn() {}, debug() {} },
    CamModes: { CAM_MODES: ["cockpit", "side", "heli", "chase", "tcam", "cinematic", "low"].map((id) => ({ id })) },
    Tracks: { sample: (_track, s, out) => { out.p = [s, 0, 0]; out.t = [1, 0, 0]; out.r = [0, 0, 1]; out.hw = 7; } }, ...extra });
  for (const file of ["js/race/broadcast.js", "js/race/real-replay.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx);
  const cars = [{ code: "AAA" }, { code: "BBB" }], snaps = [];
  const drivers = [{ code: "AAA", num: 1, pos: 1, name: "Driver A", lapStart: [0, 10] }, { code: "BBB", num: 2, pos: 2, name: "Driver B", lapStart: [0] }];
  const G = { cars, track: { total: 1000 }, state: "race", camMode: 0, raceT: 0,
    followCar: (c) => { G.player = c; }, snapGameCam: () => snaps.push(G.player.prog),
    setCamMode: (m) => { G.camMode = m; } };
  const replay = vm.runInContext("RealReplay", ctx).create(G);
  const options = { script: { laps: 2, drivers, passes: [{ t: 12, lap: 1, by: 2, over: 1, pos: 1 }] },
    traces: { frame: "track", cars: { 1: line(0, 50, 0, 0, 30), 2: line(0, 45, 0, 0, completeSubject ? 30 : 10) } },
    seats: new Map([[cars[0], drivers[0]], [cars[1], drivers[1]]]), follow: "AAA", camera: "auto" };
  if (completeSubject) assert.ok(options.traces.cars[2].t.at(-1) >= options.script.passes[0].t, "event navigation fixture includes BBB footage at its pass");
  replay.start(options);
  return { replay, G, cars, snaps, drivers, options, ctx };
}

export function directRadioReplay() {
  const clips = [], holds = new Set(), focus = [], ducks = [];
  let generation = 1;
  class Audio {
    constructor() { this.paused = true; this.ended = false; this.muted = false; this.listeners = new Map(); clips.push(this); }
    addEventListener(event, fn) { this.listeners.set(event, fn); }
    removeEventListener(event, fn) { if (this.listeners.get(event) === fn) this.listeners.delete(event); }
    emit(event) { this.listeners.get(event)?.(); }
    play() { this.paused = false; return new Promise((_resolve, reject) => { this.reject = reject; }); }
    pause() { this.paused = true; this.emit("pause"); }
  }
  const fixture = transportReplay({ Audio, GameAudioRadioFx: { playWatchMedia: () => null }, GameAudio: {
    ctxGen: () => generation,
    setVoiceFocusHold(on, owner) { focus.push({ on, owner }); if (on) holds.add(owner); else holds.delete(owner); },
    setRadioDuck: (on) => ducks.push(on),
  } });
  fixture.options.script.radio = [3, 6, 9].map((t) => ({ t, num: 1, url: "https://example.test/" + t + ".mp3" }));
  fixture.G.soundOn = true;
  fixture.G.radio = { volume: () => 0.8 };
  fixture.replay.start(fixture.options);
  return { ...fixture, clips, holds, focus, ducks, rebuild() { generation++; holds.clear(); } };
}

// The replay puppets' engines are voiced from c.speed x c.replayRate -> c.rpm (game.js updateCar: realRace.owns -> rpmFor(naturalGear(v), v);
// a retired car returns before that line and keeps whatever c.rpm it last had).
export function audioHarness() {
  const ctx = vm.createContext({ M4: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
    Log: { info() {}, warn() {}, debug() {} }, PhysicsConsts: { IDLE_RPM: 5000, MAX_RPM: 15000 },
    CamModes: { CAM_MODES: [{ id: "cockpit" }, { id: "heli" }] },
    Tracks: { sample: (_track, s, out) => { out.p = [s, 0, 0]; out.t = [1, 0, 0]; out.r = [0, 0, 1]; out.hw = 7; } } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/real-replay.js"), "utf8"), ctx, { filename: absSrc("js/race/real-replay.js") });
  const R = vm.runInContext("RealReplay", ctx);
  const a = { code: "RUS", rpm: 12000 }, b = { code: "LEC", rpm: 12000 };
  const da = { code: "RUS", num: 63, pos: 1, lapStart: [0] }, db = { code: "LEC", num: 16, pos: 2, lapStart: [0] };
  const G = { track: { total: 100000 }, cars: [a, b], state: "race", camMode: 0, followCar: (c) => { G.player = c; }, snapGameCam() {}, setCamMode() {} };
  const replay = R.create(G);
  assert.equal(replay.start({ script: { drivers: [da, db] }, traces: { frame: "track", cars: { 63: line(0, 50, 0, 0, 60), 16: line(-20, 50, 0, 0, 20) } },
    seats: new Map([[a, da], [b, db]]), startLap: 1, camera: "heli" }), true);
  return { replay, a, b, G };
}

// Actual transport + replay + broadcast: a refused follow must not take camera ownership.
export function visibleTransportReplay() {
  function element(tag) {
    const listeners = {}, attrs = {};
    return { tagName: tag.toUpperCase(), dataset: {}, children: [], style: {},
      classList: { add() {}, remove() {} },
      appendChild(n) { this.children.push(n); n.parentNode = this; return n; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((n) => n !== this); },
      setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return attrs[k]; },
      addEventListener(k, fn) { listeners[k] = fn; }, dispatch(k) { if (listeners[k]) listeners[k](); } };
  }
  const document = { body: element("body"), createElement: element, getElementById: () => null };
  const ctx = vm.createContext({ document, RealReplay: { LEAD_S: 8 } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/watch-transport.js"), "utf8"), ctx, { filename: absSrc("js/ui/watch-transport.js") });
  const fixture = transportReplay({ document, WatchTransport: vm.runInContext("WatchTransport", ctx) });
  const find = (key, parent = document.body) => parent.dataset.wt === key ? parent : parent.children.map((n) => find(key, n)).find(Boolean);
  return { ...fixture, find };
}

export async function watchEnvironment(startLap = 1, duration = 350, tyreWear = "real") {
  const g = await createGame({ track: "baku", storage: { tyreWear } });
  const { script } = scriptIn(g), RR = vm.runInContext("RealRace", g.ctx);
  for (const d of script.drivers) {
    d.lapStart = Array.from({ length: 51 }, (_, i) => i * 10);
    d.laps = Array(51).fill(10);
  }
  script.cautions = [{ from: 2, to: 3, level: 3, tFrom: 12, tTo: 27, cause: "SAFETY CAR" },
    { from: 5, to: 7, level: 4, tFrom: 42, tTo: 69, cause: "RED FLAG" }];
  script.rain = Array.from({ length: 52 }, (_, lap) => lap >= 2 && lap <= 30);
  const v = g.G.track.total / 10;
  const traces = { frame: "track", cars: { 63: line(1, v, 0, 0, duration), 16: line(-20, v, 1, 0, duration) } };
  const previousCar = g.G.cars[0];
  RR.launch(script, { seat: "RUS", watch: true, camera: "heli", traces, startLap });
  await g.settle(() => g.G.cars[0] !== previousCar && g.G.state === "count", 8000);
  g.step(2);
  return { g, G: g.G, RR, script, traces, replay: RR.replay() };
}

