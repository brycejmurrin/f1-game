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
python3 tools/lighting/look-survey-sheet.py monaco --out artifacts/look-survey
python3 tools/lighting/look-survey-sheet.py --ready --out artifacts/look-survey   # all circuits with shots
```

Shots land in `artifacts/lighting/shots/<id>/` (gitignored).
Write new sheets under `artifacts/look-survey/` with `--out`, then publish reviewed
sheets using the [release evidence workflow](../EVIDENCE-STORAGE.md). The historical
sheets below are verified release assets; generated images stay outside Git
(`tests/unit/committed-images.test.mjs` guards commits).

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
| Abu Dhabi | [abudhabi_grid.png](https://github.com/brycejmurrin/f1-game/releases/download/evidence-legacy-look-survey-7c4004602495dd34/image-37925f0817e4d6e6795c66e88a29c0dabf412aef592d835facacfe8e3edf4956-abudhabi-grid.png) |
| Baku | [baku_grid.png](https://github.com/brycejmurrin/f1-game/releases/download/evidence-legacy-look-survey-7c4004602495dd34/image-288d8de820bdff200d7c5c4683d302820837c8834a439dcdc86e2573c3b31b31-baku-grid.png) |
| Bahrain | [bahrain_grid.png](https://github.com/brycejmurrin/f1-game/releases/download/evidence-legacy-look-survey-7c4004602495dd34/image-355aef1634b63de5cd5bc2b8713ad9b38aad8ce67f7a4996519522cb5d16217a-bahrain-grid.png) |
| Jeddah | [jeddah_grid.png](https://github.com/brycejmurrin/f1-game/releases/download/evidence-legacy-look-survey-7c4004602495dd34/image-9b499fdfaecafac5f9ca1ae9d84d770cbb006a34f543370397252f8ea678bcb6-jeddah-grid.png) |
| Qatar | [qatar_grid.png](https://github.com/brycejmurrin/f1-game/releases/download/evidence-legacy-look-survey-7c4004602495dd34/image-85c1a2f1666c2b938ca34f6139b1c93b16bf3930c5412e0a973e2853c2433cc7-qatar-grid.png) |
| Silverstone | [silverstone_grid.png](https://github.com/brycejmurrin/f1-game/releases/download/evidence-legacy-look-survey-7c4004602495dd34/image-f1b48a4b2f0ed0ac618f2424e0a86b6355f1477c6dbe48781c737cc6db497568-silverstone-grid.png) |
| Singapore | [singapore_grid.png](https://github.com/brycejmurrin/f1-game/releases/download/evidence-legacy-look-survey-7c4004602495dd34/image-0902cf30ba8141fc371dc1cc20ff90f4c35d3611bb7b25b5367df34cf24ef17e-singapore-grid.png) |
| Spa | [spa_grid.png](https://github.com/brycejmurrin/f1-game/releases/download/evidence-legacy-look-survey-7c4004602495dd34/image-5d2566efe61a76666c3ada52653239d871b0b295da10df6458cc331fae060b0d-spa-grid.png) |
| Las Vegas | [vegas_grid.png](https://github.com/brycejmurrin/f1-game/releases/download/evidence-legacy-look-survey-7c4004602495dd34/image-5d5d11187290aee951dc46b2ce62af92ff9528d9d5cf6121bb7e5fb40bf042be-vegas-grid.png) |
| Zandvoort | [zandvoort_grid.png](https://github.com/brycejmurrin/f1-game/releases/download/evidence-legacy-look-survey-7c4004602495dd34/image-c6ab2879e47e08cdad56113d16fc26eb501edaadd035b10714fe7c3b9f6a0e93-zandvoort-grid.png) |

All 25 sheets (including circuits not in the table): [complete look-survey archive](https://github.com/brycejmurrin/f1-game/releases/download/evidence-legacy-look-survey-7c4004602495dd34/legacy-look-survey-cb0cb2c386db.tar.gz).

The [release](https://github.com/brycejmurrin/f1-game/releases/tag/evidence-legacy-look-survey-7c4004602495dd34) also provides the manifest and checksum file. Extracted sheets are under `files/docs/look-survey/`.
