---
name: lighting-tuner
description: Use when the user says night looks washed out/like day, dawn sun is too high, floodlights/lamps aren't firing, day scene is flat, ambient/exposure/bloom/fog/lighting slider/lightTune/applyRaceSettings issues, or wants to validate Apex 26 lighting.
---

# Tune and validate scene lighting via __apex probes

**Reach for the tuner knobs FIRST.** Nearly every hand-tuned value is a live
`TUNE_DEFS` knob (`js/game/lighting.js`) read via `LT.<id>` each frame.

```js
__apex.lightTune()
__apex.lightTune({ lampLevel: 0.4 })
```

Precedence, lowest→highest: `TUNE_DEFS.def` → shipped
`js/game/light-presets.js` `"*"` → shipped `"track|tod|weather"` →
localStorage `"*"` → localStorage **`track|tod|weather`**. Live slider edits
write the **current condition** key (`LightStore.set` → `profiles[key()]`),
not global `"*"`. Ship a look by baking COPY VALUES into
`js/game/light-presets.js` (**bake-lighting**). Edit `applyRaceSettings` only
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
node tools/test-bg.mjs webgl    # lighting-ab + tuner-grade + probes
node tools/test-bg.mjs ab       # lighting-ab only
```

Related: **bake-lighting**, **webgl-debug**, **debug-cameras**.

## Load on demand

- `lightState` fields, symptom → knob table, A/B capture, contract tests →
  [references/symptoms.md](references/symptoms.md).
