# Spine design pass — design (2026-09-09)

Approved scope: **all three** — ship-default factory looks, reusable catalog recipes (`spineLogo` / `spineSide`), and a team-led survey that decides carve order. Approach **C**: survey → recipe carve → team retune → unused catalog.

Paint coupling (optional rows only feed their own surface) is already shipped; this pass is **geometry and graphic design** of crowns and flanks, not colour plumbing.

## Goals

1. **Factory grid** — each team's default crown + flank reads as that works car from garage hero / side / rear (lit), not as a generic vinyl sticker.
2. **Catalog recipes** — every id in `LiveryTex.SPINE_LOGO_IDS` and `SPINE_SIDE_IDS` is visually distinct at garage distance and placement-safe (`FLANK_SEEN`, content vs band).
3. **Team-led priority** — fix recipes that hurt current factory pairings first; unused picker ids second so custom builds inherit the same quality.

## Non-goals

- New spine ids or mesh / UV / `REGIONS` changes (unless a measured defect proves UV is the only fix — escalate before editing mesh).
- Nose / fin-badge redesign (fin stays out unless a crown change forces a tail wash tweak).
- Widening contrast / `fin-design` / cover-legibility tolerances.
- Re-opening paint-coupling (stripe→accent, sunTint inherit, etc.).

## Surfaces

| Layer | Where | Tool of truth |
|---|---|---|
| Crown graphic | `drawSpineTop` + `drawTailTop` in `js/car/liverytex.js` | `spine-station --png` then `garage-angles` hero/rear |
| Flank graphic | flank painters + `SIDE_FILL` / `sc` vs `su` | `spine-station` (+ `--occlude`); `garage-angles --views side` |
| Factory pairing | `js/data/teams.js` `livery.{spineLogo,spineSide,…}` (+ optional tints already independent) | `garage-angles --team <id>` sheet |
| Catalog leftover ids | same painters, not on the grid | `spine-station --team=all` / garage-angles override flags |

Hard rules already in tree (do not regress): content clamped to `FLANK_SEEN`; bands may run aft; fills under crown flank art; lettering over it; wrap surveyed on a traced-bull team; saddle flanks via `saddleFlanks` not clipped crown paint.

## Current factory map (baseline)

| Team | crown | flank |
|---|---|---|
| mercedes | twin | sash |
| ferrari | saddle | plate |
| mclaren | panel | wordmark |
| redbull | wrap | duo |
| alpine | tricolour | band |
| racingbulls | chevron | sash |
| haas | panel | number |
| williams | stripe | code |
| audi | saddle | band |
| astonmartin | stripe | logo |
| cadillac | saddle | plate |
| custom | number | number |

Priority carve set (shipped on grid): `saddle`, `panel`, `stripe`, `twin`, `wrap`, `tricolour`, `chevron`, `band`, `sash`, `plate`, `duo`, `wordmark`, `number`, `code`, `logo`.

Second-wave catalog: `wedge`, `rungs`, `carbon`, `bigmark`, `wordmark` (crown), `ribbon`, `lockup`, `title`, `emblem`, plus any crown/side combo that fails the survey.

## Process

1. **Baseline** — `spine-station` for every factory team (and `--team=all` crowns); write JSON/PNG under `artifacts/spine-baseline/`. Spot-check lit looks with `garage-angles` on the worst 3–4 (cheap first; xvfb + headed Chromium if WebGL is dead headless).
2. **Recipe carve** — edit only the failing painters in `liverytex.js`. Prefer geometry (rake, thickness, station `u`/`v`, pad, keyline) over inventing new motifs. Keep ids stable so garage menus and saved liveries keep working.
3. **Gate** — `fin-design`, `cover-legibility`, `livery-contrast` (touched combos), tooling-fast as needed. Never widen floors.
4. **Team retune** — if a recipe is correct but a pairing still looks wrong, change `teams.js` (swap id and/or optional tints). Prefer recipe fix when many teams share the same failure mode.
5. **Catalog pass** — unused ids get the same placement + lit check; cull or restyle anything that still reads as a UI sticker at side+zoom (precedent: slash/bars/split/chevron).
6. **Sign-off** — garage-angles sheets for the full factory grid + a short catalog matrix; artifacts in `/opt/cursor/artifacts/spine-design-pass/`.

## Success criteria

- Factory: side + hero shots show readable crown and flank content; no mark centred behind the rear tyre; cover-legibility still green for defaults.
- Catalog: each id differs from its nearest neighbour at a glance (no twin≈stripe, no band≈sash collapse).
- CI: `fin-design` / cover-legibility / contrast gates green without tolerance raises.
- Docs: this file + a short evidence note under `docs/notes/` if measurements change a rule.

## Risks

- Recipe edits shift every consumer of that id (factory + custom). Mitigate with spine-station before garage-angles and by carving one id at a time.
- Wrap crown + side interaction (filler badge when no bull) — always measure on `redbull` / `racingbulls` for wrap.
- Saddle paints flanks; side marks must keep contrast against `bandC` (recent paint decoupling helps; still re-check Audi / Ferrari / Cadillac).
