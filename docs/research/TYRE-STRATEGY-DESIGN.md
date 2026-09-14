# Tyres, degradation and pit strategy — research and design

> 2026-09-14. Research pass + proposed design for the one system `docs/PHYSICS.md`
> names as deliberately absent: **"There are no pit stops. The compound is a
> pre-race commitment."** This doc is the plan that would change that sentence.
> Nothing here is implemented yet; §10 is the phase order and §11 the decisions
> that need an answer before Phase 1 starts.

---

## 1. What the game has today

| Piece | Where | What it does |
|---|---|---|
| Tyre catalog, ~30 rows | `js/car/parts.js` `tyres` | Four DRY stats (`speed`/`accel`/`cornering`/`braking`) + `wetTread` (0 slick / 1 inter / 2 full wet). A garage purchase, fitted before the race, **never changes during it**. |
| Wet grip | `js/physics/consts.js` `WET_GRIP` | `[slick, inter, wet] x [wet, rain]`. The only way a tyre changes behaviour mid-race, and only because the weather arc moved. |
| AI "strategy" | `js/physics/ai-drive.js` `tyreClass` / `tyrePace` | Each AI draws soft/medium/hard by race distance; pace = `1 + off − min(deg·lap, 0.025)`. Applied at `js/game.js` as `vmax *= tyrePace(...)` — a **ground-speed scale, never grip**. |
| Flags | `js/race/race-control.js` | Green / yellow / VSC / safety car / red already exist, with a full red-flag restart procedure. |
| Real pit data | `js/data/telemetry.js` | The Data Hub already renders real F1 **stints and pit stops** from the API. The vocabulary is on screen; the sim has none of it. |
| Pit lane | — | **Does not exist.** `ownPitStraight` is a scenery flag (it suppresses the generic 7-box grandstand/pit-building fallback in `js/track/tracks.js`). There is no pit geometry on any of the 42 circuits. |

So: the compound is a static stat block, degradation is an AI-only speed fudge,
and pitting is absent. Everything below is additive to that.

---

## 2. Research — how the real thing works

Two research passes, sources cited inline. Every number is **indicative**, and
the sources that could not be verified are named at the end of each block.

### 2.1 Compounds

Pirelli ran C1–C6 in 2025 and dropped to **C1–C5 for 2026** — C6 died because the
C5→C6 gap measured ~0.2 s against Pirelli's own ≥0.5 s requirement
([The Race](https://www.the-race.com/formula-1/two-big-tyre-changes-for-f1-2026-revealed/),
[Pirelli](https://press.pirelli.com/the-range-of-compounds-for-the-2026-season-has-been-set/)).
Three of the five are nominated per event and re-badged Hard/Medium/Soft.

**The single most useful modelling fact: "Soft" is not a fixed compound.**
Silverstone's 2026 Soft is C3; Australia's Hard is C5. Pirelli slides the
nomination with circuit severity
([F1.com British GP](https://www.formula1.com/en/latest/article/what-tyres-will-the-teams-and-drivers-have-for-the-2026-british-grand-prix.3qD9d5o8X4x3se0F7Zg5i1),
[F1.com Dutch GP](https://www.formula1.com/en/latest/article/what-tyres-will-the-teams-and-drivers-have-for-the-2026-dutch-grand-prix.402ufleb78rXrqaispof9U)).
A three-slot S/M/H table is the wrong primitive; **absolute compound index x
per-circuit severity** is the right one.

Lap-time deltas per compound step: Pirelli's 2026 target is **0.7–0.8 s in
qualifying, ~0.4 s in race trim**
([Isola, via scuderiafans](https://scuderiafans.com/f1-2026-tyres-pirelli-targets-bigger-compound-gaps-to-reshape-race-strategy/));
measured historical steps run 0.6–1.0 s
([Autosport](https://www.autosport.com/f1/news/pirelli-reveals-performance-gaps-between-2019-formula-1-tyre-types-5284128/5284128/)).
**Race deltas are roughly half the quali deltas** — a compression worth
reproducing, because it is why "the soft is 0.8 s faster" does not mean the soft
wins the race.

### 2.2 Degradation is four different mechanisms

| Mechanism | Cause | Recoverable? | Cost |
|---|---|---|---|
| **Wear** | Abrasive tread removal | No | Slow, monotone |
| **Thermal deg** | Compound cycled out of its window; plenty of tread left, no grip | Partly | ~0.5 s over 2 laps once past the window |
| **Graining** | *Surface* tears from cold-or-sliding rubber, balls up on the tread | **Yes** — often drives itself clean | 0.1–0.3 s/lap |
| **Blistering** | *Sub-surface* overheat; trapped heat, rubber detaches | No | ≥1.0 s/lap, arrives in a single lap |

([f1chronicle](https://f1chronicle.com/graining-and-blistering-in-f1-explained/),
[f1racinghub](https://f1racinghub.com/learn/tire-strategy))

Graining is cold/sliding **surface** damage and recoverable; blistering is hot
**core** damage and is not. Distinguishing them needs two temperature states
(surface and bulk). That is the whole justification for a thermal layer — without
it, "tyres go off" is one curve and nothing a driver does can bring them back.

**Measured 2026 rates** ([F1 Chronicle stint regressions](https://f1chronicle.com/2026-f1-tyre-degradation-data/)):
Hard **0.071**, Medium **0.065**, Soft **0.063** s/lap — a spread of 0.008 s/lap,
the narrowest of the ground-effect era, and the **first season the hard degrades
fastest** (lighter, lower-downforce 2026 cars put less energy in, leaving the
hard below its window, where it slides). Per circuit: Austria 0.097 (highest),
Miami 0.060, Monaco 0.050, Britain 0.044, Japan 0.042, Australia 0.030,
China 0.022. Over a 25-lap stint the soft-vs-hard cumulative gap fell from
~16 s in 2022 to ~2.4 s in 2026.

**The cliff.** The pronounced cliff belonged to the 2011–13 Pirellis; Pirelli
tried to re-engineer one for 2016 and **failed**
([Autosport](https://www.autosport.com/f1/news/pirellis-plan-to-reintroduce-tyre-performance-cliff-unsuccessful-4992767/4992767/)).
Modern compounds mostly degrade linearly. Model shape: **linear `k·age`, then a
knee** of order 0.5–2 s/lap; softer, hotter and more sliding pull the knee earlier.

### 2.3 Temperature

Slick optimum is broadly **90–140 °C by compound**, commonly 100–120 °C surface
for peak grip; the usable width between "too cold to grip" and "too hot to
survive" is only **15–20 °C** ([thef1db](https://thef1db.com/blog/f1-tyre-science-how-they-work)).
Surface responds in corners; carcass over laps. Blankets survived 2026 (no ban —
lower maxima and tighter limits instead,
[The Race](https://www.the-race.com/formula-1/f1-adjusts-2026-rules-to-close-off-tyre-cooling-tricks/)).
**Softs switch on in ~1 lap, hards need 2–3** — which is exactly why the out-lap
after a stop on hards is visibly slow, and therefore why the undercut sometimes
fails. F1 25 targets ~90–105 °C for slicks with grip falling above ~105–110 °C
([simracingsetup](https://simracingsetup.com/ea-sports-f1/f1-25-tyre-guide/)).

### 2.4 What actually wears a tyre

**Sliding, not speed.** Lateral energy dominates at high-speed circuits:
Silverstone's Maggotts–Becketts–Chapel runs >280 km/h at >5 g lateral and Pirelli
grades it at maximum on its internal tyre-energy scale, which is why the hardest
trio goes there ([Motorsport.com](https://www.motorsport.com/f1/news/pirelli-hard-and-medium-tyres-for-the-highest-lateral-energy-loading-of-the-year-at-silve/453565/)).
Asymmetry is circuit-shaped: Silverstone is **left-front limited** (right-handers
dominate), Suzuka's figure-of-eight wears evenly, Zandvoort's banking adds a
large vertical component with almost no recovery phase. Front-limited tracks run
out of front grip (understeer, front overheating); rear-limited tracks destroy
rears, so engineers dial in understeer for quali so the rears survive the race
([scuderiafans](https://scuderiafans.com/front-and-rear-limited-tracks-differences-and-how-tyres-are-affected-formula-1-explained/)).
Lock-ups flat-spot one patch; minor ones partly re-skin, bad ones force an early
stop ([flowracers](https://flowracers.com/blog/what-is-lock-up-in-f1/)).

### 2.5 Fuel, and the shape of a stint

| Quantity | Value |
|---|---|
| Lap time per 10 kg | **0.25–0.40 s** (~0.03 s/kg) |
| Burn | ~2.0 kg/lap |
| **2026 race fuel** | **~70 kg**, down from ~100 kg in 2025 |
| 2026 minimum mass | 768 kg (from 800 kg) |

([themotorsportmetrics](https://themotorsportmetrics.com/fuel-load-and-lap-time/),
[PlanetF1](https://www.planetf1.com/features/f1-2025-v-f1-2026-nine-key-questions-huge-regulation-changes))

`t(n) = t_base + k·m_fuel(n) + deg(n)`; burn removes ~0.06 s/lap while deg adds
0.02–0.10. Early stint: **lap times fall**. Later: deg wins and they rise, then
collapse. **The crossover is the pit window.** With 2026's ~70 kg the whole
fuel-burn benefit across a race is only ~2.1–2.8 s, so the "gets faster through
the stint" phase is weaker than in 2022–25 — which, with the flattened deg
spread, is why 2026 stints look flat.

### 2.6 Pit loss

Pit loss = `(in-lap + out-lap) − 2 x normal lap`
([f1chronicle](https://f1chronicle.com/f1-pit-stop-time-loss-data/)). Three
components: stationary ~2.5 s (record 1.80 s), speed-limited transit, and the
compromised in/out laps.

**FIA 2025 Sporting Regs Art. 34.7**: *"A speed limit of 80km/h will be imposed
in the pit lane during the whole Competition."* The 2026 regs carry it as
**Art. B1.6.3a**, same 80 km/h. Historically 60 km/h at Melbourne, Monaco,
Zandvoort, Singapore ([The Race](https://www.the-race.com/formula-1/f1-reduce-pitlane-speed-limit-some-races-explained/)).
Over 400 m of limited lane, 60 vs 80 km/h is **6 s**.

| Circuit | Pit loss (s) |
|---|---|
| Spa | **18.4** (cheapest — the lane bypasses La Source) |
| Miami | 19.7 |
| Silverstone | 21.0 |
| Monza | ~21 |
| Red Bull Ring | 21.5 |
| Barcelona | 23.8 |
| Qatar | 27.7 |
| Singapore | 27.9 (29 at 60 km/h) |
| Imola | **28.1** (dearest) |
| **Season average 2025** | **21.9** |

Rule of thumb: **stationary 2.0–2.5 s, total green-flag delta 18–30 s, clustering
20–25 s.**

### 2.7 The rules that create strategy

- **Two-compound rule — Art. 30.5m (2025) / B6.3.6 (2026):** *"unless they have
  used intermediate or wet-weather tyres during the race, each driver must use at
  least two (2) different specifications of dry-weather tyres."* Penalty is
  **disqualification**; +30 s if the race is suspended and not restarted. **The
  rain exception is total** — touching an inter or wet at any point voids the
  requirement, so no stop is mandatory.
- **Allocation (Art. 30.2a ii):** 13 sets dry, 5 inter, 2 wet per driver.
- **Monaco's 2025 mandatory two-stop was dropped for 2026** after teams gamed it
  by backing the pack up ([The Race](https://www.the-race.com/formula-1/monaco-two-stop-rule-dropped-after-2025-mess/)).
  The proposal to make two stops universal was **tabled and rejected**.
- **Free stop under SC/VSC — Arts. 55.12 / 56.4:** *"no car may enter the pits
  whilst the safety car is deployed unless it is for the purpose of changing
  tyres."* A green stop cost 20 s vs 12 s under SC at the 2022 US GP; F1's own
  Monza guide says 21 s green vs ~12 s neutralised. **SC/VSC cuts effective pit
  loss by 40–60 %, i.e. 8–12 s** — the single biggest strategic lever in the sport.
- **Red flag (Art. 57.2/57.4):** the whole field forms up in the pit lane and may
  change tyres. A red flag is a **free tyre change for everyone**.
- **Unsafe release (Art. 34.14):** 10 s stop-and-go.

### 2.8 The strategy math

```
T_race       = Σ lap_time(ℓ) + n_stops x t_pit
lap_time(ℓ)  = t_base(compound) + λ_fuel·fuel(ℓ) + deg(compound, age) [+ traffic]
```

This is literally the formulation strategists optimise: a 2026 MILP
([Optimization Online](https://optimization-online.org/2026/02/a-simulation-framework-for-formula-1-race-strategy-based-on-pit-stop-optimization/))
carries per-compound `t_base`, max stint laps, `δ_deg`, `t_pit`, a standing-start
penalty, `G_min` ("minimum number of different tire compounds… typically 2 by F1
regulations"), fuel kg/lap and λ_f s/kg — and solves in tenths of a second from
**25 integers and 15 binaries**. A per-car strategy planner is cheap.

**Undercut**: a fresh tyre is worth **1–2 s/lap**; out-lap gain 1.5–2.0 s,
cumulative 2.5–3.5 s over out-lap + next lap, peak window the first 3–5 laps.
**A 0.4–0.6 s warm-up deficit can null the undercut entirely** — hards with slow
switch-on are the classic undercut killer
([themotorsportmetrics](https://themotorsportmetrics.com/f1-undercut-vs-overcut/)).
Both cars pay the same `t_pit`, so **pit loss cancels** in a head-to-head: what
matters is the fresh-tyre delta over the offset laps minus the rival's warm-up
loss. At 0.5 s/lap you would need 36–44 laps to repay a 22 s stop, which is why
undercuts only work in the 1–3 lap window where the delta is 1.5–2 s.

**Overcut** works when the rival's tyres warm slowly (cold track, hard compound),
when the rival rejoins in traffic, or when deg is low enough that a clear lap on
old rubber beats a cold out-lap.

**1-stop vs 2-stop** reduces to `t_pit` vs the cumulative degradation a longer
stint carries. Monza 2025 is the canonical case: F1/Pirelli put pit loss at 21 s
and called the two-stop "extremely unlikely" absent a safety car
([Formula1.com](https://www.formula1.com/en/latest/article/strategy-guide-what-are-the-possible-race-strategies-for-the-italian-grand.5WHbApgWXXFo9ExiU1oSvw)).
Note which lever the FIA reached for when it wanted more stops: **lowering pit
loss by raising the speed limit**, not changing the tyres.

### 2.9 Safety cars

Singapore **100 %** of runnings (1.71 SC/race), Monaco ~70 %, Canada ~70 %,
Bahrain ~14 % ([f1betuk](https://f1betuk.com/articles/f1-safety-car-betting-circuit-data/),
betting analytics — indicative only). A high SC probability pushes the optimum
**later**: the math dictates a late stop even at a short-term pace cost, because
the free stop is worth 8–12 s.

### 2.10 Traffic

2021 cars lost **46 % of downforce at 10 m**; the 2022 rules targeted **18 % at
10 m, 4 % at 20 m** ([Formula1.com](https://www.formula1.com/en/latest/article/10-things-you-need-to-know-about-the-all-new-2022-f1-car.4OLg8DrXyzHzdoGrbqp6ye)).
Dirty air **punishes twice**: lap time now, and tyre life through extra sliding
and heat. This is why strategists model *clean-air pace* and then discount it —
and why a driver who cannot pass gets pitted early, because a few laps in clean
air on fresh tyres beats a long stint staring at a gearbox.

Apex already models half of this: `dirtyAirMul` in `js/game.js` removes 35 % of
the downforce share in the closest wake. **The tyre half is missing** — in Apex,
following costs grip but not tyre life.

### 2.11 How games present it

- **F1 24/25**: a pre-race screen picks starting compound, stop count, stop laps
  and compounds, previewing **wear as coloured bars and lap-time drift as a
  dotted line**. In race, a pit-window panel moves the next stop, asks the
  engineer for a different compound, and **tells you what position you would
  rejoin in**. The games teach "a stop costs 20–25 s" and "pit before 65–75 %
  wear" ([racinggames.gg](https://racinggames.gg/article/f1-25-how-to-manage-pit-stops-fuel-and-tyres),
  [simracingsetup](https://simracingsetup.com/ea-sports-f1/f1-25-race-strategy-guide/)).
- **F1 Manager**: strategy authored as **stints** (how long, how hard, which
  compound next) with an AI-predicted outcome; fuel set in *laps of underfill*.
- **Motorsport Manager**: a grip **percentage** with an explicit cliff — run
  mediums to ~5–10 %, softs to 10–15 % remaining.
- **Fun vs tedious**, per reviews: pit-stop timing and tyre choice are
  consistently called the exhilarating part; the tedium lands in menus, contracts
  and repetition ([Game8](https://game8.co/articles/reviews/f1-manager-2024-review),
  [Traxion](https://traxion.gg/f1-25-review/)). Demand for a better race engineer
  is strong enough that third-party voice-engineer mods exist.
- **Calibration point**: that MILP beat **F1 25's own strategy AI by 7.79 s** over
  a full COTA distance by choosing a 1-stop over the game's default 2-stop. A
  shipped AAA F1 game leaves about a third of a pit stop on the table — so a
  simple, well-parameterised planner is competitive with what players expect.

### 2.12 Sources that did not hold up

Named so nobody re-does the work: **f1pedia is wrong** on 2026 (claims C0–C6;
Pirelli's homologation release says C1–C5). The FIA PDFs use per-font subset
encodings — the 2025 Sporting Regs extracted cleanly, the 2026 one only partly,
and **strikethrough is invisible to text extraction**, so "Monaco two-stop dropped"
rests on press reporting, not on the extraction. The per-compound deg figures
(0.063/0.065/0.071) come from one aggregator's stint regressions, with the Soft
number resting on 40 stints. Monaco pit loss is quoted as both 22.0 s and 17.9 s
by two secondary sources and could not be reconciled. **No compiled per-circuit
pit-lane-length table exists anywhere** — only Madrid (562 m) was found.

---

## 3. The constraints this codebase imposes

Read these before designing anything; three of them kill otherwise obvious ideas.

1. **`js/game.js` is ratcheted** (`tests/data/ratchets.json`: 8523 lines, 4568
   code lines, 242 `G` members, 141 top-level lets). The model is a **new module**,
   `TyreModel.create(G)`, not lines in game.js.
2. **"The arc must not reach the driver"** (`AGENTS.md` §Physics). A wear model
   driven by `Tracks.curvature()` would be a violation. A wear model driven by
   the car's **own measured forces** is not — and that is also the physically
   correct input (§2.4: sliding wears tyres, not corners).
3. **`PACE` discipline.** Every speed threshold goes through `vTop()`/`vStd()`,
   every acceleration through `aStd()`; `tools/check/vstd-lint.mjs` enforces it.
   A pit-lane speed limit is a `vStd()` threshold.
4. **`tests/unit/parts-ladder.test.mjs`** asserts no paid catalog row is strictly
   dominated and that exactly two rows are never-optimal, exempted on the
   `wetTread` **mechanism**. Adding a durability axis to tyres **changes that
   hull** — the ladder model needs a fifth axis, in the same style.
5. **`tests/specs/physics-characterization.spec.js`** pins the driving model's
   actual numbers across commits. A new grip multiplier must be **bit-identical
   at its no-op value**, exactly as the brake-bias split is.
6. **Determinism.** The AI's tyre class is drawn from a hash of (seed, grid slot);
   `Reliability` draws every retirement once at the green light from
   `Career.hash(seed, round, driver)` so arming consumes nothing from the sim RNG.
   A strategy planner must do the same.
7. **Multiplayer.** Remote cars land on `tread == null` today and compound is not
   replicated (`docs/PHYSICS.md`). A stint model makes that gap visible.
8. **No ES modules.** IIFE + a `tools/manifest.cjs` entry + `node tools/gen/gen-shell.mjs`.

### 3.1 The seams that already exist

- **Player lateral grip**, `js/game.js`:
  `muBase = LAT_MAX * PLAYER_GRIP * aeroGrip * surfMu * kerbGrip * gripMult(c) * mods.cornering * bankMu * (1 + vertLoad) * (bb ? 1 : slipFactor) * marbleMu`
  — `marbleMu` is the **precedent**: an external grip scalar from another module,
  behind a flag, a pure function of deterministic state, returning exactly 1.0
  when off. A `tyreMu` belongs beside it.
- **`c.skidIntensity`** already exists — a per-frame measured scrub metric
  (`clamp((slipAng − 0.10) / 0.20, 0, 1)`) feeding smoke, marks and audio. It is
  the ideal wear input: driver-made sliding, arc-free by construction.
- **`c.axFrac` / `slipFactor`** are the friction-ellipse utilisation, already
  computed and already on `physState()`.
- **`announce(msg, dur, kind)`** is a prioritised banner — the race engineer.
- **`RS_RELIAB = off/low/real`** in `js/race/race-settings.js` is the template for
  a `TYRE WEAR` row, and `js/race/reliability.js` is the template for the module:
  small, stateless, seed-hashed, an explicit `LEVELS` scale, ships OFF.
- **`hwZones {s0, s1, hw, ease}`** (`applyHwZones` in `js/track/tracks.js`) is the
  existing frac-keyed local-road-widening mechanism; barriers derive as
  `hw + RUNOFF_DEFAULT` (9 m). A pit lane is the same shape of idea, one-sided.

---

## 4. The problem nobody else has: race length

This is the constraint that decides whether any of this is playable.

Lap options are **3 / 5 / 10 / 25 / FULL**; `gpLaps = ceil(305 km / lengthKm)`, so
Monza is 53. Measured AI lap times (normal difficulty, from `js/physics/consts.js`):
Monza **124.2 s**, Spa **149.6 s**, Monaco **84.1 s**.

| Distance | Monza wall-clock |
|---|---|
| 3 laps | 6 min |
| 5 laps | 10 min |
| 10 laps | 21 min |
| 25 laps | 52 min |
| FULL (53) | **110 min** |

Real-world deg (0.06 s/lap) over a 25-lap stint is ~1.5 s of accumulated pace
against a 21 s pit loss. **At real rates, a stop is never worth making at any
distance this game actually offers** — and the distances where it would be are
distances almost nobody will play.

So the model must be **normalised to the scheduled session, not to 305 km**:

```
age_norm = laps_on_this_set / (LIFE_REF x lapsTarget)
```

A compound's `life` is a **fraction of the scheduled race distance**, not a lap
count. Soft ≈ 0.45, Medium ≈ 0.70, Hard ≈ 1.05 of the distance. Then:

- **3–5 laps**: even a soft ends the race inside its life. No stop. Correct — a
  3-lap blast should not be a strategy game.
- **10 laps**: a soft is spent around lap 5 and a stop is *marginal*. The
  interesting case.
- **25 / FULL**: one stop is clearly right on a soft, optional on a medium, and a
  hard goes the distance slowly. The classic shape, at any distance.

This single decision is what makes the system exist at all, and it is the part a
naive port of real numbers would get wrong.

---

## 5. The model

Tyre wear is **the fourth lever, and the slow one.** Apex already has BOOST
(spends the battery in seconds), OVERTAKE (a proximity-gated push with a
cooldown) and X-MODE (trades downforce for drag, continuously). The tyre is the
same kind of object on a horizon of laps rather than seconds: a resource you
spend by driving hard, that you can only refill by giving up track position.
Framing it that way is what keeps it Apex rather than a manager game.

### 5.1 Layer 1 — wear (Phase 1)

One scalar per car in v1 (per-axle in Phase 4). Integrated per physics tick from
**forces the car actually made**:

```
load  = w_lat·(|aLat| / muBase)² + w_long·axFrac² + w_slide·skidIntensity + w_kerb·onKerb + w_off·offroad
wear += load · rate(compound) · severity(circuit) · dt / (LIFE_REF · lapsTarget · lapTimeRef)
```

- Squared utilisation, because tyre energy is not linear in load and because it
  makes a tidy lap materially cheaper than a scrappy one — the thing the system
  is *for*.
- `skidIntensity` carries sliding explicitly, which §2.4 says is the real driver.
- **No curvature term anywhere.** That is both the `AGENTS.md` rule and the
  physics.
- `severity(circuit)` is one number per circuit def (§2.2's 0.022–0.097 spread,
  normalised to 1.0 at the median), authored in `js/circuits/<id>.js` beside the
  other per-circuit tables.

Grip, piecewise-linear then a knee:

```
tyreMu(wear) = 1 − DROP_LIN·min(wear, 1) − DROP_CLIFF·max(0, wear − 1)
```

with `DROP_LIN ≈ 0.05` (5 % of lateral grip across a full stint ≈ 1–2 s/lap,
matching §2.8's fresh-tyre delta) and `DROP_CLIFF ≈ 0.25` per unit past life —
steep, but reached only by a driver who ignored every warning. Feeds `muBase`
beside `marbleMu`; a smaller share also scales traction and braking, because a
tyre that only loses cornering grip reads as a handling bug rather than a worn tyre.

Fuel burn is the **counterweight** and lands in the same phase, because without
it the stint shape is wrong (§2.5): a car gets lighter and faster as the tyre
goes off, and the crossover between those two curves is the whole game. One term
on `vmax` and `ACCEL`, scaled by `lapsTarget` so a 3-lap race carries 3 laps of fuel.

### 5.2 Layer 2 — the pit stop (Phase 2)

**Recommendation: a driveable pit lane, not a scripted cutaway.** The codebase
makes this much cheaper than it looks, and it makes pit loss *emergent* rather
than a hardcoded penalty — which matters, because §2.6 says pit loss varies
18–30 s by circuit and §2.8 says that variation is what decides 1-stop vs 2-stop.

Three options were considered:

| Option | Cost | Verdict |
|---|---|---|
| (a) A real alternate spline | New engine concept x 42 circuits | Rejected — the road is one ribbon and one `s` coordinate everywhere. |
| (b) A `pitZone` on the existing ribbon | One frac-keyed def table + a `wallAt` exception | **Recommended** |
| (c) Abstract trigger + scripted stop | Trivial | Fallback if (b) measures badly |

> **Errata, 2026-09-14 — (b) was built, measured badly, and (c) shipped.** The
> recommendation below is kept as written because the reasoning still holds; what
> follows is what happened when it met the tree. (b) failed twice. FORCING the
> pit-side boundary open so a lane always existed put that boundary through the
> scenery: at Monaco a car running wide had its lap distance jump 250 m as the
> projection snapped to the neighbouring leg (`physics-fixes.spec.js` caught it),
> and a half-plane `inLane` test made a car beached far off the road read as
> "in the pit lane", breaking the beached-car auto-rescue. FITTING the lane to
> the room that already exists then gave no lane anywhere: the narrowest
> pit-side clearance across the window at **Monza is 2.4 m**, because the
> scenery places a **pit wall** there — which is exactly what a real circuit has,
> with the lane on its far side and its own entry road. A track that is one
> ribbon with one arc coordinate cannot express "go around the wall".
>
> So the shipped lane is **(c), longitudinal only**: inside the window a car that
> has CALLED a stop is speed-limited, and at the box it is held. **Pit loss is
> still emergent and still per-circuit** — window length over the limit, plus the
> stop — which was the property that made (b) attractive, and it measured
> **23.6 s at Monza**, inside the real 20-25 s band. What is lost is the picture:
> no lateral lane, no garages, no crew — and a car held in the box sits on the
> racing surface, so the field has to go around it. Pulling it off-line needs
> somewhere to be pulled to, which is the geometry (c) exists because we lack.
> `js/race/pit-lane.js` carries this as its header.

**(b) in detail.** A circuit def gains `pitZone: { s0, s1, side, laneW, boxFrac }`.
Inside that arc window, on that side:

- `Tracks.wallAt()` returns `hw + laneW` instead of the barrier — the pit lane
  fits **inside** the existing 9 m runoff on most circuits, so no geometry moves.
- `surfMu` does not fall off (the lane is tarmac).
- Speed is clamped to the limiter (a `vStd()` threshold: 80 km/h scaled, 60 at
  street circuits per §2.6).
- At `boxFrac`, the car is held for a deterministic stationary time; the compound
  changes; wear resets.

Pit loss then **falls out of the geometry**: lane length ÷ limited speed vs
racing that stretch. Tune `laneW`/`s0`/`s1` per circuit so the delta lands in the
20–24 s band, and Spa's cheap lane and Singapore's expensive one become real
properties of those circuits rather than table entries.

The control is a fourth tap button beside BOOST/OT/AERO: **PIT** arms, and the
next pit entry takes it. Arming (rather than a hard turn-in) is the mobile-correct
input, and it mirrors `xArmed`/`otArmed`, which already exist.

### 5.3 Layer 3 — AI strategy (Phase 3)

Replace `tyreClass`/`tyrePace` with a planner. Keep the determinism contract:
draw the plan **once at the green light** from `Career.hash(seed, round, driver)`,
exactly as `Reliability` draws retirements.

```
plan = argmin over {1-stop, 2-stop} x {compound sequences}  of  Σ lap_time + n·t_pit
```

Small enough to evaluate exhaustively for 2–3 stints (§2.8: 25 integers, tenths
of a second for the full MILP; we need far less). Then three reactive rules, in
value order:

1. **Take the free stop.** If a caution is flying (`RaceControl` already publishes
   the level) and the planned stop is within N laps, come in now. §2.7 says this
   is worth 8–12 s and it is the single biggest source of emergent drama.
2. **Respond to weather.** `docs/PHYSICS.md` names the open debt: *"A dry→rain arc
   punishes a slick with no recourse. That is what gives the choice teeth; it is
   also the first thing to revisit if rain feels unfair."* Pitting **is** the
   recourse. This phase closes that debt.
3. **Undercut and defend.** A car within the 1–3 lap undercut window of the car
   ahead (§2.8) pits early; the car ahead covers.

Spread across the field must stay **zero-mean against the player on average**, as
`tyrePace` deliberately is today, or difficulty silently shifts.

### 5.4 Layer 4 — thermal (Phase 4)

Two states, surface and bulk, per §2.2 — because one temperature cannot produce
both graining (cold/sliding, **recoverable**) and blistering (hot core, not).
Payoff, in order of how much it matters here:

- **Out-lap warm-up.** §2.8: a 0.4–0.6 s warm-up deficit nulls an undercut.
  Without it the undercut is free and always correct, which is a worse game.
- **Push vs manage.** Overheat the tyre and it goes off *now* and recovers if you
  back off — the one mechanic that gives a 5-lap race a tyre decision.
- **Compound character.** Softs switch on in a lap, hards take two or three.

This is also the layer that most rewards deferral: it needs the most tuning and
the least of it is legible on a phone screen.

### 5.5 What we deliberately do not model

Named so they are not re-litigated: per-corner temperature slices (iRacing NTM
runs 7–20 across the tread width — not a phone budget), tyre pressures, camber
and the wear-zone feedback ACC models, tread-depth-driven radius change,
refuelling (banned since 2010), and tyre-set allocation across a weekend (Apex has
no practice sessions to allocate across — see §6 for what replaces it).

---

## 6. The catalog problem, and an opportunity

The 30-row `tyres` catalog conflates two different axes. `hard` is
`cornering: 0.92` and `hypersoft` is `1.36` — a **48 % spread**, where a real
compound step is ~1 %. That spread is not a compound model; it is a **career
progression ladder** wearing compound names, and it is why `hypersoft` at 205 cr
is simply the best tyre with no trade at all.

Degradation fixes this for free. Give every row a **`life`** stat (fraction of
reference distance) inversely correlated with `cornering`, and the ladder becomes
a genuine trade: hypersoft is still the fastest tyre and now lasts a third as
long. This *improves* the catalog rather than complicating it — and
`tools/car/parts-ladder.mjs` needs a fifth axis to score it, with the guard
updated in the same commit (§3 constraint 4).

**The opportunity: ownership is the allocation rule.** Real F1 gives each driver
13 sets (§2.7). Apex has no practice sessions to allocate across — but career
already tracks **which parts you own**. Make a pit stop able to fit any compound
the player *owns*, and the career economy becomes the tyre allocation rule with no
new system at all. A player who bought only hypersofts has a fast car and no
strategy; a player who owns a hard and a soft has a choice. In a quick race,
every base row is available.

---

## 7. The player's experience

The design target: **a player who never opens a menu should still feel the tyre
go off, and a player who wants to plan should be able to.**

- **HUD**: a compound letter + wear bar in the bottom bar beside ENERGY. That is
  the whole minimum. `hud-dock` is a flex row and takes a sibling without
  coordinates (`index.html` carries the note explaining why); `shellNodes` is
  ratcheted at 1359 (slack 25), so this fits.
- **Race engineer** via the existing `announce()` priority banner: "TYRES AT 20 %",
  "BOX THIS LAP", "SAFETY CAR — BOX NOW", "RAIN IN 2 LAPS — INTERS READY". §2.11
  says this is the most-requested missing thing in shipped F1 games, and Apex
  already has the banner.
- **PIT tap** beside BOOST/OT/AERO, arming like them.
- **Pit-stop moment**: the limiter, the box, the crew, the release. §2.11 says
  this is the part reviewers call exhilarating — it deserves the camera.
- **Results**: a stint strip per driver, which `js/data/telemetry.js` already
  renders for real F1 data. Reuse the component.
- **Setting**: `TYRE WEAR: OFF / LIGHT / REAL` in RACE SETTINGS, mirroring
  `RELIABILITY`. **Ships OFF** — an existing save must not start losing races
  because the game updated (`js/race/reliability.js` makes exactly this argument).

---

## 8. What this closes, and what it costs

**Closes:**
- `docs/PHYSICS.md` §"Two things this does NOT do" — both of them.
- The named rain-unfairness debt (§5.3 rule 2).
- The tyre catalog's missing trade (§6).
- The dirty-air asymmetry: Apex models the grip cost of following but not the
  tyre cost (§2.10).
- The safety car currently has no strategic consequence at all.

**Costs:**
- A physics-characterization regeneration when the model ships ON, with the diff
  read and explained (`tests/specs/physics-characterization.spec.js` is explicit
  that regenerating is how you *say* a change was intentional).
- A `parts-ladder` model change and its guard.
- 42 circuit defs eventually want a `severity` and a `pitZone`. Both default
  sanely, so this is incremental, and `tools/track/verify-track.cjs` is a 2 s
  check per circuit.
- Multiplayer snapshot growth (compound id + wear byte at 20 Hz — negligible).

---

## 9. Verification plan

Per `AGENTS.md` §Verification, scaled to each phase:

| Phase | Runs |
|---|---|
| Model rules (pure) | `tests/unit/tyre-model.test.mjs` — wear curve, life normalisation, cliff knee, zero-mean AI spread; in `toolingFast` (it is rules over numbers, no DOM) |
| Catalog | `tests/unit/parts-ladder.test.mjs` updated for the fifth axis |
| Driving | `tests/specs/tyre-wear.spec.js` — a driven stint shows monotone wear, a measurable lap-time drift, and **bit-identical output at OFF** |
| Grip seam | `tests/specs/physics-characterization.spec.js` — green at OFF before anything else |
| Pit lane | `node tools/track/verify-track.cjs <id>` per touched circuit, then that circuit's foundation spec |
| AI | `tools/check/ai-race.mjs` for strategy spread and field pace |

`npm run test:guards` before every commit; one browser group per batch via
`tools/ci/test-bg.mjs`; never more than two browser groups per change, with the
rest named as not-run in the PR.

---

## 10. Phase order

**P1 — the tyre goes off.** `js/physics/tyre-model.js` (`TyreModel.create(G)`),
wear + grip + fuel burn, `life` on the catalog, the `TYRE WEAR` setting, the HUD
widget, `__apex.tyres()` and `physState()` fields. **No pit lane.** This alone
makes the compound choice real at 25+ laps and is independently shippable.

**P2 — the stop.** `pitZone` in the circuit defs and `wallAt`, `js/race/pit-lane.js`,
the limiter, the PIT control, the box sequence, the camera. Pit loss measured and
tuned to 20–24 s.

**P3 — the field races strategy.** The planner replaces `tyreClass`/`tyrePace`;
free stops under caution; weather response. This is the phase where the feature
becomes *drama* rather than a resource bar.

**P4 — thermal.** Surface and bulk, warm-up, graining recovery, per-axle wear.

**P5 — depth.** Stint strips in results, engineer suggestions, per-circuit
severity authored from §2.2's real spread, career tyre allocation via ownership.

P1 is the only phase that touches the grip seam, so it is the only one that costs
a characterization regeneration. P2–P5 are additive.

---

## 11. Decisions needed before P1

1. **Live or pre-planned?** Recommend **live** — pick a compound in the garage,
   decide stops on the fly with engineer prompts. A pre-race strategy screen
   (F1 25's model, §2.11) is a manager-game affordance and a second screen to
   maintain. *Recommended: live.*
2. **Mandatory two-compound rule?** Recommend **no, not in v1.** If the stop is
   not worth making on its own merits, the model is wrong — a rule forcing it
   would hide that. Reconsider once P3's AI is racing it. *Recommended: out.*
3. **Ship default?** Recommend **OFF**, matching `RELIABILITY`, and revisit once
   P3 lands and the field races strategy properly. *Recommended: OFF.*
4. **One scalar or per-axle?** Recommend **one scalar in P1**, per-axle in P4 with
   the thermal layer, since front-limited/rear-limited (§2.4) only means something
   once temperature exists. *Recommended: scalar.*
5. **Pit lane (b) or (c)?** ~~Recommend **(b), the driveable `pitZone`**~~ —
   **SETTLED BY MEASUREMENT: (c).** (b) was built and measured badly on two
   circuits exactly as the fallback clause anticipated; see the errata in §5.2.
   Pit loss stayed emergent, which was the whole reason (b) was preferred.
6. **Does the catalog become compounds, or do compounds sit on top of it?**
   Recommend **the fitted row IS the compound**, with a stop able to fit anything
   owned (§6). The alternative — an S/M/H axis multiplied by a catalog tier — is
   two systems where one will do. *Recommended: the row is the compound.*
