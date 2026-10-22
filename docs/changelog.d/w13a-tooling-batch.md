Fixed: `helmet-sheet.mjs` creates parent dirs for nested `--out` paths under `scratch/renders` (#3427).
Fixed: `quick-validate.mjs` handles `--help`/`-h` and rejects a non-numeric port before starting the server (#3324).
Fixed: `agent.mjs help <hook>` resolves colliding hook names (`world`, `track`, …) from `docs/agent-index.json` without booting Chromium (#3327).
Fixed: `probe-page.mjs` screenshot timeout is configurable (`--shot-timeout` / `opts.timeout`) and falls back to a 2×2 tiled CDP capture when a full-frame shot times out on SwiftShader.
