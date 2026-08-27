// @ts-check
// Preset tests. The three named presets (RELAX / STANDARD / PRO) must each push
// a coherent bundle of values into the live sim, mark themselves active, persist,
// and a manual slider edit must drop the "named preset" state back to custom.
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect } from "../helpers/fixtures.js";

async function load(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
}
const clickPreset = (page, name) =>
  page.evaluate((n) => document.getElementById("pm-preset-" + n).click(), name);
const tuning = (page) => page.evaluate(() => window.__apex.tuning());
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem("apex26." + k)), key);
const activeName = (page) => page.evaluate(() =>
  ["relax", "standard", "pro"].find((n) => document.getElementById("pm-preset-" + n).classList.contains("active")) || null);

test.describe("Apex 26 — presets", () => {
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
