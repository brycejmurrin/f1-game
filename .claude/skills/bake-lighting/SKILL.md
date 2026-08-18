---
name: bake-lighting
description: Use when the user pastes a window.LightPresets = {…} blob or asks to bake these lighting settings, save lighting presets, apply copied lighting values, commit a lighting tune, or ship LIGHTING TUNER COPY VALUES output in Apex 26.
---

# Bake copied LIGHTING TUNER settings and push

The **LIGHTING TUNER** COPY VALUES button exports the file+local merge as
`window.LightPresets = {…}`. This skill writes that blob into shipped
`js/game/light-presets.js`, bumps cache, and commits. localStorage still
outranks the file until RESET.

Live knob work without a paste → **lighting-tuner**.

Per-track agent proposals → `artifacts/lighting/proposals/<id>.json`, then
`node .claude/skills/bake-lighting/merge-proposals.mjs` (validates + merges;
does not bump cache). Never let a subagent write `light-presets.js`.

## CRITICAL — `bake.mjs` is a FULL REPLACE

**Never hand `bake.mjs` a partial object.** It replaces the entire
`window.LightPresets = {…};` literal. A one-profile paste silently wipes
~250 other keys. The only safe input is the tuner's COPY VALUES export
(already a complete merge). A key-count WARNING (incoming < half of
shipped) is a stop sign, not a block.

```sh
node .claude/skills/bake-lighting/bake.mjs artifacts/tmp/presets.txt
```

## Load on demand

- Capture / one-key hand-merge / review / commit →
  [references/steps.md](references/steps.md).
