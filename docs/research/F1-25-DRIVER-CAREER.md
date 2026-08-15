# DRIVER CAREER — what F1 25 does, what we have, what to build

Research + design for improving **DRIVER CAREER** in Apex 26, grounded in EA
Sports **F1 25** (and F1 24, which is where the current Driver Career shape came
from). Every claim about our code carries a `file:line` I read; every claim about
F1 25 carries a URL. Nothing here was verified in a browser — no Playwright run
was made for this document, so every statement about *runtime* behaviour is a
read of the source, not a measurement, and is marked where it matters.

Read alongside `docs/CAREER.md` — it is the invariant list, and §"Respect these
invariants" below only summarises it.

---

## 1. What F1 25 actually does

### 1.1 The two modes, and which one got the work

| | F1 24 | F1 25 |
|---|---|---|
| Driver Career | **Rebuilt** — Driver Recognition, accolades, rivalries, contract negotiation, real-driver/Icon/F2 starts | **Essentially unchanged**; gains the 11th-team option and AI-recruited Icons |
| My Team | untouched | **Rebuilt** ("My Team 2.0") — owner-only, split R&D, facilities, Fan Rating, cost cap |

> "Driver Career is unchanged for the most part. It doesn't even have the improved
> features of MyTeam like improved Driver Transfers."
> — r/F1Game, [F1 25 Career mode - Is it worth it?](https://www.reddit.com/r/F1Game/comments/1ky9m7d/f1_25_career_mode_is_it_worth_it/)

> "Other than that, Driver Career appears to be mostly unchanged."
> — Traxion, [How Codemasters is reinventing My Team in F1 25](https://traxion.gg/how-codemasters-is-reinventing-my-team-in-f1-25/)

**The practical consequence for us: the interesting Driver Career design is F1
24's, shipped forward into F1 25.** Copying "F1 25 Driver Career" means copying
F1 24's Driver Recognition stack. The F1 25-only additions to Driver Career are
two, and both are cosmetic-structural rather than systemic:

| F1 25 Driver Career addition | Source |
|---|---|
| An **11th team** on the grid — Braking Point's Konnersport, or APXGP (Iconic Edition), each with a pair of Driver Icons | [EA — Career Mode feature page](https://www.ea.com/en/games/f1/f1-25/features/career-mode) |
| **AI teams may now recruit Driver Icons** — Schumacher in a modern Ferrari, Senna in a McLaren; per-driver enable/disable | [EA — F1 25 career deep dive](https://www.ea.com/en/games/f1/f1-25/news/f1-25-career-deep-dive) |
| (2026 Season Pack) Audi + Cadillac join; Practice Programs and Race Objectives "refreshed" | [EA — Career Mode feature page](https://www.ea.com/en/games/f1/f1-25/features/career-mode) |

### 1.2 Driver Recognition — the spine of the mode

Introduced F1 24, carried into F1 25.
Source: [EA — F1 24 career deep dive](https://www.ea.com/news/f124-career-mode-deep-dive),
[RacingGames deep-dive write-up](https://racinggames.gg/article/f1-24s-new-career-mode-detailed-in-deep-dive-video).

| Layer | What it is |
|---|---|
| **Weekend goals** | per-session objectives set by the team |
| **Contract targets** | goals attached to the contract itself, set at signing |
| **Season goals** | year-long targets |
| **On-track objectives** | reactive, mid-race: engineer notices overheating from following too close, tells you to drop out of the slipstream; notices a car closing and coaches you |

All four feed one number, **Recognition**. Recognition then buys three things:

1. **Bargaining power** in contract talks.
2. **Lead-driver status**, which unlocks **R&D Rush** — the team builds parts
   faster, with a lower chance of a development *failing*, and lets you develop
   multiple upgrades at once plus "secret upgrades". Low recognition and *your
   team-mate* takes over the development direction.
3. **Team perception** — team specialists set goals that unlock further R&D
   perks.

### 1.3 Contracts and the driver market

| Mechanic | Detail |
|---|---|
| **You set your own targets** at signing | Aim too high and miss → recognition falls and the team you were negotiating with is less likely to take you. Aim too low → "this driver is blatantly not good enough for us" and the offer is withdrawn. You can negotiate your way *down* the grid. |
| **Secret meetings** | Talks with a rival team via your agent. Risk of your current team finding out **grows the longer talks run**. |
| **Demotion** | Failing contract objectives gets you demoted. |
| **F2 academy path** | Start in F2, pick an academy team; loyalty to it pays off long-term, shopping around damages the relationship. |
| **Driver transfer volatility** (F1 25) | An explicit option to raise transfer frequency. Icons enter the AI market. |

Sources: [RacingGames](https://racinggames.gg/article/f1-24s-new-career-mode-detailed-in-deep-dive-video),
[EA deep dive](https://www.ea.com/news/f124-career-mode-deep-dive),
[GTPlanet](https://www.gtplanet.net/f1-25-myteam2-career-20250410/).

### 1.4 R&D and resource points

| Element | Detail |
|---|---|
| **Resource points** | Earned on track (chiefly practice programmes). One pool per driver, spent across development areas. |
| **Spread or focus** | All-in on aero, or spread for slower but balanced development. Also: collaborate with the team-mate, or develop against them. |
| **Part failure** | Developments can *fail*. Higher recognition = faster builds, lower failure chance. |
| **Season modifiers / R&D Scenarios** (unlocked after season 1) | High inflation (upgrades cost more); chip shortage (one upgrade per month); aero-only or chassis-only restrictions; and an unlimited-funds modifier. Explicitly framed by Codemasters as the answer to "no reason to replay after season one". |
| **F1 25 My Team split** | Research and *manufacture* separated; parts built for one car or both (both is cheaper but slower); constructors' standing **inverts** resource-point income — leaders get fewer RP, back-markers more. |

Sources: [EA F1 24 deep dive](https://www.ea.com/news/f124-career-mode-deep-dive),
[RacingGames](https://racinggames.gg/article/f1-24s-new-career-mode-detailed-in-deep-dive-video),
[EA F1 25 deep dive](https://www.ea.com/en/games/f1/f1-25/news/f1-25-career-deep-dive).

### 1.5 Practice programmes — where the resource points come from

Six programmes, stable across F1 2019 → F1 25:

| Programme | Measures |
|---|---|
| Track Acclimatisation | drive through gates on the racing line |
| Tyre Management | wear over a stint |
| Fuel Management | consumption against a delta |
| ERS Management | deployment over a stint |
| Qualifying Pace | one-lap time against a target |
| Race Strategy | a multi-lap run: tyre, fuel and race pace |

Sources: [Traxion — how R&D works](https://traxion.gg/how-research-and-development-works-in-f1-2021/),
[f125game.com practice routine](https://www.f125game.com/driving-fundamentals/f125-practice-routine-for-beginners/).

### 1.6 Accolades and rivalries

**Accolades** (F1 24, extended to My Team in F1 25 as *Fan Rating*): long-term
milestones. A custom driver starts blank and earns generic ones ("attend a
practice session", "complete a race weekend", race starts, points finishes, wins,
podiums). A real driver inherits *their* real-world bar — Hamilton is asked for
an eighth title, Verstappen to defend one. Accolades adapt to how you are
actually doing, and they feed driver performance stats.

**Rivalries**, three intensities:

| Level | Span | Note |
|---|---|---|
| Regular | a few races | the Drive-to-Survive beat |
| Heated | longer | greater rewards |
| Career Defining | multiple seasons | explicitly modelled on Senna/Prost |

Team-mate battles feed recognition and R&D standing; beating your closest
championship rival opens contract opportunities at rival teams.

### 1.7 Season structure

A career season is the full calendar (24 rounds in F1 25). Weekend structure is
configurable: number of practice sessions, **Qualifying Format** — Off /
One-Shot / Short / Full ([EA weekend-structure reference](https://www.ea.com/able/resources/f1-22/pc/weekend-structure)) —
race distance, and sprint weekends with their own SQ1/SQ2/SQ3 shortened
qualifying ([Formula 1 sprint guide](https://www.formula1.com/en/latest/article/the-beginners-guide-to-the-f1-sprint.55yJBEiF7vYkZEwSV9lZJ9)).

### 1.8 What players actually complain about

This is the half of the research that should drive the build list.

| Complaint | Evidence |
|---|---|
| **Contracts key off CAR performance, not driver performance.** "So if I win every single race I still won't be offered a big time contract with a top team? Because it only depends on car performance??" | [r/F1Game 1kxaelj](https://www.reddit.com/r/F1Game/comments/1kxaelj/f1_25_driver_career_contract_system_and_pre/) |
| **Recognition RESETS on re-signing.** "if your recognition was at 50% prior to season ending, your recognition would reset to the original value (i.e. 46%) after contract signing for no reason at all… Even if you had a great season." Follow-up: "Isn't there any way to bypass that? Because if not then driver career mode won't be fun after season 2" | [r/F1Game 1kxaelj](https://www.reddit.com/r/F1Game/comments/1kxaelj/f1_25_driver_career_contract_system_and_pre/) |
| **Nothing new after season one.** "It's the exact same, contracts are still flawed and there are no new R&D scenarios." | [r/F1Game 1kxaelj](https://www.reddit.com/r/F1Game/comments/1kxaelj/f1_25_driver_career_contract_system_and_pre/) |
| **AI is inconsistent track-to-track and the team-mate is absurd.** "some tracks I am able to qualify pole, and others I struggle for Q2 … I've scored 117 points and Doohan 0." | [r/F1Game 1og5fyr](https://www.reddit.com/r/F1Game/comments/1og5fyr/why_does_career_mode_suck_so_much_this_year/) |
| **Rubber-banding / AI pace boosts.** A 5.34 s lead erased "within just three to six corners"; "magical speed boost" costing 0.5–0.9 s a sector. | [EA Forums — F1 25 Career Mode Issues](https://forums.ea.com/discussions/f1-25-general-discussion-en/f1-25-career-mode-issues/12532949) |
| **AI DNFs are always engines, never accidents.** "how many cars actually had engine failures in the 2023/2024 season? The game doesn't reflect reality"; "I don't think I've seen one AI crash that doesn't involve me which has resulted in them dnf in 8 seasons of career mode" | [r/F1Game 1hv5z3e](https://www.reddit.com/r/F1Game/comments/1hv5z3e/what_would_you_like_on_f1_25/) |
| **Removing the owner-driver from My Team was widely hated.** "Removing the option of creating your own driver to drive your team is a game breaker for me"; "Removing features is almost always a bad thing." | [r/F1Game 1jw0ez0](https://www.reddit.com/r/F1Game/comments/1jw0ez0/take_the_lead_in_my_team_20_f1_25_deep_dive_1/) |
| **The management layer doesn't bite when you can just drive the car.** "Does it matter if a driver is pissed off + out of form if I can just… drive as him and 'lol just win'?" | [r/F1Game 1jw0ez0](https://www.reddit.com/r/F1Game/comments/1jw0ez0/take_the_lead_in_my_team_20_f1_25_deep_dive_1/) |
| **Want AI split into skill / aggression / mistakes sliders**, not one number. | [r/F1Game 1hv5z3e](https://www.reddit.com/r/F1Game/comments/1hv5z3e/what_would_you_like_on_f1_25/) |

---

## 2. Gap table — F1 25 feature vs Apex 26

Verdicts: **HAVE** / **PARTIAL** / **MISSING** / **DELIBERATELY-NOT** (with our
reason from `docs/CAREER.md`).

| F1 25 / F1 24 feature | Apex 26 | Verdict | Evidence / reason |
|---|---|---|---|
| Reputation as the spine of the mode | `career.rep` 0–100, moved by result-vs-expectation + objective | **HAVE**, and better than F1 25 | `js/game/career.js:831` — `clamp((expectedFinish(team) - pos) * 0.6, -4, 6) + (obj.done ? +2 : -2)`. Beating a bad car raises it; cruising in a good one does not |
| Contract bargaining tied to performance, not to the car | `marketValue()` = 50 % rep + 50 % championship percentile | **HAVE**, and it directly fixes F1 25's loudest complaint | `js/game/career.js:1089` |
| A visible ladder of what each tier wants | `offerBar(tier) = 92 - tier*18`, rendered per tier on the hub | **HAVE** | `js/game/career.js:1099`; `js/game/career-ui.js:809-830` |
| **Contract targets that are judged** | `deal.goal = {type:"champPos", value}` is *written*, *displayed twice*, and **never evaluated** | **PARTIAL — broken** | Written `js/game/career.js:396`; displayed `js/game/career-ui.js:686` and `:1045`; `rollover()` (`js/game/career.js:1184-1242`) never reads it. Grepped `\.goal` across `js/`: only writes and renders |
| **Multi-year contracts that run** | `deal.left--` at the winter, but `makeOffers()` runs unconditionally every winter and the hub blocks racing until you sign | **PARTIAL — broken** | `js/game/career.js:1214` decrements; `:1219` re-offers regardless; `js/game/career-ui.js:921-925, 972-974` blocks GO RACING on any offer. A 3-season deal re-signs every winter, so `years` is decoration |
| Weekend objectives | one brief per round, five kinds, seeded, paid + rep | **HAVE** | `js/game/career.js:734-790`; the mix32 finalizer at `:127` is what makes the draw a draw |
| **Season-long / career-long milestones (Accolades)** | none | **MISSING** | `careerTotals()` (`js/game/career-ui.js:1073`) already derives seasons/starts/wins/podiums/points/titles/best — the *inputs* exist, nothing turns them into goals |
| **Team-mate rivalry** | the team-mate is the benchmark for 2 of 5 briefs, but there is no running head-to-head | **PARTIAL** | `js/game/career.js:786-787` `beatMate`/`outQualMate`; `career.results` rows (`:849`) record `{r,p,pts,obj,dnf,double,clean}` — the mate's position is computed at `:819` and thrown away |
| Championship-rival rivalry, 3 intensities | none | **MISSING** | — |
| Resource points from practice programmes | no practice session at all; income is prize + salary + bonus + objective + (MY TEAM) sponsor | **MISSING** | `js/game/career.js:800-858`; sessions are `race \| tt \| quali` only (`docs/CAREER.md` §"The mode is two axes") |
| R&D tree with spread-vs-focus | the garage IS the tree: purchase-is-research at `cost × RESEARCH_MULT`, plus a fitted cap | **HAVE, by a different route** | `js/game/career.js:36, 501, 561`; `docs/CAREER.md` §"The garage is the R&D tree" |
| A research budget that grows | `BUDGET_MULT` ladder + `upgradeBudget()` are complete and **have no caller** | **PARTIAL — unwired** | `js/game/career.js:49-50, 526, 582`; the comment at `:571` says so, and `docs/CAREER.md` blocks re-advertising it until the button lands |
| An open-ended late-game sink | FACILITY, 8 levels, −5 %/level research cost to −40 % | **HAVE** — no F1 25 equivalent | `js/game/career.js:697-722`; button at `js/game/career-ui.js:787` |
| Part development can *fail* | no | **MISSING** | research is instant and certain (`js/game/career.js:561`) |
| **Season modifiers / R&D scenarios after year 1** | none | **MISSING** | this is the exact complaint F1 24 shipped scenarios to answer, and we have the same hole |
| Constructors' standing inverts R&D income | prize money is per-race position only; `salaryFor()` already inverts with tier | **PARTIAL** | `js/game/career.js:29-31, 383`; `tools/career-economy.mjs` measured the tier-4 shortfall and fixed the salary half (see `docs/CAREER.md` §"The economy, measured") |
| Winter driver market | 0–2 swaps a year, top-team weakest ↔ best midfielder, recorded on `career.moves` and printed on the season sheet | **HAVE** | `js/game/career.js:978-1005`; `js/game/career-ui.js:1016-1026` |
| Transfer-volatility option | fixed at 0–2 | **MISSING** (small) | `js/game/career.js:984` |
| Play as a **real driver** | you always create one (name/code/number) | **MISSING** | `js/game/career.js:334-338`; setup form `js/game/career-ui.js:586-605` |
| Driver Icons; AI recruiting Icons | no icon roster | **DELIBERATELY-NOT (licensing)** | We ship a verified real 2026 grid (`js/car/teams.js:6-123`) and eight fictional free agents (`js/game/career.js:72-81`). Historical driver likenesses are not ours to ship |
| An 11th team option | the grid is already 11 real teams / 22 cars; `custom` is the 12th and MY TEAM's | **DELIBERATELY-NOT** | `js/car/teams.js:6-123`; `docs/CAREER.md` §MY TEAM — the custom team only enters when the player has taken it |
| F2 / junior ladder | starter teams are tier ≥ 3, seven of eleven | **DELIBERATELY-NOT** | `js/game/career-ui.js:30` `STARTER_TIER_MIN = 3` — "a career that can start at Mercedes has nowhere to go" |
| Secret meetings with rival teams | no | **MISSING** (and probably should stay so — see §4) |
| Qualifying: One-Shot / Short / Full | one format: one out-lap + one flying lap, field modelled | **PARTIAL** | `js/game/quali.js:91-136` (the forward/backward-pass model), `docs/CAREER.md` §Qualifying |
| Sprint weekends | none | **DELIBERATELY-NOT** | a race is `GAME_LAPS = 3` (`js/game.js:598`); a sprint is not a distinguishable format at that length |
| Practice sessions | none | **MISSING** |
| Driver ratings drive AI and market | five axes, 0–100, keyed by code, drifting over the winter | **HAVE** | `js/car/driver-ratings.js:35-65, 101`; drift `js/game/career.js:935-954` |
| AI DNFs, and by varied causes | engine / gearbox / **accident**, weighted 2:2:1 | **HAVE**, and better than F1 25 | `js/game/reliability.js:47` — this is the exact thing r/F1Game asks for |
| Career archive / record | `#career-history`: totals + season-by-season, all derived | **HAVE** — no F1 25 equivalent | `js/game/career-ui.js:1073-1162` |
| Two-player career | VS FRIEND exists but is not a career | **DELIBERATELY-NOT** | `docs/MULTIPLAYER.md`; career state is single-save by construction |

---

## 3. Ranked proposals

Ranked by (value to *this* game) ÷ (cost + risk). Every one obeys the invariants
in §5.

**A note on `CAREER_V` that applies to all of them.** `GameStore.CAREER_V` is
`1` and `CAREER_MIGRATIONS` holds one rung (`js/game/store.js:186-190`). The
established precedent is that a **purely additive optional field is a FILL, not a
ladder rung** — `facility`, `moves` and `paidSponsors` all entered that way
(`js/game/store.js:230-234`, and the comments there say so explicitly). A version
step is only owed when an **existing field changes meaning or shape**. Each
proposal below states which it is.

---

### P1 — Make the contract bind: judge the season goal, and let multi-year deals run · **M**

**What it is.** Two live inconsistencies, one fix. (a) `deal.goal` is written at
signing (`js/game/career.js:396`), shown on the hub (`js/game/career-ui.js:686`)
and on every offer (`:1045`), and is never evaluated anywhere. (b) `deal.left`
counts down (`js/game/career.js:1214`) while `makeOffers()` runs unconditionally
the same winter (`:1219`), so a "3 seasons" contract re-signs every year and the
number on the CONTRACT card means nothing.

Fix: at `rollover()`, resolve the goal against the archived finishing position,
and gate the offer draw on the deal actually expiring.

- Goal met → `+rep`, a completion bonus, and next year's offers are drawn at a
  raised market value.
- Goal missed → `−rep`, and offers are drawn one tier lower (F1 25's *demotion*,
  minus the cutscene).
- `deal.left > 0` → **no offer sheet**; the hub goes straight to NEXT RACE (the
  path `makeOffers()` already returns `[]` down for MY TEAM, so the UI branch
  exists and is tested — `js/game/career-ui.js:921-925`).
- Add one voluntary **RENEGOTIATE** action mid-contract that re-draws offers at
  the cost of rep — that is F1 25's secret-meeting risk, expressed as a price
  rather than a hidden timer.

**Why for this game.** It is the single largest gap between what our UI promises
and what our rules do; a player who reads "Seasons left 3" and is asked to
re-sign every winter learns the screen is lying. It also lands the complaint F1
25 players make loudest — that contracts do not respond to driving — on the
correct side, because `marketValue()` (`js/game/career.js:1089`) is already half
championship result.

**Files.** `js/game/career.js` — `rollover()` (`:1184`), `makeOffers()` (`:1108`),
`newDeal()` (`:386`), `acceptOffer()` (`:1150`), `state()` (`:1251`).
`js/game/career-ui.js` — CONTRACT card (`:707-716`), offers sheet (`:994-1058`),
`$("cr-go")` precedence (`:1232-1250`).

**Save shape.** `career.history` entries gain `goalMet: bool` and `goalValue: n`
(archive-only, capped at 10 by `HISTORY_MAX`). `career.deal` gains nothing —
`left` finally acquires a reader. **FILL, not a version step**: a save written
before this has `left` and `goal` already, and an absent `goalMet` on an old
history row reads as "unknown", which the history screen can render as `—`.

**Test to pin it.** In `tests/specs/career.spec.js` §rollover: (1) a career with
`deal.left = 2` rolls over and `careerState().offers === 0`, and GO RACING is
enabled; (2) `deal.left = 0` still produces at least one offer (the existing
`career.spec.js:1012` test must keep passing — set `left` to 0 in its fixture);
(3) a `careerSim`'d season that misses the goal lowers rep by the stated amount
and the next offer set contains no team above the current tier.

---

### P2 — Accolades, derived from data we already store · **S**

**What it is.** A table of career milestones — first points finish, first
podium, first win, 10/50/100 starts, a season beating the car's expectation, a
title, a title in a tier-3+ car, wins with three different teams, a clean season,
a season with zero DNFs. Each is a **pure predicate over `career.history` +
`career.results`**, evaluated at render time, never stored.

**Why for this game.** It is the highest arc-per-line proposal on this list.
`careerTotals()` (`js/game/career-ui.js:1073-1106`) already walks exactly the data
these predicates need, and its own comment states the rule — "DERIVED on demand,
never stored… a total written once is a total that goes stale". Accolades inherit
that for free: **zero save cost, zero migration, zero localStorage pressure**, on
a mode whose long game currently ends when you own the catalog and cap the
facility. It also answers the *"nothing new after season one"* complaint without
adding a single new system, and it gives `#career-history` a second half that is
not a list of rows.

**Files.** `js/game/career-ui.js` — a `const ACCOLADES = [...]` table beside
`careerTotals()` and a block in `buildHistory()` (`:1113`); optionally the most
recent unlocked one as a line on the hub's `.cr-record` card (`:754-766`).
No change to `js/game/career.js` at all.

**Save shape.** None. If a "newly unlocked" flash is wanted later, that is one
`career.seenAccolades: []` array as a **fill** — but ship without it first.

**Test.** `tests/specs/career.spec.js`: seed a career, `careerSim(24)`,
`careerRollover()`, open `#career-history`, assert the accolade list contains
"First win" iff `careerTotals().wins > 0`; assert the block is present and states
"none yet" rather than rendering empty on a fresh career (same shape as the
existing empty-archive test at `career.spec.js:1225`).

---

### P3 — The team-mate head-to-head, recorded and shown · **S/M**

**What it is.** The team-mate is already the benchmark for two of five briefs
(`js/game/career.js:786-787`) and for the whole mode's framing (`career-ui.js:333`
— "they are the benchmark the whole mode measures you against"). But nothing
keeps score: `settleRound()` computes the mate's finishing position at
`js/game/career.js:819` and discards it. Record it, and render a season-long
**RACE 7–4 · QUALI 6–5** card on the hub, plus a career-total line on
`#career-history`.

**Why for this game.** F1 24/25 sell "rivalries" as three intensity tiers with
cutscenes; the *mechanically* useful 90 % of that is a scoreboard against the one
driver in the same car — which is the only honest comparison in motorsport and
the only one we can compute exactly. It also makes `beatMate`/`outQualMate`
briefs feel like part of something rather than a coin-flip, and it costs two
integers a round.

**Files.** `js/game/career.js` — `settleRound()` results row (`:849`), `state()`
(`:1251`). `js/game/career-ui.js` — a card in `buildHubPanes()` beside THE CAR
(`:718-732`), a totals row in `careerTotals()`/`buildHistory()`.

**Save shape.** The `career.results` row gains `m` (mate finishing position, 0 =
no mate) and `g` (your grid position, from `player.gridPos`, which
`objectiveMet` already reads at `:787`). Two small integers × 24 rounds ×
1 season — the array is cleared at the rollover (`js/game/career.js:1229`), so
this is bounded and does not compound. **FILL**: an old row without `m`/`g` is
skipped by the tally, exactly as `paidSponsors` handles an old save.

**Test.** `career.spec.js`: settle a round where the player finishes ahead of the
mate and assert `careerState()` reports the head-to-head as 1–0; assert the tally
skips rows lacking `m` (write a legacy row into the save and reload).

---

### P4 — Wire the budget ladder · **S**

**What it is.** `BUDGET_MULT` (`js/game/career.js:49`), `BUDGET_UPGRADE` (`:50`),
`budgetUpgradeCost()` (`:526`) and `upgradeBudget()` (`:582`) are complete,
correct and **have no caller outside their own file** — the comment at `:571`
states it, and so does `docs/CAREER.md`. So `budgetLvl` is permanently 0 and
`budget()` returns exactly the works car for the life of every career. Add the
control beside the FACILITY button, which is the same shape and works
(`js/game/career-ui.js:787-802`), and restore the "three upgrades" text in the
guide **in the same change**.

**Why for this game.** It is finished work sitting one button away from shipping,
and the fitted cap is the constraint the whole R&D economy rests on
(`docs/CAREER.md` §"Economy and R&D"). A cap that never moves means the second
half of a successful career has nothing to buy but facility levels.

**Files.** `js/game/career-ui.js` — one `.cr-record` button modelled on
`cr-facility` (`:787`); `driverGuide()`/`myTeamGuide()` UPGRADING THE CAR /
BUILDING THE CAR sections (`:316-325`, `:432-441`) — and per that file's own
header rule, the numbers must be **read from `Career.BUDGET_MULT`**, never typed.

**Save shape.** None — `budgetLvl` already exists and already migrates
(`js/game/store.js:229`).

**Test.** `career.spec.js` §R&D: with enough credits, pressing the button raises
`careerState().budget` by the documented multiple and deducts exactly
`BUDGET_UPGRADE[lvl]`; at the top of the ladder the button is absent (not
disabled), matching the facility precedent (`career.spec.js:1916`).

**Economy note.** `BUDGET_MULT` is one of the four knobs `tools/career-economy.mjs`
exists to measure (`docs/CAREER.md` §"The economy, measured"). Re-run it after
wiring — the cap moving changes what a season is worth in cars-of-research.

---

### P5 — Season modifiers, drawn from the seed after year one · **S/M**

**What it is.** F1 24's R&D Scenarios, at our scale. From season 2, one modifier
is drawn per year with `Career.rnd(year, "mod")` and shown on the end-of-season
sheet and the hub:

| Modifier | Effect | Reaches the rules at |
|---|---|---|
| Inflation | research costs ×1.35 | `researchCost()` `js/game/career.js:501` |
| Parts embargo | one catalog category cannot be researched this year | `research()` `:561`, listing gate `isOptionAvailable` |
| Windfall | one-off credit injection at the rollover | `rollover()` `:1184` |
| Reliability crisis | `TIER_RISK` scaled up for the season | `js/game/reliability.js:113` `riskFor()` — via a scale passed through `arm()`'s `opts` |
| Cost-cap squeeze | fitted cap ×0.9 for the year | `budget()` `:521` |
| Stable regs | nothing (the "no modifier" face, so the draw is honest) | — |

**Why for this game.** It is the cheapest possible answer to "nothing new after
season one", it is *pure* (stateless draw, no new state machine), and it reuses
the same construction as the round objective and the sponsor — a type, a value,
and a draw off the career seed. `docs/CAREER.md` §Randomness already establishes
that pattern and warns exactly how to key it.

**Watch out.** `Career.rnd` keys **must end in the varying part** — the mix32
rationale at `js/game/career.js:118-132` is load-bearing and measured. `rnd(year,
"mod")` ends in a constant. Key it `rnd("mod", career.year)` so the year is last.

**Files.** `js/game/career.js` — a `SEASON_MODS` table beside `SPONSOR_KINDS`
(`:601`), a `seasonMod()` accessor, and reads in `researchCost()`, `research()`,
`budget()`, `rollover()`. `js/game/career-ui.js` — a card on the offers sheet
(`buildOffers()` `:994`) and one on the hub.

**Save shape.** None, if the draw is pure in `(seed, year)`. The windfall needs a
"already paid" guard — reuse the `paidSponsors` idiom with a `career.paidMod:
[]` **FILL**.

**Test.** `career.spec.js`: the same seed draws the same modifier across a
reload; season 1 draws none; over 40 seeded years every modifier kind appears
(the same anti-clustering assertion the objective draw already carries at
`career.spec.js:774`).

---

### P6 — Start a career as one of the 22 real drivers · **S/M**

**What it is.** F1 24's headline change, and cheap here. On the setup form, offer
"CREATE A DRIVER" (today's path) or "RACE AS" — pick any driver on the grid; your
`career.driver` becomes their `{name, code, num}`, your seat becomes theirs, and
`DriverRatings.BASE[code]` (`js/car/driver-ratings.js:39`) becomes your baseline
rather than an invented one. `STARTER_TIER_MIN` (`js/game/career-ui.js:30`) has to
relax for this path — racing as Verstappen means starting at Red Bull.

**Why for this game.** Zero new systems. `seatDriver()` (`js/game/career.js:414`)
already replaces exactly one grid seat with `career.driver`, and every rating
lookup is by **code**, which the module header says is deliberate so a driver
keeps their ratings across a move. Choosing an existing code makes the whole
grid one driver shorter and hands the player that driver's personality — which is
also the natural hook for driver-specific accolades (P2): "as HAM, take an eighth
title".

**Risk to check.** Two seats must not resolve to the same code — `career.seats`
and `career.dev` are keyed by `teamId:seat` (`js/game/store.js:132`), so the
replaced driver simply ceases to exist, which is correct. But
`marketValue()`/`driverStandings()` (`js/game/career.js:889`) iterate `gridSeats()`
and would be fine. **Unverified** — no run was made.

**Files.** `js/game/career-ui.js` — `buildSetupPanes()` (`:503-649`), `freshDraft()`
(`:56`), `starterTeams()` (`:52`). `js/game/career.js` — `start()` (`:304`).

**Save shape.** `career.driver` gains `real: true` (so the UI can say "racing as"
rather than "your driver"). **FILL.**

**Test.** `career.spec.js`: starting as `HAM` puts `HAM` in the Ferrari seat and
`ratings("HAM")` is the BASE row, not the tier fallback; the grid still contains
exactly 22 cars and no duplicate code (extend the existing grid test at
`career.spec.js:377`).

---

### P7 — Negotiate the contract you sign · **M**

**What it is.** F1 24's "set your own targets". Each offer on
`#career-offers` gets three variants of the same seat:

| Stance | Salary | Points bonus | Season goal | On miss |
|---|---|---|---|---|
| SAFE | ×0.85 | ×0.85 | `expectedFinish + 2` | small rep hit |
| STANDARD | ×1.0 | ×1.0 | `expectedFinish` (today's value) | today's hit |
| AMBITIOUS | ×1.3 | ×1.3 | `expectedFinish − 3` | double rep hit, offers next winter one tier lower |

Depends on P1 (a goal nobody judges cannot be negotiated).

**Why for this game.** It converts the offers sheet from "pick a colour" into the
one real decision of the winter, using arithmetic we already have —
`salaryFor()` (`js/game/career.js:383`), `expectedFinish()` (`:404`), `bonusPt`
(`:393`). F1 25 wraps this in cutscenes and an agent; the *decision* is the part
worth copying.

**Files.** `js/game/career.js` — `offerFrom()` (`:1101`), `makeOffers()` (`:1108`),
`acceptOffer()` (`:1150`). `js/game/career-ui.js` — `buildOffers()` (`:1033-1056`).

**Save shape.** `deal.stance: "safe"|"std"|"ambitious"` and the offer objects gain
the same. **FILL** — an old `deal` with no stance reads as `"std"`, which is
exactly what it was.

**Test.** `career.spec.js`: an AMBITIOUS offer's salary is the stated multiple of
the STANDARD one and its `goal.value` is strictly lower; accepting it writes the
stance; missing the goal on that stance costs the doubled rep.

---

### P8 — A practice programme: one optional flying lap that pays research credits · **M/L**

**What it is.** The one system F1 25's career loop has that ours has no analogue
of: a reason to drive *before* the weekend, and a non-result income into R&D.
Minimal version — before qualifying, GO RACING offers **PRACTICE PROGRAMME**:
one out-lap + one flying lap on the existing time-trial path (`session = "tt"`),
graded against a target derived from `Quali.lapTime()` for your own car, paying
credits on a three-band scale (within 2 % / 1 % / 0.3 % of the target). One
attempt per round, recorded so it cannot be repeated.

**Why for this game.** It makes the R&D economy respond to *driving* rather than
only to *finishing*, which is precisely the loop F1 25 players spend practice
sessions on. And the machinery already exists: `Quali.lapTime()`
(`js/game/quali.js:91`) is a calibrated quasi-steady model that reads the same
`LAT_MAX`/`ACCEL`/`BRAKE` the driving model does — so "the target" is a number we
can already compute per car per circuit with no per-track tuning
(`QUALI_TRIM = 0.75` was measured, `js/game/quali.js:73`).

**Why it is ranked below the cheap ones.** It touches `js/game.js` — the session
routing at `openQuali()` (`js/game.js:7440`) and the weekend entry at
`openRaceSettings("career")`. `module-size.test.mjs:224` ratchets `js/game.js` at
**8186 lines** and the file sits at its ceiling, so every added line there has to
be paid for by removing one. Design it so the *rules* (target, banding, payout)
live in `js/game/career.js` and only the session hand-off is in `game.js`.

**Files.** `js/game/career.js` — `practiceTarget()`, `settlePractice()`.
`js/game/career-ui.js` — a card on the hub. `js/game.js` — the smallest possible
routing change. `js/game/quali.js` — export nothing new; `lapTime`/`capFor` are
already returned (`:331`).

**Save shape.** `career.practiced: []` (rounds already attempted, cleared at the
rollover alongside `paidSponsors`, `js/game/career.js:1238`). **FILL.**

**Test.** `career.spec.js`: the payout is deterministic for a given (seed, round,
lap time); a second attempt at the same round pays 0; the practice payout is 0
outside a career (the `inCareer()` isolation test at `career.spec.js:187` pattern).

---

### P9 — Constructors' standing feeds the winter payout · **S**

**What it is.** F1 25 inverts resource-point income by constructors' position —
leaders get fewer, back-markers more
([EA deep dive](https://www.ea.com/en/games/f1/f1-25/news/f1-25-career-deep-dive)).
Add a **season-end constructors' payout** at `rollover()` that pays *more* the
further down the order you finished relative to your tier, i.e. keyed off the
same `expectedConstructor()` map (`js/game/career.js:909`) `rolloverTeams()`
already builds.

**Why for this game.** `tools/career-economy.mjs` already found and fixed one
half of this problem — `salaryFor()` was inverted the wrong way and tier-4 seasons
earned ~35 % less to fix themselves with (`docs/CAREER.md` §"The economy,
measured", `js/game/career.js:374-382`). Prize money is still purely
position-based (`:29-31`), so the compounding disadvantage survives at the
constructors' level. This is a small, measurable correction in a place we have a
measuring tool for.

**Files.** `js/game/career.js` — `rollover()` (`:1184`), a `CONSTRUCTOR_PAY`
constant beside `PRIZE` (`:29`).

**Save shape.** None (paid at the rollover, which already writes).

**Test + gate.** `career.spec.js` asserts the payout is larger for a tier-4
career than a tier-0 career at the same finishing position. **Then re-run
`node tools/career-economy.mjs`** — `docs/CAREER.md` names `PRIZE` as one of the
three things that require a re-measure. Read the *re-spec figure* (cars-worth of
research per season; below ~1 is a grind, above ~6 solves the car in year one),
not the catalog percentage.

---

### P10 — A SHORT qualifying format · **M**

**What it is.** A second option beside today's single flying lap: a two-part
session. Part 1 simulates the whole field and eliminates the slowest six; part 2
re-draws execution for the remaining sixteen and you drive your lap there. The
model already supports it — `compute()` (`js/game/quali.js:208`) simulates every
car from `(seed, round, driverId)`, so part 2 is the same call with a different
round key and a filtered field.

**Why for this game.** It is the cheapest weekend-format variety on the list and
it makes a bad qualifying lap *cost* something, which is what the F1 format is
for. It also gives the RACE SETTINGS sheet (`index.html:796-798` already has a
`QUALIFYING LAP` row) a second value rather than a boolean.

**Watch out.** `Quali.order(live)` returns `null` unless **every** live car maps
(`js/game/quali.js:265-274`), and `docs/CAREER.md` records two shipped bugs that
both looked like working grids. An elimination format must still classify all 22
— eliminated cars keep their part-1 time and sit below every part-2 runner. Do
not let the classification hold fewer rows than the field.

**Save shape.** None — it is a race setting, persisted the way RELIABILITY is
(`docs/CAREER.md` §"The player can switch it off").

**Test.** `tests/specs/quali.spec.js`: SHORT produces a classification of exactly
`cars.length` rows; the bottom six are ordered among themselves by their part-1
times; `Quali.order()` returns a full grid.

---

### P11 — In-season form · **M**

**What it is.** Driver ratings only move at the winter (`rolloverDrivers()`,
`js/game/career.js:935`). Add a small in-season **form** term — a per-driver,
per-round pure draw with a short memory, worth at most ±1 % of pace — so the grid
order is not identical for 24 rounds.

**Why for this game.** It is the mechanism behind the *"the AI is inconsistent
track to track"* complaint being a *feature* rather than a bug: F1 25 players
object to inconsistency because it is unexplained and unbounded. A visible,
bounded, seeded form line on the hub ("GAS: in form") is the same variance made
legible.

**Serious risk — read before starting.** `driverSkill()` in `js/game.js` spends
exactly one **unconditional** `simRnd()` draw per driver and the stream position
after `makeCars()` is a hard contract (`docs/CAREER.md` §"The one rule that
matters"; `js/car/driver-ratings.js:118-143`). Form must therefore enter the
same way `tierV` does — as a multiplier computed from a **stateless** career hash
and folded into the per-car bake, never as a new draw and never inside a branch.
`Career.paceMult()` (`js/game/career.js:467`) is the exact precedent: it returns
1 outside a career, so there is no second code path.

**Files.** `js/game/career.js` — a `formMult(driverId, round)` beside
`paceMult()`. `js/game.js` — the `tierV` bake line only.

**Save shape.** None (pure draw).

**Test.** `career.spec.js`: the sim RNG-stream test (`career.spec.js:406`,
`:1413`) must still pass unchanged — that is the actual gate; plus, same seed
same form, and form is exactly 1 outside a career.

---

### P12 — Research can fail · **S**, and probably **do not** — see §4

Listed for completeness because F1 24/25 have it. Our `research()`
(`js/game/career.js:561`) is instant and certain. Adding a failure roll costs
almost nothing. See §4 for why it is the wrong trade here.

---

## 4. What NOT to build

| F1 25 feature | Why it is wrong here |
|---|---|
| **Owner-only MY TEAM** (F1 25 retired the driver/owner) | The community reaction was overwhelmingly negative — "Removing the option of creating your own driver to drive your team is a game breaker for me", "Removing features is almost always a bad thing" ([r/F1Game 1jw0ez0](https://www.reddit.com/r/F1Game/comments/1jw0ez0/take_the_lead_in_my_team_20_f1_25_deep_dive_1/)). Our MY TEAM is deliberately owner-*driver*: `gridDrivers()` puts you in seat 0 and your hire in seat 1 (`js/game/career.js:441-447`) and `docs/CAREER.md` builds the whole mode on "the one relationship MY TEAM is built on". Codemasters' own stated reason — that a driver/owner always picks themselves — is a management-depth problem we do not have, because we have no per-driver upgrade allocation to distort. |
| **Driver Icons / historical drivers** | Likeness and name rights we do not hold. `js/car/teams.js` is described in its own header as "hardcoded, **verified** 2026 grid", and the eight fictional `FREE_AGENTS` (`js/game/career.js:72-81`) are the deliberate answer to needing extra drivers. |
| **An 11th team option** | We already field 11 real teams / 22 cars (`js/car/teams.js:6-123`); `custom` is the twelfth and belongs to MY TEAM. Adding a fictional twelfth to a *driver* career changes the grid size, which reaches `driverStandings()`, `expectedConstructor()`, `tierFinish()` and every economy figure `tools/career-economy.mjs` measured — a large blast radius for a cosmetic gain. |
| **Sprint weekends** | A race is `GAME_LAPS = 3` (`js/game.js:598`). A sprint is defined by being *shorter than the race*; at three laps there is no room below it. |
| **Secret meetings with a hidden discovery timer** | The mechanic's appeal is the risk, and the risk is a hidden clock. `docs/CAREER.md` is explicit that the offer ladder is "a visible ladder rather than a hidden interest model, so the climb reads as earned" (`js/game/career.js:1096-1099`). P7's stance choice and P1's RENEGOTIATE-at-a-rep-cost express the same trade with the price on the label. |
| **Research failure rolls** (P12) | We have exactly one economy and it is small. F1 25 can afford a failed development because resource points arrive every weekend from six practice programmes; ours arrives from race results, so a failed research is a lost race. It also breaks the guarantee that money spent converts into a part, which is what makes the fitted-cap decision legible. If in-season variance is wanted, P5's modifiers give it *predictably*. |
| **A separate research screen / R&D tree UI** | `docs/CAREER.md` §"The garage is the R&D tree" — "there is no separate research screen… because 'what could this car become' is the question you ask standing in front of the list you fit from". Two screens would mean two truths about what a part costs. |
| **AI difficulty split into skill / aggression / mistakes sliders** | Genuinely wanted by F1 players ([r/F1Game 1hv5z3e](https://www.reddit.com/r/F1Game/comments/1hv5z3e/what_would_you_like_on_f1_25/)) — but it is a *physics/AI* change, not a career one, and `tests/specs/physics-characterization.spec.js` is the master gate for anything near `game.js`. Out of scope for this document; note it as a driving-model item. |
| **F2 / junior ladder** | `STARTER_TIER_MIN = 3` (`js/game/career-ui.js:30`) already delivers the climb ("a career that can start at Mercedes has nowhere to go"), with seven teams to choose between. A second formula is a second grid, a second calendar and a second economy for the same narrative beat. |
| **Two-player career** | VS FRIEND is a 2–4 player WebRTC race with no backend (`docs/MULTIPLAYER.md`); career state is one local save with one contract and one balance. |

---

## 5. Respect these invariants (summary of `docs/CAREER.md`)

Any of these broken and the change is wrong regardless of how good it looks:

- **`Career.rnd` is stateless and every key ends in the varying part.** `mix32`
  (`js/game/career.js:127`) is measured, not decoration — without it 100 % of
  seasons missed an objective kind. Never draw from `simRnd`.
- **The sim RNG stream position after `makeCars()` is a hard contract.**
  `driverSkill()`'s draw is unconditional and first.
- **`career.season` shares its shape *and its object identity* with
  `apex26.season`.** `rollover()` mutates in place (`js/game/career.js:1227`);
  reassigning it orphans `game.js`'s alias silently.
- **`dev` / `tdev` / `seats` are DELTAS, never absolutes**, so updating
  `js/car/teams.js` never invalidates a save.
- **`migrateCareer()` stays PURE** (`js/game/store.js:202`) — it must not write.
- **Additive optional fields are FILLS, not `CAREER_V` rungs.** Bump `CAREER_V`
  only when an existing field changes meaning.
- **localStorage is the budget.** `HISTORY_MAX = 10`, six saves under six keys so
  a quota failure costs one career and not six.
- **`js/game.js` is at its `module-size.test.mjs` ceiling** (8186 lines,
  `tests/unit/module-size.test.mjs:224`); so is `js/game/apex.js` (3106, `:247`).
  New career logic goes in `js/game/career.js` / `career-ui.js`.
- **Guides quote the rules, never themselves** (`js/game/career-ui.js:15-22`).
- **Every gameplay accessor is gated on `inCareer()`** so a Grand Prix inherits
  nothing.
- Run `npm run test:modes` after any change here, `npm run test:parts` after
  anything touching the garage, and re-run `node tools/career-economy.mjs` after
  touching `RESEARCH_MULT`, the `PRIZE` ladder, `BUDGET_MULT` or `salaryFor()`.

---

## 6. Do these three first

**1 · P1 — make the contract bind.** It is not a feature, it is a repair: the hub
shows "Seasons left 3" and a "Season goal P8" that the rules never read
(`js/game/career-ui.js:686`, `:712`; `js/game/career.js:1214`, `:1219`). Everything
else on this list is easier to justify once the contract is the spine it already
pretends to be — P7 depends on it outright.

**2 · P2 — accolades, derived.** Highest arc-per-line on the list. Zero save
change, zero migration, no localStorage cost, one table plus one render block in
a file that already derives exactly this data (`js/game/career-ui.js:1073`). It
answers "nothing new after season one" without adding a system.

**3 · P4 — wire the budget ladder.** Finished, tested-in-principle work that has
never had a caller (`js/game/career.js:571-589`). One button beside the FACILITY
control, plus the guide text `docs/CAREER.md` explicitly parked until the button
lands. Re-measure with `tools/career-economy.mjs` in the same change.

P3 (team-mate head-to-head) is the obvious fourth — it is small, and it makes two
of the five existing round briefs feel like a season rather than a coin-flip.
