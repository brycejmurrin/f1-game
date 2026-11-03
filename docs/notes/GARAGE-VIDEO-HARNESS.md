# Garage video capture harness

Kind: how-to · Re-measure-by: 2027-02-01

Headless recorder for garage entry / exit / after-race previews. Walks STYLE ×
GARAGE ANGLE × tune settings, records each clip, writes contact sheets and a
timing JSON, and auto-flags bad clips. Pure flag logic is unit-tested; the
browser path reuses the SETTINGS → ADVANCED VISUALS → GARAGE ENTER & LEAVE UI
(the same route as `tests/specs/garage-first-frame.spec.js`).

## Files

| path | role |
|---|---|
| `tools/shot/garage-video.mjs` | CLI: plan / analytic / headless record / re-flag |
| `tools/shot/garage-video-checks.mjs` | Pure flags + matrix builders (no browser) |
| `tests/unit/garage-video-checks.test.mjs` | Flag + parser contracts |

## Usage

```sh
# Matrix only (no Chromium)
node tools/shot/garage-video.mjs --plan

# Analytic poses in a Node VM (fast, deterministic flags)
node tools/shot/garage-video.mjs --analytic --style=broadcast,cinema --angle=cut,crane --dir=in,out

# Headless record (recordVideo ticks rAF; default out under scratch/)
node tools/shot/garage-video.mjs --limit=2
node tools/shot/garage-video.mjs --style=cinema --angle=crane --dir=out --tune=hold=0

# Re-run flags on a previous timing.json
node tools/shot/garage-video.mjs --checks-only=scratch/captures/garage-video/timing.json
```

Defaults: styles `broadcast,cinema`; angles `cut,crane`; dirs `in,out`; tunes
`default|hold=0` (pipe = alternate full tunes). `--style=all` / `--angle=all` /
`--dir=all` expand to the shipped catalogs in `garage-video-checks.mjs`.

## Outputs

Under `--out` (default `scratch/captures/garage-video/`):

- `timing.json` — every clip's expected / recorded / wall seconds and pose samples
- `flags.json` — roll-up of auto-flags
- `<clip-id>/clip.webm` — recorded preview (browser mode)
- `<clip-id>/frames/f_*.png` — ffmpeg extracts
- `<clip-id>/sheet.png` — contact sheet (`montage`; skip with `--sheet=0`)
- `<clip-id>/clip.json` — per-clip copy of the timing row

## Auto-flags

| id | meaning |
|---|---|
| `ends-early` | `recordedSec` < `expectedSec` × 0.85 |
| `car-still` | car xz travel across samples < 0.35 m |
| `camera-oob` | any eye outside the bay AABB (±5.4 x, 0.3–3.6 y, ±6.4 z) |
| `never-finishes` | last sample still `active`, wall hang past 1.5× expected with no inactive sample, empty samples, or expectedSec ≤ 0 — includes the HOLD BEAT `hold=0` hang case |

## Why recordVideo

Headless Chromium freezes `requestAnimationFrame` at 0 fps unless the compositor
screencast runs. Playwright's `recordVideo` is the same portable trick as
`tools/shot/motion-capture.mjs`: the preview actually advances, the webm holds
real frames, and ffmpeg (Playwright's stripped build) extracts PNGs for the sheet.

Playwright also needs its own ffmpeg binary to *write* the webm:

```sh
npx playwright install ffmpeg
```

Without it the harness still samples poses (and can flag them) but records no
`clip.webm` / sheet — see `source: "browser-error"` in timing.json.

## Related

- Analytic poses without a browser: `tools/garage/arrival-poses.mjs`
- Still garage matrix: `tools/shot/garage-angles.mjs`
- Camera-rig bay bounds: `tests/unit/garage-camera-rigs.test.mjs`
