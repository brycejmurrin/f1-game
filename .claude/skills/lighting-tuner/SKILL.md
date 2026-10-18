---
name: lighting-tuner
description: "Use when night looks washed out or like day, dawn sun is too high, floodlights/lamps are not firing (dusk/dawn/night gate, lamp cap), the day scene is flat, ambient/exposure/fog/lighting slider/lightTune/applyRaceSettings issues, validating knobs via lightState, or baking a pasted window.LightPresets / LightEdits blob into js/lighting/presets.js. Bloom as GPU/shader defect is renderer-debug; adding or moving floodlight masts is scenery-dress."

---

# Tune and validate scene lighting via __apex probes

The `__apex` probes, `apex-eval`, `slider-effect --live` and capture commands boot
Chromium: parent session only, never a subagent (AGENTS.md rule 10).

**Reach for the tuner knobs FIRST.** Nearly every hand-tuned value is a live
`TUNE_DEFS` knob (`js/lighting/knobs.js`) read via `LT.<id>` each frame.

```js
__apex.lightTune()
__apex.lightTune({ lampLevel: 0.4 })
```

Precedence, lowest → highest (a later layer wins):

1. `TUNE_DEFS.def`
2. shipped `js/lighting/presets.js` `"*"`
3. shipped `"*|tod|wx"` (shared stamp, e.g. `"*|night|dry"`)
4. shipped `"track|tod|weather"`
5. shipped `"*|tod"` — only when `gfx.hasPerChunkLights` (all presets/device classes)
6. localStorage `"*"`
7. localStorage **`track|tod|weather`**

Live slider edits write the **current condition** key (`LightStore.set` →
`profiles[key()]`), not global `"*"`. Ship a look by merging the COPY VALUES
`LightEdits` delta into `js/lighting/presets.js`; no blob, just one number to
change → edit that key by hand per
[references/bake.md §One-key hand-merge](references/bake.md#one-key-hand-merge-no-bakemjs).
Edit `applyRaceSettings` only for STRUCTURAL changes.

localStorage (`apex26.lightTune`) outranks shipped presets — RESET in the
LIGHTING TUNER drops the current track/tod/weather back to shipped. Legacy
`"*"` profiles may still win; clear that key if a global override sticks.

**One condition, every circuit** (`Tracks.LIST`). `__apex.lightCopy()` spreads knobs tuned
here (merged); `lightCopy("look")` sends every live value. Both persist and
return `undo` — `lightCopy({undo})` reverts the fan-out.

`lightState()` is the resolved snapshot *after* `applyRaceSettings`. Compare
before/after; don't guess from AGENTS.md.

## When NOT to Use

- Isolated car paint in the studio → **playwright-probe** `references/car-studio.md` (`--refl` is not a scene
  knob). Renderer compile / GL errors → **renderer-debug**.

```sh
node tools/ci/test-bg.mjs gfx      # lighting-ab + tuner-grade + probes + tlx
npm test -- tests/specs/lighting-ab.spec.js   # lighting-ab only
```

Related: **renderer-debug**, **playwright-probe** (`references/cameras.md`).

## Visual A/B with slider-effect

`slider-effect` classifies the live knob registry (no browser) and runs live Playwright
A/B captures with pixel-diff outputs. Use it to confirm a knob is wired and to
see *what region* of the frame it changes.

```sh
# Classify — no browser, instant
node tools/lighting/slider-effect.mjs --group LAMPS
node tools/lighting/slider-effect.mjs --risk inert --json

# A/B a single knob — Playwright, ~20 s
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

Outputs per knob: `a.png`, `b.png`, `filter.png` (changed pixels only),
`diff.png` (red = B brighter, blue = B darker), `heat.png`, `sheet.png`,
`result.json`. Batch runs also write `summary.png` — one row per knob.

Do NOT run `--live` while `tools/mcp/cdmcp-cli.py look-survey` holds the box.
Do NOT launch from an agent session without an explicit ask:
`tools/lighting/lighting-tuner-sweep.mjs` or `tools/lighting/ab-lighting.mjs run all` — those are human/CI lattices. Agent default
is classify → `--live <one id>` → bake.
Full reference: `docs/LIGHTING-TUNER-SLIDERS.md` §Tools.

## Load on demand

- `lightState` fields, symptom → knob table, A/B capture, contract tests →
  [references/symptoms.md](references/symptoms.md).
- A pasted `window.LightPresets` / `window.LightEdits` blob (LIGHTING TUNER
  COPY VALUES) → [references/bake.md](references/bake.md) — `scripts/bake.mjs`
  is a FULL REPLACE, `scripts/merge-proposals.mjs` merges a delta.

COPY VALUES exports `LightEdits` deltas; merged `lightState()` is observation, not a full export.

Upstream graphics playbook (atmosphere, grading, shadows): [references/graphics-atmosphere-playbook.md](references/graphics-atmosphere-playbook.md).
