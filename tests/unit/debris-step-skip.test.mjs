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

test("asleep-skip helpers exist and share the despawn path with the WASM tick", () => {
  for (const name of ["_ageAndCullPool", "_carNearLiveDebris", "_needSolve", "_anyAwake", "_playerSample"]) {
    assert.match(SRC, new RegExp(`function ${name}\\(`), `${name} missing`);
  }
  const age = extractFn(SRC, "_ageAndCullPool");
  assert.match(age, /isSleeping\(\)/);
  assert.match(age, /restT/);
  assert.match(age, /setEnabled\(false\)/);
  const wake = extractFn(SRC, "_carNearLiveDebris");
  assert.match(wake, /FURN_WAKE_M/, "wake radius must stay the furniture constant");
  assert.match(wake, /_marbles/, "marbleGrip reads sleeping live marbles — they must wake the solve");
  const need = extractFn(SRC, "_needSolve");
  assert.match(need, /_anyAwake/);
  assert.match(need, /_carNearLiveDebris/);
  assert.match(need, /_carNearFurn/);
  assert.match(need, /_dynCars/);
});

test("step() skips world.step on the asleep path and zeros panel force first", () => {
  const step = extractFn(SRC, "step");
  const skipAt = step.indexOf("if (!_needSolve");
  const wasmAt = step.indexOf("world.step(_events)");
  assert.ok(skipAt >= 0, "tier-2 skip must gate on !_needSolve");
  assert.ok(wasmAt > skipAt, "world.step(_events) must stay on the needSolve path, after the skip return");
  const skipBody = step.slice(skipAt, step.indexOf("_tick++"));
  assert.match(skipBody, /_stepSkips\+\+/);
  assert.match(skipBody, /_ageAndCullPool/);
  assert.match(skipBody, /\.force = 0/);
  assert.match(skipBody, /updatePanels/);
  assert.doesNotMatch(skipBody, /world\.step/);
  assert.doesNotMatch(skipBody, /setNextKinematic/);
});

test("status() reports stepSkips; reset() zeroes it", () => {
  assert.match(extractFn(SRC, "status"), /stepSkips:\s*_stepSkips/);
  assert.match(extractFn(SRC, "reset"), /_stepSkips = 0/);
});

test("Rapier is not imported inside the boot burst; prime() starts it if a race comes first", () => {
  // create() used to call setEnabled(true) synchronously, which import()ed
  // 2.2 MB of Rapier + compiled its WASM while the shaders, the asset pack and
  // the first track were all in flight. The side-world is not needed before a
  // race is primed, so the load waits for an idle slice; prime() kicks it at
  // once if the player is faster, and step() builds the world lazily.
  const create = extractFn(SRC, "create");
  assert.doesNotMatch(create, /setEnabled\(true\)/, "create() must not start the Rapier load synchronously");
  assert.match(create, /requestIdleCallback\(kick, \{ timeout: \d+ \}\)/, "the boot kick waits for an idle slice");
  assert.match(create, /else setTimeout\(kick, \d+\)/, "Safari has no requestIdleCallback — a timer fallback is required");
  assert.match(extractFn(SRC, "prime"), /if \(_enabled && _loadState === 0\) _load\(\);/,
    "prime() must start the load when a race arrives before the deferred kick");
  assert.match(extractFn(SRC, "step"), /if \(!world && !_buildWorldSafe\(track, cars\)\) return;/,
    "step() builds lazily, so a load that lands after prime still gets a world");
});

function lateRapier({ enabled = true } = {}) {
  let finish, fail, imports = 0, builds = 0, imported;
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
  });
  // Mock only the external import and costly WASM construction. All readiness,
  // activation and first-step decisions execute the real module.
  const src = SRC.replace("import(url)", "__importRapier(url)")
    .replace(extractFn(SRC, "buildWorld"), `function buildWorld(track, cars) {
      __build(); world = { timestep: FIXED_DT }; _worldTrack = track;
      _mirrors = cars.map(() => ({}));
    }`);
  vm.runInContext(src, ctx);
  const M = vm.runInContext("DebrisWorld", ctx);
  M.create(G);
  return { M, G, finish: () => finish({ default: { init: () => Promise.resolve() } }), fail: (e) => fail(e), arm,
    imports: () => imports, builds: () => builds, urls, timers,
    fire: () => { for (const t of timers) if (t.live) { t.live = false; t.fn(); } } };
}

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
  for (const file of ["js/core/mat4.js", "js/race/race-control.js", "js/physics/incident-sim.js"])
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
