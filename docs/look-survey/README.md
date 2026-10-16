# Look-survey contact sheets

One 4×5 sheet per circuit: rows `dawn / day / dusk / night`, columns
`dry / wet / rain / fog / overcast`. Captures the **shipped default tuning**
at a representative lap fraction, chase camera, HUD off.

## How to shoot

```sh
# Serve the game (Chrome MCP needs a live URL — not file://)
npx serve -l 3456 .

# Single circuit — all 20 tod×weather combos
python3 tools/mcp/cdmcp-cli.py look-survey monaco --frac 0.45

# Or a subset
python3 tools/mcp/cdmcp-cli.py look-survey bahrain --frac 0.12 \
  --combos dawn|dry,day|dry,dusk|dry,night|dry

# Batch plan (shoots only missing PNGs, safe to re-run)
python3 tools/mcp/cdmcp-cli.py look-survey \
  --plan artifacts/lighting/survey-plan.json

# Stitch the sheet after shooting
python3 tools/lighting/look-survey-sheet.py monaco
python3 tools/lighting/look-survey-sheet.py --ready   # all circuits with shots
```

Shots land in `artifacts/lighting/shots/<id>/` (gitignored).
Sheets are written to `docs/look-survey/` locally, but the PNGs are committed on the
`track-survey-assets` branch, never the deploy branch (`tests/unit/committed-images.test.mjs`
fails the commit). The links below are pinned to its commit `cb0cb2c3`.

## look-survey vs slider-effect

Use **look-survey** when you want a full lighting survey across conditions
for a circuit — e.g. "does night/rain look right on Monaco?"

Use **slider-effect `--live`** when you want to A/B a specific LIGHTING
TUNER knob and measure pixel change — e.g. "does glareStr actually do anything?"

They both launch Chromium; **do not run simultaneously**.
Check first: `pgrep -a chromium | head -3`

Full tool reference: `docs/LIGHTING-TUNER-SLIDERS.md` §Tools for exploring sliders

## Sheets

| Circuit | Sheet |
|---|---|
| Abu Dhabi | [abudhabi_grid.png](https://github.com/brycejmurrin/f1-game/blob/cb0cb2c386dbda6f45d4984cfb4c297a520556b0/docs/look-survey/abudhabi_grid.png?raw=1) |
| Baku | [baku_grid.png](https://github.com/brycejmurrin/f1-game/blob/cb0cb2c386dbda6f45d4984cfb4c297a520556b0/docs/look-survey/baku_grid.png?raw=1) |
| Bahrain | [bahrain_grid.png](https://github.com/brycejmurrin/f1-game/blob/cb0cb2c386dbda6f45d4984cfb4c297a520556b0/docs/look-survey/bahrain_grid.png?raw=1) |
| Jeddah | [jeddah_grid.png](https://github.com/brycejmurrin/f1-game/blob/cb0cb2c386dbda6f45d4984cfb4c297a520556b0/docs/look-survey/jeddah_grid.png?raw=1) |
| Qatar | [qatar_grid.png](https://github.com/brycejmurrin/f1-game/blob/cb0cb2c386dbda6f45d4984cfb4c297a520556b0/docs/look-survey/qatar_grid.png?raw=1) |
| Silverstone | [silverstone_grid.png](https://github.com/brycejmurrin/f1-game/blob/cb0cb2c386dbda6f45d4984cfb4c297a520556b0/docs/look-survey/silverstone_grid.png?raw=1) |
| Singapore | [singapore_grid.png](https://github.com/brycejmurrin/f1-game/blob/cb0cb2c386dbda6f45d4984cfb4c297a520556b0/docs/look-survey/singapore_grid.png?raw=1) |
| Spa | [spa_grid.png](https://github.com/brycejmurrin/f1-game/blob/cb0cb2c386dbda6f45d4984cfb4c297a520556b0/docs/look-survey/spa_grid.png?raw=1) |
| Las Vegas | [vegas_grid.png](https://github.com/brycejmurrin/f1-game/blob/cb0cb2c386dbda6f45d4984cfb4c297a520556b0/docs/look-survey/vegas_grid.png?raw=1) |
| Zandvoort | [zandvoort_grid.png](https://github.com/brycejmurrin/f1-game/blob/cb0cb2c386dbda6f45d4984cfb4c297a520556b0/docs/look-survey/zandvoort_grid.png?raw=1) |

All 25 sheets (including circuits not in the table): [docs/look-survey/ on track-survey-assets](https://github.com/brycejmurrin/f1-game/tree/cb0cb2c386dbda6f45d4984cfb4c297a520556b0/docs/look-survey).
