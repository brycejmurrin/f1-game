// @ts-check
// Preset tests. The three named presets (RELAX / STANDARD / PRO) must each push
// a coherent bundle of values into the live sim, mark themselves active, persist,
// and a manual slider edit must drop the "named preset" state back to custom.
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

async function load(page) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}
const clickPreset = (page, name) =>
  page.evaluate((n) => document.getElementById("pm-preset-" + n).click(), name);
const tuning = (page) => page.evaluate(() => window.__apex.tuning());
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem("apex26." + k)), key);
const activeName = (page) => page.evaluate(() =>
  ["relax", "standard", "pro"].find((n) => document.getElementById("pm-preset-" + n).classList.contains("active")) || null);

// DECLARED BUDGET, because an UNDECLARED one is UNKNOWN rather than safe — and
// unknown is what turned a healthy spec into a deterministic false red that
// skipped the deploy job on Pages run 2015.
//
// The failures were NOT assertions. Both read `Test timeout of 120000ms
// exceeded while setting up "context"` — Playwright could not create a browser
// context at all. The CI pattern says the same thing: each worker passed one
// test and then failed the next on setup, and a fresh worker again managed
// exactly one. That is worker churn on a loaded runner, not this file.
//
// Same file on this box: 4/4 green, but the FIRST test costs 1.7 min (102 s) of
// boot against the 120 s default, with the other three at 13.7 / 9.9 / 9.9 s.
// The whole cost is that first boot; sharedTest hands the same page to the rest.
// 102 s of headroom on an IDLE container is no headroom on a loaded runner —
// parts-ers measured 29 s here against 195 s there, a 6.6x stretch.
//
// 300 s matches the other over-cap specs, so select-specs EXCLUDES this file by
// name rather than selecting it into a gate its boot alone cannot clear.
// This is the third instance of the shape documented in
// docs/notes/TESTING-FIELD-NOTES.md: a healthy spec, a false red, a blocked
// deploy, one per newly-touched area. It reached the gate because a css/hud.css
// diff pulled it into the change-aware selection for the first time. 80 of 115
// specs still declare no budget.
test.describe("Apex 26 — presets", () => {
  test.setTimeout(300_000);
  test("RELAX is more forgiving than PRO (more help, calmer steering)", async ({ page }) => {
    await load(page);
    await clickPreset(page, "relax");
    const relax = await tuning(page);
    await clickPreset(page, "pro");
    const pro = await tuning(page);
    // RELAX tracks more of the corner for you and turns in more gently.
    expect(relax.roadFollow).toBeGreaterThan(pro.roadFollow);
    expect(relax.wheelbase).toBeGreaterThan(pro.wheelbase);   // longer wheelbase = lazier
    // RELAX pulls toward the racing line; PRO leaves it off.
    expect(relax.raceLineAssist).toBeGreaterThan(0);
    expect(pro.raceLineAssist).toBe(0);
  });

  test("clicking a preset marks it active and persists", async ({ page }) => {
    await load(page);
    await clickPreset(page, "relax");
    expect(await activeName(page)).toBe("relax");
    expect(await stored(page, "preset")).toBe("relax");
  });

  test("STANDARD sits between RELAX and PRO on every feel axis", async ({ page }) => {
    // Ordering, not hardcoded physics constants — this survives any slider→physics
    // remap. (The old version pinned wheelbase 3.2 / expo 2.4 / roadFollow 0.50,
    // which broke on every retune.) STANDARD is the middle bundle: less help than
    // RELAX, more than PRO; lazier turn-in than PRO, snappier than RELAX.
    await load(page);
    await clickPreset(page, "relax");    const relax = await tuning(page);
    await clickPreset(page, "standard"); const std   = await tuning(page);
    await clickPreset(page, "pro");      const pro   = await tuning(page);
    // Driving help: RELAX ≥ STANDARD ≥ PRO
    expect(std.roadFollow).toBeLessThanOrEqual(relax.roadFollow);
    expect(std.roadFollow).toBeGreaterThanOrEqual(pro.roadFollow);
    // Turn-in laziness (wheelbase): RELAX ≥ STANDARD ≥ PRO
    expect(std.wheelbase).toBeLessThanOrEqual(relax.wheelbase);
    expect(std.wheelbase).toBeGreaterThanOrEqual(pro.wheelbase);
    // STANDARD ships no racing-line pull (only RELAX does).
    expect(std.raceLineAssist).toBe(0);
  });

  test("a manual slider edit drops the preset back to custom", async ({ page }) => {
    await load(page);
    await clickPreset(page, "relax");
    expect(await activeName(page)).toBe("relax");
    await page.evaluate(() => {
      const el = document.getElementById("pm-lock");
      el.value = "8"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(await activeName(page)).toBe(null);
    expect(await stored(page, "preset")).toBe("custom");
  });
});
