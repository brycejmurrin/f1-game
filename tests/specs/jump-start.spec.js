// @ts-check
// False-start penalty at lights-out: throttle already down at green, or a launch
// inside the minimum reaction window (js/race/sporting-regs.js, game.js).
// The grid holds speed at zero until green — not a pre-green movement test.
import { test, expect } from "../helpers/fixtures.js";
import { toMenu, pinFreePlay } from "../helpers/shared-page.js";

async function onGrid(page) {
  await toMenu(page);
  await pinFreePlay(page, { race: ["monza", "day", "dry"] });
  await page.waitForFunction(() => window.__apex.info().state === "count",
    null, { polling: 100, timeout: 30_000 });
}

function penalties(page) {
  return page.evaluate(() => window.__apex.world({ detail: "drive" }).ego.penalties);
}

test.describe("jump start (false start)", () => {
  test("throttle held at lights-out adds +5 s", async ({ page }) => {
    await onGrid(page);
    const out = await page.evaluate(() => {
      const a = window.__apex;
      a.setInput({ steer: 0, throttle: true });
      for (let i = 0; i < 600; i++) {
        const st = a.info().state;
        if (st === "race") break;
        a.step(1 / 60, 1);
      }
      a.clearInput();
      const pen = a.world({ detail: "drive" }).ego.penalties;
      return { state: a.info().state, timePenaltyS: pen.timePenaltyS };
    });
    expect(out.state).toBe("race");
    expect(out.timePenaltyS).toBeGreaterThanOrEqual(5);
  });

  test("waiting for green before throttle accrues no false-start penalty", async ({ page }) => {
    await onGrid(page);
    const out = await page.evaluate(() => {
      const a = window.__apex;
      a.setInput({ steer: 0, throttle: false });
      for (let i = 0; i < 600; i++) {
        if (a.info().state === "race") break;
        a.step(1 / 60, 1);
      }
      for (let i = 0; i < 18; i++) a.step(1 / 60, 1);
      a.setInput({ steer: 0, throttle: true });
      for (let i = 0; i < 30; i++) a.step(1 / 60, 1);
      a.clearInput();
      const pen = a.world({ detail: "drive" }).ego.penalties;
      return { state: a.info().state, timePenaltyS: pen.timePenaltyS };
    });
    expect(out.state).toBe("race");
    expect(out.timePenaltyS).toBe(0);
  });

  // RC2-14: a MANUAL launch inside the 0.2 s reaction window. Throttle is released through the lights
  // (so the early-throttle rule is not what fires) and pressed on the very first green step; the
  // penalty must follow from the launch itself — read from what the car did, not from a build name.
  test("a manual launch inside the reaction window is a false start, and only when the car really moved", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.unlimitedBudget", JSON.stringify(true));
    });
    const fast = {
      engine: "sprint", aero: "reg26_concept", suspension: "titanium_spring", brakes: "regen_brakes",
      tyres: "hypersoft", ers: "overcharge", gearbox: "seamless_shift", fuel: "custom_formula",
      exhaust: "hyper_scav", floor: "venturi", cockpit: "open_cell", wheels: "mag_forged",
    };
    await toMenu(page);
    await pinFreePlay(page, { parts: fast, race: ["monza", "day", "dry"] });
    await page.waitForFunction(() => window.__apex.info().state === "count", null, { polling: 100, timeout: 30_000 });
    const out = await page.evaluate(() => {
      const a = window.__apex;
      a.setInput({ steer: 0, throttle: false });
      for (let i = 0; i < 600 && a.info().state === "count"; i++) a.step(1 / 60, 1);
      const atGreen = { state: a.info().state, raceT: a.timing().raceT, penalty: a.world({ detail: "drive" }).ego.penalties.timePenaltyS };
      a.setInput({ steer: 0, throttle: true });   // first green frame
      const speedGate = PhysicsConsts.VMAX * Math.max(a.tuning().pace, 0.05) * SportingRegs.JUMP_START_SPEED_VREF;
      let crossed = false;
      for (let i = 0; i < 30; i++) {
        a.step(1 / 60, 1);
        if (a.timing().raceT < SportingRegs.JUMP_START_REACT_S && a.physState().speed > speedGate) crossed = true;
      }
      a.clearInput();
      return { atGreen, crossed, penalty: a.world({ detail: "drive" }).ego.penalties.timePenaltyS };
    });
    expect(out.atGreen).toEqual({ state: "race", raceT: 0, penalty: 0 });
    // The assertion is the rule: moved meaningfully inside the window <=> penalised.
    expect(out.penalty > 0, `crossed=${out.crossed} penalty=${out.penalty}`).toBe(out.crossed);
    expect(out.crossed, "a full-throttle fast build launches inside 0.2 s: the case must exercise the rule").toBe(true);
  });

  test("auto-throttle is exempt through the reaction window, including a fast legal build", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.autoThrottle", JSON.stringify(true));
      localStorage.setItem("apex26.unlimitedBudget", JSON.stringify(true));
      localStorage.setItem("apex26.tyreWear", JSON.stringify("real"));
    });
    const fast = {
      engine: "sprint", aero: "reg26_concept", suspension: "titanium_spring", brakes: "regen_brakes",
      tyres: "hypersoft", ers: "overcharge", gearbox: "seamless_shift", fuel: "custom_formula",
      exhaust: "hyper_scav", floor: "venturi", cockpit: "open_cell", wheels: "mag_forged",
    };
    for (const [name, setup] of [["stock", {}], ["fast", fast]]) {
      await toMenu(page);
      await pinFreePlay(page, { parts: setup, race: ["monza", "day", "dry"] });
      await page.waitForFunction(() => window.__apex.info().state === "count",
        null, { polling: 100, timeout: 30_000 });
      const out = await page.evaluate((requested) => {
        const a = window.__apex, team = Teams.LIST.find((t) => t.id === "mclaren");
        const resolved = Parts.resolveSetup(requested, team);
        a.clearInput();
        const grid = { state: a.info().state, speed: a.physState().speed };
        for (let i = 0; i < 600 && a.info().state === "count"; i++) a.step(1 / 60, 1);
        const green = {
          state: a.info().state, raceT: a.timing().raceT,
          speed: a.physState().speed, timePenaltyS: a.world({ detail: "drive" }).ego.penalties.timePenaltyS,
        };
        const speedGate = PhysicsConsts.VMAX * Math.max(a.tuning().pace, 0.05) * SportingRegs.JUMP_START_SPEED_VREF;
        let crossedReactionGate = false, manualInput = false, contact = false;
        for (let i = 0; i < 30; i++) {
          a.step(1 / 60, 1);
          const input = a.inputState();
          manualInput ||= input.throttle || input.throttleLevel !== 0;
          contact ||= a.carAt().contactT > 0;
          if (a.timing().raceT < SportingRegs.JUMP_START_REACT_S && a.physState().speed > speedGate) crossedReactionGate = true;
        }
        return {
          grid, green, crossedReactionGate, manualInput, contact,
          finalSpeed: a.physState().speed, timePenaltyS: a.world({ detail: "drive" }).ego.penalties.timePenaltyS,
          fieldSize: a.timing().total, wear: a.tyres().level,
          autoThrottle: GameStore.store.get("autoThrottle", false), freeBuild: GameStore.store.get("unlimitedBudget", false),
          legal: Object.values(resolved.options).every((o) => Parts.isOptionAvailable(o, team)),
          requestedResolved: Object.entries(requested).every(([cat, id]) => resolved.setup[cat] === id),
        };
      }, setup);
      expect(out.grid).toEqual({ state: "count", speed: 0 });
      expect(out.green).toEqual({ state: "race", raceT: 0, speed: 0, timePenaltyS: 0 });
      expect(out.autoThrottle).toBe(true);
      expect(out.freeBuild).toBe(true);
      expect(out.legal).toBe(true);
      expect(out.requestedResolved).toBe(true);
      expect(out.fieldSize).toBe(22);
      expect(out.wear).toBe("real");
      expect(out.manualInput).toBe(false);
      expect(out.contact).toBe(false);
      expect(out.crossedReactionGate).toBe(name === "fast");
      expect(out.finalSpeed).toBeGreaterThan(0);
      expect(out.timePenaltyS).toBe(0);
    }
  });
});
