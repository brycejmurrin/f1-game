---
name: user-plays-on-phone
description: "The owner plays and reports bugs from a PHONE (touch, landscape) — reproduce HUD/UI reports at phone-landscape-844x390 with hasTouch, not on a desktop viewport"
metadata:
  node_type: memory
  type: user
  originSessionId: 8143bc6b-3772-55c8-a288-882b69f3134b
  modified: 2026-10-05T06:26:54.179Z
---

When the owner reports a HUD or UI problem, the device is a phone (answered "Phone" on 2026-10-05 for the "HUD isn't really showing in the helmet camera" report). A desktop 1280x720 reproduction showed nothing wrong; the phone cell (hud-survey `--device phone-landscape-844x390`, Playwright `hasTouch`, no `body.desktop`) showed the real state.

**How to apply:** reproduce UI/HUD reports first at phone landscape with touch (the `.desktop` class off), then desktop; quote both in the PR body. `node tools/shot/hud-survey.mjs --cam <cam> --device phone-landscape-844x390` is the one-cell instrument (~2 min). Related: [[one-subagent-per-skill]].
