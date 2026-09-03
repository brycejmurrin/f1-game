# Career mode

Long-form progression on top of the race loop: a season is a chapter, not the
whole story. Two front-ends — **DRIVER CAREER** (you are a driver signed to a
team) and **MY TEAM** (you own the twelfth team) — share one core.

- **Rules and save:** `js/career/career.js` (global `Career`) — no DOM.
- **Reliability / DNFs:** `js/race/reliability.js` (global `Reliability`).
- **Screens:** `js/career/career-ui.js` (global `CareerUI`) — `#career`, `#career-offers`.
- **Qualifying:** `js/race/quali-model.js` (global `Quali`) — the model: session timing, ordering, the persisted grid; `js/ui/quali-sheet.js` (global `QualiSheet`) — `#quali`, the sheet that paints `quali.rows()`.
- **Ratings:** `js/data/driver-ratings.js` (global `DriverRatings`).
- **Persistence + migration:** `GameStore.migrateCareer` in `js/core/store.js`.
- **Styles:** `css/career.css`.

---

## The mode is two axes

`seasonMode` / `timeTrial` were two booleans. They are now **derived views** of two
independent axes in `js/game.js`:

```js
let flow = "gp";        // "gp" | "season" | "career"   — what the RUN is for
let session = "race";   // "race" | "tt" | "quali"      — what THIS session is
```

A career weekend qualifies and then races, so `career` and `quali` must both be
expressible at once — a single flat enum cannot say that. The split also lets
qualifying reuse the time-trial path instead of adding a game state.

`G.seasonMode` returns `flow === "season" || flow === "career"`, and `G.timeTrial`
returns `session === "tt"`. Every downstream module (`results.js`, `menus.js`,
`hud.js`, `agentview.js`) and the `__apex.info()` contract are unchanged. Because a
career genuinely *is* a championship, the standings screens work in career with no
career-specific branch.

**`setFlow(v)` is the only way `flow` is written.** It also calls
`Career.engage(v === "career")` — see the next section for why that matters.

Game states are unchanged: `menu | count | race | results`. (There is no `select`
or `seasonEnd` state; the select screen is `#select` unhidden while the state
stays `menu`, and the season-end panel is `results` with `#res-next` relabelled.)

## A loaded save is not an active career

The career save is read once at boot (`Career.load()`), before any screen; the
title button itself always reads CAREER MODES (see below). That
makes "a career exists" a different question from "career rules apply right now",
and conflating them is a real bug: a plain Grand Prix would inherit the career's
team development and its garage build.

So every **gameplay** accessor in `Career` is gated on `inCareer()` — `paceMult`,
`teamStats`, `driverOverride`, `devFor`, `owned`, `settleRound`. Save/UI accessors
(`data`, `state`, `start`, `load`, `save`) are not. `tests/specs/career.spec.js` pins both
directions: development must not reach a Grand Prix, and must reach the career.

## The saves — `apex26.career.<flavour>.0` … `.2`

**Six saves in two sets**: three DRIVER-career slots and three MY TEAM slots, kept
apart so the two modes can never compete for room. `apex26.careerSlot` names the
live one as `"flavour:index"`.

Separate **sets** rather than six shared slots, because the two modes are different
games. A player twelve rounds into a MY TEAM should not have to weigh that against
trying a driver career, and *&ldquo;which of my three careers do I delete to make
room&rdquo;* is not a question either mode should be able to ask of the other.

Separate **keys** rather than one array, because localStorage rewrites the *whole*
value on every write: a single array would rewrite all six careers every time a
round settled, and a quota failure would cost six saves instead of one.

**A career's own flavour decides its set** — never the caller. `start({slot: 2})` on
a driver career fills DRIVER slot 2, and there is no argument that can put it in the
MY TEAM set. That invariant is what keeps the sets meaningful.

`Career.slots()` returns all six; `slots("myteam")` one set. The **live** slot is
summarised from the in-memory object, not from storage — a round settled but not yet
written would otherwise read as lost progress. `useSlot(flavour, i)` **saves the
career being left first**: `settleRound()` already persists, but a garage edit or an
accepted offer lives on the object until something calls `save()`, and switching away
is exactly when that would be lost.

### Two earlier layouts migrate

| Wrote | Becomes |
|---|---|
| `apex26.career` — the single save of the first career build | its flavour's slot 0 |
| `apex26.career.0..2` — three SHARED slots, either flavour in any | sorted into the two sets, in order |

Order is preserved rather than index: a MY TEAM that sat in shared slot 2 becomes MY
TEAM slot 1 if it is the second MY TEAM found, which is what a player scanning the
new screen expects. Migration never overwrites — a set that already holds saves is
the current layout, and a stale key from a half-finished migration must not clobber
it.

> **`migrateCareer()` must stay PURE.** It used to end in `store.set("career", …)`,
> which was right when there was one save under one key and wrong the moment there
> were more: reading a slot wrote it straight back under the *legacy* name, so the
> key the slot migration had just cleared came back on the same boot and every later
> boot resurrected it — a stale duplicate an older build would happily load.
> `Career.load()` persists the climbed shape instead, because it is the one that
> knows the slot.

### CAREER MODES is the one door

The title button reads **CAREER MODES** always — never CONTINUE. It used to go
straight into whichever save was last touched, which meant a player with a single
driver career had no way in to MY TEAM, to their other saves, or to the delete that
makes room. The screen behind it is `#career`'s picker state: one pane per mode,
each carrying that mode's three slots and its guide. Pressing an empty slot decides
**both halves of the address** — which mode and which slot — so the setup form opens
on that mode rather than asking again.

Changing mode on the setup form re-targets the slot (`Career.firstFree`), because
slot 3 of the driver set is not slot 3 of MY TEAM.

Versioned (`CAREER_V`), migrated through a ladder of one function per version step,
mirroring `migrateSeasonPoints`. Key fields:

| Field | Meaning |
|---|---|
| `flavour` | `"driver"` or `"myteam"` |
| `year`, `seed` | season year; the seed every deterministic career draw derives from |
| `team`, `seat`, `driver` | who you drive for, which of the two seats, and your name/code/number |
| `money`, `rep` | credits, and paddock reputation 0–100 |
| `season` | **the same shape as `apex26.season`** — `{round, pts, teamPts, driverCodes}` |
| `owned`, `fitted`, `budgetLvl` | researched option ids, the fitted build, the cap tier |
| `deal` | contract: team, seat, years/left, salary, points bonus, season goal |
| `dev`, `tdev`, `seats` | sparse DELTAS over `DriverRatings` / `team.stats` / the grid |
| `roster` | MY TEAM only — the hired second driver and what they cost per round |
| `history` | finished seasons |

**`career.season` deliberately matches `apex26.season` byte for byte**, and career
points `game.js`'s `season` variable straight at it. That is what lets
`buildResults`, `buildStandings`, the HUD and the menus work in career untouched.

Two consequences to respect:

- `endRace()` must persist through `Career.save()`, **not** `store.set("season", …)`,
  or a career's standings overwrite the standalone season save.
- `migrateSeasonPoints` persists unconditionally, so career goes through the pure
  remap inside `migrateCareer` instead. Leaving the entry points (`#mb-season`,
  `quitToMenu`) to re-read `apex26.season` is what drops the alias on the way out.

`dev`/`tdev`/`seats` store deltas, never absolutes, so updating the hardcoded 2026
grid in `js/data/teams.js` never invalidates a save.

### Randomness

Career draws use `Career.rnd(...parts)` — a **stateless** FNV-1a hash of
`seed:parts`, run through an xorshift-multiply finalizer. Never `simRnd`: that
stream belongs to the physics sim, and drawing from it here would make a career's
existence change seeded race results. Stateless means there is no cursor to persist,
so a save/load round-trip cannot desync.

**The finalizer is not decoration — it is what makes the draw a draw.** Every key
here ends in the part that varies — a round number, a driver id — and FNV-1a's last
multiply barely disturbs the HIGH bits, which is exactly the end `h / 2^32` reads.
Measured over 2000 seeds, FNV-1a alone left **100 %** of seasons missing at least one
of the five objective kinds, some of them running the same brief all 24 rounds; the
qualifying spread, whose keys end in a driver id, drew off the same weakness.
`mix32` — the standard xorshift-multiply finalizer, two multiplies — takes that to
**2.7 %**, against the **2.4 %** a genuinely uniform draw produces (5·(4/5)²⁴, near
enough).

So `mix32` is load-bearing and must not be simplified back out as a redundant hash
of a hash. Anything added here inherits a working draw only because it is there, and
every key in the file ends with its varying part.

## Driver ratings

`js/data/driver-ratings.js` holds five axes, 0–100, for all 22 drivers, keyed by
driver **code** so a driver keeps their ratings when the market moves them.

| Axis | Feeds |
|---|---|
| `pace` | AI speed and qualifying — weighted heaviest in `overall()` |
| `craft` | OT fire rate, late-brake, adaptive lane (`ai-drive.js`); permanent pass/defend pull (inlined in `game.js`) |
| `awareness` | incidents/penalties **and** follow gap, contact yield, stuck dig-out, ERS bank, street OT scale/pull |
| `consistency` | **variance, not speed** — it narrows the band around a driver's pace |
| `experience` | races started; damps development **and** steer smoothing / unstuck panic / OT hesitation |

It is deliberately not in `js/data/teams.js`: that file is the verified real-world
grid and is loaded by `tools/carview.html` through the manifest's `CARVIEW` subset,
which has no use for balance numbers.

**Ratings apply in every mode**, not only in career — the grid has personality in a
one-off Grand Prix too. Career layers `dev` deltas on top via `Career.devFor()`.

### The one rule that matters

`driverSkill()` in `js/game.js` replaces the old `Math.min(1.0, 0.92 + simRnd()*0.1)`
roll. **The `simRnd()` draw is unconditional and comes first.** Move it inside a
branch and the RNG stream position after `makeCars()` differs between career and
non-career, silently breaking every seeded determinism spec and visual baseline.
`DriverRatings.skill(r, roll)` takes an already-drawn sample for exactly this reason.

`SKILL_BASE`/`SKILL_SPAN` are fitted so the grid-mean pace (84) lands on **0.968** —
the true mean of the old clamped roll — so giving every driver a rating does not
quietly make the whole field faster. The spread is ~2.7% against `TIER_V`'s ~5.8%
across tiers: the car still dominates, as it does in the sport.

## Team development

`team.stats` and `TIER_V` are never mutated. `career.tdev[teamId]` is an additive
delta in stat points (±8 → ±2% pace, a little over one `TIER_V` step), folded into
one new per-car field baked in `makeCars()`:

```js
tierV: TIER_V[team.tier] * Career.paceMult(team.id) * (mate ? buildPace(savedParts, factoryParts) : 1),   // paceMult() is exactly 1 outside career; the mate factor is MY TEAM's second car (below)
```

The per-car update reads `c.tierV * c.skill * dd.ai`. `team.tier` itself is never
rewritten — it drives the grid sort, the mesh presets and the colours.

## Economy and R&D

Credits, the same unit `Parts.CATALOG` prices options in, so a result converts
straight into a part. **Purchase is research:** spending unlocks a catalog option
permanently for that team at `opt.cost * RESEARCH_MULT` (×3); fitting it afterwards
is free. The catalog stays the single source of truth for what a part is *worth*,
and one constant sets the pace of the entire economy.

Two gates, not one:

1. **Ownership** — `career.owned`. Every cost-0 option is always owned, and
   `Parts.DEFAULTS` are all cost-0, so a legal car is guaranteed by construction.
2. **A fitted-cost cap** — `Career.budget()`, a MULTIPLE of the team's own works
   car (`BUDGET_MULT`, level 0 = exactly that car), clipped by the
   catalog-derived `budgetCap()` ceiling described under *Two sinks* below.
   Relative because a
   `FACTORY_PRESETS` build runs 505 cr (Haas) to 2000 cr (McLaren) on the current
   catalog (`Parts.getCost(Parts.getFactorySetup(team))` — recompute after any
   reprice): any flat number
   either starts a top team over its own cap or hands a back-marker a fortune.

Ownership alone would let one good season max the car out and kill the economy
dead. The cap is what keeps a career owning more than it can fit at once, so every
weekend stays a choice.

**The cap moves three times.** `BUDGET_MULT` is a four-level ladder
(`1.0 / 1.15 / 1.35 / 1.6`) priced by `BUDGET_UPGRADE` (2,500 / 5,000 / 9,000 cr),
and the RAISE THE CAP card in `career-ui.js` is what spends it — the same card
shape as FACILITY, directly beneath it, and hidden at the top rung rather than
shown disabled.

The two sinks are deliberately different in kind, and that is why both exist:
the **factory** cuts what every *future* part costs, so it compounds and never
runs out; the **cap** raises how much of what you *already own* may be bolted on
at once, so it is the only way a fully-researched garage converts into lap time.
Three rungs against the factory's eight means the cap is the scarce one. Spending
on either is genuinely giving up the other.

> Both career guides quote the ladder. They previously described the cap as
> fixed, because the rules shipped without a screen and `budgetLvl` sat at 0 for
> the life of every career — the guide text and the button were required to land
> together, and did.
>
> **Re-measure after touching `BUDGET_MULT` or `BUDGET_UPGRADE`.** Raising
> `budget()` lowers `tools/career-economy.mjs`'s re-spec figure with no change in
> income, because more of what a season earns goes onto the car instead of into
> the owned set.

Ownership is enforced on **write**, not on read. `getTeamParts`/`saveTeamParts` in
`js/game.js` is the two-line funnel every parts consumer already goes through, so
branching there gives the career a fully isolated build that only ever contains
owned ids. `Parts._resolve()` stays career-blind — threading a filter through it
would mean every caller of `resolveSetup`/`getMods`/`getVisualTiers` had to pass it
or silently disagree with the others, and would put save state on the physics path.
`Parts.isOptionAvailable(opt, team, owned)` does take the owned set as a third
argument, but only so the garage can grey a row out: it is a LISTING gate, and
nothing in resolution passes it.

### The garage is the R&D tree

There is no separate research screen. `#carsetup` (`js/garage/setup-sheet.js`) is the
tree, because "what could this car become" is the question you ask standing in
front of the list you fit from. `G.careerOwned()` is the one test it branches on —
non-null already means "career rules apply AND the team on screen is the career
team".

- **Two budgets, on one line.** The header reads `BALANCE … cr · FITTED n / cap cr`.
  The balance DEVELOPS parts; the cap is what may be bolted on at once. They are
  spent separately, so a research can succeed and the fit behind it still be
  refused — that branch rebuilds the list rather than playing the budget-reject
  shake, because the money really did leave the account and shaking a row that just
  cost 900 cr reads as "nothing happened".
- **Locked is a third row state, not a filter.** An unresearched option still lists,
  quoting `RESEARCH · n cr` — a price, not a spec. Only the supplier/team gate above
  it hides a row outright.
- **FREE BUILD is hidden in career.** `#cs-unlimited` is the free-play
  unlimited-budget cheat; offering it here would hand away the economy the whole
  mode is built on. The cap is `Career.budget()`, not the flat 780 cr `Parts.BUDGET`.

## MY TEAM

The custom team is not a works team, and two things in the core quietly assumed it
was.

**It has no `FACTORY_PRESETS` entry**, so `Parts.getFactorySetup()` resolves it to
the all-cost-0 `DEFAULTS` — a works car that costs nothing. Deriving the fitted cap
from that gave a cap of 0 cr, and nothing could be bolted on at all. `worksCost()`
answers `MYTEAM_WORKS` (900 cr) for it instead: a deliberate figure rather than a
derived one, between Haas (505) and Alpine (910) — a real car, off the back of the
grid.

**A constructor enters two cars.** `Career.gridDrivers(team)` is what `makeCars()`
asks for a team's seats, and for the custom team in a MY TEAM career it answers with
two — you in seat 0, and a hire from `FREE_AGENTS` in seat 1 (stored as
`career.roster`, put in the seat by `driverOverride()`). Everywhere else it returns
`team.drivers` untouched: every other team, a driver career, and all of free play,
where the custom team stays the single entry it has always been.

**Both cars run your build.** `makeCars()` hands every non-player car its team's
`factoryParts`, which for the custom team resolves to the all-cost-0 `DEFAULTS` —
so the hire was driving a startup car all season while the guide said otherwise,
and the constructors' championship your R&D was paying for was being contested by
one of your two entries. The `mate` branch (`team.custom` plus a seat that is not
yours — the custom team fields one entry everywhere except a MY TEAM career, so
free play and driver careers cannot reach it) gives the second car the career
build, visually and in pace.

Pace rides in **`tierV`**, the number the tier has always contributed, so the
per-car update stays `c.tierV * c.skill * dd.ai` and no AI gains a parts branch
on the physics path. `buildPace()` is the mean of the four `Parts` axes over the
works car's, because a human car spends its mods across speed/accel/cornering/
braking and an AI has exactly one scalar — one axis alone would score a cornering
upgrade as no upgrade. It is pure and draws no RNG, so the `simRnd` stream
position after `makeCars()` is untouched.

The hire is paid **every round, out of the BALANCE** — `wageBill()`, deducted in
`settleRound()` — and never off the fitted cap. Real driver salaries sit outside the
development cost cap, so a quick team-mate costs you upgrades rather than legality.

`FREE_AGENTS` carry no ratings table of their own. `DriverRatings.get()` falls
through to its deterministic tier hash for an unknown code, so each hire has a
stable personality without a second table to keep in step with the first.

### The hire has a contract, and it runs

`roster[0].left` was written when they were signed and then **read by nothing at
all** — the driver could never be renewed, replaced or lost, which made the one
relationship MY TEAM is built on a static number.

`rolloverHire()` runs at the winter, before offers are drawn. The term ticks down,
and on expiry it writes a **`pending`** onto the hire rather than resolving it: the
decision is the player's, and the hub is where they make it.

| Outcome | When | What the player does |
|---|---|---|
| `renew` | the default | take `ask`, or sign somebody else |
| `left` | only after they **outperformed** the car (`pos < expected − 4`), and then only on a seeded 35% draw | sign somebody else |

They can only ever be poached after outperforming. Losing a driver who was beaten
all year would read as a bug rather than as a story.

What they ask for follows what the seat was worth to them:
`salary × (1 + clamp((expected − pos) / 8, −0.35, +0.45))`, floored at
`HIRE_MIN` — beating the car's expectation is worth money, being beaten by it is a
pay cut, and nobody drives for nothing.

**An unresolved seat blocks the weekend.** `Career.state().hire` is non-null while a
decision is pending, the hub reads GO RACING as SIGN A DRIVER and disables it: a
constructor enters two cars, and a season cannot start with one of them empty.

### The winter market is visible

`rolloverMarket()` has always swapped 0–2 seats and the player only ever met the
*result* — a driver they had raced all year was suddenly somewhere else, with
nothing to say it had happened, which reads as the game being inconsistent rather
than as a story. The moves are recorded on `career.moves` and printed on the
end-of-season sheet, the one screen that sits between two seasons.

## Objectives and reputation

One objective per round, drawn with `Career.rnd(year, "obj", round)` from a table of
five kinds. Meeting it pays **+150 cr and +2 rep**; missing it costs **2 rep**.

| Type | Met when | Value |
|---|---|---|
| `finish` | `pos <= value` | `expectedFinish(team) - 1` — one place better than the contract's own season goal, or a race brief would be easier than the year-long one |
| `beatMate` | you finish ahead of your team-mate | — |
| `outQualMate` | you started ahead of your team-mate (`car.gridPos`) | — |
| `points` | `pts >= value` | 1 |
| `clean` | no track-limits cuts, no penalty | — |

`clean` reads `car.cuts`, the **lifetime** cut count. The penalty ladder in
`game.js` counts on a separate `cutWarn` that RESETS — three warnings, one +5 s
penalty, reset — precisely so that "no cuts at all" cannot become satisfiable by
cutting four more times. Do not merge the two counters.

The save stores four **scalars** — `{round, type, value, done}` — never the sentence.
Wording comes from `OBJ_LABELS` at render time, because prose in a save can never be
reworded again without a migration. `round` is load-bearing: `endRace()` advances the
calendar *before* calling `settleRound()`, so without it there is no telling the brief
that was live for the race just run from the one for the race to come. `settleRound()`
recomputes it with `objectiveFor(round - 1)` rather than trusting the cache — the draw
is pure, so the two can never disagree.

The two comparison briefs are **vacuous, not failed,** with no team-mate — failing a
brief you were given no means to meet is not the driver's fault. MY TEAM enters two
cars, so the hire is the benchmark there like anywhere else; the branch still fires
for a `myteam` save written before `career.roster` existed, which `migrateCareer`
fills with nothing, leaving `gridDrivers()` on the custom team's single entry.

Reputation has two channels, deliberately different in kind:

```js
rep += clamp((expectedFinish(team) - finishPos) * 0.6, -4, +6)   // relative to the CAR
     + (objectiveMet ? +2 : -2)                                   // flat: met or not
```

`expectedFinish` already encodes the tier, so beating a bad car raises reputation and
cruising in a good one does not.

## Reliability and retirements

`js/race/reliability.js` (global `Reliability`) decides whether a car reaches the
flag. Without it every one of the twenty-two finishes every race forever, which
makes a championship a pure pace ranking — and a career flat, because a points
finish in a bad car is only earned if the good cars can break.

**The rating is derived, never authored.** There is no per-team reliability table
to keep in step with `js/data/teams.js`. Risk is the team `tier` — the number that
already says how good the car is — relieved by two things a career can actually
buy:

| Term | Source | Worth |
|---|---|---|
| tier | `TIER_RISK[team.tier]` | 4 % (tier 0) → 12 % (tier 4) per race |
| team development | `Career.paceMult(teamId)`, normalised to ±1 | up to −40 % at full `tdev` |
| the build | fitted ENGINE + GEARBOX cost, as a fraction of the dearest option | up to −33 %, human cars only |

The third is the R&D economy's grip on this. ENGINE and GEARBOX because those are
the two components a real car retires from, and cost because cost is exactly what
`Career.research()` charges — so developing a power unit buys finishes as well as
lap time, and a `SIGNATURE` clone scores the same as the universal option it
stands in for (they are cost-identical by construction). AI cars are scored on
tier alone: an AI runs its team's works car, which is what `tier` already says.

### The draw touches no stream

`makeCars()` spends exactly two `simRnd()` per driver — the lane-jitter draw plus
`driverSkill()`'s roll — and
the stream position after them is a hard contract (see the rule in Driver ratings
above). So reliability draws from **nothing**: `Reliability.arm()` hashes
`(seed, "dnf", round, driverId)` through `Career.hash` — the stateless draw `rnd`
is built on, with the seed passed in, because a Grand Prix has no career seed.
Inside a career the seed is `career.seed` and the round is `career.season.round`;
outside one they are `simSeed()` and a per-session race counter, so two Grands
Prix in a row are not handed the same casualties.

Arming happens once, at the green light (`armReliability` in game.js), and writes
a plan: `dnfAt`, a fraction of RACE DISTANCE, and `dnfWhy`. `checkRetirements()`
fires when the car gets there — so a 3-lap blast and a 25-lap race lose their cars
at the same points of the story. `Reliability.arm()` also CLEARS, which is what
resets the flags between sessions.

### What a retirement is

`retireCar()` in game.js is the counterpart of `rescuePlayer()`: same job, opposite
intent. It parks the car as far off the racing line as the circuit allows, on the
side it was already on, using the same `Tracks.wallAt()` limit the collision pass
clamps every car to and the same `worldFromTrack` writeback `rescuePlayer` and
`coast` use. A stopped car is not a new kind of physics.

Then it leaves the field: retirements are excluded from `ranked` in `update()`,
which is one line doing four jobs — the HUD position stops counting a parked car,
the AI stops treating it as a blocker, `resolveCollisions` leaves it where it was
put, and the overtake target walks past it.

`endRace()` classifies `fin.concat(run, out)`, retirements last and ordered among
themselves by progress, then delegates awarding to `SeasonCal.award()`, which
pays `c.retired ? 0 : (table[i] || 0)` from `pointsTable()` — `Teams.POINTS` in
career, `CLASSIC_POINTS`/`SPRINT_POINTS` under a season weekend format — explicit
rather than relying on a DNF landing outside the ten scoring slots, so every car
above keeps what its position earns.

### In career

`settleRound()` records `dnf` on the results row (the reason, not just the fact)
and returns it, so a season's archive can say why it came apart; `Career.state()`
counts them as `dnfs` and the hub shows it on THE CAR card, next to development
and the fitted build — the three things that decide it. `__apex.careerSim()` arms
the same way, or fast-forwarding a season would quietly hand every car a finish.

**A retirement fails the `clean` objective.** Even a mechanical one: the brief asks
for a race completed without incident, and paying the bonus for a DNF would make
the one round you did not race the cheapest one to bank.

### The player can switch it off

RELIABILITY is a race setting (`#rs-reliab`) alongside DIFFICULTY, persisted the
same way — OFF | LOW | REAL. It ships **OFF**: `store.get(k, d)` returns the stored
value whenever the key exists, so a new default only ever reaches a fresh install,
and this key is new for every save. OFF is therefore the only default that does
not start retiring cars in a game somebody was already halfway through.

## The season rollover

`Career.rollover()` is what makes a career a career rather than a season that stops.
Order matters — development and the market are drawn against the season that just
finished and hash on the year that just finished, so `year++` and the standings reset
come last.

1. **Archive** into `career.history`: year, team, driver pos/pts, constructor pos/pts,
   champion, wins, podiums. **Capped at 10 entries** — this is localStorage.
2. **Driver development.** Each grid driver drifts by `growth + form + noise`:
   `growth = (1 - experience/100) * 6 - 1.5` (experience is the age proxy — a rookie
   gains ~+2.7 a year, a 100-rated veteran loses 1.5), `form = clamp((tierFinish(team)
   - champPos) * 0.25, ±3)`, `noise = ±2` from `rnd(year, "dev", driverId)`. Pace takes
   the whole drift, craft and consistency half. Per-axis deltas, clamped **±12**.
   Experience is bumped +4 a year against its **own 0..40 cap** (per-axis dev deltas carry the ± clamp), because it is cumulative:
   at ±12 a rookie would stall four seasons in and freeze the growth term forever.
3. **Team development.** `tdev = clamp(round(tdev * 0.5 + shove), ±8)`, where
   `shove = clamp((expectedConstructorPos - actualPos) * 0.5, ±2)`. Without the halving
   a team that gets ahead compounds forever and the grid ossifies after three seasons.
4. **Driver market.** 0–2 swaps a year (`rnd(year, "mkt", "n")`), each trading a top
   team's weakest driver for the best in the midfield, and stopping early when nobody
   has earned the move. Only deltas are stored, in `career.seats`; `career.dev` entries
   are swapped with them, because development follows the **driver** and `dev` is keyed
   by seat.
5. **Offers.** `marketValue = 0.5 * rep + 0.5 * (championship percentile * 100)`. A team
   talks once that clears `92 - tier * 18`, so tier 0 wants essentially a champion and
   tier 4 will take anyone. Your own team always offers first — an empty list would
   strand a career with nothing to press. Deal length is `1 + floor(mv / 40)`, capped at 3.

   **MY TEAM is never offered a seat, and its contract clock does not run.** You own the
   constructor; there is nothing to sign and nobody to be hired away by. This is a
   correctness rule, not flavour: `acceptOffer()` moves `career.team` while `flavour`
   stays `"myteam"`, so an offer taken from a MY TEAM save put the player and their
   hired driver into a real team's two seats and dropped the custom team off the grid
   — the career being played stopped existing. `makeOffers()` returns `[]` for the
   flavour, and the hub already handles an empty list by going straight to NEXT RACE.

`rollover()` **mutates `career.season` in place** and never reassigns it. `openCareer()`
does `season = c.season`, and that shared identity is the whole reason `buildResults` /
`buildStandings` / the HUD work in career with no career-specific branch. Swapping in a
fresh object orphans game.js's alias: the next race writes its points into a dead object
while the standings still render the stale one, which looks entirely fine.

### The contract binds

Two rules that were written down and never ran.

**The season goal is resolved at the winter.** `deal.goal` — the championship
position the team expects of you, derived from the car by `expectedFinish()` —
was written by `newDeal()`, rendered on the hub and on the offer sheet, and read
by nothing. Meeting it is worth `GOAL_REP` (+5); missing it costs the same, and
also `GOAL_MV` (12) off the market value the winter's offers are drawn against.
That is the demotion: `offerBar()` spaces the tiers 18 apart, so a missed goal
costs most of a tier's worth of interest without needing a second rule to say so.

**No money either way, deliberately.** `tools/career-economy.mjs` measures this
economy against the catalog, and a once-a-season bonus it does not model would
invalidate every figure in "The economy, measured" above. Reputation is the
channel that already carries season-long form.

`career.goalResult` is transient, like `career.moves`, and the end-of-season
sheet draws it — a rule the player never sees fire is barely better than one that
does not run. Absent on an older save, the block simply does not render, so no
`CAREER_V` rung is owed.

**Offers are drawn in the winter the term expires.** `deal.left--` ran while
`makeOffers()` ran unconditionally beside it, so every winter opened the offer
sheet and re-signing reset the term — "3 seasons" on the CONTRACT card could
never become 2. `career.offers` is now `[]` while `left > 0`, which is the
empty-list path the hub has always handled (it is the same one MY TEAM takes).
Leaving a seat early would be a feature with a control that says so; a silent
yearly re-shop was not that control.

`Career.acceptOffer(i)` rewrites `deal`/`team`/`seat`. **Moving** re-seeds `owned`/`fitted`
from the new team's factory preset — you do not take the old team's parts with you, and
that is also what re-opens the R&D economy for a second season instead of arriving with
a maxed car. **Renewing** leaves the garage alone; loyalty is not a punishment.

`career.seats` reaches the grid through the existing `Career.driverOverride(teamId, seat)`
that `makeCars()` already calls — one path, not two. The gate moved: it used to return
early for `flavour !== "driver"`, and now it defers to an ungated `seatDriver()` so a
market swap applies in MY TEAM as well, while the player's own seat still outranks it.

## The economy, measured

`tools/career-economy.mjs` sims a season per starting team through the **real**
`Career.settleRound()` and prices the income against the catalog. It exists because
`QUALI_TRIM` shipped as a reasoned guess and was **27% wrong**, and `RESEARCH_MULT`
/ `PRIZE` / `BUDGET_MULT` had never had the same treatment.

It found one immediately. `salaryFor()` read `(4 - team.tier) * 15` while its own
comment said salary *"falls with the quality of the car you are given: a back-marker
has to pay you more to sign"*. Tier 0 is the **best** car, so the code did the exact
opposite of the sentence above it.

| | before | after |
|---|---|---|
| tier 3 season (Alpine / RB / Haas / Williams) | 5,766 – 7,516 cr | 6,486 – 8,236 cr |
| tier 4 season (Audi / Aston / Cadillac) | **4,014 – 4,764 cr** | **5,454 – 6,204 cr** |
| worst-to-best spread | 2.3× | 1.7× |

The slowest cars on the grid also earned ~35% less to fix themselves with. The mode
already hands them the disadvantage; the economy was compounding it.

**Read the re-spec figure, not the catalog percentage.** The fitted cap means you can
never run more than a fraction of what you own, so nobody needs the whole catalog —
what says whether a season is worth playing is how many complete *cars-worth* of
research it buys. Below ~1 is a grind; above ~6 solves the car in year one.

`RESEARCH_MULT` is the single knob. Re-measure after touching it, the `PRIZE` ladder,
or `salaryFor()`.

## Sponsors — MY TEAM's second income

A driver is paid a **salary**; an owner is paid by **sponsors**. That is the income
the two modes should not share, and it was the one thing MY TEAM had none of — it
started with more money and then earned exactly like a driver.

A sponsor is a **multi-round brief**: the round objective asks how a weekend went, a
sponsor asks how the *season* is going, which is what a principal is judged on. Built
from the same parts as the round objective — a type, a value, a pure draw off the
career seed — rather than as a second system. Windows tile the season, so a single
lucky weekend cannot pay one and a single bad one does not sink it.

Progress is read off `career.results`, the rows the season already records, so there
is no second ledger to keep in step. `career.paidSponsors` records which windows have
paid, so a reload cannot double-pay and an unmet window cannot be retried.

## The facility — the sink that does not run out

Ownership only grows and the budget ladder stops at three, so a successful career
converged on owning everything with nothing to spend on: the mode had no end game.
Eight levels (FACILITY_MAX = 8), each a permanent cut to research cost — a geometric price
against a linear, capped discount, so it is always affordable in principle and never
trivialises the catalog. The discount lands inside `researchCost()` rather than at the
point of sale, so the garage's price and what the balance is charged cannot disagree.

## Extra funds

Opt-in, off by default, stored **outside** the save (`apex26.career.freeMoney`) —
a preference about how you want to play, not a fact about one career. The career
garage hides FREE BUILD precisely because an unlimited parts budget would hand away
the economy; this is the same trade made explicit and reversible instead of hidden.
Money stops being scarce, **the fitted cap does not move**, and every other rule
stands — so a bottomless balance still cannot put more on the car than the rules
allow, which is the constraint that actually makes a weekend a choice.

## Qualifying

A `session`, not a game state. The player's flying lap **is** a time trial: one car,
the existing lap timing and validity, two laps (a standing out-lap then the one that
counts).

The rest of the field is **modelled**, not driven — twenty-one AI cars round a real
lap costs a second or more of frozen UI on a phone. `Quali.lapTime()` is a
quasi-steady lap simulation: the cornering limit at each sample, a forward pass for
what the car could accelerate to, a backward pass for what it must brake for. It
reads the same `LAT_MAX`/`BRAKE` the driving model uses (acceleration through
`G.aTop()`, the pace-scaled ceiling, so it matches `G.vTop()`) and the same
curvature the road is built from, so a simulated time and a driven one land on one
scale without a per-track fudge factor.

`gridUp(preOrder)` takes the classification. **Map it onto the live cars by
`driverId`** — `startRace()` calls `makeCars()` again, so the car objects the
classification captured are orphans by the time the grid is built. Handing those
over places cars nobody is driving and leaves the real field at `prog: 0`, where
`fieldState()` reports `Teams.LIST` order and looks plausible enough to fool a
careless check. `Quali.order(live)` returns `null` unless every car maps.

A one-off Grand Prix defaults to its hardcoded P12 start, but the persisted
`raceQuali` race-settings chip can qualify one (`gridFromQuali` accepts either a
championship with `SeasonCal.quali()` on, or `raceQuali` outside time trial).
SEASON quali is format-gated — a weekend format can turn quali off or add a
sprint.

**Every round qualifies, and the classification never outlives its weekend.** Two
bugs came out of getting that wrong, and both looked like working grids:

- The results screen's NEXT ROUND went straight to `startRace()`, so only the round
  entered through race settings was ever qualified for. Rounds 2–24 of a season
  lined up on round 1's classification — which `Quali.order()` dutifully remapped
  onto the new cars by `driverId`, producing a plausible grid for a session that
  never happened. NEXT ROUND opens the sheet for a championship now;
  `openQuali()` clears the previous classification, then `quali.begin()`
  restores a persisted driven order from `season.qualiOrder` (the sheet-reopen
  fix) — the weekend's order is dropped by `SeasonCal.award()` at round close.
- `gridUp()` accepts any `preOrder` whose length matches the field, and the
  classification survived `quitToMenu()` — so the next **Grand Prix** started on a
  season's qualifying order, silently losing the P12 climb that mode exists for.
  The read is gated on `gridFromQuali()` rather than on every exit having
  remembered to clear (that gate includes the GP `raceQuali` path above).
  `quitToMenu()` clears the in-memory classification only — the persisted one
  stays until award/abort, so CONTINUE keeps the grid.

## Debug hooks

```js
__apex.info()                 // + flow, session, career
__apex.career()               // the save, or null
__apex.career({teamId, seat, name, code, num, seed})   // start one, skipping the UI
__apex.career(true)           // resume and open the hub
__apex.careerState()          // compact snapshot
__apex.careerMoney(n)         // get/set the balance
__apex.careerReset()          // wipe the save
__apex.careerSim(n)           // settle n rounds WITHOUT driving, through the real
                              //   settleRound(). Needs a track + grid staged, and
                              //   reuses that ONE circuit for every round — the
                              //   per-round variation is the seeded draw, not 24
                              //   headless track rebuilds
__apex.careerRollover()       // force the rollover -> {champion, offers, history}
__apex.ratings(code?)         // five axes + overall; no args = the whole grid
__apex.qualiSim(playerTime?)  // the lap model for the loaded track, NON-destructive
__apex.carAt(i)               // + code, seat, tierV, skill, ratings,
                              //   retired, dnf, dnfAt, finPos
__apex.reliability("real")    // the RELIABILITY setting — off | low | real
__apex.retirements()          // the armed plan: who stops, why, and at what
                              //   fraction of race distance
__apex.retire(1, "gearbox")   // retire a car NOW (no arg = the player)
```

## Career history (`#career-history`)

A career that has run three seasons used to show no trace of the first two. This
screen is the record: **CAREER TOTALS** — seasons, race starts, wins, podiums,
points, championships, best championship finish, teams driven for — then **SEASON
BY SEASON**, one `.res-row` per archived year, newest first.

**Every total is derived, none is stored.** `careerTotals()` in
`js/career/career-ui.js` walks `career.history` and adds the season in progress from
`career.results` and `career.season.pts`. A totals block on the save would be one
more rung on the migration ladder for numbers that are a sum over data already
there — and a total written once is a total that goes stale, which no migration
puts right after the fact.

Race starts is the one figure the archive does not record. A season only reaches
`history` once `seasonDone()` is true, so an archived year ran the whole calendar
and `history.length * roundsTotal()` is exact; the running year contributes the
rounds actually settled. Only `__apex.careerRollover()` can archive a short season,
and it is a debug hook. Best championship is over **finished** seasons only — a
mid-season standing is not a career best.

The way in is a **card at the foot of the hub's left column** (`.cr-record`), not a
fourth button in `#cr-foot`. At 844x390 the sheet's left column — which is what the
foot sits inside at two-column widths — is ~370 px, and four buttons at the shared
`.sheet-foot .bigbtn` 110 px floor need ~440 px, so a fourth wraps the action bar
and costs a button's height out of a 390 px-tall screen. A card also states what it
opens, which a row of exits cannot.

Registered in all three screen registries — the `UiLayers` layer list
(`js/ui/layers.js`, which MenuNav reads), `ScrollFade.SCREENS`, and
`AriaState.ROOTS` — or it silently loses keyboard nav, scroll
fades and screen-reader state. Styles are in `css/career.css`; the season rows are
the shared `.res-row` vocabulary, podium classes included, so a title-winning year
lights up gold with no new CSS.

## Tests

`tests/specs/career.spec.js` and `tests/specs/quali.spec.js`, both in `node tools/test-bg.mjs modes`
(there is no `test:career` group — `test-bg` exits 2 on an unknown name). They cover the mode axes, the save and its migration, the
isolation guarantees, the hub flow, a settled round, the R&D garage, MY TEAM's two
cars and its wage bill, the objectives, the rollover and the contracts, the ratings,
the grid, and RELIABILITY — that OFF changes nothing, that a seeded season retires
the same cars for the same reasons every time, that a retirement classifies below
every finisher and scores no points, and that the draw leaves the sim RNG stream
exactly where it found it. `tests/specs/ui-audit.spec.js` screenshots the career hub, its
new-career state, qualifying and the offers sheet in both orientations.

Run `node tools/test-bg.mjs modes` in the background after any change here, and `node tools/test-bg.mjs car` after
anything that touches the garage.
