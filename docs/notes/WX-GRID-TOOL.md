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

Reproduce with the commands above; paste the `ratios` block from `luminance.json`.
Cloud VM = SwiftShader / TLX (`three`) unless a real GPU is present.

| site | backend | storm/rain day L | fog/dry night L | notes |
|---|---|---|---|---|
| monaco T1 | *(fill after run)* | | | storm≈rain by day when ≈1; milky fog when fog/dry ≫ 1 |
| vegas T5 | *(fill after run)* | | | Vegas night horizon band is visual on the sheet |

Ratios the lighting lane cares about (`luminance.json` → `ratios`):

- `stormVsRainDay` — day storm mean L / day rain mean L (target after fix: storm darker, ratio &lt; 1)
- `fogNightVsDryNight` — night fog / night dry (review saw ~1.3–3.2× milky nights)
- `overcastNightVsDryNight` — night overcast / night dry

## Caps

≤ 25 screenshots/captures per lane run (24 cells + 1 sheet). No `js/` edits.
