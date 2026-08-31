// @ts-check
// Tests for car setup budget system:
// - Budget display at the Parts.BUDGET default (read from the page, not
//   hardcoded: the cap moves when the catalog grows)
// - Budget decrements on part selection
// - Over-budget parts show visual warning and can't be selected (without unlimited)
// - Unlimited toggle removes cap and persists via localStorage
import { test, expect } from "@playwright/test";
import { galleryPath } from "../helpers/output-paths.js";

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
}

async function pickOpt(page, catId, optId) {
  await page.locator(`#cs-tabs [data-cs-cat="${catId}"]`).click();
  await page.locator(`#cs-options [data-cs-opt="${optId}"]`).click();
}

async function openSetup(page) {
  // ONE BOOT, NOT TWO. This used to goto, wait for the game, clear storage,
  // then RELOAD and wait again — two full game boots (track build included)
  // for every test in the file, purely to start from clean storage. On
  // SwiftShader that second boot is most of the test: measured 62-103 s per
  // test solo against a 120 s budget, so at two workers the whole file
  // timed out while asserting nothing about reloads. addInitScript runs
  // before any page script, so the storage is already clean on the first
  // boot and the end state is identical.
  await page.addInitScript(() => {
    // FIRST NAVIGATION ONLY. addInitScript reruns on every navigation, and
    // "unlimited state persists after page reload" sets the flag, reloads,
    // and expects it back — an unguarded reset would wipe the very thing
    // that test asserts. sessionStorage survives the reload in-tab, so this
    // marker makes the reset a once-per-page-object thing.
    if (sessionStorage.getItem("__budgetSpecReset")) return;
    sessionStorage.setItem("__budgetSpecReset", "1");
    // Teams isn't loaded yet at init time, so clear every stored parts key
    // rather than resolving the one team id — the same reset, with no
    // dependency on game code having run.
    for (const k of Object.keys(localStorage))
      if (k.startsWith("apex26.parts.")) localStorage.removeItem(k);
    localStorage.removeItem("apex26.unlimitedBudget");
  });
  await page.goto("/");
  await waitReady(page);
  // THE GARAGE DOOR, not the race flow. This used to walk mb-race -> select ->
  // sel-go, which builds the circuit picker and then the track itself before it
  // ever reaches the screen these tests are about. Measured on this box:
  // boot 18.8 s, then the race flow 27.6 s vs `mb-garage` 11.1 s — the same
  // #carsetup either way, because openGarage("menu") only sets the camera and
  // where DONE returns to (js/game.js openGarage), and no test in this file
  // clicks DONE. 16 s a test back, across 14 tests, on a file whose own header
  // records 62-103 s against a 120 s budget and which had five tests cross it.
  //
  // A SHARED PAGE was the other candidate and is NOT worth it: measured, one
  // boot plus a leave-and-re-enter is ~25 s against ~30 s for a fresh page
  // through this door, because re-entering rebuilds the car and the bay anyway.
  // Five seconds is not worth making fourteen tests serial and turning one
  // failure into nine skips.
  await page.locator("#mb-garage").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
}

test.describe("Budget system — display", () => {
  test("shows the full cap at all defaults", async ({ page }) => {
    await openSetup(page);
    // Read the cap from Parts rather than hardcoding it — the budget rises when
    // the catalog gains options, and a literal here just breaks on that.
    const cap = await page.evaluate(() => Parts.BUDGET);
    const text = await page.locator("#cs-budget").textContent();
    // Nothing is spent at defaults, so remaining equals the cap (setup-ui.js
    // renders "BUDGET: <remaining> / <cap> cr remaining").
    expect(text).toContain(cap + " / " + cap + " cr remaining");
    await page.screenshot({ path: galleryPath("parts-budget", "budget-default.png") });
  });

  test("budget label has no 'over' class at defaults", async ({ page }) => {
    await openSetup(page);
    const cls = await page.locator("#cs-budget").getAttribute("class");
    expect(cls ?? "").not.toContain("over");
  });

  test("budget bar fill is zero at all defaults", async ({ page }) => {
    await openSetup(page);
    const transform = await page.locator("#cs-budget-fill").evaluate((el) =>
      el.style.transform
    );
    expect(transform).toContain("scaleX(0)");
  });
});

test.describe("Budget system — part selection", () => {
  test("selecting the race engine spends exactly its catalog price", async ({ page }) => {
    await openSetup(page);
    await pickOpt(page, "engine", "race");
    // Read the price from the catalog, like the cap above. Hardcoding it pinned
    // 160 cr, and the ladder re-space repriced the row — a spec that fails
    // because a part is cheaper is measuring the number, not the behaviour.
    const left = await page.evaluate(() => Parts.BUDGET -
      Parts.CATALOG.find((c) => c.id === "engine").options.find((o) => o.id === "race").cost);
    const text = await page.locator("#cs-budget").textContent();
    expect(text).toContain(String(left));
    await page.screenshot({ path: galleryPath("parts-budget", "budget-race-engine.png") });
  });

  test("budget fill bar increases after selecting a paid part", async ({ page }) => {
    await openSetup(page);
    await pickOpt(page, "engine", "race");
    const transform = await page.locator("#cs-budget-fill").evaluate((el) =>
      el.style.transform
    );
    // A paid part must move the bar off zero (the race engine against the cap).
    expect(transform).toMatch(/scaleX\(0\.[1-9]/);
  });

  test("parts that exceed budget show over-budget class", async ({ page }) => {
    await openSetup(page);
    // Spend enough that the dearest engine no longer fits: the top ERS, gearbox
    // and fuel rows together leave well under the dearest engine against the
    // 780 cap. Prices move with the ladder; the three dearest rows do not.
    await pickOpt(page, "ers", "overcharge");
    await pickOpt(page, "gearbox", "seamless_shift");
    await pickOpt(page, "fuel", "custom_formula");
    // Switch to engine so over-budget options are visible in #cs-options
    await page.locator('#cs-tabs [data-cs-cat="engine"]').click();
    const overBudgetCount = await page.locator("#cs-options .cs-opt.over-budget").count();
    expect(overBudgetCount).toBeGreaterThan(0);
    await page.screenshot({ path: galleryPath("parts-budget", "budget-over-budget.png") });
  });

  test("budget label gets 'over' class when spending exceeds the cap", async ({ page }) => {
    // FOUR PART SWAPS IS THE ARITHMETIC MINIMUM, so this test cannot be made
    // cheaper the way the rest of the file was. Summing the dearest option in
    // each category, richest first against the 780 cap: ers/overcharge 230,
    // gearbox/seamless_shift 210 (440), fuel/custom_formula 210 (650), and only
    // the fourth crosses. Every swap rebuilds the car mesh and repaints the
    // bay, and that is the test, not overhead around it. Measured 133.2 s at
    // one worker after the garage-door change took the rest of the file to
    // 13-116 s; the 120 s default is the only thing it fails.
    test.setTimeout(240_000);
    await openSetup(page);
    // Unlimited mode to select a combo past the cap, then disable to reveal it.
    await page.locator("#cs-unlimited").click();
    await pickOpt(page, "ers", "overcharge");
    await pickOpt(page, "gearbox", "seamless_shift");
    await pickOpt(page, "fuel", "custom_formula");
    await pickOpt(page, "engine", "quali_engine");
    // The four dearest rows together clear the 780 cap by a wide margin, so the
    // label goes "over" whatever the ladder prices them at.
    await page.locator("#cs-unlimited").click();
    const cls = await page.locator("#cs-budget").getAttribute("class");
    expect(cls).toContain("over");
    await page.screenshot({ path: galleryPath("parts-budget", "budget-exceeded.png") });
  });
});

test.describe("Budget system — unlimited toggle", () => {
  test("unlimited button shows FREE BUILD text initially", async ({ page }) => {
    await openSetup(page);
    const text = await page.locator("#cs-unlimited").textContent();
    expect(text).toContain("FREE BUILD");
    expect(text).not.toContain("ON");
  });

  test("clicking unlimited button enables FREE BUILD mode", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain("no budget limit");
    await page.screenshot({ path: galleryPath("parts-budget", "budget-unlimited-on.png") });
  });

  test("unlimited mode hides budget fill bar", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    const transform = await page.locator("#cs-budget-fill").evaluate((el) =>
      el.style.transform
    );
    expect(transform).toContain("scaleX(0)");
  });

  test("unlimited button gets 'on' class when active", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    const cls = await page.locator("#cs-unlimited").getAttribute("class");
    expect(cls).toContain("on");
  });

  test("unlimited mode removes over-budget option classes", async ({ page }) => {
    await openSetup(page);
    // First fill up the budget so something is over-budget
    await pickOpt(page, "ers", "overcharge");
    await pickOpt(page, "gearbox", "f1_spec");
    await pickOpt(page, "fuel", "custom_formula");
    // Now enable unlimited
    await page.locator("#cs-unlimited").click();
    await page.locator('#cs-tabs [data-cs-cat="engine"]').click();
    const overBudgetCount = await page.locator("#cs-options .cs-opt.over-budget").count();
    expect(overBudgetCount).toBe(0);
    await page.screenshot({ path: galleryPath("parts-budget", "budget-unlimited-no-over.png") });
  });

  test("unlimited state persists after page reload", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    // Reload, then back in through the garage door. This test pays for TWO
    // openings and was the longest in the file at 169 s; the flag surviving a
    // reload is what it is about, not the route back to the screen.
    await page.reload();
    await waitReady(page);
    await page.locator("#mb-garage").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain("no budget limit");
    await page.screenshot({ path: galleryPath("parts-budget", "budget-unlimited-persisted.png") });
  });

  test("toggling unlimited OFF restores normal budget display", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click(); // ON
    await page.locator("#cs-unlimited").click(); // OFF
    const cap = await page.evaluate(() => Parts.BUDGET);
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain(String(cap));
    const cls = await page.locator("#cs-unlimited").getAttribute("class");
    expect(cls).not.toContain(" on");
  });
});
