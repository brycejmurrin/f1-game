/* jump-start-vm.test.mjs — tests/specs/jump-start.spec.js replayed in the Node VM
 * (tools/lib/game-vm.cjs): false-start penalty at lights-out.
 *
 * Ported: all 3 tests.
 * Not portable: none — the automatic-start regression also reads the real game context.
 * Regression: auto-throttle's own fast launch cannot earn a false-start penalty.
 *
 * Run: node --test tests/unit/jump-start-vm.test.mjs   (~10 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame, settle } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

async function onGrid() {
  const a = g.apex;
  const carsBefore = g.G.cars;
  const r = a.race("monza", "day", "dry");
  if (!r) throw new Error("race() failed");
  await settle(() => {
    const i = a.info();
    return i && i.track === r.track && g.G.cars !== carsBefore;
  }, 4000);
  await settle(() => a.info().state === "count", 30_000);
  // Do not call go() — the browser spec steps through the gantry to lights-out.
}

function penTime(a) {
  return a.world({ detail: "drive" }).ego.penalties.timePenaltyS;
}

async function stepToRace(a, max = 600) {
  for (let i = 0; i < max; i++) {
    if (a.info().state === "race") return;
    a.step(1 / 60, 1);
  }
}

test("throttle held at lights-out adds +5 s", async () => {
  await onGrid();
  const a = g.apex;
  a.setInput({ steer: 0, throttle: true });
  await stepToRace(a);
  a.clearInput();
  assert.equal(a.info().state, "race");
  assert.ok(penTime(a) >= 5);
});

test("waiting for green before throttle accrues no false-start penalty", async () => {
  await onGrid();
  const a = g.apex;
  a.setInput({ steer: 0, throttle: false });
  await stepToRace(a);
  for (let i = 0; i < 18; i++) a.step(1 / 60, 1);
  a.setInput({ steer: 0, throttle: true });
  for (let i = 0; i < 30; i++) a.step(1 / 60, 1);
  a.clearInput();
  assert.equal(a.info().state, "race");
  assert.equal(penTime(a), 0);
});

test("auto-throttle is exempt through the reaction window, including a fast legal build", async () => {
  const game = await createGame({ track: "monza", storage: { autoThrottle: true, tyreWear: "real", unlimitedBudget: true } });
  try {
    const { apex: a, G, sandbox } = game;
    const { Parts, Input, SportingRegs } = sandbox, team = G.player.team;
    const fast = {
      engine: "sprint", aero: "reg26_concept", suspension: "titanium_spring", brakes: "regen_brakes",
      tyres: "hypersoft", ers: "overcharge", gearbox: "seamless_shift", fuel: "custom_formula",
      exhaust: "hyper_scav", floor: "venturi", cockpit: "open_cell", wheels: "mag_forged",
    };
    const resolved = Parts.resolveSetup(fast, team);
    assert.equal(G.careerOwned(), null, "this is free play, not a career's research allocation");
    assert.equal(G.unlimitedBudget, true, "FREE BUILD was selected with no fitted credit cap");
    for (const [cat, opt] of Object.entries(resolved.options)) {
      assert.equal(opt.id, fast[cat], "the real catalogue must resolve the requested part");
      assert.ok(Parts.isOptionAvailable(opt, team), "every fitted part is available to this team");
    }
    // The stock control and the fast build both use the actual auto-throttle
    // path: no scripted pedal, go(), pose/speed mutation or removed traffic.
    for (const [name, setup] of [["stock", {}], ["fast", fast]]) {
      G.saveTeamParts(team.id, setup);
      await a.race("monza", "day", "dry", { laps: 10 });
      a.clearInput();
      assert.equal(G.state, "count");
      assert.equal(G.cars.length, 22, "keep the full field");
      assert.equal(G.tyres.level(), "real", "keep the normal tyre/fuel integration");
      await stepToRace(a);
      assert.equal(G.state, "race");
      assert.equal(G.raceT, 0, "the countdown, not go(), starts the race clock");
      assert.equal(G.player.speed, 0, "the grid stays still until green");
      assert.equal(penTime(a), 0, "auto-throttle is exempt at green");
      let crossedReactionGate = false;
      for (let i = 0; i < 30; i++) {
        game.step(1);
        assert.equal(Input.throttle(), false, "the driver never presses GAS");
        assert.equal(Input.throttleLevel(), 0);
        assert.equal(G.player.contactT || 0, 0, "traffic must not shove the player into the speed gate");
        if (G.raceT < SportingRegs.JUMP_START_REACT_S &&
            G.player.speed > G.vTop() * SportingRegs.JUMP_START_SPEED_VREF) crossedReactionGate = true;
      }
      assert.equal(crossedReactionGate, name === "fast", "only the upgraded automatic launch reaches the reaction-speed gate");
      assert.equal(G.player.throttleDemand, 1, "automatic acceleration was active");
      assert.equal(penTime(a), 0, name + " auto-throttle must not fine its own launch");
    }
  } finally { game.close(); }
});
