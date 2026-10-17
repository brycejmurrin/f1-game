// @ts-check
// The DOM half of persistence.spec.js: the on-screen warning and the recovery
// download. The JSON contract (persistState, the log ring, the session cache)
// is tests/unit/persistence-vm.test.mjs.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

async function bootBroken(page, name = "QuotaExceededError") {
  await page.addInitScript(([errName]) => {
    const proto = Object.getPrototypeOf(window.localStorage) || Storage.prototype;
    const real = proto.setItem;
    proto.setItem = function (k, v) {
      if (String(k).startsWith("apex26.")) {
        const e = new Error("storage is full");
        e.name = errName;
        throw e;
      }
      return real.call(this, k, v);
    };
  }, [name]);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}

test.describe("persistence failure on screen", () => {
  test("the warning names the session-only consequence and folds away", async ({ page }) => {
    await bootBroken(page);
    await page.evaluate(() => window.__apex.aeroMode("auto"));
    const warning = page.locator("#save-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("SESSION ONLY");
    await expect(warning).toContainText("QuotaExceededError");
    const toggle = page.locator("#save-dismiss");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#save-retry")).toBeHidden();
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#save-retry")).toBeVisible();
    await page.evaluate(() => document.body.classList.add("in-race"));
    await expect(warning).toBeHidden();
    await page.evaluate(() => document.body.classList.remove("in-race"));
    await expect(warning).toBeVisible();
  });

  test("the recovery export contains game progress, not the storage cache", async ({ page }) => {
    await bootBroken(page);
    await page.evaluate(() => {
      window.__apex.career({ teamId: "williams", seat: 1, seed: 2026 });
      window.__apex.careerMoney(123457);
    });
    await page.waitForFunction(() => window.__apex.career()?.obj != null, null, { polling: 100, timeout: 10000 });
    const expectedCareer = await page.evaluate(() => window.__apex.career());
    expect(expectedCareer.team).toBe("williams");
    expect(expectedCareer.money).toBe(123457);
    const download = page.waitForEvent("download");
    await page.locator("#save-export").click();
    const item = await download;
    expect(item.suggestedFilename()).toMatch(/^apex26-recovery-\d+\.json$/);
    const path = await item.path();
    const text = await import("node:fs/promises").then((fs) => fs.readFile(path, "utf8"));
    const recovery = JSON.parse(text);
    expect(recovery.format).toBe("apex26-recovery-v1");
    expect(recovery.persistence.durable).toBe(false);
    expect(recovery.persistence.reason).toBe("QuotaExceededError");
    expect(recovery.career).toEqual(expectedCareer);
    expect(recovery).not.toHaveProperty("cache");
  });
});
