// @ts-check
// GRAND PRIX circuit tabs (ALL / SEASON / CLASSICS / MY CIRCUITS) switch IN PLACE:
// no page-wide view transition (the crossfade read as a flash), the filter bar
// keeps its buttons and focus, and no track preparation is started by the tab.
import { test, expect, BOOT_MS, RACE_BUILD_MS } from "../helpers/fixtures.js";

test.use({ viewport: { width: 852, height: 393 }, hasTouch: true, reducedMotion: "no-preference" });

test("circuit tabs swap the strip in place: no view transition, same bar, focus kept", async ({ page }) => {
  await page.addInitScript(() => {
    for (const k of Object.keys(localStorage)) if (/^apex26\.(customTracks|customTrackDraft|trackId|track|trackFilter)/.test(k)) localStorage.removeItem(k);
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null && typeof CustomTracks !== "undefined", null, { polling: 100, timeout: RACE_BUILD_MS });
  // Seed one custom circuit so MY CIRCUITS exists.
  await page.locator("#mb-designer").click();
  await page.waitForFunction(() => typeof TrackDesigner !== "undefined" && TrackDesigner.isOpen(), null, { polling: 100, timeout: BOOT_MS });
  expect(await page.evaluate((s) => TrackDesigner.randomise(s), 42)).toBe(true);
  await page.waitForFunction(() => { const s = TrackDesigner.state(); return !s.pending && s.ok; }, null, { polling: 100, timeout: 15_000 });
  expect((await page.evaluate(() => TrackDesigner.save())).ok).toBe(true);
  await page.evaluate(() => TrackDesigner.close());
  await page.evaluate(() => document.getElementById("mb-race").click());
  await page.waitForFunction(() => !document.getElementById("select").hidden && document.querySelectorAll("#sel-tracks .track-row").length > 5, null, { polling: 100, timeout: BOOT_MS });

  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__vt = 0;
    const orig = document.startViewTransition && document.startViewTransition.bind(document);
    if (orig) document.startViewTransition = (cb) => { w.__vt++; return orig(cb); };
    w.__bar = document.getElementById("sel-track-filter");
    w.__chips = [...w.__bar.querySelectorAll("[data-filter]")];
    w.__barMut = 0;
    new MutationObserver((m) => { w.__barMut += m.filter((r) => r.type === "childList").length; }).observe(w.__bar, { childList: true });
  });
  for (const id of ["season", "classic", "custom", "all"]) {
    await page.evaluate((f) => /** @type {HTMLElement} */ (document.querySelector('#sel-track-filter [data-filter="' + f + '"]')).click(), id);
    const st = await page.evaluate((f) => {
      const w = /** @type {any} */ (window);
      const rows = [...document.querySelectorAll("#sel-tracks .track-row")];
      const bar = document.getElementById("sel-track-filter");
      return {
        vt: w.__vt, barSame: bar === w.__bar, chipsSame: w.__chips.every((c) => c.isConnected), barMut: w.__barMut,
        pressed: bar.querySelector('[data-filter="' + f + '"]').getAttribute("aria-pressed"),
        focus: document.activeElement && document.activeElement.getAttribute("data-filter"),
        kinds: [...new Set(rows.map((r) => /** @type {HTMLElement} */ (r).dataset.kind))],
        active: rows.filter((r) => r.classList.contains("active")).length,
      };
    }, id);
    expect(st.vt, id + ": no view transition").toBe(0);
    expect(st.barSame && st.chipsSame, id + ": bar buttons kept").toBe(true);
    expect(st.barMut, id + ": bar not rebuilt").toBe(0);
    expect(st.pressed).toBe("true");
    expect(st.focus, id + ": focus stays on the chip").toBe(id);
    expect(st.active, id + ": one selected tile").toBe(1);
    if (id === "custom") expect(st.kinds).toEqual(["custom"]);
  }
});
