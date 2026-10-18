// @ts-check
// LD livery slices (docs/notes/LIVERY-REF-2026-10-18.md): every new design option is
// SELECTABLE in the garage paint editor on a phone, and selecting it changes the car.
// One boot, phone landscape with touch (852x393, the notched-landscape cell), the same
// entry path as parts-liveries.spec.js: McLaren (team 2), empty customs, START, CAR,
// LIVERY, create. "Changes the car" is asserted twice: the garage rebuilds the car's
// livery atlas after the tap, and the saved livery carries the id and paints different art.
import { test, expect } from "../helpers/fixtures.js";
import { galleryPath } from "../helpers/output-paths.js";
import { ensureLive, toMenu, forgetStored, pinFreePlay } from "../helpers/shared-page.js";

test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });

async function openCreator(page) {
  await ensureLive(page);
  const key = await page.evaluate(() => "livery.custom." + Teams.LIST[2].id);
  await forgetStored(page, [key]);
  await page.evaluate((k) => GameStore.store.set(k, []), key);
  await toMenu(page);
  await pinFreePlay(page, { team: 2, click: false });
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-car").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.locator('#cs-tabs [data-cs-cat="livery"]').click();
  await page.locator(".cs-liv-create").click();
  await expect(page.locator(".cs-liv-editor")).toBeVisible();
  return key;
}

test("2026-motif patterns: listed by name in SPINE TOP, tappable, and they repaint the car", async ({ page }) => {
  const key = await openCreator(page);
  const ids = await page.evaluate(() => Object.keys(LiveryDesign.LABELS));
  expect(ids.length).toBeGreaterThanOrEqual(6);
  for (const id of ids) {
    const pill = page.locator(`[data-cs-pill="spineLogo:${id}"]`);
    await expect(pill, id).toHaveCount(1);
    const label = await page.evaluate((i) => LiveryDesign.LABELS[i], id);
    await expect(pill, id + " is named, not shown as its id").toHaveText(new RegExp(label, "i"));
  }
  // The garage repaints the car through a fresh livery atlas build ("[car] livery <team>");
  // waiting on that record is deterministic where a frame diff waits on a render loop.
  const mark = await page.evaluate(() => (Log.records().at(-1) || { id: 0 }).id);
  const pill = page.locator('[data-cs-pill="spineLogo:halftone"]');
  await pill.scrollIntoViewIfNeeded();
  await pill.tap();
  await expect(pill).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate((since) => Log.records({ ns: "car", since })
    .some((r) => /livery/.test(JSON.stringify(r))), mark), { timeout: 30_000 }).toBe(true);
  await page.screenshot({ path: galleryPath("parts-livery-designs", "halftone-pill-852x393.png") });

  const save = page.locator(".cs-liv-ed-save");
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
