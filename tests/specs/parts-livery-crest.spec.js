// @ts-check
// LD logos slice: the CREST row (original emblems in place of the team mark) is reachable
// on a phone (852x393, touch); tapping an emblem rebuilds the garage livery atlas, and the
// saved livery paints different mark art from the team crest. Entry path as
// parts-liveries.spec.js: McLaren (team 2), empty customs, START, CAR, LIVERY, create.
import { test, expect } from "../helpers/fixtures.js";
import { ensureLive, toMenu, forgetStored, pinFreePlay } from "../helpers/shared-page.js";

test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });

// One car area at a time: open the area that holds a control before acting on it.
async function reveal(page, sel) {
  await page.evaluate((s) => {
    const pane = document.querySelector(s)?.closest('[role="tabpanel"]');
    if (pane && pane.hidden) document.getElementById(pane.getAttribute("aria-labelledby")).click();
  }, sel);
  return page.locator(sel);
}

test("CREST emblems: every style is a tappable pill, and the chosen one repaints the car's marks", async ({ page }) => {
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

  const ids = await page.evaluate(() => Array.from(LiveryTex.CREST_STYLE_IDS));
  expect(ids).toEqual(["team", "shield", "roundel", "wings", "arrow", "star"]);
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

  const save = await reveal(page, ".cs-liv-ed-save");
  await save.scrollIntoViewIfNeeded();
  await save.tap();
  const r = await page.evaluate((k) => {
    const saved = (GameStore.store.get(k) || []).at(-1);
    const team = Teams.LIST[2];
    const sig = (liv) => LiveryTex.buildAtlas(team.id, liv, 4, true, false).toDataURL();
    return { crestStyle: saved && saved.crestStyle,
      differs: !!saved && sig(saved) !== sig(Object.assign({}, saved, { crestStyle: "team" })) };
  }, key);
  expect(r.crestStyle).toBe("shield");
  expect(r.differs, "the emblem paints different mark art").toBe(true);
});
