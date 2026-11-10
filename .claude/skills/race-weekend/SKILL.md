---
name: race-weekend
description: "Use when changing tyre wear/compounds (tyre-model.js), pit stop time and pit lane (pit-lane.js), the strategy HUD, quali or results sheets, start lights, weather, or sporting rules (two-compound rule, penalty). Not handling → tune-physics; flags → race-incidents-control; calendar → season-mode."
---

# Race weekend — tyres, pits, quali, start, weather, regs

The rules modules that turn a lap into a weekend. Each is one
`create(G)` file (game.js stays ratcheted); most are pure enough for a VM test.

| File | Global | Owns |
|---|---|---|
| `js/physics/tyre-model.js` | `TyreModel` | wear `LEVELS` (`off`/`light`/`real`, `G.raceTyreWear`), `gripMul`, `spent`, `lapsLeft`, `planLaps` (life scales with the race DISTANCE), `fit` (writes the stint log), fuel burn |
| `js/race/pit-lane.js` | `PitLane` | the driven lane (a state, not a cutaway): limit, box, `lossS`, `estimate`, the AI's `planFor`/`replan`, `twoCompoundApplies()`/`compoundDue()` (instance; `twoCompoundRule` is closure-private); lane geometry incl. the curvature use `entryRunM` lives in `js/race/pit-geom.js` (`PitGeom`, re-exported), classed **surface** in docs/PHYSICS.md's legitimate-columns table |
| `js/track/core/pit.js` | `TrackPit` | the pit-complex geometry bands every consumer reads (circuit shape → new-track) |
| `js/race/quali-model.js` | `Quali` | one flying lap vs the simulated field: `simulate`, `rows`, `referencePole` |
| `js/race/quali-net.js` | `QualiNet` | VS FRIEND quali gate (rival times on NetPlay `EV.QUALI`) |
| `js/race/start-lights.js` | `StartLights` | five gantry lamps as one-frame flares (`lampsFor`) |
| `js/race/flying-start.js` | `FlyingStart` | quali/TT run-up: dropped in before the line, `HANDOVER_S` of AI driving, never timed |
| `js/race/weather-arc.js` | `WeatherArc` | live weather changes and the optional arc along `LADDER` dry → wet → rain |
| `js/race/sporting-regs.js` | `SportingRegs` | FIA 2026 SR: two dry compounds (`applyCompoundRule`: DSQ, or `SUSPENDED_PEN_S` added to `c.penalty` when the race ended suspended), no passing under SC/VSC (`createPassWatch`, `passPenaltyS`), championship-order grid |
| `js/ui/hud-strategy.js` / `hud-tyres.js` | `HudStrategy` / `HudTyres` | opt-in STRATEGY panel (TYRES / PIT LOSS / NEXT / UNDERCUT, race + wear only); cold/ok/hot tyre band |
| `js/ui/quali-sheet.js` / `results-sheet.js` / `results-story.js` | `QualiSheet` / `GameResultsSheet` (lazy; `GameResults` in `results-boot.js` is the stub game.js calls) / `ResultsStory` | DOM only — paint what the models classified, to the thousandth (`Dom.fmtLap`) |

Design evidence: `docs/research/TYRE-STRATEGY-DESIGN.md`, `docs/research/PIT-*.md`.

## Where things live (weekend rules ↔ `js/game.js`)

Rules modules stay out of `game.js`; the entry file **wires** them. Open these symbols first:

- `ensureRaceSession()` (`lazyBundles`) loads pit/radio/reliability before grid setup;
  `onRaceSessionReady` recreates `pits = PitLane.create(G)`. `pits.think` and the human pit UI
  read the same `PitLane` state the AI `planFor` uses.
- `wxArc` / `trackWetness()` / `gripMult(c)` — weather arc vs `TyreModel` wetness for grip and pits.
- `gridFromQuali()` / `openQuali()` — whether a race grids from quali.
- The finish (`endRace`): `cmpApplies = pits.twoCompoundApplies()` read AT THE FLAG, then the
  `cmpOn` gate (find it with apex-lsp / grep `cmpOn` in game.js), then `SportingRegs.applyCompoundRule(cars, {applies, suspended})`
  (`suspended` = ended under the red flag, never resumed: a time penalty, not a DSQ; realRace WATCH skips it).

SC/VSC pass penalty (`SportingRegs.createPassWatch`) is here; SC/VSC DEPLOYMENT, flags, blue-flag calls,
`raceCtl`, finish order/delay, scripted holds → **race-incidents-control**. Sprint legs inside a Season → season-mode.

## Hooks (live page)

Full argument list: `__apex.agentHelp()` (runtime manifest) or `docs/DEBUG-HOOKS.md`.

```js
__apex.tyres()                       // compound, life, wear, grip cost; {field:true} every car
__apex.tyres({level:"real", fit:"hard"})   // wear on + a set fitted the way a stop does
__apex.pit()                         // lane geometry, limit, this car's state; {car:i}; {arm:true} calls the stop
__apex.weatherArc()                  // live arc or null; weatherArc("dry","rain",60) arms one
```

No hook reads the two-compound state. Probe it: `__apex.tyres({level:"real"})` + a dry race of
≥ `TWO_COMPOUND_MIN_LAPS` (closure-private in `js/race/pit-lane.js`), one compound, finish; the console shows `DSQ car=… why=…` (`Log.info("game", …)`), or for a suspended race `pen=…s` and `suspended` on the `Race finished` line.

Career qualifying flow or DNF settlement money → **career-mode**. For verification
selection and browser ownership, follow [AGENTS.md §Verification](../../../AGENTS.md#verification--scale-it-to-the-change).

## Tests

```sh
node --test tests/unit/tyre-model.test.mjs tests/unit/tyre-strategy-vm.test.mjs tests/unit/pit-lane.test.mjs \
  tests/unit/pit-lane-vm.test.mjs tests/unit/sporting-regs.test.mjs tests/unit/weather-arc-plan.test.mjs \
  tests/unit/weather-arc-rain.test.mjs tests/unit/flying-start.test.mjs tests/unit/start-lights.test.mjs \
  tests/unit/hud-strategy.test.mjs tests/unit/hud-tyres.test.mjs tests/unit/quali-persist.test.mjs
APEX_VM_PAGE=1 node --test tests/specs/pit-lane.spec.js   # NO browser: pit-lane.spec is VM-adapted (test:vm-page-b)
```

The list above can drift: `node tools/ci/pick-tests.mjs` / `select-specs.mjs` are authoritative.
Browser specs (`quali`, time-trial, real-race) are never run locally (AGENTS.md rule 5): the PR's CI
runs the picked groups; a whole group on the pushed branch is `node tools/ci/remote-group.mjs <group>`
(group names: `pick-tests.mjs` output, `--bg` prints the commands).

## Pitfalls

- Tyre life is a fraction of the SCHEDULED distance, not laps: a 3-lap race is
  tyre-free by design. Per-compound life comes from `lifeOf()` / `deriveLife()`
  (`LIFE_MID`/`LIFE_K`/`LIFE_MIN`/`LIFE_MAX` in `tyre-model.js`, a row's own
  `life` in `js/car/parts.js` wins). Speed comparisons: AGENTS.md §Physics.
- "Two-compound rule not enforced": the test is `G.pits.twoCompoundApplies()` =
  `enabled()` (a lane AND tyre wear on) && `twoCompoundRule(lapsTarget)` (laps ≥
  `TWO_COMPOUND_MIN_LAPS`, dry tread from `TyreModel.treadFor(raceWeather, trackWetness())` judged
  at the flag, not a season sprint leg), shared with the AI planner; then the finish's `cmpOn`
  (not NetPlay, practice or duel; ≥ 1 classified finisher or a suspended race). Most likely cause: TYRE WEAR off,
  persisted as `apex26.tyreWear`. A spec that ends with `finishRace()` meets it via `tyres({fit})`.
- Quali/results sheets never compute order; a wrong classification is the
  model (`Quali.rows`, `RaceControl.finishOrder`), not the DOM.
- Sprint points / quali-on-off inside a career save → career-mode (a standalone Season → season-mode).
