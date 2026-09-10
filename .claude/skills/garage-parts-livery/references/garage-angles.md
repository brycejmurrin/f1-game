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

**One Chromium** for the whole matrix: teams × designs × cameras × viewports.
Never spawn one browser per team, per angle or per viewport.

## Everything is an axis

The run is a product: **teams × (liveries | designs) × cameras × viewports**.
Every number is a list; `--plan` prints the whole matrix and a shot count
without booting, so size the run before paying for it.

```sh
# Print the matrix (shot count + rough ETA), run nothing:
node tools/shot/garage-angles.mjs --plan --team=redbull \
  --spineLogo=wrap --views=side --az=60deg,90deg,120deg --viewport=1280x720,844x390
```

### Cameras

A **view** is only the base framing (it resets orbit, target and pan). On top
of it, in this order:

| flag | meaning | form |
|---|---|---|
| `--views` | preset base(s): `hero,front,side,rear,top,wingFront,wingRear`, groups `spine,wings,front,rear,aero,all`, or `free` (keep the last camera) | list |
| `--az`, `--el` | **absolute** orbit azimuth / elevation | radians, `45deg`, or `0.5pi`; list |
| `--dist` | **absolute** orbit distance, metres (clamped by the game) | list |
| `--zoom` | counted clicks on `#cs-view-in` / `-out` | list of counts |
| `--pan` | counted clicks on `#cs-pan-*`: `strafe,dolly` | `;`-separated list of pairs |
| `--az-nudge`, `--el-nudge` | counted clicks on `#cs-view-left/right/up/down` | list |
| `--cam` | whole cameras: `[view:]az,el[,dist[,strafe,dolly]]` | `;`-separated list |
| `--viewport` | canvas size(s) — the docked sheet takes a different share of a phone-landscape canvas | `WxH` list |
| `--crop` | cut every frame to a region, fractions `x,y,w,h` | one |

```sh
# Three azimuths across the flank at flank zoom, two viewports — 6 shots:
node tools/shot/garage-angles.mjs --team=ferrari --spineSide=logo \
  --views=side --az=60deg,90deg,120deg --zoom=6 --pan=4,0 \
  --viewport=1280x720,844x390 --out=artifacts/flank-sweep

# Two named cameras on top of the side preset; the free one starts from the last frame:
node tools/shot/garage-angles.mjs --team=redbull --spineLogo=wrap \
  --views=side --cam='free:1.2,0.3,7;rear:180deg,0.4'

# Tight crop on the crown from above, absolute elevation and distance:
node tools/shot/garage-angles.mjs --team=mercedes --spineLogo=saddle \
  --views=top --el=1.1 --dist=6.5 --crop=0.25,0.15,0.5,0.6
```

The absolute flags need the `__apex.garageFrame` hook (every run uses it;
`--picker-team` still clicks the DOM for the counted flags only). A camera's
KEY names only what was set — `side`, `side_az60_z6_p4x0`,
`free_az69_el17_d7` — so a run with no camera axes keeps the historic
`<team>-<tag>-<view>.png` names.

### Designs

Any `Liveries.FIELDS` key is a flag; `--part.<category>` fits a catalog part
through `__apex.garageParts` (wing, fin, floor geometry walk like paint does).
Colours are `#rrggbb`; enums are validated in-page against the real lists.

| flag | meaning |
|---|---|
| `--spineLogo=wrap,saddle --finShape=blade` | cartesian product (four cars) |
| `--zip` | pair the axes index-wise instead (the shorter lists cycle) |
| `--design='[{…},{…}]'` / `--design=@cars.json` | an explicit list — inline JSON, or a file of JSON / one object per line; each object may carry `part.<category>` keys and a `name` |
| `--base=<liveryId>` | paint the designs over that catalog livery instead of the team default |
| `--livery=default,rb_white` | walk catalog paint jobs instead of designs |

```sh
node tools/shot/garage-angles.mjs --team=mclaren --views=side --zoom=6 --pan=4,0 \
  --spineSide=logo,lockup --part.aero=minimal,le_mans --zip
node tools/shot/garage-angles.mjs --team=all --views=side \
  --design='[{"name":"wrapRed","spineLogo":"wrap","sunTint":"#c00000"},{"spineSide":"band","sideTint":"#ffffff"}]'
```

Legacy aliases still work: `--spine-logo`, `--spine-side`.

### Output

| flag | meaning |
|---|---|
| `--out=dir` | PNGs (default `artifacts/garage-angles`) |
| `--name='{team}-{tag}-{cam}'` | file-name template; tokens `{team} {tag} {cam} {view} {vp} {i} {az} {el} {dist}` |
| `--label=0` / `--sheet=0` / `--cols=N` / `--cell=px` | caption bars, contact sheet, its columns and cell width |
| `--live` | auto-refreshing `live.html` after each shot |
| `--json` | print the run record to stdout as well as the sidecar |
| `--against=<ref>` | shoot the matrix twice, serving that ref's js/css from memory (before/after pairs + pair sheet, one boot) |

The JSON sidecar (`<team>-angles.json` / `all-teams-angles.json`) records every
axis, every camera (as sent and as measured back from `garageCam()`), per-shot
settle/capture/gate ms, and the loadavg.

## Presets are starting points

`--preset=list` prints them. Every key in a preset is a plain flag (views,
zoom, pan, az, a livery field), so `--preset=flank --az=80deg` is the flank
framing swung to a new azimuth, and `--preset=none` (the default) is no preset.

| preset | sets |
|---|---|
| `wall` | views=front zoom=4 |
| `fin` | views=rear zoom=4 |
| `flank` | views=side zoom=8 pan=5,0 |
| `mark` | views=front,side,rear zoom=6 pan=4,0 finBadge=logo |
| `quick` | views=side zoom=6 pan=4,0 fast |
| `sweep` | views=side zoom=6 pan=4,0 az=50deg,70deg,90deg,110deg,130deg |

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
