// Measure the career economy against the catalog it buys from.
// @doc Sims a career season per starting team through the real `Career.settleRound()`; reports what a year's income affords.
// @skill career-mode
//
// WHY THIS EXISTS. QUALI_TRIM shipped as a reasoned guess and was 27% wrong; it
// took a measurement to find that out. The economy is the same class of number
// and had never had the same treatment — RESEARCH_MULT, the PRIZE ladder and
// BUDGET_MULT were all reasoned. The question none of them answers is the only
// one that matters to a player:
//
//     over one season, how much of the catalog can this car actually afford?
//
// Too little and the mode is a grind. Too much and ownership stops meaning
// anything, the fitted cap becomes the only brake, and the R&D economy the whole
// mode is built on evaporates in year one.
//
// HOW. __apex.careerSim(n) settles rounds through the SAME Career.settleRound()
// a driven weekend uses — prize money, salary, points bonus, the brief and the
// wage bill all resolve exactly as they do in play. So a simulated season's
// income is the real thing, not a model of it. Run one per starting team, then
// price the result against what the catalog charges.
//
//   node tools/career-economy.mjs            # one season per starter team
//   node tools/career-economy.mjs --years 3  # follow the arc over three seasons
import { launchChromium, shutdown, startStaticServer } from "./harness.mjs";
import { fileURLToPath } from "node:url";

const YEARS = Math.max(1, parseInt((process.argv.find((a) => a.startsWith("--years=")) || "").split("=")[1]
  || (process.argv[process.argv.indexOf("--years") + 1] || ""), 10) || 1);

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");

const srv = await startStaticServer(ROOT);
let browser;
try {
  browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 60000 });

// The catalog's own prices, so every figure below is relative to what the money
// is actually for rather than to an abstract credit total.
const cat = await page.evaluate(() => {
  const all = [];
  for (const c of Parts.CATALOG) for (const o of c.options) if (o.cost) all.push(o.cost);
  all.sort((a, b) => a - b);
  return {
    options: all.length,
    total: all.reduce((n, v) => n + v, 0),
    median: all[Math.floor(all.length / 2)],
    dearest: all[all.length - 1],
    mult: Career.RESEARCH_MULT,
  };
});
console.log(`catalog: ${cat.options} priced options · median ${cat.median} cr · dearest ${cat.dearest} cr`);
console.log(`research multiplier ${cat.mult}x — owning the WHOLE catalog costs ${(cat.total * cat.mult).toLocaleString()} cr\n`);

// Every team a career can actually start at (the mode only offers tier 3+).
const teams = await page.evaluate(() =>
  Teams.LIST.filter((t) => !t.custom && t.tier >= 3).map((t) => ({ id: t.id, tier: t.tier })));

const rows = [];
for (const t of [...teams.map((x) => ({ ...x, flavour: "driver" })),
                 { id: "custom", tier: 2, flavour: "myteam" }]) {
  const r = await page.evaluate(async ({ team, years }) => {
    window.__apex.careerReset();
    const opts = team.flavour === "myteam"
      ? { flavour: "myteam", hire: "NKM", seed: 4242 }
      : { teamId: team.id, seat: 1, seed: 4242 };
    window.__apex.career(opts);
    // careerSim reads the qualifying model, so a track and a grid have to exist.
    document.getElementById("cr-go").click();
    document.getElementById("rs-go").click();
    await new Promise((res) => setTimeout(res, 1200));
    const sim = document.getElementById("q-sim");
    if (sim) sim.click();
    const go = document.getElementById("q-go");
    if (go) go.click();
    await new Promise((res) => setTimeout(res, 1500));

    const start = window.__apex.careerState().money;
    let finishes = [];
    for (let y = 0; y < years; y++) {
      const settled = window.__apex.careerSim(24) || [];
      finishes = finishes.concat(settled.map((s) => s.pos));
      if (y < years - 1) window.__apex.careerRollover();
    }
    const st = window.__apex.careerState();
    return {
      id: team.id, tier: team.tier, flavour: team.flavour,
      start, end: st.money, budget: st.budget,
      avgFinish: finishes.length ? finishes.reduce((a, b) => a + b, 0) / finishes.length : 0,
      rounds: finishes.length,
    };
  }, { team: t, years: YEARS });
  const earned = r.end - r.start;
  rows.push({ ...r, earned });
  const parts = earned / (cat.median * cat.mult);
  console.log(
    (r.flavour === "myteam" ? "MY TEAM" : r.id).padEnd(13),
    "tier " + r.tier,
    "| avg finish P" + r.avgFinish.toFixed(1).padStart(4),
    "| earned " + earned.toLocaleString().padStart(8) + " cr",
    "| = " + parts.toFixed(1).padStart(5) + " median parts",
    "| fitted cap " + r.budget.toLocaleString() + " cr");
}

// The verdict. A season should buy a MEANINGFUL but PARTIAL upgrade — enough
// that the car is visibly different, not so much that the catalog is solved.
const parts = rows.map((r) => r.earned / (cat.median * cat.mult));
const lo = Math.min(...parts), hi = Math.max(...parts);
const pctOfCatalog = rows.map((r) => r.earned / (cat.total * cat.mult));
// "% of the whole catalog" is the wrong yardstick on its own, and worth saying
// so: the FITTED CAP means you can never run more than a fraction of what you
// own, so nobody needs the catalog. The number that actually says whether a
// season is worth playing is how many complete CARS-WORTH of research it buys —
// income divided by (the fitted cap x RESEARCH_MULT).
const loads = rows.map((r) => r.earned / (r.budget * cat.mult));
console.log(`\n${YEARS} season(s): ${lo.toFixed(1)}–${hi.toFixed(1)} median parts affordable`);
console.log(`that is ${(Math.min(...pctOfCatalog) * 100).toFixed(1)}%–${(Math.max(...pctOfCatalog) * 100).toFixed(1)}% of the whole catalog`);
console.log(`and ${Math.min(...loads).toFixed(1)}–${Math.max(...loads).toFixed(1)} COMPLETE re-specs of the car you are allowed to fit`);
console.log(`
READING IT. The re-spec figure is the one that matters. Below ~1 a season cannot
even replace the car once and the mode is a grind; above ~6 the catalog is
solved in year one and ownership stops being a choice. Somewhere around 2-4 is a
season that visibly changes the car while still making you pick.

The SPREAD matters as much as the middle. A back-marker earning far less than a
midfield car compounds the wrong way, because the mode already gave them the
slower car — that is exactly the bug this tool was written and immediately found
(salaryFor's tier term had the wrong sign; see js/game/career.js).

RESEARCH_MULT is the single knob — it scales the whole economy against a catalog
that stays the source of truth for what a part is worth. Re-measure after any
change to it, to the PRIZE ladder, or to salaryFor.`);
} finally {
  await shutdown();
}
