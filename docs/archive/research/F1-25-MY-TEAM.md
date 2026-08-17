# F1 25 "My Team 2.0" — what it is, what we have, what to build

Research + design for improving Apex 26's **MY TEAM** against the mode EA/Codemasters
shipped in F1 25 (30 May 2025). Written from the primary EA deep dive, a
developer-interview piece, player guides and eight months of r/F1Game criticism, then
grounded line-by-line in `js/game/career.js`, `js/game/career-ui.js`, `js/game.js`
and `tools/career-economy.mjs`.

**Evidence discipline.** Every claim about our code is a read of the file at the line
cited. Nothing here was executed — no browser run, no `career-economy.mjs` run — so
every behavioural claim is labelled **(read, not run)** where the distinction matters.
Every external claim carries its URL.

## Sources

| # | Source | What it is good for |
|---|---|---|
| S1 | https://www.ea.com/en/games/f1/f1-25/news/f1-25-career-deep-dive (EA, 2025-04-10) | Primary. Owner role, Engineering/Personnel/Corporate, Team HQ, XP → training points, Fan Rating, choosing which driver to race |
| S2 | https://traxion.gg/how-codemasters-is-reinventing-my-team-in-f1-25/ (2025-04-10) | Creative-director interviews. The *design intent* behind dropping the driver/owner, split R&D, Owner Perks, Sentiment, cost cap, automation options |
| S3 | https://traxion.gg/f1-25s-fan-points-system-explained/ (2025-06-04) | Fan Points → Fan Rating, what feeds it, Fan Bonuses, Sentiment pairing |
| S4 | https://www.trophi.ai/post/f1-25s-new-my-team-2-0-mode-explained | Owner Perks as a credit-bought training/skill tree; two-step research→build; cost cap |
| S5 | https://racinggames.gg/article/f1-25s-my-team-2-redefinition-of-career-mode | Per-facility walkthrough (Engineering / Personnel / Workforce / Corporate / HQ) |
| S6 | https://gamingbolt.com/f1-2021-guide-myteam-tips-for-sponsors-departments-rd-and-earning-acclaim | The F1 2020–21 baseline: six departments, acclaim, sponsors as signing bonus + weekly income + goal bonus |
| S7 | https://simracingconfigs.com/most-important-rd-car-upgrades-on-f1-24-career-driver-my-team-career/ | The F1 24 baseline: four R&D departments, prescribed unlock paths, specialists |
| S8 | https://www.reddit.com/r/F1Game/comments/1lajvum/my_team_20_is_flawed/ | Criticism: everything maxed mid-season-2, money with nothing to buy |
| S9 | https://www.reddit.com/r/F1Game/comments/1lvjfk0/myteam_is_comepletely_broken_and_no_one_talks/ | Criticism + an EA community-manager acknowledgement of the plateau |
| S10 | https://www.reddit.com/r/F1Game/comments/1ldt7ly/f1_25_my_team_review/ | 80-hour player review: season 1 great, season 3 "dull and dry", £100m with nothing to spend it on |
| S11 | https://www.reddit.com/r/F1Game/comments/1km88dw/f1_25_my_team_opninions/ | The identity backlash, and a Codemasters CM reply on sponsors/decals/Fan Rating |
| S12 | https://www.reddit.com/r/F1Game/comments/1poi8tb/my_problems_with_f125_my_team/ | Long-form immersion complaints: team colour, sponsor pool, "forced to play as a driver" |

---

## 1. What My Team 2.0 actually does

### 1.1 The one change everything else hangs off

S1: *"My Team 2.0 sees you take on a more authentic, management-focused role in that
of a **team owner** … you'll be responsible for recruiting and managing **a pair of
drivers to represent your team**. Then, during race weekends, you'll be given the
choice as to which driver you'd like to take to the track."*

The stated reason is a design one, not a realism one. S2 quotes creative director
Gavin Cooper: *"The old system where you identify as one of the drivers cut off a lot
of potential avenues… We would have liked to ask you to prioritise one driver over
another, but that decision becomes meaningless: you always want to pick yourself…
we can make you uncomfortable and choose between your babies."*

That sentence is the whole thesis, and it is the one worth stealing: **a two-driver
team only generates decisions if neither driver is you.**

### 1.2 The structure, F1 25

| System | What it does | Source |
|---|---|---|
| **Engineering** | Splits *research* from *development* for the first time. Research a part, then build it. Build for both cars (cheaper, slower) or one car (faster, one driver misses out — and resents it) | S1, S2, S4 |
| **Resource-point income** | Scaled **inversely** by constructors' standing: leaders get fewer RP, back-markers get more | S1 |
| **Personnel** | Driver contracts. You may negotiate with several drivers before the window; *"having news of these conversations leaked to other drivers might spell disaster"* | S1 |
| **Workforce** | Headcount per facility. More staff = faster part development, faster facility builds, more RP per weekend; and more cost | S1, S2, S5 |
| **Corporate** | Finance planning against the **cost cap**; also the home of the Decal Editor and the sponsor system | S1, S5 |
| **Team HQ** | Facility improvement system; the HQ *visually* grows with the team. Upgrades and resolved negotiations pay **Owner XP** | S1, S2 |
| **Owner Perks** | A skill tree bought with XP/training points, specialising into engineering, corporate or personnel | S1, S2, S4 |
| **Fan Rating** | Fan Points from race objectives, Team Accolade tiers, won rivalries, department events/activities. Levelling gives a one-time reward; paired with **Sentiment** it unlocks Fan Bonuses (extra corporate/sponsor income, cheaper facility upgrades). High Fan Rating unlocks lucrative title sponsors and makes prestigious drivers easier to sign | S1, S3 |
| **Sentiment** | A second reputation axis: how the sport sees the team. Feeds contract demands | S2 |
| **Sponsors** | Title sponsor + secondary sponsors, with a **loyalty** ladder unlocking cash, XP, liveries and decal variants. Number of placeable sponsor decals scales with Fan Rating | S2, S11 |
| **Cost cap** | A hard per-season spend ceiling, mirroring the real regulation | S2, S4 |
| **Driver Icons** | AI teams can now sign icons too; F3 and esports drivers in the market; transfer frequency is a setting | S1, S2 |
| **11th team** | Konnersport / APXGP can be added to the grid, or *taken over* in My Team instead of a custom team | S1 |
| **Automation** | R&D can be automated and activities auto-filled, so the depth is opt-in | S2 |

### 1.3 F1 25 new vs carried over

**New in F1 25**

- Team owner replaces driver/owner; two rostered drivers; per-weekend choice of which to drive.
- Research and development split into two steps; per-driver part allocation.
- Owner XP / Owner Perks tree.
- Team HQ as a facility system with per-facility workforce, and a visually growing HQ.
- Cost cap.
- Fan Rating + Sentiment inside My Team (Accolades and rivalries carried across from F1 24 *Driver Career*).
- Constructors'-standing-scaled resource-point income.
- Multi-driver contract negotiation with leak risk.
- Sponsor loyalty ladder; decal editor; decal slots scaling with Fan Rating.
- AI teams recruiting Driver Icons; 11th team playable/ownable.

**Carried over from F1 2020–F1 24**

- Create a team (name, brand, livery) and hire a second driver — the F1 2020 premise.
- A department/R&D ladder you spend an earned currency on (F1 2020–21 had six
  departments — Aerodynamics, Powertrain, Durability, Personnel, Marketing, Chassis
  — S6; F1 24 collapsed to four — Aerodynamics, Chassis, Engine, Durability — with
  prescribed unlock paths and "specialists" boosting a chosen area, S7).
- Sponsors as goal-bearing contracts paying a signing bonus + recurring income +
  a goal bonus (S6).
- Acclaim as the reputation currency gating sponsors and drivers — **Fan Rating is
  acclaim renamed and re-plumbed**, not a new idea.
- Resource points earned on track (practice programmes, objectives).

### 1.4 What players say went wrong

This matters more than the feature list, because the failure mode is one our economy
can reproduce exactly.

| Complaint | Evidence |
|---|---|
| **The plateau.** Car and facilities maxed by mid-season 2 / season 3; five teams with identical cars; regulation "adaptation" too cheap to reset anything; nothing left to spend on | S8, S9, S10. An EA CM replied *"We are aware of this problem and are looking at a fix for the next patch"* (S9) |
| **Money with no sink.** *"I have over £100m in cash with very little options to spend it on in my 3rd season"* | S10 |
| **The cost cap is a non-feature.** *"in the first and second seasons you don't make enough money to outspend the cost cap and by the third you have nothing to spend it on"* | S10 |
| **Identity loss.** The single loudest thread: *"The better solution would've very clearly been to just detach the team owner role from the driver identity"* — keep the management, keep the created driver | S11 |
| **Forced into a car.** *"I want to use driver career to drive and I want my team to play as a team principal… just make it a career setting"* | S12 |
| **Second-driver cheese.** *"You can easily cheese the system by having 1 good driver and 1 cheap rookie that you race with"* | S8 |
| **Thin sponsor/brand pool.** Three primary sponsors, always the same secondaries, decals not freely placeable on sponsor liveries | S12 |

Two design lessons fall straight out:

1. **An ownership economy needs a subtractive term.** Every currency in F1 25's My
   Team is monotonic — owned parts, facility levels, workforce, fan rating — so the
   mode's difficulty curve has exactly one direction. Apex 26 has the same property
   (§2, row "endgame").
2. **Removing the player's driver identity cost them more goodwill than the two-driver
   decisions bought.** The fix players proposed themselves is to keep the created
   driver *in the pool* — own the team, and choose whether you are one of its drivers.

---

## 2. Gap table — F1 25 feature → Apex 26 status

| F1 25 feature | Apex 26 status | Where |
|---|---|---|
| Own a custom constructor | **HAVE** | `js/game/career.js:321` (`teamId` defaults to `"custom"`), `js/game/tables.js:10-15` (`DEFAULT_CUSTOM`, tier 2) |
| The team enters two cars | **HAVE** | `js/game/career.js:441-447` `gridDrivers()`; `js/game.js:1457,1466`; pinned by `tests/specs/career.spec.js:632` |
| A hired second driver on a salary | **HAVE** | `js/game/career.js:72-81` `FREE_AGENTS`, `451-454` `wageBill()`, deducted `js/game/career.js:829-830`; pinned `career.spec.js:643` |
| The hire's contract expires, renews, or they are poached | **HAVE** | `js/game/career.js:1027-1082`; pinned `career.spec.js:1936-2010` |
| Two rostered drivers, **neither of whom is you** | **MISSING** | `js/game/career.js:361-367` — `roster` is a 1-element array; seat 0 is always `career.driver` (`js/game/career.js:429-432`) |
| Choose which driver you race this weekend | **MISSING** (but nearly free) | `js/game.js:7135` already does `driverIdx = c.seat`, and `career.seat` is a persisted integer. Nothing writes it after `start()` for a MY TEAM save |
| Split research → development | **PARTIAL** | We have research-as-purchase (`js/game/career.js:561-570`) and a separate fitted cap (`521-525`). There is no build step and no lead time |
| Per-driver part allocation | **MISSING**, and there is currently no channel for it | `js/game.js:1462,1468,1486-1491` — only the player's car gets `mods`/`aeroLoad`/ERS from the garage; every other car including your own hire resolves `Parts.getFactorySetup(team)`. AI pace is `c.tierV * c.skill * dd.ai` (`js/game.js:3417`) with no parts term |
| "Both cars run your build" | **DOCUMENTED BUT FALSE** | Claimed at `js/game/career-ui.js:440`; contradicted by `js/game.js:1468` and `js/game.js:1486`. (read, not run) |
| Income scaled inversely by constructors' standing | **MISSING** | `js/game/career.js:793-796` `prizeFor()` is a pure function of finishing position |
| Owner XP + a perk tree | **MISSING** | No XP field on the save (`js/game/career.js:325-362`) |
| Fan Rating / Sentiment as team reputation | **MISSING** | `career.rep` (`js/game/career.js:831-833`) is a *driver's* paddock standing: it drives `salaryFor()` (383-385), `expectedFinish()` (404-406) and `marketValue()` (1089-1095). None of those is a fan |
| Accolades | **MISSING** | `careerTotals()` (`js/game/career-ui.js:1073`) already derives every number an accolade table would need |
| Rivalries | **MISSING** | — |
| Engineering / Personnel / Corporate departments | **PARTIAL** — one flat ladder | `js/game/career.js:697-722`: `FACILITY_MAX = 8`, one geometric price, one linear research discount |
| Workforce headcount with running cost | **MISSING** | `wageBill()` (`js/game/career.js:451-454`) counts drivers only |
| Cost cap (season spend ceiling) | **DELIBERATELY-NOT** — see §4 | We have a *fitted*-cost cap instead (`js/game/career.js:38-50`, `docs/CAREER.md:225-243`), which does the same job (every weekend stays a choice) without a second ledger |
| Sponsors as multi-round briefs | **HAVE**, and arguably better | `js/game/career.js:601-684`. Windows tile the season; progress read off `career.results`; `paidSponsors` prevents double-pay |
| Sponsor loyalty ladder | **MISSING** | `SPONSOR_KINDS[].pay` (`js/game/career.js:601-608`) is a flat per-kind constant |
| Livery / decal editor | **PARTIAL, and outside the mode** | `js/game.js:7790-7819` writes `apex26.customTeam` from the free-play `#customize` screen; `js/game/setup-ui.js:444-545,680-700` is a full custom-livery editor. The MY TEAM setup pane (`js/game/career-ui.js:561-624`) asks only for name/code/number and a hire |
| Budget/cap upgrade ladder | **WRITTEN BUT UNWIRED** | `js/game/career.js:49-50, 526-528, 571-589` — `upgradeBudget()` has no caller outside its own file, so `budgetLvl` is permanently 0. Recorded at `docs/CAREER.md:237-243` |
| Driver Icons / AI teams signing icons | **DELIBERATELY-NOT** — see §4 | `js/car/teams.js` is the verified real-world 2026 grid and is loaded by `tools/carview.html` through the manifest's CARVIEW subset (`docs/CAREER.md:181-184`) |
| 11th/12th team takeover | **DELIBERATELY-NOT** | The custom team *is* the twelfth team (`js/game/tables.js:11`). Adding a second fictional constructor doubles the grid-filter special cases at `js/game/career.js:868,900,911,963,988` for no new decision |
| **Endgame / anti-plateau** | **MISSING — and we have F1 25's exact bug shape** | `career.owned` only ever grows (`js/game/career.js:566`); MY TEAM can never take an offer (`1116`), so the `acceptOffer()` re-seed at `1154-1160` — the one thing that resets a garage — is unreachable in this mode. The FACILITY ladder (`697`) is the only late sink and it stops at 8 |

---

## 3. Ranked proposals

Effort key: **S** ≈ a session, **M** ≈ a day with tests, **L** ≈ multi-session.
`CAREER_V` steps are proposed in landing order; if two land out of order, renumber —
the ladder at `js/game/store.js:186-190` is positional. A key that only needs a
*default* (`career.fans = 0`) is a **fill** in `migrateCareer`'s block at
`js/game/store.js:226-234`, **not** a rung — `store.js:222-225` states that rule and
it should be honoured, because a fill costs nothing and a rung is forever.

---

### P1 — Two rostered drivers, and pick who you race

**What.** `career.roster` becomes a 2-element array indexed **by seat**. Each entry is
either `{you: true}` (your created driver, salary 0) or a hire drawn from
`FREE_AGENTS`. `career.seat` stops meaning "which seat you were born into" and starts
meaning **"which of my two cars I am driving this weekend"** — a hub toggle writes it.
At creation, MY TEAM offers three shapes: *you + a hire* (today's mode, the default),
*two hires* (pure owner; you embody whichever you pick each round), or *you in either
seat*.

**Why it fits.** This is My Team 2.0's entire thesis (S2), and the plumbing already
exists: `js/game.js:7135` does `driverIdx = c.seat` on every `openCareer()`, and
`makeCars()` picks the player car with `di === driverIdx` (`js/game.js:1467`).
Championship points are keyed `team:seatIndex` (`js/game/store.js:132`), so points
follow the *seat*, which is exactly right when the human moves between them — no
points bookkeeping changes at all. It also answers the loudest criticism of the real
mode (S11, S12) by keeping the created driver *available* rather than deleting them.

**Files / functions.**
- `js/game/career.js:361-367` — build a 2-length roster in `start()`.
- `js/game/career.js:424-435` `driverOverride()` — seat 0 is no longer hard-wired to `career.driver`; read `roster[seatIdx]`.
- `js/game/career.js:441-447` `gridDrivers()` — return both roster entries.
- `js/game/career.js:451-454` `wageBill()` — already sums the array; a `{you:true}` entry carries `salary: 0`.
- `js/game/career.js:1035-1054` `rolloverHire()` — **currently hard-codes `seasonDriverId(career.team, 1)`** (line 1042); must loop both seats and skip `{you:true}`.
- `js/game/career.js:1057-1082` `renewHire`/`hireDriver`/`hirePending` — take a seat index; `hirePending()` returns the *first* unresolved seat so the existing "SIGN A DRIVER" block (`js/game/career-ui.js:881-920,972-984`) keeps working unchanged.
- `js/game/career-ui.js:561-583` — the setup pane picks two seats, not one.
- `js/game/career-ui.js:737-747` — THE TEAM card grows a `RACE THIS WEEKEND` toggle per seat.

**Save shape.** `roster: [entry, entry]`; `seat` re-interpreted. **`CAREER_V` 1 → 2**
(a rung, not a fill: a v1 `roster` is 1-long and its single entry is seat **1**, so it
must be transformed to `[{you:true, salary:0}, oldEntry]`).

**The test that pins it.** Extend `tests/specs/career.spec.js:598` "Career — MY TEAM":
(a) both seats appear in `__apex.fieldState()` with the roster's names; (b) flipping
the seat toggle then `__apex.carAt(i)` shows `isPlayer` on the other seat and the
championship id `custom:0` / `custom:1` swaps who is human; (c) a v1 save with a
1-long roster migrates to two seats with the player in seat 0 (add to the migration
group near `career.spec.js:120`); (d) `wageBill()` is unchanged for the default shape
— this is what keeps the economy neutral.

**Effort.** M.

**Economy re-measurement.** Required only if the "two hires" shape ships, because it
doubles the wage bill. `tools/career-economy.mjs:75-76` runs exactly one MY TEAM row
(`custom`, tier 2, hire `NKM`, seed 4242). Add two more rows — cheapest pair (`OKO`+`CHD`)
and dearest pair (`FER2`+`LNQ`) — and read the *"COMPLETE re-specs"* line
(`career-economy.mjs:130-133`). Target stays 2–4; if the dearest pair drops below 1
the mode is a grind and `HIRE_MIN`/the `ask` ladder at `js/game/career.js:72-81` is
the knob, **not** `RESEARCH_MULT`.

---

### P2 — A regulation reset: the anti-plateau

**What.** Every `REG_CYCLE` seasons (3 is the natural first number), the winter
retires part of what you own. Seeded per career: `Career.rnd(year, "reg", catId)`
picks 3–5 of the 12 catalog categories (`js/car/parts.js:22,72,120,166,211,255,301,341,381,418,454,489`);
in those categories every **non-zero-cost** owned option is dropped from
`career.owned` and a fresh generation is re-researchable at the same catalog price.
The end-of-season sheet names which categories were reset. Cost-0 options are never
touched, which preserves the "a save can never produce an illegal car" guarantee at
`js/game/career.js:487-493`.

**Why it fits.** This is the single loudest failure of the real mode (S8, S9, S10),
and **we have its exact shape**: `career.owned` only grows (`js/game/career.js:566`),
and the one code path that ever re-seeds a garage — `acceptOffer()` at
`js/game/career.js:1154-1160` — is unreachable in MY TEAM because `makeOffers()`
returns `[]` for the flavour (`1116`). So a MY TEAM career converges on owning the
whole catalog with the 8-level FACILITY as its only remaining sink, exactly as
`docs/CAREER.md:558-561` predicted. A regulation cycle is the *subtractive* term the
economy has never had, and it is the only proposal here that makes season 6 different
from season 3.

**Why not just make things dearer.** Because that is a grind, not a decision — and
`tools/career-economy.mjs:134-147` already says so in the tool's own verdict text.
Subtracting *specific categories* asks a question ("rebuild the engine or the floor
first?"); raising a price asks none.

**Files / functions.** New `rolloverRegs()` in `js/game/career.js`, called from
`rollover()` between `rolloverTeams()` and `rolloverMarket()`
(`js/game/career.js:1206-1208`) — before `year++` at `1221`, so the draw hashes the
year that just finished, matching the ordering rule at `js/game/career.js:1181-1183`.
Every reset id must also be pulled out of `career.fitted` or the car is running
something it no longer owns; `getTeamParts`/`saveTeamParts` (`js/game.js:1177`) is the
enforcement funnel `docs/CAREER.md:245-253` names, so re-run the fitted set through it.
Report on the offers sheet at `js/game/career-ui.js:1012-1026`, beside THE DRIVER MARKET.

**Save shape.** `career.regs: [{year, cats: []}]` (capped like `history`,
`js/game/career.js:1203-1204`). A fill, not a rung — a save without it is a valid
save that has simply had no reset yet.

**The test that pins it.** New group in `tests/specs/career.spec.js` beside "Career —
the rollover" (`:850`): (a) three `__apex.careerRollover()` calls reduce
`__apex.career().owned.length` at the third and not the first two; (b) every cost-0
option survives (assert `Parts.DEFAULTS` ids all still resolve); (c) the same seed
resets the same categories twice (the determinism idiom at `career.spec.js:1134`);
(d) the fitted build after a reset contains only owned ids.

**Effort.** M.

**Economy re-measurement.** Mandatory, and this is the proposal the tool was built
for. `node tools/career-economy.mjs --years 3` and `--years 6`. Read the re-spec band
at `career-economy.mjs:131-133`: seasons 1–3 should be unchanged (the reset has not
fired), and the season-4 figure should land back near the season-1 figure rather than
above 6. If it lands below 1, cut the reset from 5 categories to 3 before touching
`RESEARCH_MULT` — `RESEARCH_MULT` is the whole-economy knob
(`js/game/career.js:36`, `docs/CAREER.md:534-536`) and using it to correct a
once-every-three-years event would mis-price every other season.

---

### P3 — The second car actually runs your build

**What.** Give the career team's non-player seat a pace contribution derived from the
fitted build, baked into `tierV` at `js/game.js:1497` — *not* into the physics step at
`js/game.js:3417`. Concretely: a new `Career.buildPace(teamId)` returning
`1 + k * (fittedCost / worksCost - 1)`, clamped to the same ±2% band `TDEV_TO_PACE`
uses (`js/game/career.js:57-58`), applied only to cars of the career team that are not
the player's. Once that channel exists, F1 25's "build one part or two" becomes
expressible: a per-seat `spec` flag on the roster entry decides whether that seat gets
the developed number or the works one.

**Why it fits.** `js/game/career-ui.js:440` tells the player *"Both cars run your
build."* `js/game.js:1462` resolves `savedParts` only when `ti === teamIdx`, and
`js/game.js:1468` then hands `factoryParts` to every car that is not `isP`;
`js/game.js:1486-1491` gives `mods`/`aeroLoad`/ERS to the player alone. Your hire
therefore runs the custom team's all-cost-0 `DEFAULTS` (`js/car/parts.js:526`) both
visually (`js/game.js:1680`) and in pace (`js/game.js:3417` has no parts term).
**The guide is wrong** (read, not run). Either the sentence changes or the code does —
and the code is worth changing, because the constructors' championship is half of what
MY TEAM is about and today your investment reaches only one of your two cars.

**Files / functions.** `js/game/career.js` — new `buildPace()` beside `paceMult()`
(`:467-470`), exported at `:1290`. `js/game.js:1497` — multiply `tierV` by it for
career-team non-player seats. `js/game/career-ui.js:440` — restate the guide against
the rule (the guides quote the rules and never themselves, `js/game/career-ui.js:15-21`).

**Save shape.** None for the base change. The per-seat variant adds
`roster[i].spec: "works"|"current"` — a fill.

**The test that pins it.** `tests/specs/career.spec.js:598` group: with a maxed fitted
build, `__apex.carAt(<hire index>).tierV` exceeds the same career's value with a works
build, and a **driver** career's team-mate `tierV` is unchanged (the isolation
direction `career.spec.js:187` already guards). Because this moves a number the
physics reads, also run `npm run test:physics` — `tests/specs/physics-characterization.spec.js`
is the master gate (`CLAUDE.md`, Physics). Do **not** touch `js/game.js:3417`: it is
inside the per-frame speed expression and `PACE`/`vTop()` discipline applies there.

**Effort.** M. The base change is small; the honesty fix is a line.

**Economy re-measurement.** Yes — a faster second car scores more constructors' points,
which changes nothing in `settleRound()`'s payout (`js/game/career.js:807-810` pays on
*your* position only) but does change `double` sponsor windows (`:847`) and therefore
sponsor income. Re-run `career-economy.mjs` for the MY TEAM row and compare the
`earned` column; a >10% swing means `SPONSOR_KINDS[2].value` (`js/game/career.js:606`)
should rise from 2 to 3.

---

### P4 — Fan Rating: a reputation channel that is not `rep`

**What.** A second 0–100 scalar, `career.fans`, with **inputs and outputs that do not
overlap `rep` at any point**.

| | `rep` (today) | `fans` (proposed) |
|---|---|---|
| Whose opinion | the paddock's, of **you as a driver** | the public's, of **the team** |
| Moves on | result vs the car's expectation, and the round brief (`js/game/career.js:831-832`) | wins, podiums, both cars in the points, clean weekends, accolade tiers |
| Drives | `salaryFor()` `:383`, `expectedFinish()` `:404`, `marketValue()` `:1089`, the offer ladder `:1099` | sponsor pay multiplier, which free agents will talk to you, how many liveries/decals are unlocked |
| Applies in | both flavours | MY TEAM only |

Movement is **team-relative, not absolute** — the same discipline `rep` uses at
`js/game/career.js:826-830`: a podium in a tier-4 car is worth more fans than a win in
a tier-0 one. Ratchet it so it decays slowly (`fans = fans*0.98 + delta`) rather than
oscillating; the point of a fanbase is that it is slow.

**Why it fits.** Acclaim/Fan Rating is the gate F1 25 hangs sponsors *and* driver
availability on (S1, S3), and we already have both systems — sponsors at
`js/game/career.js:601-684` and a free-agent market at `:72-81` — with nothing gating
them. Today every hire is available from round one to anyone with the money, which is
the "cheap rookie cheese" S8 complains about. Gating `FREE_AGENTS` on `fans` with a
visible ladder, exactly like `offerBar()` (`js/game/career.js:1099`) and its hub
rendering (`js/game/career-ui.js:809-830`), turns a shopping list into a climb — and
that hub component can be reused verbatim, which is most of the UI work gone.

**Files / functions.** `js/game/career.js` — `fanDelta()` beside the rep block
(`:826-833`), `fanBar(tier)` beside `offerBar()` (`:1099`), `freeAgents()` (`:82`)
takes the gate. `js/game/career.js:1251-1276` `state()` gains `fans`.
`js/game/career-ui.js:673-676` — a third meter; `:809-830` — reuse the ladder for
"WHO WOULD DRIVE FOR YOU". Guide: a new `guideSection` in `myTeamGuide()` (`:373`),
numbers read from the rules per `js/game/career-ui.js:15-21`.

**Save shape.** `career.fans: 0`. A **fill** (`js/game/store.js:226-234`) — a save
without it starts at zero, which is what a new team's fanbase is.

**The test that pins it.** New group "Career — Fan Rating": (a) fans rise after a
podium in a tier-4 car by more than the same podium in tier 0 (mirrors
`career.spec.js:825`); (b) fans stay 0 in a driver career; (c) a locked free agent is
listed and refused (mirrors the locked-row idiom at `career.spec.js:533,543`);
(d) `rep` is unchanged by anything that moves `fans` and vice versa — the
*separation* is the invariant worth pinning.

**Effort.** M.

**Economy re-measurement.** Yes if `fans` scales sponsor pay. Run the MY TEAM row and
check that a season-1 team (low fans) does not fall below the ~2 re-spec floor;
sponsor income is a meaningful share of MY TEAM's balance
(`SPONSOR_KINDS[].pay` 400–800, `js/game/career.js:601-608`, against a 900 cr win at
`:29`).

---

### P5 — Owner Perks as a genuine choice, not a ladder

**What.** `career.xp` accrues from *ownership acts*: a research completed
(`js/game/career.js:561`), a facility level (`:713`), a contract resolved
(`:1057,1068`), a sponsor window met (`:673`). Levels convert to **perk points**.
Perks sit in three **mutually exclusive branches** matching F1 25's specialisations:

| Branch | Perk examples (all applied at an existing chokepoint) |
|---|---|
| **Engineering** | −n% research cost (`researchCost()` `:501`); +n% `buildPace` for the second car (P3); reliability relief (`Reliability.buildQuality`, `js/game.js:2208`) |
| **Corporate** | +n% prize money (`prizeFor()` `:793`); +n% sponsor pay (`settleSponsor()` `:673`); a fourth sponsor kind unlocked |
| **Personnel** | −n% wage bill (`wageBill()` `:451`); free agents ask less (`hireAsk()` `:1027`); the poach draw softened (`:1049`) |

**Exclusivity is the whole design.** A tree you can eventually complete is a ladder
with extra clicks — which is precisely what happened to F1 25's facilities (S8: *"most
of the facilities were nearly constructed too"*). Cap total perk points **below** the
number needed to finish one branch and a bit of another, and the mode gains a
permanent identity choice per save.

**Why it fits.** Every perk is a multiplier at a function that already exists and
already funnels every caller — `researchCost()` is explicitly the single place the
facility discount lands so the quoted price and the charged price cannot disagree
(`js/game/career.js:498-503`). Perks inherit that guarantee for free.

**Files / functions.** New `PERKS` table + `perkMult(id)` in `js/game/career.js`;
reads inserted at `:501`, `:451`, `:793`, `:673`, `:1027`. UI: a new card in the hub's
left column beside FACILITY (`js/game/career-ui.js:787-802`), same
`.cr-card.cr-record` shape, so no new CSS (`docs/COMPONENTS.md` is test-asserted).

**Save shape.** `career.xp: 0`, `career.perks: []`. Both **fills**.

**The test that pins it.** New group "Career — owner perks": (a) XP rises on research
and on a facility upgrade, and by nothing in a driver career; (b) taking an Engineering
perk makes `Career.researchCost(opt)` fall by exactly the stated fraction *and* the
garage row quotes the same number (assert the DOM string at `js/game/setup-ui.js:355`
matches — the disagreement this guards against is the one `career.js:498-500` warns of);
(c) the branch cap refuses a purchase once spent (mirror `career.spec.js:1916` "it runs
out of levels, not of money").

**Effort.** M.

**Economy re-measurement.** Mandatory — perks move `researchCost`, `prizeFor`,
`wageBill` and sponsor pay, i.e. all four terms the tool prices. Measure **three**
runs: no perks, a full Engineering build, a full Corporate build. All three re-spec
figures must stay inside 2–4 (`career-economy.mjs:134-138`). A branch that lifts the
figure above 6 is a branch that solves the catalog and must be weakened before it
ships — that is the same failure S10 reports at £100m with nothing to buy.

---

### P6 — Split the FACILITY ladder into three departments

**What.** `career.facility` (a single 0–8 integer, `js/game/career.js:703`) becomes
`career.dept = { eng, per, corp }`. Same geometric price curve (`FACILITY_BASE * 1.6^lvl`,
`:698-707`), but the price is indexed on the **total** across the three, so the eighth
level costs the same whether it is your eighth Engineering level or your first
Corporate one. Effects:

| Department | Effect | Existing chokepoint |
|---|---|---|
| Engineering | −5%/lvl research cost (today's behaviour) | `researchCost()` `js/game/career.js:501` |
| Personnel | −4%/lvl wage bill, +1 free-agent tier reachable | `wageBill()` `:451` |
| Corporate | +6%/lvl sponsor pay | `settleSponsor()` `:673` |

Total levels stay capped at `FACILITY_MAX = 8`, so **you cannot have all three** — the
cap becomes a choice instead of a countdown.

**Why it fits.** S1 and S5 make Engineering/Personnel/Corporate the spine of the mode,
and we already have the exact mechanism (a geometric-price, linear-discount, capped
ladder) that `docs/CAREER.md:558-561` justifies at length. Splitting it costs one
migration rung and buys the mode its second permanent identity axis after P5. It also
avoids the F1 25 trap directly: S8's complaint is that *all* facilities finish, and a
shared cap makes that impossible by construction.

**Interaction with P5.** These overlap and should not both ship at full strength. If
both land, make departments the **cheap, always-on** axis and perks the **rare,
sharply-flavoured** one — or drop P6 and let perks carry the specialisation alone. The
honest reading: **P6 is the cheaper of the two and P5 is the more interesting**; ship
one.

**Files / functions.** `js/game/career.js:697-722` rewritten; `state()` `:1259-1261`;
the hub card at `js/game/career-ui.js:787-802` becomes three; THE CAR row at `:727-728`.

**Save shape.** `facility: n` → `dept: {eng: n, per: 0, corp: 0}` — **a rung**, because
the old value must be *placed*, not defaulted. **`CAREER_V` +1.**

**The test that pins it.** Extend `tests/specs/career.spec.js:1896` "Career — the
facility": (a) a v-prior save with `facility: 5` migrates to `dept.eng === 5` and the
research discount is unchanged; (b) the shared cap refuses an eighth-plus level in any
department; (c) each department's effect lands at its own chokepoint and at no other.

**Effort.** M.

**Economy re-measurement.** Yes. The Engineering-only build must reproduce today's
figures exactly (that is the migration's correctness proof); the Corporate-only build
is the new case.

---

### P7 — Income scaled by constructors' standing

**What.** A per-round research grant scaled inversely by last season's constructors'
position, on top of `prizeFor()`. `grant = BASE * (1 + (expectedPos - actualPos)*k)`
inverted so the back of the grid earns more, exactly as S1 describes.

**Why it fits.** `tools/career-economy.mjs` exists because the economy's *spread* was
wrong once already: `salaryFor()`'s tier term had the wrong sign, and tier-4 teams
earned ~35% less to fix themselves with (`js/game/career.js:376-382`,
`docs/CAREER.md:508-536`). This is the same correction applied to *progress within a
career* rather than to the starting team, and it is the cheapest available brake on
the runaway leader. `career.season.teamPts` and `teamStandings()`
(`js/game/career.js:898-905`) already compute everything needed.

**Files / functions.** `js/game/career.js:800-830` `settleRound()` — one term added to
the `career.money +=` line at `:830`; a helper beside `prizeFor()` at `:793`. The
settlement panel already itemises the round (pinned by
`tests/specs/career.spec.js:1809`), so the new term needs a row.

**Save shape.** None — the previous season's constructor position is already in
`career.history[last].cPos` (`js/game/career.js:1195`).

**The test that pins it.** In "Career — the settlement" (`career.spec.js:1806`): a
career whose last archived `cPos` is 11 earns strictly more per round than one at
`cPos` 1, all else equal; season 1 (no history) earns the base and nothing else.

**Effort.** S.

**Economy re-measurement.** Mandatory and easy — this is exactly the *spread* number
`career-economy.mjs:122-133` prints. Run `--years 3`; the worst-to-best spread should
compress toward the 1.7× the `salaryFor` fix achieved (`docs/CAREER.md:522-527`), not
invert past 1.0×.

---

### P8 — Wire the budget ladder that is already written

**What.** Add the control that makes `Career.upgradeBudget()` reachable.

**Why it fits.** `js/game/career.js:571-589` says it plainly: the rules are complete
and correct, `budgetLvl` is permanently 0, and *"the missing part is a screen, not a
decision."* `docs/CAREER.md:237-243` says the same and names the placement — beside
the FACILITY button, which is the same shape and works. This is the highest
value-per-line item in the document and the only one that ships an already-tested rule.

**Files / functions.** `js/game/career-ui.js:787-802` — clone the FACILITY card,
calling `Career.budgetUpgradeCost()` / `Career.upgradeBudget()`. Restore the ladder
text in **both** guides — `myTeamGuide()` `:436` currently says the cap is *"your
team's own works car"*, and `docs/CAREER.md:241-243` is explicit that the guide text
and the button must land in the same change, never before.

**Save shape.** None — `budgetLvl` already exists and already migrates
(`js/game/store.js:229`).

**The test that pins it.** In "Career — the garage" (`career.spec.js:488`):
`Career.budget()` rises by exactly `BUDGET_MULT[1]/BUDGET_MULT[0]` after the button;
the button disappears at level 3; the guide quotes `BUDGET_MULT.length - 1` upgrades
rather than a typed number (the rule at `career.spec.js:1753` already tests that
guides quote the rules).

**Effort.** S.

**Economy re-measurement.** Yes, and it matters more than the size suggests: the
re-spec figure is `earned / (budget * RESEARCH_MULT)` (`career-economy.mjs:130`), so
raising `budget()` by 60% at level 3 lowers the printed figure by the same factor with
no change in income. Re-measure and re-read the band with that in mind, or the tool
will look like a regression when it is reporting a larger car.

---

### P9 — Driver mood, and the cost of favouritism

**What.** Each roster entry carries `mood` (−100..+100). It falls when you race the
*other* seat repeatedly, when the other seat gets the developed spec (P3), and when
their round objective goes unmet; it rises the other way. Mood feeds three existing
numbers: `hireAsk()` (`js/game/career.js:1027-1030`), the poach probability
(`:1049-1050`), and the driver's own `consistency` via a small `dev` delta
(`:943-950`).

**Why it fits.** S1: *"a decision that could affect a driver's perception of the team.
Keep that in mind if you want to stay on their good side ahead of any contract
negotiations."* Without mood, P1's per-weekend choice has no downside and P3's
per-car allocation has no cost, so both collapse into "always pick the faster one".
Mood is what makes them decisions.

**Files / functions.** `js/game/career.js:800-858` `settleRound()` writes mood;
`:1027-1054` reads it; `js/game/career-ui.js:737-747` shows it on THE TEAM card.

**Save shape.** `roster[i].mood: 0` — a fill. Depends on P1.

**The test that pins it.** Racing seat 0 for eight straight rounds leaves seat 1's
`mood` negative and its `hireAsk` strictly higher than an alternating career at the
same seed; the poach draw at `:1049` stays gated on outperformance (that rule is
deliberate — `docs/CAREER.md:317-319` — and mood must not bypass it).

**Effort.** S once P1 has landed.

**Economy re-measurement.** Light — mood moves `hireAsk`, so re-run the MY TEAM row
and confirm the wage bill's contribution has not moved the re-spec figure out of band.

---

### P10 — Accolades, derived not stored

**What.** A fixed table of ~14 one-time team achievements — first points, first
podium, first win, a double points finish, a season without a retirement, a
constructors' title, five seasons run — each paying credits + Fan Points (P4).

**Why it fits.** `careerTotals()` (`js/game/career-ui.js:1073-1107`) already walks
`career.history` and `career.results` and derives every figure an accolade table
needs, and `docs/CAREER.md:645-650` states the principle: *"Every total is derived,
none is stored… a total written once is a total that goes stale."* Accolades follow
that rule exactly — the *test* is a pure function of existing data. The only stored
state is which have paid, which is `paidSponsors`' proven pattern
(`js/game/career.js:678-683`).

**Files / functions.** `ACCOLADES` table + `accoladesMet()` in `js/game/career.js`
beside the sponsor block (`:601`); paid in `settleRound()` at `:854` next to
`settleSponsor()`; rendered on the hub or the history screen
(`js/game/career-ui.js:1113-1163`).

**Save shape.** `career.paidAccolades: []` — a fill, mirroring
`js/game/store.js:234`. **Note the season-reset trap**: `paidSponsors` must be cleared
at rollover (`js/game/career.js:1238`, and the comment above it records what happened
when it was not). `paidAccolades` is the *opposite* — accolades are career-long and
must **not** be cleared. Getting that backwards is the same class of bug.

**Effort.** S.

**Economy re-measurement.** Yes if they pay credits. Cheap to bound: sum the whole
table and check it is well under one season's income
(`career-economy.mjs` `earned` column) — an accolade is a bookmark, not a salary.

---

### P11 — Sponsor loyalty tiers

**What.** Consecutive met windows raise a sponsor tier; a missed window drops it.
Tier scales `pay` and, at the top, unlocks an extra window kind.

**Why it fits.** S2: *"being loyal to your sponsor can unlock rewards as you level up
such as cash bonuses, XP or liveries."* Our sponsor system is already the better half
of F1 25's — a multi-round brief tiling the season, progress read off rows the season
already records (`js/game/career.js:630-662`) — and it is *flat*: `pay` is a constant
per kind (`:601-608`). Tiering it costs almost nothing because the streak is
**derivable** from `career.results` + `paidSponsors` with no new field.

**Files / functions.** `js/game/career.js:630-684`; the hub card at
`js/game/career-ui.js:695-705` gains a tier row; `myTeamGuide()`'s SPONSORS section
(`:400-410`) reads the multiplier from the rules.

**Save shape.** None if the streak is derived. Derive it.

**The test that pins it.** Three met windows pay strictly more than three windows with
a miss in the middle, at the same seed; a reload mid-streak reproduces the same tier
(the determinism idiom, `career.spec.js:748`).

**Effort.** S.

**Economy re-measurement.** Yes — this is a direct income multiplier. Bound the top
tier so a perfect season cannot lift the re-spec figure above 4.

---

### P12 — Contract talks with a leak

**What.** When a seat's contract expires, you may open talks with up to three free
agents *before* signing. Each talk you open raises the others' `ask` by a seeded
amount — the leak. Deterministic off `Career.rnd(year, "talk", code)`.

**Why it fits.** S1: *"By taking some time to meet multiple drivers face-to-face… But
be careful, having news of these conversations leaked to other drivers might spell
disaster for your hiring prospects."* Our hire flow is currently a price list
(`js/game/career-ui.js:906-920`): every ask is visible and fixed, so there is no
decision beyond arithmetic. A leak converts it into one, with no new systems — it is a
modifier on `hireAsk()` (`js/game/career.js:1027-1030`).

**Files / functions.** `js/game/career.js:1057-1082`; `js/game/career-ui.js:881-920`.

**Save shape.** `career.talks: []` (this winter's opened talks) — a fill, cleared at
rollover with `paidSponsors` (`:1238`).

**Effort.** M — mostly UI state on a screen that currently has none.

**Economy re-measurement.** Light; wage bill only.

---

### P13 — Build team identity inside the mode

**What.** Put the team's name, short code, two colours and livery on the MY TEAM setup
pane, next to the driver fields.

**Why it fits.** S1 puts brand creation inside Corporate; S11's Codemasters reply
insists *"building your own team identity has always been an integral part of My
Team."* Ours is *outside* the mode: `js/game/career-ui.js:586-605` asks for a name,
code and number only, while the team's actual identity is edited on the free-play
`#customize` screen (`js/game.js:7790-7819`) and the livery editor lives in the garage
(`js/game/setup-ui.js:444-545, 680-700`). A player starting MY TEAM is never shown
either.

**The conflict, stated plainly.** `apex26.customTeam` is **one object shared with free
play** (`js/game.js:199, 7811`). Editing it from a career changes the free-play car
too, and there are three MY TEAM slots (`docs/CAREER.md:57-73`) that would all point
at the same brand. Two honest options: (a) accept it — one custom team per device,
documented in the guide; or (b) store the identity on the save, which costs
localStorage (`docs/CAREER.md:67-69` explains why every byte here is weighed). **(a)
is the right call for a first pass**, because (b) also needs `syncCustomTeam()` to
become slot-aware, which reaches into `makeCars()` and the livery atlas cache
(`js/game.js:1642-1650`).

**Files / functions.** `js/game/career-ui.js:586-605` — reuse `addField` for the
identity fields; write through the same clean/clamp path as `js/game.js:7791-7811`.

**Save shape.** None under option (a).

**Effort.** M — DOM only, but `tests/specs/ui-audit.spec.js` screenshots the
new-career state in both orientations (`docs/CAREER.md:681-683`), so the pane must
still fit at 844×390.

**Economy re-measurement.** None.

---

## 4. What NOT to build

**A season spend cap (F1 25's "cost cap").** We already have the constraint it is
meant to provide, in a better place. Our **fitted**-cost cap (`js/game/career.js:38-50`)
is relative to the team's own works car, so it means "how much better than my works
car may I run", and it makes *every weekend* a choice. A season spend ledger makes
*one decision in March* and then nothing. F1 25's own players report the cap never
binds: *"the cost cap seems like a non feature since in the first and second seasons
you don't make enough money to outspend the cost cap and by the third you have nothing
to spend it on"* (S10). Adding a second ledger to a mode whose only real problem is
the *absence* of a sink would be building the wrong half of the answer. P2 is the
right half.

**Deleting the created driver.** F1 25 removed the driver/owner and it is the single
most-criticised change in the mode (S11 top comment, S12 point 7, S9 comments). We
have no sim-the-race path — Apex 26 is a driving game and `Quali.lapTime()` models the
*field*, not the player (`docs/CAREER.md:576-584`) — so a pure-owner MY TEAM would
have the player driving a car with somebody else's name on it and no alternative.
P1 offers the two-hire shape as a *choice*; it must never be the only shape.

**Driver Icons / historical drivers.** `js/car/teams.js` is the verified real-world
2026 grid and is deliberately free of balance numbers so `tools/carview.html` can load
it through the manifest's CARVIEW subset (`docs/CAREER.md:181-184`). Real historical
drivers bring likeness questions to an unofficial fan game for a feature that is
flavour. `FREE_AGENTS` (`js/game/career.js:72-81`) already gives the market invented
names with stable personalities via the `DriverRatings` tier hash, at zero maintenance.

**A second fictional constructor (Konnersport/APXGP equivalent).** Every grid query in
`career.js` carries a `team.custom` filter — `:868, :900, :911, :963, :988, :1126` —
and each one encodes "the custom team is on the grid only when the player took it". A
second custom team doubles that special case and adds no decision the first one does
not already offer.

**A full manager mode (sim the race, pit calls, strategy for both cars).** Codemasters
themselves drew this line: *"we're never going to go as far as F1 Manager — we are
still fundamentally a racing game with management elements"* (S2). We should draw it
in the same place and for the same reason.

**Per-part failure rolls ("upgrades that don't work").** Popular in the criticism
threads (S10 comments), but our research purchase is already a *permanent* unlock at
`opt.cost * RESEARCH_MULT` (`js/game/career.js:501, 561-570`) and the catalog is the
single source of truth for what a part is worth (`docs/CAREER.md:216-222`). A failure
roll makes the price a lie and the catalog stop meaning anything. Reliability already
gives money-buys-finishes its channel (`js/game/reliability.js`, `docs/CAREER.md:376-400`).

**Rivalries.** They are real in F1 25 (S3) and they are a whole subsystem — pair
selection, per-round tracking, a resolution — feeding one number that P4 already
provides four cheaper inputs for. Revisit only if Fan Rating ships and feels thin.

---

## 5. Do these three first

**1 — P8, wire the budget ladder (S).** The rules are written, correct and unreachable
(`js/game/career.js:571-589`); `docs/CAREER.md:237-243` names the button and the
guide text that must land with it. It is one card cloned from the FACILITY card at
`js/game/career-ui.js:787-802`, and it removes a documented lie from the mode.

**2 — P1, two rostered drivers and pick who you race (M).** This is My Team 2.0's
actual thesis, and our plumbing is unusually ready for it: `js/game.js:7135` already
sets the player car from `career.seat`, points are keyed by seat
(`js/game/store.js:132`), and `gridDrivers()` (`js/game/career.js:441-447`) already
fields two cars. The work is a 2-length roster, one `CAREER_V` rung, and a hub toggle
— and it unlocks P3, P9 and P12, none of which mean anything without it.

**3 — P2, the regulation reset (M).** The plateau is the one criticism every source in
§1.4 raises independently, and we have F1 25's exact failure shape: `career.owned`
only grows, and MY TEAM can never reach the one code path that re-seeds a garage
(`js/game/career.js:1116` vs `:1154-1160`). It is the only proposal here that changes
what season 6 feels like, and `tools/career-economy.mjs --years 6` can prove it did.

After those three, **P3** (the second car running your build) is the correctness item
that makes the constructors' championship mean what the guide already claims it means,
and **P4** (Fan Rating) is the currency the rest of the list wants to spend.
