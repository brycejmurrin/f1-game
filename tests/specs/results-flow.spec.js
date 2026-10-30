// @ts-check
// Production acceptance must cross the line and use real controls. Missing
// ceremony support fails; no capability skip or debug-seek proves acceptance.
import { test, expect, BOOT_MS, RACE_BUILD_MS } from "../helpers/fixtures.js";
import { startCareer, goRacing } from "../helpers/career-boot.js";
import { uiTestOptions } from "../../tools/lib/ui-device-profile.mjs";

const LANDSCAPE = { width: 844, height: 390 };
const WAIT = { polling: 100, timeout: BOOT_MS };
const BUTTON = { cooldown: "#ceremony-cooldown-skip", parcFerme: "#ceremony-parc-skip", podium: "#ceremony-continue" };
const NEXT = { cooldown: "parcFerme", parcFerme: "podium", podium: "results" };

async function boot(page, headless = true) {
  await page.goto("/?inspector=0");
  await page.waitForFunction(() => !!window.__apex?.race, null, WAIT);
  if (headless) await page.evaluate(() => window.__apex.headless(true));
}

async function startGp(page, headless = true) {
  await boot(page, headless);
  await page.evaluate(() => window.__apex.race("bahrain", "day", "dry", { laps: 1, grid: "tier" }));
  await page.waitForFunction(() => !!window.__apex.info().track
    && ["count", "race"].includes(window.__apex.info().state), null,
  { polling: 100, timeout: RACE_BUILD_MS });
  if (headless) await page.evaluate(() => { window.__apex.setPhysics({ pace: 1 }); window.__apex.go(); });
  else {
    // A rendered page holds tickBody while the race-entry program warm compiles
    // (~30 s on SwiftShader): go() skipped those lights, crossFlag stepped the whole
    // race inside the warm, and the cooldown's first real frames were still held
    // (#4253). The countdown only advances on frames the warm lets through, so
    // natural lights-out is the player's own proof that the warm has settled.
    await page.evaluate(() => window.__apex.setPhysics({ pace: 1 }));
    await page.waitForFunction(() => window.__apex.info().state === "race" && !GLX.warming(), null,
      { polling: 100, timeout: RACE_BUILD_MS });
  }
  expect(await page.evaluate(() => window.__apex.info().lapsTarget)).toBe(1);
}

// Additional lapped coverage; the existing eight cases remain unchanged.
async function startLappedGp(page, headless = true) {
  await boot(page, headless);
  await page.evaluate(() => window.__apex.race("bahrain", "day", "dry", { laps: 2, grid: "tier" }));
  await page.waitForFunction(() => !!window.__apex.info().track
    && ["count", "race"].includes(window.__apex.info().state), null,
  { polling: 100, timeout: RACE_BUILD_MS });
  await page.evaluate(() => { window.__apex.setPhysics({ pace: 1 }); window.__apex.go(); });
  expect(await page.evaluate(() => window.__apex.info().lapsTarget)).toBe(2);
}

async function phase(page, expected, timeout = 20_000) {
  await expect(page.locator("#results")).toHaveAttribute("data-ceremony-phase", expected, { timeout });
  expect(await page.evaluate(() => window.__apex.ceremony().phase)).toBe(expected);
  if (expected !== "results") await expect(page.locator("#results")).toBeHidden();
}

// Run an actual field race from its ordinary start, observing the field's flag
// while the human drives. Holding the brake at rest would engage reverse.
// No park/jump/reset/setLap/finishRace/phase seek or car-field writes are used.
// Closed-loop input uses the real force model and race-control line crossing.
async function crossFlag(page) {
  expect(await page.evaluate(() => typeof window.__apex.ceremony)).toBe("function");
  const race = await page.evaluate(() => {
    const a = window.__apex, playerId = a.carAt().id;
    a.freeze(true);
    let leader = false, fieldSeconds = 0;
    const startedUnfinished = !a.carAt().finished;
    let crossed = false;
    // Controller follows the existing autopilot.spec.js braking-envelope and
    // pure-pursuit input driver; it does not write any physics or timing state.
    const distances = Array.from({ length: 26 }, (_, i) => 5 + i * 6);
    let previous = a.carAt().prog, stalled = 0, heldSpeed = 30;
    for (let frame = 0; frame < 300 * 60 && a.info().state === "race"; frame++) {
      const p = a.probe(), points = a.scan(distances);
      const look = Math.max(9, p.speed * .4);
      let curvature = p.k, target = Math.abs(p.k) > .0001 ? Math.sqrt(13 / Math.abs(p.k)) : 94;
      points.forEach((point, i) => {
        if (distances[i] <= look) curvature = point.k;
        const corner = Math.abs(point.k) > .0001 ? Math.sqrt(13 / Math.abs(point.k)) : 94;
        target = Math.min(target, Math.sqrt(corner * corner + 48 * distances[i]));
      });
      heldSpeed = Math.min(Math.max(11, Math.min(94, target)), heldSpeed + .5);
      const lead = Math.max(8, Math.min(38, p.speed * .6));
      let steer = Math.max(-1, Math.min(1, 2.4 * (Math.atan2(curvature * lead * lead * .5 - p.x, lead) - p.angle)));
      let throttle = p.speed < heldSpeed, brake = p.speed > heldSpeed * 1.04;
      if (stalled > 10) { steer = Math.max(-.4, Math.min(.4, steer)); throttle = true; brake = false; }
      else if (Math.abs(p.x) > p.hw + .4) throttle = false;
      a.setInput({ steer, throttle, brake }); a.step(1 / 60, 1);
      if (!leader && a.cars().some(c => c.id !== playerId && a.carAt(c.id)?.finished)) {
        leader = true; fieldSeconds = (frame + 1) / 60;
      }
      const prog = a.carAt().prog;
      stalled = prog - previous < .02 ? stalled + 1 : 0; previous = prog;
      if (a.carAt().finished) { crossed = true; break; }
    }
    a.clearInput();
    for (let s = 0; s < 90 && a.info().state === "race"; s++) a.step(1 / 60, 60);
    leader = leader || a.cars().some(c => c.id !== playerId && a.carAt(c.id)?.finished);
    a.freeze(false);
    return { leader, startedUnfinished, crossed, fieldSeconds };
  });
  expect(race.leader, "AI field reaches its chequered flag through ordinary physics").toBe(true);
  expect(race.startedUnfinished, "human starts unclassified before driving across the line").toBe(true);
  expect(race.crossed, "human reaches the real line with throttle input").toBe(true);
  await phase(page, "cooldown");
}

async function crossLappedFlag(page) {
  expect(await page.evaluate(() => typeof window.__apex.ceremony)).toBe("function");
  const race = await page.evaluate(() => {
    const a = window.__apex, playerId = a.carAt().id;
    a.freeze(true);
    // A two-lap race permits a genuine lap deficit: RaceControl requires
    // lap > 1 even after the leader flags. Neutral input holds without reverse.
    a.setInput({ steer: 0, throttle: false, brake: false });
    let leader = false, fieldSeconds = 0;
    for (; fieldSeconds < 300 && a.info().state === "race"; fieldSeconds++) {
      a.step(1 / 60, 60);
      if (a.cars().some(c => c.id !== playerId && a.carAt(c.id)?.finished)) { leader = true; break; }
    }
    const lapAtLeaderFlag = a.carAt().lap;
    const startedUnfinished = !a.carAt().finished;
    let crossed = false;
    // Controller follows the existing autopilot.spec.js braking-envelope and
    // pure-pursuit input driver; it does not write any physics or timing state.
    const distances = Array.from({ length: 26 }, (_, i) => 5 + i * 6);
    let previous = a.carAt().prog, stalled = 0, heldSpeed = 30;
    for (let frame = 0; frame < 300 * 60 && a.info().state === "race"; frame++) {
      const p = a.probe(), points = a.scan(distances);
      const look = Math.max(9, p.speed * .4);
      let curvature = p.k, target = Math.abs(p.k) > .0001 ? Math.sqrt(13 / Math.abs(p.k)) : 94;
      points.forEach((point, i) => {
        if (distances[i] <= look) curvature = point.k;
        const corner = Math.abs(point.k) > .0001 ? Math.sqrt(13 / Math.abs(point.k)) : 94;
        target = Math.min(target, Math.sqrt(corner * corner + 48 * distances[i]));
      });
      heldSpeed = Math.min(Math.max(11, Math.min(94, target)), heldSpeed + .5);
      const lead = Math.max(8, Math.min(38, p.speed * .6));
      let steer = Math.max(-1, Math.min(1, 2.4 * (Math.atan2(curvature * lead * lead * .5 - p.x, lead) - p.angle)));
      let throttle = p.speed < heldSpeed, brake = p.speed > heldSpeed * 1.04;
      if (stalled > 10) { steer = Math.max(-.4, Math.min(.4, steer)); throttle = true; brake = false; }
      else if (Math.abs(p.x) > p.hw + .4) throttle = false;
      a.setInput({ steer, throttle, brake }); a.step(1 / 60, 1);
      if (!leader && a.cars().some(c => c.id !== playerId && a.carAt(c.id)?.finished)) {
        leader = true; fieldSeconds = (frame + 1) / 60;
      }
      const prog = a.carAt().prog;
      stalled = prog - previous < .02 ? stalled + 1 : 0; previous = prog;
      if (a.carAt().finished) { crossed = true; break; }
    }
    a.clearInput();
    for (let s = 0; s < 90 && a.info().state === "race"; s++) a.step(1 / 60, 60);
    leader = leader || a.cars().some(c => c.id !== playerId && a.carAt(c.id)?.finished);
    a.freeze(false);
    const playerLap = a.carAt().lap;
    const finishedAI = a.cars().filter(c => c.id !== playerId).map(c => a.carAt(c.id))
      .filter(c => c && c.finished && !c.retired);
    const leaderLap = Math.max(0, ...finishedAI.map(c => c.lap || 0));
    return { leader, startedUnfinished, crossed, fieldSeconds, lapAtLeaderFlag, playerLap, leaderLap };
  });
  expect(race.leader, "AI field reaches its chequered flag through ordinary physics").toBe(true);
  expect(race.startedUnfinished, "human starts unclassified before driving across the line").toBe(true);
  expect(race.crossed, "human reaches the real line with throttle input").toBe(true);
  expect(race.leaderLap, "winner completed the configured two-lap distance").toBe(3);
  expect(race.playerLap, "human took the actual flag one lap down").toBe(2);
  expect(race.playerLap).toBeLessThan(race.leaderLap);
  await phase(page, "cooldown");
}

async function tapPhase(page, current) {
  await phase(page, current);
  const button = page.locator(BUTTON[current]);
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  const box = await button.boundingBox(), vp = page.viewportSize();
  expect(box, "visible ceremony hit target").not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(-0.5);
  expect(box.y).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
  // Playwright hit testing/actionability, never a DOM click or seek fallback.
  await button.tap();
  await phase(page, NEXT[current]);
}

async function skipChain(page) {
  await tapPhase(page, "cooldown");
  await tapPhase(page, "parcFerme");
  await expect(page.locator('#ceremony-podium [data-results-part="podium"] > li')).toHaveCount(3);
  await tapPhase(page, "podium");
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#res-next")).toBeEnabled();
}

test.afterEach(async ({ pageErrors, consoleLines }) => {
  expect(pageErrors).toEqual([]);
  expect(consoleLines.filter((line) => line.startsWith("error:"))).toEqual([]);
});

test.describe("results-flow — phone landscape acceptance", () => {
  test.use(uiTestOptions({ touch: true, viewport: LANDSCAPE }));
  // Product timers consume 45+8+6 wall seconds in addition to boot/build.
  test.setTimeout(240_000);

  test("natural race finish advances all ceremony phases on timers", async ({ page }) => {
    await startGp(page); await crossFlag(page);
    await phase(page, "parcFerme", 50_000);
    await expect(page.locator("#ceremony-parc-skip")).toBeVisible();
    await phase(page, "podium", 12_000);
    await expect(page.locator('#ceremony-podium [data-results-part="podium"] > li')).toHaveCount(3);
    await phase(page, "results", 10_000);
    await expect(page.locator("#results")).toBeVisible();
    await expect(page.locator("#res-next")).toBeEnabled();
  });

  test("natural flag: actual SKIP/CONTINUE advance every phase at 844×390", async ({ page }) => {
    await startGp(page); await crossFlag(page); await skipChain(page);
    const buttons = page.locator("#results .sheet-foot button:visible");
    expect(await buttons.count()).toBeGreaterThan(0);
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThanOrEqual(-0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(LANDSCAPE.height + 0.5);
    }
  });

  test("race again and menu clear old ceremony ownership and overlays", async ({ page }) => {
    await startGp(page); await crossFlag(page); await skipChain(page);
    await page.locator("#res-next").tap();
    await page.waitForFunction(() => ["count", "race"].includes(window.__apex.info().state)
      && !!window.__apex.info().track, null, { polling: 100, timeout: RACE_BUILD_MS });
    expect(await page.evaluate(() => window.__apex.ceremony().phase)).toBe("idle");
    await expect(page.locator("#ceremony-cooldown-skip")).toBeHidden();
    await expect(page.locator("#ceremony-parc-skip")).toBeHidden();
    await expect(page.locator("#ceremony-podium")).toBeHidden();
    await page.evaluate(() => window.__apex.go());
    await crossFlag(page); await skipChain(page);
    await page.locator("#res-menu").tap();
    await expect(page.locator("#overlay")).toBeVisible();
    expect(await page.evaluate(() => window.__apex.ceremony().phase)).toBe("idle");
    await expect(page.locator("#results")).not.toHaveAttribute("data-ceremony-phase", /.+/);
    await expect(page.locator("#ceremony-podium")).toBeHidden();
  });

  test("harness compatibility: bare finishRace still opens instant GP results", async ({ page }) => {
    await startGp(page);
    expect(await page.evaluate(() => window.__apex.finishRace())).toEqual({ state: "results" });
    await expect(page.locator("#results")).toBeVisible();
    await expect(page.locator("#res-next")).toBeEnabled();
    expect(await page.evaluate(() => window.__apex.ceremony().live)).toBe(false);
  });

  test("harness exclusion: TT ignores a ceremony request", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__apex.tt("bahrain", "day"));
    await page.waitForFunction(() => window.__apex.info().timeTrial === true
      && !!window.__apex.info().track, null, { polling: 100, timeout: RACE_BUILD_MS });
    await page.evaluate(() => { window.__apex.go(); window.__apex.finishRace({ ceremony: true }); });
    await expect(page.locator("#results")).toBeVisible();
    await expect(page.locator("#results-title")).toContainText("TIME TRIAL");
    expect(await page.evaluate(() => window.__apex.ceremony().eligible)).toBe(false);
    await expect(page.locator("#ceremony-cooldown-skip")).toBeHidden();
    await expect(page.locator("#ceremony-podium")).toBeHidden();
  });

  test("harness settlement: career awards once across actual controls and hub return", async ({ page }) => {
    await boot(page); await startCareer(page); await goRacing(page);
    const before = await page.evaluate(() => ({ round: window.__apex.careerState().round,
      results: window.__apex.career().results.length }));
    await page.evaluate(() => { window.__apex.go(); window.__apex.park(0.9); window.__apex.finishRace({ ceremony: true }); });
    await phase(page, "cooldown");
    const settled = await page.evaluate(() => JSON.parse(JSON.stringify(window.__apex.career())));
    expect(settled.season.round).toBe(before.round + 1);
    expect(settled.results).toHaveLength(before.results + 1);
    await skipChain(page);
    expect(await page.evaluate(() => JSON.parse(JSON.stringify(window.__apex.career())))).toEqual(settled);
    await expect(page.locator(".res-settle")).toBeVisible();
    await page.locator("#res-next").tap();
    await expect(page.locator("#career")).toBeVisible();
    // Opening the hub only hands out the NEXT round's objective (`obj`); every settled field stays put.
    expect(await page.evaluate(() => { const c = JSON.parse(JSON.stringify(window.__apex.career())); delete c.obj; return c; }))
      .toEqual({ ...settled, obj: undefined });
  });
  test("natural lapped finish retains its lap deficit through actual ceremony controls", async ({ page }) => {
    await startLappedGp(page);
    await crossLappedFlag(page);
    const before = await page.evaluate(() => window.__apex.carAt());
    expect(before.finished).toBe(true);
    await skipChain(page);
    const after = await page.evaluate(() => window.__apex.carAt());
    expect(after.lap).toBe(before.lap);
    expect(after.finishT).toBe(before.finishT);
    await expect(page.locator("#results")).toBeVisible();
  });

});

test.describe("results-flow — reduced-motion phone", () => {
  test.use({ ...uiTestOptions({ touch: true, viewport: LANDSCAPE }), reducedMotion: "reduce" });
  test.setTimeout(240_000);

  test("natural flag keeps a static phone park pose while the timer advances", async ({ page }) => {
    // headless(true) could make a moving camera appear static: render live.
    await startGp(page, false);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await crossFlag(page); await tapPhase(page, "cooldown");
    const first = await page.evaluate(() => ({ age: window.__apex.ceremony().age, cam: window.__apex.camState() }));
    await page.waitForFunction((age) => window.__apex.ceremony().phase === "parcFerme"
      && window.__apex.ceremony().age >= age + 1, first.age, { polling: 100, timeout: 5000 });
    const later = await page.evaluate(() => window.__apex.camState());
    expect(later.eye).toEqual(first.cam.eye);
    expect(later.tgt).toEqual(first.cam.tgt);
    await tapPhase(page, "parcFerme"); await tapPhase(page, "podium");
    await expect(page.locator("#results")).toBeVisible();
  });
});

test.describe("results-flow — desktop cooldown ownership", () => {
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: false, isMobile: false, reducedMotion: "no-preference" });
  test.setTimeout(240_000);
  test("a naturally finished car takes native throttle without changing classification", async ({ page }) => {
    await startGp(page, false); await crossFlag(page);
    const diag = () => page.evaluate(() => JSON.stringify({ ceremony: window.__apex.ceremony(),
      car: window.__apex.carAt(), active: document.activeElement && (document.activeElement.id || document.activeElement.tagName),
      layers: !!(window.UiLayers && window.UiLayers.anyOpen()), state: window.__apex.info().state }));
    const step = (name, wait) => wait.catch(async e => { throw new Error(`${name}: ${e.message}\n${await diag()}`); });
    await step("cooldown hands input to the player", page.waitForFunction(
      () => window.__apex.ceremony().inputOwner === "player", null, { polling: 100, timeout: 5000 }));
    const before = await page.evaluate(() => window.__apex.carAt());
    await page.keyboard.down("ArrowUp");
    try {
      await step("held ArrowUp advances the finished car", page.waitForFunction(
        prog => window.__apex.carAt().prog > prog + 1, before.prog, { polling: 100, timeout: 5000 }));
    } finally { await page.keyboard.up("ArrowUp"); }
    const after = await page.evaluate(() => window.__apex.carAt());
    expect(after.finished).toBe(true);
    expect(after.finishT).toBe(before.finishT); expect(after.lap).toBe(before.lap);
    expect(await page.evaluate(() => window.__apex.ceremony().cameraOwner)).toBe("chase");
    for (const current of ["cooldown", "parcFerme", "podium"]) {
      await phase(page, current); await page.locator(BUTTON[current]).click();
      await phase(page, NEXT[current]);
    }
    await expect(page.locator("#results")).toBeVisible();
  });
});
