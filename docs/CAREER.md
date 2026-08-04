# Career mode

Long-form progression on top of the race loop: a season is a chapter, not the
whole story. Two front-ends — **DRIVER CAREER** (you are a driver signed to a
team) and **MY TEAM** (you own the twelfth team) — share one core.

- **Rules and save:** `js/game/career.js` (global `Career`) — no DOM.
- **Reliability / DNFs:** `js/game/reliability.js` (global `Reliability`).
- **Screens:** `js/game/career-ui.js` (global `CareerUI`) — `#career`, `#career-offers`.
- **Qualifying:** `js/game/quali.js` (global `Quali`) — `#quali`.
- **Ratings:** `js/car/driver-ratings.js` (global `DriverRatings`).
- **Persistence + migration:** `GameStore.migrateCareer` in `js/game/store.js`.
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

Game states are unchanged: `menu | select | count | race | results`. (There is no
`seasonEnd` state; the season-end panel is `results` with `#res-next` relabelled.)

## A loaded save is not an active career

The career save is read once at boot so the title button can offer CONTINUE. That
makes "a career exists" a different question from "career rules apply right now",
and conflating them is a real bug: a plain Grand Prix would inherit the career's
team development and its garage build.

So every **gameplay** accessor in `Career` is gated on `inCareer()` — `paceMult`,
`teamStats`, `driverOverride`, `devFor`, `owned`, `settleRound`. Save/UI accessors
(`data`, `state`, `start`, `load`, `save`) are not. `tests/career.spec.js` pins both
directions: development must not reach a Grand Prix, and must reach the career.

## The save — `apex26.career`

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
- `migrateSeasonPoints` persists unconditionally, so career uses the extracted pure
  remap `GameStore.remapPoints` instead. Leaving the entry points (`#mb-season`,
  `quitToMenu`) to re-read `apex26.season` is what drops the alias on the way out.

`dev`/`tdev`/`seats` store deltas, never absolutes, so updating the hardcoded 2026
grid in `js/car/teams.js` never invalidates a save.

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

`js/car/driver-ratings.js` holds five axes, 0–100, for all 22 drivers, keyed by
driver **code** so a driver keeps their ratings when the market moves them.

| Axis | Feeds |
|---|---|
| `pace` | AI speed and qualifying — weighted heaviest in `overall()` |
| `craft` | wheel-to-wheel |
| `awareness` | incidents and penalties |
| `consistency` | **variance, not speed** — it narrows the band around a driver's pace |
| `experience` | races started; damps development |

It is deliberately not in `js/car/teams.js`: that file is the verified real-world
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
tierV: TIER_V[team.tier] * Career.paceMult(team.id),   // paceMult() is exactly 1 outside career
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
   car (`BUDGET_MULT`, level 0 = exactly that car). Relative because a
   `FACTORY_PRESETS` build runs 570 cr (Haas) to 2035 cr (McLaren): any flat number
   either starts a top team over its own cap or hands a back-marker a fortune.

Ownership alone would let one good season max the car out and kill the economy
dead. The cap is what keeps a career owning more than it can fit at once, so every
weekend stays a choice.

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

There is no separate research screen. `#carsetup` (`js/game/setup-ui.js`) is the
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
  mode is built on. The cap is `Career.budget()`, not the flat 600 cr `Parts.BUDGET`.

## MY TEAM

The custom team is not a works team, and two things in the core quietly assumed it
was.

**It has no `FACTORY_PRESETS` entry**, so `Parts.getFactorySetup()` resolves it to
the all-cost-0 `DEFAULTS` — a works car that costs nothing. Deriving the fitted cap
from that gave a cap of 0 cr, and nothing could be bolted on at all. `worksCost()`
answers `MYTEAM_WORKS` (900 cr) for it instead: a deliberate figure rather than a
derived one, between Haas (570) and Alpine (955) — a real car, off the back of the
grid.

**A constructor enters two cars.** `Career.gridDrivers(team)` is what `makeCars()`
asks for a team's seats, and for the custom team in a MY TEAM career it answers with
two — you in seat 0, and a hire from `FREE_AGENTS` in seat 1 (stored as
`career.roster`, put in the seat by `driverOverride()`). Everywhere else it returns
`team.drivers` untouched: every other team, a driver career, and all of free play,
where the custom team stays the single entry it has always been.

The hire is paid **every round, out of the BALANCE** — `wageBill()`, deducted in
`settleRound()` — and never off the fitted cap. Real driver salaries sit outside the
development cost cap, so a quick team-mate costs you upgrades rather than legality.

`FREE_AGENTS` carry no ratings table of their own. `DriverRatings.get()` falls
through to its deterministic tier hash for an unknown code, so each hire has a
stable personality without a second table to keep in step with the first.

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

`js/game/reliability.js` (global `Reliability`) decides whether a car reaches the
flag. Without it every one of the twenty-two finishes every race forever, which
makes a championship a pure pace ranking — and a career flat, because a points
finish in a bad car is only earned if the good cars can break.

**The rating is derived, never authored.** There is no per-team reliability table
to keep in step with `js/car/teams.js`. Risk is the team `tier` — the number that
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

`makeCars()` spends exactly one `simRnd()` per driver through `driverSkill()`, and
the stream position after it is a hard contract (see the rule in Driver ratings
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
themselves by progress, and awards `c.retired ? 0 : Teams.POINTS[i]` — explicit
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
   Experience is bumped +4 a year against its **own ±40 cap**, because it is cumulative:
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

`Career.acceptOffer(i)` rewrites `deal`/`team`/`seat`. **Moving** re-seeds `owned`/`fitted`
from the new team's factory preset — you do not take the old team's parts with you, and
that is also what re-opens the R&D economy for a second season instead of arriving with
a maxed car. **Renewing** leaves the garage alone; loyalty is not a punishment.

`career.seats` reaches the grid through the existing `Career.driverOverride(teamId, seat)`
that `makeCars()` already calls — one path, not two. The gate moved: it used to return
early for `flavour !== "driver"`, and now it defers to an ungated `seatDriver()` so a
market swap applies in MY TEAM as well, while the player's own seat still outranks it.

## Qualifying

A `session`, not a game state. The player's flying lap **is** a time trial: one car,
the existing lap timing and validity, two laps (a standing out-lap then the one that
counts).

The rest of the field is **modelled**, not driven — twenty-one AI cars round a real
lap costs a second or more of frozen UI on a phone. `Quali.lapTime()` is a
quasi-steady lap simulation: the cornering limit at each sample, a forward pass for
what the car could accelerate to, a backward pass for what it must brake for. It
reads the same `LAT_MAX`/`ACCEL`/`BRAKE` the driving model uses and the same
curvature the road is built from, so a simulated time and a driven one land on one
scale without a per-track fudge factor.

`gridUp(preOrder)` takes the classification. **Map it onto the live cars by
`driverId`** — `startRace()` calls `makeCars()` again, so the car objects the
classification captured are orphans by the time the grid is built. Handing those
over places cars nobody is driving and leaves the real field at `prog: 0`, where
`fieldState()` reports `Teams.LIST` order and looks plausible enough to fool a
careless check. `Quali.order(live)` returns `null` unless every car maps.

A one-off Grand Prix skips qualifying and keeps its hardcoded P12 start — that mode
is a quick blast, not a weekend. SEASON gets qualifying as well as career.

**Every round qualifies, and the classification never outlives its weekend.** Two
bugs came out of getting that wrong, and both looked like working grids:

- The results screen's NEXT ROUND went straight to `startRace()`, so only the round
  entered through race settings was ever qualified for. Rounds 2–24 of a season
  lined up on round 1's classification — which `Quali.order()` dutifully remapped
  onto the new cars by `driverId`, producing a plausible grid for a session that
  never happened. NEXT ROUND opens the sheet for a championship now, and
  `openQuali()` clears the previous classification.
- `gridUp()` accepts any `preOrder` whose length matches the field, and the
  classification survived `quitToMenu()` — so the next **Grand Prix** started on a
  season's qualifying order, silently losing the P12 climb that mode exists for.
  The read is gated on `isChampionship()` rather than on every exit having
  remembered to clear: a Grand Prix holds no qualifying session, so it has no grid
  to inherit, by construction. `quitToMenu()` clears it as well.

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
`js/game/career-ui.js` walks `career.history` and adds the season in progress from
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

Registered in all three screen registries — `MenuNav.LAYER_IDS`,
`ScrollFade.SCREENS`, `AriaState.ROOTS` — or it silently loses keyboard nav, scroll
fades and screen-reader state. Styles are in `css/career.css`; the season rows are
the shared `.res-row` vocabulary, podium classes included, so a title-winning year
lights up gold with no new CSS.

## Tests

`tests/career.spec.js` and `tests/quali.spec.js`, both in `npm run test:career`
(and in `test:modes`). They cover the mode axes, the save and its migration, the
isolation guarantees, the hub flow, a settled round, the R&D garage, MY TEAM's two
cars and its wage bill, the objectives, the rollover and the contracts, the ratings,
the grid, and RELIABILITY — that OFF changes nothing, that a seeded season retires
the same cars for the same reasons every time, that a retirement classifies below
every finisher and scores no points, and that the draw leaves the sim RNG stream
exactly where it found it. `tests/ui-audit.spec.js` screenshots the career hub, its
new-career state, qualifying and the offers sheet in both orientations.

Run `npm run test:modes` after any change here, and `npm run test:parts` after
anything that touches the garage.
