// @ts-check
// LD zones slice (#2796 1-3 + ENDPLATES): the zone finish pills and the ENDPLATES colour
// row are reachable on a phone (852x393, touch) and each choice rebuilds the garage car;
// the saved livery then builds a mesh where the finish lands on the halo and the pod
// panel and the endplates take the picked colour. Entry path as parts-liveries.spec.js:
// McLaren (team 2), empty customs, START, CAR, LIVERY, create.
import { test, expect } from "../helpers/fixtures.js";
import { ensureLive, toMenu, forgetStored, pinFreePlay } from "../helpers/shared-page.js";

test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });

const lastLogId = (page) => page.evaluate(() => (Log.records().at(-1) || { id: 0 }).id);
// The garage repaints through a fresh Car3D build ("[car] build <team>"): a deterministic signal.
const rebuiltSince = (page, since) => expect.poll(() => page.evaluate((s) => Log.records({ ns: "car", since: s })
  .some((r) => /build/.test(JSON.stringify(r))), since), { timeout: 30_000 }).toBe(true);

test("zone finishes and ENDPLATES: tappable on a phone, and the saved car carries them", async ({ page }) => {
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

  for (const sel of ['[data-cs-pill="haloFinish:matte"]', '[data-cs-pill="podFinish:chrome"]']) {
    const pill = page.locator(sel);
    await pill.scrollIntoViewIfNeeded();
    const mark = await lastLogId(page);
    await pill.tap();
    await expect(pill).toHaveAttribute("aria-pressed", "true");
    await rebuiltSince(page, mark);
  }
  const ep = page.locator('input[data-liv-field="endplate"]');
  await ep.scrollIntoViewIfNeeded();
  const mark = await lastLogId(page);
  await ep.fill("#00c060");
  await rebuiltSince(page, mark);

  const save = page.locator(".cs-liv-ed-save");
  await save.scrollIntoViewIfNeeded();
  await save.tap();
  const r = await page.evaluate((k) => {
    const saved = (GameStore.store.get(k) || []).at(-1);
    const team = Teams.LIST[2], FS = Car3D.FINISH_SURFACE;
    const build = (liv) => Car3D.build(liv.c1, liv.c2, { livery: liv, teamId: team.id, noWheels: true });
    const m = build(saved), b = build(Object.assign({}, saved, { endplate: null, haloFinish: "inherit", podFinish: "inherit" }));
    const near = (i, c) => [0, 1, 2].every((j) => Math.abs(m.col[i * 3 + j] - c[j]) < 0.08);
    let plate = 0, matte = 0, chrome = 0;
    for (let i = 0; i < m.mat.length; i++) {
      if (saved.endplate && near(i, saved.endplate) && Math.abs(m.pos[i * 3 + 2]) > 1.5) plate++;
      if (m.mat[i] === FS.matte && b.mat[i] !== FS.matte) matte++;
      if (m.mat[i] === FS.chrome) chrome++;
    }
    return { haloFinish: saved.haloFinish, podFinish: saved.podFinish, endplate: saved.endplate, plate, matte, chrome };
  }, key);
  expect(r.haloFinish).toBe("matte");
  expect(r.podFinish).toBe("chrome");
  expect(r.endplate).toBeTruthy();
  expect(r.plate, "endplate vertices take the picked colour").toBeGreaterThan(0);
  expect(r.matte, "the halo finish lands on paint").toBeGreaterThan(0);
  expect(r.chrome, "the sidepod finish lands").toBeGreaterThan(0);
});
