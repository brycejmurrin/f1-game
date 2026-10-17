// @ts-check
// TRACK DESIGNER: the title door loads the LAZY_EDITOR bundle (TrackDesigner,
// DesignerCanvas and the pure core) into the shell's #trackdesigner dialog; a
// randomised design passes the WYSIWYG validator, SAVE appends it to
// Tracks.LIST as a custom entry, RACE hands it to the ordinary picker flow,
// __apex.race() builds and drives it, and a reload resolves the stored id.
import { test, expect, BOOT_MS, RACE_BUILD_MS, awaitTrackBuild, clickLive } from "../helpers/fixtures.js";

/** __apex.race(id) on a loaded CI runner — stall-aware build wait, not TRACK_MS. */
async function raceAndBuild(page, id) {
  // Reload restores live rendering. These checks inspect registry/build state,
  // so keep expensive software frames paused while the browser reads it.
  await page.evaluate(() => window.__apex.headless(true));
  await page.evaluate((tid) => window.__apex.race(tid), id);
  await awaitTrackBuild(page);
  await expect.poll(() => page.evaluate(() => window.__apex.info().track), { timeout: 15_000 }).toBe(id);
}

const LANDSCAPE = { width: 1180, height: 720 };

test.describe("Touch designer workspace", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("short and scaled phones keep both views and every workspace reachable", async ({ page }, testInfo) => {
    await bootClean(page); await openDesigner(page); await randomiseGreen(page, 7);
    await page.evaluate(() => TrackDesigner.save());
    const root = page.locator("#trackdesigner");
    const cells = [[734, 343, 200], [393, 659, 100], [734, 343, 100], [852, 344, 100],
      [393, 659, 150], [734, 343, 150], [852, 344, 150], [844, 390, 150],
      [393, 659, 200], [852, 344, 200], [844, 390, 200], [1194, 834, 200], [390, 844, 100], [844, 390, 100]];
    for (const [width, height, scale] of cells) {
      await page.setViewportSize({ width, height });
      await page.evaluate(({ width, height, scale }) => {
        const d = document.documentElement.style, portrait = height > width, side = width === 844 ? 47 : 59;
        const insets = width > 1000 ? { t: 0, r: 0, b: 0, l: 0 } : portrait ? { t: 59, r: 0, b: 34, l: 0 } : { t: 0, r: side, b: 21, l: side };
        for (const [key, value] of Object.entries(insets)) d.setProperty("--sa" + key, value + "px");
        window.__apex.uiScale(scale);
      }, { width, height, scale });
      await root.getByRole("tab", { name: "DESIGN", exact: true }).tap();
      for (const mode of ["edit", "elevation"]) {
        await root.locator(`[data-role="mode-bar"] [data-mode="${mode}"]`).tap();
        await expect(root.locator('canvas[data-role="profile"]')).toBeVisible();
        expect(await root.evaluate((e) => Math.min(...[...e.querySelectorAll(".td-stage > canvas")]
          .flatMap((c) => { const r = c.getBoundingClientRect(); return [r.width, r.height]; }))), `${width}x${height}@${scale}: both drawing surfaces retain usable dimensions`).toBeGreaterThanOrEqual(44);
        await expect.poll(() => root.evaluate((e) => {
          const stage = e.querySelector(".td-stage").getBoundingClientRect();
          const profile = e.querySelector('canvas[data-role="profile"]').getBoundingClientRect();
          const map = e.querySelector('.td-stage > canvas:not([data-role="profile"])').getBoundingClientRect();
          return Math.max(profile.bottom - stage.bottom, map.bottom - profile.top);
        }), { message: `${width}x${height}@${scale} ${mode}: profile must fit its stage` }).toBeLessThanOrEqual(1);
      }
      await root.locator('[data-role="mode-bar"] [data-mode="scenery"]').tap();
      for (const section of ["themes", "atmosphere", "objects"]) {
        await root.locator(`[data-scenery-section="${section}"]`).tap({ timeout: 10_000 });
        await expect(root.locator(`#td-scenery-panel-${section}`)).toBeVisible();
      }
      for (const name of ["MY CIRCUITS", "HOW TO", "DESIGN"]) await root.getByRole("tab", { name, exact: true }).tap();
      await root.locator('[data-role="file-menu"] > summary').tap();
      for (const name of ["SHARE", "Share a picture card of this circuit", "EXPORT", "IMPORT"]) await root.getByRole("button", { name, exact: true }).click({ trial: true });
      await page.keyboard.press("Escape");
      expect(await root.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), `${width}x${height}@${scale}: no horizontal escape`).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`responsive-${width}x${height}-${scale}.jpg`) });
    }
  });
  test("touch scrolling keeps the map, profile and scenery sections reachable", async ({ page }) => {
    await bootClean(page); await openDesigner(page); await randomiseGreen(page, 7);
    const root = page.locator("#trackdesigner");
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await root.locator('[data-role="mode-bar"] [data-mode="edit"]').tap();
      const stage = await root.locator('.td-stage').boundingBox();
      const profile = await root.locator('canvas[data-role="profile"]').boundingBox();
      const layout = await root.evaluate((e) => ({ viewport: [innerWidth, innerHeight], zoom: getComputedStyle(e).zoom,
        regions: [...e.querySelectorAll('.sheet-head,.td-body,.td-stage,.td-rail,.td-foot')].map((r) => ({ role: r.className, height: getComputedStyle(r).height, rows: getComputedStyle(r).gridTemplateRows })),
        rows: [...e.querySelector('.td-stage').children].map((r) => ({ role: r.dataset.role, height: getComputedStyle(r).height, min: getComputedStyle(r).minHeight, display: getComputedStyle(r).display })) }));
      expect(profile.y + profile.height, JSON.stringify(layout)).toBeLessThanOrEqual(stage.y + stage.height + 1);
      await root.locator('[data-role="mode-bar"] [data-mode="scenery"]').tap();
      for (const id of ["themes", "atmosphere", "objects"]) {
        await root.locator(`[data-scenery-section="${id}"]`).tap();
        await expect(root.locator(`#td-scenery-panel-${id}`)).toBeVisible();
        await root.locator('.td-rail').evaluate((e) => { e.scrollTop = e.scrollHeight; });
      }
      expect(await root.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    }
  });
});

test("workspace organization preserves controls and scroll across modes and library", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await bootClean(page); await openDesigner(page); await randomiseGreen(page, 7);
  for (const viewport of [{ ...LANDSCAPE, scale: 1 }, { width: 390, height: 844, scale: 1 }, { width: 734, height: 343, scale: 1 }, { ...LANDSCAPE, scale: 1.5 }, { width: 1280, height: 800, scale: 2 }, { width: 1920, height: 937, scale: 2 }, { width: 1920, height: 1080, scale: 2 }]) {
    await page.setViewportSize(viewport);
    const root = page.locator("#trackdesigner"), rail = root.locator(".td-rail");
    await root.evaluate((e, scale) => e.style.setProperty("--ui-scale", String(scale)), viewport.scale || 1);
    for (const id of ["draw", "edit", "elevation", "scenery", "test"]) {
      await root.locator(`[data-role="mode-bar"] [data-mode="${id}"]`).click();
      await expect(root).toHaveAttribute("data-mode", id);
      await rail.evaluate((e) => { e.scrollTop = 0; });
      await expect(root.locator('[data-role="checks-summary"]')).toBeVisible();
      expect(await root.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      if (id === "edit" || id === "elevation") {
        await page.screenshot({ path: testInfo.outputPath(`workspace-${viewport.width}-${viewport.height}-${viewport.scale || 1}-${id}.jpg`) });
        const toolbar = root.locator('[data-role="toolbar"]'), map = root.locator('.td-stage > canvas:not([data-role="profile"])');
        const t = await toolbar.boundingBox(), m = await map.boundingBox();
        expect(t.y + t.height <= m.y + 1 || t.x >= m.x + m.width - 1).toBe(true);
        const bounds = await root.locator('.td-stage').evaluate((e) => ({ stage: e.getBoundingClientRect().bottom,
          profile: e.querySelector('canvas[data-role="profile"]').getBoundingClientRect().bottom }));
        const layout = await root.locator('.td-stage').evaluate((e) => ({
          width: getComputedStyle(e).width, height: getComputedStyle(e).height,
          container: getComputedStyle(e).containerName,
          rows: [...e.children].map((c) => ({ tag: c.tagName, role: c.dataset.role,
            display: getComputedStyle(c).display, height: getComputedStyle(c).height,
            flex: getComputedStyle(c).flex, minHeight: getComputedStyle(c).minHeight,
            buttons: [...c.querySelectorAll('button')].map((b) => getComputedStyle(b).flex) })),
        }));
        expect(bounds.profile, JSON.stringify(layout)).toBeLessThanOrEqual(bounds.stage + 1);
      }
      if (id === "scenery") {
        for (const section of ["themes", "atmosphere", "objects"]) {
          await root.locator(`[data-scenery-section="${section}"]`).click();
          await expect(root.locator(`#td-scenery-panel-${section}`)).toBeVisible();
          if (section === "atmosphere") {
            await root.getByRole("button", { name: "GOLDEN HOUR", exact: true }).click();
            await expect(root.locator('[data-role="look-summary"]')).toContainText("DUSK");
            await root.getByRole("button", { name: "Reset time of day, trees and crowd to theme defaults", exact: true }).click();
            await expect(root.locator('[data-role="look-summary"]')).toContainText("AUTO");
          }
          await rail.evaluate((e) => { e.scrollTop = e.scrollHeight; });
          expect(await rail.evaluate((e) => e.scrollTop + e.clientHeight >= e.scrollHeight - 1)).toBe(true);
        }
        await expect(root.locator('[data-role="look-summary"]')).not.toContainText("undefined");
      }
      await rail.evaluate((e) => { e.scrollTop = e.scrollHeight; });
    }
    await page.getByRole("textbox", { name: "Circuit name", exact: true }).fill("ABCDEFGHIJKLMNOPQRSTUVWX");
    await page.getByRole("button", { name: "SAVE", exact: true }).click();
    if (viewport.width > 760) {
      await root.getByRole("button", { name: "Help with test", exact: true }).click();
      await expect(root.locator('[data-help-task="test"]')).toHaveJSProperty("open", true);
      await root.getByRole("button", { name: "OPEN TEST", exact: true }).click();
      await expect(root).toHaveAttribute("data-mode", "test");
    }
    await root.getByRole("tab", { name: "MY CIRCUITS", exact: true }).click();
    await expect(root.locator(".td-stage")).toBeHidden();
    await expect(root.locator(".td-card > strong").first()).toHaveText("ABCDEFGHIJKLMNOPQRSTUVWX");
    await page.screenshot({ path: testInfo.outputPath(`workspace-${viewport.width}-${viewport.scale || 1}-library.jpg`) });
    await root.getByRole("tab", { name: "HOW TO", exact: true }).click();
    await rail.evaluate((e) => { e.scrollTop = e.scrollHeight; });
    const helpScroll = await rail.evaluate((e) => e.scrollTop);
    expect(helpScroll, "the long help page must have a real scrollport").toBeGreaterThan(0);
    // Click the pinned tabs as a user does, without scrollIntoView moving the
    // rail before the click (which would replace the position being saved).
    for (const name of ["DESIGN", "HOW TO"]) {
      const box = await root.getByRole("tab", { name, exact: true }).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await expect.poll(() => rail.evaluate((e) => e.scrollTop)).toBe(helpScroll);
    await root.locator('[data-role="file-menu"] > summary').click();
    await expect(root.getByRole("button", { name: "EXPORT", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(root).toBeVisible();
    await expect(root.getByRole("button", { name: "EXPORT", exact: true })).toBeHidden();
    await root.locator('[data-role="file-menu"] > summary').click();
    await root.dispatchEvent("cancel", { bubbles: true, cancelable: true });
    await expect(root).toBeVisible();
    await expect(root.getByRole("button", { name: "EXPORT", exact: true })).toBeHidden();
    await root.locator('[data-role="checks-summary"]').click();
    await expect(root).toHaveAttribute("data-pane", "design");
    await expect(root).toHaveAttribute("data-mode", "test");
    await root.getByRole("tab", { name: "MY CIRCUITS", exact: true }).click();
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("clipboard blocked for regression test"); } } });
      document.execCommand = () => false;
    });
    await root.locator('[data-role="file-menu"] > summary').click();
    await root.getByRole("button", { name: "SHARE", exact: true }).click();
    const copy = root.getByRole("textbox", { name: "Share code or link", exact: true });
    await expect(root).toHaveAttribute("data-pane", "design");
    await expect(copy).toBeVisible(); await expect(copy).toBeFocused();
    await expect(copy).toHaveValue(/#track=APXT1/);
  }
  expect(errors).toEqual([]);
});

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
  await page.waitForFunction(() => window.__apex != null && typeof CustomTracks !== "undefined", null, { polling: 100, timeout: RACE_BUILD_MS });
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

  for (const viewport of [LANDSCAPE, { width: 390, height: 844 }]) {
    test(`draft recovery and saved identity survive reload at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await bootClean(page); await openDesigner(page); await randomiseGreen(page, 7);
      await page.getByRole("button", { name: "SAVE", exact: true }).click();
      await page.evaluate(() => TrackDesigner.setTheme("alpine"));
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("apex26.customTrackDraft") || "null")?.theme)).toBe("alpine");
      await page.getByRole("button", { name: "SAVE", exact: true }).click();
      const savedId = await page.evaluate(() => TrackDesigner.state().design.originId);
      await page.reload();
      await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => window.__apex.headless(true));
      await openDesigner(page);
      expect(await page.evaluate(() => TrackDesigner.state().design.originId)).toBe(savedId);
      await page.evaluate(() => { TrackDesigner.setTheme("oasis"); TrackDesigner.preview(); });
      await page.getByRole("button", { name: "SAVE", exact: true }).click();
      expect(await page.evaluate(() => CustomTracks.list().length)).toBe(1);
      await page.evaluate(() => {
        TrackDesigner.setName("Recover Me"); TrackDesigner.setTheme("alpine");
        const other = CustomTracks.list()[0]; TrackDesigner.load(other, "library", other.id);
        TrackDesigner.close();
      });
      await page.reload();
      await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => window.__apex.headless(true));
      await openDesigner(page);
      await page.getByRole("tab", { name: "MY CIRCUITS", exact: true }).click();
      await page.getByRole("button", { name: "RECOVER PREVIOUS DRAFT", exact: true }).click();
      expect(await page.evaluate(() => TrackDesigner.state().design.name)).toBe("RECOVER ME");
      expect(await page.evaluate(() => TrackDesigner.state().design.theme)).toBe("alpine");
      await expect(page.getByRole("tab", { name: "DESIGN", exact: true })).toHaveAttribute("aria-selected", "true");
      await page.screenshot({ path: test.info().outputPath("recovered-draft.png") });
    });
  }

  test("library collection file imports atomically and preserves the open draft", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    await randomiseGreen(page, 23);
    expect((await page.evaluate(() => TrackDesigner.save())).ok).toBe(true);
    const collection = await page.evaluate(() => CustomTracks.exportCollection());
    await page.evaluate(() => { for (const it of CustomTracks.list()) CustomTracks.remove(it.id); TrackDesigner.showPane("library"); });
    const draft = await page.evaluate(() => TrackDesigner.state().design);
    const file = page.locator('input[aria-label="Import a circuit library file"]');
    // The file opens a REVIEW first; nothing is written until its IMPORT is pressed.
    const apply = page.locator('#trackdesigner [data-role="library-import-apply"]');
    await file.setInputFiles({ name: "circuits.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(collection)) });
    await expect(apply).toBeEnabled();
    expect(await page.evaluate(() => CustomTracks.list().length), "the review makes no write").toBe(0);
    await apply.click();
    await page.waitForFunction(() => CustomTracks.list().length === 1, null, { polling: 100, timeout: 5000 });
    expect(await page.evaluate(() => TrackDesigner.state().design)).toEqual(draft);
    await file.setInputFiles({ name: "duplicates.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(collection)) });
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(page.locator("#trackdesigner")).toContainText("1 duplicates kept unchanged");
    expect(await page.evaluate(() => CustomTracks.list().length)).toBe(1);
    await expect(page.getByRole("button", { name: "EXPORT ALL", exact: true })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "EXPORT ALL", exact: true }).click();
    expect((await download).suggestedFilename()).toBe("apex26-circuits.apextracks.json");
  });

  test("the title door opens the designer; a randomised design validates green and saves into MY CIRCUITS", async ({ page }) => {
    await bootClean(page);
    const before = await page.evaluate(() => ({ n: Tracks.LIST.length, custom: Tracks.LIST.filter((t) => t.custom).length }));
    expect(before.custom).toBe(0);
    await openDesigner(page);
    // The dialog is named and modal: a <dialog> with the shell's heading as its label.
    await expect(page.locator("#trackdesigner")).toHaveAttribute("aria-labelledby", "td-title");
    await expect(page.locator("#trackdesigner .td-tabs")).toHaveAttribute("aria-label", "Track Designer workspace");
    await expect(page.locator("#trackdesigner .td-tab").first()).toHaveAttribute("aria-controls", "td-pane-design");
    await expect(page.locator("#trackdesigner .td-pane[data-pane=design]")).toHaveAttribute("aria-labelledby", "td-tab-design");
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
    await raceAndBuild(page, picked.id);
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

  test("a new theme with a scenery option: WINTER SNOW · NIGHT · PACKED saves, lists as a night circuit and builds", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    await randomiseGreen(page, 11);
    // Theme / LOOK chips live in SCENERY mode (MODE tabs, slice B).
    await page.evaluate(() => TrackDesigner.setMode("scenery"));
    await page.locator('#trackdesigner [data-theme="winter"]').click();
    await page.getByRole("tab", { name: "ATMOSPHERE", exact: true }).click();
    await page.locator('#trackdesigner [data-look="time:night"]').click();
    await page.locator('#trackdesigner [data-look="crowd:packed"]').click();
    await expect(page.locator('#trackdesigner [data-look="time:night"]')).toHaveAttribute("aria-pressed", "true");
    await page.waitForFunction(() => { const s = TrackDesigner.state(); return !s.pending && s.ok; }, null, { polling: 100, timeout: 15_000 });
    const st = await page.evaluate(() => TrackDesigner.state().design);
    expect(st.theme).toBe("winter");
    expect(st.look).toEqual({ time: "night", trees: "normal", crowd: "packed" });
    const saved = await page.evaluate(() => TrackDesigner.save());
    expect(saved && saved.ok).toBe(true);
    const def = await page.evaluate((id) => { const t = Tracks.LIST.find((x) => x.id === id); return t ? { night: t.night, terrainMat: t.terrainMat } : null; }, saved.id);
    expect(def).toEqual({ night: true, terrainMat: "SNOW" });
    await page.evaluate(() => TrackDesigner.close());
    await raceAndBuild(page, saved.id);
    expect((await page.evaluate(() => window.__apex.info())).total).toBeGreaterThanOrEqual(2500);
  });

  test("scenery props palette: place / remove / save / reload keeps authored props", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    await randomiseGreen(page, 19);
    await page.locator('#trackdesigner [data-mode="scenery"]').click();
    const map = page.locator('#trackdesigner .td-stage > canvas').first();
    await expect(map).toHaveAttribute("data-map-view", "scenery");
    const history = await page.evaluate(() => TrackDesigner.state().undo);
    await page.getByRole("button", { name: "OUTLINE", exact: true }).click();
    await expect(map).toHaveAttribute("data-map-view", "outline");
    await page.getByRole("tab", { name: "HOW TO", exact: true }).click();
    await expect(page.locator('[data-help-task="selection"]')).toHaveAttribute("open", "");
    await page.locator('[data-help-task="scenery"] summary').click();
    await page.getByRole("button", { name: "OPEN SCENERY", exact: true }).click();
    await expect(map).toHaveAttribute("data-map-view", "scenery");
    expect(await page.evaluate(() => TrackDesigner.state().undo)).toBe(history);

    await page.locator('#trackdesigner [data-category="nature"]').click();
    await page.getByRole("searchbox", { name: "Find a scenery theme" }).fill("pine walls");
    await expect(page.locator('#trackdesigner [data-theme]:visible')).toHaveCount(1);
    await page.locator('#trackdesigner [data-theme="alpine"]').click();
    await expect(page.locator('#trackdesigner [data-role="theme-blurb"]')).toContainText("Dark pine walls");
    await page.getByRole("searchbox", { name: "Find a scenery theme" }).fill("no matching scenery");
    await expect(page.locator('#trackdesigner [data-role="theme-results"]')).toContainText("No themes found");
    await page.getByRole("button", { name: "Clear theme search and filters" }).click();
    await expect(page.locator('#trackdesigner [data-theme]:not([hidden])')).toHaveCount(30);
    await page.locator('#trackdesigner [data-theme="blossom"]').click();
    const u0 = await page.evaluate(() => TrackDesigner.state().undo);
    await page.getByRole("tab", { name: "ATMOSPHERE", exact: true }).click();
    await page.locator('#trackdesigner [data-preset="golden"]').click();
    expect(await page.evaluate(() => TrackDesigner.state().undo)).toBe(u0 + 1);
    await page.getByRole("button", { name: "UNDO", exact: true }).click();
    expect(await page.evaluate(() => TrackDesigner.state().design.look)).toBeUndefined();
    await page.locator('#trackdesigner [data-preset="race"]').click();
    await page.getByRole("tab", { name: /^OBJECTS/ }).click();
    await page.locator('[data-object-category="nature"]').click();
    await expect(page.locator('[data-prop="marshal"]')).toBeHidden();
    await page.locator('#trackdesigner [data-prop="pines"]').click();
    await page.locator('#trackdesigner [data-placement-mode="range"]').click();
    for (const [name, value] of [["Scenery start point number", "3"], ["Scenery end point number", "10"], ["Scenery positions along section", "2"]]) {
      const input = page.getByRole("spinbutton", { name, exact: true }); await input.fill(value); await input.press("Enter");
    }
    const roadsideGap = page.getByRole("spinbutton", { name: "Roadside gap in metres", exact: true });
    await roadsideGap.fill("32"); await roadsideGap.press("Enter");
    await page.getByRole("button", { name: "Swap scenery section start and end", exact: true }).click();
    expect(await page.evaluate(() => [TrackDesigner.state().sel, TrackDesigner.state().span])).toEqual([9, 2]);
    await page.locator('#trackdesigner [data-side="0"]').click();
    const batchUndo = await page.evaluate(() => TrackDesigner.state().undo);
    await page.getByRole("button", { name: "Place objects along the selected section", exact: true }).click();
    expect(await page.evaluate(() => TrackDesigner.state().design.props.map((p) => p.side))).toEqual([-1, 1, -1, 1]);
    expect(await page.evaluate(() => TrackDesigner.state().undo)).toBe(batchUndo + 1);
    await page.getByRole("button", { name: "Edit placed pines 1", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Placed object roadside gap in metres", exact: true }).fill("24");
    await page.locator('[data-role="prop-editor"]').getByRole("button", { name: "APPLY", exact: true }).click();
    expect(await page.evaluate(() => TrackDesigner.state().design.props[0].gap)).toBe(24);
    await page.getByRole("button", { name: "UNDO", exact: true }).click();
    await page.getByRole("button", { name: "UNDO", exact: true }).click();
    expect(await page.evaluate(() => TrackDesigner.state().design.props)).toBeUndefined();
    await page.locator('[data-object-category="venue"]').click();
    await expect(page.locator('[data-prop="pines"]')).toBeHidden();
    await expect(page.locator('[data-prop="camera"]')).toBeVisible();
    await page.locator('#trackdesigner [data-placement-mode="point"]').click();
    await page.locator('#trackdesigner [data-prop="stand"]').click();
    await page.locator('#trackdesigner [data-side="-1"]').click();
    await page.getByRole("button", { name: "ROADSIDE GAP m up", exact: true }).click();
    await page.evaluate(() => {
      TrackDesigner.setMode("scenery");
      TrackDesigner.setPropKind("stand");
      TrackDesigner.cyclePoint(1);
      TrackDesigner.placeProp();
      TrackDesigner.setPropKind("gantry");
      TrackDesigner.placeProp();
      TrackDesigner.setPropKind("billboard");
      TrackDesigner.placeProp();
    });
    await expect(page.locator('#trackdesigner [data-prop="stand"]')).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('#trackdesigner [data-role="props"]')).toBeVisible();
    const before = await page.evaluate(() => {
      const d = TrackDesigner.state().design;
      return { n: (d.props || []).length, kinds: (d.props || []).map((p) => p.kind).join(",") };
    });
    expect(before.n).toBe(3);
    expect(before.kinds).toBe("stand,gantry,billboard");
    expect(await page.evaluate(() => TrackDesigner.state().design.props[0])).toMatchObject({ side: -1, gap: 20 });
    await page.getByRole("button", { name: "Remove placed board 3", exact: true }).click();
    const mid = await page.evaluate(() => (TrackDesigner.state().design.props || []).map((p) => p.kind).join(","));
    expect(mid).toBe("stand,gantry");
    const saved = await page.evaluate(() => TrackDesigner.save());
    expect(saved && saved.ok).toBe(true);
    await page.evaluate(() => TrackDesigner.close());
    // Reload: CustomTracks syncs props into the def scenery closure.
    await page.reload();
    await page.waitForFunction(() => window.__apex != null && typeof CustomTracks !== "undefined", null, { polling: 100, timeout: RACE_BUILD_MS });
    const stored = await page.evaluate((id) => {
      const it = CustomTracks.get(id);
      const t = Tracks.LIST.find((x) => x.id === id);
      return {
        props: it && it.props ? it.props.map((p) => p.kind).join(",") : "",
        hasScenery: !!(t && typeof t.scenery === "function"),
        side: it && it.props && it.props[0].side,
        gap: it && it.props && it.props[0].gap,
        look: it && it.look,
      };
    }, saved.id);
    expect(stored.props).toBe("stand,gantry");
    expect(stored.hasScenery).toBe(true);
    expect(stored.side).toBe(-1);
    expect(stored.gap).toBe(20);
    expect(stored.look).toEqual({ time: "night", trees: "normal", crowd: "packed" });
    await raceAndBuild(page, saved.id);
    expect((await page.evaluate(() => window.__apex.info())).total).toBeGreaterThanOrEqual(2500);
  });

  test("a saved circuit survives a reload: the registry re-appends it and the stored id resolves", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    await randomiseGreen(page, 101);
    const saved = await page.evaluate(() => TrackDesigner.save());
    expect(saved.ok).toBe(true);
    await page.evaluate((id) => { CustomTracks.select(id); }, saved.id);
    await page.reload();
    await page.waitForFunction(() => window.__apex != null && typeof CustomTracks !== "undefined", null, { polling: 100, timeout: RACE_BUILD_MS });
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: RACE_BUILD_MS });
    await page.waitForFunction(() => typeof TrackDesigner !== "undefined" && TrackDesigner.isOpen(), null, { polling: 100, timeout: RACE_BUILD_MS });
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
    // SAVE it, close, and come back in from the picker's EDIT chip.
    const saved = await page.evaluate(() => TrackDesigner.save());
    expect(saved.ok).toBe(true);
    await page.evaluate(() => { TrackDesigner.close(); CustomTracks.select(TrackDesigner.state().library[0]); });
    await page.evaluate(() => window.__apex.headless(true));
    await page.locator("#mb-race").click();
    await expect(page.locator('.track-row[aria-pressed="true"]')).toHaveAttribute("data-kind", "custom");
    // A script click, as menu-baseline does: headless(true) stops the frames
    // Playwright's actionability wait needs; the chip's wiring is the subject.
    const chip = await page.evaluate(() => {
      const b = document.getElementById("sel-edit-chip");
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

  test("TURNS row selects a span and REPLACE re-stamps it green", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    const st = await randomiseGreen(page, 7);
    expect(st.corners.length).toBeGreaterThanOrEqual(3);
    await page.locator('#trackdesigner details[data-role="inspector-section"] > summary', { hasText: /^TURNS$/ }).click();
    // Address the corners by name; scenery and validation have their own lists.
    const rows = page.getByRole("list", { name: "Corners, in driving order", exact: true }).locator(".td-issue");
    await expect(rows).toHaveCount(st.corners.length);
    await expect(rows.nth(1)).toHaveAttribute("data-level", "info");
    await expect(rows.nth(1)).toHaveText(/^T2 · (LEFT|RIGHT) \d+° · R \d+ m · \d+ km\/h · \d+ m$/);
    const c = st.corners[1];
    await rows.nth(1).click();
    const picked = await page.evaluate(() => TrackDesigner.state());
    expect([picked.sel, picked.span, picked.tool]).toEqual([c.i0, c.i1, c.fit.kind]);
    expect(picked.design.pts).toEqual(st.design.pts);
    const replace = page.locator("#trackdesigner button", { hasText: /^REPLACE THE SELECTED SPAN$/ });
    await expect(replace).toBeVisible();
    await replace.click();
    await page.waitForFunction(() => { const s = TrackDesigner.state(); return !s.pending && s.ok; }, null, { polling: 100, timeout: 15_000 });
    const after = await page.evaluate(() => TrackDesigner.state());
    expect(after.red).toBe(0);
    expect(after.undo, "REPLACE is one UNDO entry").toBe(picked.undo + 1);
    expect(after.design.pts).not.toEqual(st.design.pts);
    expect(after.design.pts.slice(0, c.i0 + 1)).toEqual(st.design.pts.slice(0, c.i0 + 1));
  });

  test("HILLY preset writes node heights; the preview's py rises", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    const st = await randomiseGreen(page, 7);
    expect(st.design.elevations).toEqual([]);
    expect(st.design.heights.every((h) => h === 0)).toBe(true);
    const strip = page.locator('#trackdesigner .td-stage > canvas[data-role="profile"]');
    await expect(strip).toBeVisible();
    await expect(strip).toHaveAttribute("tabindex", "0");
    const box = await strip.boundingBox();
    expect(box && box.height).toBeGreaterThan(10);
    const flat = await page.evaluate(() => Array.from(TrackValidate.check(TrackDesigner.state().design).tr.py));
    // Per-node heights (slice C): presets write heights[] and clear legacy cosine bumps.
    await page.evaluate(() => TrackDesigner.setMode("elevation"));
    await expect(page.locator('#trackdesigner [data-mode="elevation"]')).toHaveAttribute("aria-pressed", "true");
    const heatButton = page.getByRole("button", { name: "Elevation heat map", exact: true });
    const map = page.locator('#trackdesigner .td-stage > canvas:not([data-role="profile"])');
    await expect(heatButton).toHaveAttribute("aria-pressed", "true");
    await expect(map).toHaveAttribute("data-heat-map", "elevation");
    await heatButton.click();
    await expect(map).toHaveAttribute("data-heat-map", "off");
    await heatButton.click();
    const ok = await page.evaluate(() => TrackDesigner.applyElevPreset("hilly"));
    expect(ok).toBe(true);
    await page.waitForFunction(() => {
      const s = TrackDesigner.state();
      return !s.pending && s.design.heights.some((h) => h !== 0) && s.design.elevations.length === 0;
    }, null, { polling: 100, timeout: 15_000 });
    const after = await page.evaluate(() => TrackDesigner.state());
    expect(after.undo, "one UNDO entry").toBe(st.undo + 1);
    expect(after.design.heights.length).toBe(after.design.pts.length);
    expect(Math.max(...after.design.heights)).toBeGreaterThanOrEqual(10);
    await expect(page.locator('#trackdesigner [data-elev="hilly"]')).toBeVisible();
    // Engine-built preview: peak py rises vs the flat build (Catmull-Rom on control Y).
    const peak = await page.evaluate((f) => {
      const tr = TrackValidate.check(TrackDesigner.state().design).tr;
      let maxD = 0;
      for (let i = 0; i < tr.n; i++) {
        const d = tr.py[i] - f[i % f.length];
        if (d > maxD) maxD = d;
      }
      return maxD;
    }, flat);
    expect(peak).toBeGreaterThan(8);
    // POINT m stepper appears once a control point is selected in ELEVATION.
    await page.evaluate(() => TrackDesigner.setNodeHeight(0, (TrackDesigner.state().design.heights[0] || 0) + 0.25));
    await expect(page.locator("#trackdesigner .td-row", { hasText: "POINT m" })).toBeVisible();
    // RANGE is a selection-only gesture shared by the profile and map.
    await page.getByRole("button", { name: "Clear point selection", exact: true }).click();
    await page.locator('[data-selection-mode="range"]').click();
    const baseline = await page.evaluate(() => TrackDesigner.state());
    const fracs = await page.evaluate(() => {
      const p = TrackDesigner.state().design.pts, c = [0];
      for (let i = 0; i < p.length; i++) c.push(c[i] + Math.hypot(p[(i + 1) % p.length][0] - p[i][0], p[(i + 1) % p.length][1] - p[i][1]));
      return [c[3] / c[p.length], c[10] / c[p.length]];
    });
    const pb = await strip.boundingBox(), y = pb.y + pb.height / 2;
    await page.mouse.move(pb.x + fracs[0] * pb.width, y);
    await page.mouse.down();
    await page.mouse.move(pb.x + fracs[1] * pb.width, y - 20, { steps: 8 });
    await page.mouse.up();
    const selected = await page.evaluate(() => TrackDesigner.state());
    expect([selected.sel, selected.span]).toEqual([3, 10]);
    expect(selected.design.heights).toEqual(baseline.design.heights);
    expect(selected.undo).toBe(baseline.undo);
    await expect(strip).toHaveAttribute("aria-label", /Span 4–11/);
    await page.locator('[data-selection-mode="point"]').click();
    expect((await page.evaluate(() => TrackDesigner.state())).span).toBe(10);
    const input = page.getByRole("spinbutton", { name: "Selected point height in metres" });
    await input.fill(String(baseline.design.heights[3] + 1));
    await input.press("Enter");
    const edited = await page.evaluate(() => TrackDesigner.state());
    expect(edited.undo).toBe(baseline.undo + 1);
    for (let i = 0; i < edited.design.heights.length; i++) expect(edited.design.heights[i]).toBe(baseline.design.heights[i] + (i >= 3 && i <= 10 ? 1 : 0));
    await page.getByRole("button", { name: "UNDO", exact: true }).click();
    expect(await page.evaluate(() => TrackDesigner.state().design.heights)).toEqual(baseline.design.heights);
    await page.evaluate(() => TrackDesigner.setMode("edit"));
    await page.getByRole("button", { name: "FIT VIEW", exact: true }).click();
    await page.locator('[data-selection-mode="range"]').click();
    const mapPoints = await page.evaluate(() => {
      const p = TrackDesigner.state().design.pts, r = document.querySelector('.td-stage > canvas:not([data-role="profile"])').getBoundingClientRect();
      const xs = p.map((v) => v[0]), zs = p.map((v) => v[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      const scale = Math.min(Math.round(r.width) / Math.max(60, x1 - x0), Math.round(r.height) / Math.max(60, z1 - z0)) * 0.82;
      return [2, 7].map((i) => ({ x: r.x + Math.round(r.width) / 2 + (p[i][0] - (x0 + x1) / 2) * scale, y: r.y + Math.round(r.height) / 2 + (p[i][1] - (z0 + z1) / 2) * scale }));
    });
    await page.mouse.move(mapPoints[0].x, mapPoints[0].y);
    await page.mouse.down();
    await page.mouse.move(mapPoints[1].x, mapPoints[1].y, { steps: 8 });
    await page.mouse.up();
    expect(await page.evaluate(() => { const s = TrackDesigner.state(); return [s.sel, s.span]; })).toEqual([2, 7]);
    await expect(strip).toHaveAttribute("aria-label", /Span 3–8/);
    expect(await page.evaluate(() => TrackDesigner.state().design.pts)).toEqual(baseline.design.pts);
    const quickBefore = await page.evaluate(() => TrackDesigner.state());
    const delta = page.getByRole("spinbutton", { name: "Elevation change in metres", exact: true });
    await expect(delta).toBeVisible();
    await delta.fill("2.5");
    await page.getByRole("button", { name: "Raise selected points", exact: true }).click();
    const raised = await page.evaluate(() => TrackDesigner.state());
    expect([raised.mode, raised.selectionMode, raised.sel, raised.span]).toEqual(["edit", "range", 2, 7]);
    expect(raised.undo).toBe(quickBefore.undo + 1);
    for (let i = 0; i < raised.design.heights.length; i++) expect(raised.design.heights[i]).toBe(quickBefore.design.heights[i] + (i >= 2 && i <= 7 ? 2.5 : 0));
    await page.getByRole("button", { name: "UNDO", exact: true }).click();
    expect(await page.evaluate(() => TrackDesigner.state().design.heights)).toEqual(quickBefore.design.heights);
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
    await page.locator('#trackdesigner [data-mode="test"]').click();
    await expect(fixAll).toBeVisible();
    await fixAll.click();
    // FIX ALL previews the repair beside the current verdict; only APPLY REPAIR commits it.
    const applyRepair = page.locator('#trackdesigner [data-role="repair-preview"] button', { hasText: /^APPLY REPAIR$/ });
    await expect(applyRepair).toBeVisible();
    expect((await page.evaluate(() => TrackDesigner.state())).undo, "the preview makes no edit").toBe(red.undo);
    await applyRepair.click();
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

  test("TECHNICAL shows 4 cards; USE is green", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    await randomiseGreen(page, 7);
    const pane = page.locator('#trackdesigner .td-pane[data-pane="design"]');
    await page.locator('#trackdesigner [data-mode="draw"]').click();
    const tech = pane.locator("button", { hasText: /^TECHNICAL$/ });
    // The cards are the design pane's second .td-grid (START FROM's is the first, hidden).
    const grid = pane.locator(".td-grid").nth(1);
    const t0 = Date.now();
    await tech.click();
    await expect(tech).toHaveAttribute("aria-pressed", "true");
    await page.waitForFunction(() => {
      const g = document.querySelectorAll('#trackdesigner .td-pane[data-pane="design"] .td-grid')[1];
      return !!g && !g.hasAttribute("aria-busy") && TrackDesigner.state().candidates.length === 4;
    }, null, { polling: 100, timeout: 30_000 });
    test.info().annotations.push({ type: "designed-ms", description: String(Date.now() - t0) });
    const cards = grid.locator(".td-card");
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0).locator(".td-card-meta")).toHaveText(/^\d+\.\d km · \d+ corners · \d+ passing$/);
    const before = await page.evaluate(() => TrackDesigner.state());
    await cards.nth(0).locator("button", { hasText: /^USE$/ }).click();
    await page.waitForFunction(() => { const s = TrackDesigner.state(); return !s.pending && s.ok; }, null, { polling: 100, timeout: 15_000 });
    const after = await page.evaluate(() => TrackDesigner.state());
    expect(after.red).toBe(0);
    expect(after.undo, "USE is one UNDO entry").toBe(before.undo + 1);
    expect(after.design.seed).toBe(before.candidates[0].seed);
  });

  test("TEST HERE drives from the selected point and returns", async ({ page }) => {
    await bootClean(page);
    await openDesigner(page);
    await randomiseGreen(page, 7);
    // Select point 13 (index 12) as the keyboard does: `]` steps from none to 0, 1, …
    const sel = await page.evaluate(() => {
      const c = document.querySelector("#trackdesigner .td-stage canvas");
      c.focus();
      for (let i = 0; i < 13; i++) c.dispatchEvent(new KeyboardEvent("keydown", { key: "]", bubbles: true, cancelable: true }));
      return TrackDesigner.state().sel;
    });
    expect(sel).toBe(12);
    await page.locator('#trackdesigner [data-mode="test"]').click();
    // Where the car should land: the node of the engine's own build nearest control 12.
    const want = await page.evaluate(() => {
      const st = TrackDesigner.state(), tr = TrackValidate.check(st.design).tr, p = st.design.pts[12];
      let k = 0, best = Infinity;
      for (let j = 0; j < tr.n; j++) { const d = (tr.px[j] - p[0]) ** 2 + (tr.pz[j] - p[1]) ** 2; if (d < best) { best = d; k = j; } }
      return { s: k * tr.total / tr.n, total: tr.total };
    });
    // A script click, as the picker's EDIT chip above: headless(true) stops the frames actionability waits for.
    const pressed = await page.evaluate(() => {
      const b = [...document.querySelectorAll("#trackdesigner .td-rail button")].find((x) => x.textContent === "TEST HERE");
      if (!b || b.getAttribute("aria-disabled") !== "false") return false;
      b.click();
      return true;
    });
    expect(pressed).toBe(true);
    await page.waitForFunction(() => window.__apex.info().state === "race", null, { polling: 100, timeout: RACE_BUILD_MS });
    const run = await page.evaluate(() => ({ info: window.__apex.info(), ph: window.__apex.physState(), open: TrackDesigner.isOpen(), id: TrackDesigner.state().design.originId }));
    expect(run.open).toBe(false);
    expect(run.info.timeTrial).toBe(true);
    expect(run.info.track).toBe(run.id);
    expect(run.ph).not.toBeNull();
    const ds = Math.abs(run.ph.s - want.s);
    expect(Math.min(ds, want.total - ds), `on the selected point: s ${run.ph.s} vs ${want.s}`).toBeLessThanOrEqual(20);
    // PAUSE > QUIT (CONFIRM QUIT is on by default: arm, then quit) hands the screen back.
    await clickLive(page, "pausebtn");
    await clickLive(page, "pm-quit");
    await clickLive(page, "pm-quit");
    await page.waitForFunction(() => typeof TrackDesigner !== "undefined" && TrackDesigner.isOpen(), null, { polling: 100, timeout: 15_000 });
    const back = await page.evaluate(() => ({ state: window.__apex.info().state, sel: TrackDesigner.state().sel, msg: (document.querySelector("#trackdesigner .td-msg") || {}).textContent }));
    expect(back.state).toBe("menu");
    expect(back.sel).toBe(12);
    expect(back.msg).toContain("Back from the test drive");
  });
});

test("designer workspaces author bridges, water and landscapes on desktop and phone", async ({ page }, testInfo) => {
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  await bootClean(page); await openDesigner(page); await randomiseGreen(page, 7);
  for (const [size, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    const mode = (id) => page.locator('#trackdesigner [data-mode="' + id + '"]');
    await mode("draw").click();
    await expect(page.getByRole("button", { name: "RANDOMISE", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "REVERSE", exact: true })).toBeHidden();
    await mode("edit").click();
    await expect(page.getByRole("button", { name: "RANDOMISE", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "REVERSE", exact: true })).toBeVisible();
    await mode("elevation").click();
    await page.getByRole("spinbutton", { name: "Selected point number", exact: true }).fill("11");
    await page.getByRole("spinbutton", { name: "Selected point number", exact: true }).press("Enter");
    const bridges = page.locator('#trackdesigner [data-role="bridges"]');
    await bridges.locator('[data-role="add-bridge"]').click();
    expect(await page.evaluate(() => TrackDesigner.state().design.bridges.length)).toBe(1);
    await expect(bridges.getByRole("button", { name: "Remove road bridge 1", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(size + "-bridge.png") });
    await bridges.getByRole("button", { name: "Remove road bridge 1", exact: true }).click();
    await mode("scenery").click();
    await page.locator('[data-scenery-section="objects"]').click();
    await page.locator('[data-object-category="water"]').click();
    for (const kind of ["water", "pond", "lake", "river"]) await expect(page.locator('[data-prop="' + kind + '"]')).toBeVisible();
    await expect(page.locator('[data-prop="stand"]')).toBeHidden();
    await page.locator('[data-prop="pond"]').click();
    await page.getByRole("button", { name: "Place the selected prop at the selected control point", exact: true }).click();
    expect(await page.evaluate(() => TrackDesigner.state().design.props.filter((p) => p.kind === "pond").length)).toBe(size === "desktop" ? 1 : 2);
    for (const role of ["prop-side", "prop-gap", "object-filters"]) {
      const fits = await page.locator('[data-role="' + role + '"]').evaluate((row) => {
        const outer = row.getBoundingClientRect();
        return [...row.querySelectorAll("button,input")].every((control) => {
          const r = control.getBoundingClientRect();
          return r.left >= outer.left - 1 && r.right <= outer.right + 1;
        });
      });
      expect(fits, role + " controls fit the sidebar at " + size).toBe(true);
    }
    const waterFootprints = await page.evaluate(() => {
      const d = TrackDesigner.state().design, tr = TrackValidate.build(d).tr;
      return DesignerSceneryPreview.plan(d, tr).ground.filter((p) => p.kind === "water").length;
    });
    expect(waterFootprints, "authored water reaches the map preview").toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath(size + "-water.png") });
    await page.locator('[data-object-category="terrain"]').click();
    for (const kind of ["mountain", "snowpeak", "hill", "dune", "rocks"]) await expect(page.locator('[data-prop="' + kind + '"]')).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Find a scenery object" });
    await search.fill("snowy");
    await expect(page.locator('[data-prop="snowpeak"]')).toBeVisible();
    await expect(page.locator('[data-prop="mountain"]')).toBeHidden();
    await search.fill("");
    await page.locator('[data-prop="snowpeak"]').click();
    await page.getByRole("button", { name: "Place the selected prop at the selected control point", exact: true }).click();
    expect(await page.evaluate(() => TrackDesigner.state().design.props.filter((p) => p.kind === "snowpeak").length)).toBe(size === "desktop" ? 1 : 2);
    await page.locator('[data-scenery-section="themes"]').click();
    await page.locator('[data-theme="fjord"]').click();
    expect(await page.evaluate(() => TrackDesigner.state().design.theme)).toBe("fjord");
    await page.locator('[data-scenery-section="objects"]').click();
    await page.screenshot({ path: testInfo.outputPath(size + "-terrain.png") });

    await mode("test").click();
    await expect(page.getByRole("textbox", { name: "Circuit name", exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Design checks", exact: true })).toBeVisible();
    await expect(bridges).toBeHidden();
    expect(await page.locator("#trackdesigner").evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  }
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  const savedId = await page.evaluate(() => TrackDesigner.state().design.originId);
  await page.reload();
  await page.waitForFunction(() => window.__apex && typeof CustomTracks !== "undefined", null, { polling: 100, timeout: BOOT_MS });
  const saved = await page.evaluate((id) => CustomTracks.get(id), savedId);
  expect(saved.theme).toBe("fjord");
  expect(saved.props.filter((p) => p.kind === "snowpeak")).toHaveLength(2);
  await raceAndBuild(page, savedId);
  expect(errors).toEqual([]);
});
