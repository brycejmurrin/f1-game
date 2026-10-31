# garage-angles.mjs — when, how, and how fast

**Use when:** inspecting garage equipment, room layout or a lit car/livery.
For paint placement, answer the flat-atlas question with `spine-station.mjs` first.

**Inputs:** team/part/design selection, shot preset, and whether the result is
an offline or live capture.

**Verification:** record preset, camera, renderer, and output path; use the
same preset before/after comparisons.

**Writes/ownership:** captures and reports only; garage geometry and livery
edits stay with the owning source files.

## Contents

- Choose the subject before the angle
- Pick the cheapest path first
- Everything is an axis
- Presets are starting points
- Fast iteration
- Multi-team
- BEFORE pack — fetch, do not recapture
- When NOT to use
- Offline preflight
The garage is where room occlusion, wall crests and lighting get a vote.
Use subject stations for equipment/layout; use **lit, foreshortened** views
after flat-atlas placement when reviewing paint.

## Choose the subject before the angle

Car presets centre the car. For a room, cabinet, fan or trolley review, discover
subject stations instead of repeating `hero,front,rear` or inventing another path:

```sh
node tools/shot/garage-angles.mjs --list-cameras           # read-only JSON, no browser
node tools/shot/garage-angles.mjs --list-cameras=cabinet   # literal metadata search
node tools/shot/garage-angles.mjs --plan --team=mclaren --preset=workshop --fast --viewport=844x390 --budget=180s
# After the browser/load preflight, run the same command without --plan:
node tools/shot/garage-angles.mjs --team=mclaren --preset=workshop --fast --viewport=844x390 --budget=180s --sheet=1 --out=artifacts/workshop-review
```

`workshop` visits `toolWall`, `serviceCorner`, `safetyStation`, `engineerDesk`;
`room` visits `roomBack`, `roomDoor` for opposite views of the bay. Discovery
includes each station's subject, purpose and exact orbit/target. These are
inspection defaults, not tracking cameras: changed room geometry still needs
pixel review for occlusion. `--station=toolWall` captures just that subject;
`--station=toolWall --az=-80deg,-50deg` explores two sides of it. Explicit
station selection overrides a preset's station list; retain the resulting plan
and sidecars to repeat a chosen camera before/after.

The same canonical stations appear in `apex_catalog` section `garage` (search
`filter:"cabinet"`, follow pagination), work as `apex_garage` frame names, and
can be planned with `apex_garage_plan`'s existing maximum of four frames. Plan
estimates and discovery do not prove visibility. `--fast` opts out of sheets
by default, so request `--sheet=1` for a review gallery. No skill or host keeps
its own copy of camera coordinates.

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

Cameras, stations, designs, free camera, comparisons, session and output flags: [garage-angles-axes.md](garage-angles-axes.md). Read only the section you need; `node tools/shot/garage-angles.mjs --help` is the flag truth.

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
# Fast mode: fewer settle frames, no label/sheet (add --sheet=1 for matrix.png), one gate retry (~40% quicker per shot):
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

## BEFORE pack — fetch, do not recapture

For a car/garage change, download the ship pack instead of shooting the
11-team grid here:

```sh
node tools/garage-angles-fetch.mjs --out artifacts/garage-before
```

`Garage before` (`.github/workflows/garage-before.yml`) captures
`--team` shards × `--views=hero,front,side,rear,top,wingFront,wingRear`
on macos-latest, once a day when the watched paths moved (or on
dispatch), so the newest pack may trail ship by up to a day; the fetch
prints how stale it is. Recapture only the AFTER angles you changed.


## When NOT to use

- Placement-only questions → `spine-station.mjs` first.
- Isolated car geometry with no garage shell → `render-car.mjs`.
- Live poking / console → mcp-probe skill, not this batch tool.

## Offline preflight

`--plan --reset` validates and reports the capture plan before output reset or
creation. It must preserve existing artifacts. Design field names, enums and
part ids are validated in Node; availability is reported per team. Invalid
designs fail before Chromium boot. Review that plan before a parent-owned run.
