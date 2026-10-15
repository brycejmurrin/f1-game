---
name: race-weekend
description: "Use when tyre wear/compounds (tyre-model.js), pit stops or the pit lane (pit-lane.js), the STRATEGY/tyre HUD, quali or results sheets, start lights, flying start, the weather arc or sporting regs (two-compound rule, SC passes) change. Handling → tune-physics; flags/SC → race-incidents-control; calendar → season-mode."
---

# Race weekend — tyres, pits, quali, start, weather, regs

The rules modules that turn a lap into a weekend. Each is one
`create(G)` file (game.js stays ratcheted); most are pure enough for a VM test.

| File | Global | Owns |
|---|---|---|
| `js/physics/tyre-model.js` | `TyreModel` | wear `LEVELS` (`off`/`light`/`real`, `G.raceTyreWear`), `gripMul`, `spent`, `lapsLeft`, `planLaps` (life scales with the race DISTANCE), `fit` (writes the stint log), fuel burn |
| `js/race/pit-lane.js` | `PitLane` | the driven lane (a state, not a cutaway): limit, box, `lossS`, `estimate`, the AI's `planFor`/`replan`, `twoCompoundRule` |
| `js/track/core/pit.js` | `TrackPit` | the pit-complex geometry bands every consumer reads (circuit shape → new-track) |
| `js/race/quali-model.js` | `Quali` | one flying lap vs the simulated field: `simulate`, `rows`, `referencePole` |
| `js/race/quali-net.js` | `QualiNet` | VS FRIEND quali gate (rival times on NetPlay `EV.QUALI`) |
| `js/race/start-lights.js` | `StartLights` | five gantry lamps as one-frame flares (`lampsFor`) |
| `js/race/flying-start.js` | `FlyingStart` | quali/TT run-up: dropped in before the line, `HANDOVER_S` of AI driving, never timed |
| `js/race/weather-arc.js` | `WeatherArc` | live weather changes and the optional arc along `LADDER` dry → wet → rain |
| `js/race/sporting-regs.js` | `SportingRegs` | FIA 2026 SR: two dry compounds (`applyCompoundRule`), no passing under SC/VSC (`createPassWatch`, `passPenaltyS`), championship-order grid |
| `js/ui/hud-strategy.js` / `hud-tyres.js` | `HudStrategy` / `HudTyres` | opt-in STRATEGY panel (TYRES / PIT LOSS / NEXT / UNDERCUT, race + wear only); cold/ok/hot tyre band |
| `js/ui/quali-sheet.js` / `results-sheet.js` / `results-story.js` | `QualiSheet` / `GameResults` / `ResultsStory` | DOM only — paint what the models classified, to the thousandth (`Dom.fmtLap`) |

Design evidence: `docs/research/TYRE-STRATEGY-DESIGN.md`, `docs/research/PIT-*.md`.

## Where things live (race rules ↔ `js/game.js`)

Weekend **rules modules** stay out of `game.js`; the entry file **wires and classifies**:

- `ensureRaceSession()` (`lazyBundles`) loads pit/radio/reliability before grid setup;
  `onRaceSessionReady` recreates `pits = PitLane.create(G)` and hooks race session deps.
- `raceCtl = RaceControl.create(G)` — per-tick `updateCaution` / `applyCaution`; `cautionInfo()`
  merges `SportingRegs.createPassWatch` (SC pass-back) for the HUD flag chip.
- `scWatch` / `scPassCall`, `blueWatch` / `blueFlagCall` — sporting-reg penalties surfaced via `announce()`.
- `realRace.update(dt)` — scripted race / WATCH transport; `realRace.owns(c)` gates player `raceT` and recover.
- Finish pipeline (~`classify` helpers): `SportingRegs.applyCompoundRule`, `RaceControl.finishOrder`,
  `RaceControl.classify`, `RaceControl.finishDelay` + `postFinish` solo wait; `holdCaution` for scripted flags.
- `wxArc` / `trackWetness()` / `gripMult(c)` — weather arc vs `TyreModel` wetness for grip and pits.
- `pits.think` / human pit UI read the same `PitLane` state the AI `planFor` uses.

Domain edits: the `js/race/*` and `js/physics/tyre-model.js` files above; flags/debris/episode
owners → **race-incidents-control**. Do not grep `game.js` blindly — open these symbols first.

## Hooks (live page)

```js
__apex.tyres()                       // compound, life, wear, grip cost; {field:true} every car
__apex.tyres({level:"real", fit:"hard"})   // wear on + a set fitted the way a stop does
__apex.pit()                         // lane geometry, limit, this car's state; {car:i}; {arm:true} calls the stop
__apex.weatherArc()                  // live arc or null; weatherArc("dry","rain",60) arms one
```

## Tests

```sh
node --test tests/unit/tyre-model.test.mjs tests/unit/tyre-strategy-vm.test.mjs tests/unit/pit-lane.test.mjs \
  tests/unit/pit-lane-vm.test.mjs tests/unit/sporting-regs.test.mjs tests/unit/weather-arc-plan.test.mjs \
  tests/unit/weather-arc-rain.test.mjs tests/unit/flying-start.test.mjs tests/unit/start-lights.test.mjs \
  tests/unit/hud-strategy.test.mjs tests/unit/hud-tyres.test.mjs tests/unit/quali-persist.test.mjs
node tools/ci/test-bg.mjs physics-core   # BROWSER: pit-lane.spec.js; background it (AGENTS.md rule 4)
node tools/ci/test-bg.mjs modes          # BROWSER: quali.spec.js, time-trial.spec.js, real-race.spec.js
```

Prefer one spec over its group (`npm test -- tests/specs/pit-lane.spec.js`).

## Pitfalls

- Tyre life is a fraction of the SCHEDULED distance, not laps: a 3-lap race is
  tyre-free by design. Compare speeds through `vTop()`/`vStd()` (PACE scales).
- The two-compound test is `PitLane.twoCompoundRule`, shared with the AI
  planner; a spec that ends with `finishRace()` meets it via `tyres({fit})`.
- Quali/results sheets never compute order; a wrong classification is the
  model (`Quali.rows`, `RaceControl.finishOrder`), not the DOM.
- Sprint points / quali-on-off for a Season → season-mode; inside a career
  save → career-mode. Safety car, flags, retirements → race-incidents-control.
