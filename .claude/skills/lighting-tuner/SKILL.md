---
name: lighting-tuner
description: Use when the user says night looks washed out/like day, dawn sun is too high, floodlights/lamps aren't firing, day scene is flat, ambient/exposure/fog/lighting slider/lightTune/applyRaceSettings issues, or wants to validate Apex 26 lighting knobs via lightState, or pastes a window.LightPresets / LightEdits blob to bake into light-presets.js. Bloom as a GPU/shader defect → webgl-debug. Mirror a new knob across backends → docs/RENDERERS.md §Cross-backend parity after the tune.
---

# Tune and validate scene lighting via __apex probes

**Reach for the tuner knobs FIRST.** Nearly every hand-tuned value is a live
`TUNE_DEFS` knob (`js/lighting/knobs.js`) read via `LT.<id>` each frame.

```js
__apex.lightTune()
__apex.lightTune({ lampLevel: 0.4 })
```

Precedence, lowest→highest: `TUNE_DEFS.def` → shipped
`js/lighting/presets.js` `"*"` → shipped `"track|tod|weather"` →
localStorage `"*"` → localStorage **`track|tod|weather`**. Live slider edits
write the **current condition** key (`LightStore.set` → `profiles[key()]`),
not global `"*"`. Ship a look by baking COPY VALUES into
`js/lighting/presets.js` ([references/bake.md](references/bake.md)). Edit `applyRaceSettings` only
for STRUCTURAL changes.

localStorage (`apex26.lightTune`) outranks shipped presets — RESET in the
LIGHTING TUNER drops the current track/tod/weather back to shipped. Legacy
`"*"` profiles may still win; clear that key if a global override sticks.

**One condition, all 40 circuits.** `__apex.lightCopy()` spreads knobs tuned
here (merged); `lightCopy("look")` sends every live value. Both persist and
return `undo` — `lightCopy({undo})` reverts the fan-out.

`lightState()` is the resolved snapshot *after* `applyRaceSettings`. Compare
before/after; don't guess from AGENTS.md.

## When NOT to Use

- Isolated car paint in the studio → **car-viewer** (`--refl` is not a scene
  knob). Renderer compile / GL errors → **webgl-debug** / **webgpu-debug**.

```sh
node tools/test-bg.mjs gfx      # lighting-ab + tuner-grade + probes + tlx
npm test -- tests/specs/lighting-ab.spec.js   # lighting-ab only
```

Related: **webgl-debug**, **debug-cameras**.

## Visual A/B with slider-effect

`slider-effect` classifies all 183 knobs (no browser) and runs live Playwright
A/B captures with pixel-diff outputs. Use it to confirm a knob is wired and to
see *what region* of the frame it changes.

```sh
# Classify — no browser, instant
node tools/slider-effect.mjs --group LAMPS
node tools/slider-effect.mjs --risk inert --json

# A/B a single knob — Playwright, ~20 s
node tools/slider-effect.mjs --live saturation
node tools/slider-effect.mjs --live lampLevel --from 0 --to 0.55

# Full range ramp (5 shots)
node tools/slider-effect.mjs --live contrast --shots 5

# Batch (one park per shared condition bucket)
node tools/slider-effect.mjs --live --ids bloomMul,glareStr,neonBoost
node tools/slider-effect.mjs --live --group "NIGHT GLOW & BLOOM"

# Dry-run: print recipes without launching browser
node tools/slider-effect.mjs --live glareStr --dry-run
```

Outputs per knob: `a.png`, `b.png`, `filter.png` (changed pixels only),
`diff.png` (red = B brighter, blue = B darker), `heat.png`, `sheet.png`,
`result.json`. Batch runs also write `summary.png` — one row per knob.

Do NOT run `--live` while `cdmcp-cli.py look-survey` holds the box.
Full reference: `docs/LIGHTING-TUNER-SLIDERS.md` §Tools.

## Load on demand

- `lightState` fields, symptom → knob table, A/B capture, contract tests →
  [references/symptoms.md](references/symptoms.md).
- A pasted `window.LightPresets` / `window.LightEdits` blob (LIGHTING TUNER
  COPY VALUES) → [references/bake.md](references/bake.md) — `scripts/bake.mjs`
  is a FULL REPLACE, `scripts/merge-proposals.mjs` merges a delta.
