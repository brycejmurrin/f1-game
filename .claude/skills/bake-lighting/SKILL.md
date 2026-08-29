---
name: bake-lighting
description: Use when the user pastes a window.LightPresets = {…} blob or asks to bake these lighting settings, save lighting presets, apply copied lighting values, commit a lighting tune, or ship LIGHTING TUNER COPY VALUES output in Apex 26.
---

# Bake copied LIGHTING TUNER settings and push

**TWO INPUTS, TWO TOOLS. Read the first line of the paste.**

| paste starts with | what it is | tool |
|---|---|---|
| `window.LightEdits = {…}` | a DELTA — only the player's own overrides, what COPY VALUES emits | `merge-proposals.mjs` (merge) |
| `window.LightPresets = {…}` | a full SNAPSHOT of every profile | `bake.mjs` (full replace) |

The **LIGHTING TUNER** COPY VALUES button used to export the file+local merge —
805 conditions, 182,569 characters, which no one could select out of a phone
textarea or paste into a message. It now exports only the local overrides, as
`window.LightEdits`, current condition first. That is a DELTA: feeding it to
`bake.mjs` would write those few keys and delete ~800 others, so `bake.mjs`
refuses it by name and points here. Either way this skill writes shipped
`js/game/light-presets.js`, bumps cache, and commits. localStorage still
outranks the file until RESET.

Live knob work without a paste → **lighting-tuner**.

Per-track agent proposals → `artifacts/lighting/proposals/<id>.json`, then
`node .claude/skills/bake-lighting/merge-proposals.mjs` (validates + merges;
does not bump cache). Never let a subagent write `light-presets.js`.

## CRITICAL — `bake.mjs` is a FULL REPLACE

**Never hand `bake.mjs` a partial object.** It replaces the entire
`window.LightPresets = {…};` literal, so a one-profile paste silently wipes
~800 other keys. Its only safe input is a complete snapshot. A key-count
WARNING (incoming < half of shipped) is a stop sign, not a block; a
`window.LightEdits` paste is refused outright, because that shape is now an
expected input and guessing wrong destroys the file.

```sh
node .claude/skills/bake-lighting/bake.mjs artifacts/tmp/presets.txt   # SNAPSHOT only
```

A player's paste is the other shape, and merges:

```sh
node .claude/skills/bake-lighting/merge-proposals.mjs artifacts/tmp/edits.js
```

## Load on demand

- Capture / one-key hand-merge / review / commit →
  [references/steps.md](references/steps.md).
