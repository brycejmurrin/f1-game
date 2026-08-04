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
    // Slot 0 — careers live under apex26.career.0..2 now, one key each.
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.career.0")));
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
    // ALSO the single-save era's storage layout: this writes the old
    // `apex26.career` key, which now has to land in slot 0 on the way through.
    await page.addInitScript(() => {
      localStorage.setItem("apex26.career", JSON.stringify({
        flavour: "driver", team: "williams", seat: 0, money: 500,
        // legacy: display-code point keys, and no `v`, `owned` or `driver`
        season: { round: 3, pts: { SAI: 12 }, teamPts: { williams: 12 } },
      }));
    });
    await boot(page);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.career.0")));
    expect(saved.v).toBe(1);
    expect(saved.season.pts["williams:0"]).toBe(12);   // remapped onto the stable id
    expect(saved.season.pts.SAI).toBeUndefined();
    expect(Array.isArray(saved.owned)).toBe(true);
    expect(saved.driver.code).toBe("YOU");
    expect(saved.season.round).toBe(3);                // progress preserved
    // The legacy key is CLEARED, and stays cleared. migrateCareer() used to end
    // in store.set("career", …), so reading slot 0 wrote the save straight back
    // under the old name — a stale duplicate an older build would happily load.
    const legacy = await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.career")));
    expect(legacy).toBeNull();
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.career")))).toBeNull();
    expect(await page.evaluate(() => window.__apex.career().team)).toBe("williams");
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

// ── the garage as an R&D tree (phase 4) ──────────────────────────────────────

test.describe("Career — the garage", () => {
  test.use({ viewport: LANDSCAPE });

  // The garage is opened from the hub, and its rows are rebuilt on every mutation.
  async function openGarage(page) {
    await page.evaluate(() => document.getElementById("cr-garage").click());
    await expect(page.locator("#carsetup")).toBeVisible();
  }
  // The first unowned row in the open category, or null. Rows are <button>s, and
  // the canvas renders behind the sheet, so click through evaluate() — Playwright's
  // actionability check can spin on a live-rendering page (see menu-survey.spec.js).
  const firstLocked = () => {
    const r = document.querySelector("#cs-options .cs-opt.locked");
    return r ? { id: r.dataset.csOpt, cat: r.dataset.csCat, cost: r.querySelector(".cs-opt-cost").innerText } : null;
  };

  test("FREE BUILD is hidden in career and offered outside it", async ({ page }) => {
    // In-page clicks: the game canvas renders continuously behind these sheets and
    // Playwright's actionability check can spin on it (see menu-survey.spec.js).
    const tap = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
    await boot(page);
    await tap("mb-race");
    await tap("sel-setup");
    await expect(page.locator("#carsetup")).toBeVisible();
    await expect(page.locator("#cs-unlimited")).toBeVisible();
    await tap("cs-done");

    await startCareer(page);
    await tap("cr-garage");
    await expect(page.locator("#carsetup")).toBeVisible();
    // An unlimited-budget cheat would hand away the economy the mode is built on.
    await expect(page.locator("#cs-unlimited")).toBeHidden();
  });

  test("the header reports the balance and the fitted cap, not the flat budget", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await openGarage(page);
    const txt = await page.locator("#cs-budget").innerText();
    expect(txt).toContain("BALANCE");
    expect(txt).toContain("FITTED");
    expect(txt).not.toContain("BUDGET:");
  });

  test("an unresearched part lists as locked, quoting a research price", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await openGarage(page);
    const row = await page.evaluate(firstLocked);
    expect(row).not.toBeNull();
    // A locked row quotes what BUYING costs, not what fitting would charge.
    expect(row.cost).toMatch(/RESEARCH/);
  });

  test("with no money a locked row refuses, and the car is unchanged", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await page.evaluate(() => window.__apex.careerMoney(0));
    await openGarage(page);
    const row = await page.evaluate(firstLocked);
    expect(row).not.toBeNull();
    const before = await page.evaluate((r) => JSON.stringify(window.__apex.career().fitted[r.cat]), row);
    await page.evaluate((r) => document.querySelector(`.cs-opt[data-cs-opt="${r.id}"]`).click(), row);
    const after = await page.evaluate((r) => JSON.stringify(window.__apex.career().fitted[r.cat]), row);
    expect(after).toBe(before);
    const owned = await page.evaluate((r) => window.__apex.career().owned.includes(r.id), row);
    expect(owned).toBe(false);
  });

  test("researching deducts exactly cost x RESEARCH_MULT and unlocks the part", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await page.evaluate(() => window.__apex.careerMoney(99999));
    await openGarage(page);
    const row = await page.evaluate(firstLocked);
    expect(row).not.toBeNull();
    const before = await page.evaluate(() => window.__apex.careerState().money);
    const price = await page.evaluate((r) => {
      const cat = Parts.CATALOG.find((c) => c.id === r.cat);
      return Career.researchCost(cat.options.find((o) => o.id === r.id));
    }, row);
    await page.evaluate((r) => document.querySelector(`.cs-opt[data-cs-opt="${r.id}"]`).click(), row);
    const after = await page.evaluate(() => window.__apex.careerState().money);
    expect(before - after).toBe(price);
    const owned = await page.evaluate((r) => window.__apex.career().owned.includes(r.id), row);
    expect(owned).toBe(true);
  });

  test("nothing the career garage does touches the free-play build", async ({ page }) => {
    // The isolation guarantee: getTeamParts/saveTeamParts branch on the career, so
    // your career car and your Grand Prix car for the same team never meet.
    await page.addInitScript(() => {
      localStorage.setItem("apex26.parts.haas", JSON.stringify({ engine: "stock", aero: "low" }));
    });
    await boot(page);
    await startCareer(page, { teamId: "haas", seat: 1, seed: 3 });
    await page.evaluate(() => window.__apex.careerMoney(99999));
    await openGarage(page);
    const row = await page.evaluate(firstLocked);
    if (row) await page.evaluate((r) => document.querySelector(`.cs-opt[data-cs-opt="${r.id}"]`).click(), row);
    const free = await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.parts.haas")));
    expect(free).toEqual({ engine: "stock", aero: "low" });
  });
});

// ── MY TEAM (phase 6) ────────────────────────────────────────────────────────
// You own the eleventh team and drive one of its two cars. The other seat is a
// hire you pay for every round.

test.describe("Career — MY TEAM", () => {
  test.use({ viewport: LANDSCAPE });

  const startMyTeam = (page, opts) =>
    page.evaluate((o) => window.__apex.career(o),
      Object.assign({ flavour: "myteam", name: "Team Boss", code: "BOS", num: 8, seed: 55 }, opts || {}));

  test("the setup screen offers a driver market", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => document.getElementById("mb-career").click());
    await expect(page.locator("#career")).toBeVisible();
    // Switch to MY TEAM and the left column becomes the driver market.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll(".cr-flavour")].find((x) => x.innerText.includes("MY TEAM"));
      b.click();
    });
    const tiles = page.locator(".cr-teamtile");
    expect(await tiles.count()).toBeGreaterThan(3);
    await expect(page.locator("#cr-left")).toContainText("cr / round");
  });

  test("the fitted cap is a real number, not zero", async ({ page }) => {
    // The custom team has no factory preset, so its resolved build is the all
    // cost-0 DEFAULTS. Deriving the cap from that gave MY TEAM a 0 cr cap and
    // nothing in the garage could ever be fitted.
    await boot(page);
    await startMyTeam(page);
    const budget = await page.evaluate(() => window.__apex.careerState().budget);
    expect(budget).toBeGreaterThan(0);
    expect(budget).toBe(await page.evaluate(() => Career.MYTEAM_WORKS));
  });

  test("the team enters TWO cars — you and your hire", async ({ page }) => {
    await boot(page);
    await startMyTeam(page, { hire: "NKM" });
    await goRacing(page);
    const grid = await page.evaluate(() => window.__apex.fieldState().map((c) => c.code));
    expect(grid).toContain("BOS");     // you
    expect(grid).toContain("NKM");     // the driver you hired
    // 11 real teams x 2, plus your two.
    expect(grid.length).toBe(24);
  });

  test("the hire is paid every round, out of the balance", async ({ page }) => {
    await boot(page);
    await startMyTeam(page, { hire: "FER2" });     // the expensive one
    const wages = await page.evaluate(() => window.__apex.careerState().wages);
    expect(wages).toBeGreaterThan(0);
    await goRacing(page);
    const before = await page.evaluate(() => window.__apex.careerState().money);
    const r = await page.evaluate(() => window.__apex.careerSim(1));
    expect(r[0].wages).toBe(wages);
    const after = await page.evaluate(() => window.__apex.careerState().money);
    // Prize + salary in, wages out — the wage bill is genuinely deducted.
    expect(after).toBe(before + r[0].prize + r[0].salary + r[0].bonus
                       + (r[0].obj && r[0].obj.done ? await page.evaluate(() => Career.OBJ_BONUS) : 0)
                       - wages);
  });

  test("a cheaper hire leaves more to develop the car with", async ({ page }) => {
    // Compared through the wage bill rather than by running two whole careers:
    // settleRound deducting it is already covered above, so the balance after N
    // rounds follows arithmetically, and staging two weekends to re-derive that
    // pushed this case past the 120 s timeout for no extra confidence.
    await boot(page);
    const wagesFor = async (hire) => {
      await page.evaluate(() => window.__apex.careerReset());
      await startMyTeam(page, { hire });
      return page.evaluate(() => window.__apex.careerState().wages);
    };
    const cheap = await wagesFor("OKO");    // the cheapest free agent
    const dear = await wagesFor("FER2");    // the dearest
    expect(cheap).toBeGreaterThan(0);
    expect(dear).toBeGreaterThan(cheap);
  });

  test("a driver career has no roster and no wage bill", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    const st = await page.evaluate(() => window.__apex.careerState());
    expect(st.roster).toBeNull();
    expect(st.wages).toBe(0);
  });

  test("free play still fields ONE custom car", async ({ page }) => {
    // gridDrivers() must return team.drivers untouched outside a MY TEAM career,
    // or picking MY TEAM in a Grand Prix would silently add a second entry.
    await page.addInitScript(() => localStorage.setItem("apex26.team", "11"));
    await boot(page);
    await page.evaluate(() => { window.__apex.seed(2); window.__apex.race("monza"); });
    const grid = await page.evaluate(() => window.__apex.fieldState());
    const mine = grid.filter((c) => c.team === "custom");
    expect(mine.length).toBe(1);
  });

  test("MY TEAM is never offered a seat — you own the constructor", async ({ page }) => {
    // acceptOffer() moves career.team but leaves `flavour` at "myteam", so an
    // offer taken here put the player and their hired driver into a real team's
    // two seats and dropped the custom team off the grid: the career being played
    // stopped existing. The fix is that the offer is never made, and this is the
    // guard on it.
    await boot(page);
    await page.evaluate(() => window.__apex.careerReset());
    await startMyTeam(page, {});
    await goRacing(page);
    const after = await page.evaluate(() => {
      window.__apex.careerSim(24);
      window.__apex.careerRollover();
      const c = window.__apex.career();
      return { offers: c.offers.length, team: c.team, flavour: c.flavour,
               roster: c.roster ? c.roster.length : 0, year: c.year,
               left: c.deal ? c.deal.left : null };
    });
    expect(after.offers).toBe(0);
    // Still your team, still your driver, and the year did move on.
    expect(after.team).toBe("custom");
    expect(after.flavour).toBe("myteam");
    expect(after.roster).toBe(1);
    expect(after.year).toBe(2027);
    // An owner's deal has no clock: it cannot run down to a contract that expired.
    expect(after.left).toBe(1);
  });
});

// ── objectives, contracts and the rollover ───────────────────────────────────
// The long game. Most of these fast-forward through __apex.careerSim(), which
// settles rounds through the SAME championship award and Career.settleRound() a
// driven weekend uses — a full season is 24 real races otherwise. It reads the
// qualifying model, so a track and a grid have to be staged first: hence
// goRacing() before every sim.

test.describe("Career — objectives", () => {
  test.use({ viewport: LANDSCAPE });

  test("every round carries a brief, and the hub states it", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    const obj = await page.evaluate(() => window.__apex.careerState().obj);
    expect(obj).toBeTruthy();
    expect(obj.round).toBe(0);
    expect(["finish", "beatMate", "outQualMate", "points", "clean"]).toContain(obj.type);
    expect(obj.done).toBe(null);                 // not raced yet
    // Four SCALARS and no prose: the sentence is derived from a LABELS map at
    // render time, so it can be reworded later without a save migration.
    expect(Object.keys(obj).sort()).toEqual(["done", "round", "type", "value"]);
    await expect(page.locator("#cr-left")).toContainText("THIS ROUND");
  });

  test("the brief is drawn from the seed — a reload cannot reroll it", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    const before = await page.evaluate(() => window.__apex.careerState().obj);
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    await page.evaluate(() => window.__apex.career(true));
    expect(await page.evaluate(() => window.__apex.careerState().obj)).toEqual(before);
  });

  test("a settled round resolves the brief against the round it belonged to", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await goRacing(page);
    const r = await page.evaluate(() => window.__apex.careerSim(1)[0]);
    // endRace() advances the calendar BEFORE settling, so this is the guard that
    // the brief resolved is the one that was live for the race just run.
    expect(r.obj.round).toBe(0);
    expect(typeof r.obj.done).toBe("boolean");
    const saved = await page.evaluate(() => window.__apex.career());
    expect(saved.results[0].r).toBe(0);
    expect(saved.results[0].obj).toBe(r.obj.done);
    // …and the hub has already moved on to the next round's brief.
    expect(await page.evaluate(() => window.__apex.careerState().obj.round)).toBe(1);
  });

  test("a season draws a spread of briefs, not one kind over and over", async ({ page }) => {
    // Career.rnd is FNV-1a, and every key it draws on ENDS in the part that
    // varies — the round number here. FNV-1a's last multiply barely disturbs the
    // high bits, which is exactly the end `h / 2^32` reads, so without the
    // finalizer in rnd() this returned the SAME brief for all 24 rounds and every
    // season was missing at least one kind. This is that guard.
    await boot(page);
    await startCareer(page);
    await goRacing(page);
    const kinds = await page.evaluate(() =>
      [...new Set(window.__apex.careerSim(24).map((r) => r.obj.type))]);
    expect(kinds.length).toBeGreaterThanOrEqual(3);
  });

  test("meeting the brief pays 150 cr; missing it pays nothing", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await goRacing(page);
    const rounds = await page.evaluate(() => window.__apex.careerSim(12));
    // Twelve rounds of five brief types in a back-marker car must produce both
    // outcomes, or the objectives are decoration.
    expect(rounds.some((r) => r.obj.done)).toBe(true);
    expect(rounds.some((r) => !r.obj.done)).toBe(true);
    // The bonus rides on top of prize + salary + points bonus, so isolate it:
    // whatever the balance moved by, minus the three parts that always land.
    for (let i = 1; i < rounds.length; i++) {
      const r = rounds[i];
      const bonus = r.money - rounds[i - 1].money - r.prize - r.salary - r.bonus;
      expect(bonus).toBe(r.obj.done ? 150 : 0);
    }
  });
});

test.describe("Career — reputation", () => {
  test.use({ viewport: LANDSCAPE });

  test("a settled round moves reputation by result-vs-expectation plus the brief", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await goRacing(page);
    const r = await page.evaluate(() => {
      const st = window.__apex.careerState();
      return Object.assign({ rep0: st.rep, bar: st.deal.goal.value }, window.__apex.careerSim(1)[0]);
    });
    // The whole formula, restated: the result term is relative to the CAR (the
    // contract's own goal IS expectedFinish for this team), the brief term is flat.
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const expected = clamp((r.bar - r.pos) * 0.6, -4, 6) + (r.obj.done ? 2 : -2);
    expect(r.rep - r.rep0).toBeCloseTo(expected, 5);
  });

  test("the same finish is worth less in a better car", async ({ page }) => {
    // expectedFinish() encodes the tier, which is the entire mechanism: P8 for
    // Haas is over-delivery, P8 for Mercedes is under-delivery. Read the two bars
    // directly rather than trying to force two identical race results.
    await boot(page);
    const bars = await page.evaluate(() => {
      window.__apex.career({ teamId: "haas", seat: 1, seed: 1 });
      const haas = window.__apex.careerState().deal.goal.value;
      window.__apex.careerReset();
      window.__apex.career({ teamId: "mercedes", seat: 1, seed: 1 });
      return { haas, merc: window.__apex.careerState().deal.goal.value };
    });
    expect(bars.haas).toBeGreaterThan(bars.merc);
  });

  test("reputation stays inside 0..100 across a whole season", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await goRacing(page);
    const reps = await page.evaluate(() => window.__apex.careerSim(24).map((r) => r.rep));
    expect(reps.length).toBe(24);
    for (const r of reps) { expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(100); }
  });
});

test.describe("Career — the rollover", () => {
  test.use({ viewport: LANDSCAPE });

  // A whole season settled without driving it — the state most of these start from.
  async function fullSeason(page, opts) {
    await startCareer(page, opts);
    await goRacing(page);
    await page.evaluate(() => window.__apex.careerSim(24));
  }

  test("careerSim fills the season: 24 rounds, points on the board, money earned", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    const money0 = await page.evaluate(() => window.__apex.careerState().money);
    await goRacing(page);
    const rounds = await page.evaluate(() => window.__apex.careerSim(24));
    expect(rounds.length).toBe(24);
    expect(rounds[23].round).toBe(24);
    const st = await page.evaluate(() => window.__apex.careerState());
    expect(st.round).toBe(24);
    expect(st.money).toBeGreaterThan(money0);
    const c = await page.evaluate(() => window.__apex.career());
    expect(Object.keys(c.season.pts).length).toBeGreaterThan(10);   // a real championship
    expect(c.results.length).toBe(24);
    // A settled round is a settled round: the calendar is finished, which is what
    // unlocks the rollover.
    expect(await page.evaluate(() => window.__apex.career().season.round))
      .toBe(await page.evaluate(() => window.__apex.careerState().rounds));
  });

  test("the rollover archives the year, opens the next one and carries the money over", async ({ page }) => {
    await boot(page);
    await fullSeason(page);
    const before = await page.evaluate(() => window.__apex.careerState());
    const out = await page.evaluate(() => window.__apex.careerRollover());

    expect(out.champion).toBeTruthy();
    expect(out.history.length).toBe(1);
    expect(out.offers.length).toBeGreaterThanOrEqual(1);
    const past = out.history[0];
    expect(past.year).toBe(2026);
    expect(past.pos).toBeGreaterThan(0);
    expect(past.wins).toBeGreaterThanOrEqual(0);
    expect(past.podiums).toBeGreaterThanOrEqual(past.wins);

    const after = await page.evaluate(() => window.__apex.careerState());
    expect(after.year).toBe(2027);
    expect(after.round).toBe(0);
    expect(after.money).toBe(before.money);      // credits carry over; standings do not
    const c = await page.evaluate(() => window.__apex.career());
    expect(c.season.pts).toEqual({});
    expect(c.season.teamPts).toEqual({});
    expect(c.results).toEqual([]);
  });

  test("the reset championship is the SAME object game.js is holding", async ({ page }) => {
    // openCareer() does `season = c.season`, and that shared identity is why the
    // results and standings screens work in career with no career-specific branch.
    // Reassigning it in rollover() instead of clearing it in place would orphan
    // game.js's alias — and the failure would be invisible: the next race writes
    // its points into the dead 2026 object while the standings still render it.
    await boot(page);
    await fullSeason(page);
    await page.evaluate(() => window.__apex.careerRollover());
    const c = await page.evaluate(() => {
      window.__apex.career().offers = [];      // signing is not the subject here
      window.__apex.careerSim(1);              // writes through game.js's alias…
      return window.__apex.career();           // …and reads back off the save
    });
    expect(c.season.round).toBe(1);
    expect(Object.keys(c.season.pts).length).toBeGreaterThan(10);
  });

  test("history is capped at ten entries, oldest first off", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    const years = await page.evaluate(() => {
      for (let i = 0; i < 14; i++) window.__apex.careerRollover();
      return window.__apex.career().history.map((h) => h.year);
    });
    expect(years.length).toBe(10);
    expect(years[0]).toBe(2030);
    expect(years[9]).toBe(2039);
  });

  test("the rollover develops the grid: drivers drift, teams regress toward their tier", async ({ page }) => {
    await boot(page);
    await fullSeason(page);
    const dev = await page.evaluate(() => {
      window.__apex.careerRollover();
      const c = window.__apex.career();
      return { seats: Object.keys(c.dev).length, sample: Object.values(c.dev)[0] };
    });
    expect(dev.seats).toBeGreaterThan(15);              // every seat on the grid
    expect(Math.abs(dev.sample.pace)).toBeLessThanOrEqual(12);
    expect(dev.sample.experience).toBeGreaterThan(0);   // experience only ever climbs

    // Team development halves every winter, so a big delta must shrink, not hold.
    const tdev = await page.evaluate(() => {
      window.__apex.career().tdev.mclaren = 8;
      window.__apex.careerRollover();
      return window.__apex.career().tdev.mclaren || 0;
    });
    expect(Math.abs(tdev)).toBeLessThan(8);
  });

  test("a market swap reaches the actual grid through driverOverride", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    // 0-2 swaps a year by design, so one winter can legitimately draw none.
    const seats = await page.evaluate(() => {
      for (let i = 0; i < 8 && !Object.keys(window.__apex.career().seats).length; i++)
        window.__apex.careerRollover();
      return window.__apex.career().seats;
    });
    const keys = Object.keys(seats);
    expect(keys.length).toBeGreaterThanOrEqual(2);      // swaps come in pairs
    const c = await page.evaluate(() => window.__apex.career());
    expect(keys).not.toContain(c.team + ":" + c.seat);  // never your own seat

    // Sign whatever is on the table so the new season can start, then read the
    // BUILT grid: career.seats is only real if makeCars() honours it. The foot's
    // LABEL is stale here (the hub was rendered before these rollovers, and only
    // the debug hook can roll over without rebuilding it) — the handler is not,
    // and pending offers outrank everything else in it.
    await page.locator("#cr-go").click();
    await page.locator("#co-body .co-offer").first().click();
    await goRacing(page);
    const key = keys[0];
    const onGrid = await page.evaluate(([teamId, seat]) => {
      for (let i = 0; i < 24; i++) {
        const car = window.__apex.carAt(i);
        if (!car) break;
        if (car.team === teamId && car.seat === (seat | 0)) return car.code;
      }
      return null;
    }, key.split(":"));
    expect(onGrid).toBe(seats[key].code);
  });
});

test.describe("Career — contracts", () => {
  test.use({ viewport: LANDSCAPE });

  // A full season driven the way a player reaches the end of one: 23 rounds fast-
  // forwarded, the last one actually finished so the flow goes through #results
  // and NEXT, then END OF SEASON off the hub. That is the path the offers sheet
  // is really reached by, and it leaves the game on a menu rather than mid-race.
  async function toOffers(page, opts) {
    await startCareer(page, opts);
    await goRacing(page);
    await page.evaluate(() => window.__apex.careerSim(23));
    await page.evaluate(() => window.__apex.park(0.9));
    await page.evaluate(() => window.__apex.finishRace());
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    await page.locator("#res-next").click();
    await expect(page.locator("#career")).toBeVisible();
    await expect(page.locator("#cr-go")).toHaveText("END OF SEASON");
    await page.locator("#cr-go").click();
    await expect(page.locator("#career-offers")).toBeVisible();
  }

  test("the end of a season always puts at least one seat on the table", async ({ page }) => {
    await boot(page);
    await toOffers(page);
    const c = await page.evaluate(() => window.__apex.career());
    expect(c.offers.length).toBeGreaterThanOrEqual(1);
    expect(c.offers.length).toBeLessThanOrEqual(3);
    for (const o of c.offers) {
      expect(typeof o.teamId).toBe("string");
      expect(o.years).toBeGreaterThanOrEqual(1);
      expect(o.years).toBeLessThanOrEqual(3);
      expect(o.salary).toBeGreaterThan(0);
      expect(o.goal.value).toBeGreaterThan(0);
    }
    // Your own team always talks first, so a career can never be left with no seat.
    expect(c.offers.some((o) => o.teamId === c.team)).toBe(true);
    expect(await page.locator(".co-offer").count()).toBe(c.offers.length);
  });

  test("the sheet reports the year that just finished", async ({ page }) => {
    await boot(page);
    await toOffers(page);
    await expect(page.locator("#co-title")).toHaveText("SEASON 2026");
    await expect(page.locator("#co-body")).toContainText("World champion");
    await expect(page.locator("#co-body")).toContainText("ON THE TABLE");
  });

  test("accepting a move changes the team and re-seeds the garage", async ({ page }) => {
    await boot(page);
    await toOffers(page);
    const move = await page.evaluate(() => {
      const c = window.__apex.career();
      const i = c.offers.findIndex((o) => o.teamId !== c.team);
      return i < 0 ? null : { i, team: c.team, owned: c.owned.slice(), fitted: Object.assign({}, c.fitted) };
    });
    // Offers beyond the renewal are gated by market value, so a weak season can
    // legitimately produce none. Skipping beats asserting on a coin flip.
    test.skip(!move, "this season drew no move offer — market value gates them by tier");

    await page.locator("#co-body .co-offer").nth(move.i).click();
    const after = await page.evaluate(() => window.__apex.career());
    expect(after.team).not.toBe(move.team);
    expect(after.deal.team).toBe(after.team);
    expect(after.deal.left).toBe(after.deal.years);
    expect(after.offers).toEqual([]);
    // You do not take the old team's parts with you: the build is the new team's
    // works car, which is what re-opens the R&D economy for a second season.
    expect(after.fitted).not.toEqual(move.fitted);
    expect(after.owned).not.toEqual(move.owned);
    await expect(page.locator("#career-offers")).toBeHidden();
    await expect(page.locator("#career")).toBeVisible();
    await expect(page.locator("#cr-go")).toHaveText("GO RACING");
  });

  test("renewing with your own team keeps the garage you built", async ({ page }) => {
    await boot(page);
    await toOffers(page);
    const before = await page.evaluate(() => {
      const c = window.__apex.career();
      c.owned.push("__test_part__");            // something only THIS career owns
      return { team: c.team, owned: c.owned.length, i: c.offers.findIndex((o) => o.teamId === c.team) };
    });
    await page.locator("#co-body .co-offer").nth(before.i).click();
    const after = await page.evaluate(() => window.__apex.career());
    expect(after.team).toBe(before.team);
    expect(after.owned.length).toBe(before.owned);
    expect(after.owned).toContain("__test_part__");
  });

  test("the hub will not let you race the new season unsigned", async ({ page }) => {
    await boot(page);
    await toOffers(page);
    // DECIDE LATER keeps the offers rather than discarding the year — the rollover
    // has already reset the calendar to round 0, so without the gate GO RACING
    // would be live again with no contract signed.
    await page.locator("#co-back").click();
    await expect(page.locator("#career-offers")).toBeHidden();
    await expect(page.locator("#cr-go")).toHaveText("SIGN A CONTRACT");
    expect(await page.evaluate(() => window.__apex.career().offers.length)).toBeGreaterThan(0);
    await page.locator("#cr-go").click();
    await expect(page.locator("#career-offers")).toBeVisible();
  });
});

test.describe("Career — determinism", () => {
  test.use({ viewport: LANDSCAPE });

  // The seed is the contract: same seed, same career. Career draws go through the
  // stateless Career.rnd hash rather than simRnd for exactly this reason — there
  // is no cursor to persist, so a save/load round-trip cannot desync a season.
  //
  // One thing DOES have to be pinned by hand: driver skill is drawn from simRnd in
  // makeCars(), and the qualifying model careerSim() reads is built on it. So the
  // sim stream is rewound between SIMULATE and TO THE GRID — the one gap where no
  // frame is updating cars, because startRace() has not run yet.
  async function seasonRun(page, careerSeed) {
    await boot(page);
    await page.evaluate((s) => {
      window.__apex.careerReset();
      window.__apex.career({ teamId: "haas", seat: 1, seed: s });
    }, careerSeed);
    await page.locator("#cr-go").click();
    await page.locator("#rs-go").click();
    await expect(page.locator("#quali")).toBeVisible({ timeout: 20_000 });
    await page.locator("#q-sim").click();
    await page.evaluate(() => window.__apex.seed(99));
    await page.locator("#q-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 20_000 });
    return page.evaluate(() => {
      const rounds = window.__apex.careerSim(24);
      const roll = window.__apex.careerRollover();
      const c = window.__apex.career();
      return {
        briefs: rounds.map((r) => r.obj.type + ":" + r.obj.value + ":" + r.obj.done),
        results: rounds.map((r) => r.pos + "/" + r.pts),
        money: c.money, rep: c.rep, champion: roll.champion,
        offers: roll.offers.map((o) => o.teamId + ":" + o.years + ":" + o.salary),
        seats: Object.keys(c.seats).sort(),
        dev: JSON.stringify(c.dev), tdev: JSON.stringify(c.tdev),
      };
    });
  }

  test("the same seed produces the same season, rollover and offers", async ({ page }) => {
    const a = await seasonRun(page, 4242);
    const b = await seasonRun(page, 4242);
    expect(a.briefs.length).toBe(24);
    expect(b).toEqual(a);
  });

  test("a different seed produces a different career", async ({ page }) => {
    // Read the brief sequence straight off Career.rnd rather than racing for it.
    // seasonRun() stages a weekend and simulates 24 rounds, so doing it twice ran
    // past the 120 s timeout — and this claim is about the DRAW, which needs no
    // car on track. It also exercises the rnd finalizer directly: before that fix
    // a whole season could come back as one brief repeated.
    await boot(page);
    const briefs = (seed) => page.evaluate((s) => {
      window.__apex.careerReset();
      window.__apex.career({ teamId: "haas", seat: 1, seed: s });
      const out = [];
      for (let r = 0; r < 24; r++) {
        const o = Career.objectiveFor(r);
        out.push(o.type + ":" + o.value);
      }
      return out;
    }, seed);
    const a = await briefs(4242);
    const b = await briefs(777);
    expect(a.length).toBe(24);
    expect(b).not.toEqual(a);
    // …and the same seed still reproduces itself, cheaply.
    expect(await briefs(4242)).toEqual(a);
  });

  test("a season draws a spread of briefs, not one kind repeated", async ({ page }) => {
    // The regression guard for the Career.rnd finalizer. FNV-1a alone left 100% of
    // seasons missing at least one objective kind, because every key ends in the
    // part that varies and FNV's last multiply barely disturbs the high bits —
    // exactly the end h/2^32 reads. A uniform draw misses a kind ~2.4% of the time.
    await boot(page);
    const kinds = await page.evaluate(() => {
      const seen = [];
      for (let seed = 1; seed <= 40; seed++) {
        window.__apex.careerReset();
        window.__apex.career({ teamId: "haas", seat: 1, seed });
        const s = new Set();
        for (let r = 0; r < 24; r++) s.add(Career.objectiveFor(r).type);
        seen.push(s.size);
      }
      return seen;
    });
    // Over 40 seasons almost all should see every kind; none should be stuck on one.
    expect(Math.min(...kinds)).toBeGreaterThan(1);
    const full = kinds.filter((n) => n >= 4).length;
    expect(full).toBeGreaterThan(kinds.length * 0.7);
  });
});

// ── career history ───────────────────────────────────────────────────────────
// The record of everything a career has achieved. None of it is stored: the
// totals are a walk over career.history plus the season in progress, so what
// these tests really pin is that the derivation still agrees with the save.

test.describe("Career — history", () => {
  test.use({ viewport: LANDSCAPE });

  // The canvas renders continuously, so Playwright's actionability check can spin
  // on a control laid over it. Click through the DOM instead, the way
  // tests/menu-survey.spec.js does.
  const press = (page, sel) => page.locator(sel).evaluate((el) => el.click());

  // #ch-body's key/value card as a plain object, so an assertion names the row it
  // means rather than indexing a list that gains a row later.
  const totals = (page) => page.evaluate(() => {
    const out = {};
    for (const r of document.querySelectorAll("#ch-body .cr-row"))
      out[r.querySelector(".cr-row-k").textContent] = r.querySelector(".cr-row-v").textContent;
    return out;
  });

  test("the hub opens it, and BACK closes it again", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await expect(page.locator("#cr-history")).toBeVisible();
    await press(page, "#cr-history");
    await expect(page.locator("#career-history")).toBeVisible();
    await expect(page.locator("#ch-body")).toContainText("CAREER TOTALS");
    await expect(page.locator("#ch-body")).toContainText("SEASON BY SEASON");
    await press(page, "#ch-back");
    await expect(page.locator("#career-history")).toBeHidden();
    await expect(page.locator("#career")).toBeVisible();
  });

  test("a first season says so rather than rendering an empty box", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await press(page, "#cr-history");
    await expect(page.locator("#ch-body")).toContainText("first season");
    // The empty state is a sentence, not a table with no rows in it.
    expect(await page.locator("#ch-body .res-row").count()).toBe(0);

    const t = await totals(page);
    expect(t.Seasons).toBe("1 · 2026 in progress");
    expect(t["Race starts"]).toBe("0");
    expect(t.Wins).toBe("0");
    expect(t.Podiums).toBe("0");
    expect(t.Championships).toBe("0 drivers' · 0 constructors'");
    expect(t["Best championship"]).toBe("no season finished yet");
    expect(t["Teams driven for"]).toBe("Haas");
  });

  test("a rolled-over season becomes a row, and the totals follow it", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await goRacing(page);                     // careerSim needs a track + grid staged
    const archived = await page.evaluate(() => {
      window.__apex.careerSim(30);            // stops itself at the end of the calendar
      window.__apex.careerRollover();
      const c = window.__apex.career();
      window.__apex.career(true);             // back to the hub, year archived
      return { year: c.year, past: c.history[c.history.length - 1], round: c.season.round };
    });
    expect(archived.year).toBe(2027);
    expect(archived.past.year).toBe(2026);
    expect(archived.round).toBe(0);           // the new season starts clean

    await expect(page.locator("#career")).toBeVisible();
    await press(page, "#cr-history");
    await expect(page.locator("#career-history")).toBeVisible();

    const rows = page.locator("#ch-body .res-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("2026");
    await expect(rows.first()).toContainText("Haas");
    await expect(rows.first()).toContainText("P" + archived.past.pos);
    await expect(rows.first()).toContainText(archived.past.pts + " pts");

    const t = await totals(page);
    expect(t.Seasons).toBe("2 · 2027 in progress");
    // A season only reaches the archive once its calendar is done, so the starts
    // are exactly one calendar — the running year has settled nothing yet.
    const cal = await page.evaluate(() => window.__apex.careerState().rounds);
    expect(t["Race starts"]).toBe(String(cal));
    expect(t.Wins).toBe(String(archived.past.wins));
    expect(t.Podiums).toBe(String(archived.past.podiums));
    expect(t.Points).toBe(String(archived.past.pts));
    expect(t["Best championship"]).toBe("P" + archived.past.pos + " in 2026");
    expect(t.Championships).toBe(
      (archived.past.pos === 1 ? "1" : "0") + " drivers' · " +
      (archived.past.cPos === 1 ? "1" : "0") + " constructors'");
  });
});

// ── reliability & retirements ────────────────────────────────────────────────
// js/game/reliability.js. The rules that matter here are all invariants rather
// than magnitudes: OFF must change nothing, ON must be reproducible, a DNF must
// classify last and score nothing, and NONE of it may move the sim RNG stream.

// A career whose seed is known to retire the player several times over a season
// (Haas is tier 3, and the draw is a pure function of (seed, round, driverId) —
// see armReliability in game.js). Any seed works; this one has margin, so the
// test is asserting the mechanism rather than a coin flip.
const DNF_SEED = 99;

// Start a career, stage a weekend, then settle a whole season at `level` and
// report what the reliability model did to it.
async function reliabilitySeason(page, level, careerSeed) {
  await boot(page);
  await page.evaluate((s) => {
    window.__apex.careerReset();
    window.__apex.career({ teamId: "haas", seat: 1, seed: s });
  }, careerSeed);
  await goRacing(page);
  return page.evaluate((lvl) => {
    window.__apex.reliability(lvl);
    const rounds = window.__apex.careerSim(24);
    const c = window.__apex.career();
    return {
      level: window.__apex.reliability(),
      // The reason per round, from settleRound()'s return AND from the row it
      // wrote onto the save. Two different code paths that must agree.
      settled: rounds.map((r) => r.round + ":" + (r.dnf || "-")),
      rows: c.results.map((r) => (r.r + 1) + ":" + (r.dnf || "-")),
      dnfs: rounds.filter((r) => r.dnf).length,
      // The whole field of the LAST simulated round.
      fieldOut: window.__apex.fieldState().filter((f) => f.retired).length,
      stateDnfs: window.__apex.careerState().dnfs,
    };
  }, level);
}

test.describe("Career — reliability", () => {
  test.use({ viewport: LANDSCAPE });

  test("OFF is the shipped default and nothing ever retires", async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => window.__apex.reliability())).toBe("off");
    const off = await reliabilitySeason(page, "off", DNF_SEED);
    expect(off.dnfs).toBe(0);
    expect(off.fieldOut).toBe(0);
    expect(off.stateDnfs).toBe(0);
    expect(off.rows.every((r) => r.endsWith(":-"))).toBe(true);
  });

  test("a seeded season retires the same cars for the same reasons every time", async ({ page }) => {
    const a = await reliabilitySeason(page, "real", DNF_SEED);
    const b = await reliabilitySeason(page, "real", DNF_SEED);
    expect(a.dnfs).toBeGreaterThanOrEqual(2);   // the model actually fired
    expect(b).toEqual(a);                       // and fired identically
    expect(a.rows).toEqual(a.settled);          // save row == settleRound() result
    expect(a.stateDnfs).toBe(a.dnfs);
  });

  test("a different career seed retires a different set", async ({ page }) => {
    const a = await reliabilitySeason(page, "real", DNF_SEED);
    const b = await reliabilitySeason(page, "real", 4242);
    expect(b.settled).not.toEqual(a.settled);
  });

  test("a retirement classifies below every finisher and scores no points", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await goRacing(page);
    const out = await page.evaluate(() => {
      // Forced rather than waited for: the classification rule is what is under
      // test, not the probability of reaching it.
      const gone = [window.__apex.retire(1, "gearbox"), window.__apex.retire(4, "accident")];
      window.__apex.finishRace();
      const season = window.__apex.career().season;
      const rows = [];
      for (let i = 0; i < 22; i++) {
        const c = window.__apex.carAt(i);
        rows.push({ id: c.id, pos: c.finPos, retired: c.retired, why: c.dnf,
                    pts: season.pts[c.team + ":" + c.seat] || 0 });
      }
      return { gone: gone.map((g) => g.idx), reasons: gone.map((g) => g.why), rows };
    });
    expect(out.reasons).toEqual(["gearbox", "accident"]);
    const retired = out.rows.filter((r) => r.retired);
    const classified = out.rows.filter((r) => !r.retired);
    expect(retired.map((r) => r.id).sort()).toEqual(out.gone.slice().sort());
    // Below EVERY finisher, and scoring nothing.
    const worstFinisher = Math.max(...classified.map((r) => r.pos));
    for (const r of retired) {
      expect(r.pos).toBeGreaterThan(worstFinisher);
      expect(r.pts).toBe(0);
    }
    // The cars above them still got what their positions earn: P1 is 25 in
    // Teams.POINTS, so a shifted index would show up right here.
    expect(classified.find((r) => r.pos === 1).pts).toBe(25);
  });

  test("the reliability draw does not move the sim RNG stream", async ({ page }) => {
    // makeCars() spends exactly one simRnd() per driver via driverSkill(), and the
    // stream position after it is a hard contract. A reliability draw taken from
    // simRnd would shift every seeded result that follows — this is the guard.
    const grid = async (level) => {
      await boot(page);
      return page.evaluate((lvl) => {
        window.__apex.seed(7);
        window.__apex.reliability(lvl);
        window.__apex.race("monza");
        const out = { skills: [], plan: window.__apex.retirements() };
        for (let i = 0; i < 22; i++) out.skills.push(window.__apex.carAt(i).skill);
        return out;
      }, level);
    };
    const off = await grid("off");
    const real = await grid("real");
    expect(off.skills.length).toBe(22);
    expect(real.skills).toEqual(off.skills);
    // ...and the plan is real, so the equality above is not vacuous.
    expect(off.plan.length).toBe(0);
    expect(real.plan.length).toBeGreaterThan(0);
    for (const p of real.plan) {
      expect(p.at).toBeGreaterThan(0);
      expect(["engine", "gearbox", "accident"]).toContain(p.why);
    }
  });

  test("RELIABILITY is a persisted race setting", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await page.locator("#cr-go").click();
    const chips = page.locator("#rs-reliab .sel-chip");
    await expect(chips).toHaveCount(3);
    await chips.nth(2).click();      // REAL
    await expect(chips.nth(2)).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("apex26.reliability"))).toContain("real");
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    expect(await page.evaluate(() => window.__apex.reliability())).toBe("real");
  });
});

// ── save slots ───────────────────────────────────────────────────────────────
// Three careers at once (Career.SLOTS), one localStorage key each. The property
// under test throughout is ISOLATION: a slot must be untouched by anything done
// in another one, including being deleted.

test.describe("Career — slots", () => {
  test.use({ viewport: LANDSCAPE });

  // Three distinct careers, one per slot, in a known order.
  async function threeCareers(page) {
    await boot(page);
    await page.evaluate(() => {
      window.__apex.career({ teamId: "haas", seat: 1, seed: 11, slot: 0 });
      window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 22, slot: 1 });
      window.__apex.career({ teamId: "williams", seat: 0, seed: 33, slot: 2 });
    });
  }

  test("three careers coexist, one key each", async ({ page }) => {
    await threeCareers(page);
    const s = await page.evaluate(() => window.__apex.careerSlots());
    expect(s.map((x) => x.used)).toEqual([true, true, true]);
    expect(s.map((x) => x.team)).toEqual(["haas", "custom", "williams"]);
    expect(s[1].flavour).toBe("myteam");
    // Separate keys, not one array: a quota failure must cost one career, not three.
    const keys = await page.evaluate(() =>
      ["0", "1", "2"].map((i) => localStorage.getItem("apex26.career." + i) != null));
    expect(keys).toEqual([true, true, true]);
  });

  test("switching slots leaves the others exactly as they were", async ({ page }) => {
    await threeCareers(page);
    const out = await page.evaluate(() => {
      window.__apex.careerSlots(0);
      window.__apex.careerMoney(4321);          // spend in slot 0 only
      const two = window.__apex.careerSlots(2);
      const zero = window.__apex.careerSlots(0);
      return { slot2: two.money, slot0: zero.money, seed2: two.seed, seed0: zero.seed };
    });
    expect(out.slot0).toBe(4321);
    expect(out.slot2).not.toBe(4321);
    expect(out.seed0).toBe(11);
    expect(out.seed2).toBe(33);
  });

  test("deleting one slot keeps the other two", async ({ page }) => {
    await threeCareers(page);
    const after = await page.evaluate(() => {
      const slots = window.__apex.careerSlotDelete(1);
      return { used: slots.map((s) => s.used), live: window.__apex.career() };
    });
    expect(after.used).toEqual([true, false, true]);
    // Something is still live, so CONTINUE on the title screen still means something.
    expect(after.live).not.toBeNull();
    await expect(page.locator("#mb-career .mb-label")).toHaveText("CONTINUE CAREER");
  });

  test("the slots survive a reload, and the live one is remembered", async ({ page }) => {
    await threeCareers(page);
    await page.evaluate(() => window.__apex.careerSlots(1));
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const st = await page.evaluate(() => ({
      slot: window.__apex.careerState().slot,
      team: window.__apex.career().team,
      used: window.__apex.careerSlots().map((s) => s.used),
    }));
    expect(st.slot).toBe(1);
    expect(st.team).toBe("custom");
    expect(st.used).toEqual([true, true, true]);
  });

  test("the picker opens when more than one career is saved", async ({ page }) => {
    await threeCareers(page);
    // Back to the title screen, then in through the button a player would press.
    await page.locator("#cr-back").click();
    await expect(page.locator("#overlay")).toBeVisible();
    await page.locator("#mb-career").click();
    await expect(page.locator("#career")).toBeVisible();
    await expect(page.locator("#cr-title")).toHaveText("CAREERS");
    await expect(page.locator(".cr-slot")).toHaveCount(3);
    // GO RACING has nothing to act on until a career is chosen.
    await expect(page.locator("#cr-go")).toBeHidden();
    // Taking one lands in its hub, engaged.
    await page.locator(".cr-slot").nth(2).locator(".cr-slot-main").click();
    await expect(page.locator("#cr-go")).toBeVisible();
    const info = await page.evaluate(() => ({
      flow: window.__apex.info().flow, team: window.__apex.career().team,
    }));
    expect(info.flow).toBe("career");
    expect(info.team).toBe("williams");
  });

  test("a single career goes straight to its hub, and none goes to setup", async ({ page }) => {
    // The picker is not a toll gate. One save has nothing to choose between, and
    // a first-time player offered three identical empty boxes cannot answer the
    // question it is asking.
    await boot(page);
    await page.locator("#mb-career").click();
    await expect(page.locator("#cr-title")).toHaveText("NEW CAREER");
    await page.locator("#cr-back").click();
    await page.evaluate(() => window.__apex.career({ teamId: "haas", seat: 1, seed: 5, slot: 0 }));
    await page.locator("#cr-back").click();
    await page.locator("#mb-career").click();
    await expect(page.locator("#cr-title")).toHaveText("CAREER 2026");
  });

  test("deleting requires a second press", async ({ page }) => {
    await threeCareers(page);
    await page.locator("#cr-back").click();
    await page.locator("#mb-career").click();
    await expect(page.locator("#cr-title")).toHaveText("CAREERS");
    const del = page.locator(".cr-slot").nth(0).locator(".cr-slot-del");
    await del.click();
    await expect(page.locator(".cr-slot").nth(0).locator(".cr-slot-del")).toHaveText("DELETE?");
    // Still there after one press.
    expect(await page.evaluate(() => window.__apex.careerSlots()[0].used)).toBe(true);
    await page.locator(".cr-slot").nth(0).locator(".cr-slot-del").click();
    expect(await page.evaluate(() => window.__apex.careerSlots()[0].used)).toBe(false);
  });

  test("the title button names the career it will continue", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__apex.career({ teamId: "williams", seat: 0, seed: 8, slot: 0 }));
    await page.locator("#cr-back").click();
    const sub = await page.locator("#mb-career-sub").textContent();
    expect(sub).toContain("WILLIAMS");
    expect(sub).toContain("2026");
    // …and says how many there are once that is a real question.
    await page.evaluate(() => window.__apex.career({ teamId: "haas", seat: 1, seed: 9, slot: 1 }));
    await page.locator("#cr-back").click();
    expect(await page.locator("#mb-career-sub").textContent()).toContain("2 SAVED");
  });
});

// ── the in-game guide ────────────────────────────────────────────────────────
// #career-guide. TWO documents sharing one sheet, because a driver career and MY
// TEAM are different games — you are paid or you pay, hired or hiring — and a
// guide that hedged between them would describe neither. Every figure in it is
// read from Career's own constants, so the assertions here are really asking
// "does the guide still agree with the rules it is describing".

test.describe("Career — the guide", () => {
  test.use({ viewport: LANDSCAPE });

  test("the setup screen explains a mode BEFORE you commit to it", async ({ page }) => {
    await boot(page);
    await page.locator("#mb-career").click();
    await expect(page.locator("#cr-title")).toHaveText("NEW CAREER");
    await page.locator("#cr-learn").click();
    await expect(page.locator("#career-guide")).toBeVisible();
    await expect(page.locator("#cg-title")).toHaveText("HOW CAREER WORKS");
    await page.locator("#cg-back").click();
    await expect(page.locator("#career-guide")).toBeHidden();
    // Still on the form, still unstarted — reading is not a commitment.
    await expect(page.locator("#cr-title")).toHaveText("NEW CAREER");
    expect(await page.evaluate(() => window.__apex.career())).toBeNull();
  });

  test("switching flavour switches which document you get", async ({ page }) => {
    await boot(page);
    await page.locator("#mb-career").click();
    await page.evaluate(() => {
      const b = [...document.querySelectorAll(".cr-flavour")].find((x) => x.innerText.includes("MY TEAM"));
      b.click();
    });
    await page.locator("#cr-learn").click();
    await expect(page.locator("#cg-title")).toHaveText("HOW MY TEAM WORKS");
    // The document is about OWNING a team, not about being signed by one.
    const body = await page.locator("#cg-body").innerText();
    expect(body).toContain("NOBODY CAN SIGN YOU");
    expect(body).toContain("THE DRIVER YOU HIRE");
  });

  test("the hub names the flavour actually being played", async ({ page }) => {
    // A MY TEAM owner pressing "HOW CAREER WORKS" would get a document about
    // signing contracts they can never be offered.
    await boot(page);
    await startCareer(page);
    await expect(page.locator("#cr-guide .cr-record-cta")).toHaveText("HOW CAREER WORKS");
    await page.evaluate(() => window.__apex.careerReset());
    await page.evaluate(() => window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 3 }));
    await expect(page.locator("#cr-guide .cr-record-cta")).toHaveText("HOW MY TEAM WORKS");
    await page.locator("#cr-guide").click();
    await expect(page.locator("#cg-title")).toHaveText("HOW MY TEAM WORKS");
  });

  test("its numbers come from the rules, not from prose", async ({ page }) => {
    // The guarantee that matters: tuning the economy cannot leave the guide
    // quoting a price the garage no longer charges.
    await boot(page);
    await startCareer(page);
    await page.locator("#cr-guide").click();
    const { body, rules } = await page.evaluate(() => ({
      body: document.getElementById("cg-body").innerText,
      rules: {
        win: window.__apex.career() && null,
      },
    }));
    const consts = await page.evaluate(() => ({
      win: Career.PRIZE[0], last: Career.prizeFor(22),
      bonus: Career.OBJ_BONUS, mult: Career.RESEARCH_MULT,
      cap: Career.BUDGET_MULT[Career.BUDGET_MULT.length - 1],
      slots: Career.SLOTS,
    }));
    expect(body).toContain(consts.win.toLocaleString() + " cr");
    expect(body).toContain(consts.last.toLocaleString() + " cr");
    expect(body).toContain("+" + consts.bonus.toLocaleString() + " cr");
    expect(body).toContain(consts.mult + "x the part's price");
    expect(body).toContain(consts.cap + "x");
    expect(body).toContain(consts.slots + ", each a whole career");
    expect(rules.win).toBeNull();
  });

  test("MY TEAM's guide prices the actual driver market", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 4 }));
    await page.locator("#cr-guide").click();
    const body = await page.locator("#cg-body").innerText();
    const asks = await page.evaluate(() => Career.freeAgents().map((a) => a.ask));
    const lo = Math.min(...asks), hi = Math.max(...asks);
    expect(body).toContain(lo + " cr a round");
    expect(body).toContain(hi + " cr a round");
    // And the starting balance the flavour actually gets.
    const start = await page.evaluate(() => Career.START_MONEY.myteam);
    expect(body).toContain(start.toLocaleString() + " cr");
  });
});
