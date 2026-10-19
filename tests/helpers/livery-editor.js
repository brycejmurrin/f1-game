// @ts-check
import { toMenu, forgetStored, pinFreePlay } from "./shared-page.js";

// One car area at a time: open the area that holds a control before acting on it.
export async function revealLiveryControl(page, sel) {
  await page.evaluate((s) => {
    const pane = document.querySelector(s)?.closest('[role="tabpanel"]');
    if (pane && pane.hidden) document.getElementById(pane.getAttribute("aria-labelledby")).click();
  }, sel);
  return page.locator(sel);
}

// A missing key refills the shipped customs through GarageDefaults. Write [] to
// both cache and disk so creator scenarios start with an empty list instead.
export async function pinEmptyCustomLiveries(page) {
  const key = await page.evaluate(() => "livery.custom." + Teams.LIST[2].id);
  await forgetStored(page, [key]);
  await page.evaluate((k) => GameStore.store.set(k, []), key);
  return key;
}

// Call after the page is live. Keep fixture liveness, viewport and assertions
// with the spec; this is the common McLaren START → CAR → LIVERY → create route.
export async function openEmptyCustomLivery(page) {
  const key = await pinEmptyCustomLiveries(page);
  await toMenu(page);
  await pinFreePlay(page, { team: 2, click: false });
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-car").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.locator('#cs-tabs [data-cs-cat="livery"]').click();
  await page.locator(".cs-liv-create").click();
  return key;
}
