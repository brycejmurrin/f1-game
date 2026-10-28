---
name: lighting-tuner
description: "Use when lighting looks wrong: night washed out or like day, dawn sun too high, floodlights dark, flat day scene, exposure or fog off, or baking pasted LightPresets into presets.js. Not for: bloom → renderer-debug; floodlight masts → scenery-dress; textures → asset-pack."

---

# Tune and validate scene lighting via __apex probes

The `__apex` probes, `apex-eval`, `slider-effect --live` and capture commands boot
Chromium: parent session only, never a subagent (AGENTS.md rule 10).

**Step 1, always: MEASURE before any knob.** Pin the report's condition — track, time of day,
weather (a wet or rain report is a different row) and backend (the owner plays TLX WebGPU on an
iPhone; a headless probe is a software backend, and layer 5 below depends on it) — then take a baseline:

```sh
node tools/shot/apex-eval.mjs singapore "(a.setTimeOfDay('night'), a.lightState())" --raw   # parent only
```

The condition key is `<track>|<tod>|<weather>` (`key()` in `js/lighting/profiles.js`: tod `default` →
`def.night`, storm → rain). Read that key's row AND the shared `"*|<tod>|<wx>"` stamp in
`js/lighting/presets.js`: a value the row does not pin is inherited — e.g. Singapore night gets
`nightAmbLift: 1.45` (a LIFTED night) from the `"*|night|dry"` stamp, not the knob default. Then the
symptom table ([references/symptoms.md](references/symptoms.md)). The two night rows:
- **Night washed out** (milky, lifted blacks): resolved `nightAmbLift` (`lightTune()` reads it) first,
  then `mistDensity`/`fogDensityMul`, `bloomMul`/`bloomKnee`, `cityGlowMul`, `exposureMul`.
- **Floodlights not firing**: `numLights` counts only `G.frame.lights`; per-chunk lamps show in
  `perChunkLights`, `bakedLights`, `perChunkHeld` and `tlxLampGrid` — read all of them before calling it off.

**Which layer to edit:** a ONE-track complaint → that track's `"<id>|tod|wx"` row; editing the
`"*|tod|wx"` stamp or `lightCopy()` changes EVERY circuit — do that only for a fleet complaint, and
say so in the PR.

Then the knobs: nearly every hand-tuned value is a live `TUNE_DEFS` knob (`js/lighting/knobs.js`)
read via `LT.<id>` each frame — `__apex.lightTune()` reads them, `lightTune({ nightAmbLift: 1.1 })` sets one.

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

Verify a `js/lighting/` or `presets.js` edit in this order (AGENTS.md §Verification):

```sh
mkdir -p artifacts/tmp
git diff --name-only origin/claude/f1-game-project-26h3ng > artifacts/tmp/changed.txt
node tools/ci/geometry-paths.mjs --targeted artifacts/tmp/changed.txt   # names the TARGETED node suites; run each with node --test
node tools/ci/test-bg.mjs --spec tests/specs/lighting-ab.spec.js   # the single spec, background; parent only (a subagent reports it unverified)
```

The whole `gfx` browser group (lighting-ab + tuner-grade + probes + tlx) only when
`applyRaceSettings`' structure changed: `node tools/ci/remote-group.mjs gfx` on the pushed branch.

Related: **renderer-debug**, **playwright-probe** (`references/cameras.md`).

## Visual A/B with slider-effect

`slider-effect` classifies the live knob registry (no browser) and runs live Playwright
A/B captures with pixel-diff outputs. Use it to confirm a knob is wired and to
see *what region* of the frame it changes.

```sh
# Classify — no browser, instant
node tools/lighting/slider-effect.mjs --group LAMPS
node tools/lighting/slider-effect.mjs --risk inert --json

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
