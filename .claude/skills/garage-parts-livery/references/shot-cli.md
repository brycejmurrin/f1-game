# Garage shot command contract

**Use when:** running or reviewing a batch `garage-angles.mjs` capture.

**Inputs:** team/design selection, view or station preset, output directory, and
whether the run is a plan, capture, or comparison.

**Verification:** run `--plan --reset` before destructive output changes; record
the renderer, preset, team set, output path, and whether the browser was local or
CI. Compare like-for-like presets before judging a visual delta.

**Writes/ownership:** writes only capture artifacts under `artifacts/`.
Garage geometry and livery source edits remain owned by
`garage-parts-livery`; isolated car shots route to `playwright-probe`.

## Before you run

1. Check `/proc/loadavg` < 3; a busy box measures the machine, not the code.
2. Reap orphan Chromium from prior probes.
3. Never run while Playwright browser groups are in flight.
4. Headless SwiftShader needs a usable GL context. The tool clears a dead local
   `DISPLAY=:N`; if GL is still missing, use `unset DISPLAY` or
   `xvfb-run -a node tools/shot/garage-angles.mjs …`.

## Offline preflight

`--plan --reset` validates the capture plan before output reset or creation.
It preserves existing artifacts while validating design fields, enums, part ids,
and per-team availability. Review that plan before a parent-owned run.

## Routing

- Placement-only questions → `spine-station.mjs` first.
- Isolated car geometry → `render-car.mjs`.
- Live console/UI poking → `mcp-probe`.
- Batch screenshots and scripted profiles → `playwright-probe`.
