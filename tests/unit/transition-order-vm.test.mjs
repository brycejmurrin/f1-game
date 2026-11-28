/* transition-order-vm.test.mjs — the ORDER each race transition resets things in, as goldens.
 *
 * #7397 phase 1 / #7398 member 1. What a transition resets is spread over three partial
 * registries (CarFields.RESETS, the Scopes race bus, SimState) and inline lists in
 * game.js; nothing recorded the order those run in, so a later phase that moves a call
 * into Scopes or SimState had nothing to prove "order preserved" against. This boots the
 * REAL game in the Node VM, wraps every reset-shaped method of the modules below in a
 * recording spy, drives the six transitions and compares each ordered call log with
 * tests/unit/fixtures/transition-order.json.
 *
 *   start (RACE AGAIN)   G.startRace()            startRaceBody
 *   red-flag restart     G.redFlagRestart()
 *   finish               G.endRace()
 *   quit to menu         G.quitToMenu()
 *   episode              G.resetEpisodeOwners()   __apex.reset()
 *   RETRY LAP            LapRetry.retry()         (a time trial)
 *
 * A reorder, an added or a dropped call is a golden edit a reviewer sees. Regenerate on
 * purpose with  UPDATE_TRANSITION_GOLDEN=1 node --test tests/unit/transition-order-vm.test.mjs
 * and read the diff. A per-car loop collapses to "[a, b, c] ×n".
 *
 * Spied: IncidentSim, DebrisWorld, RaceControl (raceCtl), ReplayBuf (replayBuf), SkidMarks
 * (skids), Particles, DrivingCoach (coach), PitLane (pits), WheelState, OvertakeMode,
 * CarFields, SimState, plus the Scopes.enter/exit calls as markers. Spies record and call
 * through; nothing here edits js/.
 *
 * Run: node --test tests/unit/transition-order-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame, settle } = require("../../tools/lib/game-vm.cjs");

const GOLDEN = new URL("./fixtures/transition-order.json", import.meta.url);
const UPDATE = !!process.env.UPDATE_TRANSITION_GOLDEN;
const golden = UPDATE || !fs.existsSync(GOLDEN) ? {} : JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
const produced = {};

/** Reset-shaped member names (a prefix match: resetFor, resetThermal, clearArm, releaseTrack ...). */
const RESET_SHAPED = /^(reset|clear|release|stop|rewound|breakTimeline|restore|capture|enter|exit)/;
/** Singleton modules: wrapped in place after boot. */
const SINGLETONS = ["IncidentSim", "DebrisWorld", "Particles", "WheelState", "OvertakeMode", "CarFields", "SimState"];
/** Factory modules: game.js holds an instance, so the factory's create() is wrapped BEFORE boot. */
const FACTORIES = ["RaceControl", "ReplayBuf", "SkidMarks", "DrivingCoach", "PitLane"];

let log = [];
const spied = (label, k, f) => {
  const spy = function () { log.push(label + "." + k); return f.apply(this, arguments); };
  spy.__spy = true;
  return spy;
};
function wrapMembers(obj, label) {
  for (const k of Object.keys(obj)) {
    const f = obj[k];
    if (typeof f === "function" && RESET_SHAPED.test(k) && !f.__spy) obj[k] = spied(label, k, f);
  }
}
/** A frozen module cannot be wrapped in place: a writable copy stands in for it (same functions, same closures). */
function writableCopy(x) {
  if (!Object.isFrozen(x) && !Object.isSealed(x)) return x;
  const descs = Object.getOwnPropertyDescriptors(x);
  for (const k of Object.keys(descs)) { descs[k].configurable = true; if ("value" in descs[k]) descs[k].writable = true; }
  return Object.create(Object.getPrototypeOf(x), descs);
}
/**
 * onSandbox: each module is caught as game.js's scripts assign it. A FACTORIES module has its
 * create() wrapped (game.js holds an instance); a SINGLETONS module has its members wrapped.
 */
function trapModules(sandbox) {
  for (const name of [...FACTORIES, ...SINGLETONS, "Scopes"]) {
    let mod;
    Object.defineProperty(sandbox, name, {
      configurable: true, enumerable: true,
      get() { return mod; },
      set(x) {
        if (!x || typeof x !== "object") { mod = x; return; }
        mod = x = writableCopy(x);
        if (FACTORIES.includes(name)) {
          if (typeof x.create !== "function" || x.create.__spy) return;
          const create = x.create;
          x.create = function () {
            const inst = create.apply(this, arguments);
            if (inst && typeof inst === "object") wrapMembers(inst, name);
            return inst;
          };
          x.create.__spy = true;
        } else if (name === "Scopes") {
          // The bus calls are markers, with the transition they name.
          for (const k of ["enter", "exit"]) {
            const f = x[k];
            x[k] = function (scope, ctx) { log.push("Scopes." + k + " " + scope + ":" + (ctx && ctx.why) + (ctx && ctx.phase ? "/" + ctx.phase : "")); return f.apply(this, arguments); };
          }
        } else wrapMembers(x, name);
      },
    });
  }
}
/** A run of one call, or of one short cycle of calls (a per-car loop), collapses to "call ×n" / "[a, b, c] ×n". */
function compress(entries) {
  const out = [];
  for (let i = 0; i < entries.length;) {
    let best = { p: 1, n: 1 };
    for (let p = 1; p <= 8 && i + p <= entries.length; p++) {
      let n = 1;
      while (i + (n + 1) * p <= entries.length && entries.slice(i, i + p).every((e, k) => e === entries[i + n * p + k])) n++;
      if (n > 1 && n * p > best.n * best.p) best = { p, n };
    }
    const cycle = entries.slice(i, i + best.p);
    out.push(best.n === 1 ? cycle[0] : (best.p === 1 ? cycle[0] : "[" + cycle.join(", ") + "]") + " ×" + best.n);
    i += best.p * best.n;
  }
  return out;
}
function record(name, entries) {
  produced[name] = compress(entries);
  if (UPDATE) return;
  assert.ok(golden[name], `no golden for "${name}": run with UPDATE_TRANSITION_GOLDEN=1 and commit tests/unit/fixtures/transition-order.json`);
  assert.deepEqual(produced[name], golden[name], `the reset order of "${name}" changed: a deliberate reorder is a golden edit`);
}
function writeGolden() {
  if (!UPDATE) return;
  const keys = ["start", "redFlagRestart", "finish", "quit", "episode", "retryLap"];
  const out = {};
  for (const k of keys) if (produced[k]) out[k] = produced[k];
  fs.writeFileSync(GOLDEN, JSON.stringify(out, null, 2) + "\n");
}

let race = null, tt = null;
before(async () => {
  race = await createGame({ track: "monza", onSandbox: trapModules });
});
after(() => { if (race) race.close(); if (tt) tt.close(); writeGolden(); });

test("start / RACE AGAIN: startRaceBody's reset order", async () => {
  const G = race.G;
  log = [];
  const r = await G.startRace();
  assert.notEqual(r && r.kind, "canceled", "the start completed");
  assert.ok(log.length > 0, "the spies recorded something");
  record("start", log);
});

test("red-flag restart: redFlagRestart's reset order", () => {
  const { G, apex } = race;
  apex.go(); race.step(120);
  G.cmd.setState("race", "test");
  log = [];
  assert.equal(G.redFlagRestart(), true);
  record("redFlagRestart", log);
});

test("finish: endRace's reset order", () => {
  const { G, apex } = race;
  apex.go(); race.step(60);
  G.cmd.setState("race", "test");
  log = [];
  G.endRace();
  record("finish", log);
});

test("episode: __apex.reset()'s reset order", () => {
  log = [];
  race.G.resetEpisodeOwners();
  record("episode", log);
});

test("quit to menu: quitToMenu's reset order", async () => {
  const { G, apex } = race;
  log = [];
  G.quitToMenu();
  assert.equal(apex.info().state, "menu");
  record("quit", log);
});

test("RETRY LAP: LapRetry.retry's reset order (a time trial)", async () => {
  tt = await createGame({ storage: { trackId: "monza" }, onSandbox: trapModules });
  const before = tt.G.cars;
  assert.ok(tt.apex.tt("monza", "day"), "tt() starts");
  assert.ok(await settle(() => tt.G.cars !== before && tt.G.state === "count", 4000), "the TT grid is built");
  tt.pumpFrame(tt.sandbox.performance.now() + 50);   // the first countdown frame drops the car in and captures the world
  assert.equal(tt.G.state, "race", "a flying start: green in the drop-in frame");
  const LR = vm.runInContext("LapRetry.current()", tt.ctx);
  assert.ok(LR.canRetry(), "a drop-in snapshot exists");
  log = [];
  assert.ok(LR.retry());
  record("retryLap", log);
});
