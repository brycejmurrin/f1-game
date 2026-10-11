// @ts-check
import { test, expect } from "@playwright/test";
import { LANDSCAPE, BOOT_MS, boot, armRace, selectPartCategory, startCareer, goRacing } from "../helpers/career-boot.js";

test.describe.configure({ mode: "parallel" });

// Career shard: MY TEAM / objectives / reputation / rollover / contracts / determinism / history. Helpers: tests/helpers/career-boot.js

test.describe.parallel("Career — objectives", () => {
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

test.describe.parallel("Career — reputation", () => {
  test.use({ viewport: LANDSCAPE });

  test("a settled round moves reputation by result-vs-expectation, the brief and race craft", async ({ page }) => {
    await boot(page);
    await startCareer(page);
    await goRacing(page);
    const r = await page.evaluate(() => {
      const st = window.__apex.careerState();
      // THE BAR IS champPos's, NOT whatever kind the seed dealt. The formula
      // below is about expectedFinish, and champPos is the only kind whose
      // value encodes it (goalValueFor = expectedFinish + AMBITION.delta, and
      // the default rung's delta is 0). Reading st.deal.goal.value handed this
      // spec beatMate's 0 the day a fourth kind changed the draw.
      const team = Teams.LIST.find((t) => t.id === st.team);
      const bar = Career.GOAL_KINDS.champPos.value(team, Career.ambitionOf(st.deal));
      return Object.assign({ rep0: st.rep, bar }, window.__apex.careerSim(1)[0]);
    });
    // The whole formula, restated: the result term is relative to the CAR (the
    // contract's own goal IS expectedFinish for this team), the brief term is
    // flat, and race craft is how the result was obtained — bounded well inside
    // the other two (+1.5 / -0.75) so it colours a season rather than deciding it.
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    expect(typeof r.craft).toBe("number");
    const craft = clamp((r.craft - 0.75) * 6, -0.75, 1.5);
    const expected = clamp((r.bar - r.pos) * 0.6, -4, 6) + (r.obj.done ? 2 : -2) + craft;
    expect(r.rep - r.rep0).toBeCloseTo(expected, 5);
    // ...and the craft term is the ONLY one that moved: without it the sum is
    // wrong by exactly `craft`, which is what caught this spec when it landed.
    expect(r.rep - r.rep0).not.toBeCloseTo(expected - craft, 5);
  });

  test("the same finish is worth less in a better car", async ({ page }) => {
    // expectedFinish() encodes the tier, which is the entire mechanism: P8 for
    // Haas is over-delivery, P8 for Mercedes is under-delivery. Read the two bars
    // directly rather than trying to force two identical race results.
    await boot(page);
    const bars = await page.evaluate(() => {
      // champPos's bar explicitly, for the same reason as the spec above: the
      // tier mechanism lives in expectedFinish, and only champPos's value
      // carries it. The drawn kind is a seeded lottery and irrelevant here.
      const barFor = (id) => {
        window.__apex.career({ teamId: id, seat: 1, seed: 1 });
        const st = window.__apex.careerState();
        const team = Teams.LIST.find((t) => t.id === id);
        return Career.GOAL_KINDS.champPos.value(team, Career.ambitionOf(st.deal));
      };
      const haas = barFor("haas");
      window.__apex.careerReset();
      return { haas, merc: barFor("mercedes") };
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

test.describe.parallel("Career — the rollover", () => {
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

test.describe.parallel("Career — contracts", () => {
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
    // Offers beyond the renewal are gated by market value and a seeded count, so
    // a weak season can legitimately produce none — but this one is not a coin
    // flip: startCareer's fixed seed (4242) draws one extra offer for 2026
    // (Hash32.unit(4242, 2026, "offer", "n") = 0.648 -> 1), and the season ends
    // with the player World champion (asserted above), which clears every
    // lower tier's offerBar. No move here is a regression, not a skip (8-F5).
    expect(move, "a champion's season with seed 4242 draws a move offer").not.toBeNull();

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

test.describe.parallel("Career — determinism", () => {
  test.use({ viewport: LANDSCAPE });
  // A SEASON'S WORK DOES NOT FIT THE DEFAULT BUDGET, and that is a sizing fact
  // rather than a slow box: each test here boots, arms a real race through the
  // quali sheet, then simulates 24 rounds and a rollover. 120 s was never the
  // right budget for that — these timed out at exactly 120000 ms waiting on
  // #quali, with no assertion having failed. The repo's convention for heavy
  // specs (autopilot, the circuit foundations) is an explicit setTimeout, so
  // this says what it needs out loud.
  test.setTimeout(300_000);

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

test.describe.parallel("Career — history", () => {
  test.use({ viewport: LANDSCAPE });
  // A SEASON'S WORK DOES NOT FIT THE DEFAULT BUDGET, and that is a sizing fact
  // rather than a slow box: each test here boots, arms a real race through the
  // quali sheet, then simulates 24 rounds and a rollover. 120 s was never the
  // right budget for that — these timed out at exactly 120000 ms waiting on
  // #quali, with no assertion having failed. The repo's convention for heavy
  // specs (autopilot, the circuit foundations) is an explicit setTimeout, so
  // this says what it needs out loud.
  test.setTimeout(300_000);

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
    // WITH ITS UNIT, like the season row three lines up and like every other
    // points figure in the app (tests/unit/setup-screens-state.test.mjs pins it).
    // This line asserted a bare number and was the odd one out.
    expect(t.Points).toBe(archived.past.pts + " pts");
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

test.describe.parallel("Career — reliability", () => {
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
      await armRace(page, (lvl) => {
        window.__apex.seed(7);
        window.__apex.reliability(lvl);
        window.__apex.race("monza");
      }, level);
      return page.evaluate(() => {
        const out = { skills: [], plan: window.__apex.retirements() };
        for (let i = 0; i < 22; i++) out.skills.push(window.__apex.carAt(i).skill);
        return out;
      });
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
    // A setting row (js/ui/setting-row.js): the options are the select's.
    // It sits in the FIELD fold since 2026-09-18, and folds start closed.
    await page.locator("#rs-fold-field-sum").click();
    const sel = page.locator("#rs-reliab-sel");
    await expect(sel.locator("option")).toHaveCount(3);
    await sel.selectOption("real");
    await expect(sel).toHaveValue("real");
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

test.describe.parallel("Career — slots", () => {
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
    const after = await page.evaluate(() => {
      // careerSlotDelete → {ok, durable, reason, slots} (docs/DEBUG-HOOKS.md)
      const r = window.__apex.careerSlotDelete("myteam", 0);
      return { ok: r.ok, used: (r.slots || []).map((s) => s.used), live: window.__apex.career() };
    });
    expect(after.ok).toBe(true);
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

