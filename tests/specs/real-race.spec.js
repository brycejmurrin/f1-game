// @ts-check
/**
 * REAL RACE in a real page — only what the VM cannot answer.
 *
 * The director's rules (grid, plans, the pace loop, the flag windows) run in
 * tests/unit/real-race.test.mjs against the real 2026 Baku timing, in
 * milliseconds. What is left here is the wiring: RealRace.launch() staged from
 * the title screen starts a race on the right circuit with the field gridded
 * in the real order, the real strategies and retirements laid over the live
 * cars, the player in the seat asked for, and race control flying a scripted
 * safety car that the hazard loop does not drop.
 *
 * The script is a tiny hand-cut one (four drivers' worth of real numbers), not
 * the fixture: the page's roster is the 2026 grid, so every code below is a
 * real seat, and a 3-lap distance keeps the run inside the group's budget.
 */
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

const SCRIPT = {
  v: 1, source: "test", sessionKey: 1, meetingKey: 1, year: 2026, name: "Azerbaijan Grand Prix", session: "Race",
  circuit: "Baku", country: "Azerbaijan", trackId: "baku", dateStart: "2026-09-26T11:00:00+00:00", tod: "day", weather: "dry",
  laps: 6,
  drivers: [
    { num: 63, code: "RUS", name: "George RUSSELL", team: "Mercedes", teamId: "mercedes", grid: 1, pos: 1, lapsDone: 6, dnf: false,
      laps: [112.3, 109.5, 108.9, 108.8, 108.7, 108.6], stints: [{ c: "MEDIUM", from: 1, to: 3 }, { c: "SOFT", from: 4, to: 6 }], pits: [3] },
    { num: 16, code: "LEC", name: "Charles LECLERC", team: "Ferrari", teamId: "ferrari", grid: 2, pos: 2, lapsDone: 6, dnf: false,
      laps: [113.0, 109.8, 109.1, 109.0, 108.9, 108.8], stints: [{ c: "SOFT", from: 1, to: 6 }], pits: [] },
    { num: 3, code: "VER", name: "Max VERSTAPPEN", team: "Red Bull Racing", teamId: "redbull", grid: 3, pos: 3, lapsDone: 6, dnf: false,
      laps: [113.4, 109.9, 109.2, 109.1, 109.0, 108.9], stints: [{ c: "HARD", from: 1, to: 6 }], pits: [] },
    { num: 18, code: "STR", name: "Lance STROLL", team: "Aston Martin", teamId: "astonmartin", grid: 4, pos: null, lapsDone: 2, dnf: true,
      laps: [114.0, 110.5, null, null, null, null], stints: [{ c: "SOFT", from: 1, to: 2 }], pits: [] },
  ],
  cautions: [{ level: 3, from: 2, to: 2, cause: "SAFETY CAR" }],
};

test.describe("real race", () => {
  test("launch() grids the real order, seats the player, lays the plans, and race control holds the scripted flag", async ({ page }) => {
    test.setTimeout(BOOT_MS + 90000);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.headless(true));
    // Cautions ship OFF; a scripted flag must fly regardless of the hazard loop's switch.
    const staged = await page.evaluate((script) => {
      // RealRace is a script-level const (never a window property): a bare read, as every hook does.
      // eslint-disable-next-line no-undef
      return RealRace.launch(script, { seat: "LEC", laps: 3 });
    }, SCRIPT);
    expect(staged).toEqual({ trackId: "baku", laps: 3, seat: "LEC" });
    await page.waitForFunction(() => window.__apex.info().track === "baku" && window.__apex.info().state !== "menu", null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.go());
    await page.evaluate(() => window.__apex.step(1 / 60, 6));   // a few frames: the director arms on the first
    const st = await page.evaluate(() => {
      const s = window.__apex.info();
      // eslint-disable-next-line no-undef
      const rr = RealRace.status();
      return { state: s.state, lapsTarget: s.lapsTarget, rr };
    });
    expect(st.state).toBe("race");
    expect(st.lapsTarget).toBe(3);
    expect(st.rr.active).toBe(true);
    expect(st.rr.armed).toBe(true);
    expect(st.rr.seat).toBe("LEC");
    expect(st.rr.realLaps).toBe(6);
    expect(st.rr.cars).toHaveLength(22);
    // The real grid, car for car: RUS, LEC (the player), VER, STR, then the seats with no data behind them.
    const grid = st.rr.cars.slice().sort((a, b) => a.grid - b.grid);
    expect(grid.slice(0, 4).map((g) => g.code)).toEqual(["RUS", "LEC", "VER", "STR"]);
    expect(grid[1].human).toBe(true);
    const by = (code) => st.rr.cars.find((x) => x.code === code);
    expect(by("LEC").dnfAt).toBeNull();
    expect(by("RUS").dnfAt).toBeNull();
    expect(by("STR").dnfAt).toBeCloseTo(2.5 / 6, 6);
    expect(by("HAM").dnfAt).toBeCloseTo(0.002, 6);   // no data for that seat: did not start
    expect(by("RUS").start).toBe("medium");
    expect(by("RUS").stops).toEqual([2]);   // the lap-3 stop of a 6-lap race lands on lap 2 of 3
    expect(by("VER").start).toBe("hard");
    expect(by("LEC").start).toBe("soft");
    // The scripted safety car: the leader reaches lap 2 -> SC held; lap 3 -> released. Drive the
    // clock by moving the leader rather than racing: setLap moves the player, who sits P2.
    await page.evaluate(() => window.__apex.setLap(2));
    await page.evaluate(() => window.__apex.step(1 / 60, 3));
    const flag = await page.evaluate(() => window.__apex.caution());
    expect(flag.level).toBe(3);
    expect(flag.label).toBe("SAFETY CAR");
    // The hazard loop would drop an applied flag after its MIN_HOLD; a held one survives 8 s of green picture.
    await page.evaluate(() => window.__apex.step(1 / 30, 240));
    expect((await page.evaluate(() => window.__apex.caution())).level).toBe(3);
    await page.evaluate(() => window.__apex.setLap(3));
    await page.evaluate(() => window.__apex.step(1 / 30, 240));
    expect((await page.evaluate(() => window.__apex.caution())).level).toBe(0);
  });
});
