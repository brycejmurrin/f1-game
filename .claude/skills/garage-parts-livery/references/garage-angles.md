# garage-angles.mjs — when, how, and how fast

The garage is the only place occlusion, wall crests, and real lighting get a
vote. Use this tool when `spine-station.mjs` (0.2 s, flat atlas) has already
answered placement and you need **lit, foreshortened** proof.

## Pick the cheapest path first

| question | tool | typical cost |
|---|---|---|
| where does ink land on the flank? | `spine-station.mjs --team=X --occlude` | 0.2–1 s |
| flat art / PNG of the mark | `spine-station.mjs --png=…` | 0.3 s |
| wall crest / fin badge / wrap bull **in the room** | `garage-angles.mjs` | ~25 s boot + ~24 s per shot (~12 s with `--fast`) |
| car-only, no garage shell | `render-car.mjs --preset=spine` | ~15 s boot + ~3 s per angle |

**One Chromium** for the whole matrix: teams × designs × cameras × viewports
(one browser *context* per DPR). Never spawn one browser per team or per angle.

## Everything is an axis

The run is a product: **teams × (liveries | designs × bases) × cameras ×
viewports × DPRs**. Every number is a list, every list takes a range, and
`--plan` prints the whole matrix, the shot count, an estimate and any flag
that cannot paint anything, without booting. Size the run before paying for it:

```sh
node tools/shot/garage-angles.mjs --plan --team=redbull \
  --spineLogo=wrap --views=side --az=50deg..130deg:5 --viewport=1280x720,844x390 --budget=10m
```

`--budget=600s|10m` refuses a run the estimate says will not fit (exit 2).

### Cameras

A **view** is only the base framing (it resets orbit, target and pan). On top
of it, in this order:

| flag | meaning | form |
|---|---|---|
| `--views` | preset base(s): `hero,front,side,rear,top,wingFront,wingRear`, groups `spine,wings,front,rear,aero,all`, or `free` (keep the last camera); a named camera (`bay`) is accepted here too | list |
| `--cam` | named cameras `bay,bayFront` (combinable bases) or whole cameras `[view:]az,el[,dist[,strafe,dolly]]` (stand alone) | `;`-separated list |
| `--target` | what the orbit LOOKS at: `car` (default), `nose`, `crown`, `fin`, `flank`, `wall`, or `x,y,z` car-space metres (+z nose) | list; `;` between triples |
| `--az`, `--el` | **absolute** orbit azimuth / elevation | radians, `45deg`, `0.5pi`, or a range `50deg..130deg:9`; list |
| `--dist` | **absolute** orbit distance, metres (clamped by the game) | list or range |
| `--lamp` | aim the inspection lamp by preset name, `off` parks it, `all` walks them | list |
| `--zoom` | counted clicks on `#cs-view-in` / `-out` | list of counts |
| `--pan` | counted clicks on `#cs-pan-*`: `strafe,dolly` | `;`-separated list of pairs |
| `--az-nudge`, `--el-nudge` | counted clicks on `#cs-view-left/right/up/down` | list |
| `--viewport` | canvas size(s) — the docked sheet takes a different share of a phone-landscape canvas | `WxH` list |
| `--dpr` | device scale factor(s) — one browser context each, so each value re-boots the garage once. **Needs a real GPU**: on SwiftShader a 2x garage measured a 60 s team switch and starved the capture poll (2026-09-10); use the macOS census runner | list |
| `--crop` | cut every frame to a region, fractions `x,y,w,h` | one |

A named camera is a **parameter bundle**, not a game preset: `bay` is
`hero:0.68pi,0.26,9.2`, so `--views=bay --az=100deg,140deg` sweeps azimuth from
the bay framing and keeps its elevation and distance. A camera's KEY names
only what was set — `side`, `bay`, `bay_az100`, `side_atCrown_lampOff`,
`free_az69_el17_d7` — so a run with no camera axes keeps the historic
`<team>-<tag>-<view>.png` names.

```sh
# Nine azimuths across the flank, looking at the crown, two viewports:
node tools/shot/garage-angles.mjs --team=ferrari --spineSide=logo \
  --views=side --az=50deg..130deg:9 --target=crown --viewport=1280x720,844x390

# The same corner with the lamp parked vs aimed at the flank:
node tools/shot/garage-angles.mjs --team=redbull --cam=bay --lamp=off,side

# Look at the back-wall lightbox from the bay framing, then a free camera:
node tools/shot/garage-angles.mjs --team=mercedes --cam=bay --target=wall
node tools/shot/garage-angles.mjs --team=mercedes --views=free --az=1.2 --el=0.3 --dist=7
```

The absolute flags, targets and lamps go through `__apex.garageFrame`;
`--picker-team` still clicks the DOM for the counted flags only.

### Designs

Any `Liveries.FIELDS` key is a flag; `--part.<category>` fits a catalog part
through `__apex.garageParts`; `--driver=0,1` walks the seat (race number,
helmet, T-cam) through `__apex.garageTeam`; `--light.<knob>=` walks a
lighting-tuner knob (`__apex.lightTune()` lists them: `keyMul`, `ambientMul`,
`shadowStr`, `lampLevel`, …). Colours are `#rrggbb`; enums are validated
in-page against the real lists, and `all` expands any enum axis to that list
(`--spineSide=all`, `--part.aero=all`, `--driver=all`).

| flag | meaning |
|---|---|
| `--spineLogo=wrap,saddle --finShape=blade` | cartesian product (four cars) |
| `--zip` | pair the axes index-wise instead (the shorter lists cycle) |
| `--design='[{…},{…}]'` / `--design=@cars.json` | an explicit list — inline JSON, or a file of JSON / one object per line; each object may carry `part.<category>`, `driver`, `light.<knob>` keys and a `name` |
| `--base=default,rb_white` | paint every design over each named catalog livery (an axis) |
| `--livery=default,rb_white` | walk catalog paint jobs instead of designs |
| `--logos=default` | strip the authored mark rows so wall and flank use the team's default mark colours |

A design flag that cannot paint anything on the car it was given is reported
by `--plan` and warned at run time (`sunTint: Needs SPINE TOP WRAP`) — the
same table the paint sheet greys a row with (`LiveryTex.FILL_SURFACES`).

```sh
node tools/shot/garage-angles.mjs --team=mclaren --views=side --zoom=6 --pan=4,0 \
  --spineSide=logo,lockup --part.aero=minimal,le_mans --zip
node tools/shot/garage-angles.mjs --team=all --views=side --driver=0,1 \
  --design='[{"name":"wrapRed","spineLogo":"wrap","sunTint":"#c00000"},{"spineSide":"band","sideTint":"#ffffff"}]'
```

Legacy aliases still work: `--spine-logo`, `--spine-side`.

### Measurements, not only pictures

| flag | records |
|---|---|
| `--oracle` | per shot, how much of the flank mark the car's own tyres and bodywork hide at that camera (`occl 54%` on the caption and in the sidecar); an azimuth sweep then says which angle shows the most |
| `--baseline=dir` | per shot, the changed-pixel fraction against the same-named PNG in a saved run (`Δbase 3.1%`) — an A/B with no git ref |
| `--against=<ref>` | shoot the matrix twice, serving that ref's js/css from memory; each pair gets its changed-pixel fraction (`pair …: 4.2% of pixels changed`) plus the pair sheet |

### Output

| flag | meaning |
|---|---|
| `--out=dir` | PNGs (default `artifacts/garage-angles`) |
| `--name='{team}-{tag}-{cam}'` | file-name template; tokens `{team} {tag} {cam} {view} {vp} {dpr} {i} {az} {el} {dist}` |
| `--label=0` / `--sheet=0` / `--cols=N` / `--cell=px` | caption bars, contact sheets, columns and cell width |
| `matrix.png` | written automatically when the run has ≥2 cars and ≥2 cameras: rows = car, columns = camera |
| `--live` | auto-refreshing `live.html` after each shot |
| `--site` / `--cdn` | boot the deployed build instead of the working tree |
| `--json` | print the run record to stdout as well as the sidecar |

The JSON sidecar (`<team>-angles.json` / `all-teams-angles.json`) records every
axis, every camera (as sent and as read back from `garageCam()` after the
settle — the value the framing call returns is one frame stale), per-shot
settle/capture/gate ms, occlusion and diffs when asked, and the loadavg.

## Presets are starting points

`--preset=list` prints them. Every key in a preset is a plain flag (views,
zoom, pan, az, lamp, target, a livery field), so `--preset=flank --az=80deg`
is the flank framing swung to a new azimuth, and `--preset=none` (the
default) is no preset.

| preset | sets |
|---|---|
| `wall` | views=front zoom=4 |
| `fin` | views=rear zoom=4 |
| `flank` | views=side zoom=8 pan=5,0 |
| `mark` | views=front,side,rear zoom=6 pan=4,0 finBadge=logo |
| `quick` | views=side zoom=6 pan=4,0 fast |
| `sweep` | views=side zoom=6 pan=4,0 az=50deg,70deg,90deg,110deg,130deg |
| `saddleWall` | views=bayFront spineLogo=saddle spineSide=logo logos=default |

## Fast iteration

```sh
# Fast mode: fewer settle frames, no label/sheet, one gate retry (~40% quicker per shot):
node tools/shot/garage-angles.mjs --fast --preset=quick --team=redbull --spineLogo=wrap
# Tune settle yourself (defaults: livery 8, view 4; fast 6 / 2):
node tools/shot/garage-angles.mjs --settle=6 --view-settle=3 --views=side --team=redbull
```

Fast mode on a loaded box can capture a stale frame on the second team of a
run (measured 2026-09-10: a "side" shot that settled in 5 s was the previous
front view). When a frame looks like the last one, re-shoot without `--fast`
or with a higher `--view-settle`.

## Multi-team

`--team=all` (or `all+custom`) walks the grid in one browser and writes a
per-team rollup contact sheet of `--rollup-view` (default `side`);
`--full-views` shoots every camera for every team. `--resume` skips teams that
already have their first frame in `--out`; `--reset` clears it.

## Before you run

1. Check `/proc/loadavg` < 3 — a busy box measures the machine, not the code.
2. Reap orphan Chromium from prior probes (`ps … | head`, kill by PID).
3. Never run while Playwright browser groups are in flight.
4. **WebGL / DISPLAY:** headless SwiftShader needs a usable GL context.
   `launchChromium` (via this tool) clears a *dead local* `DISPLAY=:N` when
   `/tmp/.X11-unix/XN` is missing — that was the 2026-09-10 Cloud failure mode
   where `__apex` never appeared. You do **not** need a separate `serve` on
   `:3456`; the tool starts its own static server. If GL is still missing:
   `unset DISPLAY` or `xvfb-run -a node tools/shot/garage-angles.mjs …`.
   Opt out of the clear with `APEX_KEEP_DISPLAY=1`.

## When NOT to use

- Placement-only questions → `spine-station.mjs` first.
- Isolated car geometry with no garage shell → `render-car.mjs`.
- Live poking / console → mcp-probe skill, not this batch tool.
