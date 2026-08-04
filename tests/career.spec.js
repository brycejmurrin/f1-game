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

// ── objectives, contracts and the rollover (phase 5) ─────────────────────────

test.describe("Career — the season arc", () => {
  test.use({ viewport: LANDSCAPE });

  // careerSim needs a track and a grid loaded, so stage one weekend first.
  async function staged(page, opts) {
    await boot(page);
    await startCareer(page, opts || { teamId: "haas", seat: 1, seed: 4242 });
    await goRacing(page);
  }

  test("every round carries an objective with a readable brief", async ({ page }) => {
    await staged(page);
    const obj = await page.evaluate(() => window.__apex.careerState().obj);
    expect(obj).not.toBeNull();
    expect(typeof obj.type).toBe("string");
    // Stored as scalars; the sentence is derived, never persisted.
    expect(typeof obj).toBe("object");
    expect(JSON.stringify(obj)).not.toMatch(/[a-z] [a-z]+ [a-z]+ [a-z]+ [a-z]+/);
  });

  test("careerSim settles rounds through the real path", async ({ page }) => {
    await staged(page);
    const before = await page.evaluate(() => window.__apex.careerState());
    const rounds = await page.evaluate(() => window.__apex.careerSim(5));
    expect(Array.isArray(rounds)).toBe(true);
    expect(rounds.length).toBe(5);
    const after = await page.evaluate(() => window.__apex.careerState());
    expect(after.round).toBe(before.round + 5);
    // Prize money and salary really landed — this is the same settleRound the
    // driven path uses, not a shortcut that skips the economy.
    expect(after.money).toBeGreaterThan(before.money);
    const pts = await page.evaluate(() => Object.keys(window.__apex.career().season.pts).length);
    expect(pts).toBeGreaterThan(0);
  });

  test("a full season rolls over: archived, year up, standings cleared, money kept", async ({ page }) => {
    await staged(page);
    await page.evaluate(() => window.__apex.careerSim(30));      // past the flag
    expect(await page.evaluate(() => window.__apex.careerState().round))
      .toBe(await page.evaluate(() => window.__apex.careerState().rounds));

    const before = await page.evaluate(() => window.__apex.careerState());
    const out = await page.evaluate(() => window.__apex.careerRollover());
    expect(out).not.toBeNull();
    const after = await page.evaluate(() => window.__apex.careerState());
    expect(after.year).toBe(before.year + 1);
    expect(after.round).toBe(0);
    expect(after.seasons).toBe(before.seasons + 1);
    expect(after.money).toBe(before.money);                       // credits carry over
    const pts = await page.evaluate(() => Object.keys(window.__apex.career().season.pts).length);
    expect(pts).toBe(0);
  });

  test("the rollover mutates the championship in place, keeping game.js's alias", async ({ page }) => {
    // The trap this guards: openCareer does `season = c.season`, and buildResults /
    // buildStandings / the HUD all read that alias. Reassigning career.season at
    // rollover would orphan it — the next season's points would go into a dead
    // object while the standings kept rendering the stale one, which looks fine.
    await staged(page);
    await page.evaluate(() => { window.__apex.career().season.__tag = "same-object"; });
    await page.evaluate(() => window.__apex.careerSim(30));
    await page.evaluate(() => window.__apex.careerRollover());
    const tag = await page.evaluate(() => window.__apex.career().season.__tag);
    expect(tag).toBe("same-object");
  });

  test("the season ends with contract offers, and taking one moves you", async ({ page }) => {
    await staged(page);
    await page.evaluate(() => window.__apex.careerSim(30));
    const out = await page.evaluate(() => window.__apex.careerRollover());
    expect(Array.isArray(out.offers)).toBe(true);
    expect(out.offers.length).toBeGreaterThan(0);
    for (const o of out.offers) expect(typeof o.teamId).toBe("string");

    const moved = await page.evaluate(() => {
      const c = window.__apex.career();
      const target = c.offers.findIndex((o) => o.teamId !== c.team);
      if (target < 0) return { skipped: true };
      const from = c.team;
      Career.acceptOffer(target);
      return { skipped: false, from, to: window.__apex.career().team };
    });
    if (!moved.skipped) expect(moved.to).not.toBe(moved.from);
  });

  test("the whole arc is deterministic for a fixed seed", async ({ page }) => {
    const arc = async (seed) => {
      await staged(page, { teamId: "haas", seat: 1, seed });
      await page.evaluate(() => window.__apex.careerSim(30));
      const out = await page.evaluate(() => window.__apex.careerRollover());
      return JSON.stringify({ champ: out.champion, offers: out.offers.map((o) => o.teamId) });
    };
    const a = await arc(777);
    await page.evaluate(() => window.__apex.careerReset());
    const b = await arc(777);
    expect(b).toEqual(a);
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
    const balanceAfter = async (hire) => {
      await boot(page);
      await page.evaluate(() => window.__apex.careerReset());
      await startMyTeam(page, { hire });
      await goRacing(page);
      await page.evaluate(() => window.__apex.careerSim(4));
      return page.evaluate(() => window.__apex.careerState().money);
    };
    const rich = await balanceAfter("OKO");    // cheapest
    const poor = await balanceAfter("FER2");   // dearest
    expect(rich).toBeGreaterThan(poor);
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
});
