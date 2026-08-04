// @ts-check
// Stable setup DOM identifiers — category tabs and option rows expose
// data-cs-cat / data-cs-opt so tests do not depend on presentation text/classes.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
}

async function openSetup(page) {
  await page.evaluate(() => {
    const team = Teams.LIST[parseInt(localStorage.getItem("apex26.team") ?? "2")];
    if (team) localStorage.removeItem("apex26.parts." + team.id);
    localStorage.removeItem("apex26.unlimitedBudget");
  });
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-setup").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
}

test.describe("Car setup — stable DOM identifiers", () => {
  test.use({ viewport: LANDSCAPE });

  test("every parts category tab has data-cs-cat matching its catalog id", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const ids = await page.evaluate(() => Parts.CATALOG.map((c) => c.id));
    for (const id of ids) {
      await expect(page.locator(`#cs-tabs [data-cs-cat="${id}"]`)).toHaveCount(1);
    }
    await expect(page.locator('#cs-tabs [data-cs-cat="livery"]')).toHaveCount(1);
  });

  test("active category options expose data-cs-opt matching option ids", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await page.locator('#cs-tabs [data-cs-cat="gearbox"]').click();
    const optIds = await page.evaluate(() => {
      const cat = Parts.CATALOG.find((c) => c.id === "gearbox");
      const team = Teams.LIST[parseInt(localStorage.getItem("apex26.team") ?? "2")];
      return cat.options.filter((option) => Parts.isOptionAvailable(option, team)).map((option) => option.id);
    });
    for (const id of optIds) {
      await expect(page.locator(`#cs-options [data-cs-opt="${id}"]`)).toHaveCount(1);
    }
  });

  test("selecting by data-cs-opt activates that option", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await page.locator('#cs-tabs [data-cs-cat="fuel"]').click();
    await page.locator('#cs-options [data-cs-opt="high_octane"]').click();
    await expect(page.locator('#cs-options [data-cs-opt="high_octane"]')).toHaveClass(/active/);
  });
});

// The setup panel is transparent so the live 3D car shows through it, which
// means every screen underneath has to be hidden while it is open. openSetup()
// only hid #select, on the assumption that #overlay was already gone by the time
// #select was reached — true of the track-picker route, but the title screen's
// GARAGE button opens setup straight off #overlay, which then stayed up and
// showed the APEX 26 title and the whole main menu through the panel.
test.describe("Car setup — nothing shows through from the screen below", () => {
  test.use({ viewport: LANDSCAPE });

  const screens = (page) => page.evaluate(() => ({
    overlay:  document.getElementById("overlay").hidden,
    select:   document.getElementById("select").hidden,
    carsetup: document.getElementById("carsetup").hidden,
  }));

  // Both routes in, and both routes back out: DONE returns you where you came
  // from (garageReturn), so the two paths differ on the way out, not the way in.
  for (const [route, enter, backTo] of [
    ["GARAGE from the title", "#mb-garage", "overlay"],
    ["SETUP from the track picker", "#sel-setup", "select"],
  ]) {
    test(`${route}: no screen is left visible behind the panel`, async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      if (enter === "#sel-setup") {
        await page.locator("#mb-race").click();
        await page.locator("#select").waitFor({ state: "visible" });
      }
      await page.locator(enter).click();
      await page.locator("#carsetup").waitFor({ state: "visible" });

      expect(await screens(page)).toEqual({ overlay: true, select: true, carsetup: false });

      await page.locator("#cs-done").click();
      await page.locator("#carsetup").waitFor({ state: "hidden" });
      const after = await screens(page);
      expect(after[backTo], `DONE returns to #${backTo}`).toBe(false);
      expect(after.carsetup).toBe(true);
    });
  }
});

// The garage owns WHO you are as well as WHAT you drive. It used to be a parts
// screen only, so opening it from the title left you tuning a car with no way to
// say whose it was, while team/driver/MY TEAM were reachable only from inside a
// track picker. TEAM leads the tab column because it gates which parts are even
// offered (supplier exclusives) and which liveries exist.
test.describe("Garage — TEAM tab owns team, driver and MY TEAM", () => {
  test.use({ viewport: LANDSCAPE });

  async function openTeamTab(page) {
    await page.goto("/");
    await waitReady(page);
    await page.locator("#mb-garage").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.locator('#cs-tabs [data-cs-cat="team"]').click();
  }

  test("TEAM leads the tab column and LIVERY still ends it", async ({ page }) => {
    await openTeamTab(page);
    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll("#cs-tabs .cs-tab")].map((t) => t.dataset.csCat));
    expect(tabs[0]).toBe("team");
    expect(tabs[tabs.length - 1]).toBe("livery");
    const catIds = await page.evaluate(() => Parts.CATALOG.map((c) => c.id));
    expect(tabs.slice(1, -1)).toEqual(catIds);
  });

  test("picking a team from the garage stores it and repaints the header", async ({ page }) => {
    await openTeamTab(page);
    await page.locator("#cs-team-card").click();
    // The picker is opened FROM the garage now, so it has to render ABOVE it —
    // at its old z-index (26 vs #carsetup's 35) it opened behind the sheet and
    // the whole flow looked broken. Hit-test rather than trust `hidden`.
    const onTop = await page.evaluate(() => {
      const r = document.querySelector("#sel-teams .team-tile").getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit && hit.closest(".team-tile") !== null;
    });
    expect(onTop, "#teampicker renders above #carsetup").toBe(true);

    const before = await page.locator("#cs-team").textContent();
    await page.evaluate(() => {
      const tiles = [...document.querySelectorAll("#sel-teams .team-tile")];
      tiles.find((t) => !t.classList.contains("active")).click();
    });
    await expect(page.locator("#teampicker")).toBeHidden();
    await expect(page.locator("#carsetup")).toBeVisible();
    await expect(page.locator("#cs-team")).not.toHaveText(before ?? "");
    // A team switch resets the driver — the old team's index means nothing here.
    expect(await page.evaluate(() => localStorage.getItem("apex26.driver"))).toBe("0");
  });

  test("a driver chip stores the driver", async ({ page }) => {
    await openTeamTab(page);
    const chips = await page.locator("#cs-driver .sel-chip").count();
    test.skip(chips < 2, "team has a single driver");
    await page.locator("#cs-driver .sel-chip").nth(1).click();
    expect(await page.evaluate(() => localStorage.getItem("apex26.driver"))).toBe("1");
    await expect(page.locator("#cs-driver .sel-chip").nth(1)).toHaveClass(/active/);
  });

  test("MY TEAM opens above the garage", async ({ page }) => {
    await openTeamTab(page);
    await page.locator("#cs-customize").click();
    await page.locator("#customize").waitFor({ state: "visible" });
    const onTop = await page.evaluate(() => {
      const r = document.getElementById("cz-save").getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit && hit.id === "cz-save";
    });
    expect(onTop, "#customize renders above #carsetup").toBe(true);
  });

  test("the select screen's card summarises what the garage chose", async ({ page }) => {
    await openTeamTab(page);
    const chips = await page.locator("#cs-driver .sel-chip").count();
    if (chips > 1) await page.locator("#cs-driver .sel-chip").nth(1).click();
    const driver = await page.locator("#cs-driver .sel-chip.active").textContent();
    const surname = (driver ?? "").trim().split(" ").pop().toUpperCase();

    await page.locator("#cs-done").click();
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await expect(page.locator("#sel-team-card")).toContainText(surname);
    // ...and the card is the way back in.
    await page.locator("#sel-team-card").click();
    await expect(page.locator("#carsetup")).toBeVisible();
  });
});
