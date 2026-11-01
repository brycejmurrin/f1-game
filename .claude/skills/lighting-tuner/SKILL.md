---
name: lighting-tuner
description: "Use when lighting looks wrong: night washed out or like day, dawn sun too high, floodlights dark, flat day scene, exposure or fog off, or baking pasted LightPresets into presets.js. Not for: bloom → renderer-debug; floodlight masts → scenery-dress; textures → asset-pack."

---

# Tune and validate scene lighting via __apex probes

## Gotchas

- `apex-eval`, `slider-effect --live`, the `__apex` probes and every capture boot Chromium:
  parent session only, never a subagent (AGENTS.md rule 10).
- A value a `"<track>|<tod>|<wx>"` row does not pin is INHERITED from the shared `"*|<tod>|<wx>"`
  stamp in `js/lighting/presets.js`, not the knob default. Read the resolved value with
  `__apex.lightTune()` and the stamp's value in presets.js; never quote a remembered number.
- Editing a `"*|tod|wx"` stamp or running `lightCopy()` changes EVERY circuit: only for a fleet
  complaint, and say so in the PR. A one-track complaint edits that track's row.
- localStorage (`apex26.lightTune`) outranks shipped presets until RESET in the LIGHTING TUNER; a
  legacy `"*"` profile may still win.
- `numLights` counts only `G.frame.lights`: read the other lamp fields (references/symptoms.md
  §lightState) before calling floodlights off.
- COPY VALUES exports a `window.LightEdits` DELTA; `bake.mjs` is a FULL REPLACE: never feed it a
  delta or a one-key object (references/bake.md).

## Workflow

1. **Pin the condition**: track, time of day, weather (wet/rain is a different row) and backend
   (the owner plays TLX WebGPU on an iPhone; a headless probe is a software backend, which changes
   precedence layer 5). The key is `<track>|<tod>|<weather>` (`key()` in `js/lighting/profiles.js`:
   tod `default` → `def.night`, storm → rain).
2. **Measure before any knob** (parent only):
   ```sh
   node tools/shot/apex-eval.mjs singapore "(a.setTimeOfDay('night'), a.lightState())" --raw
   ```
3. **Read both rows** in `js/lighting/presets.js`: the track's key and the `"*|<tod>|<wx>"` stamp.
4. **Map symptom → field → knob** with [references/symptoms.md](references/symptoms.md). Night
   washed out: resolved `nightAmbLift` first, then `mistDensity`/`fogDensityMul`,
   `bloomMul`/`bloomKnee`, `cityGlowMul`, `exposureMul`.
5. **Try the knob live**: `__apex.lightTune({ nightAmbLift: 1.1 })` (knobs are `TUNE_DEFS` in
   `js/lighting/knobs.js`, read via `LT.<id>` each frame). Confirm wiring and the changed region
   with `slider-effect` (classify → `--live <one id>`).
6. **Compare** `lightState()` before/after (it is the resolved snapshot after `applyRaceSettings`);
   don't guess from docs.
7. **Ship**: merge the `LightEdits` delta (`merge-proposals.mjs`), or hand-merge one key; edit
   `applyRaceSettings` only for STRUCTURAL changes.
8. **Verify** a `js/lighting/` or `presets.js` edit:
   ```sh
   mkdir -p artifacts/tmp
   git diff --name-only origin/claude/f1-game-project-26h3ng > artifacts/tmp/changed.txt
   node tools/ci/geometry-paths.mjs --targeted artifacts/tmp/changed.txt   # run each named node suite
   node tools/ci/test-bg.mjs --spec tests/specs/lighting-ab.spec.js        # parent only
   ```
   The whole `gfx` group only when `applyRaceSettings`' structure changed:
   `node tools/ci/remote-group.mjs gfx` on the pushed branch.

## References

- [references/symptoms.md](references/symptoms.md): read when a complaint names a look (night like
  day, dim lamps, warm cast) and you need the `lightState()` field, the knob, before/after or
  same-corner A/B commands, or which contract spec covers it.
- [references/precedence.md](references/precedence.md): read when a value does not change, a slider
  edit "doesn't stick", or you must choose which presets layer to edit or fan out with `lightCopy()`.
- [references/slider-effect.md](references/slider-effect.md): read before running
  `tools/lighting/slider-effect.mjs` (classify or `--live` A/B), or when tempted to run a sweep.
- [references/bake.md](references/bake.md): read when the user pastes a `window.LightEdits` or
  `window.LightPresets` blob, or you are about to write `js/lighting/presets.js`.
- [references/graphics-atmosphere-playbook.md](references/graphics-atmosphere-playbook.md): read
  when translating Three.js atmosphere/grading/shadow advice into Apex knobs.

Not this skill: isolated car paint in CAR STUDIO →
[../playwright-probe/references/car-studio.md](../playwright-probe/references/car-studio.md)
(`--refl` is not a scene knob); camera framing for captures →
[../playwright-probe/references/cameras.md](../playwright-probe/references/cameras.md); compile or
GL errors → **renderer-debug**.

## Scripts (run, don't read)

- `scripts/merge-proposals.mjs`: run for a `window.LightEdits` paste or agent proposals in
  `artifacts/lighting/proposals/`. Writes a DELTA merge into `js/lighting/presets.js` (only the
  given keys and knobs; validates against `TUNE_DEFS`).
  `node .claude/skills/lighting-tuner/scripts/merge-proposals.mjs [artifacts/tmp/edits.js] [--check]`
- `scripts/bake.mjs`: run ONLY for a complete `window.LightPresets` snapshot. FULL REPLACE of the
  `window.LightPresets` literal in `js/lighting/presets.js`; refuses `LightEdits`.
  `node .claude/skills/lighting-tuner/scripts/bake.mjs artifacts/tmp/presets.txt [--check]`

Both take `--check` (dry run) and `--json`; neither commits or bumps cache. Read
[references/bake.md](references/bake.md) first.
