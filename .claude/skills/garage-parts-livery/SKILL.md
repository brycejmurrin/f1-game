---
name: garage-parts-livery
description: Use when editing the GARAGE parts catalog, livery/finish/shark fin, SIGNATURE or FACTORY_PRESETS meshes, ersProfile/aeroLoad, career owned-part UI, Car3D visual recipes, or validating part geometry and physics in Apex 26.
---

# Garage — parts, livery, and car mesh

The GARAGE screen (`#carsetup`, `js/game/setup-ui.js`) is where the player picks
**who** they are, **what** they drive (12 part categories + budget), and **how**
it looks (livery, number, paint finish). Parts rules live in `js/car/parts.js`;
paint/decals in `js/car/liveries.js` + `js/car/liverytex.js`; geometry in
`js/car/car3d.js`. Physics consumption is in `js/game.js`.

## Overview

`Parts.CATALOG` is an **ordered array** of 12 categories — not a keyed map.
Each category has `{ id, label, options:[…] }`; each option carries
`{ id, label, cost, desc, speed?, accel?, cornering?, braking?, visual?, … }`.
Budget = **600 cr** (`Parts.BUDGET`). `Parts.getMods(setup, teamEngine)` returns
four stat multipliers; `Parts.getVisualTiers()` feeds `Car3D.build`.

**SIGNATURE** options (`tag: "SIGNATURE"`, `teams: [id]`) are cost- and
physics-identical clones of the universal option in `equivalent` — they buy a
distinct mesh, never an advantage. **`FACTORY_PRESETS`** drives **AI meshes
only** — never AI physics or player saves.

**ERS and aero** are derived from the catalog, not separate tables:
`Parts.ersProfile(setup, team)` → `{ deploy, regen }` (0..1 axes from option
`accel`/`speed`); `Parts.aeroLoad(setup, team)` → 0..1 from the aero option's
`cornering`. A car with **no parts** (every AI) sits at the **midpoint** of both
axes — active-aero trade and battery behaviour are defined relative to that.

**There is no ERS option called "medium."** The `ers` category
(`js/car/parts.js`) is a flat, unordered list of named deploy maps, not a
low/medium/high tier — real ids include `standard` (the 0-cost baseline),
`regen_plus`, `harvest`, `split_deploy`, `mgu_k_max`, `deploy`, `thermal_max`,
`torque_fill`, `overtake_focus`, `race_mode`, `full_attack`, `overcharge`,
`supercapacitor`, `harvest_max`, `conduit_twin`, `burst_map`, plus one
`SIGNATURE` clone per team (`sig_<team>_ers`, cost/stat-identical to its
`equivalent`). Don't invent or assume an id — grep `js/car/parts.js` for the
current list, or point the player at picking by `cost`/`desc` (e.g. "cheapest
recovery-biased option" or "highest accel for the budget") instead of a
specific name.

**Verify ERS behaviour in-race via `debug-state` / `physState()`**, not just
the catalog numbers — `Parts.ersProfile` only sets the 0..1 axes; the actual
battery dynamics (`drainFor`/`regenFor`/`otTimeFor`/`otCoolFor` in `js/game.js`)
consume them. `__apex.physState()` reports `ersDeploy`, `ersRegen`, `drain`,
`regen`, `otTime`, `otCool` for the live car — cross-check a part change there,
not just against the catalog's `speed`/`accel` multipliers. See the measured
table in `docs/PARTS.md` (`harvest` vs `standard` vs `overcharge`) for expected
boost-duration/recharge/OT-cooldown deltas.

**Career ownership** is enforced on **write**, not in resolution:
`Parts._resolve` / `getMods` / `getCost` are **career-blind**. The garage greys
locked rows via `Parts.isOptionAvailable(opt, team, owned)` where `owned` comes
from `Career.owned()` / `G.careerOwned()` — do not thread ownership into
physics resolution.

**Livery finish** is `finish: "gloss" | "satin" | "chrome"` on a livery entry
in `js/car/liveries.js`, remapping body-paint via `Car3D.FINISH_SURFACE`.
The **shark fin** has two slots: `fin` (plate colour, defaults to `c2`) and
`finArt` (tail graphic — must contrast the fin or it is invisible).

## When to Use

- Adding/editing catalog options, SIGNATURE clones, or `FACTORY_PRESETS`.
- Changing `visual` recipes, `VISUAL_FIELD_REGISTRY`, or Car3D geometry.
- Tuning ERS battery behaviour or active-aero load from part choices.
- Career garage: owned parts, budget cap, locked rows, research unlocks.
- Livery schemes, paint finish, fin/finArt, sponsor/number layout.
- Verifying part meshes or stat spread before/after a change.

## When NOT to Use

- Pure driving feel with no catalog change → **`tune-physics`**.
- Career economy/settlement with no parts edit → **`career-mode`**.
- Isolated car screenshots without garage logic → **`car-viewer`**.
- Cache/version bumps after JS edits → **`bump-cache`** (still required before commit).

## Quick Reference

| Item | Contract |
|---|---|
| Catalog shape | Ordered 12-category array; budget 600 cr |
| SIGNATURE | Same cost/stats as `equivalent`; mesh-only difference |
| FACTORY_PRESETS | AI visual setup only |
| `_resolve` | Career-blind; supplier/team lock only |
| Owned gate | UI: `G.careerOwned()` → `Parts.isOptionAvailable(opt, team, owned)`; research via `Career.research(opt)` |
| ERS | `ersProfile` → `drainFor`/`regenFor`/`otTimeFor`/`otCoolFor` in game.js |
| Aero load | `aeroLoad` → active-aero X-mode interpolation in game.js |
| Finish | `gloss` default; `satin`/`chrome` via `FINISH_SURFACE` |
| `--refl` (car viewer) | Studio dial on ALL shine — **not** in-game chrome finish |

Commands:

```sh
node tools/test-bg.mjs parts                       # parts physics + garage specs in background
node tools/audit-parts.mjs [--cats=engine,aero] # every option + factory preset PNGs
node tools/car/render-car.mjs --team=mclaren --preset=wing --aero=extreme
python3 -m http.server 3456                       # for carview.html / render tools
```

Deep reference: **`docs/PARTS.md`**.

Related skills: **`car-viewer`**, **`career-mode`**, **`tune-physics`**, **`debug-state`** (verify `ersDeploy`/`ersRegen`/`drain`/`regen` via `physState()`), **`bump-cache`**.

## Workflow

1. **Read the contract first.** Open `docs/PARTS.md` and the category block in
   `js/car/parts.js`. New options need `visual` + registry entry if they change
   geometry; SIGNATURE entries must point at a valid `equivalent`.

2. **Edit catalog → derive, don't duplicate.** Stat multipliers flow through
   `resolveSetup`; ERS/aero axes re-scale from the category span automatically.
   Do not add parallel battery or wing tables.

3. **Wire visuals.** Update `opt.visual` and confirm `Car3D` consumes the field.
   For SIGNATURE, verify the mesh differs but `getMods` matches the equivalent.

4. **Career UI only for ownership.** If a part should be locked until researched,
   ensure the garage row gets the `locked` class via
   `Parts.isOptionAvailable(opt, team, G.careerOwned())` — not `_resolve` or a
   bare `Career.isOwned(...)`. Fitting still goes through `getTeamParts` /
   `saveTeamParts`; research goes through `Career.research(opt)`.

5. **Livery/finish.** Add or edit schemes in `liveries.js`; `fin`/`finArt` for
   the shark fin. Test chrome with `finish: "chrome"`, not `--refl=1` in the
   viewer (that dial is studio-only — see **`car-viewer`**).

6. **Visual verify.** Server on 3456, then:
   ```sh
   node tools/car/render-car.mjs --team=ferrari --preset=livery --views=tail
   node tools/audit-parts.mjs --cats=aero
   ```
   Or interactively: `tools/carview.html?team=mclaren&aero=extreme`.

7. **Test and ship.** Run `node tools/test-bg.mjs parts` for catalog/physics/visual recipes;
   run `node tools/test-bg.mjs career` when you changed research locks or garage ownership UI.
   Bump `?v=N` + `version.json` via **`bump-cache`** before commit.

## Common Mistakes

- Treating `Parts.CATALOG` as keyed by id — order matters; iterate the array.
- Giving SIGNATURE options different cost or stat multipliers (tests fail).
- Using `FACTORY_PRESETS` to change AI pace — meshes only; AI uses no parts → midpoint aero/ERS.
- Threading `owned` into `_resolve` / `getMods` — breaks non-career callers and duplicates UI rules.
- Adding ERS/aero literals instead of deriving from catalog spans.
- Forgetting `visual` registry → silent geometry drift or `parts-physics.spec.js` failure.
- Confusing **`--refl`** (viewer studio gloss) with **`finish: "chrome"`** (in-game livery material).
- Setting `finArt` equal to `fin` — tail graphic disappears on the flat fin plate.
- Using livery id `chrome` thinking it is chrome finish — it is a gloss palette named "Chrome".
- Editing `js/car/*.js` without cache-bump — stale GARAGE on GitHub Pages/PWA installs.
