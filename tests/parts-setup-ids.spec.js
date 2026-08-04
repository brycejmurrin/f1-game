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
    // ...the card opens the TEAM PICKER (it is the team summary), and the
    // GARAGE button beside it is the way back in. They used to share one
    // destination, which is why tapping your own team landed you in the parts
    // garage.
    await page.locator("#sel-team-card").click();
    await expect(page.locator("#teampicker")).toBeVisible();
    await page.locator("#tp-close").click();
    await expect(page.locator("#carsetup")).toBeHidden();
    await page.locator("#sel-setup").click();
    await expect(page.locator("#carsetup")).toBeVisible();
  });
});

// The garage preview used to be a fixed turntable: one height, one distance,
// spinning left whether or not you wanted it to. #cs-view drives a real orbit
// over the top of it, and __apex.garageCam() is how that state is observed —
// asserting on rendered pixels here would be brittle for no extra truth.
test.describe("Car setup — preview camera", () => {
  test.use({ viewport: LANDSCAPE });

  const cam = (page) => page.evaluate(() => window.__apex.garageCam());
  // The camera set lives behind the CAMERA disclosure — only it and ACTIVE AERO
  // are on screen at rest, so the car is not hidden behind its own controls.
  // Picking a PRESET closes the panel again (aim and leave); MOVE/zoom/SPIN
  // repeat, so they leave it open. Hence the re-opens scattered through here.
  const openCam = async (page) => {
    if (await page.locator("#cs-cam-panel").isHidden()) await page.locator("#cs-cam").click();
    await page.locator("#cs-cam-panel").waitFor({ state: "visible" });
  };
  const closeCam = async (page) => {
    if (await page.locator("#cs-cam-panel").isVisible()) await page.locator("#cs-cam").click();
    await page.locator("#cs-cam-panel").waitFor({ state: "hidden" });
  };

  test("the camera bar exposes a stable data-cs-view per preset", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);
    await openCam(page);
    const ids = await page.locator("#cs-view [data-cs-view]").evaluateAll(
      (els) => els.map((e) => e.dataset.csView));
    expect(ids).toEqual(["hero", "front", "side", "rear", "top"]);
  });

  test("the panel starts shut, opens from CAMERA, and a preset shuts it again", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);
    const panel = page.locator("#cs-cam-panel");
    await expect(panel).toBeHidden();
    await expect(page.locator("#cs-cam")).toHaveAttribute("aria-expanded", "false");

    await page.locator("#cs-cam").click();
    await expect(panel).toBeVisible();
    await expect(page.locator("#cs-cam")).toHaveAttribute("aria-expanded", "true");

    // A preset is an aim-and-leave choice.
    await page.locator('[data-cs-view="rear"]').click();
    await expect(panel).toBeHidden();

    // A repeating control is not: it must stay open under the finger.
    await openCam(page);
    await page.locator("#cs-view-in").click();
    await expect(panel).toBeVisible();

    // Escape shuts the panel without also shutting the GARAGE behind it.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(page.locator("#carsetup")).toBeVisible();
  });

  test("the turntable runs on open and a preset both stops it and re-aims", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);
    const opened = await cam(page);
    expect(opened.on).toBe(true);
    expect(opened.spin).toBe(true);

    await openCam(page);
    await page.locator('[data-cs-view="side"]').click();
    const side = await cam(page);
    // Picking a view that keeps rotating away from itself is the bug this guards.
    expect(side.spin).toBe(false);
    expect(side.az).toBeCloseTo(Math.PI * 0.5, 5);
    // SIDE is pulled further back than the default: the car is broadside on and
    // the sheet takes the right of the canvas, so a nominal distance crops it.
    expect(side.dist).toBeGreaterThan(opened.dist);

    await openCam(page);
    await page.locator('[data-cs-view="top"]').click();
    expect((await cam(page)).el).toBeGreaterThan(1);

    // SPIN is a toggle, and says so for a screen reader.
    await openCam(page);
    await page.locator("#cs-view-spin").click();
    expect((await cam(page)).spin).toBe(true);
    await expect(page.locator("#cs-view-spin")).toHaveAttribute("aria-pressed", "true");
  });

  test("zoom is clamped and drag orbits without touching distance", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);
    await openCam(page);
    await page.locator('[data-cs-view="front"]').click();
    const start = await cam(page);

    // Real clicks for the wiring...
    await openCam(page);
    await page.locator("#cs-view-in").click();
    expect((await cam(page)).dist).toBeLessThan(start.dist);
    await page.locator("#cs-view-out").click();
    await page.locator("#cs-view-out").click();
    expect((await cam(page)).dist).toBeGreaterThan(start.dist);

    // ...and a burst through the DOM for the clamps. Same onclick handler, but
    // without paying Playwright's per-click actionability round-trip 70 times —
    // which took this test from seconds to over its whole timeout budget.
    const mash = (id, n) => page.evaluate(([i, k]) => {
      const b = document.getElementById(i);
      for (let x = 0; x < k; x++) b.click();
    }, [id, n]);
    // Never let the camera end up inside the car or in the next postcode.
    await mash("cs-view-in", 30);
    expect((await cam(page)).dist).toBeGreaterThan(4);
    await mash("cs-view-out", 40);
    expect((await cam(page)).dist).toBeLessThan(16);

    // Drag across the car region: azimuth moves, distance does not, and taking
    // hold of the car stops the turntable fighting the drag.
    await openCam(page);
    await page.locator("#cs-view-spin").click();
    expect((await cam(page)).spin).toBe(true);
    // Shut the panel first: the drag below aims at the car region, and an open
    // panel sits over part of it.
    await closeCam(page);
    const before = await cam(page);
    await page.mouse.move(180, 200);
    await page.mouse.down();
    for (let x = 180; x <= 380; x += 40) await page.mouse.move(x, 200);
    await page.mouse.up();
    const after = await cam(page);
    expect(after.spin).toBe(false);
    expect(Math.abs(after.az - before.az)).toBeGreaterThan(0.15);
    expect(after.dist).toBeCloseTo(before.dist, 5);
  });
});
