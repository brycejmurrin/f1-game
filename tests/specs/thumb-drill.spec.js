// LEARN's THUMB DRILL (js/learn-drills/thumb-drill.js, #6927): LEARN › VEGAS THUMB DRILL stages a Las Vegas Time
// Trial, the cue card shows the corner's script, a lap closes on a summary card, RETRY LAP puts the world back, and
// quitting restores the session the player had. The scoring itself is pinned in tests/unit/thumb-drill.test.mjs.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
}

test("Vegas Thumb Drill: start from LEARN, cue, lap summary, RETRY LAP, and the session restored on quit", async ({ page }) => {
  test.setTimeout(BOOT_MS + 120000);
  await boot(page);
  const before = await page.evaluate(() => ({ session: window.__apex.info().session, flow: window.__apex.info().flow }));
  await page.locator("#mb-learn").click();
  await page.locator("#learn-open-thumbs-drive").click();
  await page.waitForFunction(() => {
    const i = window.__apex.info();
    return i.state === "race" && i.track === "vegas" && !i.warming;
  }, null, { polling: 100, timeout: BOOT_MS });
  expect(await page.evaluate(() => window.__apex.info().session)).toBe("tt");

  // The cue card names a corner from the trainer's script.
  const cue = page.locator("#thumb-drill");
  await expect(cue).toBeVisible();
  await expect(cue.locator("strong")).toHaveText(/\S/);
  await page.waitForFunction(() => ThumbDrill.state() && ThumbDrill.state().marked, null, { polling: 100, timeout: 20000 });

  // Through T17 and over the line: hold GAS and the LEFT arrow, the corner's own script (flat, ◀). Render off: on a
  // software-GL box the rendered race runs near a tenth of real time (measured 2026-11-26, ~4 m of arc a second).
  await page.evaluate(() => { window.__apex.headless(true); window.__apex.jump(0.978, 45, 0); });
  await page.keyboard.down("ArrowUp");
  await page.keyboard.down("ArrowLeft");
  const card = page.locator("#thumb-drill-lap");
  await expect(card).toBeVisible({ timeout: 60000 });
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.up("ArrowUp");
  await expect(card.locator("strong")).toHaveText(/^LAP THUMBS \d+% · \d+\/17 corners · best \d+%/);
  await expect(card.locator("#td-corners span").first()).toHaveText(/^T17 \d+%$/);
  // The bests ride the trainer's store in their own field, beside the off-track corner bests.
  const best = await page.evaluate(() => ThumbTrainer.readBest().track || {});
  expect(typeof best.lap).toBe("number");

  // RETRY LAP: the coach restores the checkpoint at the line, the card goes, the cue carries on.
  await page.locator("#td-retry").click();
  await expect(card).toBeHidden();
  await expect(cue).toBeVisible();

  // Quit: the drill restores the player's own session and flow, and leaves nothing on screen.
  await page.locator("#pausebtn").click();
  await page.locator("#pm-quit").click();
  await page.waitForFunction(() => PauseOpts.armAge() >= PauseOpts.ARM_MIN_MS, null, { polling: 100, timeout: 5000 });
  await page.locator("#pm-quit").click();
  await page.waitForFunction(() => window.__apex.info().state === "menu", null, { polling: 100, timeout: 20000 });
  await page.waitForFunction(() => ThumbDrill.state() === null, null, { polling: 100, timeout: 5000 });
  await expect(page.locator("#thumb-drill")).toHaveCount(0);
  const after = await page.evaluate(() => ({ session: window.__apex.info().session, flow: window.__apex.info().flow }));
  expect(after).toEqual(before);
});
