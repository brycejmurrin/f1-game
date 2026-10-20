// @ts-check
// LD livery slices (docs/notes/LIVERY-REF-2026-10-18.md): every new design option is
// SELECTABLE in the garage paint editor on a phone, and selecting it changes the car.
// One boot, phone landscape with touch (852x393, the notched-landscape cell), the same
// entry path as parts-liveries.spec.js: McLaren (team 2), empty customs, START, CAR,
// LIVERY, create. "Changes the car" is asserted twice: the garage rebuilds the car's
// livery atlas after the tap, and the saved livery carries the id and paints different art.
import { test, expect, clickLive } from "../helpers/fixtures.js";
import { galleryPath } from "../helpers/output-paths.js";
import { ensureLive, toMenu, forgetStored, pinFreePlay, presentAndPause } from "../helpers/shared-page.js";

test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });

// One car area at a time: open the area that holds a control before acting on it.
async function reveal(page, sel) {
  await page.evaluate((s) => {
    const pane = document.querySelector(s)?.closest('[role="tabpanel"]');
    if (pane && pane.hidden) document.getElementById(pane.getAttribute("aria-labelledby")).click();
  }, sel);
  return page.locator(sel);
}

async function openCreator(page, manualPreview = false) {
  await ensureLive(page);
  await page.evaluate(() => __apex.renderScale(0.5));
  const key = await page.evaluate(() => "livery.custom." + Teams.LIST[2].id);
  await forgetStored(page, [key]);
  await page.evaluate((k) => GameStore.store.set(k, []), key);
  await toMenu(page);
  await pinFreePlay(page, { team: 2, click: false });
  await clickLive(page, "mb-race");
  await page.locator("#select").waitFor({ state: "visible" });
  await clickLive(page, "sel-car");
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.locator('#cs-tabs [data-cs-cat="livery"]').evaluate(b => b.click());
  await page.locator(".cs-liv-create").evaluate(b => b.click());
  await expect(page.locator(".cs-liv-editor")).toBeVisible();
  if (manualPreview) await page.evaluate(() => __apex.headless(true));
  return key;
}

test("2026-motif patterns: listed by name in SPINE TOP, tappable, and they repaint the car", async ({ page }) => {
  const key = await openCreator(page);
  const ids = await page.evaluate(() => Object.keys(LiveryDesign.LABELS));
  expect(ids.length).toBeGreaterThanOrEqual(6);
  await reveal(page, `[data-cs-pill="spineLogo:${ids[0]}"]`);
  for (const id of ids) {
    const pill = page.locator(`[data-cs-pill="spineLogo:${id}"]`);
    await expect(pill, id).toHaveCount(1);
    const label = await page.evaluate((i) => LiveryDesign.LABELS[i], id);
    await expect(pill, id + " is named, not shown as its id").toHaveText(new RegExp(label, "i"));
  }
  // The garage repaints the car through a fresh livery atlas build ("[car] livery <team>");
  // waiting on that record is deterministic where a frame diff waits on a render loop.
  const mark = await page.evaluate(() => (Log.records().at(-1) || { id: 0 }).id);
  const pill = await reveal(page, '[data-cs-pill="spineLogo:halftone"]');
  await pill.scrollIntoViewIfNeeded();
  await pill.tap();
  await expect(pill).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate((since) => Log.records({ ns: "car", since })
    .some((r) => /livery/.test(JSON.stringify(r))), mark), { timeout: 30_000 }).toBe(true);
  await page.screenshot({ path: galleryPath("parts-livery-designs", "halftone-pill-852x393.png") });

  const save = await reveal(page, ".cs-liv-ed-save");
  await save.scrollIntoViewIfNeeded();
  await save.tap();
  const r = await page.evaluate((k) => {
    const saved = (GameStore.store.get(k) || []).at(-1);
    const team = Teams.LIST[2];
    const sig = (liv) => LiveryTex.buildAtlas(team.id, liv, 4, true, false).toDataURL();
    return { spineLogo: saved && saved.spineLogo,
      differs: !!saved && sig(saved) !== sig(Object.assign({}, saved, { spineLogo: "none" })) };
  }, key);
  expect(r.spineLogo).toBe("halftone");
  expect(r.differs, "the saved design paints different cover art").toBe(true);
});


test("all catalog part styles and body shapes are reachable, previewed and saved independently of fitted parts", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const key = await openCreator(page, true);
  await page.evaluate(() => __apex.agentHelp());
  const groups = await page.evaluate(() => Object.entries(Car3D.PART_STYLE_FIELDS).map(([field, category]) => ({
    field, options: Parts.CATALOG.find(c => c.id === category).options.filter(o => o.tag === "STYLE").map(o => ({ id: o.id, label: o.label })),
  })));
  expect(groups).toHaveLength(12);
  expect(groups.reduce((n, g) => n + g.options.length, 0)).toBe(56);
  const before = await page.evaluate(() => {
    const t = Teams.LIST[2], setup = GameStore.store.get("parts." + t.id, {});
    return { setup, cost: Parts.getCost(setup, t), mods: Parts.getMods(setup, t) };
  });
  for (const { field, options } of groups) {
    for (const o of options) {
      await expect(page.locator(`[data-cs-pill="${field}:${o.id}"]`)).toHaveCount(1);
      await expect(page.locator(`[data-cs-pill="${field}:${o.id}"]`)).toHaveText(o.label.toUpperCase());
    }
    // Every handler must select its own id. End on FITTED, then use a real phone
    // tap on a style in each area and require the preview's actual mesh rebuild.
    await page.evaluate(({ field, options }) => {
      for (const id of [...options.map(o => o.id), "fitted"]) {
        const b = document.querySelector(`[data-cs-pill="${field}:${id}"]`);
        if (!b || b.disabled) throw new Error("Unavailable style: " + field + ":" + id);
        b.click();
        if (b.getAttribute("aria-pressed") !== "true") throw new Error("Style not selected: " + id);
      }
    }, { field, options });
    const id = options.at(-1).id;
    const mark = await page.evaluate(() => (Log.records().at(-1) || { id: 0 }).id);
    const pill = await reveal(page, `[data-cs-pill="${field}:${id}"]`);
    await pill.scrollIntoViewIfNeeded(); await pill.tap();
    await presentAndPause(page);
    await expect(pill).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate((since) => Log.records({ ns: "car", since })
      .some(r => /build/.test(JSON.stringify(r))), mark), { timeout: 30_000 }).toBe(true);
  }
  const coverage = await page.evaluate(() => {
    const bodies = ["team", ...Car3D.BODY_STYLE_IDS];
    for (const id of bodies) {
      const b = document.querySelector(`[data-cs-pill="bodyStyle:${id}"]`);
      if (!b || b.disabled) throw new Error("Unavailable body: " + id);
      b.click();
      if (b.getAttribute("aria-pressed") !== "true") throw new Error("Body not selected: " + id);
    }
    const finishes = ["gloss", ...Object.keys(Car3D.FINISH_SURFACE)];
    for (const field of Car3D.FINISH_FIELDS) for (const value of field === "finish" ? finishes : ["inherit", ...finishes]) {
      const selector = field === "finish" ? `[data-cs-finish="${value}"]` : `[data-cs-pill="${field}:${value}"]`;
      if (!document.querySelector(selector)) throw new Error("Missing finish: " + field + ":" + value);
    }
    return { bodies: bodies.length, finishes: finishes.length, regionalFields: Car3D.FINISH_FIELDS.length - 1 };
  });
  expect(coverage).toEqual({ bodies: 27, finishes: 36, regionalFields: 14 });
  const body = await reveal(page, '[data-cs-pill="bodyStyle:caldra"]');
  await body.scrollIntoViewIfNeeded(); await body.tap();
  await presentAndPause(page);
  await expect(body).toHaveAttribute("aria-pressed", "true");
  const save = await reveal(page, ".cs-liv-ed-save");
  await save.scrollIntoViewIfNeeded(); await save.tap();
  const after = await page.evaluate((k) => {
    const t = Teams.LIST[2], setup = GameStore.store.get("parts." + t.id, {});
    return { saved: GameStore.store.get(k).at(-1), setup, cost: Parts.getCost(setup, t), mods: Parts.getMods(setup, t) };
  }, key);
  expect(after.saved.bodyStyle).toBe("caldra");
  for (const { field, options } of groups) expect(after.saved[field]).toBe(options.at(-1).id);
  expect({ setup: after.setup, cost: after.cost, mods: after.mods }).toEqual(before);
  await page.locator('[title="Edit this livery"]').click();
  for (const { field, options } of groups) {
    const selected = await reveal(page, `[data-cs-pill="${field}:${options.at(-1).id}"]`);
    await selected.scrollIntoViewIfNeeded();
    await expect(selected).toBeVisible();
    await expect(selected).toHaveAttribute("aria-pressed", "true");
  }
  await presentAndPause(page);
  await page.screenshot({ path: galleryPath("parts-livery-designs", "all-part-styles-editor.png") });
});
