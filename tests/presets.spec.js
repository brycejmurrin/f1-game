// @ts-check
// Preset tests. The three named presets (RELAX / STANDARD / PRO) must each push
// a coherent bundle of values into the live sim, mark themselves active, persist,
// and a manual slider edit must drop the "named preset" state back to custom.
import { test, expect } from "@playwright/test";

async function load(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
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

  test("STANDARD reproduces the original default feel", async ({ page }) => {
    await load(page);
    await clickPreset(page, "standard");
    const t = await tuning(page);
    expect(t.wheelbase).toBeCloseTo(3.2, 1);   // RESPONSE 5
    expect(t.expo).toBeCloseTo(2.4, 1);        // LINEARITY 5
    expect(t.roadFollow).toBeCloseTo(0.50, 1); // DRIVING HELP 6 (grip-limited assist gain)
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
