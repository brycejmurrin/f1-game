// @ts-check
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

test("GameAudio initialises without console errors", async ({ page, pageErrors }) => {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
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

test("persisted SOUND OFF stays off and defers WebAudio until a trusted enable click", async ({ page }) => {
  await page.addInitScript(() => {
    // MUSIC is intentionally still on: these independent saved states used to
    // make AudioPanel.init() lift the master back on during boot.
    localStorage.setItem("apex26.sound", "false");
    localStorage.setItem("apex26.music", "true");
  });
  const engineRequests = [];
  page.on("request", (request) => {
    if (/assets\/sfx\/f1_(?:engine|rev)\.mp3(?:\?|$)/.test(request.url())) {
      engineRequests.push(request.url());
    }
  });

  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });

  // This is a genuine first pointer gesture and also exercises the Settings
  // button's formerly unconditional GameAudio.init().
  await page.locator("#mb-settings").click();
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => ({
    enabled: GameAudio.enabled(),
    contextState: GameAudio.debug().contextState,
    pressed: document.getElementById("soundbtn").getAttribute("aria-pressed"),
    stored: localStorage.getItem("apex26.sound"),
  }))).toEqual({
    enabled: false,
    contextState: "uninitialised",
    pressed: "false",
    stored: "false",
  });
  expect(engineRequests).toEqual([]);

  // Re-enable with a real click. init() must run synchronously in this gesture
  // so autoplay policies permit resume, and only now may samples be requested.
  await page.locator("#pm-settings-close").click();
  await page.locator("#soundbtn").click();
  await expect.poll(() => page.evaluate(() => GameAudio.debug().contextState))
    .not.toBe("uninitialised");
  await expect.poll(() => engineRequests.length).toBe(2);
});

test("re-enabling sound during a race restarts race music", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
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
  await page.locator("#rs-go").click();
  await page.waitForFunction(() => typeof GameAudio !== "undefined" && GameAudio.debug().engineOn);
  await page.evaluate(() => {
    GameAudio.setEngine(0.75, 0.4, false, 0.6, 4);
  });
  await expect.poll(() => page.evaluate(() => GameAudio.centroidHz())).toBeGreaterThan(50);
  const state = await page.evaluate(() => GameAudio.debug());
  expect(state.contextState).toBe("running");
  expect(state.engineOn).toBe(true);
});

// GameAudio.setMusicVolume/setSfxVolume clamp to 0..1 and RETURN the clamped
// value; js/audio/panel.js used to call them at boot and discard that
// return, keeping its OWN musicVol/sfxVol (the pair the MUSIC & SOUND panel's
// slider label reads) at whatever raw number came out of localStorage. The
// gain itself was always safe — only the number shown on the slider could
// disagree with it.
test("an out-of-range stored volume clamps both the audio gain and the panel's own label", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("apex26.volMusic", "40");    // way over the 0..1 gain range
    localStorage.setItem("apex26.volSfx", "-3");       // way under it
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  expect(await page.evaluate(() => GameAudio.volumes())).toEqual({ music: 1, sfx: 0 });

  await page.locator("#mb-settings").click();
  await page.locator("#pm-tab-more").click();
  await page.locator("#pm-audio").click();
  await expect(page.locator("#audioset")).toBeVisible();
  const shown = await page.evaluate(() => ({
    mvolInput: document.getElementById("as-mvol").value,
    mvolLabel: document.getElementById("as-mvol-v").textContent,
    svolInput: document.getElementById("as-svol").value,
    svolLabel: document.getElementById("as-svol-v").textContent,
  }));
  // 0..1 gain maps to the panel's 0..10 slider by x10 — 1 -> "10", 0 -> "0".
  expect(shown).toEqual({ mvolInput: "10", mvolLabel: "10", svolInput: "0", svolLabel: "0" });
});
