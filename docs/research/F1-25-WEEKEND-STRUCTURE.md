# The race weekend and season shell — what F1 25 does, what we have, what to build

Research + design for the layer both career modes sit on. Written 2026-08-14 on
`claude/f1-2025-research-career-74zqbr`. **Nothing here was run in a browser** —
no Playwright, no server, no MCP. Every claim about our code is a read of the
file at the cited line; every claim about F1 25 carries a URL. Anything I could
not check either way is labelled **unverified**.

`docs/research/` is exempt from `tests/unit/docs-integrity.test.mjs`
(`tests/unit/docs-integrity.test.mjs:37` skips `archive|research|tracks`), so
this file does not put a path claim into the tooling gate.

---

## 1. What F1 25 does

### 1.1 The weekend, session by session

F1 25's own UDP telemetry spec is the authoritative enumeration of what a
session can be — it is the list the game itself serialises.

| Session (UDP id) | What it is |
|---|---|
| Practice 1 / 2 / 3 (1–3) | full-length free practice |
| Short Practice (4) | a compressed practice — one block, programmes still available |
| Qualifying 1 / 2 / 3 (5–7) | the full three-segment knockout |
| Short Qualifying (8) | a single shortened segment |
| One-Shot Qualifying (9) | one lap, one chance, no traffic |
| Sprint Shootout 1 / 2 / 3 (10–12) | SQ1/SQ2/SQ3 — the sprint's own knockout |
| Short / One-Shot Sprint Shootout (13–14) | the same two compressions |
| Race / Race 2 / Race 3 (15–17) | GP, sprint, and a third leg |
| Time Trial (18) | solo against the clock |

Source: `https://github.com/MacManley/f1-25-udp` (F1 25 UDP appendix, Session
Types + Ruleset IDs). The same packet carries `m_sessionLength`:
**0 = None, 2 = Very Short, 3 = Short, 4 = Medium, 5 = Medium Long, 6 = Long,
7 = Full** — the weekend-structure axis is a *length per session*, not a
one-of-three preset, and `None` is a first-class value (that is how a weekend
"skips" practice).

Race control in the same spec: `m_safetyCarStatus` — `0 = no safety car,
1 = full, 2 = virtual, 3 = formation lap`; event codes include `RDFL` (red
flag), `SCAR`, `PENA`, `DTSV`/`SGSV` (drive-through / stop-go served), `FLBK`
(flashback). Retirement reasons include `9 = session skipped, 10 = session
simulated` — i.e. **simulating a session you did not drive is a first-class
outcome the classification records**, not a menu shortcut.

Tyres (same appendix): actual compounds `C0–C5` (ids 21, 20, 19, 18, 17, 16),
`7 = inter`, `8 = wet`; visual compounds collapse to `16 = soft, 17 = medium,
18 = hard, 7 = inter, 8 = wet`. `m_tyresAgeLaps` is carried per car. So the
game models **six dry compounds mapped to three visual colours per weekend**,
plus tyre age in laps.

Where the modes live: Grand Prix and Time Trial are **inside F1 World**, not on
the main menu — "select F1 World on the main menu, then hit Play. Scroll to the
right until you see the options to start a Grand Prix or Time Trial"
(`https://traxion.gg/how-to-play-grand-prix-and-time-trial-in-f1-25/`). Grand
Prix builds "a bespoke championship with the ability to change the weekend
structure to make it as short or long as you like … adjust the weather
intervals and time of day, or set rules and flags for penalties such as corner
cutting" (same URL).

### 1.2 Practice programmes

Six programmes, unchanged in shape since F1 2021: **Track Acclimatisation,
Tyre Management, Fuel Management, ERS Management, Qualifying Pace, Race
Strategy** (`https://traxion.gg/how-research-and-development-works-in-f1-2021/`).
They are the R&D income: you drive them to earn resource points that buy car
upgrades.

What matters for our design is *how players actually use them*, and the
r/F1Game weekend-strategy thread
(`https://www.reddit.com/r/F1Game/comments/1j3lkan/what_your_racing_weekend_strategy_when_in_career/`)
is unusually clear about it:

- "Do all of the objectives in the first practice to get resource points. By
  that time I'm warmed up for qualifying. Skip the next 2 most of the time."
- "I do 1st practice (full) then quick practice to finish programmes in FP2/3."
- "FP1: Strategy on Hard tires and one of the others like tyre management or
  fuel. FP2: Strategy on Medium tires… FP3: Strategy on Soft tires."
- "I do the practice programmes in FP1 … mainly for the resource points and
  also to find my average fuel consumption per lap from the race strategy
  programme results."
- "Simulate practice 1 and 2, then for 3 I do 1 or 2 objectives and then learn
  the track."

The dominant loop is: **one driven practice block for the currency and the
track knowledge, then simulate the rest.** That is the shape worth copying —
and it is the shape our modelled-lap simulator is already built for.

`https://www.f125game.com/driving-fundamentals/f125-practice-routine-for-beginners/`
adds the beginner framing: "Grand Prix > Weekend Structure: Short. Enable
Practice and Short Race (5 laps). In Practice, open the garage and select
Practice Programs > Track Acclimatisation (drive through the gates) and one of:
Tyre Management or Fuel/ERS." Track Acclimatisation is literally a gate run —
a driving-line exercise, not a lap-time exercise.

### 1.3 Strategy, tyres, pit stops

From `https://simracingsetup.com/ea-sports-f1/f1-25-race-strategy-guide/` and
`https://racinggames.gg/article/f1-25-how-to-manage-pit-stops-fuel-and-tyres`:

- A **race strategy screen before every race**, offering exactly **two**
  strategies — a default and an alternate — each showing a projected total race
  time, with a tyre-wear bar and a rising dotted lap-time line per stint.
- Editable elements: starting compound, number of stops, the laps to stop on,
  the compound after each stop, starting fuel, car setup.
- **"If you took part in the practice sessions, the race strategies can be
  personalised to your own driving"** — practice output feeds the strategy
  screen. This is the load-bearing link between practice and race, and it is
  the reason practice is not busywork.
- A pit stop costs "around 20–25 seconds". Change tyres before 65–75 % wear.
- The two-compound rule is enforced in a dry race.
- Live mid-race pit re-planning is on one held button.
- **Parc fermé**: "If you don't have Parc Fermé enabled, or haven't taken part
  in qualifying, you can change your entire car setup. If you did qualify, and
  do have Parc Fermé enabled, you will only be able to change … front wing,
  on-throttle differential, brake bias and tyre pressures."
- The strategy screen shows the weather forecast for the race, so a mid-race
  change of conditions is a decision made *before* the lights.

### 1.4 The mode list beyond career

| Mode | What it is | Retention hook | Could we do it? |
|---|---|---|---|
| **Driver Career** | real or custom driver, multi-season, contracts and R&D | a season is a chapter; the next seat is the carrot | **Have it** (`js/game/career.js`) |
| **My Team** | own the constructor; F1 25 made you owner-first, driving only the driver you pick that weekend | you built the thing that is winning | **Have it** (career `flavour: "myteam"`) |
| **Braking Point 3** | scripted story across 2024–25, branching driver choice in some chapters | narrative pull; finite | **No** — voice, cutscenes, writing. Out of budget by an order of magnitude |
| **F1 World** | the hub that *contains* Grand Prix, Time Trial, ranked MP and Invitationals, wrapped in an XP/upgrade progression | one progression bar behind every mode | **Partly** — the *hub* idea is cheap; the card-collection economy is not |
| **Grand Prix** | one-off race or a custom championship with a fully configurable weekend | sandbox; infinite replay | **Have it, thinly** — no weekend configuration |
| **Time Trial** | hot-lapping with ghosts and leaderboards | your own delta; rival ghosts | **Have it** (`session === "tt"`, `ttBoard`, `Ghost`) |
| **Invitationals** | limited-time co-op/competitive events in F1 World, unlocking cosmetics | FOMO + cosmetics | **Yes, in spirit** — as seeded, offline, rotating events |
| **Scenario Races** (Season 6) | "you are Albon at Imola, turn a points finish into a podium"; "you are Norris leading Abu Dhabi late, hold off two Ferraris" (`https://www.operationsports.com/f1-25-season-6-has-begun-with-new-challenges-and-podium-pass/`) | a five-minute, sharply-framed challenge with a stated goal | **Yes — this is the single best-value import.** It is a forced grid position plus a target, on machinery we already have |
| **Challenge Career** (F1 24; folded into F1 25's seasonal Scenario Races) | "new mini-seasons … with the top scores going onto leaderboards" (EA SPORTS F1, `https://www.facebook.com/EASPORTSF1/posts/833076595523231/`), playing as a real driver at their favourite tracks (`https://metro.co.uk/2024/05/28/f1-24-review-playing-heroes-20925639/`) | a 3–5 round season you can finish in an evening, scored | **Yes** — a short seeded championship over existing circuits |
| **Survival Challenge** (Season 4) | 5-player last-man-standing; the backmarker is eliminated every two minutes; races under 5 minutes; DRS from the start; no lap-1 collisions (`https://www.ea.com/en/games/f1/f1-25/news/f1-25-season-four`) | instant action, token currency, sub-5-minute sessions | **Maybe, single-player** — elimination against AI is a rule change on our existing race loop, not new tech |
| **Podium Pass** | 50 levels of free + VIP cosmetic rewards per ~2-month season, XP earned everywhere | a bar that fills whatever you play | **Only the offline half** — a local XP ladder unlocking liveries/parts. No store, no VIP tier |
| **Multiplayer / leagues** | ranked + unranked lobbies | social | **Have a 2–4 player version** (`docs/MULTIPLAYER.md`) |
| **Create-a-driver / MyDriver** | name, number, helmet, suit | identity | **Have the core** (career `driver` = name/code/number) |

### 1.5 Handling, and reversed tracks — briefly, for mode design

F1 25's handling was reworked in direct response to F1 24 complaints
(`https://en.wikipedia.org/wiki/F1_25`), and the AI was retuned to defend more
and to time DRS/ERS better (`https://www.ea.com/en/games/f1/f1-25/news/f125-faq`).

The mode-design consequence of **reversed circuits** (Silverstone, Zandvoort,
Red Bull Ring) is the interesting part, and EA is explicit: they are available
in Grand Prix, Time Trial and Multiplayer **immediately**, but only enter My
Team and Driver Career **from your second season onwards** — and the reverse
layouts needed AI retraining, redrawn DRS zones, new sector splits, a new grid
and new pit boxes (same FAQ URL). That is the lesson: *a novelty layout is a
non-career mode first, and only becomes career content once it has been given
the same furniture as a real circuit.* We should treat any layout novelty of
our own the same way, and it argues against reversing our circuits casually —
`Tracks.curvature()` sign, `+k = LEFT-hand turn` (CLAUDE.md), aero zones
(`js/game/aerozones.js`), sector boundaries and every circuit's scenery
`frac` keys are all directional.

### 1.6 What players say is missing or broken

- **Tyre wear on a controller is punishing and does not produce good racing**;
  and AI pace snaps back after a gap opens — "you can be ahead by a couple of
  seconds and out of the blue they're back on you having got an enormous power
  boost" (`https://forums.ea.com/discussions/f1-25-general-discussion-en/f1-25-career-mode-issues/12532949/replies/12533191`).
  The same post: "get their act together with the main fundamentals of the game
  instead of focusing on utter drivel like reverse tracks and F1 World
  nonsense."
- **Quali AI and race AI are calibrated differently** — "The AI seem to be MUCH
  faster in quali than in the race, so I usually accept anywhere in top 10 as
  decent" (r/F1Game thread above). Worth noting because our `QUALI_TRIM`
  calibration (`js/game/quali.js:73`) exists precisely to stop this, and is the
  one thing we already do better than the reference.
- **Practice data is not actually used** — "the game over fuels the car like
  crazy and does not use the data it got from the race strategy programme"
  (same thread; a reply notes you must explicitly pick the *personalised* setup
  for it to apply). The lesson: if practice feeds strategy, the feed must be
  the default, not an opt-in the player has to find.
- Most players **skip most of practice**. Any practice system whose value is
  only realised by driving three sessions is a system most players will never
  see.

---

## 2. Gap table — Apex 26 today

| Feature | Status | Evidence / reason |
|---|---|---|
| Two-axis mode model (`flow` × `session`) | **HAVE**, and better than a flat enum | `js/game.js:684`–`707`; `docs/CAREER.md` §"The mode is two axes" |
| Qualifying as a session, not a state | **HAVE** | `js/game.js:699` `isQuali()`, `js/game.js:7440` `openQuali()` |
| Modelled field, driven player | **HAVE**, calibrated | `js/game/quali.js:91` `lapTime()`, `:73` `QUALI_TRIM = 0.75` measured to 0.976 of a driven lap |
| Simulate-instead-of-drive a session | **HAVE**, for quali only | `#q-sim` handler, `js/game.js:7457` |
| Free practice | **MISSING** | no `session === "practice"` anywhere; `js/game.js:698`–`699` know only `tt` and `quali` |
| Practice programmes | **MISSING** | — |
| Multi-segment qualifying (Q1/Q2/Q3, one-shot, short) | **MISSING** | `Quali.simulate()` runs the whole field once, `js/game/quali.js:243` |
| Sprint weekend | **MISSING** | no per-round format; `Tracks.SEASON` (`js/track/tracks.js:2685`) is a flat circuit list |
| Race distance as a fraction of the real GP | **PARTIAL / wrong** | `js/game.js:7259` offers `[3, 5, 10, 25, 57]` and labels 57 "FULL" **for every circuit** — Spa is 44 laps, Monaco 78 |
| Tyre **compounds** | **PARTIAL — as a garage part, not a strategy** | `js/car/parts.js:211` is a `tyres` upgrade category (`supersoft`, `wet_full`, `endurance_tyre`, per-team SIGNATURE compounds); one choice, whole race, no wear |
| Tyre **wear / degradation** | **MISSING** | no `wear` symbol in `js/game.js`; `Parts` compound modifiers are static multipliers |
| Pit stops / pit lane | **MISSING**, and there is no geometry for it | no `pitLane`/`pitlane` anywhere in `js/track/` |
| Fuel load | **MISSING** | only `fuelId`/`fuelVisual` as a part (`js/game.js:1498`) |
| Parc fermé | **MISSING** | the garage is an unconditional step before the race (`els.selGo` → `openGarage("select")`, `js/game.js:7411`) and is always open from the career hub (`$("cr-garage")`, `js/game/career-ui.js:1231`) |
| Formation lap | **DELIBERATELY-NOT** | a standing start already exists and is modelled on both sides — `standingLoss()` (`js/game/quali.js:152`) charges the modelled field the same ~2.5 s the driven car pays. A formation lap adds a minute of ceremony to a phone session that is 3–25 laps long |
| Safety car / VSC / local yellow | **HAVE**, hysteresis and caps included | `js/game/racecontrol.js:33`–`42`, `:116`–`166` |
| Red flag | **MISSING** | `RaceControl` tops out at `3 = SAFETY CAR` (`js/game/racecontrol.js:33`) |
| Penalties | **PARTIAL, and the ladder is wrong** | `js/game.js:3736`–`3747`: every cut from the 4th onward adds `+5 s`, and the on-screen count only speaks for cuts 1–3. The real rule is three warnings → one 5 s penalty → counter resets |
| Reliability / DNFs | **HAVE**, seeded, stream-neutral | `js/game/reliability.js:137` `arm()`, drawing through `Career.hash` not `simRnd` |
| Weather | **PARTIAL — static per session** | `js/game.js:845` `raceWeather` is one of five values chosen before the race; `gripMult()` (`js/game.js:605`) is a constant for the whole session. No forecast, no transition |
| Time of day | **HAVE** as a per-race choice | `js/game.js` race-settings `rs-time` chips |
| Difficulty | **PARTIAL — three tiers** | `js/game/tables.js:23` `DIFF = {easy, normal, hard}`. F1 25 runs 0–110 |
| Assists → reward link | **MISSING** | assists are settings; the career economy does not know about them |
| Season standings / championship | **HAVE** | `buildStandings()` (`js/game/results.js:229`); career shares `apex26.season`'s shape byte for byte |
| Season calendar view | **MISSING** | the player learns the next circuit by arriving at it |
| Scenario / invitational events | **MISSING** | — |
| Seasonal / rotating content | **DELIBERATELY-NOT (live-service half)** | no backend, static GitHub Pages. A *seeded, offline, date-derived* rotation is possible; a store and a VIP tier are not |
| Two-player weekend | **PARTIAL** | qualifying already handles multiple driven laps (`drivenMap()`, `js/game/quali.js:192`) — the model stopped caring which human drove |

---

## 3. Ranked proposals

Ordering is value-per-line, with the two career modes weighted equally. Every
proposal states the module, because **`js/game.js` is at its ratchet ceiling**:
`tests/unit/module-size.test.mjs:224` pins it at `8186` and the file is 8185
lines. The ledger above that line is a written justification per bump — so a
proposal that needs even one wiring line in game.js must either pay for it in
that ledger or extract something out to stay net-neutral. Prefer wiring a new
module beside `Quali.create(G)` (`js/game.js:2840`) and paying one line, once.

New-file lockstep applies to every new module: IIFE file + `<script>` tag
position + `tools/manifest.cjs` entry + a `HARD_EDGES` pair if it is
destructured at eval time + a CLAUDE.md layout mention + a cache bump
(CLAUDE.md §Critical conventions).

---

### P1 — Practice programmes, built on the quali lap model — **effort M**

**What.** A `session === "practice"` block before qualifying in a career
weekend. Three programmes at first, each a driven target measured against a
number the existing model already produces:

| Programme | The target | Where the number comes from |
|---|---|---|
| **Qualifying Pace** | set a lap within X % of the modelled pole | `Quali.compute()` already returns the whole field's times before anyone drives — `js/game/quali.js:208` |
| **Race Pace** | N consecutive laps whose spread is under a threshold | the player's own lap times; `player.best` and the sector machinery at `js/game.js:1013` `sectorAt()` |
| **Track Acclimatisation** | complete a lap with zero track-limits cuts | `c.cuts` already counted per car, `js/game.js:3738` |

**Why it fits a phone browser game.** It is the highest-value item on this list
because it costs almost no new simulation. `Quali.create(G)` already exports
`lapTime` and `capFor` (`js/game/quali.js:331`), and `lapTime()` is a
quasi-steady forward/backward pass over `n/STEP` samples (`STEP = 4`,
`js/game/quali.js:38`) — deliberately "well under a frame even on a slow
phone" (`js/game/quali.js:36`–`37`). A programme target is one extra call to a
function that already runs once per weekend for 22 cars.

It also fixes the *career's* real problem, which is not money but **occasion**:
today a career weekend is `openRaceSettings("career")` → quali → race
(`js/game/career-ui.js:1247`). Practice is the step that makes the weekend feel
like a weekend, and — copying F1 25's link, which players say is the point —
the programme results should feed the strategy sheet by **default**, not as an
opt-in the player has to find (§1.6).

**Exact placement.**
- New `js/game/practice.js`, `Practice.create(G)`, global `Practice`, loaded
  after `js/game/quali.js` in `tools/manifest.cjs` (quali sits at
  `tools/manifest.cjs:148`) with a soft edge on it — it reads `Quali`'s
  exported statics, and needs the live instance for `lapTime`/`capFor`, so
  either take it as `Practice.create(G, quali)` or add a `G.qualiLap` getter.
  Prefer the second arg: `types/game-ctx.d.ts` is held to `const G` by
  `tools/check-gctx.mjs` and growing the 210-member façade for one consumer is
  the more expensive of the two.
- Reward through `Career.grant(n)` (`js/game/career.js:548`) and the existing
  reputation channel. Do **not** invent a second currency: the whole R&D economy
  is priced in credits against `Parts.CATALOG` (`docs/CAREER.md` §Economy), and
  `tools/career-economy.mjs` measures it. A new currency means re-measuring
  `RESEARCH_MULT` from scratch.
- Screen: a new `#practice` sheet in `index.html` using the shared `.res-row`
  vocabulary the quali sheet already uses (`js/game/quali.js:300`), registered
  in all three registries — `UiLayers` (`js/game/uilayers.js`),
  `ScrollFade.SCREENS`, `AriaState.ROOTS` — or it silently loses keyboard nav,
  scroll fades and screen-reader state (`docs/CAREER.md` §Career history).

**`flow`/`session` implications.** This adds a **fourth `session` value**, and
that is the sharp edge. `isTimeTrial()` and `isQuali()` are equality tests
(`js/game.js:698`–`699`), so every `session` consumer must be audited: the
`startRace()` branch chain (`js/game.js:2289`–`2302`) narrows `cars` to
`[player]` for both existing solo sessions and practice wants the same; the
`endRace()` branch chain (`js/game.js:2507` and `:2519`) returns early for quali and
TT and needs a third early return; `G.timeTrial` is a derived view
(`docs/CAREER.md`) and must not become true for practice. The **cheapest
correct** shape is to model practice as *quali's sibling*: it reuses
`isQuali()`'s entire path (solo car, lap validity, ghost) and differs only in
what `endRace()` does with the lap. Consider adding a single
`const isSolo = () => session !== "race"` predicate and routing the three
narrowing branches through it, which is a net line *reduction* in game.js.

**Test that pins it.** A new `tests/unit/practice-programmes.test.mjs` in the
node-only tooling suite, next to `tests/unit/career-settle.test.mjs` — the
scoring is pure arithmetic over a lap time and a cut count, so it needs no
browser. Add browser coverage of the sheet to `tests/specs/career.spec.js`
(group `test:career`). Assert against `__apex` hooks, never rendering
magnitudes (CLAUDE.md §Testing).

**Can quali.js be reused? Yes — and it is the reason this is an M and not an L.**
`lapTime(track, vCap, grip)` is pure over `(track, cap, grip)` and reads the
same `LAT_MAX`/`aTop()`/`BRAKE` the driving model does (`js/game/quali.js:96`–`99`),
so a "target lap for this car on this circuit in these conditions" is already
computable. One caution: `capFor()` (`js/game/quali.js:140`) multiplies in
`QUALI_TRIM = 0.75`, which is calibrated **specifically** so a simulated pole
sits at ~0.976 of a driven AI lap (`js/game/quali.js:56`–`62`). A race-pace
target must not reuse that constant blindly — it wants its own, measured the
same way, or it will set a qualifying-pace bar and call it race pace.

---

### P2 — Scenario events ("Challenge / Invitational"), on machinery we already have — **effort S–M**

**What.** A rotating list of one-race challenges: *you are P14 at Monaco in a
Haas with 8 laps left; finish P8 or better.* Each is a small data record and a
pass/fail check. F1 25's Season 6 examples are exactly this shape (§1.4).

**Why it fits.** It is the cheapest new *mode* available to us, because a
scenario is nothing but the settings we already have, applied without asking:
circuit (`trackIdx`), team, difficulty (`GameTables.DIFF`), lap count
(`raceLaps`), weather (`raceWeather`), time of day (`raceTimeOfDay`), a forced
grid order, and a target read off `c.finPos`. `gridUp(preOrder)`
(`js/game.js:1525`) already accepts an arbitrary order — `Quali.order()` is
just one producer of it. And `Career.hash(seed, ...parts)` (`js/game/career.js:137`)
is a stateless seeded draw, so a "this week's challenge" can be derived from
the date with no backend and no live service, which is the only kind of
seasonal content a static GitHub Pages build can have.

Retention hook: a per-scenario best result in `localStorage` under `apex26.`,
and a completion count. That is the offline half of a Podium Pass, and it is
the half that works without a store.

**Exact placement.**
- Data in a new `js/data/scenarios.js` (a data file, like `js/circuits/`),
  logic in a new `js/game/scenarios.js` (`Scenarios.create(G)`).
- Entry point on the title screen next to CAREER MODES; the screen itself is
  a list of `.res-row`s and reuses `js/game/menus.js`'s `teamSwatch()`
  (`js/game/menus.js:52`).
- The result check runs in `endRace()`'s classification path — but **not in
  game.js**: pass the order to `Scenarios.settle(order, player)` from the same
  place `Career.settleRound(order, player)` is called (`js/game.js:2551`),
  which is one line.

**`flow`/`session`.** A new `flow` value — `"scenario"` — and this is where the
two-axis model pays off. `isChampionship()` (`js/game.js:684`) stays false, so
no season points are awarded and no standings render; `session` stays `"race"`.
Critically, `setFlow()` (`js/game.js:697`) calls `Career.engage(v === "career")`,
so a scenario automatically gets career rules **off** — no career development,
no career garage — which is exactly right and costs nothing.

**Test.** `tests/specs/scenarios.spec.js`, added to `test:modes`. Pin: a
scenario grids the player at the stated position (via `__apex.carAt(i).gridPos`),
awards no championship points, and does not touch a loaded career save — the
same isolation assertion `tests/specs/career.spec.js` already makes in both
directions (`docs/CAREER.md` §"A loaded save is not an active career").

---

### P3 — Weekend structure: choose the qualifying format — **effort S**

**What.** Replace the binary `raceQuali` on/off (`js/game.js:715`) with a
format chip row on `#race-settings`: **SIMULATE · ONE-SHOT · SHORT · FULL**,
mapping onto F1 25's own list (§1.1).

**Why it fits.** It is nearly free, because `Quali.compute()` is already a pure
function that returns a sorted classification (`js/game/quali.js:208`–`239`)
and can simply be called more than once with a shrinking field:

- **SIMULATE** — today's `#q-sim`: one `compute()`, no driving.
- **ONE-SHOT** — today's `#q-drive`: one `compute()`, one driven lap.
- **SHORT** — two segments: `compute()` the full 22, cut to 10, drive one lap
  against the survivors. Two driven laps at most.
- **FULL** — three segments (22 → 15 → 10), three driven laps.

The player-facing difference between them is *how many flying laps you drive*,
which is exactly the axis a phone session cares about. And a knockout makes the
qualifying sheet mean something: today it is one table; with segments it is a
story where you can be eliminated.

**Exact placement.** Entirely inside `js/game/quali.js` (add
`simulateSegment(cut)` beside `simulate()`, keep `classification` as the final
merged table so `order()` at `:265` is untouched), plus the chip row in
`buildRaceSettings()` (`js/game.js:7319`–`7335`, the `rs-quali` block) — which is an
edit, not a growth, since the OFF/ON loop is already there.

**`flow`/`session`.** None. `session` stays `"quali"` through every segment;
`gridFromQuali()` (`js/game.js:691`) is unchanged. This is the strongest
argument for the proposal: a real feature that touches neither axis.

**Test.** Extend `tests/specs/quali.spec.js` (`test:career`): assert that a
FULL session eliminates the right number of cars per segment, that the final
`Quali.results()` still contains **all 22** rows (an eliminated car keeps its
Q1 time and its grid slot — dropping it would break `order()`'s
`out.length === live.length` guard at `js/game/quali.js:273`), and that a driven
lap in Q3 replaces only that driver's row.

---

### P4 — Race distance as a fraction of the real Grand Prix — **effort S**

**What.** Replace the fixed lap chips `[3, 5, 10, 25, 57]` (`js/game.js:7259`)
with **5 % · 25 % · 50 % · 100 %**, resolved per circuit from a real
`gpLaps` field on the circuit def.

**Why.** The current "57 (FULL)" is wrong on 39 of 40 circuits — Monaco is 78
laps, Spa 44, Monza 53. It is also the setting that decides how long a session
takes, which on a phone is *the* setting. A percentage is the unit F1 25 uses
and the unit players quote each other in ("50% race distance", "35%" — §1.6).

**Exact placement.** `gpLaps` in each `js/circuits/<id>.js` def (data, per
CLAUDE.md: circuit edits go in `js/circuits/`, engine changes in `js/track/`);
resolution helper in `js/game/tables.js` next to `DIFF` (`js/game/tables.js:23`)
— it is a pure constant-plus-arithmetic table, which is exactly what that file
is for. The chip builder in `buildRaceSettings()` is an edit.

**Physics gate.** None — a lap count is not a speed. But note that
`Reliability.arm()` writes `dnfAt` as a **fraction of race distance**
(`docs/CAREER.md` §"The draw touches no stream"), specifically so "a 3-lap blast
and a 25-lap race lose their cars at the same points of the story". That design
already anticipates variable distance and needs no change.

**Test.** `tests/unit/circuit-def-fields.test.mjs` already runs in
`test:tooling-fast` and is the natural home for "every circuit def declares
`gpLaps`, and it is between 40 and 80".

---

### P5 — Tyre compounds and a stint, without a pit lane — **effort M (phase 1) / L (phase 2)**

**What.** Split into two phases, because the second needs geometry we do not
have.

**Phase 1 — the stint.** A per-car `tyre = {compound, ageLaps, wear}` advanced
once per lap. Wear scales a **grip multiplier**; compound sets the wear rate and
a peak-grip offset. The player picks a compound on a pre-race sheet. No stops:
the race is a single stint and the choice is "fast now, slow later" versus the
opposite. This is a complete, shippable decision on its own.

**Phase 2 — the stop.** A stop is a **timed service**, not a pit lane. We have
no pit geometry (`grep pitlane js/track/` is empty), and building one for 40
circuits is a track-data project, not a weekend-shell project. Two candidate
implementations, in order of preference:

1. **Stop at the line.** Trigger PIT within a window before start/finish; the
   car is held stationary for `PIT_LOSS` seconds using the existing
   parking/writeback machinery `retireCar()` already uses — it "parks the car
   as far off the racing line as the circuit allows … using the same
   `Tracks.wallAt()` limit … and the same `worldFromTrack` writeback
   `rescuePlayer` and `coast` use. A stopped car is not a new kind of physics"
   (`docs/CAREER.md` §"What a retirement is"). That paragraph is the
   green light: the code to stop a car safely at the edge of the road exists
   and is already trusted.
2. **A modelled stop for AI, a real stop for the player.** AI cars take
   `c.penalty += PIT_LOSS`, which flows straight into the classification sort
   (`js/game.js:2524`, `(a.finishT + a.penalty) - (b.finishT + b.penalty)`).
   This is exact for classification and invisible on track, and it is how the
   existing penalty system already works.

**Physics gates — read carefully, this is where a proposal like this dies.**

- **Wear must be a grip multiplier, never a speed comparison.** `PACE` is a
  ground-speed scale; anything comparing a speed to a literal or to `VMAX` must
  go through `vTop()`/`vStd()`/`aStd()`, enforced by `tools/vstd-lint.mjs`
  (CLAUDE.md §Physics). A wear model that multiplies `LAT_MAX`/`PLAYER_GRIP` is
  in the clear; one that says "below 40 m/s the tyres recover" is not.
- **Wear must not be derived from track curvature.** "The arc must not reach
  the driver": nothing derived from `Tracks.curvature()` or the racing line may
  affect the player with assists off (CLAUDE.md §Physics; the channel table is
  in `docs/PHYSICS.md`). Derive wear from the car's **own** lateral force —
  the model already computes `Fyf`/`Fyr` from slip angles at
  `js/game.js:4097`–`4098`, and `slipFactor` from the friction ellipse
  (`docs/PHYSICS.md`). That is a legitimate source: it is what the tyre is
  actually doing, not what the road is shaped like.
- `js/game/quali.js:91` `lapTime()` takes `grip` as a parameter already, so a
  worn-tyre lap time is a call with a smaller `grip` — the modelled field
  degrades with the player for free.

**Exact placement.** New `js/game/strategy.js` (`Strategy.create(G)`) owning the
compound table, the wear integration and the pre-race sheet. The per-frame
grip read is one multiplication in the per-car update — that line must land in
game.js and must be paid for in the `module-size` ledger with the reasoning
above. Compound definitions belong beside the existing `tyres` catalog category
(`js/car/parts.js:211`) so a SIGNATURE compound and a strategy compound cannot
disagree; note that the catalog currently treats compound as a **permanent
upgrade** with `speed`/`cornering`/`accel` multipliers, so phase 1 has to decide
whether a garage compound becomes the *starting* compound or the axis is
separated. **Separate them**: the garage buys a construction, the weekend picks
a compound.

**`flow`/`session`.** None directly, but a strategy sheet is a new step between
qualifying and the race — the natural place is where `closeQualiToGrid()`
(`js/game.js:7455`) currently goes straight to `startRace()`.

**Test.** `tests/unit/tyre-wear.test.mjs` (node-only, pure model: wear rate ×
laps → grip curve, and the two-compound rule if adopted), plus
`tests/specs/physics-characterization.spec.js` — the master gate for anything
near game.js (CLAUDE.md §Physics) — must be re-run and its baselines
re-examined, because a grip multiplier on the player's car moves every
characterization number. **Unverified**: I have not run it; assume it will need
a deliberate baseline decision, not a tolerance widening (never widen a
tolerance to make a spec pass — CLAUDE.md §Testing).

---

### P6 — Difficulty as a continuous level, calibrated from your own qualifying gap — **effort S–M**

**What.** Replace `DIFF = {easy, normal, hard}` (`js/game/tables.js:23`) with a
0–100 level that interpolates `ai` and `band`, keeping the three names as
presets on the chip row. Then — the part that matters — **recommend a level
after every qualifying session**, from a number we already compute.

**Why it fits.** F1 25 players resort to third-party calculators for this: set
a Time Trial lap, look up your AI level (`https://simracingsetup.com/ea-sports-f1/f1-25-beginners-guide/`).
We can do it in-game for nothing, because `Quali.compute()` already produces
`r.gap` — the player's gap to modelled pole — in the same units, on the same
scale, on every circuit (`js/game/quali.js:237`). "You qualified P17, 2.4 s off
pole; drop the AI to 62?" is a one-line offer built from a value already sitting
in the classification.

This is the single best answer to the "AI are faster in quali than in the race"
complaint (§1.6) and to the far more common silent failure: a player who sets
`hard`, qualifies last every weekend, and quits.

**Exact placement.** The interpolation is pure data — `js/game/tables.js`, next
to `DIFF`, keeping `DIFF.easy/normal/hard` as named points so
`GameTables.DIFF[G.difficulty]` (`js/game/quali.js:141`) and the AI update
(`js/game.js:3407` `const dd = DIFF[difficulty]`) keep working through a lookup
that now accepts a number. The recommendation UI is a line on the qualifying
sheet — `js/game/quali.js:284` `build()`.

**Careful.** `difficulty` is persisted (`js/game.js:247`,
`store.get("difficulty", "normal")`) as a **string**. Changing its type needs
the store-migration discipline `docs/PHYSICS.md` spells out for assists:
"Lowering a default and migrating a stored value are DIFFERENT ACTS and both
are usually needed." Read a stored string as its numeric preset; write numbers
from then on.

**Test.** `tests/unit/career-settle.test.mjs`'s neighbourhood, or a new
node-only `tests/unit/difficulty-scale.test.mjs`: the three named presets must
map to exactly today's `{ai, band}` pairs, so an existing save's races are
bit-identical. That is the assertion that makes this safe.

---

### P7 — Assists and difficulty pay the career — **effort S**

**What.** A single earnings multiplier on `Career.settleRound()`'s payout,
derived from difficulty level and the assists actually in use (racing line,
driving help, gears, active-aero AUTO).

**Why it fits.** It is ~20 lines, it makes the difficulty slider a *choice*
rather than a masochism setting, and it gives a player a reason to turn one
assist off at a time — which is the progression F1 25's own beginner guides
describe ("start phasing assists: turn TC to Low, then try Manual ERS, then
switch off Racing Line").

**Exact placement.** `js/game/career.js`, inside `settleRound()` (from
`js/game/career.js:800`) — one multiplier applied to the prize/bonus total,
next to `wageBill()`. Read the assist state through `G`, not by reaching into
game.js.

**Economy gate.** `tools/career-economy.mjs` exists precisely because
`QUALI_TRIM` shipped as a reasoned guess and was 27 % wrong, and it measures
the season income against the catalog (`docs/CAREER.md` §"The economy,
measured"). **Re-run it after this**, and read the re-spec figure — "below ~1 is
a grind; above ~6 solves the car in year one". A multiplier that swings 0.6× to
1.5× moves the whole ladder.

**Test.** `tests/unit/career-settle.test.mjs` — it already runs in
`test:tooling-fast`, needs no browser, and is exactly the right shape: assert
the multiplier at the extremes and that full-assist play never earns *nothing*.

---

### P8 — Parc fermé — **effort S**

**What.** Once a championship weekend has held qualifying, the garage is closed
for that weekend.

**Why it fits.** It costs almost nothing and it converts the garage from a
free-form menu into a decision with a deadline — which is the whole point of
the R&D economy's fitted cap ("the cap is what keeps a career owning more than
it can fit at once, so every weekend stays a choice", `docs/CAREER.md`
§Economy). Right now that choice can be revised after you have seen the grid,
which drains it.

**Exact placement.** A `weekendLocked` flag set in `openQuali()`
(`js/game.js:7440`) and cleared in `startRace()`'s race branch; the gate itself
goes in `getTeamParts`/`saveTeamParts`, described in `docs/CAREER.md` as "the
two-line funnel every parts consumer already goes through". `$("cr-garage")`
(`js/game/career-ui.js:1231`) reads it and disables with a reason — never
silently. Follow F1 25 and leave a small set open (our equivalent of front wing
/ brake bias) if there is an obvious one; otherwise lock cleanly and say so.

**`flow`/`session`.** Gate on `isChampionship()`, not on `isCareer()` — a
standalone SEASON qualifies too (`docs/CAREER.md` §Qualifying: "A one-off Grand
Prix skips qualifying … SEASON gets qualifying as well as career"), and the rule
should follow the weekend, not the save.

**Test.** `tests/specs/career.spec.js`: after `openQuali()`, a parts write is
refused and the balance is unchanged; after the race, it is allowed again.

---

### P9 — A season calendar screen — **effort S**

**What.** One sheet listing the rounds: circuit, done/next/upcoming, your
finish and points per completed round, the sprint flag once P11 lands, and the
current objective on the next row.

**Why it fits.** `career.results` is already the row set the sponsor system
reads ("Progress is read off `career.results`, the rows the season already
records, so there is no second ledger to keep in step", `docs/CAREER.md`
§Sponsors), and `Tracks.SEASON` (`js/track/tracks.js:2685`) is the calendar. It
is pure DOM over data that exists. It is also what makes a *season* legible —
today the shell has standings but no forward view, so a career is a sequence of
surprises rather than a plan.

**Exact placement.** `js/game/career-ui.js` as a modal in the same shape as
`#career-history` — which already documents the pattern, including the reason
it is a card in the hub's left column and not a fourth button in `#cr-foot`
(four `.bigbtn`s need ~440 px against a ~370 px column at 844×390,
`docs/CAREER.md` §"Career history"). Register in `UiLayers`,
`ScrollFade.SCREENS` and `AriaState.ROOTS`.

**Test.** `tests/specs/career.spec.js` + a screenshot in
`tests/specs/ui-audit.spec.js` in both orientations, as the history screen has.

---

### P10 — Sprint weekends — **effort M**

**What.** A per-round `format` — `"standard" | "sprint"` — on ~6 of the 24
rounds, seeded per career so two careers do not share a calendar. A sprint round
runs: **modelled sprint shootout** (no driving) → **sprint race** at ~1/3
distance scoring 8-7-6-5-4-3-2-1 → the normal qualifying → the Grand Prix.

**Why it fits, and why it is M not S.** The sprint race itself is a race with a
different lap count and a different points table — which is `raceLaps` and a
second constant next to `Teams.POINTS`. The genuinely new part is that a
weekend now holds **two races**, and `endRace()`'s championship block
(`js/game.js:2531`–`2553`, `season.round++` at `:2541`) increments `season.round` unconditionally. A sprint
must award points **without** advancing the round, or the calendar desyncs and
`Career.settleRound()` settles the wrong objective — `docs/CAREER.md` is
explicit that `obj.round` exists because "`endRace()` advances the calendar
*before* calling `settleRound()`".

The right shape is a `weekendStage` on the career save: `"quali" | "sprint" |
"race"`, advanced by the results screen, with the round advancing only at the
end of the last stage. That also gives P3 and P1 a place to live, which is why
this is worth doing even though sprint itself is the least-requested item here.

**Exact placement.** Format table in `js/game/tables.js` (data); stage machine
in a new `js/game/weekend.js` (`Weekend.create(G)`) that owns the answer to
"what is the next screen after this session?" — a question currently split
between `els.resNext.onclick` (`js/game.js:7824`) and `$("cr-go").onclick`
(`js/game/career-ui.js:1232`). Consolidating it is the structural payoff.

**`flow`/`session`.** No new `session`: a sprint is `session === "race"` with a
different lap count and points table. `flow` stays `"career"`/`"season"`. The
two-axis model absorbs this cleanly, which is a good sign.

**Save migration.** `weekendStage` is a new field on a versioned save — add a
rung to `CAREER_V`'s migration ladder (`docs/CAREER.md` §"CAREER MODES is the one
door"), defaulting to `"quali"`, and remember `migrateCareer()` must stay
**pure** (the note at `docs/CAREER.md:95`).

**Test.** `tests/specs/career.spec.js`: a sprint round awards sprint points and
leaves `season.round` unchanged; the GP on the same round advances it exactly
once; a save written before `weekendStage` existed loads and races.

---

### P11 — A real track-limits ladder, and a stewards' line on the results sheet — **effort S**

**What.** Fix `js/game.js:3736`–`3747`. Today: `c.cuts++`, and `if (c.cuts >= 4)
c.penalty += 5` — so the 4th cut costs 5 s, the 5th another 5 s, the 6th another,
with no on-screen count past 3 (the `announce` is in the `else` branch). The
real rule is **three warnings, then a 5 s penalty, then the counter resets**.

**Why it fits.** It is a handful of lines, it makes the penalty legible instead
of a silent escalator, and it feeds a feature the career already depends on: the
`clean` objective is exactly `!ctx.player.cuts && !ctx.player.penalty`
(`js/game/career.js:785`), so a wrong ladder makes a career brief wrong too.

Pair it with a **stewards' line** on the results sheet — `buildResults()` already
prints `"  (+5s)"` inline (`js/game/results.js:36`); a small "TRACK LIMITS: 6
cuts, 2 × 5 s" line under the classification tells the player what happened.

**Exact placement.** The counter reset is in game.js (an edit, not growth); the
sheet line is in `js/game/results.js`.

**Test.** `tests/specs/career.spec.js` or a node-only test over the ladder
arithmetic: 3 cuts = 0 s, 4 cuts = 5 s, 7 cuts = 10 s.

---

### P12 — A weather forecast for the weekend, and one transition — **effort M–L**

**What.** Replace the single `raceWeather` choice (`js/game.js:845`) with a
2–3 sample forecast for the weekend, shown on the strategy sheet, with at most
**one** transition during a race (dry → wet or wet → dry).

**Why it is ranked here and not higher.** It is the feature that makes a
strategy sheet worth reading (it is why F1 25 puts the forecast on it, §1.3),
and it is the cheapest source of "no two weekends are the same". But
`gripMult()` (`js/game.js:605`) is read by the AI, by the player and by
`Quali.lapTime()`; making it time-varying touches the physics path and the
render path together (`initRainDrops()`, `Particles.rainShow()`,
`applyRaceSettings()`'s lighting and cloud-cover state at `js/game.js:860`–`866`).
On SwiftShader in CI, a rain transition mid-spec is also a new class of flake.

**Do it only after P5.** A weather change with no tyre compounds is a grip
change with no decision attached — all cost, no gameplay. With compounds it is
the best moment in a race.

**Test.** `tests/specs/physics-characterization.spec.js` must be re-run;
`tests/specs/quali.spec.js` must confirm a modelled field and a driven lap see
the *same* grip at the same moment, or qualifying stops being a fair comparison.

---

### P13 — Elimination / "survival" one-off mode — **effort S**

**What.** F1 25's Survival Challenge, single-player: every N seconds the car
running last is retired, until one remains. Sessions under five minutes.

**Why it fits.** `retireCar()` already exists and already removes a car from
`ranked` cleanly (`docs/CAREER.md` §"What a retirement is"); `ranked` is sorted
by progress every frame (`js/game/racecontrol.js:205` relies on it). An
elimination is a timer plus `retireCar(ranked[ranked.length - 1])`. It is the
best short-session mode available for the least code, and short sessions are
what a phone wants.

**Exact placement.** Fold into `js/game/scenarios.js` from P2 as a scenario
*kind*, rather than a separate mode — same `flow === "scenario"`, same screen,
same seeded rotation.

**Test.** `tests/specs/scenarios.spec.js`: the field shrinks on schedule, the
player's elimination ends the session, and no championship points move.

---

### P14 — `__apex` hooks for the new shell — **effort S, but do it with each of the above**

**What.** `__apex.practice()`, `__apex.weekend()`, `__apex.strategy()`,
`__apex.scenario(id)` — the same JSON-hook treatment `__apex.careerSim(n)` and
`__apex.qualiSim()` already get (`docs/CAREER.md` §Debug hooks).

**Why.** CLAUDE.md's "Seeing the game (cheapest first)" puts `__apex` JSON hooks
first for a reason: they are the only assertable, deterministic, cheap view. A
weekend-shell feature with no hook can only be tested through the DOM, which on
SwiftShader is the slow half of the suite.

**Careful.** `js/game/apex.js` is at its own ratchet
(`tests/unit/module-size.test.mjs:247`, `3106`), and
`tests/unit/hooks-documented.test.mjs` requires every hook to appear in
`docs/DEBUG-HOOKS.md`. Both are `test:tooling-fast`, so a missing doc line fails
in 20 s rather than in CI.

---

## 4. What NOT to build

- **A pit lane.** Forty circuits × pit entry, exit, boxes, speed-limit zone, AI
  routing, and a whole new class of collision. `js/track/` has no pit concept at
  all. The 20-second time loss is 95 % of the gameplay and can be modelled (P5
  phase 2). Build the *decision*, not the *geometry*.
- **A story mode.** Braking Point 3 is voice acting, cutscenes, lip-sync and a
  script. Our version of narrative is the career's own record — the season
  archive, the driver market, the winter moves — which `docs/CAREER.md` already
  treats as story and which costs nothing to render.
- **Reversed circuits.** EA needed retrained AI, redrawn DRS zones, new sector
  splits, a new grid and new pit boxes (§1.5). Ours would additionally need every
  circuit's scenery `frac` keys re-derived through `def._sceneryShift` (the
  7a173519 rotation, CLAUDE.md), and `+k = LEFT-hand turn` is a measured sign
  convention that shipped inverted for months. Very high risk, zero career value.
- **A live-service season.** No backend. A *seeded, date-derived, offline*
  rotation gets 80 % of the feel (P2); a store, a VIP tier and a currency get
  none of it and add a save-migration surface.
- **A second currency (resource points).** The credits economy is measured
  (`tools/career-economy.mjs`) and one constant sets its pace. A parallel
  currency doubles the tuning surface and invalidates the measurement.
- **Real-time practice sessions with a clock.** F1 25's FP1 is 30–60 minutes.
  Our race is 3–25 laps. A timed session on a phone is a session nobody
  finishes. Practice should be **N laps with a target**, not minutes.
- **Formation lap.** Ceremony, no decision, and `standingLoss()` already charges
  the modelled field the same launch cost the driven car pays — the start is
  already fair. See the gap table.
- **Red flags / race restarts.** A restart means re-gridding mid-session,
  re-arming reliability, and reconciling with `IncidentSim`'s index-owned car
  takeovers (`js/game.js:2273`–`2280` documents how badly that goes wrong when
  state leaks between sessions). `RaceControl`'s three levels with hard caps are
  the right ceiling for us.
- **Tyre temperature / pressure.** Wear is one number a player can reason about.
  Temperature windows on a touchscreen with no telemetry display is depth
  nobody will feel.
- **Flashbacks / rewind.** It needs a state history of 22 cars plus debris plus
  `IncidentSim` ownership. On a phone's memory budget, no.

---

## 5. Do these three first

1. **P3 — qualifying formats (S).** Highest value per line on the list. The
   model already computes a full classification as a pure function
   (`js/game/quali.js:208`); a knockout is calling it three times with a
   shrinking field. It touches neither `flow` nor `session`, needs no save
   migration, and turns the one screen every championship weekend already passes
   through into a session with tension. Ships alone.

2. **P1 — practice programmes (M).** The one thing that makes a career weekend a
   weekend, and `js/game/quali.js` was built for it without knowing:
   `lapTime()`/`capFor()` are exported, pure, phone-cheap and calibrated against
   real driven laps. Pays into the credits economy that already exists. Do the
   `isSolo()` consolidation as part of it so game.js gets *smaller* while a
   fourth `session` value lands — that is the direction the ratchet exists to
   push.

3. **P2 — scenario events (S–M).** The cheapest new mode we can build, and the
   only one that gives a reason to open the game on a day you do not want to
   start a season. `gridUp(preOrder)` already accepts a forced grid;
   `Career.hash()` already gives a backend-free seeded rotation; `setFlow()`
   already switches career rules off for free. Land P13's elimination kind
   inside it later rather than as a separate mode.

P4 (race distance as a percentage) is a fourth candidate and is genuinely small
— take it whenever a circuit-def pass is happening anyway. P5 (tyres) is the
biggest gameplay prize on the list and the one most likely to cost a
physics-characterization re-baseline; schedule it deliberately, not
opportunistically.

---

**Nothing in this document was verified by running the game or the test suite.**
Effort labels are estimates from reading the call sites named, not from
implementation. The physics-characterization impact of P5 and P12 in particular
is unmeasured.
