// @ts-check
import { test, expect } from "./fixtures.js";

test("GameAudio initialises without console errors", async ({ page, pageErrors }) => {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 10000 });
  const defined = await page.evaluate(
    () =>
      typeof GameAudio === "object" || typeof GameAudio === "function"
  );
  expect(defined).toBe(true);
  const audioErrors = errors.filter(
    (e) =>
      e.includes("AudioContext") ||
      e.includes("decodeAudioData") ||
      e.includes("GameAudio")
  );
  expect(audioErrors).toHaveLength(0);
  expect(pageErrors).toEqual([]);
});

test("re-enabling sound during a race restarts race music", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 10000 });
  const monzaIdx = await page.evaluate(() => {
    const calls = [];
    const startMusic = GameAudio.startMusic;
    GameAudio.startMusic = function (trackIdx) {
      calls.push(trackIdx);
      return startMusic.apply(this, arguments);
    };
    window.__raceMusicCalls = calls;
    window.__apex.headless(true);
    window.__apex.race("monza");
    window.__apex.go();
    calls.length = 0;
    return window.__apex.tracks().find((track) => track.id === "monza").i;
  });

  // What this guards is a game.js behaviour: when SOUND comes back the game
  // re-issues GameAudio.startMusic with the RACE track index. That is the
  // master, not the music bus — setMusicEnabled resumes via an internal
  // startMusic the stub above cannot see, and passes lastTrackIdx rather than
  // the race index. The pause menu's duplicate SOUND button is gone, so drive
  // #soundbtn, which is the master and is only hidden (not removed) in-race.
  await page.locator("#soundbtn").evaluate((b) => b.click());
  await page.locator("#soundbtn").evaluate((b) => b.click());

  const calls = await page.evaluate(() => window.__raceMusicCalls);
  expect(calls).toEqual([monzaIdx]);
});

test("real GameAudio unlock and engine synthesis run after a user gesture", async ({ page }) => {
  await page.goto("/");
  await page.locator("#mb-race").click();
  await page.locator("#sel-go").click();
  await page.locator("#cs-done").click();   // START opens the GARAGE; DONE carries on
  await page.locator("#rs-go").click();
  await page.waitForFunction(() => GameAudio.debug().engineOn);
  await page.evaluate(() => {
    GameAudio.setEngine(0.75, 0.4, false, 0.6, 4);
  });
  await expect.poll(() => page.evaluate(() => GameAudio.centroidHz())).toBeGreaterThan(50);
  const state = await page.evaluate(() => GameAudio.debug());
  expect(state.contextState).toBe("running");
  expect(state.engineOn).toBe(true);
});
