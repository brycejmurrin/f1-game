// @ts-check
// One-lap qualifying: the simulated field, the sheet, and the grid it produces.
// Qualifying is a `session`, not a game state — it reuses the time-trial path —
// so several of these also guard that a Grand Prix is left exactly as it was.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
}

// A championship weekend: SEASON -> select -> race settings -> QUALIFYING.
async function toQuali(page) {
  await boot(page);
  await page.locator("#mb-season").click();
  await page.locator("#sel-go").click();
  await page.locator("#rs-go").click();
  await expect(page.locator("#quali")).toBeVisible({ timeout: 20_000 });
}

const codes = () => [...document.querySelectorAll("#q-table .res-row")]
  .map((r) => r.querySelector(".res-name").innerText.trim().split(/\s+/)[0]);

// ── the session ──────────────────────────────────────────────────────────────

test.describe("Qualifying — the session", () => {
  test.use({ viewport: LANDSCAPE });

  test("a championship weekend opens with qualifying", async ({ page }) => {
    await toQuali(page);
    await expect(page.locator("#q-title")).toContainText("QUALIFYING");
    // Before the session you may drive it or take the simulated time.
    await expect(page.locator("#q-drive")).toBeVisible();
    await expect(page.locator("#q-sim")).toBeVisible();
    expect(await page.evaluate(() => window.__apex.info().session)).toBe("quali");
  });

  test("a one-off Grand Prix still goes straight to the race", async ({ page }) => {
    // The quick-blast mode keeps its P12 climb; only a weekend earns a grid.
    await boot(page);
    await page.locator("#mb-race").click();
    await page.locator("#sel-go").click();
    await page.locator("#rs-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 20_000 });
    await expect(page.locator("#quali")).toBeHidden();
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.session).toBe("race");
    const pos = await page.evaluate(() => window.__apex.fieldState().find((c) => c.isPlayer).pos);
    expect(pos).toBe(12);
  });

  test("the field is classified with a plausible spread", async ({ page }) => {
    await toQuali(page);
    await page.locator("#q-sim").click();
    const rows = await page.evaluate(() => [...document.querySelectorAll("#q-table .res-row")]
      .map((r) => r.innerText.replace(/\n/g, " ")));
    expect(rows.length).toBe(22);
    // Pole carries an absolute lap time; everyone else a gap to it.
    expect(rows[0]).toMatch(/\d+:\d\d\.\d+/);
    expect(rows[1]).toMatch(/\+\d+\.\d{3}/);
    // Pole-to-last on a ~90 s lap should read like qualifying, not a lottery.
    const last = parseFloat(rows[21].match(/\+(\d+\.\d{3})/)[1]);
    expect(last).toBeGreaterThan(0.4);
    expect(last).toBeLessThan(12);
  });

  test("the model is deterministic — same track, same times", async ({ page }) => {
    // Through the PROBE, not the button: once the session has been run the sheet
    // flips to .q-done and hides SIMULATE, so clicking it twice waits forever on
    // an element CSS has taken away. qualiSim() is the non-destructive read, and
    // it leaves a real weekend's classification alone.
    await toQuali(page);
    const a = await page.evaluate(() => window.__apex.qualiSim().map((r) => r.code + ":" + r.t));
    const b = await page.evaluate(() => window.__apex.qualiSim().map((r) => r.code + ":" + r.t));
    expect(b).toEqual(a);
    expect(a.length).toBe(22);
  });

  test("running the session hides SIMULATE — it cannot be re-rolled", async ({ page }) => {
    await toQuali(page);
    await expect(page.locator("#q-sim")).toBeVisible();
    await page.locator("#q-sim").click();
    await expect(page.locator("#q-sim")).toBeHidden();
    await expect(page.locator("#q-drive")).toBeHidden();
    await expect(page.locator("#q-go")).toBeVisible();
  });
});

// ── the grid ─────────────────────────────────────────────────────────────────

test.describe("Qualifying — the grid", () => {
  test.use({ viewport: LANDSCAPE });

  test("the race grid IS the qualifying order, car for car", async ({ page }) => {
    // The regression this exists for: the classification used to hand back the
    // car objects it captured, but startRace() calls makeCars() again, so those
    // references were orphans by the time the grid was built. The real field was
    // never placed — and fieldState() reported Teams.LIST order, which looks
    // plausible enough that checking only "who is on pole" passes.
    await toQuali(page);
    await page.locator("#q-sim").click();
    const qOrder = await page.evaluate(codes);
    await page.locator("#q-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 20_000 });
    const gridOrder = await page.evaluate(() => window.__apex.fieldState().map((c) => c.code));
    expect(gridOrder).toEqual(qOrder);
  });

  test("the player starts where they qualified, not P12", async ({ page }) => {
    await toQuali(page);
    await page.locator("#q-sim").click();
    const qPos = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#q-table .res-row")];
      return rows.findIndex((r) => r.classList.contains("you")) + 1;
    });
    expect(qPos).toBeGreaterThan(0);
    await page.locator("#q-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 20_000 });
    const gridPos = await page.evaluate(() => window.__apex.fieldState().find((c) => c.isPlayer).pos);
    expect(gridPos).toBe(qPos);
    expect(await page.evaluate(() => window.__apex.info().session)).toBe("race");
  });
});

// ── the lap-time model ───────────────────────────────────────────────────────

test.describe("Qualifying — lap times", () => {
  test.use({ viewport: LANDSCAPE });

  test("a faster car and a better driver both make the lap quicker", async ({ page }) => {
    await toQuali(page);
    await page.locator("#q-sim").click();
    const rows = await page.evaluate(() => [...document.querySelectorAll("#q-table .res-row")]
      .map((r, i) => ({ pos: i + 1, code: r.querySelector(".res-name").innerText.trim().split(/\s+/)[0] })));
    const at = (c) => rows.find((r) => r.code === c).pos;
    // Tier 4 back-markers cannot out-qualify the tier-0 car in a dry session.
    expect(at("RUS")).toBeLessThan(at("STR"));
    expect(at("LEC")).toBeLessThan(at("BOR"));
    // …and within a team, the higher-rated driver comes out ahead more often
    // than not, which is what the ratings are for.
    expect(at("VER")).toBeLessThan(at("HAD"));
  });

  test("the model responds to the circuit, not just the car", async ({ page }) => {
    // Monaco and Spa are ~30 s apart in reality; a length-independent estimate
    // would put them on top of each other.
    await boot(page);
    const t = await page.evaluate(() => {
      const out = {};
      for (const id of ["monaco", "spa"]) {
        window.__apex.race(id);
        out[id] = window.__apex.qualiSim()[0].t;
      }
      return out;
    });
    expect(t.spa).toBeGreaterThan(t.monaco * 1.2);
  });
});
