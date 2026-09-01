// @ts-check
/**
 * localStorage failing must not be SILENT.
 *
 * js/game/store.js caches every value it writes, so when the underlying
 * setItem throws, the rest of the session reads back exactly what it expected.
 * The game plays perfectly and the save is gone on reload. Safari on iOS is the
 * real case: Private Browsing sets the localStorage quota to ZERO, so the very
 * first write throws and a whole career is lost with nothing on screen and
 * nothing in the console to explain it.
 *
 * These tests pin the two halves of the fix separately, because they are two
 * different promises:
 *
 *   1. the failure is REPORTED — Log carries a warning and
 *      __apex.persistState() says ok:false with the exception's name
 *   2. the session still WORKS — the cache is deliberately written anyway, so a
 *      failed save degrades to "this session only" rather than to a broken game
 *
 * Promise 2 is why the bug was silent in the first place, so it is the one most
 * at risk of being "fixed" by a later change that drops the cache write. Losing
 * it would turn a lost save into a lost session, which is worse.
 *
 * Everything here goes through real settings (__apex.aeroMode, a genuine
 * store.set + store.get round trip) rather than reaching into the module, so
 * the test breaks when a PLAYER would notice and not when a name changes.
 */
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

/** Break localStorage.setItem the way a zero quota does, BEFORE any script runs. */
async function bootBroken(page, name = "QuotaExceededError") {
  await page.addInitScript(([errName]) => {
    const proto = Object.getPrototypeOf(window.localStorage) || Storage.prototype;
    const real = proto.setItem;
    proto.setItem = function (k, v) {
      // Only our own keys, so nothing else the page does is disturbed.
      if (String(k).startsWith("apex26.")) {
        const e = new Error("storage is full");
        e.name = errName;
        throw e;
      }
      return real.call(this, k, v);
    };
  }, [name]);
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}

test.describe("persistence failure is visible", () => {
  test("a healthy page reports ok", async ({ racePage }) => {
    const s = await racePage.evaluate(() => window.__apex.persistState());
    expect(s.ok).toBe(true);
    expect(s.broken).toBe(null);
  });

  test("a failing write is recorded, logged, and reported by persistState()", async ({ page }) => {
    await bootBroken(page);
    const r = await page.evaluate(() => {
      window.__apex.aeroMode("auto");   // a real setting, a real store.set
      return {
        state: window.__apex.persistState(),
        // Read the retained ring rather than scraping console text — the warning
        // fires once and later ones are buffer-only, so a console scrape would
        // miss every repeat.
        logs: window.__apex.logs({ ns: "game" }).map((x) => x.msg),
      };
    });

    expect(r.state.ok).toBe(false);
    expect(r.state.broken).toBe("QuotaExceededError");
    expect(r.logs.some((m) => /localStorage .*failed/.test(m))).toBe(true);
    // The message has to name the consequence, not just the exception — "will
    // NOT survive a reload" is the only part of it a player can act on.
    expect(r.logs.some((m) => /reload/.test(m))).toBe(true);
    const warning = page.locator("#save-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("SESSION ONLY");
    await expect(warning).toContainText("QuotaExceededError");
  });

  test("the exception's own name is reported, not a generic flag", async ({ page }) => {
    // Safari's Private Browsing throws QuotaExceededError; a disabled-storage
    // policy throws SecurityError. They mean different things to whoever is
    // reading the report, so the name has to survive rather than collapse to a
    // boolean.
    await bootBroken(page, "SecurityError");
    const s = await page.evaluate(() => {
      window.__apex.aeroMode("manual");
      return window.__apex.persistState();
    });
    expect(s.ok).toBe(false);
    expect(s.broken).toBe("SecurityError");
  });

  test("the session still reads back what it wrote (a lost save is not a lost session)", async ({ page }) => {
    await bootBroken(page);
    const back = await page.evaluate(() => {
      window.__apex.aeroMode("auto");
      return window.__apex.aeroMode();
    });
    // The disk write threw; the setting still has to be live for this session.
    expect(back).toBe("auto");
  });

  test("the recovery export contains game progress, not the storage cache", async ({ page }) => {
    await bootBroken(page);
    await page.evaluate(() => window.__apex.aeroMode("auto"));
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
    expect(recovery).not.toHaveProperty("cache");
  });

  test("the loud warning fires once, not once per write", async ({ page, consoleLines }) => {
    await bootBroken(page);
    await page.evaluate(() => {
      for (let i = 0; i < 6; i++) window.__apex.aeroMode(i % 2 ? "auto" : "manual");
    });
    // A dead localStorage fails on EVERY call, so an unconditional warn buries
    // the console in one identical line and hides whatever the player was
    // actually reporting. Repeats go to the ring buffer instead.
    const warned = consoleLines.filter((l) => /localStorage .*failed/.test(l));
    expect(warned.length).toBeLessThanOrEqual(1);
    const buffered = await page.evaluate(() =>
      window.__apex.logs({ ns: "game" }).filter((x) => /localStorage .*failed/.test(x.msg)).length);
    expect(buffered).toBeGreaterThan(1);
  });
});

