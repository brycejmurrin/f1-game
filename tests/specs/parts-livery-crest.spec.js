// @ts-check
// LD logos slice: the CREST row (original emblems in place of the team mark) and its CREST TONE / CREST FRAME rows are reachable
// on a phone (852x393, touch); tapping an emblem rebuilds the garage livery atlas, and the
// saved livery paints different mark art from the team crest. Entry path as
// parts-liveries.spec.js: McLaren (team 2), empty customs, START, CAR, LIVERY, create.
import { test, expect } from "../helpers/fixtures.js";
import { ensureLive } from "../helpers/shared-page.js";
import { revealLiveryControl as reveal, openEmptyCustomLivery } from "../helpers/livery-editor.js";

test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });

test("CREST emblems: every style is a tappable pill, and the chosen one repaints the car's marks", async ({ page }) => {
  await ensureLive(page);
  const key = await openEmptyCustomLivery(page);
  await expect(page.locator(".cs-liv-editor")).toBeVisible();

  const ids = await page.evaluate(() => Array.from(LiveryTex.CREST_STYLE_IDS));
  expect(ids).toEqual(["team", "shield", "roundel", "wings", "arrow", "star", "bolt", "laurel", "chevrons", "diamond", "gear", "crown", "flag", "flame"]);
  await reveal(page, '[data-cs-pill="crestStyle:team"]');
  for (const id of ids) await expect(page.locator(`[data-cs-pill="crestStyle:${id}"]`), id).toHaveCount(1);
  await expect(page.locator('[data-cs-pill="crestStyle:team"]')).toHaveAttribute("aria-pressed", "true");

  // The garage repaints marks through a fresh livery atlas build ("[car] livery <team>").
  const mark = await page.evaluate(() => (Log.records().at(-1) || { id: 0 }).id);
  const pill = await reveal(page, '[data-cs-pill="crestStyle:shield"]');
  await pill.scrollIntoViewIfNeeded();
  await pill.tap();
  await expect(pill).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate((since) => Log.records({ ns: "car", since })
    .some((r) => /livery/.test(JSON.stringify(r))), mark), { timeout: 30_000 }).toBe(true);

  // CREST TONE / CREST FRAME dress the emblem: every option is a pill in the same editor.
  for (const [field, list] of [["crestTone", "CREST_TONE_IDS"], ["crestFrame", "CREST_FRAME_IDS"]]) {
    const opts = await page.evaluate((l) => Array.from(LiveryTex[l]), list);
    for (const id of opts) await expect(page.locator(`[data-cs-pill="${field}:${id}"]`), `${field}:${id}`).toHaveCount(1);
  }
  const disc = await reveal(page, '[data-cs-pill="crestFrame:disc"]');
  await disc.scrollIntoViewIfNeeded();
  await disc.tap();
  await expect(disc).toHaveAttribute("aria-pressed", "true");

  const save = await reveal(page, ".cs-liv-ed-save");
  await save.scrollIntoViewIfNeeded();
  await save.tap();
  const r = await page.evaluate((k) => {
    const saved = (GameStore.store.get(k) || []).at(-1);
    const team = Teams.LIST[2];
    const sig = (liv) => LiveryTex.buildAtlas(team.id, liv, 4, true, false).toDataURL();
    return { crestStyle: saved && saved.crestStyle, crestFrame: saved && saved.crestFrame,
      differs: !!saved && sig(saved) !== sig(Object.assign({}, saved, { crestStyle: "team" })) };
  }, key);
  expect(r.crestStyle).toBe("shield");
  expect(r.crestFrame).toBe("disc");
  expect(r.differs, "the emblem paints different mark art").toBe(true);
});
