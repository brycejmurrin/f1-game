// @ts-check
import { test, expect } from "@playwright/test";
import { LANDSCAPE, BOOT_MS, boot, armRace, selectPartCategory, startCareer, goRacing } from "../helpers/career-boot.js";

// Career shard: reliability / slots / modes screen / guide / settlement / facility / sponsors. Helpers: tests/helpers/career-boot.js

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
    await expect(page.locator("#cr-title")).toHaveText("NEW MY TEAM");
    await expect(page.locator("#cr-go")).toHaveText("START MY TEAM");
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
    await expect(page.locator("#cr-title")).toHaveText("NEW MY TEAM");
    await expect(page.locator("#cr-go")).toHaveText("START MY TEAM");
  });

  test("deleting frees that slot, and only that slot", async ({ page }) => {
    await boot(page);
    await fillDriver(page);
    await toModes(page);
    // Career backup reuses .cr-slot-del for EXPORT/IMPORT/DELETE — pin DELETE
    // via aria-label (getByRole name), not the shared class alone.
    const del = () => page.locator("#cr-left .cr-slot").nth(1)
      .getByRole("button", { name: /^(Confirm: )?delete /i });
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
    const leftDel = () => page.locator("#cr-left .cr-slot").nth(0)
      .getByRole("button", { name: /^(Confirm: )?delete /i });
    const rightDel = () => page.locator("#cr-right .cr-slot").nth(0)
      .getByRole("button", { name: /^(Confirm: )?delete /i });
    await leftDel().click();
    await expect(leftDel()).toHaveText("DELETE?");
    await expect(rightDel()).toHaveText("DELETE");
  });

  test("deleting everything leaves a screen you can still start from", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.__apex.career({ teamId: "haas", seat: 1, seed: 2 });
      window.__apex.career({ flavour: "myteam", hire: "OKO", seed: 3 });
    });
    await toModes(page);
    for (const pane of ["#cr-left", "#cr-right"]) {
      const del = () => page.locator(pane + " .cr-slot").nth(0)
        .getByRole("button", { name: /^(Confirm: )?delete /i });
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
  // A SEASON'S WORK DOES NOT FIT THE DEFAULT BUDGET, and that is a sizing fact
  // rather than a slow box: each test here boots, arms a real race through the
  // quali sheet, then simulates 24 rounds and a rollover. 120 s was never the
  // right budget for that — these timed out at exactly 120000 ms waiting on
  // #quali, with no assertion having failed. The repo's convention for heavy
  // specs (autopilot, the circuit foundations) is an explicit setTimeout, so
  // this says what it needs out loud.
  test.setTimeout(300_000);

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
