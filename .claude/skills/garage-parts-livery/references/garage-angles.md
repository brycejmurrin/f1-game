# garage-angles.mjs — parameterized garage camera surveys

One Chromium session walks the **garage camera stack** (`#cs-stack` presets +
zoom/pan clicks), soft-presents each frame, and writes PNGs + optional labeled
rollup grids. **No named presets** — every survey is built from flags.

Counterpart to `render-car.mjs` (carview studio) and offline
`spine-station.mjs` / `flank-occlusion.mjs`.

## Discover ids

```sh
node tools/shot/garage-angles.mjs --list-ids   # views, spine-logo, spine-side, part cats
node tools/shot/garage-angles.mjs --help
```

## Core parameters

| flag | meaning |
|---|---|
| `--team=redbull\|all` | one team, comma list, or full 2026 grid (11 teams) |
| `--team=all+custom\|*` | grid + My Team (12 cars) |
| `--views=side` | preset or group: `spine`, `wings`, `front`, `rear`, `livery`, `aero`, `all` |
| `--zoom=N` | `#cs-view-in` clicks after preset (8 ≈ 4.6 m floor on side) |
| `--pan=strafe,dolly` | `#cs-pan-*` clicks after preset (`5,0` walks aft on flank) |
| `--rollup-view=side` | which preset fills each cell when `--team=all` |
| `--rollup-only` / `--full-views` | one shot vs every preset per team |

Multi-team runs default to **rollup-only** and **fast** unless `--full-views` /
`--slow`.

## Spine designs

Pick **one** style:

**Explicit pairs** (repeatable — best for grids):

```sh
--design=wrap:none
--design=wrap:duo
--design=bigmark:none
```

**Cartesian product**:

```sh
--spine-logo=wrap,bigmark
--spine-side=duo,slash,logo
# → wrap×duo, wrap×slash, wrap×logo, bigmark×duo, …
```

**Expand everything**:

```sh
--spine-logo=wrap --spine-side=all    # every SPINE_SIDE id
```

**Catalog livery** (no custom spine shot):

```sh
--livery=default,alt
```

## Livery fields, parts, aero

```sh
--liv=finStyle:stars              # repeatable field:value
--liv-fin-style=stars             # kebab alias
--part=aero:extreme               # repeatable category:option
--aero=extreme                    # shorthand
--aero-x                          # X-mode flaps open before capture
```

## Live / labels / oracle

```sh
--live                            # github.io
--oracle                          # offline flank-occlusion % on rollup labels
--resume                          # skip teams already captured
--reset                           # wipe --out and reshoot everything
--no-labels | --labels
--team-sheets | --label-shots
```

## Common surveys (copy-paste recipes)

**Occlusion regression — all teams, zoomed side (build 8421+):**

```sh
node tools/shot/garage-angles.mjs --live --team=all \
  --design=wrap:none --views=side --zoom=8 --pan=5,0 \
  --oracle --out=artifacts/wrap-spine-all
```

**Red Bull default (wrap + duo) across grid:**

```sh
node tools/shot/garage-angles.mjs --live --team=all \
  --design=wrap:duo --views=side --zoom=8 --pan=5,0
```

**Single-team flank walk:**

```sh
node tools/shot/garage-angles.mjs --team=redbull \
  --spine-logo=wrap --spine-side=duo,slash,logo,wordmark,lockup \
  --views=side --zoom=8 --pan=5,0 --full-views
```

**Crown styles, top rollup:**

```sh
node tools/shot/garage-angles.mjs --team=all \
  --spine-logo=wrap,bigmark,wedge,saddle --spine-side=none \
  --views=spine --rollup-view=top
```

**Default rear wings — all 12 teams (grid + My Team):**

```sh
node tools/shot/garage-angles.mjs --team=all+custom \
  --views=wingRear --livery=default --reset \
  --out=artifacts/rear-wing-all
```

Rollup view auto-matches `--views=wingRear`. Add `--zoom=2` for tighter crop,
`--aero-x` for open flaps, or `--live` for github.io.

**Active aero + extreme rear wing:**

```sh
node tools/shot/garage-angles.mjs --team=mclaren \
  --views=wings --part=aero:extreme --aero-x --zoom=2
```

**Crest / garage wall:**

```sh
node tools/shot/garage-angles.mjs --team=ferrari --views=front
```

**W17 star tail:**

```sh
node tools/shot/garage-angles.mjs --team=mercedes \
  --design=wrap:none --views=rear,top --liv-fin-style=stars --zoom=2
```

## Output

- Shots: `{team}-{tag}-{view}.png`
- Multi-team rollup: `all-teams-{survey-tag}-{rollupView}-rollup.png`
- Meta: `all-teams-angles.json`

## Related

- Offline placement: `spine-station.mjs`, `flank-occlusion.mjs` — [placement.md](placement.md)
- Studio turntable: `render-car.mjs`
- One backend A/B: `garage-frame.mjs`
