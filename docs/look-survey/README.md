# Look-survey contact sheets

One 4×5 sheet per circuit: rows `dawn / day / dusk / night`, columns
`dry / wet / rain / fog / overcast`. Captures the **shipped default tuning**
at a representative lap fraction, chase camera, HUD off.

## How to shoot

```sh
# Serve the game (Chrome MCP needs a live URL — not file://)
npx serve -l 3456 .

# Single circuit — all 20 tod×weather combos
python3 tools/cdmcp-cli.py look-survey monaco --frac 0.45

# Or a subset
python3 tools/cdmcp-cli.py look-survey bahrain --frac 0.12 \
  --combos dawn|dry,day|dry,dusk|dry,night|dry

# Batch plan (shoots only missing PNGs, safe to re-run)
python3 tools/cdmcp-cli.py look-survey \
  --plan artifacts/lighting/survey-plan.json

# Stitch the sheet after shooting
python3 tools/lighting/look-survey-sheet.py monaco
python3 tools/lighting/look-survey-sheet.py --ready   # all circuits with shots
```

Shots land in `artifacts/lighting/shots/<id>/` (gitignored).
Sheets land here in `docs/look-survey/` (committed).

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
| Abu Dhabi | [abudhabi_grid.png](abudhabi_grid.png) |
| Baku | [baku_grid.png](baku_grid.png) |
| Bahrain | [bahrain_grid.png](bahrain_grid.png) |
| Jeddah | [jeddah_grid.png](jeddah_grid.png) |
| Qatar | [qatar_grid.png](qatar_grid.png) |
| Silverstone | [silverstone_grid.png](silverstone_grid.png) |
| Singapore | [singapore_grid.png](singapore_grid.png) |
| Spa | [spa_grid.png](spa_grid.png) |
| Las Vegas | [vegas_grid.png](vegas_grid.png) |
| Zandvoort | [zandvoort_grid.png](zandvoort_grid.png) |
