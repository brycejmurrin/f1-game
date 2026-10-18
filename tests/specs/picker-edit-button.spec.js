// @ts-check
// GRAND PRIX picker: a custom circuit (MY CIRCUITS) gets an EDIT button beside
// CIRCUIT DETAIL that opens the Track Designer on that design (SAVE overwrites
// it); built-in circuits have none; closing the designer returns to the picker
// on the same circuit. Visible at phone-landscape (the old chip sat in the facts
// row, which is display:none at compact density).
import { test, expect, BOOT_MS, RACE_BUILD_MS } from "../helpers/fixtures.js";

for (const vp of [{ width: 852, height: 393 }, { width: 667, height: 375 }, { width: 390, height: 844 }, { width: 1440, height: 760 }]) {
  test(`EDIT beside CIRCUIT DETAIL on custom circuits only, ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.addInitScript(() => {
      if (sessionStorage.getItem("apex26.spec.edit-clean")) return;
      sessionStorage.setItem("apex26.spec.edit-clean", "1");
      for (const k of Object.keys(localStorage)) if (/^apex26\.(customTracks|customTrackDraft|trackId|track|trackFilter)/.test(k)) localStorage.removeItem(k);
    });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null && typeof CustomTracks !== "undefined", null, { polling: 100, timeout: RACE_BUILD_MS });
    await page.locator("#mb-designer").click();
    await page.waitForFunction(() => typeof TrackDesigner !== "undefined" && TrackDesigner.isOpen(), null, { polling: 100, timeout: BOOT_MS });
    expect(await page.evaluate((s) => TrackDesigner.randomise(s), 42)).toBe(true);
    await page.waitForFunction(() => { const s = TrackDesigner.state(); return !s.pending && s.ok; }, null, { polling: 100, timeout: 15_000 });
    expect((await page.evaluate(() => TrackDesigner.save())).ok).toBe(true);
    const id = await page.evaluate(() => TrackDesigner.state().design.originId);
    await page.evaluate(() => { TrackDesigner.close(); CustomTracks.select(TrackDesigner.state().library[0]); });
    await page.evaluate(() => document.getElementById("mb-race").click());
    await page.waitForFunction(() => !document.getElementById("select").hidden && !!document.getElementById("sel-edit-chip"), null, { polling: 100, timeout: BOOT_MS });

    // Beside CIRCUIT DETAIL, on the tap-target floor, inside the viewport.
    const box = await page.evaluate(() => {
      const e = document.getElementById("sel-edit-chip").getBoundingClientRect(), d = document.getElementById("sel-detail-chip").getBoundingClientRect();
      return { e: { x: e.x, y: e.y, w: e.width, h: e.height }, d: { x: d.x, y: d.y, w: d.width, h: d.height }, vw: innerWidth };
    });
    expect(box.e.h).toBeGreaterThanOrEqual(36);
    expect(box.e.w).toBeGreaterThanOrEqual(36);
    expect(box.e.x + box.e.w).toBeLessThanOrEqual(box.vw);

    // A built-in circuit has no EDIT.
    await page.evaluate(() => { document.querySelector('#sel-track-filter [data-filter="season"]').click(); });
    await page.waitForFunction(() => !document.getElementById("sel-edit-chip"), null, { polling: 100, timeout: 10_000 });
    await page.evaluate(() => { document.querySelector('#sel-track-filter [data-filter="custom"]').click(); });
    await page.waitForFunction(() => !!document.getElementById("sel-edit-chip"), null, { polling: 100, timeout: 10_000 });

    // EDIT opens the designer on this design; closing returns to the same circuit.
    await page.evaluate(() => document.getElementById("sel-edit-chip").click());
    await page.waitForFunction(() => TrackDesigner.isOpen(), null, { polling: 100, timeout: 15_000 });
    expect(await page.evaluate(() => TrackDesigner.state().design.originId)).toBe(id);
    await page.evaluate(() => TrackDesigner.close());
    await page.waitForFunction(() => !TrackDesigner.isOpen(), null, { polling: 100, timeout: 10_000 });
    expect(await page.evaluate(() => !document.getElementById("select").hidden)).toBe(true);
    expect(await page.evaluate(() => document.querySelector("#sel-tracks .track-row.active")?.getAttribute("aria-label") || "")).not.toBe("");
    expect(await page.evaluate(() => !!document.getElementById("sel-edit-chip"))).toBe(true);
  });
}
