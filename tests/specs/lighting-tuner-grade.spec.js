// @ts-check
import { test, expect } from "@playwright/test";
// BUDGETS, FROM A MEASUREMENT. Every wait below was under the worst case this
// class of box actually posts: measured idle (loadavg 0.00, three cold boots,
// scratch/perf/boot-budget.mjs) the page needs up to 24.6 s to publish __apex
// and 16.9 s to build a track, and this file was asking for 15 s and 25 s. See
// the BOOT_MS note in tests/helpers/fixtures.js — these are the same numbers.
import { BOOT_MS, TRACK_MS } from "../helpers/fixtures.js";

// FOUR OF THE FIVE TESTS HERE ARE GENUINELY OVER THE DEFAULT 120 s BUDGET, not
// flaky. Solo at APEX_WORKERS=1 on a quiet box: 191.3 / 173.7 / 155.6 / 135.5 s;
// on a CI runner one reached 210.8 s. Only "IMAGE & COLOUR exposes ordered…"
// (~70 s) fits. The cost is real — each test boots the game, races bahrain,
// walks pause → SETTINGS → LIGHTING → IMAGE & COLOUR, then fans a lighting
// profile across all 40 circuits and undoes it, under SwiftShader.
//
// WHY A FILE-LEVEL BUDGET AND NOT test.slow(): test.slow() is called INSIDE the
// test body, so it cannot extend the fixture phase that runs BEFORE the body.
// With test.slow() this file still failed on CI with
// "Test timeout of 120000ms exceeded while setting up \"context\"" — at exactly
// 120.0 s, the base budget, because the multiplier had not been applied yet.
// test.describe.configure({ timeout }) is set at collection time and covers
// setup as well (same form as zandvoort-foundation.spec.js). It also survives
// CI passing an explicit `--timeout=120000` on the command line, which is what
// the change-aware job does.
// 360_000 -> 600_000. The two COPY ALL tests walk EVERY track, and inside a
// two-worker group run they measured 372.2 s and 375.4 s — over the cap doing
// real work, not hung. A per-test cap set below what the work costs on this
// box only converts slow into red; the job's own timeout-minutes is the real
// backstop, which is the argument .github/workflows/ci.yml already makes for
// the smoke shards' 420 s.
test.describe.configure({ timeout: 600_000 });

// THE MENU WALK IS DISPATCHED, NOT CLICKED — and that is a measurement, not a
// shortcut. MEASURED in this container with ONE browser and nothing else
// running (scratch/tuner/cost-probe.mjs), clicking the same five ids the walk
// used to click:
//
//   #pausebtn          85031 ms   (mid-race: the game is rendering)
//   #pm-settings         469 ms   (paused, tuner shut: the loop returns early)
//   #pm-tab-more         585 ms
//   #pm-lighting         281 ms
//   IMAGE & COLOUR tab 82928 ms   (tuner open: the loop renders again)
//   #lt-spread-edits      78 s    (tuner open)
//
// A CLICK IS EXPENSIVE EXACTLY WHILE THE GAME IS RENDERING, and only then — the
// four orders of magnitude between #pausebtn and #pm-settings are not a rAF
// rate (that stayed 0.12-0.27/s throughout, and was actually LOWEST on the
// cheap clicks) but main-thread occupancy: a SwiftShader frame holds the thread
// for seconds, and Playwright's stability and hit-target checks run on that
// same thread. js/game.js only renders while paused if the lighting or camera
// tuner is open (the live-preview branch), which is why the two ends of this
// walk are slow and the middle is instant. That is the whole reason three tests
// in this file were red: they were not testing anything slow, they were paying
// for frames nobody looked at.
//
// What is LOST by dispatching is the proof that these buttons are visible,
// enabled and hit-testable. That is not this file's subject (grading and COPY
// ALL semantics are), and it is already covered by real Playwright clicks on
// the SAME ids in tests/specs/ui-button-touch.spec.js (openLightingPhotoMode:
// #pm-settings, #pm-tab-more, #pm-lighting) and by menu-survey. The dispatched
// form here is the one tests/specs/ui-redesign.spec.js already uses for this
// exact walk, so it is the established idiom for this path, not a new one.
const walkToImageTuner = async (page) => {
  await page.evaluate(() => window.__apex.park(0.1));
  // Attached-and-shown only: waitForSelector does not run the stability or
  // hit-target checks that make a real click expensive here.
  await page.waitForSelector("#pausebtn:not([hidden])", { timeout: BOOT_MS });
  await page.evaluate(() => {
    document.getElementById("pausebtn").click();
    document.getElementById("pm-settings").click();
    document.getElementById("pm-tab-more").click();
    document.getElementById("pm-lighting").click();
    // pm-lighting's handler builds the tab strip synchronously, so the tab
    // exists by the next statement — the same assumption ui-redesign makes.
    document.getElementById("lt-tab-image-colour").click();
  });
};

async function openImageTuner(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: TRACK_MS });
  await walkToImageTuner(page);
  await expect(page.locator("#lighting")).toBeVisible();
}

async function reopenImageTuner(page) {
  await walkToImageTuner(page);
  await expect(page.locator("#lighting")).toBeVisible();
}

test("IMAGE & COLOUR exposes ordered professional grading sections", async ({ page }) => {
  await openImageTuner(page);
  const headings = await page.locator('.lt-group[data-group="IMAGE & COLOUR"] .lt-section').allTextContents();
  expect(headings).toEqual(["TONAL RANGE", "RGB LIFT / GAMMA / GAIN", "COLOUR", "LENS & FINISH"]);
  for (const id of [
    "blacks", "shadows", "midtones", "highlights", "whites", "toe", "shoulder",
    "liftR", "liftG", "liftB", "gammaR", "gammaG", "gammaB", "gainR", "gainG", "gainB",
  ]) await expect(page.locator("#lt-in-" + id)).toBeVisible();
});

// COPY ALL spreads the condition on screen to every other circuit at the same
// time and weather. The fan-out itself is pinned in tests/unit/light-store-copy.test.mjs
// against a three-track fixture; what only the browser can show is the PANEL —
// that the two chips arm before they fire, that they write the real Tracks.LIST,
// and that UNDO puts it back. Read through localStorage rather than the tuner,
// because the profiles being written belong to tracks that are not loaded.
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("apex26.lightTune") || "{}"));

test("COPY ALL arms, spreads the condition to every other track, and undoes", async ({ page }) => {
  await openImageTuner(page);
  await page.evaluate(() => {
    document.getElementById("lt-tod-dusk").click();
    document.getElementById("lt-wx-wet").click();
    window.__apex.lightTune({ gainB: 1.2 });
  });
  expect((await stored(page))["bahrain|dusk|wet"].gainB).toBeCloseTo(1.2);

  // THE ARM/FIRE PAIR RUNS IN ONE evaluate, AND THE REASON IS A RACE THIS TEST
  // CANNOT WIN FROM OUTSIDE THE PAGE. The armed state is held by a wall-clock
  // `setTimeout(ltDisarm, 20000)` in js/game/tuner.js, so every millisecond
  // between the click and the read is spent against that window. MEASURED here
  // (scratch/tuner/arm-probe.mjs, ONE browser, nothing else running): the
  // arming click landed 78 s after it was issued (the tuner renders, so the
  // main thread is held — see the walk note above), and the disarm fired 28.7 s
  // after the arm — while a single `locator.textContent()` round trip was still
  // in flight. So the previous form asserted `/^COPY TO \d+\?$/` and read
  // `"MY EDITS"`: not a broken chip, a chip that had already timed out by the
  // time the answer came back. Driving both clicks and both reads inside the
  // page makes the sequence atomic with respect to that timer.
  //
  // Nothing is weakened. `el.click()` runs the real onclick handler, the reads
  // are the real DOM and the real localStorage, and every assertion below is
  // the one that was there before — including that the FIRST click writes
  // nothing, which is the whole point of an arming chip.
  const seq = await page.evaluate(() => {
    const el = document.getElementById("lt-spread-edits");
    const keys = () => Object.keys(JSON.parse(localStorage.getItem("apex26.lightTune") || "{}"));
    const out = {};
    el.click(); out.armedText = el.textContent; out.armedKeys = keys();
    el.click(); out.firedText = el.textContent; out.firedKeys = keys();
    return out;
  });
  expect(seq.armedText).toMatch(/^COPY TO \d+\?$/);     // first click ARMS…
  expect(seq.armedKeys).toEqual(["bahrain|dusk|wet"]);   // …and writes nothing
  expect(seq.firedText).toMatch(/^COPIED \d+ ✓$/);       // second click fires
  const after = await stored(page);
  const targets = Object.keys(after).filter((k) => k !== "bahrain|dusk|wet");
  expect(targets.length).toBeGreaterThan(20);            // every other circuit on the LIST
  for (const k of targets) {
    expect(k).toMatch(/\|dusk\|wet$/);                   // …and no other condition
    expect(after[k].gainB).toBeCloseTo(1.2);
  }
  // MY EDITS sends only what was tuned here, so nothing else rides along.
  expect(Object.keys(after["monza|dusk|wet"])).toEqual(["gainB"]);

  await page.evaluate(() => document.getElementById("lt-spread-undo").click());
  // expect.poll, not a bare expect: UNDO deletes 39 profiles, and a plain
  // `expect(await stored(page))` reads localStorage exactly ONCE with no retry,
  // so on a slow runner it can sample mid-undo. Same defect class as the COPIED
  // assertion above — that one merely happened to fail first. Found by grepping
  // the rest of the file after fixing it, which is the habit this repo's
  // findings doc argues for.
  await expect.poll(() => stored(page).then(Object.keys), { timeout: 30_000 })
    .toEqual(["bahrain|dusk|wet"]);
});

test("switching the previewed condition disarms a pending COPY ALL", async ({ page }) => {
  await openImageTuner(page);
  // THE ONE REAL PLAYWRIGHT CLICK LEFT IN THIS FILE, kept deliberately. Every
  // other click here is dispatched (see the walk note above), which runs the
  // handler but proves nothing about the button being visible, enabled and
  // hit-testable. No other spec clicks a `#lt-tod-*` / `#lt-wx-*` preview chip
  // at all, so without this one the tuner's own chips would have no actionable
  // coverage anywhere in the suite. This test is the cheapest of the three to
  // carry it: it does not fan out across 40 circuits and does not reload.
  await page.locator("#lt-tod-dusk").click();
  await page.evaluate(() => window.__apex.lightTune({ gainB: 1.2 }));
  // IN-PAGE, AND HERE IT IS THE DIFFERENCE BETWEEN A TEST AND A VACUOUS ONE.
  // The armed chip belongs to dusk. Moving to night must not let the next click
  // copy the night profile instead — a confirmation that survives the thing it
  // was confirming is worse than none. But arming also expires on its own after
  // 20 s of wall clock, and a Playwright click in this container was MEASURED at
  // 78 s (see the arm/fire note in the test above). Driven from outside, the
  // "MY EDITS" below was therefore satisfied by the ARM TIMER rather than by the
  // condition switch — the assertion would have held with the disarm-on-switch
  // behaviour deleted. Inside one synchronous block no timer can fire, so the
  // only thing that can clear the chip is the tod button's own handler.
  const seq = await page.evaluate(() => {
    const chip = document.getElementById("lt-spread-edits");
    const out = {};
    chip.click(); out.armed = chip.textContent;
    document.getElementById("lt-tod-night").click(); out.afterSwitch = chip.textContent;
    // This click only ARMS the (now night) condition — it does not fire, so no
    // copy happens.
    chip.click(); out.rearmed = chip.textContent;
    return out;
  });
  expect(seq.armed).toMatch(/^COPY TO \d+\?$/);
  expect(seq.afterSwitch).toBe("MY EDITS");
  expect(seq.rearmed).toMatch(/^COPY TO \d+\?$/);
  // The one stored key is the ordinary tuner edit from above (dusk|dry —
  // weather was never switched to wet in this test), persisted by the plain
  // slider path and untouched by COPY ALL either way.
  expect(Object.keys(await stored(page))).toEqual(["bahrain|dusk|dry"]);
});

test("__apex.lightCopy('look') levels every track at that condition, and undoes", async ({ page }) => {
  await openImageTuner(page);
  await page.evaluate(() => { window.__apex.setTimeOfDay("night"); window.__apex.weather("wet"); });
  const r = await page.evaluate(() => window.__apex.lightCopy("look"));
  expect(r.ok).toBe(true);
  expect(r.mode).toBe("look");
  expect(r.tracks).toBeGreaterThan(20);
  // Same look means the same RESOLVED values, which is what a target with its own
  // shipped preset has to end up at — so compare against the source's live set.
  const src = await page.evaluate(() => window.__apex.lightTune());
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().track === "monza",
    null, { polling: 100, timeout: 30_000 });
  const monza = await page.evaluate(() => {
    window.__apex.setTimeOfDay("night"); window.__apex.weather("wet");
    return window.__apex.lightTune();
  });
  expect(monza).toEqual(src);

  await page.evaluate((undo) => window.__apex.lightCopy({ undo }), r.undo);
  expect(Object.keys(await stored(page)).some((k) => k.startsWith("monza|"))).toBe(false);
});

test("new grading controls clamp, persist, reset, and export", async ({ page }) => {
  await openImageTuner(page);
  await page.evaluate(() => window.__apex.lightTune({ shadows: 9, gammaG: 0.1, gainB: 1.25 }));
  // Read the clamp bounds from the REGISTRY, not from memory. This assertion was
  // written as toBe(1) when SHADOWS shipped at min/max -1..1, and 7eaf012e
  // ("widen + refine every tuner slider") deliberately widened it to -1.5..1.5
  // without updating the spec — so the test asserted an old design and went red
  // on a change that was correct. Hard-coding a bound here re-arms that trap
  // every time a slider is retuned; deriving it means the test checks what it
  // actually cares about (clamping HAPPENS, and to the declared edge) and is
  // silent about a range the tuner is free to change. Same rule the mcp-probe
  // skill's THIRD trap states for knob work: verify TUNE_DEFS by reading it.
  const bounds = await page.evaluate(() => {
    // BARE `LightTune`, not `window.LightTune`. js/game/lighting.js declares it
    // as `const LightTune = (function () {`, and a top-level `const` in a
    // CLASSIC script creates a script-scoped binding — it is NOT a property of
    // window, unlike `var` or the explicit `window.X =` form that ariastate.js,
    // css-zoom.js and sheetshape.js use. So `window.LightTune` was undefined and
    // this line threw `Cannot read properties of undefined (reading
    // 'TUNE_DEFS')`. The bare identifier resolves through the same global scope
    // the page's own modules use, which is how every other LightTune reader in
    // tests/ already does it. This was the only `window.LightTune` in the tree.
    const pick = (id) => (LightTune.TUNE_DEFS.find((d) => d.id === id) || {});
    return { shadowsMax: pick("shadows").max, gammaGMin: pick("gammaG").min };
  });
  expect(bounds.shadowsMax, "SHADOWS has no max in TUNE_DEFS — the clamp test would be vacuous").toBeGreaterThan(0);
  expect(bounds.gammaGMin, "GAMMA·GREEN has no min in TUNE_DEFS — the clamp test would be vacuous").toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__apex.lightTune().shadows)).toBe(bounds.shadowsMax);
  expect(await page.evaluate(() => window.__apex.lightTune().gammaG)).toBe(bounds.gammaGMin);
  await page.reload();
  // The same declared budgets as openImageTuner — these two were the only bare
  // waitForFunction calls in the file, so they inherited the config default
  // while every other boot/track wait had already been measured.
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: TRACK_MS });
  expect(await page.evaluate(() => window.__apex.lightTune().gainB)).toBeCloseTo(1.25);

  await reopenImageTuner(page);
  await page.evaluate(() => document.getElementById("lt-copy").click());
  await expect(page.locator("#lt-json")).toHaveValue(/"gainB": 1\.25/);
  await page.evaluate(() => document.getElementById("lt-reset").click());
  const reset = await page.evaluate(() => {
    const tune = window.__apex.lightTune();
    return { shadows: tune.shadows, gammaG: tune.gammaG, gainB: tune.gainB };
  });
  const shipped = await page.evaluate(() => {
    const p = window.LightPresets?.["*"] || {};
    return { shadows: p.shadows ?? 0, gammaG: p.gammaG ?? 1, gainB: p.gainB ?? 1 };
  });
  expect(reset).toEqual(shipped);
});
