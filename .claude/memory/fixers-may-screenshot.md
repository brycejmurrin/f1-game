---
name: fixers-may-screenshot
description: Bryce's call on stuck UI fixers - screenshots allowed, streamline with a time cap, or the orchestrator fixes it directly
metadata:
  type: feedback
---
When a UI fixer session stalls on verification, Bryce (2026-10-17) said: "Tell it to take screenshots or streamline or you fix it".

**Why:** An earlier blanket ban on screenshots (after a fixer looped on captures) made the next fixer spend 30+ minutes on DOM probes for edge cases; speed matters more than the method.

**How to apply:** Don't ban screenshots outright in fixer launch prompts; ban screenshot *loops* (a screenshot matrix or survey). Give UI fixers a time cap (around 15 min per red), push with a named known-red rather than iterate indefinitely, and take over the last mile in the orchestrator session if a fixer keeps slipping. Related: [[parallel-survey-and-review]], [[user-plays-on-phone]].
