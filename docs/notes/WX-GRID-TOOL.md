# Weather×time grid (`tools/shot/wx-grid.mjs`)

Fleet D·W13·Le (2026-10-21). look-survey had no storm column; lighting findings for
[#3387](https://github.com/brycejmurrin/f1-game/pull/3387) (storm≈rain by day, dawn
whiteout, milky fog/overcast nights, weather-invariant lamps, Vegas horizon band)
needed a repeatable measurement before the lighting lane can fix them. This tool
does **not** change lighting code.

## What a run is

One Chromium boot, 6 weathers (`dry|wet|rain|storm|overcast|fog`) × 4 times
(`dawn|day|dusk|night`) = **24 cells**. Pins: seed `42`, eye height `4.25` m,
FOV `60°`, camera via `__apex.eyeAt` at a curated `def.turns` apex (`--turn N`,
1-based). Backend: `--backend auto` prefers WebGPU, then three, then webgl2, and
prints which actually ran (cloud VMs without `/dev/dri` usually fall back to
three/SwiftShader).

Output under `artifacts/wx-grid/<track>-T<n>/` (gitignored — never commit):

| file | contents |
|---|---|
| `<tod>-<wx>.png` | one frame per cell |
| `<track>-wx-grid.png` | labelled 6×4 contact sheet |
| `luminance.json` | mean L (Rec.709), mean RGB, saturation per cell + ratios |

Pure maths live in `tools/shot/lib/wx-grid.mjs` (unit-tested). Storm was also
added to `tools/mcp/cdmcp-cli.py look-survey` weather choices / default combos;
the 4×5 `look-survey-sheet.py` stitcher is unchanged (use wx-grid for storm).

## Recipes

```sh
# Monaco T1 (Ste Devote) — review baseline
node tools/shot/wx-grid.mjs --track monaco --turn 1
# Vegas T5
node tools/shot/wx-grid.mjs --track vegas --turn 5
# Plan only (no browser)
node tools/shot/wx-grid.mjs --track monaco --turn 1 --plan
# Pin a backend
node tools/shot/wx-grid.mjs --track monaco --turn 1 --backend three
```

Publish selected evidence (do not commit captures):

```sh
node tools/shot/publish-evidence.mjs --dir artifacts/wx-grid/monaco-T1 --label w13e --publish
```

## Baseline for #3387 (measured this session)

Pinned: seed 42, eye 4.25 m, FOV 60°, `--backend three` (no `/dev/dri` → WebGPU
blank; TLX/SwiftShader). Head `f35aed8d1` / deploy tip `4e04638929`.

| site | backend | storm/rain day | fog/dry night | overcast/dry night | notes |
|---|---|---|---|---|---|
| monaco T1 (frac 0.0666) | three | **0.8282** (L 66.6 / 80.4) | **1.8435** (76.0 / 41.2) | 1.5161 (62.5 / 41.2) | dawn\|storm nearly black (mean L 2.1) — capture anomaly / lighting hole |
| vegas T5 (frac 0.1093) | three | **0.8759** (L 63.5 / 72.5) | **2.1712** (69.6 / 32.1) | 1.5285 (49.0 / 32.1) | fog night milky in the review’s 1.3–3.2× band; storm day already &lt; rain on tip |

Raw `ratios` from `luminance.json`:

```json
// monaco T1
{ "stormVsRainDay": 0.8282, "fogNightVsDryNight": 1.8435, "overcastNightVsDryNight": 1.5161 }
// vegas T5
{ "stormVsRainDay": 0.8759, "fogNightVsDryNight": 2.1712, "overcastNightVsDryNight": 1.5285 }
```

Ratios the lighting lane cares about:

- `stormVsRainDay` — day storm mean L / day rain mean L (review: ≈1 washed-out; tip already &lt;1 on three, still verify on real GPU)
- `fogNightVsDryNight` — night fog / night dry (review ~1.3–3.2× milky nights — **reproduced**)
- `overcastNightVsDryNight` — night overcast / night dry

Sheets (gitignored): `artifacts/wx-grid/monaco-T1/monaco-wx-grid.png`,
`artifacts/wx-grid/vegas-T5/vegas-wx-grid.png`.

## Caps

≤ 25 screenshots/captures per lane run (24 cells + 1 sheet per track; both tracks
run for DONE WHEN). No `js/` edits.
