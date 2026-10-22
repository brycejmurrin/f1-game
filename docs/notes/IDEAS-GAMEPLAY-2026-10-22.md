# Gameplay, racing and modes ideas (2026-10-22)

Fleet A, slot A·I1. A brainstorm for Bryce to choose from. Nothing in this note is
built or filed yet. Presentation, HUD and menu-UX ideas belong to the sibling note
from A·I2 and are left out on purpose. Each idea below names the code it would touch,
so the orchestrator can file the ones Bryce picks.

**How it was grounded.** The ideas were checked against the deploy tip `72408e99`
(2026-10-22): module headers under `js/race/`, `js/career/` and `js/physics/`, the
open-issue backlog (204 open issues, read 2026-10-22), and the "already built"
list in [the 2026-10-04 feature roadmap](../plans/2026-10-04-feature-roadmap.md).
That roadmap's tier-2 rows, and anything already filed, appear here only as
"extends #N". There are 14 current-state screenshots at 844×390 landscape, from
`tools/ui/layout-audit.mjs --screen=<id> --viewport=ios-iphone-landscape-844` and
`apex_hud_shot` (monza, chase camera, tyre wear on). They live in the artifact
gallery linked in the PR body. `publish-evidence.mjs --publish` was refused with
HTTP 403 ("creating releases is not permitted for this session type"), and the
images are never committed.

**Scoring.** Score = impact (1–5) × confidence (1–5) ÷ effort (S = 1, M = 2, L = 3).
Impact means how much a phone player would feel the change. Confidence means how
sure we are that players want it and that the code supports it.

**Two contracts apply to every idea.** First, *the arc must not reach the driver*:
with assists off, nothing derived from track curvature or the racing line may affect
the player (columns in [PHYSICS.md](../PHYSICS.md)). Second, *PACE is a ground-speed
scale*: compare speeds through `vTop()`/`vStd()`/`aStd()`. Every idea is rated
against both.

## What exists today (do not re-propose)

The game already has a lot of the modes and systems people ask for:

- **Modes:** RACE, SEASON (calendar presets, sprint, quali on/off), TIME TRIAL with
  ghosts and medals, DAILY TIME TRIAL (`DailyChallenge.plan()`: UTC seed, streak,
  share line), CAREER (driver and MY TEAM, three slots, reputation, contract offers
  with a "promise"), DUEL (`Duel.pick()`, including the legends Senna, Schumacher,
  Fangio and Clark through `Duel.asLegend`), PRACTICE with 15+ unscored drills
  (`DrivingCoach` `GOALS`: braking, trail, slipstream, overtake, defend, launch…)
  and rewind/checkpoints, RACE A FRIEND (WebRTC, 2–4 players), Data Hub RACE IT
  (`RealRace.launch`: jump in at any lap of a real GP), and TRACK DESIGNER.
- **2026 rules:** `OvertakeMode` (1 s at the Detection Line, +0.5 MJ for the next
  lap, B7.2.3(c)), `AeroZones` (FIA-style fixed activation zones, X/corner mode),
  and BOOST with drain and regen (`PhysicsConsts.DRAIN_*`/`REGEN_*`, `ES_MJ: 4`).
  `deployTaper()` is in `js/game.js`.
- **Weekend:** `TyreModel` with compounds and wear, `PitLane` (windows, undercut
  forecast), `Forecast`, `WeatherArc`, storm, `RaceControl` (SC/VSC/red flag),
  `SportingRegs` (penalty ladder), `Reliability`, the `Damage` readout, and grid
  rules `tier/quali/rev10/revchamp/random` (`GRID_RULES`, `js/game.js:903`).
- **Feedback:** `Engineer`, `Spotter`, radio lines (including LIFT AND COAST),
  `RaceInsights`, and badges (`Badges.DEFS`: only six — first_win, podium, pole,
  fastest_lap, clean_race, daily_streak).
- **Filed already:** sector energy plan #1580, ERS forecast #1629, handling damage
  #1578, brake fade #1577, AI personality #1563/#1566, catch-up band #1565, cooldown
  lap and parc fermé #1584, ghost-leaderboard determinism #1589, and share cards
  #1543.

Current-state shots (artifact gallery): title, race settings, duel picker, career
hub, career offers, qualifying sheet, results, season results, season setup, the
PRACTICE and PIT STRATEGY settings, standings, the in-race HUD in touch layout, and
a chase camera at Monza.

## The ideas

Effort: S ≈ one file plus a spec, M ≈ 2–4 files, L ≈ a subsystem.

### A. Modes and replayability

**1. Legends Gauntlet: a ladder of duels against the legends.**
*Pitch:* beat Clark, then Fangio, then Senna, then Schumacher in duels, each on a
circuit from their era, unlocking the next as you go.
*Why players want it:* an escalating single-player ladder with named opponents is
the hook of GT7's licence/mission structure, where reviewers describe "always
wanting to do better" ([GameSpot GT7 review](https://gamespot.com/reviews/gran-turismo-7-review-round-we-go-again/1900-6417837/),
[Stuff GT7 review](https://www.stuff.tv/review/gran-turismo-7-review)).
*Today:* `Duel.asLegend`, `Duel.LEGEND_BUMP` and `Duel.LEGEND_CAR`
(`js/race/duel.js`) already field the legends one at a time (screenshot: duel
picker). There is no order, progress or reward.
*Change:* an `apex26.gauntlet` progress record, a fixed list of (legend, circuit,
laps), a GAUNTLET row on the duel picker that marks the next rung, and a badge per
rung (`Badges.DEFS`).
*Files:* `js/race/duel.js`, `js/career/badges.js`, `js/ui/select-screen.js` (picker
row), `index.html` (the row's DOM).
*Effort:* S. *Risk:* none. AI rating bumps already exist and are AI-only.
*Phone fit:* one tap per rung, races of 3–5 laps.
*Score:* 4 × 5 ÷ 1 = **20**.

**2. Elimination race: last place out every lap.**
*Pitch:* at each S/F crossing the last-placed car retires, until one car is left.
*Why:* Motorsport Manager's invitational elimination races were called "more
involving from a strategy perspective than the main racing"
([RaceFans MM Mobile 3 review](https://racefans.net/2018/08/05/motorsport-manager-mobile-3-f1-game-reviewed/)).
Trackmania's Cup of the Day is a knockout and is its best-liked mode
([HighGround: Trackmania modes ranked](https://www.highgroundgaming.com/all-trackmania-game-modes-ranked/),
[Trackmania (Wikipedia)](https://en.wikipedia.org/wiki/Trackmania_(2020_video_game))).
*Today:* `RaceControl.classify` and `RaceControl.finishOrder` exist, and
`Reliability` already retires cars mid-race, so a retirement path already exists.
*Change:* an `elim` race rule. At each lap line, call the existing retirement path
on the last running car. The results sheet lists elimination laps.
*Files:* `js/race/race-control.js`, `js/race/race-settings.js` (rule row),
`js/ui/results-sheet.js`.
*Effort:* S. *Risk:* low. It is a sporting rule, not physics.
*Phone fit:* the field shrinks to a short, tense race on a small screen.
*Score:* 4 × 4 ÷ 1 = **16**.

**3. Overtake Attack: start last and score clean passes.**
*Pitch:* a race from P22 where each clean pass scores points, the 2026 Overtake
allowance is worth a multiplier, and contact or a track-limits strike costs points.
*Why:* it turns the 2026 attack tools (Overtake Mode, Boost, active aero) into the
whole game, the way GT7 missions do with "varied tasks"
([CarAdvice GT7 review](https://www.caradvice.com.au/caradvice/gran-turismo-7-game-review/)).
*Today:* the `rev10`/`random` grid rules, `OvertakeMode.spend`, the `SportingRegs`
penalty ladder, `RaceInsights` (ordered race explanations) and the `overtake`
practice drill.
*Change:* a score counter fed by position-gain events, filtered by the
`SportingRegs` strike ledger and `Damage` hits, and a medal table
(`QualiModel.MEDALS` shape).
*Files:* `js/race/race-insights.js`, `js/race/sporting-regs.js`,
`js/ui/results-sheet.js`, `js/race/race-settings.js`.
*Effort:* S. *Risk:* none.
*Score:* 4 × 4 ÷ 1 = **16**.

**4. Daily variety: rotate the daily challenge's objective.**
*Pitch:* the daily stays one shared plan per UTC day, but some days are an
elimination, an Overtake Attack, a wet lap, or a practice drill with medals, not
always a time trial.
*Why:* Trackmania's daily Track of the Day and Cup of the Day keep players returning
on a fixed rhythm ([racinggames.gg on COTD](https://racinggames.gg/news/trackmania-update-patch-notes-matchmaking-cup-of-the-day-online-maps-routes-cars/)).
The streak badge already exists.
*Today:* `DailyChallenge.plan(day)` derives circuit, weather, time of day and seed
from the date alone (`js/race/daily-challenge.js`).
*Change:* add an `objective` field to the plan (a seeded weighted pick), branch the
result and share line on it, and keep a per-objective best.
*Files:* `js/race/daily-challenge.js`, the results/share code.
*Effort:* S, once ideas 2/3 exist. *Risk:* the plan must stay deterministic from
the date (its unit test pins this).
*Score:* 4 × 4 ÷ 1 = **16**.

**5. Timed races ("10 minutes + 1 lap").**
*Pitch:* set a race by minutes, not laps, so a session fits a phone break whatever
the circuit.
*Why:* mobile sessions are short. Motorsport Manager's mobile races were criticised
as "quite long" ([RaceFans](https://racefans.net/2018/08/05/motorsport-manager-mobile-3-f1-game-reviewed/)).
*Today:* only a lap ladder exists (`js/race/race-settings.js` "lap ladder").
Monaco and Monza laps differ by about 30 s.
*Change:* a LENGTH row (laps or minutes). The leader's lap after the clock expires
is the last lap. Tyre wear and pit windows read the estimated lap count
(`PitLane.inWindow`).
*Files:* `js/race/race-settings.js`, `js/race/race-control.js` (finish rule),
`js/race/pit-lane.js`.
*Effort:* S. *Risk:* low.
*Score:* 3 × 5 ÷ 1 = **15**.

**6. Racing Academy: medal tiers on the drills you already have.**
*Pitch:* turn PRACTICE's 15 drills into graded "licences" (Rookie → Super Licence),
each 30–60 s with bronze, silver and gold targets, unlocking liveries or garage
parts.
*Why:* GT7's licence tests are praised as tutorials that teach "kerbs… a tricky
hairpin" and are replayable by "chasing gold" ([GameSpot](https://gamespot.com/reviews/gran-turismo-7-review-round-we-go-again/1900-6417837/),
[Sportskeeda: GT7 licence rewards](https://www.sportskeeda.com/esports/every-license-test-reward-gran-turismo-7)).
*Today:* `DrivingCoach` `GOALS` (free, sector, corner, lap, cooling, braking,
trail, slalom, launch, start, slipstream, overtake, defend…) are explicitly
unscored. Checkpoints and rewind are gated on unscored sessions
(`js/game.js:867`).
*Change:* a separate ACADEMY entry that runs a drill *without* rewind (scored),
measures the drill's own metric (brake point error, exit speed, energy left), and
awards a medal from a per-drill table. This must not mutate PRACTICE's unscored
contract.
*Files:* `js/race/driving-coach.js` (metrics), a new Academy module under js/race (name TBD)
(manifest entry), `js/career/badges.js`, the title menu.
*Effort:* M. *Risk:* keep the unscored/scored split explicit (`js/game.js:867`).
Drills that grade the line must score against the player's own previous attempt,
not the racing line, unless an assist is on.
*Phone fit:* the best phone-length content there is.
*Score:* 5 × 5 ÷ 2 = **12.5**.

**7. Pass-and-play party mode.**
*Pitch:* 2–6 people share one phone. Each takes a timed lap or a short race in
turn, and the game keeps the table.
*Why:* friend racing needs 2–4 devices (RACE A FRIEND). Hot-seat needs one, and
"no need to be online at the same time" is the appeal of async play
([Musclecar Online](https://samredfern.itch.io/musclecar-online)).
*Today:* time trial ghosts (`js/car/ghost.js`) and per-setup leaderboards
(`js/ui/results-sheet.js`).
*Change:* a player-name roster, rotate the driver between runs (each player's run
becomes the next one's ghost), and a party results table.
*Files:* `js/race/session-records.js`, `js/ui/results-sheet.js`, the title flow.
*Effort:* S. *Risk:* none.
*Score:* 3 × 4 ÷ 1 = **12**.

**8. Make History: objectives on real races.**
*Pitch:* "Hamilton, Silverstone, 10 laps to go, P4, win it." Pick a real race
moment, take the seat, and meet the objective for a medal.
*Why:* F1 games' scenario modes and GT7 missions both build on short, authored
goals ([CarAdvice](https://www.caradvice.com.au/caradvice/gran-turismo-7-game-review/)).
*Today:* `RealRace.launch` with `realLapFor`, `situation` and `planFor` (Data Hub
RACE IT → JUMP IN at any lap in a real driver's seat).
*Change:* a curated list of (race, lap, driver, objective), evaluated at the flag,
using medals and badges. The objective types are: finish ≥ P, gain N, beat a
driver, top 3 on tyres older than X.
*Files:* `js/race/real-race.js`, `js/data/real-race-tab.js`, a scenario table,
`js/ui/results-sheet.js`.
*Effort:* M. Real data is fetched live from OpenF1, so the scenarios need a cached
script or a fallback when offline. *Risk:* low.
*Score:* 4 × 4 ÷ 2 = **8**.

**9. Friend challenge link: an async race against a ghost car.**
*Pitch:* share a link that holds a race seed, the conditions and your ghost car.
Your friend races the same AI field with your ghost in it.
*Why:* this extends the existing ghost links into a race rather than a lap. Async
ghost racing removes the need to schedule a game
([Musclecar Online](https://samredfern.itch.io/musclecar-online)).
*Today:* `js/car/ghost-share.js` (COPY LINK / COPY CODE of a time-trial lap) and
`js/car/input-ghost.js`.
*Change:* record the player's full race as a ghost, add the seed and settings to the
share envelope, and replay it in a race as a non-colliding ghost.
*Files:* `js/car/ghost-share.js`, `js/car/input-ghost.js`, `js/ui/share-code.js`.
*Effort:* M. *Risk:* AI determinism across browsers is unmeasured (#1589). The
ghost replays recorded positions, so only the AI field may diverge, which is
acceptable for friends.
*Score:* 4 × 3 ÷ 2 = **6**.

**10. Weekly Cup: a seven-day ladder.**
*Pitch:* one circuit a week. Monday to Saturday seed a time, Sunday is a knockout
against ghosts of the week's best friend laps.
*Why:* Cup of the Day's seeding plus knockout structure
([Wikipedia](https://en.wikipedia.org/wiki/Trackmania_(2020_video_game))).
*Today:* `DailyChallenge` streaks and ghost links.
*Change:* a week-keyed plan beside `plan(day)`. The knockout runs against imported
ghosts.
*Effort:* M. *Risk:* a global board needs #1589. Friends-only works without it.
*Score:* 3 × 3 ÷ 2 = **4.5**.

### B. The 2026 rules (racing feel)

**11. Asymmetric Overtake taper: the chaser keeps power longer.**
*Pitch:* in Overtake Mode, the chasing car's electric deploy holds to a higher speed
than the leader's. This is the actual 2026 mechanic that makes the pass happen.
*Why:* the leader's deployment tapers from 290 km/h, while the Overtake car keeps
the full 350 kW to 337 km/h ([The Race: key 2026 terms](https://www.the-race.com/formula-1/boost-overtake-mode-active-aero-recharge-key-2026-terms-explained),
[PlanetF1 explainer](https://www.planetf1.com/news/explained-how-f1-new-overtaking-mode-will-work)).
*Today:* `deployTaper(c)` (`js/game.js:540`) applies one `TAPER_LO/HI` vStd band to
every car. `OvertakeMode.spend` gives push time, not a taper shift.
*Change:* while `OvertakeMode` is live for car `c`, shift its taper band up by a
`PhysicsConsts` delta (vStd-normalised, ratio ≈ 337/290). The same rule applies to
AI.
*Files:* `js/physics/consts.js`, `js/game.js` (`deployTaper`),
`js/race/overtake-mode.js`.
*Effort:* S. *Risk:* physics-characterization gate (`tests/specs/physics-characterization.spec.js`).
It is gap-driven, not curvature-driven, so the arc contract holds. Use `vStd()`.
*Score:* 3 × 4 ÷ 1 = **12**.

**12. Lift-and-coast targets from the engineer.**
*Pitch:* the engineer asks "harvest 0.3 MJ this lap". Lifting before braking zones
earns it, and hitting the target pays off as a fuller battery for the attack lap.
*Why:* lift-and-coast is the one recharge method the driver controls by hand in 2026
([The Race](https://www.the-race.com/formula-1/boost-overtake-mode-active-aero-recharge-key-2026-terms-explained)).
It is a skill expression that touch controls can do (release the throttle).
*Today:* coasting already regenerates (`js/game.js:5469`) and X-mode sheds coast
drag. `radio-lines.js` has LIFT AND COAST lines, but there is no target and no
scoring.
*Change:* an `Engineer` target message with a measurable per-lap harvest delta, a
small HUD tick (the visual design belongs to A·I2), and a `RaceInsights` line after
the race.
*Files:* `js/race/engineer.js`, `js/race/radio-lines.js`, `js/race/race-insights.js`.
*Effort:* S. *Risk:* none. It reads energy and never writes physics.
*Score:* 3 × 4 ÷ 1 = **12**.

**13. Wet "partial aero" mode by race control.**
*Pitch:* in the wet, race control allows only partial aero: front wing in straight
mode, rear in corner mode.
*Why:* a published 2026 rule ([The Race](https://www.the-race.com/formula-1/boost-overtake-mode-active-aero-recharge-key-2026-terms-explained)).
It gives rain races a different rhythm.
*Today:* `AeroZones` has no weather input. `RaceControl` already owns cautions.
*Change:* a race-control flag at a wetness threshold (from `WeatherArc`) that caps
`c.aeroX` at a partial value, with a radio call.
*Files:* `js/physics/aero-zones.js`, `js/race/race-control.js`, the
`aeroDfMult(c)` path.
*Effort:* S. *Risk:* `c.aeroX` is read through `aeroDfMult`. The flag is surface and
weather driven, not curvature driven.
*Score:* 2 × 4 ÷ 1 = **8**.

**14. 2026 energy "truth pass": a per-lap recharge cap and superclip.**
*Pitch:* model the per-lap harvest cap and end-of-straight superclipping, so energy
is a per-lap budget, as in the real 2026 cars.
*Why:* the real rules cap recharge per lap (8.5 MJ originally, cut to 7 MJ, with
superclip peak raised to 350 kW, from Miami 2026) ([FIA refinements](https://api.fia.com/news/refinements-2026-fia-formula-1-regulations-agreed-all-stakeholders),
[formula1.com PU explainer](https://www.formula1.com/en/latest/article/2026-regulations-explained-all-you-necessitate-to-know-about-f1s-new-power-units.14jfv7a36905uDJDdNyfQd)).
*Today:* `c.energy` 0..1 over `ES_MJ: 4`, with speed-based regen (`REGEN_*`) and no
lap cap.
*Change:* a per-lap harvested-MJ counter that resets at the line and saturates regen
at the cap, plus a superclip phase at full throttle near the speed ceiling.
*Effort:* L. It retunes AI ERS too (`AiDrive`). *Risk:* high. This is a balance
change under the physics-characterization gate. Plan it next to #1580/#1629/#1676.
*Score:* 3 × 3 ÷ 3 = **3**.

### C. Race weekend and strategy

**15. Knockout qualifying, phone-sized.**
*Pitch:* Q1 (22 → 16), Q2 (16 → 10), Q3 (top 10). Each part is one push lap plus an
optional second run, and the AI times improve with track evolution between parts.
*Why:* this is the real 2026 format with 22 cars, Q1 18 min with 6 out, Q2 15 min
with 6 out, Q3 12 min ([RacingNews365](https://racingnews365.com/new-f1-qualifying-rules-for-2026-explained),
[GPFans](https://www.gpfans.com/us/f1-news/1072506/fia-f1-qualifying-change-2026-cadillac)).
F1 fans expect the drama of the drop zone. Today's one-lap quali has no "am I
through?" moment.
*Today:* `QualiModel` runs one flying lap with `QUALI_TRIM` and `EXEC_SPREAD`. The
qualifying sheet offers DRIVE MY LAP and SIMULATE (screenshot: quali).
*Change:* a session loop of three parts, each "drive or simulate". The drop-zone
cut-off is computed from `QualiModel` times plus an evolution term per part. The
sheet marks eliminated cars. Season and career keep a "one lap" option.
*Files:* `js/race/quali-model.js`, `js/ui/quali-sheet.js`,
`js/race/session-entry.js`, `js/career/season-cal.js`.
*Effort:* M. *Risk:* low. It runs on the quali model, not physics.
*Phone fit:* three short laps, each ending on a decision.
*Score:* 5 × 4 ÷ 2 = **10**.

**16. Pit-wall calls: timed strategy decisions.**
*Pitch:* when the safety car comes out, or rain starts, the engineer asks "BOX
NOW?" with two buttons and a 5-second timer. Silence means stay out.
*Why:* Motorsport Manager mobile is praised for frequent decisions "without ever
inducing paralysis" ([Stuff MM Mobile 3](https://www.stuff.tv/review/motorsport-manager-mobile-3-review)).
*Today:* `PitLane` windows and the undercut forecast, `Forecast.confidenceFor`,
`RaceControl` SC, the `Engineer` voice, and NEXT TYRES AUTO in settings
(screenshot: PIT STRATEGY).
*Change:* an `Engineer` decision prompt fired on SC deploy, VSC or a forecast
crossing, pre-filling the next-tyre choice and the pit entry. The drive-in still
has to happen, or the call auto-boxes when the assist is on.
*Files:* `js/race/engineer.js`, `js/race/pit-lane.js`, `js/race/forecast.js`,
`js/ui/hud-strategy.js` (A·I2 owns the look).
*Effort:* M. *Risk:* none.
*Score:* 4 × 4 ÷ 2 = **8**.

**17. Optional pit-stop mini-game.**
*Pitch:* in the box, tap at the right moment to release, or for the wheel guns. A
fast stop gains time, and a fumble costs it.
*Why:* this is a long-running wishlist request on the EA forums ("steer into the
box and press buttons to complete the stop") ([EA forums: F1 22 features](https://forums.ea.com/discussions/f1-games-franchise-discussion-en/new-features-and-fixes-in-f1-22/8447682)).
It is roadmap tier 2 and unfiled.
*Today:* `PitLane` stop time, the garage crew (`js/garage/crew-service.js`).
*Change:* a timing-window tap during the stationary phase that scales the stop time
within a fixed ±0.8 s band. Off by default.
*Files:* `js/race/pit-lane.js`, a small input path.
*Effort:* M. *Risk:* netplay must disable it or sync it.
*Score:* 3 × 4 ÷ 2 = **6**.

**18. Strategy-length races: wear scaled so a short race has a stop.**
*Pitch:* a "strategy" wear preset that compresses a real race's tyre life into the
chosen laps, so a 5- or 8-lap phone race still has a pit decision.
*Why:* this is the core loop of strategy games ([RaceFans](https://racefans.net/2018/08/05/motorsport-manager-mobile-3-f1-game-reviewed/)).
Without a stop, a short race has no strategy at all.
*Today:* the TYRE WEAR setting (`G.raceTyreWear`, `js/race/race-settings.js:248`)
and `PitLane` windows. Whether wear already scales with laps is unverified; check
`TyreModel` first.
*Change:* a wear multiplier derived from (real distance ÷ chosen distance), clamped.
*Files:* `js/physics/tyre-model.js`, `js/race/race-settings.js`.
*Effort:* M. *Risk:* grip changes reach the player, so the AI tyre strategy must
re-plan under the same scale.
*Score:* 4 × 3 ÷ 2 = **6**.

### D. Racecraft, AI rivals and career

**19. Rivals and nemesis.**
*Pitch:* the game tracks your head-to-head record against each AI driver. The one
you beat or crash with most becomes your nemesis: they defend harder against you,
the radio names them, and beating them earns a badge.
*Why:* "relationship developing based on your head-to-head results" is a recurring
F1 game wishlist item ([RaceDepartment F1 2014 wishlist](https://www.racedepartment.com/threads/f1-2014-ideas-and-wish-list.81845/page-7),
[Frontier F1 Manager suggestions](https://forums.frontier.co.uk/threads/f1-manager-2023-suggestions.610075)).
*Today:* nothing persistent. The AI ratings have `aggression`/`optimism` style axes
(`js/data/driver-ratings.js`), and `Badges` exists.
*Change:* a head-to-head store in the career save. Apply a small aggression bump to
the nemesis's style axis *only when racing the player* (AI-only column), plus radio
lines and a badge.
*Files:* `js/career/career.js`, `js/physics/ai-drive.js`, `js/race/radio-lines.js`,
`js/career/badges.js`.
*Effort:* M. *Risk:* AI-only, so the contract is safe. Coordinate with #1563.
*Score:* 4 × 4 ÷ 2 = **8**.

**20. Practice programmes that pay R&D.**
*Pitch:* in a career weekend, short practice programmes (tyre-wear run, quali
sim, braking test) award R&D points or setup knowledge.
*Why:* this is a staple of F1 games' career modes. The roadmap register lists
"career practice/sponsor depth" as open (#1576).
*Today:* the drills (`DrivingCoach` `GOALS`), career R&D economy
(`js/career/career-planning.js`), and `setup-trials.js`.
*Change:* a career practice step that runs 1–2 drills and converts the score to R&D.
It shares the scoring with idea 6.
*Files:* `js/career/career.js`, `js/career/career-planning.js`, `js/race/driving-coach.js`.
*Effort:* M. *Score:* 4 × 4 ÷ 2 = **8**.

**21. Mid-season regulation refinements.**
*Pitch:* partway through a career season, "the FIA" changes the rules (energy cap,
boost cap, tyre allocation), and teams react, as in the real 2026 Miami package.
*Why:* in 2026 the energy rules really did change after Round 4
([FIA refinements](https://api.fia.com/news/refinements-2026-fia-formula-1-regulations-agreed-all-stakeholders),
[The Race: mid-season changes](https://www.the-race.com/formula-1/f1-2026-mid-season-rule-changes.md)).
*Today:* `js/career/regulations.js` already has rolling regulation *eras* between
seasons, and `js/career/ai-dev.js` covers AI development over winters.
*Change:* an in-season event table (one or two per season) that adjusts era
coefficients mid-season, with a news card in the career hub.
*Files:* `js/career/regulations.js`, `js/career/career.js`, `js/career/ai-dev.js`.
*Effort:* S. *Risk:* none to the physics contract. Keep it inside career
coefficients. *Score:* 3 × 4 ÷ 1 = **12**.

**22. Teammate battle and team orders.**
*Pitch:* a visible teammate head-to-head (quali and race), the occasional "let him
through / hold position" call, and contract leverage from beating your teammate.
*Why:* it gives the driver career its own stakes. Reviews call F1 25's driver
career "largely untouched" next to My Team ([Sports Gamers Online](https://www.sportsgamersonline.com/games/f1-25-review-a-familiar-race-strategy/amp/)).
*Today:* `ai-drive.js` already scales hold time by "team orders" (line 116), and
career knows the teammate.
*Change:* a teammate-delta tracker in the career save. Order prompts go through
`Engineer`, obeying or ignoring them affects reputation, and the offers screen
reads the delta.
*Files:* `js/career/career.js`, `js/race/engineer.js`, `js/physics/ai-drive.js`.
*Effort:* M. *Score:* 4 × 3 ÷ 2 = **6**.

**23. Adaptive assists that fade (opt-in).**
*Pitch:* with GROW ME on, assists step down one notch after N clean laps, and the
game tells you.
*Why:* GT7 is praised for an assist suite that lets players "adjust help as they
gain confidence" ([CarAdvice](https://www.caradvice.com.au/caradvice/gran-turismo-7-game-review/)).
*Today:* assists such as the driving line and GRIP STEER live in `js/input/` and
the driving settings.
*Change:* a consistency tracker (from `RaceInsights`) that proposes, rather than
silently applies, a lower assist level between sessions.
*Effort:* M. *Risk:* assists are an assist-gated column, so the contract is fine.
Never change an assist mid-lap. *Score:* 3 × 3 ÷ 2 = **4.5**.

**24. Driving reputation feeds AI respect.**
*Pitch:* a career "racecraft rating" from clean passes against contact. A clean
driver gets more room from the AI, and a dirty one gets squeezed.
*Why:* clean racing is a top online complaint (roadmap row "Fair-play online").
*Today:* the `SportingRegs` ledger, `Damage` hits, and `AiDrive` awareness.
*Change:* a rating in the career save that sets an AI-only spacing bias toward the
player. *Effort:* L (AI tuning). *Risk:* AI-only.
*Score:* 3 × 2 ÷ 3 = **2**.

**25. Low-power start detection and the formation-lap energy reset.**
*Pitch:* model the 2026 race-start rule: a car with abnormally low launch
acceleration gets automatic MGU-K help and flashing rear lights, and the energy
counter resets at the start of the formation lap.
*Why:* this is part of the same FIA refinement package
([FIA](https://api.fia.com/news/refinements-2026-fia-formula-1-regulations-agreed-all-stakeholders)).
It is cheap authenticity that fits the existing `FlyingStart` and `StartLights`.
*Files:* `js/race/start-lights.js`, `js/race/flying-start.js`, `js/car/car-mesh.js`
(the ERS light code already exists: `CarMesh.ersLightCode`).
*Effort:* S. *Risk:* it touches the launch, so run the start specs.
*Score:* 2 × 4 ÷ 1 = **8**.

**Not proposed, with the reason:**

- **Reverse grid:** already shipped as the `rev10`/`revchamp` grid rules.
- **Rewind in races:** deliberately limited to unscored sessions (`js/game.js:867`).
- **Spectate a friend, fair-play online, and a global leaderboard:** roadmap tier
  2/3, filed or planned (#1588, #1589).
- **Visible AI mistakes:** #1563.
- **Damage that affects handling:** #1578.

## Top 10

The ranking is by score. Ties go to higher impact, then to phone fit. One
judgement call: knockout qualifying (15, score 10) and pit-wall calls (16, score 8)
take the last two places over pass-and-play (7) and mid-season regulations (21),
both at 12, because they score 4–5 on impact against 3 and change every race
weekend.

| # | Idea | I | C | E | Score | Main files |
|---|---|---|---|---|---|---|
| 1 | Legends Gauntlet (idea 1) | 4 | 5 | S | 20 | `js/race/duel.js`, `js/career/badges.js` |
| 2 | Elimination race (2) | 4 | 4 | S | 16 | `js/race/race-control.js`, `race-settings.js` |
| 3 | Overtake Attack (3) | 4 | 4 | S | 16 | `js/race/race-insights.js`, `sporting-regs.js` |
| 4 | Daily variety (4) | 4 | 4 | S | 16 | `js/race/daily-challenge.js` |
| 5 | Timed races (5) | 3 | 5 | S | 15 | `js/race/race-settings.js`, `race-control.js` |
| 6 | Racing Academy medals (6) | 5 | 5 | M | 12.5 | new Academy module, `driving-coach.js` |
| 7 | Asymmetric Overtake taper (11) | 3 | 4 | S | 12 | `js/game.js` `deployTaper`, `consts.js` |
| 8 | Lift-and-coast targets (12) | 3 | 4 | S | 12 | `js/race/engineer.js`, `race-insights.js` |
| 9 | Knockout qualifying (15) | 5 | 4 | M | 10 | `js/race/quali-model.js`, `js/ui/quali-sheet.js` |
| 10 | Pit-wall calls (16) | 4 | 4 | M | 8 | `js/race/engineer.js`, `pit-lane.js` |

Next in line, all at score 8 or 12: Rivals and nemesis (19), mid-season
regulations (21), Make History (8), pass-and-play (7) and practice programmes (20).

## Ready-to-file issue drafts (top 10)

Do not file these from this note. The orchestrator files the ones Bryce picks.
Each needs the usual labels (`ready`, `area:race`, `area:career` or
`area:physics`).

### 1. Legends Gauntlet: a progressive duel ladder against the legends
**Body.** `Duel.asLegend` already fields Clark, Fangio, Senna and Schumacher in DUEL,
but there is no order or progress. Add a GAUNTLET: a fixed ordered list of (legend,
circuit, laps). Beating a rung unlocks the next and awards a badge. The progress
record is `apex26.gauntlet`. Source note: `docs/notes/IDEAS-GAMEPLAY-2026-10-22.md` §1.
**Acceptance.**
- [ ] The duel picker shows a GAUNTLET row with the next rung and progress (n/4+),
      fitting 844×390 touch.
- [ ] Winning a rung's duel persists progress across reloads. Losing does not.
- [ ] Each rung has a badge in `Badges.DEFS`. A unit test covers the ladder state
      machine.
- [ ] No physics or AI rating change beyond the existing `LEGEND_BUMP`.

### 2. Elimination race rule: last running car retires at each lap line
**Body.** Add an `elim` race rule. At each leader lap completion, the last-placed
running car is classified out, through the existing retirement path
(`Reliability`/`RaceControl.classify`). The race ends when one car is left or the
laps run out. The results sheet shows the elimination lap. Source §2.
**Acceptance.**
- [ ] RACE SETTINGS offers ELIMINATION. Its default grid is quali/tier.
- [ ] Exactly one car is eliminated per leader lap. A player eliminated sees the
      results with the position and lap.
- [ ] Netplay either supports it or hides it (documented).
- [ ] A race spec covers a 4-car elimination via `__apex` hooks.

### 3. Overtake Attack mode: start last, score clean passes
**Body.** A race from P22 where each net position gained cleanly scores points.
Passes completed while Overtake Mode is live score ×1.5. Contact (`Damage` hits) or
a `SportingRegs` strike deducts points. Bronze, silver and gold come from a
per-circuit table. Source §3.
**Acceptance.**
- [ ] Score events come from position changes, filtered by contact and strikes, and
      are visible in the results.
- [ ] Medals persist per circuit. The mode is reachable from RACE.
- [ ] A unit test covers the scoring with a synthetic event list.

### 4. Daily challenge: rotate the objective by date
**Body.** Extend `DailyChallenge.plan(day)` with a seeded `objective`
(`timetrial | elimination | attack | drill`), keeping the plan a pure function of
the date. Per-objective bests, and a share line that names the objective. Depends on
#(elimination) and #(attack). Source §4.
**Acceptance.**
- [ ] `plan(day)` stays deterministic. The existing daily unit tests pass, plus one
      test for the objective distribution over 365 days.
- [ ] The title DAILY entry names today's objective. The streak counts any objective.

### 5. Timed races: race length in minutes
**Body.** A LENGTH row: laps (today) or 5/10/15/20 minutes + 1 lap. When the clock
expires, the leader's next line crossing shows the last-lap board. Pit windows and
tyre estimates read the estimated lap count. Source §5.
**Acceptance.**
- [ ] A timed race ends after the leader completes the lap begun after the clock
      expires.
- [ ] HUD/radio announce "last lap". The season and career options are unchanged.
- [ ] A spec covers a 1-minute race via `__apex` time stepping.

### 6. Racing Academy: scored medals on the practice drills
**Body.** A separate ACADEMY entry runs the existing `DrivingCoach` drills as
*scored* attempts (no rewind or checkpoints, so `js/game.js:867` is unchanged).
Each drill has a metric and bronze/silver/gold thresholds. Completing a tier
(Rookie → Super Licence) unlocks a cosmetic. Grading compares against the drill's
own targets or the player's own best, never the racing line with assists off.
Source §6.
**Acceptance.**
- [ ] At least 8 drills have a metric, thresholds and medal persistence.
- [ ] PRACTICE stays unscored. An Academy attempt is never rewindable (unit test on
      the gate).
- [ ] Each attempt is ≤ 60 s. The flow fits 844×390 touch.
- [ ] The `physics-contract-auditor` agent run is clean.

### 7. 2026 Overtake: the chasing car keeps full deploy to a higher speed
**Body.** Under B7.2.3(c), the Overtake car's deployment holds full power higher
than a leader's (roughly 337 against 290 km/h, per The Race and PlanetF1). Today
`deployTaper()` uses one `TAPER_LO/HI` band for all cars. While `OvertakeMode` is
live for a car, raise its taper band by a vStd-normalised delta in `PhysicsConsts`.
Source §11.
**Acceptance.**
- [ ] With Overtake live, the deploy taper starts higher by the configured ratio, on
      AI and player alike.
- [ ] `vstd-lint` is clean. `physics-characterization.spec.js` is updated with a
      reason.
- [ ] A drag-race spec shows the chaser's speed gain over 500 m on a straight.

### 8. Engineer lift-and-coast harvest targets
**Body.** The engineer issues a per-lap harvest target (MJ) on suitable laps.
Harvest is measured from `c.energy` deltas while coasting. Hit or miss is called on
the radio and listed in `RaceInsights`. The HUD indicator is designed by the A·I2
lane. Source §12.
**Acceptance.**
- [ ] The target is issued at most once every N laps, and only with ERS
      (energy-saving) relevant.
- [ ] The measurement is read-only. No physics change (unit test on the measure
      function).
- [ ] The post-race insight reports targets hit/missed.

### 9. Knockout qualifying (Q1/Q2/Q3), phone-sized
**Body.** Replace the one flying lap with an optional three-part knockout: 22 → 16
→ 10 → pole (the 2026 format, RacingNews365). Each part is "drive one lap or
simulate", the AI improve with a per-part track-evolution term, and the sheet
marks the drop zone. Season and career get a QUALI FORMAT option (one lap /
knockout). Source §15.
**Acceptance.**
- [ ] The knockout produces a grid of 22 with the right elimination counts. A unit
      test on `QualiModel` covers it.
- [ ] The player can drive any part, or simulate a part they are through in.
- [ ] The quali sheet shows the drop zone at 844×390.
- [ ] One-lap quali stays the default until Bryce says otherwise.

### 10. Pit-wall calls: timed BOX/STAY decisions on SC, VSC and rain
**Body.** On SC/VSC deploy or a forecast crossing (`Forecast`), the engineer asks
BOX or STAY with a 5 s timer (two big buttons). BOX pre-selects the tyre and arms
the pit entry, and the player still drives in. Under the auto-pit assist, the
decision is executed. Source §16.
**Acceptance.**
- [ ] A prompt fires on SC/VSC deploy and on rain onset, once per event.
- [ ] Both choices and the timeout behave as specified. Netplay is per-client.
- [ ] A spec forces an SC through `__apex` and asserts the prompt and the BOX
      outcome.

## Sources

- FIA: [Refinements to the 2026 F1 regulations](https://api.fia.com/news/refinements-2026-fia-formula-1-regulations-agreed-all-stakeholders)
- formula1.com: [2026 power units explained](https://www.formula1.com/en/latest/article/2026-regulations-explained-all-you-necessitate-to-know-about-f1s-new-power-units.14jfv7a36905uDJDdNyfQd)
- The Race: [Boost, overtake mode, active aero: key 2026 terms](https://www.the-race.com/formula-1/boost-overtake-mode-active-aero-recharge-key-2026-terms-explained)
  and [2026 mid-season changes](https://www.the-race.com/formula-1/f1-2026-mid-season-rule-changes.md)
- PlanetF1: [How the overtaking mode works](https://www.planetf1.com/news/explained-how-f1-new-overtaking-mode-will-work)
- [RacingNews365: 2026 qualifying rules](https://racingnews365.com/new-f1-qualifying-rules-for-2026-explained),
  [GPFans: qualifying change](https://www.gpfans.com/us/f1-news/1072506/fia-f1-qualifying-change-2026-cadillac)
- F1 25 reviews: [Sports Gamers Online](https://www.sportsgamersonline.com/games/f1-25-review-a-familiar-race-strategy/amp/),
  [Shacknews](https://www.shacknews.com/article/144417/f1-25-review),
  [The AU Review](https://www.theaureview.com/games/f1-25-review/)
- GT7: [GameSpot](https://gamespot.com/reviews/gran-turismo-7-review-round-we-go-again/1900-6417837/),
  [CarAdvice](https://www.caradvice.com.au/caradvice/gran-turismo-7-game-review/),
  [Stuff](https://www.stuff.tv/review/gran-turismo-7-review),
  [Sportskeeda licence rewards](https://www.sportskeeda.com/esports/every-license-test-reward-gran-turismo-7)
- Motorsport Manager Mobile 3: [RaceFans](https://racefans.net/2018/08/05/motorsport-manager-mobile-3-f1-game-reviewed/),
  [Stuff](https://www.stuff.tv/review/motorsport-manager-mobile-3-review),
  [Top Gear (MM3)](https://www.topgear.com/car-news/gaming/motorsport-manager-3-review-streamlined-and-intuitive)
- Trackmania: [Wikipedia](https://en.wikipedia.org/wiki/Trackmania_(2020_video_game)),
  [HighGround modes ranked](https://www.highgroundgaming.com/all-trackmania-game-modes-ranked/),
  [racinggames.gg COTD](https://racinggames.gg/news/trackmania-update-patch-notes-matchmaking-cup-of-the-day-online-maps-routes-cars/);
  async ghosts: [Musclecar Online](https://samredfern.itch.io/musclecar-online)
- Wishlists: [EA forums F1 22 features](https://forums.ea.com/discussions/f1-games-franchise-discussion-en/new-features-and-fixes-in-f1-22/8447682),
  [EA forums F1 27 requests](https://forums.ea.com/discussions/f1-25-general-discussion-en/f1-27-requested-features-for-quality-of-life-and-improvement/13183666),
  [RaceDepartment F1 2014 wishlist](https://www.racedepartment.com/threads/f1-2014-ideas-and-wish-list.81845/page-7),
  [Frontier F1 Manager suggestions](https://forums.frontier.co.uk/threads/f1-manager-2023-suggestions.610075)
- Touch controls: [Teather & MacKenzie, tilt vs touch (2017)](https://yorku.ca/mack/ec2017.html),
  [Red Bull: F1 2016 mobile control notes](https://www.redbull.com/in-en/f1-2016-for-mobile-tutorial-guide).
  Touch-control ideas themselves are A·I2's lane. These sources back the "one tap
  per decision" phone-fit ratings above.
