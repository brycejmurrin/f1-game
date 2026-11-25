// @ts-check
// Tests for car setup budget system:
// - Budget display at the free-play cap, Parts.freeBudget(team) = the works
//   build's cost + Parts.BUDGET (read from the page, not hardcoded: the cap
//   moves when the catalog grows). The works car is free, so a fresh sheet
//   reads "BUDGET: <BUDGET> / <freeBudget> cr remaining" (#6572).
// - Budget decrements on part selection
// - Over-budget parts show visual warning and can't be selected (without unlimited)
// - Unlimited toggle removes cap and persists via localStorage
//
// ONE BOOT PER WORKER (sharedTest), not one per test. Every test here opens the
// same garage; the old fixture booted the page 15 times to do it. openSetup()
// now walks the shared page back to the title (toMenu), forgets the storage
// keys the old init script cleared, and comes in through #mb-garage — the
// in-memory FREE BUILD flag and the car's team are re-pinned in the open garage
// because both are `let`s a fresh boot used to reset (tests/helpers/shared-page.js).
// The one reload left is the test whose SUBJECT is the reload. UNVERIFIED IN A
// BROWSER at conversion time.
import { sharedTest as test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { galleryPath } from "../helpers/output-paths.js";
import { toMenu, forgetStored, pinFreePlay, garageTeam, freeBuildOff } from "../helpers/shared-page.js";
import { waitGarageSheet } from "../helpers/garage-sheet.js";

async function waitReady(page) {
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
}

async function pickOpt(page, catId, optId) {
  await page.locator(`#cs-tabs [data-cs-cat="${catId}"]`).click();
  await page.locator(`#cs-options [data-cs-opt="${optId}"]`).click();
}

// Every price this file asserts is a DELTA over the team's works part: a free-play
// sheet reads over the works build (#6572), so swapping one row spends
// option.cost − works.cost, which may be negative.
async function budgetOf(page, team, swap) {
  return page.evaluate(([id, sw]) => {
    const t = Teams.LIST.find((x) => x.id === id), works = Parts.getFactorySetup(t);
    const base = Parts.getCost(works, t);
    return { allowance: Parts.BUDGET, cap: Parts.freeBudget(t), worksCost: base,
      delta: sw ? Parts.getCost(Object.assign({}, works, sw), t) - base : 0 };
  }, [team, swap || null]);
}

// The dearest row over the works part in each category for `team`, richest first.
async function upgradeRows(page, team) {
  return page.evaluate((id) => {
    const t = Teams.LIST.find((x) => x.id === id), works = Parts.getFactorySetup(t);
    const base = Parts.getCost(works, t);
    return Parts.CATALOG.map((cat) => {
      const rows = cat.options.filter((o) => Parts.isOptionAvailable(o, t))
        .map((o) => ({ cat: cat.id, id: o.id, d: Parts.getCost(Object.assign({}, works, { [cat.id]: o.id }), t) - base }))
        .sort((a, b) => b.d - a.d);
      return { cat: cat.id, rows };
    }).filter((c) => c.rows.length && c.rows[0].d > 0).sort((a, b) => b.rows[0].d - a.rows[0].d);
  }, team);
}

async function openSetup(page, team = "mclaren") {
  // Back to the title from wherever the previous test stopped, then the same
  // clean-storage start the old addInitScript gave a fresh page — done on the
  // LIVE page, which means the store's cache has to forget the keys too. (The
  // init-script version cannot work here at all: it only runs on the NEXT
  // navigation, and a shared page has none — docs/TESTING.md §sharedTest.)
  await toMenu(page);
  await forgetStored(page, ["parts.*", "unlimitedBudget"]);
  // Empty factory sheet, not a miss: forgetStored of parts.* would otherwise
  // let GarageDefaults fill the team's signature kit. Either way the sheet
  // reads over the works build, which the free-play cap already pays for.
  await pinFreePlay(page, { team, click: false });
  // THE GARAGE DOOR, not the race flow. This used to walk mb-race -> select ->
  // sel-go, which builds the circuit picker and then the track itself before it
  // ever reaches the screen these tests are about. Measured on this box:
  // boot 18.8 s, then the race flow 27.6 s vs `mb-garage` 11.1 s — the same
  // #carsetup either way, because openGarage("menu") only sets the camera and
  // where DONE returns to (js/game.js openGarage), and no test in this file
  // clicks DONE. 16 s a test back, across 14 tests, on a file whose own header
  // records 62-103 s against a 120 s budget and which had five tests cross it.
  //
  // A SHARED PAGE was once rejected here as "not worth it: one boot plus a
  // leave-and-re-enter is ~25 s against ~30 s for a fresh page". That sum
  // charged the boot to every test; on sharedTest the boot is paid once per
  // WORKER, so the per-test cost is the re-entry alone. Measure it
  // (docs/TESTING.md §navigation) — this conversion was not run in a browser.
  await page.locator("#mb-garage").click();
  await waitGarageSheet(page);
  // Two `let`s the forgotten keys cannot reach: the team the garage shows and
  // FREE BUILD. A fresh boot read both out of empty storage; the shared page
  // has whatever the last test chose.
  await garageTeam(page, team);
  await freeBuildOff(page);
  // STOP THE RENDER LOOP for the click-heavy part. The garage draws a live
  // turntable and getSetupPreviewMesh() re-keys on partsVisualKey, so every
  // option click rebuilt the car mesh and repainted the livery atlas at
  // SwiftShader speed. That is this file's whole cost — the tests that PICK
  // parts measured 88-122 s against 1-18 s for the ones that only read the DOM,
  // and this file's header already recorded five crossing a 120 s budget.
  //
  // The gallery captures still need a drawn car, so shot() below turns it back
  // on for the frame it takes. Do not screenshot without it.
  await page.evaluate(() => window.__apex.headless(true));
}

// A gallery capture, with a car in it.
//
// TWO problems, one helper. The loop is stopped above, and an undrawn canvas
// keeps its LAST frame — so a bare screenshot here is a black or stale car.
// And even with the loop running, this file was ALREADY capturing the wrong
// screen: budget-default.png and budget-unlimited-persisted.png were the TITLE
// MENU on every run, while the page underneath was demonstrably on the garage
// (probed at capture time: carsetup visible, overlay hidden, the budget text
// correct). The PNG disagreed with the DOM because Chromium had not committed
// the change — the same rAF starvation wait-polling.test.mjs documents for
// timeouts, and the five captures that came out right are the ones whose extra
// clicks happened to give the compositor time. Luck, not design.
//
// So: draw, WAIT FOR REAL FRAMES, capture, stop again. The rAF wait is what
// fixes the stale-compositor half, and it is bounded — a starved rAF must not
// hang the test, so the timer resolves it either way and a capture that was
// going to be wrong is no worse than the one this replaced.
async function shot(page, name) {
  await page.evaluate(() => window.__apex.headless(false));
  await page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    const done = () => resolve();
    setTimeout(done, 4000);            // hard bound: never hang on a starved rAF
    const tick = () => (++n >= 3 ? done() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }));
  await page.screenshot({ path: galleryPath("parts-budget", name) });
  await page.evaluate(() => window.__apex.headless(true));
}

const readFill = (page) => page.locator("#cs-budget-fill").evaluate((el) =>
  parseFloat((/scaleX\(([^)]+)\)/.exec(el.style.transform) || [0, "NaN"])[1]));

test.describe("Budget system — display", () => {
  test("shows the full cap at all defaults", async ({ page }) => {
    await openSetup(page);
    // Read the cap from Parts rather than hardcoding it — the budget rises when
    // the catalog gains options, and a literal here just breaks on that.
    const b = await budgetOf(page, "mclaren");
    const text = await page.locator("#cs-budget").textContent();
    // The works car is free: at defaults the whole allowance remains, against
    // the works cost + allowance cap (setup-sheet.js renders
    // "BUDGET: <remaining> / <cap> cr remaining").
    expect(b.cap).toBe(b.worksCost + b.allowance);
    expect(text).toContain(b.allowance + " / " + b.cap + " cr remaining");
    await shot(page, "budget-default.png");
  });

  test("budget label has no 'over' class at defaults", async ({ page }) => {
    await openSetup(page);
    const cls = await page.locator("#cs-budget").getAttribute("class");
    expect(cls ?? "").not.toContain("over");
  });

  test("budget bar fill is the works car's share of the cap at defaults", async ({ page }) => {
    await openSetup(page);
    // The bar is spent / cap (setup-sheet.js), and a fresh sheet has spent the
    // works build: the bar starts at worksCost / (worksCost + BUDGET), not 0.
    const b = await budgetOf(page, "mclaren");
    const fill = await readFill(page);
    expect(fill).toBeCloseTo(b.worksCost / b.cap, 4);
  });
});

test.describe("Budget system — part selection", () => {
  test("selecting the race engine spends exactly its price over the works engine", async ({ page }) => {
    await openSetup(page);
    await pickOpt(page, "engine", "race");
    // Read the prices from the catalog, like the cap above. Hardcoding it pinned
    // 160 cr, and the ladder re-space repriced the row — a spec that fails
    // because a part is cheaper is measuring the number, not the behaviour.
    // The swap is priced against the works engine it replaces (#6572), so it
    // can refund: McLaren's race engine is cheaper than its works PU.
    const b = await budgetOf(page, "mclaren", { engine: "race" });
    const text = await page.locator("#cs-budget").textContent();
    expect(text).toContain((b.allowance - b.delta) + " / " + b.cap + " cr remaining");
    await shot(page, "budget-race-engine.png");
  });

  test("budget fill bar increases after selecting a paid part", async ({ page }) => {
    await openSetup(page);
    const before = await readFill(page);
    // The dearest engine over the works one: a swap that costs, not one that refunds.
    const engine = (await upgradeRows(page, "mclaren")).find((c) => c.cat === "engine");
    expect(engine, "mclaren has an engine dearer than its works PU").toBeTruthy();
    await pickOpt(page, "engine", engine.rows[0].id);
    const b = await budgetOf(page, "mclaren", { engine: engine.rows[0].id });
    const after = await readFill(page);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeCloseTo((b.worksCost + b.delta) / b.cap, 4);
  });

  test("parts that exceed budget show over-budget class", async ({ page }) => {
    // HAAS, not McLaren: the allowance is spent over the WORKS build (#6572),
    // and McLaren's works kit is so dear that every upgrade above it together
    // stays under the 780 allowance — nothing can ever be over budget there.
    // Haas has the cheapest works build, so its upgrades clear the allowance.
    // Four swaps at SwiftShader speed: the same budget as the 'over' test below.
    test.setTimeout(240_000);
    await openSetup(page, "haas");
    // Spend, at normal prices, until the dearest engine no longer fits: richest
    // category first, the dearest row in it that still fits. Rows are read from
    // the ladder, so they move with it.
    const cats = await upgradeRows(page, "haas");
    const engineMax = cats.find((c) => c.cat === "engine").rows[0].d;
    let left = (await budgetOf(page, "haas")).allowance;
    for (const c of cats) {
      if (left < engineMax) break;
      if (c.cat === "engine") continue;
      const r = c.rows.find((x) => x.d > 0 && x.d <= left);
      if (!r) continue;
      await pickOpt(page, r.cat, r.id);
      left -= r.d;
    }
    expect(left, "the picks leave less than the dearest engine upgrade").toBeLessThan(engineMax);
    // Switch to engine so over-budget options are visible in #cs-options
    await page.locator('#cs-tabs [data-cs-cat="engine"]').click();
    const overBudgetCount = await page.locator("#cs-options .cs-opt.over-budget").count();
    expect(overBudgetCount).toBeGreaterThan(0);
    await shot(page, "budget-over-budget.png");
  });

  test("budget label gets 'over' class when spending exceeds the cap", async ({ page }) => {
    // FOUR PART SWAPS IS THE ARITHMETIC MINIMUM, so this test cannot be made
    // cheaper the way the rest of the file was. HAAS, as above: the allowance
    // is spent over the works build (#6572), and McLaren's upgrades above its
    // works kit never add up to the 780 allowance. Summing Haas's dearest
    // upgrade in each category, richest first (2026-11-25 ladder: tyres 205,
    // ers 200, exhaust 200, floor 190), only the fourth crosses. Every swap
    // rebuilds the car mesh and repaints the bay, and that is the test, not
    // overhead around it. Measured 133.2 s at one worker for the McLaren
    // version; the 120 s default is the only thing it fails.
    test.setTimeout(240_000);
    await openSetup(page, "haas");
    // Unlimited mode to select a combo past the cap, then disable to reveal it.
    await page.locator("#cs-unlimited").click();
    const cats = await upgradeRows(page, "haas");
    let spent = 0;
    const allowance = (await budgetOf(page, "haas")).allowance;
    for (const c of cats) {
      if (spent > allowance) break;
      await pickOpt(page, c.cat, c.rows[0].id);
      spent += c.rows[0].d;
    }
    expect(spent, "the dearest upgrades clear the allowance").toBeGreaterThan(allowance);
    await page.locator("#cs-unlimited").click();
    const cls = await page.locator("#cs-budget").getAttribute("class");
    expect(cls).toContain("over");
    await shot(page, "budget-exceeded.png");
  });
});

test.describe("Budget system — unlimited toggle", () => {
  test("unlimited button shows FREE BUILD text initially", async ({ page }) => {
    await openSetup(page);
    const text = await page.locator("#cs-unlimited").textContent();
    expect(text).toContain("FREE BUILD");
    expect(text).not.toContain("ON");
  });

  test("clicking unlimited button enables FREE BUILD mode", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain("no budget limit");
    await shot(page, "budget-unlimited-on.png");
  });

  test("unlimited mode hides budget fill bar", async ({ page }) => {
    await openSetup(page);
    // Buy a part FIRST, so the bar is off zero for a reason the test controls
    // (a fresh sheet already reads the works share of the cap, #6572).
    await pickOpt(page, "engine", "race");
    const fill = () => page.locator("#cs-budget-fill").evaluate((el) => el.style.transform);
    expect(await fill(), "a paid part moves the bar off zero").toMatch(/scaleX\(0\.[1-9]/);
    await page.locator("#cs-unlimited").click();
    await expect(page.locator("#cs-unlimited")).toHaveClass(/\bon\b/);
    expect(await fill()).toMatch(/scaleX\(0\)/);
  });

  test("unlimited button gets 'on' class when active", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    const cls = await page.locator("#cs-unlimited").getAttribute("class");
    expect(cls).toContain("on");
  });

  test("unlimited mode removes over-budget option classes", async ({ page }) => {
    await openSetup(page);
    // First fill up the budget so something is over-budget
    await pickOpt(page, "ers", "overcharge");
    await pickOpt(page, "gearbox", "f1_spec");
    await pickOpt(page, "fuel", "custom_formula");
    // Now enable unlimited
    await page.locator("#cs-unlimited").click();
    await page.locator('#cs-tabs [data-cs-cat="engine"]').click();
    const overBudgetCount = await page.locator("#cs-options .cs-opt.over-budget").count();
    expect(overBudgetCount).toBe(0);
    await shot(page, "budget-unlimited-no-over.png");
  });

  test("unlimited state persists after page reload", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    // Reload, then back in through the garage door. This test pays for TWO
    // openings and was the longest in the file at 169 s; the flag surviving a
    // reload is what it is about, not the route back to the screen.
    await page.reload();
    await waitReady(page);
    await page.locator("#mb-garage").click();
    await waitGarageSheet(page);
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain("no budget limit");
    await shot(page, "budget-unlimited-persisted.png");
  });

  test("toggling unlimited OFF restores normal budget display", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click(); // ON
    await page.locator("#cs-unlimited").click(); // OFF
    const b = await budgetOf(page, "mclaren");
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain(b.allowance + " / " + b.cap + " cr remaining");
    const cls = await page.locator("#cs-unlimited").getAttribute("class");
    expect(cls).not.toContain(" on");
  });
});
