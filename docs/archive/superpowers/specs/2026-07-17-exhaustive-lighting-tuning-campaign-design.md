# Exhaustive Lighting Tuning Campaign

**Date:** 2026-07-17  
**Status:** Approved design  
**Target:** Cinematic WebGL2 defaults for every track, time of day, and weather

## Goal

Create high-quality shipped lighting defaults for all 24 circuits across four
times of day and five weather states:

- Times: `dawn`, `day`, `dusk`, `night`
- Weather: `dry`, `wet`, `rain`, `fog`, `overcast`
- Matrix: 24 × 4 × 5 = 480 condition profiles
- Coverage: three fixed views per condition = 1,440 baseline frames and 1,440
  final frames

The target look is cinematic: strong separation, atmospheric depth, controlled
highlights, expressive practical lights, and a distinct identity for each
circuit. Metrics are safety rails, not the aesthetic objective.

Every `TUNE_DEFS` slider remains eligible for a condition-specific value.
Repeated screenshot sweeps may be skipped only when runtime evidence proves a
control is inactive for that condition, such as rain-density controls in dry
weather or lamp shadows in daylight.

## Approved decisions

- Use a hybrid two-pass campaign: exhaustive measured audit followed by visual
  agent tuning.
- Tune WebGL2 only.
- Allow every slider to vary per condition.
- Use three track-specific views for every condition.
- Let agents select candidates autonomously, but require one final human review
  before baking.
- Present final results as condition walls grouped by time and weather.
- Do not commit, bake, or push tuned values until the review is approved.

## Isolation architecture

The campaign freezes one source revision. All captures in a campaign must serve
that revision so screenshots remain comparable.

Six logical tuning shards run in two waves of at most three concurrent agents.
Each agent:

- owns four tracks;
- starts its own free-port static server and Playwright browser;
- uses one Chromium worker;
- writes to a unique output root;
- changes candidates only through `__apex.lightTune()`;
- never edits shared source, `js/light-presets.js`, `index.html`, or
  `version.json`;
- emits keyed JSON results and image artifacts.

The proposed mixed-theme shards are:

1. `abudhabi`, `albert_park`, `baku`, `cota`
2. `bahrain`, `hungaroring`, `jeddah`, `madrid`
3. `imola`, `interlagos`, `miami`, `monaco`
4. `mexico`, `montreal`, `qatar`, `redbull`
5. `shanghai`, `silverstone`, `singapore`, `spa`
6. `suzuka`, `vegas`, `zandvoort`, `monza`

Only the coordinator may merge result fragments. Only one final writer may bake
the merged presets and increment the cache version.

## Output layout

All generated campaign data is untracked:

```text
scratch/captures/lighting-campaign/<campaign-id>/
  manifest.json
  summary.json
  agents/<shard-id>/
    results.jsonl
    presets.json
    <track>/<tod>/<weather>/
      baseline/
      candidates/
      final/
      contact-sheet.jpg
  review/
    dawn-dry/
    dawn-wet/
    ...
    night-overcast/
```

Each condition record contains:

- schema version and frozen Git SHA;
- track, time, weather, camera fractions, and agent;
- baseline and final resolved knob maps;
- the minimal preset override required to reproduce the final image;
- `lightState()` and WebGL status;
- frame and region histogram metrics;
- changed knobs and tuning rationale;
- rejected candidates and rejection reasons;
- baseline/final image paths;
- gate results and final verdict.

Preset fragments are keyed by `track|time|weather`. The coordinator rejects
missing, duplicate, malformed, or out-of-range keys.

## Camera coverage

Each track uses three fixed fractions chosen to include characteristic lighting
environments:

- `abudhabi`: 0.08, 0.45, 0.88
- `albert_park`: 0.10, 0.50, 0.88
- `bahrain`: 0.01, 0.45, 0.81
- `baku`: 0.15, 0.45, 0.75
- `cota`: 0.15, 0.50, 0.85
- `hungaroring`: 0.00, 0.35, 0.70
- `imola`: 0.10, 0.40, 0.75
- `interlagos`: 0.05, 0.40, 0.75
- `jeddah`: 0.10, 0.40, 0.70
- `madrid`: 0.05, 0.35, 0.70
- `mexico`: 0.10, 0.45, 0.80
- `miami`: 0.23, 0.50, 0.70
- `monaco`: 0.05, 0.22, 0.45
- `montreal`: 0.15, 0.50, 0.80
- `monza`: 0.30, 0.55, 0.85
- `qatar`: 0.40, 0.70, 0.90
- `redbull`: 0.10, 0.45, 0.80
- `shanghai`: 0.10, 0.40, 0.75
- `silverstone`: 0.40, 0.65, 0.97
- `singapore`: 0.35, 0.58, 0.72
- `spa`: 0.10, 0.35, 0.70
- `suzuka`: 0.00, 0.30, 0.86
- `vegas`: 0.25, 0.66, 0.98
- `zandvoort`: 0.30, 0.55, 0.80

All candidates use the same three fractions, viewport, camera mode, hidden HUD,
settle policy, and source revision as their baseline.

## Campaign phases

### Phase 0: preflight

The coordinator:

1. records the frozen Git SHA and dirty-tree status;
2. inventories all 176 `TUNE_DEFS` controls and their bounds;
3. verifies the 24 tracks and 20 conditions per track;
4. checks that every shard has a unique output root;
5. starts no more than three software-rendered Chromium workers concurrently;
6. runs smoke, light-state, WebGL probe, and shader contract tests.

The campaign stops if preflight fails.

### Phase 1: exhaustive baseline audit

Agents capture the current resolved state for all 480 conditions and all three
views. Each condition records:

- resolved preset and slider values;
- `lightState()`;
- WebGL errors;
- full-frame and named-region histograms;
- black and white clipping;
- tonal range;
- road, sky, near-field, wall, and fog-wall luminance;
- baseline screenshots.

This produces a complete comparison baseline and identifies missing presets,
hard failures, and unusually weak or extreme conditions.

### Phase 2: slider sensitivity catalog

Agents probe controls in dependency groups:

1. sun, moon, ambient, exposure;
2. shadows and ambient occlusion;
3. floodlights, city glow, bloom;
4. clouds, fog, mist, rain;
5. wet road, SSR, road response, car finish;
6. image grade, color, and lens effects.

For each control, agents test bounded low/neutral/high candidates in applicable
conditions. A control is marked inactive only when:

- its resolved value changes;
- the relevant runtime path remains valid;
- all three screenshots and measured regions remain unchanged within tolerance;
- its documented condition gate explains the inactivity.

Inactive evidence is saved rather than silently omitted.

### Phase 3: condition tuning

Agents process each track in this order:

1. dry `dawn`, `day`, `dusk`, `night`;
2. wet variants;
3. rain variants;
4. fog variants;
5. overcast variants.

For each condition:

1. restore the exact baseline profile;
2. tune one dependency group at a time;
3. evaluate bounded candidates across all three views;
4. reject candidates that fail any hard gate;
5. use visual judgment to select among valid candidates;
6. re-run earlier groups after later groups to catch coupling;
7. simplify the selected profile while preserving the final images;
8. capture final images and write the condition record.

The tuning order prevents post-processing from masking incorrect lighting and
keeps coupled controls understandable.

### Phase 4: coordinator validation

The coordinator requires:

- exactly 480 unique condition records;
- exactly three baseline and three final views per condition;
- valid track/time/weather keys;
- all values within `TUNE_DEFS` bounds;
- no unknown slider IDs;
- no source revision mismatch;
- no unresolved hard-gate failure;
- deterministic reproduction of sampled final profiles.

Validation failure blocks review generation and baking.

## Safety gates

Every selected candidate must satisfy all of these:

- no blank frame, page error, shader error, or WebGL error;
- black clipping below 8%;
- white clipping below 3%;
- tonal range of at least 45 display levels;
- road and player car readable in all three views;
- no severe degradation in one view to improve another;
- active practical track lights in night conditions;
- no accidental full daylight floodlighting;
- wet and rain reflections retain road texture and do not blow out;
- finite `lightState()` values and valid renderer state;
- profile reproduces after a fresh page load.

Metrics veto invalid results. They do not override cinematic visual judgment
among valid candidates.

## Cinematic selection criteria

Agents prefer valid candidates with:

- clear foreground, middle-ground, and background separation;
- directional sun/moon modeling rather than exposure-only correction;
- deep but readable shadows;
- controlled highlight roll-off;
- expressive practical lights and wet reflections;
- atmosphere that adds depth without hiding the circuit;
- restrained clipping and bloom;
- recognizable track-specific color and mood;
- continuity among the three track views;
- plausible progression from dawn through night and dry through severe weather.

## Failure handling

- A failed capture retries twice with a fresh page.
- A failed server restarts on the agent's assigned port.
- A condition that still fails is marked blocked; the agent does not invent
  values or copy a neighboring profile.
- A missing or duplicate result blocks the coordinator.
- Invalid knob IDs or out-of-range values block the coordinator.
- Source changes during capture invalidate the affected shard.
- Agents never run `ab-lighting apply` or `bake.mjs`.
- The campaign never edits source while any screenshot run is active.

## Human review

The approved review format is a condition wall.

The coordinator generates 20 paginated walls, one per time/weather pair. Each
wall presents all 24 tracks under the same condition. A track tile includes:

- three synchronized characteristic views;
- baseline/final switching;
- changed knobs;
- before/after metrics;
- tuning rationale;
- gate status;
- links to rejected candidates.

Hard failures and unusually large changes appear first, but all tracks remain
reviewable. The reviewer approves the campaign as a whole or requests revisions
for named condition keys. No values are baked before approval.

## Bake and verification

After review approval, one writer:

1. merges the 480 keyed fragments into the existing preset object;
2. preserves the global `"*"` key unless the approved results replace it;
3. sorts and validates all keys;
4. writes `js/light-presets.js`;
5. increments `index.html` and `version.json` exactly once;
6. runs syntax and shader contract checks;
7. runs light-state, smoke, WebGL, image-grade, lighting A/B, and representative
   visual tests;
8. regenerates the final condition walls from the baked file;
9. presents the preset diff and test evidence.

Commit and push require a separate explicit user request.

## Out of scope

- WebGPU tuning or parity work
- geometry, materials, track scenery, and camera redesign
- gameplay visibility changes outside lighting presets
- changing slider ranges or adding controls unless the campaign discovers a
  separately approved structural defect
- automatic deployment before human review

## Success criteria

The campaign is complete when:

- all 480 conditions have valid condition-specific profiles;
- all 1,440 baseline and 1,440 final views are present;
- every slider has sensitivity evidence or a documented inactive result;
- every selected condition passes all hard gates;
- the condition walls are reviewed and approved;
- the baked presets reproduce the approved images;
- the required WebGL and lighting tests pass.
