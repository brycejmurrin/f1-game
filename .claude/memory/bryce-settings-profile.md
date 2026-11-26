---
name: bryce-settings-profile
description: "tests/data/settings-live-export-2026-11-26.json is Bryce's CURRENT Home Screen app settings (exported in LANDSCAPE: live:\"wide\", top level = landscape, park = portrait; UI SIZE shipped, BUTTON 130); the newest dated file wins and bryce-phone.mjs `live` picks it automatically"
metadata:
  node_type: memory
  type: user
  originSessionId: 3e8f20b4-ce6a-5f74-99bf-04ac30bb0e3b
  modified: 2026-11-26T06:10:00.000Z
---

`tests/data/settings-live-export-2026-11-26.json` is the settings export Bryce uploaded from his installed iPhone Home
Screen app (exportedAt 2026-11-26T06:09:45Z = 22:09 Pacific on 11-25, build 29936, mode `all`, made in landscape),
sent to the orchestrator session with: "those are my current settings you can use this to find issues with code or better
layouts or how to update my settings to be better". It is his real play profile and replaced the 2026-11-25 10:32Z
landscape export (`settings-live-export-2026-11-25.json`, build 29497), which stays as the previous snapshot.
`tools/lib/bryce-phone.mjs` `live` is the newest dated file by name, so tests that read `live` moved with it.

**Read the shapes first.** `appearanceShapes` is `{mode:"separate", live:"wide"}`: the top-level keys are his
LANDSCAPE (iPhone 15 852×393) profile and `appearanceShapes.park` holds his PORTRAIT values. He sent a portrait
export first (19:28 Pacific, `live:"tall"`, same values swapped); `tests/unit/live-export-resolver.test.mjs`
requires landscape at the top level, so the landscape one is the fixture. Check `live` before seeding.

What actually changed vs the 11-25 export:
- steering: `steerRate` 6 → 7, `steerExpo` 7 → 6, `steerSpeed` 4 → 2, `adaptiveButtons` 10 → 5 (pace still 17,
  preset custom); `padCurve` 3 → 5.
- touch buttons: gas `travel` 80 → 40 (start/end 100), brake `direction` up → down, `travel` 78 → 74, brake
  start 100 / end 20 with `slideCurve` and `sliderCurve` "quick", brightness 70 on gas and brake; left/right
  start/end 100.
- `raceGrid` random → quali.
- `gfxPhoneFeatureOverrides`: all eleven `true` overrides (anisotropy, density, farTerrain, garageHi,
  garageProbeParallax, heroCar, kerbProfile, meshHi, propsHi, skyAtmo, treesHi) are now `null`; `gfxPreset` is
  unchanged. Whether he reset them or the app dropped them is not yet known (orchestrator follow-up, 2026-11-26).

Unchanged and still worth knowing: `uiScale` null (shipped), `hudBtnScale` 130, `hudBtnShape` square,
`gfxBackend` "three", `uiContrast` high, HELMET cam, steerMode buttons, a DualSense in `padProfiles`, `lightTune`
set, TT boards and custom circuits. Landscape looks (top level): pause layout sidebar, race `{w 120, btn 90}`,
garage `{btn 90, pw 125, ph 100}`, career `{dim soft}`, designer text large; portrait (`park`): pause grid,
garage `{btn 100, pw 115, ph 60}`, designer text small, career dim full.

Older snapshots: `settings-live-export-2026-11-10.json` (UI SIZE 70, BUTTON 143.25; he said the shipped sizes were
"way too big"), `-2026-11-09.json` (UI SIZE 61), `settings-defaults-export.json` (2026-10-05).

**Why:** on 2026-11-09 six sessions tested phone-UI fixes against a stale export and could not reproduce his
screenshots. His settings move between snapshots, so the newest dated snapshot is the only truth.
`tools/lib/bryce-phone.mjs` OWNER_PROFILES still also names the 11-10 file as `nov10` for older comparisons.
