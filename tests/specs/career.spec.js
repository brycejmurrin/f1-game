// @ts-check
// CAREER mode: the save, the mode axes, the hub, and the isolation guarantees
// that keep Grand Prix and Time Trial untouched by a career existing.
//
// DELIBERATELY ON THE VIRGIN-PAGE FIXTURE. This spec was converted to
// `sharedTest` (tests/helpers/fixtures.js) for the ~35 min its 101 boots cost, and the
// conversion was REVERTED after measurement. Two independent reasons, both
// recorded so the trade is not re-attempted from the runtime number alone:
//
//   1. The hub/garage flows assert their way through MENU SCREENS, and a shared
//      page starts each test wherever the last one left the app. Career.clear()
//      returns the SAVE to free play but not the UI to the main menu, so
//      "the garage returns to the hub rather than the select screen" waited out
//      the full 120 s for an element that was never going to appear.
//   2. The five page.addInitScript() seeds below establish a storage
//      PRECONDITION. A shared page carries the previous test's career slots into
//      that precondition, so the migration tests read a stale-but-valid save and
//      assert against the wrong object.
//
// The measurement that settles it: "the garage returns to the hub" PASSED in
// 18.2 s on a heavily oversubscribed box and TIMED OUT at 123.9 s on a quieter
// one. Load cannot invert like that — it is test-order-dependent page state.
// Reuse is still right for the hook/physics specs; see docs/TESTING.md.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function boot(page) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
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
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
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
    // Driver slot 0 — the two modes keep separate sets of three keys each.
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.career.driver.0")));
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    const after = await page.evaluate(() => window.__apex.careerState());
    expect(after.team).toBe(before.team);
    expect(after.money).toBe(before.money);
    // One door, always the same words — see the modes-screen block below.
    await expect(page.locator("#mb-career .mb-label")).toHaveText("CAREER MODES");
    await expect(page.locator("#mb-career-sub")).toContainText("HAAS");
  });

  test("a save with no version field migrates instead of being discarded", async ({ page }) => {
    // ALSO the single-save era's storage layout: this writes the old
    // `apex26.career` key, which now has to land in the DRIVER set's slot 0.
    await page.addInitScript(() => {
      localStorage.setItem("apex26.career", JSON.stringify({
        flavour: "driver", team: "williams", seat: 0, money: 500,
        // legacy: display-code point keys, and no `v`, `owned` or `driver`
        season: { round: 3, pts: { SAI: 12 }, teamPts: { williams: 12 } },
      }));
    });
    await boot(page);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.career.driver.0")));
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
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

  // The three guards below all cover the same class of mistake: gating on "a
  // career SAVE exists" instead of "career rules apply now". The save is loaded
  // at boot so the title can offer CONTINUE, so `Career.data()`/`Career.active()`
  // are truthy in every mode for anyone who has ever started one.

  test("a Grand Prix garage writes to free play, not into the career save", async ({ page }) => {
    // getTeamParts/saveTeamParts used to branch on Career.data(). Fitting a part
    // in a GP garage for the career's own team therefore wrote career.fitted —
    // and setup-ui correctly treats a GP garage as free play (FREE BUILD, the
    // flat 780 cr cap, no R&D lock), so the career car could be maxed out for
    // nothing. Driven through the REAL garage, because the funnel is the thing
    // under test: writing localStorage directly would pass either way.
    await boot(page);
    await startCareer(page, { teamId: "haas", seat: 1, seed: 11 });
    // Leaving the hub drops back to flow "gp" with the career's team still
    // selected — the exact situation the bug needed.
    await page.locator("#cr-back").click();
    const fittedBefore = await page.evaluate(() => JSON.stringify(window.__apex.career().fitted));
    await page.evaluate(() => document.getElementById("mb-garage").click());
    await expect(page.locator("#carsetup")).toBeVisible();
    const picked = await page.evaluate(() => {
      // Any row that is not the one already fitted, so the click is a real change.
      const rows = [...document.querySelectorAll("#cs-options .cs-opt")];
      const row = rows.reverse().find((r) => !r.classList.contains("active"));
      if (!row) return null;
      row.click();
      return row.dataset.csOpt;
    });
    expect(picked).not.toBeNull();
    const after = await page.evaluate(() => ({
      fitted: JSON.stringify(window.__apex.career().fitted),
      free: JSON.parse(localStorage.getItem("apex26.parts.haas") || "null"),
      flow: window.__apex.info().flow,
    }));
    expect(after.flow).toBe("gp");
    expect(after.fitted).toBe(fittedBefore);                    // the save is untouched
    expect(after.free).not.toBeNull();                          // free play took the write
    expect(Object.values(after.free)).toContain(picked);
  });

  test("a Grand Prix grid does not depend on which career is on the device", async ({ page }) => {
    // Quali seeded its field off Career.rnd() (career.seed) at Career.round(),
    // neither of which is inCareer()-gated — so the same sim seed gave a
    // different grid depending on a save the Grand Prix has nothing to do with.
    const gridFor = async (careerOpts) => page.evaluate((o) => {
      if (o) window.__apex.career(o); else window.__apex.careerReset();
      window.__apex.seed(1234);
      window.__apex.race("monza");
      const q = window.__apex.qualiSim();
      return (q && q.rows ? q.rows : q || []).map((r) => r.code).join(",");
    }, careerOpts);

    await boot(page);
    const noCareer = await gridFor(null);
    const careerA = await gridFor({ teamId: "haas", seat: 1, seed: 4242 });
    const careerB = await gridFor({ teamId: "williams", seat: 0, seed: 99 });
    expect(noCareer.length).toBeGreaterThan(0);
    expect(careerA).toBe(noCareer);
    expect(careerB).toBe(noCareer);
  });
});

// ── the hub ──────────────────────────────────────────────────────────────────

test.describe("Career — hub", () => {
  test.use({ viewport: LANDSCAPE });

  test("with no save the screen offers a new career; starting one opens the hub", async ({ page }) => {
    await boot(page);
    await page.locator("#mb-career").click();
    await expect(page.locator("#career")).toBeVisible();
    // CAREER MODES first now; an empty driver slot is what opens the form.
    await page.locator("#cr-left .cr-slot").nth(0).locator(".cr-slot-main").click();
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
    await tap("sel-go");
    await expect(page.locator("#carsetup")).toBeVisible();
    await expect(page.locator("#cs-unlimited")).toBeVisible();
    await tap("cs-done");
    await tap("rs-cancel");   // DONE lands on RACE SETTINGS now; back out to the menu

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
    await page.locator("#cr-left .cr-slot").nth(0).locator(".cr-slot-main").click();
    await expect(page.locator("#cr-title")).toHaveText("NEW CAREER");
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
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
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
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
  // tests/specs/menu-survey.spec.js does.
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
// js/race/reliability.js. The rules that matter here are all invariants rather
// than magnitudes: OFF must change nothing, ON must be reproducible, a DNF must
// classify last and score nothing, and NONE of it may move the sim RNG stream.

// A career whose seed is known to retire the player several times over a season
// (Haas is tier 3, and the draw is a pure function of (seed, round, driverId) —
// see armReliability in game.js). Any seed works; this one has margin, so the
// test is asserting the mechanism rather than a coin flip.
const DNF_SEED = 99;

// Start a career, stage a weekend, then settle a whole season at `level` and
// report what the reliability model did to it.
// STAGE ONCE, SETTLE MANY. Booting the page and staging a weekend (track load
// plus a qualifying sheet) is the expensive half of these tests, and the two
// that compare a season against another season were paying it twice: 95s and
// 87s of a 120s budget when the suite was otherwise idle, and 156s and 147s —
// both over — the moment they ran inside the whole test:modes group. A test
// that only passes when nothing else is running is a test that will fail on
// somebody's laptop.
//
// careerSim() reads the staged track and grid, and careerReset()+career() swap
// the SAVE without touching either, so any number of seasons can be settled off
// one staging.
async function stageReliability(page) {
  await boot(page);
  await page.evaluate(() => {
    window.__apex.careerReset();
    window.__apex.career({ teamId: "haas", seat: 1, seed: 1 });
  });
  await goRacing(page);
}

// Settle one whole season, in the browser, off the already-staged weekend.
const RELIABILITY_SEASON = `(level, careerSeed) => {
  window.__apex.careerReset();
  window.__apex.career({ teamId: "haas", seat: 1, seed: careerSeed });
  window.__apex.reliability(level);
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
}`;

// One season, staging included — for the tests that only need one.
async function reliabilitySeason(page, level, careerSeed) {
  await stageReliability(page);
  return page.evaluate(
    ([body, lvl, sd]) => eval("(" + body + ")")(lvl, sd),
    [RELIABILITY_SEASON, level, careerSeed]);
}
// TWO seasons off ONE staging — the whole point of the split above.
async function reliabilityTwice(page, level, seedA, seedB) {
  await stageReliability(page);
  return page.evaluate(([body, lvl, a, b]) => {
    const run = eval("(" + body + ")");
    return { a: run(lvl, a), b: run(lvl, b) };
  }, [RELIABILITY_SEASON, level, seedA, seedB]);
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
    const { a, b } = await reliabilityTwice(page, "real", DNF_SEED, DNF_SEED);
    expect(a.dnfs).toBeGreaterThanOrEqual(2);   // the model actually fired
    expect(b).toEqual(a);                       // and fired identically
    expect(a.rows).toEqual(a.settled);          // save row == settleRound() result
    expect(a.stateDnfs).toBe(a.dnfs);
  });

  test("a different career seed retires a different set", async ({ page }) => {
    const { a, b } = await reliabilityTwice(page, "real", DNF_SEED, 4242);
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    expect(await page.evaluate(() => window.__apex.reliability())).toBe("real");
  });
});

// ── save slots ───────────────────────────────────────────────────────────────
// SIX saves: three DRIVER slots and three MY TEAM slots, in SEPARATE SETS. The
// property under test throughout is isolation — between slots, and between the
// two sets, so that neither mode can cost the other room.

test.describe("Career — slots", () => {
  test.use({ viewport: LANDSCAPE });

  // Four careers across both sets, in a known order.
  async function fourCareers(page) {
    await boot(page);
    await page.evaluate(() => {
      window.__apex.career({ teamId: "haas", seat: 1, seed: 11 });
      window.__apex.career({ teamId: "williams", seat: 0, seed: 33 });
      window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 22 });
      window.__apex.career({ flavour: "myteam", hire: "FER2", seed: 44 });
    });
  }
  const addr = (s) => s.flavour + s.i + ":" + (s.used ? s.team : "-");

  test("two sets of three, filled independently", async ({ page }) => {
    await fourCareers(page);
    const slots = await page.evaluate(() => window.__apex.careerSlots());
    expect(slots.map(addrOf)).toEqual([
      "driver0:haas", "driver1:williams", "driver2:-",
      "myteam0:custom", "myteam1:custom", "myteam2:-",
    ]);
    function addrOf(x) { return x.flavour + x.i + ":" + (x.used ? x.team : "-"); }
    // One set can be asked for on its own.
    const mine = await page.evaluate(() => window.__apex.careerSlots("myteam"));
    expect(mine).toHaveLength(3);
    expect(mine.every((x) => x.flavour === "myteam")).toBe(true);
  });

  test("a career's MODE decides its set, whatever slot is asked for", async ({ page }) => {
    // The invariant that keeps the sets meaningful: passing slot 2 to a driver
    // career must fill DRIVER slot 2, never MY TEAM's.
    await fourCareers(page);
    await page.evaluate(() => window.__apex.career({ teamId: "audi", seat: 1, seed: 55, slot: 2 }));
    const slots = await page.evaluate(() => window.__apex.careerSlots());
    expect(slots.map((x) => x.flavour + x.i + ":" + (x.used ? x.team : "-"))).toEqual([
      "driver0:haas", "driver1:williams", "driver2:audi",
      "myteam0:custom", "myteam1:custom", "myteam2:-",
    ]);
  });

  test("switching leaves every other slot exactly as it was", async ({ page }) => {
    await fourCareers(page);
    const out = await page.evaluate(() => {
      window.__apex.careerSlots("driver", 0);
      window.__apex.careerMoney(4321);          // spend in driver slot 0 only
      return {
        d0: window.__apex.careerSlots("driver", 0).money,
        d1: window.__apex.careerSlots("driver", 1).money,
        m0: window.__apex.careerSlots("myteam", 0).money,
      };
    });
    expect(out.d0).toBe(4321);
    expect(out.d1).not.toBe(4321);
    expect(out.m0).not.toBe(4321);
  });

  test("deleting one leaves the other five", async ({ page }) => {
    await fourCareers(page);
    const after = await page.evaluate(() => ({
      used: window.__apex.careerSlotDelete("myteam", 0).map((s) => s.used),
      live: window.__apex.career(),
    }));
    expect(after.used).toEqual([true, true, false, false, true, false]);
    expect(after.live).not.toBeNull();   // something is still live to continue
  });

  test("the slots survive a reload, and the live one is remembered", async ({ page }) => {
    await fourCareers(page);
    await page.evaluate(() => window.__apex.careerSlots("myteam", 1));
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    const st = await page.evaluate(() => ({
      slot: window.__apex.careerState().slot,
      flavour: window.__apex.careerState().slotFlavour,
      used: window.__apex.careerSlots().map((s) => s.used),
    }));
    expect(st.flavour).toBe("myteam");
    expect(st.slot).toBe(1);
    expect(st.used).toEqual([true, true, false, true, true, false]);
  });
});

// ── the CAREER MODES screen ──────────────────────────────────────────────────
// The title button's one door. It exists because the old one went straight into
// whichever save was last touched, so a player with a single driver career had
// no way to reach MY TEAM, their other saves, or the delete that makes room.

test.describe("Career — the modes screen", () => {
  test.use({ viewport: LANDSCAPE });

  test("the title button opens it, with or without a save", async ({ page }) => {
    await boot(page);
    await expect(page.locator("#mb-career .mb-label")).toHaveText("CAREER MODES");
    await page.locator("#mb-career").click();
    await expect(page.locator("#cr-title")).toHaveText("CAREER MODES");
    // Both modes, three slots each, and a guide apiece.
    await expect(page.locator(".cr-slot")).toHaveCount(6);
    await expect(page.locator("#cr-guide-driver")).toBeVisible();
    await expect(page.locator("#cr-guide-myteam")).toBeVisible();
    await expect(page.locator("#cr-left")).toContainText("DRIVER CAREER");
    await expect(page.locator("#cr-right")).toContainText("MY TEAM");
    // Nothing to press in the foot: every action here is a card.
    await expect(page.locator("#cr-go")).toBeHidden();
  });

  test("an empty slot starts that mode, in that slot", async ({ page }) => {
    await boot(page);
    await page.locator("#mb-career").click();
    // The second MY TEAM slot — so both halves of the address have to survive.
    await page.locator("#cr-right .cr-slot").nth(1).locator(".cr-slot-main").click();
    await expect(page.locator("#cr-title")).toHaveText("NEW CAREER");
    // The form opens on MY TEAM rather than asking which mode again.
    await expect(page.locator(".cr-flavour").nth(1)).toHaveAttribute("aria-pressed", "true");
    await page.locator("#cr-go").click();
    const st = await page.evaluate(() => window.__apex.careerState());
    expect(st.flavour).toBe("myteam");
    expect(st.slotFlavour).toBe("myteam");
    expect(st.slot).toBe(1);
  });

  test("a used slot continues that career", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.__apex.career({ teamId: "haas", seat: 1, seed: 7 });
      window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 8 });
    });
    await page.locator("#cr-back").click();
    await page.locator("#mb-career").click();
    await page.locator("#cr-left .cr-slot").nth(0).locator(".cr-slot-main").click();
    await expect(page.locator("#cr-title")).toHaveText("CAREER 2026");
    const info = await page.evaluate(() => ({
      flow: window.__apex.info().flow, team: window.__apex.career().team,
    }));
    expect(info.flow).toBe("career");
    expect(info.team).toBe("haas");
  });

  test("the hub gets back to it", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await page.locator("#cr-slots").click();
    await expect(page.locator("#cr-title")).toHaveText("CAREER MODES");
    // BACK from here returns to the career, not to the title screen.
    await page.locator("#cr-back").click();
    await expect(page.locator("#cr-title")).toHaveText("CAREER 2026");
  });

  test("changing mode on the setup form moves the slot with it", async ({ page }) => {
    // Slot 3 of the driver set is not slot 3 of MY TEAM, so the target has to
    // follow the mode or the career lands somewhere the player never pointed.
    await boot(page);
    await page.evaluate(() => {
      window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 1 });   // myteam 0
    });
    await page.locator("#cr-back").click();
    await page.locator("#mb-career").click();
    await page.locator("#cr-left .cr-slot").nth(0).locator(".cr-slot-main").click();
    await page.evaluate(() => {
      const b = [...document.querySelectorAll(".cr-flavour")].find((x) => x.innerText.includes("MY TEAM"));
      b.click();
    });
    await page.locator("#cr-go").click();
    const st = await page.evaluate(() => window.__apex.careerState());
    expect(st.slotFlavour).toBe("myteam");
    expect(st.slot).toBe(1);            // the first FREE MY TEAM slot, not driver's 0
    // ...and the MY TEAM career already there is untouched.
    const used = await page.evaluate(() => window.__apex.careerSlots("myteam").map((s) => s.used));
    expect(used).toEqual([true, true, false]);
  });
});

// ── making and unmaking careers ──────────────────────────────────────────────

test.describe("Career — new and deleted", () => {
  test.use({ viewport: LANDSCAPE });

  const fillDriver = (page) => page.evaluate(() => {
    ["haas", "williams", "audi"].forEach((t, i) =>
      window.__apex.career({ teamId: t, seat: 1, seed: 10 + i }));
  });

  async function toModes(page) {
    await page.locator("#cr-back").click();
    await expect(page.locator("#overlay")).toBeVisible();
    await page.locator("#mb-career").click();
    await expect(page.locator("#cr-title")).toHaveText("CAREER MODES");
  }

  test("a full DRIVER set does not cost MY TEAM its room", async ({ page }) => {
    // The whole point of separate sets. Three driver careers must leave all
    // three MY TEAM slots open.
    await boot(page);
    await fillDriver(page);
    await toModes(page);
    await expect(page.locator("#cr-left .cr-slot.empty")).toHaveCount(0);
    await expect(page.locator("#cr-right .cr-slot.empty")).toHaveCount(3);
    await page.locator("#cr-right .cr-slot").nth(0).locator(".cr-slot-main").click();
    await expect(page.locator("#cr-title")).toHaveText("NEW CAREER");
  });

  test("deleting frees that slot, and only that slot", async ({ page }) => {
    await boot(page);
    await fillDriver(page);
    await toModes(page);
    const del = () => page.locator("#cr-left .cr-slot").nth(1).locator(".cr-slot-del");
    await del().click();
    await expect(del()).toHaveText("DELETE?");     // the first press only arms it
    expect(await page.evaluate(() => window.__apex.careerSlots("driver")[1].used)).toBe(true);
    await del().click();
    const teams = await page.evaluate(() => window.__apex.careerSlots("driver").map((s) => s.team));
    expect(teams[0]).toBe("haas");
    expect(teams[1]).toBeUndefined();              // the freed one
    expect(teams[2]).toBe("audi");
    await page.locator("#cr-left .cr-slot").nth(1).locator(".cr-slot-main").click();
    await expect(page.locator("#cr-title")).toHaveText("NEW CAREER");
  });

  test("arming a delete in one mode does not arm the same slot in the other", async ({ page }) => {
    // Armed state is keyed by the full address. Keyed by index alone this would
    // put DELETE? on two cards for one press, on two different careers.
    await boot(page);
    await page.evaluate(() => {
      window.__apex.career({ teamId: "haas", seat: 1, seed: 2 });
      window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 3 });
    });
    await toModes(page);
    await page.locator("#cr-left .cr-slot").nth(0).locator(".cr-slot-del").click();
    await expect(page.locator("#cr-left .cr-slot").nth(0).locator(".cr-slot-del")).toHaveText("DELETE?");
    await expect(page.locator("#cr-right .cr-slot").nth(0).locator(".cr-slot-del")).toHaveText("DELETE");
  });

  test("deleting everything leaves a screen you can still start from", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.__apex.career({ teamId: "haas", seat: 1, seed: 2 });
      window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 3 });
    });
    await toModes(page);
    for (const pane of ["#cr-left", "#cr-right"]) {
      const del = () => page.locator(pane + " .cr-slot").nth(0).locator(".cr-slot-del");
      await del().click();
      await del().click();
    }
    expect(await page.evaluate(() => window.__apex.career())).toBeNull();
    await expect(page.locator(".cr-slot.empty")).toHaveCount(6);
    // With nothing saved the button advertises the two modes rather than sitting
    // blank — there is no career to name, but there is still something to say.
    await expect(page.locator("#mb-career-sub")).toHaveText("DRIVER CAREER  ·  MY TEAM");
    await page.locator("#cr-left .cr-slot").nth(0).locator(".cr-slot-main").click();
    await expect(page.locator("#cr-title")).toHaveText("NEW CAREER");
  });
});

// ── the in-game guide ────────────────────────────────────────────────────────
// TWO documents sharing one sheet, because a driver career and MY TEAM are
// different games — you are paid or you pay, hired or hiring — and a guide that
// hedged between them would describe neither. Every figure in it is read from
// Career's own constants, so these are really asking "does the guide still
// agree with the rules it describes".

test.describe("Career — the guide", () => {
  test.use({ viewport: LANDSCAPE });

  test("the modes screen carries one per mode", async ({ page }) => {
    await boot(page);
    await page.locator("#mb-career").click();
    await page.locator("#cr-guide-driver").click();
    await expect(page.locator("#cg-title")).toHaveText("HOW CAREER WORKS");
    await page.locator("#cg-back").click();
    // Reading is not a commitment: still on the modes screen, still nothing saved.
    await expect(page.locator("#cr-title")).toHaveText("CAREER MODES");
    expect(await page.evaluate(() => window.__apex.career())).toBeNull();
    await page.locator("#cr-guide-myteam").click();
    await expect(page.locator("#cg-title")).toHaveText("HOW MY TEAM WORKS");
    const body = await page.locator("#cg-body").innerText();
    expect(body).toContain("NOBODY CAN SIGN YOU");
    expect(body).toContain("THE DRIVER YOU HIRE");
  });

  test("the hub names the mode actually being played", async ({ page }) => {
    // A MY TEAM owner pressing "HOW CAREER WORKS" would get a document about
    // signing contracts they can never be offered.
    await boot(page);
    await startCareer(page);
    await expect(page.locator("#cr-guide .cr-record-cta")).toHaveText("HOW CAREER WORKS");
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
    const body = await page.locator("#cg-body").innerText();
    const c = await page.evaluate(() => ({
      win: Career.PRIZE[0], last: Career.prizeFor(22), bonus: Career.OBJ_BONUS,
      mult: Career.RESEARCH_MULT, slots: Career.SLOTS,
    }));
    expect(body).toContain(c.win.toLocaleString() + " cr");
    expect(body).toContain(c.last.toLocaleString() + " cr");
    expect(body).toContain("+" + c.bonus.toLocaleString() + " cr");
    expect(body).toContain(c.mult + "x the part's price");
    expect(body).toContain(c.slots + " for this mode, " + (c.slots * 2) + " in all");

    // THE FITTED CAP, and the reason it is not quoted as a multiplier here.
    // This used to assert the top of the BUDGET_MULT ladder ("1.6x"), which was
    // the one number in the guide that came from prose after all:
    // Career.upgradeBudget() and budgetUpgradeCost() have no caller outside
    // career.js, so budgetLvl is permanently 0 and the garage charges level 0
    // — exactly the team's works car — for the whole career. Quoting 1.6x was
    // therefore precisely what this test exists to prevent, and the assertion
    // was holding the lie in place rather than catching it.
    //
    // So: the guide must state the cap it actually enforces, and must NOT
    // promise a ladder that cannot be climbed. Restore both halves together —
    // wire the control in career-ui.js beside the FACILITY button, then put the
    // multiplier back here and in the guide, in the same change.
    expect(body).toContain("your team's own works car");
    expect(body).not.toContain("three upgrades");
  });

  test("MY TEAM's guide prices the actual driver market", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 4 }));
    await page.locator("#cr-guide").click();
    const body = await page.locator("#cg-body").innerText();
    const asks = await page.evaluate(() => Career.freeAgents().map((a) => a.ask));
    expect(body).toContain(Math.min(...asks) + " cr a round");
    expect(body).toContain(Math.max(...asks) + " cr a round");
    const start = await page.evaluate(() => Career.START_MONEY.myteam);
    expect(body).toContain(start.toLocaleString() + " cr");
  });
});

// ── the economy, made visible ────────────────────────────────────────────────
// settleRound() computed prize money, salary, the points bonus, the brief and
// the wage bill every round and the driven path threw all of it away. These pin
// that it reaches the screen, and that the numbers on it are the ones the rules
// actually applied.

test.describe("Career — the settlement", () => {
  test.use({ viewport: LANDSCAPE });

  test("a career round shows what it paid, and the total is the new balance", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    const before = await page.evaluate(() => window.__apex.careerState().money);
    await goRacing(page);
    await page.evaluate(() => { window.__apex.park(0.9); window.__apex.finishRace(); });
    await expect(page.locator("#results")).toBeVisible({ timeout: 10_000 });
    const box = page.locator(".res-settle");
    await expect(box).toBeVisible();
    await expect(box).toContainText("ROUND SETTLED");
    // The total is the balance the save actually holds — not a number computed
    // twice and allowed to drift.
    const after = await page.evaluate(() => window.__apex.careerState().money);
    await expect(box.locator(".total .res-settle-v")).toHaveText(after.toLocaleString() + " cr");
    expect(after).not.toBe(before);
  });

  test("a Grand Prix never inherits a career round's earnings panel", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await goRacing(page);
    await page.evaluate(() => { window.__apex.park(0.9); window.__apex.finishRace(); });
    await expect(page.locator(".res-settle")).toBeVisible();
    await page.locator("#res-menu").click();
    await page.locator("#mb-race").click();
    await page.locator("#sel-go").click();
    await page.locator("#cs-done").click();   // START opens the GARAGE; DONE carries on
    await page.locator("#rs-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => { window.__apex.park(0.9); window.__apex.finishRace(); });
    await expect(page.locator("#results")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".res-settle")).toHaveCount(0);
  });
});

// ── extra funds ──────────────────────────────────────────────────────────────

test.describe("Career — extra funds", () => {
  test.use({ viewport: LANDSCAPE });

  test("off by default, and the grant adds exactly what it says", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    expect(await page.evaluate(() => window.__apex.careerFreeMoney())).toBe(false);
    const out = await page.evaluate(() => {
      const before = window.__apex.careerState().money;
      const after = window.__apex.careerGrant();
      return { before, after, grant: Career.GRANT };
    });
    expect(out.after).toBe(out.before + out.grant);
  });

  test("unlimited money does NOT raise the fitted cap", async ({ page }) => {
    // The whole point: money stops being the constraint, the cap does not move.
    // If this ever fails, the cheat has eaten the rule the mode is built on.
    await boot(page);
    await startCareer(page);
    const out = await page.evaluate(() => {
      const capBefore = window.__apex.careerState().budget;
      window.__apex.careerFreeMoney(true);
      const st = window.__apex.careerState();
      // Research everything the catalog has; free money should permit it...
      let bought = 0;
      for (const cat of Parts.CATALOG)
        for (const o of cat.options) if (o.cost && Career.research(o)) bought++;
      return { capBefore, capAfter: window.__apex.careerState().budget,
               money: window.__apex.careerState().money, bought, owned: st.owned };
    });
    expect(out.bought).toBeGreaterThan(20);      // the cheat really did buy them
    expect(out.money).toBeGreaterThan(0);        // ...and cost nothing
    expect(out.capAfter).toBe(out.capBefore);    // but the cap is untouched
  });

  test("the toggle survives a reload and is not part of the save", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await page.evaluate(() => window.__apex.careerFreeMoney(true));
    // Not in the career object — it is a preference, not a fact about a career.
    expect(await page.evaluate(() => window.__apex.career().freeMoney)).toBeUndefined();
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    expect(await page.evaluate(() => window.__apex.careerFreeMoney())).toBe(true);
  });
});

// ── the facility ─────────────────────────────────────────────────────────────

test.describe("Career — the facility", () => {
  test.use({ viewport: LANDSCAPE });

  test("each level permanently cuts what research costs", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    const out = await page.evaluate(() => {
      const opt = Parts.CATALOG.find((c) => c.id === "engine").options.find((o) => o.cost);
      const before = Career.researchCost(opt);
      window.__apex.careerMoney(999999);
      const f1 = window.__apex.careerFacility(true);
      const mid = Career.researchCost(opt);
      window.__apex.careerFacility(true);
      return { before, mid, after: Career.researchCost(opt), level: f1.level };
    });
    expect(out.level).toBe(1);
    expect(out.mid).toBeLessThan(out.before);
    expect(out.after).toBeLessThan(out.mid);
  });

  test("it runs out of levels, not of money", async ({ page }) => {
    // The sink exists because ownership converges; it must therefore have a
    // ceiling that is reached by LEVELS rather than by being unaffordable.
    await boot(page);
    await startCareer(page);
    const out = await page.evaluate(() => {
      window.__apex.careerMoney(9999999);
      for (let i = 0; i < 20; i++) window.__apex.careerFacility(true);
      return window.__apex.careerFacility();
    });
    expect(out.level).toBe(out.max);
    expect(out.cost).toBeNull();                    // nothing left to buy
    expect(out.discount).toBeGreaterThan(0.3);
  });
});

// ── MY TEAM: the hire's contract ─────────────────────────────────────────────
// roster[0].left was written at signing and read by NOTHING, so the one
// relationship the mode is built on was a static number.

test.describe("Career — the hire's contract", () => {
  test.use({ viewport: LANDSCAPE });

  test("it expires, and an empty seat blocks the weekend", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__apex.career({ flavour: "myteam", hire: "NKM", seed: 4242 }));
    expect(await page.evaluate(() => window.__apex.careerHire())).toBeNull();  // under contract
    await goRacing(page);
    const pending = await page.evaluate(() => {
      window.__apex.careerSim(24);
      window.__apex.careerRollover();
      return window.__apex.careerHire();
    });
    expect(pending).not.toBeNull();
    expect(["renew", "left"]).toContain(pending.kind);
    // The hub says so, and will not let the season start.
    await page.evaluate(() => window.__apex.career(true));
    await expect(page.locator("#cr-go")).toBeDisabled();
    await expect(page.locator("#cr-go")).toHaveText("SIGN A DRIVER");
  });

  test("re-signing takes their asking price and clears the block", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__apex.career({ flavour: "myteam", hire: "NKM", seed: 4242 }));
    await goRacing(page);
    const out = await page.evaluate(() => {
      window.__apex.careerSim(24);
      window.__apex.careerRollover();
      const p = window.__apex.careerHire();
      if (!p || p.kind !== "renew") return { skipped: true, kind: p && p.kind };
      window.__apex.careerHire("renew");
      return { ask: p.ask, salary: window.__apex.career().roster[0].salary,
               pending: window.__apex.careerHire() };
    });
    if (out.skipped) { expect(out.kind).toBe("left"); return; }
    expect(out.salary).toBe(out.ask);
    expect(out.pending).toBeNull();
  });

  test("signing somebody else replaces the seat and its wage", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__apex.career({ flavour: "myteam", hire: "NKM", seed: 4242 }));
    await goRacing(page);
    const out = await page.evaluate(() => {
      window.__apex.careerSim(24);
      window.__apex.careerRollover();
      window.__apex.careerHire("OKO");
      const st = window.__apex.careerState();
      return { code: st.roster[0].code, wages: st.wages,
               ask: Career.freeAgents().find((a) => a.code === "OKO").ask,
               pending: window.__apex.careerHire() };
    });
    expect(out.code).toBe("OKO");
    expect(out.wages).toBe(out.ask);
    expect(out.pending).toBeNull();
  });

  test("a driver career has no hire to resolve", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    expect(await page.evaluate(() => window.__apex.careerHire())).toBeNull();
  });
});

// ── MY TEAM: sponsors ────────────────────────────────────────────────────────

test.describe("Career — sponsors", () => {
  test.use({ viewport: LANDSCAPE });

  test("MY TEAM has one and a driver career does not", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    expect(await page.evaluate(() => window.__apex.careerState().sponsor)).toBeNull();
    await page.evaluate(() => window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 7 }));
    const sp = await page.evaluate(() => window.__apex.careerState().sponsor);
    expect(sp).not.toBeNull();
    expect(sp.window).toBeGreaterThan(1);          // a season-long brief, not a weekend one
    expect(sp.pay).toBeGreaterThan(0);
    expect(sp.label.length).toBeGreaterThan(10);
    await expect(page.locator("#cr-left")).toContainText("SPONSOR");
  });

  test("it is drawn from the seed, so a reload cannot reroll it", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 7 }));
    const a = await page.evaluate(() => window.__apex.careerState().sponsor.label);
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    expect(await page.evaluate(() => window.__apex.careerState().sponsor.label)).toBe(a);
  });

  test("a window pays at most once across a whole season", async ({ page }) => {
    // paidSponsors is what stops a reload double-paying and an unmet window
    // being retried by replaying the round.
    await boot(page);
    await page.evaluate(() => window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 7 }));
    await goRacing(page);
    const out = await page.evaluate(() => {
      const rounds = window.__apex.careerSim(24) || [];
      const paid = rounds.filter((r) => r.sponsorPay > 0);
      const c = window.__apex.career();
      return { paidRounds: paid.length, windows: c.paidSponsors.length,
               unique: new Set(c.paidSponsors).size };
    });
    expect(out.windows).toBeGreaterThan(0);
    expect(out.unique).toBe(out.windows);          // never recorded twice
    expect(out.paidRounds).toBeLessThanOrEqual(out.windows);
  });

  test("…and the ledger clears at the rollover, so season two still pays", async ({ page }) => {
    // The test above only proves no DOUBLE pay within a season. paidSponsors
    // records the window index WITHIN a season (sponsorAt walks from round 0), so
    // carrying it across the rollover made every season-two window look already
    // paid — MY TEAM's whole second income stream stopped, silently, from year
    // two on, with the hub still showing the brief and its fee.
    await boot(page);
    await page.evaluate(() => window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 7 }));
    await goRacing(page);
    const out = await page.evaluate(() => {
      window.__apex.careerSim(24);
      const s1 = window.__apex.career().paidSponsors.slice();
      window.__apex.careerRollover();
      const cleared = window.__apex.career().paidSponsors.slice();
      const y2 = window.__apex.careerSim(24) || [];
      return { s1, cleared, y2Paid: y2.filter((r) => r.sponsorPay > 0).length,
               y2Ledger: window.__apex.career().paidSponsors.length };
    });
    expect(out.s1.length).toBeGreaterThan(0);      // season one recorded windows
    expect(out.cleared).toEqual([]);               // rollover wipes the ledger
    expect(out.y2Ledger).toBeGreaterThan(0);       // season two records its own
    expect(out.y2Paid).toBeGreaterThan(0);         // …and actually pays
  });
});
