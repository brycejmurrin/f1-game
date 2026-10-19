// Source contract for DebrisWorld's two-tier idle: skip world.step when every
// live body is asleep AND no car is inside FURN_WAKE_M, but keep JS despawn
// bookkeeping (and zero panel force) so marbleGrip / PANEL_IDLE_DESPAWN_S stay
// honest. A sleep-only WASM gate without those hoists is the trap the comments
// in step() record — this file fails the moment either helper or the skip
// path is deleted.
//
// Run: node --test tests/unit/debris-step-skip.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/physics/debris-world.js"), "utf8");

function extractFn(src, name) {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name}() not found in js/physics/debris-world.js — was it renamed?`);
  let depth = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error(`unbalanced braces reading ${name}()`);
}

test("a fresh create() imports no Rapier: the boot burst stays clear until ready()/prime() asks", () => {
  // create() used to import 2.2 MB of Rapier + compile its WASM while shaders,
  // the asset pack and the first track were in flight. requestIdleCallback is a
  // no-op in the harness, so nothing may have been requested by create() alone.
  const d = lateRapier();
  assert.equal(d.imports(), 0, "create() must not start the Rapier load synchronously");
  assert.equal(d.M.active(), false);
  d.M.ready();
  assert.equal(d.imports(), 1, "a race arriving first starts it at once");
});

function lateRapier({ enabled = true } = {}) {
  let finish, fail, imports = 0, builds = 0, solves = 0, imported;
  const urls = [], timers = [];
  const arm = () => { imported = new Promise((resolve, reject) => { finish = resolve; fail = reject; }); };
  arm();
  const G = { track: {}, cars: [{ s: 0, x: 0 }] };
  const ctx = vm.createContext({
    URL, document: {}, location: { href: "http://localhost/js/game.js" },
    GameStore: { store: { raw: () => enabled ? "1" : "0" } },
    localStorage: { getItem: () => null }, requestIdleCallback() {},
    // ready()'s cap timer, driven by hand (fire()) so no test sleeps 4 s.
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; },
    Log: { warn() {}, info() {} },
    __importRapier: (url) => { imports++; urls.push(url); return imported; },
    __build: () => { builds++; },
    __solve: () => { solves++; },
    Tracks: { sample(_t, _s, out) { out.p = [0, 0, 0]; out.r = [1, 0, 0]; out.t = [0, 0, 1]; return out; } },
  });
  // Mock only the external import and costly WASM construction. All readiness,
  // activation and first-step decisions execute the real module.
  // __marbles exposes the private pool so a test can seat a settled body without Rapier.
  const src = SRC.replace("import(url)", "__importRapier(url)").replace("return { create, active,", "return { __marbles: () => _marbles, create, active,")
    .replace(extractFn(SRC, "buildWorld"), `function buildWorld(track, cars) {
      __build(); world = { timestep: FIXED_DT, step() { __solve(); } }; _worldTrack = track;
      _mirrors = cars.map(() => ({ setNextKinematicTranslation() {}, setNextKinematicRotation() {} }));
    }`);
  vm.runInContext(src, ctx);
  const M = vm.runInContext("DebrisWorld", ctx);
  M.create(G);
  return { M, G, ctx, solves: () => solves, finish: () => finish({ default: { init: () => Promise.resolve() } }), fail: (e) => fail(e), arm,
    imports: () => imports, builds: () => builds, urls, timers,
    fire: () => { for (const t of timers) if (t.live) { t.live = false; t.fn(); } } };
}

test("two-tier idle: a settled marble far from every car skips the solve; a car inside the wake radius brings it back", async () => {
  const d = lateRapier();
  const p = d.M.ready(); d.finish(); await p;
  d.G.player = null;
  d.G.cars = [{ s: 0, x: 0, px: 5000, pz: 0 }];
  assert.equal(d.M.prime(), true);
  const marble = { live: true, restT: 0, body: { isSleeping: () => true, translation: () => ({ x: 0, y: 0.1, z: 0 }), setEnabled() {} } };
  d.M.__marbles().push(marble);
  const before = d.M.status();
  d.M.step(1 / 60);
  assert.equal(d.M.status().stepSkips, before.stepSkips + 1, "asleep and no car near: JS bookkeeping only");
  assert.equal(d.solves(), 0, "world.step is not called");
  d.G.cars[0].px = 3;   // inside FURN_WAKE_M of the settled marble
  d.M.step(1 / 60);
  assert.equal(d.solves(), 1, "a car in the wake radius runs the solve so it can punt the marble");
  assert.equal(d.M.status().stepSkips, before.stepSkips + 1, "and that frame is not counted as a skip");
  d.G.cars[0].px = 5000;
  marble.body.isSleeping = () => false;
  d.M.step(1 / 60);
  assert.equal(d.solves(), 2, "an awake body always solves");
});

test("race readiness waits for a late import: setup builds once and the first green step does not build", async () => {
  const d = lateRapier();
  assert.equal(d.M.prime(), false, "the old setup path can beat the import");
  const p = d.M.ready();
  d.M.ready();
  assert.equal(d.imports(), 1, "race entry shares the idle/prime load");
  let done = false;
  p.then(() => { done = true; });
  await Promise.resolve();
  assert.equal(done, false, "the countdown must wait for initialization");
  d.finish();
  assert.equal(await p, true);
  assert.equal(d.imports(), 1);
  assert.equal(d.M.prime(), true);
  assert.equal(d.builds(), 1);
  d.M.step(1 / 60);
  assert.equal(d.builds(), 1, "the first race step reuses the setup world");
});

test("race readiness leaves debris disabled and degrades a failed import without rejecting", async () => {
  const off = lateRapier({ enabled: false });
  assert.equal(await off.M.ready(), false);
  assert.equal(off.imports(), 0, "the default-off setting loads no WASM");
  const failed = lateRapier();
  const p = failed.M.ready();
  failed.fail(new Error("offline"));
  assert.equal(await p, false, "optional debris never prevents racing");
  assert.equal(failed.M.active(), false);
  assert.equal(failed.M.prime(), false);
  assert.equal(failed.imports(), 1, "prime() does not re-import a failed load (no loop)");
});

// 3-F3 (round-3 hunt): race entry awaited the optional 2.2 MB Rapier import with
// no cap (a stalled fetch held the loading card), and a failed import latched
// _loadState -1 for the session: neither a later race nor DEBRIS OFF→ON ever
// imported again.
test("race readiness is capped, and a failed import is retried by the next race or toggle (3-F3)", async () => {
  const hang = lateRapier();
  let settled = null;
  hang.M.ready().then((v) => { settled = v; });
  await Promise.resolve();
  const cap = hang.timers.find((t) => t.live);
  assert.ok(cap, "ready() arms a cap while the import is in flight");
  assert.ok(cap.ms > 0 && cap.ms <= 5000, `cap ${cap.ms} ms is in the modelsReady range`);
  hang.fire();
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false, "past the cap the race starts without debris");
  hang.finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(hang.M.active(), true, "the import that lands later still switches debris on (step() builds lazily)");

  const d = lateRapier();
  const p = d.M.ready();
  d.fail(new Error("dropped request"));
  assert.equal(await p, false);
  assert.equal(d.M.status().loadState, -1);
  d.arm();
  const again = d.M.ready();
  assert.equal(d.imports(), 2, "the next race entry imports again");
  assert.notEqual(d.urls[1], d.urls[0], "on a fresh URL: older engines cache a failed module fetch");
  d.fail(new Error("still down"));
  assert.equal(await again, false);
  d.arm();
  d.M.setEnabled(false); d.M.setEnabled(true);
  assert.equal(d.imports(), 3, "DEBRIS OFF→ON imports again");
  d.finish();
  assert.equal(await d.M.ready(), true);
  assert.equal(d.M.active(), true);
  assert.equal(d.M.status().error, null, "a landed retry clears the earlier failure");
});

test("idle Rapier mirrors start incidents at the current human and AI pose", async () => {
  const rapier = await import("../../vendor/rapier-0.19.3/rapier.mjs");
  const car = { s: 2000, x: 2, px: 2000, pz: -2, head: 1.1, speed: 50,
    vLat: 0, human: true, isPlayer: true, prog: 2000, lap: 1 };
  const G = { track: { total: 5000, n: 1000, height: 4, def: { id: "straight" } },
    cars: [car], player: car, gfx: { mobileTier: true }, PACE: 1,
    vTop: () => 72, smp: {}, store: { rev: 0 }, rescuePlayer() {},
    trackFrom: (px, pz) => ({ s: px, x: -pz }),
    worldFromTrack: (s, x) => ({ x: s, z: -x }) };
  const ctx = vm.createContext({
    URL, document: {}, location: { href: "http://localhost/js/game.js" },
    GameStore: { store: { raw: () => "1" } }, localStorage: { getItem: () => null },
    requestIdleCallback() {}, Log: { info() {}, warn() {} }, setTimeout, clearTimeout,
    __importRapier: () => Promise.resolve(rapier),
    Tracks: { sample(track, s, out) {
      out.p = [s, track.height, 0]; out.r = [0, 0, -1]; out.t = [1, 0, 0]; out.hw = 7;
      return out;
    }, wallAt: () => 7 },
  });
  for (const file of ["js/core/mat4.js", "js/physics/ai-drive.js", "js/physics/contact-geometry.js",
    "js/race/race-control.js", "js/physics/incident-sim.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx);
  // Only substitute module loading; promotion, stepping and handback use the
  // shipped DebrisWorld, IncidentSim and vendored Rapier WASM implementation.
  vm.runInContext(SRC.replace("import(url)", "__importRapier()"), ctx);
  const debris = vm.runInContext("DebrisWorld", ctx);
  const incident = vm.runInContext("IncidentSim", ctx);
  debris.create(G);
  assert.equal(await debris.ready(), true);
  assert.equal(debris.prime(), true);
  incident.create(G);
  try {
    for (const human of [true, false]) {
      incident.reset();
      Object.assign(car, { human, head: human ? 1.1 : 0, s: human ? 2000 : 3000,
        x: 2, speed: 50, vLat: 0, retired: false, finished: false });
      car.px = car.s; car.pz = -2; car.prog = car.s;
      const stepped = debris.status().stepped;
      for (let i = 0; i < 60; i++) debris.step(1 / 60);
      assert.equal(debris.status().stepped, stepped, "idle must still skip the WASM solve");
      incident.forceLaunch(); incident.preStep(1 / 60);
      assert.equal(incident.owns(car), true);
      const pose = debris.carBodyPose(0), yaw = human ? car.head : Math.PI / 2;
      assert.ok(Math.abs(pose.x - car.px) < 1e-4, "promotion must discard the stale mirror position");
      assert.ok(Math.abs(pose.z - car.pz) < 1e-4);
      assert.ok(Math.abs(pose.y - 4.45) < 1e-4, "seed current road height");
      assert.ok(Math.abs(pose.qy - Math.sin(yaw / 2)) < 1e-6, "AI uses tangent, human uses heading");
      debris.step(1 / 60); incident.postStep(1 / 60);
      assert.equal(debris.status().stepped, stepped + 1, "an owned car wakes the solve: exactly one WASM step");
      assert.equal(incident.status().fallbacks, 0, "the first dynamic step must survive position validation");
      assert.equal(incident.owns(car), true);
      assert.ok(car.px > (human ? 2000 : 3000), "launch advances from the current car position");
    }
  } finally { incident.reset(); debris.setEnabled(false); }
});

test("settled marble grip applies only on the car's road deck", () => {
  const constants = ["MARBLE_GRIP_R", "MARBLE_GRIP_PER", "MARBLE_GRIP_MIN", "HAZARD_Y_TOL"]
    .map(name => SRC.match(new RegExp(`const ${name} = [^;]+;`))[0]).join("\n");
  const G = { track: { height: 0 } }, c = { s: 10, x: 0 };
  const marbles = Array.from({ length: 9 }, () => ({ live: true, sleeping: true,
    position: { x: 0, y: 0.025, z: 0 } }));
  for (const marble of marbles) marble.body = {
    isSleeping: () => marble.sleeping, translation: () => marble.position,
  };
  const ctx = vm.createContext({ G, _marbles: marbles, world: {}, _marbleGripOn: true,
    _smp: {}, _bankScratch: {}, Tracks: {
      sample(track, s, out) { out.p = [0, track.height, 0]; out.r = [1, 0, 0]; },
      banking(track, s, x, out) {
        if (!track.slope) return null;
        out.dy = x * track.slope; return out;
      },
    },
  });
  vm.runInContext(`${constants}\n${extractFn(SRC, "_anyLive")}\n${extractFn(SRC, "marbleGrip")}`, ctx);
  const grip = vm.runInContext("marbleGrip", ctx);
  assert.equal(grip(c), 0.93, "same-deck cluster keeps the existing grip floor");
  G.track.height = 12;
  assert.equal(grip(c), 1, "marbles below the bridge cannot reduce grip upstairs");
  for (const marble of marbles) marble.position.y += 12;
  assert.equal(grip(c), 0.93, "marbles on the upper deck still reduce upper-deck grip");
  G.track.height = 0;
  assert.equal(grip(c), 1, "upper-deck marbles cannot reduce grip downstairs");
  for (const marble of marbles) marble.position.y = 0.025;
  marbles.forEach((marble, i) => { marble.sleeping = i === 0; });
  assert.equal(grip(c), 0.99, "only settled marbles count");
  c.x = 10;
  assert.equal(grip(c), 1, "same deck still requires horizontal proximity");
  G.track.slope = Math.tan(18 * Math.PI / 180); c.x = 6;
  for (const marble of marbles) {
    marble.sleeping = true;
    marble.position.x = c.x; marble.position.y = c.x * G.track.slope + 0.025;
  }
  assert.equal(grip(c), 0.93, "same-deck marbles on an 18-degree bank still reduce grip");
  G.track.height = 12;
  assert.equal(grip(c), 1, "bank lift does not admit marbles on the lower deck");
  G.track.height = 0; ctx._marbleGripOn = false;
  assert.equal(grip(c), 1, "disabled marble grip stays inert");
  ctx._marbleGripOn = true; ctx.world = null;
  assert.equal(grip(c), 1, "cold/disabled side-world stays inert");
});

// Live debugger hunt 2026-10-16: the world holds the road ribbon only, so a shard
// thrown off it free-falls (-12 m/s at tick 95 in the live capture), never
// sleeps, and is never "far" from a player standing above it. It held a pool slot
// for good and kept the asleep-skip off. The cull now has a kill plane.
test("_ageAndCullPool retires a body that fell below the floor, keeps one resting on it", () => {
  const ctx = vm.createContext({});
  vm.runInContext(`let _floorY = -30; ${extractFn(SRC, "_ageAndCullPool")}; globalThis.cull = _ageAndCullPool;`, ctx);
  const mk = (y, asleep) => ({ live: true, restT: 0, body: {
    isSleeping: () => asleep, translation: () => ({ x: 0, y, z: 0 }), enabled: true,
    setEnabled(v) { this.enabled = v; } } });
  const resting = mk(0.1, false), falling = mk(-31.5, false);
  const pool = [resting, falling];
  ctx.cull(pool, 1 / 60, 0, 0, true, 5, 400);
  assert.equal(resting.live, true, "a piece on the road survives");
  assert.equal(falling.live, false, "a piece below the floor is retired");
  assert.equal(falling.body.enabled, false, "and its Rapier body is disabled");
  // The floor also applies with no player (havePlayer false skipped the position read).
  const lone = mk(-31.5, false);
  ctx.cull([lone], 1 / 60, 0, 0, false, 5, 400);
  assert.equal(lone.live, false, "the kill plane does not depend on a player");
  assert.match(extractFn(SRC, "buildWorld"), /_floorY = lo - FLOOR_MARGIN_M/, "buildWorld sets the floor from the road mesh");
});
