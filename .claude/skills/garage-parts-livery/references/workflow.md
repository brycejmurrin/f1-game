# Garage workflow, ERS ids, mistakes

Load this when adding a catalog option, wiring a SIGNATURE mesh, or chasing
career lock / ERS behaviour.

## Contents
- ERS is not a low/medium/high tier
- Career ownership is a write/UI gate
- Workflow
- Common mistakes

## ERS is not a low/medium/high tier

The `ers` category in `js/car/parts.js` is a flat list of named deploy maps.
There is **no option called "medium."** Real ids include `standard` (0-cost
baseline), `regen_plus`, `harvest`, `split_deploy`, `mgu_k_max`, `deploy`,
`thermal_max`, `torque_fill`, `overtake_focus`, `race_mode`, `full_attack`,
`overcharge`, `supercapacitor`, `harvest_max`, `conduit_twin`, `burst_map`,
plus one `SIGNATURE` clone per team, cost/stat-identical to its `equivalent`.
Signature ids are NOT a `sig_<team>_<category>` formula — they are named for
the thing (`sig_audi_quattro`, `sig_alpine_boost`), and the team segment is not
always the team id (`sig_rb_street`, `sig_aston_tunnel`).
Do not invent an id — grep `js/car/parts.js`, or point the
player at `cost`/`desc` ("cheapest recovery-biased option") instead of a name.

`Parts.ersProfile` only sets the 0..1 axes. Battery dynamics
(`drainFor`/`regenFor`/`otTimeFor` in `js/game.js`) consume them.
Verify in-race via [agent-view state hooks](../../agent-view/references/state.md) / `__apex.physState()` (`ersDeploy`,
`ersRegen`, `drain`, `regen`, `otTime`). Measured deltas:
`../../../../docs/CAREER.md` (`harvest` vs `standard` vs `overcharge`).

## Career ownership is a write/UI gate

`Parts._resolve` / `getMods` / `getCost` are **career-blind**. The garage greys
locked rows via `Parts.isOptionAvailable(opt, team, owned)` where `owned` comes
from `Career.owned()` / `G.careerOwned()`. Do not thread ownership into physics
resolution.

## Workflow

1. **Read the contract.** `../../../../docs/CAREER.md` and the category block in
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
   (studio-only — see [playwright-probe car studio](../../playwright-probe/references/car-studio.md)).
6. **Visual verify** (server on 3456):
   ```sh
   node tools/car/render-car.mjs --team=ferrari --preset=livery
   node tools/car/render-car.mjs --team=ferrari --views=tail
   # Own static server; dead DISPLAY cleared by launchChromium (see garage-angles.md)
   node tools/shot/garage-angles.mjs --team=ferrari --views=spine --out=scratch/renders/garage-ferrari
   node tools/car/audit-parts.mjs --cats=aero
   ```
   `--preset=` overrides `--views=` — do not combine them. Or
   `tools/carview.html?team=mclaren&aero=extreme`.

   **`garage-angles` is a MATRIX, and the boot is what costs** (the browser boot dwarfs each extra shot). So
   compare inside ONE run rather than across runs — every axis takes a comma
   list and the walk nests team → paint → parts → view → framing, cheapest
   innermost:
   ```sh
   node tools/shot/garage-angles.mjs --team=ferrari,mclaren --part.engine=all \
     --livery=default --spine-side=logo,duo --views=hero,side --zoom=0,8 --plan
   ```
   `--plan` prints the matrix as JSON and exits before Chromium — do that
   first, the product multiplies fast. (It is `--plan`, not `--dry-run`: any bare unknown flag,
   `--dry-run` included, exits 2 before Chromium. A `--field=value` or `--part.*` typo is validated
   IN-PAGE, after the boot — so run `--plan` first.)
   Parts are `--part.<category>=<id>[,<id>]`, one flag per category, with
   `--part.<category>=all` expanding to the catalog; ids are checked against
   `isOptionAvailable` for the team being shot, because a part locked to
   another team resolves to the DEFAULT
   silently (the trap that made an early audit report 100+ dead options).
   A `--spine-side` design is applied on top of the `--livery` it is crossed
   with, so a design can be seen on every paint job, not just the team default.
   **There is no "rear wing" category.** Wings live in the `aero` option list;
   a new rear-wing part is an `aero` row (`cost`, stat multipliers, `visual`
   with `rearSweep`/`rearTaper`/`beam`/`swan`/`tvane`, `visualTier`) that
   `Car3D.build` (`js/car/car3d.js`, `car-mesh.js`) reads. Studio shot:
   `node tools/car/render-car.mjs --team=mclaren --preset=wing` (needs :3456;
   `--help` prints its usage; full options in the file header).
   **Front wing** is also the `aero` category (`frontSweep`/`frontTaper`/`frontRise` in `visual`).
   **Look-only vs new stats — decide first.** A new wing LOOK (no physics change) is a `STYLES` row in
   `js/car/parts.js` — a 6-tuple `[category, equivalent, id, label, desc, visualOverrides]` that copies
   cost and all stats from its `equivalent` and is open to every team (`style_aero_spoon`,
   `style_aero_twinplane` are the pattern); preview with the `build-viewer.mjs --sheet=parts:aero:<team>
   --match=^style_` line above `STYLES`. Only NEW stats mean a full `CATALOG` row, which is a balance
   change `parts-ladder` judges.
   **A new visual field** (say a new `fw*` key) needs THREE edits: an entry in
   `VISUAL_FIELD_REGISTRY.geometry.<category>` (`parts.js`), a consumer in `car-body-geom.js`/`car3d.js`,
   and a row in the `PREVIEW` list of `tests/unit/aero-preview-fields.test.mjs` (absent = the shipped mesh).
   **A part carries no finish**: finish (`gloss`/`satin`/`chrome`) is a livery/team field
   (`Car3D.FINISH_SURFACE`, livery-fields.md) — do not invent a per-part finish field.
   New-option checklist: `id`, `label`, `cost`, `desc`, stat multipliers, `visual` (fields in
   `VISUAL_FIELD_REGISTRY`), `visualTier`; a team SIGNATURE clone needs `equivalent` (same cost/stats).
   Browser shots below: AFTER angles only (SKILL.md § BEFORE pack).
7. **Node gates before any browser** (no server, edit-loop safe): `npm run test:garage-unit`
   (aero-preview-fields, aero-shapes-d3c, front-wing-decal, parts-locked-equivalent,
   `parts-distinct-mesh` — every option must change the hashed mesh — and the livery units); plus
   `node --test tests/unit/parts-ladder.test.mjs` (a new-stats row must be worth buying: not dominated on
   all four stats) and `factory-ai-setup`. `parts-visual-distinctness` (the STYLE/SIGNATURE cost-and-stat
   parity pin) runs only in `test:sweeps-parts`.
   Browser specs: `tests/specs/parts-catalog.spec.js` (12 tabs),
   `parts-physics.spec.js` (mesh-hash collision).
8. **Test and ship.** ONE spec locally, in the background:
   `node tools/ci/test-bg.mjs --spec tests/specs/parts-catalog.spec.js` (or `parts-physics.spec.js`); a whole
   group (`car`, or `modes` when you changed research locks or garage ownership UI — there is no
   `test:career`) runs on the pushed branch: `node tools/ci/remote-group.mjs car` (AGENTS.md verification table). Check the shell via `node tools/gen/gen-shell.mjs --check` ([shell/cache](../../check-changes/references/bump.md): `?v=dev`, no bump)
   before commit.

## Common mistakes

- Treating `Parts.CATALOG` as keyed by id — order matters; iterate the array.
- Giving SIGNATURE options different cost or stat multipliers (`parts-visual-distinctness` fails, sweeps tier only).
- Hand-writing a full `aero` CATALOG row for a look-only wing — that is a `STYLES` row (step 6).
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
