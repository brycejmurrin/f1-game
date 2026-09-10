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

**One Chromium** for the whole matrix: teams × design axes × views. Never spawn
one browser per team or per angle.

## Fast iteration

```sh
# Print the matrix without booting (shot count + rough ETA):
node tools/shot/garage-angles.mjs --plan --team=redbull \
  --spineLogo=wrap --finBadge=logo --views=front,side,rear

# Purpose presets (override with explicit flags):
node tools/shot/garage-angles.mjs --preset=list
node tools/shot/garage-angles.mjs --preset=wall  --team=ferrari --logo=#ffffff --logo2=#0066ff
node tools/shot/garage-angles.mjs --preset=flank --team=redbull --spineLogo=wrap --spineSide=none
node tools/shot/garage-angles.mjs --preset=fin   --team=ferrari --finBadge=logo
node tools/shot/garage-angles.mjs --preset=bay   --team=all --fast
node tools/shot/garage-angles.mjs --preset=bayFront --team=ferrari --fast
node tools/shot/garage-angles.mjs --preset=saddleWall --team=all --fast
node tools/shot/garage-angles.mjs --preset=mark  --team=redbull --logo=#00ffcc --logo2=#ff0066 --logo3=#111111

# Fast mode: fewer settle frames, no label/sheet, one gate retry (~40% quicker per shot):
node tools/shot/garage-angles.mjs --fast --preset=quick --team=redbull --spineLogo=wrap

# Live gallery: auto-refreshing live.html after each shot (pair with --fast for big matrices).
# --live does NOT open github.io — use --site/--cdn for the deployed build:
node tools/shot/garage-angles.mjs --fast --live --team=redbull,ferrari --views=front,side \
  --spineLogo=wrap,saddle --spineSide=none,logo --out=artifacts/combo-live

# Orbit framing beyond zoom/pan (UI click counts, or absolute radians):
node tools/shot/garage-angles.mjs --fast --views=bay --az-nudge=-1 --team=ferrari
node tools/shot/garage-angles.mjs --fast --views=hero --az=2.0 --el=0.28 --team=mercedes

# Tune settle yourself (defaults: livery 8, view 4; was 12/6):
node tools/shot/garage-angles.mjs --settle=6 --view-settle=3 --views=side --team=redbull
```

Presets:

| preset | views | framing | also sets |
|---|---|---|---|
| `wall` | front | zoom 4 | — |
| `fin` | rear | zoom 4 | — |
| `flank` | side | zoom 8, pan 5,0 | — |
| `bay` | bay | zoom 1 | rear-left three-quarter + back wall |
| `bayFront` | bayFront | zoom 1 | front-left opposite diagonal |
| `saddleWall` | bayFront | zoom 1 | `spineLogo=saddle`, `spineSide=logo`, `--logos=default` |
| `mark` | front, side, rear | zoom 6, pan 4,0 | `finBadge=logo` |
| `quick` | side | zoom 6, pan 4,0 | `--fast` |

Views include `bay` / `bayFront` (tool + `__apex.garageFrame`). `bayFront` is the
opposite diagonal of `bay`: door-side corner on the left flank — left side of
the car and the back-wall crest, not head-on. `--logos=default` clears
`logo`/`logo2`/`logo3` so wall and saddle marks use team default colours.

## Design axes (any `Liveries.FIELDS` key)

Colours: `#rrggbb`. Enums validated in-page against the real list.

```sh
node tools/shot/garage-angles.mjs --team=redbull \
  --spineLogo=wrap,saddle --spineSide=none,logo \
  --logo=#00ffcc --logo2=#ff0066 --logo3=#111111 \
  --views=front,side,rear --out=artifacts/garage-mark
```

Legacy aliases still work: `--spine-logo`, `--spine-side`.

## A/B without checking out the ref

```sh
node tools/shot/garage-angles.mjs --team=ferrari --views=side \
  --spineSide=logo --against=HEAD~1 --out=artifacts/garage-ab
```

Serves differing js/css/shell blobs from memory; reuses the same Playwright page
for the B pass (one boot, two reloads).

## Output

- PNGs under `--out` (default `artifacts/garage-angles`)
- Caption bars under each frame (`--label=0` to skip)
- Contact sheet `sheet.png` (`--sheet=0` to skip)
- `live.html` auto-refresh gallery when `--live` (3 s refresh, one card per shot)
- JSON sidecar `<teams>-angles.json` with per-shot settle/capture/gate ms

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

```sh
# Typical Cloud / CI invocation (no manual xvfb once DISPLAY is sane):
node tools/shot/garage-angles.mjs --fast --preset=flank --team=ferrari \
  --spineSide=logo --out=artifacts/garage-flank

# All teams, saddle + default logos, front-left diagonal (left flank + back wall):
node tools/shot/garage-angles.mjs --fast --preset=saddleWall --team=all \
  --out=artifacts/garage-saddle-wall

# Plan first — shot count + rough ETA, zero Chromium:
node tools/shot/garage-angles.mjs --plan --preset=flank --team=ferrari,mercedes
```

## When NOT to use

- Placement-only questions → `spine-station.mjs` first.
- Isolated car geometry with no garage shell → `render-car.mjs`.
- Live poking / console → mcp-probe skill, not this batch tool.
