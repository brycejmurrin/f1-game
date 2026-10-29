# Visual A/B with slider-effect

`tools/lighting/slider-effect.mjs` classifies the live knob registry (no browser) and runs live
Playwright A/B captures with pixel-diff outputs. Use it to confirm a knob is wired and to see
*what region* of the frame it changes. `--live` boots Chromium: parent only.

```sh
# Classify — no browser, instant
node tools/lighting/slider-effect.mjs --group LAMPS
node tools/lighting/slider-effect.mjs --risk inert --json
node tools/lighting/slider-effect.mjs --gate night          # the night knobs

# A/B a single knob — Playwright
node tools/lighting/slider-effect.mjs --live saturation
node tools/lighting/slider-effect.mjs --live lampLevel --from 0 --to 0.55

# Full range ramp (5 shots)
node tools/lighting/slider-effect.mjs --live contrast --shots 5

# Batch (one park per shared condition bucket)
node tools/lighting/slider-effect.mjs --live --ids bloomMul,glareStr,neonBoost
node tools/lighting/slider-effect.mjs --live --group "NIGHT GLOW & BLOOM"

# Dry-run: print recipes without launching browser
node tools/lighting/slider-effect.mjs --live glareStr --dry-run
```

Outputs per knob: `a.png`, `b.png`, `filter.png` (changed pixels only), `diff.png` (red = B
brighter, blue = B darker), `heat.png`, `sheet.png`, `result.json`. Batch runs also write
`summary.png` — one row per knob.

## Do not

- Run `--live` while `tools/mcp/cdmcp-cli.py look-survey` holds the box.
- Launch `tools/lighting/lighting-tuner-sweep.mjs` or `tools/lighting/ab-lighting.mjs run all`
  from an agent session without an explicit ask — those are human/CI lattices. Agent default is
  classify → `--live <one id>` → bake.

Full reference: `docs/LIGHTING-TUNER-SLIDERS.md` §Tools.
