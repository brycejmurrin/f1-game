# garage-angles.mjs — garage camera surveys

One Chromium session walks the **garage camera stack** (`#cs-stack` presets +
zoom/pan clicks), soft-presents each frame, and writes PNGs + optional labeled
rollup grids. Counterpart to `render-car.mjs` (carview studio) and offline
`spine-station.mjs` / `flank-occlusion.mjs`.

## When to use

| question | start here | then |
|---|---|---|
| whole-car preset walk (local) | `garage-angles.mjs` | — |
| compare 11 teams one angle | `--live --combo=… --team=all` | `--oracle` for occl % |
| flank mark reads at side camera | `--combo=wrap-spine` or `--spine-side=duo --views=side --zoom=8 --pan=5,0` | offline station first |
| crown / tail / fin | `--combo=crown-grid`, `fin-stars`, `wrap-rear` | |
| active aero flap travel | `--combo=aero-wings` | |
| catalog livery scheme | `--livery=alt` (no spine flags) | |
| part mesh visible in garage | `--part=aero:extreme` or combo `aero-wings` | `audit-parts.mjs` offline |

## Combos (`--list-combos`)

Explicit flags **override** combo defaults.

| combo | purpose |
|---|---|
| `wrap-spine` | Wrap crown, zoomed side — occlusion regression (build 8421+) |
| `wrap-duo` | Shipped RB default; spine group, moderate zoom |
| `wrap-side` | Wrap + logo flank; side only |
| `duo-grid` | wrap/duo on every team; side rollup |
| `flank-pack` | Five flank marks — **single team** diagnostic |
| `side-survey` | All `SPINE_SIDE` ids — **single team** |
| `crown-grid` | Four crown styles; top rollup |
| `aero-wings` | Wing presets + X-mode + extreme aero parts |
| `livery-wall` | Front / crest readability |
| `wrap-rear` | Rear + side for aft crown visibility |
| `fin-stars` | W17 star tail + wrap; rear/top |

## View groups

Presets: `hero`, `front`, `side`, `rear`, `top`, `wingFront`, `wingRear`.

Groups (via `--views=`):

| group | presets |
|---|---|
| `spine` | hero, top, rear, side |
| `wings` | wingFront, wingRear |
| `front` | front |
| `rear` | rear |
| `livery` | front (crest / wall) |
| `aero` | wingFront, wingRear, rear |
| `all` | every preset |

## Camera zoom / pan

Applied **after** the preset via discrete clicks (same as `#cs-view-in`,
`#cs-pan-right`, `#cs-pan-fwd`). Implemented through `__apex.garageFrame`.
`--zoom 8` bottoms at the ~4.6 m floor; `--pan 5,0` walks aft along the flank.

## Teams and speed

- `--team=all` — 11 grid teams (not `custom` / My Team).
- Default for multi-team + combo: **rollup-only** (one shot per team).
- `--full-views` — every preset in the combo per team.
- `--fast` / `--slow` — settle and present waits.
- `--resume` — skip completed teams; merge rollup from prior meta.
- Store-fast switch: `__apex.garageTeam` (default); `--picker-team` for UI path.

## Designs, parts, livery fields

**Spine survey** (custom shot livery in store):

```sh
--spine-logo=wrap[,bigmark]   # 'all' → every SPINE_LOGO id
--spine-side=duo[,slash]       # 'all' → every SPINE_SIDE id
```

**Catalog livery** (no spine flags):

```sh
--livery=default,alt
```

**Field overrides** on shot liveries:

```sh
--liv=finStyle:stars          # repeatable
--liv-fin-style=stars         # kebab form
```

**Parts** (garage setup mesh):

```sh
--part=aero:extreme           # repeatable category:option
--aero=extreme                # shorthand
--aero-x                      # X-mode flaps open before capture
```

## Live / labels / oracle

```sh
--live                        # https://brycejmurrin.github.io/f1-game/
--oracle                      # offline flank-occlusion % on rollup labels
--no-labels | --labels        # live defaults labels on
--team-sheets | --label-shots # per-team contact sheets (multi-team off by default)
```

## Examples

```sh
# Live grid survey (primary)
node tools/shot/garage-angles.mjs --live --combo=wrap-spine --team=all \
  --oracle --out=artifacts/wrap-spine-all

# Resume interrupted all-team run
node tools/shot/garage-angles.mjs --live --combo=duo-grid --team=all \
  --resume --out=artifacts/wrap-spine-all

# Single-team flank diagnostic
node tools/shot/garage-angles.mjs --combo=flank-pack --team=redbull \
  --full-views --out=artifacts/flank-pack

# Active aero + extreme rear wing
node tools/shot/garage-angles.mjs --combo=aero-wings --team=mclaren --labels

# Custom: slash flank, hero+side, fin stars
node tools/shot/garage-angles.mjs --team=ferrari \
  --spine-logo=wrap --spine-side=slash --views=hero,side \
  --zoom=6 --pan=3,0 --liv-fin-style=stars --part=aero:extreme --aero-x
```

## Output

- Per shot: `{team}-{tag}-{view}.png` (+ `-labeled.png` when enabled)
- Multi-team rollup: `all-teams-{combo}-{rollupView}-rollup.png`
- Meta: `all-teams-angles.json` or `{team}-angles.json`

## Related

- Offline placement: `tools/car/spine-station.mjs`, `flank-occlusion.mjs`
- Placement ladder: [placement.md](placement.md)
- Studio turntable: `tools/car/render-car.mjs`
- One backend A/B: `tools/shot/garage-frame.mjs`
