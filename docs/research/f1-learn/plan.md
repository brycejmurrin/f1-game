# Apex 26 Learn
Product and engineering plan · 23 November 2026 · checkout ae73c67669

## The experience

Give Learn a title-menu entry beside Watch and Data Hub. Data Hub tells the player what happened. Learn lets them change one decision and see why the outcome changes. Start with three questions: *Where does the tow help? How hard can I brake while turning? Why can the same pit stop cost less under a VSC?* Together they teach driving, physics, and race rules using three reusable views: a spatial diagram, a force plot, and a race timeline.

Design for a player with two minutes between races. The index opens directly to questions grouped under **Drive the car**, **Run a race**, **Build a car**, and **Explore the eras**. Selecting a question opens a worked example immediately. Offer a prediction, one obvious control, an observable consequence, and an optional second case. Put units, assumptions, season, and sources beside the readout they explain. Permit free exploration without quiz or progress gates. Keep a stable ID for each lesson so a later Data Hub or post-race link can open a specific example.

## The launch lessons

**1. Where does the tow help?** Open on two aligned cars 10 m apart. Animate airflow in a car-fixed frame, with a freestream arrow and shorter arrows in the wake. Drag the follower or tap/key through a metre scale with 5, 10, 20 and 34 m marks and room beyond 34 m. Calculate headway from the displayed speed. Switch to a corner while holding distance fixed: the wake remains, the driver loses the usable straight-line tow, and the grip penalty now matters. An offset preset shows what moving out of line does. Use a schematic scale if the full gap cannot fit legibly.

Read exposure from PhysicsConsts.DirtyAir.wakeOf. Use the actual speed normalisation and downforce coefficient at the gameplay call site for the grip multiplier. Keep c.wake distinct from c.towing; the latter has driver/section eligibility conditions. At 10 m on centreline, classic exposure is 24/28, about 86%; at 34 m it reaches zero. At 342 km/h a 0.8 s gap is 76 m, well outside the classic window. These make excellent regression fixtures. Label the 34 m cutoff as game behaviour. An exponential game curve or animated tracers are approximations. Use the terms Straight Mode / Corner Mode and teach electrical Overtake Mode separately. Fixed drag, speed and battery percentages require evidence and a stated operating scenario.

**2. How hard can I brake while turning?** Show a tyre-force diagram beside a short corner-entry trace. Hold load and surface constant. Start at 80% longitudinal demand; the introductory circle leaves 60% lateral capacity. Ask the player to steer harder, show requested and achieved forces separately, then release the brake until the demand fits. Add a wet preset with an explicit grip assumption. Use a single signed pair of inputs to drive both trace and vector. Test zero, pure-axis and combined demand. This is a teaching model; the force ellipse is a capacity constraint, not a measured Pirelli combined-slip curve. A later axle-load lesson can explain why braking changes which tyres approach the limit.

**3. When is a pit stop cheaper?** Compare two cars over the same section on a common clock. Move the pit stop between green and a prescribed Virtual Safety Car interval. Break the loss into entry, transit, stationary service, and exit, relative to a car covering the equivalent section on track. Hold pit-lane speed, service and tyre assumptions constant. The reference car slowing makes the cost easier to see than a fixed VSC discount. An extra second stationary must add a second in the simple unconstrained case. Show both elapsed time and rejoin gap. Add traffic, full Safety Car queues and red flags as distinct scenarios once their restart and order fixtures are verified.

## Curriculum and order

| Release | Question | What the player changes and observes | Evidence required |
|---|---|---|---|
| First playable | Where does the tow help? | Gap, lateral offset and steering → exposure, usable tow and grip | Game wake and player gates; real wake research |
| First playable | Can I turn while braking hard? | Brake vs steering demand → remaining grip | Labelled force-envelope model |
| First playable | When should I stop under VSC? | Stop lap and neutralisation → rejoin gap | Sporting rules and segment times |
| Driving | Which axle reaches its limit first? | Bias and deceleration → four wheel loads and lock risk | Mass, CG, wheelbase and assumptions |
| Driving | What changes in the wet? | Surface grip, entry speed and radius → cornering demand and braking distance | Declared friction, no universal wet coefficient |
| Driving | Should I upshift now? | Gear and road speed → wheel force and acceleration | Torque curve, ratios and shift time |
| Strategy | Will the undercut work? | Tyre age, stop lap and traffic → cumulative gap and crossover lap | Synthetic stint curves, local baseline |
| Strategy | Who advances in qualifying? | Scrub time, invalidate a lap → cut line, tie order and grid consequences | Sporting articles, entry count, event format |
| Strategy | Who wins the championship? | Change finish order and distance → points, countback, champion | Season-specific tables and eligibility |
| Race control | Can I pass here? | Scrub across a flag or control line → permitted actions and timing | Sporting Code, Appendix H, event notes |
| Race control | What did the stewards decide? | Inspect time-aligned incident evidence → reveal published reasoning | Dated case and decision; judgement remains contextual |
| Engineering | Where should I spend electrical energy? | Move deploy windows → energy, clipping and speed traces | Issue-pinned power limits, event/session parameters |
| Engineering | What does a wing change buy? | Change configuration at matched speed → drag, load and balance | Sourced or clearly illustrative coefficient maps |
| Engineering | Can our team afford another upgrade? | Allocate fictional spend and aero-testing time → separate limits | Sections D/E/F, exclusions and period |
| History | How did passing aids evolve? | Re-run one straight under DRS and 2026 rules → available actions | Two dated rulesets, circuit zones |
| History | Why did floors and wings change? | Scrub era diagrams → permitted geometry and qualitative effects | Period technical rules and evidence |
| History | How is a driver protected? | Explore annotated survival cell, halo, barriers and medical response | FIA investigations and safety standards |
| Data Hub bridge | Where did the lap time go? | Align traces by distance and isolate a corner → braking point, minimum speed, delta | Local teaching fixture; measured trace provenance |

Use a timeline comparison when a rule changes a driver's decision. Use a drawing or short sourced explanation when moving a slider adds no insight. Further catalogue candidates include parc fermé, component penalties, safety-car restarts, scrutineering, tyre nominations and engine eras. Each earns a lesson when it has a reproducible example, a meaningful action, and an observable outcome.

## Content ownership and rule revisions

The FIA register checked on 23 November lists 2026 A03 (general), B09 (sporting), C21 (technical), D08 (team finances), E07 (power-unit manufacturer finances) and F11 (operational). A single subject may span several sections, the International Sporting Code, its appendices and event-specific instructions. Keep the 2027 rules indexed separately. Publication date, approval date and effective competition can differ. [FIA register](https://www.fia.com/regulation/category/110)

Give each numeric parameter or rule claim an owner in a small source manifest: lesson ID, evidence type (FIA rule / Apex behaviour / illustrative model), governing issue or game revision, article or symbol, units, effective interval, event scope and source link. Store example inputs with expected outputs. History entries get before/after rules with separate dates, a sourced reason for the change, and its observable consequence. Pin the rule in force for a historical race. On a new issue, review only dependent lessons; preserve old snapshots. For decisions requiring judgement, present evidence and reveal the documented outcome. Research notes below identify where the available evidence ends.

## Five comparisons worth building from the research

1. **Same finishing order, different championship.** Replay a top-ten finisher setting fastest lap under the 2024 and 2025 rules. Change only the season and show the bonus point disappear. Add a constructors example: P2 plus P3 earns 33 points under full scoring, beating P1 plus P11 on 25. This can ship before a full season simulator. [Sporting evidence](sport.md)
2. **Same compound, different sidewall label.** Change the event nomination and show how an absolute compound becomes the event's Hard or Soft. Then run two stints on different sets of the same specification. A dry Grand Prix ordinarily requires two distinct slick specifications; a second physical set alone does not satisfy the rule. Compare the game fixture with its short-race waiver. [Sporting rules](sport.md) · [Game implementation](game.md)
3. **More power versus more energy.** Display kW for instantaneous power and MJ for accumulated energy. In a lossless example 350 kW sustained for one second transfers 0.35 MJ. Move deployment along a speed trace, then show the applicable power taper and energy budget as separate constraints. Pin the regulation issue and session before displaying a limit. Apex's fallback detection position and game-tuned deployment should have their own source labels. [Technical evidence](tech.md) · [Game integration](game.md)
4. **Same track, different overtake aid.** Put two cars on a timeline, scrub past the detection line, and change their gap on either side of it. For a historical DRS case reveal the eligible follower's wing action. For a 2026 case show straight-mode availability for both cars and a separate electrical allowance for the eligible follower. For a named race, draw the lines from event documents. Apex can derive zone positions from circuit geometry; source those as game locations. [Technical evidence](tech.md) · [Game integration](game.md)
5. **Equal axle load versus equal tyre grip.** With a load-sensitive tyre preset, move vertical load from one tyre to the other while keeping total load constant. The two forces need not sum to the original grip. The physics report supplies a worked 500 N/1500 N example and a linear control case. Use that pair to explain why a force diagram is more informative than a single grip bar. [Physics fixtures](physics.md)

## First history collection

Use the floor of the car as the first historical object a player can follow through time. Let the player slide between a late-1970s ground-effect car, the 1983 flat-bottom requirement, and a 2022 tunnel-floor car. Keep the silhouette scale and airflow direction fixed. Reveal which geometry was permitted, how it changed the pressure distribution qualitatively, and what problem the next rule aimed to address. Never translate a historical photograph into an invented downforce number. [History evidence](history.md)

For a second comparison, replay one braking-and-acceleration sequence under 2009 KERS, the 2014 turbo hybrid with MGU-H, and the 2026 architecture without it. Highlight where energy can enter or leave the system; unlock quantitative controls only for the era with sourced parameters. For a third, let the player reorder a Sprint weekend from 2021 and 2023 and see which session sets the Grand Prix grid. This connects engineering and sporting history to actual choices in the cockpit. [Era research](history.md) · [Sporting formats](sport.md) · [Power-unit rules](tech.md)

Give safety and governance their own reading path. Pair a documented incident with the FIA investigation, the adopted protection or procedure, and its introduction date. For a technical dispute, follow the path from a team's design through scrutineering, a stewards' decision and an appeal when one occurred. For team economics, distinguish money counted toward the team cap, the PU manufacturer's separate rules and permitted aerodynamic test time. Each comparison answers a different question about why a modern F1 car or weekend looks the way it does. [Safety, governance and financial research](history.md)

## Where the code should connect

| Area | Existing seam | Use in Learn |
|---|---|---|
| Navigation | index.html title door, js/ui/title-menu.js, js/ui/layers.js, js/game.js | Put Learn in Watch & Explore; preserve menu regrouping, Escape, controller Back and opener focus |
| Offline and loading | js/core/lazy-bundles.js, tools/manifest.cjs, generated service-worker rosters | Load one local feature bundle, retry transient errors, avoid a startup dependency on remote sources |
| Aero and tyres | PhysicsConsts.DirtyAir, PaceMath, TyreModel.lateralCurve, PlayerForces.tyreSat | Bind readouts to the same helper parameters as gameplay; use labelled illustrative fixtures for quantities outside those helpers |
| Stints and sporting | AiDrive.stintPlan, PitLane, SportingRegs.compoundVerdict | Supply deterministic life and loss inputs; display simulated strategy and regulatory eligibility separately |
| Energy and weather | OvertakeMode crossing/spending logic, RainCells and forecast | Freeze time, replay boundary crossings or change forecast inputs without touching the player's race |
| Traces | Existing Braking Duel and Data Hub telemetry | Reuse trace alignment in a later lesson; distinguish recorded laps, scripted game traces and synthetic examples |

## Implementation and delivery

1. **Vertical slice.** Wire a Learn title button in Watch & Explore and a lazy opener in game.js. Register a real dialog with UiLayers. Use the Data Hub heading/Close/focus contract and a single scrolling body. Build the wake lesson end to end first. Keep graphics independent of a live race and of WebGL initialisation. Exit criterion: open from title, manipulate with mouse/touch/keys, close and reopen with focus restored.
2. **Lesson contract.** Keep static lesson metadata, model inputs/outputs, explanatory copy, fixtures, and view code distinct. Each lesson needs initial state, a pure evaluator or read-only adapter, and a view that releases its listeners and animation frame on close. Prefer existing pure gameplay helpers. If the real path requires the race loop, use a labelled teaching fixture until a faithful adapter exists. Share single-purpose renderers only after two lessons demonstrate the need. Use native controls and HTML readouts with a modest Canvas 2D layer. Avoid per-frame DOM writes. Default reduced motion to static arrows and allow pausing while inputs remain live.
3. **First playable.** Add force and VSC labs, a small browsable index and individually attributable source notes. Use local fixtures throughout. Reserve game state, career saves and live API traffic for their existing owners. A later link from a measured Data Hub trace should carry its event/driver identity; a local example stays available offline.
4. **Distribution.** Declare the lazy group in tools/manifest.cjs, regenerate shell/rosters, verify service-worker caching and Capacitor staging. Deduplicate concurrent opens, recover from failed script loads, and recheck layer ownership after loading. Stop work in closed/hidden labs. Prefer offline availability after the optional assets have cached; verify that promise before advertising it.
5. **Expansion.** Add sporting/strategy lessons before the rule-heavy energy and era comparisons. Reuse diagrams across eras with explicit snapshots. Introduce season filtering when there are genuinely different rulesets to compare. Defer accounts, mandatory progress, live racing dependencies and a general simulation engine.

## Release checks

- Model fixtures cover units, boundary values, continuity where applicable, finite outputs, conservation checks, and cited rule exceptions. Compare game-backed examples against the exact helper outputs at matching settings. For rules, test either side of a threshold and the boundary itself.
- Check desktop keyboard, controller Back, 844×390 touch landscape, portrait, 200% UI scale, reduced motion and non-colour cues. Every drag has a tap/keyboard alternative. When motion is paused, both visual and textual outputs still respond.
- Test the visible title door, rapid double open, failed bundle/retry, closing mid-load, focus return, graphics reset, offline reopening and neighbouring Watch/Data/Help flows. Compare title startup network requests before/after; lesson assets should load on entry or via existing offline caching. Check for animation or listeners after ten open/close cycles.
- Playtest with a new fan and an experienced player. Ask the first to explain why following can hurt in a corner, and the second to produce the same wake with different tow eligibility. For tyres, ask them to regain lateral headroom. For VSC, ask which segment of the stop became cheaper. Observe explanations before adding more copy.
- Use the project's change-aware test ladder and the targeted Learn browser spec. This deliverable plans implementation; no runtime performance claims or browser acceptance results have been established.

## Research appendices

[Sporting rules](sport.md) · [Technical and power-unit rules](tech.md) · [History, safety and governance](history.md) · [Vehicle dynamics and model fixtures](physics.md) · [Data Hub architecture](hub.md) · [Gameplay systems and reuse](game.md)

## Implemented Learn menu structure

Learn uses the Settings menu hierarchy: a lesson index, a lesson page and a persistent Back footer. Back from a lesson returns focus to its index entry; Back from the index returns to the title. Each new lesson uses the same Appearance Studio layout: grouped controls and a live preview side by side on wide screens, with controls above the preview on narrow phones. Only playable lessons appear in the index.

## Session designs after the first Aero Lab

The first lesson opens with two cars 10 m apart. At the same gap, switching to the fast corner preserves wake exposure and removes the usable tow. Moving four metres off-line restores the game's clean-air grip baseline. The next lessons should give players similarly short, reproducible comparisons.

| Build order | Session and test of understanding | Design brief |
|---|---|---|
| Next | **Spend grip through a braking zone.** Release enough braking demand to make a corner, then repeat under a different grip limit. | [Driving sessions](driving-sessions.md) |
| Next | **Box under VSC.** Choose a pit window, identify which part of the time loss changes, and replay a different end to the neutralisation. | [Race decisions](race-sessions.md) |
| Then | **Follow water and temperature.** Compare two stints on a changing surface and explain why the crossover changes. **Build the grid.** Apply a deleted lap, a tie and a penalty, checking classification before the start grid. | [Driving sessions](driving-sessions.md) · [Race decisions](race-sessions.md) |
| First era comparison | **What replaced DRS?** Replay a Las Vegas straight under two seasons' rules. Ask separately who may change wing state and who has earned extra deployment. | [Era sessions](era-sessions.md) |
| Further sessions | Reconstruct a steward decision and rescore the result. Compare floor designs, hybrid architectures, safety layers or development budgets across eras. | [Race decisions](race-sessions.md) · [Era sessions](era-sessions.md) |

Use the worked values and transfer questions in each brief as acceptance fixtures. Preserve the year and event on every source-backed example; label teaching values in the same view as their outputs.

## After Grip & Braking and VSC Pit Strategy

| Proposed lesson | First playable decision | Why this order |
|---|---|---|
| [Where did the time go?](telemetry-ideas.md) | Choose which driver reaches a corner exit first, then align the traces by distance and check the prediction. | Builds directly on Grip & Braking. An offline pair of traces and the existing Data Hub marker calculations give the lesson a reproducible outcome. |
| [Energy & Overtake](engineering-ideas.md) | Spend charge now or save it for the faster section. Cross the detection line at a different gap and compare what is available. | Introduces a genuinely different resource constraint. Power, energy and eligibility each get a distinct readout and a dated rule reference. |
| [Read the evidence before the decision](steward-ideas.md) | Select what the evidence establishes about a driver leaving the track, then reveal the official finding and sanction. | Adds a rule-interpretation session with evidence review and an accessible text sequence. Each future case needs its own source and reasoning review. |

All three start with a local worked example. The telemetry lesson can link to the Data Hub after the example; real timing data is optional. The engineering and stewarding briefs also include alternate concepts for later releases.

## Candidate curriculum from the 14-module brainstorm

The following ideas came from a separate brainstorming pass. The numbers preserve that brief’s order and help reviewers find related ideas. The three playable lessons are in draft game PRs. Their remaining experiments and the other eleven candidates are proposals.

| Pillar | Candidates | Current coverage and next decision |
|---|---|---|
| Car anatomy and aerodynamics | 1. Active aero and the slipstream paradox · 2. Nimble car X-ray · 3. Pushrod, pullrod and anti-dive | Aero Lab already supports moving the follower through a wake, comparing straight and corner, and varying local flow speed. A 2025/26 silhouette and an animated suspension cutaway would require separate geometry and provenance. [Chassis briefs](curriculum-chassis.md) · [Aero Lab PR](https://github.com/brycejmurrin/f1-game/pull/6195) |
| Power unit and energy | 4. Deployment clipping and Overtake · 5. Hybrid lap budget · 6. Rear brake blending and torque fill | Start with the existing two-window Energy & Overtake fixture. A charge ledger could then drive the sector budget. A brake-blending visual needs its own rear-axle torque and energy limits. [Power briefs](curriculum-power.md) · [Worked energy fixtures](engineering-ideas.md) |
| Tyres, driving dynamics and telemetry | 7. Thermal windows, graining and blistering · 8. Braking, load transfer and the friction circle · 9. Racing lines and apex geometry · 10. Telemetry Detective · 11. Rain lines and aquaplaning | Grip & Braking already covers combined tyre force on dry and damp surfaces at a fixed load. Speed-dependent downforce and axle load transfer would extend it. Prototype Telemetry Detective next because the paired traces and expected delta already exist. [Driving briefs](curriculum-driving.md) · [Telemetry fixtures](telemetry-ideas.md) · [Grip PR](https://github.com/brycejmurrin/f1-game/pull/6197) |
| Race strategy and weekend operations | 12. Pit windows under VSC and Safety Car · 13. Undercut versus overcut · 14. Fuel burn, tyre allocation and the cliff | VSC Pit Strategy already replays one sector and estimates tyre and traffic outcomes. A full Safety Car requires modelling the queue. An undercut duel is a smaller next experiment: change the out-lap or rejoin gap and observe the crossover. [Strategy briefs](curriculum-strategy.md) · [VSC PR](https://github.com/brycejmurrin/f1-game/pull/6198) |

### Shared lesson format

Open with one question that calls for a decision. Let the player manipulate the visual and keep its most important measurement visible beside the control. Show units, a baseline and what stayed fixed. End with a short **Engineer Challenge** that changes one condition and asks for a prediction before revealing the explanation. The range controls, replay controls and feedback should also work with a keyboard and with motion paused.

### Further ideas from the same brainstorm

| Candidate | First playable question |
|---|---|
| Setup trade-offs | How does changing a single setup parameter affect braking and cornering over the same run? |
| Survival cell, crash structures and Halo | Which component absorbs impact energy, and which preserves space around the driver? |
| Wind tunnel, CFD and track correlation | Does a development gain survive when the circuit measurements disagree with the tunnel? |
| Pit-stop choreography | Which delayed crew action actually changes the time at which the car can be released safely? |
| Qualifying out-lap and tow timing | Can the driver gain a tow while preserving clear air through the preceding corner? |

For review, take one proposal at a time: choose the physical relationship to demonstrate, identify which quantities a primary source or the game can support, and write down an input that reverses the expected outcome where one exists. Treat examples such as a particular qualifying gap, a fuel-weight penalty, or a tyre-temperature threshold as scenario inputs unless a dated source establishes the value for that case.
