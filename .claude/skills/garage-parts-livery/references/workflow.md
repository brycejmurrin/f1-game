# Garage workflow, ERS ids, mistakes

Load this when adding a catalog option, wiring a SIGNATURE mesh, or chasing
career lock / ERS behaviour.

## ERS is not a low/medium/high tier

The `ers` category in `js/car/parts.js` is a flat list of named deploy maps.
There is **no option called "medium."** Real ids include `standard` (0-cost
baseline), `regen_plus`, `harvest`, `split_deploy`, `mgu_k_max`, `deploy`,
`thermal_max`, `torque_fill`, `overtake_focus`, `race_mode`, `full_attack`,
`overcharge`, `supercapacitor`, `harvest_max`, `conduit_twin`, `burst_map`,
plus one `SIGNATURE` clone per team (`sig_<team>_ers`, cost/stat-identical to
its `equivalent`). Do not invent an id — grep `js/car/parts.js`, or point the
player at `cost`/`desc` ("cheapest recovery-biased option") instead of a name.

`Parts.ersProfile` only sets the 0..1 axes. Battery dynamics
(`drainFor`/`regenFor`/`otTimeFor`/`otCoolFor` in `js/game.js`) consume them.
Verify in-race via **agent-view** `references/state.md` / `__apex.physState()` (`ersDeploy`,
`ersRegen`, `drain`, `regen`, `otTime`, `otCool`). Measured deltas:
`docs/PARTS.md` (`harvest` vs `standard` vs `overcharge`).

## Career ownership is a write/UI gate

`Parts._resolve` / `getMods` / `getCost` are **career-blind**. The garage greys
locked rows via `Parts.isOptionAvailable(opt, team, owned)` where `owned` comes
from `Career.owned()` / `G.careerOwned()`. Do not thread ownership into physics
resolution.

## Workflow

1. **Read the contract.** `docs/PARTS.md` and the category block in
   `js/car/parts.js`. New options need `visual` + registry if they change
   geometry; SIGNATURE entries must point at a valid `equivalent`.
2. **Edit catalog → derive, don't duplicate.** Stat multipliers flow through
   `resolveSetup`; ERS/aero axes re-scale from the category span. Do not add
   parallel battery or wing tables.
3. **Wire visuals.** Update `opt.visual` and confirm `Car3D` consumes the field.
   For SIGNATURE, the mesh differs but `getMods` matches the equivalent.
4. **Career UI only for ownership.** Locked-until-researched rows get the
   `locked` class via `Parts.isOptionAvailable(opt, team, G.careerOwned())` —
   not `_resolve` or a bare `Career.isOwned(...)`. Fitting still goes through
   `getTeamParts` / `saveTeamParts`; research through `Career.research(opt)`.
5. **Livery/finish.** Schemes in `js/car/liveries.js`; `fin`/`finArt` for the
   shark fin. Test chrome with `finish: "chrome"`, not `--refl=1` in the viewer
   (studio-only — see **car-viewer**).
6. **Visual verify** (server on 3456):
   ```sh
   node tools/car/render-car.mjs --team=ferrari --preset=livery --views=tail
   node tools/audit-parts.mjs --cats=aero
   ```
   Or `tools/carview.html?team=mclaren&aero=extreme`.
7. **Test and ship.** `node tools/test-bg.mjs car` for catalog/physics/visual
   recipes; `node tools/test-bg.mjs modes` when you changed research locks or
   garage ownership UI (there is no `test:career`). Bump via `node tools/bump-cache.mjs --apply`
   before commit.

## Common mistakes

- Treating `Parts.CATALOG` as keyed by id — order matters; iterate the array.
- Giving SIGNATURE options different cost or stat multipliers (tests fail).
- Using `FACTORY_PRESETS` to change AI pace — meshes only; AI uses no parts →
  midpoint aero/ERS.
- Threading `owned` into `_resolve` / `getMods` — breaks non-career callers.
- Adding ERS/aero literals instead of deriving from catalog spans.
- Forgetting `visual` registry → silent geometry drift or
  `tests/specs/parts-physics.spec.js` failure.
- Confusing `--refl` (viewer studio gloss) with `finish: "chrome"`.
- Setting `finArt` equal to `fin` — tail graphic disappears.
- Using livery id `chrome` as chrome finish — it is a gloss palette named
  "Chrome".
- Editing `js/car/*.js` without a cache bump.
