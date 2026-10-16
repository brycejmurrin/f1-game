// @ts-check
/**
 * Pin the pre-GarageDefaults free-play seat BEFORE the first navigation.
 *
 * js/data/garage-defaults.js makes a miss-path player Mercedes-AMG with a
 * signature parts kit (Bryce's exported garage). That kit is the product
 * default. Specs that characterize the driving model, or that need startRace()
 * to reach the grid under a factory envelope, must not inherit it.
 *
 * Call addInitScript, then goto. A store write after boot does not move
 * teamIdx (js/game.js reads it once). Empty `parts.mclaren` is the factory
 * sheet — the same seed tools/lib/game-vm.cjs applies.
 *
 * @param {import("@playwright/test").Page} page
 */
export async function pinFactorySeat(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("apex26.team", "2");
      localStorage.setItem("apex26.parts.mclaren", "{}");
    } catch (_) { /* private mode */ }
  });
}

/**
 * Pin the factory McLaren seat on a page that has ALREADY booted — without
 * touching localStorage (menu-baseline garage goldens read the shipped
 * GarageDefaults on a fresh goto). Writes GameStore and re-reads teamIdx via
 * #mb-race / #sel-back, same as pinFreePlay. Call at the title screen.
 *
 * @param {import("@playwright/test").Page} page
 */
export async function syncFactoryMcLarenSeat(page) {
  await page.evaluate(() => {
    const S = GameStore.store;
    S.set("team", 2);
    S.set("driver", 0);
    S.set("parts.mclaren", {});
    document.getElementById("mb-race").click();
    document.getElementById("sel-back").click();
  });
}
