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

**The game clamps the orbit, not the tool.** Elevation is `0..1.30` rad
(`SP_EL_MIN/MAX`, `js/game.js`): the eye never goes below the target, so a
"looking up" shot is not reachable — put the TARGET below the subject instead
and the subject lands above frame centre from a floor-level eye. Distance is
`4.6..15` m on every base view except `wingFront` (2.0) and `wingRear` (1.8),
which exist to sit close to a flap; the sidecar records the clamped value
that was actually rendered, so compare `dist` there against what you asked.

```sh
# Floor-level front wing, every team, head-on and 27° three-quarter
# (measured 2026-09-10: 22 frames in 12 min with --fast; eye 9 cm off the floor):
node tools/shot/garage-angles.mjs --fast --team=all --views=wingFront \
  --az=0,0.15pi --el=0.04 --dist=3.5 --target=0,-0.15,2.2 --out=artifacts/wing-ground
```

### Stations — cameras keyed to a PART

A station is a camera bundle that frames one thing a livery field paints:
base view + orbit + look-at + lamp, and `clamp: false` where it sits inside
the player's 4.6 m floor (a survey framing, not a preset). Every component is
a default the axes override, so `--station=spineTop --az=150deg,170deg` is
the crown station swung round. `--crop=none` shows the whole frame while
tuning one.

| station | frames | bundle |
|---|---|---|
| `spineTop` | crown / SPINE TOP, top-down nose-up (the chase camera's read) | rear · az 0.92π · el 0.72 · 3.2 m · at [0, 0.9, -0.85] (the cover's middle) · lamp off |
| `spineSide` | flank / SPINE SIDE at shoulder height | side · az 0.50π · el 0.15 · 3.4 m · at flank · lamp side |
| `finBadge` | fin badge + handoff | rear · az 0.78π · el 0.30 · 3.0 m · at fin · lamp wingRear |
| `sidepod` | sidepod flash, stripe, finish | side · az 0.56π · el 0.12 · 3.6 m · at [0.7, 0.45, 0.2] |
| `noseFlash` | nose flash, DETAIL keyline | wingFront · az 0.18π · el 0.14 · 4.0 m · at nose · lamp front |
| `endplate` | front-wing endplate | wingFront · az 0.35π · el 0.10 · 2.6 m · at [0.9, 0.2, 2.3] |
| `rearWing` | rear wing / wingCarbon | wingRear · az 0.72π · el 0.30 · 2.8 m · at [0, 1.0, -2.4] |
| `wallCrest` | the wall lightbox mark | front · az 0.32π · el 0.28 · 9.4 m · at wall · lamp off |
| `floorNose` | the floor-level nose recipe above | wingFront · az 0 · el 0.04 · 3.5 m · at [0, -0.15, 2.2] |

**A design walk with no camera flag shoots its own stations.** `FIELD_STATIONS`
maps every `Liveries.FIELDS` key to the station(s) that show it (`spineLogo →
spineTop`, `spineSide → spineSide`, `finBadge → finBadge`, `sunTint → spineTop
+ spineSide`, `logo → wallCrest + spineTop`, …), so `--spineSide=logo,lockup`
frames the flank instead of the historic `side` default, and `--plan` prints
`stationsFrom`. Any `--views`, `--cam`, `--station`, `--path`, `--eye` or a
preset with views wins — you said where to look.

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

### Free camera

The game clamps the player's orbit (el ≥ 0, a per-view `minDist`); a survey
does not have to live inside it. `__apex.garageFrame({clamp: false})` lifts
both floors for one framing (`G.setSetupFree`; the next preset restores them).

| flag | meaning |
|---|---|
| `--clamp=0` | every camera in the run may go below el 0 (under the target, looking up) and closer than the view's floor (down to 0.3 m) |
| `--eye=x,y,z[;…]` + `--look=x,y,z` | place the EYE itself in car-space metres and look at a point; the hook turns the pair into az / el / dist / target (implies the clamp lift); both are lists |
| `--path=@keyframes.json` + `--path-steps=N` | a dolly: keyframes `{view?, az, el, dist, target?, eye?, look?, lamp?}` (angles as numbers, `45deg` or `0.5pi`), N frames interpolated per segment plus the last keyframe, keys `path01…`, and a one-row `path-strip.png` |

```sh
# Under the front wing looking up (eye 9 cm below the nose target):
node tools/shot/garage-angles.mjs --team=mercedes --views=wingFront --az=0 --el=-0.12 --dist=2.4 --target=nose --clamp=0
# A swing from the flank up over the crown, 6 frames a segment:
node tools/shot/garage-angles.mjs --team=redbull --path='[{"view":"side","az":"60deg","el":0.2,"dist":6,"target":"crown"},{"az":"150deg","el":0.9,"dist":5,"target":"crown"}]'
```

### Comparisons

| flag | records |
|---|---|
| `--pair=field:a\|b[\|c]` | an axis AND a comparison: every value after the first is paired with the first, same car and camera, everything else equal — `design-pairs.png` (A · B · changed-pixel overlay) and `Δ 4.2% px` per pair |
| `diff/*.diff.png` | every pair's overlay: the B frame with changed pixels pulled toward magenta, so a Δ% has a WHERE |
| `--flat` | the flat atlas art (spine-station's replay of the real painter, flank region, ×3) beside every lit frame — `flat-sheet.png`; how the wrap foreshortened is the difference between the two columns |
| `--oracle` | per shot, how much of the flank mark the car's own tyres and bodywork hide at that camera (`occl 54%` on the caption and in the sidecar); an azimuth sweep then says which angle shows the most |
| `--baseline=dir` | per shot, the changed-pixel fraction against the same-named PNG in a saved run (`Δbase 3.1%`) — an A/B with no git ref |
| `--against=<ref>` | shoot the matrix twice, serving that ref's js/css from memory; each pair gets its changed-pixel fraction, overlay and the pair sheet |

Pairs are scored BEFORE the caption bars go on (a bar that says BEFORE on one
frame is not a change to the car), and a `--crop` — yours or a station's —
is applied first, so Δ% scores the part and not the pit wall.

```sh
node tools/shot/garage-angles.mjs --team=ferrari --pair='spineLogo:wrap|saddle' --flat
```

### Session — hot-swapping designs

`--serve` boots once and keeps the garage open; commands are JSON lines on
stdin, one JSON line back each (`id` echoed). A look at a design costs a
settle (~3–20 s on SwiftShader), not a boot. Keys given together apply in
order: team (+seat) → livery | design (+base) → frame → shot → diff → sheet →
reload → status → quit.

| command | does |
|---|---|
| `{"team":"ferrari","seat":1}` | switch team / seat |
| `{"livery":"stealth"}` / `{"design":{"spineLogo":"wrap","sunTint":"#c00000"},"base":"default"}` | paint |
| `{"frame":"spineTop"}` / `{"frame":{"station":"spineSide","az":"100deg"}}` / `{"frame":{"view":"free","eye":[0.8,0.25,4.2],"look":[0,0.35,2]}}` | move the camera (a name, or any of view/station/cam/az/el/dist/target/lamp/zoom/pan/eye/look/clamp/crop) |
| `{"shot":"a"}` | capture as `a.png` (`true` = the tool's own name) |
| `{"diff":["a","b"]}` | Δ fraction + `diff/a__b.diff.png` |
| `{"sheet":"look1"}` | contact sheet of the session's shots |
| `{"reload":true}` | reload the page (the tree as it is now), reopen, re-apply team + paint |
| `{"status":true}` / `{"quit":true}` | state · end |

`--watch[=paths]` (default: `js/car/liverytex.js, liveries.js, car3d.js,
js/data/teams.js, js/garage`) reloads on a source change: in a session it
re-shoots the last camera and emits `{"event":"watch",…}`; in a batch run it
re-walks the matrix and re-runs the sheets and pairs. That is the tightest
loop for painter work: edit → ~10 s → a new frame.

```sh
printf '%s\n' '{"design":{"spineLogo":"wrap"},"frame":"spineTop","shot":"wrap"}' \
  '{"design":{"spineLogo":"saddle"},"shot":"saddle"}' '{"diff":["wrap","saddle"]}' '{"quit":true}' \
  | node tools/shot/garage-angles.mjs --serve --team=ferrari --out=artifacts/session
```

**`apex_garage` (apex-tools MCP)** is the same session as a tool: `op open`
(team, out, fast) once, then `team / livery / design / frame / shot / diff /
sheet / reload / status / close`, every key riding along in order. It holds
the browser lock while open and needs the MCP *server* (`serve` /
`serve-http`); a one-shot `call` ends the session with the process.

### Output

| flag | meaning |
|---|---|
| `--out=dir` | PNGs (default `artifacts/garage-angles`) |
| `--name='{team}-{tag}-{cam}'` | file-name template; tokens `{team} {tag} {cam} {view} {vp} {dpr} {i} {az} {el} {dist}` |
| `--label=0` / `--sheet=0` / `--cols=N` / `--cell=px` | caption bars, contact sheets, columns and cell width. `--fast` defaults both to `0`; pass `--sheet=1` with it to keep the sheets |
| `design-pairs.png` / `diff/` / `flat-sheet.png` / `path-strip.png` | the comparison and dolly outputs above |
| `matrix.png` | written with the sheets when the run has ≥2 cars and ≥2 cameras: rows = car, columns = camera. A `--team=all` run also writes its per-team rollup (`all-teams-<tag>-<view>-rollup.png`, one camera per team) whatever `--sheet` says |
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
