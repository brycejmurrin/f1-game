// @ts-check
import { test, expect } from "@playwright/test";

async function openImageTuner(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15_000 });
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 20_000 });
  await page.evaluate(() => window.__apex.park(0.1));
  await page.locator("#pausebtn").click();
  await page.locator("#pm-settings").click();
  await page.locator("#pmsettings").waitFor({ state: "visible" });
  await page.locator("#pm-lighting").click();
  await page.getByRole("tab", { name: "IMAGE & COLOUR" }).click();
}

async function reopenImageTuner(page) {
  await page.evaluate(() => window.__apex.park(0.1));
  await page.locator("#pausebtn").click();
  await page.locator("#pm-settings").click();
  await page.locator("#pmsettings").waitFor({ state: "visible" });
  await page.locator("#pm-lighting").click();
  await page.getByRole("tab", { name: "IMAGE & COLOUR" }).click();
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
  await page.locator("#lt-tod-dusk").click();
  await page.locator("#lt-wx-wet").click();
  await page.evaluate(() => window.__apex.lightTune({ gainB: 1.2 }));
  expect((await stored(page))["bahrain|dusk|wet"].gainB).toBeCloseTo(1.2);

  const edits = page.locator("#lt-spread-edits");
  await edits.click();                                   // first click ARMS, writes nothing
  await expect(edits).toHaveText(/^COPY TO \d+\?$/);
  expect(Object.keys(await stored(page))).toEqual(["bahrain|dusk|wet"]);

  await edits.click();                                   // second click fires
  await expect(edits).toHaveText(/^COPIED \d+ ✓$/);
  const after = await stored(page);
  const targets = Object.keys(after).filter((k) => k !== "bahrain|dusk|wet");
  expect(targets.length).toBeGreaterThan(20);            // every other circuit on the LIST
  for (const k of targets) {
    expect(k).toMatch(/\|dusk\|wet$/);                   // …and no other condition
    expect(after[k].gainB).toBeCloseTo(1.2);
  }
  // MY EDITS sends only what was tuned here, so nothing else rides along.
  expect(Object.keys(after["monza|dusk|wet"])).toEqual(["gainB"]);

  await page.locator("#lt-spread-undo").click();
  expect(Object.keys(await stored(page))).toEqual(["bahrain|dusk|wet"]);
});

test("switching the previewed condition disarms a pending COPY ALL", async ({ page }) => {
  await openImageTuner(page);
  await page.locator("#lt-tod-dusk").click();
  await page.evaluate(() => window.__apex.lightTune({ gainB: 1.2 }));
  await page.locator("#lt-spread-edits").click();
  await expect(page.locator("#lt-spread-edits")).toHaveText(/^COPY TO \d+\?$/);
  // The armed chip belongs to dusk. Moving to night must not let the next click
  // copy the night profile instead — a confirmation that survives the thing it
  // was confirming is worse than none.
  await page.locator("#lt-tod-night").click();
  await expect(page.locator("#lt-spread-edits")).toHaveText("MY EDITS");
  // This click only ARMS the (now night) condition — it does not fire, so no
  // copy happens. The one stored key is the ordinary tuner edit from above
  // (dusk|dry — weather was never switched to wet in this test), persisted by
  // the plain slider path and untouched by COPY ALL either way.
  await page.locator("#lt-spread-edits").click();
  await expect(page.locator("#lt-spread-edits")).toHaveText(/^COPY TO \d+\?$/);
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
  // TWO Bahrain builds in one test — openImageTuner, then a page.reload() and
  // reopenImageTuner to prove the values PERSIST across a reload. On SwiftShader
  // a build is 40-60 s, so this cannot fit the 120 s default however fast the
  // assertions are. It never surfaced because the test threw at ~64 s on
  // `window.LightTune` (a lexical global, never a window property) before it
  // reached the second build. Same remedy, same reason, as
  // tests/specs/bahrain-foundation.spec.js:5.
  test.setTimeout(300_000);
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
    // `LightTune`, NOT `window.LightTune`. js/game/lighting.js:10 declares it as
    // a top-level `const` in a classic script, which binds in the global LEXICAL
    // environment — that is not the same object as `window`, so the property
    // form is permanently undefined and this whole block threw before the two
    // expects below could run. Every other global in this project is assigned
    // (`window.MenuNav = …`), which is why the property form looks right here.
    const pick = (id) => (LightTune.TUNE_DEFS.find((d) => d.id === id) || {});
    return { shadowsMax: pick("shadows").max, gammaGMin: pick("gammaG").min };
  });
  expect(bounds.shadowsMax, "SHADOWS has no max in TUNE_DEFS — the clamp test would be vacuous").toBeGreaterThan(0);
  expect(bounds.gammaGMin, "GAMMA·GREEN has no min in TUNE_DEFS — the clamp test would be vacuous").toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__apex.lightTune().shadows)).toBe(bounds.shadowsMax);
  expect(await page.evaluate(() => window.__apex.lightTune().gammaG)).toBe(bounds.gammaGMin);
  await page.reload();
  await page.waitForFunction(() => window.__apex?.race);
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null);
  expect(await page.evaluate(() => window.__apex.lightTune().gainB)).toBeCloseTo(1.25);

  await reopenImageTuner(page);
  await page.locator("#lt-copy").click();
  await expect(page.locator("#lt-json")).toHaveValue(/"gainB": 1\.25/);
  await page.locator("#lt-reset").click();
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
