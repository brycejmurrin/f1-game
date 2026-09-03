# Apex 26 — the parts system (`js/car/parts.js`)

Twelve upgrade categories, a 780 cr budget, and the measured effect of each on
the four stats. Extracted from the agent brief. `AGENTS.md` keeps only the rules another
subsystem has to respect.

---

**THE ERS PART RUNS THE BATTERY.** Every category moves the four stats
(`speed`→`vmax`, `accel`→`ACCEL`, `cornering`→`LAT_MAX`, `braking`→`BRAKE`), and
all twelve have real spread — but ERS's options *describe* battery behaviour
("harvests extra energy under braking", "maximum recovery window", "immediate
deployment") and for a long time did none of it. `Parts.ersProfile(setup, team)`
returns two 0..1 axes read from the bias the catalog already encodes
(`deploy` ← the option's `accel`, `regen` ← its `speed`), and they drive
`drainFor`/`regenFor`/`otTimeFor`/`otCoolFor` in game.js. Deriving rather than
authoring new fields keeps the SIGNATURE clones consistent for free, since they
copy those stats. Measured:

| ERS part | deploy / regen | boost lasts | recharge | OT push / cooldown |
|---|---|---|---|---|
| `harvest` | 0.00 / 0.43 | 3.8 s | 5.4 s | 3.2 s / 14.0 s |
| `standard` | 0.22 / 0.29 | 4.3 s | 5.9 s | 3.6 s / 12.9 s |
| `overcharge` | 1.00 / 1.00 | 7.1 s | 4.0 s | 5.2 s / 9.0 s |

AI cars use the team's `FACTORY_PRESETS` aero/ERS (SIGNATURE equivalents
already differ). A car with no resolved setup still sits at the midpoint.
`physState()` reports `ersDeploy`, `ersRegen`, `drain`, `regen`, `otTime`,
`otCool`.

`Parts.CATALOG` — an **array** of 12 category objects (ordered, not keyed by id):
`engine`, `aero`, `suspension`, `brakes`, `tyres`, `ers`, `gearbox`, `fuel`,
`exhaust`, `floor`, `cockpit`, `wheels`. Each
category is `{ id, label, options:[…] }`; each option has
`{ id, label, cost, desc, speed?, accel?, cornering?, braking?, supplier? }`.
Budget = 780 cr (`Parts.BUDGET`) for a non-career garage build; in career the
cap is `Career.budget()` instead (works-car cost × the RAISE THE CAP multiplier,
clamped by the catalog-derived `budgetCap()` — see docs/CAREER.md) and the
unlimited toggle is ignored (`js/garage/setup-sheet.js`). `Parts.getMods(setup, team)`
takes a `{id, engine}` team object and returns `{speed, accel, cornering,
braking}` multipliers. Supplier-exclusive options (e.g. `manu_mercedes`) are
only shown when `team.engine` matches. `unlimitedBudget` (localStorage
`apex26.unlimitedBudget`) removes the 780 cr cap outside career.

Every option also carries a parametric `visual` **recipe** consumed by `Car3D`
(`getVisualTiers().._visual`); `VISUAL_FIELD_REGISTRY` names the one consumer of
each recipe field, and `tests/specs/parts-physics.spec.js` fails on an unregistered or
stale field, a duplicate recipe within a category, or an engine that repeats
another's six-field bodywork shape. The newer STRUCTURE knobs are
`aero.plate/casc/swan/tvane` (endplate profile, cascade count, swan-neck mount,
T-wing), `aero.duct/board/slot` (2026 upper pod ram, in-wash wakeboard, floor
mouse-hole), `engine.chimney`, `brakes.scoop`, `ers.conduit`, `fuel.filler`,
`exhaust.pipes/bore/flare/wastegate/wrap` and `floor.fences/fenceH/skid/edgeLip`
— each defaults to the shipped geometry, so an option written before them is
unchanged. EXHAUST and FLOOR took over geometry that used to be hardcoded (the
tailpipe derived from `engine.twin`, and a fixed five-fence floor edge); both
still derive exactly that when their recipe leaves the field at its default.

Prefer knobs that change WHAT EXISTS over knobs that scale what is already
there. A category whose recipe is all scalars gives every team the same part at
a different size — `tyres.shoulder`, `brakes.discFace` and `suspension.rocker`
exist because those three read as near-identical across the grid without them.

**SIGNATURE options** (`tag: "SIGNATURE"`, `teams: [id]`) are cost- and
physics-identical clones of the universal option named in `equivalent` — they buy
a distinct mesh, never an advantage, and the test suite enforces that. Every team
fields one in every category via `FACTORY_PRESETS`, except the four on a
manufacturer-exclusive FACTORY power unit (that unit is already team-unique).
`FACTORY_PRESETS` drives AI meshes and the works aero/ERS the AI now runs, and
seeds a new career save's `owned` + `fitted` build via `Parts.getFactorySetup`
(`js/career/career.js`); a non-career garage build still goes through the
garage, not this table.

---
