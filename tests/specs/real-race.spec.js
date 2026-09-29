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
    expect(staged).toEqual({ trackId: "baku", laps: 3, seat: "LEC", startLap: 1 });
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
    // The scripted safety car: real lap 2 of 6 is sim lap 1 of 3 (the windows map in
    // proportion), so the field reaching lap 1 -> SC held; lap 2 -> released. Drive the
    // clock by moving a car's lap counter rather than racing: setLap moves the player, and
    // the director reads the HIGHEST lap any running car is on.
    await page.evaluate(() => window.__apex.setLap(1));
    await page.evaluate(() => window.__apex.step(1 / 60, 3));
    const flag = await page.evaluate(() => window.__apex.caution());
    expect(flag.level).toBe(3);
    expect(flag.label).toBe("SAFETY CAR");
    // The hazard loop would drop an applied flag after its MIN_HOLD; a held one survives 8 s of green picture.
    await page.evaluate(() => window.__apex.step(1 / 30, 240));
    expect((await page.evaluate(() => window.__apex.caution())).level).toBe(3);
    await page.evaluate(() => window.__apex.setLap(2));
    await page.evaluate(() => window.__apex.step(1 / 30, 240));
    expect((await page.evaluate(() => window.__apex.caution())).level).toBe(0);
  });
});

test.describe("real race, mid-race", () => {
  test("launch() at a later lap arms in the countdown and drops the field in where it stood on the first green frame", async ({ page }) => {
    test.setTimeout(BOOT_MS + 90000);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.headless(true));
    const staged = await page.evaluate((script) => {
      // eslint-disable-next-line no-undef
      return RealRace.launch(script, { seat: "LEC", laps: 6, startLap: 3 });
    }, SCRIPT);
    expect(staged).toEqual({ trackId: "baku", laps: 6, seat: "LEC", startLap: 3 });
    // The director's hook runs in EVERY state (game.js update() top): the countdown frame arms it — and a
    // mid-race jump-in is a ROLLING start: the field is dropped in at speed on that frame and the race is
    // green at once (no gantry), the seat car driven for the player until the hand-over.
    await page.waitForFunction(() => window.__apex.info().track === "baku" && window.__apex.info().state !== "menu", null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.step(1 / 60, 3));
    const st = await page.evaluate(() => {
      // eslint-disable-next-line no-undef
      const rr = RealRace.status();
      const info = window.__apex.info();
      return { rr, state: info.state, total: info.total, lights: document.getElementById("lights") ? document.getElementById("lights").hidden : null };
    });
    expect(st.state).toBe("race");
    expect(st.rr.armed).toBe(true);
    expect(st.rr.placed).toBe(true);
    expect(st.rr.handover).toBeGreaterThan(3.5);
    expect(st.rr.cars.slice().sort((a, b) => a.grid - b.grid).slice(0, 2).map((c) => c.code)).toEqual(["RUS", "LEC"]);
    expect(st.rr.cars.find((c) => c.code === "LEC").human).toBe(false);   // driven for the player, for now
    expect(st.rr.K).toBeGreaterThan(0.5);
    const by = (code) => st.rr.cars.find((c) => c.code === code);
    // At the start of real lap 3 Russell is on the line beginning lap 3; the others are inside lap 2 or 3 by time.
    expect(by("RUS").lap).toBe(3);
    expect(by("RUS").s).toBeLessThan(25);   // dropped on the line, then a few frames at FULL speed (the AI's for the road ahead)
    expect(by("LEC").lap).toBeGreaterThanOrEqual(2);
    expect(by("LEC").s).toBeGreaterThan(0);
    expect(by("VER").lap).toBeGreaterThanOrEqual(2);
    // Stroll (two laps done, out on lap 3) is still running lap 2 at that instant — his retirement is ahead of him; the seats with no data are parked.
    expect(by("STR").retired).toBe(false);
    expect(by("STR").lap).toBe(2);
    expect(by("STR").dnfAt).toBeCloseTo(2.5 / 6, 6);
    expect(by("HAM").retired).toBe(true);
    // The sets: Russell mid-stint on the mediums he started on; the lap-2 safety car is held at once.
    expect(by("RUS").tyre).toBe("M");   // the live tyre record carries the HUD letter, not the class key
    expect(by("RUS").pitStops).toBe(0);
    expect(st.rr.caution).toBe(0);   // the lap-2 window closed at the end of lap 2: green at the start of lap 3
    // Every car keeps moving from where it was dropped: a few more frames, nobody back on the grid.
    await page.evaluate(() => window.__apex.step(1 / 30, 30));
    // eslint-disable-next-line no-undef
    const later = await page.evaluate(() => RealRace.status());
    expect(later.cars.find((c) => c.code === "RUS").s).toBeGreaterThan(20);
    expect(later.cars.find((c) => c.code === "RUS").lap).toBe(3);
    // The hand-over: four seconds in, the wheel is the player's and the car is still at speed.
    await page.evaluate(() => window.__apex.step(1 / 60, 60 * 3.5));
    // eslint-disable-next-line no-undef
    const handed = await page.evaluate(() => RealRace.status());
    expect(handed.handover).toBe(0);
    expect(handed.cars.find((c) => c.code === "LEC").human).toBe(true);
    expect(handed.cars.find((c) => c.code === "LEC").speed).toBeGreaterThan(15);
  });
});

test.describe("real race, watched", () => {
  test("launch() with the positions loaded recreates the field as puppets: the camera on the seat, follow and speed keys, nobody driving", async ({ page }) => {
    test.setTimeout(BOOT_MS + 90000);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.headless(true));
    // Two synthetic track-frame traces (2 Hz): Russell 50 m/s from 14 m behind the line, Leclerc 48 m/s a metre right.
    const staged = await page.evaluate((script) => {
      const line = (p0, v, x) => { const t = [], prog = [], xs = []; for (let tt = -5; tt <= 120; tt += 0.5) { t.push(tt); prog.push(tt < 0 ? p0 : p0 + v * tt); xs.push(x); } return { t, prog, x: xs }; };
      const traces = { frame: "track", cars: { 63: line(-14, 50, 0), 16: line(-22, 48, 1) } };
      // eslint-disable-next-line no-undef
      return RealRace.launch(script, { seat: "LEC", watch: true, traces, startLap: 1 });
    }, Object.assign({}, SCRIPT, { t0: 1, drivers: SCRIPT.drivers.map((d) => Object.assign({}, d, { lapStart: [0, 112, 222, 331, 440, 549] })) }));
    expect(staged).toEqual({ trackId: "baku", laps: 6, seat: "LEC", startLap: 1, watch: true, reel: false });
    await page.waitForFunction(() => window.__apex.info().track === "baku" && window.__apex.info().state === "count", null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.step(1 / 60, 2));
    // eslint-disable-next-line no-undef
    const armed = await page.evaluate(() => RealRace.status());
    expect(armed.watch).toBe(true);
    expect(armed.replay.follow).toBe("LEC");
    expect(armed.replay.cars).toBe(2);
    // FROZEN from here: the page's own loop must not advance the replay clock between the scripted
    // frames (on the CI runner it added 0.08 s to a one-second step). startRace() resets the flag, so
    // it is set once the race exists; step() drives update() directly, frozen or not.
    await page.evaluate(() => { window.__apex.freeze(true); window.__apex.go(); });
    await page.evaluate(() => window.__apex.step(1 / 60, 60));
    const st = await page.evaluate(() => {
      // eslint-disable-next-line no-undef
      const rr = RealRace.status();
      const info = window.__apex.info();
      return { rr, state: info.state };
    });
    expect(st.state).toBe("race");
    expect(Math.abs(st.rr.replay.T - 1)).toBeLessThan(0.05);
    const by = (code) => st.rr.cars.find((c) => c.code === code);   // the director's per-car view (code, lap, s, speed, human, retired)
    expect(Math.abs(by("RUS").s - 36)).toBeLessThan(2);
    expect(by("RUS").lap).toBe(1);
    expect(Math.abs(by("RUS").speed - 50)).toBeLessThan(1);
    expect(by("LEC").human).toBe(false);
    expect(by("HAM").retired).toBe(true);   // no data for that seat: parked
    // The keys: equal = the next speed (2x: sixty frames advance the clock two seconds, exactly)...
    await page.keyboard.press("Equal");
    // eslint-disable-next-line no-undef
    const t0 = await page.evaluate(() => RealRace.status().replay.T);
    await page.evaluate(() => window.__apex.step(1 / 60, 60));
    // eslint-disable-next-line no-undef
    const faster = await page.evaluate(() => RealRace.status());
    expect(faster.replay.speed).toBe(2);
    expect(Math.abs(faster.replay.T - t0 - 2)).toBeLessThan(0.02);
    // ...period = up the order (Leclerc -> Russell): the camera moves to the car it names (a cut settles
    // the camera with a few sim frames of its own, so no clock assertion rides on it).
    await page.keyboard.press("Period");
    // eslint-disable-next-line no-undef
    const later = await page.evaluate(() => RealRace.status());
    expect(later.replay.follow).toBe("RUS");
    expect(later.replay.speed).toBe(2);
    expect(later.replay.T).toBeGreaterThanOrEqual(faster.replay.T);
  });

  // THE DATA HUB'S JUMP IN goes through the pre-race screen (launch's `intro`),
  // as RACE! does. The suite pins reduced motion, so this is the screen's card
  // path (no flyby, no voice): the card names the REAL event, the race starts
  // behind it with the seat asked for, and the screen is gone once it has. The
  // spoken script is tests/unit/announcer.test.mjs; the flyby is loading-card's.
  test("launch({intro}) — the Data Hub's JUMP IN — shows the pre-race card naming the real event, then starts the race", async ({ page }) => {
    test.setTimeout(BOOT_MS + 90000);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.headless(true));
    const staged = await page.evaluate((script) => {
      const L = document.getElementById("loading");
      window.__ldSeen = [];
      new MutationObserver(() => window.__ldSeen.push({ phase: L.dataset.phase || "", hidden: L.hidden, gp: (document.getElementById("ld-gp") || {}).textContent || "" }))
        .observe(L, { attributes: true, attributeFilter: ["data-phase", "hidden"] });
      // eslint-disable-next-line no-undef
      return RealRace.launch(script, { seat: "LEC", laps: 3, intro: true });
    }, SCRIPT);
    expect(staged).toEqual({ trackId: "baku", laps: 3, seat: "LEC", startLap: 1 });
    await page.waitForFunction(() => window.__apex.info().track === "baku" && window.__apex.info().state !== "menu", null, { polling: 100, timeout: BOOT_MS });
    await page.waitForFunction(() => document.getElementById("loading").hidden, null, { polling: 100, timeout: 30000 });
    const seen = await page.evaluate(() => window.__ldSeen);
    const card = seen.find((s) => s.phase === "card" && !s.hidden);
    expect(card, JSON.stringify(seen)).toBeTruthy();
    expect(card.gp).toBe("2026 Azerbaijan Grand Prix");
    // eslint-disable-next-line no-undef
    const rr = await page.evaluate(() => RealRace.status());
    expect(rr.active).toBe(true);
    expect(rr.seat).toBe("LEC");
  });
});
