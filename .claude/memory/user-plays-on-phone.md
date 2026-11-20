---
name: user-plays-on-phone
description: "The owner plays and reports bugs from an iPhone 15 (touch, landscape): reproduce HUD/UI reports at 852x393 CSS px, DPR 3, with hasTouch; 844x390 is NOT his phone"
metadata:
  node_type: memory
  type: user
  source: user (2026-10-05 "Phone"; 2026-11-20 "save the new phone and desktop pixel layouts 5977"), tests/data/phone-windows.json, PR #5977
  originSessionId: 8143bc6b-3772-55c8-a288-882b69f3134b
  modified: 2026-11-20T09:45:00Z
---

When the owner reports a HUD or UI problem, the device is his phone (he answered "Phone" on 2026-10-05). A desktop
1280x720 reproduction showed nothing wrong; the phone cell with touch showed the real state.

His phone is an **iPhone 15** (PR #5977, Bryce 2026-11-20). Pixel layout, in CSS px at DPR 3:
- Screen: 393 x 852 portrait / 852 x 393 landscape; native panel 1179 x 2556.
- Home Screen app, landscape (what he plays in): 852 x 393, insets left 59, right 59, bottom 21.
- Safari tab, landscape: 852 x 368, the size measured on his phone on 2026-11-10 (#5218); insets assumed equal to the app.
- Portrait: 393 x 852, insets top 59, bottom 34 (assumed).
- 844 x 390 (inset 47) is the iPhone 12-14 cell older reports used. It is not his phone.

`tests/data/phone-windows.json` is the record. Where it disagrees with this note, the file wins.

**How to apply:** reproduce UI/HUD reports first at 852x393 landscape with touch (`.desktop` class off), then on his
desktop ([Bryce's desktop](bryce-desktop-macbook.md)); quote both in the PR body. Size settings:
[Bryce's settings profile](bryce-settings-profile.md). Related: [one subagent per skill](one-subagent-per-skill.md).
