// @ts-check
// PHONE TEST recorder (#1633): RECORD -> let rAF frames advance -> SHARE produces
// one valid JSON file. Menu-only: no race, so it costs seconds, not a group.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

test.describe("phone recorder — RECORD, advance, SHARE", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("shares one valid JSON soak file and shows the REC badge", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof PhoneRecorder !== "undefined" && !!document.getElementById("pm-phonerec"),
      null, { polling: 200, timeout: BOOT_MS });

    // iOS Safari path: navigator.share({files}); capture what the page hands it.
    await page.evaluate(() => {
      window.__shared = null;
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => {
        window.__shared = { name: d.files[0].name, type: d.files[0].type, text: await d.files[0].text() };
      } });
    });

    // Nothing runs until RECORD: the badge does not exist yet.
    expect(await page.evaluate(() => PhoneRecorder.isOn() || !!document.getElementById("phone-rec-badge"))).toBe(false);

    await page.evaluate(() => document.getElementById("pm-phonerec-rec").click());
    await page.waitForFunction(() => JSON.parse(PhoneRecorder.json()).cadence != null, null, { polling: 100, timeout: 60000 });
    const badge = await page.evaluate(() => document.getElementById("phone-rec-badge").textContent);
    expect(badge).toMatch(/^● REC \d\d:\d\d · \d+$/);

    await page.evaluate(() => document.getElementById("pm-phonerec-share").click());
    await page.waitForFunction(() => window.__shared != null, null, { polling: 100, timeout: 10000 });
    const shared = await page.evaluate(() => window.__shared);
    expect(shared.name).toMatch(/^apex26-soak-\d{8}-\d{6}\.json$/);
    expect(shared.type).toBe("application/json");
    const rec = JSON.parse(shared.text);
    expect(rec.schema).toBe("apex26.phone-soak/1");
    expect(rec.facts.dpr).toBeGreaterThan(0);
    expect(rec.facts.gl.ok).toBe(true);
    expect(rec.cadence.frames).toBe(120);
    expect(rec.samples.length).toBeGreaterThanOrEqual(2);
    expect(rec.samples[0].tier).not.toBeNull();   // PerfGov is a lexical const, reachable only by bare name
    expect(rec.samples[0].renderScale).not.toBeNull();
    expect(rec.samples[0].trigger).toBe("start");
    expect(rec.samples[rec.samples.length - 1].trigger).toBe("stop");
    expect(rec.endedAt).toBeTruthy();
    expect(await page.evaluate(() => PhoneRecorder.isOn())).toBe(false);
  });
});
