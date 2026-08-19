# Look-survey contact sheets

One 4×5 sheet per circuit: rows `dawn / day / dusk / night`, columns
`dry / wet / rain / fog / overcast`. Captures the **shipped default tuning**
at a representative lap fraction, chase camera, HUD off.

## How to shoot

```sh
# Serve the game (Chrome MCP needs a live URL — not file://)
npx serve -l 3456 .

# Single circuit — all 20 tod×weather combos
python3 tools/cdmcp-cli.py look-survey bahrain --frac 0.35

# Or a subset
python3 tools/cdmcp-cli.py look-survey bahrain --frac 0.35 \
  --combos dawn|dry,day|dry,dusk|dry,night|dry

# Batch plan (shoots only missing PNGs, safe to re-run)
python3 tools/cdmcp-cli.py look-survey \
  --plan artifacts/lighting/survey-plan-frac-fixes.json

# Stitch the sheet after shooting
python3 tools/look-survey-sheet.py monaco
python3 tools/look-survey-sheet.py --ready   # all circuits with shots
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

## Per-track lap fraction

The `frac` is the `park()` position used when shooting. The default `0.12`
was a poor angle for several circuits; the corrected values are in
`artifacts/lighting/survey-plan-frac-fixes.json` and noted below.

| Circuit | frac | notes |
|---|---|---|
| Hockenheim | 0.40 | stadium straight — open sky; 0.12 landed in dark forest tunnel |
| Istanbul | 0.35 | turn 8 complex with background hills; 0.12 was blank straight |
| Singapore | 0.55 | open city sightline; 0.12 was inside underpass |
| Silverstone | 0.30 | Maggotts entry, open horizon; 0.12 put every panel under the gantry |
| Monaco | 0.12 | best available — fracs 0.30/0.45/0.60/0.77 all land in/near tunnel |
| Catalunya | 0.30 | turn 3 entry with Spanish landscape; 0.12 was pitlane wall |
| Estoril | 0.35 | hillside valley view; 0.12 was generic urban section |
| Bahrain | 0.35 | banked corner with mast sightline; 0.12 was flat desert straight |
| Buenos Aires | 0.25 | main straight with open sky; 0.12 had blocked canopy |
| all others | 0.12 | default |

## Sheets

| Circuit | Sheet |
|---|---|
| Abu Dhabi | [abudhabi_grid.png](abudhabi_grid.png) |
| Baku | [baku_grid.png](baku_grid.png) |
| Bahrain | [bahrain_grid.png](bahrain_grid.png) |
| Buenos Aires | [buenos_aires_grid.png](buenos_aires_grid.png) |
| Catalunya | [catalunya_grid.png](catalunya_grid.png) |
| Estoril | [estoril_grid.png](estoril_grid.png) |
| Hockenheim | [hockenheim_grid.png](hockenheim_grid.png) |
| Istanbul | [istanbul_grid.png](istanbul_grid.png) |
| Jeddah | [jeddah_grid.png](jeddah_grid.png) |
| Monaco | [monaco_grid.png](monaco_grid.png) |
| Monza | [monza_grid.png](monza_grid.png) |
| Qatar | [qatar_grid.png](qatar_grid.png) |
| Silverstone | [silverstone_grid.png](silverstone_grid.png) |
| Singapore | [singapore_grid.png](singapore_grid.png) |
| Spa | [spa_grid.png](spa_grid.png) |
| Suzuka | [suzuka_grid.png](suzuka_grid.png) |
| Las Vegas | [vegas_grid.png](vegas_grid.png) |
| Zandvoort | [zandvoort_grid.png](zandvoort_grid.png) |
