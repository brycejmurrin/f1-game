# Bug hunt: lighting (Lane 13, 2026-11-03)

Kind: hunt · Re-measure-by: 2027-02-01

HALF:front SCOPE:draft, lane:cursor. Slice: `js/lighting/{lighting,presets,profiles,knobs,frame-lights,track-lights,tuner-panel}.js`
plus `tests/unit/lighting-*`. Excluded: `atmosphere.js`, `lamp-bake.js` (open PR #4558).

Method: Board claim + OWNED occupancy check (no open PR held the seven files) → apex-lsp outlines →
3 code-hunter passes (frame-lights; profiles/knobs/tuner/lighting; track-lights/presets) → hand
re-read of top rows on tip `dca168790f`. No browser; no gpu-census.

Do-not-re-report (prior art, already fixed or owned elsewhere): PERF-HUNT-2 F4 all-lights 50 ms fill,
F10 WeakRef hygiene; #2281 first-load vs re-apply Qatar; #3960 M37 day rain/overcast/fog stamps;
#2159 free-cam vs lighting panel; #3737 sun-colour reuse; lighting-reapply / lighting-rebuild
invalidation pins; #4558 atmosphere weather-fade + lamp-bake miss cache.

## Ranked findings (player impact ÷ fix risk)

| # | Where | Verdict | What | Action |
|---|-------|---------|------|--------|
| 1 | `frame-lights.js` gap block (~712) | CONFIRMED | A >1 s wall-clock gap nulls only `_S_MAIN.rankSrc`. At a parked eye `withinAge` stays true, so `viewLights` reuses `_S_VIEW` while the forward set rebuilds — mirror membership / entry ramp can diverge after pause/resume. | **Fixed** this PR + `lighting-hunt-gaps` H1. |
| 2 | `track-lights.js` DARK-GAP fill (~261) | CONFIRMED | Gap synths use hard-coded `side = ±1` instead of `(j%2===0)?a.side:-a.side` (densify already does). An `a.side===-1` anchor puts the first synth on the same verge as the mast. | **Fixed** this PR + H2. |
| 3 | `track-lights.js` NEON washer (~299) | CONFIRMED | Washer x/z use `track.hw[k]` without `\|\| 7`. Zero/missing half-width places signage spill on the racing line; densify/gap-fill already floor to 7. | **Fixed** this PR + H3. |
| 4 | `tuner-panel.js` close (~447) | CODE-TRACED | Close restores TIME before WEATHER; `setTimeOfDay` reloads the track while weather can still be the preview value — one wrong TOD×wx rebuild. | Deferred (needs weather-arc coordination; out of smallest-3). |
| 5 | `tuner-panel.js` TIME preview (~95) | CODE-TRACED | Each TIME chip calls `setTimeOfDay` → full `loadTrack` during tuning. | Deferred (perf/UX; structural). |
| 6 | `profiles.js` `key()` storm→rain (~66) | CODE-TRACED | Live storm resolves `\|rain`, but saved `\|storm` keys are never migrated — dead rows still counted by `tuned()`. | Deferred (load migration + persist). |
| 7 | `presets.js` `*\|night\|wet` | CODE-TRACED | Stamps `poolEnergy` but omits `lampRadiusMul` (dry night pins 0.8) → wet-night pools reach ~25% farther than dry. | Deferred (look change; bake skill). |
| 8 | `presets.js` dusk weather stamps | CODE-TRACED | No `*\|dusk\|{rain,overcast,fog}` lamp trio (unlike M37 day/dawn) → dusk bad-weather can fall to TUNE_DEFS lamp floors. | Deferred (fleet stamp). |
| 9 | `presets.js` `*\|night\|{overcast,fog}` | PLAUSIBLE | Mirror dry night's `lampLevel`/`poolEnergy`/`lampRadiusMul` but not `floodEmitMul` (dry 0.3). | Deferred (confirm intentional). |
| 10 | `profiles.js` `apply()` | CONFIRMED (bench) | Full 191-def merge every call (~53 µs empty presets); noop reapply still pays. | Deferred (cache keyed by condition). |
| 11 | `frame-lights.js` paint glow copy (~69) | CONFIRMED | Paint-mode tails clone all lamp lanes into `_tlGlowBuf` every in-range frame. | Deferred (perf hygiene). |
| 12 | `frame-lights.js` `_hshC` | CODE-TRACED | `release()` never shrinks the flicker hash buffer after a large night track. | Deferred. |
| 13 | `track-lights.js` gap-fill cap | CODE-TRACED | Densify caps at 800; gap-fill concatenates unbounded synths on long dressing exclusions. | Deferred. |
| 14 | `tuner-panel.js` `ltDisarm` on refresh (~330) | CONFIRMED | Preview TIME/WEATHER chips clear an armed COPY TO ALL confirm. | Deferred (UX). |
| 15 | `knobs.js` `carEnvCube` def | CODE-TRACED | `GLX.isMobile` at module eval; Node/early boot seeds desktop 0.3. | Deferred. |

## Covered and cleared

`LightTune` façade re-exports; `TUNE_DEFS` ↔ rebuild / APPLY_RACE_IDS contracts (existing unit pins);
frame-lights rank reuse / shed / release; track-lights densify side alternation (existing); lamp kind
table presence; tuner RESET weather-arc pins in `lighting-tuner-reset-weather.test.mjs`.

## Not covered (next hunt)

Full per-track body of `presets.js` (~7k lines — sampled shared `*|` stamps + extreme-knobs allowlist);
live `__apex.lightState()` A/B on iPhone TLX; `atmosphere.js` / `lamp-bake.js` (#4558); browser
`lighting-ab` / `lighting-tuner-grade` (CI gfx shard).

## Verified locally

```
node --test tests/unit/lighting-hunt-gaps.test.mjs
# → 3/3 pass (log: artifacts after tooling-fast)
```
