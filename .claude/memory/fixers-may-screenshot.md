---
name: fixers-may-screenshot
description: "Bryce's call on UI sessions' screenshots - allowed, loops allowed too (2026-10-17 06:37Z); keep the per-defect time cap"
metadata:
  node_type: memory
  type: feedback
  originSessionId: e0a57b1a-8980-509a-8a14-f208af3c77f4
  modified: 2026-10-17T06:37:20.174Z
---

UI fixer and survey sessions may take screenshots freely, including screenshot loops. Bryce, 2026-10-17: "Tell it to take screenshots or streamline or you fix it" (~04:06Z), then "Let them screenshot loop" (~06:37Z) when the UI lane briefs capped screenshots at 25 with no loops.

**Why:** Bans on screenshots or loops made sessions spend 30+ minutes on DOM probes for what a picture settles; Bryce values visual iteration on UI over the cost of captures.

**How to apply:** Do not invent blanket screenshot bans. Apply the current repository and host capture budgets; an increased cap needs the user's applicable grant. Keep the time cap (around 15 min per defect or red, then push with a named known-red or report), and take over the last mile in the orchestrator if a session keeps slipping. Related: [parallel survey and review](parallel-survey-and-review.md), [user plays on phone](user-plays-on-phone.md).
