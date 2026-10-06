// @ts-check
// CAREER mode: the save, the mode axes, the hub, and the isolation guarantees
// that keep Grand Prix and Time Trial untouched by a career existing.
// Split across career.spec.js / career-season.spec.js / career-hub.spec.js so
// select-specs can pack ~8-min legs (UI Survey owns further career work).
//
// DELIBERATELY ON THE VIRGIN-PAGE FIXTURE. Shared helpers: tests/helpers/career-boot.js
import { test, expect } from "@playwright/test";
import { LANDSCAPE, BOOT_MS, boot, armRace, selectPartCategory, startCareer, goRacing } from "../helpers/career-boot.js";

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
    // Same double-grid-build cost as its sibling below, and the same budget
    // problem one step earlier: MEASURED 98.5 s alone on an idle box, which
    // clears the 120 s default with almost nothing to spare — and it duly
    // failed at 102.8 s inside a `modes` run with the box at loadavg 4-5,
    // on `locator.click: Timeout 60000ms`, never reaching an assertion.
    // A guard that only holds while the machine is quiet is not a guard.
    // test.slow() triples the budget rather than hiding the cost.
    test.slow();
    // The save is loaded at boot and stays loaded, so this is the guard that its
    // RULES stay switched off outside career. tierV is the one number career
    // development moves, so read it per car directly rather than inferring it
    // from lap positions (which also move when the career changes your team).
    const tierVs = async () => {
      await armRace(page, () => { window.__apex.seed(99); window.__apex.race("monza"); });
      return page.evaluate(() => {
        const out = {};
        for (let i = 0; i < 24; i++) {
          const c = window.__apex.carAt(i);
          if (!c) break;
          out[c.team + ":" + c.seat] = c.tierV;
        }
        return out;
      });
    };
    await boot(page);
    const before = await tierVs();
    // Give the career development big enough that any leak is unmissable.
    await page.evaluate(() => {
      window.__apex.career({ teamId: "haas", seat: 1, seed: 7 });
      const c = window.__apex.career();
      c.tdev.mercedes = 8; c.tdev.haas = -8;
    });
    await page.locator("#cr-back").click();
    const after = await tierVs();
    expect(after).toEqual(before);
  });

  test("…but it DOES reach the career itself", async ({ page }) => {
    // MEASURED 2026-09-16, alone on an otherwise idle box: 132.1 s at the
    // then-deploy tip and 145.8 s one commit later — i.e. it exceeds the file's
    // 120 s default even with nothing else running, and it fails as
    // "Test timeout of 120000ms exceeded" with no assertion ever reached,
    // which reads as a career-development regression and is not one.
    // The cost is inherent: mercTierV() goes racing through the hub, so this
    // test pays for TWO full boots and TWO full 11-team grid builds either side
    // of a page reload — the apex-logs show it still building cars at 61.8 s.
    // The reload is what gives the second measurement a clean career, so
    // removing it would gut the isolation this test exists to prove.
    // test.slow() triples the budget rather than hiding the cost.
    test.slow();
    // The other half of the same guarantee: inside a career the development is
    // real, or the whole progression arc is cosmetic.
    //
    // MEASURED AGAINST ITSELF, not against a literal. This read
    // `expect(merc).toBeGreaterThan(1)` with the note "TIER_V[0] is 1.0" — and
    // TIER_V[0] is 0.9695. It is a PACE TUNING TABLE and it was retuned, so the
    // premise went stale and the spec failed on a car whose development was
    // working perfectly: the observed 0.98889 is exactly 0.9695 × (1 + 8 ×
    // TDEV_TO_PACE), i.e. the development applied, in full. Same failure shape
    // as the hardcoded track fraction in sliders.spec.js — an absolute number
    // standing in for a relationship.
    const mercTierV = async () => {
      await goRacing(page);
      return page.evaluate(() => {
        for (let i = 0; i < 24; i++) {
          const c = window.__apex.carAt(i);
          if (c && c.team === "mercedes") return c.tierV;
        }
        return null;
      });
    };
    await boot(page);
    // Go racing through the hub — __apex.race() is explicitly a Grand Prix and
    // would switch the flow back to gp.
    await page.evaluate(() => window.__apex.career({ teamId: "haas", seat: 1, seed: 7 }));
    const plain = await mercTierV();
    expect(plain, "no mercedes car on the grid").not.toBeNull();

    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => {
      window.__apex.career({ teamId: "haas", seat: 1, seed: 7 });
      window.__apex.career().tdev.mercedes = 8;
    });
    const developed = await mercTierV();
    expect(developed).not.toBeNull();
    expect(developed).toBeGreaterThan(plain);   // +8 dev makes the car faster, whatever the table says
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
    await selectPartCategory(page);
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
    const gridFor = async (careerOpts) => {
      await armRace(page, (o) => {
        if (o) window.__apex.career(o); else window.__apex.careerReset();
        window.__apex.seed(1234);
        window.__apex.race("monza");
      }, careerOpts);
      return page.evaluate(() => {
        const q = window.__apex.qualiSim();
        return (q && q.rows ? q.rows : q || []).map((r) => r.code).join(",");
      });
    };

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

  const skills = async (page) => {
    await armRace(page, () => { window.__apex.seed(5); window.__apex.race("monza"); });
    return page.evaluate(() => {
      const out = [];
      for (let i = 0; i < 24; i++) {
        const c = window.__apex.carAt(i);
        if (!c) break;
        out.push(c.code + ":" + c.skill);
      }
      return out;
    });
  };

  test("the same seed produces the same grid — the RNG stream is unchanged", async ({ page }) => {
    // driverSkill() must draw simRnd() unconditionally. If the draw ever moves
    // inside a branch, the stream position after makeCars() shifts and every
    // seeded spec in the suite starts lying. This is that guard.
    await boot(page);
    const a = await skills(page);
    const b = await skills(page);
    expect(b).toEqual(a);
    expect(a.length).toBeGreaterThan(20);
  });

  test("ratings differentiate the field, fastest to slowest", async ({ page }) => {
    await boot(page);
    await armRace(page, () => { window.__apex.seed(5); window.__apex.race("monza"); });
    const grid = await page.evaluate(() => {
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
    await armRace(page, () => window.__apex.race("monza"));
    const gpAfter = await page.evaluate(() => {
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
  // Open the garage AND land on a PART category. The garage opens on whatever
  // `garageTab` says and its default is "team" — and TEAM, LIVERY and TUNE are
  // pseudo-categories that build their own panes and return before any
  // `.cs-opt` row is made (js/garage/setup-sheet.js PSEUDO_CATS). So a spec
  // that opens the garage and looks for a locked PART row finds an empty pane
  // and reads null, which is what these three did — not a timing problem and
  // not a renamed class, just the wrong tab.
  //
  // Picks the first catalog category that actually HAS a researchable option,
  // rather than naming one: a category whose rows are all cost-0 would have no
  // locked row either, and hardcoding "engine" would rot the same way the
  // hardcoded track fraction did in sliders.spec.js.
  async function openGarage(page) {
    await page.evaluate(() => document.getElementById("cr-garage").click());
    await expect(page.locator("#carsetup")).toBeVisible();
    await selectPartCategory(page);
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
    await tap("sel-car");
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
    // Both cars' prize money in (an owner draws no salary or points bonus, so
    // those are 0 here), wages out — the wage bill is genuinely deducted.
    expect(r[0].salary).toBe(0);
    expect(after).toBe(before + r[0].prize + r[0].matePrize + r[0].salary + r[0].bonus
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
    await armRace(page, () => { window.__apex.seed(2); window.__apex.race("monza"); });
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

