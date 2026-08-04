# Career mode

Long-form progression on top of the race loop: a season is a chapter, not the
whole story. Two front-ends — **DRIVER CAREER** (you are a driver signed to a
team) and **MY TEAM** (you own the twelfth team) — share one core.

- **Rules and save:** `js/game/career.js` (global `Career`) — no DOM.
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

**The finalizer is not decoration.** Every key here ends in the part that varies — a
round number, a driver id — and FNV-1a's last multiply barely disturbs the high bits,
which is exactly what `h / 2^32` reads. Without it, picking one of five objectives
gave seasons where the same brief came up all 24 rounds, and *every* season was
missing at least one kind. Two extra multiplies take that to the 2.4 % a genuinely
uniform draw produces. Anything added to this file that ends its key with the varying
part is relying on it.

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
permanently for that team; fitting it afterwards is free.

Two gates, not one:

1. **Ownership** — `career.owned`. Every cost-0 option is always owned, and
   `Parts.DEFAULTS` are all cost-0, so a legal car is guaranteed by construction.
2. **A fitted-cost cap** — `Career.budget()`, a MULTIPLE of the team's own works
   car (`BUDGET_MULT`, level 0 = exactly that car). Relative because a
   `FACTORY_PRESETS` build runs 570 cr (Haas) to 2035 cr (McLaren): any flat number
   either starts a top team over its own cap or hands a back-marker a fortune.

Ownership is enforced on **write**, not on read. `getTeamParts`/`saveTeamParts` in
`js/game.js` is the two-line funnel every parts consumer already goes through, so
branching there gives the career a fully isolated build that only ever contains
owned ids. `Parts._resolve()` stays career-blind — threading a filter through it
would mean every caller of `resolveSetup`/`getMods`/`getVisualTiers` had to pass it
or silently disagree with the others.

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

The two comparison briefs are **vacuous, not failed,** with no team-mate. The custom
team fields one car and that is not the driver's fault.

Reputation has two channels, deliberately different in kind:

```js
rep += clamp((expectedFinish(team) - finishPos) * 0.6, -4, +6)   // relative to the CAR
     + (objectiveMet ? +2 : -2)                                   // flat: met or not
```

`expectedFinish` already encodes the tier, so beating a bad car raises reputation and
cruising in a good one does not.

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
                              //   settleRound(). Needs a track + grid staged
__apex.careerRollover()       // force the rollover -> {champion, offers, history}
__apex.ratings(code?)         // five axes + overall; no args = the whole grid
__apex.qualiSim(playerTime?)  // the lap model for the loaded track, NON-destructive
__apex.carAt(i)               // + code, seat, tierV, skill, ratings
```

## Tests

`tests/career.spec.js` and `tests/quali.spec.js`, both in `npm run test:career`
(and in `test:modes`). They cover the mode axes, the save and its migration, the
isolation guarantees, the hub flow, a settled round, the ratings, and the grid.

Run `npm run test:modes` after any change here, and `npm run test:parts` after
anything that touches the garage.
