// @ts-check
// Production acceptance must cross the line and use real controls. Missing
// ceremony support fails; no capability skip or debug-seek proves acceptance.
import { CONTRACT_WINDOWS } from "../helpers/iphone15.mjs";
import { test, expect, BOOT_MS, RACE_BUILD_MS } from "../helpers/fixtures.js";
import { startCareer, goRacing } from "../helpers/career-boot.js";
import fs from "node:fs";
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
  const ticks = await page.evaluate(() => {
    window.__apex.setPhysics({ pace: 1 }); window.__apex.go();
    return window.__apex.info().liveTicks;
  });
  // A rendered page holds tickBody while the race-entry program warm compiles
  // (~30 s on SwiftShader). Stepping the race inside it left the cooldown's first
  // real frames held, so held throttle never moved the car (#4253). liveTicks
  // counts only frames past those holds: three of them and nothing warming mean
  // the warm has started and settled, as the lights wait for it in play.
  if (!headless) {
    await page.waitForFunction(t => window.__apex.info().liveTicks >= t + 3
      && !window.__apex.info().warming, ticks, { polling: 100, timeout: RACE_BUILD_MS });
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
    // lap > 1 even after the leader flags. The human CRAWLS (CRAWL m/s) until the
    // leader flags rather than parking: a player stationary for 60 s under green
    // is retired (W26 row 5, AiDrive.stallSweep, STALL_V 1 m/s) and that ends the race.
    // Controller follows the existing autopilot.spec.js braking-envelope and
    // pure-pursuit input driver; it does not write any physics or timing state.
    const distances = Array.from({ length: 26 }, (_, i) => 5 + i * 6);
    let previous = a.carAt().prog, stalled = 0, heldSpeed = 30;
    const CRAWL = 3;
    let leader = false, fieldSeconds = 0;
    for (let frame = 0; frame < 300 * 60 && a.info().state === "race"; frame++) {
      const p = a.probe();
      const lead = Math.max(8, Math.min(38, p.speed * .6));
      const steer = Math.max(-1, Math.min(1, 2.4 * (Math.atan2(p.k * lead * lead * .5 - p.x, lead) - p.angle)));
      a.setInput({ steer, throttle: p.speed < CRAWL, brake: false }); a.step(1 / 60, 1);
      if (a.cars().some(c => c.id !== playerId && a.carAt(c.id)?.finished)) {
        leader = true; fieldSeconds = (frame + 1) / 60; break;
      }
    }
    const lapAtLeaderFlag = a.carAt().lap;
    const startedUnfinished = !a.carAt().finished && !a.carAt().retired;
    let crossed = false;
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
    await startGp(page); await crossFlag(page);
    await expect(page.locator("#btn-throttle")).toBeVisible();
    await expect(page.locator("#btn-brake")).toBeVisible();
    await skipChain(page);
    await expect(page.locator("#btn-brake")).toBeHidden();
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
    await page.evaluate(() => window.__apex.camera("helmet"));
    await crossFlag(page);
    const cooldownFrame = await page.evaluate(() => window.__apex.cameraState().renderFrame);
    await page.waitForFunction(frame => window.__apex.ceremony().phase === "cooldown"
      && window.__apex.cameraState().renderFrame > frame, cooldownFrame, { polling: 100, timeout: 20000 });
    const chase = await page.evaluate(() => window.__apex.camState());
    expect(chase.debug).toBe(false);
    expect(chase.lens.near).toBe(0.9);
    const parkFrame = await page.evaluate(() => window.__apex.cameraState().renderFrame);
    await tapPhase(page, "cooldown");
    await page.waitForFunction(frame => window.__apex.ceremony().phase === "parcFerme"
      && window.__apex.cameraState().renderFrame > frame && window.__apex.camState().lens.near === 0.3, parkFrame, { polling: 100, timeout: 20000 });
    const first = await page.evaluate(() => ({ age: window.__apex.ceremony().age, cam: window.__apex.camState(), frame: window.__apex.cameraState().renderFrame }));
    await page.waitForFunction((age) => window.__apex.ceremony().phase === "parcFerme"
      && window.__apex.ceremony().age >= age + 1, first.age, { polling: 100, timeout: 5000 });
    const later = await page.evaluate(() => window.__apex.camState());
    expect(later.eye).toEqual(first.cam.eye);
    expect(later.tgt).toEqual(first.cam.tgt);
    expect(await page.evaluate(() => window.__apex.cameraState().renderFrame)).toBe(first.frame);
    await tapPhase(page, "parcFerme"); await tapPhase(page, "podium");
    await expect(page.locator("#results")).toBeVisible();
  });
});

test.describe("results-flow — desktop cooldown ownership", () => {
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: false, isMobile: false, reducedMotion: "no-preference" });
  test.setTimeout(240_000);
  test("a naturally finished car takes native throttle without changing classification", async ({ page }) => {
    // Keep the live input/physics loop and real DOM controls. Drawing the race on
    // a software GPU can consume the cooldown's 45 wall seconds before the click.
    await startGp(page); await crossFlag(page);
    const diag = () => page.evaluate(() => JSON.stringify({ ceremony: window.__apex.ceremony(),
      car: window.__apex.carAt(), active: document.activeElement && (document.activeElement.id || document.activeElement.tagName),
      layers: !!(window.UiLayers && window.UiLayers.anyOpen()), state: window.__apex.info().state }));
    const step = (name, wait) => wait.catch(async e => { throw new Error(`${name}: ${e.message}\n${await diag()}`); });
    await step("cooldown hands input to the player", page.waitForFunction(
      () => window.__apex.ceremony().inputOwner === "player", null, WAIT));
    expect(await page.evaluate(() => window.__apex.ceremony().cameraOwner)).toBe("chase");
    const before = await page.evaluate(() => window.__apex.carAt());
    // Coasting can increase progress. Only throttle can also raise speed.
    let after;
    await page.keyboard.down("ArrowUp");
    try {
      await step("held ArrowUp accelerates the finished car", page.waitForFunction(
        ({ speed, prog }) => {
          const car = window.__apex.carAt();
          return car.speed > speed && car.prog > prog + 1;
        }, { speed: before.speed, prog: before.prog }, WAIT));
      after = await page.evaluate(() => window.__apex.carAt());
    } finally { await page.keyboard.up("ArrowUp"); }
    expect(after.speed, `held ArrowUp accelerates the finished car (a coasting car only slows): ${before.speed} -> ${after.speed} m/s`).toBeGreaterThan(before.speed);
    expect(after.prog, "held ArrowUp advances the finished car").toBeGreaterThan(before.prog + 1);
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

// UI contract cells (#5153 gap 12, PR D; docs/notes/UI-CONTRACT-2026-11-06.md §3 rule 8 and §4.9; the numbers in
// docs/notes/UI-PR-D-MEASURE-2026-11-06.md): the pinned podium's pin count comes from the pane, so the shortest window
// still scrolls >= 2 rows of the classification. Windows A (the iOS Home Screen app), C (the measured short Safari tab) and D (the spec
// phone), seeded from Bryce's own export (TEXT large; it stores no UI SIZE, so a phone reads the shipped 70 %, #5358),
// insets injected on :root as the shell does. #5580: at 0.7 the sheet has 515 own px in A and 534 in D, over the
// generic --compact-at 380, so it went NORMAL there: two-line rows 73.7 / 74.4 painted px, YOU the only pin, 3.8 rows
// in the pane. The short-touch gate in css/overlays.css holds it compact (probe 2026-11-16 at 0.7: 44 px rows; pins 4 / 1 / 4; 2.4-2.6 / 3.39 / 2.82 scrolling rows in A / C / D).
const OWNER_EXPORT = JSON.parse(fs.readFileSync(new URL("../data/settings-defaults-export.json", import.meta.url), "utf8"));
for (const win of CONTRACT_WINDOWS) test.describe("UI contract results cells — " + win.name, () => {
  test.use({ ...uiTestOptions({ touch: true, viewport: win.viewport, deviceScaleFactor: 1 }) });
  test("the pinned podium leaves >= 2 scrolling rows: pins from the pane, keyed on the sheet", async ({ page }) => {
    await page.goto("/?inspector=0");
    await page.waitForFunction(() => !!window.__apex?.race, null, WAIT);
    const imported = await page.evaluate((d) => SettingsExport.applySettings(d, {}), OWNER_EXPORT);
    expect(imported.ok, "the owner export imports: " + JSON.stringify(imported)).toBe(true);
    await page.reload();
    await page.waitForFunction(() => !!window.__apex?.race, null, WAIT);
    await page.evaluate(() => window.__apex.headless(true));
    await page.addStyleTag({ content: `:root{--sal:${win.insets.l}px;--sar:${win.insets.r}px;--sat:0px;--sab:${win.insets.b}px;}` });
    await page.evaluate(() => window.__apex.race("bahrain", "day", "dry", { laps: 1, grid: "tier" }));
    await page.waitForFunction(() => !!window.__apex.info().track
      && ["count", "race"].includes(window.__apex.info().state), null, { polling: 100, timeout: RACE_BUILD_MS });
    // #5603: "at open" is every PAINTED frame from the first one that shows the sheet until the pins have held 30
    // frames, read just after the frame (a message posted from rAF), never one sample between tasks while the sheet is
    // still animating in. Each overlapping frame carries the geometry fitPins measured, so a red names its mechanism.
    await page.evaluate(() => {
      const T = document.getElementById("results-table"), frames = (window.__resOpenFrames = []);
      const ch = new MessageChannel(); let n = 0, held = 0;
      const over = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      ch.port1.onmessage = () => {
        const sheet = document.querySelector("#results > .sheet");
        const rows = [...T.querySelectorAll('[data-results-part="ranking"] > .res-row[role="listitem"]')];
        const you = rows.find((r) => r.classList.contains("you"));
        // A frame the player SEES: the sheet laid out and not transparent. `running` names a transition still replaying
        // YOU's previous box: every spec runs under reduced motion (playwright.config.js), whose 0.01ms did that (#5603).
        if (sheet && sheet.offsetParent && you && parseFloat(getComputedStyle(sheet).opacity) > 0) {
          const yr = you.getBoundingClientRect(), tb = T.getBoundingClientRect();
          const ov = yr.top < tb.bottom ? rows.filter((r) => r !== you).map((r) => +over(r.getBoundingClientRect(), yr).toFixed(1)).filter((v) => v > 1) : [];
          frames.push({ frame: n, ov, pins: T.dataset.pins || null, youClear: T.style.getPropertyValue("--you-clear") || null, paneOwnH: T.clientHeight,
            rowOwnH: +(rows[0].getBoundingClientRect().height / (rows[0].currentCSSZoom || 1)).toFixed(1), density: sheet.dataset.density || null,
            shape: sheet.dataset.shape || null, opacity: getComputedStyle(sheet).opacity, scrollTop: T.scrollTop, youTop: +yr.top.toFixed(1), paneTop: +tb.top.toFixed(1), paneBottom: +tb.bottom.toFixed(1),
            youMarginTop: getComputedStyle(you).marginTop, motion: document.documentElement.dataset.motion || null,
            running: you.getAnimations().map((a) => a.transitionProperty || a.animationName).join(" "), above: [...T.children].map((k) => (k.getAttribute("data-results-part") || k.id || k.className || k.tagName)
              .slice(0, 16) + "@" + Math.round(k.getBoundingClientRect().top) + "/" + Math.round(k.getBoundingClientRect().height)).join(" ") });
          if (T.dataset.pins) held++;
        }
        if (held < 30 && ++n < 600) requestAnimationFrame(() => ch.port2.postMessage(0));
        else frames.done = true;
      };
      requestAnimationFrame(() => ch.port2.postMessage(0));
    });
    expect(await page.evaluate(() => window.__apex.finishRace())).toEqual({ state: "results" });
    await expect(page.locator("#results")).toBeVisible();
    await expect(page.locator("#res-next")).toBeEnabled();
    await page.waitForFunction(() => window.__resOpenFrames.done === true, null, { polling: 50, timeout: 15_000 });
    const openFrames = await page.evaluate(() => window.__resOpenFrames);
    const cell = await page.evaluate(() => {
      const z = (el) => el.currentCSSZoom || 1;
      const res = document.getElementById("results"), sheet = res.querySelector(":scope > .sheet"), table = document.getElementById("results-table");
      const rows = [...table.querySelectorAll('[data-results-part="ranking"] > .res-row[role="listitem"]')];
      const sticky = rows.filter((r) => getComputedStyle(r).position === "sticky").map((r) => r.className.replace("res-row", "").trim());
      const rowOwnH = rows[0] ? rows[0].getBoundingClientRect().height / z(rows[0]) : 0;
      const sr = sheet.getBoundingClientRect(), you = rows.find((r) => r.classList.contains("you"));
      // The story cards sit above the ranking list at open; the pins hold once the list is in the pane.
      const list = table.querySelector('[data-results-part="ranking"]');
      if (list) table.scrollTop = list.offsetTop;
      const yr = you ? you.getBoundingClientRect() : null, tr = table.getBoundingClientRect();
      return { ui: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim(), text: document.documentElement.dataset.textSize,
        sheet: { density: sheet.dataset.density, shape: sheet.dataset.shape, inScreen: sr.top >= 0 && sr.bottom <= innerHeight + 0.5 },
        pins: table.dataset.pins, sticky, rows: rows.length, paneOwnH: +table.clientHeight.toFixed(1), rowOwnH: +rowOwnH.toFixed(1), rowPaintedH: rows[0] ? +rows[0].getBoundingClientRect().height.toFixed(1) : 0,
        scrollingRows: rowOwnH ? +((table.clientHeight - sticky.length * rowOwnH) / rowOwnH).toFixed(2) : null,
        youInPane: yr ? yr.top >= tr.top - 0.5 && yr.bottom <= tr.bottom + 0.5 : null, tableScrolls: table.scrollHeight > table.clientHeight + 1 };
    });
    const tag = win.name + ": ";
    expect({ ui: cell.ui, text: cell.text }, tag + "the owner's knobs").toEqual({ ui: "0.7", text: "large" });
    expect(cell.sheet, tag + "a compact wide results sheet inside the window").toMatchObject({ density: "compact", shape: "wide", inScreen: true });
    expect(cell.rows, tag + "a full classification").toBeGreaterThanOrEqual(10);
    expect(cell.rowPaintedH, tag + "one 44-painted-px line per row").toBeCloseTo(44, 0);
    expect(["1", "2", "4"], tag + "data-pins is one of the three counts").toContain(cell.pins);
    expect(cell.sticky.length, tag + "the sticky rows are the pin count (" + cell.sticky.join(", ") + ")").toBe(Number(cell.pins));
    expect(cell.sticky, tag + "YOU is always pinned").toContain("you");
    if (cell.pins !== "1") expect(cell.sticky, tag + "P1 pins whenever more than YOU does").toContain("p1");
    expect(cell.scrollingRows, tag + "the classification keeps >= 2 scrolling rows under the pins").toBeGreaterThanOrEqual(2);
    // #5580: at open the list is only entering the pane (55 painted px at 0.7 in D) and YOU, bottom-stuck, sat under P1.
    expect(openFrames.length, tag + "painted frames recorded from the sheet's open").toBeGreaterThanOrEqual(30);
    const overlapping = openFrames.filter((f) => f.ov.length);
    expect(overlapping.map((f) => f.ov), tag + "at open your row lies on no other row on any painted frame (painted px of overlap); first: "
      + JSON.stringify(overlapping[0] || null) + "; settled: " + JSON.stringify(openFrames[openFrames.length - 1] || null)).toEqual([]);
    expect(cell.youInPane, tag + "your row is pinned inside the pane once the list is in view").toBe(true);
    expect(cell.tableScrolls, tag + "the classification is the one scroller").toBe(true);
  });
});
