---
name: bryce-settings-profile
description: "tests/data/settings-defaults-export.json is Bryce's real iPhone settings export — use it as the acceptance profile for HUD/touch work"
metadata:
  node_type: memory
  type: user
  originSessionId: 7f4f7d4c-f23b-5688-8570-e3eab0148639
  modified: 2026-10-30T08:33:07.728Z
---

`tests/data/settings-defaults-export.json` (exported 2026-10-05 from an iPhone, iOS 18.7 UA) is Bryce's own settings,
not synthetic data. As of that export: HELMET cam (camMode 19), steerMode "buttons", driving line FULL with the F1
palette, hudScale 155, **hudBtnScale 245**, hudBtnOpacity 65, textSize "large", hudProfile standard.

**Why:** found 2026-10-30 while chasing "I should be able to change button size": his 245 % sat in the BUTTON SIZE
slider's dead zone at 844x390 (dock capped at ~118 %), which explained the complaint before he described it.

**How to apply:** for HUD / touch / settings work, seed these keys in the probe's init script and test that cell
first, alongside [[user-plays-on-phone]] (844x390 landscape, touch) and [[bryce-iphone-tlx-webgpu]]. Re-read the file
for newer values; it may be refreshed.
