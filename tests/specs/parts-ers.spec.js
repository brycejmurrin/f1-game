// @ts-check
// ERS deploy economics: BOOST must both PUSH and COST at any speed.
//
// The taper that shapes deploy strength used to reach exactly 0 above TAPER_HI
// (53 m/s std = 191 km/h), and the battery drain was gated on `deploy > 0`. So
// on a straight — the one place a player reaches for it — BOOST produced no
// thrust and consumed no energy, while OVERTAKE (which bypasses the taper)
// worked and drained. These tests pin both halves so the two can't diverge again.
//
// ONE BOOT PER WORKER (sharedTest): four boots became none. The car these
// numbers describe is the default McLaren with nothing fitted, which a fresh
// boot on empty storage gave for free; the shared page has whatever the last
// test fitted (parts-physics fits an ERS pack), so load() pins it before every
// race. UNVERIFIED IN A BROWSER at conversion time.
import { sharedTest as test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { toMenu, pinFreePlay } from "../helpers/shared-page.js";

async function load(page) {
  await toMenu(page);
  // Default team, no parts, and the race in the same evaluate (see pinFreePlay).
  await pinFreePlay(page, { race: ["monza"] });
  await page.waitForFunction(() => window.__apex.info().track === "monza", null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => { window.__apex.go(); });
}

// Hold BOOST at a given speed for a fixed time and report the energy spent and
// the ground gained, against an identical run with BOOST off.
async function boostRun(page, speed, { boost }) {
  return page.evaluate(async ({ speed, boost }) => {
    window.__apex.setEnergy(1);
    window.__apex.jump(0.5, speed, 0);
    window.__apex.step(1 / 60, 2);
    // BOOST is an edge-triggered toggle, so setInput cannot express it.
    window.__apex.setBoost(!!boost);
    window.__apex.step(1 / 60, 1);
    const before = window.__apex.timing().energy;
    const s0 = window.__apex.probe().s;
    window.__apex.step(1 / 60, 90);
    const after = window.__apex.timing().energy;
    window.__apex.setBoost(false);
    return { spent: before - after, gained: window.__apex.probe().s - s0, before, after };
  }, { speed, boost });
}

// THIS SPEC'S COST, MEASURED. Pages run 2002 (33904063866) selected it for the
// first time — a js/garage/ diff pulls in `test:car` — and it failed three
// tests on a plain `Test timeout of 120000ms exceeded`, not on an assertion:
// they RAN for 195.1 s, 175.4 s and 150.9 s, and the state dump showed the game
// healthy (real `phys`, all twelve cars built) with the first car build logged
// at 186218 ms. The whole cost is the FIRST boot; sharedTest gives the other
// three the same page, which is why they cluster and why two of them take
// 0.2 s. On this box the same file is 4/4 green with the slowest test at 29.4 s.
//
// So the number is the RUNNER's, not the code's. BOOT_MS is 45 s and its own
// comment records that it was measured on an IDLE container (worst 24.6 s);
// 88 specs import it, so raising it is a separate change needing its own
// measurement on a loaded runner (docs/notes/TESTING-FIELD-NOTES.md).
//
// Declared so tools/ci/select-specs.mjs EXCLUDES this file by name rather than
// selecting it into a 120 s gate its boot alone cannot clear. An UNDECLARED
// budget is UNKNOWN, not safe — and unknown is what turned a healthy spec into
// a deterministic false red that blocked a deploy. 300 s matches the other
// over-cap specs on this tree and clears the 195 s worst case with margin.
test.describe("ERS deploy — BOOST costs energy wherever it pushes", () => {
  test.setTimeout(300_000);
  test("holding BOOST at high speed drains the battery", async ({ page }) => {
    await load(page);
    // 70 m/s = 252 km/h, well above the old taper cut-off where BOOST went inert.
    const on = await boostRun(page, 70, { boost: true });
    expect(on.before).toBeGreaterThan(0.5);
    expect(on.spent, "BOOST at 252 km/h must consume ERS").toBeGreaterThan(0.05);
  });

  test("BOOST still drains at low speed, where the taper is strongest", async ({ page }) => {
    await load(page);
    const on = await boostRun(page, 25, { boost: true });
    expect(on.spent, "BOOST out of a slow corner must consume ERS").toBeGreaterThan(0.05);
  });

  test("not holding BOOST does not drain — the battery recovers instead", async ({ page }) => {
    await load(page);
    const off = await boostRun(page, 70, { boost: false });
    expect(off.spent, "coasting must not spend ERS").toBeLessThanOrEqual(0);
  });

  test("the deploy taper never reaches zero, so BOOST is never silently inert", async ({ page }) => {
    await load(page);
    const inert = await page.evaluate(() => {
      const out = [];
      for (const v of [20, 40, 55, 70, 90]) {
        window.__apex.setEnergy(1);
        window.__apex.jump(0.5, v, 0);
        window.__apex.step(1 / 60, 2);
        window.__apex.setBoost(true);
        window.__apex.step(1 / 60, 1);
        const before = window.__apex.timing().energy;
        window.__apex.step(1 / 60, 60);
        const spent = before - window.__apex.timing().energy;
        window.__apex.setBoost(false);
        if (spent <= 0.02) out.push(`${v}m/s:${spent.toFixed(4)}`);
      }
      return out;
    });
    expect(inert, "BOOST drew no energy at these speeds").toEqual([]);
  });
});
