// @ts-check
// Stable setup DOM identifiers — category tabs and option rows expose
// data-cs-cat / data-cs-opt so tests do not depend on presentation text/classes.
//
// ONE BOOT PER WORKER (sharedTest): twelve boots became none. Every opener
// walks the shared page back to the title first (toMenu) — the TEAM-tab tests
// leave a picker, MY TEAM or the garage itself up, and the route tests assert
// which screens are hidden, so the walk back is what makes those assertions
// mean what they did on a fresh page. UNVERIFIED IN A BROWSER at conversion time.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { toMenu, forgetStored, pinFreePlay, freeBuildOff } from "../helpers/shared-page.js";

const LANDSCAPE = { width: 844, height: 390 };

async function openSetup(page) {
  await toMenu(page);
  await forgetStored(page, ["unlimitedBudget"]);
  // The default car, its parts forgotten; #mb-race re-reads the store.
  await pinFreePlay(page, { click: false });
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-car").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await freeBuildOff(page);
}

test.describe("Car setup — stable DOM identifiers", () => {
  test.use({ viewport: LANDSCAPE });

  test("every parts category tab has data-cs-cat matching its catalog id", async ({ page }) => {
    await openSetup(page);

    const ids = await page.evaluate(() => Parts.CATALOG.map((c) => c.id));
    for (const id of ids) {
      await expect(page.locator(`#cs-tabs [data-cs-cat="${id}"]`)).toHaveCount(1);
    }
    await expect(page.locator('#cs-tabs [data-cs-cat="livery"]')).toHaveCount(1);
  });

  test("active category options expose data-cs-opt matching option ids", async ({ page }) => {
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
    "race-settings": document.getElementById("race-settings").hidden,
  }));

  // Both routes in, and where each one leads OUT. DONE reads garageReturn: from
  // the title screen it goes back to the menu, and from the circuit picker it
  // goes FORWARD to the race settings — the garage is a step on the way to a
  // race now, not a side door off it.
  for (const [route, enter, backTo] of [
    ["GARAGE from the title", "#mb-garage", "overlay"],
    ["YOUR CAR from the track picker", "#sel-car", "race-settings"],
  ]) {
    test(`${route}: no screen is left visible behind the panel`, async ({ page }) => {
      // The title screen and nothing else, as the boot used to leave it.
      await toMenu(page);
      if (enter === "#sel-car") {
        await page.locator("#mb-race").click();
        await page.locator("#select").waitFor({ state: "visible" });
      }
      await page.locator(enter).click();
      await page.locator("#carsetup").waitFor({ state: "visible" });

      // ALL FOUR KEYS. screens() returns four; this compared against three, and
      // toEqual is deep equality — so a 4-key object could never equal a 3-key
      // one, and BOTH routes failed with the same "+1" diff from the moment
      // "race-settings" was added to the helper for the backTo check below
      // without the expectation above it being updated. Spelled out rather than
      // relaxed to toMatchObject on purpose: a partial matcher here would have
      // silently stopped covering the very key that was just added, which is
      // how a screen bleeds through unnoticed in the first place.
      expect(await screens(page)).toEqual({
        overlay: true, select: true, carsetup: false, "race-settings": true });

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
    // The title, then the garage door. The team is deliberately NOT pinned:
    // these tests switch team and seat themselves, and assert on the change.
    await toMenu(page);
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
    // NO .toUpperCase(). This read the chip's own text and then transformed it
    // into something the chip cannot contain: the label is "#81 Oscar Piastri"
    // (js/garage/setup-sheet.js builds "#" + num + " " + name, and teams.js stores
    // "Oscar Piastri"), so the surname is "Piastri" and toContainText is
    // case-sensitive. There is no CSS text-transform on .sel-chip either, so
    // the uppercase form has never existed anywhere — the round trip could only
    // close if the DOM text were already caps. Deriving the surname FROM the
    // chip is right and survives a roster change; uppercasing it was the bug.
    const driver = await page.locator("#cs-driver .sel-chip.active").textContent();
    const surname = (driver ?? "").trim().split(" ").pop();

    await page.locator("#cs-done").click();
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    // The team summary lives in the GARAGE now — the select screen asks where
    // you race and nothing else, and YOUR CAR is the way in.
    await page.locator("#sel-car").click();
    await expect(page.locator("#carsetup")).toBeVisible();
    await page.locator('#cs-tabs [data-cs-cat="team"]').click();
    await expect(page.locator("#cs-driver .sel-chip.active")).toContainText(surname);
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
    await openSetup(page);
    await openCam(page);
    const ids = await page.locator("#cs-view [data-cs-view]").evaluateAll(
      (els) => els.map((e) => e.dataset.csView));
    expect(ids).toEqual(["hero", "front", "side", "rear", "top"]);
  });

  test("the panel starts shut, opens from CAMERA, and a preset shuts it again", async ({ page }) => {
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

  test("PAN walks the rig along the car, and a preset re-centres it", async ({ page }) => {
    await openSetup(page);
    await openCam(page);
    // Stop the turntable before sampling: it advances the azimuth every frame,
    // so a baseline taken while it runs makes every later az comparison a race.
    await page.locator("#cs-view-spin").click();
    expect((await cam(page)).spin).toBe(false);
    const start = await cam(page);
    expect(start.pan).toEqual([0, 0, 0]);

    // Strafe: moves the rig, leaves the orbit geometry alone. Orbit and zoom
    // can only ever circle one point — pan is the axis they cannot express.
    await page.locator("#cs-pan-right").click();
    const right = await cam(page);
    expect(Math.hypot(right.pan[0], right.pan[2]), "strafe moved the rig").toBeGreaterThan(0.01);
    expect(right.dist, "strafe is not zoom").toBeCloseTo(start.dist, 5);
    expect(right.az, "strafe is not orbit").toBeCloseTo(start.az, 5);
    expect(right.spin, "aiming stops the turntable").toBe(false);

    // Left is the inverse of right, so a round trip returns to centre.
    await page.locator("#cs-pan-left").click();
    const back = await cam(page);
    expect(Math.hypot(back.pan[0], back.pan[2])).toBeLessThan(1e-6);

    // Dolly runs along a different axis than strafe at the same azimuth.
    await page.locator("#cs-pan-fwd").click();
    const fwd = await cam(page);
    const dot = fwd.pan[0] * right.pan[0] + fwd.pan[2] * right.pan[2];
    expect(Math.abs(dot), "dolly is perpendicular to strafe").toBeLessThan(1e-6);

    // Bounded: mashing it must not fly the camera off into empty space.
    await page.evaluate(() => {
      const b = document.getElementById("cs-pan-fwd");
      for (let i = 0; i < 80; i++) b.click();
    });
    const far = await cam(page);
    expect(Math.abs(far.pan[0])).toBeLessThanOrEqual(2.2 + 1e-6);
    expect(Math.abs(far.pan[2])).toBeLessThanOrEqual(3.4 + 1e-6);

    // A preset is an absolute framing, so it drops the accumulated pan.
    await openCam(page);
    await page.locator('[data-cs-view="side"]').click();
    expect((await cam(page)).pan).toEqual([0, 0, 0]);
  });

  test("zoom is clamped and drag orbits without touching distance", async ({ page }) => {
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
