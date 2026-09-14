// @ts-check
// ONE BOOT PER WORKER (sharedTest): five goto("/") contexts became one. The
// first-load contract (SOUND OFF + clamped volumes) keeps one reload — those
// keys must be in localStorage before AudioPanel.init, and a shared page only
// gets that on the next navigation (docs/TESTING.md §sharedTest / addInitScript).
// Closing a WebGL+AudioContext page between tests was the other half: CI died
// with `Test timeout of 120000ms exceeded while setting up "context"` on the
// next fixture (Selected specs 2026-09-04). A second reload after SOUND ON
// costs ~120s on this box; seed both contracts on the cold reload.
import { sharedTest as test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { toMenu } from "../helpers/shared-page.js";

async function waitApex(page) {
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}

/** Seed keys, then reload so AudioPanel.init reads them on a virgin heap. */
async function bootWithStore(page, entries) {
  await page.evaluate((pairs) => {
    for (const [k, v] of pairs) localStorage.setItem(k, v);
  }, Object.entries(entries));
  await page.reload();
  await waitApex(page);
}

test("GameAudio initialises without console errors", async ({ page, pageErrors, consoleLines }) => {
  const defined = await page.evaluate(
    () =>
      typeof GameAudio === "object" || typeof GameAudio === "function"
  );
  expect(defined).toBe(true);
  const audioErrors = consoleLines.filter(
    (e) =>
      (e.startsWith("error:") || e.startsWith("pageerror:")) &&
      (e.includes("AudioContext") ||
        e.includes("decodeAudioData") ||
        e.includes("GameAudio"))
  );
  expect(audioErrors).toHaveLength(0);
  expect(pageErrors).toEqual([]);
});

// One reload, two first-load contracts. A second reload after SOUND ON
// (or after the unlock race) costs ~120s on this box — the volume-only
// body timed out at 134s / 119.4s. After a cold boot the same navigation
// is ~75s. Seed everything, assert both, then the enable click.
test("persisted SOUND OFF and out-of-range volumes apply on first load", async ({ page }) => {
  // Measured 115.5s solo on an idle 4-core (2026-09-04): cold reload, WebGL
  // boot, settings, enable gesture. The 120s default is the hang backstop,
  // not this boot — raise the one test, do not shrug (test-solo warning).
  test.setTimeout(180_000);
  const engineRequests = [];
  page.on("request", (request) => {
    if (/assets\/sfx\/f1_(?:engine|rev)\.mp3(?:\?|$)/.test(request.url())) {
      engineRequests.push(request.url());
    }
  });
  // MUSIC is intentionally still on: these independent saved states used to
  // make AudioPanel.init() lift the master back on during boot.
  // volMusic/volSfx: setMusicVolume/setSfxVolume clamp to 0..1 and RETURN
  // the clamped value; the panel used to discard that return and show the
  // raw localStorage number.
  await bootWithStore(page, {
    "apex26.sound": "false",
    "apex26.music": "true",
    "apex26.volMusic": "40",    // way over the 0..1 gain range
    "apex26.volSfx": "-3",      // way under it
  });

  expect(await page.evaluate(() => GameAudio.volumes())).toEqual({ music: 1, sfx: 0 });

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

  // Re-enable with a real click. init() must run synchronously in this gesture
  // so autoplay policies permit resume, and only now may samples be requested.
  await page.locator("#pm-settings-close").click();
  await page.locator("#pm-settings-close").click();
  await page.locator("#soundbtn").click();
  await expect.poll(() => page.evaluate(() => GameAudio.debug().contextState))
    .not.toBe("uninitialised");
  // ONE sample, not two. The granular (PSOLA) engine voice retired f1_rev.mp3
  // (933e3167): it was fetched, decoded and loop-scanned behind a gain written
  // to 0 at creation and never changed, and because the fetch sat inside a
  // Promise.all that `usingSamples` gated on, a 404 in the layer nobody could
  // hear dropped every player to the oscillator fallback. The asset stays on
  // disk and nothing loads it, so ONE request is the correct count — this
  // assertion simply outlived the two-sample voice, unseen because the `ui`
  // group has not completed a run since.
  await expect.poll(() => engineRequests.length).toBe(1);
});

test("re-enabling sound during a race restarts race music", async ({ page, loadTrack }) => {
  await toMenu(page);
  // startRace() is async (ensureScenery). loadTrack waits for the build AND
  // go() so the race-start startMusic has already fired before we wrap.
  // The old body called race()+go() in one evaluate, cleared the spy, then
  // clicked at once — startRace's startMusic landed AFTER the clear and the
  // re-enable assertion saw [monza, monza].
  await loadTrack("monza");
  await page.evaluate(() => window.__apex.headless(true));
  const monzaIdx = await page.evaluate(() => {
    const calls = [];
    const startMusic = GameAudio.startMusic;
    GameAudio.startMusic = function (trackIdx) {
      calls.push(trackIdx);
      return startMusic.apply(this, arguments);
    };
    window.__raceMusicCalls = calls;
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
  await toMenu(page);
  // STOP THE RENDER LOOP BEFORE CLICKING THROUGH. #rs-go lives on
  // #race-settings, which js/game.js calls "the one menu screen that shows the
  // flyby" — the canvas is live behind that sheet, where it is hidden under the
  // title and the picker. Playwright's actionability check wants the same
  // bounding box on two consecutive animation frames, and the flyby keeps
  // resetting it, so the click retries until the 60 s budget is gone.
  //
  // MEASURED, not inferred from the resemblance to the rAF stall — which is the
  // trap docs/notes/TESTING-FIELD-NOTES.md ("a 60 s timeout is a signature, not
  // a diagnosis") records. Timing the three clicks below, same box, same build:
  //
  //             loop running   loop stopped
  //   #mb-race       0.2 s         0.1 s      canvas hidden
  //   #sel-go        0.8 s         1.0 s      canvas hidden
  //   #rs-go        14.1 s         1.2 s      flyby LIVE
  //
  // and rAF was a healthy 40.7 Hz in that run, so this is not the starved-frame
  // case — the cost is there at a normal frame rate and only on this button.
  // Without the line this test failed at 60 s both in isolation and in a full
  // file run; with it, 12.6 s and 4/4.
  //
  // It has to be re-armed HERE even though the test above already called it:
  // sharedTest's per-test reset calls headless(false) to wake the page back up
  // (tests/helpers/fixtures.js) — deliberately, so a test never inherits a dead
  // renderer. PROBED rather than read off that comment: headless() is false at
  // this line in a full-file run.
  //
  // Safe for what this test asserts: headlessMode is read in exactly one place
  // in js/game.js, the early return in render(). update() — and with it the
  // engine audio this test measures — runs either way.
  await page.evaluate(() => window.__apex.headless(true));
  await page.locator("#mb-race").click();
  await page.locator("#sel-go").click();
  await page.locator("#rs-go").click();
  await page.waitForFunction(() => typeof GameAudio !== "undefined" && GameAudio.debug().engineOn,
    null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => {
    GameAudio.setEngine(0.75, 0.4, false, 0.6, 4);
  });
  await expect.poll(() => page.evaluate(() => GameAudio.centroidHz())).toBeGreaterThan(50);
  const state = await page.evaluate(() => GameAudio.debug());
  expect(state.contextState).toBe("running");
  expect(state.engineOn).toBe(true);
});
