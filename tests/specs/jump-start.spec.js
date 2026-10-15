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
});
