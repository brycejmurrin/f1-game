// @ts-check
// LD zones slice (#2796 1-3 + ENDPLATES + #2920 paint zones): zone finish pills, the
// ENDPLATES colour row, and the RUNNING GEAR area (floor / suspension / ducts) are
// reachable on a phone (852x393, touch); each choice rebuilds the garage car; the
// saved livery then builds a mesh where finishes and tints land on the right
// sections. Entry path as parts-liveries.spec.js: McLaren (team 2), empty customs,
// START, CAR, LIVERY, create.
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

async function openLiveryEditor(page) {
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

const lastLogId = (page) => page.evaluate(() => (Log.records().at(-1) || { id: 0 }).id);
// The garage repaints through a fresh Car3D build ("[car] build <team>"): a deterministic signal.
const rebuiltSince = (page, since) => expect.poll(() => page.evaluate((s) => Log.records({ ns: "car", since: s })
  .some((r) => /build/.test(JSON.stringify(r))), since), { timeout: 30_000 }).toBe(true);

test("zone finishes and ENDPLATES: tappable on a phone, and the saved car carries them", async ({ page }) => {
  await ensureLive(page);
  const key = await openLiveryEditor(page);

  for (const sel of ['[data-cs-pill="haloFinish:matte"]', '[data-cs-pill="podFinish:chrome"]']) {
    const pill = await reveal(page, sel);
    await pill.scrollIntoViewIfNeeded();
    const mark = await lastLogId(page);
    await pill.tap();
    await expect(pill).toHaveAttribute("aria-pressed", "true");
    await rebuiltSince(page, mark);
  }
  const ep = await reveal(page, 'input[data-liv-field="endplate"]');
  await ep.scrollIntoViewIfNeeded();
  const mark = await lastLogId(page);
  await ep.fill("#00c060");
  await rebuiltSince(page, mark);

  const save = await reveal(page, ".cs-liv-ed-save");
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

test("RUNNING GEAR: floor / suspension / duct tints are on that tab and land on the mesh", async ({ page }) => {
  await ensureLive(page);
  const key = await openLiveryEditor(page);

  // The area tab exists and is the only way to reach these rows on a phone.
  const gearTab = page.locator('#cs-liv-tab-running');
  await expect(gearTab).toHaveText("RUNNING GEAR");
  await gearTab.tap();
  await expect(gearTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#cs-liv-pane-running")).toBeVisible();

  for (const [sel, value] of [
    ['input[data-liv-field="floorTint"]', "#ff00aa"],
    ['input[data-liv-field="suspTint"]', "#00cc66"],
    ['input[data-liv-field="ductTint"]', "#3366ff"],
  ]) {
    const input = await reveal(page, sel);
    await input.scrollIntoViewIfNeeded();
    const mark = await lastLogId(page);
    await input.fill(value);
    await rebuiltSince(page, mark);
  }
  const floorFinish = await reveal(page, '[data-cs-pill="floorFinish:chrome"]');
  await floorFinish.scrollIntoViewIfNeeded();
  {
    const mark = await lastLogId(page);
    await floorFinish.tap();
    await expect(floorFinish).toHaveAttribute("aria-pressed", "true");
    await rebuiltSince(page, mark);
  }

  const save = await reveal(page, ".cs-liv-ed-save");
  await save.scrollIntoViewIfNeeded();
  await save.tap();
  const r = await page.evaluate((k) => {
    const saved = (GameStore.store.get(k) || []).at(-1);
    const team = Teams.LIST[2], FS = Car3D.FINISH_SURFACE;
    const build = (liv) => {
      const m = Car3D.build(liv.c1, liv.c2, { livery: liv, teamId: team.id, noWheels: true, measure: true });
      let at = 0;
      for (const p of m.parts) { p.from = at; at += p.vertices; p.to = at; }
      return m;
    };
    const m = build(saved);
    const base = build(Object.assign({}, saved, {
      floorTint: null, suspTint: null, ductTint: null, floorFinish: "inherit",
    }));
    const near = (i, hex) => {
      const c = hex.length === 7
        ? [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]
        : hex;
      return [0, 1, 2].every((j) => Math.abs(m.col[i * 3 + j] - c[j]) < 0.08);
    };
    let floor = 0, susp = 0, duct = 0, chrome = 0;
    for (let i = 0; i < m.mat.length; i++) {
      const changed = m.mat[i] !== base.mat[i]
        || m.col[i * 3] !== base.col[i * 3]
        || m.col[i * 3 + 1] !== base.col[i * 3 + 1]
        || m.col[i * 3 + 2] !== base.col[i * 3 + 2];
      if (!changed) continue;
      const sec = m.parts.find((p) => i >= p.from && i < p.to);
      const name = sec && sec.name;
      if (name === "suspension" && near(i, saved.suspTint)) susp++;
      if (name === "brakeDucts" && near(i, saved.ductTint)) duct++;
      if ((name === "sidepods" || name === "bodyDetail" || name === "frontWing") && near(i, saved.floorTint)) floor++;
      if (m.mat[i] === FS.chrome && base.mat[i] !== FS.chrome) chrome++;
    }
    return {
      floorTint: saved.floorTint, suspTint: saved.suspTint, ductTint: saved.ductTint,
      floorFinish: saved.floorFinish, floor, susp, duct, chrome,
    };
  }, key);
  expect(r.floorTint).toBeTruthy();
  expect(r.suspTint).toBeTruthy();
  expect(r.ductTint).toBeTruthy();
  expect(r.floorFinish).toBe("chrome");
  expect(r.floor, "floor tint lands on floor-edge sections").toBeGreaterThan(0);
  expect(r.susp, "suspension tint lands on suspension").toBeGreaterThan(0);
  expect(r.duct, "duct tint lands on brake ducts").toBeGreaterThan(0);
  expect(r.chrome, "floor finish chrome lands").toBeGreaterThan(0);
});
