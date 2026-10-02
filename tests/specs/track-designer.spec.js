// @ts-check
// TRACK DESIGNER: the title door loads the LAZY_EDITOR bundle (TrackDesigner,
// DesignerCanvas and the pure core) into the shell's #trackdesigner dialog; a
// randomised design passes the WYSIWYG validator, SAVE appends it to
// Tracks.LIST as a custom entry, RACE hands it to the ordinary picker flow,
// __apex.race() builds and drives it, and a reload resolves the stored id.
import { test, expect, BOOT_MS, TRACK_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 1180, height: 720 };

async function bootClean(page) {
  // An init script runs on EVERY navigation, the reload case's included — so
  // the wipe runs once per page session, or the reload would erase what it is
  // there to prove survived.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("apex26.spec.td-clean")) return;
    sessionStorage.setItem("apex26.spec.td-clean", "1");
    for (const k of Object.keys(localStorage)) if (k === "apex26.customTracks" || k === "apex26.customTrackDraft" || k === "apex26.customTrackDraftPrev" || k === "apex26.trackId" || k === "apex26.track") localStorage.removeItem(k);
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null && typeof CustomTracks !== "undefined", null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.headless(true));
}

async function openDesigner(page) {
  await page.locator("#mb-designer").click();
  await page.waitForSelector("#trackdesigner:not([hidden])", { timeout: BOOT_MS });
  await page.waitForFunction(() => typeof TrackDesigner !== "undefined" && typeof DesignerCanvas !== "undefined" && TrackDesigner.isOpen(),
    null, { polling: 100, timeout: BOOT_MS });
}

/** Randomise with a fixed seed and wait for the engine-built preview to settle green. */
async function randomiseGreen(page, seed) {
  const ok = await page.evaluate((s) => TrackDesigner.randomise(s), seed);
  expect(ok, "TrackRandom found a loop the validator accepts within 12 tries").toBe(true);
  await page.waitForFunction(() => { const s = TrackDesigner.state(); return !s.pending && s.ok; }, null, { polling: 100, timeout: 15_000 });
  return page.evaluate(() => TrackDesigner.state());
}

test.describe("Track designer", () => {
  test.use({ viewport: LANDSCAPE });

  test("the title door opens the designer; a randomised design validates green and saves into MY CIRCUITS", async ({ page }) => {
    await bootClean(page);
    const before = await page.evaluate(() => ({ n: Tracks.LIST.length, custom: Tracks.LIST.filter((t) => t.custom).length }));
    expect(before.custom).toBe(0);
    await openDesigner(page);
    // The dialog is named and modal: a <dialog> with the shell's heading as its label.
    await expect(page.locator("#trackdesigner")).toHaveAttribute("aria-labelledby", "td-title");
    await expect(page.locator("#trackdesigner .td-tab").first()).toHaveAttribute("aria-selected", "true");

    const st = await randomiseGreen(page, 7);
    expect(st.red).toBe(0);
    expect(st.lengthM).toBeGreaterThanOrEqual(2500);
    expect(st.lengthM).toBeLessThanOrEqual(7000);
    expect(st.design.pts.length).toBeGreaterThanOrEqual(8);
    // Every stored coordinate sits on the 0.25 m lattice (the share-code contract).
    expect(st.design.pts.every((p) => Number.isInteger(p[0] * 4) && Number.isInteger(p[1] * 4))).toBe(true);
    // Determinism: the same seed draws the same loop.
    const again = await randomiseGreen(page, 7);
    expect(again.design.pts).toEqual(st.design.pts);

    // UNDO returns the previous loop; REDO brings it back.
    await page.evaluate(() => TrackDesigner.undo());
    const undone = await page.evaluate(() => TrackDesigner.state());
    expect(undone.undo).toBe(again.undo - 1);
    expect(undone.redo).toBe(1);
    await page.evaluate(() => TrackDesigner.redo());
    const redone = await page.evaluate(() => TrackDesigner.state());
    expect(redone.design.pts).toEqual(again.design.pts);

    // A stamp splices into the loop and keeps it valid.
    const stamped = await page.evaluate(() => {
      TrackDesigner.setTool("corner");
      const ok = TrackDesigner.applyStamp(3, 3);
      return { ok, pts: TrackDesigner.state().design.pts };
    });
    expect(stamped.ok).toBe(true);
    // The loop changed downstream of the anchor; the count need not grow — a
    // stamp that pushes past 200 points thins the untouched remainder.
    expect(stamped.pts).not.toEqual(again.design.pts);
    expect(stamped.pts.slice(0, 4)).toEqual(again.design.pts.slice(0, 4));
    await page.waitForFunction(() => !TrackDesigner.state().pending, null, { polling: 100, timeout: 15_000 });
    await page.evaluate(() => TrackDesigner.undo());

    // SAVE: a 53rd entry, flagged custom, with the baked turns.
    await page.evaluate(() => TrackDesigner.setName("spec loop"));
    const saved = await page.evaluate(() => TrackDesigner.save());
    expect(saved.ok).toBe(true);
    expect(saved.id).toMatch(/^custom-[0-9a-f]{8}$/);
    const after = await page.evaluate(() => {
      const t = Tracks.LIST[Tracks.LIST.length - 1];
      return { n: Tracks.LIST.length, id: t.id, custom: !!t.custom, name: t.name, turns: (t.turns || []).length, lengthKm: t.lengthKm, hasScenery: typeof t.scenery === "function" };
    });
    expect(after.n).toBe(before.n + 1);
    expect(after.id).toBe(saved.id);
    expect(after.custom).toBe(true);
    expect(after.name).toBe("SPEC LOOP");
    expect(after.turns).toBeGreaterThanOrEqual(3);
    expect(after.hasScenery).toBe(true);
    // The library lists it, and a second SAVE of the same geometry is an update, not a duplicate.
    expect((await page.evaluate(() => TrackDesigner.state())).library).toEqual([saved.id]);
    await page.evaluate(() => TrackDesigner.save());
    expect(await page.evaluate(() => Tracks.LIST.filter((t) => t.custom).length)).toBe(1);
  });

  test("RACE from the designer lands on the picker with the custom circuit chosen; it builds and the field drives it", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    await randomiseGreen(page, 23);
    const went = await page.evaluate(() => TrackDesigner.race("gp"));
    expect(went).toBe(true);
    await expect(page.locator("#trackdesigner")).toBeHidden();
    await expect(page.locator("#select")).toBeVisible();
    expect(await page.evaluate(() => window.__apex.info().state)).toBe("menu");
    const picked = await page.evaluate(() => {
      const row = document.querySelector('.track-row[aria-pressed="true"]');
      return row ? { kind: row.dataset.kind, idx: +row.dataset.trackIdx, id: Tracks.LIST[+row.dataset.trackIdx].id } : null;
    });
    expect(picked).not.toBeNull();
    expect(picked.kind).toBe("custom");
    expect(picked.id).toMatch(/^custom-/);

    // The engine builds it like any shipped circuit, and the AI drives it.
    await page.evaluate((id) => window.__apex.race(id), picked.id);
    await page.waitForFunction((id) => window.__apex.info().track === id, picked.id, { polling: 100, timeout: TRACK_MS });
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.total).toBeGreaterThanOrEqual(2500);
    expect(info.turns).toBeGreaterThanOrEqual(3);
    await page.evaluate(() => window.__apex.go());
    const before = await page.evaluate(() => window.__apex.carState().map((c) => c.prog));
    expect(before.length).toBeGreaterThan(1);
    // Most of the field has moved down the road once the lights are out.
    await page.waitForFunction((prev) => {
      const now = window.__apex.carState().map((c) => c.prog);
      let n = 0; for (let i = 0; i < now.length; i++) if (now[i] !== prev[i]) n++;
      return n > now.length / 2;
    }, before, { polling: 100, timeout: 15_000 });
  });

  test("a saved circuit survives a reload: the registry re-appends it and the stored id resolves", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    await randomiseGreen(page, 101);
    const saved = await page.evaluate(() => TrackDesigner.save());
    expect(saved.ok).toBe(true);
    await page.evaluate((id) => { CustomTracks.select(id); }, saved.id);
    await page.reload();
    await page.waitForFunction(() => window.__apex != null && typeof CustomTracks !== "undefined", null, { polling: 100, timeout: BOOT_MS });
    const after = await page.evaluate((id) => ({
      listed: Tracks.LIST.some((t) => t.id === id && t.custom),
      customs: Tracks.LIST.filter((t) => t.custom).length,
      library: CustomTracks.list().map((i) => i.id),
      stored: JSON.parse(localStorage.getItem("apex26.trackId")),
    }), saved.id);
    expect(after.listed).toBe(true);
    expect(after.customs).toBe(1);
    expect(after.library).toEqual([saved.id]);
    expect(after.stored).toBe(saved.id);
    // The picker opens on it.
    await page.evaluate(() => window.__apex.headless(true));
    await page.locator("#mb-race").click();
    await expect(page.locator('.track-row[aria-pressed="true"]')).toHaveAttribute("data-kind", "custom");
  });

  test("a share link boots straight into the designer with the design, strips its fragment, and the picker's EDIT chip reopens a saved circuit", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    const st = await randomiseGreen(page, 42);
    const url = await page.evaluate(async () => { const code = await TrackDesigner.shareCode(); return TrackCodec.shareUrl(code); });
    expect(url).toMatch(/#track=APXT1\./);
    // The link, cold: a fresh navigation carrying only the fragment.
    await page.goto(url);
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.waitForFunction(() => typeof TrackDesigner !== "undefined" && TrackDesigner.isOpen(), null, { polling: 100, timeout: BOOT_MS });
    await page.waitForFunction(() => !TrackDesigner.state().pending, null, { polling: 100, timeout: 15_000 });
    const opened = await page.evaluate(() => ({ hash: location.hash, pts: TrackDesigner.state().design.pts, ok: TrackDesigner.state().ok }));
    expect(opened.hash).toBe("");
    expect(opened.pts).toEqual(st.design.pts);
    expect(opened.ok).toBe(true);
    // An exported file loads back through the same door.
    const roundTrip = await page.evaluate(async () => {
      const env = await TrackDesigner.exportEnvelope();
      TrackDesigner.randomise(3);
      const ok = await TrackDesigner.loadFrom(JSON.stringify(env));
      return { ok, pts: TrackDesigner.state().design.pts, format: env.format };
    });
    expect(roundTrip.format).toBe("apex26.track");
    expect(roundTrip.ok).toBe(true);
    expect(roundTrip.pts).toEqual(st.design.pts);
    // SAVE it, close, and come back in from the picker's EDIT IN DESIGNER chip.
    const saved = await page.evaluate(() => TrackDesigner.save());
    expect(saved.ok).toBe(true);
    await page.evaluate(() => { TrackDesigner.close(); CustomTracks.select(TrackDesigner.state().library[0]); });
    await page.evaluate(() => window.__apex.headless(true));
    await page.locator("#mb-race").click();
    await expect(page.locator('.track-row[aria-pressed="true"]')).toHaveAttribute("data-kind", "custom");
    // A script click, as menu-baseline does: at compact density the facts row
    // is display:none by design, and headless(true) stops the frames
    // Playwright's actionability wait needs; the chip's wiring is the subject.
    const chip = await page.evaluate(() => {
      const b = [...document.querySelectorAll("#sel-preview-facts button")].find((x) => /EDIT IN DESIGNER/.test(x.textContent || ""));
      if (!b) return null;
      b.click();
      return b.getAttribute("aria-label");
    });
    expect(chip).toMatch(/^Edit .* in the track designer$/);
    await page.waitForFunction(() => TrackDesigner.isOpen(), null, { polling: 100, timeout: 15_000 });
    expect(await page.evaluate(() => TrackDesigner.state().design.pts)).toEqual(st.design.pts);
  });

  test("a freehand stroke becomes a closed loop and DELETE respects the point floor", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    // A rounded rectangle, 1.2 km × 0.7 km, as a pen would draw it (world metres).
    const drawn = await page.evaluate(() => {
      const path = [];
      const W = 600, H = 350, n = 160;
      for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; path.push([Math.sign(Math.cos(t)) * Math.min(W, Math.abs(Math.cos(t)) * W * 1.4), Math.sign(Math.sin(t)) * Math.min(H, Math.abs(Math.sin(t)) * H * 1.4)]); }
      const ok = TrackDesigner.freehand(path);
      return { ok, n: TrackDesigner.state().design.pts.length };
    });
    expect(drawn.ok).toBe(true);
    expect(drawn.n).toBeGreaterThanOrEqual(8);
    await page.waitForFunction(() => !TrackDesigner.state().pending, null, { polling: 100, timeout: 15_000 });
    const st = await page.evaluate(() => TrackDesigner.state());
    expect(st.lengthM).toBeGreaterThan(1500);
    // The loop is closed: the engine built a centreline from it (a verdict exists), and index 0 is the start.
    expect(st.stats).not.toBeNull();
    // Deleting below the floor is refused.
    const floor = await page.evaluate(() => {
      const d = TrackDesigner;
      let n = d.state().design.pts.length;
      while (n > 8 && d.deletePoint(n - 1)) n = d.state().design.pts.length;
      return { n, refused: !d.deletePoint(0) };
    });
    expect(floor.n).toBe(8);
    expect(floor.refused).toBe(true);
  });

  test("FIX ALL turns a deliberately short loop green and SAVE enables", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    await randomiseGreen(page, 7);
    // A 1.6 km ellipse on the 0.25 m lattice: red on the lap length and on the
    // straights around the start line — every red one TrackFixes can repair.
    await page.evaluate(() => {
      const pts = [];
      for (let i = 0; i < 36; i++) { const t = i / 36 * Math.PI * 2; pts.push([Math.round(300 * Math.cos(t) * 4) / 4, Math.round(200 * Math.sin(t) * 4) / 4]); }
      TrackDesigner.load(Object.assign({}, TrackDesigner.state().design, { pts }));
    });
    await page.waitForFunction(() => !TrackDesigner.state().pending, null, { polling: 100, timeout: 15_000 });
    const red = await page.evaluate(() => TrackDesigner.state());
    expect(red.ok).toBe(false);
    expect(red.issues).toContain("length:red");
    const save = page.locator("#trackdesigner .td-foot button", { hasText: /^SAVE$/ });
    await expect(save).toBeDisabled();
    const fixAll = page.locator("#trackdesigner button", { hasText: /^FIX ALL$/ });
    await expect(fixAll).toBeVisible();
    await fixAll.click();
    await page.waitForFunction(() => { const s = TrackDesigner.state(); return !s.pending && s.ok; }, null, { polling: 100, timeout: 15_000 });
    const green = await page.evaluate(() => TrackDesigner.state());
    expect(green.red).toBe(0);
    expect(green.lengthM).toBeGreaterThanOrEqual(2500);
    expect(green.undo, "FIX ALL is one UNDO entry").toBe(red.undo + 1);
    await expect(save).toBeEnabled();
    await expect(fixAll).toBeHidden();
    await expect(page.locator("#trackdesigner .td-msg")).toContainText("UNDO to revert");
    expect((await page.evaluate(() => TrackDesigner.save())).ok).toBe(true);
  });
});
