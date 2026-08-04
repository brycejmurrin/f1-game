// @ts-check
// CAREER mode: the save, the mode axes, the hub, and the isolation guarantees
// that keep Grand Prix and Time Trial untouched by a career existing.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
}

// A career started through the hook rather than the setup screen — most specs
// care about what a career DOES, not how it was created.
async function startCareer(page, opts) {
  await page.evaluate((o) => window.__apex.career(o), opts || { teamId: "haas", seat: 1, seed: 4242 });
}

// From the hub to the grid. A career weekend now qualifies first, so #rs-go
// opens the qualifying sheet rather than starting the race; SIMULATE takes the
// modelled time and TO THE GRID starts it.
async function goRacing(page) {
  await page.locator("#cr-go").click();
  await page.locator("#rs-go").click();
  await expect(page.locator("#quali")).toBeVisible({ timeout: 20_000 });
  await page.locator("#q-sim").click();
  await page.locator("#q-go").click();
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 20_000 });
}

// ── mode axes ────────────────────────────────────────────────────────────────

test.describe("Career — mode", () => {
  test.use({ viewport: LANDSCAPE });

  test("flow/session replace the old booleans without changing their meaning", async ({ page }) => {
    await boot(page);
    const menu = await page.evaluate(() => window.__apex.info());
    expect(menu.flow).toBe("gp");
    expect(menu.session).toBe("race");
    expect(menu.seasonMode).toBe(false);
    expect(menu.timeTrial).toBe(false);
  });

  test("a career is a championship: seasonMode stays true inside one", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.flow).toBe("career");
    expect(info.seasonMode).toBe(true);   // the derived view — career runs a calendar
    expect(info.timeTrial).toBe(false);
    expect(info.career).toBe(true);
  });

  test("leaving a career for a Grand Prix clears the flow", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await page.locator("#cr-back").click();
    await page.locator("#mb-race").click();
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.flow).toBe("gp");
    expect(info.seasonMode).toBe(false);
  });
});

// ── the save ─────────────────────────────────────────────────────────────────

test.describe("Career — save", () => {
  test.use({ viewport: LANDSCAPE });

  test("starting a career writes a versioned save", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.career")));
    expect(saved.v).toBe(1);
    expect(saved.flavour).toBe("driver");
    expect(saved.team).toBe("haas");
    expect(saved.year).toBe(2026);
    expect(saved.season.round).toBe(0);
    expect(saved.money).toBeGreaterThan(0);
    expect(saved.deal.left).toBe(1);            // the first contract is always one season
    expect(saved.owned.length).toBeGreaterThan(0);   // seeded with the team's factory car
  });

  test("the save survives a reload and the button offers to continue", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    const before = await page.evaluate(() => window.__apex.careerState());
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const after = await page.evaluate(() => window.__apex.careerState());
    expect(after.team).toBe(before.team);
    expect(after.money).toBe(before.money);
    await expect(page.locator("#mb-career .mb-label")).toHaveText("CONTINUE CAREER");
  });

  test("a save with no version field migrates instead of being discarded", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.career", JSON.stringify({
        flavour: "driver", team: "williams", seat: 0, money: 500,
        // legacy: display-code point keys, and no `v`, `owned` or `driver`
        season: { round: 3, pts: { SAI: 12 }, teamPts: { williams: 12 } },
      }));
    });
    await boot(page);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.career")));
    expect(saved.v).toBe(1);
    expect(saved.season.pts["williams:0"]).toBe(12);   // remapped onto the stable id
    expect(saved.season.pts.SAI).toBeUndefined();
    expect(Array.isArray(saved.owned)).toBe(true);
    expect(saved.driver.code).toBe("YOU");
    expect(saved.season.round).toBe(3);                // progress preserved
  });

  test("migrating a career does NOT touch the standalone season save", async ({ page }) => {
    // The two championships have the same shape; the career one must never be
    // written back over apex26.season.
    await page.addInitScript(() => {
      localStorage.setItem("apex26.season", JSON.stringify({
        round: 7, pts: { "mclaren:0": 99 }, teamPts: { mclaren: 99 }, driverCodes: {},
      }));
      localStorage.setItem("apex26.career", JSON.stringify({
        flavour: "driver", team: "haas", seat: 1, money: 500,
        season: { round: 2, pts: { "haas:1": 4 }, teamPts: { haas: 4 } },
      }));
    });
    await boot(page);
    const season = await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.season")));
    expect(season.round).toBe(7);
    expect(season.pts["mclaren:0"]).toBe(99);
  });
});

// ── isolation: a career must not change free play ────────────────────────────

test.describe("Career — isolation", () => {
  test.use({ viewport: LANDSCAPE });

  test("the career garage is a separate build from the free-play one", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.parts.haas", JSON.stringify({ engine: "stock", aero: "low" }));
    });
    await boot(page);
    await startCareer(page, { teamId: "haas", seat: 1, seed: 1 });
    const changed = await page.evaluate(() => {
      const c = window.__apex.career();
      c.fitted.aero = "high";
      return JSON.parse(localStorage.getItem("apex26.parts.haas"));
    });
    expect(changed.aero).toBe("low");   // untouched by the career build
  });

  test("career team development does not reach a Grand Prix", async ({ page }) => {
    // The save is loaded at boot and stays loaded, so this is the guard that its
    // RULES stay switched off outside career. tierV is the one number career
    // development moves, so read it per car directly rather than inferring it
    // from lap positions (which also move when the career changes your team).
    const tierVs = () => {
      window.__apex.seed(99);
      window.__apex.race("monza");
      const out = {};
      for (let i = 0; i < 24; i++) {
        const c = window.__apex.carAt(i);
        if (!c) break;
        out[c.team + ":" + c.seat] = c.tierV;
      }
      return out;
    };
    await boot(page);
    const before = await page.evaluate(tierVs);
    // Give the career development big enough that any leak is unmissable.
    await page.evaluate(() => {
      window.__apex.career({ teamId: "haas", seat: 1, seed: 7 });
      const c = window.__apex.career();
      c.tdev.mercedes = 8; c.tdev.haas = -8;
    });
    await page.locator("#cr-back").click();
    const after = await page.evaluate(tierVs);
    expect(after).toEqual(before);
  });

  test("…but it DOES reach the career itself", async ({ page }) => {
    // The other half of the same guarantee: inside a career the development is
    // real, or the whole progression arc is cosmetic.
    await boot(page);
    await page.evaluate(() => {
      window.__apex.career({ teamId: "haas", seat: 1, seed: 7 });
      window.__apex.career().tdev.mercedes = 8;
    });
    // Go racing through the hub — __apex.race() is explicitly a Grand Prix and
    // would switch the flow back to gp.
    await goRacing(page);
    const merc = await page.evaluate(() => {
      for (let i = 0; i < 24; i++) {
        const c = window.__apex.carAt(i);
        if (c && c.team === "mercedes") return c.tierV;
      }
      return null;
    });
    expect(merc).toBeGreaterThan(1);   // TIER_V[0] is 1.0; +8 dev lifts it
  });
});

// ── the hub ──────────────────────────────────────────────────────────────────

test.describe("Career — hub", () => {
  test.use({ viewport: LANDSCAPE });

  test("with no save the screen offers a new career; starting one opens the hub", async ({ page }) => {
    await boot(page);
    await page.locator("#mb-career").click();
    await expect(page.locator("#career")).toBeVisible();
    await expect(page.locator("#cr-title")).toHaveText("NEW CAREER");
    await expect(page.locator("#cr-go")).toHaveText("START CAREER");
    // Only teams that would actually sign a rookie are offered.
    const tiles = page.locator(".cr-teamtile");
    expect(await tiles.count()).toBeGreaterThan(2);
    await page.locator("#cr-go").click();
    await expect(page.locator("#cr-title")).toHaveText("CAREER 2026");
    await expect(page.locator("#cr-go")).toHaveText("GO RACING");
  });

  test("the hub reports balance, reputation and the round", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await expect(page.locator("#career")).toBeVisible();
    const meters = await page.locator(".cr-meter-lbl").allTextContents();
    expect(meters).toEqual(["BALANCE", "REPUTATION", "ROUND"]);
    await expect(page.locator("#cr-meters")).toContainText("1 / 24");
  });

  test("the hub replaces #select — GO RACING goes straight to race settings", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await page.locator("#cr-go").click();
    await expect(page.locator("#race-settings")).toBeVisible();
    await expect(page.locator("#select")).toBeHidden();
    // …and cancelling comes back to the hub, not to #select.
    await page.locator("#rs-cancel").click();
    await expect(page.locator("#career")).toBeVisible();
    await expect(page.locator("#select")).toBeHidden();
  });

  test("the garage returns to the hub rather than the select screen", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await page.locator("#cr-garage").click();
    await expect(page.locator("#carsetup")).toBeVisible();
    await page.locator("#cs-done").click();
    await expect(page.locator("#career")).toBeVisible();
    await expect(page.locator("#select")).toBeHidden();
  });
});

// ── a race weekend ───────────────────────────────────────────────────────────

test.describe("Career — a round", () => {
  test.use({ viewport: LANDSCAPE });

  test("finishing a round pays out, advances the calendar and returns to the hub", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    const money0 = await page.evaluate(() => window.__apex.careerState().money);

    await goRacing(page);
    await page.evaluate(() => window.__apex.park(0.9));
    await page.evaluate(() => window.__apex.finishRace());
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });

    const st = await page.evaluate(() => window.__apex.careerState());
    expect(st.round).toBe(1);                 // the calendar moved on
    expect(st.money).toBeGreaterThan(money0); // prize + salary landed

    // NEXT takes you back to the hub, not straight into the next race.
    await page.locator("#res-next").click();
    await expect(page.locator("#career")).toBeVisible();
    await expect(page.locator("#cr-meters")).toContainText("2 / 24");
  });

  test("the player takes the contracted seat on the grid", async ({ page }) => {
    await boot(page);
    await startCareer(page, { teamId: "haas", seat: 1, code: "ZZZ", name: "Test Driver", seed: 3 });
    await goRacing(page);
    const grid = await page.evaluate(() => window.__apex.fieldState().map((c) => c.code));
    expect(grid).toContain("ZZZ");
    expect(grid).not.toContain("BEA");   // the driver you replaced
    expect(grid).toContain("OCO");       // your team-mate stays
  });
});

// ── driver ratings ───────────────────────────────────────────────────────────
// Ratings apply in EVERY mode, so most of these run in a plain Grand Prix.

test.describe("Driver ratings", () => {
  test.use({ viewport: LANDSCAPE });

  const skills = () => {
    window.__apex.seed(5);
    window.__apex.race("monza");
    const out = [];
    for (let i = 0; i < 24; i++) {
      const c = window.__apex.carAt(i);
      if (!c) break;
      out.push(c.code + ":" + c.skill);
    }
    return out;
  };

  test("the same seed produces the same grid — the RNG stream is unchanged", async ({ page }) => {
    // driverSkill() must draw simRnd() unconditionally. If the draw ever moves
    // inside a branch, the stream position after makeCars() shifts and every
    // seeded spec in the suite starts lying. This is that guard.
    await boot(page);
    const a = await page.evaluate(skills);
    const b = await page.evaluate(skills);
    expect(b).toEqual(a);
    expect(a.length).toBeGreaterThan(20);
  });

  test("ratings differentiate the field, fastest to slowest", async ({ page }) => {
    await boot(page);
    const grid = await page.evaluate(() => {
      window.__apex.seed(5); window.__apex.race("monza");
      const g = [];
      for (let i = 0; i < 24; i++) { const c = window.__apex.carAt(i); if (!c) break; g.push(c); }
      return g.map((c) => ({ code: c.code, skill: c.skill }));
    });
    const by = (c) => grid.find((x) => x.code === c);
    expect(by("VER").skill).toBeGreaterThan(by("LIN").skill);
    expect(by("VER").skill).toBeGreaterThan(by("STR").skill);
    // …but the spread stays narrow enough that the CAR still dominates: the whole
    // field sits inside the band the old random roll used.
    const all = grid.map((c) => c.skill);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0.9);
    expect(Math.max(...all)).toBeLessThanOrEqual(1.0);
  });

  test("consistency is a variance axis, not a speed one", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      ver: window.__apex.ratings("VER"), lin: window.__apex.ratings("LIN"),
    }));
    expect(r.ver.consistency).toBeGreaterThan(r.lin.consistency);
    expect(r.ver.pace).toBeGreaterThan(r.lin.pace);
    expect(r.ver.overall).toBeGreaterThan(r.lin.overall);
  });

  test("an unknown driver code still resolves to a full rating", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => window.__apex.ratings("ZZZ"));
    for (const k of ["pace", "craft", "awareness", "consistency", "experience"]) {
      expect(Number.isFinite(r[k])).toBe(true);
      expect(r[k]).toBeGreaterThan(0);
      expect(r[k]).toBeLessThanOrEqual(100);
    }
  });

  test("career development moves a rating inside the career, not outside it", async ({ page }) => {
    await boot(page);
    const gpBefore = await page.evaluate(() => window.__apex.ratings("OCO").pace);
    await page.evaluate(() => {
      window.__apex.career({ teamId: "haas", seat: 1, seed: 11 });
      window.__apex.career().dev["haas:0"] = { pace: 9 };   // OCO is haas seat 0
    });
    // Inside the career the delta is live…
    await goRacing(page);
    const inCareer = await page.evaluate(() => {
      for (let i = 0; i < 24; i++) {
        const c = window.__apex.carAt(i);
        if (c && c.code === "OCO") return c.ratings.pace;
      }
      return null;
    });
    expect(inCareer).toBe(gpBefore + 9);

    // …and gone again in a Grand Prix, which never inherits career development.
    const gpAfter = await page.evaluate(() => {
      window.__apex.race("monza");
      for (let i = 0; i < 24; i++) {
        const c = window.__apex.carAt(i);
        if (c && c.code === "OCO") return c.ratings.pace;
      }
      return null;
    });
    expect(gpAfter).toBe(gpBefore);
  });
});
