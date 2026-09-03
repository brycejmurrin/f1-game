# Slider-effect A/B sheets

Per-knob visual A/B sheets produced by `tools/lighting/slider-effect.mjs --live`.

Each subfolder `<track>-<condition>-<knob>/` contains `sheet.png`:
- **A** (left) — default value
- **B** (right) — max value
- **diff** (centre-right) — red = B brighter, blue = B darker
- **filter** (far right) — changed pixels only

`<track>-summary.png` — one row per knob, all conditions in one image.

## How to regenerate

```sh
# Single knob A/B
node tools/lighting/slider-effect.mjs --live lampLevel --track monza

# Batch by IDs
node tools/lighting/slider-effect.mjs --live --track monza \
  --ids exposureMul,contrast,saturation,bloomMul,glareStr,neonBoost,lampLevel,ambientMul,fogDensityMul,daySkyBlue

# Copy summary and sheets into docs/slider-effect/
cp artifacts/lighting/slider-effect/summary.png docs/slider-effect/<track>-summary.png
for d in artifacts/lighting/slider-effect/<track>-*/; do
  knob=$(basename $d)
  mkdir -p docs/slider-effect/$knob
  cp $d/sheet.png docs/slider-effect/$knob/sheet.png
done
```

Full reference: `docs/LIGHTING-TUNER-SLIDERS.md` §Tools.
